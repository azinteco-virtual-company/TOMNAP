import type { Siparis } from '../../types';

/** Kargo manifestosu filtreleri; davranış sayfadan taşındı, değişmedi. */
export type LojistikFiltreTipi =
  | 'kargo_ve_depo'
  | 'KANADA_DEPO'
  | 'ULUSLARARASI_KARGO'
  | 'BAKU_DAGITIM_ARKADAS'
  | 'TESLIM_EDILDI'
  | 'tumu';
export type FinansFiltreTipi = 'tumu' | 'borclu' | 'odendi';
export type TarihOnAyari = 'hepsi' | 'bugun' | 'son7gun' | 'buay' | 'ozel';

export interface ManifestoFiltresi {
  lojistik: LojistikFiltreTipi;
  finans: FinansFiltreTipi;
  sehir: string;
  arama: string;
  baslangic: string;
  bitis: string;
}

export const VARSAYILAN_FILTRE: ManifestoFiltresi = {
  lojistik: 'kargo_ve_depo',
  finans: 'tumu',
  sehir: 'tumu',
  arama: '',
  baslangic: '',
  bitis: '',
};

export const YOLDAKI_ASAMALAR = ['KANADA_DEPO', 'ULUSLARARASI_KARGO', 'BAKU_DAGITIM_ARKADAS'];

export function filtreAktif(f: ManifestoFiltresi): boolean {
  return (
    f.lojistik !== 'kargo_ve_depo' ||
    f.finans !== 'tumu' ||
    f.sehir !== 'tumu' ||
    !!f.baslangic ||
    !!f.bitis ||
    !!f.arama
  );
}

export function manifestoyuFiltrele(liste: readonly Siparis[], f: ManifestoFiltresi): Siparis[] {
  const aranan = f.arama.trim().toLowerCase();
  return liste.filter((s) => {
    if (f.lojistik === 'kargo_ve_depo') {
      if (!YOLDAKI_ASAMALAR.includes(s.lojistik_durumu)) return false;
    } else if (f.lojistik !== 'tumu' && s.lojistik_durumu !== f.lojistik) return false;

    if (f.finans === 'borclu' && (s.kalan_tutar || 0) <= 0) return false;
    if (f.finans === 'odendi' && (s.kalan_tutar || 0) > 0) return false;

    if (
      f.sehir !== 'tumu' &&
      (s.teslimat_sehri || '').trim().toLowerCase() !== f.sehir.toLowerCase()
    )
      return false;

    if (f.baslangic || f.bitis) {
      const gun = (s.olusturma_tarihi || '').slice(0, 10);
      if (gun) {
        if (f.baslangic && gun < f.baslangic) return false;
        if (f.bitis && gun > f.bitis) return false;
      }
    }

    if (aranan) {
      const metin = [
        s.musteri_adi,
        s.telefon_numarasi,
        s.urun_aciklamasi,
        s.kanada_takip_kodu,
        s.uluslararasi_kargo_kodu,
        s.teslimat_sehri,
        s.teslimat_adresi,
        s.ozel_not,
        s.baku_tahsilat_notu,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!metin.includes(aranan)) return false;
    }
    return true;
  });
}

/** Date range of a quick preset, as the page computed it (ISO days, UTC). */
export function tarihAraligi(onAyar: Exclude<TarihOnAyari, 'ozel'>, simdi = new Date()) {
  const gun = (d: Date) => d.toISOString().slice(0, 10);
  if (onAyar === 'hepsi') return { baslangic: '', bitis: '' };
  if (onAyar === 'bugun') return { baslangic: gun(simdi), bitis: gun(simdi) };
  if (onAyar === 'son7gun') {
    const once = new Date(simdi);
    once.setDate(simdi.getDate() - 7);
    return { baslangic: gun(once), bitis: gun(simdi) };
  }
  return { baslangic: gun(new Date(simdi.getFullYear(), simdi.getMonth(), 1)), bitis: gun(simdi) };
}

export function sehirListesi(liste: readonly Siparis[]): string[] {
  return [...new Set(liste.map((s) => (s.teslimat_sehri || '').trim()).filter(Boolean))].sort();
}
