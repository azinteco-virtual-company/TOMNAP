import { supabase } from '../supabase';
import { demoSiparislerVeritabani, siparislerVeritabani } from '../state';
import { MAX_LIST_ITEMS } from '../listPagination';
import { PublicResourceError } from '../publicFetch';
import {
  AWB_DESENI,
  TESLIM_EDILDI,
  normalizeAwb,
  toSiparisAdayi,
  type SiparisAdayi,
} from './manifestMatching';

/**
 * Storage access for human-confirmed AWB matching. Every read and write is
 * scoped to exactly one tenant; the service role bypasses RLS, so the tenant
 * filter here is the isolation boundary.
 */

export const MAX_ONAY = 500;
const PAGE_SIZE = 1000;
const MATCH_COLUMNS =
  'id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu,kanada_takip_kodu';
const PRE_FLIGHT_STATUSES = new Set(['KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO']);
const ORDER_ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface AwbOnayi {
  siparisId: string;
  takipNo: string;
  agirlikKg: number | null;
}
export type AwbRetSebebi =
  | 'SIPARIS_BULUNAMADI'
  | 'TESLIM_EDILDI'
  | 'MEVCUT_AWB'
  | 'AWB_BASKA_SIPARISTE';
export interface AwbUygulanan {
  siparisId: string;
  takipNo: string;
  tekrar: boolean;
}
export interface AwbReddedilen {
  siparisId: string;
  takipNo: string;
  sebep: AwbRetSebebi;
  mevcutAwb?: string;
}
export interface AwbOnaySonucu {
  basarili: boolean;
  uygulananlar: AwbUygulanan[];
  reddedilenler: AwbReddedilen[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireTenant(tenantId: unknown): string {
  if (typeof tenantId !== 'string' || tenantId === 'all' || !/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId))
    throw new PublicResourceError('Bir butik seçilmelidir.', 400);
  return tenantId;
}

// The demo sandbox always lives in memory, exactly like the order routes.
function memoryRows(tenantId: string): Record<string, unknown>[] | null {
  if (supabase && tenantId !== 'demo_sandbox') return null;
  const pool: unknown[] = tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
  return pool.filter(isRecord).filter((row) => row.tenant_id === tenantId);
}

/** Complete, tenant-scoped candidate pool with only the columns matching needs. */
export async function eslesmeHavuzunuYukle(tenant: string): Promise<SiparisAdayi[]> {
  const tenantId = requireTenant(tenant);
  const local = memoryRows(tenantId);
  if (local) return local.map(toSiparisAdayi).filter((row): row is SiparisAdayi => row !== null);
  const client = supabase;
  if (!client) throw new PublicResourceError('Siparişler okunamadı.', 503);
  const orders: SiparisAdayi[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = client
      .from('siparisler')
      .select(MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new PublicResourceError('Siparişler okunamadı.', 503);
    const rows: unknown[] = data;
    for (const row of rows) {
      const candidate = toSiparisAdayi(row);
      if (candidate) orders.push(candidate);
    }
    if (orders.length > MAX_LIST_ITEMS)
      throw new PublicResourceError(
        'Eşleştirme için 10000 sipariş sınırı aşıldı; daraltılmış bir işlem gerekir.',
        413
      );
    if (rows.length < PAGE_SIZE) return orders;
    const last = rows[rows.length - 1];
    lastId = isRecord(last) && typeof last.id === 'string' ? last.id : null;
    if (!lastId) throw new PublicResourceError('Siparişler okunamadı.', 503);
  }
}

/** Validates a confirmation request; ambiguous selections are rejected whole. */
export function onayIstegiDogrula(body: unknown): AwbOnayi[] {
  const items = isRecord(body) ? body.eslesmeler : undefined;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ONAY)
    throw new PublicResourceError(`1-${MAX_ONAY} arası eşleştirme onayı gönderilmelidir.`, 400);
  const result: AwbOnayi[] = [];
  const orderIds = new Set<string>();
  const awbs = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.siparisId !== 'string' || !ORDER_ID.test(item.siparisId))
      throw new PublicResourceError('Geçersiz sipariş kimliği.', 400);
    const takipNo = normalizeAwb(item.takipNo);
    if (typeof item.takipNo !== 'string' || !AWB_DESENI.test(takipNo))
      throw new PublicResourceError('Geçersiz AWB takip numarası.', 400);
    const weight = item.agirlikKg;
    if (
      weight !== undefined &&
      weight !== null &&
      (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 1000)
    )
      throw new PublicResourceError('Geçersiz kargo ağırlığı.', 400);
    if (orderIds.has(item.siparisId) || awbs.has(takipNo))
      throw new PublicResourceError(
        'Aynı sipariş veya AWB birden fazla kez seçildi; belirsiz eşleştirme onaylanamaz.',
        400
      );
    orderIds.add(item.siparisId);
    awbs.add(takipNo);
    result.push({ siparisId: item.siparisId, takipNo, agirlikKg: typeof weight === 'number' ? weight : null });
  }
  return result;
}

