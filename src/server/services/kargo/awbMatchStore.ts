import { randomUUID } from 'node:crypto';
import { supabase } from '../supabase';
import { demoSiparislerVeritabani, siparislerVeritabani } from '../state';
import { MAX_LIST_ITEMS } from '../listPagination';
import { PublicResourceError } from '../publicFetch';
import {
  TESLIM_EDILDI,
  nameSimilarity,
  normalizeAwb,
  toSiparisAdayi,
  type EslesmeRaporu,
  type EslesmeTipi,
  type SiparisAdayi,
} from './manifestMatching';

/**
 * Storage access for human-confirmed AWB matching. Every read and write is
 * scoped to exactly one tenant; the service role bypasses RLS, so the tenant
 * filter here is the isolation boundary. Every AWB written here gets exactly
 * one append-only approval record in the same transaction.
 */

export const MAX_ONAY = 500;
const PAGE_SIZE = 1000;
const MATCH_COLUMNS =
  'id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu,kanada_takip_kodu';
const PRE_FLIGHT_STATUSES = new Set(['KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO']);
const ORDER_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** What the user selected: one suggested order for one manifest row. */
export interface AwbSecimi {
  satirNo: number;
  siparisId: string;
}
/** The uploaded manifest a confirmation refers to. */
export interface ManifestKaynagi {
  dosyaAdi: string;
  sha256: string;
}
/** A write request whose provenance was derived by the server, never the client. */
export interface AwbOnayi {
  satirNo: number;
  siparisId: string;
  takipNo: string;
  agirlikKg: number | null;
  eslesmeTuru: EslesmeTipi;
  isimPuani: number;
}
export type AwbRetSebebi =
  | 'SIPARIS_BULUNAMADI'
  | 'TESLIM_EDILDI'
  | 'MEVCUT_AWB'
  | 'AWB_BASKA_SIPARISTE'
  | 'ONERI_GECERSIZ';
export interface AwbUygulanan {
  satirNo: number;
  siparisId: string;
  takipNo: string;
  tekrar: boolean;
}
export interface AwbReddedilen {
  satirNo: number;
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
/** Mirrors public.awb_match_approvals for the in-memory (development/demo) store. */
export interface AwbOnayKaydi {
  id: string;
  tenantId: string;
  siparisId: string;
  awb: string;
  manifestDosyaAdi: string;
  manifestSha256: string;
  manifestSatirNo: number;
  eslesmeTuru: EslesmeTipi;
  isimPuani: number;
  onaylayanKullaniciId: string;
  onayZamani: string;
}

// Append-only: records are only ever pushed; no API updates or removes them.
const memoryApprovals: AwbOnayKaydi[] = [];

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

/** Validates the user's selections; ambiguous selections are rejected whole. */
export function secimIstegiDogrula(body: unknown): AwbSecimi[] {
  const items = isRecord(body) ? body.secimler : undefined;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ONAY)
    throw new PublicResourceError(`1-${MAX_ONAY} arası eşleştirme seçimi gönderilmelidir.`, 400);
  const rows = new Set<number>();
  const orders = new Set<string>();
  return items.map((item): AwbSecimi => {
    if (!isRecord(item) || typeof item.siparisId !== 'string' || !ORDER_ID.test(item.siparisId))
      throw new PublicResourceError('Geçersiz sipariş kimliği.', 400);
    const satirNo = item.satirNo;
    if (typeof satirNo !== 'number' || !Number.isInteger(satirNo) || satirNo < 1 || satirNo > 100_000)
      throw new PublicResourceError('Geçersiz manifest satırı.', 400);
    if (rows.has(satirNo) || orders.has(item.siparisId))
      throw new PublicResourceError(
        'Aynı satır veya sipariş birden fazla kez seçildi; belirsiz eşleştirme onaylanamaz.',
        400
      );
    rows.add(satirNo);
    orders.add(item.siparisId);
    return { satirNo, siparisId: item.siparisId };
  });
}

export interface OnayHazirligi {
  kalemler: AwbOnayi[];
  /** Selections already applied earlier (lost-response retry): nothing to write. */
  tekrarlar: AwbUygulanan[];
  reddedilenler: AwbReddedilen[];
}

/**
 * Resolves selections against suggestions the SERVER computed from the
 * uploaded manifest. Only a suggested candidate can be confirmed; its match
 * type and name score come from the server, so the approval log is trustworthy.
 */
export function onayKalemleriniHazirla(rapor: EslesmeRaporu, secimler: AwbSecimi[]): OnayHazirligi {
  const result: OnayHazirligi = { kalemler: [], tekrarlar: [], reddedilenler: [] };
  const awbs = new Set<string>();
  for (const secim of secimler) {
    const row = rapor.satirlar.find((candidate) => candidate.satirNo === secim.satirNo);
    if (row?.durum === 'ZATEN_BAGLI' && row.bagliSiparisId === secim.siparisId) {
      result.tekrarlar.push({ ...secim, takipNo: row.takipNo, tekrar: true });
      continue;
    }
    const candidate = row?.adaylar.find((item) => item.siparisId === secim.siparisId);
    if (!row || !candidate) {
      result.reddedilenler.push({ ...secim, takipNo: row?.takipNo ?? '', sebep: 'ONERI_GECERSIZ' });
      continue;
    }
    if (awbs.has(row.takipNo))
      throw new PublicResourceError(
        'Aynı AWB birden fazla satırda seçildi; belirsiz eşleştirme onaylanamaz.',
        400
      );
    awbs.add(row.takipNo);
    result.kalemler.push({
      satirNo: row.satirNo,
      siparisId: candidate.siparisId,
      takipNo: row.takipNo,
      agirlikKg: row.agirlikKg,
      eslesmeTuru: candidate.eslesmeTipi,
      isimPuani: nameSimilarity(row.aliciAdi, candidate.musteriAdi),
    });
  }
  return result;
}

