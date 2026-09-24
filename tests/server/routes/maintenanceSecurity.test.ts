import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const env = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import router from '../../../src/server/routes/veritabani';
import * as state from '../../../src/server/services/state';
function app(tenant = 'restore_a') {
  const server = express();
  server.use(express.json({ limit: '12mb' }));
  server.use((req, _res, next) => {
    req.tenantId = tenant;
    req.auth = { role: 'SUPER_ADMIN', tenantId: tenant } as any;
    next();
  });
  server.use('/api', router);
  return server;
}
const row = (tenant = 'restore_a', id = randomUUID()) => ({
  id,
  tenant_id: tenant,
  musteri_adi: 'Synthetic',
  urun_aciklamasi: 'Bag',
  adet: 1,
  toplam_tutar: 100,
  alinan_tutar: 30,
  olusturma_tarihi: '2020-01-01T00:00:00Z',
});
const restore = (rows: any[], extra = {}) => ({
  siparisler: rows,
  islem_id: randomUUID(),
  ...extra,
});
beforeEach(() => {
  env.db = null;
  state.setFirmalarVeritabani([
    { id: 'restore_a', ad: 'A' },
    { id: 'restore_b', ad: 'B' },
    { id: 'demo_sandbox', ad: 'Demo' },
  ] as any);
  state.setSiparislerVeritabani([row(), row('restore_b')]);
});
describe('order maintenance integrity', () => {
  it('rejects global restore before mutation', async () => {
    const before = structuredClone(state.siparislerVeritabani);
    expect(
      (
        await request(app('all'))
          .post('/api/veritabani/yedek-yukle')
          .send(restore([row()]))
      ).status
    ).toBe(400);
    expect(state.siparislerVeritabani).toEqual(before);
  });
  it.each(['restore_b', undefined])('rejects foreign or missing row tenant: %s', async (tenant) => {
    const order = row();
    order.tenant_id = tenant as any;
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore([order]))
      ).status
    ).toBe(403);
  });
  it('rejects metadata tenant smuggling', async () => {
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore([{ ...row(), eksik_bilgiler: ['META:tenant_id=restore_b'] }]))
      ).status
    ).toBe(403);
  });
  it('defaults to merge and preserves existing orders', async () => {
    const before = structuredClone(state.siparislerVeritabani),
      order = row();
    const response = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restore([order]));
    expect(response.status).toBe(200);
    expect(state.siparislerVeritabani).toEqual(expect.arrayContaining(before));
    expect(state.siparislerVeritabani).toHaveLength(3);
    expect(state.siparislerVeritabani.find((r) => r.id === order.id).olusturma_tarihi).toBe(
      '2020-01-01T00:00:00.000Z'
    );
  });
  it('requires explicit tenant replacement confirmation', async () => {
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore([row()], { temizleVeYukle: true }))
      ).status
    ).toBe(403);
  });
  it('same replacement retry preserves intervening orders and other tenant', async () => {
    const foreign = state.siparislerVeritabani[1];
    const body = restore([row()], { temizleVeYukle: true, onay_kodu: 'DEGISTIR:restore_a' });
    expect((await request(app()).post('/api/veritabani/yedek-yukle').send(body)).status).toBe(200);
    const intervening = row();
    state.siparislerVeritabani.push(intervening);
    const again = await request(app()).post('/api/veritabani/yedek-yukle').send(body);
    expect(again.body.tekrar).toBe(true);
    expect(state.siparislerVeritabani).toEqual(expect.arrayContaining([foreign, intervening]));
    expect(state.siparislerVeritabani).toHaveLength(3);
  });
  it('rejects operation-key reuse with changed payload', async () => {
    const body = restore([row()]);
    await request(app()).post('/api/veritabani/yedek-yukle').send(body);
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send({ ...body, siparisler: [row()] })
      ).status
    ).toBe(409);
  });
  it('rejects duplicate IDs, negative money and unknown key before mutation', async () => {
    const order = row();
    for (const body of [
      restore([order, order]),
      restore([{ ...order, toplam_tutar: -1 }]),
      { siparisler: [order] },
    ])
      expect((await request(app()).post('/api/veritabani/yedek-yukle').send(body)).status).toBe(
        400
      );
    expect(state.siparislerVeritabani).toHaveLength(2);
  });
  it('rejects replacing another tenant UUID', async () => {
    const id = state.siparislerVeritabani[1].id;
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(
            restore([row('restore_a', id)], {
              temizleVeYukle: true,
              onay_kodu: 'DEGISTIR:restore_a',
            })
          )
      ).status
    ).toBe(409);
    expect(state.siparislerVeritabani).toHaveLength(2);
  });
  it('clear is scoped and retries do not clear new orders', async () => {
    const body = { islem_id: randomUUID(), onay_kodu: 'SIL:restore_a' };
    expect((await request(app()).post('/api/veritabani/temizle').send(body)).status).toBe(200);
    const fresh = row();
    state.siparislerVeritabani.push(fresh);
    expect((await request(app()).post('/api/veritabani/temizle').send(body)).body.tekrar).toBe(
      true
    );
    expect(state.siparislerVeritabani).toHaveLength(2);
  });
  it('refuses loading demo over live firm', async () => {
    expect(
      (await request(app()).post('/api/veritabani/demo-yukle').send({ islem_id: randomUUID() }))
        .status
    ).toBe(403);
  });
  it('scoped backup and status do not include other firm', async () => {
    const backup = await request(app()).get('/api/veritabani/yedek-al');
    expect(backup.body.toplam_siparis).toBe(1);
    expect(backup.body.siparisler.every((r: any) => r.tenant_id === 'restore_a')).toBe(true);
    expect((await request(app()).get('/api/veritabani/durum')).body.toplam_siparis).toBe(1);
  });
  it('preserves business metadata and IDs through a full backup replacement round trip', async () => {
    state.setMusterilerVeritabani([
      { id: 'customer-a', tenant_id: 'restore_a', ad_soyad: 'Synthetic' },
    ] as any);
    const original = {
      ...row(),
      guncellenme_tarihi: '2024-01-01T00:00:00.000Z',
      kanada_alis_fiyati_cad: 45,
      kargo_ucreti_azn: 17,
      kanada_fatura_no: 'INV-123',
      musteri_id: 'customer-a',
      islem_gecmisi: [{ tip: 'note', detay: 'Kept' }],
    };
    state.setSiparislerVeritabani([original, row('restore_b')]);
    const backup = (await request(app()).get('/api/veritabani/yedek-al')).body.siparisler;
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore(backup, { temizleVeYukle: true, onay_kodu: 'DEGISTIR:restore_a' }))
      ).status
    ).toBe(200);
    expect(state.siparislerVeritabani.find((r) => r.id === original.id)).toMatchObject({
      ...original,
      olusturma_tarihi: '2020-01-01T00:00:00.000Z',
    });
  });
  it('rejects a foreign CRM reference inside restored metadata', async () => {
    state.setMusterilerVeritabani([{ id: 'foreign-customer', tenant_id: 'restore_b' }] as any);
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore([{ ...row(), ek_veriler: { musteri_id: 'foreign-customer' } }]))
      ).status
    ).toBe(404);
  });
  it('accepts the v1 values of the A8 columns and refuses v2 orders in a v1 backup', async () => {
    const before = structuredClone(state.siparislerVeritabani);
    for (const extra of [
      { model_surumu: 2 },
      { sahip_kullanici_id: 'owner' },
      { model_surumu: 2, sahip_kullanici_id: 'owner' },
    ]) {
      const response = await request(app())
        .post('/api/veritabani/yedek-yukle')
        .send(restore([{ ...row(), ...extra }]));
      expect([extra, response.status, response.body.hata]).toEqual([
        extra,
        400,
        'v2 siparişleri bu yedekle yüklenemez.',
      ]);
    }
    expect(state.siparislerVeritabani).toEqual(before);
    const v1 = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restore([{ ...row(), model_surumu: 1, sahip_kullanici_id: null }]));
    expect(v1.status).toBe(200);
  });
  it('rejects unknown fields instead of silently losing their contents', async () => {
    const response = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restore([{ ...row(), future_important_field: 123 }]));
    expect(response.status).toBe(400);
    expect(state.siparislerVeritabani).toHaveLength(2);
  });
  it('rejects zero quantities instead of defaulting them to one', async () => {
    expect(
      (
        await request(app())
          .post('/api/veritabani/yedek-yukle')
          .send(restore([{ ...row(), adet: 0 }]))
      ).status
    ).toBe(400);
  });
  it('database failures never mutate local state or claim success', async () => {
    const before = structuredClone(state.siparislerVeritabani);
    env.db = { rpc: vi.fn().mockResolvedValue({ error: { message: 'sensitive backend detail' } }) };
    const response = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restore([row()]));
    expect(response.status).toBe(503);
    expect(response.text).not.toContain('sensitive');
    expect(state.siparislerVeritabani).toEqual(before);
    for (const path of ['yedek-al', 'durum'])
      expect((await request(app()).get(`/api/veritabani/${path}`)).status).toBe(503);
  });
  it('uses one atomic RPC and does not publish DB data to local cache', async () => {
    const before = structuredClone(state.siparislerVeritabani);
    env.db = {
      rpc: vi
        .fn()
        .mockResolvedValue({ data: { toplam: 1, hedef_tenant: 'restore_a', tekrar: false } }),
    };
    const order = row(),
      body = restore([order]);
    expect((await request(app()).post('/api/veritabani/yedek-yukle').send(body)).status).toBe(200);
    expect(env.db.rpc).toHaveBeenCalledTimes(1);
    expect(env.db.rpc).toHaveBeenCalledWith(
      'tomnap_restore_orders',
      expect.objectContaining({
        p_tenant_id: 'restore_a',
        p_operation_id: body.islem_id,
        p_mode: 'merge',
        p_orders: [expect.objectContaining({ id: order.id })],
      })
    );
    expect(state.siparislerVeritabani).toEqual(before);
  });
  it('reports explicit export size error instead of sending a truncated backup', async () => {
    env.db = { rpc: vi.fn().mockResolvedValue({ error: { code: '54000' } }) };
    expect((await request(app()).get('/api/veritabani/yedek-al')).status).toBe(413);
  });
  it('accepts empty authoritative backup without memory fallback', async () => {
    env.db = { rpc: vi.fn().mockResolvedValue({ data: [] }) };
    const response = await request(app()).get('/api/veritabani/yedek-al');
    expect(response.status).toBe(200);
    expect(response.body.siparisler).toEqual([]);
  });
});
