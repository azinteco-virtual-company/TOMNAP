import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  db: null as any,
  users: [] as any[],
  firms: [] as any[],
  invites: [] as any[],
  saveUsers: vi.fn(),
  saveFirms: vi.fn(),
  jobs: [] as any[],
}));
vi.mock('../../../src/server/services/state', () => ({
  kullanicilarVeritabani: state.users,
  firmalarVeritabani: state.firms,
  kullanicilariKaydetDosyaya: state.saveUsers,
  firmalariKaydetDosyaya: state.saveFirms,
  davetlerVeritabani: state.invites,
  getIdentitySnapshot: () =>
    structuredClone({
      companies: state.firms,
      users: state.users,
      invites: state.invites,
      emailJobs: state.jobs,
    }),
  saveIdentitySnapshot: (next: any) => {
    state.saveUsers(next.users);
    state.saveFirms(next.companies);
    state.users.splice(0, state.users.length, ...structuredClone(next.users));
    state.firms.splice(0, state.firms.length, ...structuredClone(next.companies));
    state.invites.splice(0, state.invites.length, ...structuredClone(next.invites));
  },
}));
vi.mock('../../../src/server/routes/firmalar', () => ({ davetlerVeritabani: state.invites }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return state.db;
  },
}));

import authRouter from '../../../src/server/routes/auth';
import { sifreDogrula, sifreHashle } from '../../../src/server/services/crypto';

const app = express();
app.use(express.json());
app.use('/api', authRouter);
const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const password = 'SecurePassword123!';
const future = () => new Date(Date.now() + 3600000).toISOString();
const past = () => new Date(Date.now() - 3600000).toISOString();
const pendingUser = (extra = {}) => ({
  id: 'user-1',
  tenant_id: 'firma-1',
  ad_soyad: 'Test Owner',
  email: 'owner@example.test',
  telefon: '+994501234567',
  rol: 'PATRON',
  durum: 'BEKLEMEDE_SIFRE',
  aktivasyon_token: token,
  token_gecerlilik: future(),
  olusturma_tarihi: new Date().toISOString(),
  ...extra,
});
const localInvite = (extra = {}) => ({
  token,
  tenantId: 'firma-1',
  tenantAd: 'Test Boutique',
  rol: 'BAKU_KURYE',
  gecerlilikTarihi: future(),
  kullanildiMi: false,
  email: 'invitee@example.test',
  ...extra,
});
const dbInvite = (extra = {}) => ({
  id: 'invite-1',
  token,
  firma_id: 'firma-1',
  rol: 'BAKU_KURYE',
  durum: 'AKTIF',
  son_kullanma_tarihi: future(),
  olusturma_tarihi: new Date().toISOString(),
  ...extra,
});

