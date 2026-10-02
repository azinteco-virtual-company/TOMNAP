import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';
import { firmalarVeritabani } from '../../../src/server/services/state';
import { bellektekiAyarlar } from '../../../src/server/services/v2/ayarlar';
import { loginFixture } from '../helpers/session';

// The boutique's default language (migration 20, docs/i18n.md): only the owner sets it,
// in the v2 settings; every session of that boutique reads it; other boutiques never see
// or change it. Login errors carry a stable code for the translated message.
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const A = 'dil-butik-a';
const B = 'dil-butik-b';

describe('boutique default language', () => {
  const app = createApp();
  const a: Record<string, Agent> = {};
  const b: Record<string, Agent> = {};
  let admin: Agent;

  beforeAll(async () => {
    for (const id of [A, B])
      firmalarVeritabani.push({
        id,
        ad: id,
        sehir: 'Baku',
        aciklama: '',
        varsayilanParaBirimi: 'AZN',
        varsayilanKomisyonYuzdesi: 15,
        onayDurumu: 'AKTIF',
      });
    for (const rol of ['PATRON', 'BAKU_KURYE', 'BAKU_FINANS'] as const) {
      a[rol] = (await loginFixture(app, rol, A)).agent;
      b[rol] = (await loginFixture(app, rol, B)).agent;
    }
    admin = (await loginFixture(app, 'SUPER_ADMIN', 'all')).agent;
  });
  beforeEach(() => vi.stubEnv('FF_V2_FLOW', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('is az until the owner chooses, then every session of that boutique reads it', async () => {
    expect((await a.BAKU_KURYE.get('/api/auth/oturum')).body.butikDili).toBe('az');
    const saved = await a.PATRON.patch('/api/v2/ayarlar').send({ varsayilan_dil: 'en' });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.ayarlar.varsayilanDil).toBe('en');
    for (const rol of ['PATRON', 'BAKU_KURYE', 'BAKU_FINANS'])
      expect([rol, (await a[rol].get('/api/auth/oturum')).body.butikDili]).toEqual([rol, 'en']);
    // The administrator's platform session has no boutique: the default.
    expect((await admin.get('/api/auth/oturum')).body.butikDili).toBe('az');
  });

  it('never reaches another boutique (tenant isolation)', async () => {
    await a.PATRON.patch('/api/v2/ayarlar').send({ varsayilan_dil: 'en' });
    // Naming boutique B in the query or the body is refused or ignored: never written there.
    const foreign = await a.PATRON.patch(`/api/v2/ayarlar?tenant_id=${B}`).send({
      varsayilan_dil: 'az',
      tenant_id: B,
    });
    expect([403, 404]).toContain(foreign.status);
    const body = await a.PATRON.patch('/api/v2/ayarlar').send({
      varsayilan_dil: 'az',
      tenant_id: B,
    });
    expect([400, 403]).toContain(body.status);
    expect(bellektekiAyarlar(B)?.varsayilanDil ?? 'az').toBe('az');
    expect(bellektekiAyarlar(A)?.varsayilanDil).toBe('en');
    for (const rol of ['PATRON', 'BAKU_KURYE'])
      expect([rol, (await b[rol].get('/api/auth/oturum')).body.butikDili]).toEqual([rol, 'az']);
    const listed = await b.PATRON.get('/api/v2/ayarlar');
    expect(listed.body.ayarlar.varsayilanDil).toBe('az');
  });

  it('the company list carries each boutique language; a boutique never sees another one', async () => {
    await a.PATRON.patch('/api/v2/ayarlar').send({ varsayilan_dil: 'en' });
    await b.PATRON.patch('/api/v2/ayarlar').send({ varsayilan_dil: 'az' });
    // The administrator selects boutiques from this list: documents follow the metadata.
    const all = await admin.get('/api/firmalar');
    const dil = (id: string) =>
      (all.body.firmalar as Array<{ id: string; butikDili?: string }>).find((f) => f.id === id)
        ?.butikDili;
    expect([dil(A), dil(B)]).toEqual(['en', 'az']);
    for (const f of all.body.firmalar as Array<{ butikDili?: string }>)
      expect(['az', 'en']).toContain(f.butikDili);
    // Tenant isolation: a boutique's list holds only itself.
    for (const [agent, own, other] of [
      [a.PATRON, A, B],
      [b.PATRON, B, A],
    ] as const) {
      const mine = await agent.get('/api/firmalar');
      expect(mine.status).toBe(200);
      expect((mine.body.firmalar as Array<{ id: string }>).map((f) => f.id)).toEqual([own]);
      expect(JSON.stringify(mine.body)).not.toContain(other);
    }
  });

  it('only the owner sets it; only supported languages are accepted', async () => {
    const scoped = `/api/v2/ayarlar?tenant_id=${A}`;
    const denied = await admin.patch(scoped).send({ varsayilan_dil: 'az' });
    expect([denied.status, denied.body.kod]).toEqual([403, 'AYAR_DIL_YALNIZ_PATRON']);
    // The administrator still sees it.
    expect((await admin.get(scoped)).body.ayarlar).toHaveProperty('varsayilanDil');
    expect(
      (await a.BAKU_FINANS.patch('/api/v2/ayarlar').send({ varsayilan_dil: 'az' })).status
    ).toBe(403);
    for (const bad of ['tr', 'AZ', 'az-AZ', '', 5, null]) {
      const res = await a.PATRON.patch('/api/v2/ayarlar').send({ varsayilan_dil: bad });
      expect([bad, res.status, res.body.kod]).toEqual([bad, 400, 'AYAR_DIL_DESTEKLENMIYOR']);
    }
  });
});

describe('login error codes', () => {
  const app = createApp();
  it('answers with a stable code next to the message', async () => {
    const empty = await request(app).post('/api/auth/giris').send({});
    expect([empty.status, empty.body.kod]).toEqual([400, 'GIRIS_KIMLIK_EKSIK']);
    expect(typeof empty.body.hata).toBe('string');
    const noPassword = await request(app)
      .post('/api/auth/giris')
      .send({ email: 'x@example.invalid' });
    expect([noPassword.status, noPassword.body.kod]).toEqual([400, 'GIRIS_SIFRE_EKSIK']);
    const unknown = await request(app)
      .post('/api/auth/giris')
      .send({ email: 'nobody@example.invalid', sifre: 'whatever-123' });
    expect([unknown.status, unknown.body.kod]).toEqual([404, 'GIRIS_KULLANICI_YOK']);
  });
});
