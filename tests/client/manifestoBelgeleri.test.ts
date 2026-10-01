import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import i18n from '../../src/i18n';
import type { Siparis } from '../../src/types';
import {
  kuryeMetni,
  manifestoExcelVerisi,
  manifestoOzeti,
  type ManifestoBaglami,
} from '../../src/belgeler/manifesto';
import {
  manifestoYazdirmaSablonu,
  paketEtiketleriSablonu,
} from '../../src/belgeler/manifestoYazdirma';
import { manifestoPdfOlustur } from '../../src/belgeler/manifestoPdf';
import {
  tahsilatExcelVerisi,
  tahsilatPdfOlustur,
  tahsilatRaporuMetni,
  tahsilatYazdirmaSablonu,
} from '../../src/belgeler/tahsilat';
import { cleanPdfText } from '../../src/utils/pdfHelpers';
import type { FontOkuyucu } from '../../src/i18n/pdfFontu';
import { dilHazirla } from '../helpers/i18n';

// Printed and exported documents use the boutique's document language, never the
// interface language (decision 1 October 2026); PDFs keep Azerbaijani letters (Noto Sans).
const siparis = (ek: Partial<Siparis> = {}): Siparis => ({
  id: 'order-1',
  olusturma_tarihi: '2026-09-30T08:56:35.000Z',
  ham_mesaj: '',
  musteri_adi: 'Əli Məmmədov',
  telefon_numarasi: '+994500000001',
  teslimat_sehri: 'Bakı',
  teslimat_adresi: 'Nərimanov, Ə. Əliyev küç. 5',
  urun_aciklamasi: 'Dəri çanta',
  adet: 2,
  toplam_tutar: 120,
  alinan_tutar: 50,
  kalan_tutar: 70,
  para_birimi: 'AZN',
  finans_durumu: 'KISMI_ODEME',
  lojistik_durumu: 'ULUSLARARASI_KARGO',
  eksik_bilgiler: [],
  siparis_kaynagi: 'WHATSAPP',
  uluslararasi_kargo_kodu: 'AZ-CARGO-1',
  ...ek,
});
const liste = [siparis(), siparis({ id: 'order-2', kalan_tutar: 0, alinan_tutar: 120 })];
const ozet = manifestoOzeti(liste);
const baglam = (dil: string): ManifestoBaglami => ({
  bt: i18n.getFixedT(dil, 'belge'),
  butik: 'TOMNAP Demo Boutique',
  bugun: '01.10.2026',
});
const fontOkuyucu: FontOkuyucu = async (_aile, agirlik) => {
  const yol =
    agirlik === 'bold'
      ? 'node_modules/@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'
      : 'node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf';
  const veri = fs.readFileSync(yol);
  return veri.buffer.slice(veri.byteOffset, veri.byteOffset + veri.byteLength);
};

beforeAll(async () => {
  await dilHazirla('az', ['belge']);
  await dilHazirla('en', ['belge']);
  // The interface is English for the rest of the file.
  await i18n.changeLanguage('en');
});

