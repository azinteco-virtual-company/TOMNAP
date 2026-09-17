import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { DATA_DIR, IS_PRODUCTION, SUPABASE_URL } from '../config';
import { kullanicilarVeritabani, firmalarVeritabani } from './state';
import { supabase } from './supabase';
import type { KullaniciKaydi } from '../types';

export const SESSION_COOKIE = 'tomnap_session';
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const SESSION_FILE = path.join(DATA_DIR, 'oturumlar.json');
const ROLES = new Set([
  'SUPER_ADMIN',
  'PATRON',
  'KANADA_SATINALMA',
  'SATIS_SORUMLUSU',
  'BAKU_FINANS',
  'BAKU_KURYE',
]);
const HEX_TOKEN = /^[a-f0-9]{64}$/;

interface SessionRecord {
  token_hash: string;
  user_id: string;
  csrf_token: string;
  credential_fingerprint: string;
  expires_at: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: KullaniciKaydi['rol'];
  csrfToken: string;
  sessionHash: string;
  expiresAt: string;
  kullanici: {
    id: string;
    adSoyad: string;
    email: string;
    rol: KullaniciKaydi['rol'];
    tenantId: string;
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fingerprint(user: KullaniciKaydi): string {
  // Password, role and tenant changes invalidate existing sessions immediately.
  return digest(JSON.stringify([user.id, user.sifre_hash, user.rol, user.tenant_id]));
}

function validUser(user: KullaniciKaydi | undefined): user is KullaniciKaydi {
  return (
    !!user &&
    user.durum === 'AKTIF' &&
    ROLES.has(user.rol) &&
    typeof user.id === 'string' &&
    !!user.id &&
    typeof user.tenant_id === 'string' &&
    !!user.tenant_id &&
    (user.tenant_id !== 'all' || user.rol === 'SUPER_ADMIN') &&
    typeof user.sifre_hash === 'string' &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.sifre_hash)
  );
}

function assertStorageAvailable() {
  // Local files are only a development/test fallback. A broken configured
  // database must never become an independent local authentication authority.
  if (!supabase && (IS_PRODUCTION || SUPABASE_URL)) {
    throw new Error('Session database is unavailable');
  }
}

function validRecord(value: unknown): value is SessionRecord {
  const record = value as SessionRecord;
  return (
    !!record &&
    typeof record.user_id === 'string' &&
    !!record.user_id &&
    HEX_TOKEN.test(record.token_hash) &&
    HEX_TOKEN.test(record.csrf_token) &&
    HEX_TOKEN.test(record.credential_fingerprint) &&
    typeof record.expires_at === 'string' &&
    Number.isFinite(Date.parse(record.expires_at))
  );
}

function readLocal(): SessionRecord[] {
  if (!fs.existsSync(SESSION_FILE)) return [];
  const records: unknown = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  if (!Array.isArray(records) || !records.every(validRecord)) {
    throw new Error('Session storage is invalid');
  }
  return records;
}

function saveLocal(records: SessionRecord[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const temporary = `${SESSION_FILE}.${randomBytes(12).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(records), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.renameSync(temporary, SESSION_FILE);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function cookieToken(req: Request): string | null {
  const cookies = req.headers.cookie;
  if (typeof cookies !== 'string') return null;
  const matching = cookies
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  // Reject ambiguous duplicate cookies instead of accepting cookie tossing.
  if (matching.length !== 1) return null;
  const value = matching[0].slice(SESSION_COOKIE.length + 1);
  return HEX_TOKEN.test(value) ? value : null;
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax' as const,
  path: '/',
});

async function currentUser(id: string): Promise<KullaniciKaydi | undefined> {
  if (!supabase) {
    const user = kullanicilarVeritabani.find((item) => item.id === id);
    return user ? { ...user } : undefined;
  }
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data || undefined;
}

async function tenantEnabled(user: KullaniciKaydi): Promise<boolean> {
  if (user.rol === 'SUPER_ADMIN') return true;
  if (!supabase) {
    const company = firmalarVeritabani.find((item) => item.id === user.tenant_id);
    return !!company && (!company.onayDurumu || company.onayDurumu === 'AKTIF');
  }
  const { data, error } = await supabase
    .from('firmalar')
    .select('id,onay_durumu')
    .eq('id', user.tenant_id)
    .maybeSingle();
  if (error) throw error;
  return !!data && (!data.onay_durumu || data.onay_durumu === 'AKTIF');
}

export async function createSession(
  user: KullaniciKaydi,
  res: Response
): Promise<{ csrfToken: string; expiresAt: string }> {
  assertStorageAvailable();
  const verifiedFingerprint = fingerprint(user);
  // Re-read after password verification so stale role/account data cannot mint
  // a session while a database administrator is disabling or changing a user.
  const fresh = await currentUser(user.id);
  if (
    !validUser(fresh) ||
    fingerprint(fresh) !== verifiedFingerprint ||
    !(await tenantEnabled(fresh))
  ) {
    throw new Error('Account changed during login');
  }
  const token = randomBytes(32).toString('hex');
  const record: SessionRecord = {
    token_hash: digest(token),
    user_id: fresh.id,
    csrf_token: randomBytes(32).toString('hex'),
    credential_fingerprint: fingerprint(fresh),
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };
  if (supabase) {
    const { data, error } = await supabase
      .from('oturumlar')
      .insert(record)
      .select('token_hash')
      .maybeSingle();
    if (error) throw error;
    if (!data || data.token_hash !== record.token_hash)
      throw new Error('Session was not persisted');
  } else {
    const records = readLocal().filter((item) => Date.parse(item.expires_at) > Date.now());
    records.push(record);
    saveLocal(records);
  }
  // No cookie is issued until durable storage has confirmed the new session.
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DURATION_MS });
  res.setHeader('Cache-Control', 'no-store');
  return { csrfToken: record.csrf_token, expiresAt: record.expires_at };
}

export async function readSession(req: Request): Promise<AuthContext | null> {
  const token = cookieToken(req);
  if (!token) return null;
  assertStorageAvailable();
  const hash = digest(token);
  let record: SessionRecord | undefined;
  if (supabase) {
    const { data, error } = await supabase
      .from('oturumlar')
      .select('*')
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw error;
    record = data || undefined;
  } else {
    record = readLocal().find((item) => item.token_hash === hash);
  }
  if (
    !validRecord(record) ||
    record.token_hash !== hash ||
    Date.parse(record.expires_at) <= Date.now()
  )
    return null;
  const user = await currentUser(record.user_id);
  if (!validUser(user) || !(await tenantEnabled(user))) return null;
  const expected = Buffer.from(fingerprint(user), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(record.credential_fingerprint, 'hex'))) return null;
  if (Date.parse(record.expires_at) <= Date.now()) return null;
  const tenantId = user.rol === 'SUPER_ADMIN' ? 'all' : user.tenant_id;
  return {
    userId: user.id,
    tenantId,
    role: user.rol,
    csrfToken: record.csrf_token,
    sessionHash: hash,
    expiresAt: record.expires_at,
    kullanici: { id: user.id, adSoyad: user.ad_soyad, email: user.email, rol: user.rol, tenantId },
  };
}

export async function revokeSession(req: Request, res: Response): Promise<void> {
  const token = cookieToken(req);
  try {
    if (!token) return;
    assertStorageAvailable();
    const hash = digest(token);
    if (supabase) {
      const { error } = await supabase.from('oturumlar').delete().eq('token_hash', hash);
      if (error) throw error;
    } else {
      saveLocal(readLocal().filter((item) => item.token_hash !== hash));
    }
  } finally {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.setHeader('Cache-Control', 'no-store');
  }
}