// A deterministic in-memory PostgREST stand-in evaluates the actual filters.
// It returns no row when a conditional UPDATE loses a race, as Supabase does.
function database(tables: Record<string, any[]>) {
  const queries: { table: string; operation: string; filters: [string, string, any][] }[] = [];
  const failures: {
    table: string;
    operation: string;
    error?: boolean;
    zero?: boolean;
    throws?: boolean;
  }[] = [];
  const from = vi.fn((table: string) => {
    let operation = 'select';
    let values: any;
    let returning = false;
    const filters: [string, string, any][] = [];
    const run = () => {
      queries.push({ table, operation, filters: [...filters] });
      const failureIndex = failures.findIndex(
        (item) => item.table === table && item.operation === operation
      );
      if (failureIndex >= 0) {
        const [failure] = failures.splice(failureIndex, 1);
        if (failure.throws) throw new Error('private database detail');
        if (failure.error) return { data: null, error: { message: 'private database detail' } };
        if (failure.zero) return { data: null, error: null };
      }
      const rows = tables[table] || [];
      const found = rows.filter((row) =>
        filters.every(([kind, key, value]) =>
          kind === 'eq'
            ? row[key] === value
            : kind === 'ilike'
              ? String(row[key]).toLowerCase() === String(value).toLowerCase()
              : Date.parse(row[key]) > Date.parse(value)
        )
      );
      if (operation === 'insert') {
        rows.push({ ...values });
        return { data: returning ? { ...values } : null, error: null };
      }
      if (found.length > 1 && returning) return { data: null, error: { message: 'multiple rows' } };
      if (operation === 'update') found.forEach((row) => Object.assign(row, values));
      return {
        data: found[0] && (operation === 'select' || returning) ? { ...found[0] } : null,
        error: null,
      };
    };
    const query: any = {
      select: () => {
        returning = true;
        return query;
      },
      update: (changes: any) => {
        operation = 'update';
        values = changes;
        return query;
      },
      insert: (row: any) => {
        operation = 'insert';
        values = row;
        return query;
      },
      eq: (key: string, value: any) => {
        filters.push(['eq', key, value]);
        return query;
      },
      gt: (key: string, value: any) => {
        filters.push(['gt', key, value]);
        return query;
      },
      ilike: (key: string, value: any) => {
        // These login cases use exact email patterns only.
        if (String(value).includes('%')) throw new Error('unsupported wildcard fixture');
        filters.push(['ilike', key, value]);
        return query;
      },
      maybeSingle: async () => run(),
      then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
    };
    return query;
  });
  // RPC boundary stand-in; transaction semantics are exercised against PostgreSQL
  // in tests/sql/onboarding-transactions.sql, including injected write failures.
  const rpc = vi.fn(async (name: string, args: any) => {
    const failureIndex = failures.findIndex(
      (item) => item.operation !== 'select' || item.table === 'firmalar'
    );
    if (failureIndex >= 0) {
      const [failure] = failures.splice(failureIndex, 1);
      if (failure.throws) throw new Error('private database detail');
      return { data: null, error: failure.zero ? null : { message: 'private database detail' } };
    }
    if (name === 'tomnap_activate_user') {
      const user = tables.kullanicilar.find(
        (item) =>
          item.aktivasyon_token === args.p_token &&
          item.durum === 'BEKLEMEDE_SIFRE' &&
          Date.parse(item.token_gecerlilik) > Date.now()
      );
      if (!user) return { data: null, error: { code: 'PT409' } };
      Object.assign(user, {
        sifre_hash: args.p_password_hash,
        ad_soyad: args.p_name,
        telefon: args.p_phone,
        durum: 'AKTIF',
        aktivasyon_token: null,
        token_gecerlilik: null,
      });
      const firma = tables.firmalar.find((item) => item.id === user.tenant_id);
      firma.onay_durumu = 'AKTIF';
      return { data: { user, firma }, error: null };
    }
    if (name === 'tomnap_accept_invite') {
      const invite = tables.davetler.find(
        (item) =>
          item.token === args.p_token &&
          item.durum === 'AKTIF' &&
          Date.parse(item.son_kullanma_tarihi) > Date.now()
      );
      if (!invite) return { data: null, error: { code: 'PT409' } };
      invite.durum = 'KULLANILDI';
      tables.kullanicilar.push(args.p_user);
      return {
        data: {
          user: args.p_user,
          firma: tables.firmalar.find((item) => item.id === invite.firma_id),
        },
        error: null,
      };
    }
    throw new Error('Unexpected RPC');
  });
  state.db = { from, rpc };
  return { queries, failures, tables, rpc };
}

beforeEach(() => {
  state.db = null;
  state.users.length = 0;
  state.invites.length = 0;
  state.firms.length = 0;
  state.firms.push({
    id: 'firma-1',
    ad: 'Test Boutique',
    sahipEmail: 'owner@example.test',
    onayDurumu: 'AKTIF',
    rolLimitleri: { PATRON: 1, BAKU_KURYE: 1 },
  });
  vi.clearAllMocks();
});

