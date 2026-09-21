import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { KargoMerkezi, kargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import { siparislerVeritabani, setSiparislerVeritabani } from '../../../src/server/services/state';
import { AramexProvider } from '../../../src/server/services/kargo/providers/aramex';

afterEach(() => vi.restoreAllMocks());
describe('Carrier tenant and live-result integrity', () => {
  it('does not inherit another tenant credentials or accept global settings', async () => {
    await expect(kargoMerkezi.getAyarlar('all')).rejects.toThrow();
    const a = await kargoMerkezi.getAyarlar('cargo_a');
    a.kimlikBilgileri.hesapNo = 'synthetic-account';
    expect((await kargoMerkezi.getAyarlar('cargo_b')).kimlikBilgileri.hesapNo).toBe('');
    expect((await kargoMerkezi.getAyarlar('cargo_a')).kimlikBilgileri.hesapNo).toBe('');
  });
  it('refuses to persist simulated tracking into a real tenant order', async () => {
    setSiparislerVeritabani([
      {
        id: 'cargo-order',
        tenant_id: 'cargo_a',
        uluslararasi_kargo_kodu: 'AWB-FIXTURE',
        lojistik_durumu: 'KANADA_DEPO',
      },
    ]);
    const before = JSON.stringify(siparislerVeritabani);
    await expect(kargoMerkezi.topluSenkronizeEt('cargo_a')).rejects.toThrow('Simülasyon');
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
  });
  it('does not replace a failed live carrier call with fabricated results', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Synthetic outage'));
    const settings = await kargoMerkezi.getAyarlar('cargo_a');
    settings.kimlikBilgileri = {
      kullaniciAdi: 'fixture',
      // This request is mocked above; no carrier credential is used or sent.
      sifre: randomUUID(),
      hesapNo: 'fixture',
      testModu: false,
    };
    await expect(new AramexProvider().topluTakipEt(['AWB-FIXTURE'], settings)).rejects.toThrow(
      'Canlı kargo takibi başarısız'
    );
  });
});

describe('Local carrier calls preserve concurrent delivery and assignment', () => {
  it.each([
    { lojistik_durumu: 'TESLIM_EDILDI' },
    { kurye_atama_surumu: 2, baku_kurye_id: 'new-courier' },
    { uluslararasi_kargo_kodu: 'MANUAL-NEW-AWB' },
  ])('rejects stale provider results after %j', async (change) => {
    setSiparislerVeritabani([
      {
        id: 'race-order',
        tenant_id: 'race-tenant',
        uluslararasi_kargo_kodu: 'AWB-RACE',
        lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
        kurye_atama_surumu: 1,
        baku_kurye_id: 'original-courier',
      },
    ]);
    let release: (value: any) => void;
    let started: () => void;
    const didStart = new Promise<void>((resolve) => {
      started = resolve;
    });
    const result = new Promise<any>((resolve) => {
      release = resolve;
    });
    const service = new KargoMerkezi();
    service.kayitSaglayici({
      tip: 'ARAMEX',
      topluTakipEt: async () => {
        started();
        return result;
      },
    } as any);
    const pending = service.topluSenkronizeEt('race-tenant');
    await didStart;
    Object.assign(siparislerVeritabani[0], change);
    const before = structuredClone(siparislerVeritabani[0]);
    release([
      {
        takipNo: 'AWB-RACE',
        kaynak: 'LIVE',
        durum: 'ULUSLARARASI_KARGO',
        konum: 'fixture',
        hamAciklama: 'synthetic',
      },
    ]);
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(siparislerVeritabani[0]).toEqual(before);
  });
});
