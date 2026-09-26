import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { odemeIstegi, bosOdemeFormu } from '../../../src/components/v2/odemeFormu';
import { kuryeTahsilatIstegi } from '../../../src/components/v2/kasaFormu';

// Codex R3 F15: after the payment RPC committed, the server read the ledger again to
// build its answer. When that read failed the person saw an error for a payment that
// was already recorded, tried again and recorded it twice. The answer now comes from
// the RPC (the order totals the ledger trigger keeps in SQL), and every payment intent
// carries an operation key that the database keeps unique: a retry returns the first
// payment instead of a second one.
type Row = Record<string, unknown>;
const env = vi.hoisted(() => ({ db: null as unknown, calls: [] as Array<[string, Row]> }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import odemelerRouter from '../../../src/server/routes/v2/odemeler';
import kasaRouter from '../../../src/server/routes/v2/kasa';

const TENANT = 'odeme_anahtar';
const ORDER = randomUUID();
const KEY = randomUUID();
const orderTotals = { id: ORDER, toplam_tutar: 100, alinan_tutar: 30, kalan_tutar: 70 };
const payment = (extra: Row = {}): Row => ({
  id: randomUUID(),
  tenant_id: TENANT,
  siparis_id: ORDER,
  tutar_azn: 30,
  yontem: 'NAKIT',
  kaynak: 'BUTIK',
  alan_kullanici_id: 'u-1',
  alma_zamani: '2026-09-26T08:00:00Z',
  kaydeden_kullanici_id: 'u-1',
  aciklama: null,
  ters_kayit_odeme_id: null,
  kasa_teslim_id: null,
  olusturma_zamani: '2026-09-26T08:00:00Z',
  ...extra,
});

/** Every RPC commits; every table read after it fails. */
function fakeDb(tekrar = false) {
  const failedRead = { data: null, error: { code: 'XX000', message: 'read failed' } };
  const chain: Row = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'range'])
    chain[method] = () => chain;
  chain.maybeSingle = () => Promise.resolve(failedRead);
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(failedRead).then(resolve);
  return {
    from: () => chain,
    rpc: (name: string, args: Row) => {
      env.calls.push([name, args]);
      const odeme =
        name === 'tomnap_v2_odeme_ters_kayit'
          ? payment({ tutar_azn: -30, ters_kayit_odeme_id: args.p_odeme_id })
          : name === 'tomnap_v2_kurye_tahsilati'
            ? payment({ kaynak: 'TESLIMAT', alan_kullanici_id: 'kurye-1' })
            : payment();
      return Promise.resolve({
        data: { odeme, siparis: { ...orderTotals, finans_durumu: 'KISMI_ODEME' }, tekrar },
        error: null,
      });
    },
  };
}

function app(role: string, userId = 'u-1') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.tenantId = TENANT;
    req.auth = { role, tenantId: TENANT, userId } as never;
    next();
  });
  server.use('/api/v2', odemelerRouter);
  server.use('/api/v2', kasaRouter);
  return server;
}

const body = (extra: Row = {}) => ({
  siparis_id: ORDER,
  tutar_azn: 30,
  yontem: 'NAKIT',
  kaynak: 'BUTIK',
  islem_anahtari: KEY,
  ...extra,
});
const summary = {
  siparisId: ORDER,
  toplamTutar: 100,
  odenenTutar: 30,
  kalanTutar: 70,
  durum: 'KISMI',
};

beforeEach(() => {
  env.db = fakeDb();
  env.calls = [];
});

describe('payment answers come from the RPC, not a read after commit (Codex R3 F15)', () => {
  it('a recorded payment answers 201 with the RPC totals even when a read would fail', async () => {
    const response = await request(app('PATRON')).post('/api/v2/odemeler').send(body());
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.ozet).toEqual(summary);
    expect(response.body.odeme).toMatchObject({ siparisId: ORDER, tutarAzn: 30 });
    expect(env.calls).toHaveLength(1);
  });

  it('a reversal and a courier collection answer the same way', async () => {
    const reversal = await request(app('PATRON'))
      .post(`/api/v2/odemeler/${randomUUID()}/ters-kayit`)
      .send({ aciklama: 'Səhv' });
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);
    expect(reversal.body.ozet).toEqual(summary);
    const courier = await request(app('BAKU_KURYE', 'kurye-1'))
      .post('/api/v2/kurye/tahsilat')
      .send({ siparis_id: ORDER, tutar_azn: 30, islem_anahtari: KEY });
    expect(courier.status, JSON.stringify(courier.body)).toBe(201);
    expect(courier.body.ozet).toEqual(summary);
    expect(courier.body.odeme).toMatchObject({ kaynak: 'TESLIMAT', tutarAzn: 30 });
  });
});

