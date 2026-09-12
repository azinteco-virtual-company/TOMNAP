import React, { useState } from 'react';
import { 
  SUPABASE_SQL_KODU, 
  GEMINI_SYSTEM_INSTRUCTION, 
  GEMINI_JSON_SCHEMA, 
  NEXTJS_API_ROUTE_KODU, 
  NEXTJS_DASHBOARD_PAGE_KODU 
} from '../data/kod-sablonlari';
import {
  HIZLI_BASLANGIC_KILAVUZU,
  TETIKLEYICI_KODLAR_REHBERI,
  WEBHOOK_API_KODU,
  OPERASYON_ROL_REHBERI
} from '../data/kurulum-kilavuzu';
import { 
  Copy, 
  Check, 
  Database, 
  Sparkles, 
  Server, 
  Layout, 
  Layers,
  BookOpen,
  MessageSquareCode,
  Users,
  KeyRound,
  Terminal,
  FileCode,
  ShieldCheck,
  Zap
} from 'lucide-react';

export type KodSekmesiTuru = 
  | 'kurulum'
  | 'tetikleyici'
  | 'supabase' 
  | 'gemini' 
  | 'nextjs-api' 
  | 'operasyon';

interface MimariVeKodPaneliProps {
  seciliAltSekme?: string;
  onAltSekmeDegistir?: (sekme: any) => void;
}

