import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ db: null as any, inspectImages: vi.fn() }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return fixture.db;
  },
}));
vi.mock('../../../src/server/routes/gorsel', () => ({
  assertTenantImageReferences: fixture.inspectImages,
}));
import inboxRouter from '../../../src/server/routes/inbox';
import * as state from '../../../src/server/services/state';
import { SUPABASE_GECERLI_KOLONLAR } from '../../../src/server/services/siparisFormatlama';

const makeInbox = (tenant = 'tenant-a', extra = {}) => ({
  id: 'transaction-inbox',
  tenant_id: tenant,
  kaynak: 'WHATSAPP' as const,
  gelis_tarihi: new Date().toISOString(),
  gonderen_kullanici: 'Synthetic sender',
  konusma_gecmisi: 'Original message',
  durum: 'BEKLEMEDE' as const,
  oneri_siparis: {
    tenant_id: tenant,
    musteri_adi: 'Synthetic customer',
    urun_aciklamasi: 'Original bag',
    adet: 1,
    toplam_tutar: 100,
    alinan_tutar: 20,
  },
  ...extra,
});
function app(tenant = 'tenant-a') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).tenantId = tenant;
    (req as any).auth = { role: 'PATRON', tenantId: tenant };
    next();
  });
  server.use('/api', inboxRouter);
  return server;
}
function barrier(expected = 1) {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  fixture.inspectImages.mockImplementation(async () => {
    count += 1;
    if (count === expected) signalEntered();
    await gate;
  });
  return { entered, release };
}
function dbFixture() {
  const row = makeInbox();
  const customers: { id: string; tenant_id: string }[] = [];
  const calls: { table: string; filters: [string, any][] }[] = [];
  const rpc = vi.fn();
  const from = vi.fn((table: string) => {
    const filters: [string, any][] = [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: any) => {
        filters.push([key, value]);
        return query;
      },
      maybeSingle: async () => {
        calls.push({ table, filters });
        return {
          data: structuredClone(
            (table === 'inbox_mesajlar' ? [row] : table === 'musteriler' ? customers : []).find(
              (item) => filters.every(([key, value]) => (item as any)[key] === value)
            ) || null
          ),
          error: null,
        };
      },
    };
    return query;
  });
  fixture.db = { from, rpc };
  return { row, customers, calls, rpc, from };
}

beforeEach(() => {
  fixture.db = null;
  fixture.inspectImages.mockReset().mockResolvedValue(undefined);
  state.setOnayBekleyenler([makeInbox()]);
  state.setSiparislerVeritabani([]);
  state.setDemoSiparislerVeritabani([]);
  state.setMusterilerVeritabani([]);
});

