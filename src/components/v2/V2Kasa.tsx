import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni } from '../../i18n/hata';
import { tarih } from '../../i18n/bicim';
import { useAppStore } from '../../store/appStore';
import { rolGrubunda } from '../../shared/roller';
import OdemeDefteri from './OdemeDefteri';
import KuryeBakiyeleri from './KuryeBakiyeleri';
import { azn } from './odemeFormu';

interface KasaSiparisi {
  id: string;
  musteriAdi: string;
  toplamTutar: number;
  alinanTutar: number;
  kalanTutar: number;
  finansDurumu: string;
  olusturmaTarihi: string;
}
/**
 * Kasa (A10, A11): v2 siparişleri ve seçilenin ödeme defteri; KASA rollerine kurye
 * bakiyeleri; teslim almayı yalnız KASA_WRITE (SUPER_ADMIN okur).
 */
export default function V2Kasa() {
  const { t } = useTranslation('v2');
  const aktifRol = useAppStore((state) => state.aktifRol);
  const kasa = rolGrubunda(aktifRol, 'KASA');
  const kasaYazar = rolGrubunda(aktifRol, 'KASA_WRITE');
  const [siparisler, setSiparisler] = useState<KasaSiparisi[] | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      const response = await apiFetch('/api/v2/siparisler');
      setSiparisler(((await response.json()) as { siparisler: KasaSiparisi[] }).siparisler);
    } catch (error) {
      setHata(hataMetni(error, t('kasa.ekran.yuklenmedi')));
    }
  }, [t]);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  return (
    <section data-v2-ekran="tomnap-v2-kabuk-kasa" aria-labelledby="v2-kasa" className="space-y-6">
      <h2 id="v2-kasa" className="text-base font-semibold">
        {t('kasa.ekran.baslik')}
      </h2>
      {hata && (
        <p role="alert" className="text-sm text-rose-300">
          {hata}
        </p>
      )}
      {siparisler && siparisler.length === 0 && (
        <p className="text-sm text-slate-400">{t('kasa.ekran.bos')}</p>
      )}
      {siparisler && siparisler.length > 0 && (
        <table className="w-full text-start text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">{t('kasa.ekran.tarix')}</th>
              <th>{t('kasa.ekran.musteri')}</th>
              <th className="text-end">{t('kasa.ekran.cem')}</th>
              <th className="text-end">{t('kasa.ekran.odenib')}</th>
              <th className="text-end">{t('kasa.ekran.qaliq')}</th>
              {/* B5: the end-aligned amount and the status text must not touch. */}
              <th className="ps-6">{t('kasa.ekran.veziyyet')}</th>
            </tr>
          </thead>
          <tbody>
            {siparisler.map((siparis) => (
              <tr
                key={siparis.id}
                aria-selected={secili === siparis.id}
                onClick={() => setSecili(siparis.id)}
                className={`cursor-pointer border-t border-slate-800 ${
                  secili === siparis.id ? 'bg-slate-800' : 'hover:bg-slate-900'
                }`}
              >
                <td className="py-2 text-slate-400">{tarih(siparis.olusturmaTarihi)}</td>
                <td>
                  <button type="button" className="text-start underline-offset-2 hover:underline">
                    {siparis.musteriAdi}
                  </button>
                </td>
                <td className="text-end">{azn(siparis.toplamTutar)}</td>
                <td className="text-end">{azn(siparis.alinanTutar)}</td>
                <td className="text-end">{azn(siparis.kalanTutar)}</td>
                <td className="ps-6">
                  {t(`kasa.finans.${siparis.finansDurumu}`, { defaultValue: siparis.finansDurumu })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kasa && <KuryeBakiyeleri teslimAlabilir={kasaYazar} />}
      {secili && (
        // A new order starts with a fresh form and closed reversal inputs.
        <React.Fragment key={secili}>
          <OdemeDefteri siparisId={secili} onDegisti={() => void yukle()} />
        </React.Fragment>
      )}
    </section>
  );
}
