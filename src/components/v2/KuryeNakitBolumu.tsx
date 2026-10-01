import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { hataMetni } from '../../i18n/hata';
import { para } from '../../i18n/bicim';
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
export default function KuryeNakitBolumu({
  onYazildi,
}: {
  /** The server's new amount due for the order, so the task card updates too (B3). */
  onYazildi?: (siparisId: string, kalanTutar: number) => void;
}) {
  const { t } = useTranslation('v2');
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
      else setMesaj(hataMetni(error, t('kasa.nakit.yuklenmedi')));
    }
  }, [t]);
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
      const response = await apiFetch('/api/v2/kurye/tahsilat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
      const { ozet } = (await response.json()) as { ozet?: { kalanTutar?: unknown } };
      if (typeof ozet?.kalanTutar === 'number') onYazildi?.(siparis.id, ozet.kalanTutar);
      setMesaj(t('kasa.nakit.yazildi', { mebleg: para(govde.tutar_azn) }));
      delete islemAnahtarlari.current[siparis.id];
      setTutarlar({ ...tutarlar, [siparis.id]: '' });
      await yukle();
    } catch (error) {
      setMesaj(hataMetni(error, t('kasa.nakit.yazilmadi')));
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
        {t('kasa.nakit.baslik', { mebleg: para(durum.bakiye) })}
      </h2>
      {durum.siparisler.map((siparis) => (
        <div key={siparis.id} className="flex flex-wrap items-end gap-2 text-sm">
          <span className="flex-1">
            {t('kasa.nakit.siparis', {
              musteri: siparis.musteriAdi,
              mebleg: para(siparis.kalanTutar),
            })}
          </span>
          <input
            aria-label={t('kasa.nakit.alinanEtiket', { musteri: siparis.musteriAdi })}
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
            {t('kasa.nakit.aldim')}
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
