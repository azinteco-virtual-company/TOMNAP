/** Same-origin API requests. Session credentials never enter browser storage. */
let csrfToken: string | null = null;
let tenantId: string | null = null;
let contextVersion = 0;
let onUnauthorized: (() => void) | undefined;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setApiSession(token: string | null, tenant: string | null = null) {
  csrfToken = token;
  tenantId = tenant;
  contextVersion++;
}

export function setApiTenant(tenant: string | null) {
  tenantId = tenant;
  contextVersion++;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export function getApiContextVersion() {
  return contextVersion;
}

function scopedResponse(response: Response, version: number): Response {
  // Headers can arrive before a tenant switch while JSON/body parsing finishes
  // afterwards. Fence body readers as well as the initial fetch result.
  return new Proxy(response, {
    get(target, key) {
      if (key === 'clone') return () => scopedResponse(target.clone(), version);
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(String(key))) {
        return async (...args: unknown[]) => {
          const body = await value.apply(target, args);
          if (version !== contextVersion)
            throw new DOMException('Oturum və ya butik dəyişdi.', 'AbortError');
          return body;
        };
      }
      return value.bind(target);
    },
  });
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const origin = typeof window === 'undefined' ? 'https://tomnap.invalid' : window.location.origin;
  const target = new URL(url, origin);
  if (target.origin !== origin || !target.pathname.startsWith('/api/')) {
    throw new ApiError('API sorğusu eyni mənbəyə göndərilməlidir.', 400);
  }
  const version = contextVersion;
  const headers = new Headers(options.headers);
  const publicAuth =
    target.pathname.startsWith('/api/auth/') ||
    target.pathname === '/api/firmalar/kayit' ||
    target.pathname === '/api/firmalar/giris' ||
    target.pathname.startsWith('/api/firmalar/davet/');
  if (!publicAuth && tenantId && tenantId !== 'all') headers.set('x-tenant-id', tenantId);
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken)
    headers.set('x-csrf-token', csrfToken);
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (version !== contextVersion)
    throw new DOMException('Oturum və ya butik dəyişdi.', 'AbortError');
  if (response.status === 401) onUnauthorized?.();
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      data?.hata || data?.mesaj || `Sorğu yerinə yetirilmədi (${response.status}).`,
      response.status
    );
  }
  return scopedResponse(response, version);
}

export interface FetchRetryOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const { timeoutMs = 9000, retries = 2, backoffMs = 700, ...fetchOptions } = options;
  // Mutations are never replayed automatically after an ambiguous network error.
  const retryCount = ['GET', 'HEAD'].includes((fetchOptions.method || 'GET').toUpperCase())
    ? retries
    : 0;
  const version = contextVersion;
  for (let attempt = 0; ; attempt++) {
    if (version !== contextVersion)
      throw new DOMException('Oturum və ya butik dəyişdi.', 'AbortError');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (fetchOptions.signal?.aborted) throw new DOMException('Sorğu ləğv edildi.', 'AbortError');
    fetchOptions.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await apiFetch(url, { ...fetchOptions, signal: controller.signal });
    } catch (error) {
      if (
        fetchOptions.signal?.aborted ||
        version !== contextVersion ||
        attempt >= retryCount ||
        (error instanceof ApiError && error.status < 500 && error.status !== 429)
      )
        throw error;
    } finally {
      clearTimeout(timer);
      fetchOptions.signal?.removeEventListener('abort', onAbort);
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(1.8, attempt)));
  }
}

export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: FetchRetryOptions = {}
): Promise<T> {
  return (await fetchWithRetry(url, options)).json();
}
