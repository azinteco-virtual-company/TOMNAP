import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  op: 'select' | 'insert' | 'upsert';
  filters: Array<[string, unknown]>;
  payload?: Record<string, unknown>;
  options?: unknown;
}
interface Answer {
  data: unknown;
  error: unknown;
}
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  answer: (_call: Call): Answer => ({ data: null, error: null }),
}));

function builder(call: Call) {
  const answer = () => Promise.resolve(db.answer(call));
  const chain = {
    select: () => chain,
    insert: (payload: Record<string, unknown>) => (
      (call.op = 'insert'),
      (call.payload = payload),
      chain
    ),
    upsert: (payload: Record<string, unknown>, options: unknown) => (
      (call.op = 'upsert'),
      (call.payload = payload),
      (call.options = options),
      chain
    ),
    eq: (key: string, value: unknown) => (call.filters.push([key, value]), chain),
    order: () => chain,
    limit: () => chain,
    single: answer,
    maybeSingle: answer,
    then: (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) =>
      answer().then(resolve, reject),
  };
  return chain;
}
vi.mock('../../../src/server/services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      db.calls.push(call);
      return builder(call);
    },
  },
}));

import { kurEkle, kurlariListele } from '../../../src/server/services/v2/kurlar';
import { ayarlariGuncelle, ayarlariOku } from '../../../src/server/services/v2/ayarlar';

const rate = (tenant: string, extra: Record<string, unknown> = {}) => ({
  id: `${tenant}-rate`,
  tenant_id: tenant,
  para_birimi: 'CAD',
  tarih: '2026-09-20',
  azn_karsiligi: '1.234500',
  kaynak: null,
  giren_kullanici_id: 'u-1',
  olusturma_zamani: '2026-09-20T10:00:00.000Z',
  ...extra,
});
const settings = (tenant: string) => ({
  tenant_id: tenant,
  aylik_beyan_sinir_usd: '300.00',
  varsayilan_kg_fiyati_azn: null,
  prim_orani_varsayilan: '0.0500',
  guncelleyen_kullanici_id: 'u-1',
  guncellenme_zamani: '2026-09-20T10:00:00.000Z',
});

beforeEach(() => {
  db.calls = [];
  db.answer = () => ({ data: null, error: null });
});

describe('v2 stores on Supabase (service_role): every query is tenant-scoped (A7)', () => {
  it('filters every rate read by the session tenant', async () => {
    db.answer = (call) => ({ data: call.op === 'select' ? [rate('t-a')] : null, error: null });
    const result = await kurlariListele('t-a');
    expect(db.calls.length).toBe(3);
    for (const call of db.calls) {
      expect(call.table).toBe('kurlar');
      expect(call.filters).toContainEqual(['tenant_id', 't-a']);
    }
    expect(result.guncel.CAD).toMatchObject({ tenantId: 't-a', aznKarsiligi: 1.2345 });
  });

  it('writes the tenant and the author from the session only', async () => {
    db.answer = (call) => ({
      data: rate('t-a', { para_birimi: call.payload?.para_birimi }),
      error: null,
    });
    await kurEkle('t-a', 'u-1', {
      paraBirimi: 'CAD',
      tarih: '2026-09-20',
      aznKarsiligi: 1.2345,
      kaynak: null,
    });
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({
      table: 'kurlar',
      op: 'insert',
      payload: {
        tenant_id: 't-a',
        giren_kullanici_id: 'u-1',
        para_birimi: 'CAD',
        azn_karsiligi: 1.2345,
      },
    });
  });

  it('refuses a foreign row even if the database returned one', async () => {
    db.answer = () => ({ data: [rate('t-b')], error: null });
    await expect(kurlariListele('t-a')).rejects.toMatchObject({ status: 503 });
    db.answer = () => ({ data: rate('t-b'), error: null });
    await expect(
      kurEkle('t-a', 'u-1', {
        paraBirimi: 'CAD',
        tarih: '2026-09-20',
        aznKarsiligi: 1.2,
        kaynak: null,
      })
    ).rejects.toMatchObject({ status: 503 });
    db.answer = () => ({ data: settings('t-b'), error: null });
    await expect(ayarlariOku('t-a')).rejects.toMatchObject({ status: 503 });
  });

  it('reads and upserts only the session tenant settings, sending only changed fields', async () => {
    db.answer = () => ({ data: null, error: null });
    expect(await ayarlariOku('t-a')).toMatchObject({ kayitli: false, aylikBeyanSinirUsd: 300 });
    expect(db.calls[0]).toMatchObject({
      table: 'tenant_v2_ayarlari',
      filters: [['tenant_id', 't-a']],
    });
    db.answer = () => ({ data: settings('t-a'), error: null });
    await ayarlariGuncelle('t-a', 'u-1', { primOraniVarsayilan: 0.06 });
    const upsert = db.calls[1];
    expect(upsert).toMatchObject({ op: 'upsert', options: { onConflict: 'tenant_id' } });
    expect(Object.keys(upsert.payload ?? {}).sort()).toEqual([
      'guncellenme_zamani',
      'guncelleyen_kullanici_id',
      'prim_orani_varsayilan',
      'tenant_id',
    ]);
    expect(upsert.payload).toMatchObject({ tenant_id: 't-a', guncelleyen_kullanici_id: 'u-1' });
  });

  it('never queries without a concrete tenant', async () => {
    for (const tenant of ['all', '', undefined, 'a b'])
      await expect(kurlariListele(tenant)).rejects.toMatchObject({ status: 400 });
    await expect(
      ayarlariGuncelle('all', 'u-1', { primOraniVarsayilan: 0.1 })
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(db.calls).toEqual([]);
  });
});