describe('document language (decision 1 October 2026)', () => {
  it('prints the manifest in the boutique language while the interface is English', () => {
    expect(i18n.language).toBe('en');
    const az = manifestoYazdirmaSablonu(liste, ozet, 'az', baglam('az')).metin;
    expect(az).toContain('<html lang="az" dir="ltr">');
    expect(az).toContain('TOMNAP Demo Boutique — Kanada ➔ Bakı kargo manifesti');
    expect(az).toContain('ALINACAQ');
    expect(az).toContain('Uçuşda / kargo');
    expect(az).not.toMatch(/Canada|TO COLLECT|In flight/);

    const en = manifestoYazdirmaSablonu(liste, ozet, 'en', baglam('en')).metin;
    expect(en).toContain('TOMNAP Demo Boutique — Canada ➔ Baku cargo manifest');
    expect(en).toContain('TO COLLECT');
  });

  it('labels, the courier text and the spreadsheet follow the document language too', () => {
    const etiket = paketEtiketleriSablonu(liste, 'az', baglam('az')).metin;
    expect(etiket).toContain('KANADA ➔ BAKI / AZƏRBAYCAN');
    expect(etiket).toContain('70.00 AZN (ALINACAQ)');
    expect(etiket).toContain('TAM ÖDƏNİLİB');

    const metin = kuryeMetni(liste, ozet, baglam('az'));
    expect(metin).toContain('📦 Cəmi bağlama: 2 ədəd (4 ədəd məhsul)');
    expect(metin).toContain('⚠️ *ALINACAQ BORC: 70.00 AZN*');

    const excel = manifestoExcelVerisi(liste, ozet, baglam('az'));
    expect(excel.baslik.slice(0, 3)).toEqual(['Sıra', 'Müştəri adı', 'Əlaqə nömrəsi']);
    expect(excel.satirlar.at(-1)?.[1]).toBe('YEKUN CƏMİ:');
    expect(excel.sayfa).toBe('Kargo manifesti');
    expect(manifestoExcelVerisi(liste, ozet, baglam('en')).baslik[1]).toBe('Customer name');
  });

  it('escapes order text in the templates (Codex R4 F20 still holds)', () => {
    const kotu = siparis({ musteri_adi: '<img src=x onerror=alert(1)>' });
    const sayfa = manifestoYazdirmaSablonu([kotu], manifestoOzeti([kotu]), 'az', baglam('az'));
    expect(sayfa.metin).not.toContain('<img');
    expect(sayfa.metin).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('PDF keeps Azerbaijani letters (Noto Sans)', () => {
  it('no longer turns ə into e; only symbols missing from the font are simplified', () => {
    expect(cleanPdfText('Bakı Əli Şəki ğ ç ö ü İ')).toBe('Bakı Əli Şəki ğ ç ö ü İ');
    expect(cleanPdfText('Kanada ➔ Bakı ✈️ 📌')).toBe('Kanada -> Bakı');
  });

  it('writes "Bakı" and "Ə" with a Unicode font, in the document language, and maps them back', async () => {
    // The interface is English; the boutique's document language is az.
    expect(i18n.language).toBe('en');
    const yazilan: string[] = [];
    const doc = await manifestoPdfOlustur(
      {
        jsPDF: class extends jsPDF {
          constructor(...a: ConstructorParameters<typeof jsPDF>) {
            super(...a);
            const ozgun = this.text.bind(this);
            this.text = ((metin: string | string[], ...geri: unknown[]) => {
              yazilan.push(...(Array.isArray(metin) ? metin : [metin]));
              return (ozgun as (...x: unknown[]) => jsPDF)(metin, ...geri);
            }) as jsPDF['text'];
          }
        } as typeof jsPDF,
        autoTable,
      },
      liste,
      ozet,
      'az',
      baglam('az'),
      fontOkuyucu
    );
    const hepsi = yazilan.join('\n');
    expect(hepsi).toContain('Kanada -> Bakı kargo manifesti');
    expect(hepsi).toContain('Əli Məmmədov');
    expect(hepsi).not.toContain('Baki ');
    expect(doc.getFont().fontName).toBe('NotoSans');
    // The PDF's ToUnicode map carries the letters: copy and search work in the PDF.
    const pdf = doc.output();
    for (const kod of ['018f', '0259', '0131', '015f'])
      expect([kod, pdf.toLowerCase().includes(`<${kod}>`)]).toEqual([kod, true]);
  });
});

describe('Baku collection report (tahsilat listesi)', () => {
  it('prints and exports in the document language with the Unicode font', async () => {
    expect(i18n.language).toBe('en');
    const borclu = liste.filter((s) => s.kalan_tutar > 0);
    const sayfa = tahsilatYazdirmaSablonu(borclu, 'az', baglam('az')).metin;
    expect(sayfa).toContain('<html lang="az" dir="ltr">');
    expect(sayfa).toContain('Bakı tahsilat və qalıq borc hesabatı');
    expect(sayfa).toContain('Toplanacaq cəmi borc: 70.00 AZN');
    expect(tahsilatRaporuMetni(borclu, baglam('az'))).toContain('🔴 *ALINACAQ QALIQ: 70.00 AZN*');
    expect(tahsilatExcelVerisi(borclu, baglam('en')).baslik[2]).toBe('Contact phone');

    const yazilan: string[] = [];
    const doc = await tahsilatPdfOlustur(
      {
        jsPDF: class extends jsPDF {
          constructor(...a: ConstructorParameters<typeof jsPDF>) {
            super(...a);
            const ozgun = this.text.bind(this);
            this.text = ((metin: string | string[], ...geri: unknown[]) => {
              yazilan.push(...(Array.isArray(metin) ? metin : [metin]));
              return (ozgun as (...x: unknown[]) => jsPDF)(metin, ...geri);
            }) as jsPDF['text'];
          }
        } as typeof jsPDF,
        autoTable,
      },
      borclu,
      'az',
      baglam('az'),
      fontOkuyucu
    );
    expect(yazilan.join('\n')).toContain('Bakı tahsilat və qalıq borc hesabatı');
    expect(yazilan.join('\n')).toContain('Əli Məmmədov');
    expect(doc.output().toLowerCase()).toContain('<018f>');
  });
});
