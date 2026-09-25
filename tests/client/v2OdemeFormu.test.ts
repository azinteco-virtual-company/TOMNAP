import { describe, expect, it } from 'vitest';
import {
  kaynakSecenekleri,
  odemeIstegi,
  odemeYazabilir,
  tersKayitIstegi,
  tersKayitYapilabilir,
  type DefterSatiri,
} from '../../src/components/v2/odemeFormu';

const satir = (extra: Partial<DefterSatiri> = {}): DefterSatiri => ({
  id: 'p-1',
  siparisId: 's-1',
  tutarAzn: 30,
  yontem: 'NAKIT',
  kaynak: 'BUTIK',
  alanKullaniciId: 'u-sales',
  almaZamani: '2026-09-25T10:00:00Z',
  kaydedenKullaniciId: 'u-sales',
  aciklama: null,
  tersKayitOdemeId: null,
  kasaTeslimId: null,
  tersKaydiVar: false,
  ...extra,
});

describe('v2 payment ledger form (A10)', () => {
  it('offers recording only to the FINANCE roles, sales only in the boutique', () => {
    expect(
      [
        'PATRON',
        'SUPER_ADMIN',
        'BAKU_FINANS',
        'SATIS_SORUMLUSU',
        'KANADA_SATINALMA',
        'BAKU_KURYE',
        null,
      ].map((rol) => [rol, odemeYazabilir(rol as never), kaynakSecenekleri(rol as never)])
    ).toEqual([
      ['PATRON', true, ['BUTIK', 'ONLINE']],
      ['SUPER_ADMIN', true, ['BUTIK', 'ONLINE']],
      ['BAKU_FINANS', true, ['BUTIK', 'ONLINE']],
      ['SATIS_SORUMLUSU', true, ['BUTIK']],
      ['KANADA_SATINALMA', false, []],
      ['BAKU_KURYE', false, []],
      [null, false, []],
    ]);
  });

  it('builds the body the server accepts and lists problems first', () => {
    expect(
      odemeIstegi('s-1', { tutar: '12,5', yontem: 'KART', kaynak: 'ONLINE', aciklama: ' not ' })
    ).toEqual({
      govde: {
        siparis_id: 's-1',
        tutar_azn: 12.5,
        yontem: 'KART',
        kaynak: 'ONLINE',
        aciklama: 'not',
      },
      hatalar: [],
    });
    for (const tutar of ['', '0', '-1', '1,005', 'abc', '1000000'])
      expect(
        odemeIstegi('s-1', { tutar, yontem: 'NAKIT', kaynak: 'BUTIK', aciklama: '' }).hatalar
      ).toEqual(['Məbləğ 0-1.000.000 AZN, ən çox 2 onluq olmalıdır.']);
  });

  it('allows a reversal only once, never of a reversal, and sales only their own boutique rows', () => {
    expect(tersKayitYapilabilir('BAKU_FINANS', 'u-fin', satir())).toBe(true);
    expect(tersKayitYapilabilir('BAKU_FINANS', 'u-fin', satir({ tersKaydiVar: true }))).toBe(false);
    expect(
      tersKayitYapilabilir('PATRON', 'u-p', satir({ tutarAzn: -30, tersKayitOdemeId: 'p-0' }))
    ).toBe(false);
    expect(tersKayitYapilabilir('PATRON', 'u-p', satir({ kasaTeslimId: 'k-1' }))).toBe(false);
    expect(tersKayitYapilabilir('SATIS_SORUMLUSU', 'u-sales', satir())).toBe(true);
    expect(tersKayitYapilabilir('SATIS_SORUMLUSU', 'u-other', satir())).toBe(false);
    expect(tersKayitYapilabilir('SATIS_SORUMLUSU', 'u-sales', satir({ kaynak: 'ONLINE' }))).toBe(
      false
    );
    expect(tersKayitYapilabilir('KANADA_SATINALMA', 'u-k', satir())).toBe(false);
    expect(tersKayitIstegi('  ')).toEqual({
      govde: null,
      hata: 'Geri qaytarmanın səbəbini yazın.',
    });
    expect(tersKayitIstegi(' Yanlış ')).toEqual({ govde: { aciklama: 'Yanlış' }, hata: null });
  });
});