describe('Activation security with local storage', () => {
  it.each([undefined, '', '   ', 123, {}, []])(
    'requires a string token even when an email is supplied (%j)',
    async (badToken) => {
      state.users.push(pendingUser());
      const res = await request(app)
        .post('/api/auth/sifre-belirle')
        .send({ token: badToken, email: 'owner@example.test', sifre: password });
      expect(res.status).toBe(400);
      expect(state.users[0].durum).toBe('BEKLEMEDE_SIFRE');
      expect(state.saveUsers).not.toHaveBeenCalled();
    }
  );

  it.each([
    { token_gecerlilik: past() },
    { token_gecerlilik: null },
    { token_gecerlilik: 'invalid-date' },
    { durum: 'AKTIF' },
    { durum: 'PASIF' },
  ])('rejects invalid activation state for inspection and use: %j', async (changes) => {
    state.users.push(pendingUser(changes));
    expect((await request(app).get(`/api/auth/token-kontrol/${token}`)).status).toBe(400);
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(400);
    expect(state.users[0].sifre_hash).toBeUndefined();
    expect(state.saveUsers).not.toHaveBeenCalled();
  });

  it('accepts the full valid token once and never accepts a matching prefix', async () => {
    state.users.push(pendingUser());
    const invalidToken = token.slice(0, 16) + 'wrong-suffix';
    expect((await request(app).get(`/api/auth/token-kontrol/${invalidToken}`)).status).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token: invalidToken, email: 'owner@example.test', sifre: password })
      ).status
    ).toBe(404);
    expect((await request(app).get(`/api/auth/token-kontrol/${token}`)).status).toBe(200);
    expect(state.saveUsers).not.toHaveBeenCalled();
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(200);
    expect(state.users[0].durum).toBe('AKTIF');
    expect(state.users[0].aktivasyon_token).toBeNull();
    expect(sifreDogrula(password, state.users[0].sifre_hash)).toBe(true);
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token, sifre: 'DifferentPassword!' })
      ).status
    ).toBe(404);
    expect(sifreDogrula(password, state.users[0].sifre_hash)).toBe(true);
  });

  it('allows only one concurrent local activation', async () => {
    state.users.push(pendingUser());
    const results = await Promise.all(
      [password, 'OtherPassword123!'].map((sifre) =>
        request(app).post('/api/auth/sifre-belirle').send({ token, sifre })
      )
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(state.saveUsers).toHaveBeenCalledTimes(1);
  });
});

describe('Invitation security with local storage', () => {
  it.each([
    { kullanildiMi: true },
    { gecerlilikTarihi: past() },
    { gecerlilikTarihi: 'invalid' },
    { gecerlilikTarihi: null },
  ])('denies unavailable invitation %j on both acceptance paths', async (changes) => {
    state.invites.push(localInvite(changes));
    for (const path of ['/api/auth/sifre-belirle', '/api/firmalar/davet/katil']) {
      expect((await request(app).post(path).send({ token, sifre: password })).status).toBe(400);
    }
    expect(state.users).toHaveLength(0);
    expect(state.saveUsers).not.toHaveBeenCalled();
  });

  it('requires a password for the legacy acceptance alias and prevents reuse', async () => {
    state.invites.push(localInvite());
    expect(
      (await request(app).post('/api/firmalar/davet/katil').send({ token, adSoyad: 'Invitee' }))
        .status
    ).toBe(400);
    const accepted = await request(app)
      .post('/api/firmalar/davet/katil')
      .send({ token, sifre: password, adSoyad: 'Invitee' });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      tenantId: 'firma-1',
      tenantAd: 'Test Boutique',
      rol: 'BAKU_KURYE',
    });
    expect(state.invites[0].kullanildiMi).toBe(true);
    expect(state.users[0].email).toBe('invitee@example.test');
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(400);
    expect(state.users).toHaveLength(1);
  });
});

