import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Plane,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  Upload,
} from 'lucide-react';

interface Props {
  butik: string;
  onSiparislereDon?: () => void;
  onSenkronize: () => void;
  onDispatchSec: () => void;
  onExcel: () => void;
  onPdf: () => void;
  onYazdir: () => void;
  onEtiketler: () => void;
  onAyarlar: () => void;
  senkronize: boolean;
  dispatchYukleniyor: boolean;
  excelHazirlaniyor: boolean;
  pdfHazirlaniyor: boolean;
  yazdiriliyor: boolean;
}

const DUGME =
  'px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap disabled:opacity-60';

/**
 * Manifesto üst bölümü (B1, Deploy 3): başlık ve eylemler alt alta. Eskiden yan yana dizilip
 * düğme grubu küçülmüyordu (shrink-0): başlık dar bir sütuna sıkışıyor, Safari'de son
 * düğme kesiliyordu. Şimdi başlık bütün genişliği alır, düğmeler satır kırarak sığar.
 */
export function ManifestoBasligi(p: Props) {
  const { t } = useTranslation('kargo');
  return (
    <section
      aria-labelledby="manifesto-baslik"
      data-testid="manifesto-ust"
      className="bg-slate-900 p-6 rounded-2xl text-white shadow-md flex flex-col gap-4"
    >
      <div className="flex items-start gap-4 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <Plane className="w-6 h-6 rtl:-scale-x-100" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2
              id="manifesto-baslik"
              className="font-extrabold text-xl text-white tracking-tight break-words"
            >
              {t('baslik.ad')}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              {t('baslik.etiket')}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-100 mt-1 break-words [overflow-wrap:anywhere]">
            {t('baslik.butik', { butik: p.butik })}
          </p>
          <p className="text-xs text-slate-300 mt-1">{t('baslik.aciklama')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5" data-testid="manifesto-eylemler">
        {p.onSiparislereDon && (
          <button
            type="button"
            onClick={p.onSiparislereDon}
            className={`${DUGME} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{t('eylem.siparislereDon')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={p.onSenkronize}
          disabled={p.senkronize}
          title={t('eylem.aramexIpucu')}
          className={`${DUGME} bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white ring-1 ring-blue-400/40`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${p.senkronize ? 'animate-spin' : ''}`} />
          <span>{p.senkronize ? t('eylem.sinxronlanir') : t('eylem.aramex')}</span>
        </button>
        <button
          type="button"
          onClick={p.onDispatchSec}
          disabled={p.dispatchYukleniyor}
          title={t('eylem.dispatchIpucu')}
          className={`${DUGME} bg-amber-500 hover:bg-amber-400 text-slate-950`}
        >
          <Upload className={`w-3.5 h-3.5 ${p.dispatchYukleniyor ? 'animate-bounce' : ''}`} />
          <span>{p.dispatchYukleniyor ? t('eylem.oxunur') : t('eylem.dispatch')}</span>
        </button>
        <button
          type="button"
          onClick={p.onExcel}
          disabled={p.excelHazirlaniyor}
          className={`${DUGME} bg-emerald-600 hover:bg-emerald-500 text-white`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{p.excelHazirlaniyor ? t('eylem.hazirlanir') : t('eylem.excel')}</span>
        </button>
        <button
          type="button"
          onClick={p.onPdf}
          disabled={p.pdfHazirlaniyor}
          className={`${DUGME} bg-rose-600 hover:bg-rose-500 text-white`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{p.pdfHazirlaniyor ? t('eylem.hazirlanir') : t('eylem.pdf')}</span>
        </button>
        <button
          type="button"
          onClick={p.onYazdir}
          disabled={p.yazdiriliyor}
          className={`${DUGME} bg-slate-800 hover:bg-slate-700 text-white border border-slate-700`}
        >
          <Printer className="w-3.5 h-3.5" />
          <span>{t('eylem.capEt')}</span>
        </button>
        <button
          type="button"
          onClick={p.onEtiketler}
          disabled={p.yazdiriliyor}
          className={`${DUGME} bg-indigo-600 hover:bg-indigo-500 text-white`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>{t('eylem.etiketler')}</span>
        </button>
        <button
          type="button"
          onClick={p.onAyarlar}
          title={t('eylem.ayarlar')}
          aria-label={t('eylem.ayarlar')}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer border border-slate-700"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}
