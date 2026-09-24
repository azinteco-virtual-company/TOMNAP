import { randomUUID } from 'node:crypto';
import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import {
  demoSiparislerVeritabani,
  firmalarVeritabani,
  kullanicilarVeritabani,
  musterilerVeritabani,
  siparislerVeritabani,
} from '../state';
import { rolGrubunda } from '../../../shared/roller';
import { v2GovdesiniAyikla, v2Tenant } from './ortak';

/**
 * v2 siparişleri (durak 0; K1, K2, K20): başlık siparisler'de (model_surumu = 2),
 * satırlar siparis_satirlari'nda. Supabase'de başlık ve satırlar tek RPC'de
 * (tomnap_v2_siparis_olustur) yazılır; bellek deposu aynı kuralları uygular.
 * Her okuma ve yazma tek bir tenant'a bağlıdır.
 */

export const V2_SATIR_SINIRI = 100;
export const V2_LISTE_SINIRI = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EN_BUYUK_TOPLAM = 99_999_999.99; // siparisler.toplam_tutar numeric(10, 2)

export type KaynakUlke = 'CA' | 'US';
export interface V2SatirGirdisi {
  urunAciklamasi: string;
  beden: string | null;
  renk: string | null;
  adet: number;
  birimSatisFiyatiAzn: number;
  kaynakUlke: KaynakUlke;
}
export interface V2SiparisGirdisi {
  musteriAdi: string;
  telefonNumarasi: string | null;
  instagramKullaniciAdi: string | null;
  teslimatSehri: string | null;
  teslimatAdresi: string | null;
  musteriId: string | null;
  sahipKullaniciId: string | null;
  siparisKaynagi: string | null;
  hamMesaj: string;
  ozelNot: string | null;
  satirlar: V2SatirGirdisi[];
}
export interface V2SiparisSatiri extends V2SatirGirdisi {
  id: string;
  sira: number;
  iptal: boolean;
}
export interface V2Siparis {
  id: string;
  tenantId: string;
  musteriAdi: string;
  telefonNumarasi: string | null;
  instagramKullaniciAdi: string | null;
  teslimatSehri: string | null;
  teslimatAdresi: string | null;
  musteriId: string | null;
  sahipKullaniciId: string;
  siparisKaynagi: string | null;
  ozelNot: string | null;
  toplamTutar: number;
  alinanTutar: number;
  kalanTutar: number;
  finansDurumu: string;
  lojistikDurumu: string;
  olusturmaTarihi: string;
  satirlar: V2SiparisSatiri[];
}

const BASLIK_ALANLARI = [
  'musteri_adi',
  'telefon_numarasi',
  'instagram_kullanici_adi',
  'teslimat_sehri',
  'teslimat_adresi',
  'musteri_id',
  'sahip_kullanici_id',
  'siparis_kaynagi',
  'ham_mesaj',
  'ozel_not',
  'satirlar',
] as const;
const SATIR_ALANLARI = [
  'urun_aciklamasi',
  'beden',
  'renk',
  'adet',
  'birim_satis_fiyati_azn',
  'kaynak_ulke',
] as const;
const BASLIK_KOLONLARI =
  'id,tenant_id,model_surumu,sahip_kullanici_id,musteri_adi,telefon_numarasi,instagram_kullanici_adi,teslimat_sehri,teslimat_adresi,siparis_kaynagi,ozel_not,toplam_tutar,alinan_tutar,kalan_tutar,finans_durumu,lojistik_durumu,ek_veriler,olusturma_tarihi';
const SATIR_KOLONLARI =
  'id,tenant_id,siparis_id,sira,urun_aciklamasi,beden,renk,adet,birim_satis_fiyati_azn,kaynak_ulke,iptal';

const hata = (mesaj: string) => new PublicResourceError(mesaj, 400);

function metin(value: unknown, alan: string, enCok: number, zorunlu = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (zorunlu) throw hata(`${alan} gereklidir.`);
    return null;
  }
  if (typeof value !== 'string') throw hata(`${alan} metin olmalı.`);
  const temiz = value.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : '')).trim();
  if (!temiz) {
    if (zorunlu) throw hata(`${alan} gereklidir.`);
    return null;
  }
  if (temiz.length > enCok) throw hata(`${alan} en fazla ${enCok} karakter olabilir.`);
  return temiz;
}

