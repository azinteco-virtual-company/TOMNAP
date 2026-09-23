import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const API_SECRET_KEY = process.env.API_SECRET_KEY || '';
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
// Private uploads must never be copied into Vite's public build/precache.
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');
export const FIRMALAR_DOSYA_YOLU = path.join(DATA_DIR, 'firmalar.json');
export const KULLANICILAR_DOSYA_YOLU = path.join(DATA_DIR, 'kullanicilar.json');

/**
 * Manifest AWB review (suggest + human-confirmed write). A fix of the existing
 * manifest feature, independent of FF_V2_FLOW. Read per call; unset = disabled,
 * and then manifests can only be parsed, not used to assign AWB codes.
 */
export function isAwbReviewEnabled(): boolean {
  return process.env.FF_AWB_REVIEW === 'true';
}

export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'TOMNAP Platform <onboarding@resend.dev>';
export const APP_URL =
  process.env.APP_URL || (IS_PRODUCTION ? 'https://tomnap.com' : `http://localhost:${PORT}`);

if (SUPABASE_URL && !SUPABASE_KEY)
  throw new Error('SUPABASE_SERVICE_ROLE_KEY gerekli; anonim anahtar sunucuda kullanılamaz.');
