import type { jsPDF } from 'jspdf';
import type autoTableTipi from 'jspdf-autotable';
import type { Siparis } from '../types';
import { para } from '../i18n/bicim';
import { pdfFontuYukle, type FontOkuyucu } from '../i18n/pdfFontu';
import { cleanPdfText } from '../utils/pdfHelpers';
import { lojistikBelgeEtiketi, type ManifestoBaglami, type ManifestoOzeti } from './manifesto';

/**
 * Kargo manifestosu ve çeki listesi PDF'i (A4 yatay). Metinler butiğin belge dilinde; font
 * belge diline göre pdfFontu.ts'den (Noto Sans: ə, ş, ğ, ı ve Kiril olduğu gibi kalır).
 */
export async function manifestoPdfOlustur(
  araclar: { jsPDF: typeof jsPDF; autoTable: typeof autoTableTipi },
  liste: readonly Siparis[],
  ozet: ManifestoOzeti,
  dil: string,
  { bt, butik, bugun }: ManifestoBaglami,
  fontOkuyucu?: FontOkuyucu
): Promise<jsPDF> {
  const doc = new araclar.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const font = await pdfFontuYukle(doc, dil, fontOkuyucu);

  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanPdfText(bt('manifesto.baslik', { butik })), 26, 32);

  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    cleanPdfText(bt('pdf.ozet1', { tarih: bugun, bagla: ozet.bagla, adet: ozet.adet })),
    26,
    47
  );
  doc.text(
    cleanPdfText(bt('pdf.ozet2', { deger: para(ozet.deger), kalan: para(ozet.kalan) })),
    26,
    60
  );

  const sutun = (anahtar: string) => cleanPdfText(bt(`pdf.sutun.${anahtar}`));
  const head = [
    [
      '#',
      sutun('musteri'),
      sutun('sehirUnvan'),
      sutun('mehsul'),
      sutun('say'),
      sutun('deyer'),
      sutun('qaliq'),
      sutun('statusKod'),
      sutun('qeyd'),
    ],
  ];

  const body = liste.map((s, i) => {
    const ozellik = [s.beden_veya_olcu, s.renk].filter(Boolean).join(' - ');
    const kargo = s.uluslararasi_kargo_kodu
      ? `\n${bt('pdf.kod', { kod: s.uluslararasi_kargo_kodu })}`
      : '';
    const notlar = [
      s.ozel_not ?? '',
      s.baku_tahsilat_notu ? bt('pdf.bakiNotu', { not: s.baku_tahsilat_notu }) : '',
    ]
      .filter(Boolean)
      .join('\n');
    const tarihSatiri = s.olusturma_tarihi ? `\n${s.olusturma_tarihi.slice(0, 10)}` : '';
    return [
      String(i + 1),
      cleanPdfText(
        `${s.musteri_adi || bt('ortak.adsiz')}\n${bt('pdf.tel', { tel: s.telefon_numarasi || '-' })}${tarihSatiri}`
      ),
      cleanPdfText(
        `${s.teslimat_sehri || bt('ortak.varsayilanSehir')}\n${s.teslimat_adresi || bt('ortak.varsayilanUnvan')}`
      ),
      cleanPdfText(`${s.urun_aciklamasi || '-'}${ozellik ? `\n(${ozellik})` : ''}`),
      String(s.adet || 1),
      para(s.toplam_tutar || 0),
      s.kalan_tutar > 0
        ? cleanPdfText(bt('pdf.borc', { mebleg: para(s.kalan_tutar) }))
        : cleanPdfText(bt('manifesto.odenilib')),
      cleanPdfText(`${lojistikBelgeEtiketi(s.lojistik_durumu, bt)}${kargo}`),
      cleanPdfText(notlar) || '-',
    ];
  });

  araclar.autoTable(doc, {
    head,
    body,
    startY: 72,
    theme: 'grid',
    styles: {
      font,
      fontSize: 7,
      cellPadding: 3,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 95 },
      2: { cellWidth: 85 },
      3: { cellWidth: 145 },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 55, halign: 'right' },
      6: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 95 },
      8: { cellWidth: 200, overflow: 'linebreak' },
    },
    foot: [
      [
        '',
        cleanPdfText(bt('excel.yekun')),
        '',
        cleanPdfText(bt('ortak.bagla', { count: ozet.bagla })),
        String(ozet.adet),
        para(ozet.deger),
        para(ozet.kalan),
        '',
        cleanPdfText(bt('pdf.resmiSened')),
      ],
    ],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    margin: { left: 26, right: 26, top: 25, bottom: 25 },
    didDrawPage: (veri) => {
      doc.setFont(font, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        cleanPdfText(
          bt('pdf.altBilgi', {
            butik,
            sayfa: veri.pageNumber,
            toplam: doc.getNumberOfPages(),
          })
        ),
        26,
        580
      );
    },
  });
  return doc;
}

export const manifestoPdfDosyaAdi = (bt: ManifestoBaglami['bt']) =>
  `${bt('pdf.dosya')}_${new Date().toISOString().slice(0, 10)}.pdf`;
