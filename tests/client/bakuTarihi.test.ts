import { describe, expect, it } from 'vitest';
import { bakuTarihi } from '../../src/shared/bakuTarihi';
import { kurGirdisiniDogrula } from '../../src/server/services/v2/kurlar';

// Codex R3 F13: the rates screen took "today" from the UTC date. Baku is UTC+4 (no
// daylight saving), so from 00:00 to 04:00 in Baku the form offered yesterday, and the
// server's day of slack accepted a Baku date that had not started yet.
const kur = (tarih: string) => ({ para_birimi: 'CAD', tarih, azn_karsiligi: 1.25 });

describe("Baku's calendar day for rates (Codex R3 F13)", () => {
  it('is the Baku date, not the UTC date', () => {
    expect(bakuTarihi(new Date('2026-09-25T21:30:00Z'))).toBe('2026-09-26');
    expect(bakuTarihi(new Date('2026-09-25T19:59:59Z'))).toBe('2026-09-25');
    expect(bakuTarihi(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
    expect(bakuTarihi(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-29');
  });

  it('the server accepts rates up to today in Baku and no later', () => {
    const lateEvening = new Date('2026-09-25T21:30:00Z'); // 01:30 on the 26th in Baku
    expect(kurGirdisiniDogrula(kur('2026-09-26'), lateEvening).tarih).toBe('2026-09-26');
    expect(() => kurGirdisiniDogrula(kur('2026-09-27'), lateEvening)).toThrow();
    const noon = new Date('2026-09-25T08:00:00Z'); // 12:00 on the 25th in Baku
    expect(kurGirdisiniDogrula(kur('2026-09-25'), noon).tarih).toBe('2026-09-25');
    expect(() => kurGirdisiniDogrula(kur('2026-09-26'), noon)).toThrow();
  });
});
