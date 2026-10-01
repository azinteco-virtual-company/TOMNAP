/**
 * Bakü'nün takvim günü, YYYY-AA-GG (Codex R3 F13). Azerbaycan UTC+4'tür, yaz saati
 * uygulamaz; kur tarihi gibi "bugün" gereken her yer bu günü kullanır (istemci ve
 * sunucu aynı yardımcıyla). Saat dilimi parametredir (docs/i18n.md: başka bir ülkedeki
 * butik için); varsayılan Asia/Baku, davranış değişmedi.
 */
export const VARSAYILAN_SAAT_DILIMI = 'Asia/Baku';

const bicimler = new Map<string, Intl.DateTimeFormat>();
function gunBicimi(saatDilimi: string) {
  let bicim = bicimler.get(saatDilimi);
  if (!bicim) {
    bicim = new Intl.DateTimeFormat('en-CA', {
      timeZone: saatDilimi,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    bicimler.set(saatDilimi, bicim);
  }
  return bicim;
}

export function bakuTarihi(an: Date = new Date(), saatDilimi = VARSAYILAN_SAAT_DILIMI): string {
  return gunBicimi(saatDilimi).format(an);
}
