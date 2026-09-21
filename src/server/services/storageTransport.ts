import { PublicResourceError, MAX_IMAGE_BYTES } from './publicFetch';

function cancelWithoutWaiting(
  body?: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null
) {
  // Some transports never settle cancel() after a stalled read. Cleanup must
  // not turn a bounded request back into an unbounded promise.
  try {
    void body?.cancel().catch(() => {});
  } catch {
    /* Best-effort cancellation. */
  }
}

/** The factory only shortens the production deadline for isolated transport tests. */
export function createBoundedStorageFetch(timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000)
    throw new Error('Storage deadline must be between 1 and 15000 milliseconds.');
  return async function fetchStorage(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new PublicResourceError('Depolama isteği zaman aşımına uğradı.', 504)),
      timeoutMs
    );
    timer.unref();
    const caller = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = caller ? AbortSignal.any([caller, deadline.signal]) : deadline.signal;
    let onAbort: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      signal.throwIfAborted();
      // A fetch implementation may ignore AbortSignal while waiting for headers
      // or streaming the body. The same deadline explicitly bounds both awaits.
      const response = await Promise.race([
        fetch(input, { ...init, redirect: 'error', signal }).then((response) => {
          if (signal.aborted) {
            cancelWithoutWaiting(response.body);
            signal.throwIfAborted();
          }
          return response;
        }),
        aborted,
      ]);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        cancelWithoutWaiting(response.body);
        throw new PublicResourceError('Depolama yanıtı boyut sınırını aşıyor.', 413);
      }
      if (!response.body) return response;
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        length += value.byteLength;
        if (length > MAX_IMAGE_BYTES)
          throw new PublicResourceError('Depolama yanıtı boyut sınırını aşıyor.', 413);
        chunks.push(value);
      }
      const headers = new Headers(response.headers);
      headers.delete('content-encoding');
      headers.set('content-length', String(length));
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      cancelWithoutWaiting(reader);
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort!);
      try {
        reader?.releaseLock();
      } catch {
        /* Pending transport reads may still hold the lock. */
      }
    }
  };
}

/** Bound trusted Storage API requests; never forward server keys across redirects. */
export const boundedStorageFetch = createBoundedStorageFetch(15_000);
