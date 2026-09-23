import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../../src/server';
import { setSiparislerVeritabani, siparislerVeritabani } from '../../src/server/services/state';
import { supabase } from '../../src/server/services/supabase';
import { loginFixture } from './helpers/session';

// Tenant isolation for the AWB matching routes, following isolation.test.ts:
// repository data stays untouched and no live service is reachable.
const TENANT_A = 'kanada_shopper_baku';
const TENANT_B = 'ayla_boutique';
const SHARED_PHONE = '055 284 39 11';
const SHARED_AWB = '37349392426';
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];

function manifest(rows: string[][]): string {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Waybill Number', 'Consignee Name', 'Telephone', 'Weight (kg)'], ...rows]),
    'DailyDispatch'
  );
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

function order(id: string, tenant: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: tenant,
    musteri_adi: 'Aytən Məmmədova',
    telefon_numarasi: SHARED_PHONE,
    lojistik_durumu: 'KANADA_DEPO',
    uluslararasi_kargo_kodu: '',
    ...extra,
  };
}

const projectFiles = ['identity.json', 'firmalar.json', 'kullanicilar.json', 'kargo_ayarlari.json'];
function readProjectData() {
  return projectFiles.map((name) => {
    const filename = path.join(process.cwd(), 'data', name);
    return fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
  });
}

function recordOf(id: string): Record<string, unknown> | undefined {
  return siparislerVeritabani.find((row) => row.id === id);
}

describe('AWB matching routes stay inside the requesting tenant', () => {
  const app = createApp();
  const projectDataBefore = readProjectData();
  let ownerA: Agent;
  let ownerB: Agent;
  beforeAll(async () => {
    ownerA = (await loginFixture(app, 'PATRON', TENANT_A)).agent;
    ownerB = (await loginFixture(app, 'PATRON', TENANT_B)).agent;
  });
  beforeEach(() => {
    vi.stubEnv('FF_AWB_REVIEW', 'true');
    setSiparislerVeritabani([
      order('a-order', TENANT_A),
      order('b-order', TENANT_B),
      order('b-labelled', TENANT_B, { uluslararasi_kargo_kodu: SHARED_AWB }),
    ]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('suggestions for one tenant never include or reveal another tenant order', async () => {
    const response = await ownerA
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: manifest([[SHARED_AWB, 'Aytən Məmmədova', '+994552843911', '1']]) });
    expect(response.status).toBe(200);
    expect(response.body.satirlar[0]).toMatchObject({
      durum: 'ONERILDI',
      onerilenSiparisId: 'a-order',
      bagliSiparisId: null,
    });
    expect(response.body.cakismalar).toEqual([]);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('b-order');
    expect(body).not.toContain('b-labelled');
  });

  it('the other tenant sees only its own orders for the same manifest', async () => {
    const response = await ownerB
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ dosya_base64: manifest([[SHARED_AWB, 'Aytən Məmmədova', '+994552843911', '1']]) });
    expect(response.body.satirlar[0]).toMatchObject({
      durum: 'ZATEN_BAGLI',
      bagliSiparisId: 'b-labelled',
    });
    expect(JSON.stringify(response.body)).not.toContain('a-order');
  });

  it('confirmation cannot write another tenant order', async () => {
    const before = structuredClone(recordOf('b-order'));
    const response = await ownerA
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send({ eslesmeler: [{ siparisId: 'b-order', takipNo: 'AWB-0001' }] });
    expect(response.body).toMatchObject({
      basarili: false,
      uygulananlar: [],
      reddedilenler: [{ siparisId: 'b-order', sebep: 'SIPARIS_BULUNAMADI' }],
    });
    expect(recordOf('b-order')).toEqual(before);
  });

  it('another tenant AWB neither blocks nor changes this tenant confirmation', async () => {
    const response = await ownerA
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .send({ eslesmeler: [{ siparisId: 'a-order', takipNo: SHARED_AWB }] });
    expect(response.body.basarili).toBe(true);
    expect(recordOf('a-order')?.uluslararasi_kargo_kodu).toBe(SHARED_AWB);
    expect(recordOf('b-order')?.uluslararasi_kargo_kodu).toBe('');
    expect(recordOf('b-labelled')?.lojistik_durumu).toBe('KANADA_DEPO');
  });

  it('rejects a header or body override to another tenant before the route runs', async () => {
    const header = await ownerA
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .set('x-tenant-id', TENANT_B)
      .send({ eslesmeler: [{ siparisId: 'b-order', takipNo: 'AWB-0001' }] });
    const body = await ownerA
      .post('/api/kargo/manifesto-eslestirme/oneriler')
      .send({ tenantId: TENANT_B, dosya_base64: manifest([[SHARED_AWB, 'X', '', '']]) });
    expect([header.status, body.status]).toEqual([403, 403]);
    expect(recordOf('b-order')?.uluslararasi_kargo_kodu).toBe('');
  });

  it('keeps repository data files unchanged and uses no live database', () => {
    expect(supabase).toBeNull();
    expect(readProjectData()).toEqual(projectDataBefore);
  });
});
