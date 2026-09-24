import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../../src/server';
import { sessionAuth } from '../../../src/server/middleware/auth';
import authRouter from '../../../src/server/routes/auth';
import {
  firmalarVeritabani,
  setSiparislerVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';

// A firm whose stored limits predate ABD_SATINALMA (no key): the default of 2 applies.
const TENANT = 'abd-test-firma';
type Fixture = Awaited<ReturnType<typeof loginFixture>>;

beforeAll(() => {
  firmalarVeritabani.push({
    id: TENANT,
    ad: 'ABD test',
    sehir: 'Baku',
    aciklama: '',
    varsayilanParaBirimi: 'AZN',
    varsayilanKomisyonYuzdesi: 15,
    onayDurumu: 'AKTIF',
    rolLimitleri: { PATRON: 1, KANADA_SATINALMA: 2 },
  });
});

describe('ABD_SATINALMA invitation, acceptance, login and quota (A5)', () => {
  const app = createApp();

  it('invites, accepts and signs in a US buyer, up to the default quota of 2', async () => {
    const owner = await loginFixture(app, 'PATRON', TENANT);
    const invite = (email: string) =>
      owner.agent
        .post('/api/firmalar/davet-olustur')
        .send({ tenantId: TENANT, rol: 'ABD_SATINALMA', email });
    for (const n of [1, 2]) {
      const email = `us-buyer-${n}@example.invalid`;
      const created = await invite(email);
      expect(created.status).toBe(200);
      const joined = await request(app)
        .post('/api/firmalar/davet/katil')
        .send({
          token: created.body.davet.token,
          adSoyad: `US Buyer ${n}`,
          sifre: 'Us-buyer-password!',
        });
      expect(joined.status).toBe(200);
      const login = await request(app)
        .post('/api/auth/giris')
        .send({ identifikator: email, sifre: 'Us-buyer-password!' });
      expect(login.status).toBe(200);
      expect([login.body.rol, login.body.tenantId]).toEqual(['ABD_SATINALMA', TENANT]);
    }
    const third = await invite('us-buyer-3@example.invalid');
    expect(third.status).toBe(409);
    // The stored limits are not rewritten by the fallback.
    expect(firmalarVeritabani.find((firma) => firma.id === TENANT)?.rolLimitleri).toEqual({
      PATRON: 1,
      KANADA_SATINALMA: 2,
    });
  });

  it('limits a US buyer to the purchasing fields of an order, like the Canadian buyer', async () => {
    const order = {
      id: 'abd-order',
      tenant_id: TENANT,
      musteri_adi: 'Customer',
      urun_aciklamasi: 'Bag',
      adet: 1,
      toplam_tutar: 100,
      alinan_tutar: 0,
      renk: 'Qara',
    };
    for (const role of ['KANADA_SATINALMA', 'ABD_SATINALMA'] as const) {
      setSiparislerVeritabani([{ ...order }]);
      const buyer = await loginFixture(app, role, TENANT);
      const money = await buyer.agent.patch('/api/siparisler/abd-order').send({ toplam_tutar: 1 });
      expect([role, money.status]).toEqual([role, 403]);
      const color = await buyer.agent.patch('/api/siparisler/abd-order').send({ renk: 'Mavi' });
      expect([role, color.status]).toEqual([role, 200]);
      expect(siparislerVeritabani[0]).toMatchObject({ toplam_tutar: 100, renk: 'Mavi' });
    }
  });
});

describe('ABD_SATINALMA allowlist mirrors KANADA_SATINALMA on every rule (A5)', () => {
  // Echo app: status is decided by the allowlist alone, no handler side effects.
  const echo = express()
    .use(express.json())
    .use(sessionAuth())
    .use('/api', authRouter)
    .use((req, res) => res.json({ ok: true, role: req.auth?.role }));
  const probes: Array<[string, string]> = [
    ['GET', '/api/auth/oturum'],
    ['GET', '/api/firmalar'],
    ['POST', '/api/firmalar/davet-olustur'],
    ['POST', '/api/firmalar'],
    ['PATCH', '/api/firmalar/x/onay'],
    ['DELETE', '/api/firmalar/x'],
    ['GET', '/api/sistem-durum'],
    ['POST', '/api/veritabani/temizle'],
    ['GET', '/api/siparisler'],
    ['POST', '/api/siparisler'],
    ['POST', '/api/ayristir-siparis'],
    ['PATCH', '/api/siparisler/x'],
    ['DELETE', '/api/siparisler/x'],
    ['POST', '/api/siparisler/tumunu-uluslararasi-kargo-yap'],
    ['GET', '/api/musteriler'],
    ['POST', '/api/musteriler'],
    ['GET', '/api/inbox'],
    ['POST', '/api/inbox/x/onayla'],
    ['GET', '/api/kuryeler'],
    ['POST', '/api/kuryeler'],
    ['POST', '/api/siparisler/x/kurye'],
    ['GET', '/api/kurye/gorevler'],
    ['POST', '/api/kurye/gorevler/x/teslim'],
    ['GET', '/api/kargo/ayarlar'],
    ['POST', '/api/kargo/ayarlar'],
    ['POST', '/api/kargo/takip'],
    ['POST', '/api/kargo/manifesto-eslestirme/onayla'],
    ['GET', '/api/proxy-gorsel'],
    ['GET', '/api/uploads/x'],
    ['POST', '/api/upload-gorsel'],
  ];
  let canada: Fixture;
  let us: Fixture;
  beforeAll(async () => {
    canada = await loginFixture(echo, 'KANADA_SATINALMA', TENANT);
    us = await loginFixture(echo, 'ABD_SATINALMA', TENANT);
  });
  const status = async (who: Fixture, method: string, path: string) =>
    (
      await request(echo)
        [method.toLowerCase() as 'get'](path)
        .set('Cookie', who.cookie)
        .set('x-csrf-token', who.csrfToken)
        .send({})
    ).status;

  it('gets exactly the Canadian buyer’s decision on every rule', async () => {
    const decisions = [];
    for (const [method, path] of probes)
      decisions.push({
        rule: `${method} ${path}`,
        canada: await status(canada, method, path),
        us: await status(us, method, path),
      });
    expect(decisions.filter((row) => row.canada !== row.us)).toEqual([]);
  });

  it('can read orders, purchase, confirm AWBs and assign couriers but not administer', async () => {
    for (const [method, path] of [
      ['GET', '/api/siparisler'],
      ['POST', '/api/siparisler'],
      ['POST', '/api/kargo/manifesto-eslestirme/onayla'],
      ['POST', '/api/siparisler/x/kurye'],
    ])
      expect([path, await status(us, method, path)]).toEqual([path, 200]);
    for (const [method, path] of [
      ['POST', '/api/kargo/ayarlar'],
      ['POST', '/api/firmalar/davet-olustur'],
      ['GET', '/api/musteriler'],
      ['GET', '/api/inbox'],
      ['GET', '/api/kurye/gorevler'],
      ['GET', '/api/sistem-durum'],
    ])
      expect([path, await status(us, method, path)]).toEqual([path, 403]);
  });
});
