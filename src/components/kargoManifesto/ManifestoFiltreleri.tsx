import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Check,
  Copy,
  DollarSign,
  Filter,
  Layers,
  Package,
  RotateCcw,
  Search,
} from 'lucide-react';
import type { Siparis } from '../../types';
import { sayi } from '../../i18n/bicim';
import type { ManifestoOzeti } from '../../belgeler/manifesto';
import {
  YOLDAKI_ASAMALAR,
  filtreAktif,
  type LojistikFiltreTipi,
  type ManifestoFiltresi,
  type TarihOnAyari,
} from './manifestoFiltresi';

/** Dört özet kartı. */
export function ManifestoIstatistikleri({ ozet }: { ozet: ManifestoOzeti }) {
  const { t } = useTranslation('kargo');
  const kart =
    'bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 min-w-0';
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className={kart}>
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{t('istatistik.bagla')}</div>
          <div className="text-xl font-extrabold text-slate-900">
            {ozet.bagla}{' '}
            <span className="text-xs font-normal text-slate-500">
              {t('istatistik.paketBirimi', { count: ozet.bagla })}
            </span>
          </div>
        </div>
      </div>
      <div className={kart}>
        <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{t('istatistik.mehsul')}</div>
          <div className="text-xl font-extrabold text-slate-900">
            {ozet.adet}{' '}
            <span className="text-xs font-normal text-slate-500">
              {t('istatistik.ededBirimi', { count: ozet.adet })}
            </span>
          </div>
        </div>
      </div>
      <div className={kart}>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{t('istatistik.deger')}</div>
          <div className="text-xl font-extrabold text-slate-900">
            {sayi(ozet.deger)} <span className="text-xs font-normal text-slate-500">AZN</span>
          </div>
        </div>
      </div>
      <div className="bg-amber-50/80 p-4 rounded-2xl border border-amber-300 shadow-xs flex items-center gap-3.5 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold text-lg">
          !
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-amber-900">{t('istatistik.borc')}</div>
          <div className="text-xl font-extrabold text-amber-700">
            {sayi(ozet.kalan)} <span className="text-xs font-normal text-amber-900">AZN</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FiltreProps {
  siparisler: readonly Siparis[];
  sehirler: readonly string[];
  filtre: ManifestoFiltresi;
  onizleme: TarihOnAyari;
  kopyalandi: boolean;
  onDegis: (degisiklik: Partial<ManifestoFiltresi>) => void;
  onOnAyar: (onAyar: Exclude<TarihOnAyari, 'ozel'>) => void;
  onTarih: (alan: 'baslangic' | 'bitis', deger: string) => void;
  onKopyala: () => void;
  onSifirla: () => void;
}

const SECILI = {
  kargo_ve_depo: 'bg-blue-600 text-white shadow-xs',
  ULUSLARARASI_KARGO: 'bg-sky-600 text-white shadow-xs',
  KANADA_DEPO: 'bg-amber-600 text-white shadow-xs',
  BAKU_DAGITIM_ARKADAS: 'bg-purple-600 text-white shadow-xs',
  TESLIM_EDILDI: 'bg-emerald-600 text-white shadow-xs',
  tumu: 'bg-slate-800 text-white shadow-xs',
} satisfies Record<LojistikFiltreTipi, string>;
const SECILMEMIS = 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100';

/** Mərhələ, tarix, borc, şəhər filtrləri və axtarış. */
export function ManifestoFiltreleri(p: FiltreProps) {
  const { t } = useTranslation('kargo');
  const sayac = (durum: string) => p.siparisler.filter((s) => s.lojistik_durumu === durum).length;
  const asamalar: Array<[LojistikFiltreTipi, string]> = [
    [
      'kargo_ve_depo',
      t('filtre.yoldaVeDepoda', {
        count: p.siparisler.filter((s) => YOLDAKI_ASAMALAR.includes(s.lojistik_durumu)).length,
      }),
    ],
    ['ULUSLARARASI_KARGO', t('filtre.yalnizUcusda', { count: sayac('ULUSLARARASI_KARGO') })],
    ['KANADA_DEPO', t('filtre.kanadaDepo', { count: sayac('KANADA_DEPO') })],
    ['BAKU_DAGITIM_ARKADAS', t('filtre.bakiPaylanma', { count: sayac('BAKU_DAGITIM_ARKADAS') })],
    ['tumu', t('filtre.butunSifarisler', { count: p.siparisler.length })],
  ];
  const onAyarlar: Array<[Exclude<TarihOnAyari, 'ozel'>, string]> = [
    ['hepsi', t('filtre.butunVaxtlar')],
    ['bugun', t('filtre.buGun')],
    ['son7gun', t('filtre.son7')],
    ['buay', t('filtre.buAy')],
  ];
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-slate-700 me-1 flex items-center gap-1">
            <Filter className="w-4 h-4 text-slate-500" />
            {t('filtre.merhele')}
          </span>
          {asamalar.map(([deger, etiket]) => (
            <button
              key={deger}
              type="button"
              aria-pressed={p.filtre.lojistik === deger}
              onClick={() => p.onDegis({ lojistik: deger })}
              className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                p.filtre.lojistik === deger ? SECILI[deger] : SECILMEMIS
              }`}
            >
              {etiket}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={p.onKopyala}
          title={t('filtre.whatsappIpucu')}
          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
        >
          {p.kopyalandi ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">{t('ortak:kopyalandi')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('filtre.whatsappKurye')}</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="font-bold text-slate-700 flex items-center gap-1">
            <Calendar className="w-4 h-4 text-slate-500" />
            {t('filtre.tarix')}
          </span>
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            {onAyarlar.map(([deger, etiket]) => (
              <button
                key={deger}
                type="button"
                aria-pressed={p.onizleme === deger}
                onClick={() => p.onOnAyar(deger)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  p.onizleme === deger ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
                }`}
              >
                {etiket}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="date"
              value={p.filtre.baslangic}
              onChange={(e) => p.onTarih('baslangic', e.target.value)}
              aria-label={t('filtre.baslangic')}
              title={t('filtre.baslangic')}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
            />
            <span aria-hidden="true" className="rtl:rotate-180">
              ➔
            </span>
            <input
              type="date"
              value={p.filtre.bitis}
              onChange={(e) => p.onTarih('bitis', e.target.value)}
              aria-label={t('filtre.bitis')}
              title={t('filtre.bitis')}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
            />
          </div>
          <button
            type="button"
            aria-pressed={p.filtre.finans === 'borclu'}
            onClick={() => p.onDegis({ finans: p.filtre.finans === 'borclu' ? 'tumu' : 'borclu' })}
            title={t('filtre.yalnizBorcluIpucu')}
            className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              p.filtre.finans === 'borclu'
                ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{t('filtre.yalnizBorclu')}</span>
            {p.filtre.finans === 'borclu' && <Check className="w-3.5 h-3.5 text-amber-700" />}
          </button>
          {p.sehirler.length > 0 && (
            <select
              value={p.filtre.sehir}
              onChange={(e) => p.onDegis({ sehir: e.target.value })}
              aria-label={t('filtre.sehir')}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="tumu">{t('filtre.butunSeherler')}</option>
              {p.sehirler.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('filtre.axtaris')}
              aria-label={t('filtre.axtaris')}
              value={p.filtre.arama}
              onChange={(e) => p.onDegis({ arama: e.target.value })}
              className="ps-9 pe-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-48 sm:w-64"
            />
            {p.filtre.arama && (
              <button
                type="button"
                onClick={() => p.onDegis({ arama: '' })}
                aria-label={t('filtre.axtarisiTemizle')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ×
              </button>
            )}
          </div>
          {filtreAktif(p.filtre) && (
            <button
              type="button"
              onClick={p.onSifirla}
              title={t('filtre.sifirla')}
              aria-label={t('filtre.sifirla')}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
