import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';

// Codex R3 F8: one note contract for v1 and v2. The note lives in baku_tahsilat_notu as
// "[TƏLİMAT: …]" (every v1 order already stores it there). No migration creates a
// physical ozel_not column, yet the v2 RPC wrote it and the v2 read selected it; and the
// v1 read preferred that column, so a v1 note edit on a v2 order was invisible.
// The fake database mirrors PostgREST: selecting or writing a column the table does not
// have is an error. Each flow runs with and without a legacy physical ozel_not column.
type Row = Record<string, unknown>;
const env = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import v1Router from '../../../src/server/routes/siparisler';
import v2Router from '../../../src/server/routes/v2/siparisler';

const TENANT = 'not_sozlesmesi';
const USER = 'not-patron';
const BASE_COLUMNS = [
  'id',
  'tenant_id',
  'model_surumu',
  'sahip_kullanici_id',
  'ham_mesaj',
  'siparis_kaynagi',
  'musteri_adi',
  'instagram_kullanici_adi',
  'telefon_numarasi',
  'teslimat_sehri',
  'teslimat_adresi',
  'urun_aciklamasi',
  'beden_veya_olcu',
  'renk',
  'adet',
  'toplam_tutar',
  'alinan_tutar',
  'kalan_tutar',
  'para_birimi',
  'finans_durumu',
  'lojistik_durumu',
  'baku_kurye_id',
  'baku_kurye_adi',
  'baku_kurye_bolgesi',
  'teslim_tarihi',
  'teslim_eden_kisi',
  'baku_tahsilat_notu',
  'kanada_takip_kodu',
  'uluslararasi_kargo_kodu',
  'eksik_bilgiler',
  'ai_guven_skoru',
  'is_demo',
  'ek_veriler',
  'kurye_atama_surumu',
  'olusturma_tarihi',
  'guncellenme_tarihi',
];