describe('every payment intent carries a unique operation key (Codex R3 F15)', () => {
  it('passes the key to the RPCs and reports a replay', async () => {
    env.db = fakeDb(true);
    const paid = await request(app('PATRON')).post('/api/v2/odemeler').send(body());
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.tekrar).toBe(true);
    const courier = await request(app('BAKU_KURYE', 'kurye-1'))
      .post('/api/v2/kurye/tahsilat')
      .send({ siparis_id: ORDER, tutar_azn: 30, islem_anahtari: KEY });
    expect(courier.status, JSON.stringify(courier.body)).toBe(200);
    expect(env.calls.map(([name, args]) => [name, args.p_odeme ?? args])).toEqual([
      ['tomnap_v2_odeme_kaydet', expect.objectContaining({ islem_anahtari: KEY })],
      ['tomnap_v2_kurye_tahsilati', expect.objectContaining({ p_islem_anahtari: KEY })],
    ]);
  });

  it('refuses a key that is not a UUID', async () => {
    for (const islem_anahtari of ['abc', 12, ''])
      expect(
        (await request(app('PATRON')).post('/api/v2/odemeler').send(body({ islem_anahtari })))
          .status
      ).toBe(400);
    expect(env.calls).toEqual([]);
  });

  it('the payment forms send one key per intent', () => {
    const form = { ...bosOdemeFormu('BUTIK'), tutar: '30' };
    expect(odemeIstegi(ORDER, form, KEY).govde).toMatchObject({ islem_anahtari: KEY });
    const siparis = { id: ORDER, musteriAdi: 'A', kalanTutar: 70, lojistikDurumu: 'x' };
    expect(kuryeTahsilatIstegi(siparis as never, '30', KEY).govde).toEqual({
      siparis_id: ORDER,
      tutar_azn: 30,
      islem_anahtari: KEY,
    });
  });
});

describe('memory mode keeps the same key rule (Codex R3 F15)', () => {
  it('one payment per key; the same key for another payment is refused', async () => {
    env.db = null;
    const { firmalarVeritabani, kullanicilarVeritabani } =
      await import('../../../src/server/services/state');
    const siparisler = await import('../../../src/server/services/v2/siparisStore');
    const odemeler = await import('../../../src/server/services/v2/odemeStore');
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'Anahtar',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    kullanicilarVeritabani.push({
      id: 'u-1',
      tenant_id: TENANT,
      ad_soyad: 'Patron',
      email: 'anahtar-patron@example.invalid',
      rol: 'PATRON',
      durum: 'AKTIF',
      olusturma_tarihi: new Date().toISOString(),
    });
    const order = await siparisler.v2SiparisOlustur(
      TENANT,
      'u-1',
      siparisler.v2SiparisGirdisiniDogrula({
        musteri_adi: 'Aytən',
        satirlar: [
          { urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 100, kaynak_ulke: 'CA' },
        ],
      })
    );
    const key = randomUUID();
    const send = (extra: Row = {}) =>
      request(app('PATRON'))
        .post('/api/v2/odemeler')
        .send(body({ siparis_id: order.id, islem_anahtari: key, ...extra }));
    const first = await send();
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const again = await send();
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body).toMatchObject({ tekrar: true, odeme: { id: first.body.odeme.id } });
    expect((await send({ tutar_azn: 40 })).status).toBe(409);
    const count = () => odemeler.bellektekiOdemeler(TENANT).filter((o) => o.siparisId === order.id);
    expect(count()).toHaveLength(1);
    expect(again.body.ozet).toMatchObject({ odenenTutar: 30, kalanTutar: 70 });
  });
});
