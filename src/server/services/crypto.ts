import crypto from 'crypto';
import { API_SECRET_KEY } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const PREFIX = 'enc:';

// Sunucu secret key'inden 32-byte anahtar türet (sha256 hash)
function getKey(): Buffer {
  const secret = API_SECRET_KEY || 'tomnap_default_internal_secure_key_2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Verilen düz metni AES-256-GCM ile şifreler.
 * Format: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function sifreleMetin(metin: string): string {
  if (!metin || typeof metin !== 'string') return '';
  if (metin.startsWith(PREFIX)) return metin; // Zaten şifreli

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(metin, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('Şifreleme hatası:', err);
    return metin;
  }
}

/**
 * AES-256-GCM ile şifrelenmiş metni çözer.
 */
export function cozMetin(sifreliMetin: string): string {
  if (!sifreliMetin || typeof sifreliMetin !== 'string') return '';
  if (!sifreliMetin.startsWith(PREFIX)) return sifreliMetin; // Düz metin

  try {
    const parts = sifreliMetin.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return sifreliMetin;

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const key = getKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch (err) {
    console.warn('Şifre çözme uyarısı (fallback):', err);
    return sifreliMetin;
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
