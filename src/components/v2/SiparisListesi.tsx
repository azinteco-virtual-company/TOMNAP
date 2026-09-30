import React, { useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import { asamaIlerletebilir } from '../../shared/v2Asama';
import { asamaIstegi, asamaOnayMetni } from './asamaFormu';

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

const hataMetni = (error: unknown) =>
  error instanceof Error ? error.message : 'Əməliyyat tamamlanmadı.';

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
      setMesaj('Mərhələ dəyişdirildi.');
    } catch (error) {
      setMesaj(hataMetni(error));
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
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2">Tarix</th>
            <th>Müştəri</th>
            <th>Sətir</th>
            <th>Sahib</th>
            <th>Vəziyyət</th>
            <th className="text-right">Cəm (AZN)</th>
          </tr>
        </thead>
        <tbody>
          {siparisler.map((siparis) => (
            <tr key={siparis.id} className="border-t border-slate-800">
              <td className="py-2 text-slate-400">
                {new Date(siparis.olusturmaTarihi).toLocaleDateString()}
              </td>
              <td>{siparis.musteriAdi}</td>
              <td>{siparis.satirlar.length}</td>
              <td className="text-slate-400">
                {siparis.sahipAdSoyad ?? sahipAdi(siparis.sahipKullaniciId)}
              </td>
              <td className="text-slate-400">
                <span>{siparis.lojistikDurumu}</span>
                {asamaIlerletebilir(aktifRol, siparis.lojistikDurumu) && (
                  <button
                    type="button"
                    disabled={bekleyen !== null}
                    onClick={() => void ilerlet(siparis)}
                    className="ml-2 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {bekleyen === siparis.id ? 'Gözləyin…' : 'Növbəti mərhələ →'}
                  </button>
                )}
              </td>
              <td className="text-right">{siparis.toplamTutar.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
