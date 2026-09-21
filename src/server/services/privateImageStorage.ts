import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { UPLOADS_DIR, SUPABASE_URL, SUPABASE_KEY, IS_PRODUCTION } from '../config';
import { MAX_IMAGE_BYTES, PublicResourceError } from './publicFetch';
import { inspectImage } from './imageValidation';
import { boundedStorageFetch } from './storageTransport';

export const PRIVATE_IMAGE_BUCKET = 'tomnap-private-images';
export const PRIVATE_IMAGE_NAME = /^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/;
const error = () =>
  new PublicResourceError(
    'Özel görsel depolaması kullanılamıyor; yapılandırmayı kontrol edin.',
    503
  );
export function storageBackend(): 'local' | 'supabase' {
  const backend = process.env.UPLOAD_STORAGE_BACKEND || 'local';
  if (!['local', 'supabase'].includes(backend) || (backend === 'local' && process.env.VERCEL))
    throw error();
  if (backend === 'supabase' && (!SUPABASE_URL || !SUPABASE_KEY)) throw error();
  return backend as 'local' | 'supabase';
}
let client: SupabaseClient | undefined;
function storage() {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw error();
    const url = new URL(SUPABASE_URL);
    if (IS_PRODUCTION && url.protocol !== 'https:') throw error();
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedStorageFetch },
    });
  }
  return client.storage;
}
/** Recheck on every operation: a bucket made public must never receive another private upload. */
export async function verifyPrivateBucket() {
  try {
    const { data, error: failure } = await storage().getBucket(PRIVATE_IMAGE_BUCKET);
    if (
      failure ||
      !data ||
      data.id !== PRIVATE_IMAGE_BUCKET ||
      data.public !== false ||
      !Number.isSafeInteger(data.file_size_limit) ||
      data.file_size_limit! > MAX_IMAGE_BYTES ||
      data.file_size_limit! <= 0 ||
      !Array.isArray(data.allowed_mime_types) ||
      !data.allowed_mime_types.length ||
      data.allowed_mime_types.some(
        (type) => !['image/png', 'image/jpeg', 'image/webp'].includes(type)
      )
    )
      throw error();
  } catch {
    throw error();
  }
}
function namePath(name: string) {
  if (typeof name !== 'string' || !PRIVATE_IMAGE_NAME.test(name))
    throw new PublicResourceError('Görsel bulunamadı.', 404);
  return path.join(UPLOADS_DIR, name);
}
function readLocal(name: string): Buffer {
  const filename = namePath(name);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new PublicResourceError('Geçersiz görsel dosyası.', 403);
    if (stat.size > MAX_IMAGE_BYTES)
      throw new PublicResourceError('Görsel boyut sınırını aşıyor.', 413);
    return fs.readFileSync(descriptor);
  } catch (failure: any) {
    if (failure?.code === 'ENOENT') throw new PublicResourceError('Görsel bulunamadı.', 404);
    if (failure?.code === 'ELOOP') throw new PublicResourceError('Görsele erişim reddedildi.', 403);
    if (failure instanceof PublicResourceError) throw failure;
    throw error();
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
function validateNamedImage(name: string, bytes: Buffer) {
  namePath(name);
  const parsed = inspectImage(bytes);
  if (!name.endsWith('.' + parsed.ext))
    throw new PublicResourceError('Görsel içeriği dosya adıyla eşleşmiyor.', 415);
  return parsed;
}
export async function readPrivateImage(name: string) {
  namePath(name);
  if (storageBackend() === 'local') return validateNamedImage(name, readLocal(name));
  await verifyPrivateBucket();
  try {
    const { data, error: failure } = await storage().from(PRIVATE_IMAGE_BUCKET).download(name);
    if (failure) {
      if (
        ['NoSuchKey', 'not_found'].includes((failure as any).code) ||
        String((failure as any).statusCode || (failure as any).status) === '404'
      )
        throw new PublicResourceError('Görsel bulunamadı.', 404);
      throw error();
    }
    if (!data || data.size > MAX_IMAGE_BYTES) throw error();
    return validateNamedImage(name, Buffer.from(await data.arrayBuffer()));
  } catch (failure) {
    if (failure instanceof PublicResourceError) throw failure;
    throw error();
  }
}
export async function writePrivateImage(name: string, bytes: Buffer): Promise<void> {
  const parsed = validateNamedImage(name, bytes);
  if (storageBackend() === 'local') {
    const filename = namePath(name);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o700 });
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(filename, 'wx', 0o600);
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } catch (failure) {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.unlinkSync(filename);
      }
      throw error();
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    return;
  }
  await verifyPrivateBucket();
  try {
    const { data, error: failure } = await storage()
      .from(PRIVATE_IMAGE_BUCKET)
      .upload(name, bytes, { contentType: parsed.mimeType, cacheControl: '0', upsert: false });
    if (failure || !data || data.path !== name) throw error();
  } catch {
    throw error();
  }
}
/** An exact object must exist; a storage outage must never masquerade as a missing file. */
export async function assertPrivateImageExists(name: string) {
  namePath(name);
  if (storageBackend() === 'local') {
    validateNamedImage(name, readLocal(name));
    return;
  }
  await verifyPrivateBucket();
  try {
    const { data, error: failure } = await storage().from(PRIVATE_IMAGE_BUCKET).info(name);
    if (failure) {
      if (
        ['NoSuchKey', 'not_found'].includes((failure as any).code) ||
        String((failure as any).statusCode || (failure as any).status) === '404'
      )
        throw new PublicResourceError('Görsel bulunamadı.', 404);
      throw error();
    }
    if (
      !data ||
      data.name !== name ||
      !Number.isFinite(data.size) ||
      data.size < 1 ||
      data.size > MAX_IMAGE_BYTES ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(data.contentType)
    )
      throw error();
  } catch (failure) {
    if (failure instanceof PublicResourceError) throw failure;
    throw error();
  }
}

/** Operator-only provisioning. Never changes an existing bucket or its contents. */
export async function preparePrivateBucket(): Promise<'created' | 'existing'> {
  if (storageBackend() !== 'supabase') throw error();
  try {
    const { data, error: failure } = await storage().getBucket(PRIVATE_IMAGE_BUCKET);
    if (!failure && data) {
      await verifyPrivateBucket();
      return 'existing';
    }
    if (!failure || String((failure as any).statusCode || (failure as any).status) !== '404')
      throw error();
    const result = await storage().createBucket(PRIVATE_IMAGE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (result.error) throw error();
    await verifyPrivateBucket();
    return 'created';
  } catch {
    throw error();
  }
}
