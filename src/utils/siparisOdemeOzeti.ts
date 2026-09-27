/**
 * Sipariş kartı ve tablo için tek ödeme özeti (Codex R4 T1): toplam, alınan ve kalan,
 * siparişin para biriminde. Bakü tahsilat alanları ayrı bir kasa görünümüdür; "ödendi"
 * kararını vermez. Kalan yoksa toplam − alınan; eksiye düşmez.
 */
export interface OdemeOzetiGirdisi {
  toplam_tutar?: number | null;
  alinan_tutar?: number | null;
  kalan_tutar?: number | null;
  para_birimi?: string | null;
}
export interface OdemeOzeti {
  toplam: number;
  odenen: number;
  kalan: number;
  paraBirimi: string;
  tamOdendi: boolean;
}

const sayi = (deger: unknown) => {
  const n = Number(deger ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function odemeOzeti(siparis: OdemeOzetiGirdisi & Record<string, unknown>): OdemeOzeti {
  const toplam = sayi(siparis.toplam_tutar);
  const odenen = sayi(siparis.alinan_tutar);
  const kalanHam =
    siparis.kalan_tutar === undefined || siparis.kalan_tutar === null
      ? toplam - odenen
      : sayi(siparis.kalan_tutar);
  const kalan = Math.max(0, Math.round(kalanHam * 100) / 100);
  return {
    toplam,
    odenen,
    kalan,
    paraBirimi: siparis.para_birimi || 'AZN',
    tamOdendi: toplam > 0 && kalan <= 0,
  };
}
