import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni } from '../../i18n/hata';
import { azn } from './odemeFormu';

interface Q4Kaydi {
  id: string;
  musteriAdi: string;
  modelSurumu: number;
  kalanTutar: number;
  teslimTarihi: string | null;
  bakuKuryeAdi: string | null;
  yasGun: number;
}
interface Q5Kaydi {
  kuryeKullaniciId: string;
  adSoyad: string | null;
  bakiye: number;
  acikTahsilatSayisi: number;
  beklemeSaat: number;
}
interface Kacaklar {
  esikler: { q4Gun: number; q5Saat: number };
  q4: Q4Kaydi[];
  q5: Q5Kaydi[];
}

/**
 * Kaçaklar panosu v0 (A12): Q4 teslim edildi ödenmedi, Q5 kuryede bekleyen nakit.
 * Salt okunur; sunucu tenant filtreli sorgular döndürür. Diğer sorgular Faz B–D'de.
 */
export default function KacaklarPanosu() {
  const { t } = useTranslation('v2');
  const [veri, setVeri] = useState<Kacaklar | null>(null);
  const [q5Saat, setQ5Saat] = useState('24');
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(
    async (saat: string) => {
      try {
        const response = await apiFetch(
          `/api/v2/kacaklar?q5_saat=${encodeURIComponent(saat || '24')}`
        );
        setVeri((await response.json()) as Kacaklar);
        setHata(null);
      } catch (error) {
        setHata(hataMetni(error, t('kacak.yuklenmedi')));
      }
    },
    [t]
  );
  useEffect(() => {
    void yukle('24');
  }, [yukle]);

  return (
    <section
      data-v2-ekran="tomnap-v2-kabuk-kacaklar"
      aria-labelledby="v2-kacaklar"
      className="space-y-8"
    >
      <h2 id="v2-kacaklar" className="text-base font-semibold">
        {t('kacak.baslik')}
      </h2>
      {hata && (
        <p role="alert" className="text-sm text-rose-300">
          {hata}
        </p>
      )}
      {veri && (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              {t('kacak.q4.baslik', { sayi: veri.q4.length })}
            </h3>
            {veri.q4.length === 0 ? (
              <p className="text-sm text-slate-400">{t('kacak.yoxdur')}</p>
            ) : (
              <table className="w-full text-start text-sm">
                <thead className="text-xs text-slate-400">
                  <tr>
                    <th className="py-2">{t('kacak.q4.musteri')}</th>
                    <th>{t('kacak.q4.kuryer')}</th>
                    <th className="text-end">{t('kacak.q4.qaliq')}</th>
                    <th className="text-end">{t('kacak.q4.gun')}</th>
                  </tr>
                </thead>
                <tbody>
                  {veri.q4.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800">
                      <td className="py-2">
                        {r.musteriAdi}
                        {r.modelSurumu === 2 && (
                          <span className="ms-2 rounded bg-indigo-900 px-1 text-[10px]">
                            {'v2'}
                          </span>
                        )}
                      </td>
                      <td className="text-slate-400">{r.bakuKuryeAdi ?? '—'}</td>
                      <td className="text-end">{azn(r.kalanTutar)}</td>
                      <td className="text-end">{r.yasGun}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {t('kacak.q5.baslik', { sayi: veri.q5.length })}
              </h3>
              <label className="text-xs text-slate-400">
                {t('kacak.q5.hedd')}
                <input
                  inputMode="numeric"
                  value={q5Saat}
                  onChange={(event) => setQ5Saat(event.target.value)}
                  onBlur={() => void yukle(q5Saat)}
                  className="ms-2 w-16 rounded bg-slate-800 p-1 text-white"
                />
              </label>
            </div>
            {veri.q5.length === 0 ? (
              <p className="text-sm text-slate-400">{t('kacak.yoxdur')}</p>
            ) : (
              <table className="w-full text-start text-sm">
                <thead className="text-xs text-slate-400">
                  <tr>
                    <th className="py-2">{t('kacak.q5.kuryer')}</th>
                    <th className="text-end">{t('kacak.q5.nagd')}</th>
                    <th className="text-end">{t('kacak.q5.odenis')}</th>
                    <th className="text-end">{t('kacak.q5.gozleyir')}</th>
                  </tr>
                </thead>
                <tbody>
                  {veri.q5.map((r) => (
                    <tr key={r.kuryeKullaniciId} className="border-t border-slate-800">
                      <td className="py-2">{r.adSoyad ?? r.kuryeKullaniciId}</td>
                      <td className="text-end">{azn(r.bakiye)}</td>
                      <td className="text-end">{r.acikTahsilatSayisi}</td>
                      <td className="text-end">{r.beklemeSaat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