describe('Supabase activation security', () => {
  const prepare = (users = [pendingUser()]) =>
    database({
      kullanicilar: users,
      davetler: [],
      firmalar: [{ id: 'firma-1', ad: 'Test Boutique', onay_durumu: 'BEKLEMEDE' }],
    });

  it('never repairs an orphan boutique or searches an approximate token or email', async () => {
    const db = prepare([]);
    for (const action of ['get', 'post']) {
      const res =
        action === 'get'
          ? await request(app).get(`/api/auth/token-kontrol/${token}`)
          : await request(app)
              .post('/api/auth/sifre-belirle')
              .send({ token, email: 'owner@example.test', sifre: password });
      expect(res.status).toBe(404);
    }
    expect(db.tables.kullanicilar).toHaveLength(0);
    expect(db.queries.every((query) => query.operation === 'select')).toBe(true);
    expect(db.queries.every((query) => query.table !== 'firmalar')).toBe(true);
    expect(
      db.queries
        .filter((query) => query.table === 'kullanicilar')
        .every(
          (query) =>
            JSON.stringify(query.filters) === JSON.stringify([['eq', 'aktivasyon_token', token]])
        )
    ).toBe(true);
  });

  it('does not accept a matching token prefix', async () => {
    prepare();
    const invalid = token.slice(0, 16) + 'wrong-suffix';
    expect((await request(app).get(`/api/auth/token-kontrol/${invalid}`)).status).toBe(404);
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token: invalid, sifre: password }))
        .status
    ).toBe(404);
  });

  it.each([
    { token_gecerlilik: past() },
    { token_gecerlilik: null },
    { token_gecerlilik: 'invalid' },
    { durum: 'AKTIF' },
    { durum: 'PASIF' },
  ])('rejects invalid database activation state %j', async (changes) => {
    const db = prepare([pendingUser(changes)]);
    expect((await request(app).get(`/api/auth/token-kontrol/${token}`)).status).toBe(400);
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(400);
    expect(db.queries.every((query) => query.operation === 'select')).toBe(true);
    expect(state.users).toHaveLength(0);
  });

  it.each(['get', 'post'])(
    'fails closed on lookup errors despite a valid local cache (%s)',
    async (method) => {
      state.users.push(pendingUser());
      const db = prepare();
      db.failures.push({ table: 'kullanicilar', operation: 'select', error: true });
      const res =
        method === 'get'
          ? await request(app).get(`/api/auth/token-kontrol/${token}`)
          : await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password });
      expect(res.status).toBe(503);
      expect(res.body.basarili).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('private database detail');
      expect(state.users[0].durum).toBe('BEKLEMEDE_SIFRE');
      expect(state.saveUsers).not.toHaveBeenCalled();
    }
  );

  it('does not use a stale local token absent from Supabase', async () => {
    state.users.push(pendingUser());
    prepare([]);
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(404);
    expect(state.users[0].durum).toBe('BEKLEMEDE_SIFRE');
  });

  it.each([
    { error: true, status: 503 },
    { throws: true, status: 503 },
    { zero: true, status: 409 },
  ])(
    'does not activate local state after unsuccessful atomic RPC (%j)',
    async ({ status, ...failure }) => {
      state.users.push(pendingUser());
      const db = prepare();
      db.failures.push({ table: 'kullanicilar', operation: 'update', ...failure });
      const res = await request(app)
        .post('/api/auth/sifre-belirle')
        .send({ token, sifre: password });
      expect(res.status).toBe(status);
      expect(state.users[0].durum).toBe('BEKLEMEDE_SIFRE');
      expect(state.users[0].sifre_hash).toBeUndefined();
      expect(state.saveUsers).not.toHaveBeenCalled();
      expect(db.rpc).toHaveBeenCalledWith(
        'tomnap_activate_user',
        expect.objectContaining({ p_token: token })
      );
      expect(db.queries.every((query) => query.operation === 'select')).toBe(true);
    }
  );

  it('returns failure if firm lookup fails before account mutation', async () => {
    const db = prepare();
    db.failures.push({ table: 'firmalar', operation: 'select', error: true });
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(503);
    expect(db.tables.kullanicilar[0].durum).toBe('BEKLEMEDE_SIFRE');
    expect(state.saveUsers).not.toHaveBeenCalled();
  });

  it('returns failure and avoids caching success if firm update fails', async () => {
    const db = prepare();
    db.failures.push({ table: 'firmalar', operation: 'update', error: true });
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: password })).status
    ).toBe(503);
    expect(state.users).toHaveLength(0);
    expect(db.tables.kullanicilar[0].durum).toBe('BEKLEMEDE_SIFRE');
  });

  it('consumes a valid token through one RPC without local cache writes', async () => {
    const db = prepare();
    const results = await Promise.all(
      [password, 'OtherPassword123!'].map((sifre) =>
        request(app).post('/api/auth/sifre-belirle').send({ token, sifre })
      )
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(db.rpc).toHaveBeenCalledWith(
      'tomnap_activate_user',
      expect.objectContaining({ p_token: token })
    );
    expect(db.tables.kullanicilar[0].aktivasyon_token).toBeNull();
    expect(state.users).toHaveLength(0);
  });
});

