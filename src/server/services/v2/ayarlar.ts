import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import { v2Tenant, v2GovdesiniAyikla } from './ortak';

/**
 * v2 tenant ayarları: tenant başına bir satır. Satır yoksa varsayılanlar
 * geçerlidir (K8: alıcı başına aylık beyan sınırı 300 USD; K11: prim oranı %5).
 * Her okuma ve yazma tek bir tenant'a bağlıdır.
 */

export interface V2AyarDegerleri {
  aylikBeyanSinirUsd: number;
  varsayilanKgFiyatiAzn: number | null;
  primOraniVarsayilan: number;
}
export interface V2Ayarlari extends V2AyarDegerleri {
  /** false: tenant has no row yet and the defaults apply. */
  kayitli: boolean;
  guncelleyenKullaniciId: string | null;
  guncellenmeZamani: string | null;
}

export const VARSAYILAN_V2_AYARLARI: Readonly<V2AyarDegerleri> = {
  aylikBeyanSinirUsd: 300,
  varsayilanKgFiyatiAzn: null,
  primOraniVarsayilan: 0.05,
};

const COLUMNS =
  'tenant_id,aylik_beyan_sinir_usd,varsayilan_kg_fiyati_azn,prim_orani_varsayilan,guncelleyen_kullanici_id,guncellenme_zamani';
const ALANLAR = [
  'aylik_beyan_sinir_usd',
  'varsayilan_kg_fiyati_azn',
  'prim_orani_varsayilan',
] as const;

// Development/demo store: one entry per tenant.
const bellek = new Map<string, V2Ayarlari>();

function sayi(
  value: unknown,
  alt: number,
  ust: number,
  ondalik: number,
  altDahil: boolean
): number {
  const kat = 10 ** ondalik;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (altDahil ? value < alt : value <= alt) ||
    value > ust ||
    Math.round(value * kat) / kat !== value
  )
    throw new PublicResourceError('Geçersiz ayar değeri.', 400);
  return value;
}

/** Validates a partial settings update; at least one known field is required. */
export function ayarGuncellemesiniDogrula(body: unknown): Partial<V2AyarDegerleri> {
  const alanlar = v2GovdesiniAyikla(body, ALANLAR);
  const sonuc: Partial<V2AyarDegerleri> = {};
  if ('aylik_beyan_sinir_usd' in alanlar)
    sonuc.aylikBeyanSinirUsd = sayi(alanlar.aylik_beyan_sinir_usd, 0, 100000, 2, false);
  if ('varsayilan_kg_fiyati_azn' in alanlar)
    sonuc.varsayilanKgFiyatiAzn =
      alanlar.varsayilan_kg_fiyati_azn === null
        ? null
        : sayi(alanlar.varsayilan_kg_fiyati_azn, 0, 10000, 2, true);
  if ('prim_orani_varsayilan' in alanlar)
    sonuc.primOraniVarsayilan = sayi(alanlar.prim_orani_varsayilan, 0, 1, 4, true);
  if (Object.keys(sonuc).length === 0)
    throw new PublicResourceError('Güncellenecek bir ayar gönderilmelidir.', 400);
  return sonuc;
}

function satirdan(row: unknown, tenantId: string): V2Ayarlari {
  if (!row || typeof row !== 'object' || Array.isArray(row))
    throw new PublicResourceError('Ayarlar okunamadı.', 503);
  const r = row as Record<string, unknown>;
  const beyan = Number(r.aylik_beyan_sinir_usd);
  const prim = Number(r.prim_orani_varsayilan);
  const kg = r.varsayilan_kg_fiyati_azn === null ? null : Number(r.varsayilan_kg_fiyati_azn);
  if (
    r.tenant_id !== tenantId ||
    !Number.isFinite(beyan) ||
    !Number.isFinite(prim) ||
    (kg !== null && !Number.isFinite(kg))
  )
    throw new PublicResourceError('Ayarlar okunamadı.', 503);
  return {
    aylikBeyanSinirUsd: beyan,
    varsayilanKgFiyatiAzn: kg,
    primOraniVarsayilan: prim,
    kayitli: true,
    guncelleyenKullaniciId:
      typeof r.guncelleyen_kullanici_id === 'string' ? r.guncelleyen_kullanici_id : null,
    guncellenmeZamani: typeof r.guncellenme_zamani === 'string' ? r.guncellenme_zamani : null,
  };
}

const varsayilanlar = (): V2Ayarlari => ({
  ...VARSAYILAN_V2_AYARLARI,
  kayitli: false,
  guncelleyenKullaniciId: null,
  guncellenmeZamani: null,
});

/** The session tenant's settings, or the defaults when it has no row yet. */
export async function ayarlariOku(tenant: unknown): Promise<V2Ayarlari> {
  const tenantId = v2Tenant(tenant);
  const client = supabase;
  if (!client) return { ...(bellek.get(tenantId) ?? varsayilanlar()) };
  const { data, error } = await client
    .from('tenant_v2_ayarlari')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new PublicResourceError('Ayarlar okunamadı.', 503);
  return data ? satirdan(data, tenantId) : varsayilanlar();
}

/**
 * Updates only the given fields in one statement (upsert on tenant_id): the
 * first update creates the row with defaults for the other fields.
 */
export async function ayarlariGuncelle(
  tenant: unknown,
  userId: string,
  degisiklik: Partial<V2AyarDegerleri>
): Promise<V2Ayarlari> {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  const zaman = new Date().toISOString();
  const client = supabase;
  if (!client) {
    const guncel: V2Ayarlari = {
      ...(bellek.get(tenantId) ?? varsayilanlar()),
      ...degisiklik,
      kayitli: true,
      guncelleyenKullaniciId: userId,
      guncellenmeZamani: zaman,
    };
    bellek.set(tenantId, guncel);
    return { ...guncel };
  }
  const satir: Record<string, unknown> = {
    tenant_id: tenantId,
    guncelleyen_kullanici_id: userId,
    guncellenme_zamani: zaman,
  };
  if (degisiklik.aylikBeyanSinirUsd !== undefined)
    satir.aylik_beyan_sinir_usd = degisiklik.aylikBeyanSinirUsd;
  if (degisiklik.varsayilanKgFiyatiAzn !== undefined)
    satir.varsayilan_kg_fiyati_azn = degisiklik.varsayilanKgFiyatiAzn;
  if (degisiklik.primOraniVarsayilan !== undefined)
    satir.prim_orani_varsayilan = degisiklik.primOraniVarsayilan;
  const { data, error } = await client
    .from('tenant_v2_ayarlari')
    .upsert(satir, { onConflict: 'tenant_id' })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new PublicResourceError('Ayarlar kaydedilemedi.', 503);
  return satirdan(data, tenantId);
}

/** Copy of a tenant's in-memory settings (development and demo only). */
export function bellektekiAyarlar(tenant: unknown): V2Ayarlari | null {
  const kayit = bellek.get(v2Tenant(tenant));
  return kayit ? { ...kayit } : null;
}
