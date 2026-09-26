import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../../src/server';
import { setSiparislerVeritabani, siparislerVeritabani } from '../../src/server/services/state';
import { awbOnayKayitlari } from '../../src/server/services/kargo/awbMatchStore';
import { supabase } from '../../src/server/services/supabase';
import {
  readProjectData,
  tenantAgents,
  TENANT_A,
  TENANT_B,
  type Agent,
} from './helpers/tenantIsolation';

// AWB-specific tenant isolation checks on top of the shared helper (see also
// tenantIsolation.test.ts): repository data stays untouched, no live service.
const SHARED_PHONE = '055 284 39 11';
const SHARED_AWB = '37349392426';

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

function recordOf(id: string): Record<string, unknown> | undefined {
  return siparislerVeritabani.find((row) => row.id === id);
}

describe('AWB matching routes stay inside the requesting tenant', () => {
  const app = createApp();
  const projectDataBefore = readProjectData();
  let ownerA: Agent;
  let ownerB: Agent;
  beforeAll(async () => {
    ({ a: ownerA, b: ownerB } = await tenantAgents(app));
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

  it('confirmation cannot write, or log an approval for, another tenant order', async () => {
    const before = structuredClone(recordOf('b-order'));
    const response = await ownerA.post('/api/kargo/manifesto-eslestirme/onayla').send({
      dosya_base64: manifest([['AWB-0001', 'Aytən Məmmədova', '+994552843911', '1']]),
      dosya_adi: 'a.xlsx',
      secimler: [{ satirNo: 1, siparisId: 'b-order' }],
    });
    // b-order is not even a candidate for tenant A, so the selection is rejected.
    expect(response.body).toMatchObject({
      basarili: false,
      uygulananlar: [],
      reddedilenler: [{ satirNo: 1, siparisId: 'b-order', sebep: 'ONERI_GECERSIZ' }],
    });
    expect(recordOf('b-order')).toEqual(before);
    for (const tenant of [TENANT_A, TENANT_B])
      expect(awbOnayKayitlari(tenant).some((record) => record.siparisId === 'b-order')).toBe(false);
  });

  it('another tenant AWB neither blocks nor changes this tenant confirmation', async () => {
    const response = await ownerA.post('/api/kargo/manifesto-eslestirme/onayla').send({
      dosya_base64: manifest([[SHARED_AWB, 'Aytən Məmmədova', '+994552843911', '1']]),
      dosya_adi: 'a.xlsx',
      secimler: [{ satirNo: 1, siparisId: 'a-order' }],
    });
    expect(response.body.basarili).toBe(true);
    expect(recordOf('a-order')?.uluslararasi_kargo_kodu).toBe(SHARED_AWB);
    expect(recordOf('b-order')?.uluslararasi_kargo_kodu).toBe('');
    expect(recordOf('b-labelled')?.lojistik_durumu).toBe('KANADA_DEPO');
  });

  it('approval records are written and listed only for the confirming tenant', async () => {
    const response = await ownerB.post('/api/kargo/manifesto-eslestirme/onayla').send({
      dosya_base64: manifest([['AWB-B-0042', 'Aytən Məmmədova', '+994552843911', '1']]),
      dosya_adi: 'b.xlsx',
      secimler: [{ satirNo: 1, siparisId: 'b-order' }],
    });
    expect(response.body.basarili).toBe(true);
    const own = awbOnayKayitlari(TENANT_B).filter((record) => record.siparisId === 'b-order');
    expect(own).toEqual([expect.objectContaining({ tenantId: TENANT_B, awb: 'AWB-B-0042' })]);
    expect(awbOnayKayitlari(TENANT_A).some((record) => record.siparisId === 'b-order')).toBe(false);
    expect(awbOnayKayitlari(TENANT_A).every((record) => record.tenantId === TENANT_A)).toBe(true);
    expect(recordOf('a-order')?.uluslararasi_kargo_kodu).not.toBe('AWB-B-0042');
  });

  it('rejects a header or body override to another tenant before the route runs', async () => {
    const header = await ownerA
      .post('/api/kargo/manifesto-eslestirme/onayla')
      .set('x-tenant-id', TENANT_B)
      .send({
        dosya_base64: manifest([['AWB-0001', 'X', '', '']]),
        secimler: [{ satirNo: 1, siparisId: 'b-order' }],
      });
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
