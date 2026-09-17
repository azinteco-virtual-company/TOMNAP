import path from 'node:path';
import { DATA_DIR } from '../../config';
import { supabase } from '../supabase';
import { readJsonFile, writeJsonAtomic } from '../atomicJson';
import { cozMetin, sifreleMetin } from '../crypto';
import { KargoSaglayiciAyarlari } from './types';

export class CargoSettingsError extends Error {
  constructor(
    message: string,
    public status = 503
  ) {
    super(message);
    this.name = 'CargoSettingsError';
  }
}
export const CARGO_SETTINGS_FILE = path.join(DATA_DIR, 'kargo_ayarlari.json');
export const SECRET_FIELDS = ['sifre', 'pin', 'apiKey', 'apiSecret'] as const;
const credentialFields = [
  'kullaniciAdi',
  'sifre',
  'hesapNo',
  'pin',
  'entity',
  'apiKey',
  'apiSecret',
  'testModu',
];
const publicFields = [
  'tenantId',
  'revision',
  'saglayici',
  'aktif',
  'cikisUlkesi',
  'cikisSehri',
  'varisUlkesi',
  'varisHavalimani',
  'otomatikSenkronizasyon',
  'guncellenmeTarihi',
];
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function tenant(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value === 'all' || value.length > 160)
    throw new CargoSettingsError('Kargo işlemi için firma seçin.', 400);
}
export function defaultSettings(tenantId: string): KargoSaglayiciAyarlari {
  tenant(tenantId);
  return {
    tenantId,
    revision: 0,
    saglayici: 'ARAMEX',
    aktif: true,
    cikisUlkesi: 'CA',
    cikisSehri: 'Toronto (YYZ)',
    varisUlkesi: 'AZ',
    varisHavalimani: 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)',
    kimlikBilgileri: {
      kullaniciAdi: '',
      sifre: '',
      hesapNo: '',
      pin: '',
      entity: 'YYZ',
      testModu: true,
    },
    otomatikSenkronizasyon: true,
    guncellenmeTarihi: '',
  };
}
export function validateSettings(value: unknown): asserts value is KargoSaglayiciAyarlari {
  if (
    !object(value) ||
    Object.keys(value).some((k) => ![...publicFields, 'kimlikBilgileri'].includes(k))
  )
    throw new CargoSettingsError('Geçersiz kargo ayarları.', 400);
  tenant(value.tenantId);
  if (
    !['ARAMEX', 'DHL', 'UPS', 'FEDEX', 'MANUEL'].includes(value.saglayici) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    ['aktif', 'otomatikSenkronizasyon'].some((k) => typeof value[k] !== 'boolean') ||
    ['cikisUlkesi', 'cikisSehri', 'varisUlkesi', 'varisHavalimani', 'guncellenmeTarihi'].some(
      (k) => typeof value[k] !== 'string' || value[k].length > 500
    ) ||
    !object(value.kimlikBilgileri) ||
    typeof value.kimlikBilgileri.testModu !== 'boolean' ||
    Object.entries(value.kimlikBilgileri).some(
      ([k, v]) =>
        !credentialFields.includes(k) ||
        (k !== 'testModu' && (typeof v !== 'string' || v.length > 8192))
    )
  )
    throw new CargoSettingsError('Geçersiz kargo ayarları.', 400);
}
/** Mask sent back by the editor means preserve; a provider change starts with blank credentials. */
export function mergeSettings(
  current: KargoSaglayiciAyarlari,
  update: Partial<KargoSaglayiciAyarlari>
) {
  if (
    !object(update) ||
    Object.keys(update).some((k) => ![...publicFields, 'kimlikBilgileri'].includes(k)) ||
    (update.tenantId !== undefined && update.tenantId !== current.tenantId) ||
    (update.kimlikBilgileri !== undefined && !object(update.kimlikBilgileri))
  )
    throw new CargoSettingsError('Geçersiz kargo ayarları.', 400);
  const changedProvider = update.saglayici !== undefined && update.saglayici !== current.saglayici;
  const baseCredentials = changedProvider ? { testModu: true } : current.kimlikBilgileri;
  const credentials = { ...baseCredentials, ...update.kimlikBilgileri };
  for (const field of SECRET_FIELDS) {
    const incoming = update.kimlikBilgileri?.[field];
    if (!incoming || incoming === '••••••••') credentials[field] = baseCredentials[field] || '';
  }
  const merged = {
    ...current,
    ...update,
    tenantId: current.tenantId,
    kimlikBilgileri: credentials,
  };
  validateSettings(merged);
  return merged;
}
export interface StoredCargoSettings {
  tenant_id: string;
  revision: number;
  settings: Omit<KargoSaglayiciAyarlari, 'kimlikBilgileri' | 'revision' | 'tenantId'>;
  encrypted_credentials: string;
}
export interface CargoSnapshot {
  version: 2;
  records: StoredCargoSettings[];
}
export function encodeSettings(value: KargoSaglayiciAyarlari): StoredCargoSettings {
  validateSettings(value);
  const { tenantId, revision, kimlikBilgileri, ...settings } = value;
  const encrypted_credentials = sifreleMetin(JSON.stringify(kimlikBilgileri), {
    tenantId,
    provider: settings.saglayici,
  });
  return { tenant_id: tenantId, revision: revision!, settings, encrypted_credentials };
}
export function decodeSettings(row: StoredCargoSettings): KargoSaglayiciAyarlari {
  try {
    const kimlikBilgileri = JSON.parse(
      cozMetin(row.encrypted_credentials, {
        tenantId: row.tenant_id,
        provider: row.settings.saglayici,
      })
    );
    const result = {
      ...row.settings,
      tenantId: row.tenant_id,
      revision: row.revision,
      kimlikBilgileri,
    };
    validateSettings(result);
    return result;
  } catch {
    throw new CargoSettingsError('Kargo kaydı çözülemedi; anahtar ve geçiş durumunu kontrol edin.');
  }
}
export function isCargoSnapshot(value: unknown): value is CargoSnapshot {
  if (!object(value) || value.version !== 2 || !Array.isArray(value.records)) return false;
  const tenants = new Set();
  for (const row of value.records) {
    if (
      !object(row) ||
      typeof row.tenant_id !== 'string' ||
      !row.tenant_id ||
      row.tenant_id === 'all' ||
      tenants.has(row.tenant_id) ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      !object(row.settings) ||
      typeof row.encrypted_credentials !== 'string' ||
      !row.encrypted_credentials.startsWith('enc:v2:')
    )
      return false;
    tenants.add(row.tenant_id);
  }
  return true;
}
function localSnapshot(): CargoSnapshot {
  const value = readJsonFile(CARGO_SETTINGS_FILE, (x): x is unknown => true);
  if (value === undefined || (Array.isArray(value) && value.length === 0))
    return { version: 2, records: [] };
  if (!isCargoSnapshot(value))
    throw new CargoSettingsError('Kargo kayıtları için çevrimdışı şifreleme geçişi gerekli.');
  return value;
}
export async function loadCargoSettings(tenantId: string): Promise<KargoSaglayiciAyarlari> {
  tenant(tenantId);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('cargo_settings')
        .select('tenant_id,revision,settings,encrypted_credentials')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new Error();
      return data ? decodeSettings(data) : defaultSettings(tenantId);
    } catch {
      throw new CargoSettingsError(
        'Kargo ayarları okunamadı; veritabanı, anahtar ve geçiş durumunu kontrol edin.'
      );
    }
  }
  const row = localSnapshot().records.find((x) => x.tenant_id === tenantId);
  return row ? decodeSettings(row) : defaultSettings(tenantId);
}
export async function saveCargoSettings(
  update: Partial<KargoSaglayiciAyarlari> & { tenantId: string }
) {
  tenant(update.tenantId);
  if (!Number.isSafeInteger(update.revision) || update.revision! < 0)
    throw new CargoSettingsError('Ayar sürümü gerekli; sayfayı yenileyin.', 400);
  // No await between local read/CAS/write: local mode is one server process only.
  const snapshot = supabase ? undefined : localSnapshot();
  const row = snapshot?.records.find((x) => x.tenant_id === update.tenantId);
  const current = supabase
    ? await loadCargoSettings(update.tenantId)
    : row
      ? decodeSettings(row)
      : defaultSettings(update.tenantId);
  if (current.revision !== update.revision)
    throw new CargoSettingsError('Ayarlar değişti; yeniden yükleyip tekrar deneyin.', 409);
  const next = mergeSettings(current, update);
  next.revision = update.revision! + 1;
  next.guncellenmeTarihi = new Date().toISOString();
  const encoded = encodeSettings(next);
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('save_cargo_settings', {
        p_record: encoded,
        p_expected_revision: update.revision,
      });
      if (error?.code === '40001')
        throw new CargoSettingsError('Ayarlar değişti; yeniden yükleyip tekrar deneyin.', 409);
      if (error || !data) throw new CargoSettingsError('Kargo ayarları kaydedilemedi.');
      return decodeSettings(data);
    } catch (error) {
      if (error instanceof CargoSettingsError) throw error;
      throw new CargoSettingsError('Kargo ayarları kaydedilemedi.');
    }
  }
  snapshot!.records = [
    ...snapshot!.records.filter((x) => x.tenant_id !== update.tenantId),
    encoded,
  ];
  writeJsonAtomic(CARGO_SETTINGS_FILE, snapshot);
  return next;
}