describe('Supabase invitation security against the committed schema', () => {
  const prepare = (invite = dbInvite()) =>
    database({
      kullanicilar: [],
      davetler: [invite],
      firmalar: [{ id: 'firma-1', ad: 'Test Boutique' }],
    });

  it.each([
    { durum: 'KULLANILDI' },
    { durum: 'IPTAL' },
    { son_kullanma_tarihi: past() },
    { son_kullanma_tarihi: null },
  ])('denies unusable invitation %j', async (changes) => {
    const db = prepare(dbInvite(changes));
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token, sifre: password, email: 'invitee@example.test' })
      ).status
    ).toBe(400);
    expect(db.tables.kullanicilar).toHaveLength(0);
    expect(db.queries.every((query) => query.operation === 'select')).toBe(true);
  });

  it.each([
    { operation: 'select', error: true, status: 503 },
    { operation: 'update', error: true, status: 503 },
    { operation: 'update', zero: true, status: 409 },
  ])('denies invitation when storage fails (%j)', async ({ status, operation, ...failure }) => {
    const db = prepare();
    state.invites.push(localInvite());
    db.failures.push({ table: 'davetler', operation, ...failure });
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token, sifre: password, email: 'invitee@example.test' })
      ).status
    ).toBe(status);
    expect(state.users).toHaveLength(0);
    expect(state.invites[0].kullanildiMi).toBe(false);
    expect(db.tables.kullanicilar).toHaveLength(0);
  });

  it('keeps the invitation available when its atomic transaction fails', async () => {
    const db = prepare();
    db.failures.push({ table: 'kullanicilar', operation: 'insert', error: true });
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token, sifre: password, email: 'invitee@example.test' })
      ).status
    ).toBe(503);
    expect(state.users).toHaveLength(0);
    expect(db.tables.kullanicilar).toHaveLength(0);
    expect(db.tables.davetler[0].durum).toBe('AKTIF');
  });

  it('accepts canonical schema invitation once, including concurrent requests', async () => {
    const db = prepare();
    expect((await request(app).get(`/api/auth/token-kontrol/${token}`)).body).toMatchObject({
      tip: 'davet',
      tenantId: 'firma-1',
    });
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post('/api/firmalar/davet/katil')
          .send({ token, sifre: password, adSoyad: 'Invitee', email: 'invitee@example.test' })
      )
    );
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(db.tables.kullanicilar).toHaveLength(1);
    expect(state.users).toHaveLength(0);
    expect(db.tables.davetler[0].durum).toBe('KULLANILDI');
    expect(db.rpc).toHaveBeenCalledWith(
      'tomnap_accept_invite',
      expect.objectContaining({ p_token: token })
    );
    expect(
      (
        await request(app)
          .post('/api/auth/sifre-belirle')
          .send({ token, sifre: password, email: 'invitee@example.test' })
      ).status
    ).toBe(400);
  });
});

describe('Legacy login must verify an existing password', () => {
  it.each(['/api/auth/giris', '/api/firmalar/giris'])(
    'does not create a boutique owner on arbitrary password: %s',
    async (path) => {
      for (const identifier of ['owner@example.test', 'Test Boutique', 'firma-1']) {
        const res = await request(app)
          .post(path)
          .send({ kod: identifier, sifre: 'AttackerPassword!' });
        expect(res.status).toBe(404);
        expect(res.body.basarili).toBe(false);
      }
      expect(state.users).toHaveLength(0);
      expect(state.saveUsers).not.toHaveBeenCalled();
    }
  );

  it('requires the existing user password on the legacy alias', async () => {
    state.firms[0].onayDurumu = 'AKTIF';
    state.users.push(
      pendingUser({ durum: 'AKTIF', aktivasyon_token: null, sifre_hash: sifreHashle(password) })
    );
    expect(
      (await request(app).post('/api/firmalar/giris').send({ kod: 'owner@example.test' })).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/firmalar/giris')
          .send({ kod: 'owner@example.test', sifre: 'WrongPassword!' })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/firmalar/giris')
          .send({ kod: 'owner@example.test', sifre: password })
      ).status
    ).toBe(200);
  });
});

