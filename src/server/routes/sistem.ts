import { Router } from 'express';
import { supabase } from '../services/supabase';
import { SUPABASE_URL, GEMINI_API_KEY } from '../config';

const router = Router();

// 1. Sistem Durum Uç Noktası
router.get('/sistem-durum', async (req, res) => {
  let supabaseAktif = false;
  let kayitSayisi = 0;
  let supabaseHata: string | null = null;

  if (supabase) {
    try {
      const { count, error } = await supabase
        .from('siparisler')
        .select('*', { count: 'exact', head: true });
      if (error) {
        supabaseHata = error.message;
      } else {
        supabaseAktif = true;
        kayitSayisi = count ?? 0;
      }
    } catch (e: any) {
      supabaseHata = e.message;
    }
  }

  res.json({
    basarili: true,
    supabase: {
      bagli: supabaseAktif,
      url: SUPABASE_URL
        ? SUPABASE_URL.replace(/https:\/\/(.{4}).*(\.supabase\.co)/, 'https://$1***$2')
        : null,
      kayit_sayisi: kayitSayisi,
      hata: supabaseHata,
    },
    gemini: {
      aktif: !!GEMINI_API_KEY,
      model: 'gemini-2.5-flash / gemini-3.8-flash',
    },
    sunucu_zamani: new Date().toISOString(),
  });
});

export default router;
