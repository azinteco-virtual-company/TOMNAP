import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server';
import { demoSiparislerVeritabani } from '../../../src/server/services/state';
import { bellektekiKurlar } from '../../../src/server/services/v2/kurlar';
import { bellektekiAyarlar } from '../../../src/server/services/v2/ayarlar';
import { loginFixture } from '../helpers/session';

// Codex R3 F12 / K21: the v2 flow is closed in demo_sandbox. That area lives in memory,
// which cannot carry the transactional RPCs, yet every v2 store fell back to memory
// there, so rates, settings, orders and payments were written with the flag on.
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const DEMO = 'demo_sandbox';
const ORDER = '00000000-0000-4000-8000-000000000001';
const satirlar = [
  { urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 10, kaynak_ulke: 'CA' },
];
const ROUTES: Array<[string, (agent: Agent) => Promise<{ status: number; body: unknown }>]> = [
  ['GET /durum', (a) => a.get('/api/v2/durum')],
  ['GET /kurlar', (a) => a.get('/api/v2/kurlar')],
  [
    'POST /kurlar',
    (a) =>
      a
        .post('/api/v2/kurlar')
        .send({ para_birimi: 'CAD', tarih: '2026-09-20', azn_karsiligi: 1.2 }),
  ],
  ['GET /ayarlar', (a) => a.get('/api/v2/ayarlar')],
  ['PATCH /ayarlar', (a) => a.patch('/api/v2/ayarlar').send({ varsayilan_kg_fiyati_azn: 9 })],
  ['GET /siparisler', (a) => a.get('/api/v2/siparisler')],
  ['POST /siparisler', (a) => a.post('/api/v2/siparisler').send({ musteri_adi: 'Demo', satirlar })],
  ['GET /siparis-sahipleri', (a) => a.get('/api/v2/siparis-sahipleri')],
  ['GET /siparisler/:id/odemeler', (a) => a.get(`/api/v2/siparisler/${ORDER}/odemeler`)],
  [
    'POST /odemeler',
    (a) =>
      a
        .post('/api/v2/odemeler')
        .send({ siparis_id: ORDER, tutar_azn: 1, yontem: 'NAKIT', kaynak: 'BUTIK' }),
  ],
  ['GET /kasa/kurye-bakiyeleri', (a) => a.get('/api/v2/kasa/kurye-bakiyeleri')],
  ['GET /kacaklar', (a) => a.get('/api/v2/kacaklar')],
];

describe('the v2 flow is closed in demo_sandbox (Codex R3 F12, K21)', () => {
  const app = createApp();
  const agents: Record<string, Agent> = {};
  const demoOrders = () => demoSiparislerVeritabani.length;
  let before = 0;

  beforeAll(async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    agents.PATRON = (await loginFixture(app, 'PATRON', DEMO)).agent;
    agents.SUPER_ADMIN = (await loginFixture(app, 'SUPER_ADMIN', 'kanada_shopper_baku')).agent;
    agents.SUPER_ADMIN.set('x-tenant-id', DEMO);
    before = demoOrders();
  });
  afterAll(() => vi.unstubAllEnvs());

  it.each(ROUTES)('%s answers 404 in the demo area', async (name, call) => {
    for (const role of ['PATRON', 'SUPER_ADMIN']) {
      const response = await call(agents[role]);
      // The allowlist refuses a platform admin's payment before any v2 code (O-28/29).
      const want = role === 'SUPER_ADMIN' && name === 'POST /odemeler' ? 403 : 404;
      expect([role, response.status]).toEqual([role, want]);
    }
  });

  it('nothing reached the in-memory v2 stores of the demo area', () => {
    expect(bellektekiKurlar(DEMO)).toEqual([]);
    expect(bellektekiAyarlar(DEMO)).toBeNull();
    expect(demoOrders()).toBe(before);
  });

  it('a real boutique still reaches v2', async () => {
    const patron = (await loginFixture(app, 'PATRON', 'kanada_shopper_baku')).agent;
    expect((await patron.get('/api/v2/durum')).status).toBe(200);
  });
});
