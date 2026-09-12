import React from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Truck,
  FileSpreadsheet,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { TarihAralikTipi, GorunumSekmesi, QrupModu } from './types';

export interface FinansToolbarProps {
  aralikBasligi: string;
  trendKarsilastirma: string;
  gorunumSekmesi: GorunumSekmesi;
  setGorunumSekmesi: (sekme: GorunumSekmesi) => void;
  tarihAraligi: TarihAralikTipi;
  setTarihAraligi: (aralik: TarihAralikTipi) => void;
  qrupModu: QrupModu;
  setQrupModu: (mod: QrupModu) => void;
  ozelBaslangic: string;
  setOzelBaslangic: (tarih: string) => void;
  ozelBitis: string;
  setOzelBitis: (tarih: string) => void;
  aralikToplamSiparis: number;
  aralikLojistikBasari: number;
  aralikToplamCiro: number;
  aralikTahminiNetKar: number;
}

export const FinansToolbar: React.FC<FinansToolbarProps> = ({
  aralikBasligi,
  trendKarsilastirma,
  gorunumSekmesi,
  setGorunumSekmesi,
  tarihAraligi,
  setTarihAraligi,
  qrupModu,
  setQrupModu,
  ozelBaslangic,
  setOzelBaslangic,
  ozelBitis,
  setOzelBitis,
  aralikToplamSiparis,
  aralikLojistikBasari,
  aralikToplamCiro,
  aralikTahminiNetKar,
}) => {
  return (
    <>
      {/* Üst Başlık & Görünüş Rejimləri */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">
                {aralikBasligi} Maliyyə & Lojistik Analitikası
              </h3>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                {trendKarsilastirma} dalğalanma
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              90 günlük və 1 illik Kanada alışları, təhvil dinamikası, uçuş karqosu və xalis mənfəət cədvəli
            </p>
          </div>
        </div>

        {/* Görünüş Rejimi Sekmeleri */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setGorunumSekmesi('trend')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                gorunumSekmesi === 'trend'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span>Sifariş Trendi</span>
            </button>
            <button
              type="button"
              onClick={() => setGorunumSekmesi('maliye')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                gorunumSekmesi === 'maliye'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mənfəət & Xərclər</span>
            </button>
            <button
              type="button"
              onClick={() => setGorunumSekmesi('lojistik')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                gorunumSekmesi === 'lojistik'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-sky-600" />
              <span>Lojistik İcra</span>
            </button>
            <button
              type="button"
              onClick={() => setGorunumSekmesi('cedvel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                gorunumSekmesi === 'cedvel'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
              <span>Maliyyə Cədvəli</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alt Filtr və Zaman İdarəetmə Barı */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Zaman Aralığı Butonları */}
        <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200">
          <button
            type="button"
            onClick={() => setTarihAraligi('7gun')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              tarihAraligi === '7gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            7G
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('14gun')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              tarihAraligi === '14gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            14G
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('30gun')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              tarihAraligi === '30gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            30 Gün
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('90gun')}
            className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
              tarihAraligi === '90gun' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-700 hover:text-indigo-900'
            }`}
          >
            <span>90 Gün</span>
            <span className="text-[9px] bg-indigo-500 text-indigo-100 px-1 py-0.2 rounded font-mono">KV</span>
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('1yil')}
            className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
              tarihAraligi === '1yil' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-700 hover:text-indigo-900'
            }`}
          >
            <span>1 İl</span>
            <span className="text-[9px] bg-indigo-500 text-indigo-100 px-1 py-0.2 rounded font-mono">365G</span>
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('hepsi')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              tarihAraligi === 'hepsi' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hamısı
          </button>
          <button
            type="button"
            onClick={() => setTarihAraligi('ozel')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              tarihAraligi === 'ozel' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3 h-3" />
            <span>Özəl</span>
          </button>
        </div>

        {/* Qruplaşma Seçicisi */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px] font-medium hidden sm:inline-block">Bölünmə:</span>
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setQrupModu('otomatik')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                qrupModu === 'otomatik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ağıllı
            </button>
            <button
              type="button"
              onClick={() => setQrupModu('gunluk')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                qrupModu === 'gunluk' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Günlük
            </button>
            <button
              type="button"
              onClick={() => setQrupModu('haftalik')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                qrupModu === 'haftalik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Həftəlik
            </button>
            <button
              type="button"
              onClick={() => setQrupModu('aylik')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                qrupModu === 'aylik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Aylıq
            </button>
          </div>
        </div>
      </div>

      {/* Özel Tarih Seçici Açılır Panel */}
      {tarihAraligi === 'ozel' && (
        <div className="mt-3 p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-indigo-900 font-semibold">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Dəqiq Tarix Aralığı Seçin:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Başlanğıc:</span>
              <input
                type="date"
                value={ozelBaslangic}
                onChange={(e) => setOzelBaslangic(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
              />
            </div>

            <span className="text-indigo-400 font-bold">➔</span>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Bitiş:</span>
              <input
                type="date"
                value={ozelBitis}
                onChange={(e) => setOzelBitis(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Seçili Aralığa Duyarlı 4 Mini KPI Şeridi */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5">
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-tight flex items-center justify-between">
            <span>{aralikBasligi} Sifariş</span>
            <Package className="w-3 h-3 text-indigo-500" />
          </span>
          <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
            {aralikToplamSiparis} <span className="text-xs font-normal text-slate-500">bağlama</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80">
          <span className="text-[10px] text-emerald-800 font-semibold block uppercase tracking-tight flex items-center justify-between">
            <span>Dövr Lojistik Uğur</span>
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
          </span>
          <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">
            %{aralikLojistikBasari} <span className="text-xs font-normal text-emerald-600">təhvil / yolda</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-tight flex items-center justify-between">
            <span>Dövr Dövriyyəsi</span>
            <span className="text-[10px] text-indigo-600 font-bold">AZN</span>
          </span>
          <span className="text-base font-extrabold text-indigo-700 mt-0.5 block">
            {aralikToplamCiro.toFixed(0)} <span className="text-xs font-normal text-indigo-500">₼</span>
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-200/80">
          <span className="text-[10px] text-purple-800 font-semibold block uppercase tracking-tight flex items-center justify-between">
            <span>Dövr Xalis Mənfəət</span>
            <Sparkles className="w-3 h-3 text-purple-600" />
          </span>
          <span className="text-base font-extrabold text-purple-700 mt-0.5 block">
            {aralikTahminiNetKar.toFixed(0)} <span className="text-xs font-normal text-purple-500">₼</span>
          </span>
        </div>
      </div>
    </>
  );
};
