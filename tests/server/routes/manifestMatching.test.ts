import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../../../src/server';
import {
  setSiparislerVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';

const TENANT = 'kanada_shopper_baku';
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];

function manifestBase64(rows: string[][]): string {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Waybill Number', 'Consignee Name', 'Telephone', 'Weight (kg)'],
      ...rows,
    ]),
    'DailyDispatch'
  );
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

function order(id: string, musteriAdi: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: TENANT,
    musteri_adi: musteriAdi,
    telefon_numarasi: '',
    lojistik_durumu: 'KANADA_DEPO',
    uluslararasi_kargo_kodu: '',
    ...extra,
  };
}

function awbOf(id: string): unknown {
  return siparislerVeritabani.find((row) => row.id === id)?.uluslararasi_kargo_kodu;
}

describe('Manifest upload never writes AWB codes through name similarity (Y-6)', () => {
  const app = createApp();
  let agent: Agent;
  beforeAll(async () => {
    agent = (await loginFixture(app, 'PATRON', TENANT)).agent;
  });

  it('does not attach the "Natalia Petrova" manifest row to the order of "Əli"', async () => {
    setSiparislerVeritabani([order('order-eli', 'Əli')]);
    const response = await agent.post('/api/kargo/manifesto-yukle').send({
      dosya_base64: manifestBase64([['37349392426', 'Natalia Petrova', '+1 416 555 0101', '1.2']]),
      dosya_adi: 'dispatch.xlsx',
      otomatik_esle: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.eslesenSayisi).toBe(0);
    expect(awbOf('order-eli')).toBe('');
  });

  it('does not attach the "John Smith" manifest row to an order with a Cyrillic name', async () => {
    setSiparislerVeritabani([order('order-cyrillic', 'Лейла Иванова')]);
    const response = await agent.post('/api/kargo/manifesto-yukle').send({
      dosya_base64: manifestBase64([['37349392427', 'John Smith', '+1 416 555 0102', '0.8']]),
      dosya_adi: 'dispatch.xlsx',
      otomatik_esle: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.eslesenSayisi).toBe(0);
    expect(awbOf('order-cyrillic')).toBe('');
  });
});

function phoneManifest(rows: Array<[string, string, string, string]>): string {
  return manifestBase64(rows);
}

describe('Human-confirmed AWB matching endpoints (FF_V2_FLOW)', () => {
  const app = createApp();
  let owner: Agent;
  beforeAll(async () => {
    owner = (await loginFixture(app, 'PATRON', TENANT)).agent;
  });
  beforeEach(() => {
    vi.stubEnv('FF_V2_FLOW', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is unavailable while the feature flag is off', async () => {
    vi.stubEnv('FF_V2_FLOW', '');
    const suggestions = await owner
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: phoneManifest([['AWB-0001', 'A', '', '']]) });
    const confirmation = await owner
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send({ eslesmeler: [{ siparisId: 'x', takipNo: 'AWB-0001' }] });
    expect([suggestions.status, confirmation.status]).toEqual([404, 404]);
  });

  it('returns suggestions without changing any order', async () => {
    setSiparislerVeritabani([
      order('phone-order', 'Aytən Məmmədova', { telefon_numarasi: '055 284 39 11' }),
      order('order-eli', 'Əli'),
    ]);
    const before = JSON.stringify(siparislerVeritabani);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/oneriler').send({
      dosya_base64: phoneManifest([
        ['37349392426', 'Aytən Məmmədova', '+994552843911', '1.4'],
        ['37349392427', 'Natalia Petrova', '+1 416 555 0101', '0.8'],
      ]),
    });
    expect(response.status).toBe(200);
    expect(response.body.satirlar.map((row: { durum: string }) => row.durum)).toEqual([
      'ONERILDI',
      'ESLESME_YOK',
    ]);
    expect(response.body.satirlar[0]).toMatchObject({
      onerilenSiparisId: 'phone-order',
      agirlikKg: 1.4,
    });
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
  });

  it('rejects unreadable and oversized manifests', async () => {
    const missing = await owner.post('/api/kargo/manifesto-eslestirme/oneriler').send({});
    expect(missing.status).toBe(400);
    const empty = await owner
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: manifestBase64([]) });
    expect(empty.status).toBe(400);
    const rows = Array.from({ length: 2001 }, (_, index): [string, string, string, string] => [
      String(37349300000 + index),
      'Synthetic',
      '',
      '',
    ]);
    const tooMany = await owner
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: phoneManifest(rows) });
    expect(tooMany.status).toBe(413);
  });

  it('writes only the confirmed pair and moves pre-flight orders to international cargo', async () => {
    setSiparislerVeritabani([order('target', 'Customer'), order('untouched', 'Other')]);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send({
      eslesmeler: [{ siparisId: 'target', takipNo: ' 3734 9392 426 ', agirlikKg: 1.25 }],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      basarili: true,
      uygulananlar: [{ siparisId: 'target', takipNo: '37349392426', tekrar: false }],
      reddedilenler: [],
    });
    const target = siparislerVeritabani.find((row) => row.id === 'target');
    expect(target).toMatchObject({
      uluslararasi_kargo_kodu: '37349392426',
      kargo_agirligi_kg: 1.25,
      lojistik_durumu: 'ULUSLARARASI_KARGO',
    });
    expect(awbOf('untouched')).toBe('');

    const retry = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send({
      eslesmeler: [{ siparisId: 'target', takipNo: '37349392426' }],
    });
    expect(retry.body).toMatchObject({
      basarili: true,
      uygulananlar: [{ siparisId: 'target', tekrar: true }],
    });
  });

  it('refuses delivered, labelled, duplicated and unknown targets and writes nothing', async () => {
    setSiparislerVeritabani([
      order('valid', 'Valid'),
      order('delivered', 'Delivered', { lojistik_durumu: 'TESLIM_EDILDI' }),
      order('labelled', 'Labelled', { uluslararasi_kargo_kodu: 'OLD-AWB-1' }),
      order('holder', 'Holder', { uluslararasi_kargo_kodu: 'AWB-TAKEN' }),
      order('free', 'Free'),
    ]);
    const before = JSON.stringify(siparislerVeritabani);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send({
      eslesmeler: [
        { siparisId: 'valid', takipNo: 'AWB-0001' },
        { siparisId: 'delivered', takipNo: 'AWB-0002' },
        { siparisId: 'labelled', takipNo: 'AWB-0003' },
        { siparisId: 'free', takipNo: 'awb-taken' },
        { siparisId: 'missing', takipNo: 'AWB-0005' },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.basarili).toBe(false);
    expect(response.body.uygulananlar).toEqual([]);
    expect(
      response.body.reddedilenler.map((item: { siparisId: string; sebep: string }) => [
        item.siparisId,
        item.sebep,
      ])
    ).toEqual([
      ['delivered', 'TESLIM_EDILDI'],
      ['labelled', 'MEVCUT_AWB'],
      ['free', 'AWB_BASKA_SIPARISTE'],
      ['missing', 'SIPARIS_BULUNAMADI'],
    ]);
    expect(response.body.reddedilenler[1].mevcutAwb).toBe('OLD-AWB-1');
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
  });

  it.each([
    [{}],
    [{ eslesmeler: [] }],
    [{ eslesmeler: [{ siparisId: 'a', takipNo: 'AB/12' }] }],
    [{ eslesmeler: [{ siparisId: '../a', takipNo: 'AWB-0001' }] }],
    [{ eslesmeler: [{ siparisId: 'a', takipNo: 'AWB-0001', agirlikKg: -1 }] }],
    [{ eslesmeler: [{ siparisId: 'a', takipNo: 'AWB-0001', agirlikKg: '2' }] }],
    [
      {
        eslesmeler: [
          { siparisId: 'a', takipNo: 'AWB-0001' },
          { siparisId: 'b', takipNo: 'awb-0001' },
        ],
      },
    ],
    [
      {
        eslesmeler: [
          { siparisId: 'a', takipNo: 'AWB-0001' },
          { siparisId: 'a', takipNo: 'AWB-0002' },
        ],
      },
    ],
  ])('rejects the malformed or ambiguous confirmation %j', async (body) => {
    setSiparislerVeritabani([order('a', 'A'), order('b', 'B')]);
    const before = JSON.stringify(siparislerVeritabani);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send(body);
    expect(response.status).toBe(400);
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
  });

  it('allows only roles that may edit AWB codes', async () => {
    for (const role of ['BAKU_FINANS', 'SATIS_SORUMLUSU', 'BAKU_KURYE'] as const) {
      const { agent } = await loginFixture(app, role, TENANT);
      const suggestions = await agent.post('/api/kargo/manifesto-eslestirme/oneriler').send({});
      const confirmation = await agent.post('/api/kargo/manifesto-eslestirme/onayla').send({});
      expect([role, suggestions.status, confirmation.status]).toEqual([role, 403, 403]);
    }
    setSiparislerVeritabani([order('purchasing', 'Customer')]);
    const purchasing = (await loginFixture(app, 'KANADA_SATINALMA', TENANT)).agent;
    const response = await purchasing.post('/api/kargo/manifesto-eslestirme/onayla').send({
      eslesmeler: [{ siparisId: 'purchasing', takipNo: 'AWB-0101' }],
    });
    expect(response.body.basarili).toBe(true);
  });

  it('requires an administrator to select a concrete boutique', async () => {
    const admin = (await loginFixture(app, 'SUPER_ADMIN', TENANT)).agent;
    const global = await admin
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send({ eslesmeler: [{ siparisId: 'x', takipNo: 'AWB-0001' }] });
    expect(global.status).toBe(403);
    setSiparislerVeritabani([order('admin-target', 'Customer')]);
    const scoped = await admin
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .set('x-tenant-id', TENANT)
      .send({ eslesmeler: [{ siparisId: 'admin-target', takipNo: 'AWB-0202' }] });
    expect(scoped.body.basarili).toBe(true);
  });
});