/** A PostgREST-like fake over one siparisler table and its order lines. */
function fakeDb(physicalNote: boolean) {
  const columns = new Set([...BASE_COLUMNS, ...(physicalNote ? ['ozel_not'] : [])]);
  const orders: Row[] = [];
  const lines: Row[] = [];
  const missing = { data: null, error: { code: '42703', message: 'column does not exist' } };
  const query = (table: string) => {
    const rows = table === 'siparisler' ? orders : lines;
    let selected: string[] | null = null;
    const filters: Array<(row: Row) => boolean> = [];
    let unknownColumn = false;
    const run = () => {
      if (unknownColumn) return missing;
      const found = rows.filter((row) => filters.every((f) => f(row)));
      const data = found.map((row) =>
        selected ? Object.fromEntries(selected.map((c) => [c, row[c] ?? null])) : { ...row }
      );
      return { data, error: null };
    };
    const chain = {
      select(cols: string) {
        if (cols !== '*') {
          selected = cols.split(',');
          if (table === 'siparisler' && selected.some((c) => !columns.has(c))) unknownColumn = true;
        }
        return chain;
      },
      eq(col: string, value: unknown) {
        filters.push((row) => row[col] === value);
        return chain;
      },
      in(col: string, values: unknown[]) {
        filters.push((row) => values.includes(row[col]));
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      maybeSingle: () => {
        const result = run();
        return Promise.resolve(
          result.error ? result : { data: result.data?.[0] ?? null, error: null }
        );
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return chain;
  };
  const rpc = (name: string, args: Row) => {
    if (name === 'tomnap_v2_siparis_olustur') {
      // The contract of 20260925160000: the note goes into baku_tahsilat_notu.
      const siparis = args.p_siparis as Row;
      const satirlar = args.p_satirlar as Row[];
      const note = (typeof siparis.ozel_not === 'string' ? siparis.ozel_not.trim() : '')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const toplam = satirlar.reduce(
        (sum, s) => sum + Number(s.adet) * Number(s.birim_satis_fiyati_azn),
        0
      );
      const row: Row = {
        id: randomUUID(),
        tenant_id: args.p_tenant_id,
        model_surumu: 2,
        sahip_kullanici_id: args.p_user_id,
        ham_mesaj: siparis.ham_mesaj ?? '',
        siparis_kaynagi: 'INSTAGRAM_DM',
        musteri_adi: siparis.musteri_adi,
        teslimat_sehri: 'Bakü',
        urun_aciklamasi: satirlar.map((s) => s.urun_aciklamasi).join(' + '),
        adet: satirlar.reduce((n, s) => n + Number(s.adet), 0),
        toplam_tutar: toplam,
        alinan_tutar: 0,
        kalan_tutar: toplam,
        para_birimi: 'AZN',
        finans_durumu: 'BEKLIYOR',
        lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
        baku_tahsilat_notu: note ? `[TƏLİMAT: ${note}]` : null,
        eksik_bilgiler: [],
        is_demo: false,
        ek_veriler: {},
        kurye_atama_surumu: 0,
        olusturma_tarihi: new Date().toISOString(),
        ...(physicalNote ? { ozel_not: null } : {}),
      };
      orders.push(row);
      const created = satirlar.map((s, i) => ({
        ...s,
        id: randomUUID(),
        tenant_id: args.p_tenant_id,
        siparis_id: row.id,
        sira: i + 1,
        beden: null,
        renk: null,
        iptal: false,
      }));
      lines.push(...created);
      return Promise.resolve({ data: { siparis: row, satirlar: created }, error: null });
    }
    if (name === 'tomnap_list_page') {
      const items = orders.filter((row) => row.tenant_id === args.p_tenant);
      return Promise.resolve({
        data: { items, total: items.length, revision: 'r1' },
        error: null,
      });
    }
    if (name === 'tomnap_siparis_guncelle') {
      // Like the RPC: only real columns, only when the expected values still hold.
      const row = orders.find(
        (r) => r.id === args.p_siparis_id && r.tenant_id === args.p_tenant_id
      );
      const change = args.p_degisiklik as Row;
      if (!row) return Promise.resolve({ data: null, error: { code: 'PT404' } });
      if (Object.keys(change).some((key) => !columns.has(key)))
        return Promise.resolve({ data: null, error: { code: '22023' } });
      for (const [key, value] of Object.entries(args.p_beklenen as Row))
        if (JSON.stringify(row[key] ?? null) !== JSON.stringify(value ?? null))
          return Promise.resolve({ data: null, error: { code: 'PT409' } });
      Object.assign(row, change);
      return Promise.resolve({ data: { ...row }, error: null });
    }
    return Promise.resolve({ data: null, error: { code: 'XX000' } });
  };
  return { db: { from: query, rpc }, orders };
}

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    req.tenantId = TENANT;
    req.auth = { role: 'PATRON', tenantId: TENANT, userId: USER } as never;
    next();
  });
  server.use('/api/v2', v2Router);
  server.use('/api', v1Router);
  return server;
}

const newOrder = {
  musteri_adi: 'Aytən',
  ozel_not: 'Qapıda zəng edin',
  satirlar: [{ urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 80, kaynak_ulke: 'CA' }],
};

/** The note as the v2 and the v1 read show it. */
async function notes(id: string) {
  const v2 = await request(app()).get(`/api/v2/siparisler/${id}`);
  const v2List = await request(app()).get('/api/v2/siparisler');
  const v1 = await request(app()).get('/api/siparisler');
  expect(v2.status, JSON.stringify(v2.body)).toBe(200);
  expect(v2List.status, JSON.stringify(v2List.body)).toBe(200);
  expect(v1.status, JSON.stringify(v1.body)).toBe(200);
  const v1Order = (v1.body.siparisler as Row[]).find((s) => s.id === id);
  const listed = (v2List.body.siparisler as Row[]).find((s) => s.id === id);
  return {
    v2: v2.body.siparis.ozelNot ?? '',
    v2List: listed?.ozelNot ?? '',
    v1: v1Order?.ozel_not ?? '',
    v1Tahsilat: v1Order?.baku_tahsilat_notu ?? '',
  };
}
const same = (note: string) => ({ v2: note, v2List: note, v1: note, v1Tahsilat: '' });

