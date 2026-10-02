import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni as cevrilmisHata } from '../../i18n/hata';
import { sayi, tarih } from '../../i18n/bicim';
import { useAppStore } from '../../store/appStore';
import { asamaIlerletebilir } from '../../shared/v2Asama';
import { asamaIstegi, asamaOnayMetni } from './asamaFormu';
import { asamaAdi } from './v2Ceviri';

export interface V2SiparisOzeti {
  id: string;
  musteriAdi: string;
  sahipKullaniciId: string;
  sahipAdSoyad?: string | null;
  toplamTutar: number;
  lojistikDurumu: string;
  olusturmaTarihi: string;
  satirlar: unknown[];
}

/**
 * v2 sipariş listesi. GEÇİCİ aşama köprüsü (OPEN_QUESTIONS 38): yetkili rol bir v2
 * siparişini onay sorulduktan sonra bir sonraki lojistik mərhələyə keçirir.
 */
export default function SiparisListesi({
  siparisler,
  sahipAdi,
  onDegisti,
}: {
  siparisler: V2SiparisOzeti[];
  sahipAdi: (id: string) => string;
  onDegisti: () => Promise<void>;
}) {
  const { t } = useTranslation('v2');
  const aktifRol = useAppStore((state) => state.aktifRol);
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);

  const ilerlet = async (siparis: V2SiparisOzeti) => {
    const govde = asamaIstegi(siparis);
    if (!govde || !window.confirm(asamaOnayMetni(siparis))) return;
    setBekleyen(siparis.id);
    setMesaj(null);
    try {
      await apiFetch(`/api/v2/siparisler/${encodeURIComponent(siparis.id)}/asama`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
      setMesaj(t('liste.asamaDegisti'));
    } catch (error) {
      setMesaj(cevrilmisHata(error, t('ortak.xeta')));
    } finally {
      setBekleyen(null);
      await onDegisti();
    }
  };

  return (
    <div className="space-y-2">
      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}
      <table className="w-full text-start text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2">{t('liste.tarix')}</th>
            <th>{t('liste.musteri')}</th>
            <th>{t('liste.satir')}</th>
            <th>{t('liste.sahib')}</th>
            <th>{t('liste.veziyyet')}</th>
            <th className="text-end">{t('liste.cem')}</th>
          </tr>
        </thead>
        <tbody>
          {siparisler.map((siparis) => (
            <tr key={siparis.id} className="border-t border-slate-800">
              <td className="py-2 text-slate-400">{tarih(siparis.olusturmaTarihi)}</td>
              <td>{siparis.musteriAdi}</td>
              <td>{siparis.satirlar.length}</td>
              <td className="text-slate-400">
                {siparis.sahipAdSoyad ?? sahipAdi(siparis.sahipKullaniciId)}
              </td>
              <td className="text-slate-400">
                <span>{asamaAdi(siparis.lojistikDurumu)}</span>
                {asamaIlerletebilir(aktifRol, siparis.lojistikDurumu) && (
                  <button
                    type="button"
                    disabled={bekleyen !== null}
                    onClick={() => void ilerlet(siparis)}
                    className="ms-2 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {bekleyen === siparis.id ? t('liste.gozleyin') : t('liste.novbetiMerhele')}
                  </button>
                )}
              </td>
              <td className="text-end">{sayi(siparis.toplamTutar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
