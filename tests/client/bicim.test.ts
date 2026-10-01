import { describe, expect, it } from 'vitest';
import { para, sayi, tarih, tarihSaat } from '../../src/i18n/bicim';

// One helper for money, numbers and dates (docs/i18n.md). Decision 1 October 2026: the
// look does not change in this round, whatever the interface language.
describe('money and numbers', () => {
  it("keeps today's look: two decimals with a point, the code after the number", () => {
    expect(para(5)).toBe('5.00 AZN');
    expect(para(89.99, 'CAD')).toBe('89.99 CAD');
    expect(para(1234.5, 'USD')).toBe('1234.50 USD');
    expect(para(-3)).toBe('-3.00 AZN');
    expect(para(0.005)).toBe('0.01 AZN');
  });
  it('never prints NaN or Infinity', () => {
    expect(sayi(Number.NaN)).toBe('0.00');
    expect(sayi(Number.POSITIVE_INFINITY, 0)).toBe('0');
    expect(sayi(2.5, 1)).toBe('2.5');
  });
});

describe('dates', () => {
  it('prints the Baku day by default, another zone when asked', () => {
    const an = '2026-09-30T21:30:00Z'; // 01:30 on 1 October in Baku
    expect(tarih(an)).toBe('01.10.2026');
    expect(tarih(an, 'America/Toronto')).toBe('30.09.2026');
    expect(tarihSaat('2026-09-30T08:56:35Z')).toBe('30.09.2026 12:56');
    expect(tarihSaat(an, 'UTC')).toBe('30.09.2026 21:30');
  });
  it('prints nothing for an invalid date', () => {
    expect(tarih('not a date')).toBe('');
    expect(tarihSaat(Number.NaN)).toBe('');
  });
});
