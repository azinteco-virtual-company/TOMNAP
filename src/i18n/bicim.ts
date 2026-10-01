import { VARSAYILAN_SAAT_DILIMI } from '../shared/bakuTarihi';

/**
 * Para, sayı ve tarih biçimleri TEK yerden (docs/i18n.md). Karar (1 Ekim 2026): görünüm bu
 * turda değişmez; her dilde aynı biçim:
 *  - para: nokta ondalık, iki hane, kod sonda: "5.00 AZN", "89.99 CAD";
 *  - tarih: "30.09.2026", tarih-saat: "30.09.2026 12:56"; saat dilimi parametre
 *    (varsayılan Asia/Baku).
 * Dile göre ondalık ayırıcı ve tarih sırası ayrı bir karardır (OPEN_QUESTIONS 40); o gün
 * yalnız bu dosya değişir.
 */
export type ParaBirimi = 'AZN' | 'CAD' | 'USD';

const SAYI = new Map<number, Intl.NumberFormat>();
function sayiBicimi(ondalik: number) {
  let bicim = SAYI.get(ondalik);
  if (!bicim) {
    bicim = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: ondalik,
      maximumFractionDigits: ondalik,
      useGrouping: false,
    });
    SAYI.set(ondalik, bicim);
  }
  return bicim;
}

export function sayi(deger: number, ondalik = 2): string {
  return sayiBicimi(ondalik).format(Number.isFinite(deger) ? deger : 0);
}

export function para(tutar: number, birim: ParaBirimi = 'AZN'): string {
  return `${sayi(tutar, 2)} ${birim}`;
}

const TARIH = new Map<string, Intl.DateTimeFormat>();
function parcalar(an: Date, saatDilimi: string, saatli: boolean) {
  const anahtar = `${saatDilimi}|${saatli}`;
  let bicim = TARIH.get(anahtar);
  if (!bicim) {
    bicim = new Intl.DateTimeFormat('en-GB', {
      timeZone: saatDilimi,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(saatli ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    });
    TARIH.set(anahtar, bicim);
  }
  const p = Object.fromEntries(bicim.formatToParts(an).map((x) => [x.type, x.value]));
  return p as Record<'day' | 'month' | 'year' | 'hour' | 'minute', string>;
}

function gecerliAn(an: Date | string | number): Date | null {
  const d = an instanceof Date ? an : new Date(an);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function tarih(an: Date | string | number, saatDilimi = VARSAYILAN_SAAT_DILIMI): string {
  const d = gecerliAn(an);
  if (!d) return '';
  const p = parcalar(d, saatDilimi, false);
  return `${p.day}.${p.month}.${p.year}`;
}

export function tarihSaat(an: Date | string | number, saatDilimi = VARSAYILAN_SAAT_DILIMI): string {
  const d = gecerliAn(an);
  if (!d) return '';
  const p = parcalar(d, saatDilimi, true);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