describe('Inbox decisions with local and demo storage', () => {
  it.each(['tenant-a', 'demo_sandbox'])(
    'a rejection wins while approval validation is awaiting (%s)',
    async (tenant) => {
      state.setOnayBekleyenler([makeInbox(tenant)]);
      const server = app(tenant);
      const gate = barrier();
      const approval = request(server)
        .post('/api/inbox/transaction-inbox/onayla')
        .send({})
        .then((result) => result);
      await gate.entered;
      try {
        expect(
          (await request(server).post('/api/inbox/transaction-inbox/reddet').send({})).status
        ).toBe(200);
      } finally {
        gate.release();
      }
      expect((await approval).status).toBe(409);
      expect(state.onayBekleyenler[0].durum).toBe('REDDEDILDI');
      expect(state.siparislerVeritabani).toEqual([]);
      expect(state.demoSiparislerVeritabani).toEqual([]);
    }
  );

  it.each(['tenant-a', 'demo_sandbox'])(
    'concurrent approvals return one committed order and preserve the first payload (%s)',
    async (tenant) => {
      state.setOnayBekleyenler([makeInbox(tenant)]);
      const server = app(tenant);
      const gate = barrier(2);
      const requests = ['First contender', 'Second contender'].map((urun_aciklamasi) =>
        request(server)
          .post('/api/inbox/transaction-inbox/onayla')
          .send({
            duzeltilmis_siparis: { musteri_adi: 'Synthetic', urun_aciklamasi, toplam_tutar: 100 },
          })
          .then((result) => result)
      );
      await gate.entered;
      gate.release();
      const results = await Promise.all(requests);
      expect(results.map((result) => result.status)).toEqual([200, 200]);
      expect(new Set(results.map((result) => result.body.siparis.id)).size).toBe(1);
      expect(new Set(results.map((result) => result.body.siparis.urun_aciklamasi)).size).toBe(1);
      expect(results.map((result) => result.body.tekrar).sort()).toEqual([false, true]);
      const selected =
        tenant === 'demo_sandbox' ? state.demoSiparislerVeritabani : state.siparislerVeritabani;
      const other =
        tenant === 'demo_sandbox' ? state.siparislerVeritabani : state.demoSiparislerVeritabani;
      expect(selected).toHaveLength(1);
      expect(selected[0].tenant_id).toBe(tenant);
      expect(other).toHaveLength(0);
      expect(
        (await request(server).post('/api/inbox/transaction-inbox/reddet').send({})).status
      ).toBe(409);
    }
  );

  it('replays an approved result without applying a changed retry body', async () => {
    const server = app();
    const first = await request(server).post('/api/inbox/transaction-inbox/onayla').send({});
    const retry = await request(server)
      .post('/api/inbox/transaction-inbox/onayla')
      .send({ duzeltilmis_siparis: { urun_aciklamasi: 'Overwrite attempt', toplam_tutar: 999 } });
    expect(retry.status).toBe(200);
    expect(retry.body.tekrar).toBe(true);
    expect(retry.body.siparis).toEqual(first.body.siparis);
    expect(state.siparislerVeritabani).toHaveLength(1);
  });

  it('does not silently recreate an approved order that has since been deleted', async () => {
    const server = app();
    expect(
      (await request(server).post('/api/inbox/transaction-inbox/onayla').send({})).status
    ).toBe(200);
    state.setSiparislerVeritabani([]);
    expect(
      (await request(server).post('/api/inbox/transaction-inbox/onayla').send({})).status
    ).toBe(409);
    expect(state.siparislerVeritabani).toHaveLength(0);
  });

  it('rechecks ownership after asynchronous validation when the live inbox row changes', async () => {
    const server = app();
    const gate = barrier();
    const pending = request(server)
      .post('/api/inbox/transaction-inbox/onayla')
      .send({})
      .then((result) => result);
    await gate.entered;
    state.setOnayBekleyenler([makeInbox('tenant-b')]);
    gate.release();
    expect((await pending).status).toBe(404);
    expect(state.onayBekleyenler[0].durum).toBe('BEKLEMEDE');
    expect(state.siparislerVeritabani).toHaveLength(0);
  });

  it('treats repeated rejection as success and cannot approve a rejected message', async () => {
    const server = app();
    const first = await request(server).post('/api/inbox/transaction-inbox/reddet').send({});
    const retry = await request(server).post('/api/inbox/transaction-inbox/reddet').send({});
    expect(first.status).toBe(200);
    expect(first.body.tekrar).toBe(false);
    expect(retry.status).toBe(200);
    expect(retry.body.tekrar).toBe(true);
    expect(
      (await request(server).post('/api/inbox/transaction-inbox/onayla').send({})).status
    ).toBe(409);
    expect(state.siparislerVeritabani).toHaveLength(0);
  });
});

