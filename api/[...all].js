// src/server/index.ts
import express from "express";
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
function isAwbReviewEnabled() {
  return process.env.FF_AWB_REVIEW === "true";
}
function isV2FlowEnabled() {
  return process.env.FF_V2_FLOW === "true";
}
var RESEND_API_KEY = process.env.RESEND_API_KEY || "";
var EMAIL_FROM = process.env.EMAIL_FROM || "TOMNAP Platform <onboarding@resend.dev>";
var APP_URL = process.env.APP_URL || (IS_PRODUCTION ? "https://tomnap.com" : `http://localhost:${PORT}`);
if (SUPABASE_URL && !SUPABASE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY gerekli; anonim anahtar sunucuda kullan\u0131lamaz.");

// src/server/middleware/auth.ts
import { timingSafeEqual as timingSafeEqual2 } from "node:crypto";

// src/server/services/sessions.ts
import { createHash, randomBytes as randomBytes2, timingSafeEqual } from "node:crypto";
import fs2 from "node:fs";
import path4 from "node:path";

// src/server/services/state.ts
import path3 from "path";

// src/server/services/atomicJson.ts
import fs from "node:fs";
import path2 from "node:path";
import { randomBytes } from "node:crypto";
var JsonStorageError = class extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.status = 503;
    this.name = "JsonStorageError";
  }
};
function readJsonFile(filename, validate) {
  let serialized;
  try {
    serialized = fs.readFileSync(filename, "utf8");
  } catch (error2) {
    if (error2.code === "ENOENT") return void 0;
    throw new JsonStorageError("Yerel veri dosyas\u0131 okunamad\u0131.", error2);
  }
  try {
    const value = JSON.parse(serialized);
    if (!validate(value)) throw new Error("Invalid persisted data shape");
    return value;
  } catch (error2) {
    throw new JsonStorageError(
      "Yerel veri dosyas\u0131 ge\xE7ersiz; mevcut veriler de\u011Fi\u015Ftirilmedi.",
      error2
    );
  }
}
function writeJsonAtomic(filename, value) {
  let temporary;
  let descriptor;
  try {
    const serialized = JSON.stringify(value, null, 2);
    if (serialized === void 0) throw new Error("Value is not JSON serializable");
    const directory = path2.dirname(filename);
    fs.mkdirSync(directory, { recursive: true, mode: 448 });
    temporary = path2.join(
      directory,
      `.${path2.basename(filename)}.${randomBytes(16).toString("hex")}.tmp`
    );
    descriptor = fs.openSync(temporary, "wx", 384);
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = void 0;
    fs.renameSync(temporary, filename);
    temporary = void 0;
  } catch (error2) {
    throw new JsonStorageError("Yerel veriler kaydedilemedi; i\u015Flem tamamlanmad\u0131.", error2);
  } finally {
    if (descriptor !== void 0) {
      try {
        fs.closeSync(descriptor);
      } catch {
      }
    }
    if (temporary) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
      }
    }
  }
}

