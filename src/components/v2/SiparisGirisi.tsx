import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import { rolGrubunda } from '../../shared/roller';
import SatirTablosu from './SatirTablosu';
import {
  bosForm,
  formToplami,
  formdanIstek,
  oneridenForm,
  type AyristirmaSonucu,
  type SiparisFormu,
} from './siparisFormu';

interface Sahip {
  id: string;
  adSoyad: string;
  rol: string;
}
interface V2SiparisOzeti {
  id: string;
  musteriAdi: string;
  sahipKullaniciId: string;
  toplamTutar: number;
  lojistikDurumu: string;
  olusturmaTarihi: string;
  satirlar: unknown[];
}

const girdi = 'mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white';
const hataMetni = (error: unknown) =>
  error instanceof Error ? error.message : 'Əməliyyat tamamlanmadı.';
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * v2 sipariş girişi (A9): mesaj → AI önerisi (satırlar) → insan düzeltir ve onaylar.
 * AI'a yalnız mesaj gider; müşteri eşleştirmesini sunucu yapar (A1).
 */
export default function SiparisGirisi() {
  const aktifRol = useAppStore((state) => state.aktifRol);
  const girebilir = rolGrubunda(aktifRol, 'SALES');
  const sahipSecebilir = rolGrubunda(aktifRol, 'OWNERS');
  const [form, setForm] = useState<SiparisFormu>(bosForm);
  const [adaylar, setAdaylar] = useState<AyristirmaSonucu['musteriAdaylari']>([]);
  const [eksik, setEksik] = useState<string[]>([]);
  const [hatalar, setHatalar] = useState<string[]>([]);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState<'ai' | 'kayit' | null>(null);
  const [sahipler, setSahipler] = useState<Sahip[]>([]);
  const [siparisler, setSiparisler] = useState<V2SiparisOzeti[]>([]);

  const listeyiYukle = useCallback(async () => {
    try {
      const data = (await (await apiFetch('/api/v2/siparisler')).json()) as {
        siparisler: V2SiparisOzeti[];
      };
      setSiparisler(data.siparisler);
    } catch (error) {
      setMesaj(hataMetni(error));
    }
  }, []);

  useEffect(() => {
    void listeyiYukle();
    if (!sahipSecebilir) return;
    apiFetch('/api/v2/siparis-sahipleri')
      .then((response) => response.json())
      .then((data: { sahipler: Sahip[] }) => setSahipler(data.sahipler))
      .catch((error: unknown) => setMesaj(hataMetni(error)));
  }, [listeyiYukle, sahipSecebilir]);

  const alan = (key: keyof SiparisFormu) => (value: string) => setForm({ ...form, [key]: value });

  const ayristir = async () => {
    if (!form.hamMesaj.trim()) return;
    setBekliyor('ai');
    setMesaj(null);
    try {
      const response = await apiFetch(
        '/api/v2/siparisler/ayristir',
        json({ ham_mesaj: form.hamMesaj })
      );
      const sonuc = (await response.json()) as AyristirmaSonucu;
      setForm({ ...oneridenForm(sonuc, form.hamMesaj), sahipKullaniciId: form.sahipKullaniciId });
      setAdaylar(sonuc.musteriAdaylari);
      setEksik(sonuc.eksikBilgiler);
      setHatalar([]);
    } catch (error) {
      setMesaj(hataMetni(error));
    } finally {
      setBekliyor(null);
    }
  };

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault();
    const { govde, hatalar: yeniHatalar } = formdanIstek(form);
    setHatalar(yeniHatalar);
    if (!govde) return;
    setBekliyor('kayit');
    setMesaj(null);
    try {
      await apiFetch('/api/v2/siparisler', json(govde));
      setForm(bosForm());
      setAdaylar([]);
      setEksik([]);
      setMesaj('Sifariş yadda saxlanıldı.');
      await listeyiYukle();
    } catch (error) {
      setMesaj(hataMetni(error));
    } finally {
      setBekliyor(null);
    }
  };

  const sahipAdi = (id: string) => sahipler.find((s) => s.id === id)?.adSoyad ?? id;

  return (
    <section
      aria-labelledby="v2-siparisler"
      data-v2-ekran="tomnap-v2-kabuk-siparisler"
      className="space-y-8"
    >
      <h2 id="v2-siparisler" className="text-base font-semibold">
        Sifarişlər (v2)
      </h2>
      {girebilir && (
        <form onSubmit={kaydet} className="space-y-6 rounded-xl border border-slate-800 p-4">
          <div>
            <label className="block text-xs text-slate-400">
              Müştəri mesajı
              <textarea
                value={form.hamMesaj}
                onChange={(event) => alan('hamMesaj')(event.target.value)}
                rows={4}
                maxLength={20000}
                className={girdi}
              />
            </label>
            <button
              type="button"
              onClick={ayristir}
              disabled={bekliyor !== null || !form.hamMesaj.trim()}
              className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {bekliyor === 'ai' ? 'Ayrışdırılır…' : 'AI ilə sətirlərə ayır'}
            </button>
            {eksik.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-300">
                {eksik.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['musteriAdi', 'Müştəri adı'],
                ['telefon', 'Telefon'],
                ['instagram', 'Instagram'],
                ['sehir', 'Şəhər'],
                ['adres', 'Ünvan'],
                ['ozelNot', 'Qeyd'],
              ] as const
            ).map(([key, etiket]) => (
              <label key={key} className="text-xs text-slate-400">
                {etiket}
                <input
                  value={form[key]}
                  onChange={(event) => alan(key)(event.target.value)}
                  className={girdi}
                />
              </label>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            {form.musteriId ? (
              <p>
                Müştəri kartına bağlıdır ({form.musteriId}).{' '}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, musteriId: null })}
                  className="text-sky-400 underline"
                >
                  Bağı sil
                </button>
              </p>
            ) : (
              <p>Müştəri kartı seçilməyib; yeni müştəri kimi yazılacaq.</p>
            )}
            {adaylar.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {adaylar.map((aday) => (
                  <button
                    key={aday.musteri_id}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, musteriId: aday.musteri_id, musteriAdi: aday.ad_soyad })
                    }
                    className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:bg-slate-800"
                  >
                    {aday.ad_soyad} · {Math.round(aday.skor * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {sahipSecebilir && (
            <label className="block text-xs text-slate-400 sm:w-1/3">
              Sifarişin sahibi
              <select
                value={form.sahipKullaniciId ?? ''}
                onChange={(event) =>
                  setForm({ ...form, sahipKullaniciId: event.target.value || null })
                }
                className={girdi}
              >
                <option value="">Mən (sifarişi yaradan)</option>
                {sahipler.map((sahip) => (
                  <option key={sahip.id} value={sahip.id}>
                    {sahip.adSoyad}
                  </option>
                ))}
              </select>
            </label>
          )}

          <SatirTablosu
            satirlar={form.satirlar}
            onChange={(satirlar) => setForm({ ...form, satirlar })}
          />
          <p className="text-right text-sm text-slate-200">
            Cəm: <strong>{formToplami(form).toFixed(2)} AZN</strong>
          </p>

          {hatalar.length > 0 && (
            <ul role="alert" className="list-disc pl-5 text-xs text-rose-300">
              {hatalar.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <button
            type="submit"
            disabled={bekliyor !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {bekliyor === 'kayit' ? 'Yadda saxlanılır…' : 'Sifarişi təsdiqlə və yadda saxla'}
          </button>
        </form>
      )}

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
              <td className="text-slate-400">{sahipAdi(siparis.sahipKullaniciId)}</td>
              <td className="text-slate-400">{siparis.lojistikDurumu}</td>
              <td className="text-right">{siparis.toplamTutar.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
