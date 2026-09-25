import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import OdemeDefteri from './OdemeDefteri';
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
const FINANS_ADI: Record<string, string> = {
  BEKLIYOR: 'Ödənməyib',
  KISMI_ODEME: 'Qismən',
  ODENDI: 'Ödənib',
};

/**
 * Kasa (A10): v2 siparişleri ve seçilenin ödeme defteri. Kurye nakdi ve kasa
 * teslimi A11'de buraya eklenir.
 */
export default function V2Kasa() {
  const [siparisler, setSiparisler] = useState<KasaSiparisi[] | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      const response = await apiFetch('/api/v2/siparisler');
      setSiparisler(((await response.json()) as { siparisler: KasaSiparisi[] }).siparisler);
    } catch (error) {
      setHata(error instanceof Error ? error.message : 'Sifarişlər yüklənmədi.');
    }
  }, []);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  return (
    <section data-v2-ekran="tomnap-v2-kabuk-kasa" aria-labelledby="v2-kasa" className="space-y-6">
      <h2 id="v2-kasa" className="text-base font-semibold">
        Kassa (v2)
      </h2>
      {hata && (
        <p role="alert" className="text-sm text-rose-300">
          {hata}
        </p>
      )}
      {siparisler && siparisler.length === 0 && (
        <p className="text-sm text-slate-400">Hələ v2 sifarişi yoxdur.</p>
      )}
      {siparisler && siparisler.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">Tarix</th>
              <th>Müştəri</th>
              <th className="text-right">Cəm</th>
              <th className="text-right">Ödənib</th>
              <th className="text-right">Qalıq</th>
              <th>Vəziyyət</th>
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
                <td className="py-2 text-slate-400">
                  {new Date(siparis.olusturmaTarihi).toLocaleDateString()}
                </td>
                <td>
                  <button type="button" className="text-left underline-offset-2 hover:underline">
                    {siparis.musteriAdi}
                  </button>
                </td>
                <td className="text-right">{azn(siparis.toplamTutar)}</td>
                <td className="text-right">{azn(siparis.alinanTutar)}</td>
                <td className="text-right">{azn(siparis.kalanTutar)}</td>
                <td>{FINANS_ADI[siparis.finansDurumu] ?? siparis.finansDurumu}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {secili && (
        // A new order starts with a fresh form and closed reversal inputs.
        <React.Fragment key={secili}>
          <OdemeDefteri siparisId={secili} onDegisti={() => void yukle()} />
        </React.Fragment>
      )}
    </section>
  );
}
