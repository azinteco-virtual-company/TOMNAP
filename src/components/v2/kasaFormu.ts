/**
 * Kurye nakdi ve kasa teslimi ekranlarının (A11) saf kuralları. Son söz RPC'lerindir.
 */
import { sayiOku } from './siparisFormu';

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
export interface KuryeSiparisi {
  id: string;
  musteriAdi: string;
  lojistikDurumu: string;
  toplamTutar: number;
  kalanTutar: number;
}

/** Sum of the selected open collections, in cents (the hand-over amount). */
export function seciliToplam(acik: readonly AcikTahsilat[], secili: ReadonlySet<string>): number {
  return (
    acik
      .filter((o) => secili.has(o.id))
      .reduce((kurus, o) => kurus + Math.round(o.tutarAzn * 100), 0) / 100
  );
}

/** POST /api/v2/kasa/teslimler body; null when nothing is selected. */
export function teslimIstegi(
  kurye: KuryeBakiyesi,
  secili: ReadonlySet<string>
): { kurye_kullanici_id: string; odeme_idleri: string[]; tutar_azn: number } | null {
  const ids = kurye.acikTahsilatlar.filter((o) => secili.has(o.id)).map((o) => o.id);
  if (!ids.length) return null;
  return {
    kurye_kullanici_id: kurye.kuryeKullaniciId,
    odeme_idleri: ids,
    tutar_azn: seciliToplam(kurye.acikTahsilatlar, secili),
  };
}

/** POST /api/v2/kurye/tahsilat body: more than 0, at most the amount due. */
export function kuryeTahsilatIstegi(
  siparis: KuryeSiparisi,
  tutar: string,
  /** One key per collection intent; a retry sends the same one (Codex R3 F15). */
  islemAnahtari?: string
):
  | { govde: { siparis_id: string; tutar_azn: number; islem_anahtari?: string }; hata: null }
  | { govde: null; hata: string } {
  const deger = sayiOku(tutar);
  if (!Number.isFinite(deger) || deger <= 0 || Math.round(deger * 100) / 100 !== deger)
    return { govde: null, hata: 'Məbləğ 0-dan böyük, ən çox 2 onluq olmalıdır.' };
  if (Math.round(deger * 100) > Math.round(siparis.kalanTutar * 100))
    return { govde: null, hata: `Ən çox ${siparis.kalanTutar.toFixed(2)} AZN yazıla bilər.` };
  return {
    govde: {
      siparis_id: siparis.id,
      tutar_azn: deger,
      ...(islemAnahtari ? { islem_anahtari: islemAnahtari } : {}),
    },
    hata: null,
  };
}
