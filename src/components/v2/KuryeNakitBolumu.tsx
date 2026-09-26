import React, { useCallback, useEffect, useState, useRef } from 'react';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { kuryeTahsilatIstegi, type AcikTahsilat, type KuryeSiparisi } from './kasaFormu';

interface NakitDurumu {
  bakiye: number;
  acikTahsilatlar: AcikTahsilat[];
  siparisler: KuryeSiparisi[];
}

/**
 * Kuryenin kendi nakdi (A11, K17): üzerindeki nakit ve teslimattaki v2 siparişlerinde
 * aldığı nakdi yazma. VITE_FF_V2_FLOW açıkken kurye ekranına ayrı parça olarak eklenir;
 * sunucu bayrağı kapalıysa (404) hiçbir şey göstermez.
 */
export default function KuryeNakitBolumu() {
  const [durum, setDurum] = useState<NakitDurumu | null>(null);
  const [kapali, setKapali] = useState(false);
  const [tutarlar, setTutarlar] = useState<Record<string, string>>({});
  // One operation key per collection intent (Codex R3 F15); a new amount is a new intent.
  const islemAnahtarlari = useRef<Record<string, string>>({});
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const response = await apiFetch('/api/v2/kurye/nakit');
      setDurum((await response.json()) as NakitDurumu);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setKapali(true);
      else setMesaj(error instanceof Error ? error.message : 'Nağd pul məlumatı yüklənmədi.');
    }
  }, []);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  const yaz = async (siparis: KuryeSiparisi) => {
    islemAnahtarlari.current[siparis.id] ??= crypto.randomUUID();
    const { govde, hata } = kuryeTahsilatIstegi(
      siparis,
      tutarlar[siparis.id] ?? siparis.kalanTutar.toFixed(2),
      islemAnahtarlari.current[siparis.id]
    );
    if (!govde) return setMesaj(hata);
    setBekliyor(true);
    setMesaj(null);
    try {
      await apiFetch('/api/v2/kurye/tahsilat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
      setMesaj(`${govde.tutar_azn.toFixed(2)} AZN nağd yazıldı.`);
      delete islemAnahtarlari.current[siparis.id];
      setTutarlar({ ...tutarlar, [siparis.id]: '' });
      await yukle();
    } catch (error) {
      setMesaj(error instanceof Error ? error.message : 'Ödəniş yazılmadı.');
    } finally {
      setBekliyor(false);
    }
  };

  if (kapali || !durum) return null;
  return (
    <section
      data-v2-ekran="tomnap-v2-kabuk-kurye-nakit"
      aria-labelledby="kurye-nakit"
      className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"
    >
      <h2 id="kurye-nakit" className="text-base font-bold">
        Üzərimdə olan nağd pul: {durum.bakiye.toFixed(2)} AZN
      </h2>
      {durum.siparisler.map((siparis) => (
        <div key={siparis.id} className="flex flex-wrap items-end gap-2 text-sm">
          <span className="flex-1">
            {siparis.musteriAdi} · qalıq {siparis.kalanTutar.toFixed(2)} AZN
          </span>
          <input
            aria-label={`${siparis.musteriAdi} üçün alınan nağd`}
            inputMode="decimal"
            placeholder={siparis.kalanTutar.toFixed(2)}
            value={tutarlar[siparis.id] ?? ''}
            onChange={(event) => {
              delete islemAnahtarlari.current[siparis.id];
              setTutarlar({ ...tutarlar, [siparis.id]: event.target.value });
            }}
            className="min-h-11 w-28 rounded-lg border border-slate-300 px-2"
          />
          <button
            type="button"
            disabled={bekliyor}
            onClick={() => void yaz(siparis)}
            className="min-h-11 rounded-lg bg-amber-600 px-3 font-semibold text-white disabled:opacity-50"
          >
            Nağd aldım
          </button>
        </div>
      ))}
      {mesaj && (
        <p role="status" className="text-sm text-slate-700">
          {mesaj}
        </p>
      )}
    </section>
  );
}
