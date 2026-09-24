import { createHash } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../../../src/server';
import { awbOnayKayitlari } from '../../../src/server/services/kargo/awbMatchStore';
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

const PHONE = '055 284 39 11';
const MANIFEST_NAME = 'dispatch-0923.xlsx';
function confirmBody(manifest: string, secimler: Array<{ satirNo: number; siparisId: string }>) {
  return { dosya_base64: manifest, dosya_adi: MANIFEST_NAME, secimler };
}
const sha256 = (base64: string) => createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
const recordsFor = (id: string) => awbOnayKayitlari(TENANT).filter((record) => record.siparisId === id);

describe('Human-confirmed AWB matching endpoints (FF_AWB_REVIEW)', () => {
  const app = createApp();
  let owner: Agent;
  let ownerId: string;
  beforeAll(async () => {
    const fixture = await loginFixture(app, 'PATRON', TENANT);
    owner = fixture.agent;
    ownerId = fixture.userId;
  });
  beforeEach(() => {
    vi.stubEnv('FF_AWB_REVIEW', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is unavailable while its own flag is off, even with FF_V2_FLOW on', async () => {
    vi.stubEnv('FF_AWB_REVIEW', '');
    vi.stubEnv('FF_V2_FLOW', 'true');
    const manifest = phoneManifest([['AWB-0001', 'A', '', '']]);
    const suggestions = await owner
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: manifest });
    const confirmation = await owner
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send(confirmBody(manifest, [{ satirNo: 1, siparisId: 'x' }]));
    expect([suggestions.status, confirmation.status]).toEqual([404, 404]);
  });

  it('returns suggestions without changing any order', async () => {
    setSiparislerVeritabani([
      order('phone-order', 'Aytən Məmmədova', { telefon_numarasi: PHONE }),
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

  it('writes only a suggested pair and logs it with server-derived provenance', async () => {
    setSiparislerVeritabani([
      order('target', 'Aytən Məmmədova', { telefon_numarasi: PHONE }),
      order('untouched', 'Other'),
    ]);
    const manifest = phoneManifest([['3734 9392 426', 'MƏMMƏDOVA AYTƏN', '+994552843911', '1.25']]);
    const response = await owner
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send(confirmBody(manifest, [{ satirNo: 1, siparisId: 'target' }]));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      basarili: true,
      uygulananlar: [{ satirNo: 1, siparisId: 'target', takipNo: '37349392426', tekrar: false }],
      reddedilenler: [],
    });
    expect(siparislerVeritabani.find((row) => row.id === 'target')).toMatchObject({
      uluslararasi_kargo_kodu: '37349392426',
      kargo_agirligi_kg: 1.25,
      lojistik_durumu: 'ULUSLARARASI_KARGO',
    });
    expect(awbOf('untouched')).toBe('');
    expect(recordsFor('target')).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        awb: '37349392426',
        manifestDosyaAdi: MANIFEST_NAME,
        manifestSha256: sha256(manifest),
        manifestSatirNo: 1,
        eslesmeTuru: 'TELEFON',
        isimPuani: 1,
        onaylayanKullaniciId: ownerId,
      }),
    ]);

    const retry = await owner
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send(confirmBody(manifest, [{ satirNo: 1, siparisId: 'target' }]));
    expect(retry.body).toMatchObject({
      basarili: true,
      uygulananlar: [{ satirNo: 1, siparisId: 'target', tekrar: true }],
    });
    expect(recordsFor('target')).toHaveLength(1);
  });

  it('logs a confirmed weak name match as ISIM with its name score', async () => {
    setSiparislerVeritabani([order('named', 'Aytən Məmmədova')]);
    const manifest = phoneManifest([['AWB-7001', 'Ayten Mammadova', '', '']]);
    const response = await owner
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send(confirmBody(manifest, [{ satirNo: 1, siparisId: 'named' }]));
    expect(response.body.basarili).toBe(true);
    const [record] = recordsFor('named');
    expect(record.eslesmeTuru).toBe('ISIM');
    expect(record.isimPuani).toBeGreaterThanOrEqual(0.5);
    expect(record.isimPuani).toBeLessThan(1);
  });

  it('refuses selections that are not current suggestions and writes nothing', async () => {
    setSiparislerVeritabani([
      order('valid', 'Valid', { telefon_numarasi: PHONE }),
      order('delivered', 'Delivered', { telefon_numarasi: '0701112233', lojistik_durumu: 'TESLIM_EDILDI' }),
      order('labelled', 'Labelled', { telefon_numarasi: '0502223344', uluslararasi_kargo_kodu: 'OLD-AWB-1' }),
      order('unrelated', 'Unrelated Person'),
    ]);
    const before = JSON.stringify(siparislerVeritabani);
    const manifest = phoneManifest([
      ['AWB-0001', 'Valid', '+994552843911', ''],
      ['AWB-0002', 'Delivered', '0701112233', ''],
      ['AWB-0003', 'Labelled', '0502223344', ''],
      ['AWB-0004', 'Somebody Else', '', ''],
    ]);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send(
      confirmBody(manifest, [
        { satirNo: 1, siparisId: 'valid' },
        { satirNo: 2, siparisId: 'delivered' },
        { satirNo: 3, siparisId: 'labelled' },
        { satirNo: 4, siparisId: 'unrelated' },
        { satirNo: 9, siparisId: 'ghost' },
      ])
    );
    expect(response.status).toBe(200);
    expect(response.body.basarili).toBe(false);
    expect(response.body.uygulananlar).toEqual([]);
    expect(
      response.body.reddedilenler.map((item: { satirNo: number; sebep: string; takipNo: string }) => [
        item.satirNo,
        item.sebep,
        item.takipNo,
      ])
    ).toEqual([
      [2, 'ONERI_GECERSIZ', 'AWB-0002'],
      [3, 'ONERI_GECERSIZ', 'AWB-0003'],
      [4, 'ONERI_GECERSIZ', 'AWB-0004'],
      [9, 'ONERI_GECERSIZ', ''],
    ]);
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
    for (const id of ['valid', 'delivered', 'labelled', 'unrelated']) expect(recordsFor(id)).toEqual([]);
  });

  it('rejects two selected rows that carry the same AWB', async () => {
    setSiparislerVeritabani([
      order('first', 'First', { telefon_numarasi: PHONE }),
      order('second', 'Second', { telefon_numarasi: '0701112233' }),
    ]);
    const manifest = phoneManifest([
      ['AWB-0101', 'First', '+994552843911', ''],
      ['AWB-0101', 'Second', '0701112233', ''],
    ]);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send(
      confirmBody(manifest, [
        { satirNo: 1, siparisId: 'first' },
        { satirNo: 2, siparisId: 'second' },
      ])
    );
    expect(response.status).toBe(400);
    expect([awbOf('first'), awbOf('second')]).toEqual(['', '']);
  });

  it.each([
    [{}],
    [{ secimler: [] }],
    [{ secimler: [{ satirNo: 0, siparisId: 'a' }] }],
    [{ secimler: [{ satirNo: 1.5, siparisId: 'a' }] }],
    [{ secimler: [{ satirNo: '1', siparisId: 'a' }] }],
    [{ secimler: [{ satirNo: 1, siparisId: '../a' }] }],
    [{ secimler: [{ satirNo: 1, siparisId: 'a' }, { satirNo: 1, siparisId: 'b' }] }],
    [{ secimler: [{ satirNo: 1, siparisId: 'a' }, { satirNo: 2, siparisId: 'a' }] }],
    [{ secimler: [{ satirNo: 1, siparisId: 'a' }], dosya_base64: '' }],
  ])('rejects the malformed or ambiguous confirmation %j', async (body) => {
    setSiparislerVeritabani([order('a', 'A', { telefon_numarasi: PHONE })]);
    const before = JSON.stringify(siparislerVeritabani);
    const response = await owner.post('/api/kargo/manifesto-eslestirme/onayla').send(body);
    expect(response.status).toBe(400);
    expect(JSON.stringify(siparislerVeritabani)).toBe(before);
  });

  it('allows only roles that may edit AWB codes and logs the acting user', async () => {
    for (const role of ['BAKU_FINANS', 'SATIS_SORUMLUSU', 'BAKU_KURYE'] as const) {
      const { agent } = await loginFixture(app, role, TENANT);
      const suggestions = await agent.post('/api/kargo/manifesto-eslestirme/oneriler').send({});
      const confirmation = await agent.post('/api/kargo/manifesto-eslestirme/onayla').send({});
      expect([role, suggestions.status, confirmation.status]).toEqual([role, 403, 403]);
    }
    setSiparislerVeritabani([order('purchasing', 'Customer', { telefon_numarasi: PHONE })]);
    const purchasing = await loginFixture(app, 'KANADA_SATINALMA', TENANT);
    const response = await purchasing.agent
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send(confirmBody(phoneManifest([['AWB-0102', 'X', PHONE, '']]), [{ satirNo: 1, siparisId: 'purchasing' }]));
    expect(response.body.basarili).toBe(true);
    expect(recordsFor('purchasing')[0].onaylayanKullaniciId).toBe(purchasing.userId);
  });

  it('requires an administrator to select a concrete boutique', async () => {
    const admin = await loginFixture(app, 'SUPER_ADMIN', TENANT);
    setSiparislerVeritabani([order('admin-target', 'Customer', { telefon_numarasi: PHONE })]);
    const body = confirmBody(phoneManifest([['AWB-0202', 'X', PHONE, '']]), [
      { satirNo: 1, siparisId: 'admin-target' },
    ]);
    const global = await admin.agent.post('/api/kargo/manifesto-eslestirme/onayla').send(body);
    expect(global.status).toBe(403);
    const scoped = await admin.agent
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .set('x-tenant-id', TENANT)
      .send(body);
    expect(scoped.body.basarili).toBe(true);
    expect(recordsFor('admin-target')[0].onaylayanKullaniciId).toBe(admin.userId);
  });
});
