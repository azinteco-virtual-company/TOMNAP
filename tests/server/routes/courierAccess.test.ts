import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return fixture.db;
  },
}));
import { createApp } from '../../../src/server/index';
import courierRouter from '../../../src/server/routes/kuryeler';
import { DATA_DIR } from '../../../src/server/config';
import * as state from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';

const app = createApp();
const file = path.join(DATA_DIR, 'couriers.json');
const tenant = 'courier-company-a';
const otherTenant = 'courier-company-b';
let owner: Awaited<ReturnType<typeof loginFixture>>;
let ownerB: typeof owner;
let courier: typeof owner;
let courier2: typeof owner;
let courierB: typeof owner;
let sales: typeof owner;
let purchase: typeof owner;
const order = (id: string, tenant_id = tenant) => ({
  id,
  tenant_id,
  musteri_adi: 'Delivery customer',
  telefon_numarasi: '+994500000001',
  teslimat_sehri: 'Baku',
  teslimat_adresi: 'Nərimanov street',
  urun_aciklamasi: 'Sealed parcel',
  adet: 1,
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
  toplam_tutar: 100,
  alinan_tutar: 20,
  kalan_tutar: 80,
  para_birimi: 'AZN',
  finans_durumu: 'KISMI_ODEME',
  ham_mesaj: 'PRIVATE CONVERSATION',
  musteri_id: 'PRIVATE CRM ID',
  kanada_alis_fiyati_cad: 20,
  kanada_fatura_no: 'PRIVATE INVOICE',
  islem_gecmisi: ['PRIVATE HISTORY'],
  eksik_bilgiler: [],
  olusturma_tarihi: '2026-01-01T00:00:00Z',
});
async function create(actor = owner) {
  const result = await actor.agent
    .post('/api/kuryeler')
    .send({ ad_soyad: 'Same courier name', telefon: '00000000', bolge: 'Nərimanov' });
  expect(result.status).toBe(201);
  return result.body.kurye;
}
async function bind(
  id: string,
  userId: string | null,
  expected: string | null = null,
  actor = owner
) {
  return actor.agent
    .post(`/api/kuryeler/${id}/kullanici`)
    .send({ kullanici_id: userId, beklenen_kullanici_id: expected });
}
async function assign(orderId: string, id: string | null, version = 0, actor = owner) {
  return actor.agent
    .post(`/api/siparisler/${orderId}/kurye`)
    .send({ kurye_id: id, beklenen_atama_surumu: version });
}
beforeAll(async () => {
  state.setFirmalarVeritabani(
    [tenant, otherTenant].map((id) => ({
      id,
      ad: id,
      sehir: 'Baku',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 10,
      aciklama: 'Synthetic',
      onayDurumu: 'AKTIF',
    }))
  );
  state.setKullanicilarVeritabani([]);
  owner = await loginFixture(app, 'PATRON', tenant);
  ownerB = await loginFixture(app, 'PATRON', otherTenant);
  courier = await loginFixture(app, 'BAKU_KURYE', tenant);
  courier2 = await loginFixture(app, 'BAKU_KURYE', tenant);
  courierB = await loginFixture(app, 'BAKU_KURYE', otherTenant);
  sales = await loginFixture(app, 'SATIS_SORUMLUSU', tenant);
  purchase = await loginFixture(app, 'KANADA_SATINALMA', tenant);
});
beforeEach(() => {
  fixture.db = null;
  fs.rmSync(file, { force: true });
  state.setSiparislerVeritabani([
    order('courier-order-a'),
    order('courier-order-b', otherTenant),
    { ...order('legacy-order'), baku_kurye_id: 'kurye-elvin' },
  ]);
});

