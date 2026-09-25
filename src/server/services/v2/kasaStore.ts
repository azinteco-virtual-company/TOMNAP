import { randomUUID } from 'node:crypto';
import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import {
  demoSiparislerVeritabani,
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../state';
import { localCourierForUser } from '../couriers';
import { rolGrubunda } from '../../../shared/roller';
import { v2GovdesiniAyikla, v2Tenant } from './ortak';
import {
  bellekteKasayaKapat,
  bellekteKuryeTahsilatiYaz,
  bellektekiOdemeler,
  v2SiparisOdemeleri,
} from './odemeStore';

/**
 * Kurye nakdi ve kasa teslimi (A11; K17). Kuryenin nakit tahsilatı önce onun zimmetine
 * yazılır (odemeler: TESLIMAT, NAKIT, alan = kurye); kasa teslimi seçilen açık
 * tahsilatları tam tutarıyla kapatır. Veritabanında RPC'ler; bellek deposu aynı kurallar.
 *   bakiye = Σ nakit tahsilat − Σ kasa teslimi = Σ açık tahsilat
 */

export interface AcikTahsilat {
  id: string;
  siparisId: string;
  tutarAzn: number;
  almaZamani: string;
  musteriAdi: string | null;
}
export interface KuryeBakiyesi {
  kuryeKullaniciId: string;
  adSoyad: string | null;
  tahsilatToplami: number;
  teslimToplami: number;
  bakiye: number;
  acikTahsilatlar: AcikTahsilat[];
}
export interface KuryeNakitDurumu {
  bakiye: number;
  acikTahsilatlar: AcikTahsilat[];
  siparisler: Array<{
    id: string;
    musteriAdi: string;
    lojistikDurumu: string;
    toplamTutar: number;
    kalanTutar: number;
  }>;
}
export interface KasaTeslimi {
  id: string;
  kuryeKullaniciId: string;
  teslimAlanKullaniciId: string;
  tutarAzn: number;
  odemeSayisi: number;
  aciklama: string | null;
  zaman: string;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const KURUS = (value: number) => Math.round(value * 100);
const bellekModu = (tenantId: string) => !supabase || tenantId === 'demo_sandbox';
const havuz = (tenantId: string): Record<string, unknown>[] =>
  tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
const kasaBellegi: Array<KasaTeslimi & { tenantId: string }> = [];

function tutarOku(value: unknown, sinir: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value >= sinir ||
    KURUS(value) / 100 !== value
  )
    throw new PublicResourceError('Tutar 0’dan büyük, en fazla 2 ondalık olmalı.', 400);
  return value;
}

/** POST /api/v2/kurye/tahsilat body. */
export function kuryeTahsilatGirdisi(body: unknown) {
  const alanlar = v2GovdesiniAyikla(body, ['siparis_id', 'tutar_azn'] as const);
  if (typeof alanlar.siparis_id !== 'string' || !UUID.test(alanlar.siparis_id))
    throw new PublicResourceError('Geçerli bir sipariş seçilmelidir.', 400);
  return {
    siparisId: alanlar.siparis_id.toLowerCase(),
    tutarAzn: tutarOku(alanlar.tutar_azn, 1_000_000),
  };
}

/** POST /api/v2/kasa/teslimler body. */
export function kasaTeslimGirdisi(body: unknown) {
  const alanlar = v2GovdesiniAyikla(body, [
    'kurye_kullanici_id',
    'odeme_idleri',
    'tutar_azn',
    'aciklama',
  ] as const);
  const kurye = alanlar.kurye_kullanici_id;
  if (typeof kurye !== 'string' || !/^[A-Za-z0-9_:.@-]{1,100}$/.test(kurye))
    throw new PublicResourceError('Kurye seçilmelidir.', 400);
  const ids = alanlar.odeme_idleri;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 5000 ||
    ids.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
    new Set(ids.map((id) => String(id).toLowerCase())).size !== ids.length
  )
    throw new PublicResourceError('Teslim edilecek tahsilatlar seçilmelidir.', 400);
  let aciklama: string | null = null;
  if (alanlar.aciklama !== undefined && alanlar.aciklama !== null) {
    if (typeof alanlar.aciklama !== 'string' || alanlar.aciklama.trim().length > 500)
      throw new PublicResourceError('Açıklama en fazla 500 karakter.', 400);
    aciklama = alanlar.aciklama.trim() || null;
  }
  return {
    kuryeKullaniciId: kurye,
    odemeIdleri: ids.map((id) => String(id).toLowerCase()),
    tutarAzn: tutarOku(alanlar.tutar_azn, 10_000_000),
    aciklama,
  };
}

