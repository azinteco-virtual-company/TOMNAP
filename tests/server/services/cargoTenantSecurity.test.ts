import { afterEach, describe, expect, it, vi } from 'vitest';
import { kargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import { siparislerVeritabani, setSiparislerVeritabani } from '../../../src/server/services/state';
import { AramexProvider } from '../../../src/server/services/kargo/providers/aramex';

afterEach(() => vi.restoreAllMocks());
describe('Carrier tenant and live-result integrity', () => {
  it('does not inherit another tenant credentials or accept global settings', () => {
    expect(() => kargoMerkezi.getAyarlar('all')).toThrow();
    const a = kargoMerkezi.getAyarlar('cargo_a');
    a.kimlikBilgileri.hesapNo = 'synthetic-account';
    expect(kargoMerkezi.getAyarlar('cargo_b').kimlikBilgileri.hesapNo).toBe('');
    expect(kargoMerkezi.getAyarlar('cargo_a').kimlikBilgileri.hesapNo).toBe('');
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
    const settings = kargoMerkezi.getAyarlar('cargo_a');
    settings.kimlikBilgileri = {
      kullaniciAdi: 'fixture',
      sifre: 'fixture-only',
      hesapNo: 'fixture',
      testModu: false,
    };
    await expect(new AramexProvider().topluTakipEt(['AWB-FIXTURE'], settings)).rejects.toThrow(
      'Canlı kargo takibi başarısız'
    );
  });
});
