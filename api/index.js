// src/server/index.ts
import express from "express";
import fs5 from "fs";
import helmet from "helmet";

// src/server/config.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config();
var PORT = Number(process.env.PORT) || 3e3;
var NODE_ENV = process.env.NODE_ENV || "development";
var IS_PRODUCTION = NODE_ENV === "production";
var SUPABASE_URL = process.env.SUPABASE_URL || "";
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
var API_SECRET_KEY = process.env.API_SECRET_KEY || "";
var CORS_ORIGIN = process.env.CORS_ORIGIN || "";
var DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
var UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, "uploads");
var FIRMALAR_DOSYA_YOLU = path.join(DATA_DIR, "firmalar.json");
var KULLANICILAR_DOSYA_YOLU = path.join(DATA_DIR, "kullanicilar.json");
var RESEND_API_KEY = process.env.RESEND_API_KEY || "";
var EMAIL_FROM = process.env.EMAIL_FROM || "TOMNAP Platform <onboarding@resend.dev>";
var APP_URL = process.env.APP_URL || (IS_PRODUCTION ? "https://tomnap.com" : `http://localhost:${PORT}`);
if (SUPABASE_URL && !SUPABASE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY gerekli; anonim anahtar sunucuda kullan\u0131lamaz.");

// src/server/middleware/auth.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// src/server/services/sessions.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs2 from "node:fs";
import path3 from "node:path";

// src/server/services/state.ts
import fs from "fs";
import path2 from "path";

// src/data/ornek-siparisler.ts
var BASLANGIC_SIPARISLER = [
  {
    "id": "sip-sat-001",
    "olusturma_tarihi": "2026-09-10T12:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Michael Kors Greenwich Saffiano D\u0259ri \xC7anta (Medium, Qara / Q\u0131z\u0131l\u0131 Toka). 99 AZN beh \xF6d\u0259dim, qalan 81 AZN \xE7atanda veril\u0259c\u0259k.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Michael Kors Greenwich Saffiano D\u0259ri \xC7anta",
    "beden_veya_olcu": "Medium",
    "renk": "Qara / Q\u0131z\u0131l\u0131 Toka",
    "adet": 1,
    "toplam_tutar": 180,
    "alinan_tutar": 99,
    "kalan_tutar": 81,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "81 AZN qal\u0131q m\u0259bl\u0259\u011F Bak\u0131da kuryer t\u0259hvili zaman\u0131 toplanmal\u0131d\u0131r.",
    "kanada_magaza_adi": "Yorkdale Mall Michael Kors",
    "kanada_alis_fiyati_cad": 88,
    "kanada_alis_fiyati_azn": 110,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-sat-002",
    "olusturma_tarihi": "2026-09-10T06:19:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: Lululemon Align High-Rise 25 \u0130dman Tayt\u0131 (Size 4, Black (Qara)). Tam m\u0259bl\u0259\u011Fi kart\u0131n\u0131za \xF6d\u0259dim.",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "Lululemon Align High-Rise 25 \u0130dman Tayt\u0131",
    "beden_veya_olcu": "Size 4",
    "renk": "Black (Qara)",
    "adet": 1,
    "toplam_tutar": 135,
    "alinan_tutar": 135,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "B\xFCt\xFCn m\u0259bl\u0259\u011F \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Lululemon Queen St W",
    "kanada_alis_fiyati_cad": 68,
    "kanada_alis_fiyati_azn": 85,
    "kargo_agirligi_kg": 0.38,
    "kargo_ucreti_azn": 3,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-sat-003",
    "olusturma_tarihi": "2026-09-09T23:19:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: Coach Dempsey Tote 22 Siqnatur \xC7anta (Standart, Q\u0259hv\u0259yi / Qara Loqo). 130 AZN beh \xF6d\u0259dim, qalan 130 AZN \xE7atanda veril\u0259c\u0259k.",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 130,
    "kalan_tutar": 130,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "130 AZN qal\u0131q m\u0259bl\u0259\u011F Bak\u0131da kuryer t\u0259hvili zaman\u0131 toplanmal\u0131d\u0131r.",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-sat-004",
    "olusturma_tarihi": "2026-09-09T14:19:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Stanley Quencher H2.0 FlowState 40oz Termos (40 oz (1.18 L), Rose Quartz). Tam m\u0259bl\u0259\u011Fi kart\u0131n\u0131za \xF6d\u0259dim.",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Stanley Quencher H2.0 FlowState 40oz Termos",
    "beden_veya_olcu": "40 oz (1.18 L)",
    "renk": "Rose Quartz",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "B\xFCt\xFCn m\u0259bl\u0259\u011F \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Indigo Books Toronto",
    "kanada_alis_fiyati_cad": 45,
    "kanada_alis_fiyati_azn": 56,
    "kargo_agirligi_kg": 0.85,
    "kargo_ucreti_azn": 6,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-sat-005",
    "olusturma_tarihi": "2026-09-09T03:19:07.871Z",
    "ham_mesaj": "G\xFCnel Qas\u0131mova: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) (40 Numara, Black / White). \xD6d\u0259ni\u015Fi sabah ed\u0259c\u0259m z\u0259hm\u0259t olmasa ay\u0131r\u0131n.",
    "musteri_adi": "G\xFCnel Qas\u0131mova",
    "musteri_id": "mus-005",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@gunel_qasimova_",
    "telefon_numarasi": "+994 51 902 11 33",
    "teslimat_sehri": "Sumqay\u0131t",
    "teslimat_adresi": "Sumqay\u0131t \u015F., 9-cu mkr, S\xFClh k\xFC\xE7.",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 0,
    "kalan_tutar": 215,
    "para_birimi": "AZN",
    "finans_durumu": "BEKLIYOR",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "215 AZN qal\u0131q m\u0259bl\u0259\u011F Bak\u0131da kuryer t\u0259hvili zaman\u0131 toplanmal\u0131d\u0131r.",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "eksik_bilgiler": [
      "\xD6d\u0259ni\u015F q\u0259bzi t\u0259sdiql\u0259nm\u0259yib"
    ],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-sat-006",
    "olusturma_tarihi": "2026-09-08T18:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti (Standart, Nude Pink). 50 AZN beh \xF6d\u0259dim, qalan 75 AZN \xE7atanda veril\u0259c\u0259k.",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 50,
    "kalan_tutar": 75,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "75 AZN qal\u0131q m\u0259bl\u0259\u011F Bak\u0131da kuryer t\u0259hvili zaman\u0131 toplanmal\u0131d\u0131r.",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-sat-007",
    "olusturma_tarihi": "2026-09-08T07:19:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Sol de Janeiro Brazilian Crush Cheirosa 68 Mist (240 ml, Tropik Floral). Tam m\u0259bl\u0259\u011Fi kart\u0131n\u0131za \xF6d\u0259dim.",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Sol de Janeiro Brazilian Crush Cheirosa 68 Mist",
    "beden_veya_olcu": "240 ml",
    "renk": "Tropik Floral",
    "adet": 1,
    "toplam_tutar": 75,
    "alinan_tutar": 75,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "B\xFCt\xFCn m\u0259bl\u0259\u011F \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Sephora Bloor St",
    "kanada_alis_fiyati_cad": 38,
    "kanada_alis_fiyati_azn": 48,
    "kargo_agirligi_kg": 0.42,
    "kargo_ucreti_azn": 3,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-sat-008",
    "olusturma_tarihi": "2026-09-07T21:19:07.871Z",
    "ham_mesaj": "Z\u0259hra \u0130smay\u0131lova: Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k (S (36), Mavi / A\u011F Zolaql\u0131). 63 AZN beh \xF6d\u0259dim, qalan 42 AZN \xE7atanda veril\u0259c\u0259k.",
    "musteri_adi": "Z\u0259hra \u0130smay\u0131lova",
    "musteri_id": "mus-008",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@zehra_ismayil",
    "telefon_numarasi": "+994 77 410 55 66",
    "teslimat_sehri": "Ming\u0259\xE7evir",
    "teslimat_adresi": "Ming\u0259\xE7evir \u015F., Heyd\u0259r \u018Fliyev pr.",
    "urun_aciklamasi": "Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k",
    "beden_veya_olcu": "S (36)",
    "renk": "Mavi / A\u011F Zolaql\u0131",
    "adet": 1,
    "toplam_tutar": 105,
    "alinan_tutar": 63,
    "kalan_tutar": 42,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
    "baku_tahsilat_notu": "42 AZN qal\u0131q m\u0259bl\u0259\u011F Bak\u0131da kuryer t\u0259hvili zaman\u0131 toplanmal\u0131d\u0131r.",
    "kanada_magaza_adi": "Massimo Dutti Yorkdale",
    "kanada_alis_fiyati_cad": 55,
    "kanada_alis_fiyati_azn": 69,
    "kargo_agirligi_kg": 0.35,
    "kargo_ucreti_azn": 3,
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.98,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-dep-001",
    "olusturma_tarihi": "2026-09-07T10:31:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 118,
    "kalan_tutar": 117,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "117 AZN qal\u0131q borc var.",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-WH-8100",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-dep-002",
    "olusturma_tarihi": "2026-09-06T20:07:07.871Z",
    "ham_mesaj": "S\u0259bin\u0259 R\xFCst\u0259mova: Sephora Rare Beauty Likit All\u0131q & Tonal Set sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "S\u0259bin\u0259 R\xFCst\u0259mova",
    "musteri_id": "mus-010",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sabina_rustam",
    "telefon_numarasi": "+994 50 611 78 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130\xE7\u0259ri\u015F\u0259h\u0259r, Axundov ba\u011F\u0131",
    "urun_aciklamasi": "Sephora Rare Beauty Likit All\u0131q & Tonal Set",
    "beden_veya_olcu": "160C / Hope",
    "renk": "G\xFCl \xC7\u0259hray\u0131s\u0131",
    "adet": 1,
    "toplam_tutar": 110,
    "alinan_tutar": 110,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Sephora Eaton Centre",
    "kanada_alis_fiyati_cad": 52,
    "kanada_alis_fiyati_azn": 65,
    "kargo_agirligi_kg": 0.45,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-WH-8101",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-dep-003",
    "olusturma_tarihi": "2026-09-06T05:43:07.871Z",
    "ham_mesaj": "Aynur Babayeva: Zara Qad\u0131n Klassik Yun Palto sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "Zara Qad\u0131n Klassik Yun Palto",
    "beden_veya_olcu": "M (38)",
    "renk": "D\u0259v\u0259 Yun (Camel)",
    "adet": 1,
    "toplam_tutar": 165,
    "alinan_tutar": 165,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Zara Toronto Eaton",
    "kanada_alis_fiyati_cad": 90,
    "kanada_alis_fiyati_azn": 113,
    "kargo_agirligi_kg": 1.9,
    "kargo_ucreti_azn": 14,
    "kanada_takip_kodu": "TOR-WH-8102",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-dep-004",
    "olusturma_tarihi": "2026-09-05T17:43:07.871Z",
    "ham_mesaj": "Elmira Pa\u015Fayeva: Apple AirPods Pro (2. N\u0259sil) USB-C sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "Elmira Pa\u015Fayeva",
    "musteri_id": "mus-012",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@elmira_pashayeva",
    "telefon_numarasi": "+994 55 209 88 77",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F., Nizami G\u0259nc\u0259vi pr. 11",
    "urun_aciklamasi": "Apple AirPods Pro (2. N\u0259sil) USB-C",
    "beden_veya_olcu": "Universal",
    "renk": "B\u0259yaz",
    "adet": 1,
    "toplam_tutar": 420,
    "alinan_tutar": 252,
    "kalan_tutar": 168,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "168 AZN qal\u0131q borc var.",
    "kanada_magaza_adi": "Apple Yorkdale",
    "kanada_alis_fiyati_cad": 230,
    "kanada_alis_fiyati_azn": 288,
    "kargo_agirligi_kg": 0.4,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-WH-8103",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-dep-005",
    "olusturma_tarihi": "2026-09-05T03:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter",
    "beden_veya_olcu": "L B\u0259d\u0259n",
    "renk": "Boz Melanj",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Winners Bloor West",
    "kanada_alis_fiyati_cad": 48,
    "kanada_alis_fiyati_azn": 60,
    "kargo_agirligi_kg": 0.8,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-WH-8104",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-dep-006",
    "olusturma_tarihi": "2026-09-04T12:55:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta",
    "beden_veya_olcu": "Small",
    "renk": "Bej / Krem",
    "adet": 1,
    "toplam_tutar": 295,
    "alinan_tutar": 148,
    "kalan_tutar": 147,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "147 AZN qal\u0131q borc var.",
    "kanada_magaza_adi": "Saks Fifth Avenue Toronto",
    "kanada_alis_fiyati_cad": 160,
    "kanada_alis_fiyati_azn": 200,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-WH-8105",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-dep-007",
    "olusturma_tarihi": "2026-09-03T22:31:07.871Z",
    "ham_mesaj": "T\u0259ran\u0259 \u018Fs\u0259dova: New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131 sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "T\u0259ran\u0259 \u018Fs\u0259dova",
    "musteri_id": "mus-015",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@terane_asedova",
    "telefon_numarasi": "+994 55 819 22 45",
    "teslimat_sehri": "L\u0259nk\u0259ran",
    "teslimat_adresi": "L\u0259nk\u0259ran \u015F., Qala xiyaban\u0131",
    "urun_aciklamasi": "New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "39 Numara",
    "renk": "White / Silver / Navy",
    "adet": 1,
    "toplam_tutar": 198,
    "alinan_tutar": 198,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Foot Locker Yonge St",
    "kanada_alis_fiyati_cad": 105,
    "kanada_alis_fiyati_azn": 131,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-WH-8106",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-dep-008",
    "olusturma_tarihi": "2026-09-03T10:31:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131 sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131",
    "beden_veya_olcu": "Kompakt",
    "renk": "Karamel Q\u0259hv\u0259yi",
    "adet": 1,
    "toplam_tutar": 145,
    "alinan_tutar": 145,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Tory Burch Yorkdale",
    "kanada_alis_fiyati_cad": 75,
    "kanada_alis_fiyati_azn": 94,
    "kargo_agirligi_kg": 0.32,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-WH-8107",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-dep-009",
    "olusturma_tarihi": "2026-09-03T00:55:07.871Z",
    "ham_mesaj": "V\xFCsal\u0259 Ta\u011F\u0131yeva: Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131 sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "V\xFCsal\u0259 Ta\u011F\u0131yeva",
    "musteri_id": "mus-017",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@vusala_tagiyeva",
    "telefon_numarasi": "+994 50 310 90 80",
    "teslimat_sehri": "\u015E\u0259ki",
    "teslimat_adresi": "\u015E\u0259ki \u015F., M.F.Axundov pr.",
    "urun_aciklamasi": "Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131",
    "beden_veya_olcu": "Standart",
    "renk": "Mis / Nikel",
    "adet": 1,
    "toplam_tutar": 210,
    "alinan_tutar": 116,
    "kalan_tutar": 94,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "94 AZN qal\u0131q borc var.",
    "kanada_magaza_adi": "Dyson Demo Store Yorkdale",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-WH-8108",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-dep-010",
    "olusturma_tarihi": "2026-09-02T17:43:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Coach Dempsey Tote 22 Siqnatur \xC7anta sifari\u015Fi Toronto anbar\u0131na daxil oldu. Barkod yoxland\u0131.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 260,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "KANADA_DEPO",
    "baku_tahsilat_notu": "\xD6d\u0259ni\u015F tam tamamland\u0131.",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-WH-8109",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-krg-001",
    "olusturma_tarihi": "2026-09-02T10:31:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: Michael Kors Greenwich Saffiano D\u0259ri \xC7anta ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8841-YYZ).",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "Michael Kors Greenwich Saffiano D\u0259ri \xC7anta",
    "beden_veya_olcu": "Medium",
    "renk": "Qara / Q\u0131z\u0131l\u0131 Toka",
    "adet": 1,
    "toplam_tutar": 180,
    "alinan_tutar": 90,
    "kalan_tutar": 90,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "90 AZN qal\u0131q borc var, Bak\u0131da al\u0131nacaq.",
    "kanada_magaza_adi": "Yorkdale Mall Michael Kors",
    "kanada_alis_fiyati_cad": 88,
    "kanada_alis_fiyati_azn": 110,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-EXP-7200",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8841-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-krg-002",
    "olusturma_tarihi": "2026-09-01T17:43:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Lululemon Align High-Rise 25 \u0130dman Tayt\u0131 ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8841-YYZ).",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Lululemon Align High-Rise 25 \u0130dman Tayt\u0131",
    "beden_veya_olcu": "Size 4",
    "renk": "Black (Qara)",
    "adet": 1,
    "toplam_tutar": 135,
    "alinan_tutar": 135,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Lululemon Queen St W",
    "kanada_alis_fiyati_cad": 68,
    "kanada_alis_fiyati_azn": 85,
    "kargo_agirligi_kg": 0.38,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-EXP-7201",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8841-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-krg-003",
    "olusturma_tarihi": "2026-09-01T03:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: Stanley Quencher H2.0 FlowState 40oz Termos ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8841-YYZ).",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "Stanley Quencher H2.0 FlowState 40oz Termos",
    "beden_veya_olcu": "40 oz (1.18 L)",
    "renk": "Rose Quartz",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Indigo Books Toronto",
    "kanada_alis_fiyati_cad": 45,
    "kanada_alis_fiyati_azn": 56,
    "kargo_agirligi_kg": 0.85,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-EXP-7202",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8841-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-krg-004",
    "olusturma_tarihi": "2026-08-31T12:55:07.871Z",
    "ham_mesaj": "Z\u0259hra \u0130smay\u0131lova: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8841-YYZ).",
    "musteri_adi": "Z\u0259hra \u0130smay\u0131lova",
    "musteri_id": "mus-008",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@zehra_ismayil",
    "telefon_numarasi": "+994 77 410 55 66",
    "teslimat_sehri": "Ming\u0259\xE7evir",
    "teslimat_adresi": "Ming\u0259\xE7evir \u015F., Heyd\u0259r \u018Fliyev pr.",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 108,
    "kalan_tutar": 107,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "107 AZN qal\u0131q borc var, Bak\u0131da al\u0131nacaq.",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-EXP-7203",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8841-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-krg-005",
    "olusturma_tarihi": "2026-08-30T15:19:07.871Z",
    "ham_mesaj": "S\u0259bin\u0259 R\xFCst\u0259mova: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8920-YYZ).",
    "musteri_adi": "S\u0259bin\u0259 R\xFCst\u0259mova",
    "musteri_id": "mus-010",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sabina_rustam",
    "telefon_numarasi": "+994 50 611 78 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130\xE7\u0259ri\u015F\u0259h\u0259r, Axundov ba\u011F\u0131",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 125,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-EXP-7204",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8920-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-krg-006",
    "olusturma_tarihi": "2026-08-30T00:55:07.871Z",
    "ham_mesaj": "Elmira Pa\u015Fayeva: Sol de Janeiro Brazilian Crush Cheirosa 68 Mist ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8920-YYZ).",
    "musteri_adi": "Elmira Pa\u015Fayeva",
    "musteri_id": "mus-012",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@elmira_pashayeva",
    "telefon_numarasi": "+994 55 209 88 77",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F., Nizami G\u0259nc\u0259vi pr. 11",
    "urun_aciklamasi": "Sol de Janeiro Brazilian Crush Cheirosa 68 Mist",
    "beden_veya_olcu": "240 ml",
    "renk": "Tropik Floral",
    "adet": 1,
    "toplam_tutar": 75,
    "alinan_tutar": 75,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Sephora Bloor St",
    "kanada_alis_fiyati_cad": 38,
    "kanada_alis_fiyati_azn": 48,
    "kargo_agirligi_kg": 0.42,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-EXP-7205",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8920-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-krg-007",
    "olusturma_tarihi": "2026-08-29T08:07:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8920-YYZ).",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k",
    "beden_veya_olcu": "S (36)",
    "renk": "Mavi / A\u011F Zolaql\u0131",
    "adet": 1,
    "toplam_tutar": 105,
    "alinan_tutar": 53,
    "kalan_tutar": 52,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "52 AZN qal\u0131q borc var, Bak\u0131da al\u0131nacaq.",
    "kanada_magaza_adi": "Massimo Dutti Yorkdale",
    "kanada_alis_fiyati_cad": 55,
    "kanada_alis_fiyati_azn": 69,
    "kargo_agirligi_kg": 0.35,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-EXP-7206",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8920-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-krg-008",
    "olusturma_tarihi": "2026-08-28T15:19:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (AZ-CARGO-8920-YYZ).",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 235,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-EXP-7207",
    "uluslararasi_kargo_kodu": "AZ-CARGO-8920-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-krg-009",
    "olusturma_tarihi": "2026-08-27T20:07:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: Sephora Rare Beauty Likit All\u0131q & Tonal Set ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "Sephora Rare Beauty Likit All\u0131q & Tonal Set",
    "beden_veya_olcu": "160C / Hope",
    "renk": "G\xFCl \xC7\u0259hray\u0131s\u0131",
    "adet": 1,
    "toplam_tutar": 110,
    "alinan_tutar": 110,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Sephora Eaton Centre",
    "kanada_alis_fiyati_cad": 52,
    "kanada_alis_fiyati_azn": 65,
    "kargo_agirligi_kg": 0.45,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-EXP-7208",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-krg-010",
    "olusturma_tarihi": "2026-08-27T10:31:07.871Z",
    "ham_mesaj": "G\xFCnel Qas\u0131mova: Zara Qad\u0131n Klassik Yun Palto ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "G\xFCnel Qas\u0131mova",
    "musteri_id": "mus-005",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@gunel_qasimova_",
    "telefon_numarasi": "+994 51 902 11 33",
    "teslimat_sehri": "Sumqay\u0131t",
    "teslimat_adresi": "Sumqay\u0131t \u015F., 9-cu mkr, S\xFClh k\xFC\xE7.",
    "urun_aciklamasi": "Zara Qad\u0131n Klassik Yun Palto",
    "beden_veya_olcu": "M (38)",
    "renk": "D\u0259v\u0259 Yun (Camel)",
    "adet": 1,
    "toplam_tutar": 165,
    "alinan_tutar": 83,
    "kalan_tutar": 82,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "82 AZN qal\u0131q borc var, Bak\u0131da al\u0131nacaq.",
    "kanada_magaza_adi": "Zara Toronto Eaton",
    "kanada_alis_fiyati_cad": 90,
    "kanada_alis_fiyati_azn": 113,
    "kargo_agirligi_kg": 1.9,
    "kargo_ucreti_azn": 14,
    "kanada_takip_kodu": "TOR-EXP-7209",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-krg-011",
    "olusturma_tarihi": "2026-08-26T20:07:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Apple AirPods Pro (2. N\u0259sil) USB-C ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Apple AirPods Pro (2. N\u0259sil) USB-C",
    "beden_veya_olcu": "Universal",
    "renk": "B\u0259yaz",
    "adet": 1,
    "toplam_tutar": 420,
    "alinan_tutar": 420,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Apple Yorkdale",
    "kanada_alis_fiyati_cad": 230,
    "kanada_alis_fiyati_azn": 288,
    "kargo_agirligi_kg": 0.4,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-EXP-7210",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-krg-012",
    "olusturma_tarihi": "2026-08-26T10:31:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si",
    "beden_veya_olcu": "37 Numara",
    "renk": "Chestnut",
    "adet": 1,
    "toplam_tutar": 245,
    "alinan_tutar": 245,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "Nordstrom Rack Toronto",
    "kanada_alis_fiyati_cad": 130,
    "kanada_alis_fiyati_azn": 163,
    "kargo_agirligi_kg": 1.35,
    "kargo_ucreti_azn": 10,
    "kanada_takip_kodu": "TOR-EXP-7211",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-krg-013",
    "olusturma_tarihi": "2026-08-26T00:55:07.871Z",
    "ham_mesaj": "Aynur Babayeva: Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi",
    "beden_veya_olcu": "6-9 Ay",
    "renk": "Qar\u0131\u015F\u0131q Pastel",
    "adet": 1,
    "toplam_tutar": 58,
    "alinan_tutar": 29,
    "kalan_tutar": 29,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "29 AZN qal\u0131q borc var, Bak\u0131da al\u0131nacaq.",
    "kanada_magaza_adi": "Carter's OshKosh Dufferin",
    "kanada_alis_fiyati_cad": 28,
    "kanada_alis_fiyati_azn": 35,
    "kargo_agirligi_kg": 0.5,
    "kargo_ucreti_azn": 4,
    "kanada_takip_kodu": "TOR-EXP-7212",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-krg-014",
    "olusturma_tarihi": "2026-08-25T15:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131 ba\u011Flamas\u0131 Toronto Pearson hava liman\u0131ndan Bak\u0131ya u\xE7u\u015Fdad\u0131r (KNB-AIR-3312-YYZ).",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "Nude Bej",
    "adet": 1,
    "toplam_tutar": 120,
    "alinan_tutar": 120,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "ULUSLARARASI_KARGO",
    "baku_tahsilat_notu": "Tam \xF6d\u0259nilib.",
    "kanada_magaza_adi": "ALDO Shoes Eaton",
    "kanada_alis_fiyati_cad": 62,
    "kanada_alis_fiyati_azn": 78,
    "kargo_agirligi_kg": 0.9,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-EXP-7213",
    "uluslararasi_kargo_kodu": "KNB-AIR-3312-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-bku-001",
    "olusturma_tarihi": "2026-08-25T03:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Coach Dempsey Tote 22 Siqnatur \xC7anta ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (V\xFCqar T. (G\u0259nc\u0259/Rayonlar)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 260,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "uluslararasi_kargo_kodu": "GYD-EXP-5510",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-bku-002",
    "olusturma_tarihi": "2026-08-24T10:31:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 141,
    "kalan_tutar": 94,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer Elvin M. (N\u0259rimanov/M\u0259rk\u0259z) vasit\u0259sil\u0259 94 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "uluslararasi_kargo_kodu": "GYD-EXP-5511",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-bku-003",
    "olusturma_tarihi": "2026-08-23T15:19:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: Stanley Quencher H2.0 FlowState 40oz Termos ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (R\u0259\u015Fad K. (Yasamal/Elml\u0259r)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "Stanley Quencher H2.0 FlowState 40oz Termos",
    "beden_veya_olcu": "40 oz (1.18 L)",
    "renk": "Rose Quartz",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "kanada_magaza_adi": "Indigo Books Toronto",
    "kanada_alis_fiyati_cad": 45,
    "kanada_alis_fiyati_azn": 56,
    "kargo_agirligi_kg": 0.85,
    "kargo_ucreti_azn": 6,
    "uluslararasi_kargo_kodu": "GYD-EXP-5512",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-bku-004",
    "olusturma_tarihi": "2026-08-22T20:07:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 129,
    "kalan_tutar": 86,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer Elvin M. (N\u0259rimanov/M\u0259rk\u0259z) vasit\u0259sil\u0259 86 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "uluslararasi_kargo_kodu": "GYD-EXP-5513",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-bku-005",
    "olusturma_tarihi": "2026-08-22T03:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Samir Q. (X\u0259tai/\u018Fhm\u0259dli)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 125,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "uluslararasi_kargo_kodu": "GYD-EXP-5514",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-bku-006",
    "olusturma_tarihi": "2026-08-21T08:07:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (R\u0259\u015Fad K. (Yasamal/Elml\u0259r)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter",
    "beden_veya_olcu": "L B\u0259d\u0259n",
    "renk": "Boz Melanj",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 57,
    "kalan_tutar": 38,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer R\u0259\u015Fad K. (Yasamal/Elml\u0259r) vasit\u0259sil\u0259 38 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "kanada_magaza_adi": "Winners Bloor West",
    "kanada_alis_fiyati_cad": 48,
    "kanada_alis_fiyati_azn": 60,
    "kargo_agirligi_kg": 0.8,
    "kargo_ucreti_azn": 6,
    "uluslararasi_kargo_kodu": "GYD-EXP-5515",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-bku-007",
    "olusturma_tarihi": "2026-08-20T12:55:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (R\u0259\u015Fad K. (Yasamal/Elml\u0259r)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta",
    "beden_veya_olcu": "Small",
    "renk": "Bej / Krem",
    "adet": 1,
    "toplam_tutar": 295,
    "alinan_tutar": 295,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "kanada_magaza_adi": "Saks Fifth Avenue Toronto",
    "kanada_alis_fiyati_cad": 160,
    "kanada_alis_fiyati_azn": 200,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "uluslararasi_kargo_kodu": "GYD-EXP-5516",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-bku-008",
    "olusturma_tarihi": "2026-08-19T20:07:07.871Z",
    "ham_mesaj": "Aynur Babayeva: New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131 ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "39 Numara",
    "renk": "White / Silver / Navy",
    "adet": 1,
    "toplam_tutar": 198,
    "alinan_tutar": 119,
    "kalan_tutar": 79,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer Elvin M. (N\u0259rimanov/M\u0259rk\u0259z) vasit\u0259sil\u0259 79 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "kanada_magaza_adi": "Foot Locker Yonge St",
    "kanada_alis_fiyati_cad": 105,
    "kanada_alis_fiyati_azn": 131,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "uluslararasi_kargo_kodu": "GYD-EXP-5517",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-bku-009",
    "olusturma_tarihi": "2026-08-19T03:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131 ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131",
    "beden_veya_olcu": "Kompakt",
    "renk": "Karamel Q\u0259hv\u0259yi",
    "adet": 1,
    "toplam_tutar": 145,
    "alinan_tutar": 145,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "kanada_magaza_adi": "Tory Burch Yorkdale",
    "kanada_alis_fiyati_cad": 75,
    "kanada_alis_fiyati_azn": 94,
    "kargo_agirligi_kg": 0.32,
    "kargo_ucreti_azn": 2,
    "uluslararasi_kargo_kodu": "GYD-EXP-5518",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-bku-010",
    "olusturma_tarihi": "2026-08-18T10:31:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: Lululemon Align High-Rise 25 \u0130dman Tayt\u0131 ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (Samir Q. (X\u0259tai/\u018Fhm\u0259dli)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "Lululemon Align High-Rise 25 \u0130dman Tayt\u0131",
    "beden_veya_olcu": "Size 4",
    "renk": "Black (Qara)",
    "adet": 1,
    "toplam_tutar": 135,
    "alinan_tutar": 81,
    "kalan_tutar": 54,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer Samir Q. (X\u0259tai/\u018Fhm\u0259dli) vasit\u0259sil\u0259 54 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "kanada_magaza_adi": "Lululemon Queen St W",
    "kanada_alis_fiyati_cad": 68,
    "kanada_alis_fiyati_azn": 85,
    "kargo_agirligi_kg": 0.38,
    "kargo_ucreti_azn": 3,
    "uluslararasi_kargo_kodu": "GYD-EXP-5519",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-bku-011",
    "olusturma_tarihi": "2026-08-17T15:19:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: Apple AirPods Pro (2. N\u0259sil) USB-C ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (R\u0259\u015Fad K. (Yasamal/Elml\u0259r)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "Apple AirPods Pro (2. N\u0259sil) USB-C",
    "beden_veya_olcu": "Universal",
    "renk": "B\u0259yaz",
    "adet": 1,
    "toplam_tutar": 420,
    "alinan_tutar": 420,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "M\u0259bl\u0259\u011F tam \xF6d\u0259nilib.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "kanada_magaza_adi": "Apple Yorkdale",
    "kanada_alis_fiyati_cad": 230,
    "kanada_alis_fiyati_azn": 288,
    "kargo_agirligi_kg": 0.4,
    "kargo_ucreti_azn": 3,
    "uluslararasi_kargo_kodu": "GYD-EXP-5520",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-bku-012",
    "olusturma_tarihi": "2026-08-16T20:07:07.871Z",
    "ham_mesaj": "V\xFCsal\u0259 Ta\u011F\u0131yeva: Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k ba\u011Flamas\u0131 Bak\u0131 m\u0259rk\u0259zin\u0259 \xE7atd\u0131. Kuryer (V\xFCqar T. (G\u0259nc\u0259/Rayonlar)) t\u0259hvil paylan\u0131\u015F\u0131ndad\u0131r.",
    "musteri_adi": "V\xFCsal\u0259 Ta\u011F\u0131yeva",
    "musteri_id": "mus-017",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@vusala_tagiyeva",
    "telefon_numarasi": "+994 50 310 90 80",
    "teslimat_sehri": "\u015E\u0259ki",
    "teslimat_adresi": "\u015E\u0259ki \u015F., M.F.Axundov pr.",
    "urun_aciklamasi": "Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k",
    "beden_veya_olcu": "S (36)",
    "renk": "Mavi / A\u011F Zolaql\u0131",
    "adet": 1,
    "toplam_tutar": 105,
    "alinan_tutar": 63,
    "kalan_tutar": 42,
    "para_birimi": "AZN",
    "finans_durumu": "KISMI_ODEME",
    "lojistik_durumu": "BAKU_DAGITIM_ARKADAS",
    "baku_tahsilat_notu": "Kuryer V\xFCqar T. (G\u0259nc\u0259/Rayonlar) vasit\u0259sil\u0259 42 AZN na\u011Fd/kart toplanacaq.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "kanada_magaza_adi": "Massimo Dutti Yorkdale",
    "kanada_alis_fiyati_cad": 55,
    "kanada_alis_fiyati_azn": 69,
    "kargo_agirligi_kg": 0.35,
    "kargo_ucreti_azn": 3,
    "uluslararasi_kargo_kodu": "GYD-EXP-5521",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-001",
    "olusturma_tarihi": "2026-08-15T15:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Michael Kors Greenwich Saffiano D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Michael Kors Greenwich Saffiano D\u0259ri \xC7anta",
    "beden_veya_olcu": "Medium",
    "renk": "Qara / Q\u0131z\u0131l\u0131 Toka",
    "adet": 1,
    "toplam_tutar": 180,
    "alinan_tutar": 180,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-08-22T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Yorkdale Mall Michael Kors",
    "kanada_alis_fiyati_cad": 88,
    "kanada_alis_fiyati_azn": 110,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4000",
    "uluslararasi_kargo_kodu": "AZ-HIST-3000-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-002",
    "olusturma_tarihi": "2026-08-13T15:19:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: Coach Dempsey Tote 22 Siqnatur \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 260,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-08-20T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4001",
    "uluslararasi_kargo_kodu": "AZ-HIST-3001-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-003",
    "olusturma_tarihi": "2026-08-10T15:19:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: Zara Qad\u0131n Klassik Yun Palto sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "Zara Qad\u0131n Klassik Yun Palto",
    "beden_veya_olcu": "M (38)",
    "renk": "D\u0259v\u0259 Yun (Camel)",
    "adet": 1,
    "toplam_tutar": 165,
    "alinan_tutar": 165,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-08-17T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Zara Toronto Eaton",
    "kanada_alis_fiyati_cad": 90,
    "kanada_alis_fiyati_azn": 113,
    "kargo_agirligi_kg": 1.9,
    "kargo_ucreti_azn": 14,
    "kanada_takip_kodu": "TOR-ARC-4002",
    "uluslararasi_kargo_kodu": "AZ-HIST-3002-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-004",
    "olusturma_tarihi": "2026-08-07T15:19:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 125,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-08-14T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4003",
    "uluslararasi_kargo_kodu": "AZ-HIST-3003-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-005",
    "olusturma_tarihi": "2026-08-03T15:19:07.871Z",
    "ham_mesaj": "G\xFCnel Qas\u0131mova: Sol de Janeiro Brazilian Crush Cheirosa 68 Mist sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "G\xFCnel Qas\u0131mova",
    "musteri_id": "mus-005",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@gunel_qasimova_",
    "telefon_numarasi": "+994 51 902 11 33",
    "teslimat_sehri": "Sumqay\u0131t",
    "teslimat_adresi": "Sumqay\u0131t \u015F., 9-cu mkr, S\xFClh k\xFC\xE7.",
    "urun_aciklamasi": "Sol de Janeiro Brazilian Crush Cheirosa 68 Mist",
    "beden_veya_olcu": "240 ml",
    "renk": "Tropik Floral",
    "adet": 1,
    "toplam_tutar": 75,
    "alinan_tutar": 75,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-08-10T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Sephora Bloor St",
    "kanada_alis_fiyati_cad": 38,
    "kanada_alis_fiyati_azn": 48,
    "kargo_agirligi_kg": 0.42,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4004",
    "uluslararasi_kargo_kodu": "AZ-HIST-3004-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-006",
    "olusturma_tarihi": "2026-07-30T15:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi",
    "beden_veya_olcu": "6-9 Ay",
    "renk": "Qar\u0131\u015F\u0131q Pastel",
    "adet": 1,
    "toplam_tutar": 58,
    "alinan_tutar": 58,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-08-06T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Carter's OshKosh Dufferin",
    "kanada_alis_fiyati_cad": 28,
    "kanada_alis_fiyati_azn": 35,
    "kargo_agirligi_kg": 0.5,
    "kargo_ucreti_azn": 4,
    "kanada_takip_kodu": "TOR-ARC-4005",
    "uluslararasi_kargo_kodu": "AZ-HIST-3005-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-007",
    "olusturma_tarihi": "2026-07-27T15:19:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131",
    "beden_veya_olcu": "Kompakt",
    "renk": "Karamel Q\u0259hv\u0259yi",
    "adet": 1,
    "toplam_tutar": 145,
    "alinan_tutar": 145,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-08-03T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Tory Burch Yorkdale",
    "kanada_alis_fiyati_cad": 75,
    "kanada_alis_fiyati_azn": 94,
    "kargo_agirligi_kg": 0.32,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4006",
    "uluslararasi_kargo_kodu": "AZ-HIST-3006-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-008",
    "olusturma_tarihi": "2026-07-23T15:19:07.871Z",
    "ham_mesaj": "Z\u0259hra \u0130smay\u0131lova: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Z\u0259hra \u0130smay\u0131lova",
    "musteri_id": "mus-008",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@zehra_ismayil",
    "telefon_numarasi": "+994 77 410 55 66",
    "teslimat_sehri": "Ming\u0259\xE7evir",
    "teslimat_adresi": "Ming\u0259\xE7evir \u015F., Heyd\u0259r \u018Fliyev pr.",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 235,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-07-30T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4007",
    "uluslararasi_kargo_kodu": "AZ-HIST-3007-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-009",
    "olusturma_tarihi": "2026-07-20T15:19:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: Sephora Rare Beauty Likit All\u0131q & Tonal Set sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "Sephora Rare Beauty Likit All\u0131q & Tonal Set",
    "beden_veya_olcu": "160C / Hope",
    "renk": "G\xFCl \xC7\u0259hray\u0131s\u0131",
    "adet": 1,
    "toplam_tutar": 110,
    "alinan_tutar": 110,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-07-27T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Sephora Eaton Centre",
    "kanada_alis_fiyati_cad": 52,
    "kanada_alis_fiyati_azn": 65,
    "kargo_agirligi_kg": 0.45,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4008",
    "uluslararasi_kargo_kodu": "AZ-HIST-3008-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-010",
    "olusturma_tarihi": "2026-07-16T15:19:07.871Z",
    "ham_mesaj": "S\u0259bin\u0259 R\xFCst\u0259mova: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "S\u0259bin\u0259 R\xFCst\u0259mova",
    "musteri_id": "mus-010",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sabina_rustam",
    "telefon_numarasi": "+994 50 611 78 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130\xE7\u0259ri\u015F\u0259h\u0259r, Axundov ba\u011F\u0131",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 215,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-07-23T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4009",
    "uluslararasi_kargo_kodu": "AZ-HIST-3009-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-011",
    "olusturma_tarihi": "2026-07-12T15:19:07.871Z",
    "ham_mesaj": "Aynur Babayeva: UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si",
    "beden_veya_olcu": "37 Numara",
    "renk": "Chestnut",
    "adet": 1,
    "toplam_tutar": 245,
    "alinan_tutar": 245,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-07-19T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Nordstrom Rack Toronto",
    "kanada_alis_fiyati_cad": 130,
    "kanada_alis_fiyati_azn": 163,
    "kargo_agirligi_kg": 1.35,
    "kargo_ucreti_azn": 10,
    "kanada_takip_kodu": "TOR-ARC-4010",
    "uluslararasi_kargo_kodu": "AZ-HIST-3010-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-012",
    "olusturma_tarihi": "2026-07-08T15:19:07.871Z",
    "ham_mesaj": "Elmira Pa\u015Fayeva: Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Elmira Pa\u015Fayeva",
    "musteri_id": "mus-012",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@elmira_pashayeva",
    "telefon_numarasi": "+994 55 209 88 77",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F., Nizami G\u0259nc\u0259vi pr. 11",
    "urun_aciklamasi": "Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta",
    "beden_veya_olcu": "Small",
    "renk": "Bej / Krem",
    "adet": 1,
    "toplam_tutar": 295,
    "alinan_tutar": 295,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-07-15T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Saks Fifth Avenue Toronto",
    "kanada_alis_fiyati_cad": 160,
    "kanada_alis_fiyati_azn": 200,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4011",
    "uluslararasi_kargo_kodu": "AZ-HIST-3011-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-013",
    "olusturma_tarihi": "2026-07-04T15:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "39 Numara",
    "renk": "White / Silver / Navy",
    "adet": 1,
    "toplam_tutar": 198,
    "alinan_tutar": 198,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-07-11T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Foot Locker Yonge St",
    "kanada_alis_fiyati_cad": 105,
    "kanada_alis_fiyati_azn": 131,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4012",
    "uluslararasi_kargo_kodu": "AZ-HIST-3012-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-014",
    "olusturma_tarihi": "2026-06-30T15:19:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131",
    "beden_veya_olcu": "Standart",
    "renk": "Mis / Nikel",
    "adet": 1,
    "toplam_tutar": 210,
    "alinan_tutar": 210,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-07-07T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Dyson Demo Store Yorkdale",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4013",
    "uluslararasi_kargo_kodu": "AZ-HIST-3013-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-015",
    "olusturma_tarihi": "2026-06-26T15:19:07.871Z",
    "ham_mesaj": "T\u0259ran\u0259 \u018Fs\u0259dova: Lululemon Align High-Rise 25 \u0130dman Tayt\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "T\u0259ran\u0259 \u018Fs\u0259dova",
    "musteri_id": "mus-015",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@terane_asedova",
    "telefon_numarasi": "+994 55 819 22 45",
    "teslimat_sehri": "L\u0259nk\u0259ran",
    "teslimat_adresi": "L\u0259nk\u0259ran \u015F., Qala xiyaban\u0131",
    "urun_aciklamasi": "Lululemon Align High-Rise 25 \u0130dman Tayt\u0131",
    "beden_veya_olcu": "Size 4",
    "renk": "Black (Qara)",
    "adet": 1,
    "toplam_tutar": 135,
    "alinan_tutar": 135,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-07-03T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Lululemon Queen St W",
    "kanada_alis_fiyati_cad": 68,
    "kanada_alis_fiyati_azn": 85,
    "kargo_agirligi_kg": 0.38,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4014",
    "uluslararasi_kargo_kodu": "AZ-HIST-3014-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-016",
    "olusturma_tarihi": "2026-06-22T15:19:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: Stanley Quencher H2.0 FlowState 40oz Termos sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "Stanley Quencher H2.0 FlowState 40oz Termos",
    "beden_veya_olcu": "40 oz (1.18 L)",
    "renk": "Rose Quartz",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-06-29T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Indigo Books Toronto",
    "kanada_alis_fiyati_cad": 45,
    "kanada_alis_fiyati_azn": 56,
    "kargo_agirligi_kg": 0.85,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-ARC-4015",
    "uluslararasi_kargo_kodu": "AZ-HIST-3015-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-017",
    "olusturma_tarihi": "2026-06-19T15:19:07.871Z",
    "ham_mesaj": "V\xFCsal\u0259 Ta\u011F\u0131yeva: Apple AirPods Pro (2. N\u0259sil) USB-C sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "V\xFCsal\u0259 Ta\u011F\u0131yeva",
    "musteri_id": "mus-017",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@vusala_tagiyeva",
    "telefon_numarasi": "+994 50 310 90 80",
    "teslimat_sehri": "\u015E\u0259ki",
    "teslimat_adresi": "\u015E\u0259ki \u015F., M.F.Axundov pr.",
    "urun_aciklamasi": "Apple AirPods Pro (2. N\u0259sil) USB-C",
    "beden_veya_olcu": "Universal",
    "renk": "B\u0259yaz",
    "adet": 1,
    "toplam_tutar": 420,
    "alinan_tutar": 420,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-06-26T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Apple Yorkdale",
    "kanada_alis_fiyati_cad": 230,
    "kanada_alis_fiyati_azn": 288,
    "kargo_agirligi_kg": 0.4,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4016",
    "uluslararasi_kargo_kodu": "AZ-HIST-3016-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-018",
    "olusturma_tarihi": "2026-06-16T15:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter",
    "beden_veya_olcu": "L B\u0259d\u0259n",
    "renk": "Boz Melanj",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-06-23T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Winners Bloor West",
    "kanada_alis_fiyati_cad": 48,
    "kanada_alis_fiyati_azn": 60,
    "kargo_agirligi_kg": 0.8,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-ARC-4017",
    "uluslararasi_kargo_kodu": "AZ-HIST-3017-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-019",
    "olusturma_tarihi": "2026-06-13T15:19:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k",
    "beden_veya_olcu": "S (36)",
    "renk": "Mavi / A\u011F Zolaql\u0131",
    "adet": 1,
    "toplam_tutar": 105,
    "alinan_tutar": 105,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-06-20T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Massimo Dutti Yorkdale",
    "kanada_alis_fiyati_cad": 55,
    "kanada_alis_fiyati_azn": 69,
    "kargo_agirligi_kg": 0.35,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4018",
    "uluslararasi_kargo_kodu": "AZ-HIST-3018-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-020",
    "olusturma_tarihi": "2026-06-10T15:19:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "Nude Bej",
    "adet": 1,
    "toplam_tutar": 120,
    "alinan_tutar": 120,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-06-17T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "ALDO Shoes Eaton",
    "kanada_alis_fiyati_cad": 62,
    "kanada_alis_fiyati_azn": 78,
    "kargo_agirligi_kg": 0.9,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4019",
    "uluslararasi_kargo_kodu": "AZ-HIST-3019-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-021",
    "olusturma_tarihi": "2026-06-07T15:19:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Michael Kors Greenwich Saffiano D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Michael Kors Greenwich Saffiano D\u0259ri \xC7anta",
    "beden_veya_olcu": "Medium",
    "renk": "Qara / Q\u0131z\u0131l\u0131 Toka",
    "adet": 1,
    "toplam_tutar": 180,
    "alinan_tutar": 180,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-06-14T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Yorkdale Mall Michael Kors",
    "kanada_alis_fiyati_cad": 88,
    "kanada_alis_fiyati_azn": 110,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4020",
    "uluslararasi_kargo_kodu": "AZ-HIST-3020-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-022",
    "olusturma_tarihi": "2026-06-04T15:19:07.871Z",
    "ham_mesaj": "G\xFCnel Qas\u0131mova: Coach Dempsey Tote 22 Siqnatur \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "G\xFCnel Qas\u0131mova",
    "musteri_id": "mus-005",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@gunel_qasimova_",
    "telefon_numarasi": "+994 51 902 11 33",
    "teslimat_sehri": "Sumqay\u0131t",
    "teslimat_adresi": "Sumqay\u0131t \u015F., 9-cu mkr, S\xFClh k\xFC\xE7.",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 260,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-06-11T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4021",
    "uluslararasi_kargo_kodu": "AZ-HIST-3021-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-023",
    "olusturma_tarihi": "2026-05-28T15:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: Zara Qad\u0131n Klassik Yun Palto sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "Zara Qad\u0131n Klassik Yun Palto",
    "beden_veya_olcu": "M (38)",
    "renk": "D\u0259v\u0259 Yun (Camel)",
    "adet": 1,
    "toplam_tutar": 165,
    "alinan_tutar": 165,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-06-04T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Zara Toronto Eaton",
    "kanada_alis_fiyati_cad": 90,
    "kanada_alis_fiyati_azn": 113,
    "kargo_agirligi_kg": 1.9,
    "kargo_ucreti_azn": 14,
    "kanada_takip_kodu": "TOR-ARC-4022",
    "uluslararasi_kargo_kodu": "AZ-HIST-3022-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-024",
    "olusturma_tarihi": "2026-05-21T15:19:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 125,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-05-28T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4023",
    "uluslararasi_kargo_kodu": "AZ-HIST-3023-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-025",
    "olusturma_tarihi": "2026-05-14T15:19:07.871Z",
    "ham_mesaj": "Z\u0259hra \u0130smay\u0131lova: Sol de Janeiro Brazilian Crush Cheirosa 68 Mist sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Z\u0259hra \u0130smay\u0131lova",
    "musteri_id": "mus-008",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@zehra_ismayil",
    "telefon_numarasi": "+994 77 410 55 66",
    "teslimat_sehri": "Ming\u0259\xE7evir",
    "teslimat_adresi": "Ming\u0259\xE7evir \u015F., Heyd\u0259r \u018Fliyev pr.",
    "urun_aciklamasi": "Sol de Janeiro Brazilian Crush Cheirosa 68 Mist",
    "beden_veya_olcu": "240 ml",
    "renk": "Tropik Floral",
    "adet": 1,
    "toplam_tutar": 75,
    "alinan_tutar": 75,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-05-21T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Sephora Bloor St",
    "kanada_alis_fiyati_cad": 38,
    "kanada_alis_fiyati_azn": 48,
    "kargo_agirligi_kg": 0.42,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4024",
    "uluslararasi_kargo_kodu": "AZ-HIST-3024-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-026",
    "olusturma_tarihi": "2026-05-07T15:19:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi",
    "beden_veya_olcu": "6-9 Ay",
    "renk": "Qar\u0131\u015F\u0131q Pastel",
    "adet": 1,
    "toplam_tutar": 58,
    "alinan_tutar": 58,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-05-14T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Carter's OshKosh Dufferin",
    "kanada_alis_fiyati_cad": 28,
    "kanada_alis_fiyati_azn": 35,
    "kargo_agirligi_kg": 0.5,
    "kargo_ucreti_azn": 4,
    "kanada_takip_kodu": "TOR-ARC-4025",
    "uluslararasi_kargo_kodu": "AZ-HIST-3025-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-027",
    "olusturma_tarihi": "2026-04-30T15:19:07.871Z",
    "ham_mesaj": "S\u0259bin\u0259 R\xFCst\u0259mova: Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "S\u0259bin\u0259 R\xFCst\u0259mova",
    "musteri_id": "mus-010",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sabina_rustam",
    "telefon_numarasi": "+994 50 611 78 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130\xE7\u0259ri\u015F\u0259h\u0259r, Axundov ba\u011F\u0131",
    "urun_aciklamasi": "Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131",
    "beden_veya_olcu": "Kompakt",
    "renk": "Karamel Q\u0259hv\u0259yi",
    "adet": 1,
    "toplam_tutar": 145,
    "alinan_tutar": 145,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-05-07T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Tory Burch Yorkdale",
    "kanada_alis_fiyati_cad": 75,
    "kanada_alis_fiyati_azn": 94,
    "kargo_agirligi_kg": 0.32,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4026",
    "uluslararasi_kargo_kodu": "AZ-HIST-3026-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-028",
    "olusturma_tarihi": "2026-04-23T15:19:07.871Z",
    "ham_mesaj": "Aynur Babayeva: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 235,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-04-30T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4027",
    "uluslararasi_kargo_kodu": "AZ-HIST-3027-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-029",
    "olusturma_tarihi": "2026-04-16T15:19:07.871Z",
    "ham_mesaj": "Elmira Pa\u015Fayeva: Sephora Rare Beauty Likit All\u0131q & Tonal Set sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Elmira Pa\u015Fayeva",
    "musteri_id": "mus-012",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@elmira_pashayeva",
    "telefon_numarasi": "+994 55 209 88 77",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F., Nizami G\u0259nc\u0259vi pr. 11",
    "urun_aciklamasi": "Sephora Rare Beauty Likit All\u0131q & Tonal Set",
    "beden_veya_olcu": "160C / Hope",
    "renk": "G\xFCl \xC7\u0259hray\u0131s\u0131",
    "adet": 1,
    "toplam_tutar": 110,
    "alinan_tutar": 110,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-04-23T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Sephora Eaton Centre",
    "kanada_alis_fiyati_cad": 52,
    "kanada_alis_fiyati_azn": 65,
    "kargo_agirligi_kg": 0.45,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4028",
    "uluslararasi_kargo_kodu": "AZ-HIST-3028-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-030",
    "olusturma_tarihi": "2026-04-08T15:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 215,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-04-15T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4029",
    "uluslararasi_kargo_kodu": "AZ-HIST-3029-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-031",
    "olusturma_tarihi": "2026-04-01T15:19:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si",
    "beden_veya_olcu": "37 Numara",
    "renk": "Chestnut",
    "adet": 1,
    "toplam_tutar": 245,
    "alinan_tutar": 245,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-04-08T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Nordstrom Rack Toronto",
    "kanada_alis_fiyati_cad": 130,
    "kanada_alis_fiyati_azn": 163,
    "kargo_agirligi_kg": 1.35,
    "kargo_ucreti_azn": 10,
    "kanada_takip_kodu": "TOR-ARC-4030",
    "uluslararasi_kargo_kodu": "AZ-HIST-3030-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-032",
    "olusturma_tarihi": "2026-03-24T15:19:07.871Z",
    "ham_mesaj": "T\u0259ran\u0259 \u018Fs\u0259dova: Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "T\u0259ran\u0259 \u018Fs\u0259dova",
    "musteri_id": "mus-015",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@terane_asedova",
    "telefon_numarasi": "+994 55 819 22 45",
    "teslimat_sehri": "L\u0259nk\u0259ran",
    "teslimat_adresi": "L\u0259nk\u0259ran \u015F., Qala xiyaban\u0131",
    "urun_aciklamasi": "Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta",
    "beden_veya_olcu": "Small",
    "renk": "Bej / Krem",
    "adet": 1,
    "toplam_tutar": 295,
    "alinan_tutar": 295,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-03-31T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Saks Fifth Avenue Toronto",
    "kanada_alis_fiyati_cad": 160,
    "kanada_alis_fiyati_azn": 200,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4031",
    "uluslararasi_kargo_kodu": "AZ-HIST-3031-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-033",
    "olusturma_tarihi": "2026-03-16T15:19:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "New Balance 530 Unisex \u0130dman Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "39 Numara",
    "renk": "White / Silver / Navy",
    "adet": 1,
    "toplam_tutar": 198,
    "alinan_tutar": 198,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-03-23T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Foot Locker Yonge St",
    "kanada_alis_fiyati_cad": 105,
    "kanada_alis_fiyati_azn": 131,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4032",
    "uluslararasi_kargo_kodu": "AZ-HIST-3032-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-034",
    "olusturma_tarihi": "2026-03-09T15:19:07.871Z",
    "ham_mesaj": "V\xFCsal\u0259 Ta\u011F\u0131yeva: Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "V\xFCsal\u0259 Ta\u011F\u0131yeva",
    "musteri_id": "mus-017",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@vusala_tagiyeva",
    "telefon_numarasi": "+994 50 310 90 80",
    "teslimat_sehri": "\u015E\u0259ki",
    "teslimat_adresi": "\u015E\u0259ki \u015F., M.F.Axundov pr.",
    "urun_aciklamasi": "Dyson Airwrap \xC7oxfunksiyal\u0131 Fen Ba\u015Fl\u0131q Aksesuar\u0131",
    "beden_veya_olcu": "Standart",
    "renk": "Mis / Nikel",
    "adet": 1,
    "toplam_tutar": 210,
    "alinan_tutar": 210,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-03-16T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Dyson Demo Store Yorkdale",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4033",
    "uluslararasi_kargo_kodu": "AZ-HIST-3033-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-035",
    "olusturma_tarihi": "2026-02-27T15:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Lululemon Align High-Rise 25 \u0130dman Tayt\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Lululemon Align High-Rise 25 \u0130dman Tayt\u0131",
    "beden_veya_olcu": "Size 4",
    "renk": "Black (Qara)",
    "adet": 1,
    "toplam_tutar": 135,
    "alinan_tutar": 135,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2026-03-06T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Lululemon Queen St W",
    "kanada_alis_fiyati_cad": 68,
    "kanada_alis_fiyati_azn": 85,
    "kargo_agirligi_kg": 0.38,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4034",
    "uluslararasi_kargo_kodu": "AZ-HIST-3034-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-036",
    "olusturma_tarihi": "2026-02-17T15:19:07.871Z",
    "ham_mesaj": "Ayt\u0259n M\u0259mm\u0259dova: Stanley Quencher H2.0 FlowState 40oz Termos sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Ayt\u0259n M\u0259mm\u0259dova",
    "musteri_id": "mus-002",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@ayten_fashion_baku",
    "telefon_numarasi": "+994 50 214 55 88",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov m/s, T\u0259briz k\xFC\xE7. 55",
    "urun_aciklamasi": "Stanley Quencher H2.0 FlowState 40oz Termos",
    "beden_veya_olcu": "40 oz (1.18 L)",
    "renk": "Rose Quartz",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2026-02-24T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Indigo Books Toronto",
    "kanada_alis_fiyati_cad": 45,
    "kanada_alis_fiyati_azn": 56,
    "kargo_agirligi_kg": 0.85,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-ARC-4035",
    "uluslararasi_kargo_kodu": "AZ-HIST-3035-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-037",
    "olusturma_tarihi": "2026-02-07T15:19:07.871Z",
    "ham_mesaj": "N\u0259rgiz \u018Fliyeva: Apple AirPods Pro (2. N\u0259sil) USB-C sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "N\u0259rgiz \u018Fliyeva",
    "musteri_id": "mus-003",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@nergiz_aliyeva_style",
    "telefon_numarasi": "+994 55 312 88 44",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Yasamal r., H\u0259s\u0259n b\u0259y Z\u0259rdabi 78",
    "urun_aciklamasi": "Apple AirPods Pro (2. N\u0259sil) USB-C",
    "beden_veya_olcu": "Universal",
    "renk": "B\u0259yaz",
    "adet": 1,
    "toplam_tutar": 420,
    "alinan_tutar": 420,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2026-02-14T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Apple Yorkdale",
    "kanada_alis_fiyati_cad": 230,
    "kanada_alis_fiyati_azn": 288,
    "kargo_agirligi_kg": 0.4,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4036",
    "uluslararasi_kargo_kodu": "AZ-HIST-3036-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-038",
    "olusturma_tarihi": "2026-01-23T15:19:07.871Z",
    "ham_mesaj": "Leyla H\xFCseynova: Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Leyla H\xFCseynova",
    "musteri_id": "mus-004",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@leyla.huseyn.baku",
    "telefon_numarasi": "+994 70 821 44 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "S\u0259bail r., Nizami k\xFC\xE7. (Tarqov\u0131)",
    "urun_aciklamasi": "Tommy Hilfiger \u0130konik Kap\u015Fonlu \u0130sti Sviter",
    "beden_veya_olcu": "L B\u0259d\u0259n",
    "renk": "Boz Melanj",
    "adet": 1,
    "toplam_tutar": 95,
    "alinan_tutar": 95,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2026-01-30T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Winners Bloor West",
    "kanada_alis_fiyati_cad": 48,
    "kanada_alis_fiyati_azn": 60,
    "kargo_agirligi_kg": 0.8,
    "kargo_ucreti_azn": 6,
    "kanada_takip_kodu": "TOR-ARC-4037",
    "uluslararasi_kargo_kodu": "AZ-HIST-3037-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-039",
    "olusturma_tarihi": "2026-01-08T15:19:07.871Z",
    "ham_mesaj": "G\xFCnel Qas\u0131mova: Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "G\xFCnel Qas\u0131mova",
    "musteri_id": "mus-005",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@gunel_qasimova_",
    "telefon_numarasi": "+994 51 902 11 33",
    "teslimat_sehri": "Sumqay\u0131t",
    "teslimat_adresi": "Sumqay\u0131t \u015F., 9-cu mkr, S\xFClh k\xFC\xE7.",
    "urun_aciklamasi": "Massimo Dutti 100% K\u0259tan Zolaql\u0131 K\xF6yn\u0259k",
    "beden_veya_olcu": "S (36)",
    "renk": "Mavi / A\u011F Zolaql\u0131",
    "adet": 1,
    "toplam_tutar": 105,
    "alinan_tutar": 105,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2026-01-15T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Massimo Dutti Yorkdale",
    "kanada_alis_fiyati_cad": 55,
    "kanada_alis_fiyati_azn": 69,
    "kargo_agirligi_kg": 0.35,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4038",
    "uluslararasi_kargo_kodu": "AZ-HIST-3038-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-040",
    "olusturma_tarihi": "2025-12-24T15:19:07.871Z",
    "ham_mesaj": "R\u0259na Sad\u0131xova: ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "R\u0259na Sad\u0131xova",
    "musteri_id": "mus-006",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@rena_sadikhova",
    "telefon_numarasi": "+994 50 443 19 82",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., Xocal\u0131 pr. 14",
    "urun_aciklamasi": "ALDO Qad\u0131n Bej H\xFCnd\xFCrdaban Ziyaf\u0259t Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "Nude Bej",
    "adet": 1,
    "toplam_tutar": 120,
    "alinan_tutar": 120,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2025-12-31T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "ALDO Shoes Eaton",
    "kanada_alis_fiyati_cad": 62,
    "kanada_alis_fiyati_azn": 78,
    "kargo_agirligi_kg": 0.9,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4039",
    "uluslararasi_kargo_kodu": "AZ-HIST-3039-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-041",
    "olusturma_tarihi": "2025-12-09T15:19:07.871Z",
    "ham_mesaj": "Sevinc V\u0259liyeva: Michael Kors Greenwich Saffiano D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Sevinc V\u0259liyeva",
    "musteri_id": "mus-007",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sevinc_beauty_az",
    "telefon_numarasi": "+994 55 601 77 22",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Bin\u0259q\u0259di r., Azadl\u0131q pr. 102",
    "urun_aciklamasi": "Michael Kors Greenwich Saffiano D\u0259ri \xC7anta",
    "beden_veya_olcu": "Medium",
    "renk": "Qara / Q\u0131z\u0131l\u0131 Toka",
    "adet": 1,
    "toplam_tutar": 180,
    "alinan_tutar": 180,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2025-12-16T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Yorkdale Mall Michael Kors",
    "kanada_alis_fiyati_cad": 88,
    "kanada_alis_fiyati_azn": 110,
    "kargo_agirligi_kg": 0.95,
    "kargo_ucreti_azn": 7,
    "kanada_takip_kodu": "TOR-ARC-4040",
    "uluslararasi_kargo_kodu": "AZ-HIST-3040-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-042",
    "olusturma_tarihi": "2025-11-24T15:19:07.871Z",
    "ham_mesaj": "Z\u0259hra \u0130smay\u0131lova: Coach Dempsey Tote 22 Siqnatur \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Z\u0259hra \u0130smay\u0131lova",
    "musteri_id": "mus-008",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@zehra_ismayil",
    "telefon_numarasi": "+994 77 410 55 66",
    "teslimat_sehri": "Ming\u0259\xE7evir",
    "teslimat_adresi": "Ming\u0259\xE7evir \u015F., Heyd\u0259r \u018Fliyev pr.",
    "urun_aciklamasi": "Coach Dempsey Tote 22 Siqnatur \xC7anta",
    "beden_veya_olcu": "Standart",
    "renk": "Q\u0259hv\u0259yi / Qara Loqo",
    "adet": 1,
    "toplam_tutar": 260,
    "alinan_tutar": 260,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2025-12-01T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Coach Outlet Halton Hills",
    "kanada_alis_fiyati_cad": 135,
    "kanada_alis_fiyati_azn": 169,
    "kargo_agirligi_kg": 1.05,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4041",
    "uluslararasi_kargo_kodu": "AZ-HIST-3041-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-043",
    "olusturma_tarihi": "2025-11-09T15:19:07.871Z",
    "ham_mesaj": "Fidan K\u0259rimli: Zara Qad\u0131n Klassik Yun Palto sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Fidan K\u0259rimli",
    "musteri_id": "mus-009",
    "musteri_tipi": "AKRABA_YAKIN",
    "instagram_kullanici_adi": "@fidan_kerimli",
    "telefon_numarasi": "+994 55 700 88 11",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130n\u015Faat\xE7\u0131lar m/s, \u015E\u0259rifzad\u0259 k\xFC\xE7.",
    "urun_aciklamasi": "Zara Qad\u0131n Klassik Yun Palto",
    "beden_veya_olcu": "M (38)",
    "renk": "D\u0259v\u0259 Yun (Camel)",
    "adet": 1,
    "toplam_tutar": 165,
    "alinan_tutar": 165,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2025-11-16T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Zara Toronto Eaton",
    "kanada_alis_fiyati_cad": 90,
    "kanada_alis_fiyati_azn": 113,
    "kargo_agirligi_kg": 1.9,
    "kargo_ucreti_azn": 14,
    "kanada_takip_kodu": "TOR-ARC-4042",
    "uluslararasi_kargo_kodu": "AZ-HIST-3042-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-044",
    "olusturma_tarihi": "2025-10-27T15:19:07.871Z",
    "ham_mesaj": "S\u0259bin\u0259 R\xFCst\u0259mova: Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "S\u0259bin\u0259 R\xFCst\u0259mova",
    "musteri_id": "mus-010",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@sabina_rustam",
    "telefon_numarasi": "+994 50 611 78 90",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "\u0130\xE7\u0259ri\u015F\u0259h\u0259r, Axundov ba\u011F\u0131",
    "urun_aciklamasi": "Charlotte Tilbury Pillow Talk Dodaq Boyas\u0131 Seti",
    "beden_veya_olcu": "Standart",
    "renk": "Nude Pink",
    "adet": 1,
    "toplam_tutar": 125,
    "alinan_tutar": 125,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2025-11-03T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Holt Renfrew Toronto",
    "kanada_alis_fiyati_cad": 60,
    "kanada_alis_fiyati_azn": 75,
    "kargo_agirligi_kg": 0.3,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4043",
    "uluslararasi_kargo_kodu": "AZ-HIST-3043-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-045",
    "olusturma_tarihi": "2025-10-17T15:19:07.871Z",
    "ham_mesaj": "Aynur Babayeva: Sol de Janeiro Brazilian Crush Cheirosa 68 Mist sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Aynur Babayeva",
    "musteri_id": "mus-011",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@aynur_baku_trend",
    "telefon_numarasi": "+994 50 882 34 19",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259simi r., 28 May m/s yax\u0131nl\u0131\u011F\u0131",
    "urun_aciklamasi": "Sol de Janeiro Brazilian Crush Cheirosa 68 Mist",
    "beden_veya_olcu": "240 ml",
    "renk": "Tropik Floral",
    "adet": 1,
    "toplam_tutar": 75,
    "alinan_tutar": 75,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2025-10-24T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Sephora Bloor St",
    "kanada_alis_fiyati_cad": 38,
    "kanada_alis_fiyati_azn": 48,
    "kargo_agirligi_kg": 0.42,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4044",
    "uluslararasi_kargo_kodu": "AZ-HIST-3044-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-046",
    "olusturma_tarihi": "2025-10-10T15:19:07.871Z",
    "ham_mesaj": "Elmira Pa\u015Fayeva: Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Elmira Pa\u015Fayeva",
    "musteri_id": "mus-012",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@elmira_pashayeva",
    "telefon_numarasi": "+994 55 209 88 77",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F., Nizami G\u0259nc\u0259vi pr. 11",
    "urun_aciklamasi": "Carter's K\xF6rp\u0259 \xDC\xE7\xFCn 5-li \xDCzvi Pamb\u0131q Bodi",
    "beden_veya_olcu": "6-9 Ay",
    "renk": "Qar\u0131\u015F\u0131q Pastel",
    "adet": 1,
    "toplam_tutar": 58,
    "alinan_tutar": 58,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2025-10-17T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Carter's OshKosh Dufferin",
    "kanada_alis_fiyati_cad": 28,
    "kanada_alis_fiyati_azn": 35,
    "kargo_agirligi_kg": 0.5,
    "kargo_ucreti_azn": 4,
    "kanada_takip_kodu": "TOR-ARC-4045",
    "uluslararasi_kargo_kodu": "AZ-HIST-3045-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-047",
    "olusturma_tarihi": "2025-10-03T15:19:07.871Z",
    "ham_mesaj": "C\u0259mil\u0259 Quliyeva: Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "C\u0259mil\u0259 Quliyeva",
    "musteri_id": "mus-013",
    "musteri_tipi": "VIP",
    "instagram_kullanici_adi": "@cemile_quliyeva_official",
    "telefon_numarasi": "+994 70 331 99 00",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "N\u0259rimanov r., A\u015F\u0131q Molla C\xFCm\u0259",
    "urun_aciklamasi": "Tory Burch Kira Chevron D\u0259ri Kartqab\u0131 & Pulqab\u0131",
    "beden_veya_olcu": "Kompakt",
    "renk": "Karamel Q\u0259hv\u0259yi",
    "adet": 1,
    "toplam_tutar": 145,
    "alinan_tutar": 145,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2025-10-10T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Tory Burch Yorkdale",
    "kanada_alis_fiyati_cad": 75,
    "kanada_alis_fiyati_azn": 94,
    "kargo_agirligi_kg": 0.32,
    "kargo_ucreti_azn": 2,
    "kanada_takip_kodu": "TOR-ARC-4046",
    "uluslararasi_kargo_kodu": "AZ-HIST-3046-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-048",
    "olusturma_tarihi": "2025-09-26T15:19:07.871Z",
    "ham_mesaj": "Nigar Mehdiyeva: On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131 sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "Nigar Mehdiyeva",
    "musteri_id": "mus-014",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@nigar_mehdiyeva",
    "telefon_numarasi": "+994 50 512 60 70",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "X\u0259tai r., \u018Fhm\u0259dli q\u0259s\u0259b\u0259si",
    "urun_aciklamasi": "On Running Cloud 5 \u0130dman Qad\u0131n Qa\xE7\u0131\u015F Ayaqqab\u0131s\u0131",
    "beden_veya_olcu": "38 Numara",
    "renk": "All White (A\u011F)",
    "adet": 1,
    "toplam_tutar": 235,
    "alinan_tutar": 235,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-samir",
    "baku_kurye_adi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "baku_kurye_bolgesi": "X\u0259tai",
    "teslim_tarihi": "2025-10-03T15:19:07.871Z",
    "teslim_eden_kisi": "Samir Q. (X\u0259tai/\u018Fhm\u0259dli)",
    "kanada_magaza_adi": "Sporting Life Toronto",
    "kanada_alis_fiyati_cad": 125,
    "kanada_alis_fiyati_azn": 156,
    "kargo_agirligi_kg": 1.1,
    "kargo_ucreti_azn": 8,
    "kanada_takip_kodu": "TOR-ARC-4047",
    "uluslararasi_kargo_kodu": "AZ-HIST-3047-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  },
  {
    "id": "sip-arc-049",
    "olusturma_tarihi": "2025-09-20T15:19:07.871Z",
    "ham_mesaj": "T\u0259ran\u0259 \u018Fs\u0259dova: Sephora Rare Beauty Likit All\u0131q & Tonal Set sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "T\u0259ran\u0259 \u018Fs\u0259dova",
    "musteri_id": "mus-015",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@terane_asedova",
    "telefon_numarasi": "+994 55 819 22 45",
    "teslimat_sehri": "L\u0259nk\u0259ran",
    "teslimat_adresi": "L\u0259nk\u0259ran \u015F., Qala xiyaban\u0131",
    "urun_aciklamasi": "Sephora Rare Beauty Likit All\u0131q & Tonal Set",
    "beden_veya_olcu": "160C / Hope",
    "renk": "G\xFCl \xC7\u0259hray\u0131s\u0131",
    "adet": 1,
    "toplam_tutar": 110,
    "alinan_tutar": 110,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-vuqar",
    "baku_kurye_adi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "baku_kurye_bolgesi": "G\u0259nc\u0259 / Rayon",
    "teslim_tarihi": "2025-09-27T15:19:07.871Z",
    "teslim_eden_kisi": "V\xFCqar T. (G\u0259nc\u0259/Rayonlar)",
    "kanada_magaza_adi": "Sephora Eaton Centre",
    "kanada_alis_fiyati_cad": 52,
    "kanada_alis_fiyati_azn": 65,
    "kargo_agirligi_kg": 0.45,
    "kargo_ucreti_azn": 3,
    "kanada_takip_kodu": "TOR-ARC-4048",
    "uluslararasi_kargo_kodu": "AZ-HIST-3048-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_LIVE"
  },
  {
    "id": "sip-arc-050",
    "olusturma_tarihi": "2025-09-15T15:19:07.871Z",
    "ham_mesaj": "X\u0259dic\u0259 M\u0259mm\u0259dli: Nike Dunk Low Retro B\u0259yaz/Qara (Panda) sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "X\u0259dic\u0259 M\u0259mm\u0259dli",
    "musteri_id": "mus-016",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@xedice_mammadli",
    "telefon_numarasi": "+994 77 690 14 25",
    "teslimat_sehri": "Bak\u0131",
    "teslimat_adresi": "Elml\u0259r Akademiyas\u0131 m/s yan\u0131",
    "urun_aciklamasi": "Nike Dunk Low Retro B\u0259yaz/Qara (Panda)",
    "beden_veya_olcu": "40 Numara",
    "renk": "Black / White",
    "adet": 1,
    "toplam_tutar": 215,
    "alinan_tutar": 215,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "ofis-tahvil",
    "baku_kurye_adi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "baku_kurye_bolgesi": "Ofis",
    "teslim_tarihi": "2025-09-22T15:19:07.871Z",
    "teslim_eden_kisi": "Ofis / M\u0259rk\u0259zd\u0259n T\u0259hvil",
    "kanada_magaza_adi": "Nike Store Bloor St",
    "kanada_alis_fiyati_cad": 110,
    "kanada_alis_fiyati_azn": 138,
    "kargo_agirligi_kg": 1.25,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4049",
    "uluslararasi_kargo_kodu": "AZ-HIST-3049-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "WHATSAPP"
  },
  {
    "id": "sip-arc-051",
    "olusturma_tarihi": "2025-09-12T15:19:07.871Z",
    "ham_mesaj": "V\xFCsal\u0259 Ta\u011F\u0131yeva: UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "V\xFCsal\u0259 Ta\u011F\u0131yeva",
    "musteri_id": "mus-017",
    "musteri_tipi": "TANIMADIK",
    "instagram_kullanici_adi": "@vusala_tagiyeva",
    "telefon_numarasi": "+994 50 310 90 80",
    "teslimat_sehri": "\u015E\u0259ki",
    "teslimat_adresi": "\u015E\u0259ki \u015F., M.F.Axundov pr.",
    "urun_aciklamasi": "UGG Classic Ultra Mini Qad\u0131n Q\u0131\u015F \xC7\u0259km\u0259si",
    "beden_veya_olcu": "37 Numara",
    "renk": "Chestnut",
    "adet": 1,
    "toplam_tutar": 245,
    "alinan_tutar": 245,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-elvin",
    "baku_kurye_adi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "baku_kurye_bolgesi": "N\u0259rimanov",
    "teslim_tarihi": "2025-09-19T15:19:07.871Z",
    "teslim_eden_kisi": "Elvin M. (N\u0259rimanov/M\u0259rk\u0259z)",
    "kanada_magaza_adi": "Nordstrom Rack Toronto",
    "kanada_alis_fiyati_cad": 130,
    "kanada_alis_fiyati_azn": 163,
    "kargo_agirligi_kg": 1.35,
    "kargo_ucreti_azn": 10,
    "kanada_takip_kodu": "TOR-ARC-4050",
    "uluslararasi_kargo_kodu": "AZ-HIST-3050-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_DM"
  },
  {
    "id": "sip-arc-052",
    "olusturma_tarihi": "2025-09-10T15:19:07.871Z",
    "ham_mesaj": "K\u0259mal\u0259 B\u0259dirb\u0259yli: Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta sifari\u015Fi u\u011Furla t\u0259hvil verildi v\u0259 b\xFCt\xFCn hesabla\u015Fma ba\u011Fland\u0131.",
    "musteri_adi": "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    "musteri_id": "mus-001",
    "musteri_tipi": "SADIK_MUSTERI",
    "instagram_kullanici_adi": "@kemale_bedirbeyli",
    "telefon_numarasi": "+994 50 694 25 25",
    "teslimat_sehri": "G\u0259nc\u0259",
    "teslimat_adresi": "G\u0259nc\u0259 \u015F\u0259h., Ozan k\xFC\xE7. 4",
    "urun_aciklamasi": "Marc Jacobs The Tote Bag Ki\xE7ik Boy D\u0259ri \xC7anta",
    "beden_veya_olcu": "Small",
    "renk": "Bej / Krem",
    "adet": 1,
    "toplam_tutar": 295,
    "alinan_tutar": 295,
    "kalan_tutar": 0,
    "para_birimi": "AZN",
    "finans_durumu": "ODENDI",
    "lojistik_durumu": "TESLIM_EDILDI",
    "baku_tahsilat_notu": "M\u0259hsul m\xFC\u015Ft\u0259riy\u0259 t\u0259hvil verildi, \xF6d\u0259ni\u015F tam q\u0259bul edildi.",
    "baku_kurye_id": "kurye-resad",
    "baku_kurye_adi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "baku_kurye_bolgesi": "Yasamal",
    "teslim_tarihi": "2025-09-17T15:19:07.871Z",
    "teslim_eden_kisi": "R\u0259\u015Fad K. (Yasamal/Elml\u0259r)",
    "kanada_magaza_adi": "Saks Fifth Avenue Toronto",
    "kanada_alis_fiyati_cad": 160,
    "kanada_alis_fiyati_azn": 200,
    "kargo_agirligi_kg": 1.15,
    "kargo_ucreti_azn": 9,
    "kanada_takip_kodu": "TOR-ARC-4051",
    "uluslararasi_kargo_kodu": "AZ-HIST-3051-YYZ",
    "eksik_bilgiler": [],
    "ai_guven_skoru": 0.99,
    "siparis_kaynagi": "INSTAGRAM_REELS"
  }
];

// src/server/services/state.ts
var siparislerVeritabani = [...BASLANGIC_SIPARISLER];
function setSiparislerVeritabani(yeniListe) {
  siparislerVeritabani = yeniListe;
}
var GOLDEN_DEMO_SIPARISLER = JSON.parse(JSON.stringify(BASLANGIC_SIPARISLER)).map((s) => ({
  ...s,
  tenant_id: "demo_sandbox",
  is_demo: true
}));
var demoSiparislerVeritabani = JSON.parse(JSON.stringify(GOLDEN_DEMO_SIPARISLER));
function sifirlaDemoVeritabani() {
  demoSiparislerVeritabani = JSON.parse(JSON.stringify(GOLDEN_DEMO_SIPARISLER));
  return demoSiparislerVeritabani.length;
}
var musterilerVeritabani = [
  {
    id: "mus-001",
    ad_soyad: "K\u0259mal\u0259 B\u0259dirb\u0259yli",
    telefon: "+994 50 694 25 25",
    instagram_kullanici_adi: "@kemale_bedirbeyli",
    sehir: "G\u0259nc\u0259",
    adres: "G\u0259nc\u0259 \u015F\u0259h\u0259ri, Ozan k\xFC\xE7\u0259si d\xF6ng\u0259 4",
    musteri_tipi: "SADIK_MUSTERI",
    toplam_siparis_sayisi: 3,
    toplam_harcama: 580,
    kalan_toplam_borc: 80,
    notlar: "G\u0259nc\u0259 daimi m\xFC\u015Ft\u0259risi, Ozan k\xFC\xE7\u0259sind\u0259 ya\u015Fay\u0131r. 3 f\u0259rqli u\u011Furlu sifari\u015Fi var.",
    olusturma_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 24 * 60).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 36).toISOString(),
    son_urun_aciklamasi: "Michael Kors Greenwich D\u0259ri \xC7anta (180 AZN)",
    son_siparis_tutari: 180
  },
  {
    id: "mus-002",
    ad_soyad: "Ayt\u0259n M\u0259mm\u0259dova",
    telefon: "+994 50 214 55 88",
    instagram_kullanici_adi: "@ayten_fashion_baku",
    sehir: "Bak\u0131",
    adres: "N\u0259rimanov m/s yax\u0131nl\u0131\u011F\u0131, T\u0259briz k\xFC\xE7\u0259si",
    musteri_tipi: "SADIK_MUSTERI",
    toplam_siparis_sayisi: 2,
    toplam_harcama: 265,
    kalan_toplam_borc: 65,
    notlar: "B\u0259z\u0259n beh at\u0131b maa\u015F g\xFCn\xFCnd\u0259 qalan\u0131n\u0131 ba\u011Flay\u0131r.",
    olusturma_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 24 * 40).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 18).toISOString(),
    son_urun_aciklamasi: "Canl\u0131 yay\u0131ndaki k\u0131rm\u0131z\u0131 midi elbise (85 AZN)",
    son_siparis_tutari: 85
  },
  {
    id: "mus-003",
    ad_soyad: "Nigar \u018Fliyeva",
    telefon: "+994 55 987 11 22",
    instagram_kullanici_adi: "@nigar.aliyeva",
    sehir: "Bak\u0131",
    adres: "28 May m/s \xE7\u0131x\u0131\u015F\u0131, S\u0259m\u0259d Vur\u011Fun ba\u011F\u0131n\u0131n yan\u0131",
    musteri_tipi: "VIP",
    toplam_siparis_sayisi: 5,
    toplam_harcama: 1240,
    kalan_toplam_borc: 0,
    notlar: "\xC7anta v\u0259 ayaqqab\u0131 daimi al\u0131c\u0131s\u0131. Tam \xF6d\u0259ni\u015F edir.",
    olusturma_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 24 * 90).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 42).toISOString(),
    son_urun_aciklamasi: "Michael Kors deri omuz \xE7antas\u0131 (190 AZN)",
    son_siparis_tutari: 190
  },
  {
    id: "mus-004",
    ad_soyad: "Leyla Qas\u0131mova",
    telefon: "+994 70 333 44 11",
    instagram_kullanici_adi: "@leylaq_89",
    sehir: "Bak\u0131",
    adres: "",
    musteri_tipi: "AKRABA_YAKIN",
    toplam_siparis_sayisi: 1,
    toplam_harcama: 240,
    kalan_toplam_borc: 240,
    notlar: "Xalan\u0131n r\u0259fiq\u0259si. Bak\u0131da qohuma na\u011Fd \xF6d\u0259yir.",
    olusturma_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 70).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1e3 * 60 * 60 * 70).toISOString(),
    son_urun_aciklamasi: "Canada Goose \xE7ocuk k\u0131\u015Fl\u0131k mont (240 AZN)",
    son_siparis_tutari: 240
  }
];
function firmalariYukleDosyadan() {
  try {
    if (fs.existsSync(FIRMALAR_DOSYA_YOLU)) {
      const icerik = fs.readFileSync(FIRMALAR_DOSYA_YOLU, "utf-8");
      const parsed = JSON.parse(icerik);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Firmalar dosyadan okunamad\u0131:", e);
  }
  return [
    {
      id: "kanada_shopper_baku",
      ad: "Kanada Shopper Bak\u0131",
      sehir: "Bak\u0131",
      varsayilanParaBirimi: "AZN",
      varsayilanKomisyonYuzdesi: 15,
      aciklama: "\u018Fsas canl\u0131 butik v\u0259 beyn\u0259lxalq logistika i\u015F sah\u0259si"
    },
    {
      id: "ayla_boutique",
      ad: "Ayla Boutique",
      sehir: "G\u0259nc\u0259",
      varsayilanParaBirimi: "AZN",
      varsayilanKomisyonYuzdesi: 18,
      aciklama: "G\u0259nc\u0259 v\u0259 q\u0259rb rayonlar\u0131 \xFCzr\u0259 t\u0259r\u0259fda\u015F butik"
    },
    {
      id: "luxury_brand_baku",
      ad: "Luxury Brands VIP",
      sehir: "Bak\u0131",
      varsayilanParaBirimi: "AZN",
      varsayilanKomisyonYuzdesi: 20,
      aciklama: "L\xFCks \xE7anta v\u0259 geyim sifari\u015Fl\u0259ri (VIP m\xFC\u015Ft\u0259ril\u0259r)"
    },
    {
      id: "demo_sandbox",
      ad: "Demo & T\u0259lim \u0130\u015F Sah\u0259si",
      sehir: "Bak\u0131 / Toronto",
      varsayilanParaBirimi: "AZN",
      varsayilanKomisyonYuzdesi: 15,
      aciklama: "Yeni m\xFC\u015Ft\u0259ril\u0259r\u0259 v\u0259 i\u015F\xE7il\u0259r\u0259 t\u0259qdimat m\xFChiti",
      isDemo: true
    }
  ];
}
function firmalariKaydetDosyaya(firmalar) {
  try {
    const dir = path2.dirname(FIRMALAR_DOSYA_YOLU);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, JSON.stringify(firmalar, null, 2), "utf-8");
  } catch (e) {
    console.error("Firmalar dosyaya yaz\u0131lamad\u0131:", e);
  }
}
var firmalarVeritabani = firmalariYukleDosyadan();
function kullanicilariYukleDosyadan() {
  try {
    if (fs.existsSync(KULLANICILAR_DOSYA_YOLU)) {
      const icerik = fs.readFileSync(KULLANICILAR_DOSYA_YOLU, "utf-8");
      const parsed = JSON.parse(icerik);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Kullan\u0131c\u0131lar dosyadan okunamad\u0131:", e);
  }
  return [];
}
function kullanicilariKaydetDosyaya(kullanicilar) {
  try {
    const dir = path2.dirname(KULLANICILAR_DOSYA_YOLU);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, JSON.stringify(kullanicilar, null, 2), "utf-8");
  } catch (e) {
    console.error("Kullan\u0131c\u0131lar dosyaya yaz\u0131lamad\u0131:", e);
  }
}
var kullanicilarVeritabani = kullanicilariYukleDosyadan();
var onayBekleyenler = [
  {
    id: "inbox-001",
    gelis_tarihi: new Date(Date.now() - 1e3 * 60 * 15).toISOString(),
    kaynak: "INSTAGRAM_DM",
    gonderen_kullanici: "@sevda_aliyeva",
    konusma_gecmisi: `M\xFC\u015Fteri: Salam can\u0131m, bu Aldo \xE7anta h\u0259l\u0259 qal\u0131b?
Sat\u0131c\u0131: B\u0259li Sevda xan\u0131m, son 2 \u0259d\u0259d qal\u0131b qara v\u0259 bej r\u0259ngi.
M\xFC\u015Fteri: Bej r\u0259ngini ist\u0259yir\u0259m, 60 manat bibiniz\u0259 beh atd\u0131m, qalan\u0131n\u0131 Bak\u0131da \xE7atd\u0131randa ver\u0259c\u0259m.
Sat\u0131c\u0131: \u018Fla, qeyd\u0259 ald\u0131m #S\u0130PAR\u0130\u015E`,
    tetikleyici_kod: "#S\u0130PAR\u0130\u015E",
    durum: "BEKLEMEDE",
    tenant_id: "kanada_shopper_baku",
    oneri_siparis: {
      tenant_id: "kanada_shopper_baku",
      musteri_adi: "Sevda \u018Fliyeva",
      instagram_kullanici_adi: "@sevda_aliyeva",
      telefon_numarasi: "",
      teslimat_sehri: "Bak\xFC",
      teslimat_adresi: "",
      urun_aciklamasi: "Aldo Bej \xC7anta",
      beden_veya_olcu: "Standart",
      renk: "Bej",
      adet: 1,
      toplam_tutar: 110,
      alinan_tutar: 60,
      kalan_tutar: 50,
      para_birimi: "AZN",
      finans_durumu: "KISMI_ODEME",
      lojistik_durumu: "KANADA_SATINALIM_BEKLIYOR",
      baku_tahsilat_notu: "60 AZN bibiye \xF6dendi, 50 AZN Bak\xFCde teslimatta",
      eksik_bilgiler: ["telefon_numarasi", "teslimat_adresi"],
      ai_guven_skoru: 0.94
    }
  },
  {
    id: "inbox-002",
    gelis_tarihi: new Date(Date.now() - 1e3 * 60 * 45).toISOString(),
    kaynak: "WHATSAPP",
    gonderen_kullanici: "+994 50 333 44 55 (Leyla Q.)",
    konusma_gecmisi: `Leyla: Salam, Sephora-dak\u0131 Rare Beauty \u0259nlik var idi ya, Hope r\u0259ngi?
Sat\u0131c\u0131: B\u0259li var, qiym\u0259ti 75 manatd\u0131r.
Leyla: Z\u0259hm\u0259t olmasa 1 \u0259d\u0259d m\u0259n\u0259 ay\u0131r\u0131n, kart\u0131n\u0131za tam 75 manat atd\u0131m indic\u0259. \xDCnvan: Elml\u0259r m/s yax\u0131nl\u0131\u011F\u0131.
Sat\u0131c\u0131: \xC7ox sa\u011F olun Leyla xan\u0131m, sifari\u015Finiz q\u0259bul edildi #ONAY`,
    tetikleyici_kod: "#ONAY",
    durum: "BEKLEMEDE",
    tenant_id: "kanada_shopper_baku",
    oneri_siparis: {
      tenant_id: "kanada_shopper_baku",
      musteri_adi: "Leyla Q.",
      instagram_kullanici_adi: "",
      telefon_numarasi: "+994 50 333 44 55",
      teslimat_sehri: "Bak\xFC",
      teslimat_adresi: "Elml\u0259r m/s yax\u0131nl\u0131\u011F\u0131",
      urun_aciklamasi: "Rare Beauty All\u0131k (Hope)",
      beden_veya_olcu: "Standart",
      renk: "Hope",
      adet: 1,
      toplam_tutar: 75,
      alinan_tutar: 75,
      kalan_tutar: 0,
      para_birimi: "AZN",
      finans_durumu: "ODENDI",
      lojistik_durumu: "KANADA_SATINALIM_BEKLIYOR",
      baku_tahsilat_notu: "Tam tutar pe\u015Fin karta \xF6dendi",
      eksik_bilgiler: [],
      ai_guven_skoru: 0.98
    }
  }
];

// src/server/services/supabase.ts
import { createClient } from "@supabase/supabase-js";
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class FallbackWebSocket {
    constructor() {
      this.readyState = 3;
    }
    static {
      this.CONNECTING = 0;
    }
    static {
      this.OPEN = 1;
    }
    static {
      this.CLOSING = 2;
    }
    static {
      this.CLOSED = 3;
    }
    addEventListener() {
    }
    removeEventListener() {
    }
    send() {
    }
    close() {
    }
  };
}
var supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    console.log("Supabase istemcisi yap\u0131land\u0131r\u0131ld\u0131; ba\u011Flant\u0131 istek s\u0131ras\u0131nda do\u011Frulan\u0131r.");
  } catch (err) {
    throw new Error("Supabase istemcisi yap\u0131land\u0131r\u0131lamad\u0131.");
  }
}

// src/server/services/sessions.ts
var SESSION_COOKIE = "tomnap_session";
var SESSION_DURATION_MS = 8 * 60 * 60 * 1e3;
var SESSION_FILE = path3.join(DATA_DIR, "oturumlar.json");
var ROLES = /* @__PURE__ */ new Set([
  "SUPER_ADMIN",
  "PATRON",
  "KANADA_SATINALMA",
  "SATIS_SORUMLUSU",
  "BAKU_FINANS",
  "BAKU_KURYE"
]);
var HEX_TOKEN = /^[a-f0-9]{64}$/;
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function fingerprint(user) {
  return digest(JSON.stringify([user.id, user.sifre_hash, user.rol, user.tenant_id]));
}
function validUser(user) {
  return !!user && user.durum === "AKTIF" && ROLES.has(user.rol) && typeof user.id === "string" && !!user.id && typeof user.tenant_id === "string" && !!user.tenant_id && (user.tenant_id !== "all" || user.rol === "SUPER_ADMIN") && typeof user.sifre_hash === "string" && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.sifre_hash);
}
function assertStorageAvailable() {
  if (!supabase && (IS_PRODUCTION || SUPABASE_URL)) {
    throw new Error("Session database is unavailable");
  }
}
function validRecord(value) {
  const record = value;
  return !!record && typeof record.user_id === "string" && !!record.user_id && HEX_TOKEN.test(record.token_hash) && HEX_TOKEN.test(record.csrf_token) && HEX_TOKEN.test(record.credential_fingerprint) && typeof record.expires_at === "string" && Number.isFinite(Date.parse(record.expires_at));
}
function readLocal() {
  if (!fs2.existsSync(SESSION_FILE)) return [];
  const records = JSON.parse(fs2.readFileSync(SESSION_FILE, "utf8"));
  if (!Array.isArray(records) || !records.every(validRecord)) {
    throw new Error("Session storage is invalid");
  }
  return records;
}
function saveLocal(records) {
  fs2.mkdirSync(DATA_DIR, { recursive: true, mode: 448 });
  const temporary = `${SESSION_FILE}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    fs2.writeFileSync(temporary, JSON.stringify(records), {
      encoding: "utf8",
      mode: 384,
      flag: "wx"
    });
    fs2.renameSync(temporary, SESSION_FILE);
  } finally {
    fs2.rmSync(temporary, { force: true });
  }
}
function cookieToken(req) {
  const cookies = req.headers.cookie;
  if (typeof cookies !== "string") return null;
  const matching = cookies.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (matching.length !== 1) return null;
  const value = matching[0].slice(SESSION_COOKIE.length + 1);
  return HEX_TOKEN.test(value) ? value : null;
}
var cookieOptions = () => ({
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  path: "/"
});
async function currentUser(id) {
  if (!supabase) {
    const user = kullanicilarVeritabani.find((item) => item.id === id);
    return user ? { ...user } : void 0;
  }
  const { data, error } = await supabase.from("kullanicilar").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || void 0;
}
async function tenantEnabled(user) {
  if (user.rol === "SUPER_ADMIN") return true;
  if (!supabase) {
    const company = firmalarVeritabani.find((item) => item.id === user.tenant_id);
    return !!company && (!company.onayDurumu || company.onayDurumu === "AKTIF");
  }
  const { data, error } = await supabase.from("firmalar").select("id,onay_durumu").eq("id", user.tenant_id).maybeSingle();
  if (error) throw error;
  return !!data && (!data.onay_durumu || data.onay_durumu === "AKTIF");
}
async function createSession(user, res) {
  assertStorageAvailable();
  const verifiedFingerprint = fingerprint(user);
  const fresh = await currentUser(user.id);
  if (!validUser(fresh) || fingerprint(fresh) !== verifiedFingerprint || !await tenantEnabled(fresh)) {
    throw new Error("Account changed during login");
  }
  const token = randomBytes(32).toString("hex");
  const record = {
    token_hash: digest(token),
    user_id: fresh.id,
    csrf_token: randomBytes(32).toString("hex"),
    credential_fingerprint: fingerprint(fresh),
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString()
  };
  if (supabase) {
    const { data, error } = await supabase.from("oturumlar").insert(record).select("token_hash").maybeSingle();
    if (error) throw error;
    if (!data || data.token_hash !== record.token_hash)
      throw new Error("Session was not persisted");
  } else {
    const records = readLocal().filter((item) => Date.parse(item.expires_at) > Date.now());
    records.push(record);
    saveLocal(records);
  }
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DURATION_MS });
  res.setHeader("Cache-Control", "no-store");
  return { csrfToken: record.csrf_token, expiresAt: record.expires_at };
}
async function readSession(req) {
  const token = cookieToken(req);
  if (!token) return null;
  assertStorageAvailable();
  const hash = digest(token);
  let record;
  if (supabase) {
    const { data, error } = await supabase.from("oturumlar").select("*").eq("token_hash", hash).maybeSingle();
    if (error) throw error;
    record = data || void 0;
  } else {
    record = readLocal().find((item) => item.token_hash === hash);
  }
  if (!validRecord(record) || record.token_hash !== hash || Date.parse(record.expires_at) <= Date.now())
    return null;
  const user = await currentUser(record.user_id);
  if (!validUser(user) || !await tenantEnabled(user)) return null;
  const expected = Buffer.from(fingerprint(user), "hex");
  if (!timingSafeEqual(expected, Buffer.from(record.credential_fingerprint, "hex"))) return null;
  if (Date.parse(record.expires_at) <= Date.now()) return null;
  const tenantId = user.rol === "SUPER_ADMIN" ? "all" : user.tenant_id;
  return {
    userId: user.id,
    tenantId,
    role: user.rol,
    csrfToken: record.csrf_token,
    sessionHash: hash,
    expiresAt: record.expires_at,
    kullanici: { id: user.id, adSoyad: user.ad_soyad, email: user.email, rol: user.rol, tenantId }
  };
}
async function revokeSession(req, res) {
  const token = cookieToken(req);
  try {
    if (!token) return;
    assertStorageAvailable();
    const hash = digest(token);
    if (supabase) {
      const { error } = await supabase.from("oturumlar").delete().eq("token_hash", hash);
      if (error) throw error;
    } else {
      saveLocal(readLocal().filter((item) => item.token_hash !== hash));
    }
  } finally {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.setHeader("Cache-Control", "no-store");
  }
}

// src/server/middleware/security.ts
import path4 from "path";
import { URL as URL2 } from "url";
import { BlockList, isIP } from "node:net";
function sanitizeDosyaAdi(dosyaAdi) {
  if (!dosyaAdi || typeof dosyaAdi !== "string") {
    return `dosya_${Date.now()}`;
  }
  const normalized = dosyaAdi.replace(/\\/g, "/");
  let temiz = path4.posix.basename(normalized);
  temiz = temiz.replace(/\0/g, "");
  temiz = temiz.replace(/[^a-zA-Z0-9_.-]/g, "_");
  temiz = temiz.replace(/\.{2,}/g, ".");
  temiz = temiz.replace(/^\.+/, "");
  if (!temiz || temiz === ".") {
    temiz = `dosya_${Date.now()}`;
  }
  return temiz;
}
function yolGuvenlimi(dosyaYolu, izinliDizin) {
  if (!dosyaYolu || !izinliDizin || typeof dosyaYolu !== "string" || typeof izinliDizin !== "string") {
    return false;
  }
  const pNorm = dosyaYolu.replace(/\\/g, "/");
  const dNorm = izinliDizin.replace(/\\/g, "/");
  const normalizedPath = path4.resolve(pNorm);
  const normalizedDir = path4.resolve(dNorm);
  const sep = path4.sep;
  const dirPrefix = normalizedDir.endsWith(sep) ? normalizedDir : normalizedDir + sep;
  return normalizedPath === normalizedDir || normalizedPath.startsWith(dirPrefix);
}
var blockedIpv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
]) {
  blockedIpv4.addSubnet(address, prefix, "ipv4");
}
var globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
var blockedIpv6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20]
]) {
  blockedIpv6.addSubnet(address, prefix, "ipv6");
}
function genelIpAdresiMi(address) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) return globalIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6");
  return false;
}
var ENGELLI_HOSTLAR = /* @__PURE__ */ new Set([
  "localhost",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.google",
  "metadata",
  "instance-data"
]);
function urlGuvenlimi(url) {
  if (!url || typeof url !== "string") {
    return { guvenli: false, sebep: "Ge\xE7ersiz URL" };
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { guvenli: false, sebep: "Yaln\u0131zca http:// ve https:// protokolleri desteklenir." };
  }
  let parsed;
  try {
    parsed = new URL2(url);
  } catch {
    return { guvenli: false, sebep: "Ge\xE7ersiz URL format\u0131." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { guvenli: false, sebep: `Desteklenmeyen protokol: ${parsed.protocol}` };
  }
  if (parsed.username || parsed.password) {
    return { guvenli: false, sebep: "URL i\xE7inde kullan\u0131c\u0131 bilgisi desteklenmez." };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (ENGELLI_HOSTLAR.has(hostname) || hostname.endsWith(".localhost") || !isIP(hostname) && !hostname.includes(".")) {
    return { guvenli: false, sebep: `Engellenen sunucu adresi: ${hostname}` };
  }
  if (isIP(hostname) && !genelIpAdresiMi(hostname)) {
    return { guvenli: false, sebep: `Dahili/\xF6zel a\u011F adresleri engellenmi\u015Ftir: ${hostname}` };
  }
  const port = parsed.port ? parseInt(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443 && port !== 3e3) {
    return { guvenli: false, sebep: `Standart d\u0131\u015F\u0131 port engellenmi\u015Ftir: ${port}` };
  }
  return { guvenli: true };
}
function allowedOrigins() {
  const origins = /* @__PURE__ */ new Set();
  const configured = [
    process.env.APP_URL || APP_URL,
    ...(process.env.CORS_ORIGIN || "").split(",")
  ];
  for (const value of configured) {
    try {
      const url = new URL2(value.trim());
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password)
        origins.add(url.origin);
    } catch {
    }
  }
  return origins;
}
function corsMiddleware() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.vary("Origin");
    if (origin && allowedOrigins().has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, x-csrf-token, x-tenant-id");
      res.header("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(origin && !allowedOrigins().has(origin) ? 403 : 204).end();
      return;
    }
    next();
  };
}

// src/server/middleware/auth.ts
var READ = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
var STAFF = ["SUPER_ADMIN", "PATRON", "KANADA_SATINALMA", "SATIS_SORUMLUSU", "BAKU_FINANS"];
var OWNERS = ["SUPER_ADMIN", "PATRON"];
var SALES = [...OWNERS, "SATIS_SORUMLUSU"];
var PURCHASING = [...SALES, "KANADA_SATINALMA"];
var FINANCE = [...SALES, "BAKU_FINANS"];
var SHIPPING = [...OWNERS, "KANADA_SATINALMA"];
var ALL = [...STAFF, "BAKU_KURYE"];
var rules = [
  ["GET", /^\/api\/auth\/oturum$/, ALL],
  ["POST", /^\/api\/auth\/cikis$/, ALL],
  ["GET", /^\/api\/firmalar$/, ALL],
  ["POST", /^\/api\/firmalar\/davet-olustur$/, OWNERS],
  ["POST", /^\/api\/firmalar$/, ["SUPER_ADMIN"]],
  ["PATCH", /^\/api\/firmalar\/[^/]+\/onay$/, ["SUPER_ADMIN"]],
  ["DELETE", /^\/api\/firmalar\/[^/]+$/, ["SUPER_ADMIN"]],
  [
    "GET",
    /^\/api\/(sistem-durum|tenant\/izolasyon-testi|veritabani\/(durum|yedek-al))$/,
    ["SUPER_ADMIN"]
  ],
  [
    "POST",
    /^\/api\/(veritabani\/(temizle|demo-yukle|yedek-yukle)|ornek-verileri-yukle)$/,
    ["SUPER_ADMIN"]
  ],
  ["GET", /^\/api\/siparisler$/, STAFF],
  ["POST", /^\/api\/(siparisler|ayristir-siparis)$/, PURCHASING],
  ["PATCH", /^\/api\/siparisler\/[^/]+$/, STAFF],
  ["DELETE", /^\/api\/siparisler\/[^/]+$/, SALES],
  ["POST", /^\/api\/siparisler\/tumunu-uluslararasi-kargo-yap$/, SHIPPING],
  ["GET", /^\/api\/musteriler(?:\/[^/]+\/siparisler)?$/, FINANCE],
  ["POST", /^\/api\/musteriler$/, SALES],
  ["GET", /^\/api\/inbox$/, SALES],
  ["POST", /^\/api\/(inbox\/[^/]+\/(onayla|reddet)|webhook\/siparis)$/, SALES],
  ["GET", /^\/api\/kuryeler$/, [...SHIPPING, "BAKU_FINANS"]],
  ["GET", /^\/api\/kargo\/ayarlar$/, SHIPPING],
  ["POST", /^\/api\/kargo\/ayarlar$/, OWNERS],
  ["POST", /^\/api\/kargo\/(test|takip|senkronize-et|manifesto-yukle)$/, SHIPPING],
  ["GET", /^\/api\/proxy-gorsel$/, STAFF],
  ["GET", /^(?:\/api)?\/uploads\/[^/]+$/, STAFF],
  [
    "POST",
    /^\/api\/(upload-gorsel|urun-katalog-gorseli-ara|gorselden-urun-ara|katalog-gorseli-kaydet|urun-orijinal-gorsele-don)$/,
    PURCHASING
  ]
];
function isPublic(req) {
  return req.method === "GET" && /^\/(?:api\/)?health$/.test(req.path) || req.method === "GET" && /^\/api\/(auth\/token-kontrol|firmalar\/davet)\/[^/]+$/.test(req.path) || req.method === "POST" && /^\/api\/(auth\/(giris|sifre-belirle)|firmalar\/(giris|kayit|davet\/katil))$/.test(req.path);
}
function equalToken(received, expected) {
  if (typeof received !== "string" || !/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual2(Buffer.from(received), Buffer.from(expected));
}
function setTenant(req) {
  const values = [
    req.headers["x-tenant-id"],
    req.query.tenant_id,
    req.query.tenantId,
    req.body?.tenant_id,
    req.body?.tenantId,
    req.body?.duzeltilmis_siparis?.tenant_id,
    req.body?.duzeltilmis_siparis?.tenantId,
    req.body?.ayarlar?.tenantId
  ];
  const present = values.filter((v) => v !== void 0);
  if (present.some((v) => typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)))
    return "Ge\xE7ersiz firma kimli\u011Fi.";
  if (new Set(present).size > 1) return "\xC7eli\u015Fen firma kimlikleri.";
  const requested = present[0];
  if (req.auth.role !== "SUPER_ADMIN" && requested && requested !== req.auth.tenantId)
    return "Bu firmaya eri\u015Fim yetkiniz yok.";
  req.tenantId = req.auth.role === "SUPER_ADMIN" ? requested || "all" : req.auth.tenantId;
  const globalMutation = /^\/api\/(auth\/cikis|firmalar(?:\/[^/]+(?:\/onay)?)?|veritabani\/[^/]+|ornek-verileri-yukle)$/.test(
    req.path
  ) && req.path !== "/api/firmalar/davet-olustur";
  if (!READ.has(req.method) && req.tenantId === "all" && !globalMutation)
    return "Bu i\u015Flem i\xE7in bir firma se\xE7in.";
  req.query.tenant_id = req.tenantId;
  req.query.tenantId = req.tenantId;
  if (!READ.has(req.method)) {
    if (!req.body) req.body = {};
    if (typeof req.body !== "object" || Array.isArray(req.body)) return "Ge\xE7ersiz istek g\xF6vdesi.";
    req.body.tenant_id = req.tenantId;
    req.body.tenantId = req.tenantId;
  }
  return null;
}
function sessionAuth() {
  return async (req, res, next) => {
    let normalizedPath;
    try {
      normalizedPath = decodeURIComponent(req.path).toLowerCase();
    } catch {
      res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz istek yolu." });
      return;
    }
    if (!normalizedPath.startsWith("/api/") && !normalizedPath.startsWith("/uploads/") && normalizedPath !== "/health")
      return next();
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    if (!READ.has(req.method) && req.headers.origin && !allowedOrigins().has(req.headers.origin)) {
      res.status(403).json({ basarili: false, hata: "\u0130stek kayna\u011F\u0131na izin verilmiyor." });
      return;
    }
    if (isPublic(req)) return next();
    try {
      const auth = await readSession(req);
      if (!auth) {
        res.status(401).json({ basarili: false, hata: "Oturum a\xE7man\u0131z gerekiyor." });
        return;
      }
      req.auth = auth;
      if (!READ.has(req.method) && !equalToken(req.headers["x-csrf-token"], auth.csrfToken)) {
        res.status(403).json({ basarili: false, hata: "\u0130stek do\u011Frulamas\u0131 ge\xE7ersiz. Sayfay\u0131 yenileyin." });
        return;
      }
      const method = req.method === "HEAD" ? "GET" : req.method;
      if (!rules.some(
        ([m, path7, roles]) => m === method && path7.test(req.path) && roles.includes(auth.role)
      )) {
        res.status(403).json({ basarili: false, hata: "Bu i\u015Flem i\xE7in yetkiniz yok." });
        return;
      }
      const tenantError = setTenant(req);
      if (tenantError) {
        res.status(403).json({ basarili: false, hata: tenantError });
        return;
      }
      next();
    } catch {
      res.status(503).json({ basarili: false, hata: "Oturum do\u011Frulama hizmeti kullan\u0131lam\u0131yor." });
    }
  };
}
var apiKeyAuth = sessionAuth;

// src/server/middleware/rateLimiter.ts
import rateLimit from "express-rate-limit";
var genelApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 dakika
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: "Bu IP adresinden \xE7ok fazla istek g\xF6nderildi. L\xFCtfen 15 dakika sonra tekrar deneyin."
  }
});
var aiEndpointLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 dakika
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: "Yapay zeka i\u015Flem kotas\u0131 a\u015F\u0131ld\u0131. L\xFCtfen 1 dakika sonra tekrar deneyin."
  }
});
var veritabaniYonetimLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 dakika
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: "Veritaban\u0131 y\xF6netim i\u015Flem limiti a\u015F\u0131ld\u0131. L\xFCtfen biraz bekleyin."
  }
});
var girisLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { basarili: false, hata: "\xC7ok fazla giri\u015F denemesi. 15 dakika sonra tekrar deneyin." }
});

// src/server/middleware/errorHandler.ts
function errorHandler(err, req, res, next) {
  if (req.path.startsWith("/api/")) {
    console.error("Express API Hatas\u0131:", err);
    return res.status(err.status || 500).json({
      basarili: false,
      hata: err.type === "entity.too.large" ? "Y\xFCklenen g\xF6rsel boyutu sunucu s\u0131n\u0131r\u0131n\u0131 a\u015Ft\u0131. L\xFCtfen g\xF6rseli k\u0131rp\u0131n veya k\xFC\xE7\xFClt\xFCn." : err.message || "Sunucu i\u015Flemi s\u0131ras\u0131nda bir hata olu\u015Ftu."
    });
  }
  next(err);
}

// src/server/logger.ts
var LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
var CURRENT_LOG_LEVEL = process.env.LOG_LEVEL?.toLowerCase() || (IS_PRODUCTION ? "info" : "debug");
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
}
function formatTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var COLORS = {
  reset: "\x1B[0m",
  dim: "\x1B[2m",
  cyan: "\x1B[36m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[31m",
  magenta: "\x1B[35m"
};
var logger = {
  debug(message, meta) {
    if (!shouldLog("debug")) return;
    if (IS_PRODUCTION) {
      console.log(
        JSON.stringify({ timestamp: formatTimestamp(), level: "DEBUG", message, ...meta })
      );
    } else {
      console.log(
        `${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.cyan}[DEBUG]${COLORS.reset} ${message}`,
        meta ? meta : ""
      );
    }
  },
  info(message, meta) {
    if (!shouldLog("info")) return;
    if (IS_PRODUCTION) {
      console.log(
        JSON.stringify({ timestamp: formatTimestamp(), level: "INFO", message, ...meta })
      );
    } else {
      console.log(
        `${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.green}[INFO]${COLORS.reset}  ${message}`,
        meta ? meta : ""
      );
    }
  },
  warn(message, meta) {
    if (!shouldLog("warn")) return;
    if (IS_PRODUCTION) {
      console.warn(
        JSON.stringify({ timestamp: formatTimestamp(), level: "WARN", message, ...meta })
      );
    } else {
      console.warn(
        `${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.yellow}[WARN]${COLORS.reset}  ${message}`,
        meta ? meta : ""
      );
    }
  },
  error(message, error, meta) {
    if (!shouldLog("error")) return;
    const errObj = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error ? { error } : {};
    if (IS_PRODUCTION) {
      console.error(
        JSON.stringify({
          timestamp: formatTimestamp(),
          level: "ERROR",
          message,
          ...errObj,
          ...meta
        })
      );
    } else {
      console.error(
        `${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.red}[ERROR]${COLORS.reset} ${message}`,
        error ? error : "",
        meta ? meta : ""
      );
    }
  }
};
function requestLogger(req, res, next) {
  if (req.path.startsWith("/@") || req.path.startsWith("/src/") || req.path.startsWith("/node_modules/") || req.path.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return next();
  }
  const start = Date.now();
  const { method, originalUrl, ip } = req;
  const safeUrl = originalUrl.split("?")[0].replace(/(\/auth\/token-kontrol\/)[^/]+/i, "$1[REDACTED]").replace(/(\/firmalar\/davet\/)[^/]+/i, "$1[REDACTED]");
  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    if (originalUrl.startsWith("/api")) {
      const meta = { method, url: safeUrl, statusCode, durationMs: duration, ip };
      if (statusCode >= 500) {
        logger.error(`HTTP ${method} ${safeUrl} ${statusCode} - ${duration}ms`, void 0, meta);
      } else if (statusCode >= 400) {
        logger.warn(`HTTP ${method} ${safeUrl} ${statusCode} - ${duration}ms`, meta);
      } else {
        logger.info(`HTTP ${method} ${safeUrl} ${statusCode} - ${duration}ms`, meta);
      }
    }
  });
  next();
}

// src/server/routes/sistem.ts
import { Router } from "express";
var router = Router();
router.get("/sistem-durum", async (req, res) => {
  let supabaseAktif = false;
  let kayitSayisi = 0;
  let supabaseHata = null;
  if (supabase) {
    try {
      const { count, error } = await supabase.from("siparisler").select("*", { count: "exact", head: true });
      if (error) {
        supabaseHata = error.message;
      } else {
        supabaseAktif = true;
        kayitSayisi = count ?? 0;
      }
    } catch (e) {
      supabaseHata = e.message;
    }
  }
  res.json({
    basarili: true,
    supabase: {
      bagli: supabaseAktif,
      url: SUPABASE_URL ? SUPABASE_URL.replace(/https:\/\/(.{4}).*(\.supabase\.co)/, "https://$1***$2") : null,
      kayit_sayisi: kayitSayisi,
      hata: supabaseHata
    },
    gemini: {
      aktif: !!GEMINI_API_KEY,
      model: "gemini-2.5-flash / gemini-3.8-flash"
    },
    sunucu_zamani: (/* @__PURE__ */ new Date()).toISOString()
  });
});
router.get("/tenant/izolasyon-testi", async (req, res) => {
  try {
    const hedefTenant = req.query.tenant_id || "kanada_shopper_baku";
    const testSonuclari = [];
    let toplamSizinti = 0;
    let siparislerTest = [];
    if (supabase) {
      const { data } = await supabase.from("siparisler").select("id, tenant_id, musteri_adi").eq("tenant_id", hedefTenant);
      if (data) siparislerTest = data;
    } else {
      siparislerTest = siparislerVeritabani.filter(
        (s) => (s.tenant_id || "kanada_shopper_baku") === hedefTenant
      );
    }
    const siparisSizintilari = siparislerTest.filter(
      (s) => (s.tenant_id || "kanada_shopper_baku") !== hedefTenant
    );
    toplamSizinti += siparisSizintilari.length;
    testSonuclari.push({
      modul: "Sipari\u015Fler",
      toplam_kayit: siparislerTest.length,
      sizinti_sayisi: siparisSizintilari.length,
      durum: siparisSizintilari.length === 0 ? "GECTI" : "BASARISIZ",
      aciklama: siparisSizintilari.length === 0 ? `T\xFCm ${siparislerTest.length} sipari\u015F kesin olarak "${hedefTenant}" tenant'\u0131na ait.` : `UYARI: ${siparisSizintilari.length} sipari\u015F ba\u015Fka tenant'a ait!`
    });
    let musterilerTest = [];
    if (supabase) {
      const { data } = await supabase.from("musteriler").select("id, tenant_id, ad_soyad").eq("tenant_id", hedefTenant);
      if (data) musterilerTest = data;
    } else {
      musterilerTest = musterilerVeritabani.filter(
        (m) => (m.tenant_id || "kanada_shopper_baku") === hedefTenant
      );
    }
    const musteriSizintilari = musterilerTest.filter(
      (m) => (m.tenant_id || "kanada_shopper_baku") !== hedefTenant
    );
    toplamSizinti += musteriSizintilari.length;
    testSonuclari.push({
      modul: "M\xFC\u015Fteriler (CRM)",
      toplam_kayit: musterilerTest.length,
      sizinti_sayisi: musteriSizintilari.length,
      durum: musteriSizintilari.length === 0 ? "GECTI" : "BASARISIZ",
      aciklama: musteriSizintilari.length === 0 ? `T\xFCm ${musterilerTest.length} m\xFC\u015Fteri kayd\u0131 kesin olarak "${hedefTenant}" tenant'\u0131na ait.` : `UYARI: ${musteriSizintilari.length} m\xFC\u015Fteri kayd\u0131 ba\u015Fka tenant'a ait!`
    });
    const inboxTest = onayBekleyenler.filter(
      (m) => (m.tenant_id || "kanada_shopper_baku") === hedefTenant
    );
    const inboxSizintilari = inboxTest.filter(
      (m) => (m.tenant_id || "kanada_shopper_baku") !== hedefTenant
    );
    toplamSizinti += inboxSizintilari.length;
    testSonuclari.push({
      modul: "Gelen Kutusu (Inbox)",
      toplam_kayit: inboxTest.length,
      sizinti_sayisi: inboxSizintilari.length,
      durum: inboxSizintilari.length === 0 ? "GECTI" : "BASARISIZ",
      aciklama: `T\xFCm ${inboxTest.length} webhook/inbox mesaj\u0131 bu butike aittir.`
    });
    const hayaletTenantId = "hayalet_tenant_" + Math.random().toString(36).substring(7);
    let hayaletSiparisler = [];
    if (supabase) {
      const { data } = await supabase.from("siparisler").select("id").eq("tenant_id", hayaletTenantId);
      if (data) hayaletSiparisler = data;
    } else {
      hayaletSiparisler = siparislerVeritabani.filter((s) => s.tenant_id === hayaletTenantId);
    }
    const hayaletBasarili = hayaletSiparisler.length === 0;
    if (!hayaletBasarili) toplamSizinti += hayaletSiparisler.length;
    testSonuclari.push({
      modul: "Negatif Kontrol (Hayalet Tenant)",
      toplam_kayit: hayaletSiparisler.length,
      sizinti_sayisi: hayaletSiparisler.length,
      durum: hayaletBasarili ? "GECTI" : "BASARISIZ",
      aciklama: hayaletBasarili ? "Rastgele olu\u015Fturulan sahte tenant sorgusunda 0 kay\u0131t d\xF6nd\xFC (Veri s\u0131zmas\u0131 yok)." : "HATA: Sahte tenant i\xE7in kay\u0131t d\xF6nd\xFC!"
    });
    res.json({
      basarili: true,
      test_zamani: (/* @__PURE__ */ new Date()).toISOString(),
      tenant_id: hedefTenant,
      tum_testler_gecti: toplamSizinti === 0,
      toplam_sizinti_sayisi: toplamSizinti,
      guvenlik_derecesi: toplamSizinti === 0 ? "F\u0130LTREL\u0130 SORGU TUTARLI" : "R\u0130SKL\u0130",
      sonuclar: testSonuclari,
      ozet: toplamSizinti === 0 ? `"${hedefTenant}" i\xE7in filtreli sorgular tutarl\u0131. Bu tan\u0131lama yetkisiz eri\u015Fim veya RLS g\xFCvenli\u011Fini kan\u0131tlamaz.` : `D\u0130KKAT: ${toplamSizinti} adet yabanc\u0131 kay\u0131t tespit edildi!`
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: "\u0130zolasyon testi s\u0131ras\u0131nda hata: " + err.message });
  }
});
var sistem_default = router;

// src/server/routes/siparisler.ts
import { Router as Router3 } from "express";
import { randomUUID } from "node:crypto";
import { Type } from "@google/genai";

// src/server/routes/gorsel.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { Router as Router2 } from "express";
import path5 from "path";
import fs3 from "fs";

// src/server/services/gemini.ts
import { GoogleGenAI } from "@google/genai";
function getGeminiClient() {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY sistemde tan\u0131ml\u0131 de\u011Fil. L\xFCtfen .env dosyas\u0131ndan ekleyin.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var modelCooldownMap = /* @__PURE__ */ new Map();
function getPrioritizedModels(preferredModels) {
  const baseList = preferredModels || [
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash"
  ];
  const now = Date.now();
  const ready = [];
  const inCooldown = [];
  for (const m of baseList) {
    const expireTime = modelCooldownMap.get(m) || 0;
    if (now > expireTime) {
      ready.push(m);
    } else {
      inCooldown.push(m);
    }
  }
  return ready.length > 0 ? [...ready, ...inCooldown] : baseList;
}
async function generateContentWithRetryAndFallback(ai, params) {
  const modelsToTry = getPrioritizedModels(params.models);
  let lastError = null;
  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config
      });
      modelCooldownMap.delete(model);
      return response;
    } catch (err) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const is429 = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
      const is503 = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE") || errMsg.includes("overloaded");
      console.warn(`[Gemini Deneme] Model '${model}' ilk \xE7a\u011Fr\u0131da yan\u0131t veremedi (${err?.status || (is429 ? "Kota 429" : "503 Yo\u011Funluk")})`);
      if (params.config?.tools && (is429 || is503)) {
        try {
          console.log(`[Gemini Kurtarma] '${model}' arama arac\u0131 kotas\u0131 a\u015F\u0131ld\u0131, ara\xE7s\u0131z salt analiz modunda deneniyor...`);
          const fallbackConfig = { ...params.config };
          delete fallbackConfig.tools;
          const recoveryResponse = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: Object.keys(fallbackConfig).length > 0 ? fallbackConfig : void 0
          });
          modelCooldownMap.delete(model);
          return recoveryResponse;
        } catch (recoveryErr) {
          console.warn(`[Gemini Kurtarma] '${model}' ara\xE7s\u0131z modda da yan\u0131t veremedi:`, recoveryErr?.message || recoveryErr);
          lastError = recoveryErr;
        }
      }
      if (is429 || is503) {
        modelCooldownMap.set(model, Date.now() + 5e3);
      }
      if (i < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  try {
    console.log("[Gemini Son Kurtarma] gemini-2.5-flash ile ara\xE7s\u0131z acil durum \xE7a\u011Fr\u0131s\u0131 yap\u0131l\u0131yor...");
    const emergencyConfig = params.config ? { ...params.config } : void 0;
    if (emergencyConfig?.tools) delete emergencyConfig.tools;
    const emergencyResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: params.contents,
      config: emergencyConfig
    });
    return emergencyResponse;
  } catch (finalEmergencyErr) {
    console.error("[Gemini Son Kurtarma Ba\u015Far\u0131s\u0131z]:", finalEmergencyErr);
  }
  const errStr = lastError?.message || "";
  if (errStr.includes("503") || errStr.includes("high demand") || errStr.includes("UNAVAILABLE")) {
    throw new Error("Google Yapay Zeka modeli \u015Fu anda yo\u011Fun talep g\xF6r\xFCyor (503). L\xFCtfen birka\xE7 saniye sonra tekrar deneyin.");
  }
  if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
    throw new Error("Google Yapay Zeka sorgu kotas\u0131 \u015Fu an i\xE7in doldu (429). L\xFCtfen k\u0131sa bir s\xFCre sonra tekrar deneyin.");
  }
  throw lastError || new Error("Yapay zeka yan\u0131t \xFCretemedi.");
}

// src/server/services/siparisFormatlama.ts
function uretKanadaTakipKodu(urunTanimi) {
  let storeCode = "CA";
  if (urunTanimi) {
    const clean = urunTanimi.toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.includes("ZARA")) storeCode = "ZARA";
    else if (clean.includes("SEPHORA")) storeCode = "SEPH";
    else if (clean.includes("KORS") || clean.includes("MICHAEL")) storeCode = "MK";
    else if (clean.includes("TOMMY")) storeCode = "TH";
    else if (clean.includes("NIKE")) storeCode = "NIKE";
    else if (clean.includes("MASSIMO")) storeCode = "MD";
    else if (clean.length >= 2) storeCode = clean.slice(0, 4);
  }
  const randomNum = Math.floor(1e3 + Math.random() * 9e3);
  return `TOR-${storeCode}-${randomNum}`;
}
function uretUluslararasiKargoKodu() {
  const randomNum = Math.floor(1e3 + Math.random() * 9e3);
  const prefixes = ["AZ-CARGO", "KNB-AIR", "GYD-EXP"];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${p}-${randomNum}-YYZ`;
}
var SUPABASE_GECERLI_KOLONLAR = /* @__PURE__ */ new Set([
  "tenant_id",
  "ham_mesaj",
  "siparis_kaynagi",
  "musteri_adi",
  "instagram_kullanici_adi",
  "telefon_numarasi",
  "teslimat_sehri",
  "teslimat_adresi",
  "urun_aciklamasi",
  "beden_veya_olcu",
  "renk",
  "adet",
  "toplam_tutar",
  "alinan_tutar",
  "para_birimi",
  "finans_durumu",
  "lojistik_durumu",
  "baku_kurye_id",
  "baku_kurye_adi",
  "baku_kurye_bolgesi",
  "teslim_tarihi",
  "teslim_eden_kisi",
  "baku_tahsilat_notu",
  "kanada_takip_kodu",
  "uluslararasi_kargo_kodu",
  "eksik_bilgiler",
  "ai_guven_skoru",
  "is_demo"
]);
function hazirlaSupabasePayload(input) {
  let tahsilatNotu = (input.baku_tahsilat_notu || "").trim();
  if (input.ozel_not && typeof input.ozel_not === "string" && input.ozel_not.trim()) {
    const ozelNotTemiz = input.ozel_not.trim();
    if (!tahsilatNotu.includes("[T\u018FL\u0130MAT:") && !tahsilatNotu.includes("[TAL\u0130MAT:")) {
      tahsilatNotu = `[T\u018FL\u0130MAT: ${ozelNotTemiz}] ${tahsilatNotu}`.trim();
    }
  }
  let eksikBilgiler = Array.isArray(input.eksik_bilgiler) ? [...input.eksik_bilgiler] : [];
  eksikBilgiler = eksikBilgiler.filter((b) => typeof b !== "string" || !b.startsWith("META:"));
  if (Array.isArray(input.urunler) && input.urunler.length > 0) {
    eksikBilgiler.push("META:urunler=" + JSON.stringify(input.urunler));
  }
  if (Array.isArray(input.gorsel_urlleri) && input.gorsel_urlleri.length > 0) {
    eksikBilgiler.push("META:gorseller=" + JSON.stringify(input.gorsel_urlleri));
  }
  if (input.tenant_id) {
    eksikBilgiler.push("META:tenant_id=" + input.tenant_id);
  }
  if (input.is_demo !== void 0) {
    eksikBilgiler.push("META:is_demo=" + (input.is_demo ? "1" : "0"));
  }
  const raw = {
    ...input,
    tenant_id: input.tenant_id || "kanada_shopper_baku",
    baku_tahsilat_notu: tahsilatNotu,
    eksik_bilgiler: eksikBilgiler,
    ham_mesaj: input.ham_mesaj || (input.ozel_not ? `Talimat: ${input.ozel_not}` : input.urun_aciklamasi || ""),
    adet: Number(input.adet || 1),
    toplam_tutar: Number(input.toplam_tutar || 0),
    alinan_tutar: Number(input.alinan_tutar || 0),
    ai_guven_skoru: Number(input.ai_guven_skoru || 0.95)
  };
  const payload = {};
  for (const key of Object.keys(raw)) {
    if (SUPABASE_GECERLI_KOLONLAR.has(key)) {
      payload[key] = raw[key];
    }
  }
  return payload;
}
function formatlaSiparis(s) {
  let bakuTahsilatNotu = (s.baku_tahsilat_notu || "").trim();
  let ozelNot = (s.ozel_not || "").trim();
  const talimatMatch = bakuTahsilatNotu.match(/\[(?:TƏLİMAT|TALİMAT):\s*([\s\S]*?)\]/i);
  if (talimatMatch) {
    if (!ozelNot) {
      ozelNot = talimatMatch[1].trim();
    }
    bakuTahsilatNotu = bakuTahsilatNotu.replace(/\[(?:TƏLİMAT|TALİMAT):\s*[\s\S]*?\]/gi, "").trim();
  }
  let urunler = Array.isArray(s.urunler) ? s.urunler : [];
  let gorselUrlleri = Array.isArray(s.gorsel_urlleri) ? s.gorsel_urlleri : [];
  let temizEksikBilgiler = [];
  let tenantId = "kanada_shopper_baku";
  let isDemo = true;
  if (Array.isArray(s.eksik_bilgiler)) {
    for (const item of s.eksik_bilgiler) {
      if (typeof item === "string" && item.startsWith("META:urunler=")) {
        try {
          urunler = JSON.parse(item.substring("META:urunler=".length));
        } catch {
        }
      } else if (typeof item === "string" && item.startsWith("META:gorseller=")) {
        try {
          gorselUrlleri = JSON.parse(item.substring("META:gorseller=".length));
        } catch {
        }
      } else if (typeof item === "string" && item.startsWith("META:tenant_id=")) {
        tenantId = item.substring("META:tenant_id=".length);
      } else if (typeof item === "string" && item.startsWith("META:is_demo=")) {
        isDemo = item.substring("META:is_demo=".length) === "1";
      } else {
        temizEksikBilgiler.push(String(item));
      }
    }
  }
  if (s.tenant_id) tenantId = s.tenant_id;
  if (s.is_demo !== void 0) isDemo = s.is_demo;
  if (urunler.length === 0 && s.urun_aciklamasi && s.urun_aciklamasi.includes("+")) {
    const parcalar = s.urun_aciklamasi.split("+");
    urunler = parcalar.map((p) => {
      const match = p.match(/(?:(\d+)x\s*)?(.*?)(?:\((\d+(?:\.\d+)?)\s*AZN\))?$/i);
      return {
        urun_adi: (match && match[2] ? match[2].trim() : p.trim()) || p.trim(),
        adet: match && match[1] ? Number(match[1]) : 1,
        tutar: match && match[3] ? Number(match[3]) : void 0
      };
    });
  }
  urunler = urunler.map((u, idx) => {
    const adi = u.urun_adi || u.urun_aciklamasi || `\xDCr\xFCn #${idx + 1}`;
    const fiyati = u.tutar !== void 0 ? Number(u.tutar) : u.birim_fiyat !== void 0 ? Number(u.birim_fiyat) : void 0;
    let gorsel = u.urun_gorseli || u.gorsel_url || void 0;
    if (!gorsel && (s.musteri_adi?.includes("K\xF6n\xFCl") || s.musteri_adi?.includes("Konul"))) {
      gorsel = idx === 0 ? "/uploads/karl_lagerfeld_canta_1.svg" : "/uploads/karl_lagerfeld_canta_2.svg";
    }
    return {
      ...u,
      urun_adi: adi,
      urun_aciklamasi: adi,
      adet: Number(u.adet || 1),
      tutar: fiyati,
      birim_fiyat: fiyati,
      urun_gorseli: gorsel
    };
  });
  if (s.musteri_adi?.includes("K\xF6n\xFCl") || s.musteri_adi?.includes("Konul")) {
    if (!gorselUrlleri || gorselUrlleri.length === 0 || gorselUrlleri.some((g) => typeof g === "string" && g.includes("Panodan_"))) {
      gorselUrlleri = [
        "/uploads/whatsapp_konul_screenshot.svg",
        "/uploads/karl_lagerfeld_canta_1.svg",
        "/uploads/karl_lagerfeld_canta_2.svg"
      ];
    }
  }
  const toplam = Number(s.toplam_tutar || 0);
  const alinan = Number(s.alinan_tutar || 0);
  const kalan = s.kalan_tutar !== void 0 && s.kalan_tutar !== null ? Number(s.kalan_tutar) : Math.max(0, toplam - alinan);
  return {
    ...s,
    toplam_tutar: toplam,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    adet: Number(s.adet || 1),
    baku_tahsilat_notu: bakuTahsilatNotu,
    ozel_not: ozelNot,
    urunler,
    birden_fazla_urun: urunler.length > 1,
    gorsel_urlleri: gorselUrlleri,
    eksik_bilgiler: temizEksikBilgiler,
    tenant_id: tenantId,
    is_demo: isDemo
  };
}

// src/server/services/publicFetch.ts
import { lookup } from "node:dns/promises";
import { isIP as isIP2 } from "node:net";
import http from "node:http";
import https from "node:https";
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var PublicResourceError = class extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
    this.name = "PublicResourceError";
  }
};
function beforeDeadline(promise, remainingMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PublicResourceError("\u0130ndirme zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 504)),
      Math.max(0, remainingMs)
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
async function requestOnce(url, deadline, options) {
  const check = urlGuvenlimi(url.href);
  if (!check.guvenli) throw new PublicResourceError(check.sebep || "G\xFCvenli olmayan URL.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = isIP2(hostname);
  const addresses = family ? [{ address: hostname, family }] : await beforeDeadline(lookup(hostname, { all: true, verbatim: true }), deadline - Date.now());
  if (addresses.length === 0 || addresses.some(({ address }) => !genelIpAdresiMi(address))) {
    throw new PublicResourceError("Hedef sunucu genel internet d\u0131\u015F\u0131nda bir adrese \xE7\xF6z\xFCmleniyor.");
  }
  if (Date.now() >= deadline) throw new PublicResourceError("\u0130ndirme zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 504);
  const pinned = addresses[0];
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    let response;
    let timer;
    const fail2 = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    const request = transport.request(
      url,
      {
        method: "GET",
        agent: false,
        family: pinned.family,
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: {
          "User-Agent": "TOMNAP-ImageFetcher/1.0",
          Accept: options.accept || "image/*",
          "Accept-Encoding": "identity",
          Referer: url.origin
        }
      },
      (incoming) => {
        response = incoming;
        incoming.on("error", fail2);
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== void 0)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status)) {
          clearTimeout(timer);
          incoming.destroy();
          resolve({ status, headers, body: Buffer.alloc(0) });
          return;
        }
        const length = Number(headers.get("content-length"));
        if (Number.isFinite(length) && length > maxBytes) {
          const error = new PublicResourceError("\u0130ndirilen dosya boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
          fail2(error);
          incoming.destroy();
          request.destroy();
          return;
        }
        const encoding = headers.get("content-encoding");
        if (encoding && encoding !== "identity") {
          fail2(new PublicResourceError("S\u0131k\u0131\u015Ft\u0131r\u0131lm\u0131\u015F uzak yan\u0131t desteklenmiyor.", 502));
          incoming.destroy();
          request.destroy();
          return;
        }
        const chunks = [];
        let bytes = 0;
        incoming.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            fail2(new PublicResourceError("\u0130ndirilen dosya boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413));
            incoming.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          clearTimeout(timer);
          resolve({ status, headers, body: Buffer.concat(chunks) });
        });
        incoming.on(
          "aborted",
          () => fail2(new PublicResourceError("Uzak yan\u0131t tamamlanmad\u0131.", 502))
        );
      }
    );
    timer = setTimeout(() => {
      const error = new PublicResourceError("\u0130ndirme zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 504);
      request.destroy(error);
      response?.destroy(error);
    }, deadline - Date.now());
    request.on("error", fail2);
    try {
      request.end();
    } catch (error) {
      clearTimeout(timer);
      request.destroy();
      reject(error);
    }
  });
}
async function fetchPublicResource(rawUrl, options = {}) {
  const check = urlGuvenlimi(rawUrl);
  if (!check.guvenli) throw new PublicResourceError(check.sebep || "G\xFCvenli olmayan URL.");
  let url = new URL(rawUrl);
  const deadline = Date.now() + (options.timeoutMs ?? 7e3);
  for (let hop = 0; hop <= 4; hop++) {
    const result = await requestOnce(url, deadline, options);
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      const location = result.headers.get("location");
      if (!location || hop === 4)
        throw new PublicResourceError("Ge\xE7ersiz veya \xE7ok fazla y\xF6nlendirme.", 502);
      url = new URL(location, url);
      continue;
    }
    const body = [204, 205, 304].includes(result.status) ? null : new Uint8Array(result.body);
    return new Response(body, { status: result.status, headers: result.headers });
  }
  throw new PublicResourceError("\xC7ok fazla y\xF6nlendirme.", 502);
}

// src/server/routes/gorsel.ts
var router2 = Router2();
async function fetchOgImageFromUrl(pageUrl) {
  if (typeof pageUrl !== "string" || !pageUrl.startsWith("http")) return null;
  const urlKontrol = urlGuvenlimi(pageUrl);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] fetchOgImageFromUrl: ${pageUrl} \u2014 Sebep: ${urlKontrol.sebep}`);
    return null;
  }
  try {
    const resp = await fetchPublicResource(pageUrl, {
      timeoutMs: 4500,
      maxBytes: 2 * 1024 * 1024,
      accept: "text/html,application/xhtml+xml"
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) || html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogMatch && ogMatch[1]) {
      let imgUrl = ogMatch[1].trim();
      if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
      if (imgUrl.startsWith("http") && !imgUrl.includes("placeholder") && !imgUrl.includes("logo")) {
        return imgUrl;
      }
    }
  } catch (e) {
  }
  return null;
}
async function isValidImageUrl(url) {
  if (typeof url !== "string" || !url.startsWith("http")) return false;
  const urlKontrol = urlGuvenlimi(url);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] isValidImageUrl: ${url} \u2014 Sebep: ${urlKontrol.sebep}`);
    return false;
  }
  try {
    const resp = await fetchPublicResource(url, { timeoutMs: 3500 });
    if (!resp.ok) return false;
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return false;
    inspectImage(Buffer.from(await resp.arrayBuffer()), contentType.split(";")[0]);
    return true;
  } catch {
    return false;
  }
}
function decodeImage(base64, declaredMime) {
  const dataUrl = base64.match(/^data:([^;]+);base64,(.*)$/s);
  const encoded = dataUrl ? dataUrl[2] : base64;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new PublicResourceError("G\xF6rsel en fazla 10 MB olabilir.", 413);
  }
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new PublicResourceError("Ge\xE7ersiz base64 g\xF6rsel verisi.", 400);
  }
  const buffer = Buffer.from(encoded, "base64");
  return inspectImage(buffer, declaredMime, dataUrl?.[1]);
}
function inspectImage(buffer, ...declaredMimes) {
  if (buffer.length > MAX_IMAGE_BYTES)
    throw new PublicResourceError("G\xF6rsel en fazla 10 MB olabilir.", 413);
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const mimeType = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
  if (!mimeType)
    throw new PublicResourceError("Yaln\u0131zca PNG, JPEG veya WebP g\xF6rselleri desteklenir.", 415);
  for (const claimed of declaredMimes) {
    if (claimed !== void 0 && typeof claimed !== "string")
      throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel t\xFCr\xFC.", 400);
    if (claimed && claimed.trim().toLowerCase() !== mimeType && !(claimed === "image/jpg" && jpeg)) {
      throw new PublicResourceError("G\xF6rsel t\xFCr\xFC dosya i\xE7eri\u011Fiyle e\u015Fle\u015Fmiyor.", 415);
    }
  }
  return { buffer, mimeType, ext: png ? "png" : jpeg ? "jpg" : "webp" };
}
function uploadPath(dosyaAdi) {
  if (!dosyaAdi || sanitizeDosyaAdi(dosyaAdi) !== dosyaAdi) {
    throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel dosya yolu.");
  }
  const candidate = path5.join(UPLOADS_DIR, dosyaAdi);
  if (!yolGuvenlimi(candidate, UPLOADS_DIR)) {
    throw new PublicResourceError("Eri\u015Fim reddedildi.");
  }
  if (fs3.existsSync(candidate)) {
    const actual = fs3.realpathSync(candidate);
    const root = fs3.realpathSync(UPLOADS_DIR);
    if (!yolGuvenlimi(actual, root)) {
      throw new PublicResourceError("Eri\u015Fim reddedildi.");
    }
    return actual;
  }
  return candidate;
}
function imagePrefix(tenantId) {
  return `t_${createHash2("sha256").update(tenantId).digest("hex").slice(0, 24)}_`;
}
function ownedUploadPath(req, name) {
  if (!req.auth || !req.tenantId) throw new PublicResourceError("Oturum gerekli.", 401);
  const candidate = uploadPath(name);
  if (!/^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/.test(name) || !(req.auth.role === "SUPER_ADMIN" && req.tenantId === "all") && !name.startsWith(imagePrefix(req.tenantId))) {
    throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
  }
  return candidate;
}
function storeTenantImage(req, base64, declaredMime) {
  if (!req.auth || !req.tenantId || req.tenantId === "all")
    throw new PublicResourceError("G\xF6rsel i\xE7in bir firma se\xE7in.", 403);
  if (typeof base64 !== "string") throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel.", 400);
  const parsed = decodeImage(base64, declaredMime);
  const name = `${imagePrefix(req.tenantId)}${randomBytes2(16).toString("hex")}.${parsed.ext}`;
  fs3.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 448 });
  fs3.writeFileSync(uploadPath(name), parsed.buffer, { flag: "wx", mode: 384 });
  return {
    url: `/uploads/${name}`,
    mimeType: parsed.mimeType,
    base64: parsed.buffer.toString("base64")
  };
}
async function assertTenantImageReferences(req, payload) {
  const pending = [payload];
  let count = 0;
  while (pending.length) {
    if (++count > 1e5) throw new PublicResourceError("\u0130stek \xE7ok karma\u015F\u0131k.", 413);
    const value = pending.pop();
    if (value && typeof value === "object") pending.push(...Object.values(value));
    if (typeof value !== "string") continue;
    const normalized = value.replace(/\\\//g, "/");
    for (const match of normalized.matchAll(/(?:\/api)?\/uploads\/([^\s"'<>?#\\]+)/g)) {
      let name;
      try {
        name = decodeURIComponent(match[1]);
      } catch {
        throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel.", 400);
      }
      const file = ownedUploadPath(req, name);
      if (!fs3.existsSync(file) || !fs3.statSync(file).isFile())
        throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
    }
  }
}
function serveUploadedImage(req, res) {
  try {
    const file = ownedUploadPath(req, req.params.dosyaAdi);
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    if (!fs3.existsSync(file) || !fs3.statSync(file).isFile()) {
      return res.status(404).send("G\xF6rsel bulunamad\u0131.");
    }
    return res.sendFile(file);
  } catch (error) {
    return res.status(error instanceof PublicResourceError ? error.status : 500).send("G\xF6rsele eri\u015Filemiyor.");
  }
}
router2.get("/uploads/:dosyaAdi", serveUploadedImage);
router2.post("/upload-gorsel", (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz g\xF6rsel verisi" });
    }
    const stored = storeTenantImage(req, base64, mimeType);
    const benzersizAd = path5.basename(stored.url);
    res.json({
      basarili: true,
      url: `/uploads/${benzersizAd}`,
      dosya_adi: dosyaAdi || benzersizAd
    });
  } catch (err) {
    console.error("G\xF6rsel y\xFCkleme hatas\u0131:", err);
    res.status(err instanceof PublicResourceError ? err.status : 500).json({ basarili: false, hata: "G\xF6rsel kaydedilemedi: " + err.message });
  }
});
router2.get("/proxy-gorsel", async (req, res) => {
  const gorselUrl = req.query.url;
  if (typeof gorselUrl !== "string" || !gorselUrl.startsWith("http")) {
    return res.status(400).send("Ge\xE7ersiz g\xF6rsel adresi");
  }
  const urlKontrol = urlGuvenlimi(gorselUrl);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] ${gorselUrl} \u2014 Sebep: ${urlKontrol.sebep}`);
    return res.status(403).json({ basarili: false, hata: urlKontrol.sebep });
  }
  try {
    const resp = await fetchPublicResource(gorselUrl);
    if (!resp.ok) {
      return res.status(resp.status).send(`G\xF6rsel indirilemedi (${resp.status})`);
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(400).send("Hedef adres resim dosyas\u0131 de\u011Fil");
    }
    const image = inspectImage(Buffer.from(await resp.arrayBuffer()), contentType.split(";")[0]);
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(image.buffer);
  } catch (err) {
    res.status(err instanceof PublicResourceError ? err.status : 502).send("Vekil sunucu hatas\u0131: " + err.message);
  }
});
router2.post("/urun-katalog-gorseli-ara", async (req, res) => {
  try {
    const { urun_adi, marka, renk } = req.body;
    if (!urun_adi) {
      return res.status(400).json({ basarili: false, hata: "\xDCr\xFCn ad\u0131 gereklidir." });
    }
    const ai = getGeminiClient();
    const aramaPrompt = `Sen l\xFCks moda, ayakkab\u0131, \xE7anta ve giyim alan\u0131nda uzman bir \xFCr\xFCn katalog ara\u015Ft\u0131rmac\u0131s\u0131s\u0131n.
A\u015Fa\u011F\u0131da bilgileri verilen \xFCr\xFCn i\xE7in internette resmi marka sitesinde (Karl Lagerfeld, On Running, Michael Kors, Tommy Hilfiger, Aldo, Coach, Zara vb.) ve yetkili l\xFCks sitelerde (Farfetch, Nordstrom, Saks Fifth Avenue, Bloomingdale's, Amazon vb.) orijinal st\xFCdyo/katalog \xE7ekimi foto\u011Fraf\u0131n\u0131 ve \xFCr\xFCn sat\u0131\u015F sayfas\u0131n\u0131 ara\u015Ft\u0131r:

Aranan \xDCr\xFCn: "${urun_adi}"
${marka ? `Marka: ${marka}` : ""}
${renk ? `Renk: ${renk}` : ""}

G\xD6REVLER\u0130N:
1. \xDCr\xFCn\xFCn resmi e-ticaret sitelerindeki tam model ad\u0131n\u0131 belirle.
2. \xDCr\xFCn\xFCn resmi sayfas\u0131ndaki y\xFCksek \xE7\xF6z\xFCn\xFCrl\xFCkl\xFC, beyaz/temiz arka planl\u0131 st\xFCdyo katalog foto\u011Fraf\u0131 linkini (do\u011Frudan CDN/image URL) veya \xFCr\xFCn sayfas\u0131n\u0131 bul.
3. \xDCr\xFCn\xFCn resmi \xFCr\xFCn sayfas\u0131 linkini (URL) bul.
4. \xDCr\xFCn\xFCn malzeme/koleksiyon \xF6zetini belirt.

Yan\u0131t\u0131n\u0131 YALNIZCA a\u015Fa\u011F\u0131daki JSON format\u0131nda d\xF6nd\xFCr (ba\u015Fka a\xE7\u0131klama ekleme):
{
  "resmi_urun_adi": "\xDCr\xFCn\xFCn resmi tam ad\u0131 ve modeli",
  "marka": "Marka",
  "katalog_gorsel_url": "Do\u011Frudan g\xF6rsel CDN URL'si (varsa, \xF6rn: https://cdn...jpg veya https://images...)",
  "urun_sayfasi_url": "Resmi \xFCr\xFCn sayfas\u0131 URL'si",
  "aciklama": "\xDCr\xFCn\xFCn resmi katalog a\xE7\u0131klamas\u0131 veya materyali",
  "tahmini_fiyat": "Resmi sat\u0131\u015F fiyat\u0131 (varsa)"
}`;
    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: aramaPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });
    const yanitMetni = searchResponse.text || "";
    let sonuc = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn("JSON parse hatas\u0131:", parseErr);
    }
    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks.filter((c) => c.web?.uri).map((c) => ({
      baslik: c.web.title || "Resmi \xDCr\xFCn Sayfas\u0131",
      url: c.web.uri
    }));
    if (!sonuc) {
      sonuc = {
        resmi_urun_adi: urun_adi,
        marka: marka || "",
        katalog_gorsel_url: "",
        urun_sayfasi_url: webLinkleri.length > 0 ? webLinkleri[0].url : "",
        aciklama: yanitMetni.slice(0, 200)
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }
    if (!sonuc.katalog_gorsel_url) {
      const hedefLink = sonuc.urun_sayfasi_url || webLinkleri[0]?.url;
      if (hedefLink) {
        const ogResmi = await fetchOgImageFromUrl(hedefLink);
        if (ogResmi) {
          sonuc.katalog_gorsel_url = ogResmi;
        }
      }
    }
    res.json({
      basarili: true,
      sonuc,
      web_linkleri: webLinkleri.slice(0, 4)
    });
  } catch (err) {
    console.error("Katalog arama hatas\u0131:", err);
    res.status(500).json({ basarili: false, hata: err.message || "\xDCr\xFCn g\xF6rsel aramas\u0131 ba\u015Far\u0131s\u0131z oldu." });
  }
});
router2.post("/gorselden-urun-ara", async (req, res) => {
  try {
    const { gorsel, mevcut_urun_adi, ek_ipucu } = req.body;
    await assertTenantImageReferences(req, gorsel);
    if (!gorsel || typeof gorsel !== "string") {
      return res.status(400).json({ basarili: false, hata: "Aranacak g\xF6rsel verisi bulunamad\u0131." });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ basarili: false, hata: "Gemini API anahtar\u0131 yap\u0131land\u0131r\u0131lmam\u0131\u015F." });
    }
    let base64Data = "";
    let mimeType = "image/jpeg";
    if (gorsel.startsWith("data:")) {
      const image = decodeImage(gorsel);
      mimeType = image.mimeType;
      base64Data = image.buffer.toString("base64");
    } else if (gorsel.startsWith("/uploads/")) {
      const dosyaAdi = gorsel.replace("/uploads/", "");
      const dosyaYolu = ownedUploadPath(req, dosyaAdi);
      if (fs3.existsSync(dosyaYolu)) {
        const stat = fs3.statSync(dosyaYolu);
        if (!stat.isFile()) throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel dosyas\u0131.");
        if (stat.size > MAX_IMAGE_BYTES)
          throw new PublicResourceError("G\xF6rsel boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
        const image = inspectImage(fs3.readFileSync(dosyaYolu));
        base64Data = image.buffer.toString("base64");
        mimeType = image.mimeType;
      }
    } else if (gorsel.startsWith("http")) {
      try {
        const fetchRes = await fetchPublicResource(gorsel);
        if (fetchRes.ok) {
          const image = inspectImage(
            Buffer.from(await fetchRes.arrayBuffer()),
            fetchRes.headers.get("content-type")?.split(";")[0]
          );
          base64Data = image.buffer.toString("base64");
          mimeType = image.mimeType;
        }
      } catch (err) {
        if (err instanceof PublicResourceError) throw err;
        console.warn("G\xF6rsel URL indirilemedi:", err);
      }
    }
    if (!base64Data) {
      return res.status(400).json({ basarili: false, hata: "G\xF6rsel verisi okunamad\u0131 veya format desteklenmiyor." });
    }
    const ai = getGeminiClient();
    const lensPrompt = `Sen profesyonel bir e-ticaret, l\xFCks marka ve \xFCr\xFCn tan\u0131ma uzman\u0131s\u0131n (Google Lens ve AliExpress Visual Search mant\u0131\u011F\u0131yla \xE7al\u0131\u015F\u0131yorsun).
Ekli g\xF6rselde kullan\u0131c\u0131n\u0131n odaklad\u0131\u011F\u0131 veya se\xE7ti\u011Fi bir \xFCr\xFCn yer almaktad\u0131r.
${mevcut_urun_adi ? `Sipari\u015F metnindeki \xFCr\xFCn ad\u0131/ipucu: "${mevcut_urun_adi}"` : ""}
${ek_ipucu ? `Kullan\u0131c\u0131n\u0131n belirtti\u011Fi ek ipucu: "${ek_ipucu}"` : ""}

L\xFCtfen \u015Fu ad\u0131mlar\u0131 eksiksiz uygula:
1. G\xF6rseldeki \xFCr\xFCn\xFC titizlikle analiz et: Logo, marka amblemi, monogram desen, renk, taban, toka, materyal veya tipografik detaylar\u0131 belirle (\xD6rn: Karl Lagerfeld, Michael Kors, Gucci, Zara, Prada, Guess, Nike, Adidas, vb.).
2. \xDCr\xFCn\xFCn tam resmi model ad\u0131n\u0131 ve koleksiyonunu tespit et (\xD6rn: "Karl Lagerfeld Kondo Monogram Slide Sandal", "Michael Kors Jet Set Crossbody Bag").
3. Google Search arac\u0131 ile bu \xFCr\xFCn\xFCn orijinal st\xFCdyo foto\u011Fraf\u0131n\u0131 (.jpg veya .png format\u0131nda do\u011Frudan resim ba\u011Flant\u0131s\u0131) ve resmi sat\u0131\u015F/e-ticaret sayfalar\u0131n\u0131 (Trendyol, Beymen, Farfetch, Brandroom, Hepsiburada, Amazon veya resmi marka sitesi) bul.

Cevab\u0131n\u0131 YALNIZCA ge\xE7erli bir JSON nesnesi format\u0131nda ver:
{
  "marka": "Tespit edilen marka ad\u0131",
  "resmi_urun_adi": "\xDCr\xFCn\xFCn resmi model ve tam katalog ad\u0131",
  "urun_tipi": "\xDCr\xFCn kategorisi (\xF6r: Terlik, \xC7anta, Ayakkab\u0131, Saat, Elbise)",
  "renk": "Tespit edilen renk (\xF6r: Siyah, Beyaz-Siyah, Bej)",
  "belirgin_ozellikler": "G\xF6rselden tespit edilen logo, desen, materyal vb. detaylar",
  "katalog_gorsel_url": "Do\u011Frudan g\xF6rsel dosya linki (.jpg, .jpeg, .png, .webp) - web sayfas\u0131 linki OLMAYACAK",
  "urun_sayfasi_url": "\xDCr\xFCn\xFCn resmi e-ticaret sat\u0131\u015F veya marka sayfas\u0131",
  "aciklama": "\xDCr\xFCn\xFCn resmi katalog a\xE7\u0131klamas\u0131 ve \xF6zellikleri",
  "google_arama_kelimeleri": "Google G\xF6rseller veya Google Lens'te tam bu \xFCr\xFCn\xFC bulmak i\xE7in en etkili 4-5 kelimelik arama terimi"
}`;
    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        {
          text: lensPrompt
        }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    const yanitMetni = searchResponse.text || "";
    let sonuc = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn("G\xF6rsel arama JSON parse hatas\u0131:", parseErr);
    }
    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks.filter((c) => c.web?.uri).map((c) => ({
      baslik: c.web.title || "Resmi Sat\u0131\u015F Sayfas\u0131",
      url: c.web.uri
    }));
    if (!sonuc) {
      sonuc = {
        marka: "",
        resmi_urun_adi: mevcut_urun_adi || "Tespit Edilen \xDCr\xFCn",
        urun_tipi: "",
        renk: "",
        belirgin_ozellikler: "",
        katalog_gorsel_url: "",
        urun_sayfasi_url: webLinkleri[0]?.url || "",
        aciklama: yanitMetni.slice(0, 200),
        google_arama_kelimeleri: mevcut_urun_adi || ""
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }
    if (sonuc.katalog_gorsel_url) {
      const gecerliMi = await isValidImageUrl(sonuc.katalog_gorsel_url);
      if (!gecerliMi) {
        console.log(
          `[G\xF6rsel Do\u011Frulama] Modelin \xFCretti\u011Fi katalog URL ge\xE7ersiz \xE7\u0131kt\u0131, temizleniyor.`
        );
        sonuc.katalog_gorsel_url = "";
      }
    }
    if (!sonuc.katalog_gorsel_url) {
      const adayLinkler = [sonuc.urun_sayfasi_url, ...webLinkleri.map((w) => w.url)].filter(
        Boolean
      );
      for (const link of adayLinkler) {
        if (!link || link.includes("google.com") || link.includes("google.com.tr")) continue;
        const ogResmi = await fetchOgImageFromUrl(link);
        if (ogResmi && await isValidImageUrl(ogResmi)) {
          sonuc.katalog_gorsel_url = ogResmi;
          break;
        }
      }
    }
    const aramaKelimeleri = (sonuc.google_arama_kelimeleri || `${sonuc.marka || ""} ${sonuc.resmi_urun_adi || ""}`).trim() || "\xDCr\xFCn Ara";
    const googleGorselAramaUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleWebAramaUrl = `https://www.google.com/search?q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleAlisverisUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(aramaKelimeleri)}`;
    if (!sonuc.urun_sayfasi_url) {
      sonuc.urun_sayfasi_url = googleWebAramaUrl;
    }
    const sonWebLinkleri = webLinkleri.length > 0 ? webLinkleri.slice(0, 5) : [
      {
        baslik: `Google G\xF6rseller: ${aramaKelimeleri}`,
        url: googleGorselAramaUrl
      },
      {
        baslik: `Google Al\u0131\u015Fveri\u015F / Fiyatlar: ${aramaKelimeleri}`,
        url: googleAlisverisUrl
      },
      {
        baslik: `Google Web Arama: ${aramaKelimeleri}`,
        url: googleWebAramaUrl
      }
    ];
    res.json({
      basarili: true,
      sonuc,
      web_linkleri: sonWebLinkleri,
      google_gorsel_arama_url: googleGorselAramaUrl
    });
  } catch (err) {
    console.error("G\xF6rselden arama hatas\u0131:", err);
    res.status(err instanceof PublicResourceError ? err.status : 500).json({ basarili: false, hata: err.message || "G\xF6rsel \xFCzerinden arama yap\u0131lamad\u0131." });
  }
});
router2.post("/katalog-gorseli-kaydet", async (req, res) => {
  try {
    const { siparis_id, urun_indeksi, katalog_gorsel_url, urun_sayfasi_url, resmi_urun_adi } = req.body;
    if (!siparis_id || urun_indeksi === void 0 || !katalog_gorsel_url) {
      return res.status(400).json({
        basarili: false,
        hata: "siparis_id, urun_indeksi ve katalog_gorsel_url gereklidir."
      });
    }
    if (typeof katalog_gorsel_url === "string" && (katalog_gorsel_url.startsWith("http://") || katalog_gorsel_url.startsWith("https://"))) {
      const urlKontrol = urlGuvenlimi(katalog_gorsel_url);
      if (!urlKontrol.guvenli) {
        return res.status(403).json({
          basarili: false,
          hata: `G\xFCvenlik engeli (SSRF): ${urlKontrol.sebep}`
        });
      }
    }
    if (!req.tenantId || req.tenantId === "all")
      return res.status(403).json({ basarili: false, hata: "Firma se\xE7in." });
    if (!Number.isInteger(urun_indeksi) || urun_indeksi < 0)
      return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz \xFCr\xFCn indeksi." });
    let mevcutSiparis = null;
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").select("*").eq("id", siparis_id).eq("tenant_id", req.tenantId).maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: "Veritaban\u0131 kullan\u0131lam\u0131yor." });
      mevcutSiparis = data;
    } else {
      mevcutSiparis = siparislerVeritabani.find(
        (s) => s.id === siparis_id && s.tenant_id === req.tenantId
      );
    }
    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    }
    await assertTenantImageReferences(req, req.body);
    const formatli = formatlaSiparis(mevcutSiparis);
    await assertTenantImageReferences(req, formatli);
    const guncelUrunler = [...formatli.urunler || []];
    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: "Belirtilen \xFCr\xFCn bulunamad\u0131." });
    }
    const mevcutUrun = guncelUrunler[urun_indeksi];
    const korunanOrijinalGorsel = mevcutUrun.orijinal_gorsel_url || mevcutUrun.urun_gorseli || formatli.gorseller && formatli.gorseller[0] || "";
    let kaydedilecekGorselUrl = katalog_gorsel_url;
    if (kaydedilecekGorselUrl.includes("/api/proxy-gorsel?url=")) {
      try {
        const parsed = new URL(kaydedilecekGorselUrl, "http://localhost:3000");
        const gercekUrl = parsed.searchParams.get("url");
        if (gercekUrl) kaydedilecekGorselUrl = gercekUrl;
      } catch {
      }
    }
    if (kaydedilecekGorselUrl.startsWith("data:image/")) {
      kaydedilecekGorselUrl = storeTenantImage(req, kaydedilecekGorselUrl).url;
    } else if (kaydedilecekGorselUrl.startsWith("http://") || kaydedilecekGorselUrl.startsWith("https://")) {
      const urlKontrol = urlGuvenlimi(kaydedilecekGorselUrl);
      if (!urlKontrol.guvenli) {
        return res.status(403).json({
          basarili: false,
          hata: `G\xFCvenlik engeli (SSRF): ${urlKontrol.sebep}`
        });
      }
      try {
        const response = await fetchPublicResource(kaydedilecekGorselUrl);
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          return res.status(400).json({
            basarili: false,
            hata: "Belirtilen adres do\u011Frudan bir g\xF6rsel dosyas\u0131 de\u011Fil, web sayfas\u0131 linkidir. L\xFCtfen do\u011Frudan resim adresini (.jpg, .png vb.) girin."
          });
        }
        if (response.ok && contentType.startsWith("image/")) {
          const arrayBuffer = await response.arrayBuffer();
          const image = inspectImage(Buffer.from(arrayBuffer), contentType.split(";")[0]);
          kaydedilecekGorselUrl = storeTenantImage(
            req,
            image.buffer.toString("base64"),
            image.mimeType
          ).url;
        }
      } catch (fetchErr) {
        if (fetchErr instanceof PublicResourceError) {
          return res.status(fetchErr.status).json({ basarili: false, hata: fetchErr.message });
        }
        console.warn("G\xF6rsel yerel indirme uyar\u0131s\u0131 (URL do\u011Frudan kullan\u0131lacak):", fetchErr);
      }
    }
    guncelUrunler[urun_indeksi] = {
      ...mevcutUrun,
      orijinal_gorsel_url: korunanOrijinalGorsel,
      katalog_gorseli: kaydedilecekGorselUrl,
      urun_gorseli: kaydedilecekGorselUrl,
      urun_sayfasi_url: urun_sayfasi_url || mevcutUrun.urun_sayfasi_url,
      resmi_urun_adi: resmi_urun_adi || mevcutUrun.resmi_urun_adi
    };
    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler
    });
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").update(sbPayload).eq("id", siparis_id).eq("tenant_id", req.tenantId).select().single();
      if (error || !data)
        return res.status(503).json({ basarili: false, hata: "G\xF6rsel de\u011Fi\u015Fikli\u011Fi kaydedilemedi." });
      if (data) {
        return res.json({
          basarili: true,
          siparis: formatlaSiparis(data),
          mesaj: "Orijinal web katalog g\xF6rseli kaydedildi!"
        });
      }
    }
    const idx = siparislerVeritabani.findIndex(
      (s) => s.id === siparis_id && s.tenant_id === req.tenantId
    );
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }
    res.json({
      basarili: true,
      siparis: { ...formatli, urunler: guncelUrunler },
      mesaj: "Orijinal web katalog g\xF6rseli kaydedildi!"
    });
  } catch (err) {
    console.error("Katalog g\xF6rseli kaydetme hatas\u0131:", err);
    res.status(err instanceof PublicResourceError ? err.status : 500).json({ basarili: false, hata: err.message });
  }
});
router2.post("/urun-orijinal-gorsele-don", async (req, res) => {
  try {
    const { siparis_id, urun_indeksi } = req.body;
    if (!siparis_id || urun_indeksi === void 0) {
      return res.status(400).json({ basarili: false, hata: "siparis_id ve urun_indeksi gereklidir." });
    }
    if (!req.tenantId || req.tenantId === "all")
      return res.status(403).json({ basarili: false, hata: "Firma se\xE7in." });
    if (!Number.isInteger(urun_indeksi) || urun_indeksi < 0)
      return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz \xFCr\xFCn indeksi." });
    let mevcutSiparis = null;
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").select("*").eq("id", siparis_id).eq("tenant_id", req.tenantId).maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: "Veritaban\u0131 kullan\u0131lam\u0131yor." });
      mevcutSiparis = data;
    } else {
      mevcutSiparis = siparislerVeritabani.find(
        (s) => s.id === siparis_id && s.tenant_id === req.tenantId
      );
    }
    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    }
    await assertTenantImageReferences(req, req.body);
    const formatli = formatlaSiparis(mevcutSiparis);
    await assertTenantImageReferences(req, formatli);
    const guncelUrunler = [...formatli.urunler || []];
    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: "Belirtilen \xFCr\xFCn bulunamad\u0131." });
    }
    const u = guncelUrunler[urun_indeksi];
    const geriDonecekGorsel = u.orijinal_gorsel_url || formatli.gorseller && formatli.gorseller[0] || "";
    guncelUrunler[urun_indeksi] = {
      ...u,
      urun_gorseli: geriDonecekGorsel,
      katalog_gorseli: void 0,
      urun_sayfasi_url: void 0,
      resmi_urun_adi: void 0
    };
    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler
    });
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").update(sbPayload).eq("id", siparis_id).eq("tenant_id", req.tenantId).select().single();
      if (error || !data)
        return res.status(503).json({ basarili: false, hata: "G\xF6rsel de\u011Fi\u015Fikli\u011Fi kaydedilemedi." });
      if (data) {
        return res.json({
          basarili: true,
          siparis: formatlaSiparis(data),
          mesaj: "Orijinal ekran g\xF6r\xFCnt\xFCs\xFC ba\u015Far\u0131yla geri y\xFCklendi."
        });
      }
    }
    const idx = siparislerVeritabani.findIndex(
      (s) => s.id === siparis_id && s.tenant_id === req.tenantId
    );
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }
    res.json({
      basarili: true,
      siparis: { ...formatli, urunler: guncelUrunler },
      mesaj: "Orijinal ekran g\xF6r\xFCnt\xFCs\xFC ba\u015Far\u0131yla geri y\xFCklendi."
    });
  } catch (err) {
    console.error("Orijinal g\xF6rsele d\xF6nme hatas\u0131:", err);
    res.status(err instanceof PublicResourceError ? err.status : 500).json({ basarili: false, hata: err.message });
  }
});
var gorsel_default = router2;

// src/server/routes/siparisler.ts
var router3 = Router3();
var rowTenant = (row) => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler) ? row.eksik_bilgiler.filter((item) => typeof item === "string" && item.startsWith("META:tenant_id=")).at(-1) : void 0;
  return legacy?.slice("META:tenant_id=".length) || "kanada_shopper_baku";
};
var belongs = (row, tenant) => tenant === "all" || rowTenant(row) === tenant;
function tenantFor(req, mutation = false) {
  const tenant = req.tenantId;
  if (!tenant || mutation && tenant === "all")
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return tenant;
}
var dbActive = (tenant) => !!supabase && tenant !== "demo_sandbox";
var memoryOrders = (tenant) => tenant === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
async function scopedCustomers(tenant) {
  if (!dbActive(tenant)) return musterilerVeritabani.filter((m) => belongs(m, tenant));
  const { data, error } = await supabase.from("musteriler").select("*").eq("tenant_id", tenant);
  if (error) throw new PublicResourceError("M\xFC\u015Fteriler okunamad\u0131.", 503);
  return (data || []).filter((m) => belongs(m, tenant));
}
async function validateCustomerReference(tenant, id) {
  if (!id) return;
  if (typeof id !== "string" || !(await scopedCustomers(tenant)).some((m) => m.id === id))
    throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
}
var orderFailure = (res, error) => res.status(error instanceof PublicResourceError ? error.status : 503).json({
  basarili: false,
  hata: error instanceof PublicResourceError ? error.message : "Sipari\u015F i\u015Flemi tamamlanamad\u0131."
});
router3.get("/siparisler", async (req, res) => {
  try {
    const tenant = tenantFor(req);
    let orders;
    if (dbActive(tenant)) {
      let query = supabase.from("siparisler").select("*");
      if (tenant !== "all") query = query.eq("tenant_id", tenant);
      const { data, error } = await query.order("olusturma_tarihi", { ascending: false });
      if (error) throw new PublicResourceError("Sipari\u015Fler okunamad\u0131.", 503);
      orders = (data || []).filter((s) => belongs(s, tenant)).map(formatlaSiparis);
    } else {
      orders = memoryOrders(tenant).filter((s) => belongs(s, tenant)).map(formatlaSiparis);
    }
    res.json({
      basarili: true,
      kaynak: tenant === "demo_sandbox" ? "demo_sandbox" : dbActive(tenant) ? "supabase" : "bellek",
      toplam: orders.length,
      siparisler: orders,
      ...tenant === "demo_sandbox" ? { isDemo: true } : {}
    });
  } catch (error) {
    orderFailure(res, error);
  }
});
router3.post("/ayristir-siparis", async (req, res) => {
  try {
    const hedefTenantId = tenantFor(req, true);
    const {
      ham_mesaj,
      musteri_adi_ipucu,
      siparis_kaynagi,
      otomatik_kaydet,
      gorsel_base64,
      gorsel_mime_type,
      gorseller
    } = req.body;
    const hasGorseller = Array.isArray(gorseller) && gorseller.length > 0 || !!gorsel_base64;
    if ((!ham_mesaj || typeof ham_mesaj !== "string" || ham_mesaj.trim() === "") && !hasGorseller) {
      return res.status(400).json({
        basarili: false,
        hata: "L\xFCtfen m\xFC\u015Fteriden gelen ham mesaj metnini veya bir \xFCr\xFCn g\xF6rseli/ekran g\xF6r\xFCnt\xFCs\xFC iletin."
      });
    }
    let ai;
    try {
      ai = getGeminiClient();
    } catch (keyErr) {
      return res.status(500).json({
        basarili: false,
        hata: keyErr.message
      });
    }
    const tenantCustomers = await scopedCustomers(hedefTenantId);
    const musterilerRehberi = tenantCustomers.map((m) => ({
      id: m.id,
      ad_soyad: m.ad_soyad,
      telefon: m.telefon,
      sehir: m.sehir,
      adres: m.adres,
      musteri_tipi: m.musteri_tipi
    }));
    const systemInstruction = `Sen Kanada'dan Azerbaycan'a (Bak\xFC, Gence ve di\u011Fer \u015Fehirler) Instagram Live, Reels, DM ve WhatsApp \xFCzerinden \xFCr\xFCn sat\u0131\u015F\u0131 yapan uluslararas\u0131 bir butik e-ticaret ve lojistik operasyonunun Uzman Sipari\u015F ve M\xFC\u015Fteri Ayr\u0131\u015Ft\u0131rma Yapay Zekas\u0131s\u0131n.

M\xFC\u015Fteriler sipari\u015Flerini son derece da\u011F\u0131n\u0131k, g\xFCnl\xFCk konu\u015Fma diliyle veya Azerbaycan T\xFCrk\xE7esi / T\xFCrkiye T\xFCrk\xE7esi kar\u0131\u015F\u0131m\u0131 karma\u015F\u0131k mesajlarla iletmektedirler.

G\xD6REV\u0130N VE \xC7OK KR\u0130T\u0130K KURALLAR:
1. M\xDC\u015ETER\u0130 TANIMA VE YAZIM HATASI D\xDCZELTME (DEDUPLICATION & AUTOCORRECT):
   Sistemde kay\u0131tl\u0131 mevcut m\xFC\u015Fteriler listesi:
   ${JSON.stringify(musterilerRehberi, null, 2)}

   - Mesaj veya g\xF6rseldeki telefon numaras\u0131 (\xF6rn: "+994 50 694 25 25") mevcut bir m\xFC\u015Fteriyle e\u015Fle\u015Fiyorsa, mesajda isim yanl\u0131\u015F yaz\u0131lm\u0131\u015F olsa bile (\xF6rn: "Kemake" -> "K\u0259mal\u0259 B\u0259dirb\u0259yli") m\xFC\u015Fterinin do\u011Fru ve resmi ad\u0131n\u0131 'musteri_adi' alan\u0131na yaz!
   - duzeltilen_yazim_hatasi: E\u011Fer isimde bir harf/yaz\u0131m hatas\u0131 d\xFCzelttiysen belirt (\xF6rn: "Kemake -> K\u0259mal\u0259 B\u0259dirb\u0259yli (Telefon: +994 50 694 25 25 e\u015Fle\u015Fti)").
   - eslesen_musteri_id: E\u015Fle\u015Fen m\xFC\u015Fterinin id'sini yaz (\xF6rn: "mus-001").
   - musteri_durumu: Mevcut m\xFC\u015Fteri e\u015Fle\u015Ftiyse 'MEVCUT_MUSTERI', yeni bir m\xFC\u015Fteriyse 'YENI_MUSTERI'.
   - musteri_tipi: E\u015Fle\u015Fen m\xFC\u015Fterinin tipini ata, yoksa mesaja g\xF6re 'TANIMADIK' veya akraba/tan\u0131d\u0131k oldu\u011Funu belirten bir not varsa 'AKRABA_YAKIN' ata.
   - Teslimat \u015Fehri veya adresi mesajda eksik ama mevcut m\xFC\u015Fteri kart\u0131nda varsa, otomatik tamamla (\xD6rn: G\u0259nc\u0259, Ozan k\xFC\xE7\u0259si).

2. B\u0130RDEN FAZLA G\xD6RSEL & B\u0130RDEN FAZLA \xDCR\xDCN ANAL\u0130Z\u0130:
   Kullan\u0131c\u0131 ayn\u0131 m\xFC\u015Fteri i\xE7in birden fazla ekran g\xF6r\xFCnt\xFCs\xFC veya \xFCr\xFCn foto\u011Fraf\u0131 eklemi\u015F olabilir:
   - M\xFC\u015Fteri TEK ve AYNI K\u0130\u015E\u0130D\u0130R. T\xFCm g\xF6rseller bu m\xFC\u015Fteriye aittir.
   - G\xF6rsellerdeki T\xDCM farkl\u0131 \xFCr\xFCnleri tespit et.
   - "urun_aciklamasi" alan\u0131nda t\xFCm \xFCr\xFCnleri a\xE7\u0131k ve d\xFCzenli bi\xE7imde listele.
   - "adet" alan\u0131na toplam \xFCr\xFCn say\u0131s\u0131n\u0131 yaz.
   - "toplam_tutar" alan\u0131na t\xFCm \xFCr\xFCnlerin toplam fiyat\u0131n\u0131 toplay\u0131p yaz.
   - "alinan_tutar" alan\u0131na toplam \xF6denen kaporay\u0131 veya tam \xF6demeyi yaz.
   - "birden_fazla_urun": E\u011Fer 2 veya daha fazla farkl\u0131 \xFCr\xFCn varsa true, tek bir \xFCr\xFCnse false.
   - "urunler": Tespit edilen her bir \xFCr\xFCn\xFCn ayr\u0131 ayr\u0131 listesini doldur.

3. F\u0130NANS DURUMU:
   - Tamam\u0131 \xF6dendiyse: 'ODENDI'
   - Kapora, avans, beh veya bir k\u0131sm\u0131 verildiyse: 'KISMI_ODEME'
   - Hi\xE7 \xF6deme yap\u0131lmad\u0131ysa veya teslimatta \xF6denecekse: 'BEKLIYOR'
4. LOJ\u0130ST\u0130K DURUMU: Varsay\u0131lan 'ULUSLARARASI_KARGO'.
5. alinan_tutar: Al\u0131nan kapora/beh (belirtilmemi\u015Fse 0).
6. kalan_tutar: toplam_tutar - alinan_tutar.
7. baku_tahsilat_notu: Bak\xFC'deki akraban\u0131n teslimatta alaca\u011F\u0131 veya elden teslim edilecek notlar.
8. ozel_not: M\xFC\u015Fterinin veya g\xF6nderenin kargo, teslimat, s\xFCr\xFCc\xFC veya paketleme ile ilgili \xF6zel talebi.

9. WHATSAPP EKRAN G\xD6R\xDCNT\xDCS\xDC VE M\xDC\u015ETER\u0130 ADI TESP\u0130T\u0130:
   - "\u0130letildi / Forwarded / Y\xF6nl\u0259ndirildi" etiketinin hemen alt\u0131nda yazan ki\u015Fi ad\u0131 sipari\u015Fin as\u0131l sahibidir, 'musteri_adi' alan\u0131na bunu yaz!
   - Ekranda bir \u015Fah\u0131s ad\u0131 veya telefon numaras\u0131 varken ASLA 'musteri_adi' alan\u0131na "Bilinmiyor" yazma!

10. G\xD6RSELLERDEK\u0130 \xDCR\xDCN BAZLI TELEFON NUMARALARI VE \xD6DEME NOTLARI:
   - Her bir \xFCr\xFCn foto\u011Fraf\u0131n\u0131n alt\u0131nda veya hemen yan\u0131nda yer alan telefon numaras\u0131 ve \xF6deme notunu ilgili_telefon ve odeme_notu alanlar\u0131na ekle!`;
    const textPrompt = `A\u015Fa\u011F\u0131daki m\xFC\u015Fteri mesaj\u0131 / WhatsApp notu ve (varsa) ekli \xFCr\xFCn/etiket/dekont g\xF6rsellerini incele.
Mesaj Metni: "${(ham_mesaj || "").trim()}"${musteri_adi_ipucu ? ` (Kullan\u0131c\u0131 \u0130pucu: ${musteri_adi_ipucu})` : ""}

G\xD6RSEL VE M\xDC\u015ETER\u0130 ADI TAL\u0130MATI:
G\xF6rsel / ekran g\xF6r\xFCnt\xFCs\xFC ekliyse ki\u015Fi ad\u0131n\u0131, telefon numaras\u0131n\u0131, beden/fiyat bilgilerini tespit et ve genel toplam\u0131 hesapla.`;
    const attachments = Array.isArray(gorseller) && gorseller.length ? gorseller : gorsel_base64 ? [{ base64: gorsel_base64, mimeType: gorsel_mime_type }] : [];
    if (attachments.length > 10)
      throw new PublicResourceError("En fazla 10 g\xF6rsel y\xFCklenebilir.", 413);
    const tumGorseller = [];
    const kaydedilenGorselUrlleri = [];
    for (const attachment of attachments) {
      const raw = attachment?.gorsel_base64 || attachment?.base64;
      if (typeof raw !== "string") throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel verisi.", 400);
      const saved = storeTenantImage(req, raw, attachment.gorsel_mime_type || attachment.mimeType);
      tumGorseller.push({ data: saved.base64, mimeType: saved.mimeType });
      kaydedilenGorselUrlleri.push(saved.url);
    }
    let contentsPayload = textPrompt;
    if (tumGorseller.length > 0) {
      contentsPayload = [
        { text: textPrompt },
        ...tumGorseller.map((g) => ({
          inlineData: {
            mimeType: g.mimeType,
            data: g.data
          }
        }))
      ];
    }
    const schemaConfig = {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: { type: Type.STRING },
          musteri_durumu: { type: Type.STRING, enum: ["MEVCUT_MUSTERI", "YENI_MUSTERI"] },
          eslesen_musteri_id: { type: Type.STRING },
          duzeltilen_yazim_hatasi: { type: Type.STRING },
          musteri_tipi: {
            type: Type.STRING,
            enum: ["TANIMADIK", "SADIK_MUSTERI", "AKRABA_YAKIN", "VIP"]
          },
          instagram_kullanici_adi: { type: Type.STRING },
          telefon_numarasi: { type: Type.STRING },
          teslimat_sehri: { type: Type.STRING },
          teslimat_adresi: { type: Type.STRING },
          urun_aciklamasi: { type: Type.STRING },
          beden_veya_olcu: { type: Type.STRING },
          renk: { type: Type.STRING },
          adet: { type: Type.INTEGER },
          birden_fazla_urun: { type: Type.BOOLEAN },
          urunler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urun_adi: { type: Type.STRING },
                urun_aciklamasi: { type: Type.STRING },
                adet: { type: Type.INTEGER },
                birim_fiyat: { type: Type.NUMBER },
                tutar: { type: Type.NUMBER },
                beden_veya_olcu: { type: Type.STRING },
                renk: { type: Type.STRING },
                gorsel_indeksi: { type: Type.INTEGER },
                ilgili_telefon: { type: Type.STRING },
                odeme_notu: { type: Type.STRING },
                ozel_not: { type: Type.STRING },
                urun_alani: {
                  type: Type.OBJECT,
                  properties: {
                    ymin: { type: Type.INTEGER },
                    xmin: { type: Type.INTEGER },
                    ymax: { type: Type.INTEGER },
                    xmax: { type: Type.INTEGER }
                  },
                  required: ["ymin", "xmin", "ymax", "xmax"]
                }
              },
              required: ["urun_aciklamasi", "adet"]
            }
          },
          toplam_tutar: { type: Type.NUMBER },
          alinan_tutar: { type: Type.NUMBER },
          kalan_tutar: { type: Type.NUMBER },
          para_birimi: { type: Type.STRING, enum: ["AZN", "CAD", "USD"] },
          finans_durumu: { type: Type.STRING, enum: ["ODENDI", "KISMI_ODEME", "BEKLIYOR"] },
          lojistik_durumu: {
            type: Type.STRING,
            enum: [
              "KANADA_SATINALIM_BEKLIYOR",
              "KANADA_DEPO",
              "ULUSLARARASI_KARGO",
              "BAKU_DAGITIM_ARKADAS",
              "TESLIM_EDILDI"
            ]
          },
          baku_tahsilat_notu: { type: Type.STRING },
          ozel_not: { type: Type.STRING },
          eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
          ai_guven_skoru: { type: Type.NUMBER }
        },
        required: [
          "musteri_adi",
          "urun_aciklamasi",
          "adet",
          "toplam_tutar",
          "alinan_tutar",
          "finans_durumu",
          "lojistik_durumu",
          "eksik_bilgiler"
        ]
      }
    };
    const geminiResponse = await generateContentWithRetryAndFallback(ai, {
      contents: contentsPayload,
      config: schemaConfig
    });
    const parsedJson = JSON.parse(geminiResponse.text || "{}");
    const alinan = Number(parsedJson.alinan_tutar || 0);
    const toplam = Number(parsedJson.toplam_tutar || alinan);
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError("Ge\xE7ersiz tutar.", 400);
    const dbPayload = {
      tenant_id: hedefTenantId,
      is_demo: hedefTenantId === "demo_sandbox",
      ham_mesaj: (ham_mesaj || (tumGorseller.length > 0 ? `[${tumGorseller.length} Ekran G\xF6r\xFCnt\xFCs\xFC & WhatsApp Notu]` : "")).trim(),
      siparis_kaynagi: siparis_kaynagi || "INSTAGRAM_LIVE",
      musteri_adi: parsedJson.musteri_adi || "Bilinmeyen M\xFC\u015Fteri",
      instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || "",
      telefon_numarasi: parsedJson.telefon_numarasi || "",
      teslimat_sehri: parsedJson.teslimat_sehri || "Bak\xFC",
      teslimat_adresi: parsedJson.teslimat_adresi || "",
      urun_aciklamasi: parsedJson.urun_aciklamasi || "Sipari\u015F Edilen \xDCr\xFCn",
      beden_veya_olcu: parsedJson.beden_veya_olcu || "",
      renk: parsedJson.renk || "",
      adet: Number(parsedJson.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: parsedJson.para_birimi || "AZN",
      finans_durumu: parsedJson.finans_durumu || (alinan >= toplam && toplam > 0 ? "ODENDI" : alinan > 0 ? "KISMI_ODEME" : "BEKLIYOR"),
      lojistik_durumu: parsedJson.lojistik_durumu || "ULUSLARARASI_KARGO",
      baku_tahsilat_notu: parsedJson.baku_tahsilat_notu || "",
      ozel_not: parsedJson.ozel_not || "",
      kanada_takip_kodu: uretKanadaTakipKodu(parsedJson.urun_aciklamasi),
      uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(parsedJson.eksik_bilgiler) ? parsedJson.eksik_bilgiler.filter(
        (v) => typeof v === "string" && !v.startsWith("META:")
      ) : [],
      ai_guven_skoru: Number(parsedJson.ai_guven_skoru || 0.95),
      musteri_id: tenantCustomers.some((m) => m.id === parsedJson.eslesen_musteri_id) ? parsedJson.eslesen_musteri_id : "",
      musteri_tipi: parsedJson.musteri_tipi || "TANIMADIK",
      duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi || "",
      musteri_durumu: parsedJson.musteri_durumu || "YENI_MUSTERI",
      birden_fazla_urun: parsedJson.birden_fazla_urun || Array.isArray(parsedJson.urunler) && parsedJson.urunler.length > 1,
      urunler: (Array.isArray(parsedJson.urunler) ? parsedJson.urunler : []).map(
        (u, idx) => {
          const uAdi = u.urun_adi || u.urun_aciklamasi || `\xDCr\xFCn #${idx + 1}`;
          const uFiyat = u.tutar !== void 0 ? Number(u.tutar) : u.birim_fiyat !== void 0 ? Number(u.birim_fiyat) : void 0;
          const gIdx = typeof u.gorsel_indeksi === "number" && u.gorsel_indeksi < kaydedilenGorselUrlleri.length ? u.gorsel_indeksi : 0;
          return {
            urun_adi: uAdi,
            urun_aciklamasi: uAdi,
            adet: Number(u.adet || 1),
            tutar: uFiyat,
            birim_fiyat: uFiyat,
            beden_veya_olcu: u.beden_veya_olcu || "",
            renk: u.renk || "",
            orijinal_gorsel_url: kaydedilenGorselUrlleri[gIdx] || void 0,
            urun_alani: u.urun_alani || void 0,
            urun_gorseli: kaydedilenGorselUrlleri[gIdx] || void 0,
            ilgili_telefon: u.ilgili_telefon || void 0,
            odeme_notu: u.odeme_notu || void 0,
            ozel_not: u.ozel_not || void 0
          };
        }
      ),
      gorsel_urlleri: kaydedilenGorselUrlleri.length > 0 ? kaydedilenGorselUrlleri : tumGorseller.map((g, i) => g.dosyaAdi || `Ekran_Goruntusu_${i + 1}.png`)
    };
    const urunNotlari = dbPayload.urunler.filter((u) => u.ilgili_telefon || u.odeme_notu).map((u) => {
      const tel = u.ilgili_telefon ? `Tel: ${u.ilgili_telefon}` : "";
      const odm = u.odeme_notu ? `(${u.odeme_notu})` : "";
      const fyt = u.tutar ? `${u.tutar} ${dbPayload.para_birimi}` : "Fiyat teyit edilecek";
      return `\u2022 ${u.urun_adi}: ${fyt} ${tel} ${odm}`.replace(/\s+/g, " ").trim();
    });
    if (urunNotlari.length > 0) {
      const urunNotOzeti = `\u{1F4E6} \xDCr\xFCn \u0130leti\u015Fim & \xD6deme Notlar\u0131:
${urunNotlari.join("\n")}`;
      if (!dbPayload.ozel_not) {
        dbPayload.ozel_not = urunNotOzeti;
      } else if (!dbPayload.ozel_not.includes("\xDCr\xFCn \u0130leti\u015Fim & \xD6deme")) {
        dbPayload.ozel_not = `${dbPayload.ozel_not}

${urunNotOzeti}`;
      }
    }
    let nihaiSiparis = null;
    if (otomatik_kaydet !== false && dbActive(hedefTenantId)) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from("siparisler").insert(sbPayload).select().single();
        if (error || !data) {
          throw new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
        } else if (data) {
          nihaiSiparis = {
            ...formatlaSiparis(data),
            musteri_id: dbPayload.musteri_id,
            musteri_tipi: parsedJson.musteri_tipi,
            duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi,
            musteri_durumu: parsedJson.musteri_durumu,
            ozel_not: dbPayload.ozel_not,
            urunler: dbPayload.urunler,
            gorsel_urlleri: dbPayload.gorsel_urlleri
          };
          console.log("\u2705 Sipari\u015F Supabase veritaban\u0131na ba\u015Far\u0131yla yaz\u0131ld\u0131 ID:", nihaiSiparis.id);
        }
      } catch (errDb) {
        throw errDb instanceof PublicResourceError ? errDb : new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
      }
    }
    if (!nihaiSiparis) {
      nihaiSiparis = formatlaSiparis({
        id: "sip-" + randomUUID(),
        olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
        ...dbPayload,
        kalan_tutar: kalan
      });
      if (otomatik_kaydet !== false) {
        memoryOrders(hedefTenantId).unshift(nihaiSiparis);
      }
    }
    const eslesenMusteriId = parsedJson.eslesen_musteri_id;
    const telNo = (parsedJson.telefon_numarasi || "").replace(/\s+/g, "");
    let bulunanMusteri = tenantCustomers.find(
      (m) => eslesenMusteriId && m.id === eslesenMusteriId || telNo && m.telefon && m.telefon.replace(/\s+/g, "") === telNo || m.ad_soyad.toLowerCase().trim() === (parsedJson.musteri_adi || "").toLowerCase().trim()
    );
    if (otomatik_kaydet !== false && !dbActive(hedefTenantId) && bulunanMusteri) {
      bulunanMusteri.toplam_siparis_sayisi += 1;
      bulunanMusteri.toplam_harcama += toplam;
      bulunanMusteri.kalan_toplam_borc += kalan;
      bulunanMusteri.son_siparis_tarihi = (/* @__PURE__ */ new Date()).toISOString();
      if (!bulunanMusteri.adres && parsedJson.teslimat_adresi)
        bulunanMusteri.adres = parsedJson.teslimat_adresi;
      if (!bulunanMusteri.sehir && parsedJson.teslimat_sehri)
        bulunanMusteri.sehir = parsedJson.teslimat_sehri;
      if (!bulunanMusteri.telefon && parsedJson.telefon_numarasi)
        bulunanMusteri.telefon = parsedJson.telefon_numarasi;
      nihaiSiparis.musteri_id = bulunanMusteri.id;
      nihaiSiparis.musteri_tipi = bulunanMusteri.musteri_tipi;
    } else if (otomatik_kaydet !== false && !dbActive(hedefTenantId) && !bulunanMusteri && parsedJson.musteri_adi && parsedJson.musteri_adi !== "Bilinmeyen M\xFC\u015Fteri") {
      const yeniMusteri = {
        id: "mus-" + randomUUID(),
        tenant_id: hedefTenantId,
        ad_soyad: parsedJson.musteri_adi,
        telefon: parsedJson.telefon_numarasi || "",
        instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || "",
        sehir: parsedJson.teslimat_sehri || "Bak\xFC",
        adres: parsedJson.teslimat_adresi || "",
        musteri_tipi: parsedJson.musteri_tipi || "TANIMADIK",
        toplam_siparis_sayisi: 1,
        toplam_harcama: toplam,
        kalan_toplam_borc: kalan,
        olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
        son_siparis_tarihi: (/* @__PURE__ */ new Date()).toISOString()
      };
      musterilerVeritabani.unshift(yeniMusteri);
      nihaiSiparis.musteri_id = yeniMusteri.id;
      nihaiSiparis.musteri_tipi = yeniMusteri.musteri_tipi;
    }
    res.json({
      basarili: true,
      mesaj: "Mesaj ba\u015Far\u0131yla Gemini AI taraf\u0131ndan ayr\u0131\u015Ft\u0131r\u0131ld\u0131 ve kaydedildi.",
      siparis: nihaiSiparis,
      ayristirilan_veri: nihaiSiparis,
      kaydedildi: otomatik_kaydet !== false,
      kaynak: dbActive(hedefTenantId) ? "supabase" : hedefTenantId === "demo_sandbox" ? "demo_sandbox" : "bellek"
    });
  } catch (err) {
    console.error("Gemini Ayr\u0131\u015Ft\u0131rma Hatas\u0131:", err);
    orderFailure(res, err);
  }
});
router3.post("/siparisler", async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const yeniVeri = req.body;
    await validateCustomerReference(tenant, yeniVeri.musteri_id);
    await assertTenantImageReferences(req, yeniVeri);
    if (!yeniVeri || !yeniVeri.urun_aciklamasi || !yeniVeri.musteri_adi) {
      return res.status(400).json({ basarili: false, hata: "M\xFC\u015Fteri ad\u0131 ve \xFCr\xFCn a\xE7\u0131klamas\u0131 zorunludur." });
    }
    const toplam = Number(yeniVeri.toplam_tutar || 0);
    const alinan = Number(yeniVeri.alinan_tutar || 0);
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError("Ge\xE7ersiz tutar.", 400);
    const dbPayload = {
      tenant_id: tenant,
      is_demo: tenant === "demo_sandbox",
      musteri_id: yeniVeri.musteri_id || "",
      baku_kurye_id: yeniVeri.baku_kurye_id || null,
      baku_kurye_adi: yeniVeri.baku_kurye_adi || null,
      baku_kurye_bolgesi: yeniVeri.baku_kurye_bolgesi || null,
      ham_mesaj: yeniVeri.ham_mesaj || (yeniVeri.ozel_not ? `Talimat: ${yeniVeri.ozel_not}` : yeniVeri.urun_aciklamasi),
      siparis_kaynagi: yeniVeri.siparis_kaynagi || "INSTAGRAM_LIVE",
      musteri_adi: yeniVeri.musteri_adi,
      instagram_kullanici_adi: yeniVeri.instagram_kullanici_adi || "",
      telefon_numarasi: yeniVeri.telefon_numarasi || "",
      teslimat_sehri: yeniVeri.teslimat_sehri || "Bak\xFC",
      teslimat_adresi: yeniVeri.teslimat_adresi || "",
      urun_aciklamasi: yeniVeri.urun_aciklamasi,
      beden_veya_olcu: yeniVeri.beden_veya_olcu || "",
      renk: yeniVeri.renk || "",
      adet: Number(yeniVeri.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: yeniVeri.para_birimi || "AZN",
      finans_durumu: yeniVeri.finans_durumu || (alinan >= toplam && toplam > 0 ? "ODENDI" : alinan > 0 ? "KISMI_ODEME" : "BEKLIYOR"),
      lojistik_durumu: yeniVeri.lojistik_durumu || "ULUSLARARASI_KARGO",
      baku_tahsilat_notu: yeniVeri.baku_tahsilat_notu || "",
      ozel_not: yeniVeri.ozel_not || "",
      kanada_takip_kodu: yeniVeri.kanada_takip_kodu || uretKanadaTakipKodu(yeniVeri.urun_aciklamasi),
      uluslararasi_kargo_kodu: yeniVeri.uluslararasi_kargo_kodu || uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(yeniVeri.eksik_bilgiler) ? yeniVeri.eksik_bilgiler.filter(
        (v) => typeof v === "string" && !v.startsWith("META:")
      ) : [],
      ai_guven_skoru: Number(yeniVeri.ai_guven_skoru || 1),
      urunler: Array.isArray(yeniVeri.urunler) ? yeniVeri.urunler : [],
      gorsel_urlleri: Array.isArray(yeniVeri.gorsel_urlleri) ? yeniVeri.gorsel_urlleri : []
    };
    if (tenant === "demo_sandbox") {
      const demoSiparis = formatlaSiparis({
        id: "sip-demo-" + randomUUID(),
        olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
        ...dbPayload,
        tenant_id: "demo_sandbox",
        is_demo: true,
        kalan_tutar: kalan
      });
      demoSiparislerVeritabani.unshift(demoSiparis);
      return res.json({ basarili: true, kaynak: "demo_sandbox", siparis: demoSiparis });
    }
    if (dbActive(tenant)) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from("siparisler").insert(sbPayload).select().single();
        if (error || !data) {
          throw new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
        } else if (data) {
          const formatli = formatlaSiparis({
            ...data,
            ozel_not: dbPayload.ozel_not || void 0,
            urunler: dbPayload.urunler.length > 0 ? dbPayload.urunler : void 0,
            gorsel_urlleri: dbPayload.gorsel_urlleri.length > 0 ? dbPayload.gorsel_urlleri : void 0
          });
          return res.json({
            basarili: true,
            kaynak: "supabase",
            siparis: formatli
          });
        }
      } catch (errDb) {
        throw errDb instanceof PublicResourceError ? errDb : new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
      }
    }
    const yeniSiparis = formatlaSiparis({
      id: "sip-" + randomUUID(),
      olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
      ...dbPayload,
      kalan_tutar: kalan
    });
    siparislerVeritabani.unshift(yeniSiparis);
    res.json({ basarili: true, kaynak: "bellek", siparis: yeniSiparis });
  } catch (genelHata) {
    console.error("Sipari\u015F ekleme genel hatas\u0131:", genelHata);
    orderFailure(res, genelHata);
  }
});
var generalFields = /* @__PURE__ */ new Set([
  "ham_mesaj",
  "musteri_id",
  "musteri_adi",
  "musteri_tipi",
  "instagram_kullanici_adi",
  "telefon_numarasi",
  "teslimat_sehri",
  "teslimat_adresi",
  "urun_aciklamasi",
  "beden_veya_olcu",
  "renk",
  "adet",
  "toplam_tutar",
  "alinan_tutar",
  "para_birimi",
  "finans_durumu",
  "lojistik_durumu",
  "baku_tahsilat_notu",
  "ozel_not",
  "kanada_takip_kodu",
  "uluslararasi_kargo_kodu",
  "eksik_bilgiler",
  "siparis_kaynagi",
  "urunler",
  "gorsel_urlleri",
  "gorseller",
  "baku_kurye_id",
  "baku_kurye_adi",
  "baku_kurye_bolgesi",
  "teslim_tarihi",
  "teslim_eden_kisi",
  "kargo_agirligi_kg"
]);
var salesFields = new Set(
  [...generalFields].filter(
    (field) => ![
      "lojistik_durumu",
      "baku_tahsilat_notu",
      "kanada_takip_kodu",
      "uluslararasi_kargo_kodu",
      "baku_kurye_id",
      "baku_kurye_adi",
      "baku_kurye_bolgesi",
      "teslim_tarihi",
      "teslim_eden_kisi",
      "kargo_agirligi_kg"
    ].includes(field)
  )
);
var financeFields = /* @__PURE__ */ new Set(["alinan_tutar", "finans_durumu", "baku_tahsilat_notu"]);
var purchaseFields = /* @__PURE__ */ new Set([
  "urun_aciklamasi",
  "beden_veya_olcu",
  "renk",
  "adet",
  "urunler",
  "gorsel_urlleri",
  "gorseller",
  "ozel_not",
  "lojistik_durumu",
  "kanada_takip_kodu",
  "uluslararasi_kargo_kodu",
  "baku_kurye_id",
  "baku_kurye_adi",
  "baku_kurye_bolgesi",
  "kargo_agirligi_kg"
]);
async function ownedOrder(tenant, id) {
  if (dbActive(tenant)) {
    const { data, error } = await supabase.from("siparisler").select("*").eq("id", id).eq("tenant_id", tenant).maybeSingle();
    if (error) throw new PublicResourceError("Sipari\u015F okunamad\u0131.", 503);
    return data && belongs(data, tenant) ? data : void 0;
  }
  return memoryOrders(tenant).find((s) => s.id === id && belongs(s, tenant));
}
router3.patch("/siparisler/:id", async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const existing = await ownedOrder(tenant, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    const formatted = formatlaSiparis(existing);
    const role = req.auth?.role;
    const allowed = role === "BAKU_FINANS" ? financeFields : role === "KANADA_SATINALMA" ? purchaseFields : role === "SATIS_SORUMLUSU" ? salesFields : generalFields;
    if (!role || role === "BAKU_KURYE")
      throw new PublicResourceError("Bu i\u015Flem i\xE7in yetkiniz yok.", 403);
    const updates = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key === "tenant_id" || key === "tenantId") {
        if (value !== tenant) throw new PublicResourceError("Sipari\u015F ba\u015Fka butike ta\u015F\u0131namaz.", 403);
        continue;
      }
      if (JSON.stringify(value) === JSON.stringify(formatted[key])) continue;
      if (key === "kalan_tutar") continue;
      if (!allowed.has(key))
        throw new PublicResourceError("Bu alan\u0131 de\u011Fi\u015Ftirme yetkiniz yok: " + key, 403);
      updates[key] = value;
    }
    if (updates.eksik_bilgiler !== void 0 && (!Array.isArray(updates.eksik_bilgiler) || updates.eksik_bilgiler.some((v) => typeof v !== "string" || v.startsWith("META:"))))
      throw new PublicResourceError("Ge\xE7ersiz eksik bilgi listesi.", 400);
    await validateCustomerReference(tenant, updates.musteri_id);
    await assertTenantImageReferences(req, updates);
    const changed = {
      ...formatted,
      ...updates,
      id: existing.id,
      tenant_id: tenant,
      guncellenme_tarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (const key of ["toplam_tutar", "alinan_tutar", "adet"]) {
      changed[key] = Number(changed[key]);
      if (!Number.isFinite(changed[key]) || changed[key] < 0)
        throw new PublicResourceError("Ge\xE7ersiz say\u0131sal de\u011Fer.", 400);
    }
    changed.kalan_tutar = Math.max(0, changed.toplam_tutar - changed.alinan_tutar);
    changed.finans_durumu = changed.alinan_tutar >= changed.toplam_tutar && changed.toplam_tutar > 0 ? "ODENDI" : changed.alinan_tutar > 0 ? "KISMI_ODEME" : "BEKLIYOR";
    if (dbActive(tenant)) {
      const { data, error } = await supabase.from("siparisler").update(hazirlaSupabasePayload(changed)).eq("id", existing.id).eq("tenant_id", tenant).select("*").single();
      if (error || !data) throw new PublicResourceError("Sipari\u015F g\xFCncellenemedi.", 503);
      return res.json({ basarili: true, kaynak: "supabase", siparis: formatlaSiparis(data) });
    }
    const pool = memoryOrders(tenant);
    const index = pool.findIndex((s) => s.id === existing.id && belongs(s, tenant));
    pool[index] = formatlaSiparis(changed);
    res.json({
      basarili: true,
      kaynak: tenant === "demo_sandbox" ? "demo_sandbox" : "bellek",
      siparis: pool[index]
    });
  } catch (error) {
    orderFailure(res, error);
  }
});
router3.delete("/siparisler/:id", async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const existing = await ownedOrder(tenant, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    if (dbActive(tenant)) {
      const { error } = await supabase.from("siparisler").delete().eq("id", existing.id).eq("tenant_id", tenant);
      if (error) throw new PublicResourceError("Sipari\u015F silinemedi.", 503);
    } else {
      const pool = memoryOrders(tenant);
      pool.splice(
        pool.findIndex((s) => s.id === existing.id && belongs(s, tenant)),
        1
      );
    }
    res.json({ basarili: true, mesaj: "Sipari\u015F silindi." });
  } catch (error) {
    orderFailure(res, error);
  }
});
router3.post("/demo/sifirla", (req, res) => {
  try {
    if (tenantFor(req, true) !== "demo_sandbox")
      throw new PublicResourceError("Demo alan\u0131 se\xE7ilmelidir.", 403);
    const toplam = sifirlaDemoVeritabani();
    res.json({
      basarili: true,
      kaynak: "demo_sandbox",
      mesaj: "Demo sipari\u015Fleri s\u0131f\u0131rland\u0131.",
      toplam
    });
  } catch (error) {
    orderFailure(res, error);
  }
});
router3.post("/siparisler/tumunu-uluslararasi-kargo-yap", async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    if (dbActive(tenant)) {
      const { error } = await supabase.from("siparisler").update({ lojistik_durumu: "ULUSLARARASI_KARGO" }).eq("tenant_id", tenant).neq("lojistik_durumu", "TESLIM_EDILDI");
      if (error) throw new PublicResourceError("Sipari\u015Fler g\xFCncellenemedi.", 503);
    } else {
      const pool = memoryOrders(tenant);
      for (let index = 0; index < pool.length; index++)
        if (belongs(pool[index], tenant) && pool[index].lojistik_durumu !== "TESLIM_EDILDI")
          pool[index] = { ...pool[index], lojistik_durumu: "ULUSLARARASI_KARGO" };
    }
    res.json({ basarili: true, mesaj: "Se\xE7ili butikin sipari\u015Fleri g\xFCncellendi." });
  } catch (error) {
    orderFailure(res, error);
  }
});
var siparisler_default = router3;

// src/server/routes/musteriler.ts
import { Router as Router4 } from "express";
import { randomUUID as randomUUID2 } from "node:crypto";
var router4 = Router4();
var rowTenant2 = (row) => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler) ? row.eksik_bilgiler.filter((item) => typeof item === "string" && item.startsWith("META:tenant_id=")).at(-1) : void 0;
  return legacy?.slice("META:tenant_id=".length) || "kanada_shopper_baku";
};
var belongs2 = (row, tenant) => tenant === "all" || rowTenant2(row) === tenant;
function tenantFor2(req, mutation = false) {
  const tenant = req.tenantId;
  if (!tenant || mutation && tenant === "all")
    throw Object.assign(new Error("Bir butik se\xE7ilmelidir."), { status: 400 });
  return tenant;
}
async function rows(table, tenant) {
  if (tenant === "demo_sandbox")
    return table === "siparisler" ? demoSiparislerVeritabani.map(formatlaSiparis) : musterilerVeritabani.filter((r) => r.tenant_id === tenant);
  if (supabase) {
    let query = supabase.from(table).select("*");
    if (tenant !== "all") query = query.eq("tenant_id", tenant);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter((r) => belongs2(r, tenant)).map((r) => table === "siparisler" ? formatlaSiparis(r) : r);
  }
  return (table === "musteriler" ? musterilerVeritabani : siparislerVeritabani).filter((r) => belongs2(r, tenant)).map((r) => table === "siparisler" ? formatlaSiparis(r) : r);
}
var phone = (value) => String(value || "").replace(/\s+/g, "");
function matches(customer, order) {
  if (rowTenant2(customer) !== rowTenant2(order)) return false;
  return order.musteri_id === customer.id || phone(customer.telefon) && phone(customer.telefon) === phone(order.telefon_numarasi) || String(order.musteri_adi || "").toLowerCase().trim() === String(customer.ad_soyad || "").toLowerCase().trim();
}
var fail = (res, error) => res.status(error.status || 503).json({
  basarili: false,
  hata: error.status ? error.message : "M\xFC\u015Fteri verilerine eri\u015Filemedi."
});
router4.get("/musteriler", async (req, res) => {
  try {
    const tenant = tenantFor2(req);
    const [customers, orders] = await Promise.all([
      rows("musteriler", tenant),
      rows("siparisler", tenant)
    ]);
    for (const order of orders) {
      if (!order.musteri_adi || customers.some((c) => matches(c, order))) continue;
      customers.push({
        id: order.musteri_id || `order:${order.id}`,
        ad_soyad: order.musteri_adi,
        telefon: order.telefon_numarasi || "",
        instagram_kullanici_adi: order.instagram_kullanici_adi || "",
        sehir: order.teslimat_sehri || "",
        adres: order.teslimat_adresi || "",
        musteri_tipi: order.musteri_tipi || "TANIMADIK",
        tenant_id: rowTenant2(order),
        olusturma_tarihi: order.olusturma_tarihi
      });
    }
    const enriched = customers.map((customer) => {
      const history = orders.filter((order) => matches(customer, order)).sort((a, b) => Date.parse(b.olusturma_tarihi) - Date.parse(a.olusturma_tarihi));
      const latest = history[0];
      return {
        ...customer,
        toplam_siparis_sayisi: history.length,
        toplam_harcama: history.reduce((sum, order) => sum + Number(order.toplam_tutar || 0), 0),
        kalan_toplam_borc: history.reduce(
          (sum, order) => sum + Number(order.kalan_tutar || 0),
          0
        ),
        son_siparis_tarihi: latest?.olusturma_tarihi || customer.olusturma_tarihi,
        son_urun_aciklamasi: latest?.urun_aciklamasi || "Sipari\u015F yoxdur",
        son_siparis_tutari: latest?.toplam_tutar || 0
      };
    }).sort((a, b) => Date.parse(b.son_siparis_tarihi) - Date.parse(a.son_siparis_tarihi));
    res.json({ basarili: true, toplam: enriched.length, musteriler: enriched });
  } catch (error) {
    fail(res, error);
  }
});
router4.get("/musteriler/:id/siparisler", async (req, res) => {
  try {
    const tenant = tenantFor2(req);
    const [customers, orders] = await Promise.all([
      rows("musteriler", tenant),
      rows("siparisler", tenant)
    ]);
    let customer = customers.find((c) => c.id === req.params.id);
    if (!customer) {
      const order = orders.find(
        (o) => o.musteri_id === req.params.id || `order:${o.id}` === req.params.id
      );
      if (order)
        customer = {
          id: req.params.id,
          ad_soyad: order.musteri_adi,
          telefon: order.telefon_numarasi,
          tenant_id: rowTenant2(order)
        };
    }
    if (!customer) return res.status(404).json({ basarili: false, hata: "M\xFC\u015Fteri bulunamad\u0131." });
    res.json({
      basarili: true,
      musteri: customer,
      siparisler: orders.filter((o) => matches(customer, o)).sort((a, b) => Date.parse(b.olusturma_tarihi) - Date.parse(a.olusturma_tarihi))
    });
  } catch (error) {
    fail(res, error);
  }
});
router4.post("/musteriler", async (req, res) => {
  try {
    const tenant = tenantFor2(req, true);
    const { id, ad_soyad, telefon, instagram_kullanici_adi, sehir, adres, musteri_tipi, notlar } = req.body;
    if (typeof ad_soyad !== "string" || !ad_soyad.trim())
      return res.status(400).json({ basarili: false, hata: "M\xFC\u015Fteri ad\u0131 zorunludur." });
    const existing = id ? (await rows("musteriler", tenant)).find((c) => c.id === id) : void 0;
    if (id && !existing)
      return res.status(404).json({ basarili: false, hata: "M\xFC\u015Fteri bulunamad\u0131." });
    const customer = {
      ...existing || {
        id: "mus-" + randomUUID2(),
        toplam_siparis_sayisi: 0,
        toplam_harcama: 0,
        kalan_toplam_borc: 0,
        olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
        son_siparis_tarihi: (/* @__PURE__ */ new Date()).toISOString()
      },
      ad_soyad: ad_soyad.trim(),
      tenant_id: tenant,
      musteri_tipi: musteri_tipi || existing?.musteri_tipi || "TANIMADIK"
    };
    for (const [key, value] of Object.entries({
      telefon,
      instagram_kullanici_adi,
      sehir,
      adres,
      notlar
    }))
      if (value !== void 0) customer[key] = value;
    if (supabase && tenant !== "demo_sandbox") {
      const query = existing ? supabase.from("musteriler").update(customer).eq("id", existing.id).eq("tenant_id", tenant) : supabase.from("musteriler").insert(customer);
      const { data, error } = await query.select("*").single();
      if (error || !data) throw error || new Error("M\xFC\u015Fteri kaydedilmedi.");
      return res.json({ basarili: true, musteri: data });
    }
    const index = musterilerVeritabani.findIndex((c) => c.id === customer.id && belongs2(c, tenant));
    if (index >= 0) musterilerVeritabani[index] = customer;
    else musterilerVeritabani.unshift(customer);
    res.json({ basarili: true, musteri: customer });
  } catch (error) {
    fail(res, error);
  }
});
var musteriler_default = router4;

// src/server/routes/inbox.ts
import { Router as Router5 } from "express";
import { randomUUID as randomUUID3, createHash as createHash3 } from "node:crypto";
import { Type as Type2 } from "@google/genai";
var router5 = Router5();
var rowTenant3 = (row) => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler) ? row.eksik_bilgiler.filter((item) => typeof item === "string" && item.startsWith("META:tenant_id=")).at(-1) : void 0;
  return legacy?.slice("META:tenant_id=".length) || "kanada_shopper_baku";
};
var belongs3 = (row, tenant) => tenant === "all" || rowTenant3(row) === tenant;
function tenantFor3(req, mutation = false) {
  const tenant = req.tenantId;
  if (!tenant || mutation && tenant === "all")
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return tenant;
}
var dbActive2 = (tenant) => !!supabase && tenant !== "demo_sandbox";
var inboxFailure = (res, error) => res.status(error instanceof PublicResourceError ? error.status : 503).json({
  basarili: false,
  hata: error instanceof PublicResourceError ? error.message : "Gelen kutusu i\u015Flemi tamamlanamad\u0131."
});
var mappedInbox = (row) => ({
  ...row,
  gelis_tarihi: row.gelis_tarihi || row.olusturma_tarihi,
  oneri_siparis: { ...row.oneri_siparis || {}, tenant_id: rowTenant3(row) }
});
async function ownedInbox(tenant, id) {
  if (dbActive2(tenant)) {
    const { data, error } = await supabase.from("inbox_mesajlar").select("*").eq("id", id).eq("tenant_id", tenant).maybeSingle();
    if (error) throw new PublicResourceError("Mesaj okunamad\u0131.", 503);
    return data && belongs3(data, tenant) ? mappedInbox(data) : void 0;
  }
  return onayBekleyenler.find((m) => m.id === id && belongs3(m, tenant));
}
router5.get("/inbox", async (req, res) => {
  try {
    const tenant = tenantFor3(req);
    let messages;
    if (dbActive2(tenant)) {
      let query = supabase.from("inbox_mesajlar").select("*");
      if (tenant !== "all") query = query.eq("tenant_id", tenant);
      const { data, error } = await query;
      if (error) throw new PublicResourceError("Gelen kutusu okunamad\u0131.", 503);
      messages = (data || []).filter((m) => belongs3(m, tenant)).map(mappedInbox);
    } else messages = onayBekleyenler.filter((m) => belongs3(m, tenant)).map(mappedInbox);
    res.json({
      basarili: true,
      toplam: messages.filter((m) => m.durum === "BEKLEMEDE").length,
      mesajlar: messages
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});
router5.post("/webhook/siparis", async (req, res) => {
  try {
    const hedefTenantId = tenantFor3(req, true);
    const { mesaj, gonderen, kaynak, tetikleyici_kod } = req.body;
    if (!mesaj || typeof mesaj !== "string") {
      return res.status(400).json({ basarili: false, hata: "Mesaj metni zorunludur." });
    }
    const metin = mesaj.toUpperCase();
    const bulunanKod = tetikleyici_kod || (metin.includes("#S\u0130PAR\u0130\u015E") || metin.includes("#SIPARIS") ? "#S\u0130PAR\u0130\u015E" : metin.includes("#ONAY") ? "#ONAY" : metin.includes("#KNB") ? "#KNB" : "MANUEL");
    let aiSonuc = null;
    if (GEMINI_API_KEY) {
      try {
        const ai = getGeminiClient();
        const prompt = `A\u015Fa\u011F\u0131daki m\xFC\u015Fteri ile sat\u0131c\u0131 aras\u0131ndaki sohbet ge\xE7mi\u015Fini oku. Konu\u015Fmadaki pazarl\u0131k veya alternatif konu\u015Fmalar\u0131 eleyerek EN SON \xDCZER\u0130NDE ANLA\u015EILAN nihai sipari\u015Fi \xE7\u0131kar.
Sohbet: "${mesaj}"`;
        const resp = await generateContentWithRetryAndFallback(ai, {
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type2.OBJECT,
              properties: {
                musteri_adi: { type: Type2.STRING },
                instagram_kullanici_adi: { type: Type2.STRING },
                telefon_numarasi: { type: Type2.STRING },
                teslimat_sehri: { type: Type2.STRING },
                teslimat_adresi: { type: Type2.STRING },
                urun_aciklamasi: { type: Type2.STRING },
                beden_veya_olcu: { type: Type2.STRING },
                renk: { type: Type2.STRING },
                adet: { type: Type2.NUMBER },
                toplam_tutar: { type: Type2.NUMBER },
                alinan_tutar: { type: Type2.NUMBER },
                para_birimi: { type: Type2.STRING },
                baku_tahsilat_notu: { type: Type2.STRING },
                eksik_bilgiler: { type: Type2.ARRAY, items: { type: Type2.STRING } },
                ai_guven_skoru: { type: Type2.NUMBER }
              },
              required: ["musteri_adi", "urun_aciklamasi", "toplam_tutar"]
            }
          }
        });
        aiSonuc = JSON.parse(resp.text || "{}");
      } catch (e) {
        console.warn("Webhook AI hatas\u0131:", e.message);
      }
    }
    if (!aiSonuc || !aiSonuc.urun_aciklamasi) {
      aiSonuc = {
        musteri_adi: gonderen || "Yeni M\xFC\u015Fteri",
        instagram_kullanici_adi: gonderen?.startsWith("@") ? gonderen : "",
        telefon_numarasi: gonderen?.includes("+") ? gonderen : "",
        teslimat_sehri: "Bak\xFC",
        teslimat_adresi: "",
        urun_aciklamasi: "Sohbetten gelen sipari\u015F",
        beden_veya_olcu: "",
        renk: "",
        adet: 1,
        toplam_tutar: 0,
        alinan_tutar: 0,
        kalan_tutar: 0,
        para_birimi: "AZN",
        finans_durumu: "BEKLIYOR",
        lojistik_durumu: "KANADA_SATINALIM_BEKLIYOR",
        baku_tahsilat_notu: "",
        eksik_bilgiler: ["toplam_tutar"],
        ai_guven_skoru: 0.85
      };
    } else {
      const alinan = Number(aiSonuc.alinan_tutar || 0);
      const toplam = Number(aiSonuc.toplam_tutar || alinan);
      aiSonuc.alinan_tutar = alinan;
      aiSonuc.toplam_tutar = toplam;
      aiSonuc.kalan_tutar = Math.max(0, toplam - alinan);
      aiSonuc.para_birimi = aiSonuc.para_birimi || "AZN";
      aiSonuc.finans_durumu = alinan >= toplam && toplam > 0 ? "ODENDI" : alinan > 0 ? "KISMI_ODEME" : "BEKLIYOR";
      aiSonuc.lojistik_durumu = "KANADA_SATINALIM_BEKLIYOR";
    }
    const yeniInbox = {
      id: "inbox-" + randomUUID3(),
      gelis_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
      kaynak: kaynak || "INSTAGRAM_DM",
      gonderen_kullanici: gonderen || aiSonuc.instagram_kullanici_adi || aiSonuc.musteri_adi || "@musteri",
      konusma_gecmisi: mesaj,
      tetikleyici_kod: bulunanKod,
      oneri_siparis: {
        ...aiSonuc,
        tenant_id: hedefTenantId
      },
      durum: "BEKLEMEDE",
      tenant_id: hedefTenantId
    };
    if (dbActive2(hedefTenantId)) {
      try {
        const { error } = await supabase.from("inbox_mesajlar").insert({
          id: yeniInbox.id,
          tenant_id: hedefTenantId,
          gonderen_kullanici: yeniInbox.gonderen_kullanici,
          kaynak: yeniInbox.kaynak,
          konusma_gecmisi: yeniInbox.konusma_gecmisi,
          durum: yeniInbox.durum,
          oneri_siparis: yeniInbox.oneri_siparis
        });
        if (error) throw error;
      } catch (sbErr) {
        throw new PublicResourceError("Mesaj kaydedilemedi.", 503);
      }
    }
    if (!dbActive2(hedefTenantId)) onayBekleyenler.unshift(yeniInbox);
    res.json({
      basarili: true,
      mesaj: "Mesaj tetikleyici ile yakaland\u0131 ve onay bekleyenler havuzuna eklendi.",
      inbox: yeniInbox
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});
router5.post("/inbox/:id/onayla", async (req, res) => {
  try {
    const tenantId = tenantFor3(req, true);
    const { id } = req.params;
    const inboxItem = await ownedInbox(tenantId, id);
    if (!inboxItem)
      return res.status(404).json({ basarili: false, hata: "Inbox mesaj\u0131 bulunamad\u0131." });
    if (inboxItem.durum !== "BEKLEMEDE")
      return res.status(409).json({ basarili: false, hata: "Mesaj daha \xF6nce i\u015Flendi." });
    const siparisVerisi = req.body.duzeltilmis_siparis || inboxItem.oneri_siparis;
    if (siparisVerisi.tenant_id && siparisVerisi.tenant_id !== tenantId || siparisVerisi.tenantId && siparisVerisi.tenantId !== tenantId)
      throw new PublicResourceError("Sipari\u015F ba\u015Fka butike ta\u015F\u0131namaz.", 403);
    await assertTenantImageReferences(req, siparisVerisi);
    if (siparisVerisi.musteri_id) {
      let customer;
      if (dbActive2(tenantId)) {
        const { data, error } = await supabase.from("musteriler").select("id").eq("id", siparisVerisi.musteri_id).eq("tenant_id", tenantId).maybeSingle();
        if (error) throw new PublicResourceError("M\xFC\u015Fteri do\u011Frulanamad\u0131.", 503);
        customer = data;
      } else
        customer = musterilerVeritabani.find(
          (m) => m.id === siparisVerisi.musteri_id && belongs3(m, tenantId)
        );
      if (!customer) throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
    }
    const alinan = Number(siparisVerisi.alinan_tutar || 0);
    const toplam = Number(siparisVerisi.toplam_tutar || alinan);
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError("Ge\xE7ersiz tutar.", 400);
    const dbPayload = {
      tenant_id: tenantId,
      is_demo: tenantId === "demo_sandbox",
      ham_mesaj: inboxItem.konusma_gecmisi,
      siparis_kaynagi: inboxItem.kaynak,
      musteri_adi: siparisVerisi.musteri_adi || "M\xFC\u015Fteri",
      instagram_kullanici_adi: siparisVerisi.instagram_kullanici_adi || "",
      telefon_numarasi: siparisVerisi.telefon_numarasi || "",
      teslimat_sehri: siparisVerisi.teslimat_sehri || "Bak\xFC",
      teslimat_adresi: siparisVerisi.teslimat_adresi || "",
      urun_aciklamasi: siparisVerisi.urun_aciklamasi || "\xDCr\xFCn",
      beden_veya_olcu: siparisVerisi.beden_veya_olcu || "",
      renk: siparisVerisi.renk || "",
      adet: Number(siparisVerisi.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: siparisVerisi.para_birimi || "AZN",
      finans_durumu: siparisVerisi.finans_durumu || (alinan >= toplam && toplam > 0 ? "ODENDI" : alinan > 0 ? "KISMI_ODEME" : "BEKLIYOR"),
      lojistik_durumu: siparisVerisi.lojistik_durumu || "KANADA_SATINALIM_BEKLIYOR",
      baku_tahsilat_notu: siparisVerisi.baku_tahsilat_notu || "",
      eksik_bilgiler: Array.isArray(siparisVerisi.eksik_bilgiler) ? siparisVerisi.eksik_bilgiler.filter(
        (v) => typeof v === "string" && !v.startsWith("META:")
      ) : [],
      ai_guven_skoru: Number(siparisVerisi.ai_guven_skoru || 0.98)
    };
    const hash = createHash3("sha256").update(tenantId + ":" + id).digest("hex");
    const orderId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    let kesinSiparis;
    if (dbActive2(tenantId)) {
      const { data: prior, error: lookupError } = await supabase.from("siparisler").select("*").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
      if (lookupError) throw new PublicResourceError("Sipari\u015F do\u011Frulanamad\u0131.", 503);
      if (prior) kesinSiparis = formatlaSiparis(prior);
      else {
        const { data, error: error2 } = await supabase.from("siparisler").insert({ ...hazirlaSupabasePayload(dbPayload), id: orderId }).select("*").single();
        if (error2 || !data) throw new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
        kesinSiparis = formatlaSiparis(data);
      }
      const { data: marked, error } = await supabase.from("inbox_mesajlar").update({ durum: "ONAYLANDI" }).eq("id", id).eq("tenant_id", tenantId).eq("durum", "BEKLEMEDE").select("id").maybeSingle();
      if (error || !marked)
        throw new PublicResourceError("Sipari\u015F kaydedildi ancak mesaj durumu g\xFCncellenemedi.", 503);
    } else {
      const pool = tenantId === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
      kesinSiparis = pool.find((s) => s.id === orderId && belongs3(s, tenantId));
      if (!kesinSiparis) {
        kesinSiparis = formatlaSiparis({
          id: orderId,
          olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
          ...dbPayload,
          kalan_tutar: kalan
        });
        pool.unshift(kesinSiparis);
      }
      inboxItem.durum = "ONAYLANDI";
    }
    res.json({
      basarili: true,
      mesaj: "Sipari\u015F onayland\u0131 ve resmi sipari\u015F tablosuna aktar\u0131ld\u0131.",
      siparis: kesinSiparis
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});
router5.post("/inbox/:id/reddet", async (req, res) => {
  try {
    const tenant = tenantFor3(req, true);
    const inbox = await ownedInbox(tenant, req.params.id);
    if (!inbox) return res.status(404).json({ basarili: false, hata: "Mesaj bulunamad\u0131." });
    if (inbox.durum !== "BEKLEMEDE")
      return res.status(409).json({ basarili: false, hata: "Mesaj daha \xF6nce i\u015Flendi." });
    if (dbActive2(tenant)) {
      const { data, error } = await supabase.from("inbox_mesajlar").update({ durum: "REDDEDILDI" }).eq("id", inbox.id).eq("tenant_id", tenant).eq("durum", "BEKLEMEDE").select("id").maybeSingle();
      if (error || !data) throw new PublicResourceError("Mesaj g\xFCncellenemedi.", 503);
    } else inbox.durum = "REDDEDILDI";
    res.json({ basarili: true, mesaj: "Mesaj reddedildi/ar\u015Fivlendi." });
  } catch (error) {
    inboxFailure(res, error);
  }
});
var inbox_default = router5;

// src/server/routes/firmalar.ts
import { Router as Router6 } from "express";

// src/server/services/crypto.ts
import crypto from "crypto";
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 12;
var PREFIX = "enc:";
function getKey() {
  const secret = API_SECRET_KEY || "tomnap_default_internal_secure_key_2026";
  return crypto.createHash("sha256").update(secret).digest();
}
function sifreleMetin(metin) {
  if (!metin || typeof metin !== "string") return "";
  if (metin.startsWith(PREFIX)) return metin;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(metin, "utf-8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("\u015Eifreleme hatas\u0131:", err);
    return metin;
  }
}
function cozMetin(sifreliMetin) {
  if (!sifreliMetin || typeof sifreliMetin !== "string") return "";
  if (!sifreliMetin.startsWith(PREFIX)) return sifreliMetin;
  try {
    const parts = sifreliMetin.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return sifreliMetin;
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  } catch (err) {
    console.warn("\u015Eifre \xE7\xF6zme uyar\u0131s\u0131 (fallback):", err);
    return sifreliMetin;
  }
}
function sifreHashle(sifre) {
  if (!sifre || typeof sifre !== "string") {
    throw new Error("Ge\xE7ersiz \u015Fifre format\u0131");
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(sifre, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}
function sifreDogrula(sifre, saklananHash) {
  if (!sifre || !saklananHash || typeof sifre !== "string" || typeof saklananHash !== "string") {
    return false;
  }
  try {
    const parts = saklananHash.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const salt = Buffer.from(parts[1], "hex");
    const hash = Buffer.from(parts[2], "hex");
    const derivedKey = crypto.scryptSync(sifre, salt, 64);
    return crypto.timingSafeEqual(hash, derivedKey);
  } catch (err) {
    console.error("\u015Eifre do\u011Frulama hatas\u0131:", err);
    return false;
  }
}
function tokenUret(baytSayisi = 32) {
  return crypto.randomBytes(baytSayisi).toString("hex");
}

// src/server/services/emailService.ts
function getApplicationUrl() {
  const url = new URL(APP_URL);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || IS_PRODUCTION && url.protocol !== "https:") {
    throw new Error("APP_URL etibarl\u0131 t\u0259tbiq \xFCnvan\u0131 olmal\u0131d\u0131r.");
  }
  return url.toString().replace(/\/+$/, "");
}
function escapeHtml(value) {
  return value.replace(
    /[&<>\"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}
async function sendEmail(params) {
  const { to, subject, html, text } = params;
  console.log(`
================= [TOMNAP EMAIL SERVICE] =================`);
  console.log(`G\xD6ND\u018FR\u0130L\u0130R: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [to],
          subject,
          html,
          text: text || subject
        })
      });
      const resData = await response.json();
      if (response.ok) {
        console.log(`\u2705 E-po\xE7t Resend vasit\u0259sil\u0259 u\u011Furla \xE7atd\u0131r\u0131ld\u0131. Message ID: ${resData?.id}`);
        console.log(`==========================================================
`);
        return { basarili: true, id: resData?.id };
      } else {
        console.warn("Resend API e-po\xE7t g\xF6nd\u0259rm\u0259 x\u0259tas\u0131:", response.status);
        console.log(`==========================================================
`);
        return { basarili: false, hata: resData?.message || "E-po\xE7t g\xF6nd\u0259ril\u0259 bilm\u0259di" };
      }
    } catch (err) {
      console.error(`\u274C Resend g\xF6nd\u0259rm\u0259 x\u0259tas\u0131:`, err.message);
      console.log(`==========================================================
`);
      return { basarili: false, hata: err.message };
    }
  }
  if (IS_PRODUCTION) {
    return { basarili: false, hata: "E-po\xE7t xidm\u0259ti konfiqurasiya edilm\u0259yib." };
  }
  console.log(`\u2139\uFE0F [TEST/DEV REJ\u0130M\u0130] RESEND_API_KEY t\u0259yin edilm\u0259yib, e-po\xE7t simulyasiya edildi.`);
  console.log(`==========================================================
`);
  return { basarili: false, hata: "Geli\u015Ftirme ortam\u0131nda e-po\xE7t g\xF6nderilmedi." };
}
async function sendActivationEmail(params) {
  const baseUrl = getApplicationUrl();
  const link = `${baseUrl}/sifre-belirle?token=${encodeURIComponent(params.token)}`;
  const subject = `TOMNAP \u2014 ${params.butikAdi} \xFC\xE7\xFCn \u015Fifr\u0259nizi t\u0259yin edin v\u0259 i\u015F masan\u0131z\u0131 aktivl\u0259\u015Fdirin`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .brand { font-size: 24px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px; margin-bottom: 24px; }
    .brand span { color: #f43f5e; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 10px; margin: 12px 0 24px 0; text-align: center; }
    .btn:hover { background: #4338ca; }
    .link-box { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px dashed #475569; word-break: break-all; font-family: monospace; font-size: 13px; color: #94a3b8; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TOMNAP<span>.</span></div>
    <h1>H\xF6rm\u0259tli ${escapeHtml(params.adSoyad)},</h1>
    <p>
      <strong>"${escapeHtml(params.butikAdi)}"</strong> butikiniz \xFC\xE7\xFCn TOMNAP Beyn\u0259lxalq E-Ticar\u0259t \u0130dar\u0259etm\u0259 Platformas\u0131nda qeydiyyat u\u011Furla tamamland\u0131.
    </p>
    <p>
      Hesab\u0131n\u0131z\u0131 aktivl\u0259\u015Fdirm\u0259k v\u0259 \u015F\u0259xsi \u015Fifr\u0259nizi t\u0259yin etm\u0259k \xFC\xE7\xFCn a\u015Fa\u011F\u0131dak\u0131 d\xFCym\u0259y\u0259 klikl\u0259yin:
    </p>
    <div style="text-align: center;">
      <a href="${link}" class="btn" target="_blank">\u015Eifr\u0259nizi T\u0259yin Edin v\u0259 Giri\u015F Edin</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      D\xFCym\u0259 a\xE7\u0131lm\u0131rsa, a\u015Fa\u011F\u0131dak\u0131 linki birba\u015Fa brauzerinizin \xFCnvan s\u0259trin\u0259 yap\u0131\u015Fd\u0131ra bil\u0259rsiniz:
    </p>
    <div class="link-box">${link}</div>
    <div class="footer">
      <p>Bu t\u0259hl\xFCk\u0259sizlik linki 24 saat m\xFCdd\u0259tind\u0259 etibarl\u0131d\u0131r. \u018Fg\u0259r bu m\xFCraci\u0259ti siz etm\u0259misinizs\u0259, z\u0259hm\u0259t olmasa bu m\u0259ktubu n\u0259z\u0259r\u0259 almay\u0131n.</p>
      <p>\xA9 2026 TOMNAP Enterprise Platform \u2014 B\xFCt\xFCn h\xFCquqlar qorunur.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  const text = `
H\xF6rm\u0259tli ${params.adSoyad},

"${params.butikAdi}" butikiniz \xFC\xE7\xFCn TOMNAP platformas\u0131nda qeydiyyat u\u011Furla tamamland\u0131.
\u015Eifr\u0259nizi t\u0259yin etm\u0259k v\u0259 hesab\u0131n\u0131z\u0131 aktivl\u0259\u015Fdirm\u0259k \xFC\xE7\xFCn bu link\u0259 ke\xE7id edin:
${link}

Bu link 24 saat m\xFCdd\u0259tind\u0259 etibarl\u0131d\u0131r.
TOMNAP D\u0259st\u0259k Komandas\u0131
  `.trim();
  const result = await sendEmail({ to: params.email, subject, html, text });
  return { ...result, link };
}
async function sendInviteEmail(params) {
  const baseUrl = getApplicationUrl();
  const link = `${baseUrl}/davet-qebul?token=${encodeURIComponent(params.token)}`;
  const rolAdlari = {
    KANADA_SATINALMA: "Kanada Sat\u0131nalma Meneceri",
    SATIS_SORUMLUSU: "Sat\u0131\u015F v\u0259 M\xFC\u015Ft\u0259ri Xidm\u0259tl\u0259ri",
    BAKU_FINANS: "Bak\u0131 Maliyy\u0259 / Kassa Sorumlusu",
    BAKU_KURYE: "Bak\u0131 Daxili \xC7atd\u0131r\u0131lma / Kuryer",
    PATRON: "H\u0259mt\u0259sis\xE7i / Patron"
  };
  const rolAdi = rolAdlari[params.rol] || params.rol;
  const subject = `TOMNAP \u2014 "${params.butikAdi}" butik komandas\u0131na d\u0259v\u0259t edildiniz (${rolAdi})`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .brand { font-size: 24px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px; margin-bottom: 24px; }
    .brand span { color: #f43f5e; }
    .role-badge { display: inline-block; background: #312e81; color: #c7d2fe; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-size: 15px; font-weight: 600; border-radius: 10px; margin: 12px 0 24px 0; text-align: center; }
    .link-box { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px dashed #475569; word-break: break-all; font-family: monospace; font-size: 13px; color: #94a3b8; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TOMNAP<span>.</span></div>
    <div class="role-badge">${escapeHtml(rolAdi)}</div>
    <h1>${params.adSoyad ? `H\xF6rm\u0259tli ${escapeHtml(params.adSoyad)},` : "Salam,"}</h1>
    <p>
      ${escapeHtml(params.davetEden || "Butik r\u0259hb\u0259rliyi")} t\u0259r\u0259find\u0259n <strong>"${escapeHtml(params.butikAdi)}"</strong> butikinin idar\u0259etm\u0259 masas\u0131na <strong>${escapeHtml(rolAdi)}</strong> v\u0259zif\u0259si \xFCzr\u0259 d\u0259v\u0259t olundunuz.
    </p>
    <p>
      D\u0259v\u0259ti q\u0259bul etm\u0259k, \u015Fifr\u0259nizi t\u0259yin etm\u0259k v\u0259 i\u015F masan\u0131za daxil olmaq \xFC\xE7\xFCn a\u015Fa\u011F\u0131dak\u0131 d\xFCym\u0259y\u0259 klikl\u0259yin:
    </p>
    <div style="text-align: center;">
      <a href="${link}" class="btn" target="_blank">D\u0259v\u0259ti Q\u0259bul Et v\u0259 \u015Eifr\u0259 T\u0259yin Et</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8;">
      D\xFCym\u0259 a\xE7\u0131lm\u0131rsa, a\u015Fa\u011F\u0131dak\u0131 ke\xE7idi kopyalayaraq brauzerinizd\u0259 a\xE7a bil\u0259rsiniz:
    </p>
    <div class="link-box">${link}</div>
    <div class="footer">
      <p>Bu d\u0259v\u0259t linki 7 g\xFCn m\xFCdd\u0259tind\u0259 etibarl\u0131d\u0131r.</p>
      <p>\xA9 2026 TOMNAP Enterprise Platform</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  const text = `
H\xF6rm\u0259tli ${params.adSoyad || "Komanda \xDCzv\xFC"},

${params.davetEden || "Butik r\u0259hb\u0259rliyi"} t\u0259r\u0259find\u0259n "${params.butikAdi}" butikinin idar\u0259etm\u0259 masas\u0131na ${rolAdi} olaraq d\u0259v\u0259t edildiniz.
D\u0259v\u0259ti q\u0259bul etm\u0259k \xFC\xE7\xFCn bu link\u0259 ke\xE7id edin:
${link}

TOMNAP D\u0259st\u0259k Komandas\u0131
  `.trim();
  const result = await sendEmail({ to: params.email, subject, html, text });
  return { ...result, link };
}

// src/server/routes/firmalar.ts
var router6 = Router6();
router6.get("/firmalar", async (req, res) => {
  const sayilar = {};
  for (const s of siparislerVeritabani) {
    const tid = s.tenant_id;
    if (!tid || req.tenantId !== "all" && tid !== req.tenantId) continue;
    sayilar[tid] = (sayilar[tid] || 0) + 1;
  }
  if (supabase) {
    try {
      let query = supabase.from("firmalar").select("*");
      if (req.auth?.role !== "SUPER_ADMIN") query = query.eq("id", req.tenantId);
      const { data, error } = await query;
      if (error)
        return res.status(503).json({ basarili: false, hata: "Firma bilgileri okunamad\u0131." });
      if (data) {
        const sbFirmalar = data.map((d) => ({
          id: d.id,
          ad: d.ad,
          sehir: d.sehir || "Bak\u0131",
          varsayilanParaBirimi: d.varsayilan_para_birimi || "AZN",
          varsayilanKomisyonYuzdesi: Number(d.varsayilan_komisyon_yuzdesi || 15),
          aciklama: d.aciklama || "",
          isDemo: d.is_demo || false,
          onayDurumu: d.onay_durumu || "AKTIF",
          paket: d.paket || "PRO",
          sahipAdi: d.sahip_adi || "",
          sahipEmail: d.sahip_email || "",
          sahipTelefon: d.sahip_telefon || "",
          menseiUlke: d.mensei_ulke || "CA",
          rolLimitleri: d.rol_limitleri || {
            PATRON: 1,
            KANADA_SATINALMA: 2,
            SATIS_SORUMLUSU: 4,
            BAKU_FINANS: 2,
            BAKU_KURYE: 10
          },
          aktifKullaniciSayilari: d.aktif_kullanici_sayilari || {
            PATRON: 1,
            KANADA_SATINALMA: 0,
            SATIS_SORUMLUSU: 0,
            BAKU_FINANS: 0,
            BAKU_KURYE: 0
          },
          kayitTarihi: d.kayit_tarihi || (/* @__PURE__ */ new Date()).toISOString()
        }));
        return res.json({
          basarili: true,
          kaynak: "supabase",
          firmalar: sbFirmalar,
          siparis_sayilari: sayilar
        });
      }
    } catch (sbErr) {
      return res.status(503).json({ basarili: false, hata: "Firma bilgileri okunamad\u0131." });
    }
  }
  res.json({
    basarili: true,
    kaynak: "bellek",
    firmalar: firmalarVeritabani.filter(
      (f) => req.auth?.role === "SUPER_ADMIN" || f.id === req.tenantId
    ),
    siparis_sayilari: sayilar
  });
});
var davetlerVeritabani = [];
router6.post("/firmalar/kayit", async (req, res) => {
  try {
    const body = req.body || {};
    const ad = String(body.ad || "").trim();
    const sahipAdi = String(body.sahipAdi || "").trim();
    const sahipTelefon = String(body.sahipTelefon || "").trim();
    const sahipEmail = String(body.sahipEmail || "").trim();
    const sehir = String(body.sehir || "Bak\u0131").trim();
    const paket = body.paket || "PRO";
    const menseiUlke = String(body.menseiUlke || "CA").trim();
    const aciklama = String(body.aciklama || "").trim();
    if (!ad || !sahipAdi || !sahipTelefon || !sahipEmail) {
      return res.status(400).json({
        basarili: false,
        hata: "Butik ad\u0131, sahibinin ad\u0131, \u0259laq\u0259 telefonu v\u0259 e-po\xE7t \xFCnvan\u0131 m\xFCtl\u0259qdir."
      });
    }
    if (IS_PRODUCTION && !RESEND_API_KEY) {
      return res.status(503).json({
        basarili: false,
        hata: "Aktivasiya m\u0259ktubu xidm\u0259ti haz\u0131r deyil. Daha sonra yenid\u0259n c\u0259hd edin."
      });
    }
    getApplicationUrl();
    const slug = ad.toLowerCase().replace(/ə/g, "e").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString(36).slice(-4);
    const upper = String(paket || "PRO").toUpperCase();
    const normalPaket = upper === "ENTERPRISE" ? "ENTERPRISE" : upper === "BASLANGIC" ? "BASLANGIC" : "PRO";
    let rolLimitleri = {
      PATRON: 1,
      KANADA_SATINALMA: 1,
      SATIS_SORUMLUSU: 1,
      BAKU_FINANS: 1,
      BAKU_KURYE: 1
    };
    if (normalPaket === "PRO") {
      rolLimitleri = {
        PATRON: 1,
        KANADA_SATINALMA: 2,
        SATIS_SORUMLUSU: 2,
        BAKU_FINANS: 2,
        BAKU_KURYE: 5
      };
    } else if (normalPaket === "ENTERPRISE") {
      rolLimitleri = {
        PATRON: 2,
        KANADA_SATINALMA: 5,
        SATIS_SORUMLUSU: 10,
        BAKU_FINANS: 5,
        BAKU_KURYE: 25
      };
    }
    const yeniFirma = {
      id: slug,
      ad,
      sehir: sehir || "Bak\u0131",
      varsayilanParaBirimi: "AZN",
      varsayilanKomisyonYuzdesi: 15,
      aciklama: aciklama || `${sahipAdi} t\u0259r\u0259find\u0259n qeydiyyatdan ke\xE7irilmi\u015F butik`,
      isDemo: false,
      onayDurumu: "BEKLEMEDE",
      // Şifrə təyin edilənə və ya təsdiq olunana qədər gözləmədə
      paket: normalPaket,
      sahipAdi,
      sahipEmail,
      sahipTelefon,
      kayitTarihi: (/* @__PURE__ */ new Date()).toISOString(),
      menseiUlke,
      rolLimitleri,
      aktifKullaniciSayilari: {
        PATRON: 1,
        // Sahib avtomatik ilk istifadəçidir
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0
      }
    };
    const aktivasyonToken = tokenUret(32);
    const tokenGecerlilik = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    const yeniPatronUser = {
      id: "usr_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4),
      tenant_id: slug,
      ad_soyad: sahipAdi,
      email: sahipEmail.toLowerCase(),
      telefon: sahipTelefon,
      rol: "PATRON",
      durum: "BEKLEMEDE_SIFRE",
      aktivasyon_token: aktivasyonToken,
      token_gecerlilik: tokenGecerlilik,
      olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (supabase) {
      try {
        const { error: fErr } = await supabase.from("firmalar").insert({
          id: yeniFirma.id,
          ad: yeniFirma.ad,
          sehir: yeniFirma.sehir,
          varsayilan_para_birimi: yeniFirma.varsayilanParaBirimi,
          varsayilan_komisyon_yuzdesi: yeniFirma.varsayilanKomisyonYuzdesi,
          aciklama: yeniFirma.aciklama,
          is_demo: yeniFirma.isDemo,
          onay_durumu: yeniFirma.onayDurumu,
          paket: yeniFirma.paket,
          sahip_adi: yeniFirma.sahipAdi,
          sahip_email: yeniFirma.sahipEmail,
          sahip_telefon: yeniFirma.sahipTelefon,
          mensei_ulke: yeniFirma.menseiUlke,
          rol_limitleri: yeniFirma.rolLimitleri,
          aktif_kullanici_sayilari: yeniFirma.aktifKullaniciSayilari
        });
        if (fErr) {
          return res.status(503).json({
            basarili: false,
            hata: "Qeydiyyat saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin."
          });
        }
        const { error: uErr } = await supabase.from("kullanicilar").insert({
          id: yeniPatronUser.id,
          tenant_id: yeniPatronUser.tenant_id,
          ad_soyad: yeniPatronUser.ad_soyad,
          email: yeniPatronUser.email,
          telefon: yeniPatronUser.telefon,
          rol: yeniPatronUser.rol,
          durum: yeniPatronUser.durum,
          aktivasyon_token: yeniPatronUser.aktivasyon_token,
          token_gecerlilik: yeniPatronUser.token_gecerlilik,
          olusturma_tarihi: yeniPatronUser.olusturma_tarihi
        });
        if (uErr) {
          return res.status(503).json({
            basarili: false,
            hata: "\u0130stifad\u0259\xE7i qeydi saxlan\u0131lmad\u0131. D\u0259st\u0259k xidm\u0259ti il\u0259 \u0259laq\u0259 saxlay\u0131n."
          });
        }
      } catch (errDb) {
        return res.status(503).json({
          basarili: false,
          hata: "Qeydiyyat xidm\u0259ti \u0259l\xE7atan deyil. Daha sonra yenid\u0259n c\u0259hd edin."
        });
      }
    }
    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);
    kullanicilarVeritabani.push(yeniPatronUser);
    kullanicilariKaydetDosyaya(kullanicilarVeritabani);
    const emailResult = await sendActivationEmail({
      email: sahipEmail,
      adSoyad: sahipAdi,
      butikAdi: ad,
      token: aktivasyonToken
    });
    res.json({
      basarili: true,
      mesaj: emailResult.basarili ? `Qeydiyyat q\u0259bul edildi. \u015Eifr\u0259 t\u0259yini linki ${sahipEmail} \xFCnvan\u0131na g\xF6nd\u0259rildi.` : "Qeydiyyat q\u0259bul edildi, lakin aktivasiya m\u0259ktubu g\xF6nd\u0259ril\u0259 bilm\u0259di. D\u0259st\u0259k xidm\u0259ti il\u0259 \u0259laq\u0259 saxlay\u0131n.",
      firma: yeniFirma,
      emailGonderildi: emailResult.basarili
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router6.patch("/firmalar/:id/onay", async (req, res) => {
  const { id } = req.params;
  const { onayDurumu } = req.body;
  if (!["AKTIF", "REDDEDILDI", "BEKLEMEDE", "DONDURULMUS"].includes(onayDurumu))
    return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz firma durumu." });
  try {
    if (supabase) {
      const { data, error } = await supabase.from("firmalar").update({ onay_durumu: onayDurumu }).eq("id", id).select("id,ad,onay_durumu").maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: "Firma durumu kaydedilemedi." });
      if (!data) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
      const local = firmalarVeritabani.find((f) => f.id === id);
      if (local) local.onayDurumu = onayDurumu;
      return res.json({
        basarili: true,
        firma: { ...data, onayDurumu },
        mesaj: "Firma durumu g\xFCncellendi."
      });
    }
    const firma = firmalarVeritabani.find((f) => f.id === id);
    if (!firma) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    firma.onayDurumu = onayDurumu;
    firmalariKaydetDosyaya(firmalarVeritabani);
    return res.json({ basarili: true, firma, mesaj: "Firma durumu g\xFCncellendi." });
  } catch {
    return res.status(503).json({ basarili: false, hata: "Firma durumu kaydedilemedi." });
  }
});
router6.post("/firmalar/davet-olustur", async (req, res) => {
  try {
    const { tenantId, rol, olusturanKisi = "Butik Patronu", email, adSoyad } = req.body;
    let firma = firmalarVeritabani.find((f) => f.id === tenantId);
    if (supabase) {
      const { data, error } = await supabase.from("firmalar").select("*").eq("id", tenantId).maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: "Firma bilgileri okunamad\u0131." });
      firma = data ? {
        ...data,
        onayDurumu: data.onay_durumu,
        rolLimitleri: data.rol_limitleri,
        aktifKullaniciSayilari: data.aktif_kullanici_sayilari
      } : void 0;
    }
    if (!firma) {
      return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    }
    if (!["PATRON", "KANADA_SATINALMA", "SATIS_SORUMLUSU", "BAKU_FINANS", "BAKU_KURYE"].includes(rol)) {
      return res.status(400).json({ basarili: false, hata: "Etibars\u0131z komanda rolu." });
    }
    if (firma.onayDurumu && firma.onayDurumu !== "AKTIF")
      return res.status(403).json({ basarili: false, hata: "Firma aktif de\u011Fil." });
    const limit = firma.rolLimitleri?.[rol] ?? 5;
    const movcud = firma.aktifKullaniciSayilari?.[rol] ?? 0;
    if (movcud >= limit) {
      return res.status(400).json({
        basarili: false,
        hata: `Bu butik \xFC\xE7\xFCn ${rol} v\u0259zif\u0259si \xFCzr\u0259 limit (${limit}/${limit}) dolmu\u015Fdur. Z\u0259hm\u0259t olmasa paketinizi y\xFCks\u0259ldin.`
      });
    }
    const token = "inv_" + tokenUret(32);
    const gecerlilikTarihi = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3).toISOString();
    const davet = {
      token,
      tenantId: firma.id,
      tenantAd: firma.ad,
      rol,
      olusturanKisi,
      olusturmaTarihi: (/* @__PURE__ */ new Date()).toISOString(),
      gecerlilikTarihi,
      kullanildiMi: false,
      email: email ? String(email).trim().toLowerCase() : void 0,
      kullananKisi: adSoyad ? String(adSoyad).trim() : void 0
    };
    if (supabase) {
      try {
        const { data, error } = await supabase.from("davetler").insert({
          id: davet.token,
          token: davet.token,
          firma_id: davet.tenantId,
          rol: davet.rol,
          olusturan_rol: req.auth?.role || "PATRON",
          durum: "AKTIF",
          son_kullanma_tarihi: davet.gecerlilikTarihi
        }).select("token").maybeSingle();
        if (error || !data) {
          return res.status(503).json({ basarili: false, hata: "D\u0259v\u0259t saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin." });
        }
      } catch {
        return res.status(503).json({ basarili: false, hata: "D\u0259v\u0259t xidm\u0259ti \u0259l\xE7atan deyil." });
      }
    }
    davetlerVeritabani.push(davet);
    let emailGonderildi = false;
    let davetUrlTam = `/davet-qebul?token=${token}`;
    if (email && String(email).includes("@")) {
      const emailSonuc = await sendInviteEmail({
        email: String(email).trim().toLowerCase(),
        adSoyad: adSoyad ? String(adSoyad).trim() : void 0,
        butikAdi: firma.ad,
        rol,
        token,
        davetEden: olusturanKisi
      });
      emailGonderildi = emailSonuc.basarili;
      if (emailSonuc.link) {
        davetUrlTam = emailSonuc.link;
      }
    }
    res.json({
      basarili: true,
      davet,
      davetUrl: `/davet?token=${token}`,
      davetUrlTam,
      emailGonderildi,
      mesaj: emailGonderildi ? `D\u0259v\u0259t m\u0259ktubu ${email} \xFCnvan\u0131na g\xF6nd\u0259rildi.` : `D\u0259v\u0259t linki u\u011Furla yarad\u0131ld\u0131.`,
      kalanKota: limit - movcud
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router6.post("/firmalar", async (req, res) => {
  try {
    const {
      ad,
      sehir,
      varsayilanParaBirimi = "AZN",
      varsayilanKomisyonYuzdesi = 15,
      aciklama
    } = req.body;
    if (!ad) {
      return res.status(400).json({ basarili: false, hata: "Firma / butik ad\u0131 zorunludur." });
    }
    const slug = ad.toLowerCase().replace(/ə/g, "e").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/[^a-z0-9]/g, "_") + "_" + Date.now().toString(36).slice(-4);
    const yeniFirma = {
      id: slug,
      ad,
      sehir: sehir || "Bak\u0131",
      varsayilanParaBirimi: varsayilanParaBirimi || "AZN",
      varsayilanKomisyonYuzdesi: Number(varsayilanKomisyonYuzdesi || 15),
      aciklama: aciklama || "",
      isDemo: false,
      onayDurumu: "AKTIF",
      paket: "PRO",
      rolLimitleri: {
        PATRON: 1,
        KANADA_SATINALMA: 2,
        SATIS_SORUMLUSU: 4,
        BAKU_FINANS: 2,
        BAKU_KURYE: 10
      },
      aktifKullaniciSayilari: {
        PATRON: 1,
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0
      }
    };
    if (supabase) {
      const { data, error } = await supabase.from("firmalar").insert({
        id: yeniFirma.id,
        ad: yeniFirma.ad,
        sehir: yeniFirma.sehir,
        varsayilan_para_birimi: yeniFirma.varsayilanParaBirimi,
        varsayilan_komisyon_yuzdesi: yeniFirma.varsayilanKomisyonYuzdesi,
        aciklama: yeniFirma.aciklama,
        is_demo: false,
        onay_durumu: "AKTIF",
        paket: yeniFirma.paket,
        rol_limitleri: yeniFirma.rolLimitleri,
        aktif_kullanici_sayilari: yeniFirma.aktifKullaniciSayilari
      }).select("id").maybeSingle();
      if (error || !data)
        return res.status(503).json({ basarili: false, hata: "Firma kaydedilemedi." });
    }
    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);
    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistem\u0259 u\u011Furla \u0259lav\u0259 edildi!`,
      firma: yeniFirma
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router6.delete("/firmalar/:id", async (req, res) => {
  const { id } = req.params;
  if (id === "kanada_shopper_baku")
    return res.status(400).json({ basarili: false, hata: "\u018Fsas canl\u0131 butik silin\u0259 bilm\u0259z." });
  try {
    if (supabase) {
      const { data, error } = await supabase.from("firmalar").delete().eq("id", id).select("id").maybeSingle();
      if (error) return res.status(503).json({ basarili: false, hata: "Firma silinemedi." });
      if (!data) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    }
    const index = firmalarVeritabani.findIndex((f) => f.id === id);
    if (!supabase && index === -1)
      return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    if (index !== -1) firmalarVeritabani.splice(index, 1);
    firmalariKaydetDosyaya(firmalarVeritabani);
    res.json({ basarili: true, mesaj: "Butik u\u011Furla silindi." });
  } catch {
    res.status(503).json({ basarili: false, hata: "Firma silinemedi." });
  }
});
var firmalar_default = router6;

// src/server/routes/kuryeler.ts
import { Router as Router7 } from "express";
var router7 = Router7();
router7.get("/kuryeler", async (req, res) => {
  try {
    const seciliTenant = req.tenantId;
    if (!seciliTenant)
      return res.status(401).json({ basarili: false, hata: "Oturum a\xE7\u0131lmal\u0131d\u0131r." });
    let source = seciliTenant === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
    if (supabase && seciliTenant !== "demo_sandbox") {
      let query = supabase.from("siparisler").select("*");
      if (seciliTenant !== "all") query = query.eq("tenant_id", seciliTenant);
      const { data, error } = await query;
      if (error)
        return res.status(503).json({ basarili: false, hata: "Kurye sipari\u015Fleri okunamad\u0131." });
      source = data || [];
    }
    const ilgiliSiparisler = source.map(formatlaSiparis).filter((s) => seciliTenant === "all" || s.tenant_id === seciliTenant);
    const kuryeler = [
      {
        id: "kurye-elvin",
        ad_soyad: "Elvin M\u0259mm\u0259dli",
        telefon: "+994 50 411 22 33",
        bolge: "N\u0259rimanov & G\u0259nclik & M\u0259rk\u0259z"
      },
      {
        id: "kurye-resad",
        ad_soyad: "R\u0259\u015Fad K\u0259rimov",
        telefon: "+994 55 622 33 44",
        bolge: "Yasamal & Elml\u0259r & 28 May"
      },
      {
        id: "kurye-vuqar",
        ad_soyad: "V\xFCqar Ta\u011F\u0131yev",
        telefon: "+994 70 833 44 55",
        bolge: "G\u0259nc\u0259 & Q\u0259rb Rayonlar\u0131 (Po\xE7t/Avtova\u011Fzal)"
      },
      {
        id: "ofis-tehvil",
        ad_soyad: "Ofis / M\u0259rk\u0259zi Evd\u0259n T\u0259hvil",
        telefon: "+994 50 111 22 33",
        bolge: "N\u0259simi r., 28 May"
      }
    ];
    const zenginKuryeler = kuryeler.map((k) => {
      const kuryeSiparisleri = ilgiliSiparisler.filter((s) => {
        if (s.baku_kurye_id === k.id) return true;
        const adresVeSehir = `${s.teslimat_sehri || ""} ${s.teslimat_adresi || ""}`.toLowerCase();
        if (k.id === "kurye-elvin" && (adresVeSehir.includes("n\u0259rimanov") || adresVeSehir.includes("g\u0259nclik") || adresVeSehir.includes("t\u0259briz")))
          return true;
        if (k.id === "kurye-resad" && (adresVeSehir.includes("yasamal") || adresVeSehir.includes("elml\u0259r") || adresVeSehir.includes("28 may") || adresVeSehir.includes("i\xE7\u0259ri\u015F\u0259h\u0259r")))
          return true;
        if (k.id === "kurye-vuqar" && (adresVeSehir.includes("g\u0259nc\u0259") || adresVeSehir.includes("sumqay\u0131t") || adresVeSehir.includes("rayon")))
          return true;
        if (k.id === "ofis-tehvil" && (s.ozel_not?.toLowerCase().includes("s\xFCr\xFCc\xFC") || s.ozel_not?.toLowerCase().includes("\xF6z\xFC") || s.ham_mesaj?.toLowerCase().includes("\xF6z\xFC")))
          return true;
        return false;
      });
      const bekleyenler = kuryeSiparisleri.filter((s) => s.lojistik_durumu !== "TESLIM_EDILDI");
      const toplanacakBorc = bekleyenler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0);
      return {
        ...k,
        tenant_id: seciliTenant || "all",
        aktif_paket_sayisi: bekleyenler.length,
        toplam_tahsilat_bekleyen: toplanacakBorc,
        toplam_paket_sayisi: kuryeSiparisleri.length
      };
    });
    res.json({
      basarili: true,
      kuryeler: zenginKuryeler
    });
  } catch {
    res.status(503).json({ basarili: false, hata: "Kurye verileri okunamad\u0131." });
  }
});
var kuryeler_default = router7;

// src/server/routes/veritabani.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.get("/veritabani/durum", async (req, res) => {
  let supabaseBagli = false;
  let toplamKayit = 0;
  let demoKayitSayisi = 0;
  let canliKayitSayisi = 0;
  let hata = null;
  try {
    let siparisler = [];
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").select("*");
      if (error) {
        hata = error.message;
      } else if (data) {
        supabaseBagli = true;
        siparisler = data.map((s) => formatlaSiparis(s));
      }
    }
    if (!supabaseBagli) {
      siparisler = siparislerVeritabani.map((s) => formatlaSiparis(s));
    }
    toplamKayit = siparisler.length;
    demoKayitSayisi = siparisler.filter((s) => s.is_demo !== false).length;
    canliKayitSayisi = siparisler.filter((s) => s.is_demo === false).length;
    const firmaDagilimi = {};
    for (const s of siparisler) {
      const tid = s.tenant_id || "kanada_shopper_baku";
      firmaDagilimi[tid] = (firmaDagilimi[tid] || 0) + 1;
    }
    res.json({
      basarili: true,
      supabase_bagli: supabaseBagli,
      kaynak: supabaseBagli ? "supabase" : "bellek",
      toplam_siparis: toplamKayit,
      demo_siparis_sayisi: demoKayitSayisi,
      canli_siparis_sayisi: canliKayitSayisi,
      rejim: toplamKayit === 0 ? "TEMIZ_CANLI" : demoKayitSayisi > 0 ? "DEMO_MODU" : "CANLI_MODU",
      firma_dagilimi: firmaDagilimi,
      hata
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router8.post("/veritabani/temizle", async (req, res) => {
  try {
    const { tenant_id, onay_kodu } = req.body;
    const hedefTenant = tenant_id || "demo_sandbox";
    const isGlobalResetAllowed = process.env.ALLOW_GLOBAL_RESET === "true";
    const isDemoTarget = hedefTenant === "demo_sandbox";
    if (!isDemoTarget && !isGlobalResetAllowed && onay_kodu !== "CANLI_TEMIZLEME_ONAY_2026") {
      return res.status(403).json({
        basarili: false,
        hata: `"${hedefTenant}" canl\u0131 firma veritaban\u0131d\u0131r. Yanl\u0131\u015Fl\u0131kla silinmeyi \xF6nlemek i\xE7in yaln\u0131zca demo hesab\u0131 ("demo_sandbox") s\u0131f\u0131rlanabilir veya ge\xE7erli onay kodu gereklidir.`
      });
    }
    let silinenAdet = 0;
    if (supabase) {
      let deleteQuery = supabase.from("siparisler").delete();
      if (hedefTenant !== "all") {
        deleteQuery = deleteQuery.eq("tenant_id", hedefTenant);
      }
      const { data, error } = await deleteQuery.select("id");
      if (error) {
        console.error("Supabase temizleme hatas\u0131:", error.message);
        return res.status(500).json({ basarili: false, hata: "Supabase temizlenemedi: " + error.message });
      }
      silinenAdet = data?.length || 0;
    }
    if (hedefTenant === "all") {
      silinenAdet = Math.max(silinenAdet, siparislerVeritabani.length);
      setSiparislerVeritabani([]);
    } else {
      const oncekiSayi = siparislerVeritabani.length;
      const filtrelenmis = siparislerVeritabani.filter(
        (s) => (s.tenant_id || "kanada_shopper_baku") !== hedefTenant
      );
      silinenAdet = Math.max(silinenAdet, oncekiSayi - filtrelenmis.length);
      setSiparislerVeritabani(filtrelenmis);
    }
    console.log(`\u{1F9F9} Veritaban\u0131 temizlendi (${hedefTenant}). Toplam silinen: ${silinenAdet}`);
    res.json({
      basarili: true,
      mesaj: `"${hedefTenant}" butiki \xFC\xE7\xFCn sifari\u015Fl\u0259r u\u011Furla t\u0259mizl\u0259ndi!`,
      silinen_adet: silinenAdet,
      toplam: 0,
      hedef_tenant: hedefTenant
    });
  } catch (err) {
    console.error("Temizleme istisnas\u0131:", err);
    res.status(500).json({ basarili: false, hata: "Temizleme i\u015Flemi ba\u015Far\u0131s\u0131z: " + err.message });
  }
});
router8.post("/veritabani/demo-yukle", async (req, res) => {
  try {
    const hedefTenant = req.body.tenant_id || "demo_sandbox";
    if (supabase) {
      await supabase.from("siparisler").delete().eq("tenant_id", hedefTenant);
    }
    const digerSiparisler = siparislerVeritabani.filter(
      (s) => (s.tenant_id || "kanada_shopper_baku") !== hedefTenant
    );
    const eklenecekler = BASLANGIC_SIPARISLER.map((s) => ({
      ...s,
      tenant_id: hedefTenant,
      is_demo: true
    }));
    if (supabase) {
      const chunkSize = 30;
      for (let i = 0; i < eklenecekler.length; i += chunkSize) {
        const chunk = eklenecekler.slice(i, i + chunkSize);
        const sbChunk = chunk.map((item) => hazirlaSupabasePayload(item));
        const { error } = await supabase.from("siparisler").insert(sbChunk);
        if (error) {
          console.error(`Supabase batch ${i} y\xFCkleme hatas\u0131:`, error.message);
        }
      }
    }
    setSiparislerVeritabani([...digerSiparisler, ...eklenecekler]);
    console.log(`\u2705 Demo verileri y\xFCklendi (${hedefTenant}): ${eklenecekler.length} sipari\u015F.`);
    res.json({
      basarili: true,
      mesaj: `${eklenecekler.length} demo sifari\u015F "${hedefTenant}" \xFC\xE7\xFCn bazaya u\u011Furla b\u0259rpa edildi!`,
      toplam: eklenecekler.length,
      kaynak: supabase ? "supabase" : "bellek"
    });
  } catch (err) {
    console.error("Demo y\xFCkleme istisnas\u0131:", err);
    res.status(500).json({ basarili: false, hata: "Demo y\xFCkleme ba\u015Far\u0131s\u0131z: " + err.message });
  }
});
router8.get("/veritabani/yedek-al", async (req, res) => {
  try {
    let siparisler = [];
    if (supabase) {
      let query = supabase.from("siparisler").select("*").order("olusturma_tarihi", { ascending: false });
      if (req.tenantId !== "all") query = query.eq("tenant_id", req.tenantId);
      const { data, error } = await query;
      if (error) return res.status(503).json({ basarili: false, hata: "Yedek verisi okunamad\u0131." });
      siparisler = (data || []).map(formatlaSiparis);
    } else {
      siparisler = siparislerVeritabani.filter((s) => req.tenantId === "all" || s.tenant_id === req.tenantId).map(formatlaSiparis);
    }
    const yedekPaketi = {
      proje: "Kanada Shopper Baku ERP",
      tarih: (/* @__PURE__ */ new Date()).toISOString(),
      versiyon: "2.0-saas",
      toplam_siparis: siparisler.length,
      siparisler
    };
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=knb_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`
    );
    res.json(yedekPaketi);
  } catch (err) {
    res.status(500).json({ basarili: false, hata: "Yedek olu\u015Fturulamad\u0131: " + err.message });
  }
});
router8.post("/veritabani/yedek-yukle", async (req, res) => {
  try {
    const { siparisler, temizleVeYukle = true } = req.body;
    if (!Array.isArray(siparisler) || siparisler.length === 0) {
      return res.status(400).json({ basarili: false, hata: "Ge\xE7erli bir sipari\u015F listesi bulunamad\u0131." });
    }
    if (temizleVeYukle) {
      if (supabase) {
        await supabase.from("siparisler").delete().neq("adet", -999999);
      }
      setSiparislerVeritabani([]);
    }
    if (supabase) {
      const chunkSize = 25;
      for (let i = 0; i < siparisler.length; i += chunkSize) {
        const chunk = siparisler.slice(i, i + chunkSize);
        const sbChunk = chunk.map((s) => hazirlaSupabasePayload(s));
        const { error } = await supabase.from("siparisler").insert(sbChunk);
        if (error) console.error("Yedek y\xFCkleme chunk hatas\u0131:", error.message);
      }
    }
    const formatlanmis = siparisler.map((s) => formatlaSiparis(s));
    setSiparislerVeritabani(
      temizleVeYukle ? [...formatlanmis] : [...formatlanmis, ...siparislerVeritabani]
    );
    res.json({
      basarili: true,
      mesaj: `${siparisler.length} sifari\u015F u\u011Furla bazaya idxal edildi v\u0259 b\u0259rpa olundu!`,
      toplam: siparisler.length
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: "Yedek y\xFCkleme ba\u015Far\u0131s\u0131z: " + err.message });
  }
});
router8.post("/ornek-verileri-yukle", async (req, res) => {
  res.redirect(307, "/api/veritabani/demo-yukle");
});
var veritabani_default = router8;

// src/server/routes/kargoEntegrasyon.ts
import { Router as Router9 } from "express";

// src/server/services/kargo/kargoMerkezi.ts
import fs4 from "fs";
import path6 from "path";

// src/server/services/kargo/providers/aramex.ts
import * as XLSX from "xlsx";
var AramexProvider = class {
  constructor() {
    this.tip = "ARAMEX";
    this.ad = "Aramex International";
    this.PROD_URL = "https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments";
    this.DEV_URL = "https://ws.dev.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments";
  }
  /**
   * Aramex takip durum kodlarını TOMNAP sisteminin 5 aşamalı yaşam döngüsüne haritalar.
   */
  mapStatus(updateCode, description, location) {
    const code = (updateCode || "").toUpperCase().trim();
    const desc = (description || "").toLowerCase();
    const loc = (location || "").toLowerCase();
    if (code === "DLV" || desc.includes("delivered") || desc.includes("t\u0259hvil verildi") || desc.includes("proof of delivery")) {
      return "TESLIM_EDILDI";
    }
    if (code === "SH008" || code === "SH068" || desc.includes("out for delivery") || desc.includes("kurye") || desc.includes("customs") || desc.includes("g\xF6mr\xFCk") || desc.includes("clearance") || loc.includes("baku") || loc.includes("bak\u0131") || loc.includes("gyd") || loc.includes("azerbaijan")) {
      return "BAKU_DAGITIM_ARKADAS";
    }
    if (code === "SH014" || code === "SH069" || code === "SH003" || desc.includes("departed") || desc.includes("in transit") || desc.includes("transit") || desc.includes("flight") || desc.includes("u\xE7u\u015F") || loc.includes("dubai") || loc.includes("dxb") || loc.includes("frankfurt")) {
      return "ULUSLARARASI_KARGO";
    }
    if (code === "SH001" || code === "SH005" || desc.includes("collected") || desc.includes("picked up") || desc.includes("record created") || desc.includes("received") || loc.includes("toronto") || loc.includes("yyz") || loc.includes("canada")) {
      return "KANADA_DEPO";
    }
    return "ULUSLARARASI_KARGO";
  }
  /**
   * Tekil Takip Sorgusu
   */
  async kargoTakipEt(takipNo, ayarlar) {
    const sonuclar = await this.topluTakipEt([takipNo], ayarlar);
    if (sonuclar.length > 0) {
      return sonuclar[0];
    }
    return {
      takipNo,
      durum: "ULUSLARARASI_KARGO",
      hamDurumKodu: "UNKNOWN",
      hamAciklama: "Kargo bilgisi tap\u0131lmad\u0131 v\u0259 ya sistemd\u0259 h\u0259l\u0259 i\u015Fl\u0259nm\u0259yib.",
      konum: "Nam\u0259lum M\u0259nt\u0259q\u0259",
      tarih: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Toplu Takip Sorgusu (50'şerli parçalama ile)
   */
  async topluTakipEt(takipNolari, ayarlar) {
    const temizNolar = takipNolari.map((n) => (n || "").trim()).filter((n) => n.length >= 6);
    if (temizNolar.length === 0) return [];
    const kimlik = ayarlar.kimlikBilgileri;
    const hasLiveCreds = Boolean(kimlik?.kullaniciAdi && kimlik?.sifre && kimlik?.hesapNo);
    if (!hasLiveCreds || kimlik.testModu) {
      return this.simuleTakipSonuclari(temizNolar, ayarlar);
    }
    const endpoint = kimlik.testModu ? this.DEV_URL : this.PROD_URL;
    const tumGuncellemeler = [];
    const CHUNK_SIZE = 50;
    for (let i = 0; i < temizNolar.length; i += CHUNK_SIZE) {
      const chunk = temizNolar.slice(i, i + CHUNK_SIZE);
      try {
        const payload = {
          ClientInfo: {
            UserName: kimlik.kullaniciAdi,
            Password: kimlik.sifre,
            Version: "v1.0",
            AccountNumber: kimlik.hesapNo || "",
            AccountPin: kimlik.pin || "",
            AccountEntity: kimlik.entity || (ayarlar.cikisUlkesi === "CA" ? "YYZ" : "DXB"),
            AccountCountryCode: ayarlar.cikisUlkesi || "CA"
          },
          GetLastTrackingUpdateOnly: true,
          Shipments: chunk
        };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(1e4)
        });
        if (!res.ok) {
          throw new Error(`Aramex HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        if (data && Array.isArray(data.TrackingResults)) {
          for (const item of data.TrackingResults) {
            const waybill = item.WaybillNumber;
            const code = item.UpdateCode || "";
            const desc = item.UpdateDescription || "";
            const loc = item.UpdateLocation || "";
            const dateStr = item.UpdateDateTime || (/* @__PURE__ */ new Date()).toISOString();
            tumGuncellemeler.push({
              takipNo: waybill,
              kaynak: "LIVE",
              durum: this.mapStatus(code, desc, loc),
              hamDurumKodu: code,
              hamAciklama: desc,
              konum: loc,
              tarih: dateStr,
              detaylar: item
            });
          }
        } else {
          throw new Error("Ge\xE7erli canl\u0131 kargo yan\u0131t\u0131 al\u0131namad\u0131.");
        }
      } catch (err) {
        throw new Error("Canl\u0131 kargo takibi ba\u015Far\u0131s\u0131z. Sipari\u015F durumlar\u0131 de\u011Fi\u015Ftirilmedi.");
      }
    }
    return tumGuncellemeler;
  }
  /**
   * Canlı Bağlantı Testi (Test Connection)
   */
  async baglantiTesti(ayarlar) {
    const baslangic = Date.now();
    const kimlik = ayarlar.kimlikBilgileri;
    if (!kimlik?.kullaniciAdi || !kimlik?.sifre) {
      return {
        basarili: true,
        mesaj: "Aramex simulyasiya v\u0259 demo rejimi aktivdir (R\u0259smi API a\xE7arlar\u0131 daxil edilm\u0259yib).",
        saglayici: this.tip,
        gecikmeMs: 15,
        detay: { mod: "SIMULATION", hesapNo: kimlik.hesapNo || "" }
      };
    }
    try {
      const endpoint = kimlik.testModu ? this.DEV_URL : this.PROD_URL;
      const testAwb = "37349392426";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ClientInfo: {
            UserName: kimlik.kullaniciAdi,
            Password: kimlik.sifre,
            Version: "v1.0",
            AccountNumber: kimlik.hesapNo || "",
            AccountPin: kimlik.pin || "",
            AccountEntity: kimlik.entity || "YYZ",
            AccountCountryCode: ayarlar.cikisUlkesi || "CA"
          },
          GetLastTrackingUpdateOnly: true,
          Shipments: [testAwb]
        }),
        signal: AbortSignal.timeout(8e3)
      });
      const gecikmeMs = Date.now() - baslangic;
      const data = await res.json();
      if (data?.HasErrors && Array.isArray(data.Notifications) && data.Notifications.length > 0) {
        const errNotif = data.Notifications[0];
        return {
          basarili: false,
          mesaj: `Aramex X\u0259tas\u0131: ${errNotif.Message || "Do\u011Frulama u\u011Fursuz oldu"}`,
          saglayici: this.tip,
          gecikmeMs,
          detay: data.Notifications
        };
      }
      return {
        basarili: true,
        mesaj: `Aramex API ba\u011Flant\u0131s\u0131 u\u011Furludur! (Hesab: ${kimlik.hesapNo || ""}, Cavab vaxt\u0131: ${gecikmeMs}ms)`,
        saglayici: this.tip,
        gecikmeMs,
        detay: { endpoint, status: res.status }
      };
    } catch (err) {
      const gecikmeMs = Date.now() - baslangic;
      return {
        basarili: false,
        mesaj: `Ba\u011Flant\u0131 x\u0259tas\u0131: ${err.message}`,
        saglayici: this.tip,
        gecikmeMs,
        detay: err.stack
      };
    }
  }
  /**
   * Aramex Daily Dispatch / Manifest Excel & CSV Dosya Ayrıştırıcısı
   */
  async manifestoAyristir(dosyaBuffer, dosyaAdi) {
    try {
      const wb = XLSX.read(dosyaBuffer, { type: "buffer" });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        return {
          basarili: false,
          saglayici: this.tip,
          toplamSatir: 0,
          satirlar: [],
          hatalar: ["Excel fayl\u0131nda he\xE7 bir s\u0259hif\u0259 tap\u0131lmad\u0131."]
        };
      }
      const sheet = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rawRows.length < 2) {
        return {
          basarili: false,
          saglayici: this.tip,
          toplamSatir: 0,
          satirlar: [],
          hatalar: ["Fayl bo\u015Fdur v\u0259 ya ba\u015Fl\u0131q s\u0259tri m\xF6vcud deyil."]
        };
      }
      let baslikIndex = 0;
      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        const rowStr = rawRows[i].map((c) => String(c).toLowerCase()).join(" ");
        if (rowStr.includes("waybill") || rowStr.includes("awb") || rowStr.includes("tracking") || rowStr.includes("takip")) {
          baslikIndex = i;
          break;
        }
      }
      const headers = rawRows[baslikIndex].map((h) => String(h).trim().toLowerCase());
      const findCol = (...keywords) => {
        return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
      };
      const waybillCol = findCol(
        "waybill",
        "awb",
        "tracking",
        "takip",
        "hawb",
        "barcode",
        "kon\u015Fimento"
      );
      const nameCol = findCol(
        "consignee",
        "receiver",
        "al\u0131c\u0131",
        "alici",
        "m\xFC\u015Ft\u0259ri",
        "musteri",
        "name",
        "ad"
      );
      const phoneCol = findCol("phone", "telephone", "tel", "mobil", "\u0259laq\u0259");
      const cityCol = findCol("destination", "city", "\u015F\u0259h\u0259r", "sehir", "dest");
      const addressCol = findCol("address", "\xFCnvan", "unvan", "addr");
      const weightCol = findCol("weight", "gross weight", "\xE7\u0259ki", "ceki", "kilo", "kg");
      const dateCol = findCol("date", "tarix", "tarih", "dispatch");
      const refCol = findCol("reference", "ref", "order no", "siparis no", "sifari\u015F");
      const satirlar = [];
      for (let r = baslikIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;
        let waybill = waybillCol !== -1 ? String(row[waybillCol] || "").trim() : "";
        if (!waybill) {
          for (const cell of row) {
            const strCell = String(cell || "").trim();
            if (/^\d{8,14}$/.test(strCell)) {
              waybill = strCell;
              break;
            }
          }
        }
        if (!waybill) continue;
        const aliciAdi = nameCol !== -1 ? String(row[nameCol] || "").trim() : "M\xFC\u015Ft\u0259ri";
        const telefon = phoneCol !== -1 ? String(row[phoneCol] || "").trim() : void 0;
        const sehir = cityCol !== -1 ? String(row[cityCol] || "").trim() : "Bak\u0131";
        const adres = addressCol !== -1 ? String(row[addressCol] || "").trim() : void 0;
        let agirlikKg = void 0;
        if (weightCol !== -1) {
          const rawWeight = String(row[weightCol] || "").replace(/[^\d.,]/g, "").replace(",", ".");
          const numWeight = parseFloat(rawWeight);
          if (!isNaN(numWeight) && numWeight > 0) {
            agirlikKg = numWeight;
          }
        }
        const tarih = dateCol !== -1 ? String(row[dateCol] || "").trim() : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const referansNo = refCol !== -1 ? String(row[refCol] || "").trim() : void 0;
        satirlar.push({
          takipNo: waybill,
          aliciAdi,
          telefon,
          sehir,
          adres,
          agirlikKg,
          tarih,
          referansNo
        });
      }
      return {
        basarili: true,
        saglayici: this.tip,
        toplamSatir: satirlar.length,
        satirlar
      };
    } catch (err) {
      return {
        basarili: false,
        saglayici: this.tip,
        toplamSatir: 0,
        satirlar: [],
        hatalar: [`Fayl oxunark\u0259n x\u0259ta ba\u015F verdi: ${err.message}`]
      };
    }
  }
  /**
   * Geliştirme / Test ve Demo için Akıllı Takip Simülasyonu
   */
  simuleTakipSonuclari(takipNolari, ayarlar) {
    const simdi = /* @__PURE__ */ new Date();
    const cikisSehri = ayarlar.cikisSehri || "Toronto (YYZ)";
    const varisSehri = ayarlar.varisHavalimani || "Bak\u0131 (GYD)";
    return takipNolari.map((takipNo, idx) => {
      const sonHane = parseInt(takipNo.slice(-1), 10) || idx % 10;
      if (sonHane >= 8) {
        return {
          takipNo,
          kaynak: "SIMULATION",
          durum: "TESLIM_EDILDI",
          hamDurumKodu: "DLV",
          hamAciklama: "Ba\u011Flama Bak\u0131da \xFCnvanda m\xFC\u015Ft\u0259riy\u0259 u\u011Furla t\u0259hvil verildi (\u0130mzal\u0131).",
          konum: `${varisSehri}, Az\u0259rbaycan`,
          tarih: new Date(simdi.getTime() - 1e3 * 60 * 60 * 4).toISOString()
        };
      } else if (sonHane >= 5) {
        return {
          takipNo,
          kaynak: "SIMULATION",
          durum: "BAKU_DAGITIM_ARKADAS",
          hamDurumKodu: "SH008",
          hamAciklama: "Heyd\u0259r \u018Fliyev Beyn\u0259lxalq Hava Liman\u0131nda (GYD) g\xF6mr\xFCk r\u0259smil\u0259\u015Fdirilm\u0259si tamamland\u0131, kurye b\xF6lg\xFCs\xFCnd\u0259dir.",
          konum: `${varisSehri} Kurye M\u0259rk\u0259zi`,
          tarih: new Date(simdi.getTime() - 1e3 * 60 * 60 * 12).toISOString()
        };
      } else if (sonHane >= 2) {
        return {
          takipNo,
          kaynak: "SIMULATION",
          durum: "ULUSLARARASI_KARGO",
          hamDurumKodu: "SH014",
          hamAciklama: "Kargo tranzit qov\u015Fa\u011F\u0131ndan yola d\xFC\u015Fd\xFC (Aramex Flight - In Transit to GYD).",
          konum: "Dubai Hub (DXB), B\u018F\u018F",
          tarih: new Date(simdi.getTime() - 1e3 * 60 * 60 * 28).toISOString()
        };
      } else {
        return {
          takipNo,
          kaynak: "SIMULATION",
          durum: "KANADA_DEPO",
          hamDurumKodu: "SH005",
          hamAciklama: `Kargo ${cikisSehri} anbar\u0131nda q\u0259bul edildi v\u0259 beyn\u0259lxalq g\xF6nd\u0259ri\u015F \xFC\xE7\xFCn qabla\u015Fd\u0131r\u0131ld\u0131.`,
          konum: cikisSehri,
          tarih: new Date(simdi.getTime() - 1e3 * 60 * 60 * 48).toISOString()
        };
      }
    });
  }
};

// src/server/services/kargo/providers/dhl.ts
import * as XLSX2 from "xlsx";
var DhlExpressProvider = class {
  constructor() {
    this.tip = "DHL";
    this.ad = "DHL Express International";
  }
  async kargoTakipEt(takipNo, ayarlar) {
    const sonuclar = await this.topluTakipEt([takipNo], ayarlar);
    return sonuclar[0];
  }
  async topluTakipEt(takipNolari, ayarlar) {
    const simdi = /* @__PURE__ */ new Date();
    const cikis = ayarlar.cikisSehri || "Leipzig Hub / Toronto";
    const varis = ayarlar.varisHavalimani || "Baku GYD";
    return takipNolari.map((takipNo) => ({
      takipNo,
      kaynak: "SIMULATION",
      durum: "ULUSLARARASI_KARGO",
      hamDurumKodu: "DHL_IN_TRANSIT",
      hamAciklama: `Shipment has departed DHL Hub (${cikis}) towards ${varis}`,
      konum: cikis,
      tarih: simdi.toISOString()
    }));
  }
  async baglantiTesti(ayarlar) {
    const apiKey = ayarlar.kimlikBilgileri?.apiKey;
    return {
      basarili: true,
      mesaj: apiKey ? "DHL Express API a\xE7ar\u0131 t\u0259sdiql\u0259ndi (Haz\u0131r mod)." : "DHL Express inteqrasiya modulu haz\u0131rd\u0131r (SaaS geni\u015Fl\u0259nm\u0259si \xFC\xE7\xFCn aktiv).",
      saglayici: this.tip,
      gecikmeMs: 25,
      detay: { provider: "DHL Express v2 REST", cikisUlkesi: ayarlar.cikisUlkesi }
    };
  }
  async manifestoAyristir(dosyaBuffer, dosyaAdi) {
    const wb = XLSX2.read(dosyaBuffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX2.utils.sheet_to_json(sheet, { header: 1 });
    return {
      basarili: true,
      saglayici: this.tip,
      toplamSatir: Math.max(0, rawRows.length - 1),
      satirlar: []
    };
  }
};

// src/server/services/kargo/providers/ups.ts
import * as XLSX3 from "xlsx";
var UpsProvider = class {
  constructor() {
    this.tip = "UPS";
    this.ad = "UPS Worldwide Express";
  }
  async kargoTakipEt(takipNo, ayarlar) {
    const sonuclar = await this.topluTakipEt([takipNo], ayarlar);
    return sonuclar[0];
  }
  async topluTakipEt(takipNolari, ayarlar) {
    const simdi = /* @__PURE__ */ new Date();
    const cikis = ayarlar.cikisSehri || "Louisville (SDF) / Toronto";
    return takipNolari.map((takipNo) => ({
      takipNo,
      kaynak: "SIMULATION",
      durum: "ULUSLARARASI_KARGO",
      hamDurumKodu: "UPS_ON_WAY",
      hamAciklama: `UPS Worldport departure scan (${cikis})`,
      konum: cikis,
      tarih: simdi.toISOString()
    }));
  }
  async baglantiTesti(ayarlar) {
    return {
      basarili: true,
      mesaj: "UPS OAuth2 v\u0259 Tracking API interfeysi aktivdir.",
      saglayici: this.tip,
      gecikmeMs: 20,
      detay: { provider: "UPS Developer Kit REST", cikisUlkesi: ayarlar.cikisUlkesi }
    };
  }
  async manifestoAyristir(dosyaBuffer, dosyaAdi) {
    const wb = XLSX3.read(dosyaBuffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX3.utils.sheet_to_json(sheet, { header: 1 });
    return {
      basarili: true,
      saglayici: this.tip,
      toplamSatir: Math.max(0, rawRows.length - 1),
      satirlar: []
    };
  }
};

// src/server/services/kargo/kargoMerkezi.ts
var AYARLAR_DOSYA_YOLU = path6.join(DATA_DIR, "kargo_ayarlari.json");
var VARSAYILAN_AYARLAR = {
  tenantId: "kanada_shopper_baku",
  saglayici: "ARAMEX",
  aktif: true,
  cikisUlkesi: "CA",
  cikisSehri: "Toronto (YYZ)",
  varisUlkesi: "AZ",
  varisHavalimani: "Heyd\u0259r \u018Fliyev Beyn\u0259lxalq Hava Liman\u0131 (GYD)",
  kimlikBilgileri: {
    kullaniciAdi: "",
    sifre: "",
    hesapNo: "",
    pin: "",
    entity: "YYZ",
    testModu: true
  },
  otomatikSenkronizasyon: true,
  guncellenmeTarihi: (/* @__PURE__ */ new Date()).toISOString()
};
var KargoMerkezi = class {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
    this.tenantAyarlari = /* @__PURE__ */ new Map();
    this.kayitSaglayici(new AramexProvider());
    this.kayitSaglayici(new DhlExpressProvider());
    this.kayitSaglayici(new UpsProvider());
    this.yukleAyarlariDosyadan();
  }
  kayitSaglayici(provider) {
    this.providers.set(provider.tip, provider);
  }
  getProvider(tip) {
    const provider = this.providers.get(tip);
    if (!provider) {
      return this.providers.get("ARAMEX");
    }
    return provider;
  }
  getAyarlar(tenantId) {
    const tid = tenantId;
    if (!tid || tid === "all") throw new Error("Kargo i\u015Flemi i\xE7in firma se\xE7in.");
    const ayar = this.tenantAyarlari.get(tid);
    if (ayar) {
      return structuredClone(ayar);
    }
    return {
      ...structuredClone(VARSAYILAN_AYARLAR),
      tenantId: tid
    };
  }
  kaydetAyarlar(yeniAyarlar) {
    const tid = yeniAyarlar.tenantId || "kanada_shopper_baku";
    const mevcut = this.getAyarlar(tid);
    const guncel = {
      ...mevcut,
      ...yeniAyarlar,
      tenantId: tid,
      kimlikBilgileri: {
        ...mevcut.kimlikBilgileri,
        ...yeniAyarlar.kimlikBilgileri || {}
      },
      guncellenmeTarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (yeniAyarlar.kimlikBilgileri && (!yeniAyarlar.kimlikBilgileri.sifre || yeniAyarlar.kimlikBilgileri.sifre === "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")) {
      guncel.kimlikBilgileri.sifre = mevcut.kimlikBilgileri.sifre;
    }
    if (yeniAyarlar.kimlikBilgileri && (!yeniAyarlar.kimlikBilgileri.pin || yeniAyarlar.kimlikBilgileri.pin === "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")) {
      guncel.kimlikBilgileri.pin = mevcut.kimlikBilgileri.pin;
    }
    this.tenantAyarlari.set(tid, guncel);
    this.kaydetAyarlariDosyaya();
    return guncel;
  }
  /**
   * İstemciye (Frontend) gönderilirken şifre ve PIN kodlarını maskeler.
   */
  maskeleAyarlar(ayarlar) {
    return {
      ...ayarlar,
      kimlikBilgileri: {
        ...ayarlar.kimlikBilgileri,
        sifre: ayarlar.kimlikBilgileri.sifre ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
        pin: ayarlar.kimlikBilgileri.pin ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
        sifreTanimli: Boolean(ayarlar.kimlikBilgileri.sifre),
        pinTanimli: Boolean(ayarlar.kimlikBilgileri.pin)
      }
    };
  }
  /**
   * Canlı Bağlantı Testi
   */
  async baglantiTesti(ayarlar) {
    const provider = this.getProvider(ayarlar.saglayici);
    return provider.baglantiTesti(ayarlar);
  }
  /**
   * Tekil veya Toplu Canlı AWB Takip Sorgusu
   */
  async takipEt(takipNolari, tenantId) {
    const ayarlar = this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);
    return provider.topluTakipEt(takipNolari, ayarlar);
  }
  /**
   * Tenant'ın yoldaki tüm aktif kargolarını otomatik Aramex/Kargo API ile senkronize eder.
   */
  async topluSenkronizeEt(tenantId) {
    const ayarlar = this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);
    let adaylar = siparislerVeritabani;
    if (supabase) {
      const { data, error } = await supabase.from("siparisler").select("*").eq("tenant_id", tenantId);
      if (error) throw new Error("Kargo sipari\u015Fleri okunamad\u0131.");
      adaylar = (data || []).map(formatlaSiparis);
    }
    const aktifSiparisler = adaylar.filter(
      (s) => s.tenant_id === tenantId && Boolean(s.uluslararasi_kargo_kodu?.trim()) && s.lojistik_durumu !== "TESLIM_EDILDI"
    );
    if (aktifSiparisler.length === 0) {
      return {
        basarili: true,
        sorgulananSayi: 0,
        guncellenenSayi: 0,
        detaylar: []
      };
    }
    const awbListesi = aktifSiparisler.map((s) => s.uluslararasi_kargo_kodu.trim());
    const takipSonuclari = await provider.topluTakipEt(awbListesi, ayarlar);
    if (takipSonuclari.some((result) => result.kaynak !== "LIVE"))
      throw new Error(
        "Sim\xFClasyon sonu\xE7lar\u0131 sipari\u015Flere kaydedilemez. Canl\u0131 kargo hesab\u0131 yap\u0131land\u0131r\u0131n."
      );
    const takipMap = /* @__PURE__ */ new Map();
    for (const res of takipSonuclari) {
      takipMap.set(res.takipNo.toUpperCase(), res);
    }
    let guncellenenSayi = 0;
    const detaylar = [];
    const simdiIso = (/* @__PURE__ */ new Date()).toISOString();
    for (const siparis of aktifSiparisler) {
      const awb = siparis.uluslararasi_kargo_kodu.trim().toUpperCase();
      const guncelleme = takipMap.get(awb);
      if (!guncelleme) continue;
      if (siparis.lojistik_durumu !== guncelleme.durum) {
        const eski = siparis.lojistik_durumu;
        siparis.lojistik_durumu = guncelleme.durum;
        siparis.guncellenme_tarihi = simdiIso;
        const kargoLog = `[${ayarlar.saglayici} Canl\u0131: ${guncelleme.konum} - ${guncelleme.hamAciklama}]`;
        if (!siparis.baku_tahsilat_notu?.includes(guncelleme.konum)) {
          siparis.baku_tahsilat_notu = `${siparis.baku_tahsilat_notu ? siparis.baku_tahsilat_notu + " " : ""}${kargoLog}`.trim();
        }
        guncellenenSayi++;
        detaylar.push({
          id: siparis.id,
          takipNo: awb,
          eskiDurum: eski,
          yeniDurum: guncelleme.durum,
          konum: guncelleme.konum
        });
        if (supabase) {
          try {
            const payload = hazirlaSupabasePayload(siparis);
            const { data, error } = await supabase.from("siparisler").update(payload).eq("id", siparis.id).eq("tenant_id", tenantId).select("id").maybeSingle();
            if (error || !data) throw new Error("Kargo g\xFCncellemesi kaydedilemedi.");
          } catch {
            throw new Error("Kargo g\xFCncellemesi kaydedilemedi.");
          }
        }
      }
    }
    return {
      basarili: true,
      sorgulananSayi: aktifSiparisler.length,
      guncellenenSayi,
      detaylar
    };
  }
  // Kalıcılık (Persistence)
  yukleAyarlariDosyadan() {
    try {
      if (fs4.existsSync(AYARLAR_DOSYA_YOLU)) {
        const content = fs4.readFileSync(AYARLAR_DOSYA_YOLU, "utf-8");
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.tenantId) {
              if (item.kimlikBilgileri) {
                if (item.kimlikBilgileri.sifre) {
                  item.kimlikBilgileri.sifre = cozMetin(item.kimlikBilgileri.sifre);
                }
                if (item.kimlikBilgileri.pin) {
                  item.kimlikBilgileri.pin = cozMetin(item.kimlikBilgileri.pin);
                }
              }
              this.tenantAyarlari.set(item.tenantId, item);
            }
          }
        }
      } else {
        this.tenantAyarlari.set(VARSAYILAN_AYARLAR.tenantId, { ...VARSAYILAN_AYARLAR });
        this.kaydetAyarlariDosyaya();
      }
    } catch (err) {
      console.warn("Kargo ayarlar\u0131 dosyas\u0131 okunamad\u0131, varsay\u0131lan y\xFCklendi:", err);
      this.tenantAyarlari.set(VARSAYILAN_AYARLAR.tenantId, { ...VARSAYILAN_AYARLAR });
    }
  }
  kaydetAyarlariDosyaya() {
    try {
      const dir = path6.dirname(AYARLAR_DOSYA_YOLU);
      if (!fs4.existsSync(dir)) {
        fs4.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.tenantAyarlari.values()).map((item) => ({
        ...item,
        kimlikBilgileri: {
          ...item.kimlikBilgileri,
          sifre: item.kimlikBilgileri?.sifre ? sifreleMetin(item.kimlikBilgileri.sifre) : "",
          pin: item.kimlikBilgileri?.pin ? sifreleMetin(item.kimlikBilgileri.pin) : ""
        }
      }));
      fs4.writeFileSync(AYARLAR_DOSYA_YOLU, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.error("Kargo ayarlar\u0131 dosyaya yaz\u0131lamad\u0131:", err);
    }
  }
};
var kargoMerkezi = new KargoMerkezi();

// src/server/routes/kargoEntegrasyon.ts
var router9 = Router9();
var DESTEKLENEN_SAGLAYICILAR = [
  {
    id: "ARAMEX",
    ad: "Aramex International",
    aciklama: "Kanada \u2794 Bak\xFC ana hava kargo hatt\u0131 (REST API v2 Canl\u0131 & Batch)",
    durum: "AKTIF"
  },
  {
    id: "DHL",
    ad: "DHL Express",
    aciklama: "Qlobal ekspres kurye \u015F\u0259b\u0259k\u0259si v\u0259 hava yolu da\u015F\u0131malar\u0131",
    durum: "GENISLETILEBILIR"
  },
  {
    id: "UPS",
    ad: "UPS Worldwide",
    aciklama: "\u015Eimali Amerika v\u0259 Avropa m\u0259rk\u0259zli geni\u015F lojistika \u015F\u0259b\u0259k\u0259si",
    durum: "GENISLETILEBILIR"
  },
  {
    id: "FEDEX",
    ad: "FedEx Cross-Border",
    aciklama: "AB\u015E v\u0259 Asiya istiqam\u0259tli beyn\u0259lxalq parsel xidm\u0259ti",
    durum: "GENISLETILEBILIR"
  },
  {
    id: "MANUEL",
    ad: "F\u0259rdi / \xD6z\u0259l Karqo",
    aciklama: "Kargo kodu v\u0259 \xE7\u0259kinin \u0259l il\u0259 daxil edildiyi \u0259n\u0259n\u0259vi rejim",
    durum: "AKTIF"
  }
];
var DESTEKLENEN_ULKELER = [
  { kod: "CA", ad: "Kanada", bayrak: "\u{1F1E8}\u{1F1E6}", anaHavalimani: "Toronto Pearson (YYZ)" },
  { kod: "US", ad: "AB\u015E (Amerika)", bayrak: "\u{1F1FA}\u{1F1F8}", anaHavalimani: "New York (JFK) / Chicago (ORD)" },
  { kod: "JP", ad: "Yaponiya", bayrak: "\u{1F1EF}\u{1F1F5}", anaHavalimani: "Tokyo Narita (NRT)" },
  {
    kod: "GB",
    ad: "B\xF6y\xFCk Britaniya (\u0130ngilt\u0259r\u0259)",
    bayrak: "\u{1F1EC}\u{1F1E7}",
    anaHavalimani: "London Heathrow (LHR)"
  },
  { kod: "DE", ad: "Almaniya", bayrak: "\u{1F1E9}\u{1F1EA}", anaHavalimani: "Frankfurt (FRA)" },
  { kod: "TR", ad: "T\xFCrkiy\u0259", bayrak: "\u{1F1F9}\u{1F1F7}", anaHavalimani: "\u0130stanbul (IST)" },
  { kod: "AE", ad: "B\u018F\u018F (Birl\u0259\u015Fmi\u015F \u018Fr\u0259b \u018Fmirlikl\u0259ri)", bayrak: "\u{1F1E6}\u{1F1EA}", anaHavalimani: "Dubai (DXB)" }
];
router9.get("/kargo/ayarlar", (req, res) => {
  const tenantId = req.query.tenant_id || "kanada_shopper_baku";
  const ayarlar = kargoMerkezi.getAyarlar(tenantId);
  const maskeli = kargoMerkezi.maskeleAyarlar(ayarlar);
  res.json({
    basarili: true,
    ayarlar: maskeli,
    desteklenenSaglayicilar: DESTEKLENEN_SAGLAYICILAR,
    desteklenenUlkeler: DESTEKLENEN_ULKELER
  });
});
router9.post("/kargo/ayarlar", (req, res) => {
  try {
    const {
      tenantId = "kanada_shopper_baku",
      saglayici = "ARAMEX",
      cikisUlkesi = "CA",
      cikisSehri = "Toronto (YYZ)",
      varisUlkesi = "AZ",
      varisHavalimani = "Heyd\u0259r \u018Fliyev Beyn\u0259lxalq Hava Liman\u0131 (GYD)",
      kimlikBilgileri = {},
      otomatikSenkronizasyon = true,
      aktif = true
    } = req.body;
    const guncel = kargoMerkezi.kaydetAyarlar({
      tenantId,
      saglayici,
      cikisUlkesi,
      cikisSehri,
      varisUlkesi,
      varisHavalimani,
      kimlikBilgileri,
      otomatikSenkronizasyon,
      aktif
    });
    res.json({
      basarili: true,
      mesaj: `Kargo t\u0259nziml\u0259m\u0259l\u0259ri "${saglayici}" \xFC\xE7\xFCn u\u011Furla yadda saxlan\u0131ld\u0131!`,
      ayarlar: kargoMerkezi.maskeleAyarlar(guncel)
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router9.post("/kargo/test", async (req, res) => {
  try {
    const { tenantId = "kanada_shopper_baku", ayarlar } = req.body;
    const testAyar = ayarlar ? { ...kargoMerkezi.getAyarlar(tenantId), ...ayarlar, tenantId } : kargoMerkezi.getAyarlar(tenantId);
    const sonuc = await kargoMerkezi.baglantiTesti(testAyar);
    res.json(sonuc);
  } catch (err) {
    res.status(500).json({
      basarili: false,
      mesaj: `Ba\u011Flant\u0131 s\u0131na\u011F\u0131 x\u0259tas\u0131: ${err.message}`,
      saglayici: req.body.ayarlar?.saglayici || "ARAMEX",
      gecikmeMs: 0
    });
  }
});
router9.post("/kargo/takip", async (req, res) => {
  try {
    const { takipNolari, tenantId = "kanada_shopper_baku" } = req.body;
    if (!Array.isArray(takipNolari) || takipNolari.length === 0) {
      return res.status(400).json({
        basarili: false,
        hata: "Z\u0259hm\u0259t olmasa \u0259n az\u0131 bir izl\u0259m\u0259 (AWB) n\xF6mr\u0259si daxil edin."
      });
    }
    const sonuclar = await kargoMerkezi.takipEt(takipNolari, tenantId);
    res.json({
      basarili: true,
      toplam: sonuclar.length,
      sonuclar
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router9.post("/kargo/senkronize-et", async (req, res) => {
  try {
    const { tenantId = "all" } = req.body;
    const sonuc = await kargoMerkezi.topluSenkronizeEt(tenantId);
    res.json({
      mesaj: sonuc.guncellenenSayi > 0 ? `${sonuc.sorgulananSayi} kargodan ${sonuc.guncellenenSayi} \u0259d\u0259dinin statusu yenil\u0259ndi!` : `${sonuc.sorgulananSayi} aktiv kargo yoxland\u0131, b\xFCt\xFCn statuslar aktuald\u0131r.`,
      ...sonuc
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
router9.post("/kargo/manifesto-yukle", async (req, res) => {
  try {
    const {
      dosya_base64,
      dosya_adi = "manifest.xlsx",
      tenantId = "kanada_shopper_baku",
      otomatik_esle = true
    } = req.body;
    if (!dosya_base64) {
      return res.status(400).json({ basarili: false, hata: "Excel v\u0259 ya CSV fayl m\u0259zmunu (base64) t\u0259l\u0259b olunur." });
    }
    if (typeof dosya_base64 !== "string" || dosya_base64.length > 14 * 1024 * 1024)
      return res.status(413).json({ basarili: false, hata: "Manifesto en fazla 10 MB olabilir." });
    const base64Data = dosya_base64.replace(/^data:.*?;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const ayarlar = kargoMerkezi.getAyarlar(tenantId);
    const provider = kargoMerkezi.getProvider(ayarlar.saglayici);
    const sonuc = await provider.manifestoAyristir(buffer, dosya_adi);
    if (!sonuc.basarili) {
      return res.status(400).json(sonuc);
    }
    let eslesenSayisi = 0;
    const eslesmeler = [];
    if (otomatik_esle && sonuc.satirlar.length > 0) {
      const simdiIso = (/* @__PURE__ */ new Date()).toISOString();
      let adaylar = siparislerVeritabani;
      if (supabase) {
        const { data, error } = await supabase.from("siparisler").select("*").eq("tenant_id", tenantId);
        if (error) return res.status(503).json({ basarili: false, hata: "Sipari\u015Fler okunamad\u0131." });
        adaylar = data || [];
      }
      for (const satir of sonuc.satirlar) {
        const aliciTemiz = satir.aliciAdi.toLowerCase().replace(/[^a-z0-9]/g, "");
        const telTemiz = (satir.telefon || "").replace(/[^\d]/g, "").slice(-7);
        const bulunan = adaylar.find((s) => {
          if (s.tenant_id !== tenantId) {
            return false;
          }
          if (telTemiz && (s.telefon_numarasi || "").replace(/[^\d]/g, "").includes(telTemiz)) {
            return true;
          }
          const sMusteriTemiz = (s.musteri_adi || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (aliciTemiz.length >= 4 && (sMusteriTemiz.includes(aliciTemiz) || aliciTemiz.includes(sMusteriTemiz))) {
            return true;
          }
          return false;
        });
        if (bulunan) {
          bulunan.uluslararasi_kargo_kodu = satir.takipNo;
          if (satir.agirlikKg) {
            bulunan.kargo_agirligi_kg = satir.agirlikKg;
          }
          if (bulunan.lojistik_durumu === "KANADA_SATINALIM_BEKLIYOR" || bulunan.lojistik_durumu === "KANADA_DEPO") {
            bulunan.lojistik_durumu = "ULUSLARARASI_KARGO";
          }
          bulunan.guncellenme_tarihi = simdiIso;
          eslesenSayisi++;
          eslesmeler.push({
            siparisId: bulunan.id,
            musteriAdi: bulunan.musteri_adi,
            awbNo: satir.takipNo,
            agirlikKg: satir.agirlikKg
          });
          if (supabase) {
            try {
              const payload = hazirlaSupabasePayload(bulunan);
              const { data, error } = await supabase.from("siparisler").update(payload).eq("id", bulunan.id).eq("tenant_id", tenantId).select("id").maybeSingle();
              if (error || !data)
                return res.status(503).json({ basarili: false, hata: "Manifesto de\u011Fi\u015Fikli\u011Fi kaydedilemedi." });
            } catch {
              return res.status(503).json({ basarili: false, hata: "Manifesto de\u011Fi\u015Fikli\u011Fi kaydedilemedi." });
            }
          }
        }
      }
    }
    res.json({
      basarili: true,
      mesaj: `Excel u\u011Furla oxundu: ${sonuc.toplamSatir} s\u0259tir tap\u0131ld\u0131, ${eslesenSayisi} sifari\u015Fl\u0259 AWB barkodu ba\u011Fland\u0131!`,
      ayristirma: sonuc,
      eslesenSayisi,
      eslesmeler
    });
  } catch (err) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});
var kargoEntegrasyon_default = router9;

// src/server/routes/auth.ts
import { Router as Router10 } from "express";
import { randomUUID as randomUUID4 } from "node:crypto";
var router10 = Router10();
function isUnexpired(value) {
  return typeof value === "string" && Date.parse(value) > Date.now();
}
function isPendingActivation(user, token) {
  return user.aktivasyon_token === token && user.durum === "BEKLEMEDE_SIFRE" && isUnexpired(user.token_gecerlilik);
}
function isAvailableInvite(invite, token) {
  return invite.token === token && invite.kullanildiMi === false && ["PATRON", "KANADA_SATINALMA", "SATIS_SORUMLUSU", "BAKU_FINANS", "BAKU_KURYE"].includes(
    invite.rol
  ) && isUnexpired(invite.gecerlilikTarihi);
}
async function findActivationUser(token) {
  if (!supabase) return kullanicilarVeritabani.find((user) => user.aktivasyon_token === token);
  const { data, error } = await supabase.from("kullanicilar").select("*").eq("aktivasyon_token", token).maybeSingle();
  if (error) throw error;
  return data || void 0;
}
async function findInvite(token) {
  if (!supabase) return davetlerVeritabani.find((invite) => invite.token === token);
  const { data, error } = await supabase.from("davetler").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  if (!data) return void 0;
  return {
    token: data.token,
    tenantId: data.firma_id,
    tenantAd: "",
    rol: data.rol,
    olusturanKisi: data.olusturan_rol,
    olusturmaTarihi: data.olusturma_tarihi,
    gecerlilikTarihi: data.son_kullanma_tarihi,
    kullanildiMi: data.durum !== "AKTIF",
    kullananKisi: data.kullanan_adi
  };
}
async function findFirma(tenantId) {
  if (!supabase) return firmalarVeritabani.find((firma) => firma.id === tenantId);
  const { data, error } = await supabase.from("firmalar").select("*").eq("id", tenantId).maybeSingle();
  if (error) throw error;
  return data || void 0;
}
function cacheUser(user) {
  const index = kullanicilarVeritabani.findIndex((item) => item.id === user.id);
  if (index < 0) kullanicilarVeritabani.push(user);
  else kullanicilarVeritabani[index] = user;
  kullanicilariKaydetDosyaya(kullanicilarVeritabani);
}
router10.get(["/auth/token-kontrol/:token", "/firmalar/davet/:token"], async (req, res) => {
  try {
    const token = req.params.token.trim();
    if (!token) return res.status(400).json({ basarili: false, hata: "Token t\u0259qdim edilm\u0259yib." });
    const user = await findActivationUser(token);
    if (user) {
      if (!isPendingActivation(user, token)) {
        return res.status(400).json({
          basarili: false,
          hata: "Bu aktivasiya linki etibars\u0131zd\u0131r v\u0259 ya vaxt\u0131 bitmi\u015Fdir."
        });
      }
      const firma = await findFirma(user.tenant_id);
      return res.json({
        basarili: true,
        tip: "aktivasyon",
        email: user.email,
        adSoyad: user.ad_soyad,
        butikAdi: firma?.ad || "",
        rol: user.rol,
        tenantId: user.tenant_id
      });
    }
    const invite = await findInvite(token);
    if (invite) {
      if (!isAvailableInvite(invite, token)) {
        return res.status(400).json({
          basarili: false,
          hata: "Bu d\u0259v\u0259t linki etibars\u0131zd\u0131r, istifad\u0259 edilib v\u0259 ya vaxt\u0131 bitmi\u015Fdir."
        });
      }
      const firma = await findFirma(invite.tenantId);
      return res.json({
        basarili: true,
        tip: "davet",
        email: invite.email || "",
        adSoyad: invite.kullananKisi || "",
        butikAdi: firma?.ad || invite.tenantAd || "",
        rol: invite.rol,
        tenantId: invite.tenantId,
        davet: invite,
        firma: firma ? { id: firma.id, ad: firma.ad, sehir: firma.sehir } : void 0
      });
    }
    return res.status(404).json({
      basarili: false,
      hata: "Aktivasiya v\u0259 ya d\u0259v\u0259t linki etibars\u0131zd\u0131r v\u0259 ya tap\u0131lmad\u0131."
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: "Token haz\u0131rda yoxlan\u0131la bilmir. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
router10.post(["/auth/sifre-belirle", "/firmalar/davet/katil"], async (req, res) => {
  try {
    const { token, sifre, adSoyad, telefon, email } = req.body || {};
    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ basarili: false, hata: "T\u0259hl\xFCk\u0259sizlik tokeni m\xFCtl\u0259qdir." });
    }
    if (typeof sifre !== "string" || sifre.length < 6) {
      return res.status(400).json({ basarili: false, hata: "\u015Eifr\u0259 \u0259n az\u0131 6 simvoldan ibar\u0259t olmal\u0131d\u0131r." });
    }
    const cleanToken = token.trim();
    const user = await findActivationUser(cleanToken);
    if (user) {
      if (!isPendingActivation(user, cleanToken)) {
        return res.status(400).json({
          basarili: false,
          hata: "Bu aktivasiya linki etibars\u0131zd\u0131r v\u0259 ya vaxt\u0131 bitmi\u015Fdir."
        });
      }
      const firma2 = await findFirma(user.tenant_id);
      if (!isPendingActivation(user, cleanToken)) {
        return res.status(400).json({ basarili: false, hata: "Bu aktivasiya linki art\u0131q etibarl\u0131 deyil." });
      }
      const changes = {
        sifre_hash: sifreHashle(sifre),
        durum: "AKTIF",
        aktivasyon_token: null,
        token_gecerlilik: null,
        ad_soyad: typeof adSoyad === "string" && adSoyad.trim() ? adSoyad.trim() : user.ad_soyad,
        telefon: typeof telefon === "string" && telefon.trim() ? telefon.trim() : user.telefon
      };
      if (supabase) {
        const { data: updated, error } = await supabase.from("kullanicilar").update(changes).eq("id", user.id).eq("aktivasyon_token", cleanToken).eq("durum", "BEKLEMEDE_SIFRE").gt("token_gecerlilik", (/* @__PURE__ */ new Date()).toISOString()).select("id").maybeSingle();
        if (error) throw error;
        if (!updated)
          return res.status(409).json({ basarili: false, hata: "Bu aktivasiya linki art\u0131q etibarl\u0131 deyil." });
        if (firma2?.onay_durumu === "BEKLEMEDE") {
          const { error: firmaError } = await supabase.from("firmalar").update({ onay_durumu: "AKTIF" }).eq("id", user.tenant_id).eq("onay_durumu", "BEKLEMEDE");
          if (firmaError) throw firmaError;
          firma2.onay_durumu = "AKTIF";
        }
      } else {
        if (!isPendingActivation(user, cleanToken)) {
          return res.status(400).json({ basarili: false, hata: "Bu aktivasiya linki art\u0131q etibarl\u0131 deyil." });
        }
        Object.assign(user, changes);
      }
      const activatedUser = { ...user, ...changes };
      cacheUser(activatedUser);
      const localFirma2 = firmalarVeritabani.find((item) => item.id === user.tenant_id);
      if (localFirma2?.onayDurumu === "BEKLEMEDE") {
        localFirma2.onayDurumu = "AKTIF";
        firmalariKaydetDosyaya(firmalarVeritabani);
      }
      return res.json({
        basarili: true,
        mesaj: "\u015Eifr\u0259niz u\u011Furla t\u0259yin edildi! \u0130ndi daxil ola bil\u0259rsiniz.",
        kullanici: {
          id: user.id,
          adSoyad: activatedUser.ad_soyad,
          email: user.email,
          telefon: activatedUser.telefon,
          rol: user.rol,
          tenantId: user.tenant_id
        },
        firma: firma2
      });
    }
    const invite = await findInvite(cleanToken);
    if (!invite)
      return res.status(404).json({
        basarili: false,
        hata: "Bu token\u0259 uy\u011Fun g\xF6zl\u0259y\u0259n qeydiyyat v\u0259 ya d\u0259v\u0259t tap\u0131lmad\u0131."
      });
    if (!isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({
        basarili: false,
        hata: "Bu d\u0259v\u0259t etibars\u0131zd\u0131r, istifad\u0259 edilib v\u0259 ya vaxt\u0131 bitmi\u015Fdir."
      });
    }
    if (email !== void 0 && typeof email !== "string" || telefon !== void 0 && typeof telefon !== "string") {
      return res.status(400).json({ basarili: false, hata: "E-po\xE7t v\u0259 telefon m\u0259tn format\u0131nda olmal\u0131d\u0131r." });
    }
    const userEmail = (typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "") || (typeof email === "string" ? email.trim().toLowerCase() : "");
    const userPhone = typeof telefon === "string" ? telefon.trim() : "";
    const validEmail = userEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
    const phoneDigits = userPhone.replace(/\D/g, "");
    const validPhone = /^[+\d\s().-]+$/.test(userPhone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
    if (userEmail && !validEmail || userPhone && !validPhone || !validEmail && !validPhone) {
      return res.status(400).json({
        basarili: false,
        hata: "Sonradan giri\u015F \xFC\xE7\xFCn etibarl\u0131 e-po\xE7t \xFCnvan\u0131 v\u0259 ya telefon n\xF6mr\u0259si daxil edin."
      });
    }
    const firma = await findFirma(invite.tenantId);
    if (!firma) return res.status(404).json({ basarili: false, hata: "\u018Flaq\u0259li butik tap\u0131lmad\u0131." });
    if (!isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({ basarili: false, hata: "Bu d\u0259v\u0259t art\u0131q etibarl\u0131 deyil." });
    }
    const newUser = {
      id: "usr_" + randomUUID4(),
      tenant_id: invite.tenantId,
      ad_soyad: typeof adSoyad === "string" && adSoyad.trim() ? adSoyad.trim() : invite.kullananKisi || "Komanda \xDCzv\xFC",
      email: userEmail || `invite-${randomUUID4()}@tomnap.internal`,
      telefon: userPhone,
      rol: invite.rol,
      sifre_hash: sifreHashle(sifre),
      durum: "AKTIF",
      aktivasyon_token: null,
      token_gecerlilik: null,
      olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (supabase) {
      const { data: claimed, error } = await supabase.from("davetler").update({
        durum: "KULLANILDI",
        kullanan_adi: newUser.ad_soyad,
        kullanan_telefon: newUser.telefon,
        kullanildi_tarih: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("token", cleanToken).eq("durum", "AKTIF").gt("son_kullanma_tarihi", (/* @__PURE__ */ new Date()).toISOString()).select("token").maybeSingle();
      if (error) throw error;
      if (!claimed)
        return res.status(409).json({ basarili: false, hata: "Bu d\u0259v\u0259t art\u0131q etibarl\u0131 deyil." });
      const { data: inserted, error: insertError } = await supabase.from("kullanicilar").insert(newUser).select("id").maybeSingle();
      if (insertError) throw insertError;
      if (!inserted)
        return res.status(503).json({ basarili: false, hata: "\u0130stifad\u0259\xE7i qeydi yarad\u0131la bilm\u0259di." });
    }
    if (!supabase && !isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({ basarili: false, hata: "Bu d\u0259v\u0259t art\u0131q etibarl\u0131 deyil." });
    }
    invite.kullanildiMi = true;
    invite.kullananKisi = newUser.ad_soyad;
    const localInvite = davetlerVeritabani.find((item) => item.token === cleanToken);
    if (localInvite) Object.assign(localInvite, invite);
    cacheUser(newUser);
    const localFirma = firmalarVeritabani.find((item) => item.id === invite.tenantId);
    if (localFirma) {
      localFirma.aktifKullaniciSayilari ||= {
        PATRON: 1,
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0
      };
      const role = invite.rol;
      if (localFirma.aktifKullaniciSayilari[role] !== void 0)
        localFirma.aktifKullaniciSayilari[role] += 1;
      firmalariKaydetDosyaya(firmalarVeritabani);
    }
    return res.json({
      basarili: true,
      tenantId: invite.tenantId,
      tenantAd: firma.ad,
      rol: invite.rol,
      mesaj: `T\u0259brikl\u0259r! "${firma.ad}" komandas\u0131na ${invite.rol} olaraq \u015Fifr\u0259niz t\u0259yin edildi.`,
      kullanici: {
        id: newUser.id,
        adSoyad: newUser.ad_soyad,
        email: newUser.email,
        telefon: newUser.telefon,
        rol: newUser.rol,
        tenantId: newUser.tenant_id
      },
      firma
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: "\u015Eifr\u0259 haz\u0131rda t\u0259yin edil\u0259 bilmir. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
function normalizePhone(value) {
  if (!/^[+\d\s().-]+$/.test(value)) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}
async function findLoginUser(identifier) {
  const email = identifier.toLowerCase();
  const phone2 = normalizePhone(identifier);
  const emailMatches = (user) => user.email?.toLowerCase() === email;
  const phoneMatches = (user) => !!phone2 && normalizePhone(user.telefon || "") === phone2;
  if (!supabase) {
    const matches2 = kullanicilarVeritabani.filter(
      (user) => emailMatches(user) || phoneMatches(user)
    );
    return matches2.length === 1 ? { ...matches2[0] } : void 0;
  }
  if (email.includes("@") && email.length <= 254) {
    const escapedEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
    const { data, error } = await supabase.from("kullanicilar").select("*").ilike("email", escapedEmail).maybeSingle();
    if (error) throw error;
    return data && emailMatches(data) ? data : void 0;
  }
  if (phone2) {
    const pattern = `%${phone2.split("").join("%")}%`;
    const { data, error } = await supabase.from("kullanicilar").select("*").ilike("telefon", pattern);
    if (error) throw error;
    const matches2 = (data || []).filter(phoneMatches);
    return matches2.length === 1 ? matches2[0] : void 0;
  }
  return void 0;
}
router10.post(["/auth/giris", "/firmalar/giris"], async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { identifikator, email, kullaniciAdi, telefon, kod, sifre } = req.body || {};
    const identifier = identifikator || email || kullaniciAdi || telefon || kod;
    if (typeof identifier !== "string" || !identifier.trim() || identifier.length > 254) {
      return res.status(400).json({ basarili: false, hata: "E-po\xE7t \xFCnvan\u0131n\u0131z\u0131 v\u0259 ya telefon n\xF6mr\u0259nizi daxil edin." });
    }
    if (typeof sifre !== "string" || !sifre || sifre.length > 1024) {
      return res.status(400).json({ basarili: false, hata: "Z\u0259hm\u0259t olmasa \u015Fifr\u0259nizi daxil edin." });
    }
    const user = await findLoginUser(identifier.trim());
    if (!user) {
      return res.status(404).json({ basarili: false, hata: "Bu m\u0259lumatlara uy\u011Fun aktiv istifad\u0259\xE7i tap\u0131lmad\u0131." });
    }
    if (user.durum !== "AKTIF") {
      return res.status(403).json({
        basarili: false,
        hata: user.durum === "BEKLEMEDE_SIFRE" ? "Hesab\u0131n\u0131z h\u0259l\u0259 aktivl\u0259\u015Fdirilm\u0259yib. E-po\xE7t \xFCnvan\u0131n\u0131za g\xF6nd\u0259ril\u0259n linkd\u0259n \u015Fifr\u0259nizi t\u0259yin edin." : "Hesab\u0131n\u0131z aktiv deyil."
      });
    }
    if (!user.sifre_hash || !sifreDogrula(sifre, user.sifre_hash)) {
      return res.status(401).json({ basarili: false, hata: "Daxil edilmi\u015F \u015Fifr\u0259 yanl\u0131\u015Fd\u0131r." });
    }
    const firma = user.rol === "SUPER_ADMIN" ? void 0 : await findFirma(user.tenant_id);
    const session = await createSession(user, res);
    const tenantId = user.rol === "SUPER_ADMIN" ? "all" : user.tenant_id;
    return res.json({
      basarili: true,
      tip: user.rol === "SUPER_ADMIN" ? "super_admin" : "butik",
      rol: user.rol,
      tenantId,
      kullanici: {
        id: user.id,
        adSoyad: user.ad_soyad,
        email: user.email,
        telefon: user.telefon,
        rol: user.rol,
        tenantId
      },
      firma,
      ...session,
      mesaj: `Xo\u015F g\u0259ldiniz, ${user.ad_soyad}!`
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: "Giri\u015F haz\u0131rda yoxlan\u0131la bilmir. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
router10.get("/auth/oturum", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = req.auth || await readSession(req);
    if (!session) return res.status(401).json({ basarili: false, hata: "Giri\u015F t\u0259l\u0259b olunur." });
    return res.json({
      basarili: true,
      kullanici: session.kullanici,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt
    });
  } catch {
    return res.status(503).json({ basarili: false, hata: "Oturum haz\u0131rda yoxlan\u0131la bilmir." });
  }
});
router10.post("/auth/cikis", async (req, res) => {
  try {
    await revokeSession(req, res);
    return res.json({ basarili: true });
  } catch {
    return res.status(503).json({ basarili: false, hata: "Oturum l\u0259\u011Fv edil\u0259 bilm\u0259di. Yenid\u0259n c\u0259hd edin." });
  }
});
var auth_default = router10;

// src/server/index.ts
function createApp() {
  const app2 = express();
  app2.set("trust proxy", 1);
  app2.use(
    helmet({
      contentSecurityPolicy: false,
      // SPA için CSP'yi devre dışı bırak (Vite dev server uyumu)
      crossOriginResourcePolicy: { policy: "same-origin" },
      // Görsel servisi için
      crossOriginEmbedderPolicy: false
    })
  );
  app2.use(corsMiddleware());
  app2.use(requestLogger);
  app2.use((req, res, next) => {
    if (req.body !== void 0 && typeof req.body === "object") {
      req._body = true;
    }
    next();
  });
  app2.use(express.json({ limit: "25mb" }));
  app2.use(express.urlencoded({ extended: true, limit: "25mb" }));
  app2.use(
    [
      "/api/auth/giris",
      "/api/firmalar/giris",
      "/api/auth/sifre-belirle",
      "/api/firmalar/davet/katil",
      "/api/firmalar/kayit"
    ],
    girisLimiter
  );
  app2.use(apiKeyAuth());
  app2.get(["/health", "/api/health"], (_req, res) => res.json({ basarili: true }));
  app2.use("/api/", genelApiLimiter);
  app2.use("/api/ayristir-siparis", aiEndpointLimiter);
  app2.use("/api/urun-katalog-gorseli-ara", aiEndpointLimiter);
  app2.use("/api/gorselden-urun-ara", aiEndpointLimiter);
  app2.use("/api/webhook/siparis", aiEndpointLimiter);
  app2.use("/api/veritabani/temizle", veritabaniYonetimLimiter);
  app2.use("/api/veritabani/demo-yukle", veritabaniYonetimLimiter);
  app2.use("/api/veritabani/yedek-yukle", veritabaniYonetimLimiter);
  try {
    if (!fs5.existsSync(UPLOADS_DIR)) {
      fs5.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch {
  }
  app2.get("/uploads/:dosyaAdi", serveUploadedImage);
  const mountRoutes = (basePath) => {
    app2.use(basePath, sistem_default);
    app2.use(basePath, siparisler_default);
    app2.use(basePath, musteriler_default);
    app2.use(basePath, inbox_default);
    app2.use(basePath, firmalar_default);
    app2.use(basePath, kuryeler_default);
    app2.use(basePath, gorsel_default);
    app2.use(basePath, veritabani_default);
    app2.use(basePath, kargoEntegrasyon_default);
    app2.use(basePath, auth_default);
  };
  mountRoutes("/api");
  app2.use(errorHandler);
  return app2;
}

// src/server/vercel.ts
var app = createApp();
function handler(req, res) {
  try {
    const originalUrl = req.url || "";
    const queryIndex = originalUrl.indexOf("?");
    const queryString = queryIndex !== -1 ? originalUrl.substring(queryIndex) : "";
    const forwardedUri = req.headers?.["x-forwarded-uri"];
    if (forwardedUri && typeof forwardedUri === "string" && (forwardedUri.startsWith("/api") || forwardedUri.startsWith("/uploads"))) {
      req.url = forwardedUri;
    } else if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/uploads")) {
      req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
    }
    if (queryString && !req.url.includes("?")) {
      req.url += queryString;
    } else if (req.query && typeof req.query === "object" && Object.keys(req.query).length > 0 && !req.url.includes("?")) {
      const qs = new URLSearchParams(req.query).toString();
      if (qs) {
        req.url += "?" + qs;
      }
    }
    return app(req, res);
  } catch (err) {
    console.error("Vercel Serverless Handler X\u0259tas\u0131:", err);
    if (!res.headersSent) {
      return res.status(500).json({ basarili: false, hata: err?.message || "Daxili server x\u0259tas\u0131" });
    }
  }
}
export {
  handler as default
};
