import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { supabase } from './supabase';
import { PublicResourceError } from './publicFetch';

export const MAX_LIST_ITEMS = 10_000;
const MAX_BYTES = 32 * 1024 * 1024;
type Cursor = {
  v: 1;
  tenant: string;
  dataset: string;
  revision: string;
  after: string;
  size: number;
};
export type ListRequest = { tenant: string; dataset: string; size: number; cursor: Cursor | null };
const invalid = () => new PublicResourceError('Geçersiz liste imleci veya sayfa boyutu.', 400);
export function listRequest(req: Request, tenant: string, dataset: string): ListRequest {
  const value = req.query.page_size;
  if (value !== undefined && (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)))
    throw invalid();
  const size = value === undefined ? 200 : Number(value);
  if (size > 500) throw invalid();
  let cursor: Cursor | null = null;
  if (req.query.cursor !== undefined) {
    const encoded = req.query.cursor;
    if (typeof encoded !== 'string' || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded))
      throw invalid();
    try {
      cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw invalid();
    }
    if (
      !cursor ||
      cursor.v !== 1 ||
      cursor.tenant !== tenant ||
      cursor.dataset !== dataset ||
      cursor.size !== size ||
      typeof cursor.after !== 'string' ||
      !cursor.after ||
      cursor.after.length > 1024 ||
      typeof cursor.revision !== 'string' ||
      !/^[a-f0-9]{32,64}$/.test(cursor.revision)
    )
      throw invalid();
  }
  return { tenant, dataset, size, cursor };
}
export function boundedSnapshot<T>(value: T, count: number): T {
  if (count > MAX_LIST_ITEMS || Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES)
    throw new PublicResourceError(
      'Tam liste 10000 kayıt veya 32 MiB sınırını aşıyor; daraltılmış rapor gerekir.',
      413
    );
  return value;
}
export function snapshotRevision(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function assertRevision(request: ListRequest, revision: string) {
  if (request.cursor && request.cursor.revision !== revision)
    throw new PublicResourceError('Liste yükleme sırasında değişti. Baştan yenileyin.', 409);
}
export function compareKeys(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export const customerKey = (row: any) => `${row.tenant_id || ''}\u0000${row.id}`;
function result(
  request: ListRequest,
  revision: string,
  total: number,
  items: any[],
  hasMore: boolean,
  key: (row: any) => string
) {
  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({
          v: 1,
          tenant: request.tenant,
          dataset: request.dataset,
          revision,
          after: key(items.at(-1)),
          size: request.size,
        } satisfies Cursor)
      ).toString('base64url')
    : null;
  return {
    items,
    pagination: { version: 1, total, hasMore, nextCursor, revision, pageSize: request.size },
  };
}
export function memoryPage(
  request: ListRequest,
  source: any[],
  revision?: string,
  key: (row: any) => string = (row) => String(row.id)
) {
  const ordered = [...source].sort((a, b) => compareKeys(key(a), key(b)));
  boundedSnapshot(ordered, ordered.length);
  const current = revision || snapshotRevision(ordered);
  assertRevision(request, current);
  const remaining = request.cursor
    ? ordered.filter((row) => key(row) > request.cursor!.after)
    : ordered;
  const items = remaining.slice(0, request.size);
  return result(request, current, ordered.length, items, remaining.length > request.size, key);
}
function rpcFailure(error: any): never {
  const status = /^PT(400|409|413)$/.test(error?.code) ? Number(error.code.slice(2)) : 503;
  throw new PublicResourceError(
    status === 503 ? 'Tutarlı liste okunamadı.' : error.message,
    status
  );
}
export async function databasePage(
  request: ListRequest,
  table: 'siparisler' | 'inbox_mesajlar' | 'musteriler'
) {
  const { data, error } = await supabase.rpc('tomnap_list_page', {
    p_tenant: request.tenant,
    p_dataset: table,
    p_limit: request.size,
    p_after: request.cursor?.after || null,
    p_revision: request.cursor?.revision || null,
  });
  if (error) rpcFailure(error);
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    typeof data.revision !== 'string' ||
    data.items.length > request.size + 1
  )
    rpcFailure(null);
  assertRevision(request, data.revision);
  boundedSnapshot(data.items, data.total);
  return {
    ...result(
      request,
      data.revision,
      data.total,
      data.items.slice(0, request.size),
      data.items.length > request.size,
      (row) => String(row.id)
    ),
    pending: data.pending,
  };
}
export async function customerSnapshot(
  request: ListRequest,
  local: () => { customers: any[]; orders: any[] }
) {
  let snapshot: { customers: any[]; orders: any[]; revision?: string };
  if (supabase && request.tenant !== 'demo_sandbox') {
    const { data, error } = await supabase.rpc('tomnap_customer_snapshot', {
      p_tenant: request.tenant,
      p_revision: request.cursor?.revision || null,
    });
    if (error) rpcFailure(error);
    if (
      !data ||
      !Array.isArray(data.customers) ||
      !Array.isArray(data.orders) ||
      typeof data.revision !== 'string'
    )
      rpcFailure(null);
    snapshot = data;
  } else {
    // Copy synchronously: mutation handlers cannot interleave while this snapshot is made.
    snapshot = structuredClone(local());
    snapshot.customers.sort((a, b) => compareKeys(String(a.id), String(b.id)));
    snapshot.orders.sort((a, b) => compareKeys(String(a.id), String(b.id)));
    snapshot.revision = snapshotRevision(snapshot);
  }
  boundedSnapshot(snapshot, snapshot.customers.length + snapshot.orders.length);
  assertRevision(request, snapshot.revision!);
  return snapshot as { customers: any[]; orders: any[]; revision: string };
}

/** Internal AI directory: same complete/revisioned contract, no implicit REST cap. */
export async function completeCustomerDirectory(tenant: string): Promise<any[]> {
  const request: ListRequest = { tenant, dataset: 'customer-directory', size: 500, cursor: null };
  const rows: any[] = [];
  for (;;) {
    const page = await databasePage(request, 'musteriler');
    rows.push(...page.items);
    boundedSnapshot(rows, rows.length);
    if (!page.pagination.hasMore) {
      if (rows.length !== page.pagination.total)
        throw new PublicResourceError('Müşteri rehberi eksik döndü.', 503);
      return rows;
    }
    request.cursor = {
      v: 1,
      tenant,
      dataset: request.dataset,
      size: request.size,
      revision: page.pagination.revision,
      after: String(rows.at(-1).id),
    };
  }
}