beforeAll(() => {
  firmalarVeritabani.push({
    id: TENANT,
    ad: 'Not sözleşmesi',
    sehir: 'Baku',
    aciklama: '',
    varsayilanParaBirimi: 'AZN',
    varsayilanKomisyonYuzdesi: 15,
    onayDurumu: 'AKTIF',
  });
  kullanicilarVeritabani.push({
    id: USER,
    tenant_id: TENANT,
    ad_soyad: 'Patron',
    email: 'not-patron@example.invalid',
    rol: 'PATRON',
    durum: 'AKTIF',
    olusturma_tarihi: new Date().toISOString(),
  });
});

describe.each([
  ['without a physical ozel_not column', false],
  ['with a legacy physical ozel_not column', true],
])('order note contract, database %s (Codex R3 F8)', (_name, physicalNote) => {
  let fake: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    fake = fakeDb(physicalNote);
    env.db = fake.db;
  });

  it('POST -> GET -> note PATCH -> GET shows one note everywhere', async () => {
    const created = await request(app()).post('/api/v2/siparisler').send(newOrder);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.siparis.id as string;
    expect(created.body.siparis.ozelNot).toBe('Qapıda zəng edin');
    expect(await notes(id)).toEqual(same('Qapıda zəng edin'));

    const edited = await request(app())
      .patch(`/api/siparisler/${id}`)
      .send({ ozel_not: 'Nərimanovda qonşuya verin' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.siparis.ozel_not).toBe('Nərimanovda qonşuya verin');
    expect(await notes(id)).toEqual(same('Nərimanovda qonşuya verin'));
    const stored = fake.orders.find((row) => row.id === id)!;
    expect(stored.baku_tahsilat_notu).toBe('[TƏLİMAT: Nərimanovda qonşuya verin]');

    // The collection note stays apart from the delivery note.
    await request(app()).patch(`/api/siparisler/${id}`).send({ baku_tahsilat_notu: 'Nağd' });
    expect(await notes(id)).toMatchObject({ v2: 'Nərimanovda qonşuya verin', v1Tahsilat: 'Nağd' });

    const cleared = await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: '' });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(await notes(id)).toMatchObject({ v2: '', v2List: '', v1: '' });
  });

  it('a bracket in the note does not break the tag', async () => {
    const created = await request(app())
      .post('/api/v2/siparisler')
      .send({ ...newOrder, ozel_not: 'Kod [12] qapı' });
    const id = created.body.siparis.id as string;
    await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: 'Blok [B] mənzil 4' });
    expect(await notes(id)).toEqual(same('Blok (B) mənzil 4'));
  });

  it.runIf(physicalNote)('an edit or a clear wins over an older physical note', async () => {
    const created = await request(app()).post('/api/v2/siparisler').send(newOrder);
    const id = created.body.siparis.id as string;
    // An order written by an older RPC body: the note only in the physical column.
    const stored = fake.orders.find((row) => row.id === id)!;
    Object.assign(stored, { baku_tahsilat_notu: null, ozel_not: 'Köhnə qeyd' });
    expect(await notes(id)).toEqual(same('Köhnə qeyd'));
    await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: 'Yeni qeyd' });
    expect(await notes(id)).toEqual(same('Yeni qeyd'));
    await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: '' });
    expect(await notes(id)).toMatchObject({ v2: '', v1: '' });
  });
});

describe('order note contract in memory mode (Codex R3 F8)', () => {
  beforeEach(() => {
    env.db = null;
  });

  it('POST -> GET -> note PATCH -> GET shows one note everywhere', async () => {
    const created = await request(app()).post('/api/v2/siparisler').send(newOrder);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.siparis.id as string;
    expect(await notes(id)).toEqual(same('Qapıda zəng edin'));
    await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: 'Yeni qeyd' });
    expect(await notes(id)).toEqual(same('Yeni qeyd'));
    expect(siparislerVeritabani.find((row) => row.id === id)?.model_surumu).toBe(2);
    await request(app()).patch(`/api/siparisler/${id}`).send({ ozel_not: '' });
    expect(await notes(id)).toMatchObject({ v2: '', v1: '' });
  });
});
