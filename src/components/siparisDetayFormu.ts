import type { Siparis } from '../types';

/**
 * Sipariş detay formu (SiparisDetayModal) — Codex R3 F14.
 * Form yalnız kullanıcının değiştirdiği alanları gönderir: değişmeyen bir alan (boş bile
 * olsa) o alanı yazma yetkisi olmayan rolü 403'e düşürmez ve başkasının arada yaptığı
 * değişikliği ezmez. Gümrük alanları sunucudaki adlarla gider (kanada_gumruk_*).
 */
export interface DetayFormu {
  kanadaTakip: string;
  kargoKodu: string;
  tahsilatNotu: string;
  ozelNot: string;
  magazaAdi: string;
  alisFiyatiCad: string;
  faturaGorseli: string;
  finKodu: string;
  pasaportNo: string;
}

/** Faturanın satır içi görsel sınırı: base64 ile istek 4,5 MB'ı aşmasın. */
export const FATURA_GORSELI_AZAMI_BAYT = 3 * 1024 * 1024;

export function detayFormuBaslangici(siparis: Siparis): DetayFormu {
  return {
    kanadaTakip: siparis.kanada_takip_kodu || '',
    kargoKodu: siparis.uluslararasi_kargo_kodu || '',
    tahsilatNotu: siparis.baku_tahsilat_notu || '',
    ozelNot: siparis.ozel_not || '',
    magazaAdi: siparis.kanada_magaza_adi || '',
    alisFiyatiCad: siparis.kanada_alis_fiyati_cad?.toString() || '',
    faturaGorseli: siparis.kanada_fatura_gorseli || '',
    finKodu: siparis.kanada_gumruk_fin_kodu || '',
    pasaportNo: siparis.kanada_gumruk_pasaport_no || '',
  };
}

const METIN_ALANLARI = [
  ['kanadaTakip', 'kanada_takip_kodu'],
  ['kargoKodu', 'uluslararasi_kargo_kodu'],
  ['tahsilatNotu', 'baku_tahsilat_notu'],
  ['ozelNot', 'ozel_not'],
  ['magazaAdi', 'kanada_magaza_adi'],
  ['faturaGorseli', 'kanada_fatura_gorseli'],
  ['finKodu', 'kanada_gumruk_fin_kodu'],
  ['pasaportNo', 'kanada_gumruk_pasaport_no'],
] as const satisfies ReadonlyArray<readonly [keyof DetayFormu, keyof Siparis]>;

export type DetayFormuSonucu =
  | { degisiklikler: Partial<Siparis>; hata?: undefined }
  | { hata: string; degisiklikler?: undefined };

/** Formun siparişe göre değişen alanları; geçersiz alış fiyatında hata. */
export function detayFormuDegisiklikleri(siparis: Siparis, form: DetayFormu): DetayFormuSonucu {
  const once = detayFormuBaslangici(siparis);
  const degisiklikler: Partial<Record<keyof Siparis, unknown>> = {};
  for (const [alan, kolon] of METIN_ALANLARI)
    if (form[alan] !== once[alan]) degisiklikler[kolon] = form[alan];

  const fiyat = form.alisFiyatiCad.trim().replace(',', '.');
  if (fiyat !== once.alisFiyatiCad) {
    if (fiyat === '') {
      if (siparis.kanada_alis_fiyati_cad != null) degisiklikler.kanada_alis_fiyati_cad = null;
    } else {
      const sayi = Number(fiyat);
      if (!Number.isFinite(sayi) || sayi < 0)
        return { hata: 'Alış fiyatı (CAD) geçerli bir sayı olmalı.' };
      if (sayi !== siparis.kanada_alis_fiyati_cad) degisiklikler.kanada_alis_fiyati_cad = sayi;
    }
  }
  return { degisiklikler: degisiklikler as Partial<Siparis> };
}
