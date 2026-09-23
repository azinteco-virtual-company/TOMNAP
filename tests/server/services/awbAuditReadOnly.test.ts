import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { auditMain, supabaseOrderPageReader } from '../../../scripts/audit-awb-matches';

// Runtime proof that the audit script only reads: the real supabase-js client
// talks to a local PostgREST stand-in that records every request it receives.
interface SeenRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: string;
}
const seen: SeenRequest[] = [];
let server: http.Server;
let baseUrl = '';

const row = (index: number) => ({
  id: `id-${String(index).padStart(5, '0')}`,
  tenant_id: 'tenant-a',
  musteri_adi: index === 0 ? 'Əli' : `Customer ${index}`,
  telefon_numarasi: '',
  lojistik_durumu: 'ULUSLARARASI_KARGO',
  uluslararasi_kargo_kodu: `AWB-${index}`,
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      seen.push({ method: req.method ?? '', path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      if (req.method !== 'GET' || url.pathname !== '/rest/v1/siparisler') {
        res.writeHead(500, { 'content-type': 'application/json' }).end('{"message":"unexpected request"}');
        return;
      }
      const rows = url.searchParams.has('id') ? [row(1000), row(1001)] : Array.from({ length: 1000 }, (_, index) => row(index));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rows));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function manifestBuffer(rows: string[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Waybill Number', 'Consignee Name', 'Telephone'], ...rows]),
    'DailyDispatch'
  );
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('AWB audit script is read-only at the HTTP level', () => {
  it('sends only GET requests for siparisler through the real Supabase client', async () => {
    const client = createClient(baseUrl, 'synthetic-service-key', { auth: { persistSession: false } });
    const out: string[] = [];
    const code = await auditMain(['--tenant', 'tenant-a', '--manifest', '/manifests/dispatch.xlsx'], {
      readPage: supabaseOrderPageReader(client),
      readFile: () => manifestBuffer([['AWB-0', 'Natalia Petrova', '+1 416 555 0101']]),
      createReport: () => {
        throw new Error('No report file is expected without --out');
      },
      stdout: (text) => out.push(text),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /rest/v1/siparisler',
      'GET /rest/v1/siparisler',
    ]);
    expect(seen.every((request) => request.body === '')).toBe(true);
    expect(seen[0].query).toEqual({
      select: 'id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu',
      uluslararasi_kargo_kodu: 'not.is.null',
      order: 'id.asc',
      limit: '1000',
      tenant_id: 'eq.tenant-a',
    });
    expect(seen[1].query).toMatchObject({ tenant_id: 'eq.tenant-a', id: 'gt.id-00999' });
    const report = JSON.parse(out.join(''));
    expect(report.awbliSiparisSayisi).toBe(1002);
    expect(report.bulgular).toContainEqual(
      expect.objectContaining({ siparisId: 'id-00000', tip: 'MANIFEST_ALICI_UYUSMUYOR' })
    );
  });
});
