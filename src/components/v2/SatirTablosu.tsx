import React from 'react';
import { bosSatir, satirTutari, type KaynakUlke, type SatirFormu } from './siparisFormu';
import { useTranslation } from 'react-i18next';

interface SatirTablosuProps {
  satirlar: SatirFormu[];
  onChange: (satirlar: SatirFormu[]) => void;
}

const girdi = 'w-full rounded-lg bg-slate-800 p-2 text-sm text-white';

/** Editable order lines (A9): one row per product the customer asked for. */
export default function SatirTablosu({ satirlar, onChange }: SatirTablosuProps) {
  const { t } = useTranslation('v2');
  const degistir = (index: number, alan: keyof SatirFormu, deger: string) =>
    onChange(satirlar.map((satir, i) => (i === index ? { ...satir, [alan]: deger } : satir)));
  const sil = (index: number) => onChange(satirlar.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2">{t('satir.mehsul')}</th>
            <th>{t('satir.olcu')}</th>
            <th>{t('satir.reng')}</th>
            <th className="w-20">{t('satir.say')}</th>
            <th className="w-28">{t('satir.qiymet')}</th>
            <th className="w-20">{t('satir.olke')}</th>
            <th className="w-24 text-end">{t('satir.cem')}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {satirlar.map((satir, index) => {
            const tutar = satirTutari(satir);
            return (
              <tr key={index} className="border-t border-slate-800 align-top">
                <td className="py-2 pr-2">
                  <input
                    aria-label={t('satir.etiket.mehsul', { sira: index + 1 })}
                    value={satir.urunAciklamasi}
                    maxLength={500}
                    onChange={(event) => degistir(index, 'urunAciklamasi', event.target.value)}
                    className={girdi}
                  />
                </td>
                <td className="pr-2">
                  <input
                    aria-label={t('satir.etiket.olcu', { sira: index + 1 })}
                    value={satir.beden}
                    maxLength={50}
                    onChange={(event) => degistir(index, 'beden', event.target.value)}
                    className={girdi}
                  />
                </td>
                <td className="pr-2">
                  <input
                    aria-label={t('satir.etiket.reng', { sira: index + 1 })}
                    value={satir.renk}
                    maxLength={50}
                    onChange={(event) => degistir(index, 'renk', event.target.value)}
                    className={girdi}
                  />
                </td>
                <td className="pr-2">
                  <input
                    aria-label={t('satir.etiket.say', { sira: index + 1 })}
                    inputMode="numeric"
                    value={satir.adet}
                    onChange={(event) => degistir(index, 'adet', event.target.value)}
                    className={girdi}
                  />
                </td>
                <td className="pr-2">
                  <input
                    aria-label={t('satir.etiket.qiymet', { sira: index + 1 })}
                    inputMode="decimal"
                    value={satir.fiyat}
                    placeholder="0.00"
                    onChange={(event) => degistir(index, 'fiyat', event.target.value)}
                    className={girdi}
                  />
                </td>
                <td className="pr-2">
                  <select
                    aria-label={t('satir.etiket.olke', { sira: index + 1 })}
                    value={satir.kaynakUlke}
                    onChange={(event) =>
                      degistir(index, 'kaynakUlke', event.target.value as KaynakUlke)
                    }
                    className={girdi}
                  >
                    <option value="CA">CA</option>
                    <option value="US">US</option>
                  </select>
                </td>
                <td className="py-2 text-end text-slate-300">
                  {tutar === null ? '—' : tutar.toFixed(2)}
                </td>
                <td className="text-end">
                  <button
                    type="button"
                    aria-label={t('satir.etiket.sil', { sira: index + 1 })}
                    onClick={() => sil(index)}
                    disabled={satirlar.length === 1}
                    className="rounded px-2 py-1 text-slate-400 hover:text-rose-400 disabled:opacity-30"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => onChange([...satirlar, bosSatir()])}
        disabled={satirlar.length >= 100}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        + {t('satir.ekle')}
      </button>
    </div>
  );
}