function rpcHatasi(error: { code?: string } | null): never {
  const code = error?.code ?? '';
  if (code === 'PT403') throw new PublicResourceError('Bu kasa işlemi için yetkiniz yok.', 403);
  if (code === 'PT404') throw new PublicResourceError('Sipariş ya da kurye bulunamadı.', 404);
  if (code === 'PT409' || code === '23505')
    throw new PublicResourceError(
      'Kayıt değişti: sipariş teslimatta değil ya da tahsilat artık açık değil. Listeyi yenileyin.',
      409
    );
  if (['22023', '22003', '22P02', '23514', '23502'].includes(code))
    throw new PublicResourceError('Kasa verisi geçersiz.', 400);
  throw new PublicResourceError('Kasa işlemi tamamlanamadı.', 503);
}

// ---------------------------------------------------------------------------
// Row mapping (database JSON and memory share the field names).

function kayit(value: unknown, mesaj = 'Kasa verisi okunamadı.'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicResourceError(mesaj, 503);
  return value as Record<string, unknown>;
}
function acikTahsilattan(value: unknown): AcikTahsilat {
  const r = kayit(value);
  const tutar = Number(r.tutar_azn);
  if (typeof r.id !== 'string' || typeof r.siparis_id !== 'string' || !Number.isFinite(tutar))
    throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  return {
    id: r.id,
    siparisId: r.siparis_id,
    tutarAzn: tutar,
    almaZamani: String(r.alma_zamani),
    musteriAdi: typeof r.musteri_adi === 'string' ? r.musteri_adi : null,
  };
}
function bakiyeden(value: unknown): KuryeBakiyesi {
  const r = kayit(value);
  const tahsilat = Number(r.tahsilat_toplami);
  const teslim = Number(r.teslim_toplami);
  if (
    typeof r.kurye_kullanici_id !== 'string' ||
    !Number.isFinite(tahsilat) ||
    !Number.isFinite(teslim)
  )
    throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  const acik = Array.isArray(r.acik_tahsilatlar) ? r.acik_tahsilatlar.map(acikTahsilattan) : [];
  return {
    kuryeKullaniciId: r.kurye_kullanici_id,
    adSoyad: typeof r.ad_soyad === 'string' ? r.ad_soyad : null,
    tahsilatToplami: tahsilat,
    teslimToplami: teslim,
    bakiye: (KURUS(tahsilat) - KURUS(teslim)) / 100,
    acikTahsilatlar: acik,
  };
}
function teslimden(value: unknown, tenantId: string): KasaTeslimi {
  const r = kayit(value);
  const tutar = Number(r.tutar_azn);
  if (
    r.tenant_id !== tenantId ||
    typeof r.id !== 'string' ||
    typeof r.kurye_kullanici_id !== 'string' ||
    typeof r.teslim_alan_kullanici_id !== 'string' ||
    !Number.isFinite(tutar)
  )
    throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  return {
    id: r.id,
    kuryeKullaniciId: r.kurye_kullanici_id,
    teslimAlanKullaniciId: r.teslim_alan_kullanici_id,
    tutarAzn: tutar,
    odemeSayisi: Number(r.odeme_sayisi),
    aciklama: typeof r.aciklama === 'string' ? r.aciklama : null,
    zaman: String(r.zaman),
  };
}

// ---------------------------------------------------------------------------
// Development/demo store.