describe('Login account state and password integrity', () => {
  it.each(['BEKLEMEDE_SIFRE', 'PASIF'])(
    'denies %s users even with the correct password',
    async (durum) => {
      state.users.push(pendingUser({ durum, sifre_hash: sifreHashle(password) }));
      const res = await request(app)
        .post('/api/auth/giris')
        .send({ email: 'owner@example.test', sifre: password });
      expect(res.status).toBe(403);
      expect(res.body.basarili).toBe(false);
    }
  );

  it('preserves leading and trailing spaces in an accepted password', async () => {
    state.users.push(pendingUser());
    const exactPassword = '  Significant spaces  ';
    expect(
      (await request(app).post('/api/auth/sifre-belirle').send({ token, sifre: exactPassword }))
        .status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/giris')
          .send({ email: 'owner@example.test', sifre: exactPassword })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/giris')
          .send({ email: 'owner@example.test', sifre: exactPassword.trim() })
      ).status
    ).toBe(401);
  });

  it('uses authoritative database account status despite an active local cache', async () => {
    const hash = sifreHashle(password);
    state.users.push(pendingUser({ durum: 'AKTIF', sifre_hash: hash }));
    database({
      kullanicilar: [pendingUser({ durum: 'PASIF', sifre_hash: hash })],
      firmalar: [],
      davetler: [],
    });
    expect(
      (
        await request(app)
          .post('/api/auth/giris')
          .send({ email: 'owner@example.test', sifre: password })
      ).status
    ).toBe(403);
  });

  it('does not use local cached credentials when database lookup fails', async () => {
    state.users.push(pendingUser({ durum: 'AKTIF', sifre_hash: sifreHashle(password) }));
    const db = database({ kullanicilar: [], firmalar: [], davetler: [] });
    db.failures.push({ table: 'kullanicilar', operation: 'select', error: true });
    const res = await request(app)
      .post('/api/auth/giris')
      .send({ email: 'owner@example.test', sifre: password });
    expect(res.status).toBe(503);
    expect(res.body.basarili).toBe(false);
  });

  it('does not authenticate a cached old password after a database password change', async () => {
    state.users.push(pendingUser({ durum: 'AKTIF', sifre_hash: sifreHashle(password) }));
    database({
      kullanicilar: [pendingUser({ durum: 'AKTIF', sifre_hash: sifreHashle('NewPassword123!') })],
      firmalar: [],
      davetler: [],
    });
    expect(
      (
        await request(app)
          .post('/api/auth/giris')
          .send({ email: 'owner@example.test', sifre: password })
      ).status
    ).toBe(401);
  });
});

describe('Invitation contact and role validation', () => {
  it.each([{}, { email: 'invalid' }, { email: {} }, { telefon: 123 }, { telefon: '123' }])(
    'does not create an unreachable account with contact %j',
    async (contact) => {
      database({
        kullanicilar: [],
        davetler: [dbInvite()],
        firmalar: [{ id: 'firma-1', ad: 'Test Boutique' }],
      });
      const res = await request(app)
        .post('/api/auth/sifre-belirle')
        .send({ token, sifre: password, ...contact });
      expect(res.status).toBe(400);
      expect(state.users).toHaveLength(0);
    }
  );

  it('accepts a phone contact on the legacy invitation flow after a cold start', async () => {
    const db = database({
      kullanicilar: [],
      davetler: [dbInvite()],
      firmalar: [{ id: 'firma-1', ad: 'Test Boutique' }],
    });
    const inspect = await request(app).get(`/api/firmalar/davet/${token}`);
    expect(inspect.status).toBe(200);
    expect(inspect.body).toMatchObject({
      davet: { token, tenantId: 'firma-1' },
      firma: { id: 'firma-1', ad: 'Test Boutique' },
    });
    expect(
      (
        await request(app)
          .post('/api/firmalar/davet/katil')
          .send({ token, sifre: password, telefon: '+994 50 123 45 67' })
      ).status
    ).toBe(200);
    expect(db.tables.kullanicilar[0].telefon).toBe('+994 50 123 45 67');
  });

  it.each(['SUPER_ADMIN', 'UNSUPPORTED'])(
    'rejects persisted invitation with privileged or unsupported role %s',
    async (rol) => {
      const db = database({
        kullanicilar: [],
        davetler: [dbInvite({ rol })],
        firmalar: [{ id: 'firma-1', ad: 'Test Boutique' }],
      });
      expect((await request(app).get(`/api/firmalar/davet/${token}`)).status).toBe(400);
      expect(
        (
          await request(app)
            .post('/api/auth/sifre-belirle')
            .send({ token, sifre: password, email: 'invitee@example.test' })
        ).status
      ).toBe(400);
      expect(db.tables.kullanicilar).toHaveLength(0);
      expect(db.tables.davetler[0].durum).toBe('AKTIF');
    }
  );
});
