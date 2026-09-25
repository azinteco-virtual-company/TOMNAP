import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';
import * as sessions from '../../../src/server/services/sessions';
import { loginFixture } from '../helpers/session';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const METHODS = ['get', 'post', 'patch', 'delete'] as const;
const PATHS = [
  '/api/v2/siparisler',
  '/api/v2/siparisler/ayristir',
  '/api/v2/siparis-sahipleri',
  '/api/v2/odemeler',
  '/api/v2/odemeler/x/ters-kayit',
  '/api/v2/siparisler/x/odemeler',
  '/api/v2/kurye/nakit',
  '/api/v2/kurye/tahsilat',
  '/api/v2/kasa/kurye-bakiyeleri',
  '/api/v2/kasa/teslimler',
  '/api/v2/kacaklar',
  '/api/v2',
  '/api/v2/',
  '/api/v2/durum',
  '/api/v2/kurlar',
  '/api/v2/ayarlar',
  '/api/v2/x/y',
];
const GATE_404 = { basarili: false, hata: 'Bu funksiya aktiv deyil.' };

describe('FF_V2_FLOW gate (A6)', () => {
  const app = createApp();
  let owner: Agent;
  let courier: Agent;
  beforeAll(async () => {
    owner = (await loginFixture(app, 'PATRON')).agent;
    courier = (await loginFixture(app, 'BAKU_KURYE')).agent;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['', 'TRUE', '1', 'yes', 'true '])(
    'answers every /api/v2 request with 404 and runs no session or v2 code while the flag is %j',
    async (value) => {
      vi.stubEnv('FF_V2_FLOW', value);
      const readSession = vi.spyOn(sessions, 'readSession');
      for (const method of METHODS)
        for (const path of PATHS) {
          const anonymous = await request(app)[method](path).send({});
          const signedIn = await owner[method](path).send({});
          for (const [who, response] of [
            ['anonymous', anonymous],
            ['signed in', signedIn],
          ] as const) {
            // Diagnostics: the report names the request and shows the raw answer.
            const request = `${who} ${method.toUpperCase()} ${path}`;
            const raw = `${response.status} ${JSON.stringify(response.headers)} ${response.text}`;
            expect(response.status, `${request}: ${raw}`).toBe(404);
            expect(response.body, `${request}: ${raw}`).toEqual(GATE_404);
          }
        }
      // The gate sits before authentication: not even the session was read.
      expect(readSession).not.toHaveBeenCalled();
    }
  );

  it('leaves existing routes untouched while the flag is off', async () => {
    vi.stubEnv('FF_V2_FLOW', '');
    expect((await owner.get('/api/siparisler')).status).toBe(200);
    // Only the /api/v2 prefix is gated; a look-alike path still meets the allowlist.
    expect((await owner.get('/api/v2x/durum')).status).toBe(403);
  });

  it('serves the shell status only to signed-in staff when the flag is on', async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    expect((await request(app).get('/api/v2/durum')).status).toBe(401);
    const ok = await owner.get('/api/v2/durum');
    expect([ok.status, ok.body]).toEqual([200, { basarili: true, v2: true }]);
    expect((await courier.get('/api/v2/durum')).status).toBe(403);
    // Unreviewed v2 routes stay denied by the allowlist.
    expect((await owner.get('/api/v2/incelenmemis')).status).toBe(403);
    expect((await owner.post('/api/v2/durum').send({})).status).toBe(403);
  });

  it('reads the flag on every request, without a restart', async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    expect((await owner.get('/api/v2/durum')).status).toBe(200);
    vi.stubEnv('FF_V2_FLOW', '');
    expect((await owner.get('/api/v2/durum')).status).toBe(404);
  });
});
