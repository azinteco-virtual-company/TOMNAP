import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { azn } from './odemeFormu';
import { seciliToplam, teslimIstegi, type KuryeBakiyesi } from './kasaFormu';

/**
 * Kurye bakiyeleri ve kasa teslimi (A11, K17): kasa (PATRON, BAKU_FINANS) bir kuryenin
 * açık nakit tahsilatlarından seçtiklerini tam tutarıyla teslim alır.
 */
export default function KuryeBakiyeleri() {
  const [kuryeler, setKuryeler] = useState<KuryeBakiyesi[] | null>(null);
  const [secilenKurye, setSecilenKurye] = useState<string | null>(null);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const response = await apiFetch('/api/v2/kasa/kurye-bakiyeleri');
      setKuryeler(((await response.json()) as { kuryeler: KuryeBakiyesi[] }).kuryeler);
    } catch (error) {
      setMesaj(error instanceof Error ? error.message : 'Kuryer qalıqları yüklənmədi.');
    }
  }, []);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  const kurye = kuryeler?.find((k) => k.kuryeKullaniciId === secilenKurye) ?? null;
  const sec = (id: string) => {
    setSecilenKurye(id);
    const bulunan = kuryeler?.find((k) => k.kuryeKullaniciId === id);
    setSecili(new Set(bulunan?.acikTahsilatlar.map((o) => o.id) ?? []));
    setMesaj(null);
  };
  const degistir = (id: string) => {
    const yeni = new Set(secili);
    if (yeni.has(id)) yeni.delete(id);
    else yeni.add(id);
    setSecili(yeni);
  };
  const teslimAl = async () => {
    const govde = kurye && teslimIstegi(kurye, secili);
    if (!govde) return;
    setBekliyor(true);
    setMesaj(null);
    try {
      await apiFetch('/api/v2/kasa/teslimler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      });
      setMesaj(`${azn(govde.tutar_azn)} kassaya təhvil alındı.`);
      await yukle();
      setSecili(new Set());
    } catch (error) {
      setMesaj(error instanceof Error ? error.message : 'Təhvil alınmadı.');
    } finally {
      setBekliyor(false);
    }
  };

  return (
    <section aria-labelledby="v2-kurye-bakiyeleri" className="space-y-4">
      <h3 id="v2-kurye-bakiyeleri" className="text-sm font-semibold">
        Kuryerlərdə olan nağd pul
      </h3>
      {kuryeler && kuryeler.length === 0 && (
        <p className="text-sm text-slate-400">Kuryerlərdə nağd pul yoxdur.</p>
      )}
      {kuryeler && kuryeler.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-2">Kuryer</th>
              <th className="text-right">Yığılıb</th>
              <th className="text-right">Təhvil verilib</th>
              <th className="text-right">Qalıq</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kuryeler.map((k) => (
              <tr key={k.kuryeKullaniciId} className="border-t border-slate-800">
                <td className="py-2">{k.adSoyad ?? k.kuryeKullaniciId}</td>
                <td className="text-right">{azn(k.tahsilatToplami)}</td>
                <td className="text-right">{azn(k.teslimToplami)}</td>
                <td className="text-right font-semibold">{azn(k.bakiye)}</td>
                <td className="text-right">
                  {k.acikTahsilatlar.length > 0 && (
                    <button
                      type="button"
                      onClick={() => sec(k.kuryeKullaniciId)}
                      className="text-xs text-sky-400 underline"
                    >
                      Təhvil al
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kurye && (
        <div className="space-y-3 rounded-xl border border-slate-800 p-4">
          <p className="text-sm">{kurye.adSoyad ?? kurye.kuryeKullaniciId}: açıq ödənişlər</p>
          <ul className="space-y-1 text-sm">
            {kurye.acikTahsilatlar.map((o) => (
              <li key={o.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={secili.has(o.id)}
                    onChange={() => degistir(o.id)}
                  />
                  <span className="flex-1">
                    {o.musteriAdi ?? o.siparisId} · {new Date(o.almaZamani).toLocaleString()}
                  </span>
                  <span>{azn(o.tutarAzn)}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={bekliyor || secili.size === 0}
            onClick={() => void teslimAl()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {azn(seciliToplam(kurye.acikTahsilatlar, secili))} kassaya təhvil al
          </button>
        </div>
      )}
      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}
    </section>
  );
}
