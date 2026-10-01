import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import { v2Tenant, v2GovdesiniAyikla } from './ortak';
import { AYAR_SINIRLARI, sinirIcinde, type AyarSiniri } from '../../../shared/v2AyarSinirlari';
import { BUTIK_VARSAYILAN_DILI, dilDestekleniyor } from '../../../shared/diller';

/**
 * v2 tenant ayarları: tenant başına bir satır. Satır yoksa varsayılanlar
 * geçerlidir (K8: alıcı başına aylık beyan sınırı 300 USD; K11: prim oranı %5).
 * Her okuma ve yazma tek bir tenant'a bağlıdır.
 */

export interface V2AyarDegerleri {
  aylikBeyanSinirUsd: number;
  varsayilanKgFiyatiAzn: number | null;
  primOraniVarsayilan: number;
  /** Boutique default language (migration 20, docs/i18n.md). */
  varsayilanDil: string;
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
  varsayilanDil: BUTIK_VARSAYILAN_DILI,
};

const COLUMNS =
  'tenant_id,aylik_beyan_sinir_usd,varsayilan_kg_fiyati_azn,prim_orani_varsayilan,varsayilan_dil,guncelleyen_kullanici_id,guncellenme_zamani';
const ALANLAR = [
  'aylik_beyan_sinir_usd',
  'varsayilan_kg_fiyati_azn',
  'prim_orani_varsayilan',
  'varsayilan_dil',
] as const;

// Development/demo store: one entry per tenant.
const bellek = new Map<string, V2Ayarlari>();

function sayi(value: unknown, sinir: AyarSiniri): number {
  const kat = 10 ** sinir.ondalik;
  if (
    typeof value !== 'number' ||
    !sinirIcinde(value, sinir) ||
    Math.round(value * kat) / kat !== value
  )
    throw new PublicResourceError('Geçersiz ayar değeri.', 400, 'AYAR_GECERSIZ_DEGER');
  return value;
}

/** Validates a partial settings update; at least one known field is required. */
export function ayarGuncellemesiniDogrula(body: unknown): Partial<V2AyarDegerleri> {
  const alanlar = v2GovdesiniAyikla(body, ALANLAR);
  const sonuc: Partial<V2AyarDegerleri> = {};
  if ('aylik_beyan_sinir_usd' in alanlar)
    sonuc.aylikBeyanSinirUsd = sayi(
      alanlar.aylik_beyan_sinir_usd,
      AYAR_SINIRLARI.aylikBeyanSinirUsd
    );
  if ('varsayilan_kg_fiyati_azn' in alanlar)
    sonuc.varsayilanKgFiyatiAzn =
      alanlar.varsayilan_kg_fiyati_azn === null
        ? null
        : sayi(alanlar.varsayilan_kg_fiyati_azn, AYAR_SINIRLARI.varsayilanKgFiyatiAzn);
  if ('prim_orani_varsayilan' in alanlar)
    sonuc.primOraniVarsayilan = sayi(
      alanlar.prim_orani_varsayilan,
      AYAR_SINIRLARI.primOraniVarsayilan
    );
  if ('varsayilan_dil' in alanlar) {
    // The database checks the format only; the supported list lives in the application.
    if (!dilDestekleniyor(alanlar.varsayilan_dil))
      throw new PublicResourceError('Bu dil desteklenmiyor.', 400, 'AYAR_DIL_DESTEKLENMIYOR');
    sonuc.varsayilanDil = alanlar.varsayilan_dil;
  }
  if (Object.keys(sonuc).length === 0)
    throw new PublicResourceError('Güncellenecek bir ayar gönderilmelidir.', 400, 'AYAR_ALAN_YOK');
  return sonuc;
}

function satirdan(row: unknown, tenantId: string): V2Ayarlari {
  if (!row || typeof row !== 'object' || Array.isArray(row))
    throw new PublicResourceError('Ayarlar okunamadı.', 503, 'AYAR_OKUNAMADI');
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
    throw new PublicResourceError('Ayarlar okunamadı.', 503, 'AYAR_OKUNAMADI');
  return {
    aylikBeyanSinirUsd: beyan,
    varsayilanKgFiyatiAzn: kg,
    primOraniVarsayilan: prim,
    // A language no longer in the list reads as the default; the stored value stays.
    varsayilanDil: dilDestekleniyor(r.varsayilan_dil) ? r.varsayilan_dil : BUTIK_VARSAYILAN_DILI,
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
  if (error) throw new PublicResourceError('Ayarlar okunamadı.', 503, 'AYAR_OKUNAMADI');
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
  if (degisiklik.varsayilanDil !== undefined) satir.varsayilan_dil = degisiklik.varsayilanDil;
  const { data, error } = await client
    .from('tenant_v2_ayarlari')
    .upsert(satir, { onConflict: 'tenant_id' })
    .select(COLUMNS)
    .single();
  if (error || !data)
    throw new PublicResourceError('Ayarlar kaydedilemedi.', 503, 'AYAR_KAYDEDILEMEDI');
  return satirdan(data, tenantId);
}

/**
 * The boutique's default language for the session (docs/i18n.md). Never fails a login:
 * an unreadable value (or migration 20 not applied yet) reads as the default.
 */
export async function butikDiliniOku(tenant: unknown): Promise<string> {
  let tenantId: string;
  try {
    tenantId = v2Tenant(tenant);
  } catch {
    return BUTIK_VARSAYILAN_DILI;
  }
  const client = supabase;
  if (!client) return bellek.get(tenantId)?.varsayilanDil ?? BUTIK_VARSAYILAN_DILI;
  const { data, error } = await client
    .from('tenant_v2_ayarlari')
    .select('varsayilan_dil')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    console.warn('Butik dili okunamadı; varsayılan kullanılıyor.', error.code ?? '');
    return BUTIK_VARSAYILAN_DILI;
  }
  const dil: unknown = (data as { varsayilan_dil?: unknown } | null)?.varsayilan_dil;
  return dilDestekleniyor(dil) ? dil : BUTIK_VARSAYILAN_DILI;
}

/** Copy of a tenant's in-memory settings (development and demo only). */
export function bellektekiAyarlar(tenant: unknown): V2Ayarlari | null {
  const kayit = bellek.get(v2Tenant(tenant));
  return kayit ? { ...kayit } : null;
}
