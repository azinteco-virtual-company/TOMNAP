/**
 * Ödeme defteri ekranının (A10) saf kuralları. Sınırlar sunucudakilerle aynı; son söz
 * RPC'nindir. Ekranlar (OdemeDefteri, V2Kasa) yalnız bunları kullanır.
 */
import { rolGrubunda, type KullaniciRolu } from '../../shared/roller';
import { sayiOku } from './siparisFormu';
import { v2t } from './v2Ceviri';
import { para } from '../../i18n/bicim';

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

const yontem = (id: OdemeYontemi) => ({
  id,
  get ad() {
    return v2t(`odeme.yontem.${id}`);
  },
});
/** Payment methods; the name is read in the interface language (docs/i18n.md). */
export const YONTEMLER: ReadonlyArray<{ id: OdemeYontemi; ad: string }> = [
  yontem('NAKIT'),
  yontem('KART'),
  yontem('HAVALE'),
  yontem('DIGER'),
];
export const kaynakAdi = (kaynak: OdemeKaynagi) => v2t(`odeme.kaynak.${kaynak}`);
export const durumAdi = (durum: OdemeDurumu) => v2t(`odeme.durum.${durum}`);

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
  form: OdemeFormu,
  /** One key per payment intent; a retry sends the same one (Codex R3 F15). */
  islemAnahtari?: string
): { govde: Record<string, unknown>; hatalar: [] } | { govde: null; hatalar: string[] } {
  const hatalar: string[] = [];
  const tutar = sayiOku(form.tutar);
  if (
    !Number.isFinite(tutar) ||
    tutar <= 0 ||
    tutar >= 1_000_000 ||
    Math.round(tutar * 100) / 100 !== tutar
  )
    hatalar.push(v2t('odeme.tutarGecersiz'));
  if (form.aciklama.trim().length > 500) hatalar.push(v2t('odeme.qeydUzun'));
  if (hatalar.length) return { govde: null, hatalar };
  return {
    govde: {
      siparis_id: siparisId,
      tutar_azn: tutar,
      yontem: form.yontem,
      kaynak: form.kaynak,
      ...(form.aciklama.trim() ? { aciklama: form.aciklama.trim() } : {}),
      ...(islemAnahtari ? { islem_anahtari: islemAnahtari } : {}),
    },
    hatalar: [],
  };
}

/** A reversal needs a reason (K16). */
export function tersKayitIstegi(
  gerekce: string
): { govde: { aciklama: string }; hata: null } | { govde: null; hata: string } {
  const temiz = gerekce.trim();
  if (!temiz) return { govde: null, hata: v2t('odeme.sebebYaz') };
  if (temiz.length > 500) return { govde: null, hata: v2t('odeme.sebebUzun') };
  return { govde: { aciklama: temiz }, hata: null };
}

/** Money in AZN from the one formatting helper (docs/i18n.md): "5.00 AZN". */
export const azn = (value: number) => para(value);
