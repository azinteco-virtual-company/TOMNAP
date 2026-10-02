import { beforeAll, describe, expect, it } from 'vitest';
import { asamaIlerletebilir, sonrakiAsama, V2_ASAMA_SIRASI } from '../../src/shared/v2Asama';
import { asamaIstegi, asamaOnayMetni } from '../../src/components/v2/asamaFormu';
import { asamaAdi } from '../../src/components/v2/v2Ceviri';
import { dilHazirla } from '../helpers/i18n';

// TEMPORARY v2 stage bridge (OPEN_QUESTIONS 38): one rule for the server's memory store
// and for the "next stage" button.
// The texts come from the az translation files (docs/i18n.md); the wording is unchanged.
beforeAll(() => dilHazirla('az', ['v2']));

describe('v2 stage bridge rule (O-38)', () => {
  it('knows only the next stage, never after Baku distribution', () => {
    expect(V2_ASAMA_SIRASI).toEqual([
      'KANADA_SATINALIM_BEKLIYOR',
      'KANADA_DEPO',
      'ULUSLARARASI_KARGO',
      'BAKU_DAGITIM_ARKADAS',
    ]);
    expect(sonrakiAsama('KANADA_SATINALIM_BEKLIYOR')).toBe('KANADA_DEPO');
    expect(sonrakiAsama('ULUSLARARASI_KARGO')).toBe('BAKU_DAGITIM_ARKADAS');
    expect(sonrakiAsama('BAKU_DAGITIM_ARKADAS')).toBeNull();
    expect(sonrakiAsama('TESLIM_EDILDI')).toBeNull();
    expect(sonrakiAsama('YOK')).toBeNull();
  });

  it('gives the Canada and cargo steps to SHIPPING and the Baku step to COURIER_ASSIGN, never SUPER_ADMIN', () => {
    const matris = (asama: string) =>
      [
        'PATRON',
        'KANADA_SATINALMA',
        'ABD_SATINALMA',
        'SATIS_SORUMLUSU',
        'BAKU_FINANS',
        'BAKU_KURYE',
        'SUPER_ADMIN',
        undefined,
      ].filter((rol) => asamaIlerletebilir(rol, asama));
    expect(matris('KANADA_SATINALIM_BEKLIYOR')).toEqual([
      'PATRON',
      'KANADA_SATINALMA',
      'ABD_SATINALMA',
    ]);
    expect(matris('KANADA_DEPO')).toEqual(['PATRON', 'KANADA_SATINALMA', 'ABD_SATINALMA']);
    expect(matris('ULUSLARARASI_KARGO')).toEqual(['PATRON', 'KANADA_SATINALMA']);
    expect(matris('BAKU_DAGITIM_ARKADAS')).toEqual([]);
    expect(matris('TESLIM_EDILDI')).toEqual([]);
  });

  it('asks with both stages and sends the current stage as the expected one', () => {
    const siparis = { musteriAdi: 'Aytən', lojistikDurumu: 'KANADA_DEPO' };
    expect(asamaIstegi(siparis)).toEqual({ beklenen_asama: 'KANADA_DEPO' });
    expect(asamaOnayMetni(siparis)).toContain('Aytən');
    // What the person reads is translated; the request keeps the DB code (above).
    expect(asamaOnayMetni(siparis)).toContain('Kanada anbarında → Beynəlxalq kargoda');
    expect(asamaOnayMetni(siparis)).not.toContain('KANADA_DEPO');
    expect(asamaIstegi({ musteriAdi: 'X', lojistikDurumu: 'TESLIM_EDILDI' })).toBeNull();
  });
});

describe('v2 stage names follow the interface language (R5 A06)', () => {
  const AD = {
    az: ['Kanada alışı gözlənilir', 'Kanada anbarında', 'Beynəlxalq kargoda', 'Bakıda paylanmada'],
    en: [
      'Awaiting purchase in Canada',
      'In the Canada warehouse',
      'In international cargo',
      'Out for delivery in Baku',
    ],
  };
  it.each(['az', 'en'] as const)('%s: the question names stages, never raw codes', async (dil) => {
    await dilHazirla(dil, ['v2']);
    const metin = asamaOnayMetni({ musteriAdi: 'Aytən', lojistikDurumu: 'KANADA_DEPO' });
    expect(metin).toContain(`${AD[dil][1]} → ${AD[dil][2]}`);
    expect(metin).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    await dilHazirla('az', ['v2']);
  });
  it.each(['az', 'en'] as const)('%s: every bridge stage has a name in both files', async (dil) => {
    await dilHazirla(dil, ['v2']);
    expect(V2_ASAMA_SIRASI.map((kod) => asamaAdi(kod))).toEqual(AD[dil]);
    expect(asamaAdi('TESLIM_EDILDI')).not.toBe('TESLIM_EDILDI');
    expect(asamaAdi('BILINMEYEN_KOD')).toBe('BILINMEYEN_KOD');
    await dilHazirla('az', ['v2']);
  });
});