describe('Real sessions and explicit courier authority', () => {
  it('does not grant tasks by legacy courier ID, matching name or matching address', async () => {
    const created = await create();
    const tasks = await courier.agent.get('/api/kurye/gorevler');
    expect(tasks.status).toBe(200);
    expect(tasks.body).toEqual({ basarili: true, kurye: null, gorevler: [] });
    const list = await owner.agent.get('/api/kuryeler');
    expect(list.body.kuryeler).toHaveLength(1);
    expect(list.body.kuryeler[0]).toMatchObject({
      id: created.id,
      kullanici_id: null,
      toplam_paket_sayisi: 0,
    });
    expect(list.body.eslenmemis_siparisler).toEqual([
      { id: 'legacy-order', baku_kurye_id: 'kurye-elvin' },
    ]);
    expect(list.body.atanabilir_kullanicilar.map((u: any) => u.id).sort()).toEqual(
      [courier.userId, courier2.userId].sort()
    );
  });

  it('requires owner authority and an active courier user in the same tenant to bind', async () => {
    const c = await create();
    const other = await create(ownerB);
    expect((await bind(c.id, courierB.userId)).status).toBe(404);
    expect((await bind(c.id, owner.userId)).status).toBe(404);
    expect((await bind(other.id, courier.userId)).status).toBe(404);
    expect((await bind(c.id, courier.userId, null, purchase)).status).toBe(403);
    expect((await bind(c.id, courier.userId)).status).toBe(200);
    const second = await create();
    expect((await bind(second.id, courier.userId)).status).toBe(409);
    expect((await bind(c.id, courier2.userId, null)).status).toBe(409);
    expect(
      (await courier.agent.get('/api/kurye/gorevler').set('x-tenant-id', otherTenant)).status
    ).toBe(403);
    const user = state.kullanicilarVeritabani.find((u) => u.id === courier2.userId)!;
    user.durum = 'PASIF';
    try {
      expect((await bind(second.id, courier2.userId)).status).toBe(404);
    } finally {
      user.durum = 'AKTIF';
    }
  });

  it('exposes only assigned deliverable tasks and the minimal delivery fields', async () => {
    const c = await create();
    expect((await bind(c.id, courier.userId)).status).toBe(200);
    expect((await assign('courier-order-a', c.id, 0, purchase)).status).toBe(200);
    state.siparislerVeritabani.push({
      ...order('early-order'),
      baku_kurye_id: c.id,
      lojistik_durumu: 'KANADA_DEPO',
    });
    const result = await courier.agent.get('/api/kurye/gorevler');
    expect(result.status).toBe(200);
    expect(result.body.gorevler).toHaveLength(1);
    const task = result.body.gorevler[0];
    expect(Object.keys(task).sort()).toEqual(
      [
        'id',
        'musteri_adi',
        'telefon_numarasi',
        'teslimat_sehri',
        'teslimat_adresi',
        'urun_aciklamasi',
        'adet',
        'lojistik_durumu',
        'kalan_tutar',
        'para_birimi',
        'kurye_atama_surumu',
        'teslim_tarihi',
        'teslim_alan',
      ].sort()
    );
    expect(task).toMatchObject({ id: 'courier-order-a', kalan_tutar: 80, kurye_atama_surumu: 1 });
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
    for (const url of [
      '/api/siparisler',
      '/api/musteriler',
      '/api/inbox',
      '/api/firmalar',
      '/api/kuryeler',
      '/api/uploads/private.png',
      '/api/proxy-gorsel',
    ])
      expect((await courier.agent.get(url)).status).toBe(403);
    expect((await courier2.agent.get('/api/kurye/gorevler')).body.gorevler).toEqual([]);
    expect((await request(app).get('/api/kurye/gorevler')).status).toBe(401);
  });

  it('delivers once with CSRF and current assignment, without mutating payment or hidden data', async () => {
    const c = await create();
    await bind(c.id, courier.userId);
    await assign('courier-order-a', c.id);
    const payload = { beklenen_atama_surumu: 1, teslim_alan: 'Customer recipient' };
    expect(
      (
        await request(app)
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .set('Cookie', courier.cookie)
          .send(payload)
      ).status
    ).toBe(403);
    expect(
      (
        await courier.agent
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .send({ ...payload, alinan_tutar: 100 })
      ).status
    ).toBe(400);
    expect(
      (await courier.agent.post('/api/kurye/gorevler/courier-order-b/teslim').send(payload)).status
    ).toBe(404);
    expect(
      (await courier2.agent.post('/api/kurye/gorevler/courier-order-a/teslim').send(payload)).status
    ).toBe(404);
    const before = structuredClone(state.siparislerVeritabani[0]);
    const first = await courier.agent
      .post('/api/kurye/gorevler/courier-order-a/teslim')
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.tekrar).toBe(false);
    const retry = await courier.agent
      .post('/api/kurye/gorevler/courier-order-a/teslim')
      .send({ ...payload, teslim_alan: 'Changed retry' });
    expect(retry.status).toBe(200);
    expect(retry.body.tekrar).toBe(true);
    expect(retry.body.gorev).toEqual(first.body.gorev);
    expect(state.siparislerVeritabani[0]).toMatchObject({
      ...before,
      lojistik_durumu: 'TESLIM_EDILDI',
    });
    expect(state.siparislerVeritabani[0].alinan_tutar).toBe(20);
    expect(state.siparislerVeritabani[0].kurye_teslim_kullanici_id).toBe(courier.userId);
    expect((await bind(c.id, courier2.userId, courier.userId)).status).toBe(200);
    expect((await courier2.agent.get('/api/kurye/gorevler')).body.gorevler).toEqual([]);
    expect((await courier.agent.get('/api/kurye/gorevler')).body.gorevler).toEqual([]);
  });

  it('rejects stale delivery/assignment and immediately revokes old binding access', async () => {
    const c = await create();
    const c2 = await create();
    await bind(c.id, courier.userId);
    await bind(c2.id, courier2.userId);
    await assign('courier-order-a', c.id);
    expect((await assign('courier-order-a', c.id)).body.tekrar).toBe(true);
    expect((await assign('courier-order-a', c2.id, 0)).status).toBe(409);
    expect((await assign('courier-order-a', c2.id, 1)).status).toBe(200);
    expect(
      (
        await courier.agent
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .send({ beklenen_atama_surumu: 1, teslim_alan: 'Recipient' })
      ).status
    ).toBe(404);
    expect(
      (
        await courier2.agent
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .send({ beklenen_atama_surumu: 1, teslim_alan: 'Recipient' })
      ).status
    ).toBe(409);
    expect((await bind(c2.id, null, courier2.userId)).status).toBe(200);
    expect((await courier2.agent.get('/api/kurye/gorevler')).body.gorevler).toEqual([]);
    expect(
      (
        await courier2.agent
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .send({ beklenen_atama_surumu: 2, teslim_alan: 'Recipient' })
      ).status
    ).toBe(404);
  });

  it('prevents assignment through generic order writes and denies cross-tenant couriers', async () => {
    const c = await create();
    const cB = await create(ownerB);
    expect(
      (await owner.agent.patch('/api/siparisler/courier-order-a').send({ baku_kurye_id: c.id }))
        .status
    ).toBe(403);
    expect(
      (
        await owner.agent
          .post('/api/siparisler')
          .send({ musteri_adi: 'New', urun_aciklamasi: 'Parcel', baku_kurye_id: c.id })
      ).status
    ).toBe(400);
    expect((await assign('courier-order-a', cB.id)).status).toBe(404);
    expect((await assign('courier-order-b', c.id)).status).toBe(404);
    expect((await assign('courier-order-a', c.id, 0, sales)).status).toBe(403);
    state.siparislerVeritabani[0].lojistik_durumu = 'KANADA_DEPO';
    await bind(c.id, courier.userId);
    await assign('courier-order-a', c.id);
    expect(
      (
        await courier.agent
          .post('/api/kurye/gorevler/courier-order-a/teslim')
          .send({ beklenen_atama_surumu: 1, teslim_alan: 'Recipient' })
      ).status
    ).toBe(409);
  });

  it('persists only explicit bindings and fails closed without granting access on storage failure', async () => {
    const c = await create();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const original = fs.readFileSync(file, 'utf8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Synthetic disk failure');
    });
    try {
      expect((await bind(c.id, courier.userId)).status).toBe(503);
    } finally {
      rename.mockRestore();
    }
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect((await courier.agent.get('/api/kurye/gorevler')).body.kurye).toBeNull();
    await bind(c.id, courier.userId);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))[0].kullanici_id).toBe(courier.userId);
    fs.writeFileSync(file, '{broken');
    expect((await owner.agent.get('/api/kuryeler')).status).toBe(503);
    expect((await courier.agent.get('/api/kurye/gorevler')).status).toBe(503);
  });
});

