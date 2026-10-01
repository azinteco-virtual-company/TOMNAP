import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MapPin, Package, RotateCcw, Truck } from 'lucide-react';
import type { Siparis } from '../../types';
import { para, sayi, tarih } from '../../i18n/bicim';
import type { ManifestoOzeti } from '../../belgeler/manifesto';
import type { ManifestoFiltresi } from './manifestoFiltresi';

const ROZET: Record<string, string> = {
  KANADA_SATINALIM_BEKLIYOR: 'bg-amber-100 text-amber-900 border-amber-300',
  KANADA_DEPO: 'bg-blue-100 text-blue-900 border-blue-300',
  ULUSLARARASI_KARGO: 'bg-sky-100 text-sky-900 border-sky-300',
  BAKU_DAGITIM_ARKADAS: 'bg-purple-100 text-purple-900 border-purple-300',
  TESLIM_EDILDI: 'bg-emerald-100 text-emerald-900 border-emerald-300',
};

interface Props {
  liste: readonly Siparis[];
  ozet: ManifestoOzeti;
  filtre: ManifestoFiltresi;
  onSifirla: () => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
}

/** Paket və bağlama siyahısı, alt yekun (arayüz dilində). */
export function ManifestoTablosu({ liste, ozet, filtre, onSifirla, onSiparisDetayAc }: Props) {
  const { t } = useTranslation('kargo');
  const sutunlar: Array<[string, string]> = [
    ['sira', 'p-3 w-10 text-center'],
    ['musteri', 'p-3 min-w-[160px]'],
    ['sehir', 'p-3 min-w-[150px]'],
    ['mehsul', 'p-3 min-w-[220px]'],
    ['say', 'p-3 text-center w-14'],
    ['mebleg', 'p-3 text-end min-w-[100px]'],
    ['qaliq', 'p-3 text-end min-w-[120px]'],
    ['gomruk', 'p-3 min-w-[140px]'],
    ['merhele', 'p-3 min-w-[160px]'],
    ['qeyd', 'p-3 min-w-[200px]'],
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex flex-wrap items-center gap-2">
            <span>{t('tablo.siyahi')}</span>
            <span className="text-xs font-bold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
              {t('tablo.bagla', { count: ozet.bagla })}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('tablo.marsrut')}</p>
        </div>
        <div className="text-xs text-slate-500 text-end">
          <div>
            {t('tablo.tarix')} <strong className="text-slate-800">{tarih(new Date())}</strong>
          </div>
          {filtre.baslangic || filtre.bitis ? (
            <div className="text-blue-700 font-semibold text-[11px]">
              {t('tablo.filtrAraligi', {
                bas: filtre.baslangic || t('tablo.evvel'),
                bit: filtre.bitis || t('tablo.indiyedek'),
              })}
            </div>
          ) : (
            <div className="text-[11px]">{t('tablo.butunDovriyye')}</div>
          )}
        </div>
      </div>

      {liste.length === 0 ? (
        <div className="text-center py-20 text-slate-400 text-xs bg-slate-50/50">
          <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <div className="font-bold text-slate-700 text-base">{t('tablo.bosBaslik')}</div>
          <p className="text-slate-500 mt-1 max-w-md mx-auto">{t('tablo.bosAciklama')}</p>
          <button
            type="button"
            onClick={onSifirla}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('filtre.sifirla')}</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[70vh] border border-slate-200 rounded-xl">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-xs">
              <tr>
                {sutunlar.map(([anahtar, sinif]) => (
                  <th key={anahtar} className={`${sinif} text-start`}>
                    {t(`tablo.sutun.${anahtar}`)}
                  </th>
                ))}
                {onSiparisDetayAc && (
                  <th className="p-3 text-center w-14">{t('tablo.sutun.emeliyyat')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liste.map((s, i) => (
                <tr key={s.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="p-3 text-slate-400 font-mono text-[11px] text-center font-bold">
                    {i + 1}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900 text-sm break-words [overflow-wrap:anywhere]">
                      {s.musteri_adi || t('tablo.adsizMusteri')}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {s.telefon_numarasi || t('tablo.nomreYoxdur')}
                    </div>
                    {s.olusturma_tarihi && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {t('tablo.qeyd', { tarih: tarih(s.olusturma_tarihi) })}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-800 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="break-words [overflow-wrap:anywhere]">
                        {s.teslimat_sehri || t('tablo.varsayilanSehir')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 line-clamp-2 max-w-[180px] mt-0.5 [overflow-wrap:anywhere]">
                      {s.teslimat_adresi || t('tablo.bakiDaxili')}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-900 text-xs sm:text-sm [overflow-wrap:anywhere]">
                      {s.urun_aciklamasi}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}
                    </div>
                  </td>
                  <td className="p-3 text-center font-bold text-slate-900 text-sm">
                    {s.adet || 1}
                  </td>
                  <td className="p-3 text-end whitespace-nowrap">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">
                      {para(s.toplam_tutar || 0, s.para_birimi || 'AZN')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {t('tablo.odenilib', { mebleg: sayi(s.alinan_tutar || 0) })}
                    </div>
                  </td>
                  <td className="p-3 text-end whitespace-nowrap">
                    {s.kalan_tutar > 0 ? (
                      <div className="bg-amber-50 text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 inline-block text-end shadow-2xs">
                        <div className="font-extrabold text-amber-800 text-xs sm:text-sm">
                          {para(s.kalan_tutar, s.para_birimi || 'AZN')}
                        </div>
                        <div className="text-[9px] font-bold text-amber-700 uppercase">
                          {t('tablo.bakidaAlinacaq')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block text-xs">
                        {t('tablo.tamOdenilib')}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-xs">
                      {s.kanada_gumruk_fin_kodu ? (
                        <div className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md inline-block border border-slate-200">
                          🪪 {s.kanada_gumruk_fin_kodu}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">
                          {t('tablo.finYoxdur')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-700 font-medium mt-1 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{s.baku_kurye_adi || t('tablo.bolgeMerkezi')}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border inline-block ${
                        ROZET[s.lojistik_durumu] ?? 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {t(`durum.${s.lojistik_durumu}`, {
                        defaultValue: s.lojistik_durumu.replace(/_/g, ' '),
                      })}
                    </span>
                    {s.uluslararasi_kargo_kodu && (
                      <div className="text-xs text-blue-700 font-mono font-bold mt-1.5 flex items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-normal">
                          {t('tablo.kargo')}
                        </span>
                        <span>{s.uluslararasi_kargo_kodu}</span>
                      </div>
                    )}
                    {s.kanada_takip_kodu && (
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {t('tablo.kanada', { kod: s.kanada_takip_kodu })}
                      </div>
                    )}
                  </td>
                  <td className="p-3 space-y-1.5">
                    {s.ozel_not && (
                      <div className="text-xs text-slate-800 bg-slate-100 p-2 rounded-xl border border-slate-200 [overflow-wrap:anywhere]">
                        <span className="font-bold text-blue-700">{t('tablo.ozelNot')} </span>
                        {s.ozel_not}
                      </div>
                    )}
                    {s.baku_tahsilat_notu && (
                      <div className="text-xs text-amber-950 bg-amber-50 p-2 rounded-xl border border-amber-300 font-medium [overflow-wrap:anywhere]">
                        <span className="font-bold text-amber-800">{t('tablo.bakiNotu')} </span>
                        {s.baku_tahsilat_notu}
                      </div>
                    )}
                    {!s.ozel_not && !s.baku_tahsilat_notu && (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  {onSiparisDetayAc && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => onSiparisDetayAc(s)}
                        title={t('tablo.detayAc')}
                        aria-label={t('tablo.detayAc')}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4 rtl:-scale-x-100" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="text-slate-600 max-w-lg">
          <strong className="text-slate-800">{t('tablo.beyanname')} </strong>
          {t('tablo.beyannameMetni')}
        </div>
        <div className="flex flex-wrap items-center gap-3 font-bold text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
          <span>
            {t('tablo.toplamBagla')} <span className="text-blue-600">{ozet.bagla}</span>
          </span>
          <span>
            {t('tablo.toplamEded')} <span className="text-purple-600">{ozet.adet}</span>
          </span>
          <span>
            {t('tablo.cemiMebleg')} <span className="text-emerald-600">{para(ozet.deger)}</span>
          </span>
          <span className="text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
            {t('tablo.bakidaAlinacaqMebleg', { mebleg: para(ozet.kalan) })}
          </span>
        </div>
      </div>
    </div>
  );
}
