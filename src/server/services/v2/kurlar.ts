import { randomUUID } from 'node:crypto';
import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import { bakuTarihi } from '../../../shared/bakuTarihi';
import { v2Tenant, v2GovdesiniAyikla } from './ortak';

/**
 * Tenant kurları (K4): 1 birim para birimi = aznKarsiligi AZN. Append-only:
 * düzeltme yeni bir kayıttır, güncel kur en son girilendir. Her okuma ve
 * yazma tek bir tenant'a bağlıdır; service_role RLS'yi aştığı için tenant
 * filtresi burada izolasyon sınırıdır.
 */

export const KUR_PARA_BIRIMLERI = ['CAD', 'USD'] as const;
export type KurParaBirimi = (typeof KUR_PARA_BIRIMLERI)[number];
/** Listede dönen en fazla kayıt (en yeniden eskiye). */
export const KUR_LISTE_SINIRI = 200;

export interface KurGirdisi {
  paraBirimi: KurParaBirimi;
  tarih: string;
  aznKarsiligi: number;
  kaynak: string | null;
}
export interface KurKaydi extends KurGirdisi {
  id: string;
  tenantId: string;
  girenKullaniciId: string;
  olusturmaZamani: string;
}
export interface KurListesi {
  guncel: Record<KurParaBirimi, KurKaydi | null>;
  kurlar: KurKaydi[];
}

const COLUMNS =
  'id,tenant_id,para_birimi,tarih,azn_karsiligi,kaynak,giren_kullanici_id,olusturma_zamani';
const ALANLAR = ['para_birimi', 'tarih', 'azn_karsiligi', 'kaynak'] as const;

// Development/demo store; mirrors the append-only table (rows are only pushed).
const bellek: KurKaydi[] = [];

function paraBirimiMi(value: unknown): value is KurParaBirimi {
  return (KUR_PARA_BIRIMLERI as readonly unknown[]).includes(value);
}

function gecerliTarih(value: unknown, bugun: Date): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new PublicResourceError('Tarih YYYY-AA-GG biçiminde olmalı.', 400);
  const time = Date.parse(`${value}T00:00:00Z`);
  // Rates are not entered for days that have not started in Baku (Codex R3 F13).
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value ||
    value < '2000-01-01' ||
    value > bakuTarihi(bugun)
  )
    throw new PublicResourceError('Geçersiz kur tarihi.', 400);
  return value;
}

/** Validates a rate entry; tenant and user always come from the session. */
export function kurGirdisiniDogrula(body: unknown, bugun = new Date()): KurGirdisi {
  const alanlar = v2GovdesiniAyikla(body, ALANLAR);
  if (!paraBirimiMi(alanlar.para_birimi))
    throw new PublicResourceError('Para birimi CAD ya da USD olmalı.', 400);
  const oran = alanlar.azn_karsiligi;
  if (
    typeof oran !== 'number' ||
    !Number.isFinite(oran) ||
    oran <= 0 ||
    oran >= 100 ||
    Math.round(oran * 1e6) / 1e6 !== oran
  )
    throw new PublicResourceError('Kur 0 ile 100 arasında, en fazla 6 ondalıklı olmalı.', 400);
  let kaynak: string | null = null;
  if (alanlar.kaynak !== undefined && alanlar.kaynak !== null) {
    if (typeof alanlar.kaynak !== 'string')
      throw new PublicResourceError('Kur kaynağı metin olmalı.', 400);
    const temiz = alanlar.kaynak.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
    if (temiz.length > 100)
      throw new PublicResourceError('Kur kaynağı en fazla 100 karakter.', 400);
    kaynak = temiz || null;
  }
  return {
    paraBirimi: alanlar.para_birimi,
    tarih: gecerliTarih(alanlar.tarih, bugun),
    aznKarsiligi: oran,
    kaynak,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function satirdan(row: unknown): KurKaydi {
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.tenant_id !== 'string' ||
    !paraBirimiMi(row.para_birimi) ||
    typeof row.tarih !== 'string' ||
    typeof row.giren_kullanici_id !== 'string' ||
    typeof row.olusturma_zamani !== 'string'
  )
    throw new PublicResourceError('Kurlar okunamadı.', 503);
  const oran = Number(row.azn_karsiligi);
  if (!Number.isFinite(oran)) throw new PublicResourceError('Kurlar okunamadı.', 503);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    paraBirimi: row.para_birimi,
    tarih: row.tarih,
    aznKarsiligi: oran,
    kaynak: typeof row.kaynak === 'string' ? row.kaynak : null,
    girenKullaniciId: row.giren_kullanici_id,
    olusturmaZamani: row.olusturma_zamani,
  };
}