describe('Database inbox transition RPC boundary', () => {
  it.each(['local', 'database'])(
    'preserves validated CRM and invoice fields through approval and replay (%s)',
    async (storage) => {
      const customer = { id: 'customer-a', tenant_id: 'tenant-a' };
      const db = storage === 'database' ? dbFixture() : null;
      if (db) {
        db.customers.push(customer);
        db.rpc.mockImplementation(async (_name, args) => ({
          data: { siparis: { ...args.p_order_payload, id: args.p_order_id }, tekrar: false },
          error: null,
        }));
      } else state.setMusterilerVeritabani([customer as any]);
      const extras = {
        musteri_id: customer.id,
        musteri_tipi: 'VIP',
        kanada_magaza_adi: 'Synthetic store',
        kanada_fatura_no: 'INVOICE-EDITED',
        // An uploaded file path; the format check applies to approval too (Codex R4 F22).
        kanada_fatura_gorseli: '/uploads/synthetic-owned-image.png',
        kargo_agirligi_kg: 1.25,
        kanada_alis_fiyati_cad: 80,
      };
      const server = app();
      const result = await request(server)
        .post('/api/inbox/transaction-inbox/onayla')
        .send({
          duzeltilmis_siparis: {
            ...makeInbox().oneri_siparis,
            kanada_fatura_no: extras.kanada_fatura_no,
            ek_veriler: {
              ...extras,
              kanada_fatura_no: 'INVOICE-ORIGINAL',
              tenant_id: 'tenant-b',
              rol: 'SUPER_ADMIN',
              id: 'forged-order',
            },
          },
        });
      expect(result.status).toBe(200);
      expect(result.body.siparis).toMatchObject({ tenant_id: 'tenant-a', ...extras });
      expect(result.body.siparis.ek_veriler).toEqual(extras);
      expect(result.body.siparis).not.toHaveProperty('rol');
      expect(result.body.siparis.id).not.toBe('forged-order');
      expect(fixture.inspectImages).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kanada_fatura_gorseli: extras.kanada_fatura_gorseli })
      );
      if (db) {
        expect(db.calls).toContainEqual({
          table: 'musteriler',
          filters: [
            ['id', customer.id],
            ['tenant_id', 'tenant-a'],
          ],
        });
        expect(db.rpc.mock.calls[0][1].p_order_payload.ek_veriler).toEqual(extras);
        db.row.durum = 'ONAYLANDI' as any;
        db.rpc.mockResolvedValue({
          data: { siparis: result.body.siparis, tekrar: true },
          error: null,
        });
      }
      const retry = await request(server).post('/api/inbox/transaction-inbox/onayla').send({});
      expect(retry.status).toBe(200);
      expect(retry.body.tekrar).toBe(true);
      expect(retry.body.siparis.ek_veriler).toEqual(extras);
    }
  );

  it.each(['local', 'database'])(
    'rejects a foreign customer embedded in ek_veriler before approval (%s)',
    async (storage) => {
      const customer = { id: 'customer-b', tenant_id: 'tenant-b' };
      const db = storage === 'database' ? dbFixture() : null;
      if (db) db.customers.push(customer);
      else state.setMusterilerVeritabani([customer as any]);
      const result = await request(app())
        .post('/api/inbox/transaction-inbox/onayla')
        .send({
          duzeltilmis_siparis: {
            ...makeInbox().oneri_siparis,
            ek_veriler: { musteri_id: customer.id },
          },
        });
      expect(result.status).toBe(404);
      expect(state.siparislerVeritabani).toHaveLength(0);
      expect(state.onayBekleyenler[0].durum).toBe('BEKLEMEDE');
      if (db) expect(db.rpc).not.toHaveBeenCalled();
    }
  );

  it('submits one tenant-bound atomic RPC containing only writable physical columns', async () => {
    const db = dbFixture();
    db.rpc.mockImplementation(async (_name, args) => ({
      data: {
        siparis: { ...args.p_order_payload, id: args.p_order_id, kalan_tutar: 80 },
        tekrar: false,
      },
      error: null,
    }));
    const before = structuredClone([state.onayBekleyenler, state.siparislerVeritabani]);
    const result = await request(app()).post('/api/inbox/transaction-inbox/onayla').send({});
    expect(result.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = db.rpc.mock.calls[0];
    expect(name).toBe('tomnap_approve_inbox');
    expect(args).toMatchObject({
      p_tenant_id: 'tenant-a',
      p_inbox_id: 'transaction-inbox',
      p_order_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(
      Object.keys(args.p_order_payload).every((key) => SUPABASE_GECERLI_KOLONLAR.has(key))
    ).toBe(true);
    expect(args.p_order_payload).not.toHaveProperty('id');
    expect(args.p_order_payload).not.toHaveProperty('kalan_tutar');
    expect(db.calls).toEqual([
      {
        table: 'inbox_mesajlar',
        filters: [
          ['id', 'transaction-inbox'],
          ['tenant_id', 'tenant-a'],
        ],
      },
    ]);
    expect([state.onayBekleyenler, state.siparislerVeritabani]).toEqual(before);
  });

  it('uses the locked decision when rejection wins after its preliminary read', async () => {
    const db = dbFixture();
    const gate = barrier();
    const pending = request(app())
      .post('/api/inbox/transaction-inbox/onayla')
      .send({})
      .then((result) => result);
    await gate.entered;
    db.row.durum = 'REDDEDILDI' as any;
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PT409' } });
    gate.release();
    expect((await pending).status).toBe(409);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(state.siparislerVeritabani).toHaveLength(0);
  });

  it('returns an already approved database result using the RPC rather than cached orders', async () => {
    const db = dbFixture();
    db.row.durum = 'ONAYLANDI' as any;
    db.rpc.mockResolvedValue({
      data: {
        siparis: {
          id: 'persisted-order',
          tenant_id: 'tenant-a',
          urun_aciklamasi: 'Original persisted product',
        },
        tekrar: true,
      },
      error: null,
    });
    const result = await request(app())
      .post('/api/inbox/transaction-inbox/onayla')
      .send({ duzeltilmis_siparis: { urun_aciklamasi: 'Changed' } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      tekrar: true,
      siparis: { id: 'persisted-order', urun_aciklamasi: 'Original persisted product' },
    });
    expect(db.rpc.mock.calls[0][1].p_order_payload).toEqual({});
    expect(fixture.inspectImages).not.toHaveBeenCalled();
  });

  it.each([
    ['PT404', 404],
    ['PT409', 409],
    ['PT400', 400],
    ['22P02', 400],
    ['23514', 400],
    ['XX000', 503],
  ])('maps %s safely to HTTP %i without local fallback', async (code, status) => {
    const db = dbFixture();
    db.rpc.mockResolvedValue({ data: null, error: { code, message: 'Private database detail' } });
    const before = structuredClone(state.onayBekleyenler);
    const result = await request(app()).post('/api/inbox/transaction-inbox/onayla').send({});
    expect(result.status).toBe(status);
    expect(JSON.stringify(result.body)).not.toContain('Private database detail');
    expect(state.onayBekleyenler).toEqual(before);
    expect(state.siparislerVeritabani).toHaveLength(0);
  });

  it.each([
    null,
    { siparis: { id: 'foreign-order', tenant_id: 'tenant-b' }, tekrar: false },
    { siparis: { id: 'order', tenant_id: 'tenant-a' } },
  ])('fails closed on an unconfirmed or wrongly scoped RPC result %j', async (data) => {
    const db = dbFixture();
    db.rpc.mockResolvedValue({ data, error: null });
    expect((await request(app()).post('/api/inbox/transaction-inbox/onayla').send({})).status).toBe(
      503
    );
    expect(state.siparislerVeritabani).toHaveLength(0);
  });

  it('performs rejection directly through its atomic RPC, including tenant isolation', async () => {
    const db = dbFixture();
    db.rpc.mockResolvedValue({ data: { durum: 'REDDEDILDI', tekrar: false }, error: null });
    const result = await request(app()).post('/api/inbox/transaction-inbox/reddet').send({});
    expect(result.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith('tomnap_reject_inbox', {
      p_tenant_id: 'tenant-a',
      p_inbox_id: 'transaction-inbox',
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(state.onayBekleyenler[0].durum).toBe('BEKLEMEDE');
  });

  it('rejects invalid quantity before calling the RPC', async () => {
    const db = dbFixture();
    expect(
      (
        await request(app())
          .post('/api/inbox/transaction-inbox/onayla')
          .send({ duzeltilmis_siparis: { adet: 0 } })
      ).status
    ).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
