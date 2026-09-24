import fs from 'node:fs';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server';
import { kargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import {
  CARGO_SETTINGS_FILE,
  saveCargoSettings,
} from '../../../src/server/services/kargo/settings';
import type {
  KargoSaglayiciKimlik,
  KargoSaglayiciTipi,
} from '../../../src/server/services/kargo/types';
import { setSiparislerVeritabani, siparislerVeritabani } from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';

// PR #2 refuses to write non-LIVE tracking results into orders. The older route
// test passes without reaching that guard (no active orders), so these seed
// orders that do reach it.
const TENANT = 'kanada_shopper_baku';
const OTHER = 'ayla_boutique';
const AWB = '37349392426';

const order = (id: string, tenant: string) => ({
  id,
  tenant_id: tenant,
  musteri_adi: 'Synthetic Customer',
  urun_aciklamasi: 'Bag',
  toplam_tutar: 100,
  alinan_tutar: 0,
  kalan_tutar: 100,
  lojistik_durumu: 'ULUSLARARASI_KARGO',
  uluslararasi_kargo_kodu: AWB,
  baku_tahsilat_notu: '',
  eksik_bilgiler: [],
  olusturma_tarihi: '2026-09-01T10:00:00Z',
});
const status = (id: string) => siparislerVeritabani.find((row) => row.id === id)?.lojistik_durumu;

async function useProvider(
  saglayici: KargoSaglayiciTipi,
  kimlikBilgileri: KargoSaglayiciKimlik = { testModu: false }
) {
  await saveCargoSettings({ tenantId: TENANT, revision: 0, saglayici, kimlikBilgileri });
}

beforeEach(() => {
  fs.rmSync(CARGO_SETTINGS_FILE, { force: true });
  setSiparislerVeritabani([order('own-order', TENANT), order('other-order', OTHER)]);
});
afterEach(() => vi.unstubAllGlobals());

describe('Cargo sync never writes simulated tracking into orders', () => {
  it.each<[KargoSaglayiciTipi]>([['ARAMEX'], ['DHL'], ['UPS']])(
    '%s without live credentials rejects the sync with 409 and changes nothing',
    async (saglayici) => {
      await useProvider(saglayici);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const before = structuredClone(siparislerVeritabani);
      await expect(kargoMerkezi.topluSenkronizeEt(TENANT)).rejects.toMatchObject({ status: 409 });
      expect(siparislerVeritabani).toEqual(before);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('writes a LIVE result only into the syncing tenant order', async () => {
    await useProvider('ARAMEX', {
      kullaniciAdi: 'user',
      sifre: 'secret',
      hesapNo: '123',
      testModu: false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          TrackingResults: [
            {
              WaybillNumber: AWB,
              UpdateCode: 'SH005',
              UpdateDescription: 'delivered',
              UpdateLocation: 'Baku',
            },
          ],
        })
      )
    );
    const result = await kargoMerkezi.topluSenkronizeEt(TENANT);
    expect(result).toMatchObject({ basarili: true, guncellenenSayi: 1 });
    expect(status('own-order')).toBe('TESLIM_EDILDI');
    expect(status('other-order')).toBe('ULUSLARARASI_KARGO');
  });
});

describe('Cargo routes report simulation plainly', () => {
  const app = createApp();
  let agent: Awaited<ReturnType<typeof loginFixture>>['agent'];
  beforeAll(async () => {
    agent = (await loginFixture(app, 'PATRON', TENANT)).agent;
  });

  it('POST /api/kargo/senkronize-et answers 409 with a clear message and changes nothing', async () => {
    const before = structuredClone(siparislerVeritabani);
    const response = await agent.post('/api/kargo/senkronize-et').send({});
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ basarili: false });
    expect(response.body.hata).toMatch(/Simülasyon/);
    expect(siparislerVeritabani).toEqual(before);
  });

  it('POST /api/kargo/takip marks simulated results as SIMULATION', async () => {
    const response = await agent.post('/api/kargo/takip').send({ takipNolari: [AWB] });
    expect(response.status).toBe(200);
    expect(response.body.sonuclar).toEqual([
      expect.objectContaining({ takipNo: AWB, kaynak: 'SIMULATION' }),
    ]);
  });
});
