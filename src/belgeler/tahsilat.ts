import type { TFunction } from 'i18next';
import type { jsPDF } from 'jspdf';
import type autoTableTipi from 'jspdf-autotable';
import type { Siparis } from '../types';
import { html, type GuvenliHtml } from '../utils/guvenliHtml';
import { cleanPdfText } from '../utils/pdfHelpers';
import { para } from '../i18n/bicim';
import { pdfFontuYukle, type FontOkuyucu } from '../i18n/pdfFontu';
import { yaziYonu } from '../shared/diller';
import { lojistikBelgeEtiketi } from './manifesto';

/**
 * Bakı tahsilat ve qalıq borc hesabatı (docs/i18n.md): yazdırma, PDF, Excel və WhatsApp
 * mətni butikin belge dilində (`bt`, `belge` ad sahəsi). Ekranın özü arayüz dilindədir.
 */
export interface TahsilatBaglami {
  bt: TFunction;
  butik: string;
  bugun: string;
}

const cem = (liste: readonly Siparis[], alan: 'toplam_tutar' | 'alinan_tutar' | 'kalan_tutar') =>
  liste.reduce((t, s) => t + (s[alan] || 0), 0);

export function tahsilatRaporuMetni(liste: readonly Siparis[], { bt, bugun }: TahsilatBaglami) {
  const satirlar = [
    `📋 *${bt('tahsilat.baslik')}*`,
    bt('tahsilat.metin.tarix', { tarih: bugun }),
    bt('tahsilat.metin.toplam', {
      mebleg: para(cem(liste, 'kalan_tutar')),
      count: liste.length,
    }),
    '--------------------------------------',
    '',
  ];
  liste.forEach((s, i) => {
    satirlar.push(
      bt('tahsilat.metin.musteri', {
        sira: i + 1,
        musteri: s.musteri_adi,
        tel: s.telefon_numarasi || bt('ortak.nomreYoxdur'),
      }),
      bt('tahsilat.metin.unvan', {
        sehir: s.teslimat_sehri || bt('ortak.varsayilanSehir'),
        unvan: s.teslimat_adresi || bt('ortak.varsayilanUnvan'),
      }),
      bt('tahsilat.metin.mehsul', { urun: s.urun_aciklamasi, count: s.adet || 1 }),
      bt('tahsilat.metin.qaliq', { mebleg: para(s.kalan_tutar, s.para_birimi || 'AZN') })
    );
    if (s.ozel_not) satirlar.push(bt('tahsilat.metin.ozelNot', { not: s.ozel_not }));
    if (s.baku_tahsilat_notu)
      satirlar.push(bt('tahsilat.metin.bakiNotu', { not: s.baku_tahsilat_notu }));
    satirlar.push('');
  });
  return satirlar.join('\n');
}

