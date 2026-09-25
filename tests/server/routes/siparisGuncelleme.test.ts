import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Codex R3 F1/F2/F9 and OPEN_QUESTIONS 32: PATCH /api/siparisler/:id must write only
// what the person changed. The handler reads the order first; if it then writes the
// whole row it puts back stale money (alinan_tutar) and AWB values that a concurrent
// payment or AWB approval wrote in between.
const env = vi.hoisted(() => ({
  db: null as unknown,
  row: {} as Record<string, unknown>,
  writes: [] as Array<{ via: string; values: Record<string, unknown>; expected?: unknown }>,
}));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import router from '../../../src/server/routes/siparisler';

function fakeDb() {
  return {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: () => Promise.resolve({ data: env.row, error: null }),
        single: () => Promise.resolve({ data: env.row, error: null }),
        update: (values: Record<string, unknown>) => {
          env.writes.push({ via: 'update', values });
          return {
            eq: function () {
              return this;
            },
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: { ...env.row, ...values }, error: null }),
            }),
          };
        },
      };
      return chain;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name !== 'tomnap_siparis_guncelle')
        return Promise.resolve({ data: null, error: { code: 'XX000' } });
      const values = args.p_degisiklik as Record<string, unknown>;
      env.writes.push({ via: 'rpc', values, expected: args.p_beklenen });
      return Promise.resolve({ data: { ...env.row, ...values }, error: null });
    },
  };
}

function app(role: string, tenant = 'guncelle_a') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.tenantId = tenant;
    req.auth = { role, tenantId: tenant, userId: 'u-1' } as never;
    next();
  });
  server.use('/api', router);
  return server;
}

/** An order as the database returns it (the handler's stale read). */
const order = (extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  tenant_id: 'guncelle_a',
  musteri_adi: 'Aytən',
  urun_aciklamasi: 'Çanta',
  adet: 1,
  toplam_tutar: 100,
  alinan_tutar: 0,
  kalan_tutar: 100,
  para_birimi: 'AZN',
  finans_durumu: 'BEKLIYOR',
  lojistik_durumu: 'ULUSLARARASI_KARGO',
  uluslararasi_kargo_kodu: null,
  baku_tahsilat_notu: '',
  kurye_atama_surumu: 0,
  eksik_bilgiler: [],
  ek_veriler: {},
  is_demo: false,
  ...extra,
});
const MONEY_AND_AWB = ['alinan_tutar', 'finans_durumu', 'toplam_tutar', 'uluslararasi_kargo_kodu'];

beforeEach(() => {
  env.db = fakeDb();
  env.writes = [];
});

describe('PATCH /api/siparisler/:id writes only what changed (Codex R3 F1/F2)', () => {
  it('a note edit writes the note, never the money or AWB it read before', async () => {
    env.row = order();
    const response = await request(app('PATRON'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ baku_tahsilat_notu: 'Qapıda ödəyəcək' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(env.writes).toHaveLength(1);
    const written = Object.keys(env.writes[0].values);
    expect(written).toContain('baku_tahsilat_notu');
    for (const key of MONEY_AND_AWB) expect([key, written.includes(key)]).toEqual([key, false]);
  });

  it('a money or AWB edit is conditioned on the value it was based on (optimistic lock)', async () => {
    env.row = order({ alinan_tutar: 20, finans_durumu: 'KISMI_ODEME', kalan_tutar: 80 });
    const paid = await request(app('BAKU_FINANS'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ alinan_tutar: 50 });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(env.writes[0]).toMatchObject({
      values: { alinan_tutar: 50, finans_durumu: 'KISMI_ODEME' },
      expected: { alinan_tutar: 20, toplam_tutar: 100 },
    });

    env.writes = [];
    const awb = await request(app('PATRON'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ uluslararasi_kargo_kodu: 'AWB123456' });
    expect(awb.status).toBe(200);
    expect(env.writes[0]).toMatchObject({
      values: { uluslararasi_kargo_kodu: 'AWB123456' },
      expected: { uluslararasi_kargo_kodu: null },
    });
  });

  it('writes nothing when nothing changed', async () => {
    env.row = order();
    const response = await request(app('PATRON'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ musteri_adi: 'Aytən', alinan_tutar: 0 });
    expect(response.status).toBe(200);
    expect(env.writes).toEqual([]);
  });

  it('never sends the derived money or status columns of a v2 order, and locks its currency (F9)', async () => {
    env.row = order({ model_surumu: 2, sahip_kullanici_id: 'u-1' });
    const note = await request(app('PATRON'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ ozel_not: 'Zəng edin' });
    expect(note.status).toBe(200);
    for (const key of [...MONEY_AND_AWB, 'lojistik_durumu', 'adet', 'para_birimi'])
      expect([key, key in env.writes[0].values]).toEqual([key, false]);
    env.writes = [];
    const currency = await request(app('PATRON'))
      .patch(`/api/siparisler/${env.row.id}`)
      .send({ para_birimi: 'USD' });
    expect(currency.status).toBe(409);
    expect(env.writes).toEqual([]);
  });

  it('a platform admin changes no collected amount on v1 either (OPEN_QUESTIONS 32)', async () => {
    env.row = order();
    for (const body of [{ alinan_tutar: 30 }, { finans_durumu: 'ODENDI' }]) {
      const response = await request(app('SUPER_ADMIN'))
        .patch(`/api/siparisler/${env.row.id}`)
        .send(body);
      expect([body, response.status]).toEqual([body, 403]);
    }
    expect(env.writes).toEqual([]);
    // Other fields stay editable for the admin.
    expect(
      (
        await request(app('SUPER_ADMIN'))
          .patch(`/api/siparisler/${env.row.id}`)
          .send({ musteri_adi: 'Aytən Məmmədova' })
      ).status
    ).toBe(200);
  });
});
