import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AuthContext } from '../../../src/server/services/sessions';
import type { FirmaTenantItem, KullaniciKaydi } from '../../../src/server/types';

// Codex R5-B01 (+ OQ 42): v1 maintenance (merge, clear-and-load, clear) must never touch
// a boutique that has v2 orders. The incoming v1 row would overwrite a v2 order's money
// header apart from its ledger; clear-and-load and clear would delete v2 orders.
// The rule is checked in the route (early), in the memory path and in the restore RPC
// (migration 21, tests/sql/yedek-ve-ters-kayit-korumasi.sql).
const env = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import router, { maintain } from '../../../src/server/routes/veritabani';
import * as state from '../../../src/server/services/state';
import { v2OdemeKaydet, v2SiparisOdemeleri } from '../../../src/server/services/v2/odemeStore';

const V2 = 'yedek_v2_butik',
  V1 = 'yedek_v1_butik',
  PATRON = 'yedek-v2-patron',
  KOD = 'YEDEK_V2_SIPARIS_VAR';

function app(tenant: string) {
  const server = express();
  server.use(express.json({ limit: '12mb' }));
  server.use((req, _res, next) => {
    req.tenantId = tenant;
    req.auth = { role: 'SUPER_ADMIN', tenantId: tenant } as unknown as AuthContext;
    next();
  });
  server.use('/api', router);
  return server;
}
const v1Satiri = (tenant: string, id = randomUUID(), alinan = 0) => ({
  id,
  tenant_id: tenant,
  musteri_adi: 'Synthetic v1',
  urun_aciklamasi: 'Bag',
  adet: 1,
  toplam_tutar: 100,
  alinan_tutar: alinan,
  olusturma_tarihi: '2026-01-01T00:00:00Z',
});
const yukleme = (tenant: string, rows: unknown[], replace: boolean) => ({
  siparisler: rows,
  islem_id: randomUUID(),
  ...(replace ? { temizleVeYukle: true, onay_kodu: `DEGISTIR:${tenant}` } : {}),
});
const kayit = (id: string) => state.siparislerVeritabani.find((r) => r.id === id);

/** The R5 counterexample: one v2 order of 100 AZN with 40 AZN in its ledger. */
async function v2SiparisiOdemeli() {
  const id = randomUUID();
  state.setSiparislerVeritabani([
    {
      ...v1Satiri(V2, id),
      musteri_adi: 'Synthetic v2',
      model_surumu: 2,
      sahip_kullanici_id: PATRON,
      para_birimi: 'AZN',
      finans_durumu: 'BEKLIYOR',
    },
    v1Satiri(V1),
  ]);
  await v2OdemeKaydet(V2, PATRON, {
    siparisId: id,
    tutarAzn: 40,
    yontem: 'NAKIT',
    kaynak: 'BUTIK',
    almaZamani: null,
    aciklama: null,
    islemAnahtari: randomUUID(),
  });
  expect(kayit(id)?.alinan_tutar).toBe(40);
  return id;
}

beforeEach(() => {
  env.db = null;
  state.setFirmalarVeritabani([
    { id: V2, ad: 'V2' },
    { id: V1, ad: 'V1' },
    { id: 'demo_sandbox', ad: 'Demo' },
  ] as unknown as FirmaTenantItem[]);
  state.setKullanicilarVeritabani([
    {
      id: PATRON,
      tenant_id: V2,
      ad_soyad: 'Synthetic Owner',
      email: 'owner@example.invalid',
      rol: 'PATRON',
      durum: 'AKTIF',
      olusturma_tarihi: '2026-01-01T00:00:00Z',
    },
  ] satisfies KullaniciKaydi[]);
});

describe('v1 backup over a boutique with v2 orders (R5-B01, memory)', () => {
  it('clear-and-load with the v2 order id is refused; header and ledger stay as they were', async () => {
    const id = await v2SiparisiOdemeli();
    const response = await request(app(V2))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V2, [v1Satiri(V2, id, 0)], true));
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ basarili: false, kod: KOD });
    expect(kayit(id)).toMatchObject({ alinan_tutar: 40, model_surumu: 2 });
    expect((await v2SiparisOdemeleri(V2, id))?.ozet.odenenTutar).toBe(40);
  });

  it('a plain merge into the same boutique is refused too', async () => {
    const id = await v2SiparisiOdemeli();
    const before = structuredClone(state.siparislerVeritabani);
    const response = await request(app(V2))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V2, [v1Satiri(V2)], false));
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(state.siparislerVeritabani).toEqual(before);
    expect(kayit(id)?.alinan_tutar).toBe(40);
  });

  it('a boutique without v2 orders keeps the old restore flow', async () => {
    const id = await v2SiparisiOdemeli();
    const yeni = v1Satiri(V1);
    const response = await request(app(V1))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V1, [yeni], true));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ basarili: true, toplam: 1, hedef_tenant: V1 });
    expect(state.siparislerVeritabani.filter((r) => r.tenant_id === V1).map((r) => r.id)).toEqual([
      yeni.id,
    ]);
    // The other boutique's v2 order is untouched.
    expect(kayit(id)).toMatchObject({ alinan_tutar: 40, model_surumu: 2 });
  });

  it('the memory path refuses on its own (demo load reaches it without the route check)', async () => {
    const v2 = { ...v1Satiri('demo_sandbox'), model_surumu: 2 };
    state.setDemoSiparislerVeritabani([v2]);
    const response = await request(app('demo_sandbox'))
      .post('/api/veritabani/demo-yukle')
      .send({ islem_id: randomUUID() });
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(state.demoSiparislerVeritabani).toEqual([v2]);
  });

  // OQ 42: plain clear is v1 maintenance too; it never deletes v2 orders.
  const temizle = (tenant: string) => ({ islem_id: randomUUID(), onay_kodu: `SIL:${tenant}` });
  it('clear is refused in a boutique with v2 orders; nothing is deleted', async () => {
    const id = await v2SiparisiOdemeli();
    const before = structuredClone(state.siparislerVeritabani);
    const response = await request(app(V2)).post('/api/veritabani/temizle').send(temizle(V2));
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ basarili: false, kod: KOD });
    expect(state.siparislerVeritabani).toEqual(before);
    expect((await v2SiparisOdemeleri(V2, id))?.ozet.odenenTutar).toBe(40);
  });

  it('the memory path refuses every mode on its own, clear included', async () => {
    const id = await v2SiparisiOdemeli();
    const before = structuredClone(state.siparislerVeritabani);
    for (const [mode, rows] of [
      ['clear', []],
      ['replace', [{ ...v1Satiri(V2, id), alinan_tutar: 0 }]],
      ['merge', [v1Satiri(V2)]],
    ] as const)
      await expect(maintain(V2, randomUUID(), mode, [...rows])).rejects.toMatchObject({
        status: 409,
        kod: KOD,
      });
    expect(state.siparislerVeritabani).toEqual(before);
  });

  it('clear in a boutique without v2 orders works as before', async () => {
    const id = await v2SiparisiOdemeli();
    const response = await request(app(V1)).post('/api/veritabani/temizle').send(temizle(V1));
    expect(response.status).toBe(200);
    expect(state.siparislerVeritabani.filter((r) => r.tenant_id === V1)).toEqual([]);
    expect(kayit(id)).toMatchObject({ alinan_tutar: 40, model_surumu: 2 });
  });
});

