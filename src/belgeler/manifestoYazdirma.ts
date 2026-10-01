import type { Siparis } from '../types';
import { html, type GuvenliHtml } from '../utils/guvenliHtml';
import { para } from '../i18n/bicim';
import { yaziYonu } from '../shared/diller';
import { lojistikBelgeEtiketi, type ManifestoBaglami, type ManifestoOzeti } from './manifesto';

/**
 * Yazdırılan manifesto ve paket etiketleri (Codex R4 F20: her alan `html` ile kaçışlanır;
 * docs/i18n.md: metinler butiğin belge dilinde). `dil` belgenin dilidir: <html lang/dir>.
 */
const ozellik = (s: Siparis) => [s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ');

export function manifestoYazdirmaSablonu(
  liste: readonly Siparis[],
  ozet: ManifestoOzeti,
  dil: string,
  { bt, butik, bugun }: ManifestoBaglami
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
          <span class="soluk">${s.teslimat_adresi || bt('ortak.varsayilanSehir')}</span>
        </td>
        <td>${s.urun_aciklamasi || '-'}<br /><small class="soluk">${ozellik(s)}</small></td>
        <td class="orta kalin">${s.adet || 1}</td>
        <td class="son kalin">${para(s.toplam_tutar || 0, s.para_birimi || 'AZN')}</td>
        <td class="son ${s.kalan_tutar > 0 ? 'borc' : 'odenib'}">
          ${
            s.kalan_tutar > 0
              ? html`${para(s.kalan_tutar)}<br /><small>${bt('manifesto.alinacaq')}</small>`
              : bt('manifesto.odenilib')
          }
        </td>
        <td>
          <span class="rozet">${lojistikBelgeEtiketi(s.lojistik_durumu, bt)}</span>
          ${
            s.uluslararasi_kargo_kodu
              ? html`<br /><code class="kod">${s.uluslararasi_kargo_kodu}</code>`
              : ''
          }
        </td>
        <td class="kucuk">
          ${s.ozel_not ? html`<div>📌 ${s.ozel_not}</div>` : ''}
          ${s.baku_tahsilat_notu ? html`<div class="not">💬 ${s.baku_tahsilat_notu}</div>` : ''}
        </td>
      </tr>
    `
  );

  return html`
    <!DOCTYPE html>
    <html lang="${dil}" dir="${yaziYonu(dil)}">
      <head>
        <title>${bt('manifesto.sayfaBasligi', { butik })}</title>
        <style>
          @page {
            size: landscape;
            margin: 12mm;
          }
          body {
            font-family:
              -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 10px;
            font-size: 11px;
          }
          .ust {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .baslik {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: -0.5px;
            overflow-wrap: anywhere;
          }
          .meta {
            font-size: 11px;
            color: #475569;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th {
            background-color: #0f172a;
            color: #ffffff;
            text-align: start;
            padding: 6px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          td {
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            padding: 6px;
            overflow-wrap: anywhere;
          }
          tr:nth-child(even) td {
            background-color: #f8fafc;
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
          .borc {
            color: #b45309;
            font-weight: bold;
          }
          .odenib {
            color: #15803d;
          }
          .rozet {
            font-size: 10px;
            background: #f1f5f9;
            padding: 2px 4px;
            border-radius: 3px;
          }
          .kod {
            font-size: 10px;
            color: #1d4ed8;
          }
          .not {
            color: #92400e;
          }
          .alt {
            margin-top: 15px;
            padding-top: 8px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="ust">
          <div>
            <div class="baslik">${bt('manifesto.baslik', { butik })}</div>
            <div class="meta">${bt('manifesto.marsrut')}</div>
          </div>
          <div class="son">
            <div><strong>${bt('manifesto.tarix')}</strong> ${bugun}</div>
            <div class="meta">
              ${bt('manifesto.toplamPaket', { bagla: ozet.bagla, adet: ozet.adet })}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="orta" style="width:25px;">#</th>
              <th style="width:130px;">${bt('manifesto.sutun.musteriTel')}</th>
              <th style="width:120px;">${bt('manifesto.sutun.sehirUnvan')}</th>
              <th>${bt('manifesto.sutun.mehsul')}</th>
              <th class="orta" style="width:40px;">${bt('manifesto.sutun.say')}</th>
              <th class="son" style="width:85px;">${bt('manifesto.sutun.mebleg')}</th>
              <th class="son" style="width:95px;">${bt('manifesto.sutun.qaliq')}</th>
              <th style="width:120px;">${bt('manifesto.sutun.statusKod')}</th>
              <th style="width:150px;">${bt('manifesto.sutun.qeyd')}</th>
            </tr>
          </thead>
          <tbody>
            ${satirlar}
          </tbody>
        </table>
        <div class="alt">
          <div>${bt('manifesto.beyanname')}</div>
          <div>
            <span>${bt('manifesto.toplam', { mebleg: para(ozet.deger) })}</span> |
            <span class="borc"
              >${bt('manifesto.bakidaAlinacaq', { mebleg: para(ozet.kalan) })}</span
            >
          </div>
        </div>
      </body>
    </html>
  `;
}

export function paketEtiketleriSablonu(
  liste: readonly Siparis[],
  dil: string,
  { bt, butik }: ManifestoBaglami
): GuvenliHtml {
  const kartlar = liste.map(
    (s, i) => html`
      <div class="stiker">
        <div class="stiker-ust">
          <div class="logo">✈️ ${butik}</div>
          <div class="yon">${bt('etiket.yon')}</div>
        </div>
        <div class="barkod">
          <div class="cizgiler">||| | |||| | || |||| ||| || ||||</div>
          <div class="takip">
            ${s.uluslararasi_kargo_kodu || ['KNB', String(i + 1).padStart(4, '0')].join('-')}
          </div>
        </div>
        <div class="alici">
          <div>
            <span class="et">${bt('etiket.alici')}</span>
            <strong class="ad">${s.musteri_adi}</strong>
          </div>
          <div>
            <span class="et">${bt('etiket.fin')}</span>
            <span class="vurgu">${s.kanada_gumruk_fin_kodu || bt('etiket.qeydEdilmeyib')}</span>
          </div>
          <div><span class="et">${bt('etiket.tel')}</span> ${s.telefon_numarasi || '—'}</div>
          <div>
            <span class="et">${bt('etiket.sehirUnvan')}</span>
            ${s.teslimat_sehri || bt('ortak.varsayilanSehir')},
            ${s.teslimat_adresi || bt('etiket.merkeziTehvil')}
          </div>
        </div>
        <div class="operasyon">
          <div class="kurye">
            <span class="et">${bt('etiket.kurye')}</span>
            <div class="kurye-adi">🛵 ${s.baku_kurye_adi || bt('ortak.bolgeMerkezi')}</div>
          </div>
          <div class="tahsilat ${s.kalan_tutar > 0 ? 'borclu' : 'odendi'}">
            <span class="et">${bt('etiket.tehvilde')}</span>
            <div class="mebleg">
              ${
                s.kalan_tutar > 0
                  ? bt('etiket.borc', { mebleg: para(s.kalan_tutar) })
                  : bt('etiket.tamOdenilib')
              }
            </div>
          </div>
        </div>
        <div class="mehsul">
          <div>
            <strong>${bt('etiket.mehsul')}</strong> ${s.urun_aciklamasi}
            (${bt('ortak.eded', { count: s.adet || 1 })}) ${ozellik(s)}
          </div>
          ${s.ozel_not ? html`<div class="not">${bt('etiket.not')} ${s.ozel_not}</div>` : ''}
        </div>
      </div>
    `
  );

  return html`
    <!DOCTYPE html>
    <html lang="${dil}" dir="${yaziYonu(dil)}">
      <head>
        <title>${bt('etiket.sayfaBasligi', { butik })}</title>
        <style>
          @page {
            size: portrait;
            margin: 8mm;
          }
          body {
            font-family:
              -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #0f172a;
          }
          .izgara {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .stiker {
            border: 2px solid #0f172a;
            border-radius: 8px;
            padding: 10px;
            page-break-inside: avoid;
            background: #fff;
            box-sizing: border-box;
            overflow-wrap: anywhere;
          }
          .stiker-ust {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .logo {
            font-weight: 900;
            font-size: 11px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .yon {
            font-weight: bold;
            font-size: 9px;
            color: #1e3a8a;
          }
          .barkod {
            text-align: center;
            border-bottom: 1px dashed #cbd5e1;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .cizgiler {
            font-family: monospace;
            font-size: 14px;
            letter-spacing: 2px;
            font-weight: bold;
          }
          .takip {
            font-family: monospace;
            font-size: 11px;
            font-weight: 800;
          }
          .alici {
            font-size: 10px;
            line-height: 1.4;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .alici > div {
            margin-bottom: 2px;
          }
          .ad {
            font-size: 12px;
          }
          .et {
            font-size: 8.5px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }
          .vurgu {
            font-family: monospace;
            font-weight: bold;
            background: #fef08a;
            padding: 1px 4px;
            border-radius: 3px;
          }
          .operasyon {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .kurye {
            flex: 1;
            font-size: 9.5px;
          }
          .kurye-adi {
            font-weight: 800;
            color: #1e293b;
            margin-top: 1px;
          }
          .tahsilat {
            padding: 4px 6px;
            border-radius: 4px;
            text-align: end;
            min-width: 100px;
          }
          .tahsilat.borclu {
            background: #fef2f2;
            border: 1px solid #f87171;
          }
          .tahsilat.odendi {
            background: #f0fdf4;
            border: 1px solid #4ade80;
          }
          .mebleg {
            font-weight: 900;
            font-size: 11px;
          }
          .borclu .mebleg {
            color: #b91c1c;
          }
          .odendi .mebleg {
            color: #15803d;
          }
          .mehsul {
            font-size: 9px;
            color: #334155;
            line-height: 1.3;
          }
          .not {
            color: #d97706;
            font-style: italic;
            margin-top: 2px;
          }
        </style>
      </head>
      <body>
        <div class="izgara">${kartlar}</div>
      </body>
    </html>
  `;
}