function satiriDogrula(value: unknown, index: number): V2SatirGirdisi {
  const alanlar = v2GovdesiniAyikla(value, SATIR_ALANLARI);
  const etiket = `${index + 1}. satır`;
  const adet = alanlar.adet;
  if (typeof adet !== 'number' || !Number.isInteger(adet) || adet < 1 || adet > 1000)
    throw hata(`${etiket}: adet 1-1000 arası tam sayı olmalı.`);
  const fiyat = alanlar.birim_satis_fiyati_azn;
  if (
    typeof fiyat !== 'number' ||
    !Number.isFinite(fiyat) ||
    fiyat < 0 ||
    fiyat >= 1_000_000 ||
    Math.round(fiyat * 100) / 100 !== fiyat
  )
    throw hata(`${etiket}: birim fiyat 0 ile 1.000.000 AZN arasında, en fazla 2 ondalıklı olmalı.`);
  if (alanlar.kaynak_ulke !== 'CA' && alanlar.kaynak_ulke !== 'US')
    throw hata(`${etiket}: kaynak ülke CA ya da US olmalı.`);
  return {
    urunAciklamasi: metin(alanlar.urun_aciklamasi, `${etiket} ürün`, 500, true) as string,
    beden: metin(alanlar.beden, `${etiket} beden`, 50),
    renk: metin(alanlar.renk, `${etiket} renk`, 50),
    adet,
    birimSatisFiyatiAzn: fiyat,
    kaynakUlke: alanlar.kaynak_ulke,
  };
}

/** Validates a new v2 order; tenant, creator and derived columns come from the server. */
export function v2SiparisGirdisiniDogrula(body: unknown): V2SiparisGirdisi {
  const alanlar = v2GovdesiniAyikla(body, BASLIK_ALANLARI);
  if (
    !Array.isArray(alanlar.satirlar) ||
    alanlar.satirlar.length < 1 ||
    alanlar.satirlar.length > V2_SATIR_SINIRI
  )
    throw hata(`Sipariş 1-${V2_SATIR_SINIRI} satır içermeli.`);
  const satirlar = alanlar.satirlar.map(satiriDogrula);
  if (siparisToplami(satirlar) > EN_BUYUK_TOPLAM) throw hata('Sipariş toplamı çok büyük.');
  const kaynak = metin(alanlar.siparis_kaynagi, 'Sipariş kaynağı', 50);
  if (kaynak !== null && !/^[A-Z_]{1,50}$/.test(kaynak)) throw hata('Geçersiz sipariş kaynağı.');
  const kimlik = (value: unknown, alan: string) => {
    const id = metin(value, alan, 100);
    if (id !== null && !/^[A-Za-z0-9_:.@-]{1,100}$/.test(id)) throw hata(`Geçersiz ${alan}.`);
    return id;
  };
  return {
    musteriAdi: metin(alanlar.musteri_adi, 'Müşteri adı', 150, true) as string,
    telefonNumarasi: metin(alanlar.telefon_numarasi, 'Telefon', 50),
    instagramKullaniciAdi: metin(alanlar.instagram_kullanici_adi, 'Instagram', 100),
    teslimatSehri: metin(alanlar.teslimat_sehri, 'Şehir', 100),
    teslimatAdresi: metin(alanlar.teslimat_adresi, 'Adres', 500),
    musteriId: kimlik(alanlar.musteri_id, 'müşteri kimliği'),
    sahipKullaniciId: kimlik(alanlar.sahip_kullanici_id, 'sahip kimliği'),
    siparisKaynagi: kaynak,
    hamMesaj: metin(alanlar.ham_mesaj, 'Ham mesaj', 10_000) ?? '',
    ozelNot: metin(alanlar.ozel_not, 'Not', 1000),
    satirlar,
  };
}

/** Σ adet × birim fiyat, rounded per line to cents like the RPC. */
export function siparisToplami(satirlar: readonly V2SatirGirdisi[]): number {
  const kurus = satirlar.reduce(
    (toplam, satir) => toplam + Math.round(satir.adet * satir.birimSatisFiyatiAzn * 100),
    0
  );
  return kurus / 100;
}

// ---------------------------------------------------------------------------
// Development/demo store (no Supabase, and the demo sandbox).

interface BellekSatiri extends V2SiparisSatiri {
  tenantId: string;
  siparisId: string;
}
const satirBellegi: BellekSatiri[] = [];

const bellekModu = (tenantId: string) => !supabase || tenantId === 'demo_sandbox';
const havuz = (tenantId: string): Record<string, unknown>[] =>
  tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;