export function tahsilatExcelVerisi(liste: readonly Siparis[], { bt }: TahsilatBaglami) {
  const sutunlar = [
    'sira',
    'musteriAdi',
    'telefon',
    'sehir',
    'unvan',
    'mehsul',
    'toplam',
    'odenilen',
    'qaliq',
    'status',
    'bakiNotu',
    'xususiQeyd',
  ] as const;
  const baslik = sutunlar.map((s) => bt(`tahsilat.excel.${s}`));
  const satirlar: Array<Array<string | number>> = liste.map((s, i) => [
    i + 1,
    s.musteri_adi || '',
    s.telefon_numarasi || '',
    s.teslimat_sehri || bt('ortak.varsayilanSehir'),
    s.teslimat_adresi || '',
    s.urun_aciklamasi || '',
    s.toplam_tutar || 0,
    s.alinan_tutar || 0,
    s.kalan_tutar || 0,
    lojistikBelgeEtiketi(s.lojistik_durumu, bt),
    s.baku_tahsilat_notu || '',
    s.ozel_not || '',
  ]);
  const yekun: Array<string | number> = baslik.map(() => '');
  yekun[1] = bt('excel.yekun');
  yekun[5] = bt('tahsilat.musteriSayi', { count: liste.length });
  yekun[6] = cem(liste, 'toplam_tutar');
  yekun[7] = cem(liste, 'alinan_tutar');
  yekun[8] = cem(liste, 'kalan_tutar');
  satirlar.push(yekun);
  return {
    baslik,
    satirlar,
    sayfa: bt('tahsilat.sayfa'),
    dosya: `${bt('tahsilat.dosya')}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

export function tahsilatYazdirmaSablonu(
  liste: readonly Siparis[],
  dil: string,
  { bt, butik, bugun }: TahsilatBaglami
): GuvenliHtml {
  const satirlar = liste.map(
    (s, i) => html`
      <tr>
        <td class="orta">${i + 1}</td>
        <td>
          <strong>${s.musteri_adi || bt('ortak.adsiz')}</strong><br />
          <span class="soluk">${s.telefon_numarasi || '-'}</span>
        </td>
        <td>
          <strong>${s.teslimat_sehri || bt('ortak.varsayilanSehir')}</strong><br />
          <span class="soluk">${s.teslimat_adresi || bt('ortak.varsayilanUnvan')}</span>
        </td>
        <td>${s.urun_aciklamasi || '-'}</td>
        <td class="son kalin">${para(s.toplam_tutar || 0)}</td>
        <td class="son odenib">${para(s.alinan_tutar || 0)}</td>
        <td class="son kalin borc">${para(s.kalan_tutar || 0)}</td>
        <td class="kucuk">
          ${s.baku_tahsilat_notu ? html`<div>💬 ${s.baku_tahsilat_notu}</div>` : ''}
          ${s.ozel_not ? html`<div class="soluk">📌 ${s.ozel_not}</div>` : ''}
        </td>
      </tr>
    `
  );
  return html`
    <!DOCTYPE html>
    <html lang="${dil}" dir="${yaziYonu(dil)}">
      <head>
        <title>${bt('tahsilat.sayfaBasligi', { butik })}</title>
        <style>
          @page {
            size: landscape;
            margin: 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 10px;
            font-size: 11px;
          }
          .ust {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 2px solid #b45309;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .baslik {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            color: #b45309;
            overflow-wrap: anywhere;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th {
            background-color: #78350f;
            color: #ffffff;
            text-align: start;
            padding: 6px;
            font-size: 10px;
            text-transform: uppercase;
          }
          td {
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            padding: 6px;
            overflow-wrap: anywhere;
          }
          tr:nth-child(even) td {
            background-color: #fffbeb;
          }
          .orta {
            text-align: center;
          }
          .son {
            text-align: end;
          }
          .kalin {
            font-weight: bold;
          }
          .soluk {
            color: #64748b;
            font-size: 10px;
          }
          .kucuk {
            font-size: 10px;
          }
          .odenib {
            color: #15803d;
          }
          .borc {
            color: #b45309;
            background: #fef3c7;
          }
          .alt {
            margin-top: 15px;
            padding-top: 8px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 12px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="ust">
          <div>
            <div class="baslik">${bt('tahsilat.baslik')}</div>
            <div>${bt('tahsilat.altBaslik', { butik })}</div>
          </div>
          <div class="son">
            <div><strong>${bt('manifesto.tarix')}</strong> ${bugun}</div>
            <div>${bt('tahsilat.toplamBagla', { count: liste.length })}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="orta" style="width:25px;">#</th>
              <th style="width:130px;">${bt('manifesto.sutun.musteriTel')}</th>
              <th style="width:130px;">${bt('manifesto.sutun.sehirUnvan')}</th>
              <th>${bt('tahsilat.sutun.mehsul')}</th>
              <th class="son" style="width:85px;">${bt('manifesto.sutun.mebleg')}</th>
              <th class="son" style="width:85px;">${bt('tahsilat.sutun.odenilib')}</th>
              <th class="son" style="width:95px;">${bt('manifesto.sutun.qaliq')}</th>
              <th style="width:180px;">${bt('tahsilat.sutun.qeyd')}</th>
            </tr>
          </thead>
          <tbody>
            ${satirlar}
          </tbody>
        </table>
        <div class="alt">
          <div>${bt('tahsilat.aciklama')}</div>
          <div>${bt('tahsilat.toplanacaq', { mebleg: para(cem(liste, 'kalan_tutar')) })}</div>
        </div>
      </body>
    </html>
  `;
}

export async function tahsilatPdfOlustur(
  araclar: { jsPDF: typeof jsPDF; autoTable: typeof autoTableTipi },
  liste: readonly Siparis[],
  dil: string,
  { bt, butik, bugun }: TahsilatBaglami,
  fontOkuyucu?: FontOkuyucu
): Promise<jsPDF> {
  const doc = new araclar.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const font = await pdfFontuYukle(doc, dil, fontOkuyucu);
  doc.setFont(font, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanPdfText(`${butik} — ${bt('tahsilat.baslik')}`), 26, 32);
  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    cleanPdfText(
      bt('tahsilat.pdfOzet', {
        tarih: bugun,
        count: liste.length,
        mebleg: para(cem(liste, 'kalan_tutar')),
      })
    ),
    26,
    48
  );
  const sutun = (anahtar: string) => cleanPdfText(bt(anahtar));
  araclar.autoTable(doc, {
    head: [
      [
        '#',
        sutun('manifesto.sutun.musteriTel'),
        sutun('manifesto.sutun.sehirUnvan'),
        sutun('tahsilat.sutun.mehsul'),
        sutun('manifesto.sutun.mebleg'),
        sutun('tahsilat.sutun.odenilib'),
        sutun('manifesto.sutun.qaliq'),
        sutun('tahsilat.sutun.qeyd'),
      ],
    ],
    body: liste.map((s, i) => [
      String(i + 1),
      cleanPdfText(
        `${s.musteri_adi || bt('ortak.adsiz')}\n${bt('pdf.tel', { tel: s.telefon_numarasi || '-' })}`
      ),
      cleanPdfText(
        `${s.teslimat_sehri || bt('ortak.varsayilanSehir')}\n${s.teslimat_adresi || bt('ortak.varsayilanUnvan')}`
      ),
      cleanPdfText(s.urun_aciklamasi || '-'),
      para(s.toplam_tutar || 0),
      para(s.alinan_tutar || 0),
      s.kalan_tutar > 0
        ? cleanPdfText(bt('pdf.borc', { mebleg: para(s.kalan_tutar) }))
        : cleanPdfText(bt('manifesto.odenilib')),
      cleanPdfText([s.baku_tahsilat_notu, s.ozel_not].filter(Boolean).join('\n') || '-'),
    ]),
    startY: 65,
    theme: 'grid',
    styles: {
      font,
      fontSize: 7.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [180, 83, 9],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [254, 252, 232] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 110 },
      2: { cellWidth: 110 },
      3: { cellWidth: 160 },
      4: { cellWidth: 70, halign: 'right' },
      5: { cellWidth: 70, halign: 'right' },
      6: { cellWidth: 85, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 160, overflow: 'linebreak' },
    },
    foot: [
      [
        '',
        cleanPdfText(bt('excel.yekun')),
        '',
        cleanPdfText(bt('ortak.bagla', { count: liste.length })),
        para(cem(liste, 'toplam_tutar')),
        '',
        para(cem(liste, 'kalan_tutar')),
        cleanPdfText(bt('tahsilat.sened')),
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
  });
  return doc;
}

export const tahsilatPdfDosyaAdi = (bt: TFunction) =>
  `${bt('tahsilat.dosya')}_${new Date().toISOString().slice(0, 10)}.pdf`;