/** A database stub: the route's v2 lookup and the restore RPC. */
function veritabani(v2: { data: unknown[] } | { error: unknown }, rpc: unknown) {
  const sorgu: string[] = [];
  const zincir = {
    select(kolonlar: string) {
      sorgu.push(`select ${kolonlar}`);
      return zincir;
    },
    eq(kolon: string, deger: unknown) {
      sorgu.push(`${kolon}=${String(deger)}`);
      return zincir;
    },
    limit(n: number) {
      sorgu.push(`limit ${n}`);
      return Promise.resolve('error' in v2 ? { data: null, ...v2 } : { error: null, ...v2 });
    },
  };
  return {
    sorgu,
    from: vi.fn((tablo: string) => {
      sorgu.push(`from ${tablo}`);
      return zincir;
    }),
    rpc: vi.fn().mockResolvedValue(rpc),
  };
}
const fisi = (tenant: string) => ({ data: { toplam: 1, hedef_tenant: tenant, tekrar: false } });

describe('v1 backup over a boutique with v2 orders (R5-B01, database)', () => {
  it('the route refuses before the RPC; the lookup is filtered to the boutique', async () => {
    const db = veritabani({ data: [{ id: randomUUID() }] }, fisi(V2));
    env.db = db;
    const response = await request(app(V2))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V2, [v1Satiri(V2)], true));
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.sorgu).toEqual([
      'from siparisler',
      'select id',
      `tenant_id=${V2}`,
      'model_surumu=2',
      'limit 1',
    ]);
  });

  it('a v2 order that appears after the lookup is refused by the RPC (PT409)', async () => {
    const db = veritabani({ data: [] }, { error: { code: 'PT409', message: 'v2' } });
    env.db = db;
    const response = await request(app(V2))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V2, [v1Satiri(V2)], false));
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('without v2 orders the RPC runs as before', async () => {
    const db = veritabani({ data: [] }, fisi(V1));
    env.db = db;
    const response = await request(app(V1))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V1, [v1Satiri(V1)], true));
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith(
      'tomnap_restore_orders',
      expect.objectContaining({ p_tenant_id: V1, p_mode: 'replace' })
    );
  });

  it('a failed lookup fails closed: 503, no RPC', async () => {
    const db = veritabani({ error: { message: 'backend detail' } }, fisi(V2));
    env.db = db;
    const response = await request(app(V2))
      .post('/api/veritabani/yedek-yukle')
      .send(yukleme(V2, [v1Satiri(V2)], false));
    expect(response.status).toBe(503);
    expect(response.text).not.toContain('backend detail');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('clear: the route refuses before the RPC with the boutique-filtered lookup', async () => {
    const db = veritabani({ data: [{ id: randomUUID() }] }, fisi(V2));
    env.db = db;
    const response = await request(app(V2))
      .post('/api/veritabani/temizle')
      .send({ islem_id: randomUUID(), onay_kodu: `SIL:${V2}` });
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.sorgu).toContain(`tenant_id=${V2}`);
  });

  it('clear: a v2 order that appears after the lookup is refused by the RPC (PT409)', async () => {
    const db = veritabani({ data: [] }, { error: { code: 'PT409', message: 'v2' } });
    env.db = db;
    const response = await request(app(V2))
      .post('/api/veritabani/temizle')
      .send({ islem_id: randomUUID(), onay_kodu: `SIL:${V2}` });
    expect(response.status).toBe(409);
    expect(response.body.kod).toBe(KOD);
    expect(db.rpc).toHaveBeenCalledWith(
      'tomnap_restore_orders',
      expect.objectContaining({ p_tenant_id: V2, p_mode: 'clear' })
    );
  });
});