function bellekteOlustur(tenantId: string, userId: string, girdi: V2SiparisGirdisi): V2Siparis {
  const olusturan = kullanicilarVeritabani.find(
    (u) =>
      u.id === userId &&
      u.durum === 'AKTIF' &&
      rolGrubunda(u.rol, 'SALES') &&
      (u.tenant_id === tenantId || u.rol === 'SUPER_ADMIN')
  );
  if (!olusturan) throw new PublicResourceError('Bu firma için sipariş oluşturamazsınız.', 403);
  const firma = firmalarVeritabani.find((f) => f.id === tenantId);
  if (!firma || (firma.onayDurumu && firma.onayDurumu !== 'AKTIF'))
    throw new PublicResourceError('Firma aktif değil.', 403);
  const sahip = girdi.sahipKullaniciId ?? olusturan.id;
  if (olusturan.rol === 'SATIS_SORUMLUSU' && sahip !== olusturan.id)
    throw new PublicResourceError('Satış sorumlusu yalnız kendi siparişinin sahibi olabilir.', 403);
  if (
    sahip !== olusturan.id &&
    !kullanicilarVeritabani.some(
      (u) =>
        u.id === sahip &&
        u.tenant_id === tenantId &&
        u.durum === 'AKTIF' &&
        rolGrubunda(u.rol, 'ORDER_OWNERS')
    )
  )
    throw new PublicResourceError('Sahip bu firmanın aktif bir satış sorumlusu değil.', 409);
  if (
    girdi.musteriId !== null &&
    !musterilerVeritabani.some(
      (m) => m.id === girdi.musteriId && (m as { tenant_id?: string }).tenant_id === tenantId
    )
  )
    throw new PublicResourceError('Müşteri bulunamadı.', 409);

  const id = randomUUID();
  const zaman = new Date().toISOString();
  const toplam = siparisToplami(girdi.satirlar);
  const satirlar: BellekSatiri[] = girdi.satirlar.map((satir, index) => ({
    ...satir,
    id: randomUUID(),
    sira: index + 1,
    iptal: false,
    tenantId,
    siparisId: id,
  }));
  havuz(tenantId).push({
    id,
    tenant_id: tenantId,
    model_surumu: 2,
    sahip_kullanici_id: sahip,
    ham_mesaj: girdi.hamMesaj,
    siparis_kaynagi: girdi.siparisKaynagi ?? 'INSTAGRAM_DM',
    musteri_adi: girdi.musteriAdi,
    instagram_kullanici_adi: girdi.instagramKullaniciAdi,
    telefon_numarasi: girdi.telefonNumarasi,
    teslimat_sehri: girdi.teslimatSehri ?? 'Bakü',
    teslimat_adresi: girdi.teslimatAdresi,
    urun_aciklamasi: girdi.satirlar.map((satir) => satir.urunAciklamasi).join(' + '),
    adet: girdi.satirlar.reduce((n, satir) => n + satir.adet, 0),
    toplam_tutar: toplam,
    alinan_tutar: 0,
    kalan_tutar: toplam,
    para_birimi: 'AZN',
    finans_durumu: 'BEKLIYOR',
    lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
    ozel_not: girdi.ozelNot,
    eksik_bilgiler: [],
    is_demo: tenantId === 'demo_sandbox',
    ...(girdi.musteriId ? { musteri_id: girdi.musteriId } : {}),
    ek_veriler: girdi.musteriId ? { musteri_id: girdi.musteriId } : {},
    olusturma_tarihi: zaman,
    guncellenme_tarihi: zaman,
  });
  satirBellegi.push(...satirlar);
  return basliktan(havuz(tenantId).at(-1), tenantId, satirlar);
}

// ---------------------------------------------------------------------------
// Row mapping (database rows and in-memory rows share the column names).

function kayit(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicResourceError('Siparişler okunamadı.', 503);
  return value as Record<string, unknown>;
}
const yaziYaDaNull = (value: unknown) => (typeof value === 'string' ? value : null);

