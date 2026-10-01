import type { TFunction } from 'i18next';
import type { Siparis } from '../types';
import { para, tarih } from '../i18n/bicim';

/**
 * Kargo manifestosunun belgeleri (docs/i18n.md): metinler `belge` ad alanından, butiğin
 * belge dilinde (`bt`); arayüz dili belgeyi değiştirmez. Yazdırma şablonları
 * manifestoYazdirma.ts'de, PDF manifestoPdf.ts'de.
 */
export interface ManifestoOzeti {
  bagla: number;
  adet: number;
  deger: number;
  kalan: number;
}
export interface ManifestoBaglami {
  bt: TFunction;
  butik: string;
  bugun: string;
}

export function manifestoOzeti(liste: readonly Siparis[]): ManifestoOzeti {
  return {
    bagla: liste.length,
    adet: liste.reduce((t, s) => t + (s.adet || 1), 0),
    deger: liste.reduce((t, s) => t + (s.toplam_tutar || 0), 0),
    kalan: liste.reduce((t, s) => t + (s.kalan_tutar || 0), 0),
  };
}

export const bugununTarihi = () => tarih(new Date());

export function lojistikBelgeEtiketi(durum: string, bt: TFunction): string {
  return bt(`durum.${durum}`, { defaultValue: durum.replace(/_/g, ' ') });
}

const ozellik = (s: Siparis, ayrac: string) =>
  [s.beden_veya_olcu, s.renk].filter(Boolean).join(ayrac);

/** The spreadsheet: header row, one row per parcel and a total row. */
export function manifestoExcelVerisi(
  liste: readonly Siparis[],
  ozet: ManifestoOzeti,
  { bt }: ManifestoBaglami
) {
  const sutunlar = [
    'sira',
    'musteriAdi',
    'telefon',
    'sehir',
    'unvan',
    'mehsul',
    'olcuReng',
    'say',
    'mebleg',
    'odenilen',
    'qaliq',
    'fin',
    'kurye',
    'status',
    'kanadaKodu',
    'kargoKodu',
    'xususiQeyd',
    'bakiNotu',
  ] as const;
  const baslik = sutunlar.map((s) => bt(`excel.sutun.${s}`));
  const satirlar: Array<Array<string | number>> = liste.map((s, i) => [
    i + 1,
    s.musteri_adi || '',
    s.telefon_numarasi || '',
    s.teslimat_sehri || bt('ortak.varsayilanSehir'),
    s.teslimat_adresi || '',
    s.urun_aciklamasi || '',
    ozellik(s, ' / '),
    s.adet || 1,
    s.toplam_tutar || 0,
    s.alinan_tutar || 0,
    s.kalan_tutar || 0,
    s.kanada_gumruk_fin_kodu || '—',
    s.baku_kurye_adi || bt('ortak.bolgeMerkezi'),
    lojistikBelgeEtiketi(s.lojistik_durumu, bt),
    s.kanada_takip_kodu || '',
    s.uluslararasi_kargo_kodu || '',
    s.ozel_not || '',
    s.baku_tahsilat_notu || '',
  ]);
  const yekun: Array<string | number> = baslik.map(() => '');
  yekun[1] = bt('excel.yekun');
  yekun[5] = bt('ortak.bagla', { count: ozet.bagla });
  yekun[7] = ozet.adet;
  yekun[8] = ozet.deger;
  yekun[9] = ozet.deger - ozet.kalan;
  yekun[10] = ozet.kalan;
  satirlar.push(yekun);
  return {
    baslik,
    satirlar,
    sayfa: bt('excel.sayfa'),
    dosya: `${bt('excel.dosya')}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

/** The courier/distributor message for WhatsApp. */
export function kuryeMetni(
  liste: readonly Siparis[],
  ozet: ManifestoOzeti,
  { bt, butik, bugun }: ManifestoBaglami
): string {
  const satirlar = [
    `✈️ *${bt('manifesto.baslik', { butik })}*`,
    bt('kurye.tarix', { tarih: bugun }),
    bt('kurye.toplamBagla', { bagla: ozet.bagla, adet: ozet.adet }),
    bt('kurye.toplamDeger', { mebleg: para(ozet.deger) }),
    bt('kurye.bakidaBorc', { mebleg: para(ozet.kalan) }),
    '',
    '------------------------------------',
  ];
  liste.forEach((s, i) => {
    satirlar.push(
      bt('kurye.musteri', {
        sira: i + 1,
        musteri: s.musteri_adi,
        tel: s.telefon_numarasi || bt('ortak.nomreYoxdur'),
      }),
      bt('kurye.sehir', {
        sehir: s.teslimat_sehri || bt('ortak.varsayilanSehir'),
        unvan: s.teslimat_adresi || bt('ortak.varsayilanUnvan'),
      }),
      bt('kurye.mehsul', { urun: s.urun_aciklamasi, count: s.adet || 1 })
    );
    if (s.beden_veya_olcu || s.renk)
      satirlar.push(bt('kurye.ozellik', { ozellik: ozellik(s, ' • ') }));
    satirlar.push(
      s.kalan_tutar > 0
        ? bt('kurye.borc', { mebleg: para(s.kalan_tutar, s.para_birimi) })
        : bt('kurye.odenib')
    );
    if (s.kanada_gumruk_fin_kodu) satirlar.push(bt('kurye.fin', { fin: s.kanada_gumruk_fin_kodu }));
    if (s.baku_kurye_adi) satirlar.push(bt('kurye.kurye', { kurye: s.baku_kurye_adi }));
    if (s.uluslararasi_kargo_kodu)
      satirlar.push(bt('kurye.kargo', { kod: s.uluslararasi_kargo_kodu }));
    if (s.baku_tahsilat_notu) satirlar.push(bt('kurye.not', { not: s.baku_tahsilat_notu }));
    satirlar.push('');
  });
  return satirlar.join('\n') + '\n';
}
