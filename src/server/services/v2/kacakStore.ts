import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import { demoSiparislerVeritabani, siparislerVeritabani } from '../state';
import { v2Tenant } from './ortak';
import { kuryeBakiyeleri } from './kasaStore';

/**
 * Kaçaklar panosu v0 (A12; spec §9): Q4 teslim edildi ödenmedi, Q5 kuryede bekleyen nakit.
 * Salt okunur; veritabanında iki STABLE RPC, bellekte aynı tanımlar. Tenant filtreli.
 */

export const VARSAYILAN_ESIKLER = { q4Gun: 0, q5Saat: 24 } as const;

export interface Q4Kaydi {
  id: string;
  musteriAdi: string;
  modelSurumu: number;
  toplamTutar: number;
  alinanTutar: number;
  kalanTutar: number;
  teslimTarihi: string | null;
  bakuKuryeAdi: string | null;
  yasGun: number;
}
export interface Q5Kaydi {
  kuryeKullaniciId: string;
  adSoyad: string | null;
  bakiye: number;
  acikTahsilatSayisi: number;
  enEskiTahsilat: string;
  beklemeSaat: number;
}
export interface Kacaklar {
  esikler: { q4Gun: number; q5Saat: number };
  q4: Q4Kaydi[];
  q5: Q5Kaydi[];
}

const KURUS = (value: number) => Math.round(value * 100);
const bellekModu = (tenantId: string) => !supabase || tenantId === 'demo_sandbox';

function esik(value: unknown, varsayilan: number, sinir: number, ad: string): number {
  if (value === undefined) return varsayilan;
  const sayi = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(sayi) || sayi > sinir)
    throw new PublicResourceError(`${ad} 0-${sinir} arası tam sayı olmalı.`, 400);
  return sayi;
}
/** Query thresholds (?q4_gun=&q5_saat=); defaults per spec §9. */
export function kacakEsikleri(query: Record<string, unknown>) {
  return {
    q4Gun: esik(query.q4_gun, VARSAYILAN_ESIKLER.q4Gun, 3650, 'q4_gun'),
    q5Saat: esik(query.q5_saat, VARSAYILAN_ESIKLER.q5Saat, 87600, 'q5_saat'),
  };
}

function kayit(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicResourceError('Kaçaklar okunamadı.', 503);
  return value as Record<string, unknown>;
}
const yaziYaDaNull = (value: unknown) => (typeof value === 'string' ? value : null);

function q4den(value: unknown): Q4Kaydi {
  const r = kayit(value);
  if (typeof r.id !== 'string') throw new PublicResourceError('Kaçaklar okunamadı.', 503);
  return {
    id: r.id,
    musteriAdi: String(r.musteri_adi ?? ''),
    modelSurumu: Number(r.model_surumu ?? 1),
    toplamTutar: Number(r.toplam_tutar),
    alinanTutar: Number(r.alinan_tutar),
    kalanTutar: Number(r.kalan_tutar),
    teslimTarihi: yaziYaDaNull(r.teslim_tarihi),
    bakuKuryeAdi: yaziYaDaNull(r.baku_kurye_adi),
    yasGun: Number(r.yas_gun),
  };
}
function q5ten(value: unknown): Q5Kaydi {
  const r = kayit(value);
  if (typeof r.kurye_kullanici_id !== 'string')
    throw new PublicResourceError('Kaçaklar okunamadı.', 503);
  return {
    kuryeKullaniciId: r.kurye_kullanici_id,
    adSoyad: yaziYaDaNull(r.ad_soyad),
    bakiye: Number(r.bakiye),
    acikTahsilatSayisi: Number(r.acik_tahsilat_sayisi),
    enEskiTahsilat: String(r.en_eski_tahsilat),
    beklemeSaat: Number(r.bekleme_saat),
  };
}

function bellekQ4(tenantId: string, gun: number, simdi: number): Q4Kaydi[] {
  const havuz: Record<string, unknown>[] =
    tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
  return havuz
    .filter((s) => s.tenant_id === tenantId && s.lojistik_durumu === 'TESLIM_EDILDI')
    .map((s) => {
      const toplam = Number(s.toplam_tutar ?? 0);
      const alinan = Number(s.alinan_tutar ?? 0);
      const zaman = Date.parse(
        String(s.teslim_tarihi ?? s.guncellenme_tarihi ?? s.olusturma_tarihi ?? '')
      );
      return { s, toplam, alinan, zaman };
    })
    .filter(
      ({ toplam, alinan, zaman }) =>
        KURUS(toplam) > KURUS(alinan) && Number.isFinite(zaman) && zaman <= simdi - gun * 86_400_000
    )
    .sort((a, b) => a.zaman - b.zaman)
    .slice(0, 500)
    .map(({ s, toplam, alinan, zaman }) => ({
      id: String(s.id),
      musteriAdi: String(s.musteri_adi ?? ''),
      modelSurumu: Number(s.model_surumu ?? 1),
      toplamTutar: toplam,
      alinanTutar: alinan,
      kalanTutar: (KURUS(toplam) - KURUS(alinan)) / 100,
      teslimTarihi: yaziYaDaNull(s.teslim_tarihi),
      bakuKuryeAdi: yaziYaDaNull(s.baku_kurye_adi),
      yasGun: Math.floor((simdi - zaman) / 86_400_000),
    }));
}

async function bellekQ5(tenantId: string, saat: number, simdi: number): Promise<Q5Kaydi[]> {
  return (await kuryeBakiyeleri(tenantId))
    .map((b) => ({
      b,
      enEski: Math.min(...b.acikTahsilatlar.map((o) => Date.parse(o.almaZamani))),
    }))
    .filter(({ b, enEski }) => b.bakiye > 0 && enEski <= simdi - saat * 3_600_000)
    .sort((x, y) => x.enEski - y.enEski)
    .map(({ b, enEski }) => ({
      kuryeKullaniciId: b.kuryeKullaniciId,
      adSoyad: b.adSoyad,
      bakiye: b.bakiye,
      acikTahsilatSayisi: b.acikTahsilatlar.length,
      enEskiTahsilat: new Date(enEski).toISOString(),
      beklemeSaat: Math.floor((simdi - enEski) / 3_600_000),
    }));
}

/** Q4 and Q5 for the session tenant. */
export async function kacaklariOku(
  tenant: unknown,
  esikler: { q4Gun: number; q5Saat: number } = VARSAYILAN_ESIKLER
): Promise<Kacaklar> {
  const tenantId = v2Tenant(tenant);
  if (bellekModu(tenantId)) {
    const simdi = Date.now();
    return {
      esikler,
      q4: bellekQ4(tenantId, esikler.q4Gun, simdi),
      q5: await bellekQ5(tenantId, esikler.q5Saat, simdi),
    };
  }
  const client = supabase!;
  const [q4, q5] = await Promise.all([
    client.rpc('tomnap_v2_kacak_q4', { p_tenant_id: tenantId, p_min_gun: esikler.q4Gun }),
    client.rpc('tomnap_v2_kacak_q5', { p_tenant_id: tenantId, p_min_saat: esikler.q5Saat }),
  ]);
  if (q4.error || q5.error || !Array.isArray(q4.data) || !Array.isArray(q5.data))
    throw new PublicResourceError('Kaçaklar okunamadı.', 503);
  const q4Rows: unknown[] = q4.data;
  const q5Rows: unknown[] = q5.data;
  return { esikler, q4: q4Rows.map(q4den), q5: q5Rows.map(q5ten) };
}
