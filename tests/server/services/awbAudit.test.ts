import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adasBulgulari,
  eskiAlgoritmaIsmi,
  manifestBulgulari,
  toAuditOrder,
  veritabaniBulgulari,
  type AuditOrder,
} from '../../../scripts/lib/awbAudit';
import {
  auditMain,
  createPrivateReport,
  parseAuditArguments,
  readAuditOrders,
  supabaseOrderPageReader,
  type OrderPageQuery,
} from '../../../scripts/audit-awb-matches';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomnap-awb-audit-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

function order(id: string, musteriAdi: string, awb: string, extra: Partial<AuditOrder> = {}): AuditOrder {
  return {
    id,
    tenantId: 'tenant-a',
    musteriAdi,
    telefon: '',
    lojistikDurumu: 'ULUSLARARASI_KARGO',
    awb,
    awbHam: awb,
    olusturmaTarihi: '',
    ...extra,
  };
}

function manifestBuffer(rows: string[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Waybill Number', 'Consignee Name', 'Telephone'], ...rows]),
    'DailyDispatch'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('Legacy matcher reproduction', () => {
  it('matches the removed ASCII-only normalization exactly', () => {
    expect(eskiAlgoritmaIsmi('Əli')).toBe('li');
    expect(eskiAlgoritmaIsmi('Лейла Иванова')).toBe('');
    expect(eskiAlgoritmaIsmi('Aytən Məmmədova')).toBe('aytnmmmdova');
    expect(eskiAlgoritmaIsmi(undefined)).toBe('');
  });

  it('keeps orders without an AWB, but only as namesake candidates', () => {
    expect(toAuditOrder({ id: 'a', tenant_id: 't', uluslararasi_kargo_kodu: null })).toMatchObject({
      awb: '',
      awbHam: '',
      olusturmaTarihi: '',
    });
    expect(toAuditOrder({ id: 'a', uluslararasi_kargo_kodu: 'AWB-1' })).toBeNull();
    expect(
      toAuditOrder({
        id: 'a',
        tenant_id: 't',
        uluslararasi_kargo_kodu: ' awb-1 ',
        olusturma_tarihi: '2026-09-01T10:00:00+00:00',
      })
    ).toMatchObject({ awb: 'AWB-1', awbHam: 'awb-1', olusturmaTarihi: '2026-09-01T10:00:00+00:00' });
    expect(toAuditOrder('row')).toBeNull();
  });
});

describe('Database-only signals', () => {
  it('flags duplicates and the old matcher risk profile, most severe first', () => {
    const findings = veritabaniBulgulari([
      order('dup-1', 'Aytən Məmmədova', 'AWB-1'),
      order('dup-2', 'Kəmalə Bədirbəyli', 'AWB-1'),
      order('other-tenant', 'Nigar Əliyeva', 'AWB-1', { tenantId: 'tenant-b' }),
      order('cyrillic', 'Лейла Иванова', 'AWB-2'),
      order('short', 'Əli', 'AWB-3'),
      order('normal', 'Samir Valiyev', 'AWB-4'),
      // Without an AWB the old matcher's write cannot be on this order.
      order('no-awb-cyrillic', 'Лейла Иванова', ''),
      order('no-awb-short', 'Əli', ''),
    ]);
    expect(findings.map((item) => [item.siparisId, item.tip, item.onem])).toEqual([
      ['dup-1', 'AYNI_AWB_BIRDEN_FAZLA_SIPARISTE', 'YUKSEK'],
      ['dup-2', 'AYNI_AWB_BIRDEN_FAZLA_SIPARISTE', 'YUKSEK'],
      ['cyrillic', 'ESKI_ESLESTIRME_BOS_ISIM', 'YUKSEK'],
      ['short', 'ESKI_ESLESTIRME_KISA_ISIM', 'ORTA'],
    ]);
  });
});

describe('Manifest comparison', () => {
  it('reports both reported false matches and accepts phone or exact-name agreement', () => {
    const result = manifestBulgulari(
      [
        order('o-eli', 'Əli', '37349392426'),
        order('o-cyrillic', 'Лейла Иванова', '37349392427'),
        order('o-phone', 'Aytən Məmmədova', '3001', { telefon: '055 284 39 11' }),
        order('o-name', 'Kəmalə Bədirbəyli', '3002'),
        order('o-similar', 'Aytən Məmmədli', '3003'),
        order('o-passport', 'Qəmər Əsədova', '3004'),
        order('o-no-awb', 'Nobody', ''),
      ],
      [
        { takipNo: '37349392426', aliciAdi: 'Natalia Petrova', telefon: '+1 416 555 0101' },
        { takipNo: '37349392427', aliciAdi: 'John Smith' },
        { takipNo: '3001', aliciAdi: 'Somebody Else', telefon: '+994552843911' },
        { takipNo: '3002', aliciAdi: 'KƏMALƏ BƏDİRBƏYLİ' },
        { takipNo: '3003', aliciAdi: 'Aytən Məmmədova' },
        { takipNo: '9999', aliciAdi: 'Not in database' },
        { takipNo: '3004', aliciAdi: 'GAMAR ASADOVA' },
        { takipNo: '', aliciAdi: 'Nobody' },
      ],
      'dispatch.xlsx'
    );
    // The passport spelling of the customer's name is consistent, not a finding.
    expect(result).toMatchObject({ satirSayisi: 8, veritabanindaOlmayanAwb: 2, kontrolEdilenAwb: 6 });
    expect(result.bulgular.map((item) => [item.siparisId, item.tip, item.onem])).toEqual([
      ['o-eli', 'MANIFEST_ALICI_UYUSMUYOR', 'YUKSEK'],
      ['o-cyrillic', 'MANIFEST_ALICI_UYUSMUYOR', 'YUKSEK'],
      ['o-similar', 'MANIFEST_ALICI_BENZER', 'ORTA'],
    ]);
    expect(result.bulgular[0].manifest).toEqual({
      dosya: 'dispatch.xlsx',
      satirNo: 1,
      aliciAdi: 'Natalia Petrova',
      telefon: '+1 416 555 0101',
    });
  });

  it('reports a different phone as high severity even when the name agrees', () => {
    const result = manifestBulgulari(
      [
        order('same-name', 'Aytən Məmmədova', '4001', { telefon: '050 123 45 67' }),
        order('folded-name', 'Qəmər Əsədova', '4002', { telefon: '+994 55 284 39 11' }),
        order('similar-name', 'Aytən Məmmədli', '4003', { telefon: '0701112233' }),
        order('other-name', 'Samir Vəliyev', '4004', { telefon: '0709998877' }),
        order('same-phone', 'Nigar Əliyeva', '4005', { telefon: '0552843911' }),
        order('no-order-phone', 'Kəmalə Bədirbəyli', '4006'),
        order('text-phone', 'Leyla Həsənova', '4007', { telefon: 'yoxdur' }),
      ],
      [
        // Same last seven digits as the order: the removed matcher accepted this row.
        { takipNo: '4001', aliciAdi: 'AYTƏN MƏMMƏDOVA', telefon: '+994 55 123 45 67' },
        { takipNo: '4002', aliciAdi: 'GAMAR ASADOVA', telefon: '0507654321' },
        { takipNo: '4003', aliciAdi: 'Aytən Məmmədova', telefon: '0551112233' },
        { takipNo: '4004', aliciAdi: 'John Smith', telefon: '0501234567' },
        { takipNo: '4005', aliciAdi: 'Nigar Aliyeva', telefon: '+994 (55) 284-39-11' },
        { takipNo: '4006', aliciAdi: 'Kəmalə Bədirbəyli', telefon: '0551234567' },
        { takipNo: '4007', aliciAdi: 'Leyla Hasanova', telefon: '0551234567' },
      ],
      'dispatch.xlsx'
    );
    expect(result.bulgular.map((item) => [item.siparisId, item.tip, item.onem])).toEqual([
      ['same-name', 'MANIFEST_TELEFON_UYUSMUYOR', 'YUKSEK'],
      ['folded-name', 'MANIFEST_TELEFON_UYUSMUYOR', 'YUKSEK'],
      ['similar-name', 'MANIFEST_TELEFON_UYUSMUYOR', 'YUKSEK'],
      ['other-name', 'MANIFEST_ALICI_UYUSMUYOR', 'YUKSEK'],
    ]);
    expect(result.bulgular[0]).toMatchObject({ benzerlik: 1, telefon: '050 123 45 67' });
    expect(result.bulgular[0].manifest?.telefon).toBe('+994 55 123 45 67');
    expect(result.bulgular[0].aciklama).toMatch(/telefon/i);
  });
});

describe('Namesake ambiguity', () => {
  const at = (day: string) => `${day}T10:00:00+00:00`;
  const namesakes = () => [
    order('h1', 'Aytən Məmmədova', 'AWB-1', { olusturmaTarihi: at('2026-09-01'), telefon: '0501112233' }),
    order('n1', 'AYTƏN MƏMMƏDOVA', '', { olusturmaTarihi: at('2026-09-10'), telefon: '0559998877' }),
    order('n2', 'Aytan Mammadova', 'AWB-2', { olusturmaTarihi: at('2026-06-03'), telefon: '050 111 22 33' }),
    // Mixes the two spellings; no fold produces it, so it is not a namesake.
    order('mixed', 'Ayten Mammadova', 'AWB-8', { olusturmaTarihi: at('2026-09-01') }),
    order('n3', 'Məmmədova Aytən', ''),
    order('other-tenant', 'Aytən Məmmədova', 'AWB-9', { tenantId: 'tenant-b' }),
    order('different', 'Aytən Məmmədli', 'AWB-3', { olusturmaTarihi: at('2026-09-02') }),
    order('placeholder-1', 'Müştəri', 'AWB-4'),
    order('placeholder-2', 'Müştəri', 'AWB-5'),
    order('unique', 'Samir Vəliyev', 'AWB-6'),
    order('far-holder', 'Nigar Əliyeva', 'AWB-7', { olusturmaTarihi: at('2026-01-01') }),
    order('far-namesake', 'Nigar Aliyeva', '', { olusturmaTarihi: at('2026-09-01') }),
  ];

  it('marks an AWB whose folded customer name is shared inside the tenant', () => {
    const findings = adasBulgulari(namesakes(), null);
    expect(findings.map((item) => [item.siparisId, item.tip, item.onem])).toEqual([
      ['h1', 'BELIRSIZ_ADAS', 'ORTA'],
      ['n2', 'BELIRSIZ_ADAS', 'ORTA'],
      ['far-holder', 'BELIRSIZ_ADAS', 'ORTA'],
    ]);
    const [h1, n2] = findings;
    expect(h1).toMatchObject({ olusturmaTarihi: at('2026-09-01'), adasSayisi: 3 });
    expect(h1.aciklama).toMatch(/^Belirsiz: adaş\./);
    expect(h1.aciklama).toContain("AWB'siz: 2");
    // Nearest in time first; a namesake with an unknown date is listed last.
    expect(h1.adaslar?.map((item) => [item.siparisId, item.gunFarki, item.ayniTelefon, item.awb])).toEqual([
      ['n1', 9, false, ''],
      ['n2', -90, true, 'AWB-2'],
      ['n3', null, null, ''],
    ]);
    expect(n2.adaslar?.map((item) => [item.siparisId, item.gunFarki])).toEqual([
      ['h1', 90],
      ['n1', 99],
      ['n3', null],
    ]);
  });

  it('narrows namesakes to a window but keeps those with an unknown date', () => {
    const findings = adasBulgulari(namesakes(), 30);
    expect(findings.map((item) => [item.siparisId, item.adaslar?.map((entry) => entry.siparisId)])).toEqual([
      ['h1', ['n1', 'n3']],
      ['n2', ['n3']],
    ]);
    expect(findings[0].aciklama).toContain('±30 gün');
  });

  it('lists at most twenty namesakes but counts all of them', () => {
    const orders = [
      order('holder', 'Leyla Həsənova', 'AWB-1'),
      ...Array.from({ length: 25 }, (_, index) => order(`same-${index}`, 'Leyla Hasanova', '')),
    ];
    const [finding, ...rest] = adasBulgulari(orders, null);
    expect(rest).toEqual([]);
    expect(finding.adasSayisi).toBe(25);
    expect(finding.adaslar).toHaveLength(20);
  });
});

describe('Read-only command line', () => {
  it('refuses every write mode and validates scope', () => {
    for (const flag of ['--apply', '--write', '--fix', '--no-dry-run'])
      expect(() => parseAuditArguments(['--tenant', 'a', flag])).toThrow(/salt okunur/);
    expect(() => parseAuditArguments([])).toThrow();
    expect(() => parseAuditArguments(['--tenant', 'a', '--all-tenants'])).toThrow();
    expect(() => parseAuditArguments(['--tenant', 'all'])).toThrow();
    expect(() => parseAuditArguments(['--tenant', 'a', '--unknown'])).toThrow();
    expect(() => parseAuditArguments(['--tenant'])).toThrow();
    expect(parseAuditArguments(['--dry-run', '--tenant', 'a', '--manifest', 'x', '--manifest', 'y'])).toEqual({
      tenantId: 'a',
      manifests: ['x', 'y'],
      out: null,
      adasPenceresiGun: null,
      help: false,
    });
    expect(parseAuditArguments(['--help']).help).toBe(true);
  });

  it('accepts an optional namesake window in whole days', () => {
    expect(parseAuditArguments(['--tenant', 'a', '--namesake-window-days', '30']).adasPenceresiGun).toBe(30);
    for (const value of ['0', '-1', '1.5', 'abc', '3651'])
      expect(() => parseAuditArguments(['--tenant', 'a', '--namesake-window-days', value])).toThrow();
    expect(() =>
      parseAuditArguments(['--tenant', 'a', '--namesake-window-days', '5', '--namesake-window-days', '6'])
    ).toThrow();
  });

  it('pages through orders by id and ignores rows of another tenant', async () => {
    const queries: OrderPageQuery[] = [];
    const page = (count: number, start: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `id-${String(start + index).padStart(5, '0')}`,
        tenant_id: 'tenant-a',
        uluslararasi_kargo_kodu: `AWB-${start + index}`,
      }));
    const pages = [page(1000, 0), [...page(1, 1000), { id: 'x', tenant_id: 'tenant-b', uluslararasi_kargo_kodu: 'AWB-X' }]];
    const orders = await readAuditOrders(async (query) => {
      queries.push(query);
      return pages[queries.length - 1] ?? [];
    }, 'tenant-a');
    expect(orders).toHaveLength(1001);
    expect(queries).toEqual([
      { tenantId: 'tenant-a', afterId: null, limit: 1000 },
      { tenantId: 'tenant-a', afterId: 'id-00999', limit: 1000 },
    ]);
  });

  it('builds only a SELECT chain with the tenant filter', async () => {
    const chain: string[] = [];
    const refuse = (name: string) => () => {
      throw new Error(`write method ${name} called`);
    };
    const builder = {
      select: (columns: string) => (chain.push(`select:${columns}`), builder),
      not: (column: string) => (chain.push(`not:${column}`), builder),
      order: (column: string) => (chain.push(`order:${column}`), builder),
      limit: (size: number) => (chain.push(`limit:${size}`), builder),
      eq: (column: string, value: string) => (chain.push(`eq:${column}=${value}`), builder),
      gt: (column: string, value: string) => (chain.push(`gt:${column}=${value}`), builder),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      insert: refuse('insert'),
      update: refuse('update'),
      upsert: refuse('upsert'),
      delete: refuse('delete'),
    };
    const client = { from: (table: string) => (chain.push(`from:${table}`), builder), rpc: refuse('rpc') };
    const readPage = supabaseOrderPageReader(client as unknown as SupabaseClient);
    await readPage({ tenantId: 'tenant-a', afterId: 'id-1', limit: 1000 });
    expect(chain).toEqual([
      'from:siparisler',
      'select:id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu,olusturma_tarihi',
      'order:id',
      'limit:1000',
      'eq:tenant_id=tenant-a',
      'gt:id=id-1',
    ]);
  });

  it('produces a private report from the database and an original manifest', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      readPage: async () => [
        { id: 'o-eli', tenant_id: 'tenant-a', musteri_adi: 'Əli', uluslararasi_kargo_kodu: '37349392426' },
        { id: 'o-eli-2', tenant_id: 'tenant-a', musteri_adi: 'ƏLİ', uluslararasi_kargo_kodu: null },
      ],
      readFile: () => manifestBuffer([['37349392426', 'Natalia Petrova', '+1 416 555 0101']]),
      createReport: createPrivateReport,
      stdout: (text: string) => out.push(text),
      stderr: (text: string) => err.push(text),
    };
    expect(await auditMain(['--tenant', 'tenant-a', '--manifest', '/x/dispatch.xlsx'], deps)).toBe(0);
    const report = JSON.parse(out.join(''));
    expect(report).toMatchObject({
      mod: 'SALT_OKUNUR',
      tarananSiparisSayisi: 2,
      awbliSiparisSayisi: 1,
      adasPenceresiGun: null,
      ozet: { YUKSEK: 1, ORTA: 2 },
    });
    expect(report.bulgular.map((item: { tip: string }) => item.tip).sort()).toEqual([
      'BELIRSIZ_ADAS',
      'ESKI_ESLESTIRME_KISA_ISIM',
      'MANIFEST_ALICI_UYUSMUYOR',
    ]);
    expect(err.join('')).toContain('Hiçbir kayıt değiştirilmedi');

    const file = path.join(tempDir, 'report.json');
    expect(await auditMain(['--tenant', 'tenant-a', '--out', file], deps)).toBe(0);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    await expect(auditMain(['--tenant', 'tenant-a', '--out', file], deps)).rejects.toThrow();

    await expect(auditMain(['--tenant', 'tenant-a'], { ...deps, readPage: null })).rejects.toThrow(
      /SUPABASE_URL/
    );
    expect(await auditMain(['--help'], { ...deps, readPage: null })).toBe(0);
  });
});