function bellekBakiyeleri(tenantId: string, kurye: string | null): KuryeBakiyesi[] {
  const nakit = bellektekiOdemeler(tenantId).filter(
    (o) =>
      o.kaynak === 'TESLIMAT' && o.yontem === 'NAKIT' && (!kurye || o.alanKullaniciId === kurye)
  );
  const tersler = new Set(nakit.map((o) => o.tersKayitOdemeId).filter(Boolean));
  const teslimler = kasaBellegi.filter(
    (k) => k.tenantId === tenantId && (!kurye || k.kuryeKullaniciId === kurye)
  );
  const kuryeler = [
    ...new Set([
      ...nakit.map((o) => o.alanKullaniciId),
      ...teslimler.map((k) => k.kuryeKullaniciId),
    ]),
  ].sort();
  return kuryeler.map((id) => {
    const tahsilat = nakit
      .filter((o) => o.alanKullaniciId === id)
      .reduce((k, o) => k + KURUS(o.tutarAzn), 0);
    const teslim = teslimler
      .filter((k) => k.kuryeKullaniciId === id)
      .reduce((k, t) => k + KURUS(t.tutarAzn), 0);
    return {
      kuryeKullaniciId: id,
      adSoyad:
        kullanicilarVeritabani.find((u) => u.id === id && u.tenant_id === tenantId)?.ad_soyad ??
        null,
      tahsilatToplami: tahsilat / 100,
      teslimToplami: teslim / 100,
      bakiye: (tahsilat - teslim) / 100,
      acikTahsilatlar: nakit
        .filter(
          (o) =>
            o.alanKullaniciId === id &&
            o.tutarAzn > 0 &&
            o.kasaTeslimId === null &&
            !tersler.has(o.id)
        )
        .map((o) => ({
          id: o.id,
          siparisId: o.siparisId,
          tutarAzn: o.tutarAzn,
          almaZamani: o.almaZamani,
          musteriAdi:
            String(havuz(tenantId).find((s) => s.id === o.siparisId)?.musteri_adi ?? '') || null,
        })),
    };
  });
}
function aktifFirma(tenantId: string) {
  const firma = firmalarVeritabani.find((f) => f.id === tenantId);
  return !!firma && (!firma.onayDurumu || firma.onayDurumu === 'AKTIF');
}
function bellekKuryesi(tenantId: string, userId: string) {
  const u = kullanicilarVeritabani.find(
    (k) =>
      k.id === userId && k.tenant_id === tenantId && k.rol === 'BAKU_KURYE' && k.durum === 'AKTIF'
  );
  if (!u || !aktifFirma(tenantId))
    throw new PublicResourceError('Bu kasa işlemi için yetkiniz yok.', 403);
  return localCourierForUser(tenantId, userId);
}
const teslimatta = (s: Record<string, unknown>, userId: string) =>
  s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS' ||
  (s.lojistik_durumu === 'TESLIM_EDILDI' && s.kurye_teslim_kullanici_id === userId);
const kalan = (s: Record<string, unknown>) =>
  (KURUS(Number(s.toplam_tutar)) - KURUS(Number(s.alinan_tutar ?? 0))) / 100;

// ---------------------------------------------------------------------------
// Public operations.

/** A courier records cash taken for a v2 order assigned to it. */
export async function kuryeTahsilatiKaydet(
  tenant: unknown,
  userId: string,
  girdi: ReturnType<typeof kuryeTahsilatGirdisi>
) {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (bellekModu(tenantId)) {
    const kurye = bellekKuryesi(tenantId, userId);
    if (!kurye) throw new PublicResourceError('Bu kasa işlemi için yetkiniz yok.', 403);
    const s = havuz(tenantId).find((r) => r.id === girdi.siparisId && r.tenant_id === tenantId);
    if (!s) rpcHatasi({ code: 'PT404' });
    if (s.baku_kurye_id !== kurye.id) rpcHatasi({ code: 'PT403' });
    if (Number(s.model_surumu) !== 2 || !teslimatta(s, userId)) rpcHatasi({ code: 'PT409' });
    if (KURUS(girdi.tutarAzn) > KURUS(kalan(s))) rpcHatasi({ code: '22023' });
    const odeme = bellekteKuryeTahsilatiYaz(tenantId, s, userId, girdi.tutarAzn);
    return { odeme, ozet: (await v2SiparisOdemeleri(tenantId, girdi.siparisId))!.ozet };
  }
  const { data, error } = await supabase!.rpc('tomnap_v2_kurye_tahsilati', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_siparis_id: girdi.siparisId,
    p_tutar: girdi.tutarAzn,
  });
  if (error) rpcHatasi(error);
  const odeme = kayit(kayit(data).odeme);
  if (odeme.tenant_id !== tenantId || odeme.siparis_id !== girdi.siparisId)
    throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  const defter = await v2SiparisOdemeleri(tenantId, girdi.siparisId);
  if (!defter) throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  return { odeme: defter.odemeler.find((o) => o.id === odeme.id) ?? null, ozet: defter.ozet };
}

