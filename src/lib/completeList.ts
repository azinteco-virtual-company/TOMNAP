import {
  ApiError,
  fetchWithRetry,
  getApiContextVersion,
  type FetchRetryOptions,
} from './apiClient';

const MAX_ITEMS = 10_000;
const MAX_BYTES = 32 * 1024 * 1024;
/** Never expose a page to callers. Either return the validated complete dataset,
 * or reject; an old server without pagination metadata is not a complete list. */
export async function loadCompleteList<T extends { id: string; tenant_id?: string }>(
  url: string,
  field: string,
  options: FetchRetryOptions = {}
): Promise<{ items: T[]; metadata: any }> {
  const version = getApiContextVersion();
  const target = new URL(url, 'https://tomnap.invalid');
  target.searchParams.set('page_size', '200');
  target.searchParams.delete('cursor');
  const items: T[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let revision: string | undefined;
  let total: number | undefined;
  let metadata: any;
  let bytes = 0;
  for (let page = 0; page <= MAX_ITEMS; page++) {
    const data = await (await fetchWithRetry(target.pathname + target.search, options)).json();
    if (version !== getApiContextVersion())
      throw new DOMException('Oturum və ya butik dəyişdi.', 'AbortError');
    const p = data?.pagination;
    const batch = data?.[field];
    if (
      !data?.basarili ||
      !Array.isArray(batch) ||
      !p ||
      p.version !== 1 ||
      !Number.isSafeInteger(p.total) ||
      p.total < 0 ||
      p.total > MAX_ITEMS ||
      p.pageSize !== 200 ||
      batch.length > p.pageSize ||
      typeof p.revision !== 'string' ||
      !p.revision ||
      typeof p.hasMore !== 'boolean' ||
      (p.hasMore
        ? typeof p.nextCursor !== 'string' || !p.nextCursor || batch.length === 0
        : p.nextCursor !== null)
    )
      throw new ApiError('Tam siyahı təsdiqlənmədi. Yenidən yükləyin.', 502);
    if (revision !== undefined && (revision !== p.revision || total !== p.total))
      throw new ApiError('Siyahı yükləmə zamanı dəyişdi. Yenidən yükləyin.', 409);
    revision = p.revision;
    total = p.total;
    metadata ??= data;
    bytes += new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if (bytes > MAX_BYTES) throw new ApiError('Tam siyahı 32 MiB həddini aşır.', 413);
    for (const item of batch) {
      if (!item || typeof item.id !== 'string' || !item.id)
        throw new ApiError('Siyahı sətri etibarsızdır.', 502);
      const key = `${item.tenant_id || ''}\u0000${item.id}`;
      if (seen.has(key)) throw new ApiError('Siyahıda təkrar sətir var. Yenidən yükləyin.', 409);
      seen.add(key);
      items.push(item);
    }
    if (items.length > total || items.length > MAX_ITEMS)
      throw new ApiError('Siyahı sayı təsdiqlənmədi.', 502);
    if (!p.hasMore) {
      if (items.length !== total) throw new ApiError('Siyahı natamamdır. Yenidən yükləyin.', 502);
      return { items, metadata };
    }
    if (items.length >= total || cursors.has(p.nextCursor))
      throw new ApiError('Siyahı imleci irəliləmir.', 502);
    cursors.add(p.nextCursor);
    target.searchParams.set('cursor', p.nextCursor);
  }
  throw new ApiError('Siyahı səhifə həddini aşır.', 413);
}
export function newestFirst<
  T extends {
    id: string;
    olusturma_tarihi?: string;
    gelis_tarihi?: string;
    son_siparis_tarihi?: string;
  },
>(a: T, b: T) {
  const date = (r: T) =>
    Date.parse(r.son_siparis_tarihi || r.gelis_tarihi || r.olusturma_tarihi || '') || 0;
  return date(b) - date(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
