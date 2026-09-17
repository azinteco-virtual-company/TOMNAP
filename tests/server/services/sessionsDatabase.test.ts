import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  database: null as any,
  production: true,
  configured: true,
  cachedUsers: [] as any[],
}));
vi.mock('../../../src/server/config', () => ({
  DATA_DIR: process.env.DATA_DIR,
  API_SECRET_KEY: '',
  get IS_PRODUCTION() {
    return fixture.production;
  },
  get SUPABASE_URL() {
    return fixture.configured ? 'http://127.0.0.1/database-fixture' : '';
  },
}));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return fixture.database;
  },
}));
vi.mock('../../../src/server/services/state', () => ({
  kullanicilarVeritabani: fixture.cachedUsers,
  firmalarVeritabani: [{ id: 'company', onayDurumu: 'AKTIF' }],
}));
import { createSession, readSession, revokeSession } from '../../../src/server/services/sessions';
import { sifreHashle } from '../../../src/server/services/crypto';
import type { KullaniciKaydi } from '../../../src/server/types';

const hash = sifreHashle('Database test password!');
const makeUser = (): KullaniciKaydi => ({
  id: 'user',
  tenant_id: 'company',
  rol: 'PATRON',
  durum: 'AKTIF',
  email: 'user@example.test',
  ad_soyad: 'User',
  sifre_hash: hash,
  olusturma_tarihi: new Date().toISOString(),
});

function database() {
  const tables: Record<string, any[]> = {
    kullanicilar: [makeUser()],
    firmalar: [{ id: 'company', onay_durumu: 'AKTIF' }],
    oturumlar: [],
  };
  const failures: { table: string; operation: string; zero?: boolean; throws?: boolean }[] = [];
  const queries: { table: string; operation: string; filters: [string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    let operation = 'select';
    let inserted: any;
    const filters: [string, unknown][] = [];
    const run = () => {
      queries.push({ table, operation, filters: [...filters] });
      const failureIndex = failures.findIndex(
        (item) => item.table === table && item.operation === operation
      );
      if (failureIndex >= 0) {
        const [failure] = failures.splice(failureIndex, 1);
        if (failure.throws) throw new Error('Database outage');
        return { data: null, error: failure.zero ? null : new Error('Database failure') };
      }
      if (operation === 'insert') {
        tables[table].push({ ...inserted });
        return { data: { ...inserted }, error: null };
      }
      const matches = tables[table].filter((row) =>
        filters.every(([field, value]) => row[field] === value)
      );
      if (operation === 'delete')
        tables[table] = tables[table].filter((row) => !matches.includes(row));
      return { data: matches[0] ? { ...matches[0] } : null, error: null };
    };
    const query: any = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        filters.push([field, value]);
        return query;
      },
      insert: (values: any) => {
        operation = 'insert';
        inserted = values;
        return query;
      },
      delete: () => {
        operation = 'delete';
        return query;
      },
      maybeSingle: () => Promise.resolve().then(run),
      then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
    };
    return query;
  });
  fixture.database = { from };
  return { tables, failures, queries };
}
const response = () => ({ cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() }) as any;
async function issue() {
  const res = response();
  const metadata = await createSession(makeUser(), res);
  const token = res.cookie.mock.calls[0][1];
  return { req: { headers: { cookie: `tomnap_session=${token}` } } as any, res, metadata };
}

beforeEach(() => {
  fixture.production = true;
  fixture.configured = true;
  fixture.cachedUsers.length = 0;
  fixture.cachedUsers.push(makeUser());
});

