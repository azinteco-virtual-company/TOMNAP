import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config';

// Serverless / Node mühitində Realtime üçün təhlükəsiz WebSocket təminatı
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class FallbackWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly readyState = 3;
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

let supabase: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    console.log('✅ Supabase canlı PostgreSQL veritabanı bağlandı:', SUPABASE_URL);
  } catch (err) {
    console.error('❌ Supabase bağlantı hatası:', err);
  }
}

export { supabase };

export async function checkSupabaseConnection(): Promise<{ aktif: boolean; kayitSayisi: number; hata: string | null }> {
  if (!supabase) {
    return { aktif: false, kayitSayisi: 0, hata: 'SUPABASE_URL veya SUPABASE_KEY tanımlı değil' };
  }

  try {
    const { count, error } = await supabase.from('siparisler').select('*', { count: 'exact', head: true });
    if (error) {
      return { aktif: false, kayitSayisi: 0, hata: error.message };
    }
    return { aktif: true, kayitSayisi: count ?? 0, hata: null };
  } catch (e: any) {
    return { aktif: false, kayitSayisi: 0, hata: e.message };
  }
}
