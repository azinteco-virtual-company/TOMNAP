import { randomUUID } from 'node:crypto';
import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import {
  demoSiparislerVeritabani,
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../state';
import { rolGrubunda } from '../../../shared/roller';
import { v2GovdesiniAyikla, v2Tenant } from './ortak';

/**
 * Ödeme defteri (A10; K16, K20). Append-only: düzeltme ters kayıttır. Veritabanında
 * iki RPC yazar (tomnap_v2_odeme_kaydet, tomnap_v2_odeme_ters_kayit); siparişin eski
 * kolonlarını (alinan_tutar, finans_durumu) aynı transaction'da tetikleyici günceller.
 * Bellek deposu aynı kuralları uygular. Her okuma tenant filtrelidir.
 */

export const ODEME_YONTEMLERI = ['NAKIT', 'KART', 'HAVALE', 'DIGER'] as const;
export type OdemeYontemi = (typeof ODEME_YONTEMLERI)[number];
export type OdemeKaynagi = 'TESLIMAT' | 'BUTIK' | 'ONLINE';
/** Bu uçtan yazılan kaynaklar; TESLIMAT kurye akışından gelir (A11). */
export const ELLE_KAYNAKLAR = ['BUTIK', 'ONLINE'] as const;
export type OdemeDurumu = 'ODENMEDI' | 'KISMI' | 'TAM' | 'FAZLA';

export interface V2OdemeGirdisi {
  siparisId: string;
  tutarAzn: number;
  yontem: OdemeYontemi;
  kaynak: (typeof ELLE_KAYNAKLAR)[number];
  almaZamani: string | null;
  aciklama: string | null;
  /** One payment intent (Codex R3 F15): a retry with the same key records nothing new. */
  islemAnahtari: string | null;
}
export interface V2Odeme {
  id: string;
  siparisId: string;
  tutarAzn: number;
  yontem: OdemeYontemi;
  kaynak: OdemeKaynagi;
  alanKullaniciId: string;
  almaZamani: string;
  kaydedenKullaniciId: string;
  aciklama: string | null;
  tersKayitOdemeId: string | null;
  kasaTeslimId: string | null;
  olusturmaZamani: string;
}
export interface V2OdemeOzeti {
  siparisId: string;
  toplamTutar: number;
  odenenTutar: number;
  kalanTutar: number;
  durum: OdemeDurumu;
}
export interface V2OdemeDefteri {
  ozet: V2OdemeOzeti;
  odemeler: Array<V2Odeme & { tersKaydiVar: boolean }>;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ODEME_KOLONLARI =
  'id,tenant_id,siparis_id,tutar_azn,yontem,kaynak,alan_kullanici_id,alma_zamani,kaydeden_kullanici_id,aciklama,ters_kayit_odeme_id,kasa_teslim_id,olusturma_zamani';
const ALANLAR = [
  'siparis_id',
  'tutar_azn',
  'yontem',
  'kaynak',
  'alma_zamani',
  'aciklama',
  'islem_anahtari',
] as const;
const KURUS = (value: number) => Math.round(value * 100);

/** Payment status from the ledger total (spec §4): stored nowhere, always derived. */
export function odemeDurumu(toplam: number, odenen: number): OdemeDurumu {
  if (odenen <= 0) return 'ODENMEDI';
  if (KURUS(odenen) < KURUS(toplam)) return 'KISMI';
  return KURUS(odenen) === KURUS(toplam) ? 'TAM' : 'FAZLA';
}
/** The old finans_durumu for a ledger total (K20). */
export const eskiFinansDurumu = (toplam: number, odenen: number) =>
  ({ ODENMEDI: 'BEKLIYOR', KISMI: 'KISMI_ODEME', TAM: 'ODENDI', FAZLA: 'ODENDI' })[
    odemeDurumu(toplam, odenen)
  ];

function metin(value: unknown, alan: string, sinir: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new PublicResourceError(`${alan} metin olmalı.`, 400);
  const temiz = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
  if (temiz.length > sinir)
    throw new PublicResourceError(`${alan} en fazla ${sinir} karakter.`, 400);
  return temiz || null;
}

/** Operation key of one payment intent (Codex R3 F15): the client's UUID, optional. */
export function islemAnahtariOku(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID.test(value))
    throw new PublicResourceError('İşlem anahtarı geçersiz.', 400);
  return value.toLowerCase();
}

/** Validates a payment; tenant, receiver and recorder always come from the session. */
export function v2OdemeGirdisiniDogrula(body: unknown, simdi = new Date()): V2OdemeGirdisi {
  const alanlar = v2GovdesiniAyikla(body, ALANLAR);
  if (typeof alanlar.siparis_id !== 'string' || !UUID.test(alanlar.siparis_id))
    throw new PublicResourceError('Geçerli bir sipariş seçilmelidir.', 400);
  const tutar = alanlar.tutar_azn;
  if (
    typeof tutar !== 'number' ||
    !Number.isFinite(tutar) ||
    tutar <= 0 ||
    tutar >= 1_000_000 ||
    KURUS(tutar) / 100 !== tutar
  )
    throw new PublicResourceError('Tutar 0-1.000.000 AZN, en fazla 2 ondalık olmalı.', 400);
  if (!(ODEME_YONTEMLERI as readonly unknown[]).includes(alanlar.yontem))
    throw new PublicResourceError('Ödeme yöntemi geçersiz.', 400);
  if (!(ELLE_KAYNAKLAR as readonly unknown[]).includes(alanlar.kaynak))
    throw new PublicResourceError('Kaynak BUTIK ya da ONLINE olmalı.', 400);
  let almaZamani: string | null = null;
  if (alanlar.alma_zamani !== undefined && alanlar.alma_zamani !== null) {
    const zaman =
      typeof alanlar.alma_zamani === 'string' ? Date.parse(alanlar.alma_zamani) : Number.NaN;
    if (
      !Number.isFinite(zaman) ||
      zaman > simdi.getTime() + 5 * 60_000 ||
      zaman < simdi.getTime() - 366 * 86_400_000
    )
      throw new PublicResourceError('Ödeme zamanı geçersiz.', 400);
    almaZamani = new Date(zaman).toISOString();
  }
  return {
    siparisId: alanlar.siparis_id.toLowerCase(),
    tutarAzn: tutar,
    yontem: alanlar.yontem as OdemeYontemi,
    kaynak: alanlar.kaynak as V2OdemeGirdisi['kaynak'],
    almaZamani,
    aciklama: metin(alanlar.aciklama, 'Açıklama', 500),
    islemAnahtari: islemAnahtariOku(alanlar.islem_anahtari),
  };
}

/** Reason of a reversal (K16): required. */
export function tersKayitGerekcesi(body: unknown): string {
  const gerekce = metin(v2GovdesiniAyikla(body, ['aciklama'] as const).aciklama, 'Gerekçe', 500);
  if (!gerekce) throw new PublicResourceError('Ters kayıt için gerekçe yazılmalıdır.', 400);
  return gerekce;
}

// ---------------------------------------------------------------------------
// Row mapping.

function kayit(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicResourceError('Ödemeler okunamadı.', 503);
  return value as Record<string, unknown>;
}
const yaziYaDaNull = (value: unknown) => (typeof value === 'string' ? value : null);

function odemeden(value: unknown, tenantId: string): V2Odeme {
  const r = kayit(value);
  const tutar = Number(r.tutar_azn);
  if (
    r.tenant_id !== tenantId ||
    typeof r.id !== 'string' ||
    typeof r.siparis_id !== 'string' ||
    !Number.isFinite(tutar) ||
    !(ODEME_YONTEMLERI as readonly unknown[]).includes(r.yontem) ||
    !['TESLIMAT', 'BUTIK', 'ONLINE'].includes(String(r.kaynak)) ||
    typeof r.alan_kullanici_id !== 'string' ||
    typeof r.kaydeden_kullanici_id !== 'string'
  )
    throw new PublicResourceError('Ödemeler okunamadı.', 503);
  return {
    id: r.id,
    siparisId: r.siparis_id,
    tutarAzn: tutar,
    yontem: r.yontem as OdemeYontemi,
    kaynak: r.kaynak as OdemeKaynagi,
    alanKullaniciId: r.alan_kullanici_id,
    almaZamani: String(r.alma_zamani),
    kaydedenKullaniciId: r.kaydeden_kullanici_id,
    aciklama: yaziYaDaNull(r.aciklama),
    tersKayitOdemeId: yaziYaDaNull(r.ters_kayit_odeme_id),
    kasaTeslimId: yaziYaDaNull(r.kasa_teslim_id),
    olusturmaZamani: String(r.olusturma_zamani),
  };
}

function ozetOlustur(siparisId: string, toplam: number, odenen: number): V2OdemeOzeti {
  return {
    siparisId,
    toplamTutar: toplam,
    odenenTutar: odenen,
    kalanTutar: (KURUS(toplam) - KURUS(odenen)) / 100,
    durum: odemeDurumu(toplam, odenen),
  };
}

function defter(siparisId: string, toplam: number, odemeler: V2Odeme[]): V2OdemeDefteri {
  const odenen = odemeler.reduce((kurus, o) => kurus + KURUS(o.tutarAzn), 0) / 100;
  const tersler = new Set(odemeler.map((o) => o.tersKayitOdemeId).filter(Boolean));
  return {
    ozet: ozetOlustur(siparisId, toplam, odenen),
    odemeler: odemeler.map((o) => ({ ...o, tersKaydiVar: tersler.has(o.id) })),
  };
}

// ---------------------------------------------------------------------------
// Development/demo store (no Supabase, and the demo sandbox).

interface BellekOdemesi extends V2Odeme {
  tenantId: string;
  islemAnahtari?: string | null;
}
const odemeBellegi: BellekOdemesi[] = [];
const bellekModu = (tenantId: string) => !supabase || tenantId === 'demo_sandbox';
const havuz = (tenantId: string): Record<string, unknown>[] =>
  tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;

function bellekSiparisi(tenantId: string, siparisId: string) {
  return havuz(tenantId).find(
    (r) => r.id === siparisId && r.tenant_id === tenantId && Number(r.model_surumu) === 2
  );
}
function bellekYetkilisi(tenantId: string, userId: string) {
  const u = kullanicilarVeritabani.find(
    (k) =>
      k.id === userId &&
      k.durum === 'AKTIF' &&
      // Same as the RPC: a user of this boutique; a platform admin never writes money.
      rolGrubunda(k.rol, 'PAYMENT_WRITE') &&
      k.tenant_id === tenantId
  );
  const firma = firmalarVeritabani.find((f) => f.id === tenantId);
  if (!u || !firma || (firma.onayDurumu && firma.onayDurumu !== 'AKTIF'))
    throw new PublicResourceError('Bu firma için ödeme işlemi yapamazsınız.', 403);
  return u;
}
function bellekteYaz(tenantId: string, odeme: BellekOdemesi, siparis: Record<string, unknown>) {
  odemeBellegi.push(odeme);
  const toplam = Number(siparis.toplam_tutar);
  const odenen =
    odemeBellegi
      .filter((o) => o.tenantId === tenantId && o.siparisId === odeme.siparisId)
      .reduce((kurus, o) => kurus + KURUS(o.tutarAzn), 0) / 100;
  Object.assign(siparis, {
    alinan_tutar: odenen,
    kalan_tutar: (KURUS(toplam) - KURUS(odenen)) / 100,
    finans_durumu: eskiFinansDurumu(toplam, odenen),
    guncellenme_tarihi: new Date().toISOString(),
  });
  return disaVer(odeme);
}
function disaVer({ tenantId: _tenant, islemAnahtari: _anahtar, ...odeme }: BellekOdemesi): V2Odeme {
  return odeme;
}

/**
 * Memory: the payment an operation key already recorded (Codex R3 F15), if it is the
 * same intent; the same key for a different payment is refused like the RPC does.
 */
export function bellekteAnahtarliOdeme(
  tenantId: string,
  anahtar: string | null,
  ayni: (odeme: V2Odeme) => boolean
): V2Odeme | null {
  if (!anahtar) return null;
  const onceki = odemeBellegi.find((o) => o.tenantId === tenantId && o.islemAnahtari === anahtar);
  if (!onceki) return null;
  if (!ayni(onceki)) islemAnahtariCakismasi();
  return disaVer(onceki);
}
export function islemAnahtariCakismasi(): never {
  throw new PublicResourceError('Bu işlem anahtarı başka bir ödeme için kullanıldı.', 409);
}

/** A11 (memory): appends a courier's cash collection and updates the order summary. */
export function bellekteKuryeTahsilatiYaz(
  tenantId: string,
  siparis: Record<string, unknown>,
  kuryeId: string,
  tutarAzn: number,
  islemAnahtari: string | null = null
): V2Odeme {
  const zaman = new Date().toISOString();
  return bellekteYaz(
    tenantId,
    {
      id: randomUUID(),
      tenantId,
      siparisId: String(siparis.id),
      tutarAzn,
      yontem: 'NAKIT',
      kaynak: 'TESLIMAT',
      alanKullaniciId: kuryeId,
      almaZamani: zaman,
      kaydedenKullaniciId: kuryeId,
      aciklama: null,
      tersKayitOdemeId: null,
      kasaTeslimId: null,
      olusturmaZamani: zaman,
      islemAnahtari,
    },
    siparis
  );
}
/**
 * A11 (memory): closes the selected open cash of one courier into a hand-over, only if
 * every one is open and they add up to the amount; otherwise changes nothing.
 */
export function bellekteKasayaKapat(
  tenantId: string,
  kuryeId: string,
  odemeIdleri: readonly string[],
  tutarAzn: number,
  kasaTeslimId: string
): boolean {
  const secilen = odemeIdleri.map((id) =>
    odemeBellegi.find(
      (o) =>
        o.id === id &&
        o.tenantId === tenantId &&
        o.alanKullaniciId === kuryeId &&
        o.kaynak === 'TESLIMAT' &&
        o.yontem === 'NAKIT' &&
        o.tutarAzn > 0 &&
        o.tersKayitOdemeId === null &&
        o.kasaTeslimId === null &&
        !odemeBellegi.some((r) => r.tersKayitOdemeId === o.id)
    )
  );
  const acik = secilen.filter((o): o is BellekOdemesi => o !== undefined);
  if (
    acik.length !== odemeIdleri.length ||
    acik.reduce((kurus, o) => kurus + KURUS(o.tutarAzn), 0) !== KURUS(tutarAzn)
  )
    return false;
  for (const o of acik) o.kasaTeslimId = kasaTeslimId;
  return true;
}

/** Test and guard helper: the in-memory ledger rows of one tenant. */
export function bellektekiOdemeler(tenant: string): V2Odeme[] {
  return odemeBellegi.filter((o) => o.tenantId === tenant).map(disaVer);
}
/** v1 delete and restore guard (memory mode): an order with payments is kept. */
export function bellekteOdemesiVar(tenant: string, siparisIdleri: readonly string[]): boolean {
  const ids = new Set(siparisIdleri);
  return odemeBellegi.some((o) => o.tenantId === tenant && ids.has(o.siparisId));
}

// ---------------------------------------------------------------------------
// Public operations.

function rpcHatasi(error: { code?: string } | null): never {
  const code = error?.code ?? '';
  if (code === 'PT403') throw new PublicResourceError('Bu ödeme işlemi için yetkiniz yok.', 403);
  if (code === 'PT404') throw new PublicResourceError('Sipariş ya da ödeme bulunamadı.', 404);
  if (code === 'PT412') islemAnahtariCakismasi();
  if (code === 'PT409' || code === '23505')
    throw new PublicResourceError(
      'Bu ödeme işlenemez: v1 sipariş, ters kayıt ya da zaten ters kaydı var.',
      409
    );
  if (['22023', '22003', '22007', '22008', '22P02', '23514', '23502'].includes(code))
    throw new PublicResourceError('Ödeme verisi geçersiz.', 400);
  throw new PublicResourceError('Ödeme kaydedilemedi.', 503);
}

/**
 * The RPC's answer: the payment and the order totals that the ledger trigger keeps in
 * SQL in the same transaction (Codex R3 F15). Nothing is read after the commit, so a
 * failed read can no longer turn a recorded payment into an error and a second payment.
 */
export function rpcOdemeSonucu(tenantId: string, data: unknown) {
  const sonuc = kayit(data);
  const odeme = odemeden(sonuc.odeme, tenantId);
  const s = kayit(sonuc.siparis);
  const toplam = Number(s.toplam_tutar);
  const odenen = Number(s.alinan_tutar);
  if (s.id !== odeme.siparisId || !Number.isFinite(toplam) || !Number.isFinite(odenen))
    throw new PublicResourceError('Ödemeler okunamadı.', 503);
  return {
    odeme,
    ozet: ozetOlustur(odeme.siparisId, toplam, odenen),
    tekrar: sonuc.tekrar === true,
  };
}

/** Records one boutique or online payment for a v2 order of the session tenant. */
export async function v2OdemeKaydet(tenant: unknown, userId: string, girdi: V2OdemeGirdisi) {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (bellekModu(tenantId)) {
    const u = bellekYetkilisi(tenantId, userId);
    if (u.rol === 'SATIS_SORUMLUSU' && girdi.kaynak !== 'BUTIK')
      throw new PublicResourceError('Satış sorumlusu yalnız butikte tahsilat kaydeder.', 403);
    const siparis = havuz(tenantId).find(
      (r) => r.id === girdi.siparisId && r.tenant_id === tenantId
    );
    if (!siparis) throw new PublicResourceError('Sipariş ya da ödeme bulunamadı.', 404);
    if (Number(siparis.model_surumu) !== 2)
      throw new PublicResourceError('Ödeme defteri yalnız v2 siparişleri içindir.', 409);
    const onceki = bellekteAnahtarliOdeme(
      tenantId,
      girdi.islemAnahtari,
      (o) =>
        o.siparisId === girdi.siparisId &&
        KURUS(o.tutarAzn) === KURUS(girdi.tutarAzn) &&
        o.yontem === girdi.yontem &&
        o.kaynak === girdi.kaynak &&
        o.kaydedenKullaniciId === u.id
    );
    if (onceki)
      return {
        odeme: onceki,
        ozet: (await v2SiparisOdemeleri(tenantId, girdi.siparisId))!.ozet,
        tekrar: true,
      };
    const zaman = new Date().toISOString();
    const odeme = bellekteYaz(
      tenantId,
      {
        id: randomUUID(),
        tenantId,
        siparisId: girdi.siparisId,
        tutarAzn: girdi.tutarAzn,
        yontem: girdi.yontem,
        kaynak: girdi.kaynak,
        alanKullaniciId: u.id,
        almaZamani: girdi.almaZamani ?? zaman,
        kaydedenKullaniciId: u.id,
        aciklama: girdi.aciklama,
        tersKayitOdemeId: null,
        kasaTeslimId: null,
        olusturmaZamani: zaman,
        islemAnahtari: girdi.islemAnahtari,
      },
      siparis
    );
    return {
      odeme,
      ozet: (await v2SiparisOdemeleri(tenantId, girdi.siparisId))!.ozet,
      tekrar: false,
    };
  }
  const { data, error } = await supabase!.rpc('tomnap_v2_odeme_kaydet', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_odeme: {
      siparis_id: girdi.siparisId,
      tutar_azn: girdi.tutarAzn,
      yontem: girdi.yontem,
      kaynak: girdi.kaynak,
      alma_zamani: girdi.almaZamani,
      aciklama: girdi.aciklama,
      islem_anahtari: girdi.islemAnahtari,
    },
  });
  if (error) rpcHatasi(error);
  return rpcOdemeSonucu(tenantId, data);
}

