import { describe, expect, it } from 'vitest';
import { MUSTERI_ADAY_SINIRI, musteriOner } from '../../../src/server/services/musteriOneri';

const card = (id: string, ad_soyad: string, telefon = '') => ({ id, ad_soyad, telefon });

describe('Server-side customer suggestion', () => {
  const customers = [
    card('mus-kemale', 'Kəmalə Bədirbəyli', '+994 50 694 25 25'),
    card('mus-nigar', 'Nigar Əliyeva', '055 111 22 33'),
    card('mus-placeholder', 'Müştəri', ''),
  ];

  it('links exactly one customer whose normalized phone matches', () => {
    const result = musteriOner(customers, { telefon: '050 694 25 25', ad: 'Kemale' });
    expect(result.eslesen?.id).toBe('mus-kemale');
  });

  it('never links by name alone; similar names are only candidates', () => {
    const result = musteriOner(customers, { ad: 'Nigar Aliyeva' });
    expect(result.eslesen).toBeNull();
    expect(result.adaylar).toEqual([
      expect.objectContaining({ musteri_id: 'mus-nigar', ad_soyad: 'Nigar Əliyeva' }),
    ]);
  });

  it('links nobody when the phone matches more than one customer', () => {
    const twins = [...customers, card('mus-twin', 'Kəmalə B.', '0506942525')];
    const result = musteriOner(twins, { telefon: '+994506942525' });
    expect(result.eslesen).toBeNull();
    expect(result.adaylar.map((item) => item.musteri_id).sort()).toEqual([
      'mus-kemale',
      'mus-twin',
    ]);
  });

  it('ignores placeholder names, unreadable phones and limits the candidates', () => {
    expect(musteriOner(customers, { telefon: 'yoxdur', ad: 'Müştəri' })).toEqual({
      eslesen: null,
      adaylar: [],
    });
    const many = Array.from({ length: 9 }, (_, index) => card(`mus-${index}`, 'Aytən Məmmədova'));
    expect(musteriOner(many, { ad: 'Aytən Məmmədova' }).adaylar).toHaveLength(MUSTERI_ADAY_SINIRI);
  });
});
