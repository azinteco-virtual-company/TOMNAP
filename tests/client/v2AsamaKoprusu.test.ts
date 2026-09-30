import { describe, expect, it } from 'vitest';
import { asamaIlerletebilir, sonrakiAsama, V2_ASAMA_SIRASI } from '../../src/shared/v2Asama';
import { asamaIstegi, asamaOnayMetni } from '../../src/components/v2/asamaFormu';

// TEMPORARY v2 stage bridge (OPEN_QUESTIONS 38): one rule for the server's memory store
// and for the "next stage" button.
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
    expect(asamaOnayMetni(siparis)).toContain('KANADA_DEPO → ULUSLARARASI_KARGO');
    expect(asamaIstegi({ musteriAdi: 'X', lojistikDurumu: 'TESLIM_EDILDI' })).toBeNull();
  });
});
