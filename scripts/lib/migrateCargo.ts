import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  CargoSnapshot,
  decodeSettings,
  encodeSettings,
  isCargoSnapshot,
  defaultSettings,
  validateSettings,
} from '../../src/server/services/kargo/settings';

export interface CargoMigrationOptions {
  legacySecret?: string;
  allowLegacyDefault?: boolean;
  allowPlaintext?: boolean;
}
function legacyDecrypt(value: unknown, options: CargoMigrationOptions): string {
  if (typeof value !== 'string') throw new Error('Invalid legacy credential');
  if (!value) return '';
  if (!value.startsWith('enc:')) {
    if (!options.allowPlaintext) throw new Error('Plaintext credentials require --allow-plaintext');
    return value;
  }
  const parts = /^enc:([a-f0-9]{24}):([a-f0-9]{32}):((?:[a-f0-9]{2})+)$/.exec(value);
  if (!parts) throw new Error('Invalid legacy envelope');
  // Available only in the offline operator tool, never an implicit runtime key.
  const secret =
    options.legacySecret ||
    (options.allowLegacyDefault ? 'tomnap_default_internal_secure_key_2026' : '');
  if (!secret) throw new Error('Explicit legacy key required');
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(secret).digest(),
      Buffer.from(parts[1], 'hex')
    );
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Legacy decryption failed; source unchanged');
  }
}
export function migrateCargoSnapshot(
  value: unknown,
  options: CargoMigrationOptions = {}
): CargoSnapshot {
  const result: CargoSnapshot = { version: 2, records: [] };
  if (isCargoSnapshot(value)) {
    for (const row of value.records) {
      const decoded = decodeSettings(row);
      decoded.revision = row.revision + 1;
      result.records.push(encodeSettings(decoded));
    }
  } else {
    if (!Array.isArray(value)) throw new Error('Invalid legacy cargo snapshot');
    const tenants = new Set();
    for (const row of value) {
      if (
        !row ||
        typeof row !== 'object' ||
        typeof row.tenantId !== 'string' ||
        tenants.has(row.tenantId) ||
        !row.kimlikBilgileri ||
        typeof row.kimlikBilgileri !== 'object' ||
        Array.isArray(row.kimlikBilgileri)
      )
        throw new Error('Invalid or duplicate legacy tenant');
      const credentials = structuredClone(row.kimlikBilgileri);
      for (const field of ['sifre', 'pin', 'apiKey', 'apiSecret'])
        if (credentials[field] !== undefined)
          credentials[field] = legacyDecrypt(credentials[field], options);
      const decoded = {
        ...defaultSettings(row.tenantId),
        ...row,
        revision: 1,
        kimlikBilgileri: credentials,
      };
      validateSettings(decoded);
      const encoded = encodeSettings(decoded);
      if (!isDeepStrictEqual(decodeSettings(encoded), decoded))
        throw new Error('Migration round-trip failed');
      result.records.push(encoded);
      tenants.add(row.tenantId);
    }
  }
  return result;
}