/** Reverses one payment of the session tenant once, with a reason (K16). */
export async function v2OdemeTersKayit(
  tenant: unknown,
  userId: string,
  odemeId: unknown,
  gerekce: string
) {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (typeof odemeId !== 'string' || !UUID.test(odemeId))
    throw new PublicResourceError('Sipariş ya da ödeme bulunamadı.', 404);
  const id = odemeId.toLowerCase();
  if (bellekModu(tenantId)) {
    const u = bellekYetkilisi(tenantId, userId);
    const asil = odemeBellegi.find((o) => o.id === id && o.tenantId === tenantId);
    if (!asil) throw new PublicResourceError('Sipariş ya da ödeme bulunamadı.', 404);
    if (
      u.rol === 'SATIS_SORUMLUSU' &&
      (asil.kaynak !== 'BUTIK' || asil.kaydedenKullaniciId !== u.id)
    )
      throw new PublicResourceError(
        'Satış sorumlusu yalnız kendi butik tahsilatını düzeltir.',
        403
      );
    if (
      asil.tersKayitOdemeId !== null ||
      asil.kasaTeslimId !== null ||
      odemeBellegi.some((o) => o.tersKayitOdemeId === asil.id)
    )
      rpcHatasi({ code: 'PT409' });
    const siparis = bellekSiparisi(tenantId, asil.siparisId);
    if (!siparis) throw new PublicResourceError('Ödemeler okunamadı.', 503);
    const zaman = new Date().toISOString();
    const odeme = bellekteYaz(
      tenantId,
      {
        ...asil,
        id: randomUUID(),
        tutarAzn: -asil.tutarAzn,
        almaZamani: zaman,
        kaydedenKullaniciId: u.id,
        aciklama: gerekce,
        tersKayitOdemeId: asil.id,
        olusturmaZamani: zaman,
        islemAnahtari: null,
      },
      siparis
    );
    return {
      odeme,
      ozet: (await v2SiparisOdemeleri(tenantId, asil.siparisId))!.ozet,
      tekrar: false,
    };
  }
  const { data, error } = await supabase!.rpc('tomnap_v2_odeme_ters_kayit', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_odeme_id: id,
    p_aciklama: gerekce,
  });
  if (error) rpcHatasi(error);
  return rpcOdemeSonucu(tenantId, data);
}

