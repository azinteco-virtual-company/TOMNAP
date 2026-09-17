import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { IS_PRODUCTION, SUPABASE_URL } from '../src/server/config';
import { supabase } from '../src/server/services/supabase';
import { sifreHashle } from '../src/server/services/crypto';
import {
  IDENTITY_DOSYA_YOLU,
  loadIdentitySnapshot,
  saveIdentitySnapshot,
} from '../src/server/services/state';
import type { KullaniciKaydi } from '../src/server/types';

interface BootstrapOptions {
  email: string;
  password: string;
  tenantId: string;
  name?: string;
}

/** Operator-only bootstrap. Never imported or called by the HTTP application. */
export async function bootstrapAdmin(
  options: BootstrapOptions
): Promise<{ id: string; email: string }> {
  const email = options.email?.trim().toLowerCase();
  const tenantId = options.tenantId?.trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('TOMNAP_ADMIN_EMAIL must be a valid email address.');
  }
  if (
    typeof options.password !== 'string' ||
    options.password.length < 12 ||
    options.password.length > 1024
  ) {
    throw new Error('TOMNAP_ADMIN_PASSWORD must contain 12–1024 characters.');
  }
  if (!tenantId || tenantId === 'all') {
    throw new Error('TOMNAP_ADMIN_TENANT_ID must identify an existing company.');
  }
  if (!supabase && (IS_PRODUCTION || SUPABASE_URL)) {
    throw new Error('A service-role database connection is required.');
  }
  const user: KullaniciKaydi = {
    id: `usr_${randomUUID()}`,
    tenant_id: tenantId,
    ad_soyad: options.name?.trim() || 'Platform Administrator',
    email,
    rol: 'SUPER_ADMIN',
    sifre_hash: sifreHashle(options.password),
    durum: 'AKTIF',
    aktivasyon_token: null,
    token_gecerlilik: null,
    olusturma_tarihi: new Date().toISOString(),
  };
  if (supabase) {
    const { data: existingAdmin, error: adminError } = await supabase
      .from('kullanicilar')
      .select('id')
      .eq('rol', 'SUPER_ADMIN')
      .limit(1)
      .maybeSingle();
    if (adminError) throw new Error('Administrator lookup failed; no account was created.');
    if (existingAdmin) throw new Error('A super administrator already exists; bootstrap refused.');
    const escapedEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
    const { data: existingUser, error: userError } = await supabase
      .from('kullanicilar')
      .select('id')
      .ilike('email', escapedEmail)
      .maybeSingle();
    if (userError) throw new Error('Account lookup failed; no account was created.');
    if (existingUser)
      throw new Error('This email already belongs to an account; bootstrap refused.');
    const { data: company, error: companyError } = await supabase
      .from('firmalar')
      .select('id')
      .eq('id', tenantId)
      .maybeSingle();
    if (companyError || !company) throw new Error('The specified company could not be verified.');
    const { data: inserted, error } = await supabase
      .from('kullanicilar')
      .insert(user)
      .select('id')
      .maybeSingle();
    if (error || !inserted) throw new Error('Administrator insertion failed.');
  } else {
    const directory = path.dirname(IDENTITY_DOSYA_YOLU);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const lock = `${IDENTITY_DOSYA_YOLU}.bootstrap.lock`;
    const descriptor = fs.openSync(lock, 'wx', 0o600);
    try {
      // Re-read the authoritative snapshot under the operator bootstrap lock.
      // Old split files cease to participate once identity.json exists.
      const identity = loadIdentitySnapshot();
      if (identity.users.some((item) => item.rol === 'SUPER_ADMIN')) {
        throw new Error('A super administrator already exists; bootstrap refused.');
      }
      if (identity.users.some((item) => item.email.toLowerCase() === email)) {
        throw new Error('This email already belongs to an account; bootstrap refused.');
      }
      if (!identity.companies.some((company) => company.id === tenantId)) {
        throw new Error('The specified company does not exist in the local data file.');
      }
      saveIdentitySnapshot({ ...identity, users: [...identity.users, user] });
    } finally {
      try {
        fs.closeSync(descriptor);
      } catch {
        /* Preserve the commit outcome. */
      }
      try {
        fs.unlinkSync(lock);
      } catch {
        /* Do not report a committed account as failed. */
      }
    }
  }
  return { id: user.id, email };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  bootstrapAdmin({
    email: process.env.TOMNAP_ADMIN_EMAIL || '',
    password: process.env.TOMNAP_ADMIN_PASSWORD || '',
    tenantId: process.env.TOMNAP_ADMIN_TENANT_ID || '',
    name: process.env.TOMNAP_ADMIN_NAME,
  })
    .then(({ email }) => {
      console.log(
        `Administrator created: ${email}. Sign in using the configured password. Restart a running local development server to reload its identity snapshot.`
      );
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
