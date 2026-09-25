/**
 * Ödeme defteri ekranının (A10) saf kuralları. Sınırlar sunucudakilerle aynı; son söz
 * RPC'nindir. Ekranlar (OdemeDefteri, V2Kasa) yalnız bunları kullanır.
 */
import { rolGrubunda, type KullaniciRolu } from '../../shared/roller';
import { sayiOku } from './siparisFormu';

export type OdemeYontemi = 'NAKIT' | 'KART' | 'HAVALE' | 'DIGER';
export type OdemeKaynagi = 'TESLIMAT' | 'BUTIK' | 'ONLINE';
export type OdemeDurumu = 'ODENMEDI' | 'KISMI' | 'TAM' | 'FAZLA';

export interface DefterSatiri {
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
  tersKaydiVar: boolean;
}
/** GET /api/v2/siparisler/:id/odemeler */
export interface OdemeDefteriYaniti {
  ozet: {
    siparisId: string;
    toplamTutar: number;
    odenenTutar: number;
    kalanTutar: number;
    durum: OdemeDurumu;
  };
  odemeler: DefterSatiri[];
}

export const YONTEMLER: ReadonlyArray<{ id: OdemeYontemi; ad: string }> = [
  { id: 'NAKIT', ad: 'Nağd' },
  { id: 'KART', ad: 'Kart' },
  { id: 'HAVALE', ad: 'Köçürmə' },
  { id: 'DIGER', ad: 'Digər' },
];
export const KAYNAK_ADI: Record<OdemeKaynagi, string> = {
  TESLIMAT: 'Çatdırılma',
  BUTIK: 'Butik',
  ONLINE: 'Onlayn',
};
export const DURUM_ADI: Record<OdemeDurumu, string> = {
  ODENMEDI: 'Ödənməyib',
  KISMI: 'Qismən',
  TAM: 'Tam',
  FAZLA: 'Artıq ödənib',
};

/** Who may record and reverse payments (PAYMENT_WRITE; SUPER_ADMIN only reads). */
export const odemeYazabilir = (rol: KullaniciRolu | null) => rolGrubunda(rol, 'PAYMENT_WRITE');

/** Sources a role may record here; TESLIMAT comes only from the courier flow. */
export function kaynakSecenekleri(rol: KullaniciRolu | null): Array<'BUTIK' | 'ONLINE'> {
  if (!odemeYazabilir(rol)) return [];
  return rol === 'SATIS_SORUMLUSU' ? ['BUTIK'] : ['BUTIK', 'ONLINE'];
}

/** Whether a row can be reversed by this user (the server checks again). */
export function tersKayitYapilabilir(
  rol: KullaniciRolu | null,
  kullaniciId: string | null,
  satir: DefterSatiri
): boolean {
  if (!odemeYazabilir(rol) || satir.tutarAzn <= 0 || satir.tersKaydiVar || satir.kasaTeslimId)
    return false;
  if (rol === 'SATIS_SORUMLUSU')
    return satir.kaynak === 'BUTIK' && satir.kaydedenKullaniciId === kullaniciId;
  return true;
}

export interface OdemeFormu {
  tutar: string;
  yontem: OdemeYontemi;
  kaynak: 'BUTIK' | 'ONLINE';
  aciklama: string;
}
export const bosOdemeFormu = (kaynak: 'BUTIK' | 'ONLINE' = 'BUTIK'): OdemeFormu => ({
  tutar: '',
  yontem: 'NAKIT',
  kaynak,
  aciklama: '',
});

/** Validates the form and builds the POST /api/v2/odemeler body. */
export function odemeIstegi(
  siparisId: string,
  form: OdemeFormu
): { govde: Record<string, unknown>; hatalar: [] } | { govde: null; hatalar: string[] } {
  const hatalar: string[] = [];
  const tutar = sayiOku(form.tutar);
  if (
    !Number.isFinite(tutar) ||
    tutar <= 0 ||
    tutar >= 1_000_000 ||
    Math.round(tutar * 100) / 100 !== tutar
  )
    hatalar.push('Məbləğ 0-1.000.000 AZN, ən çox 2 onluq olmalıdır.');
  if (form.aciklama.trim().length > 500) hatalar.push('Qeyd ən çox 500 simvol ola bilər.');
  if (hatalar.length) return { govde: null, hatalar };
  return {
    govde: {
      siparis_id: siparisId,
      tutar_azn: tutar,
      yontem: form.yontem,
      kaynak: form.kaynak,
      ...(form.aciklama.trim() ? { aciklama: form.aciklama.trim() } : {}),
    },
    hatalar: [],
  };
}

/** A reversal needs a reason (K16). */
export function tersKayitIstegi(
  gerekce: string
): { govde: { aciklama: string }; hata: null } | { govde: null; hata: string } {
  const temiz = gerekce.trim();
  if (!temiz) return { govde: null, hata: 'Geri qaytarmanın səbəbini yazın.' };
  if (temiz.length > 500) return { govde: null, hata: 'Səbəb ən çox 500 simvol ola bilər.' };
  return { govde: { aciklama: temiz }, hata: null };
}

export const azn = (value: number) => `${value.toFixed(2)} AZN`;