function boundary(role = 'BAKU_KURYE') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).auth = { role, userId: courier.userId };
    req.tenantId = tenant;
    next();
  });
  server.use('/api', courierRouter);
  return server;
}
describe('Courier database boundary', () => {
  it('refuses to present truncated database results as a complete roster', async () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      then: (resolve: any) => Promise.resolve({ data: [], count: 1001, error: null }).then(resolve),
    };
    fixture.db = { from: () => query };
    const result = await request(boundary('PATRON')).get('/api/kuryeler');
    expect(result.status).toBe(409);
    expect(result.body).not.toHaveProperty('kuryeler');
  });
  it('uses server identity and returns a minimal DTO even if the database returns additional fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        kurye: { id: 'explicit', ad_soyad: 'Courier', bolge: 'Area', token: 'PRIVATE' },
        gorevler: [order('db-order')],
      },
      error: null,
    });
    fixture.db = { rpc };
    const result = await request(boundary()).get('/api/kurye/gorevler?user_id=forged');
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('tomnap_courier_tasks', {
      p_tenant_id: tenant,
      p_user_id: courier.userId,
    });
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
  });
  it('maps transaction conflict and database failure without a local fallback', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PT409', message: 'PRIVATE DATABASE ERROR' },
    });
    fixture.db = { rpc };
    const payload = { beklenen_atama_surumu: 1, teslim_alan: 'Recipient' };
    const before = structuredClone(state.siparislerVeritabani);
    const conflict = await request(boundary())
      .post('/api/kurye/gorevler/courier-order-a/teslim')
      .send(payload);
    expect(conflict.status).toBe(409);
    expect(JSON.stringify(conflict.body)).not.toContain('PRIVATE');
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    expect(
      (await request(boundary()).post('/api/kurye/gorevler/courier-order-a/teslim').send(payload))
        .status
    ).toBe(503);
    expect(state.siparislerVeritabani).toEqual(before);
    expect(fs.existsSync(file)).toBe(false);
  });
});
