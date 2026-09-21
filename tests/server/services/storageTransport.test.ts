import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import {
  boundedStorageFetch,
  createBoundedStorageFetch,
} from '../../../src/server/services/storageTransport';
import { MAX_IMAGE_BYTES } from '../../../src/server/services/publicFetch';
afterEach(() => vi.unstubAllGlobals());
it('rejects redirects and normalizes bounded response bytes', async () => {
  const caller = new AbortController();
  const fetch = vi.fn(async (_input, init) => {
    expect(init.redirect).toBe('error');
    expect(init.signal.aborted).toBe(false);
    return new Response('hello', {
      headers: { 'content-encoding': 'gzip', 'content-length': '3' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  const response = await boundedStorageFetch('http://127.0.0.1', { signal: caller.signal });
  expect(response.headers.get('content-encoding')).toBeNull();
  expect(response.headers.get('content-length')).toBe('5');
  expect(await response.text()).toBe('hello');
});
it('bounds a fetch implementation that ignores cancellation before headers arrive', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {}))
  );
  await expect(createBoundedStorageFetch(100)('http://127.0.0.1')).rejects.toMatchObject({
    status: 504,
  });
});
it('does not await a stalled stream read or its uncooperative cancellation', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new ReadableStream({ cancel })))
  );
  await expect(createBoundedStorageFetch(100)('http://127.0.0.1')).rejects.toMatchObject({
    status: 504,
  });
  expect(cancel).toHaveBeenCalledOnce();
});
it('cancels a late response after headers have already exceeded the deadline', async () => {
  let resolveFetch!: (response: Response) => void;
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    )
  );
  await expect(createBoundedStorageFetch(100)('http://127.0.0.1')).rejects.toMatchObject({
    status: 504,
  });
  resolveFetch(new Response(new ReadableStream({ cancel })));
  await Promise.resolve();
  expect(cancel).toHaveBeenCalledOnce();
});
it('honors caller cancellation from a Request object before starting any fetch', async () => {
  const caller = new AbortController();
  caller.abort();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    boundedStorageFetch(new Request('http://127.0.0.1', { signal: caller.signal }))
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).not.toHaveBeenCalled();
});
it('honors caller cancellation even when the transport ignores its signal', async () => {
  const caller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {}))
  );
  const pending = boundedStorageFetch('http://127.0.0.1', { signal: caller.signal });
  caller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it.each(['headers', 'body'] as const)(
  'settles a real stalled HTTP %s response before the server is closed',
  async (stage) => {
    let contacted = false;
    const server = http.createServer((_req, response) => {
      contacted = true;
      if (stage === 'body') {
        response.writeHead(200);
        response.write('start');
      }
      // Deliberately neither end the body nor close this connection.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const start = Date.now();
      await expect(createBoundedStorageFetch(200)(url)).rejects.toMatchObject({ status: 504 });
      expect(contacted).toBe(true);
      expect(Date.now() - start).toBeLessThan(2000);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
);
it('never follows a real redirect carrying the synthetic server key', async () => {
  let targetRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') response.writeHead(302, { location: '/target' });
    else targetRequests++;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/redirect`;
    await expect(
      boundedStorageFetch(url, { headers: { Authorization: 'Bearer synthetic-server-key' } })
    ).rejects.toThrow();
    expect(targetRequests).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
it('cancels an oversized declared response without consuming its stream', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) },
        })
    )
  );
  await expect(boundedStorageFetch('http://127.0.0.1')).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});
it('bounds chunked responses when content length is missing', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES));
              controller.enqueue(new Uint8Array(1));
            },
            cancel,
          })
        )
    )
  );
  await expect(boundedStorageFetch('http://127.0.0.1')).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});
it('keeps empty responses valid', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 }))
  );
  expect((await boundedStorageFetch('http://127.0.0.1')).status).toBe(204);
});