/** Appends one rate for the session's tenant. */
export async function kurEkle(
  tenant: unknown,
  userId: string,
  girdi: KurGirdisi
): Promise<KurKaydi> {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  const client = supabase;
  if (!client) {
    const kayit: KurKaydi = {
      ...girdi,
      id: randomUUID(),
      tenantId,
      girenKullaniciId: userId,
      olusturmaZamani: new Date().toISOString(),
    };
    bellek.push(kayit);
    return { ...kayit };
  }
  const { data, error } = await client
    .from('kurlar')
    .insert({
      tenant_id: tenantId,
      para_birimi: girdi.paraBirimi,
      tarih: girdi.tarih,
      azn_karsiligi: girdi.aznKarsiligi,
      kaynak: girdi.kaynak,
      giren_kullanici_id: userId,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new PublicResourceError('Kur kaydedilemedi.', 503);
  const kayit = satirdan(data);
  if (kayit.tenantId !== tenantId) throw new PublicResourceError('Kur kaydedilemedi.', 503);
  return kayit;
}

const yenidenEskiye = (a: KurKaydi, b: KurKaydi) =>
  b.olusturmaZamani.localeCompare(a.olusturmaZamani) || b.id.localeCompare(a.id);

/** The session tenant's current rate per currency and its latest entries. */
export async function kurlariListele(tenant: unknown): Promise<KurListesi> {
  const tenantId = v2Tenant(tenant);
  const client = supabase;
  if (!client) {
    const kurlar = bellek
      .filter((kayit) => kayit.tenantId === tenantId)
      .sort(yenidenEskiye)
      .map((kayit) => ({ ...kayit }));
    const guncel = Object.fromEntries(
      KUR_PARA_BIRIMLERI.map((para) => [
        para,
        kurlar.find((kayit) => kayit.paraBirimi === para) ?? null,
      ])
    ) as KurListesi['guncel'];
    return { guncel, kurlar: kurlar.slice(0, KUR_LISTE_SINIRI) };
  }
  const oku = async (para?: KurParaBirimi, limit = KUR_LISTE_SINIRI) => {
    let query = client.from('kurlar').select(COLUMNS).eq('tenant_id', tenantId);
    if (para) query = query.eq('para_birimi', para);
    const { data, error } = await query
      .order('olusturma_zamani', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) throw new PublicResourceError('Kurlar okunamadı.', 503);
    const rows: unknown[] = data;
    const kurlar = rows.map(satirdan);
    if (kurlar.some((kayit) => kayit.tenantId !== tenantId))
      throw new PublicResourceError('Kurlar okunamadı.', 503);
    return kurlar;
  };
  const [kurlar, ...sonlar] = await Promise.all([
    oku(),
    ...KUR_PARA_BIRIMLERI.map((para) => oku(para, 1)),
  ]);
  const guncel = Object.fromEntries(
    KUR_PARA_BIRIMLERI.map((para, index) => [para, sonlar[index][0] ?? null])
  ) as KurListesi['guncel'];
  return { guncel, kurlar };
}

/** Tenant-scoped copy of the in-memory rates (development and demo only). */
export function bellektekiKurlar(tenant: unknown): KurKaydi[] {
  const tenantId = v2Tenant(tenant);
  return bellek.filter((kayit) => kayit.tenantId === tenantId).map((kayit) => ({ ...kayit }));
}
