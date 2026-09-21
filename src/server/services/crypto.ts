import crypto from 'node:crypto';

export class EncryptionError extends Error {
  status = 503;
  constructor(message = 'Kargo şifreleme anahtarı veya kayıt bütünlüğü doğrulanamadı.') {
    super(message);
    this.name = 'EncryptionError';
  }
}

export interface EncryptionContext {
  tenantId: string;
  provider: string;
}
function keyring() {
  try {
    const keys = JSON.parse(process.env.CARGO_ENCRYPTION_KEYS || 'null');
    const active = process.env.CARGO_ENCRYPTION_ACTIVE_KEY_ID || '';
    if (
      !keys ||
      typeof keys !== 'object' ||
      Array.isArray(keys) ||
      !/^[A-Za-z0-9_-]{1,40}$/.test(active) ||
      !Object.hasOwn(keys, active)
    )
      throw new Error();
    for (const [id, key] of Object.entries(keys))
      if (
        !/^[A-Za-z0-9_-]{1,40}$/.test(id) ||
        typeof key !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(key)
      )
        throw new Error();
    return { keys: keys as Record<string, string>, active };
  } catch {
    throw new EncryptionError();
  }
}
function aad(context: EncryptionContext, id: string) {
  if (
    !context ||
    typeof context.tenantId !== 'string' ||
    !context.tenantId ||
    context.tenantId === 'all' ||
    typeof context.provider !== 'string' ||
    !context.provider
  )
    throw new EncryptionError();
  return Buffer.from(JSON.stringify(['TOMNAP:cargo:v2', id, context.tenantId, context.provider]));
}

/** Every credential envelope is authenticated for one tenant and provider. */
export function sifreleMetin(text: string, context: EncryptionContext): string {
  if (typeof text !== 'string') throw new EncryptionError();
  const { keys, active } = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keys[active], 'hex'), iv);
  cipher.setAAD(aad(context, active));
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `enc:v2:${active}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

export function cozMetin(envelope: string, context: EncryptionContext): string {
  try {
    if (typeof envelope !== 'string') throw new Error();
    const match =
      /^enc:v2:([A-Za-z0-9_-]{1,40}):([a-f0-9]{24}):([a-f0-9]{32}):((?:[a-f0-9]{2})*)$/.exec(
        envelope
      );
    if (!match) throw new Error();
    const [, id, iv, tag, encrypted] = match;
    const { keys } = keyring();
    if (!Object.hasOwn(keys, id)) throw new Error();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(keys[id], 'hex'),
      Buffer.from(iv, 'hex')
    );
    decipher.setAAD(aad(context, id));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new EncryptionError();
  }
}

/**
 * Kullanıcı şifresini scrypt KDF ve rastgele 16 baytlık salt ile güvenli şekilde heşler.
 * Format: scrypt:<salt_hex>:<hash_hex>
 */
export function sifreHashle(sifre: string): string {
  if (!sifre || typeof sifre !== 'string') {
    throw new Error('Geçersiz şifre formatı');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(sifre, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verilen düz şifrenin saklanan scrypt heşi ile eşleşip eşleşmediğini timingSafeEqual ile doğrular.
 */
export function sifreDogrula(sifre: string, saklananHash: string): boolean {
  if (!sifre || !saklananHash || typeof sifre !== 'string' || typeof saklananHash !== 'string') {
    return false;
  }
  try {
    const parts = saklananHash.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const salt = Buffer.from(parts[1], 'hex');
    const hash = Buffer.from(parts[2], 'hex');
    const derivedKey = crypto.scryptSync(sifre, salt, 64);

    return crypto.timingSafeEqual(hash, derivedKey);
  } catch (err) {
    console.error('Şifre doğrulama hatası:', err);
    return false;
  }
}

/**
 * E-posta aktivasyonu ve şifre belirleme için güvenli rastgele hex token üretir.
 */
export function tokenUret(baytSayisi = 32): string {
  return crypto.randomBytes(baytSayisi).toString('hex');
}
