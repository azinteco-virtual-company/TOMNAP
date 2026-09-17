import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:http', () => ({ default: { request: mocks.request } }));
vi.mock('node:https', () => ({ default: { request: mocks.request } }));

import { fetchPublicResource } from '../../../src/server/services/publicFetch';
import { genelIpAdresiMi, urlGuvenlimi } from '../../../src/server/middleware/security';

function response(
  status = 200,
  headers: Record<string, string> = {},
  chunks = ['image'],
  stall = false
) {
  mocks.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as any;
    request.destroy = vi.fn((error) => {
      if (error) request.emit('error', error);
    });
    request.end = () =>
      queueMicrotask(() => {
        const incoming = new PassThrough() as any;
        incoming.statusCode = status;
        incoming.headers = headers;
        callback(incoming);
        if (!incoming.destroyed) {
          for (const chunk of chunks) incoming.write(chunk);
          if (!stall) incoming.end();
        }
      });
    return request;
  });
}

beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.request.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('public image download boundary', () => {
  it.each([
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://[::ffff:127.0.0.1]:3000',
    'http://[fe80::1]/a',
    'http://[fd00::1]/a',
    'http://169.254.169.254/a',
    'http://localhost./a',
    'http://foo.localhost/a',
    'http://user:password@example.com/a',
    'http://2130706433/a',
    'http://0x7f000001/a',
    'http://241.1.2.3/a',
  ])('blocks non-public/credential URL before networking: %s', async (url) => {
    await expect(fetchPublicResource(url)).rejects.toMatchObject({ status: 403 });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('pins the validated address while preserving the hostname for HTTP/TLS', async () => {
    response(200, { 'content-type': 'image/png' }, ['PNG']);
    const result = await fetchPublicResource('https://cdn.example/image.png');
    expect(await result.text()).toBe('PNG');
    expect(result.headers.get('content-type')).toBe('image/png');
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    const [url, options] = mocks.request.mock.calls[0];
    expect(url.hostname).toBe('cdn.example');
    expect(options.family).toBe(4);
    expect(options.agent).toBe(false);
    const callback = vi.fn();
    options.lookup('cdn.example', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('accepts public IPv6 literals and ordinary domains starting with fc/fd', async () => {
    expect(urlGuvenlimi('https://fcdn.example/a').guvenli).toBe(true);
    expect(genelIpAdresiMi('2606:4700::1111')).toBe(true);
    response();
    await fetchPublicResource('https://[2606:4700::1111]/a');
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls[0][1].family).toBe(6);
  });

  it.each([
    [{ address: '10.0.0.1', family: 4 }],
    [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ],
    [{ address: '::ffff:7f00:1', family: 6 }],
  ])('rejects private or mixed DNS results', async (...addresses) => {
    mocks.lookup.mockResolvedValue(addresses);
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('validates a redirect target before connecting to it', async () => {
    response(302, { location: 'http://169.254.169.254/metadata' });
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('revalidates DNS on a same-host redirect', async () => {
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    response(302, { location: '/next' });
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('follows a bounded public relative redirect', async () => {
    response(302, { location: '/next' });
    response(200, {}, ['ok']);
    expect(await (await fetchPublicResource('https://cdn.example/a')).text()).toBe('ok');
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][0].pathname).toBe('/next');
  });

  it('caps redirect loops', async () => {
    for (let hop = 0; hop < 5; hop++) response(302, { location: '/again' });
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toMatchObject({
      status: 502,
    });
    expect(mocks.request).toHaveBeenCalledTimes(5);
  });

  it('caps streamed bytes even with no Content-Length', async () => {
    response(200, {}, ['1234', '5678']);
    await expect(
      fetchPublicResource('https://cdn.example/a', { maxBytes: 5 })
    ).rejects.toMatchObject({ status: 413 });
  });

  it('rejects an oversized declared body before consuming it', async () => {
    response(200, { 'content-length': '100' });
    await expect(
      fetchPublicResource('https://cdn.example/a', { maxBytes: 5 })
    ).rejects.toMatchObject({ status: 413 });
  });

  it('rejects compressed responses instead of bypassing the byte limit on expansion', async () => {
    response(200, { 'content-encoding': 'gzip' });
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('keeps the deadline active while consuming the body', async () => {
    response(200, {}, ['partial'], true);
    await expect(
      fetchPublicResource('https://cdn.example/a', { timeoutMs: 20 })
    ).rejects.toMatchObject({ status: 504 });
  });

  it('does not leave a timer when request creation throws synchronously', async () => {
    vi.useFakeTimers();
    mocks.request.mockImplementation(() => {
      throw new Error('Request creation failed');
    });
    await expect(fetchPublicResource('https://cdn.example/a')).rejects.toThrow(
      'Request creation failed'
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out DNS without ever starting a connection', async () => {
    mocks.lookup.mockReturnValue(new Promise(() => {}));
    await expect(
      fetchPublicResource('https://cdn.example/a', { timeoutMs: 20 })
    ).rejects.toMatchObject({ status: 504 });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