/** The ledger of one v2 order of the session tenant, oldest first; null if not found. */
export async function v2SiparisOdemeleri(
  tenant: unknown,
  siparisId: unknown
): Promise<V2OdemeDefteri | null> {
  const tenantId = v2Tenant(tenant);
  if (typeof siparisId !== 'string' || !UUID.test(siparisId)) return null;
  const id = siparisId.toLowerCase();
  if (bellekModu(tenantId)) {
    const siparis = bellekSiparisi(tenantId, id);
    if (!siparis) return null;
    return defter(
      id,
      Number(siparis.toplam_tutar),
      bellektekiOdemeler(tenantId).filter((o) => o.siparisId === id)
    );
  }
  const client = supabase!;
  const { data: baslik, error } = await client
    .from('siparisler')
    .select('id,tenant_id,model_surumu,toplam_tutar')
    .eq('tenant_id', tenantId)
    .eq('model_surumu', 2)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new PublicResourceError('Ödemeler okunamadı.', 503);
  if (!baslik) return null;
  const b = kayit(baslik);
  if (b.tenant_id !== tenantId || b.id !== id)
    throw new PublicResourceError('Ödemeler okunamadı.', 503);
  const { data: rows, error: hata } = await client
    .from('odemeler')
    .select(ODEME_KOLONLARI)
    .eq('tenant_id', tenantId)
    .eq('siparis_id', id)
    .order('olusturma_zamani', { ascending: true });
  if (hata || !Array.isArray(rows)) throw new PublicResourceError('Ödemeler okunamadı.', 503);
  const liste: unknown[] = rows;
  const odemeler = liste.map((row) => odemeden(row, tenantId));
  if (odemeler.some((o) => o.siparisId !== id))
    throw new PublicResourceError('Ödemeler okunamadı.', 503);
  return defter(id, Number(b.toplam_tutar), odemeler);
}