function satirdan(value: unknown, tenantId: string): V2SiparisSatiri & { siparisId: string } {
  const r = kayit(value);
  const adet = Number(r.adet);
  const fiyat = Number(r.birim_satis_fiyati_azn);
  if (
    r.tenant_id !== tenantId ||
    typeof r.id !== 'string' ||
    typeof r.siparis_id !== 'string' ||
    typeof r.urun_aciklamasi !== 'string' ||
    (r.kaynak_ulke !== 'CA' && r.kaynak_ulke !== 'US') ||
    !Number.isInteger(adet) ||
    !Number.isFinite(fiyat)
  )
    throw new PublicResourceError('Siparişler okunamadı.', 503);
  return {
    id: r.id,
    siparisId: r.siparis_id,
    sira: Number(r.sira),
    urunAciklamasi: r.urun_aciklamasi,
    beden: yaziYaDaNull(r.beden),
    renk: yaziYaDaNull(r.renk),
    adet,
    birimSatisFiyatiAzn: fiyat,
    kaynakUlke: r.kaynak_ulke,
    iptal: r.iptal === true,
  };
}

function basliktan(
  value: unknown,
  tenantId: string,
  satirlar: readonly V2SiparisSatiri[]
): V2Siparis {
  const r = kayit(value);
  const ek =
    r.ek_veriler && typeof r.ek_veriler === 'object'
      ? (r.ek_veriler as Record<string, unknown>)
      : {};
  const toplam = Number(r.toplam_tutar);
  const alinan = Number(r.alinan_tutar);
  if (
    r.tenant_id !== tenantId ||
    Number(r.model_surumu) !== 2 ||
    typeof r.id !== 'string' ||
    typeof r.sahip_kullanici_id !== 'string' ||
    !Number.isFinite(toplam) ||
    !Number.isFinite(alinan)
  )
    throw new PublicResourceError('Siparişler okunamadı.', 503);
  return {
    id: r.id,
    tenantId,
    musteriAdi: String(r.musteri_adi ?? ''),
    telefonNumarasi: yaziYaDaNull(r.telefon_numarasi),
    instagramKullaniciAdi: yaziYaDaNull(r.instagram_kullanici_adi),
    teslimatSehri: yaziYaDaNull(r.teslimat_sehri),
    teslimatAdresi: yaziYaDaNull(r.teslimat_adresi),
    musteriId: yaziYaDaNull(ek.musteri_id),
    sahipKullaniciId: r.sahip_kullanici_id,
    siparisKaynagi: yaziYaDaNull(r.siparis_kaynagi),
    ozelNot: yaziYaDaNull(r.ozel_not),
    toplamTutar: toplam,
    alinanTutar: alinan,
    kalanTutar: r.kalan_tutar === undefined ? toplam - alinan : Number(r.kalan_tutar),
    finansDurumu: String(r.finans_durumu),
    lojistikDurumu: String(r.lojistik_durumu),
    olusturmaTarihi: String(r.olusturma_tarihi),
    satirlar: satirlar
      .map((s) => ({
        id: s.id,
        sira: s.sira,
        urunAciklamasi: s.urunAciklamasi,
        beden: s.beden,
        renk: s.renk,
        adet: s.adet,
        birimSatisFiyatiAzn: s.birimSatisFiyatiAzn,
        kaynakUlke: s.kaynakUlke,
        iptal: s.iptal,
      }))
      .sort((a, b) => a.sira - b.sira),
  };
}

function rpcHatasi(error: { code?: string } | null): never {
  const code = error?.code ?? '';
  if (code === 'PT403') throw new PublicResourceError('Bu işlem için yetkiniz yok.', 403);
  if (code === 'PT409')
    throw new PublicResourceError(
      'Sahip ya da müşteri bu firmaya ait değil veya aktif değil.',
      409
    );
  if (['22023', '22001', '22003', '22P02', '23514', '23502'].includes(code))
    throw new PublicResourceError('Sipariş verisi geçersiz.', 400);
  throw new PublicResourceError('Sipariş kaydedilemedi.', 503);
}

// ---------------------------------------------------------------------------
// Public operations.

