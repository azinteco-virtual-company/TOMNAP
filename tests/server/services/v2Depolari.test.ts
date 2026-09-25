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
  rpcs: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcAnswer: (): Answer => ({ data: null, error: null }),
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
    in: (key: string, values: unknown) => (call.filters.push([`${key}:in`, values]), chain),
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
    rpc: (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args });
      return Promise.resolve(db.rpcAnswer());
    },
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      db.calls.push(call);
      return builder(call);
    },
  },
}));

import { kurEkle, kurlariListele } from '../../../src/server/services/v2/kurlar';
import { ayarlariGuncelle, ayarlariOku } from '../../../src/server/services/v2/ayarlar';
import {
  v2SiparisGetir,
  v2SiparisGirdisiniDogrula,
  v2SiparisleriListele,
  v2SiparisOlustur,
} from '../../../src/server/services/v2/siparisStore';
import { siparisSahipAdaylari } from '../../../src/server/services/v2/siparisAyristirma';

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
  db.rpcs = [];
  db.rpcAnswer = () => ({ data: null, error: null });
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

const ORDER = '80000000-0000-4000-8000-000000000001';
const header = (tenant: string) => ({
  id: ORDER,
  tenant_id: tenant,
  model_surumu: 2,
  sahip_kullanici_id: 'u-1',
  musteri_adi: 'Aytən',
  toplam_tutar: '100.00',
  alinan_tutar: '0.00',
  kalan_tutar: '100.00',
  finans_durumu: 'BEKLIYOR',
  lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
  ek_veriler: { musteri_id: 'm-1' },
  olusturma_tarihi: '2026-09-24T10:00:00.000Z',
});
const orderLine = (tenant: string) => ({
  id: '80000000-0000-4000-8000-0000000000aa',
  tenant_id: tenant,
  siparis_id: ORDER,
  sira: 1,
  urun_aciklamasi: 'Çanta',
  beden: null,
  renk: null,
  adet: 2,
  birim_satis_fiyati_azn: '50.00',
  kaynak_ulke: 'CA',
  iptal: false,
});
const girdi = () =>
  v2SiparisGirdisiniDogrula({
    musteri_adi: 'Aytən',
    satirlar: [
      { urun_aciklamasi: 'Çanta', adet: 2, birim_satis_fiyati_azn: 50, kaynak_ulke: 'CA' },
    ],
  });

describe('v2 order store on Supabase: one RPC per order, tenant-scoped reads (A8)', () => {
  it('creates through the transactional RPC with the session tenant and creator only', async () => {
    db.rpcAnswer = () => ({
      data: { siparis: header('t-a'), satirlar: [orderLine('t-a')] },
      error: null,
    });
    const created = await v2SiparisOlustur('t-a', 'u-1', girdi());
    expect(db.rpcs).toHaveLength(1);
    expect(db.rpcs[0]).toMatchObject({
      name: 'tomnap_v2_siparis_olustur',
      args: { p_tenant_id: 't-a', p_user_id: 'u-1', p_siparis: { musteri_adi: 'Aytən' } },
    });
    expect(db.calls).toEqual([]);
    expect(created).toMatchObject({ tenantId: 't-a', musteriId: 'm-1', toplamTutar: 100 });
    expect(created.satirlar[0]).toMatchObject({ urunAciklamasi: 'Çanta', birimSatisFiyatiAzn: 50 });
  });

  it('maps RPC refusals and refuses foreign rows', async () => {
    for (const [code, status] of [
      ['PT403', 403],
      ['PT409', 409],
      ['22023', 400],
      ['23514', 400],
      ['22003', 400],
      ['XX000', 503],
    ] as const) {
      db.rpcAnswer = () => ({ data: null, error: { code } });
      await expect(v2SiparisOlustur('t-a', 'u-1', girdi())).rejects.toMatchObject({ status });
    }
    db.rpcAnswer = () => ({ data: { siparis: header('t-b'), satirlar: [] }, error: null });
    await expect(v2SiparisOlustur('t-a', 'u-1', girdi())).rejects.toMatchObject({ status: 503 });
  });

  it('reads v2 headers and their lines with tenant filters on every query', async () => {
    db.answer = (call) => ({
      data: call.table === 'siparisler' ? [header('t-a')] : [orderLine('t-a')],
      error: null,
    });
    const list = await v2SiparisleriListele('t-a');
    expect(list[0]).toMatchObject({ id: ORDER, satirlar: [{ adet: 2 }] });
    const [headers, lines] = db.calls;
    expect(headers).toMatchObject({ table: 'siparisler' });
    expect(headers.filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', 't-a'],
        ['model_surumu', 2],
      ])
    );
    expect(lines).toMatchObject({ table: 'siparis_satirlari' });
    expect(lines.filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', 't-a'],
        ['siparis_id:in', [ORDER]],
      ])
    );

    db.calls = [];
    db.answer = (call) => ({
      data: call.table === 'siparisler' ? header('t-a') : [orderLine('t-a')],
      error: null,
    });
    await v2SiparisGetir('t-a', ORDER);
    expect(db.calls[0].filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', 't-a'],
        ['model_surumu', 2],
        ['id', ORDER],
      ])
    );
    expect(db.calls[1].filters).toContainEqual(['tenant_id', 't-a']);

    db.answer = (call) => ({
      data: call.table === 'siparisler' ? [header('t-a')] : [orderLine('t-b')],
      error: null,
    });
    await expect(v2SiparisleriListele('t-a')).rejects.toMatchObject({ status: 503 });
  });
});

describe('v2 order owner picker on Supabase (A9)', () => {
  it('lists only active order owners of the session tenant and drops foreign rows', async () => {
    const user = (tenant: string, id: string, rol: string) => ({
      id,
      tenant_id: tenant,
      ad_soyad: id,
      rol,
      durum: 'AKTIF',
    });
    db.answer = () => ({
      data: [
        user('t-a', 'patron-a', 'PATRON'),
        user('t-a', 'satis-a', 'SATIS_SORUMLUSU'),
        user('t-b', 'satis-b', 'SATIS_SORUMLUSU'),
        user('t-a', 'kurye-a', 'BAKU_KURYE'),
      ],
      error: null,
    });
    const owners = await siparisSahipAdaylari('t-a');
    expect(owners.map((o) => o.id)).toEqual(['patron-a', 'satis-a']);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({ table: 'kullanicilar', op: 'select' });
    expect(db.calls[0].filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', 't-a'],
        ['durum', 'AKTIF'],
        ['rol:in', ['PATRON', 'SATIS_SORUMLUSU']],
      ])
    );

    db.answer = () => ({ data: null, error: { code: 'XX000' } });
    await expect(siparisSahipAdaylari('t-a')).rejects.toMatchObject({ status: 503 });
  });
});
