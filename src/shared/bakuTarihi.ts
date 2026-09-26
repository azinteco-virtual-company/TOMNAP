/**
 * Bakü'nün takvim günü, YYYY-AA-GG (Codex R3 F13). Azerbaycan UTC+4'tür, yaz saati
 * uygulamaz; kur tarihi gibi "bugün" gereken her yer bu günü kullanır (istemci ve
 * sunucu aynı yardımcıyla).
 */
const BAKU_GUNU = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baku',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function bakuTarihi(an: Date = new Date()): string {
  return BAKU_GUNU.format(an);
}
