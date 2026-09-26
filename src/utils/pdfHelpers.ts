/**
 * PDF Yardımcı Fonksiyonları
 * jsPDF standart fontlarında (Helvetica/Times) bozuk çıkan Unicode (Azerbaycan & Türkçe)
 * karakterleri ve sembolleri temiz, okunaklı Latin karakterlerine dönüştürür.
 * Böylece 'ə' harfi 'Y'ye, 'ş' harfi '_'ye, 'ı' harfi '1'e, '➔' sembolü '"'e dönüşmez.
 */

export function cleanPdfText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return '';
  const str = String(text);

  return (
    str
      // Azerbaycan ve Türkçe Küçük Harfler
      .replace(/ə/g, 'e')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      // Azerbaycan ve Türkçe Büyük Harfler
      .replace(/Ə/g, 'E')
      .replace(/İ/g, 'I')
      .replace(/I/g, 'I')
      .replace(/Ğ/g, 'G')
      .replace(/Ş/g, 'S')
      .replace(/Ç/g, 'C')
      .replace(/Ö/g, 'O')
      .replace(/Ü/g, 'U')
      // Semboller ve Oklar
      .replace(/➔/g, '->')
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/•/g, '-')
      .replace(/✈️/g, '[Kargo]')
      .replace(/✓/g, '[OK]')
      .replace(/✔/g, '[OK]')
      .replace(/📌/g, '')
      .replace(/💬/g, '')
      .replace(/📦/g, '')
      .replace(/💰/g, '')
      // Tipografik tırnak ve tireler
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
  );
}

import type { GuvenliHtml } from './guvenliHtml';

/**
 * Yazdırma yüzeyinde script çalışmaz (Codex R4 F20). Şablonlar dinamik alanları zaten
 * `html` ile kaçışlar; bu ikinci savunma hattıdır: sayfa kendi CSP'siyle yazılır, iframe
 * sandbox'lıdır (script yok, yazdırma var) ve yedek pencerenin uygulamaya bağı kesilir.
 */
const YAZDIRMA_CSP =
  '<meta http-equiv="Content-Security-Policy" content="' +
  "script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; " +
  "base-uri 'none'; form-action 'none'" +
  '">';

function cspEkle(icerik: string): string {
  const head = /<head[^>]*>/i.exec(icerik);
  if (!head) return YAZDIRMA_CSP + icerik;
  const son = head.index + head[0].length;
  return icerik.slice(0, son) + YAZDIRMA_CSP + icerik.slice(son);
}

/**
 * Tarayıcıda güvenli yazdırma (Print) tetikleyici:
 * İframe içinde veya kısıtlı ortamlarda window.print() veya iframe.print()
 * engellendiğinde, hem yeni pencereyi hem iframe yöntemini destekler ve
 * her koşulda kullanıcının yazdırma ekranının açılmasını garanti eder.
 */
export function safePrintHtml(sablon: GuvenliHtml, title: string = 'Cap_Senedi'): void {
  const htmlContent = cspEkle(sablon.metin);
  // Önce görünmez iframe yöntemi dene
  try {
    const iframe = document.createElement('iframe');
    // Scripts never run in the print frame; printing (a modal) and writing into it
    // from this window stay allowed. allow-scripts is deliberately absent.
    iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = '0px';
    iframe.setAttribute('title', title);
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (printErr) {
          console.warn('Iframe print çağrısı başarısız, yeni pencere açılıyor:', printErr);
          openPrintWindowFallback(htmlContent, title);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }
      }, 400);
      return;
    }
  } catch (err) {
    console.warn('Iframe oluşturma hatası, pencere açılıyor:', err);
  }

  // Fallback: Yeni pencere açarak yazdır
  openPrintWindowFallback(htmlContent, title);
}

function openPrintWindowFallback(htmlContent: string, title: string): void {
  try {
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (printWin) {
      // The printed page cannot reach the app even if something slipped through.
      printWin.opener = null;
      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 500);
    } else {
      alert(
        'Brauzer çap pəncərəsinin açılmasına icazə vermədi. Zəhmət olmasa "PDF İndir" düyməsindən istifadə edin və ya pop-up icazəsini aktivləşdirin.'
      );
    }
  } catch (winErr) {
    console.error('Pencere açma hatası:', winErr);
    alert('Çap dialoqu açıla bilmədi. Zəhmət olmasa "PDF İndir" düyməsindən istifadə edin.');
  }
}

/**
 * Kanada Yerel Mağaza & Kargo Takip Kodu Üretici:
 * Format: TOR-MK-9842 veya YVR-ZARA-3140
 */
export function uretKanadaTakipKodu(magazaAdi?: string, sehir: string = 'TOR'): string {
  let prefix = 'TOR';
  if (sehir && sehir.toUpperCase().includes('VAN')) prefix = 'YVR';

  let storeCode = 'CA';
  if (magazaAdi) {
    const clean = magazaAdi.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.includes('ZARA')) storeCode = 'ZARA';
    else if (clean.includes('SEPHORA')) storeCode = 'SEPH';
    else if (clean.includes('KORS') || clean.includes('MICHAEL')) storeCode = 'MK';
    else if (clean.includes('TOMMY')) storeCode = 'TH';
    else if (clean.includes('NIKE')) storeCode = 'NIKE';
    else if (clean.includes('MASSIMO')) storeCode = 'MD';
    else if (clean.length >= 2) storeCode = clean.slice(0, 4);
  }

  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${storeCode}-${randomNum}`;
}

/**
 * Toronto -> Bakü Uluslararası Hava Kargo / Konşimento Kodu Üretici:
 * Format: AZ-CARGO-7749-YYZ veya KNB-8821-GYD
 */
export function uretUluslararasiKargoKodu(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const prefixes = ['AZ-CARGO', 'KNB-AIR', 'GYD-EXP'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${p}-${randomNum}-YYZ`;
}