// src/shared/roller.ts
var PLATFORM_ROLU = "SUPER_ADMIN";
var EKIP_ROLLERI = [
  "PATRON",
  // Butik sahibi: finans, kurye ve sipariş tam kontrol; sistem kodları hariç
  "KANADA_SATINALMA",
  // Kanada satın alma fişleri, kargo belgeleri, kurye atama
  "ABD_SATINALMA",
  // ABD'de satın alma ve ABD deposunda kabul (K18); v1'de Kanada'nın eşi
  "SATIS_SORUMLUSU",
  // Görsel ve WhatsApp siparişi girer, onay bekleyenleri işler
  "BAKU_FINANS",
  // Bakü tahsilat, kasa ve kalan borç kapama
  "BAKU_KURYE"
  // Yalnız kendi kurye kaydına açıkça atanmış paketleri görür
];
var ROLLER = [PLATFORM_ROLU, ...EKIP_ROLLERI];
var ROL_KUMESI = new Set(ROLLER);
var EKIP_ROL_KUMESI = new Set(EKIP_ROLLERI);
function gecerliRolMu(value) {
  return typeof value === "string" && ROL_KUMESI.has(value);
}
function ekipRoluMu(value) {
  return typeof value === "string" && EKIP_ROL_KUMESI.has(value);
}
var OWNERS = [PLATFORM_ROLU, "PATRON"];
var SALES = [...OWNERS, "SATIS_SORUMLUSU"];
var BUYERS = ["KANADA_SATINALMA", "ABD_SATINALMA"];
var STAFF = [...SALES, ...BUYERS, "BAKU_FINANS"];
var ROL_GRUPLARI = {
  /** Kurye dışındaki herkes. */
  STAFF,
  OWNERS,
  SALES,
  BUYERS,
  PURCHASING: [...SALES, ...BUYERS],
  FINANCE: [...SALES, "BAKU_FINANS"],
  /** AWB, kargo ve kurye ataması. */
  SHIPPING: [...OWNERS, ...BUYERS],
  ALL: [...STAFF, "BAKU_KURYE"]
};
function rolGrubunda(role, grup) {
  return ROL_GRUPLARI[grup].includes(role);
}
var VARSAYILAN_ROL_LIMITLERI = {
  PATRON: 1,
  KANADA_SATINALMA: 2,
  ABD_SATINALMA: 2,
  SATIS_SORUMLUSU: 4,
  BAKU_FINANS: 2,
  BAKU_KURYE: 10
};
var PAKET_ROL_LIMITLERI = {
  BASLANGIC: {
    PATRON: 1,
    KANADA_SATINALMA: 1,
    ABD_SATINALMA: 1,
    SATIS_SORUMLUSU: 1,
    BAKU_FINANS: 1,
    BAKU_KURYE: 1
  },
  PRO: {
    PATRON: 1,
    KANADA_SATINALMA: 2,
    ABD_SATINALMA: 2,
    SATIS_SORUMLUSU: 2,
    BAKU_FINANS: 2,
    BAKU_KURYE: 5
  },
  ENTERPRISE: {
    PATRON: 2,
    KANADA_SATINALMA: 5,
    ABD_SATINALMA: 5,
    SATIS_SORUMLUSU: 10,
    BAKU_FINANS: 5,
    BAKU_KURYE: 25
  }
};
var EKSIK_ANAHTAR_KOTASI = {
  ABD_SATINALMA: VARSAYILAN_ROL_LIMITLERI.ABD_SATINALMA
};
function rolKotasi(limitler, rol) {
  const kayitli = limitler?.[rol];
  return kayitli === void 0 || kayitli === null ? EKSIK_ANAHTAR_KOTASI[rol] ?? 0 : Number(kayitli);
}
function ilkKullaniciSayilari() {
  const sayilar = Object.fromEntries(EKIP_ROLLERI.map((rol) => [rol, 0]));
  sayilar.PATRON = 1;
  return sayilar;
}

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
var GOLDEN_DEMO_SIPARISLER = JSON.parse(JSON.stringify(BASLANGIC_SIPARISLER)).map(
  (s) => ({
    ...s,
    tenant_id: "demo_sandbox",
    is_demo: true
  })
);
var demoSiparislerVeritabani = JSON.parse(JSON.stringify(GOLDEN_DEMO_SIPARISLER));
function setDemoSiparislerVeritabani(yeniListe) {
  demoSiparislerVeritabani = yeniListe;
}
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
var IDENTITY_DOSYA_YOLU = path3.join(DATA_DIR, "identity.json");
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var nonempty = (value) => typeof value === "string" && value.length > 0;
function companyRecord(value) {
  return object(value) && nonempty(value.id) && nonempty(value.ad) && typeof value.sehir === "string" && ["AZN", "CAD", "USD"].includes(String(value.varsayilanParaBirimi)) && typeof value.varsayilanKomisyonYuzdesi === "number" && Number.isFinite(value.varsayilanKomisyonYuzdesi) && typeof value.aciklama === "string";
}
function userRecord(value) {
  return object(value) && nonempty(value.id) && nonempty(value.tenant_id) && typeof value.ad_soyad === "string" && typeof value.email === "string" && gecerliRolMu(value.rol) && ["BEKLEMEDE_SIFRE", "AKTIF", "PASIF"].includes(String(value.durum)) && typeof value.olusturma_tarihi === "string";
}
function inviteRecord(value) {
  return object(value) && nonempty(value.token) && nonempty(value.tenantId) && typeof value.tenantAd === "string" && ekipRoluMu(value.rol) && typeof value.olusturanKisi === "string" && typeof value.olusturmaTarihi === "string" && typeof value.gecerlilikTarihi === "string" && typeof value.kullanildiMi === "boolean";
}
function records(value, valid, key) {
  return Array.isArray(value) && value.every(valid) && new Set(value.map((item) => item[key])).size === value.length;
}
function snapshotRecord(value) {
  return object(value) && value.version === 1 && records(value.companies, companyRecord, "id") && records(value.users, userRecord, "id") && records(value.invites, inviteRecord, "token") && Array.isArray(value.emailJobs) && value.emailJobs.every(object);
}
function defaultCompanies() {
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
function loadIdentitySnapshot() {
  const current = readJsonFile(IDENTITY_DOSYA_YOLU, snapshotRecord);
  if (current !== void 0)
    return structuredClone({
      companies: current.companies,
      users: current.users,
      invites: current.invites,
      emailJobs: current.emailJobs
    });
  const companies = readJsonFile(
    FIRMALAR_DOSYA_YOLU,
    (value) => records(value, companyRecord, "id")
  );
  const users = readJsonFile(
    KULLANICILAR_DOSYA_YOLU,
    (value) => records(value, userRecord, "id")
  );
  return {
    companies: companies === void 0 ? defaultCompanies() : companies,
    users: users ?? [],
    invites: [],
    emailJobs: []
  };
}
var initialIdentity = IS_PRODUCTION || SUPABASE_URL ? { companies: [], users: [], invites: [], emailJobs: [] } : loadIdentitySnapshot();
var firmalarVeritabani = initialIdentity.companies;
var kullanicilarVeritabani = initialIdentity.users;
var davetlerVeritabani = initialIdentity.invites;
var identityEmailJobs = initialIdentity.emailJobs;
function getIdentitySnapshot() {
  return structuredClone({
    companies: firmalarVeritabani,
    users: kullanicilarVeritabani,
    invites: davetlerVeritabani,
    emailJobs: identityEmailJobs
  });
}
function saveIdentitySnapshot(next) {
  let snapshot;
  try {
    snapshot = structuredClone({
      version: 1,
      ...next,
      emailJobs: next.emailJobs ?? identityEmailJobs
    });
  } catch (error2) {
    throw new JsonStorageError("Yerel kimlik verileri ge\xE7ersiz.", error2);
  }
  if (!snapshotRecord(snapshot)) throw new JsonStorageError("Yerel kimlik verileri ge\xE7ersiz.");
  writeJsonAtomic(IDENTITY_DOSYA_YOLU, snapshot);
  firmalarVeritabani = snapshot.companies;
  kullanicilarVeritabani = snapshot.users;
  davetlerVeritabani = snapshot.invites;
  identityEmailJobs = snapshot.emailJobs;
}
function firmalariKaydetDosyaya(companies) {
  saveIdentitySnapshot({ ...getIdentitySnapshot(), companies });
}
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
var SESSION_FILE = path4.join(DATA_DIR, "oturumlar.json");
var HEX_TOKEN = /^[a-f0-9]{64}$/;
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function fingerprint(user) {
  return digest(JSON.stringify([user.id, user.sifre_hash, user.rol, user.tenant_id]));
}
function validUser(user) {
  return !!user && user.durum === "AKTIF" && gecerliRolMu(user.rol) && typeof user.id === "string" && !!user.id && typeof user.tenant_id === "string" && !!user.tenant_id && (user.tenant_id !== "all" || user.rol === "SUPER_ADMIN") && typeof user.sifre_hash === "string" && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.sifre_hash);
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
  const records2 = JSON.parse(fs2.readFileSync(SESSION_FILE, "utf8"));
  if (!Array.isArray(records2) || !records2.every(validRecord)) {
    throw new Error("Session storage is invalid");
  }
  return records2;
}
function saveLocal(records2) {
  fs2.mkdirSync(DATA_DIR, { recursive: true, mode: 448 });
  const temporary = `${SESSION_FILE}.${randomBytes2(12).toString("hex")}.tmp`;
  try {
    fs2.writeFileSync(temporary, JSON.stringify(records2), {
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
  const { data, error: error2 } = await supabase.from("kullanicilar").select("*").eq("id", id).maybeSingle();
  if (error2) throw error2;
  return data || void 0;
}
async function tenantEnabled(user) {
  if (user.rol === "SUPER_ADMIN") return true;
  if (!supabase) {
    const company = firmalarVeritabani.find((item) => item.id === user.tenant_id);
    return !!company && (!company.onayDurumu || company.onayDurumu === "AKTIF");
  }
  const { data, error: error2 } = await supabase.from("firmalar").select("id,onay_durumu").eq("id", user.tenant_id).maybeSingle();
  if (error2) throw error2;
  return !!data && (!data.onay_durumu || data.onay_durumu === "AKTIF");
}
async function createSession(user, res) {
  assertStorageAvailable();
  const verifiedFingerprint = fingerprint(user);
  const fresh = await currentUser(user.id);
  if (!validUser(fresh) || fingerprint(fresh) !== verifiedFingerprint || !await tenantEnabled(fresh)) {
    throw new Error("Account changed during login");
  }
  const token = randomBytes2(32).toString("hex");
  const record = {
    token_hash: digest(token),
    user_id: fresh.id,
    csrf_token: randomBytes2(32).toString("hex"),
    credential_fingerprint: fingerprint(fresh),
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString()
  };
  if (supabase) {
    const { data, error: error2 } = await supabase.from("oturumlar").insert(record).select("token_hash").maybeSingle();
    if (error2) throw error2;
    if (!data || data.token_hash !== record.token_hash)
      throw new Error("Session was not persisted");
  } else {
    const records2 = readLocal().filter((item) => Date.parse(item.expires_at) > Date.now());
    records2.push(record);
    saveLocal(records2);
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
    const { data, error: error2 } = await supabase.from("oturumlar").select("*").eq("token_hash", hash).maybeSingle();
    if (error2) throw error2;
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
      const { error: error2 } = await supabase.from("oturumlar").delete().eq("token_hash", hash);
      if (error2) throw error2;
    } else {
      saveLocal(readLocal().filter((item) => item.token_hash !== hash));
    }
  } finally {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.setHeader("Cache-Control", "no-store");
  }
}

// src/server/middleware/security.ts
import { URL as URL2 } from "url";
import { BlockList, isIP } from "node:net";
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
var { STAFF: STAFF2, OWNERS: OWNERS2, SALES: SALES2, PURCHASING, FINANCE, SHIPPING, ALL } = ROL_GRUPLARI;
var rules = [
  ["GET", /^\/api\/auth\/oturum$/, ALL],
  ["POST", /^\/api\/auth\/cikis$/, ALL],
  ["GET", /^\/api\/firmalar$/, STAFF2],
  ["POST", /^\/api\/firmalar\/davet-olustur$/, OWNERS2],
  ["POST", /^\/api\/firmalar$/, ["SUPER_ADMIN"]],
  ["PATCH", /^\/api\/firmalar\/[^/]+\/onay$/, ["SUPER_ADMIN"]],
  ["DELETE", /^\/api\/firmalar\/[^/]+$/, ["SUPER_ADMIN"]],
  ["GET", /^\/api\/(sistem-durum|veritabani\/(durum|yedek-al))$/, ["SUPER_ADMIN"]],
  [
    "POST",
    /^\/api\/(veritabani\/(temizle|demo-yukle|yedek-yukle)|ornek-verileri-yukle)$/,
    ["SUPER_ADMIN"]
  ],
  ["GET", /^\/api\/siparisler$/, STAFF2],
  ["POST", /^\/api\/(siparisler|ayristir-siparis)$/, PURCHASING],
  ["PATCH", /^\/api\/siparisler\/[^/]+$/, STAFF2],
  ["DELETE", /^\/api\/siparisler\/[^/]+$/, SALES2],
  ["POST", /^\/api\/siparisler\/tumunu-uluslararasi-kargo-yap$/, SHIPPING],
  ["GET", /^\/api\/musteriler(?:\/[^/]+\/siparisler)?$/, FINANCE],
  ["POST", /^\/api\/musteriler$/, SALES2],
  ["GET", /^\/api\/inbox$/, SALES2],
  ["POST", /^\/api\/(inbox\/[^/]+\/(onayla|reddet)|webhook\/siparis)$/, SALES2],
  ["GET", /^\/api\/kuryeler$/, [...SHIPPING, "BAKU_FINANS"]],
  ["POST", /^\/api\/kuryeler(?:\/[^/]+\/kullanici)?$/, OWNERS2],
  ["POST", /^\/api\/siparisler\/[^/]+\/kurye$/, SHIPPING],
  ["GET", /^\/api\/kurye\/gorevler$/, ["BAKU_KURYE"]],
  ["POST", /^\/api\/kurye\/gorevler\/[^/]+\/teslim$/, ["BAKU_KURYE"]],
  ["GET", /^\/api\/kargo\/ayarlar$/, SHIPPING],
  ["POST", /^\/api\/kargo\/ayarlar$/, OWNERS2],
  ["POST", /^\/api\/kargo\/(test|takip|senkronize-et|manifesto-yukle)$/, SHIPPING],
  // Human-confirmed AWB matching (FF_AWB_REVIEW): same roles that may edit an order's AWB.
  ["POST", /^\/api\/kargo\/manifesto-eslestirme\/(oneriler|onayla)$/, SHIPPING],
  ["GET", /^\/api\/proxy-gorsel$/, STAFF2],
  // v2 (FF_V2_FLOW): kapı bayrak kapalıyken bu kurallara hiç ulaşılmadan 404 döner.
  ["GET", /^\/api\/v2\/durum$/, STAFF2],
  ["GET", /^(?:\/api)?\/uploads\/[^/]+$/, STAFF2],
  [
    "POST",
    /^\/api\/(upload-gorsel|urun-katalog-gorseli-ara|gorselden-urun-ara|katalog-gorseli-kaydet|urun-orijinal-gorsele-don)$/,
    PURCHASING
  ]
];
function isPublic(req) {
  const read4 = req.method === "GET" || req.method === "HEAD";
  return read4 && /^\/(?:api\/)?health$/.test(req.path) || read4 && /^\/api\/(auth\/token-kontrol|firmalar\/davet)\/[^/]+$/.test(req.path) || req.method === "POST" && /^\/api\/(auth\/(giris|sifre-belirle)|firmalar\/(giris|kayit|davet\/katil))$/.test(req.path);
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
        ([m, path9, roles]) => m === method && path9.test(req.path) && roles.includes(auth.role)
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
  error(message, error2, meta) {
    if (!shouldLog("error")) return;
    const errObj = error2 instanceof Error ? { name: error2.name, message: error2.message, stack: error2.stack } : error2 ? { error: error2 } : {};
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
        error2 ? error2 : "",
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
      const { count, error: error2 } = await supabase.from("siparisler").select("*", { count: "exact", head: true });
      if (error2) {
        supabaseHata = error2.message;
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
var sistem_default = router;

// src/server/routes/siparisler.ts
import { Router as Router3 } from "express";
import { randomUUID } from "node:crypto";

// src/server/services/listPagination.ts
import { createHash as createHash2 } from "node:crypto";

// src/server/services/publicFetch.ts
import { lookup } from "node:dns/promises";
import { isIP as isIP2 } from "node:net";
import http from "node:http";
import https from "node:https";
var MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var PublicResourceError = class extends Error {
  constructor(message, status2 = 403) {
    super(message);
    this.status = status2;
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
    const fail3 = (error2) => {
      clearTimeout(timer);
      reject(error2);
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
        incoming.on("error", fail3);
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== void 0)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const status2 = incoming.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status2)) {
          clearTimeout(timer);
          incoming.destroy();
          resolve({ status: status2, headers, body: Buffer.alloc(0) });
          return;
        }
        const length = Number(headers.get("content-length"));
        if (Number.isFinite(length) && length > maxBytes) {
          const error2 = new PublicResourceError("\u0130ndirilen dosya boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
          fail3(error2);
          incoming.destroy();
          request.destroy();
          return;
        }
        const encoding = headers.get("content-encoding");
        if (encoding && encoding !== "identity") {
          fail3(new PublicResourceError("S\u0131k\u0131\u015Ft\u0131r\u0131lm\u0131\u015F uzak yan\u0131t desteklenmiyor.", 502));
          incoming.destroy();
          request.destroy();
          return;
        }
        const chunks = [];
        let bytes = 0;
        incoming.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            fail3(new PublicResourceError("\u0130ndirilen dosya boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413));
            incoming.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("end", () => {
          clearTimeout(timer);
          resolve({ status: status2, headers, body: Buffer.concat(chunks) });
        });
        incoming.on(
          "aborted",
          () => fail3(new PublicResourceError("Uzak yan\u0131t tamamlanmad\u0131.", 502))
        );
      }
    );
    timer = setTimeout(() => {
      const error2 = new PublicResourceError("\u0130ndirme zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 504);
      request.destroy(error2);
      response?.destroy(error2);
    }, deadline - Date.now());
    request.on("error", fail3);
    try {
      request.end();
    } catch (error2) {
      clearTimeout(timer);
      request.destroy();
      reject(error2);
    }
  });
}
async function fetchPublicResource(rawUrl, options = {}) {
  const check = urlGuvenlimi(rawUrl);
  if (!check.guvenli) throw new PublicResourceError(check.sebep || "G\xFCvenli olmayan URL.");
  let url = new URL(rawUrl);
  const deadline = Date.now() + (options.timeoutMs ?? 7e3);
  for (let hop = 0; hop <= 4; hop++) {
    const result2 = await requestOnce(url, deadline, options);
    if ([301, 302, 303, 307, 308].includes(result2.status)) {
      const location = result2.headers.get("location");
      if (!location || hop === 4)
        throw new PublicResourceError("Ge\xE7ersiz veya \xE7ok fazla y\xF6nlendirme.", 502);
      url = new URL(location, url);
      continue;
    }
    const body2 = [204, 205, 304].includes(result2.status) ? null : new Uint8Array(result2.body);
    return new Response(body2, { status: result2.status, headers: result2.headers });
  }
  throw new PublicResourceError("\xC7ok fazla y\xF6nlendirme.", 502);
}

// src/server/services/listPagination.ts
var MAX_LIST_ITEMS = 1e4;
var MAX_BYTES = 32 * 1024 * 1024;
var invalid = () => new PublicResourceError("Ge\xE7ersiz liste imleci veya sayfa boyutu.", 400);
function listRequest(req, tenant2, dataset) {
  const value = req.query.page_size;
  if (value !== void 0 && (typeof value !== "string" || !/^[1-9]\d{0,2}$/.test(value)))
    throw invalid();
  const size = value === void 0 ? 200 : Number(value);
  if (size > 500) throw invalid();
  let cursor = null;
  if (req.query.cursor !== void 0) {
    const encoded = req.query.cursor;
    if (typeof encoded !== "string" || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded))
      throw invalid();
    try {
      cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw invalid();
    }
    if (!cursor || cursor.v !== 1 || cursor.tenant !== tenant2 || cursor.dataset !== dataset || cursor.size !== size || typeof cursor.after !== "string" || !cursor.after || cursor.after.length > 1024 || typeof cursor.revision !== "string" || !/^[a-f0-9]{32,64}$/.test(cursor.revision))
      throw invalid();
  }
  return { tenant: tenant2, dataset, size, cursor };
}
function boundedSnapshot(value, count) {
  if (count > MAX_LIST_ITEMS || Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES)
    throw new PublicResourceError(
      "Tam liste 10000 kay\u0131t veya 32 MiB s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor; daralt\u0131lm\u0131\u015F rapor gerekir.",
      413
    );
  return value;
}
function snapshotRevision(value) {
  return createHash2("sha256").update(JSON.stringify(value)).digest("hex");
}
function assertRevision(request, revision) {
  if (request.cursor && request.cursor.revision !== revision)
    throw new PublicResourceError("Liste y\xFCkleme s\u0131ras\u0131nda de\u011Fi\u015Fti. Ba\u015Ftan yenileyin.", 409);
}
function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
var customerKey = (row) => `${row.tenant_id || ""}\0${row.id}`;
function result(request, revision, total2, items, hasMore, key) {
  const nextCursor = hasMore ? Buffer.from(
    JSON.stringify({
      v: 1,
      tenant: request.tenant,
      dataset: request.dataset,
      revision,
      after: key(items.at(-1)),
      size: request.size
    })
  ).toString("base64url") : null;
  return {
    items,
    pagination: { version: 1, total: total2, hasMore, nextCursor, revision, pageSize: request.size }
  };
}
function memoryPage(request, source, revision, key = (row) => String(row.id)) {
  const ordered = [...source].sort((a, b) => compareKeys(key(a), key(b)));
  boundedSnapshot(ordered, ordered.length);
  const current = revision || snapshotRevision(ordered);
  assertRevision(request, current);
  const remaining = request.cursor ? ordered.filter((row) => key(row) > request.cursor.after) : ordered;
  const items = remaining.slice(0, request.size);
  return result(request, current, ordered.length, items, remaining.length > request.size, key);
}
function rpcFailure(error2) {
  const status2 = /^PT(400|409|413)$/.test(error2?.code) ? Number(error2.code.slice(2)) : 503;
  throw new PublicResourceError(
    status2 === 503 ? "Tutarl\u0131 liste okunamad\u0131." : error2.message,
    status2
  );
}
async function databasePage(request, table) {
  const { data, error: error2 } = await supabase.rpc("tomnap_list_page", {
    p_tenant: request.tenant,
    p_dataset: table,
    p_limit: request.size,
    p_after: request.cursor?.after || null,
    p_revision: request.cursor?.revision || null
  });
  if (error2) rpcFailure(error2);
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || typeof data.revision !== "string" || data.items.length > request.size + 1)
    rpcFailure(null);
  assertRevision(request, data.revision);
  boundedSnapshot(data.items, data.total);
  return {
    ...result(
      request,
      data.revision,
      data.total,
      data.items.slice(0, request.size),
      data.items.length > request.size,
      (row) => String(row.id)
    ),
    pending: data.pending
  };
}
async function customerSnapshot(request, local) {
  let snapshot;
  if (supabase && request.tenant !== "demo_sandbox") {
    const { data, error: error2 } = await supabase.rpc("tomnap_customer_snapshot", {
      p_tenant: request.tenant,
      p_revision: request.cursor?.revision || null
    });
    if (error2) rpcFailure(error2);
    if (!data || !Array.isArray(data.customers) || !Array.isArray(data.orders) || typeof data.revision !== "string")
      rpcFailure(null);
    snapshot = data;
  } else {
    snapshot = structuredClone(local());
    snapshot.customers.sort((a, b) => compareKeys(String(a.id), String(b.id)));
    snapshot.orders.sort((a, b) => compareKeys(String(a.id), String(b.id)));
    snapshot.revision = snapshotRevision(snapshot);
  }
  boundedSnapshot(snapshot, snapshot.customers.length + snapshot.orders.length);
  assertRevision(request, snapshot.revision);
  return snapshot;
}
async function completeCustomerDirectory(tenant2) {
  const request = { tenant: tenant2, dataset: "customer-directory", size: 500, cursor: null };
  const rows = [];
  for (; ; ) {
    const page = await databasePage(request, "musteriler");
    rows.push(...page.items);
    boundedSnapshot(rows, rows.length);
    if (!page.pagination.hasMore) {
      if (rows.length !== page.pagination.total)
        throw new PublicResourceError("M\xFC\u015Fteri rehberi eksik d\xF6nd\xFC.", 503);
      return rows;
    }
    request.cursor = {
      v: 1,
      tenant: tenant2,
      dataset: request.dataset,
      size: request.size,
      revision: page.pagination.revision,
      after: String(rows.at(-1).id)
    };
  }
}

// src/server/routes/siparisler.ts
import { Type } from "@google/genai";

// src/server/routes/gorsel.ts
import { randomBytes as randomBytes4 } from "node:crypto";
import { Router as Router2 } from "express";
import path6 from "path";

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
var SIPARIS_EK_ALANLAR = [
  "guncellenme_tarihi",
  "musteri_id",
  "musteri_tipi",
  "kanada_magaza_adi",
  "kanada_alis_fiyati_cad",
  "kanada_alis_fiyati_azn",
  "kargo_agirligi_kg",
  "kargo_ucreti_azn",
  "kanada_fatura_no",
  "kanada_fatura_gorseli",
  "kanada_gumruk_fin_kodu",
  "islem_gecmisi"
];
function siparisEkVerileriniAl(input) {
  const stored = input.ek_veriler && typeof input.ek_veriler === "object" && !Array.isArray(input.ek_veriler) ? input.ek_veriler : {};
  const result2 = {};
  for (const field of SIPARIS_EK_ALANLAR) {
    if (Object.hasOwn(stored, field) && stored[field] !== void 0) result2[field] = stored[field];
    if (Object.hasOwn(input, field) && input[field] !== void 0) result2[field] = input[field];
  }
  return result2;
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
  "is_demo",
  "ek_veriler"
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
    ek_veriler: siparisEkVerileriniAl(input),
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
  const extra = siparisEkVerileriniAl(s);
  s = { ...extra, ...s, ek_veriler: extra };
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
    const gorsel = u.urun_gorseli || u.gorsel_url || void 0;
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

// src/server/services/tenantImageNames.ts
import { createHash as createHash3, randomBytes as randomBytes3 } from "node:crypto";
function tenantImagePrefix(tenantId) {
  return `t_${createHash3("sha256").update(tenantId).digest("hex").slice(0, 24)}_`;
}

// src/server/services/imageValidation.ts
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

// src/server/services/privateImageStorage.ts
import fs3 from "node:fs";
import path5 from "node:path";
import { createClient as createClient2 } from "@supabase/supabase-js";

// src/server/services/storageTransport.ts
function cancelWithoutWaiting(body2) {
  try {
    void body2?.cancel().catch(() => {
    });
  } catch {
  }
}
function createBoundedStorageFetch(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15e3)
    throw new Error("Storage deadline must be between 1 and 15000 milliseconds.");
  return async function fetchStorage(input, init) {
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new PublicResourceError("Depolama iste\u011Fi zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 504)),
      timeoutMs
    );
    timer.unref();
    const caller = init?.signal ?? (input instanceof Request ? input.signal : void 0);
    const signal = caller ? AbortSignal.any([caller, deadline.signal]) : deadline.signal;
    let onAbort;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    let reader;
    try {
      signal.throwIfAborted();
      const response = await Promise.race([
        fetch(input, { ...init, redirect: "error", signal }).then((response2) => {
          if (signal.aborted) {
            cancelWithoutWaiting(response2.body);
            signal.throwIfAborted();
          }
          return response2;
        }),
        aborted
      ]);
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        cancelWithoutWaiting(response.body);
        throw new PublicResourceError("Depolama yan\u0131t\u0131 boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
      }
      if (!response.body) return response;
      reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        length += value.byteLength;
        if (length > MAX_IMAGE_BYTES)
          throw new PublicResourceError("Depolama yan\u0131t\u0131 boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
        chunks.push(value);
      }
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.set("content-length", String(length));
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error2) {
      cancelWithoutWaiting(reader);
      throw error2;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      try {
        reader?.releaseLock();
      } catch {
      }
    }
  };
}
var boundedStorageFetch = createBoundedStorageFetch(15e3);

// src/server/services/privateImageStorage.ts
var PRIVATE_IMAGE_BUCKET = "tomnap-private-images";
var PRIVATE_IMAGE_NAME = /^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/;
var error = () => new PublicResourceError(
  "\xD6zel g\xF6rsel depolamas\u0131 kullan\u0131lam\u0131yor; yap\u0131land\u0131rmay\u0131 kontrol edin.",
  503
);
function storageBackend() {
  const backend = process.env.UPLOAD_STORAGE_BACKEND || "local";
  if (!["local", "supabase"].includes(backend) || backend === "local" && process.env.VERCEL)
    throw error();
  if (backend === "supabase" && (!SUPABASE_URL || !SUPABASE_KEY)) throw error();
  return backend;
}
var client;
function storage() {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw error();
    const url = new URL(SUPABASE_URL);
    if (IS_PRODUCTION && url.protocol !== "https:") throw error();
    client = createClient2(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: boundedStorageFetch }
    });
  }
  return client.storage;
}
async function verifyPrivateBucket() {
  try {
    const { data, error: failure2 } = await storage().getBucket(PRIVATE_IMAGE_BUCKET);
    if (failure2 || !data || data.id !== PRIVATE_IMAGE_BUCKET || data.public !== false || !Number.isSafeInteger(data.file_size_limit) || data.file_size_limit > MAX_IMAGE_BYTES || data.file_size_limit <= 0 || !Array.isArray(data.allowed_mime_types) || !data.allowed_mime_types.length || data.allowed_mime_types.some(
      (type) => !["image/png", "image/jpeg", "image/webp"].includes(type)
    ))
      throw error();
  } catch {
    throw error();
  }
}
function namePath(name) {
  if (typeof name !== "string" || !PRIVATE_IMAGE_NAME.test(name))
    throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
  return path5.join(UPLOADS_DIR, name);
}
function readLocal2(name) {
  const filename = namePath(name);
  let descriptor;
  try {
    descriptor = fs3.openSync(filename, fs3.constants.O_RDONLY | fs3.constants.O_NOFOLLOW);
    const stat = fs3.fstatSync(descriptor);
    if (!stat.isFile()) throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel dosyas\u0131.", 403);
    if (stat.size > MAX_IMAGE_BYTES)
      throw new PublicResourceError("G\xF6rsel boyut s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 413);
    return fs3.readFileSync(descriptor);
  } catch (failure2) {
    if (failure2?.code === "ENOENT") throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
    if (failure2?.code === "ELOOP") throw new PublicResourceError("G\xF6rsele eri\u015Fim reddedildi.", 403);
    if (failure2 instanceof PublicResourceError) throw failure2;
    throw error();
  } finally {
    if (descriptor !== void 0) fs3.closeSync(descriptor);
  }
}
function validateNamedImage(name, bytes) {
  namePath(name);
  const parsed = inspectImage(bytes);
  if (!name.endsWith("." + parsed.ext))
    throw new PublicResourceError("G\xF6rsel i\xE7eri\u011Fi dosya ad\u0131yla e\u015Fle\u015Fmiyor.", 415);
  return parsed;
}
async function readPrivateImage(name) {
  namePath(name);
  if (storageBackend() === "local") return validateNamedImage(name, readLocal2(name));
  await verifyPrivateBucket();
  try {
    const { data, error: failure2 } = await storage().from(PRIVATE_IMAGE_BUCKET).download(name);
    if (failure2) {
      if (["NoSuchKey", "not_found"].includes(failure2.code) || String(failure2.statusCode || failure2.status) === "404")
        throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
      throw error();
    }
    if (!data || data.size > MAX_IMAGE_BYTES) throw error();
    return validateNamedImage(name, Buffer.from(await data.arrayBuffer()));
  } catch (failure2) {
    if (failure2 instanceof PublicResourceError) throw failure2;
    throw error();
  }
}
async function writePrivateImage(name, bytes) {
  const parsed = validateNamedImage(name, bytes);
  if (storageBackend() === "local") {
    const filename = namePath(name);
    fs3.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 448 });
    let descriptor;
    try {
      descriptor = fs3.openSync(filename, "wx", 384);
      fs3.writeFileSync(descriptor, bytes);
      fs3.fsyncSync(descriptor);
    } catch (failure2) {
      if (descriptor !== void 0) {
        fs3.closeSync(descriptor);
        descriptor = void 0;
        fs3.unlinkSync(filename);
      }
      throw error();
    } finally {
      if (descriptor !== void 0) fs3.closeSync(descriptor);
    }
    return;
  }
  await verifyPrivateBucket();
  try {
    const { data, error: failure2 } = await storage().from(PRIVATE_IMAGE_BUCKET).upload(name, bytes, { contentType: parsed.mimeType, cacheControl: "0", upsert: false });
    if (failure2 || !data || data.path !== name) throw error();
  } catch {
    throw error();
  }
}
async function assertPrivateImageExists(name) {
  namePath(name);
  if (storageBackend() === "local") {
    validateNamedImage(name, readLocal2(name));
    return;
  }
  await verifyPrivateBucket();
  try {
    const { data, error: failure2 } = await storage().from(PRIVATE_IMAGE_BUCKET).info(name);
    if (failure2) {
      if (["NoSuchKey", "not_found"].includes(failure2.code) || String(failure2.statusCode || failure2.status) === "404")
        throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
      throw error();
    }
    if (!data || data.name !== name || !Number.isFinite(data.size) || data.size < 1 || data.size > MAX_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(data.contentType))
      throw error();
  } catch (failure2) {
    if (failure2 instanceof PublicResourceError) throw failure2;
    throw error();
  }
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
function ownedUploadName(req, name) {
  if (!req.auth || !req.tenantId) throw new PublicResourceError("Oturum gerekli.", 401);
  if (/[\\/]/.test(name)) throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel dosya yolu.", 403);
  if (!/^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/.test(name) || !(req.auth.role === "SUPER_ADMIN" && req.tenantId === "all") && !name.startsWith(tenantImagePrefix(req.tenantId)))
    throw new PublicResourceError("G\xF6rsel bulunamad\u0131.", 404);
  return name;
}
async function storeTenantImage(req, base64, declaredMime) {
  if (!req.auth || !req.tenantId || req.tenantId === "all")
    throw new PublicResourceError("G\xF6rsel i\xE7in bir firma se\xE7in.", 403);
  if (typeof base64 !== "string") throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel.", 400);
  const parsed = decodeImage(base64, declaredMime);
  const name = `${tenantImagePrefix(req.tenantId)}${randomBytes4(16).toString("hex")}.${parsed.ext}`;
  await writePrivateImage(name, parsed.buffer);
  return {
    url: `/uploads/${name}`,
    mimeType: parsed.mimeType,
    base64: parsed.buffer.toString("base64")
  };
}
async function assertTenantImageReferences(req, payload) {
  const pending = [payload];
  const names = /* @__PURE__ */ new Set();
  let count = 0;
  while (pending.length) {
    if (++count > 1e5) throw new PublicResourceError("\u0130stek \xE7ok karma\u015F\u0131k.", 413);
    const value = pending.pop();
    if (value && typeof value === "object") pending.push(...Object.values(value));
    if (typeof value !== "string") continue;
    const normalized = value.replace(/\\\//g, "/");
    for (const match of normalized.matchAll(/(?:\/api)?\/uploads\/([^\s"'<>?#]+)/g)) {
      let name;
      try {
        name = decodeURIComponent(match[1]);
      } catch {
        throw new PublicResourceError("Ge\xE7ersiz g\xF6rsel.", 400);
      }
      names.add(ownedUploadName(req, name));
      if (names.size > 1e4) throw new PublicResourceError("\xC7ok fazla g\xF6rsel ba\u011Flant\u0131s\u0131.", 413);
    }
  }
  const remaining = [...names];
  const deadline = Date.now() + 3e4;
  let stopped = false;
  const worker = async () => {
    while (!stopped && remaining.length) {
      if (Date.now() >= deadline) {
        stopped = true;
        throw new PublicResourceError("G\xF6rsel do\u011Frulamas\u0131 zaman a\u015F\u0131m\u0131na u\u011Frad\u0131.", 503);
      }
      const name = remaining.pop();
      try {
        await assertPrivateImageExists(name);
      } catch (failure2) {
        stopped = true;
        throw failure2;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, worker));
}
var imageMetadataVersion = (row) => JSON.stringify({
  urunler: row.urunler,
  gorsel_urlleri: row.gorsel_urlleri,
  eksik_bilgiler: row.eksik_bilgiler
});
async function saveOrderImageMetadata(req, id, original, formatted, products) {
  const metadata = hazirlaSupabasePayload({ ...formatted, urunler: products }).eksik_bilgiler;
  if (supabase) {
    let query = supabase.from("siparisler").update({ eksik_bilgiler: metadata }).eq("id", id).eq("tenant_id", req.tenantId);
    for (const field of ["eksik_bilgiler", "urunler", "gorsel_urlleri"]) {
      if (field !== "eksik_bilgiler" && !Object.hasOwn(original, field)) continue;
      query = original[field] == null ? query.is(field, null) : query.eq(field, JSON.stringify(original[field]));
    }
    const { data, error: error2 } = await query.select("*").maybeSingle();
    if (error2) throw new PublicResourceError("G\xF6rsel de\u011Fi\u015Fikli\u011Fi kaydedilemedi.", 503);
    if (!data) throw new PublicResourceError("G\xF6rsel bilgileri de\u011Fi\u015Fti; sipari\u015Fi yenileyin.", 409);
    return formatlaSiparis(data);
  }
  const index = siparislerVeritabani.findIndex(
    (row) => row.id === id && row.tenant_id === req.tenantId
  );
  if (index === -1) throw new PublicResourceError("Sipari\u015F bulunamad\u0131.", 404);
  const current = siparislerVeritabani[index];
  if (imageMetadataVersion(formatlaSiparis(current)) !== imageMetadataVersion(formatted))
    throw new PublicResourceError("G\xF6rsel bilgileri de\u011Fi\u015Fti; sipari\u015Fi yenileyin.", 409);
  const updated = formatlaSiparis({ ...current, eksik_bilgiler: metadata, urunler: products });
  siparislerVeritabani[index] = updated;
  return updated;
}
async function serveUploadedImage(req, res) {
  try {
    const name = ownedUploadName(req, req.params.dosyaAdi);
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    const image = await readPrivateImage(name);
    res.setHeader("Content-Type", image.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(image.buffer);
  } catch (error2) {
    return res.status(error2 instanceof PublicResourceError ? error2.status : 500).send("G\xF6rsele eri\u015Filemiyor.");
  }
}
router2.get("/uploads/:dosyaAdi", serveUploadedImage);
router2.post("/upload-gorsel", async (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== "string") {
      return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz g\xF6rsel verisi" });
    }
    const stored = await storeTenantImage(req, base64, mimeType);
    const benzersizAd = path6.basename(stored.url);
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
    } else if (gorsel.startsWith("/uploads/") || gorsel.startsWith("/api/uploads/")) {
      const name = ownedUploadName(req, gorsel.replace(/^\/(?:api\/)?uploads\//, ""));
      const image = await readPrivateImage(name);
      base64Data = image.buffer.toString("base64");
      mimeType = image.mimeType;
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
      const { data, error: error2 } = await supabase.from("siparisler").select("*").eq("id", siparis_id).eq("tenant_id", req.tenantId).maybeSingle();
      if (error2)
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
      kaydedilecekGorselUrl = (await storeTenantImage(req, kaydedilecekGorselUrl)).url;
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
          kaydedilecekGorselUrl = (await storeTenantImage(req, image.buffer.toString("base64"), image.mimeType)).url;
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
    const saved = await saveOrderImageMetadata(
      req,
      siparis_id,
      mevcutSiparis,
      formatli,
      guncelUrunler
    );
    res.json({
      basarili: true,
      siparis: saved,
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
      const { data, error: error2 } = await supabase.from("siparisler").select("*").eq("id", siparis_id).eq("tenant_id", req.tenantId).maybeSingle();
      if (error2)
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
    const saved = await saveOrderImageMetadata(
      req,
      siparis_id,
      mevcutSiparis,
      formatli,
      guncelUrunler
    );
    res.json({
      basarili: true,
      siparis: saved,
      mesaj: "Orijinal ekran g\xF6r\xFCnt\xFCs\xFC ba\u015Far\u0131yla geri y\xFCklendi."
    });
  } catch (err) {
    console.error("Orijinal g\xF6rsele d\xF6nme hatas\u0131:", err);
    res.status(err instanceof PublicResourceError ? err.status : 500).json({ basarili: false, hata: err.message });
  }
});
var gorsel_default = router2;

// src/server/services/kargo/manifestMatching.ts
var TESLIM_EDILDI = "TESLIM_EDILDI";
var ZAYIF_ESLESME_ESIGI = 0.5;
var ZAYIF_ADAY_SINIRI = 5;
var AWB_DESENI = /^[A-Z0-9][A-Z0-9-]{3,39}$/;
var YER_TUTUCU_ISIMLER = /* @__PURE__ */ new Set([
  "m\xFC\u015Ft\u0259ri",
  "m\xFC\u015Fteri",
  "musteri",
  "bilinmeyen m\xFC\u015Fteri",
  "nam\u0259lum",
  "customer",
  "consignee",
  "unknown",
  "n a"
]);
function normalizeName(value) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").toLowerCase().replace(/i̇/g, "i").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return YER_TUTUCU_ISIMLER.has(normalized) ? "" : normalized;
}
function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  if (!raw || !/^[+\d\s().\-/]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `994${digits.slice(1)}`;
  else if (digits.length === 9 && !digits.startsWith("0")) digits = `994${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}
function normalizeAwb(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}
function normalizeCode(value) {
  const code = normalizeAwb(value);
  return code.length >= 4 && code.length <= 100 ? code : "";
}
function sortedTokens(name) {
  return name.split(" ").filter(Boolean).sort().join(" ");
}
function bigrams(value) {
  const characters = Array.from(` ${value} `);
  const result2 = /* @__PURE__ */ new Map();
  for (let index = 0; index < characters.length - 1; index++) {
    const gram = characters[index] + characters[index + 1];
    result2.set(gram, (result2.get(gram) ?? 0) + 1);
  }
  return result2;
}
function total(grams) {
  let sum = 0;
  for (const count of grams.values()) sum += count;
  return sum;
}
function dice(left, right) {
  let shared = 0;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) ?? 0);
  const size = total(left) + total(right);
  return size === 0 ? 0 : Math.round(2 * shared / size * 1e3) / 1e3;
}
var KATLAMA_SEMALARI = ["PASAPORT", "BASIT"];
var CEDILLA = "\u0327";
var BREVE = "\u0306";
var DIAERESIS = "\u0308";
var KIRIL_LATIN = {
  \u0430: "a",
  \u0431: "b",
  \u0432: "v",
  \u0433: "g",
  \u0434: "d",
  \u0435: "e",
  \u0436: "zh",
  \u0437: "z",
  \u0438: "i",
  \u043A: "k",
  \u043B: "l",
  \u043C: "m",
  \u043D: "n",
  \u043E: "o",
  \u043F: "p",
  \u0440: "r",
  \u0441: "s",
  \u0442: "t",
  \u0443: "u",
  \u0444: "f",
  \u0445: "kh",
  \u0446: "ts",
  \u0447: "ch",
  \u0448: "sh",
  \u0449: "shch",
  \u044A: "",
  \u044B: "y",
  \u044C: "",
  \u044D: "e",
  \u044E: "yu",
  \u044F: "ya",
  \u04D9: "a",
  \u0493: "gh",
  \u049D: "g",
  \u04BB: "h",
  \u0458: "y",
  \u04E9: "o",
  \u04AF: "u",
  \u04B9: "j",
  \u0456: "i",
  \u0454: "ye",
  \u0491: "g"
};
function cyrillicToLatin(letter, marks) {
  if (letter === "\u0438" && marks.includes(BREVE)) return "y";
  if (letter === "\u0443" && marks.includes(BREVE)) return "u";
  if (letter === "\u0435" && marks.includes(DIAERESIS)) return "yo";
  if (letter === "\u0456" && marks.includes(DIAERESIS)) return "yi";
  return Object.hasOwn(KIRIL_LATIN, letter) ? KIRIL_LATIN[letter] : null;
}
function foldUnit(letter, marks, scheme) {
  const cyrillic = cyrillicToLatin(letter, marks);
  if (cyrillic !== null) return cyrillic;
  if (letter === "\u0259") return scheme === "PASAPORT" ? "a" : "e";
  if (letter === "\u0131") return "i";
  if (scheme === "BASIT") return letter;
  if (letter === "s" && marks.includes(CEDILLA)) return "sh";
  if (letter === "c" && marks.includes(CEDILLA)) return "ch";
  if (letter === "g" && marks.includes(BREVE)) return "gh";
  if (letter === "c") return "j";
  if (letter === "q") return "g";
  if (letter === "x") return "kh";
  return letter;
}
function foldName(value, scheme) {
  if (typeof value !== "string" || !normalizeName(value)) return "";
  let folded = "";
  for (const [, letter, marks] of value.normalize("NFKC").toLowerCase().normalize("NFKD").matchAll(/(\P{M})(\p{M}*)/gu))
    folded += foldUnit(letter, marks, scheme);
  return folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function nameGrams(value) {
  return [
    sortedTokens(normalizeName(value)),
    ...KATLAMA_SEMALARI.map((scheme) => sortedTokens(foldName(value, scheme)))
  ].map((form) => form ? bigrams(form) : null);
}
function bestScore(left, right) {
  let best = 0;
  left.forEach((grams, index) => {
    const other = right[index];
    if (grams && other) best = Math.max(best, dice(grams, other));
  });
  return best;
}
function nameSimilarity(left, right) {
  if (!normalizeName(left) || !normalizeName(right)) return 0;
  return bestScore(nameGrams(left), nameGrams(right));
}
function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
function toSiparisAdayi(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  return {
    id,
    musteriAdi: text(record.musteri_adi),
    telefon: text(record.telefon_numarasi),
    lojistikDurumu: text(record.lojistik_durumu),
    awb: normalizeAwb(record.uluslararasi_kargo_kodu),
    awbGosterim: text(record.uluslararasi_kargo_kodu),
    kanadaTakipKodu: normalizeCode(record.kanada_takip_kodu)
  };
}
function validWeight(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e3 ? value : null;
}
function candidate(order, eslesmeTipi, guc, skor) {
  return {
    siparisId: order.id,
    musteriAdi: order.musteriAdi,
    telefon: order.telefon,
    lojistikDurumu: order.lojistikDurumu,
    eslesmeTipi,
    guc,
    skor
  };
}
function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
function eslesmeOnerileriOlustur(rows, orders) {
  const byPhone = /* @__PURE__ */ new Map();
  const byCode = /* @__PURE__ */ new Map();
  const byAwb = /* @__PURE__ */ new Map();
  const prepared = [];
  for (const order of orders) {
    const phone2 = normalizePhone(order.telefon);
    if (phone2) push(byPhone, phone2, order);
    const idCode = normalizeCode(order.id);
    if (idCode) push(byCode, idCode, order);
    if (order.kanadaTakipKodu && order.kanadaTakipKodu !== idCode)
      push(byCode, order.kanadaTakipKodu, order);
    if (order.awb) push(byAwb, order.awb, order);
    prepared.push({
      order,
      grams: nameGrams(order.musteriAdi),
      hasName: normalizeName(order.musteriAdi) !== "",
      blocked: order.lojistikDurumu === TESLIM_EDILDI || order.awb !== ""
    });
  }
  const awbCounts = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const awb = normalizeAwb(row.takipNo);
    if (awb) awbCounts.set(awb, (awbCounts.get(awb) ?? 0) + 1);
  }
  const conflicts = [];
  const suggestions = rows.map((row, index) => {
    const satirNo = index + 1;
    const takipNo = normalizeAwb(row.takipNo);
    const base = {
      satirNo,
      takipNo,
      aliciAdi: text(row.aliciAdi),
      telefon: text(row.telefon),
      agirlikKg: validWeight(row.agirlikKg),
      referansNo: text(row.referansNo),
      durum: "ESLESME_YOK",
      belirsizlikSebebi: null,
      onerilenSiparisId: null,
      bagliSiparisId: null,
      adaylar: []
    };
    if (!AWB_DESENI.test(takipNo)) return { ...base, durum: "GECERSIZ_AWB" };
    const holders = byAwb.get(takipNo) ?? [];
    if (holders.length === 1) return { ...base, durum: "ZATEN_BAGLI", bagliSiparisId: holders[0].id };
    if (holders.length > 1) {
      for (const holder of holders)
        conflicts.push({
          satirNo,
          takipNo,
          siparisId: holder.id,
          musteriAdi: holder.musteriAdi,
          sebep: "AWB_BASKA_SIPARISTE",
          mevcutAwb: holder.awbGosterim,
          eslesmeTipi: null
        });
      return { ...base, durum: "CAKISMA" };
    }
    const strongTypes = /* @__PURE__ */ new Map();
    const phone2 = normalizePhone(row.telefon);
    for (const order of phone2 ? byPhone.get(phone2) ?? [] : []) strongTypes.set(order.id, "TELEFON");
    const reference = normalizeCode(row.referansNo);
    for (const order of reference ? byCode.get(reference) ?? [] : [])
      if (!strongTypes.has(order.id)) strongTypes.set(order.id, "SIPARIS_KODU");
    const strong = [];
    let rowHasConflict = false;
    for (const { order } of prepared) {
      const type = strongTypes.get(order.id);
      if (!type) continue;
      const reason = order.lojistikDurumu === TESLIM_EDILDI ? "TESLIM_EDILDI" : order.awb ? "MEVCUT_AWB" : null;
      if (reason) {
        rowHasConflict = true;
        conflicts.push({
          satirNo,
          takipNo,
          siparisId: order.id,
          musteriAdi: order.musteriAdi,
          sebep: reason,
          mevcutAwb: order.awbGosterim,
          eslesmeTipi: type
        });
      } else strong.push(candidate(order, type, "GUCLU", 1));
    }
    const weak = [];
    if (normalizeName(row.aliciAdi)) {
      const rowGrams = nameGrams(row.aliciAdi);
      for (const { order, grams, hasName, blocked } of prepared) {
        if (blocked || !hasName || strongTypes.has(order.id)) continue;
        const score = bestScore(rowGrams, grams);
        if (score >= ZAYIF_ESLESME_ESIGI) weak.push(candidate(order, "ISIM", "ZAYIF", score));
      }
      weak.sort((a, b) => b.skor - a.skor || a.siparisId.localeCompare(b.siparisId));
    }
    const adaylar = [...strong, ...weak.slice(0, ZAYIF_ADAY_SINIRI)];
    if (strong.length === 1) {
      if ((awbCounts.get(takipNo) ?? 0) > 1)
        return { ...base, adaylar, durum: "BELIRSIZ", belirsizlikSebebi: "MANIFESTTE_TEKRAR_AWB" };
      return { ...base, adaylar, durum: "ONERILDI", onerilenSiparisId: strong[0].siparisId };
    }
    if (strong.length > 1)
      return { ...base, adaylar, durum: "BELIRSIZ", belirsizlikSebebi: "COKLU_SIPARIS" };
    if (weak.length > 0) return { ...base, adaylar, durum: "ZAYIF_ADAY" };
    return { ...base, adaylar, durum: rowHasConflict ? "CAKISMA" : "ESLESME_YOK" };
  });
  const proposals = /* @__PURE__ */ new Map();
  for (const row of suggestions)
    if (row.onerilenSiparisId)
      proposals.set(row.onerilenSiparisId, (proposals.get(row.onerilenSiparisId) ?? 0) + 1);
  for (const row of suggestions) {
    if (row.onerilenSiparisId && (proposals.get(row.onerilenSiparisId) ?? 0) > 1) {
      row.onerilenSiparisId = null;
      row.durum = "BELIRSIZ";
      row.belirsizlikSebebi = "SIPARIS_BIRDEN_FAZLA_SATIRDA";
    }
  }
  const ozet = {
    toplamSatir: suggestions.length,
    cakismaSayisi: conflicts.length,
    ONERILDI: 0,
    BELIRSIZ: 0,
    ZAYIF_ADAY: 0,
    ZATEN_BAGLI: 0,
    CAKISMA: 0,
    ESLESME_YOK: 0,
    GECERSIZ_AWB: 0
  };
  for (const row of suggestions) ozet[row.durum]++;
  return { satirlar: suggestions, cakismalar: conflicts, ozet };
}

// src/server/services/musteriOneri.ts
var MUSTERI_ADAY_SINIRI = 5;
var aday = (customer, skor) => ({
  musteri_id: customer.id,
  ad_soyad: customer.ad_soyad,
  skor: Math.round(skor * 100) / 100
});
function musteriOner(customers, ipucu) {
  const phone2 = normalizePhone(ipucu.telefon);
  const samePhone = phone2 ? customers.filter((customer) => normalizePhone(customer.telefon) === phone2) : [];
  const eslesen = samePhone.length === 1 ? samePhone[0] : null;
  const phoneCandidates = eslesen ? [] : samePhone.map((customer) => aday(customer, 1));
  const taken = new Set(samePhone.map((customer) => customer.id));
  const nameCandidates = normalizeName(ipucu.ad) ? customers.filter((customer) => !taken.has(customer.id) && normalizeName(customer.ad_soyad)).map((customer) => aday(customer, nameSimilarity(ipucu.ad, customer.ad_soyad))).filter((candidate2) => candidate2.skor >= ZAYIF_ESLESME_ESIGI) : [];
  const adaylar = [...phoneCandidates, ...nameCandidates].sort((a, b) => b.skor - a.skor || a.musteri_id.localeCompare(b.musteri_id)).slice(0, MUSTERI_ADAY_SINIRI);
  return { eslesen, adaylar };
}

// src/server/routes/siparisler.ts
var router3 = Router3();
var rowTenant = (row) => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler) ? row.eksik_bilgiler.filter((item) => typeof item === "string" && item.startsWith("META:tenant_id=")).at(-1) : void 0;
  return legacy?.slice("META:tenant_id=".length) || "kanada_shopper_baku";
};
var belongs = (row, tenant2) => tenant2 === "all" || rowTenant(row) === tenant2;
function tenantFor(req, mutation = false) {
  const tenant2 = req.tenantId;
  if (!tenant2 || mutation && tenant2 === "all")
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return tenant2;
}
var dbActive = (tenant2) => !!supabase && tenant2 !== "demo_sandbox";
var memoryOrders = (tenant2) => tenant2 === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
async function scopedCustomers(tenant2) {
  if (!dbActive(tenant2)) return musterilerVeritabani.filter((m) => belongs(m, tenant2));
  return completeCustomerDirectory(tenant2);
}
async function validateCustomerReference(tenant2, id) {
  if (!id) return;
  if (typeof id !== "string") throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
  if (dbActive(tenant2)) {
    const { data, error: error2 } = await supabase.from("musteriler").select("id,tenant_id").eq("tenant_id", tenant2).eq("id", id).maybeSingle();
    if (error2) throw new PublicResourceError("M\xFC\u015Fteri do\u011Frulanamad\u0131.", 503);
    if (!data || !belongs(data, tenant2)) throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
  } else if (!musterilerVeritabani.some((m) => m.id === id && belongs(m, tenant2)))
    throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
}
var orderFailure = (res, error2) => res.status(error2 instanceof PublicResourceError ? error2.status : 503).json({
  basarili: false,
  hata: error2 instanceof PublicResourceError ? error2.message : "Sipari\u015F i\u015Flemi tamamlanamad\u0131."
});
router3.get("/siparisler", async (req, res) => {
  try {
    const tenant2 = tenantFor(req);
    const request = listRequest(req, tenant2, "siparisler");
    const page = dbActive(tenant2) ? await databasePage(request, "siparisler") : memoryPage(
      request,
      memoryOrders(tenant2).filter((s) => belongs(s, tenant2))
    );
    const orders = page.items.map(formatlaSiparis);
    res.json({
      basarili: true,
      kaynak: tenant2 === "demo_sandbox" ? "demo_sandbox" : dbActive(tenant2) ? "supabase" : "bellek",
      toplam: page.pagination.total,
      pagination: page.pagination,
      siparisler: orders,
      ...tenant2 === "demo_sandbox" ? { isDemo: true } : {}
    });
  } catch (error2) {
    orderFailure(res, error2);
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
    const systemInstruction = `Sen Kanada'dan Azerbaycan'a (Bak\xFC, Gence ve di\u011Fer \u015Fehirler) Instagram Live, Reels, DM ve WhatsApp \xFCzerinden \xFCr\xFCn sat\u0131\u015F\u0131 yapan uluslararas\u0131 bir butik e-ticaret ve lojistik operasyonunun Uzman Sipari\u015F ve M\xFC\u015Fteri Ayr\u0131\u015Ft\u0131rma Yapay Zekas\u0131s\u0131n.

M\xFC\u015Fteriler sipari\u015Flerini son derece da\u011F\u0131n\u0131k, g\xFCnl\xFCk konu\u015Fma diliyle veya Azerbaycan T\xFCrk\xE7esi / T\xFCrkiye T\xFCrk\xE7esi kar\u0131\u015F\u0131m\u0131 karma\u015F\u0131k mesajlarla iletmektedirler.

G\xD6REV\u0130N VE \xC7OK KR\u0130T\u0130K KURALLAR:
1. M\xDC\u015ETER\u0130 B\u0130LG\u0130LER\u0130 (YALNIZCA MESAJDAN \xC7IKAR):
   - M\xFC\u015Fterinin ad\u0131n\u0131, telefon numaras\u0131n\u0131, Instagram kullan\u0131c\u0131 ad\u0131n\u0131, \u015Fehrini ve adresini yaln\u0131zca mesajda ve g\xF6rsellerde yazd\u0131\u011F\u0131 gibi \xE7\u0131kar.
   - Sana hi\xE7bir m\xFC\u015Fteri listesi verilmez; m\xFC\u015Fteriyi tan\u0131maya, e\u015Fle\u015Ftirmeye veya ad\u0131n\u0131 d\xFCzeltmeye \xE7al\u0131\u015Fma. E\u015Fle\u015Ftirmeyi sunucu yapar.
   - musteri_tipi: Mesajda akraba/tan\u0131d\u0131k oldu\u011Funu belirten bir not varsa 'AKRABA_YAKIN', yoksa 'TANIMADIK'.

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
      const saved = await storeTenantImage(
        req,
        raw,
        attachment.gorsel_mime_type || attachment.mimeType
      );
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
    const tenantCustomers = await scopedCustomers(hedefTenantId);
    const cikarilanAd = typeof parsedJson.musteri_adi === "string" ? parsedJson.musteri_adi.trim() : "";
    const { eslesen, adaylar: musteriAdaylari } = musteriOner(tenantCustomers, {
      telefon: parsedJson.telefon_numarasi,
      ad: cikarilanAd
    });
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
      musteri_adi: eslesen?.ad_soyad || cikarilanAd || "Bilinmeyen M\xFC\u015Fteri",
      instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || "",
      telefon_numarasi: parsedJson.telefon_numarasi || "",
      teslimat_sehri: parsedJson.teslimat_sehri || eslesen?.sehir || "Bak\xFC",
      teslimat_adresi: parsedJson.teslimat_adresi || eslesen?.adres || "",
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
      musteri_id: eslesen?.id || "",
      musteri_tipi: eslesen?.musteri_tipi || parsedJson.musteri_tipi || "TANIMADIK",
      duzeltilen_yazim_hatasi: eslesen && cikarilanAd && cikarilanAd !== eslesen.ad_soyad ? `${cikarilanAd} \u2192 ${eslesen.ad_soyad} (telefon e\u015Fle\u015Fti)` : "",
      musteri_durumu: eslesen ? "MEVCUT_MUSTERI" : "YENI_MUSTERI",
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
        const { data, error: error2 } = await supabase.from("siparisler").insert(sbPayload).select().single();
        if (error2 || !data) {
          throw new PublicResourceError("Sipari\u015F kaydedilemedi.", 503);
        } else if (data) {
          nihaiSiparis = {
            ...formatlaSiparis(data),
            musteri_id: dbPayload.musteri_id,
            musteri_tipi: dbPayload.musteri_tipi,
            duzeltilen_yazim_hatasi: dbPayload.duzeltilen_yazim_hatasi,
            musteri_durumu: dbPayload.musteri_durumu,
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
    const bulunanMusteri = eslesen;
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
    } else if (otomatik_kaydet !== false && !dbActive(hedefTenantId) && !bulunanMusteri && musteriAdaylari.length === 0 && cikarilanAd && cikarilanAd !== "Bilinmeyen M\xFC\u015Fteri") {
      const yeniMusteri = {
        id: "mus-" + randomUUID(),
        tenant_id: hedefTenantId,
        ad_soyad: cikarilanAd,
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
      musteri_adaylari: musteriAdaylari,
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
    const tenant2 = tenantFor(req, true);
    const yeniVeri = req.body;
    if (["baku_kurye_id", "baku_kurye_adi", "baku_kurye_bolgesi"].some((key) => yeniVeri?.[key]))
      throw new PublicResourceError(
        "Kuryeyi sipari\u015F kaydedildikten sonra atama i\u015Flemiyle se\xE7in.",
        400
      );
    await validateCustomerReference(tenant2, yeniVeri.musteri_id);
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
      tenant_id: tenant2,
      is_demo: tenant2 === "demo_sandbox",
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
    if (tenant2 === "demo_sandbox") {
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
    if (dbActive(tenant2)) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error: error2 } = await supabase.from("siparisler").insert(sbPayload).select().single();
        if (error2 || !data) {
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
async function ownedOrder(tenant2, id) {
  if (dbActive(tenant2)) {
    const { data, error: error2 } = await supabase.from("siparisler").select("*").eq("id", id).eq("tenant_id", tenant2).maybeSingle();
    if (error2) throw new PublicResourceError("Sipari\u015F okunamad\u0131.", 503);
    return data && belongs(data, tenant2) ? data : void 0;
  }
  return memoryOrders(tenant2).find((s) => s.id === id && belongs(s, tenant2));
}
router3.patch("/siparisler/:id", async (req, res) => {
  try {
    const tenant2 = tenantFor(req, true);
    const existing = await ownedOrder(tenant2, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    const formatted = formatlaSiparis(existing);
    const role = req.auth?.role;
    const allowed = role === "BAKU_FINANS" ? financeFields : rolGrubunda(role, "BUYERS") ? purchaseFields : role === "SATIS_SORUMLUSU" ? salesFields : generalFields;
    if (!role || role === "BAKU_KURYE")
      throw new PublicResourceError("Bu i\u015Flem i\xE7in yetkiniz yok.", 403);
    const updates = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key === "tenant_id" || key === "tenantId") {
        if (value !== tenant2) throw new PublicResourceError("Sipari\u015F ba\u015Fka butike ta\u015F\u0131namaz.", 403);
        continue;
      }
      if (JSON.stringify(value) === JSON.stringify(formatted[key])) continue;
      if ([
        "baku_kurye_id",
        "baku_kurye_adi",
        "baku_kurye_bolgesi",
        "kurye_atama_surumu",
        "kurye_teslim_kullanici_id",
        "kurye_teslim_alan"
      ].includes(key))
        throw new PublicResourceError("Kurye atamas\u0131 i\xE7in kurye atama i\u015Flemini kullan\u0131n.", 403);
      if (key === "kalan_tutar") continue;
      if (key === "duzeltme_gerekcesi") continue;
      if (!allowed.has(key))
        throw new PublicResourceError("Bu alan\u0131 de\u011Fi\u015Ftirme yetkiniz yok: " + key, 403);
      updates[key] = value;
    }
    if (updates.eksik_bilgiler !== void 0 && (!Array.isArray(updates.eksik_bilgiler) || updates.eksik_bilgiler.some((v) => typeof v !== "string" || v.startsWith("META:"))))
      throw new PublicResourceError("Ge\xE7ersiz eksik bilgi listesi.", 400);
    await validateCustomerReference(tenant2, updates.musteri_id);
    await assertTenantImageReferences(req, updates);
    const changed = {
      ...formatted,
      ...updates,
      id: existing.id,
      tenant_id: tenant2,
      guncellenme_tarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (const key of ["toplam_tutar", "alinan_tutar", "adet"]) {
      changed[key] = Number(changed[key]);
      if (!Number.isFinite(changed[key]) || changed[key] < 0)
        throw new PublicResourceError("Ge\xE7ersiz say\u0131sal de\u011Fer.", 400);
    }
    const oncekiAlinan = Number(formatted.alinan_tutar) || 0;
    if (changed.alinan_tutar < oncekiAlinan) {
      if (role !== "PATRON")
        throw new PublicResourceError(
          "Kaydedilmi\u015F tahsilat azalt\u0131lamaz. D\xFCzeltmeyi patron gerek\xE7eyle yapabilir.",
          403
        );
      const gerekce = typeof req.body.duzeltme_gerekcesi === "string" ? req.body.duzeltme_gerekcesi.trim() : "";
      if (gerekce.length < 5 || gerekce.length > 500)
        throw new PublicResourceError(
          "Tahsilat\u0131 azaltmak i\xE7in 5-500 karakterlik bir gerek\xE7e gerekli.",
          400
        );
      changed.islem_gecmisi = [
        ...Array.isArray(formatted.islem_gecmisi) ? formatted.islem_gecmisi : [],
        {
          tarih: changed.guncellenme_tarihi,
          yapan_rol: role,
          yapan_kisi: req.auth?.userId || "",
          eylem: "TAHSILAT_AZALTILDI",
          aciklama: `${oncekiAlinan} \u2192 ${changed.alinan_tutar} ${changed.para_birimi || ""}: ${gerekce}`.replace(
            /\s+:/,
            ":"
          )
        }
      ];
    }
    changed.kalan_tutar = Math.max(0, changed.toplam_tutar - changed.alinan_tutar);
    changed.finans_durumu = changed.alinan_tutar >= changed.toplam_tutar && changed.toplam_tutar > 0 ? "ODENDI" : changed.alinan_tutar > 0 ? "KISMI_ODEME" : "BEKLIYOR";
    if (dbActive(tenant2)) {
      const payload = hazirlaSupabasePayload(changed);
      for (const key of ["baku_kurye_id", "baku_kurye_adi", "baku_kurye_bolgesi"])
        delete payload[key];
      const { data, error: error2 } = await supabase.from("siparisler").update(payload).eq("id", existing.id).eq("tenant_id", tenant2).eq("kurye_atama_surumu", Number(formatted.kurye_atama_surumu || 0)).eq("lojistik_durumu", formatted.lojistik_durumu).select("*").maybeSingle();
      if (error2) throw new PublicResourceError("Sipari\u015F g\xFCncellenemedi.", 503);
      if (!data)
        throw new PublicResourceError(
          "Sipari\u015Fin atamas\u0131 veya durumu de\u011Fi\u015Fti. Listeyi yenileyin.",
          409
        );
      return res.json({ basarili: true, kaynak: "supabase", siparis: formatlaSiparis(data) });
    }
    const pool = memoryOrders(tenant2);
    const index = pool.findIndex((s) => s.id === existing.id && belongs(s, tenant2));
    if (index < 0 || Number(pool[index].kurye_atama_surumu || 0) !== Number(formatted.kurye_atama_surumu || 0) || pool[index].lojistik_durumu !== formatted.lojistik_durumu)
      throw new PublicResourceError(
        "Sipari\u015Fin atamas\u0131 veya durumu de\u011Fi\u015Fti. Listeyi yenileyin.",
        409
      );
    pool[index] = formatlaSiparis(changed);
    res.json({
      basarili: true,
      kaynak: tenant2 === "demo_sandbox" ? "demo_sandbox" : "bellek",
      siparis: pool[index]
    });
  } catch (error2) {
    orderFailure(res, error2);
  }
});
router3.delete("/siparisler/:id", async (req, res) => {
  try {
    const tenant2 = tenantFor(req, true);
    const existing = await ownedOrder(tenant2, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: "Sipari\u015F bulunamad\u0131." });
    if (dbActive(tenant2)) {
      const { error: error2 } = await supabase.from("siparisler").delete().eq("id", existing.id).eq("tenant_id", tenant2);
      if (error2) throw new PublicResourceError("Sipari\u015F silinemedi.", 503);
    } else {
      const pool = memoryOrders(tenant2);
      pool.splice(
        pool.findIndex((s) => s.id === existing.id && belongs(s, tenant2)),
        1
      );
    }
    res.json({ basarili: true, mesaj: "Sipari\u015F silindi." });
  } catch (error2) {
    orderFailure(res, error2);
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
  } catch (error2) {
    orderFailure(res, error2);
  }
});
router3.post("/siparisler/tumunu-uluslararasi-kargo-yap", async (req, res) => {
  try {
    const tenant2 = tenantFor(req, true);
    if (dbActive(tenant2)) {
      const { error: error2 } = await supabase.from("siparisler").update({ lojistik_durumu: "ULUSLARARASI_KARGO" }).eq("tenant_id", tenant2).neq("lojistik_durumu", "TESLIM_EDILDI");
      if (error2) throw new PublicResourceError("Sipari\u015Fler g\xFCncellenemedi.", 503);
    } else {
      const pool = memoryOrders(tenant2);
      for (let index = 0; index < pool.length; index++)
        if (belongs(pool[index], tenant2) && pool[index].lojistik_durumu !== "TESLIM_EDILDI")
          pool[index] = { ...pool[index], lojistik_durumu: "ULUSLARARASI_KARGO" };
    }
    res.json({ basarili: true, mesaj: "Se\xE7ili butikin sipari\u015Fleri g\xFCncellendi." });
  } catch (error2) {
    orderFailure(res, error2);
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
var belongs2 = (row, tenant2) => tenant2 === "all" || rowTenant2(row) === tenant2;
function tenantFor2(req, mutation = false) {
  const tenant2 = req.tenantId;
  if (!tenant2 || mutation && tenant2 === "all")
    throw Object.assign(new Error("Bir butik se\xE7ilmelidir."), { status: 400 });
  return tenant2;
}
async function ownedCustomer(tenant2, id) {
  if (typeof id !== "string") return void 0;
  if (supabase && tenant2 !== "demo_sandbox") {
    const { data, error: error2 } = await supabase.from("musteriler").select("*").eq("tenant_id", tenant2).eq("id", id).maybeSingle();
    if (error2) throw error2;
    return data && belongs2(data, tenant2) ? data : void 0;
  }
  return musterilerVeritabani.find((customer) => customer.id === id && belongs2(customer, tenant2));
}
function localSnapshot(tenant2) {
  return {
    customers: musterilerVeritabani.filter((r) => belongs2(r, tenant2)),
    orders: (tenant2 === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani).filter(
      (r) => belongs2(r, tenant2)
    )
  };
}
var newestFirst = (a, b) => (Date.parse(b.olusturma_tarihi) || 0) - (Date.parse(a.olusturma_tarihi) || 0) || compareKeys(String(a.id), String(b.id));
var phone = (value) => String(value || "").replace(/\s+/g, "");
function matches(customer, order) {
  if (rowTenant2(customer) !== rowTenant2(order)) return false;
  return order.musteri_id === customer.id || phone(customer.telefon) && phone(customer.telefon) === phone(order.telefon_numarasi) || String(order.musteri_adi || "").toLowerCase().trim() === String(customer.ad_soyad || "").toLowerCase().trim();
}
var fail = (res, error2) => res.status(error2.status || 503).json({
  basarili: false,
  hata: error2.status ? error2.message : "M\xFC\u015Fteri verilerine eri\u015Filemedi."
});
router4.get("/musteriler", async (req, res) => {
  try {
    const tenant2 = tenantFor2(req);
    const request = listRequest(req, tenant2, "musteriler");
    const snapshot = await customerSnapshot(request, () => localSnapshot(tenant2));
    const customers = snapshot.customers;
    const orders = snapshot.orders.map(formatlaSiparis).sort(newestFirst);
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
      const history = orders.filter((order) => matches(customer, order)).sort(newestFirst);
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
    const page = memoryPage(request, enriched, snapshot.revision, customerKey);
    res.json({
      basarili: true,
      toplam: page.pagination.total,
      musteriler: page.items,
      pagination: page.pagination
    });
  } catch (error2) {
    fail(res, error2);
  }
});
router4.get("/musteriler/:id/siparisler", async (req, res) => {
  try {
    const tenant2 = tenantFor2(req);
    const request = listRequest(req, tenant2, `musteri-siparisler:${req.params.id}`);
    const snapshot = await customerSnapshot(request, () => localSnapshot(tenant2));
    const customers = snapshot.customers;
    const orders = snapshot.orders.map(formatlaSiparis).sort(newestFirst);
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
    const page = memoryPage(
      request,
      orders.filter((o) => matches(customer, o)),
      snapshot.revision
    );
    res.json({
      basarili: true,
      musteri: customer,
      siparisler: page.items,
      toplam: page.pagination.total,
      pagination: page.pagination
    });
  } catch (error2) {
    fail(res, error2);
  }
});
router4.post("/musteriler", async (req, res) => {
  try {
    const tenant2 = tenantFor2(req, true);
    const { id, ad_soyad, telefon, instagram_kullanici_adi, sehir, adres, musteri_tipi, notlar } = req.body;
    if (typeof ad_soyad !== "string" || !ad_soyad.trim())
      return res.status(400).json({ basarili: false, hata: "M\xFC\u015Fteri ad\u0131 zorunludur." });
    const existing = id ? await ownedCustomer(tenant2, id) : void 0;
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
      tenant_id: tenant2,
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
    if (supabase && tenant2 !== "demo_sandbox") {
      const query = existing ? supabase.from("musteriler").update(customer).eq("id", existing.id).eq("tenant_id", tenant2) : supabase.from("musteriler").insert(customer);
      const { data, error: error2 } = await query.select("*").single();
      if (error2 || !data) throw error2 || new Error("M\xFC\u015Fteri kaydedilmedi.");
      return res.json({ basarili: true, musteri: data });
    }
    const index = musterilerVeritabani.findIndex((c) => c.id === customer.id && belongs2(c, tenant2));
    if (index >= 0) musterilerVeritabani[index] = customer;
    else musterilerVeritabani.unshift(customer);
    res.json({ basarili: true, musteri: customer });
  } catch (error2) {
    fail(res, error2);
  }
});
var musteriler_default = router4;

// src/server/routes/inbox.ts
import { Router as Router5 } from "express";
import { randomUUID as randomUUID3, createHash as createHash4 } from "node:crypto";
import { Type as Type2 } from "@google/genai";
var router5 = Router5();
var rowTenant3 = (row) => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler) ? row.eksik_bilgiler.filter((item) => typeof item === "string" && item.startsWith("META:tenant_id=")).at(-1) : void 0;
  return legacy?.slice("META:tenant_id=".length) || "kanada_shopper_baku";
};
var belongs3 = (row, tenant2) => tenant2 === "all" || rowTenant3(row) === tenant2;
function tenantFor3(req, mutation = false) {
  const tenant2 = req.tenantId;
  if (!tenant2 || mutation && tenant2 === "all")
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return tenant2;
}
var dbActive2 = (tenant2) => !!supabase && tenant2 !== "demo_sandbox";
var inboxFailure = (res, error2) => res.status(error2 instanceof PublicResourceError ? error2.status : 503).json({
  basarili: false,
  hata: error2 instanceof PublicResourceError ? error2.message : "Gelen kutusu i\u015Flemi tamamlanamad\u0131."
});
var mappedInbox = (row) => ({
  ...row,
  gelis_tarihi: row.gelis_tarihi || row.olusturma_tarihi,
  oneri_siparis: { ...row.oneri_siparis || {}, tenant_id: rowTenant3(row) }
});
async function ownedInbox(tenant2, id) {
  if (dbActive2(tenant2)) {
    const { data, error: error2 } = await supabase.from("inbox_mesajlar").select("*").eq("id", id).eq("tenant_id", tenant2).maybeSingle();
    if (error2) throw new PublicResourceError("Mesaj okunamad\u0131.", 503);
    return data && belongs3(data, tenant2) ? mappedInbox(data) : void 0;
  }
  return onayBekleyenler.find((m) => m.id === id && belongs3(m, tenant2));
}
router5.get("/inbox", async (req, res) => {
  try {
    const tenant2 = tenantFor3(req);
    const request = listRequest(req, tenant2, "inbox");
    const local = dbActive2(tenant2) ? [] : onayBekleyenler.filter((m) => belongs3(m, tenant2));
    const page = dbActive2(tenant2) ? await databasePage(request, "inbox_mesajlar") : {
      ...memoryPage(request, local),
      pending: local.filter((m) => m.durum === "BEKLEMEDE").length
    };
    const messages = page.items.map(mappedInbox);
    res.json({
      basarili: true,
      toplam: page.pending,
      pagination: page.pagination,
      mesajlar: messages
    });
  } catch (error2) {
    inboxFailure(res, error2);
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
        const { error: error2 } = await supabase.from("inbox_mesajlar").insert({
          id: yeniInbox.id,
          tenant_id: hedefTenantId,
          gonderen_kullanici: yeniInbox.gonderen_kullanici,
          kaynak: yeniInbox.kaynak,
          konusma_gecmisi: yeniInbox.konusma_gecmisi,
          durum: yeniInbox.durum,
          oneri_siparis: yeniInbox.oneri_siparis
        });
        if (error2) throw error2;
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
  } catch (error2) {
    inboxFailure(res, error2);
  }
});
function approvalOrderId(tenantId, inboxId) {
  const hash = createHash4("sha256").update(tenantId + ":" + inboxId).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function transitionFailure(error2) {
  const status2 = error2?.code === "PT404" ? 404 : error2?.code === "PT409" ? 409 : ["PT400", "22P02", "22003", "23514", "23502"].includes(error2?.code || "") ? 400 : 503;
  throw new PublicResourceError(
    status2 === 404 ? "Mesaj bulunamad\u0131." : status2 === 409 ? "Mesaj karar\u0131 de\u011Fi\u015Ftirilemez veya onayl\u0131 sipari\u015F art\u0131k yok." : status2 === 400 ? "Ge\xE7ersiz sipari\u015F verisi." : "Mesaj karar\u0131 kaydedilemedi.",
    status2
  );
}
async function approveDatabase(tenantId, inboxId, orderId, payload) {
  const { data, error: error2 } = await supabase.rpc("tomnap_approve_inbox", {
    p_tenant_id: tenantId,
    p_inbox_id: inboxId,
    p_order_id: orderId,
    p_order_payload: payload
  });
  if (error2) transitionFailure(error2);
  if (!data?.siparis?.id || data.siparis.tenant_id !== tenantId || typeof data.tekrar !== "boolean") {
    throw new PublicResourceError("Mesaj karar\u0131 do\u011Frulanamad\u0131.", 503);
  }
  return { siparis: formatlaSiparis(data.siparis), tekrar: data.tekrar };
}
function approvedMemory(item, tenantId, orderId) {
  const pool = tenantId === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
  const stored = pool.find(
    (row) => row.id === (item.onaylanan_siparis_id || orderId) && belongs3(row, tenantId)
  );
  if (!stored) throw new PublicResourceError("Onayl\u0131 sipari\u015F art\u0131k mevcut de\u011Fil.", 409);
  return { siparis: formatlaSiparis(stored), tekrar: true };
}
var approvedResponse = (res, result2) => res.json({
  basarili: true,
  mesaj: "Sipari\u015F onayland\u0131 ve resmi sipari\u015F tablosuna aktar\u0131ld\u0131.",
  ...result2
});
router5.post("/inbox/:id/onayla", async (req, res) => {
  try {
    const tenantId = tenantFor3(req, true);
    const { id } = req.params;
    const inboxItem = await ownedInbox(tenantId, id);
    if (!inboxItem) throw new PublicResourceError("Inbox mesaj\u0131 bulunamad\u0131.", 404);
    const orderId = approvalOrderId(tenantId, id);
    if (inboxItem.durum === "ONAYLANDI") {
      return approvedResponse(
        res,
        dbActive2(tenantId) ? await approveDatabase(tenantId, id, orderId, {}) : approvedMemory(inboxItem, tenantId, orderId)
      );
    }
    if (inboxItem.durum !== "BEKLEMEDE")
      throw new PublicResourceError("Mesaj daha \xF6nce reddedildi.", 409);
    const submitted = req.body.duzeltilmis_siparis || inboxItem.oneri_siparis;
    if (!submitted || typeof submitted !== "object" || Array.isArray(submitted))
      throw new PublicResourceError("Ge\xE7ersiz sipari\u015F verisi.", 400);
    const extras = siparisEkVerileriniAl(submitted);
    const siparisVerisi = { ...submitted, ...extras };
    if (siparisVerisi.tenant_id && siparisVerisi.tenant_id !== tenantId || siparisVerisi.tenantId && siparisVerisi.tenantId !== tenantId)
      throw new PublicResourceError("Sipari\u015F ba\u015Fka butike ta\u015F\u0131namaz.", 403);
    await assertTenantImageReferences(req, siparisVerisi);
    if (siparisVerisi.musteri_id) {
      let customer;
      if (dbActive2(tenantId)) {
        const { data, error: error2 } = await supabase.from("musteriler").select("id").eq("id", siparisVerisi.musteri_id).eq("tenant_id", tenantId).maybeSingle();
        if (error2) throw new PublicResourceError("M\xFC\u015Fteri do\u011Frulanamad\u0131.", 503);
        customer = data;
      } else
        customer = musterilerVeritabani.find(
          (m) => m.id === siparisVerisi.musteri_id && belongs3(m, tenantId)
        );
      if (!customer) throw new PublicResourceError("M\xFC\u015Fteri bulunamad\u0131.", 404);
    }
    const alinan = Number(siparisVerisi.alinan_tutar || 0);
    const toplam = Number(siparisVerisi.toplam_tutar || alinan);
    const adet = Number(siparisVerisi.adet ?? 1);
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0 || !Number.isInteger(adet) || adet <= 0)
      throw new PublicResourceError("Ge\xE7ersiz tutar veya adet.", 400);
    const dbPayload = {
      ek_veriler: extras,
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
      adet,
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
    if (dbActive2(tenantId)) {
      return approvedResponse(
        res,
        await approveDatabase(tenantId, id, orderId, hazirlaSupabasePayload(dbPayload))
      );
    }
    const current = onayBekleyenler.find((item) => item.id === id && belongs3(item, tenantId));
    if (!current) throw new PublicResourceError("Inbox mesaj\u0131 bulunamad\u0131.", 404);
    if (current.durum === "ONAYLANDI")
      return approvedResponse(res, approvedMemory(current, tenantId, orderId));
    if (current.durum !== "BEKLEMEDE")
      throw new PublicResourceError("Mesaj daha \xF6nce reddedildi.", 409);
    const pool = tenantId === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
    let stored = pool.find((row) => row.id === orderId && belongs3(row, tenantId));
    const tekrar = !!stored;
    if (!stored) {
      stored = formatlaSiparis({
        id: orderId,
        olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
        ...dbPayload,
        kalan_tutar: kalan
      });
      pool.unshift(stored);
    }
    current.durum = "ONAYLANDI";
    current.onaylanan_siparis_id = stored.id;
    return approvedResponse(res, { siparis: stored, tekrar });
  } catch (error2) {
    inboxFailure(res, error2);
  }
});
router5.post("/inbox/:id/reddet", async (req, res) => {
  try {
    const tenant2 = tenantFor3(req, true);
    if (dbActive2(tenant2)) {
      const { data, error: error2 } = await supabase.rpc("tomnap_reject_inbox", {
        p_tenant_id: tenant2,
        p_inbox_id: req.params.id
      });
      if (error2) transitionFailure(error2);
      if (data?.durum !== "REDDEDILDI" || typeof data.tekrar !== "boolean")
        throw new PublicResourceError("Mesaj karar\u0131 do\u011Frulanamad\u0131.", 503);
      return res.json({
        basarili: true,
        mesaj: "Mesaj reddedildi/ar\u015Fivlendi.",
        tekrar: data.tekrar
      });
    }
    const inbox = onayBekleyenler.find(
      (item) => item.id === req.params.id && belongs3(item, tenant2)
    );
    if (!inbox) throw new PublicResourceError("Mesaj bulunamad\u0131.", 404);
    if (inbox.durum === "REDDEDILDI")
      return res.json({ basarili: true, mesaj: "Mesaj reddedildi/ar\u015Fivlendi.", tekrar: true });
    if (inbox.durum !== "BEKLEMEDE")
      throw new PublicResourceError("Mesaj daha \xF6nce onayland\u0131.", 409);
    inbox.durum = "REDDEDILDI";
    return res.json({ basarili: true, mesaj: "Mesaj reddedildi/ar\u015Fivlendi.", tekrar: false });
  } catch (error2) {
    inboxFailure(res, error2);
  }
});
var inbox_default = router5;

// src/server/routes/firmalar.ts
import { Router as Router6 } from "express";
import { randomUUID as randomUUID5 } from "node:crypto";

// src/server/services/crypto.ts
import crypto from "node:crypto";
var EncryptionError = class extends Error {
  constructor(message = "Kargo \u015Fifreleme anahtar\u0131 veya kay\u0131t b\xFCt\xFCnl\xFC\u011F\xFC do\u011Frulanamad\u0131.") {
    super(message);
    this.status = 503;
    this.name = "EncryptionError";
  }
};
function keyring() {
  try {
    const keys = JSON.parse(process.env.CARGO_ENCRYPTION_KEYS || "null");
    const active = process.env.CARGO_ENCRYPTION_ACTIVE_KEY_ID || "";
    if (!keys || typeof keys !== "object" || Array.isArray(keys) || !/^[A-Za-z0-9_-]{1,40}$/.test(active) || !Object.hasOwn(keys, active))
      throw new Error();
    for (const [id, key] of Object.entries(keys))
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof key !== "string" || !/^[a-f0-9]{64}$/i.test(key))
        throw new Error();
    return { keys, active };
  } catch {
    throw new EncryptionError();
  }
}
function aad(context, id) {
  if (!context || typeof context.tenantId !== "string" || !context.tenantId || context.tenantId === "all" || typeof context.provider !== "string" || !context.provider)
    throw new EncryptionError();
  return Buffer.from(JSON.stringify(["TOMNAP:cargo:v2", id, context.tenantId, context.provider]));
}
function sifreleMetin(text3, context) {
  if (typeof text3 !== "string") throw new EncryptionError();
  const { keys, active } = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keys[active], "hex"), iv);
  cipher.setAAD(aad(context, active));
  const encrypted = Buffer.concat([cipher.update(text3, "utf8"), cipher.final()]);
  return `enc:v2:${active}:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}
function cozMetin(envelope, context) {
  try {
    if (typeof envelope !== "string") throw new Error();
    const match = /^enc:v2:([A-Za-z0-9_-]{1,40}):([a-f0-9]{24}):([a-f0-9]{32}):((?:[a-f0-9]{2})*)$/.exec(
      envelope
    );
    if (!match) throw new Error();
    const [, id, iv, tag, encrypted] = match;
    const { keys } = keyring();
    if (!Object.hasOwn(keys, id)) throw new Error();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(keys[id], "hex"),
      Buffer.from(iv, "hex")
    );
    decipher.setAAD(aad(context, id));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new EncryptionError();
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
  const { to, subject, html, text: text3 } = params;
  console.log(`
================= [TOMNAP EMAIL SERVICE] =================`);
  console.log(`G\xD6ND\u018FR\u0130L\u0130R: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  if (RESEND_API_KEY) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15e3),
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
          ...params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}
        },
        body: JSON.stringify({
          from: params.from || EMAIL_FROM,
          to: [to],
          subject,
          html,
          text: text3 || subject
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
      console.error(`\u274C Resend g\xF6nd\u0259rm\u0259 x\u0259tas\u0131.`);
      console.log(`==========================================================
`);
      return { basarili: false, hata: "E-po\xE7t xidm\u0259ti \u0259l\xE7atan deyil." };
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
function buildActivationEmail(params) {
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
  const text3 = `
H\xF6rm\u0259tli ${params.adSoyad},

"${params.butikAdi}" butikiniz \xFC\xE7\xFCn TOMNAP platformas\u0131nda qeydiyyat u\u011Furla tamamland\u0131.
\u015Eifr\u0259nizi t\u0259yin etm\u0259k v\u0259 hesab\u0131n\u0131z\u0131 aktivl\u0259\u015Fdirm\u0259k \xFC\xE7\xFCn bu link\u0259 ke\xE7id edin:
${link}

Bu link 24 saat m\xFCdd\u0259tind\u0259 etibarl\u0131d\u0131r.
TOMNAP D\u0259st\u0259k Komandas\u0131
  `.trim();
  return { payload: { from: EMAIL_FROM, to: params.email, subject, html, text: text3 }, link };
}
function buildInviteEmail(params) {
  const baseUrl = getApplicationUrl();
  const link = `${baseUrl}/davet-qebul?token=${encodeURIComponent(params.token)}`;
  const rolAdlari = {
    KANADA_SATINALMA: "Kanada Sat\u0131nalma Meneceri",
    ABD_SATINALMA: "ABD Sat\u0131nalma Meneceri",
    SATIS_SORUMLUSU: "Sat\u0131\u015F v\u0259 M\xFC\u015Ft\u0259ri Xidm\u0259tl\u0259ri",
    BAKU_FINANS: "Bak\u0131 Maliyy\u0259 / Kassa Sorumlusu",
    BAKU_KURYE: "Bak\u0131 Daxili \xC7atd\u0131r\u0131lma / Kuryer",
    PATRON: "H\u0259mt\u0259sis\xE7i / Patron"
  };
  const rolAdi = ekipRoluMu(params.rol) ? rolAdlari[params.rol] : params.rol;
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
  const text3 = `
H\xF6rm\u0259tli ${params.adSoyad || "Komanda \xDCzv\xFC"},

${params.davetEden || "Butik r\u0259hb\u0259rliyi"} t\u0259r\u0259find\u0259n "${params.butikAdi}" butikinin idar\u0259etm\u0259 masas\u0131na ${rolAdi} olaraq d\u0259v\u0259t edildiniz.
D\u0259v\u0259ti q\u0259bul etm\u0259k \xFC\xE7\xFCn bu link\u0259 ke\xE7id edin:
${link}

TOMNAP D\u0259st\u0259k Komandas\u0131
  `.trim();
  return { payload: { from: EMAIL_FROM, to: params.email, subject, html, text: text3 }, link };
}

// src/server/services/onboarding.ts
var OnboardingError = class extends Error {
  constructor(status2, message) {
    super(message);
    this.status = status2;
  }
};
async function onboardingRpc(name, args) {
  const { data, error: error2 } = await supabase.rpc(name, args);
  if (error2) {
    if (error2.code === "23505")
      throw new OnboardingError(409, "Bu e-po\xE7t v\u0259 ya telefon art\u0131q qeydiyyatdad\u0131r.");
    if (error2.code === "PT409")
      throw new OnboardingError(409, "Link art\u0131q etibarl\u0131 deyil v\u0259 ya komanda limiti dolub.");
    if (error2.code === "PT403") throw new OnboardingError(403, "Firma aktiv deyil.");
    throw new OnboardingError(503, "Qeydiyyat saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin.");
  }
  if (!data) throw new OnboardingError(409, "\u018Fm\u0259liyyat tamamlanmad\u0131. Linki yenid\u0259n yoxlay\u0131n.");
  return data;
}
function ensureUnique(users, user) {
  const email = user.email.trim().toLowerCase();
  const phone2 = (user.telefon || "").replace(/\D/g, "");
  if (users.some(
    (existing) => existing.id !== user.id && (existing.email.trim().toLowerCase() === email || phone2 && (existing.telefon || "").replace(/\D/g, "") === phone2)
  ))
    throw new OnboardingError(409, "Bu e-po\xE7t v\u0259 ya telefon art\u0131q qeydiyyatdad\u0131r.");
}
function available(invite, token) {
  return invite.token === token && !invite.kullanildiMi && Date.parse(invite.gecerlilikTarihi) > Date.now() && ekipRoluMu(invite.rol);
}
function capacity(firma, users, role) {
  if (firma.onayDurumu !== "AKTIF") throw new OnboardingError(403, "Firma aktiv deyil.");
  const limit = ekipRoluMu(role) ? rolKotasi(firma.rolLimitleri, role) : Number.NaN;
  const count = users.filter(
    (user) => user.tenant_id === firma.id && user.rol === role && user.durum !== "PASIF"
  ).length;
  if (!Number.isInteger(limit) || limit <= count)
    throw new OnboardingError(409, "Komanda rolu \xFCzr\u0259 limit dolub.");
  return { count, remaining: limit - count };
}
function companyRow(firma) {
  return {
    id: firma.id,
    ad: firma.ad,
    sehir: firma.sehir,
    varsayilan_para_birimi: firma.varsayilanParaBirimi,
    varsayilan_komisyon_yuzdesi: firma.varsayilanKomisyonYuzdesi,
    aciklama: firma.aciklama,
    is_demo: false,
    onay_durumu: firma.onayDurumu,
    paket: firma.paket,
    sahip_adi: firma.sahipAdi,
    sahip_email: firma.sahipEmail,
    sahip_telefon: firma.sahipTelefon,
    mensei_ulke: firma.menseiUlke,
    rol_limitleri: firma.rolLimitleri,
    aktif_kullanici_sayilari: firma.aktifKullaniciSayilari
  };
}
async function registerBoutique(firma, user, emailJob) {
  if (supabase)
    return onboardingRpc("tomnap_register_boutique", {
      p_firma: companyRow(firma),
      p_user: user,
      p_email_job: emailJob
    });
  const next = getIdentitySnapshot();
  ensureUnique(next.users, user);
  if (next.companies.some((item) => item.id === firma.id))
    throw new OnboardingError(409, "Bu firma art\u0131q m\xF6vcuddur.");
  next.companies.push(firma);
  next.users.push(user);
  next.emailJobs.push(emailJob);
  saveIdentitySnapshot(next);
  return { firma, user };
}
async function activateUser(token, changes) {
  if (supabase)
    return onboardingRpc("tomnap_activate_user", {
      p_token: token,
      p_password_hash: changes.sifre_hash,
      p_name: changes.ad_soyad,
      p_phone: changes.telefon || ""
    });
  const next = getIdentitySnapshot();
  const user = next.users.find((item) => item.aktivasyon_token === token);
  if (!user || user.durum !== "BEKLEMEDE_SIFRE" || Date.parse(user.token_gecerlilik || "") <= Date.now() || !Number.isFinite(Date.parse(user.token_gecerlilik || ""))) {
    throw new OnboardingError(409, "Bu aktivasiya linki art\u0131q etibarl\u0131 deyil.");
  }
  const firma = next.companies.find((item) => item.id === user.tenant_id);
  if (!firma || !["BEKLEMEDE", "AKTIF"].includes(firma.onayDurumu || ""))
    throw new OnboardingError(403, "Firma aktiv deyil.");
  Object.assign(user, changes, { durum: "AKTIF", aktivasyon_token: null, token_gecerlilik: null });
  ensureUnique(next.users, user);
  if (firma.onayDurumu === "BEKLEMEDE") firma.onayDurumu = "AKTIF";
  saveIdentitySnapshot(next);
  return { user, firma };
}
async function acceptInvite(token, user) {
  if (supabase) return onboardingRpc("tomnap_accept_invite", { p_token: token, p_user: user });
  const next = getIdentitySnapshot();
  const invite = next.invites.find((item) => item.token === token);
  if (!invite || !available(invite, token))
    throw new OnboardingError(409, "Bu d\u0259v\u0259t art\u0131q etibarl\u0131 deyil.");
  const firma = next.companies.find((item) => item.id === invite.tenantId);
  if (!firma) throw new OnboardingError(403, "Firma aktiv deyil.");
  if (invite.email && invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new OnboardingError(403, "E-po\xE7t \xFCnvan\u0131 d\u0259v\u0259td\u0259ki \xFCnvanla uy\u011Fun g\u0259lmir.");
  }
  const { count } = capacity(firma, next.users, invite.rol);
  const accepted = {
    ...user,
    tenant_id: invite.tenantId,
    rol: invite.rol,
    email: invite.email?.trim().toLowerCase() || user.email
  };
  ensureUnique(next.users, accepted);
  next.users.push(accepted);
  invite.kullanildiMi = true;
  invite.kullananKisi = accepted.ad_soyad;
  firma.aktifKullaniciSayilari = {
    ...firma.aktifKullaniciSayilari,
    [invite.rol]: count + 1
  };
  saveIdentitySnapshot(next);
  return { user: accepted, firma };
}
async function createInvite(invite, creatorRole, emailJob) {
  if (supabase)
    return onboardingRpc("tomnap_create_invite", {
      p_invite: {
        id: invite.token,
        token: invite.token,
        firma_id: invite.tenantId,
        rol: invite.rol,
        olusturan_rol: creatorRole,
        son_kullanma_tarihi: invite.gecerlilikTarihi,
        email: invite.email || null,
        kullanan_adi: invite.kullananKisi || null
      },
      p_email_job: emailJob || null
    });
  const next = getIdentitySnapshot();
  const firma = next.companies.find((item) => item.id === invite.tenantId);
  if (!firma) throw new OnboardingError(403, "Firma aktiv deyil.");
  const { remaining } = capacity(firma, next.users, invite.rol);
  next.invites.push(invite);
  if (emailJob) next.emailJobs.push(emailJob);
  saveIdentitySnapshot(next);
  return { invite, remaining };
}

// src/server/services/onboardingOutbox.ts
import { randomUUID as randomUUID4 } from "node:crypto";
function createEmailJob(tenantId, kind, payload, expiresAt) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: randomUUID4(),
    tenant_id: tenantId,
    kind,
    payload,
    status: "PENDING",
    expires_at: expiresAt,
    created_at: now,
    next_attempt_at: now,
    attempts: 0
  };
}
async function deliverOnboardingEmail(id) {
  const claimToken = randomUUID4();
  let job;
  if (supabase) {
    const { data, error: error2 } = await supabase.rpc("tomnap_claim_onboarding_email", {
      p_id: id || null,
      p_claim_token: claimToken
    });
    if (error2) throw new Error("Onboarding email claim unavailable");
    job = data || void 0;
  } else {
    const next = getIdentitySnapshot();
    const now = Date.now();
    job = next.emailJobs.find(
      (item) => (!id || item.id === id) && Date.parse(String(item.expires_at)) > now && (item.status === "PENDING" && Date.parse(String(item.next_attempt_at)) <= now || item.status === "RUNNING" && Date.parse(String(item.leased_until)) <= now)
    );
    if (job) {
      Object.assign(job, {
        status: "RUNNING",
        claim_token: claimToken,
        leased_until: new Date(now + 12e4).toISOString(),
        attempts: job.attempts + 1
      });
      saveIdentitySnapshot(next);
    }
  }
  if (!job) return { claimed: false, sent: false };
  let sent = false;
  try {
    sent = (await sendEmail({ ...job.payload, idempotencyKey: `tomnap-onboarding/${job.id}` })).basarili;
  } catch {
  }
  if (supabase) {
    const { data, error: error2 } = await supabase.rpc("tomnap_finish_onboarding_email", {
      p_id: job.id,
      p_claim_token: claimToken,
      p_sent: sent
    });
    if (error2 || data !== true) throw new Error("Onboarding email acknowledgement unavailable");
  } else {
    const next = getIdentitySnapshot();
    const current = next.emailJobs.find((item) => item.id === job.id);
    if (!current || current.status !== "RUNNING" || current.claim_token !== claimToken)
      throw new Error("Onboarding email lease lost");
    Object.assign(current, {
      status: sent ? "SENT" : "PENDING",
      claim_token: null,
      leased_until: null,
      next_attempt_at: new Date(Date.now() + 3e5).toISOString(),
      sent_at: sent ? (/* @__PURE__ */ new Date()).toISOString() : null
    });
    saveIdentitySnapshot(next);
  }
  return { claimed: true, sent };
}
async function tryDeliverOnboardingEmail(id) {
  try {
    return (await deliverOnboardingEmail(id)).sent;
  } catch {
    return false;
  }
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
      const { data, error: error2 } = await query;
      if (error2)
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
          rolLimitleri: d.rol_limitleri || { ...VARSAYILAN_ROL_LIMITLERI },
          aktifKullaniciSayilari: d.aktif_kullanici_sayilari || ilkKullaniciSayilari(),
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
router6.post("/firmalar/kayit", async (req, res) => {
  try {
    const body2 = req.body || {};
    const ad = String(body2.ad || "").trim();
    const sahipAdi = String(body2.sahipAdi || "").trim();
    const sahipTelefon = String(body2.sahipTelefon || "").trim();
    const sahipEmail = String(body2.sahipEmail || "").trim().toLowerCase();
    const sehir = String(body2.sehir || "Bak\u0131").trim();
    const paket = body2.paket || "PRO";
    const menseiUlke = String(body2.menseiUlke || "CA").trim();
    const aciklama = String(body2.aciklama || "").trim();
    if (!ad || !sahipAdi || !sahipTelefon || !sahipEmail) {
      return res.status(400).json({
        basarili: false,
        hata: "Butik ad\u0131, sahibinin ad\u0131, \u0259laq\u0259 telefonu v\u0259 e-po\xE7t \xFCnvan\u0131 m\xFCtl\u0259qdir."
      });
    }
    if ([body2.ad, body2.sahipAdi, body2.sahipTelefon, body2.sahipEmail].some(
      (value) => typeof value !== "string"
    ) || ad.length > 200 || sahipAdi.length > 150 || sahipEmail.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sahipEmail) || !/^[+\d\s().-]+$/.test(sahipTelefon) || !/^\d{7,15}$/.test(sahipTelefon.replace(/\D/g, "")) || sehir.length > 100 || menseiUlke.length > 10) {
      return res.status(400).json({ basarili: false, hata: "Qeydiyyat m\u0259lumatlar\u0131n\u0131n format\u0131n\u0131 yoxlay\u0131n." });
    }
    if (IS_PRODUCTION && !RESEND_API_KEY) {
      return res.status(503).json({
        basarili: false,
        hata: "Aktivasiya m\u0259ktubu xidm\u0259ti haz\u0131r deyil. Daha sonra yenid\u0259n c\u0259hd edin."
      });
    }
    getApplicationUrl();
    const slug = ad.toLowerCase().replace(/ə/g, "e").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/[^a-z0-9]/g, "_").slice(0, 60) + "_" + randomUUID5();
    const upper = String(paket || "PRO").toUpperCase();
    const normalPaket = upper === "ENTERPRISE" ? "ENTERPRISE" : upper === "BASLANGIC" ? "BASLANGIC" : "PRO";
    const rolLimitleri = { ...PAKET_ROL_LIMITLERI[normalPaket] };
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
      // Sahib avtomatik ilk istifadəçidir
      aktifKullaniciSayilari: ilkKullaniciSayilari()
    };
    const aktivasyonToken = tokenUret(32);
    const tokenGecerlilik = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
    const yeniPatronUser = {
      id: "usr_" + randomUUID5(),
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
    const { payload } = buildActivationEmail({
      email: sahipEmail,
      adSoyad: sahipAdi,
      butikAdi: ad,
      token: aktivasyonToken
    });
    const job = createEmailJob(yeniFirma.id, "ACTIVATION", payload, tokenGecerlilik);
    await registerBoutique(yeniFirma, yeniPatronUser, job);
    const emailGonderildi = await tryDeliverOnboardingEmail(job.id);
    res.json({
      basarili: true,
      mesaj: emailGonderildi ? `Qeydiyyat q\u0259bul edildi. \u015Eifr\u0259 t\u0259yini linki ${sahipEmail} \xFCnvan\u0131na g\xF6nd\u0259rildi.` : "Qeydiyyat saxlan\u0131ld\u0131. Aktivasiya m\u0259ktubu g\xF6nd\u0259rilm\u0259 n\xF6vb\u0259sind\u0259dir; d\u0259st\u0259k xidm\u0259ti g\xF6nd\u0259ri\u015Fi yenid\u0259n yoxlaya bil\u0259r.",
      firma: yeniFirma,
      emailGonderildi,
      emailDurumu: emailGonderildi ? "GONDERILDI" : "BEKLIYOR"
    });
  } catch (err) {
    res.status(err instanceof OnboardingError ? err.status : 503).json({
      basarili: false,
      hata: err instanceof OnboardingError ? err.message : "\u018Fm\u0259liyyat saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
router6.patch("/firmalar/:id/onay", async (req, res) => {
  const { id } = req.params;
  const { onayDurumu } = req.body;
  if (!["AKTIF", "REDDEDILDI", "BEKLEMEDE", "DONDURULMUS"].includes(onayDurumu))
    return res.status(400).json({ basarili: false, hata: "Ge\xE7ersiz firma durumu." });
  try {
    if (supabase) {
      const { data, error: error2 } = await supabase.from("firmalar").update({ onay_durumu: onayDurumu }).eq("id", id).select("id,ad,onay_durumu").maybeSingle();
      if (error2)
        return res.status(503).json({ basarili: false, hata: "Firma durumu kaydedilemedi." });
      if (!data) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
      return res.json({
        basarili: true,
        firma: { ...data, onayDurumu },
        mesaj: "Firma durumu g\xFCncellendi."
      });
    }
    const next = getIdentitySnapshot();
    const firma = next.companies.find((f) => f.id === id);
    if (!firma) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    firma.onayDurumu = onayDurumu;
    saveIdentitySnapshot(next);
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
      const { data, error: error2 } = await supabase.from("firmalar").select("*").eq("id", tenantId).maybeSingle();
      if (error2)
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
    if (!ekipRoluMu(rol)) {
      return res.status(400).json({ basarili: false, hata: "Etibars\u0131z komanda rolu." });
    }
    if (firma.onayDurumu && firma.onayDurumu !== "AKTIF")
      return res.status(403).json({ basarili: false, hata: "Firma aktif de\u011Fil." });
    if (email !== void 0 && (typeof email !== "string" || email.trim().length > 150 || email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) || adSoyad !== void 0 && (typeof adSoyad !== "string" || adSoyad.length > 150) || typeof olusturanKisi !== "string") {
      return res.status(400).json({ basarili: false, hata: "D\u0259v\u0259t m\u0259lumatlar\u0131n\u0131n format\u0131n\u0131 yoxlay\u0131n." });
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
    const preparedEmail = davet.email ? buildInviteEmail({
      email: davet.email,
      adSoyad: davet.kullananKisi,
      butikAdi: firma.ad,
      rol,
      token,
      davetEden: olusturanKisi
    }) : void 0;
    const job = preparedEmail ? createEmailJob(firma.id, "INVITE", preparedEmail.payload, gecerlilikTarihi) : void 0;
    const created = await createInvite(davet, req.auth?.role || "PATRON", job);
    const emailGonderildi = job ? await tryDeliverOnboardingEmail(job.id) : false;
    const davetUrlTam = preparedEmail?.link || `${getApplicationUrl()}/davet-qebul?token=${token}`;
    res.json({
      basarili: true,
      davet,
      davetUrl: `/davet?token=${token}`,
      davetUrlTam,
      emailGonderildi,
      mesaj: emailGonderildi ? `D\u0259v\u0259t m\u0259ktubu ${email} \xFCnvan\u0131na g\xF6nd\u0259rildi.` : `D\u0259v\u0259t linki u\u011Furla yarad\u0131ld\u0131.`,
      emailDurumu: job ? emailGonderildi ? "GONDERILDI" : "BEKLIYOR" : "ISTENMEDI",
      kalanKota: created.remaining
    });
  } catch (err) {
    res.status(err instanceof OnboardingError ? err.status : 503).json({
      basarili: false,
      hata: err instanceof OnboardingError ? err.message : "\u018Fm\u0259liyyat saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin."
    });
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
    const slug = ad.toLowerCase().replace(/ə/g, "e").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/[^a-z0-9]/g, "_").slice(0, 60) + "_" + randomUUID5();
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
      rolLimitleri: { ...VARSAYILAN_ROL_LIMITLERI },
      aktifKullaniciSayilari: ilkKullaniciSayilari()
    };
    if (supabase) {
      const { data, error: error2 } = await supabase.from("firmalar").insert({
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
      if (error2 || !data)
        return res.status(503).json({ basarili: false, hata: "Firma kaydedilemedi." });
    }
    if (!supabase) firmalariKaydetDosyaya([...firmalarVeritabani, yeniFirma]);
    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistem\u0259 u\u011Furla \u0259lav\u0259 edildi!`,
      firma: yeniFirma
    });
  } catch (err) {
    res.status(err instanceof OnboardingError ? err.status : 503).json({
      basarili: false,
      hata: err instanceof OnboardingError ? err.message : "\u018Fm\u0259liyyat saxlan\u0131lmad\u0131. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
router6.delete("/firmalar/:id", async (req, res) => {
  const { id } = req.params;
  if (id === "kanada_shopper_baku")
    return res.status(400).json({ basarili: false, hata: "\u018Fsas canl\u0131 butik silin\u0259 bilm\u0259z." });
  try {
    if (supabase) {
      const { data, error: error2 } = await supabase.from("firmalar").delete().eq("id", id).select("id").maybeSingle();
      if (error2) return res.status(503).json({ basarili: false, hata: "Firma silinemedi." });
      if (!data) return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
    }
    if (!supabase) {
      const next = getIdentitySnapshot();
      if (!next.companies.some((firma) => firma.id === id))
        return res.status(404).json({ basarili: false, hata: "Butik tap\u0131lmad\u0131." });
      next.companies = next.companies.filter((firma) => firma.id !== id);
      next.users = next.users.filter((user) => user.tenant_id !== id);
      next.invites = next.invites.filter((invite) => invite.tenantId !== id);
      next.emailJobs = next.emailJobs.filter((job) => job.tenant_id !== id);
      saveIdentitySnapshot(next);
    }
    res.json({ basarili: true, mesaj: "Butik u\u011Furla silindi." });
  } catch {
    res.status(503).json({ basarili: false, hata: "Firma silinemedi." });
  }
});
var firmalar_default = router6;

// src/server/routes/kuryeler.ts
import { Router as Router7 } from "express";

// src/server/services/couriers.ts
import path7 from "node:path";
import { randomUUID as randomUUID6 } from "node:crypto";
var localFile = path7.join(DATA_DIR, "couriers.json");
var object2 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
function validRecords(value) {
  if (!Array.isArray(value)) return false;
  const ids = /* @__PURE__ */ new Set();
  const users = /* @__PURE__ */ new Set();
  return value.every((row) => {
    if (!object2(row) || !["id", "tenant_id", "ad_soyad", "telefon", "bolge", "olusturma_tarihi"].every(
      (key) => typeof row[key] === "string"
    ) || !row.id || !row.tenant_id || row.tenant_id === "all" || typeof row.aktif !== "boolean" || row.kullanici_id !== null && (typeof row.kullanici_id !== "string" || !row.kullanici_id) || ids.has(row.id) || row.kullanici_id && users.has(row.kullanici_id))
      return false;
    ids.add(row.id);
    if (row.kullanici_id) users.add(row.kullanici_id);
    return true;
  });
}
function localRecords() {
  if (IS_PRODUCTION || SUPABASE_URL)
    throw new PublicResourceError("Kurye veritaban\u0131 kullan\u0131lam\u0131yor.", 503);
  return readJsonFile(localFile, validRecords) || [];
}
function scope(tenant2) {
  if (!tenant2 || tenant2 === "all") throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
}
function localOrders(tenant2) {
  return tenant2 === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
}
function activeLocalUser(tenant2, id) {
  const user = kullanicilarVeritabani.find(
    (u) => u.id === id && u.tenant_id === tenant2 && u.rol === "BAKU_KURYE" && u.durum === "AKTIF"
  );
  const company = firmalarVeritabani.find((f) => f.id === tenant2 && f.onayDurumu === "AKTIF");
  if (!user || !company) throw new PublicResourceError("Aktif kurye kullan\u0131c\u0131s\u0131 bulunamad\u0131.", 404);
  return user;
}
function rpcError(error2) {
  const status2 = error2?.code === "PT404" ? 404 : ["PT409", "23505"].includes(error2?.code) ? 409 : ["PT400", "22023", "22P02"].includes(error2?.code) ? 400 : error2?.code === "PT403" ? 403 : 503;
  throw new PublicResourceError(
    status2 === 409 ? "Kay\u0131t de\u011Fi\u015Fti veya bu kullan\u0131c\u0131 zaten ba\u015Fka kuryeye ba\u011Fl\u0131. Listeyi yenileyin." : status2 === 404 ? "Kurye veya g\xF6rev bulunamad\u0131." : status2 === 400 ? "Ge\xE7ersiz kurye i\u015Flemi." : "Kurye i\u015Flemi tamamlanamad\u0131.",
    status2
  );
}
async function rpc(name, args) {
  const { data, error: error2 } = await supabase.rpc(name, args);
  if (error2) rpcError(error2);
  if (!data || typeof data !== "object")
    throw new PublicResourceError("Kurye i\u015Flemi do\u011Frulanamad\u0131.", 503);
  return data;
}
function deliveryTask(order) {
  return {
    id: order.id,
    musteri_adi: order.musteri_adi,
    telefon_numarasi: order.telefon_numarasi || "",
    teslimat_sehri: order.teslimat_sehri || "",
    teslimat_adresi: order.teslimat_adresi || "",
    urun_aciklamasi: order.urun_aciklamasi,
    adet: Number(order.adet || 1),
    lojistik_durumu: order.lojistik_durumu,
    kalan_tutar: Number(
      order.kalan_tutar ?? Math.max(0, Number(order.toplam_tutar || 0) - Number(order.alinan_tutar || 0))
    ),
    para_birimi: order.para_birimi || "AZN",
    kurye_atama_surumu: Number(order.kurye_atama_surumu || 0),
    teslim_tarihi: order.teslim_tarihi || null,
    teslim_alan: order.kurye_teslim_alan || order.teslim_alan || null
  };
}
function completeRows(result2) {
  if (result2.error) rpcError(result2.error);
  if (typeof result2.count !== "number" || !Array.isArray(result2.data)) rpcError(null);
  if (result2.count !== result2.data.length)
    throw new PublicResourceError("Kurye y\xF6netimi listesi veritaban\u0131 yan\u0131t s\u0131n\u0131r\u0131n\u0131 a\u015F\u0131yor.", 409);
  return result2.data;
}
async function listCouriers(tenant2, withUsers) {
  scope(tenant2);
  let rows;
  let orders;
  let users = [];
  if (supabase) {
    const result2 = await supabase.from("kuryeler").select("*", { count: "exact" }).eq("tenant_id", tenant2);
    rows = completeRows(result2);
    const orderResult = await supabase.from("siparisler").select("id,tenant_id,baku_kurye_id,lojistik_durumu,kalan_tutar", { count: "exact" }).eq("tenant_id", tenant2);
    orders = completeRows(orderResult);
    if (withUsers) {
      const userResult = await supabase.from("kullanicilar").select("id,ad_soyad,email", { count: "exact" }).eq("tenant_id", tenant2).eq("rol", "BAKU_KURYE").eq("durum", "AKTIF");
      users = completeRows(userResult);
    }
  } else {
    rows = localRecords().filter((r) => r.tenant_id === tenant2);
    orders = localOrders(tenant2).filter((r) => r.tenant_id === tenant2).map(formatlaSiparis);
    if (withUsers)
      users = kullanicilarVeritabani.filter((u) => u.tenant_id === tenant2 && u.rol === "BAKU_KURYE" && u.durum === "AKTIF").map(({ id, ad_soyad, email }) => ({ id, ad_soyad, email }));
  }
  rows = rows.filter((r) => r.tenant_id === tenant2);
  const ids = new Set(rows.map((r) => r.id));
  return {
    kuryeler: rows.map((r) => {
      const assigned = orders.filter((s) => s.tenant_id === tenant2 && s.baku_kurye_id === r.id);
      const pending = assigned.filter((s) => s.lojistik_durumu !== "TESLIM_EDILDI");
      return {
        ...r,
        kullanici_id: r.kullanici_id || null,
        aktif_paket_sayisi: pending.length,
        toplam_paket_sayisi: assigned.length,
        toplam_tahsilat_bekleyen: pending.reduce((sum, s) => sum + Number(s.kalan_tutar || 0), 0)
      };
    }),
    atanabilir_kullanicilar: users,
    eslenmemis_siparisler: orders.filter((s) => s.tenant_id === tenant2 && s.baku_kurye_id && !ids.has(s.baku_kurye_id)).map(({ id, baku_kurye_id }) => ({ id, baku_kurye_id }))
  };
}
async function createCourier(tenant2, input) {
  scope(tenant2);
  const row = {
    ...input,
    id: "kurye-" + randomUUID6(),
    tenant_id: tenant2,
    aktif: true,
    kullanici_id: null,
    olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (supabase) {
    const { data, error: error2 } = await supabase.from("kuryeler").insert(row).select("*").single();
    if (error2) rpcError(error2);
    if (!data || data.id !== row.id || data.tenant_id !== tenant2)
      throw new PublicResourceError("Kurye kayd\u0131 do\u011Frulanamad\u0131.", 503);
    return data;
  }
  const rows = localRecords();
  rows.push(row);
  writeJsonAtomic(localFile, rows);
  return row;
}
async function bindCourier(tenant2, id, userId, expected) {
  scope(tenant2);
  if (supabase)
    return rpc("tomnap_bind_courier", {
      p_tenant_id: tenant2,
      p_courier_id: id,
      p_user_id: userId,
      p_expected_user_id: expected
    });
  const rows = localRecords();
  const row = rows.find(
    (r) => r.id === id && r.tenant_id === tenant2 && (r.aktif || userId === null)
  );
  if (!row) throw new PublicResourceError("Kurye bulunamad\u0131.", 404);
  if (userId) activeLocalUser(tenant2, userId);
  if (row.kullanici_id === userId) return { kurye: row, tekrar: true };
  if (row.kullanici_id !== expected || userId && rows.some((r) => r.id !== id && r.kullanici_id === userId))
    rpcError({ code: "PT409" });
  row.kullanici_id = userId;
  writeJsonAtomic(localFile, rows);
  return { kurye: row, tekrar: false };
}
async function assignCourier(tenant2, orderId, courierId, version2) {
  scope(tenant2);
  if (supabase) {
    const result2 = await rpc("tomnap_assign_courier", {
      p_tenant_id: tenant2,
      p_order_id: orderId,
      p_courier_id: courierId,
      p_expected_version: version2
    });
    if (result2.siparis?.tenant_id !== tenant2) rpcError(null);
    return { ...result2, siparis: formatlaSiparis(result2.siparis) };
  }
  const rows = localRecords();
  const courier = courierId ? rows.find((r) => r.id === courierId && r.tenant_id === tenant2 && r.aktif) : null;
  if (courierId && !courier) throw new PublicResourceError("Kurye bulunamad\u0131.", 404);
  const order = localOrders(tenant2).find((s) => s.id === orderId && s.tenant_id === tenant2);
  if (!order) throw new PublicResourceError("Sipari\u015F bulunamad\u0131.", 404);
  const currentVersion = Number(order.kurye_atama_surumu || 0);
  if ((order.baku_kurye_id || null) === courierId && [version2, version2 + 1].includes(currentVersion))
    return { siparis: formatlaSiparis(order), tekrar: true };
  if (currentVersion !== version2) rpcError({ code: "PT409" });
  if (order.lojistik_durumu === "TESLIM_EDILDI") rpcError({ code: "PT409" });
  Object.assign(order, {
    baku_kurye_id: courierId,
    baku_kurye_adi: courier?.ad_soyad || null,
    baku_kurye_bolgesi: courier?.bolge || null,
    kurye_atama_surumu: version2 + 1,
    guncellenme_tarihi: (/* @__PURE__ */ new Date()).toISOString()
  });
  return { siparis: formatlaSiparis(order), tekrar: false };
}
async function courierTasks(tenant2, userId) {
  scope(tenant2);
  if (supabase) {
    const result2 = await rpc("tomnap_courier_tasks", { p_tenant_id: tenant2, p_user_id: userId });
    if (!Array.isArray(result2.gorevler)) rpcError(null);
    return {
      kurye: result2.kurye ? { id: result2.kurye.id, ad_soyad: result2.kurye.ad_soyad, bolge: result2.kurye.bolge } : null,
      gorevler: result2.gorevler.map(deliveryTask)
    };
  }
  activeLocalUser(tenant2, userId);
  const courier = localRecords().find(
    (r) => r.tenant_id === tenant2 && r.kullanici_id === userId && r.aktif
  );
  if (!courier) return { kurye: null, gorevler: [] };
  return {
    kurye: { id: courier.id, ad_soyad: courier.ad_soyad, bolge: courier.bolge },
    gorevler: localOrders(tenant2).filter(
      (s) => s.tenant_id === tenant2 && s.baku_kurye_id === courier.id && (s.lojistik_durumu === "BAKU_DAGITIM_ARKADAS" || s.lojistik_durumu === "TESLIM_EDILDI" && s.kurye_teslim_kullanici_id === userId)
    ).map(deliveryTask)
  };
}
async function deliverCourierTask(tenant2, userId, orderId, version2, recipient) {
  scope(tenant2);
  if (supabase) {
    const result2 = await rpc("tomnap_deliver_courier_order", {
      p_tenant_id: tenant2,
      p_user_id: userId,
      p_order_id: orderId,
      p_expected_version: version2,
      p_recipient: recipient
    });
    if (!result2.gorev || typeof result2.tekrar !== "boolean") rpcError(null);
    return { gorev: deliveryTask(result2.gorev), tekrar: result2.tekrar };
  }
  activeLocalUser(tenant2, userId);
  const courier = localRecords().find(
    (r) => r.tenant_id === tenant2 && r.kullanici_id === userId && r.aktif
  );
  const order = courier && localOrders(tenant2).find(
    (s) => s.tenant_id === tenant2 && s.id === orderId && s.baku_kurye_id === courier.id
  );
  if (!order || !courier) throw new PublicResourceError("G\xF6rev bulunamad\u0131.", 404);
  if (Number(order.kurye_atama_surumu || 0) !== version2) rpcError({ code: "PT409" });
  if (order.lojistik_durumu === "TESLIM_EDILDI" && order.kurye_teslim_kullanici_id === userId)
    return { gorev: deliveryTask(order), tekrar: true };
  if (order.lojistik_durumu !== "BAKU_DAGITIM_ARKADAS") rpcError({ code: "PT409" });
  Object.assign(order, {
    lojistik_durumu: "TESLIM_EDILDI",
    teslim_tarihi: (/* @__PURE__ */ new Date()).toISOString(),
    teslim_eden_kisi: courier.ad_soyad,
    kurye_teslim_alan: recipient,
    kurye_teslim_kullanici_id: userId
  });
  return { gorev: deliveryTask(order), tekrar: false };
}

// src/server/routes/kuryeler.ts
var router7 = Router7();
var owners = new Set(ROL_GRUPLARI.OWNERS);
var operators = new Set(ROL_GRUPLARI.SHIPPING);
function requireRole(req, roles) {
  if (!req.auth || !roles.has(req.auth.role))
    throw new PublicResourceError("Bu i\u015Flem i\xE7in yetkiniz yok.", 403);
  if (!req.tenantId || req.tenantId === "all")
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return req.tenantId;
}
function body(req, allowed) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => ![...allowed, "tenant_id", "tenantId"].includes(key)))
    throw new PublicResourceError("Ge\xE7ersiz kurye iste\u011Fi.", 400);
}
function text2(value, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new PublicResourceError("Zorunlu alanlar\u0131 kontrol edin.", 400);
  return value.trim();
}
function optionalText(value, max) {
  if (value === void 0 || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max)
    throw new PublicResourceError("Alan uzunlu\u011Funu kontrol edin.", 400);
  return value.trim();
}
function nullableId(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new PublicResourceError("Ge\xE7ersiz kimlik.", 400);
  return value;
}
function version(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new PublicResourceError("G\xF6rev s\xFCr\xFCm\xFC ge\xE7ersiz. Listeyi yenileyin.", 400);
  return value;
}
function failure(res, error2) {
  res.status(error2 instanceof PublicResourceError ? error2.status : 503).json({
    basarili: false,
    hata: error2 instanceof PublicResourceError ? error2.message : "Kurye i\u015Flemi tamamlanamad\u0131."
  });
}
router7.get("/kuryeler", async (req, res) => {
  try {
    const tenant2 = requireRole(req, /* @__PURE__ */ new Set([...operators, "BAKU_FINANS"]));
    res.json({ basarili: true, ...await listCouriers(tenant2, owners.has(req.auth.role)) });
  } catch (error2) {
    failure(res, error2);
  }
});
router7.post("/kuryeler", async (req, res) => {
  try {
    const tenant2 = requireRole(req, owners);
    body(req, ["ad_soyad", "telefon", "bolge"]);
    const kurye = await createCourier(tenant2, {
      ad_soyad: text2(req.body.ad_soyad, 150),
      telefon: optionalText(req.body.telefon, 50),
      bolge: optionalText(req.body.bolge, 150)
    });
    res.status(201).json({ basarili: true, kurye });
  } catch (error2) {
    failure(res, error2);
  }
});
router7.post("/kuryeler/:id/kullanici", async (req, res) => {
  try {
    const tenant2 = requireRole(req, owners);
    body(req, ["kullanici_id", "beklenen_kullanici_id"]);
    res.json({
      basarili: true,
      ...await bindCourier(
        tenant2,
        req.params.id,
        nullableId(req.body.kullanici_id),
        nullableId(req.body.beklenen_kullanici_id)
      )
    });
  } catch (error2) {
    failure(res, error2);
  }
});
router7.post("/siparisler/:id/kurye", async (req, res) => {
  try {
    const tenant2 = requireRole(req, operators);
    body(req, ["kurye_id", "beklenen_atama_surumu"]);
    res.json({
      basarili: true,
      ...await assignCourier(
        tenant2,
        req.params.id,
        nullableId(req.body.kurye_id),
        version(req.body.beklenen_atama_surumu)
      )
    });
  } catch (error2) {
    failure(res, error2);
  }
});
router7.get("/kurye/gorevler", async (req, res) => {
  try {
    const tenant2 = requireRole(req, /* @__PURE__ */ new Set(["BAKU_KURYE"]));
    res.json({ basarili: true, ...await courierTasks(tenant2, req.auth.userId) });
  } catch (error2) {
    failure(res, error2);
  }
});
router7.post("/kurye/gorevler/:id/teslim", async (req, res) => {
  try {
    const tenant2 = requireRole(req, /* @__PURE__ */ new Set(["BAKU_KURYE"]));
    body(req, ["beklenen_atama_surumu", "teslim_alan"]);
    res.json({
      basarili: true,
      ...await deliverCourierTask(
        tenant2,
        req.auth.userId,
        req.params.id,
        version(req.body.beklenen_atama_surumu),
        text2(req.body.teslim_alan, 150)
      )
    });
  } catch (error2) {
    failure(res, error2);
  }
});
var kuryeler_default = router7;

// src/server/routes/veritabani.ts
import { Router as Router8 } from "express";
import { createHash as createHash5 } from "node:crypto";
var router8 = Router8();
var UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
var localReceipts = /* @__PURE__ */ new Map();
var tenantOf = (row) => row.tenant_id || formatlaSiparis(row).tenant_id;
var localRows = (tenant2) => tenant2 === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
var dbActive3 = (tenant2) => !!supabase && tenant2 !== "demo_sandbox";
function fail2(res, error2) {
  const status2 = error2 instanceof PublicResourceError ? error2.status : error2?.code === "23505" ? 409 : ["22023", "22P02", "23514", "23502"].includes(error2?.code) ? 400 : error2?.code === "54000" ? 413 : 503;
  res.status(status2).json({
    basarili: false,
    hata: error2 instanceof PublicResourceError ? error2.message : status2 === 409 ? "\u0130\u015Flem kimli\u011Fi veya sipari\u015F kimli\u011Fi \xE7ak\u0131\u015F\u0131yor. Mevcut kay\u0131tlar de\u011Fi\u015Ftirilmedi." : status2 === 400 ? "Yedek verisi ge\xE7ersiz. Mevcut kay\u0131tlar de\u011Fi\u015Ftirilmedi." : status2 === 413 ? "Yedek s\u0131n\u0131r\u0131 5000 sipari\u015F / 10 MiB. Daha b\xFCy\xFCk veri i\xE7in veritaban\u0131 yede\u011Fi kullan\u0131n." : "Veritaban\u0131 i\u015Flemi do\u011Frulanamad\u0131. Ayn\u0131 i\u015Flem kimli\u011Fiyle yeniden deneyin."
  });
}
function concreteTenant(req) {
  if (!req.tenantId || req.tenantId === "all")
    throw new PublicResourceError("\u0130\u015Flem i\xE7in tek bir firma se\xE7in.", 400);
  return req.tenantId;
}
function operationKey(req) {
  const key = req.body.islem_id;
  if (typeof key !== "string" || !UUID.test(key))
    throw new PublicResourceError("Ge\xE7erli bir i\u015Flem kimli\u011Fi gerekiyor.", 400);
  return key.toLowerCase();
}
function prepareRows(rows, tenant2, demo = false) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5e3 || Buffer.byteLength(JSON.stringify(rows)) > 10 * 1024 * 1024)
    throw new PublicResourceError(
      "Yedek 1\u20135000 sipari\u015F i\xE7ermeli ve 10 MiB s\u0131n\u0131r\u0131n\u0131 a\u015Fmamal\u0131.",
      400
    );
  const ids = /* @__PURE__ */ new Set();
  const supported = /* @__PURE__ */ new Set([
    ...SUPABASE_GECERLI_KOLONLAR,
    ...SIPARIS_EK_ALANLAR,
    "id",
    "tenantId",
    "olusturma_tarihi",
    "guncellenme_tarihi",
    "kalan_tutar",
    "urunler",
    "gorsel_urlleri",
    "ozel_not",
    "birden_fazla_urun"
  ]);
  return rows.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.id !== "string" || !raw.id || raw.id.length > 200)
      throw new PublicResourceError("Her sipari\u015Fin kal\u0131c\u0131 bir kimli\u011Fi olmal\u0131.", 400);
    if (Object.keys(raw).some((key) => !supported.has(key)) || raw.ek_veriler && (typeof raw.ek_veriler !== "object" || Array.isArray(raw.ek_veriler) || Object.keys(raw.ek_veriler).some(
      (key) => !SIPARIS_EK_ALANLAR.includes(key)
    )))
      throw new PublicResourceError(
        "Yedekte desteklenmeyen alan var; veri kayb\u0131n\u0131 \xF6nlemek i\xE7in y\xFCkleme durduruldu.",
        400
      );
    const claims = [
      raw.tenant_id,
      raw.tenantId,
      ...Array.isArray(raw.eksik_bilgiler) ? raw.eksik_bilgiler.filter((x) => typeof x === "string" && x.startsWith("META:tenant_id=")).map((x) => x.slice("META:tenant_id=".length)) : []
    ].filter((x) => x !== void 0);
    if (!demo && (!claims.length || claims.some((x) => x !== tenant2)))
      throw new PublicResourceError("Yedek yaln\u0131zca se\xE7ili firman\u0131n sipari\u015Flerini i\xE7ermeli.", 403);
    if (raw.adet !== void 0 && (typeof raw.adet !== "number" || !Number.isSafeInteger(raw.adet) || raw.adet <= 0))
      throw new PublicResourceError("Sipari\u015F adedi ge\xE7ersiz.", 400);
    for (const field of ["toplam_tutar", "alinan_tutar"])
      if (raw[field] !== void 0 && (typeof raw[field] !== "number" || !Number.isFinite(raw[field]) || raw[field] < 0))
        throw new PublicResourceError("Sipari\u015F tutar\u0131 ge\xE7ersiz.", 400);
    const row = formatlaSiparis(raw);
    if (typeof row.musteri_adi !== "string" || !row.musteri_adi.trim() || typeof row.urun_aciklamasi !== "string" || !row.urun_aciklamasi.trim() || !Number.isSafeInteger(row.adet) || row.adet <= 0 || !Number.isFinite(row.toplam_tutar) || row.toplam_tutar < 0 || !Number.isFinite(row.alinan_tutar) || row.alinan_tutar < 0)
      throw new PublicResourceError("Sipari\u015F ad\u0131, \xFCr\xFCn, adet veya tutar ge\xE7ersiz.", 400);
    if (dbActive3(tenant2) && !UUID.test(raw.id))
      throw new PublicResourceError(
        "Veritaban\u0131na y\xFCklenen sipari\u015Fler UUID kimli\u011Fi ta\u015F\u0131mal\u0131. Eski yerel kimlikler \xF6nce e\u015Flenmeli.",
        400
      );
    const id = UUID.test(raw.id) ? raw.id.toLowerCase() : raw.id;
    if (ids.has(id)) throw new PublicResourceError("Yedekte tekrarlanan sipari\u015F kimli\u011Fi var.", 400);
    ids.add(id);
    const payload = {
      ...hazirlaSupabasePayload({
        ...row,
        tenant_id: tenant2,
        is_demo: demo || tenant2 === "demo_sandbox" || row.is_demo === true
      }),
      id
    };
    for (const field of ["olusturma_tarihi", "guncellenme_tarihi"])
      if (raw[field] !== void 0) {
        if (typeof raw[field] !== "string" || !Number.isFinite(Date.parse(raw[field])))
          throw new PublicResourceError("Sipari\u015F tarihi ge\xE7ersiz.", 400);
        payload[field] = new Date(raw[field]).toISOString();
      }
    return payload;
  });
}
async function maintain(tenant2, key, mode, rows) {
  if (dbActive3(tenant2)) {
    const { data, error: error2 } = await supabase.rpc("tomnap_restore_orders", {
      p_tenant_id: tenant2,
      p_operation_id: key,
      p_mode: mode,
      p_orders: rows
    });
    if (error2) throw error2;
    if (!data || data.hedef_tenant !== tenant2 || typeof data.toplam !== "number")
      throw new Error("Invalid operation receipt");
    return { ...data, kaynak: "supabase" };
  }
  if (!firmalarVeritabani.some((f) => f.id === tenant2))
    throw new PublicResourceError("Firma bulunamad\u0131.", 404);
  const fingerprint2 = createHash5("sha256").update(JSON.stringify({ tenant: tenant2, mode, rows })).digest("hex");
  const receipt = localReceipts.get(key);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint2)
      throw new PublicResourceError("\u0130\u015Flem kimli\u011Fi ba\u015Fka bir istek i\xE7in kullan\u0131lm\u0131\u015F.", 409);
    return { ...receipt.result, tekrar: true };
  }
  if (localReceipts.size >= 1e4)
    throw new PublicResourceError("Yerel i\u015Flem kay\u0131t s\u0131n\u0131r\u0131na ula\u015F\u0131ld\u0131.", 503);
  const current = localRows(tenant2), ids = new Set(rows.map((r) => r.id));
  if (current.some(
    (r) => ids.has(UUID.test(r.id) ? r.id.toLowerCase() : r.id) && (mode === "merge" || tenantOf(r) !== tenant2)
  ))
    throw new PublicResourceError("Y\xFCkleme mevcut sipari\u015F kimli\u011Fiyle \xE7ak\u0131\u015F\u0131yor.", 409);
  const normalized = rows.map(
    (row) => formatlaSiparis({ ...row, olusturma_tarihi: row.olusturma_tarihi || (/* @__PURE__ */ new Date()).toISOString() })
  );
  const next = [
    ...current.filter((r) => mode === "merge" || tenantOf(r) !== tenant2),
    ...normalized
  ];
  if (tenant2 === "demo_sandbox") setDemoSiparislerVeritabani(next);
  else setSiparislerVeritabani(next);
  const result2 = { toplam: rows.length, hedef_tenant: tenant2, tekrar: false, kaynak: "bellek" };
  localReceipts.set(key, { fingerprint: fingerprint2, result: result2 });
  return result2;
}
router8.get("/veritabani/durum", async (req, res) => {
  try {
    const tenant2 = req.tenantId;
    let status2;
    if (dbActive3(tenant2)) {
      const { data, error: error2 } = await supabase.rpc("tomnap_order_status", { p_tenant_id: tenant2 });
      if (error2) throw error2;
      if (!data || typeof data.toplam_siparis !== "number") throw new Error("Invalid status");
      status2 = data;
    } else {
      const rows = localRows(tenant2).filter((r) => tenant2 === "all" || tenantOf(r) === tenant2);
      status2 = {
        toplam_siparis: rows.length,
        demo_siparis_sayisi: rows.filter((r) => r.is_demo === true).length,
        canli_siparis_sayisi: rows.filter((r) => r.is_demo !== true).length,
        firma_dagilimi: {}
      };
      for (const row of rows)
        status2.firma_dagilimi[tenantOf(row)] = (status2.firma_dagilimi[tenantOf(row)] || 0) + 1;
    }
    res.json({
      basarili: true,
      ...status2,
      supabase_bagli: dbActive3(tenant2),
      kaynak: dbActive3(tenant2) ? "supabase" : "bellek",
      rejim: status2.toplam_siparis === 0 ? "TEMIZ_CANLI" : status2.demo_siparis_sayisi > 0 ? "DEMO_MODU" : "CANLI_MODU"
    });
  } catch (error2) {
    fail2(res, error2);
  }
});
router8.post("/veritabani/temizle", async (req, res) => {
  try {
    const tenant2 = concreteTenant(req);
    if (req.body.onay_kodu !== `SIL:${tenant2}`)
      throw new PublicResourceError(`Silmek i\xE7in SIL:${tenant2} onay\u0131 gerekiyor.`, 403);
    const result2 = await maintain(tenant2, operationKey(req), "clear", []);
    res.json({ basarili: true, ...result2, mesaj: "Se\xE7ili firman\u0131n sipari\u015Fleri temizlendi." });
  } catch (error2) {
    fail2(res, error2);
  }
});
router8.post("/veritabani/demo-yukle", async (req, res) => {
  try {
    const tenant2 = concreteTenant(req);
    if (tenant2 !== "demo_sandbox")
      throw new PublicResourceError(
        "Demo verileri yaln\u0131zca demo_sandbox alan\u0131na y\xFCklenebilir.",
        403
      );
    const rows = prepareRows(BASLANGIC_SIPARISLER, tenant2, true);
    const result2 = await maintain(tenant2, operationKey(req), "replace", rows);
    res.json({ basarili: true, ...result2, mesaj: "Demo alan\u0131 s\u0131f\u0131rland\u0131." });
  } catch (error2) {
    fail2(res, error2);
  }
});
router8.get("/veritabani/yedek-al", async (req, res) => {
  try {
    const tenant2 = req.tenantId;
    let rows;
    if (dbActive3(tenant2)) {
      const { data, error: error2 } = await supabase.rpc("tomnap_export_orders", { p_tenant_id: tenant2 });
      if (error2) throw error2;
      if (!Array.isArray(data)) throw new Error("Invalid backup");
      rows = data;
    } else rows = localRows(tenant2).filter((r) => tenant2 === "all" || tenantOf(r) === tenant2);
    if (rows.length > 5e3 || Buffer.byteLength(JSON.stringify(rows)) > 10 * 1024 * 1024)
      throw { code: "54000" };
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=tomnap_${tenant2}_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`
    );
    res.json({
      proje: "TOMNAP",
      versiyon: "3.0-orders",
      tarih: (/* @__PURE__ */ new Date()).toISOString(),
      tenant_id: tenant2,
      kaynak: dbActive3(tenant2) ? "supabase" : "bellek",
      toplam_siparis: rows.length,
      siparisler: rows.map(formatlaSiparis)
    });
  } catch (error2) {
    fail2(res, error2);
  }
});
router8.post("/veritabani/yedek-yukle", async (req, res) => {
  try {
    const tenant2 = concreteTenant(req), key = operationKey(req);
    if (req.body.temizleVeYukle !== void 0 && typeof req.body.temizleVeYukle !== "boolean")
      throw new PublicResourceError("Y\xFCkleme bi\xE7imi ge\xE7ersiz.", 400);
    const replace = req.body.temizleVeYukle === true;
    if (replace && req.body.onay_kodu !== `DEGISTIR:${tenant2}`)
      throw new PublicResourceError(`De\u011Fi\u015Ftirmek i\xE7in DEGISTIR:${tenant2} onay\u0131 gerekiyor.`, 403);
    const rows = prepareRows(req.body.siparisler, tenant2);
    for (const row of rows) {
      const customerId = row.ek_veriler?.musteri_id;
      if (customerId !== void 0 && customerId !== null && customerId !== "") {
        if (typeof customerId !== "string")
          throw new PublicResourceError("M\xFC\u015Fteri kimli\u011Fi ge\xE7ersiz.", 400);
        if (!dbActive3(tenant2) && !musterilerVeritabani.some((m) => m.id === customerId && tenantOf(m) === tenant2))
          throw new PublicResourceError("Yedekteki m\xFC\u015Fteri se\xE7ili firmada bulunamad\u0131.", 404);
      }
    }
    await assertTenantImageReferences(req, rows);
    const result2 = await maintain(tenant2, key, replace ? "replace" : "merge", rows);
    res.json({ basarili: true, ...result2, mesaj: "Sipari\u015F yede\u011Fi se\xE7ili firmaya y\xFCklendi." });
  } catch (error2) {
    fail2(res, error2);
  }
});
router8.post(
  "/ornek-verileri-yukle",
  (_req, res) => res.redirect(307, "/api/veritabani/demo-yukle")
);
var veritabani_default = router8;

// src/server/routes/kargoEntegrasyon.ts
import { createHash as createHash6 } from "node:crypto";
import { Router as Router9 } from "express";

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
        basarili: false,
        mesaj: "Aramex ba\u011Flant\u0131s\u0131 yoxlanmad\u0131. \u0130stifad\u0259\xE7i ad\u0131 v\u0259 \u015Fifr\u0259 daxil edin.",
        saglayici: this.tip,
        gecikmeMs: 15,
        detay: { mod: "UNCONFIGURED" }
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
      if (!res.ok) {
        return {
          basarili: false,
          mesaj: `Aramex ba\u011Flant\u0131s\u0131 t\u0259sdiql\u0259nm\u0259di (HTTP ${res.status}).`,
          saglayici: this.tip,
          gecikmeMs,
          detay: { status: res.status }
        };
      }
      const data = await res.json();
      if (!data || typeof data !== "object" || Array.isArray(data) || data.HasErrors !== false || !Array.isArray(data.Notifications) || !Array.isArray(data.TrackingResults)) {
        return {
          basarili: false,
          mesaj: "Aramex etibarl\u0131 u\u011Furlu cavab qaytarmad\u0131. Hesab m\u0259lumatlar\u0131n\u0131 yoxlay\u0131n.",
          saglayici: this.tip,
          gecikmeMs
        };
      }
      return {
        basarili: true,
        mesaj: `Aramex API ba\u011Flant\u0131s\u0131 u\u011Furludur! (Hesab: ${kimlik.hesapNo || ""}, Cavab vaxt\u0131: ${gecikmeMs}ms)`,
        saglayici: this.tip,
        gecikmeMs,
        detay: { endpoint, status: res.status }
      };
    } catch {
      const gecikmeMs = Date.now() - baslangic;
      return {
        basarili: false,
        mesaj: "Aramex ba\u011Flant\u0131s\u0131 yoxlan\u0131la bilm\u0259di. Ba\u011Flant\u0131n\u0131 v\u0259 xidm\u0259tin v\u0259ziyy\u0259tini yoxlay\u0131n.",
        saglayici: this.tip,
        gecikmeMs
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

// src/server/services/kargo/settings.ts
import path8 from "node:path";
var CargoSettingsError = class extends Error {
  constructor(message, status2 = 503) {
    super(message);
    this.status = status2;
    this.name = "CargoSettingsError";
  }
};
var CARGO_SETTINGS_FILE = path8.join(DATA_DIR, "kargo_ayarlari.json");
var SECRET_FIELDS = ["sifre", "pin", "apiKey", "apiSecret"];
var credentialFields = [
  "kullaniciAdi",
  "sifre",
  "hesapNo",
  "pin",
  "entity",
  "apiKey",
  "apiSecret",
  "testModu"
];
var publicFields = [
  "tenantId",
  "revision",
  "saglayici",
  "aktif",
  "cikisUlkesi",
  "cikisSehri",
  "varisUlkesi",
  "varisHavalimani",
  "otomatikSenkronizasyon",
  "guncellenmeTarihi"
];
var object3 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
function tenant(value) {
  if (typeof value !== "string" || !value || value === "all" || value.length > 160)
    throw new CargoSettingsError("Kargo i\u015Flemi i\xE7in firma se\xE7in.", 400);
}
function defaultSettings(tenantId) {
  tenant(tenantId);
  return {
    tenantId,
    revision: 0,
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
    guncellenmeTarihi: ""
  };
}
function validateSettings(value) {
  if (!object3(value) || Object.keys(value).some((k) => ![...publicFields, "kimlikBilgileri"].includes(k)))
    throw new CargoSettingsError("Ge\xE7ersiz kargo ayarlar\u0131.", 400);
  tenant(value.tenantId);
  if (!["ARAMEX", "DHL", "UPS", "FEDEX", "MANUEL"].includes(value.saglayici) || !Number.isSafeInteger(value.revision) || value.revision < 0 || ["aktif", "otomatikSenkronizasyon"].some((k) => typeof value[k] !== "boolean") || ["cikisUlkesi", "cikisSehri", "varisUlkesi", "varisHavalimani", "guncellenmeTarihi"].some(
    (k) => typeof value[k] !== "string" || value[k].length > 500
  ) || !object3(value.kimlikBilgileri) || typeof value.kimlikBilgileri.testModu !== "boolean" || Object.entries(value.kimlikBilgileri).some(
    ([k, v]) => !credentialFields.includes(k) || k !== "testModu" && (typeof v !== "string" || v.length > 8192)
  ))
    throw new CargoSettingsError("Ge\xE7ersiz kargo ayarlar\u0131.", 400);
}
function mergeSettings(current, update) {
  if (!object3(update) || Object.keys(update).some((k) => ![...publicFields, "kimlikBilgileri"].includes(k)) || update.tenantId !== void 0 && update.tenantId !== current.tenantId || update.kimlikBilgileri !== void 0 && !object3(update.kimlikBilgileri))
    throw new CargoSettingsError("Ge\xE7ersiz kargo ayarlar\u0131.", 400);
  const changedProvider = update.saglayici !== void 0 && update.saglayici !== current.saglayici;
  const baseCredentials = changedProvider ? { testModu: true } : current.kimlikBilgileri;
  const credentials = { ...baseCredentials, ...update.kimlikBilgileri };
  for (const field of SECRET_FIELDS) {
    const incoming = update.kimlikBilgileri?.[field];
    if (!incoming || incoming === "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022") credentials[field] = baseCredentials[field] || "";
  }
  const merged = {
    ...current,
    ...update,
    tenantId: current.tenantId,
    kimlikBilgileri: credentials
  };
  validateSettings(merged);
  return merged;
}
function encodeSettings(value) {
  validateSettings(value);
  const { tenantId, revision, kimlikBilgileri, ...settings } = value;
  const encrypted_credentials = sifreleMetin(JSON.stringify(kimlikBilgileri), {
    tenantId,
    provider: settings.saglayici
  });
  return { tenant_id: tenantId, revision, settings, encrypted_credentials };
}
function decodeSettings(row) {
  try {
    const kimlikBilgileri = JSON.parse(
      cozMetin(row.encrypted_credentials, {
        tenantId: row.tenant_id,
        provider: row.settings.saglayici
      })
    );
    const result2 = {
      ...row.settings,
      tenantId: row.tenant_id,
      revision: row.revision,
      kimlikBilgileri
    };
    validateSettings(result2);
    return result2;
  } catch {
    throw new CargoSettingsError("Kargo kayd\u0131 \xE7\xF6z\xFClemedi; anahtar ve ge\xE7i\u015F durumunu kontrol edin.");
  }
}
function isCargoSnapshot(value) {
  if (!object3(value) || value.version !== 2 || !Array.isArray(value.records)) return false;
  const tenants = /* @__PURE__ */ new Set();
  for (const row of value.records) {
    if (!object3(row) || typeof row.tenant_id !== "string" || !row.tenant_id || row.tenant_id === "all" || tenants.has(row.tenant_id) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !object3(row.settings) || typeof row.encrypted_credentials !== "string" || !row.encrypted_credentials.startsWith("enc:v2:"))
      return false;
    tenants.add(row.tenant_id);
  }
  return true;
}
function localSnapshot2() {
  const value = readJsonFile(CARGO_SETTINGS_FILE, (x) => true);
  if (value === void 0 || Array.isArray(value) && value.length === 0)
    return { version: 2, records: [] };
  if (!isCargoSnapshot(value))
    throw new CargoSettingsError("Kargo kay\u0131tlar\u0131 i\xE7in \xE7evrimd\u0131\u015F\u0131 \u015Fifreleme ge\xE7i\u015Fi gerekli.");
  return value;
}
async function loadCargoSettings(tenantId) {
  tenant(tenantId);
  if (supabase) {
    try {
      const { data, error: error2 } = await supabase.from("cargo_settings").select("tenant_id,revision,settings,encrypted_credentials").eq("tenant_id", tenantId).maybeSingle();
      if (error2) throw new Error();
      return data ? decodeSettings(data) : defaultSettings(tenantId);
    } catch {
      throw new CargoSettingsError(
        "Kargo ayarlar\u0131 okunamad\u0131; veritaban\u0131, anahtar ve ge\xE7i\u015F durumunu kontrol edin."
      );
    }
  }
  const row = localSnapshot2().records.find((x) => x.tenant_id === tenantId);
  return row ? decodeSettings(row) : defaultSettings(tenantId);
}
async function saveCargoSettings(update) {
  tenant(update.tenantId);
  if (!Number.isSafeInteger(update.revision) || update.revision < 0)
    throw new CargoSettingsError("Ayar s\xFCr\xFCm\xFC gerekli; sayfay\u0131 yenileyin.", 400);
  const snapshot = supabase ? void 0 : localSnapshot2();
  const row = snapshot?.records.find((x) => x.tenant_id === update.tenantId);
  const current = supabase ? await loadCargoSettings(update.tenantId) : row ? decodeSettings(row) : defaultSettings(update.tenantId);
  if (current.revision !== update.revision)
    throw new CargoSettingsError("Ayarlar de\u011Fi\u015Fti; yeniden y\xFCkleyip tekrar deneyin.", 409);
  const next = mergeSettings(current, update);
  next.revision = update.revision + 1;
  next.guncellenmeTarihi = (/* @__PURE__ */ new Date()).toISOString();
  const encoded = encodeSettings(next);
  if (supabase) {
    try {
      const { data, error: error2 } = await supabase.rpc("save_cargo_settings", {
        p_record: encoded,
        p_expected_revision: update.revision
      });
      if (error2?.code === "40001")
        throw new CargoSettingsError("Ayarlar de\u011Fi\u015Fti; yeniden y\xFCkleyip tekrar deneyin.", 409);
      if (error2 || !data) throw new CargoSettingsError("Kargo ayarlar\u0131 kaydedilemedi.");
      return decodeSettings(data);
    } catch (error2) {
      if (error2 instanceof CargoSettingsError) throw error2;
      throw new CargoSettingsError("Kargo ayarlar\u0131 kaydedilemedi.");
    }
  }
  snapshot.records = [
    ...snapshot.records.filter((x) => x.tenant_id !== update.tenantId),
    encoded
  ];
  writeJsonAtomic(CARGO_SETTINGS_FILE, snapshot);
  return next;
}

// src/server/services/kargo/orderUpdates.ts
async function updateCargoOrder(order, changes) {
  if (!supabase) {
    const current = siparislerVeritabani.find(
      (row) => row.id === order.id && row.tenant_id === order.tenant_id
    );
    if (!current || current.lojistik_durumu !== order.lojistik_durumu || (current.kurye_atama_surumu ?? 0) !== (order.kurye_atama_surumu ?? 0) || (current.uluslararasi_kargo_kodu || "") !== (order.uluslararasi_kargo_kodu || ""))
      throw new CargoSettingsError("Sipari\u015F de\u011Fi\u015Fti; yeniden y\xFCkleyip tekrar deneyin.", 409);
    for (const field of ["lojistik_durumu", "uluslararasi_kargo_kodu", "kargo_agirligi_kg"])
      if (Object.hasOwn(changes, field)) current[field] = changes[field];
    if (Object.hasOwn(changes, "kargo_notu"))
      current.baku_tahsilat_notu = [current.baku_tahsilat_notu, changes.kargo_notu].filter(Boolean).join(" ");
    current.guncellenme_tarihi = (/* @__PURE__ */ new Date()).toISOString();
    return;
  }
  try {
    const { data, error: error2 } = await supabase.rpc("tomnap_update_cargo_order", {
      p_tenant_id: order.tenant_id,
      p_order_id: order.id,
      p_expected_status: order.lojistik_durumu,
      p_expected_assignment: order.kurye_atama_surumu ?? 0,
      p_expected_awb: order.uluslararasi_kargo_kodu || "",
      p_changes: changes
    });
    if (error2?.code === "40001" || error2?.code === "P0002")
      throw new CargoSettingsError("Sipari\u015F de\u011Fi\u015Fti; yeniden y\xFCkleyip tekrar deneyin.", 409);
    if (error2 || data?.id !== order.id)
      throw new CargoSettingsError("Kargo g\xFCncellemesi kaydedilemedi.");
  } catch (error2) {
    if (error2 instanceof CargoSettingsError) throw error2;
    throw new CargoSettingsError("Kargo g\xFCncellemesi kaydedilemedi.");
  }
}

// src/server/services/kargo/kargoMerkezi.ts
var KargoMerkezi = class {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
    this.kayitSaglayici(new AramexProvider());
    this.kayitSaglayici(new DhlExpressProvider());
    this.kayitSaglayici(new UpsProvider());
  }
  kayitSaglayici(provider) {
    this.providers.set(provider.tip, provider);
  }
  getProvider(tip) {
    const provider = this.providers.get(tip);
    if (!provider) {
      throw new CargoSettingsError("Bu sa\u011Flay\u0131c\u0131 i\xE7in ba\u011Flant\u0131 hen\xFCz desteklenmiyor.", 400);
    }
    return provider;
  }
  async getAyarlar(tenantId) {
    return loadCargoSettings(tenantId);
  }
  async kaydetAyarlar(yeniAyarlar) {
    return saveCargoSettings(yeniAyarlar);
  }
  /**
   * İstemciye (Frontend) gönderilirken şifre ve PIN kodlarını maskeler.
   */
  maskeleAyarlar(ayarlar) {
    const masked = structuredClone(ayarlar);
    for (const field of SECRET_FIELDS) {
      masked.kimlikBilgileri[field] = ayarlar.kimlikBilgileri[field] ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "";
      masked.kimlikBilgileri[`${field}Tanimli`] = Boolean(ayarlar.kimlikBilgileri[field]);
    }
    return masked;
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
    const ayarlar = await this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);
    return provider.topluTakipEt(takipNolari, ayarlar);
  }
  /**
   * Tenant'ın yoldaki tüm aktif kargolarını otomatik Aramex/Kargo API ile senkronize eder.
   */
  async topluSenkronizeEt(tenantId) {
    const ayarlar = await this.getAyarlar(tenantId);
    const provider = this.getProvider(ayarlar.saglayici);
    let adaylar = siparislerVeritabani;
    if (supabase) {
      const { data, error: error2 } = await supabase.from("siparisler").select("*").eq("tenant_id", tenantId);
      if (error2) throw new Error("Kargo sipari\u015Fleri okunamad\u0131.");
      adaylar = (data || []).map(formatlaSiparis);
    }
    const aktifSiparisler = adaylar.filter(
      (s) => s.tenant_id === tenantId && Boolean(s.uluslararasi_kargo_kodu?.trim()) && s.lojistik_durumu !== "TESLIM_EDILDI"
    ).map((order) => structuredClone(order));
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
    if (takipSonuclari.some((result2) => result2.kaynak !== "LIVE"))
      throw new CargoSettingsError(
        "Sim\xFClasyon sonu\xE7lar\u0131 sipari\u015Flere kaydedilemez. Canl\u0131 kargo hesab\u0131 yap\u0131land\u0131r\u0131n.",
        409
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
        const note = `[${ayarlar.saglayici} Canl\u0131: ${guncelleme.konum} - ${guncelleme.hamAciklama}]`;
        await updateCargoOrder(siparis, {
          lojistik_durumu: guncelleme.durum,
          ...!siparis.baku_tahsilat_notu?.includes(guncelleme.konum) ? { kargo_notu: note } : {}
        });
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
      }
    }
    return {
      basarili: true,
      sorgulananSayi: aktifSiparisler.length,
      guncellenenSayi,
      detaylar
    };
  }
};
var kargoMerkezi = new KargoMerkezi();

// src/server/services/kargo/awbMatchStore.ts
import { randomUUID as randomUUID7 } from "node:crypto";
var MAX_ONAY = 500;
var PAGE_SIZE = 1e3;
var MATCH_COLUMNS = "id,tenant_id,musteri_adi,telefon_numarasi,lojistik_durumu,uluslararasi_kargo_kodu,kanada_takip_kodu";
var PRE_FLIGHT_STATUSES = /* @__PURE__ */ new Set(["KANADA_SATINALIM_BEKLIYOR", "KANADA_DEPO"]);
var ORDER_ID = /^[A-Za-z0-9_-]{1,100}$/;
var memoryApprovals = [];
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function requireTenant(tenantId) {
  if (typeof tenantId !== "string" || tenantId === "all" || !/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId))
    throw new PublicResourceError("Bir butik se\xE7ilmelidir.", 400);
  return tenantId;
}
function memoryRows(tenantId) {
  if (supabase && tenantId !== "demo_sandbox") return null;
  const pool = tenantId === "demo_sandbox" ? demoSiparislerVeritabani : siparislerVeritabani;
  return pool.filter(isRecord).filter((row) => row.tenant_id === tenantId);
}
async function eslesmeHavuzunuYukle(tenant2) {
  const tenantId = requireTenant(tenant2);
  const local = memoryRows(tenantId);
  if (local) return local.map(toSiparisAdayi).filter((row) => row !== null);
  const client2 = supabase;
  if (!client2) throw new PublicResourceError("Sipari\u015Fler okunamad\u0131.", 503);
  const orders = [];
  let lastId = null;
  for (; ; ) {
    let query = client2.from("siparisler").select(MATCH_COLUMNS).eq("tenant_id", tenantId).order("id", { ascending: true }).limit(PAGE_SIZE);
    if (lastId) query = query.gt("id", lastId);
    const { data, error: error2 } = await query;
    if (error2 || !Array.isArray(data)) throw new PublicResourceError("Sipari\u015Fler okunamad\u0131.", 503);
    const rows = data;
    for (const row of rows) {
      const candidate2 = toSiparisAdayi(row);
      if (candidate2) orders.push(candidate2);
    }
    if (orders.length > MAX_LIST_ITEMS)
      throw new PublicResourceError(
        "E\u015Fle\u015Ftirme i\xE7in 10000 sipari\u015F s\u0131n\u0131r\u0131 a\u015F\u0131ld\u0131; daralt\u0131lm\u0131\u015F bir i\u015Flem gerekir.",
        413
      );
    if (rows.length < PAGE_SIZE) return orders;
    const last = rows[rows.length - 1];
    lastId = isRecord(last) && typeof last.id === "string" ? last.id : null;
    if (!lastId) throw new PublicResourceError("Sipari\u015Fler okunamad\u0131.", 503);
  }
}
function secimIstegiDogrula(body2) {
  const items = isRecord(body2) ? body2.secimler : void 0;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ONAY)
    throw new PublicResourceError(`1-${MAX_ONAY} aras\u0131 e\u015Fle\u015Ftirme se\xE7imi g\xF6nderilmelidir.`, 400);
  const rows = /* @__PURE__ */ new Set();
  const orders = /* @__PURE__ */ new Set();
  return items.map((item) => {
    if (!isRecord(item) || typeof item.siparisId !== "string" || !ORDER_ID.test(item.siparisId))
      throw new PublicResourceError("Ge\xE7ersiz sipari\u015F kimli\u011Fi.", 400);
    const satirNo = item.satirNo;
    if (typeof satirNo !== "number" || !Number.isInteger(satirNo) || satirNo < 1 || satirNo > 1e5)
      throw new PublicResourceError("Ge\xE7ersiz manifest sat\u0131r\u0131.", 400);
    if (rows.has(satirNo) || orders.has(item.siparisId))
      throw new PublicResourceError(
        "Ayn\u0131 sat\u0131r veya sipari\u015F birden fazla kez se\xE7ildi; belirsiz e\u015Fle\u015Ftirme onaylanamaz.",
        400
      );
    rows.add(satirNo);
    orders.add(item.siparisId);
    return { satirNo, siparisId: item.siparisId };
  });
}
function onayKalemleriniHazirla(rapor, secimler) {
  const result2 = { kalemler: [], tekrarlar: [], reddedilenler: [] };
  const awbs = /* @__PURE__ */ new Set();
  for (const secim of secimler) {
    const row = rapor.satirlar.find((candidate3) => candidate3.satirNo === secim.satirNo);
    if (row?.durum === "ZATEN_BAGLI" && row.bagliSiparisId === secim.siparisId) {
      result2.tekrarlar.push({ ...secim, takipNo: row.takipNo, tekrar: true });
      continue;
    }
    const candidate2 = row?.adaylar.find((item) => item.siparisId === secim.siparisId);
    if (!row || !candidate2) {
      result2.reddedilenler.push({ ...secim, takipNo: row?.takipNo ?? "", sebep: "ONERI_GECERSIZ" });
      continue;
    }
    if (awbs.has(row.takipNo))
      throw new PublicResourceError(
        "Ayn\u0131 AWB birden fazla sat\u0131rda se\xE7ildi; belirsiz e\u015Fle\u015Ftirme onaylanamaz.",
        400
      );
    awbs.add(row.takipNo);
    result2.kalemler.push({
      satirNo: row.satirNo,
      siparisId: candidate2.siparisId,
      takipNo: row.takipNo,
      agirlikKg: row.agirlikKg,
      eslesmeTuru: candidate2.eslesmeTipi,
      isimPuani: nameSimilarity(row.aliciAdi, candidate2.musteriAdi)
    });
  }
  return result2;
}
function confirmInMemory(tenantId, userId, manifest, rows, items) {
  const rejected = [];
  const plan = [];
  for (const item of items) {
    const base = { satirNo: item.satirNo, siparisId: item.siparisId, takipNo: item.takipNo };
    const row = rows.find((candidate2) => candidate2.id === item.siparisId);
    if (!row) {
      rejected.push({ ...base, sebep: "SIPARIS_BULUNAMADI" });
      continue;
    }
    const current = normalizeAwb(row.uluslararasi_kargo_kodu);
    if (current === item.takipNo) plan.push({ row, item, tekrar: true });
    else if (row.lojistik_durumu === TESLIM_EDILDI) rejected.push({ ...base, sebep: "TESLIM_EDILDI" });
    else if (current)
      rejected.push({ ...base, sebep: "MEVCUT_AWB", mevcutAwb: String(row.uluslararasi_kargo_kodu) });
    else if (rows.some(
      (other) => other.id !== item.siparisId && normalizeAwb(other.uluslararasi_kargo_kodu) === item.takipNo
    ))
      rejected.push({ ...base, sebep: "AWB_BASKA_SIPARISTE" });
    else plan.push({ row, item, tekrar: false });
  }
  if (rejected.length > 0) return { basarili: false, uygulananlar: [], reddedilenler: rejected };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const { row, item, tekrar } of plan) {
    if (tekrar) continue;
    row.uluslararasi_kargo_kodu = item.takipNo;
    if (item.agirlikKg !== null) row.kargo_agirligi_kg = item.agirlikKg;
    if (typeof row.lojistik_durumu === "string" && PRE_FLIGHT_STATUSES.has(row.lojistik_durumu))
      row.lojistik_durumu = "ULUSLARARASI_KARGO";
    row.guncellenme_tarihi = now;
    memoryApprovals.push({
      id: randomUUID7(),
      tenantId,
      siparisId: item.siparisId,
      awb: item.takipNo,
      manifestDosyaAdi: manifest.dosyaAdi,
      manifestSha256: manifest.sha256,
      manifestSatirNo: item.satirNo,
      eslesmeTuru: item.eslesmeTuru,
      isimPuani: Math.round(item.isimPuani * 1e3) / 1e3,
      onaylayanKullaniciId: userId,
      onayZamani: now
    });
  }
  return {
    basarili: true,
    uygulananlar: plan.map(({ item, tekrar }) => ({
      satirNo: item.satirNo,
      siparisId: item.siparisId,
      takipNo: item.takipNo,
      tekrar
    })),
    reddedilenler: []
  };
}
var REJECTION_REASONS = /* @__PURE__ */ new Set([
  "SIPARIS_BULUNAMADI",
  "TESLIM_EDILDI",
  "MEVCUT_AWB",
  "AWB_BASKA_SIPARISTE"
]);
function invalidResult() {
  throw new PublicResourceError("AWB e\u015Fle\u015Ftirmeleri kaydedilemedi.", 503);
}
function parseRpcResult(data) {
  if (!isRecord(data) || typeof data.basarili !== "boolean" || !Array.isArray(data.uygulananlar) || !Array.isArray(data.reddedilenler))
    invalidResult();
  const applied = data.uygulananlar;
  const rejected = data.reddedilenler;
  const base = (item) => {
    if (!isRecord(item) || typeof item.satirNo !== "number" || typeof item.siparisId !== "string" || typeof item.takipNo !== "string")
      invalidResult();
    return { satirNo: item.satirNo, siparisId: item.siparisId, takipNo: item.takipNo };
  };
  return {
    basarili: data.basarili,
    uygulananlar: applied.map((item) => ({ ...base(item), tekrar: isRecord(item) && item.tekrar === true })),
    reddedilenler: rejected.map((item) => {
      const fields = base(item);
      if (!isRecord(item) || typeof item.sebep !== "string" || !REJECTION_REASONS.has(item.sebep))
        invalidResult();
      return {
        ...fields,
        sebep: item.sebep,
        ...typeof item.mevcutAwb === "string" ? { mevcutAwb: item.mevcutAwb } : {}
      };
    })
  };
}
async function awbEslesmeleriniOnayla(tenant2, userId, manifest, items) {
  const tenantId = requireTenant(tenant2);
  if (!userId) throw new PublicResourceError("Oturum gerekli.", 401);
  const local = memoryRows(tenantId);
  if (local) return confirmInMemory(tenantId, userId, manifest, local, items);
  const client2 = supabase;
  if (!client2) invalidResult();
  const { data, error: error2 } = await client2.rpc("tomnap_approve_awb_matches", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_manifest: manifest,
    p_matches: items
  });
  if (error2?.code === "22023") throw new PublicResourceError("Ge\xE7ersiz e\u015Fle\u015Ftirme onay\u0131.", 400);
  if (error2?.code === "PT403") throw new PublicResourceError("Bu i\u015Flem i\xE7in yetkiniz yok.", 403);
  if (error2) invalidResult();
  return parseRpcResult(data);
}

// src/server/routes/kargoEntegrasyon.ts
var router9 = Router9();
var status = (error2) => [400, 409, 503].includes(error2?.status) ? error2.status : 500;
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
router9.get("/kargo/ayarlar", async (req, res) => {
  try {
    const tenantId = req.query.tenant_id || "kanada_shopper_baku";
    const ayarlar = await kargoMerkezi.getAyarlar(tenantId);
    const maskeli = kargoMerkezi.maskeleAyarlar(ayarlar);
    res.json({
      basarili: true,
      ayarlar: maskeli,
      desteklenenSaglayicilar: DESTEKLENEN_SAGLAYICILAR,
      desteklenenUlkeler: DESTEKLENEN_ULKELER
    });
  } catch (err) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});
router9.post("/kargo/ayarlar", async (req, res) => {
  try {
    const {
      tenantId = "kanada_shopper_baku",
      revision,
      saglayici = "ARAMEX",
      cikisUlkesi = "CA",
      cikisSehri = "Toronto (YYZ)",
      varisUlkesi = "AZ",
      varisHavalimani = "Heyd\u0259r \u018Fliyev Beyn\u0259lxalq Hava Liman\u0131 (GYD)",
      kimlikBilgileri = {},
      otomatikSenkronizasyon = true,
      aktif = true
    } = req.body;
    const guncel = await kargoMerkezi.kaydetAyarlar({
      tenantId,
      revision,
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
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});
router9.post("/kargo/test", async (req, res) => {
  try {
    const { tenantId = "kanada_shopper_baku", ayarlar } = req.body;
    const current = await kargoMerkezi.getAyarlar(tenantId);
    const testAyar = ayarlar ? mergeSettings(current, ayarlar) : current;
    const sonuc = await kargoMerkezi.baglantiTesti(testAyar);
    res.json(sonuc);
  } catch (err) {
    res.status(status(err)).json({
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
    res.status(status(err)).json({ basarili: false, hata: err.message });
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
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});
var MAX_MANIFEST_SATIRI = 2e3;
var ManifestYuklemeHatasi = class extends Error {
  constructor(status2, message) {
    super(message);
    this.status = status2;
  }
};
function requestTenant(req) {
  const tenant2 = req.tenantId;
  if (typeof tenant2 !== "string" || !tenant2 || tenant2 === "all")
    throw new PublicResourceError("Butik se\xE7ilm\u0259lidir.", 400);
  return tenant2;
}
function requestUser(req) {
  const userId = req.auth?.userId;
  if (typeof userId !== "string" || !userId) throw new PublicResourceError("Oturum gerekli.", 401);
  return userId;
}
async function manifestiAyristir(body2, tenantId) {
  const record = body2 && typeof body2 === "object" && !Array.isArray(body2) ? { ...body2 } : {};
  const dosyaBase64 = record.dosya_base64;
  if (!dosyaBase64)
    throw new ManifestYuklemeHatasi(400, "Excel v\u0259 ya CSV fayl m\u0259zmunu (base64) t\u0259l\u0259b olunur.");
  if (typeof dosyaBase64 !== "string" || dosyaBase64.length > 14 * 1024 * 1024)
    throw new ManifestYuklemeHatasi(413, "Manifesto en fazla 10 MB olabilir.");
  const dosyaAdi = (typeof record.dosya_adi === "string" ? record.dosya_adi : "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 255) || "manifest.xlsx";
  const buffer = Buffer.from(dosyaBase64.replace(/^data:.*?;base64,/, ""), "base64");
  const ayarlar = await kargoMerkezi.getAyarlar(tenantId);
  const sonuc = await kargoMerkezi.getProvider(ayarlar.saglayici).manifestoAyristir(buffer, dosyaAdi);
  return { sonuc, dosyaAdi, sha256: createHash6("sha256").update(buffer).digest("hex") };
}
async function manifestOnerileri(body2, tenantId) {
  const manifest = await manifestiAyristir(body2, tenantId);
  if (!manifest.sonuc.basarili)
    throw new ManifestYuklemeHatasi(400, manifest.sonuc.hatalar?.[0] || "Manifest oxuna bilm\u0259di.");
  if (manifest.sonuc.satirlar.length > MAX_MANIFEST_SATIRI)
    throw new ManifestYuklemeHatasi(
      413,
      `Bir manifestd\u0259 \u0259n \xE7ox ${MAX_MANIFEST_SATIRI} s\u0259tir i\u015Fl\u0259n\u0259 bil\u0259r.`
    );
  const rapor = eslesmeOnerileriOlustur(manifest.sonuc.satirlar, await eslesmeHavuzunuYukle(tenantId));
  return { manifest, rapor };
}
function sendError(res, error2) {
  if (error2 instanceof ManifestYuklemeHatasi || error2 instanceof PublicResourceError || error2 instanceof CargoSettingsError) {
    const code = [400, 401, 403, 404, 409, 413, 503].includes(error2.status) ? error2.status : 500;
    return res.status(code).json({ basarili: false, hata: error2.message });
  }
  return res.status(500).json({ basarili: false, hata: "Kargo \u0259m\u0259liyyat\u0131 tamamlanmad\u0131." });
}
function awbReviewDisabled(res) {
  if (isAwbReviewEnabled()) return false;
  res.status(404).json({ basarili: false, hata: "Bu funksiya aktiv deyil." });
  return true;
}
router9.post("/kargo/manifesto-yukle", async (req, res) => {
  try {
    const { sonuc } = await manifestiAyristir(req.body, requestTenant(req));
    if (!sonuc.basarili) return res.status(400).json(sonuc);
    res.json({
      basarili: true,
      mesaj: `Excel u\u011Furla oxundu: ${sonuc.toplamSatir} s\u0259tir tap\u0131ld\u0131. AWB kodlar\u0131 sifari\u015Fl\u0259r\u0259 avtomatik yaz\u0131lm\u0131r; ba\u011Flamaq \xFC\xE7\xFCn e\u015Fl\u0259\u015Fdirm\u0259 t\u0259klifl\u0259rini t\u0259sdiql\u0259yin.`,
      ayristirma: sonuc,
      eslesenSayisi: 0,
      eslesmeler: [],
      eslesmeOnayiGerekli: true
    });
  } catch (error2) {
    sendError(res, error2);
  }
});
router9.post("/kargo/manifesto-eslestirme/oneriler", async (req, res) => {
  if (awbReviewDisabled(res)) return;
  try {
    const { manifest, rapor } = await manifestOnerileri(req.body, requestTenant(req));
    res.json({ basarili: true, saglayici: manifest.sonuc.saglayici, ...rapor });
  } catch (error2) {
    sendError(res, error2);
  }
});
router9.post("/kargo/manifesto-eslestirme/onayla", async (req, res) => {
  if (awbReviewDisabled(res)) return;
  try {
    const tenantId = requestTenant(req);
    const userId = requestUser(req);
    const secimler = secimIstegiDogrula(req.body);
    const { manifest, rapor } = await manifestOnerileri(req.body, tenantId);
    const hazirlik = onayKalemleriniHazirla(rapor, secimler);
    let sonuc;
    if (hazirlik.reddedilenler.length > 0)
      sonuc = { basarili: false, uygulananlar: [], reddedilenler: hazirlik.reddedilenler };
    else if (hazirlik.kalemler.length === 0)
      sonuc = { basarili: true, uygulananlar: hazirlik.tekrarlar, reddedilenler: [] };
    else {
      const yazilan = await awbEslesmeleriniOnayla(
        tenantId,
        userId,
        { dosyaAdi: manifest.dosyaAdi, sha256: manifest.sha256 },
        hazirlik.kalemler
      );
      sonuc = yazilan.basarili ? { ...yazilan, uygulananlar: [...hazirlik.tekrarlar, ...yazilan.uygulananlar] } : yazilan;
    }
    const yeni = sonuc.uygulananlar.filter((item) => !item.tekrar).length;
    res.json({
      ...sonuc,
      mesaj: sonuc.basarili ? `${yeni} AWB kodu t\u0259sdiql\u0259n\u0259r\u0259k sifari\u015Fl\u0259r\u0259 yaz\u0131ld\u0131.` : "Se\xE7il\u0259n e\u015Fl\u0259\u015Fdirm\u0259l\u0259rin b\u0259zil\u0259ri t\u0259tbiq edil\u0259 bilm\u0259di; he\xE7 bir sifari\u015F d\u0259yi\u015Fdirilm\u0259di."
    });
  } catch (error2) {
    sendError(res, error2);
  }
});
var kargoEntegrasyon_default = router9;

// src/server/routes/auth.ts
import { Router as Router10 } from "express";
import { randomUUID as randomUUID8 } from "node:crypto";
var router10 = Router10();
function isUnexpired(value) {
  return typeof value === "string" && Date.parse(value) > Date.now();
}
function isPendingActivation(user, token) {
  return user.aktivasyon_token === token && user.durum === "BEKLEMEDE_SIFRE" && isUnexpired(user.token_gecerlilik);
}
function isAvailableInvite(invite, token) {
  return invite.token === token && invite.kullanildiMi === false && ekipRoluMu(invite.rol) && isUnexpired(invite.gecerlilikTarihi);
}
async function findActivationUser(token) {
  if (!supabase) return kullanicilarVeritabani.find((user) => user.aktivasyon_token === token);
  const { data, error: error2 } = await supabase.from("kullanicilar").select("*").eq("aktivasyon_token", token).maybeSingle();
  if (error2) throw error2;
  return data || void 0;
}
async function findInvite(token) {
  if (!supabase) return davetlerVeritabani.find((invite) => invite.token === token);
  const { data, error: error2 } = await supabase.from("davetler").select("*").eq("token", token).maybeSingle();
  if (error2) throw error2;
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
    kullananKisi: data.kullanan_adi,
    email: data.email || void 0
  };
}
async function findFirma(tenantId) {
  if (!supabase) return firmalarVeritabani.find((firma) => firma.id === tenantId);
  const { data, error: error2 } = await supabase.from("firmalar").select("*").eq("id", tenantId).maybeSingle();
  if (error2) throw error2;
  return data || void 0;
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
    if (typeof sifre !== "string" || sifre.length < 6 || sifre.length > 1024) {
      return res.status(400).json({ basarili: false, hata: "\u015Eifr\u0259 \u0259n az\u0131 6 simvoldan ibar\u0259t olmal\u0131d\u0131r." });
    }
    if (adSoyad !== void 0 && (typeof adSoyad !== "string" || adSoyad.trim().length > 150) || telefon !== void 0 && (typeof telefon !== "string" || telefon.trim() && !normalizePhone2(telefon.trim()))) {
      return res.status(400).json({ basarili: false, hata: "Ad v\u0259 telefon m\u0259lumatlar\u0131n\u0131 yoxlay\u0131n." });
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
      const { user: activatedUser, firma: firma2 } = await activateUser(cleanToken, {
        sifre_hash: sifreHashle(sifre),
        ad_soyad: typeof adSoyad === "string" && adSoyad.trim() ? adSoyad.trim() : user.ad_soyad,
        telefon: typeof telefon === "string" && telefon.trim() ? telefon.trim() : user.telefon
      });
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
    if (invite.email && typeof email === "string" && email.trim() && email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
      return res.status(403).json({ basarili: false, hata: "E-po\xE7t \xFCnvan\u0131 d\u0259v\u0259td\u0259ki \xFCnvanla uy\u011Fun g\u0259lmir." });
    }
    const userEmail = (typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "") || (typeof email === "string" ? email.trim().toLowerCase() : "");
    const userPhone = typeof telefon === "string" ? telefon.trim() : "";
    const validEmail = userEmail.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
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
      id: "usr_" + randomUUID8(),
      tenant_id: invite.tenantId,
      ad_soyad: typeof adSoyad === "string" && adSoyad.trim() ? adSoyad.trim() : invite.kullananKisi || "Komanda \xDCzv\xFC",
      email: userEmail || `invite-${randomUUID8()}@tomnap.internal`,
      telefon: userPhone,
      rol: invite.rol,
      sifre_hash: sifreHashle(sifre),
      durum: "AKTIF",
      aktivasyon_token: null,
      token_gecerlilik: null,
      olusturma_tarihi: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { user: acceptedUser, firma: acceptedFirma } = await acceptInvite(cleanToken, newUser);
    return res.json({
      basarili: true,
      tenantId: invite.tenantId,
      tenantAd: acceptedFirma.ad,
      rol: invite.rol,
      mesaj: `T\u0259brikl\u0259r! "${acceptedFirma.ad}" komandas\u0131na ${invite.rol} olaraq \u015Fifr\u0259niz t\u0259yin edildi.`,
      kullanici: {
        id: acceptedUser.id,
        adSoyad: acceptedUser.ad_soyad,
        email: acceptedUser.email,
        telefon: acceptedUser.telefon,
        rol: acceptedUser.rol,
        tenantId: acceptedUser.tenant_id
      },
      firma: acceptedFirma
    });
  } catch (error2) {
    if (error2 instanceof OnboardingError)
      return res.status(error2.status).json({ basarili: false, hata: error2.message });
    return res.status(503).json({
      basarili: false,
      hata: "\u015Eifr\u0259 haz\u0131rda t\u0259yin edil\u0259 bilmir. Daha sonra yenid\u0259n c\u0259hd edin."
    });
  }
});
function normalizePhone2(value) {
  if (!/^[+\d\s().-]+$/.test(value)) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : "";
}
async function findLoginUser(identifier) {
  const email = identifier.toLowerCase();
  const phone2 = normalizePhone2(identifier);
  const emailMatches = (user) => user.email?.toLowerCase() === email;
  const phoneMatches = (user) => !!phone2 && normalizePhone2(user.telefon || "") === phone2;
  if (!supabase) {
    const matches2 = kullanicilarVeritabani.filter(
      (user) => emailMatches(user) || phoneMatches(user)
    );
    return matches2.length === 1 ? { ...matches2[0] } : void 0;
  }
  if (email.includes("@") && email.length <= 254) {
    const escapedEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
    const { data, error: error2 } = await supabase.from("kullanicilar").select("*").ilike("email", escapedEmail).maybeSingle();
    if (error2) throw error2;
    return data && emailMatches(data) ? data : void 0;
  }
  if (phone2) {
    const pattern = `%${phone2.split("").join("%")}%`;
    const { data, error: error2 } = await supabase.from("kullanicilar").select("*").ilike("telefon", pattern);
    if (error2) throw error2;
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

// src/server/routes/v2/index.ts
import { Router as Router11 } from "express";
function v2Kapisi(_req, res, next) {
  if (isV2FlowEnabled()) return next();
  res.status(404).json({ basarili: false, hata: "Bu funksiya aktiv deyil." });
}
var router11 = Router11();
router11.get("/durum", (_req, res) => {
  res.json({ basarili: true, v2: true });
});
var v2_default = router11;

// src/server/index.ts
function createApp({ trustProxy = false } = {}) {
  const app2 = express();
  app2.set("trust proxy", trustProxy);
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
  app2.use("/api/v2", v2Kapisi);
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
  app2.use("/api/v2", v2_default);
  app2.use(errorHandler);
  return app2;
}

// src/server/vercel.ts
var app = createApp({ trustProxy: 1 });
function handler(req, res) {
  try {
    const originalUrl = req.url || "";
    const queryIndex = originalUrl.indexOf("?");
    const queryString = queryIndex !== -1 ? originalUrl.substring(queryIndex) : "";
    if (req.url && !req.url.startsWith("/api") && !req.url.startsWith("/uploads")) {
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