describe('Supabase sessions use authoritative account and session records', () => {
  it('persists a hashed session before setting a Secure host-only production cookie', async () => {
    const db = database();
    const { res, req, metadata } = await issue();
    expect(res.cookie).toHaveBeenCalledWith(
      'tomnap_session',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 28800000,
      })
    );
    expect(res.cookie.mock.calls[0][2]).not.toHaveProperty('domain');
    expect(db.tables.oturumlar).toHaveLength(1);
    expect(db.tables.oturumlar[0].token_hash).not.toBe(res.cookie.mock.calls[0][1]);
    const context = await readSession(req);
    expect(context).toMatchObject({
      userId: 'user',
      role: 'PATRON',
      tenantId: 'company',
      csrfToken: metadata.csrfToken,
    });
    expect(
      db.queries.filter((item) => item.table === 'oturumlar' && item.operation === 'select')[0]
        .filters
    ).toEqual([['token_hash', context!.sessionHash]]);
  });

  it.each([{ zero: false }, { zero: true }, { throws: true }])(
    'issues no cookie when insertion is unsuccessful: %j',
    async (failure) => {
      const db = database();
      db.failures.push({ table: 'oturumlar', operation: 'insert', ...failure });
      const res = response();
      await expect(createSession(makeUser(), res)).rejects.toThrow();
      expect(res.cookie).not.toHaveBeenCalled();
    }
  );

  it.each(['oturumlar', 'kullanicilar', 'firmalar'])(
    'fails closed on a %s lookup error despite valid local account cache',
    async (table) => {
      const db = database();
      const { req } = await issue();
      db.failures.push({ table, operation: 'select' });
      await expect(readSession(req)).rejects.toThrow('Database failure');
    }
  );

  it('rejects a token that exists only in local cache after the database session is removed', async () => {
    const db = database();
    const { req } = await issue();
    db.tables.oturumlar.length = 0;
    expect(await readSession(req)).toBeNull();
  });

  it.each([
    { durum: 'PASIF' },
    { sifre_hash: sifreHashle('Replacement password!') },
    { rol: 'SUPER_ADMIN' },
    { tenant_id: 'different-company' },
  ])('invalidates stale sessions when authoritative account changes: %j', async (changes) => {
    const db = database();
    const { req } = await issue();
    Object.assign(db.tables.kullanicilar[0], changes);
    expect(await readSession(req)).toBeNull();
  });

  it.each(['BEKLEMEDE', 'REDDEDILDI'])(
    'invalidates a session when its company becomes %s',
    async (onay_durumu) => {
      const db = database();
      const { req } = await issue();
      db.tables.firmalar[0].onay_durumu = onay_durumu;
      expect(await readSession(req)).toBeNull();
    }
  );

  it('rejects an orphan company and malformed stored session fingerprint', async () => {
    const db = database();
    const { req } = await issue();
    db.tables.oturumlar[0].credential_fingerprint = 'bad';
    expect(await readSession(req)).toBeNull();
    const { req: second } = await issue();
    db.tables.firmalar.length = 0;
    expect(await readSession(second)).toBeNull();
  });

  it('deletes the database token on logout and prevents reuse', async () => {
    const db = database();
    const { req } = await issue();
    const res = response();
    await revokeSession(req, res);
    expect(db.tables.oturumlar).toEqual([]);
    expect(await readSession(req)).toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith(
      'tomnap_session',
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' })
    );
  });

  it('reports failed server revocation while still clearing the browser cookie', async () => {
    const db = database();
    const { req } = await issue();
    db.failures.push({ table: 'oturumlar', operation: 'delete' });
    const res = response();
    await expect(revokeSession(req, res)).rejects.toThrow('Database failure');
    expect(res.clearCookie).toHaveBeenCalled();
    expect(db.tables.oturumlar).toHaveLength(1);
  });

  it.each([
    { production: true, configured: false },
    { production: false, configured: true },
  ])('never falls back to files when a database is required: %j', async (settings) => {
    Object.assign(fixture, settings, { database: null });
    const res = response();
    await expect(createSession(makeUser(), res)).rejects.toThrow('Session database is unavailable');
    await expect(
      readSession({ headers: { cookie: `tomnap_session=${'a'.repeat(64)}` } } as any)
    ).rejects.toThrow('Session database is unavailable');
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