export const MimariVeKodPaneli: React.FC<MimariVeKodPaneliProps> = ({
  seciliAltSekme,
  onAltSekmeDegistir,
}) => {
  const [yerelAltSekme, setYerelAltSekme] = useState<KodSekmesiTuru>('kurulum');

  const aktifAltSekme: KodSekmesiTuru = (seciliAltSekme as KodSekmesiTuru) || yerelAltSekme;
  const setAktifAltSekme = onAltSekmeDegistir || setYerelAltSekme;

  const [kopyalananAlan, setKopyalananAlan] = useState<string | null>(null);

  const kopyala = (metin: string, alanAdi: string) => {
    navigator.clipboard.writeText(metin);
    setKopyalananAlan(alanAdi);
    setTimeout(() => {
      setKopyalananAlan(null);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Üst Bilgilendirme Bannerı */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-4 h-4" />
              Sistem Mimarisi & Devir / Kurulum Kılavuzu
            </div>
            <h2 className="text-xl font-extrabold mt-1 text-white tracking-tight">
              Kanada ➔ Bakü E-Ticaret Altyapı & Devir Dokümantasyonu
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Bu bölüm, sistemi yarın başka birine devrettiğinizde veya yeni bir sunucuya taşımak istediğinizde ihtiyaç duyulacak tüm API kurulum talimatlarını, tetikleyici kod rehberlerini, SQL şemalarını ve operasyonel görev dağılımını içerir.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-3 py-1 bg-amber-950/60 border border-amber-600/40 rounded-lg text-xs text-amber-300 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Hazır Devir Paketi
            </span>
          </div>
        </div>

        {/* Alt Sekmeler (Navigasyon) */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            id="btn-sekme-kurulum"
            onClick={() => setAktifAltSekme('kurulum')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'kurulum'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            1. Hızlı Başlangıç & API Kurulumu
          </button>

          <button
            id="btn-sekme-tetikleyici"
            onClick={() => setAktifAltSekme('tetikleyici')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'tetikleyici'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquareCode className="w-3.5 h-3.5" />
            2. Tetikleyici Kodlar & Webhook
          </button>

          <button
            id="btn-sekme-supabase"
            onClick={() => setAktifAltSekme('supabase')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'supabase'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            3. Supabase SQL Şeması
          </button>

          <button
            id="btn-sekme-gemini"
            onClick={() => setAktifAltSekme('gemini')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'gemini'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            4. Google AI Studio Yapılandırması
          </button>

          <button
            id="btn-sekme-nextapi"
            onClick={() => setAktifAltSekme('nextjs-api')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'nextjs-api'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            5. Next.js API & Webhook Kodu
          </button>

          <button
            id="btn-sekme-operasyon"
            onClick={() => setAktifAltSekme('operasyon')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              aktifAltSekme === 'operasyon'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            6. Kanada ➔ Bakü Operasyon & Roller
          </button>
        </div>
      </div>

      {/* 1. SEKME: HIZLI BAŞLANGIÇ & API KURULUM KILAVUZU */}
      {aktifAltSekme === 'kurulum' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                1. API Bağlama ve Kurulum Rehberi (Google Gemini & Supabase)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Yeni bir geliştirici veya işletme ortağı için adım adım API anahtarı alma ve .env ayarlama kılavuzu.
              </p>
            </div>
            <button
              onClick={() => kopyala(HIZLI_BASLANGIC_KILAVUZU, 'kurulum')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              {kopyalananAlan === 'kurulum' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Kılavuz Kopyalandı!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Kılavuzu Kopyala
                </>
              )}
            </button>
          </div>

          <div className="p-6 bg-slate-950 text-emerald-300 overflow-x-auto text-xs font-mono max-h-[580px] leading-relaxed select-all">
            <pre className="whitespace-pre-wrap">{HIZLI_BASLANGIC_KILAVUZU}</pre>
          </div>
        </div>
      )}

      {/* 2. SEKME: TETİKLEYİCİ KODLAR & WEBHOOK REHBERİ */}
      {aktifAltSekme === 'tetikleyici' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquareCode className="w-4 h-4 text-amber-600" />
                2. Instagram DM / WhatsApp Tetikleyici Kodları (#SİPARİŞ, #ONAY, #KNB)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sohbet esnasında hangi kodun ne işe yaradığı, Webhook URL formatı ve kontrol mekanizması.
              </p>
            </div>
            <button
              onClick={() => kopyala(TETIKLEYICI_KODLAR_REHBERI, 'tetikleyici')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              {kopyalananAlan === 'tetikleyici' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Rehberi Kopyala
                </>
              )}
            </button>
          </div>

          <div className="p-6 bg-slate-950 text-amber-200 overflow-x-auto text-xs font-mono max-h-[580px] leading-relaxed select-all">
            <pre className="whitespace-pre-wrap">{TETIKLEYICI_KODLAR_REHBERI}</pre>
          </div>
        </div>
      )}

      {/* 3. SEKME: SUPABASE SQL ŞEMASI */}
      {aktifAltSekme === 'supabase' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                3. Supabase SQL Şeması (PostgreSQL - siparisler tablosu)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Türkçe enumlar, GENERATED COLUMN kalan_tutar, JSONB eksik bilgiler ve RLS güvenlik kuralları.
              </p>
            </div>
            <button
              id="btn-kopyala-sql"
              onClick={() => kopyala(SUPABASE_SQL_KODU, 'sql')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              {kopyalananAlan === 'sql' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> SQL Kopyalandı!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> SQL Kodunu Kopyala
                </>
              )}
            </button>
          </div>

          <div className="p-6 bg-slate-950 text-slate-200 overflow-x-auto text-xs font-mono max-h-[580px] leading-relaxed">
            <pre>{SUPABASE_SQL_KODU}</pre>
          </div>
        </div>
      )}

      {/* 4. SEKME: GOOGLE AI STUDIO YAPILANDIRMASI */}
      {aktifAltSekme === 'gemini' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Google AI Studio - Türkçe Sistem Talimatı (System Instruction)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI Studio arayüzündeki "System Instructions" alanına yapıştırılacak Türkçe kural seti.
                </p>
              </div>
              <button
                onClick={() => kopyala(GEMINI_SYSTEM_INSTRUCTION, 'system_instruction')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                {kopyalananAlan === 'system_instruction' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Talimatı Kopyala
                  </>
                )}
              </button>
            </div>

            <div className="p-6 bg-slate-950 text-slate-200 overflow-x-auto text-xs font-mono max-h-[380px] leading-relaxed">
              <pre className="whitespace-pre-wrap">{GEMINI_SYSTEM_INSTRUCTION}</pre>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-amber-600" />
                  Google AI Studio - Yapılandırılmış JSON Şeması (Structured Output)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gemini API responseSchema alanına birebir atanacak JSON Schema nesnesi.
                </p>
              </div>
              <button
                onClick={() => kopyala(JSON.stringify(GEMINI_JSON_SCHEMA, null, 2), 'json_schema')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                {kopyalananAlan === 'json_schema' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Şemayı Kopyala
                  </>
                )}
              </button>
            </div>

            <div className="p-6 bg-slate-950 text-slate-200 overflow-x-auto text-xs font-mono max-h-[380px] leading-relaxed">
              <pre>{JSON.stringify(GEMINI_JSON_SCHEMA, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* 5. SEKME: NEXT.JS API & WEBHOOK ROTALARI */}
      {aktifAltSekme === 'nextjs-api' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-600" />
                  5.1 Next.js Webhook Uç Noktası (app/api/webhook/siparis/route.ts)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Instagram DM veya WhatsApp mesajlarını yakalayan ve Onay Havuzuna aktaran Webhook kodu.
                </p>
              </div>
              <button
                onClick={() => kopyala(WEBHOOK_API_KODU, 'webhook_api')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                {kopyalananAlan === 'webhook_api' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Webhook Kodunu Kopyala
                  </>
                )}
              </button>
            </div>

            <div className="p-6 bg-slate-950 text-slate-200 overflow-x-auto text-xs font-mono max-h-[480px] leading-relaxed">
              <pre>{WEBHOOK_API_KODU}</pre>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  5.2 Next.js Sipariş Ayrıştırma API Rotası (app/api/siparis-ayristir/route.ts)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ham mesajı doğrudan ayrıştırıp Supabase'e kaydeden ana sunucu rotası.
                </p>
              </div>
              <button
                onClick={() => kopyala(NEXTJS_API_ROUTE_KODU, 'nextjs_api')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                {kopyalananAlan === 'nextjs_api' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> API Kodunu Kopyala
                  </>
                )}
              </button>
            </div>

            <div className="p-6 bg-slate-950 text-slate-200 overflow-x-auto text-xs font-mono max-h-[480px] leading-relaxed">
              <pre>{NEXTJS_API_ROUTE_KODU}</pre>
            </div>
          </div>
        </div>
      )}

      {/* 6. SEKME: KANADA ➔ BAKÜ OPERASYON VE ROL DAĞILIMI */}
      {aktifAltSekme === 'operasyon' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-emerald-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                6. Kanada ➔ Bakü Operasyonel Görev Paylaşımı & Devir Kılavuzu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kanada'daki yönetici ile Bakü'deki akraba/arkadaş arasındaki iş akış adımları ve kasa kontrolü.
              </p>
            </div>
            <button
              onClick={() => kopyala(OPERASYON_ROL_REHBERI, 'operasyon')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              {kopyalananAlan === 'operasyon' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Kopyalandı!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Görev Rehberini Kopyala
                </>
              )}
            </button>
          </div>

          <div className="p-6 bg-slate-950 text-emerald-200 overflow-x-auto text-xs font-mono max-h-[580px] leading-relaxed select-all">
            <pre className="whitespace-pre-wrap">{OPERASYON_ROL_REHBERI}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
