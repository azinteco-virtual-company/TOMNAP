import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { genelIpAdresiMi, urlGuvenlimi } from '../middleware/security';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class PublicResourceError extends Error {
  constructor(
    message: string,
    public readonly status = 403
  ) {
    super(message);
    this.name = 'PublicResourceError';
  }
}

interface DownloadOptions {
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

interface DownloadResult {
  status: number;
  headers: Headers;
  body: Buffer;
}

function beforeDeadline<T>(promise: Promise<T>, remainingMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PublicResourceError('İndirme zaman aşımına uğradı.', 504)),
      Math.max(0, remainingMs)
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function requestOnce(
  url: URL,
  deadline: number,
  options: DownloadOptions
): Promise<DownloadResult> {
  const check = urlGuvenlimi(url.href);
  if (!check.guvenli) throw new PublicResourceError(check.sebep || 'Güvenli olmayan URL.');

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await beforeDeadline(lookup(hostname, { all: true, verbatim: true }), deadline - Date.now());
  if (addresses.length === 0 || addresses.some(({ address }) => !genelIpAdresiMi(address))) {
    throw new PublicResourceError('Hedef sunucu genel internet dışında bir adrese çözümleniyor.');
  }
  if (Date.now() >= deadline) throw new PublicResourceError('İndirme zaman aşımına uğradı.', 504);

  // Pin the validated address for this connection. A second DNS lookup must
  // never select a different address after validation (DNS rebinding).
  const pinned = addresses[0];
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    let response: http.IncomingMessage | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    const request = transport.request(
      url,
      {
        method: 'GET',
        agent: false,
        family: pinned.family,
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: {
          'User-Agent': 'TOMNAP-ImageFetcher/1.0',
          Accept: options.accept || 'image/*',
          'Accept-Encoding': 'identity',
          Referer: url.origin,
        },
      },
      (incoming) => {
        response = incoming;
        incoming.on('error', fail);
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        const status = incoming.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status)) {
          clearTimeout(timer);
          incoming.destroy();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const length = Number(headers.get('content-length'));
        if (Number.isFinite(length) && length > maxBytes) {
          const error = new PublicResourceError('İndirilen dosya boyut sınırını aşıyor.', 413);
          fail(error);
          incoming.destroy();
          request.destroy();
          return;
        }
        // The body limit applies to the bytes consumed. Do not accept compressed
        // responses whose expansion could evade that limit.
        const encoding = headers.get('content-encoding');
        if (encoding && encoding !== 'identity') {
          fail(new PublicResourceError('Sıkıştırılmış uzak yanıt desteklenmiyor.', 502));
          incoming.destroy();
          request.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            fail(new PublicResourceError('İndirilen dosya boyut sınırını aşıyor.', 413));
            incoming.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        incoming.on('end', () => {
          clearTimeout(timer);
          resolve({ status, headers, body: Buffer.concat(chunks) });
        });
        incoming.on('aborted', () =>
          fail(new PublicResourceError('Uzak yanıt tamamlanmadı.', 502))
        );
      }
    );
    timer = setTimeout(() => {
      const error = new PublicResourceError('İndirme zaman aşımına uğradı.', 504);
      request.destroy(error);
      response?.destroy(error);
    }, deadline - Date.now());
    request.on('error', fail);
    try {
      request.end();
    } catch (error) {
      clearTimeout(timer);
      request.destroy();
      reject(error);
    }
  });
}

/** Bounded GET with public-address validation and DNS pinning at every hop. */
export async function fetchPublicResource(
  rawUrl: string,
  options: DownloadOptions = {}
): Promise<Response> {
  const check = urlGuvenlimi(rawUrl);
  if (!check.guvenli) throw new PublicResourceError(check.sebep || 'Güvenli olmayan URL.');
  let url = new URL(rawUrl);
  const deadline = Date.now() + (options.timeoutMs ?? 7000);
  for (let hop = 0; hop <= 4; hop++) {
    const result = await requestOnce(url, deadline, options);
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.get('location');
      if (!location || hop === 4)
        throw new PublicResourceError('Geçersiz veya çok fazla yönlendirme.', 502);
      url = new URL(location, url);
      continue;
    }
    // Response disallows bodies for these HTTP status codes.
    const body = [204, 205, 304].includes(result.status) ? null : new Uint8Array(result.body);
    return new Response(body, { status: result.status, headers: result.headers });
  }
  throw new PublicResourceError('Çok fazla yönlendirme.', 502);
}