function confirmInMemory(
  tenantId: string,
  userId: string,
  manifest: ManifestKaynagi,
  rows: Record<string, unknown>[],
  items: AwbOnayi[]
): AwbOnaySonucu {
  const rejected: AwbReddedilen[] = [];
  const plan: Array<{ row: Record<string, unknown>; item: AwbOnayi; tekrar: boolean }> = [];
  for (const item of items) {
    const base = { satirNo: item.satirNo, siparisId: item.siparisId, takipNo: item.takipNo };
    const row = rows.find((candidate) => candidate.id === item.siparisId);
    if (!row) {
      rejected.push({ ...base, sebep: 'SIPARIS_BULUNAMADI' });
      continue;
    }
    const current = normalizeAwb(row.uluslararasi_kargo_kodu);
    if (current === item.takipNo) plan.push({ row, item, tekrar: true });
    else if (row.lojistik_durumu === TESLIM_EDILDI) rejected.push({ ...base, sebep: 'TESLIM_EDILDI' });
    else if (current)
      rejected.push({ ...base, sebep: 'MEVCUT_AWB', mevcutAwb: String(row.uluslararasi_kargo_kodu) });
    else if (
      rows.some(
        (other) => other.id !== item.siparisId && normalizeAwb(other.uluslararasi_kargo_kodu) === item.takipNo
      )
    )
      rejected.push({ ...base, sebep: 'AWB_BASKA_SIPARISTE' });
    else plan.push({ row, item, tekrar: false });
  }
  // All-or-nothing: nothing is written (and nothing is logged) while any pair is rejected.
  if (rejected.length > 0) return { basarili: false, uygulananlar: [], reddedilenler: rejected };
  const now = new Date().toISOString();
  for (const { row, item, tekrar } of plan) {
    if (tekrar) continue;
    row.uluslararasi_kargo_kodu = item.takipNo;
    if (item.agirlikKg !== null) row.kargo_agirligi_kg = item.agirlikKg;
    if (typeof row.lojistik_durumu === 'string' && PRE_FLIGHT_STATUSES.has(row.lojistik_durumu))
      row.lojistik_durumu = 'ULUSLARARASI_KARGO';
    row.guncellenme_tarihi = now;
    memoryApprovals.push({
      id: randomUUID(),
      tenantId,
      siparisId: item.siparisId,
      awb: item.takipNo,
      manifestDosyaAdi: manifest.dosyaAdi,
      manifestSha256: manifest.sha256,
      manifestSatirNo: item.satirNo,
      eslesmeTuru: item.eslesmeTuru,
      isimPuani: Math.round(item.isimPuani * 1000) / 1000,
      onaylayanKullaniciId: userId,
      onayZamani: now,
    });
  }
  return {
    basarili: true,
    uygulananlar: plan.map(({ item, tekrar }) => ({
      satirNo: item.satirNo,
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

function invalidResult(): never {
  throw new PublicResourceError('AWB eşleştirmeleri kaydedilemedi.', 503);
}

function parseRpcResult(data: unknown): AwbOnaySonucu {
  if (
    !isRecord(data) ||
    typeof data.basarili !== 'boolean' ||
    !Array.isArray(data.uygulananlar) ||
    !Array.isArray(data.reddedilenler)
  )
    invalidResult();
  const applied: unknown[] = data.uygulananlar;
  const rejected: unknown[] = data.reddedilenler;
  const base = (item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.satirNo !== 'number' ||
      typeof item.siparisId !== 'string' ||
      typeof item.takipNo !== 'string'
    )
      invalidResult();
    return { satirNo: item.satirNo, siparisId: item.siparisId, takipNo: item.takipNo };
  };
  return {
    basarili: data.basarili,
    uygulananlar: applied.map((item) => ({ ...base(item), tekrar: isRecord(item) && item.tekrar === true })),
    reddedilenler: rejected.map((item) => {
      const fields = base(item);
      if (!isRecord(item) || typeof item.sebep !== 'string' || !REJECTION_REASONS.has(item.sebep))
        invalidResult();
      return {
        ...fields,
        sebep: item.sebep as AwbRetSebebi,
        ...(typeof item.mevcutAwb === 'string' ? { mevcutAwb: item.mevcutAwb } : {}),
      };
    }),
  };
}

/**
 * Writes server-resolved AWB approvals atomically for one tenant, together
 * with one append-only approval record per written AWB.
 */
export async function awbEslesmeleriniOnayla(
  tenant: string,
  userId: string,
  manifest: ManifestKaynagi,
  items: AwbOnayi[]
): Promise<AwbOnaySonucu> {
  const tenantId = requireTenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  const local = memoryRows(tenantId);
  if (local) return confirmInMemory(tenantId, userId, manifest, local, items);
  const client = supabase;
  if (!client) invalidResult();
  const { data, error } = await client.rpc('tomnap_approve_awb_matches', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_manifest: manifest,
    p_matches: items,
  });
  if (error?.code === '22023') throw new PublicResourceError('Geçersiz eşleştirme onayı.', 400);
  if (error?.code === 'PT403') throw new PublicResourceError('Bu işlem için yetkiniz yok.', 403);
  if (error) invalidResult();
  return parseRpcResult(data);
}

/** Tenant-scoped copy of the in-memory approval log (development and demo only). */
export function awbOnayKayitlari(tenant: string): AwbOnayKaydi[] {
  const tenantId = requireTenant(tenant);
  return memoryApprovals.filter((record) => record.tenantId === tenantId).map((record) => ({ ...record }));
}