/** The courier's own view: balance, open collections and orders it may collect for. */
export async function kuryeNakitDurumu(tenant: unknown, userId: string): Promise<KuryeNakitDurumu> {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (bellekModu(tenantId)) {
    const kurye = bellekKuryesi(tenantId, userId);
    const [bakiye] = bellekBakiyeleri(tenantId, userId);
    return {
      bakiye: bakiye?.bakiye ?? 0,
      acikTahsilatlar: bakiye?.acikTahsilatlar ?? [],
      siparisler: kurye
        ? havuz(tenantId)
            .filter(
              (s) =>
                s.tenant_id === tenantId &&
                s.baku_kurye_id === kurye.id &&
                Number(s.model_surumu) === 2 &&
                teslimatta(s, userId) &&
                kalan(s) > 0
            )
            .map((s) => ({
              id: String(s.id),
              musteriAdi: String(s.musteri_adi ?? ''),
              lojistikDurumu: String(s.lojistik_durumu),
              toplamTutar: Number(s.toplam_tutar),
              kalanTutar: kalan(s),
            }))
        : [],
    };
  }
  const { data, error } = await supabase!.rpc('tomnap_v2_kurye_nakit_durumu', {
    p_tenant_id: tenantId,
    p_user_id: userId,
  });
  if (error) rpcHatasi(error);
  const r = kayit(data);
  const siparisler = Array.isArray(r.siparisler) ? r.siparisler : [];
  return {
    bakiye: Number(r.bakiye) || 0,
    acikTahsilatlar: Array.isArray(r.acik_tahsilatlar)
      ? r.acik_tahsilatlar.map(acikTahsilattan)
      : [],
    siparisler: siparisler.map((value) => {
      const s = kayit(value);
      if (typeof s.id !== 'string') throw new PublicResourceError('Kasa verisi okunamadı.', 503);
      return {
        id: s.id,
        musteriAdi: String(s.musteri_adi ?? ''),
        lojistikDurumu: String(s.lojistik_durumu),
        toplamTutar: Number(s.toplam_tutar),
        kalanTutar: Number(s.kalan_tutar),
      };
    }),
  };
}

/** Every courier's cash balance in the session tenant (cash desk). */
export async function kuryeBakiyeleri(tenant: unknown): Promise<KuryeBakiyesi[]> {
  const tenantId = v2Tenant(tenant);
  if (bellekModu(tenantId)) return bellekBakiyeleri(tenantId, null);
  const { data, error } = await supabase!.rpc('tomnap_v2_kurye_bakiyeleri', {
    p_tenant_id: tenantId,
  });
  if (error) rpcHatasi(error);
  if (!Array.isArray(data)) throw new PublicResourceError('Kasa verisi okunamadı.', 503);
  const rows: unknown[] = data;
  return rows.map(bakiyeden);
}

/** The cash desk takes over the selected open collections of one courier. */
export async function kasaTeslimAl(
  tenant: unknown,
  userId: string,
  girdi: ReturnType<typeof kasaTeslimGirdisi>
): Promise<{ teslim: KasaTeslimi; bakiye: KuryeBakiyesi | null }> {
  const tenantId = v2Tenant(tenant);
  if (!userId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (bellekModu(tenantId)) {
    const alan = kullanicilarVeritabani.find(
      (k) =>
        k.id === userId &&
        k.durum === 'AKTIF' &&
        rolGrubunda(k.rol, 'KASA_WRITE') &&
        k.tenant_id === tenantId
    );
    if (!alan || !aktifFirma(tenantId)) rpcHatasi({ code: 'PT403' });
    if (
      !kullanicilarVeritabani.some(
        (k) => k.id === girdi.kuryeKullaniciId && k.tenant_id === tenantId && k.rol === 'BAKU_KURYE'
      )
    )
      rpcHatasi({ code: 'PT404' });
    const teslim: KasaTeslimi & { tenantId: string } = {
      id: randomUUID(),
      tenantId,
      kuryeKullaniciId: girdi.kuryeKullaniciId,
      teslimAlanKullaniciId: alan.id,
      tutarAzn: girdi.tutarAzn,
      odemeSayisi: girdi.odemeIdleri.length,
      aciklama: girdi.aciklama,
      zaman: new Date().toISOString(),
    };
    if (
      !bellekteKasayaKapat(
        tenantId,
        girdi.kuryeKullaniciId,
        girdi.odemeIdleri,
        girdi.tutarAzn,
        teslim.id
      )
    )
      rpcHatasi({ code: 'PT409' });
    kasaBellegi.push(teslim);
    const { tenantId: _tenant, ...sonuc } = teslim;
    return { teslim: sonuc, bakiye: bellekBakiyeleri(tenantId, girdi.kuryeKullaniciId)[0] ?? null };
  }
  const { data, error } = await supabase!.rpc('tomnap_v2_kasa_teslimi', {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_kurye_kullanici_id: girdi.kuryeKullaniciId,
    p_odeme_idleri: girdi.odemeIdleri,
    p_tutar: girdi.tutarAzn,
    p_aciklama: girdi.aciklama,
  });
  if (error) rpcHatasi(error);
  const r = kayit(data);
  return { teslim: teslimden(r.teslim, tenantId), bakiye: r.bakiye ? bakiyeden(r.bakiye) : null };
}