/** Creates a v2 order with its lines for the session tenant, in one transaction. */
export async function v2SiparisOlustur(
  tenant: unknown,
  userId: string,
  girdi: V2SiparisGirdisi
): Promise<V2Siparis> {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (bellekModu(tenantId)) return bellekteOlustur(tenantId, userId, girdi);
  const client = supabase!;
  const { data, error } = await client.rpc('tomnap_v2_siparis_olustur', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_siparis: {
      musteri_adi: girdi.musteriAdi,
      telefon_numarasi: girdi.telefonNumarasi,
      instagram_kullanici_adi: girdi.instagramKullaniciAdi,
      teslimat_sehri: girdi.teslimatSehri,
      teslimat_adresi: girdi.teslimatAdresi,
      musteri_id: girdi.musteriId,
      sahip_kullanici_id: girdi.sahipKullaniciId,
      siparis_kaynagi: girdi.siparisKaynagi,
      ham_mesaj: girdi.hamMesaj,
      ozel_not: girdi.ozelNot,
    },
    p_satirlar: girdi.satirlar.map((satir) => ({
      urun_aciklamasi: satir.urunAciklamasi,
      beden: satir.beden,
      renk: satir.renk,
      adet: satir.adet,
      birim_satis_fiyati_azn: satir.birimSatisFiyatiAzn,
      kaynak_ulke: satir.kaynakUlke,
    })),
  });
  if (error) rpcHatasi(error);
  const sonuc = kayit(data);
  const satirlar = Array.isArray(sonuc.satirlar)
    ? sonuc.satirlar.map((s) => satirdan(s, tenantId))
    : [];
  return basliktan(sonuc.siparis, tenantId, satirlar);
}

async function satirlariOku(tenantId: string, siparisIdleri: string[]) {
  if (siparisIdleri.length === 0) return [];
  const { data, error } = await supabase!
    .from('siparis_satirlari')
    .select(SATIR_KOLONLARI)
    .eq('tenant_id', tenantId)
    .in('siparis_id', siparisIdleri)
    .order('sira', { ascending: true });
  if (error || !Array.isArray(data)) throw new PublicResourceError('Siparişler okunamadı.', 503);
  const rows: unknown[] = data;
  return rows.map((row) => satirdan(row, tenantId));
}

/** The session tenant's latest v2 orders with their lines (newest first). */
export async function v2SiparisleriListele(tenant: unknown): Promise<V2Siparis[]> {
  const tenantId = v2Tenant(tenant);
  if (bellekModu(tenantId)) {
    const basliklar = havuz(tenantId)
      .filter((row) => row.tenant_id === tenantId && row.model_surumu === 2)
      .sort(
        (a, b) =>
          String(b.olusturma_tarihi).localeCompare(String(a.olusturma_tarihi)) ||
          String(b.id).localeCompare(String(a.id))
      )
      .slice(0, V2_LISTE_SINIRI);
    return basliklar.map((row) =>
      basliktan(
        row,
        tenantId,
        satirBellegi.filter((s) => s.tenantId === tenantId && s.siparisId === row.id)
      )
    );
  }
  const { data, error } = await supabase!
    .from('siparisler')
    .select(BASLIK_KOLONLARI)
    .eq('tenant_id', tenantId)
    .eq('model_surumu', 2)
    .order('olusturma_tarihi', { ascending: false })
    .order('id', { ascending: false })
    .limit(V2_LISTE_SINIRI);
  if (error || !Array.isArray(data)) throw new PublicResourceError('Siparişler okunamadı.', 503);
  const rows: unknown[] = data;
  const ids = rows.map((row) => String(kayit(row).id));
  const satirlar = await satirlariOku(tenantId, ids);
  return rows.map((row) =>
    basliktan(
      row,
      tenantId,
      satirlar.filter((s) => s.siparisId === kayit(row).id)
    )
  );
}

/** One v2 order of the session tenant, or null (unknown, foreign or v1 order). */
export async function v2SiparisGetir(tenant: unknown, id: unknown): Promise<V2Siparis | null> {
  const tenantId = v2Tenant(tenant);
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (bellekModu(tenantId)) {
    const row = havuz(tenantId).find(
      (r) => r.id === id && r.tenant_id === tenantId && r.model_surumu === 2
    );
    return row
      ? basliktan(
          row,
          tenantId,
          satirBellegi.filter((s) => s.tenantId === tenantId && s.siparisId === id)
        )
      : null;
  }
  const { data, error } = await supabase!
    .from('siparisler')
    .select(BASLIK_KOLONLARI)
    .eq('tenant_id', tenantId)
    .eq('model_surumu', 2)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new PublicResourceError('Siparişler okunamadı.', 503);
  if (!data) return null;
  return basliktan(data, tenantId, await satirlariOku(tenantId, [id]));
}

/** Tenant-scoped copy of the in-memory order lines (development and demo only). */
export function bellektekiSatirlar(tenant: unknown): V2SiparisSatiri[] {
  const tenantId = v2Tenant(tenant);
  return satirBellegi.filter((s) => s.tenantId === tenantId).map((s) => ({ ...s }));
}