function confirmInMemory(rows: Record<string, unknown>[], items: AwbOnayi[]): AwbOnaySonucu {
  const rejected: AwbReddedilen[] = [];
  const plan: Array<{ row: Record<string, unknown>; item: AwbOnayi; tekrar: boolean }> = [];
  for (const item of items) {
    const row = rows.find((candidate) => candidate.id === item.siparisId);
    if (!row) {
      rejected.push({ siparisId: item.siparisId, takipNo: item.takipNo, sebep: 'SIPARIS_BULUNAMADI' });
      continue;
    }
    const current = normalizeAwb(row.uluslararasi_kargo_kodu);
    if (current === item.takipNo) plan.push({ row, item, tekrar: true });
    else if (row.lojistik_durumu === TESLIM_EDILDI)
      rejected.push({ siparisId: item.siparisId, takipNo: item.takipNo, sebep: 'TESLIM_EDILDI' });
    else if (current)
      rejected.push({
        siparisId: item.siparisId,
        takipNo: item.takipNo,
        sebep: 'MEVCUT_AWB',
        mevcutAwb: String(row.uluslararasi_kargo_kodu),
      });
    else if (
      rows.some(
        (other) => other.id !== item.siparisId && normalizeAwb(other.uluslararasi_kargo_kodu) === item.takipNo
      )
    )
      rejected.push({ siparisId: item.siparisId, takipNo: item.takipNo, sebep: 'AWB_BASKA_SIPARISTE' });
    else plan.push({ row, item, tekrar: false });
  }
  // All-or-nothing: nothing is written while any selected pair is rejected.
  if (rejected.length > 0) return { basarili: false, uygulananlar: [], reddedilenler: rejected };
  const now = new Date().toISOString();
  for (const { row, item, tekrar } of plan) {
    if (tekrar) continue;
    row.uluslararasi_kargo_kodu = item.takipNo;
    if (item.agirlikKg !== null) row.kargo_agirligi_kg = item.agirlikKg;
    if (typeof row.lojistik_durumu === 'string' && PRE_FLIGHT_STATUSES.has(row.lojistik_durumu))
      row.lojistik_durumu = 'ULUSLARARASI_KARGO';
    row.guncellenme_tarihi = now;
  }
  return {
    basarili: true,
    uygulananlar: plan.map(({ item, tekrar }) => ({
      siparisId: item.siparisId,
      takipNo: item.takipNo,
      tekrar,
    })),
    reddedilenler: [],
  };
}

const REJECTION_REASONS = new Set<string>([
  'SIPARIS_BULUNAMADI',
  'TESLIM_EDILDI',
  'MEVCUT_AWB',
  'AWB_BASKA_SIPARISTE',
]);

function parseRpcResult(data: unknown): AwbOnaySonucu {
  if (
    !isRecord(data) ||
    typeof data.basarili !== 'boolean' ||
    !Array.isArray(data.uygulananlar) ||
    !Array.isArray(data.reddedilenler)
  )
    throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
  const applied: unknown[] = data.uygulananlar;
  const rejected: unknown[] = data.reddedilenler;
  return {
    basarili: data.basarili,
    uygulananlar: applied.map((item) => {
      if (!isRecord(item) || typeof item.siparisId !== 'string' || typeof item.takipNo !== 'string')
        throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
      return { siparisId: item.siparisId, takipNo: item.takipNo, tekrar: item.tekrar === true };
    }),
    reddedilenler: rejected.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.siparisId !== 'string' ||
        typeof item.takipNo !== 'string' ||
        typeof item.sebep !== 'string' ||
        !REJECTION_REASONS.has(item.sebep)
      )
        throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
      return {
        siparisId: item.siparisId,
        takipNo: item.takipNo,
        sebep: item.sebep as AwbRetSebebi,
        ...(typeof item.mevcutAwb === 'string' ? { mevcutAwb: item.mevcutAwb } : {}),
      };
    }),
  };
}

/** Writes human-confirmed AWB codes atomically for one tenant. */
export async function awbEslesmeleriniOnayla(
  tenant: string,
  items: AwbOnayi[]
): Promise<AwbOnaySonucu> {
  const tenantId = requireTenant(tenant);
  const local = memoryRows(tenantId);
  if (local) return confirmInMemory(local, items);
  const client = supabase;
  if (!client) throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
  const { data, error } = await client.rpc('tomnap_confirm_awb_matches', {
    p_tenant_id: tenantId,
    p_matches: items,
  });
  if (error?.code === '22023') throw new PublicResourceError('Geçersiz eşleştirme onayı.', 400);
  if (error) throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
  return parseRpcResult(data);
}
