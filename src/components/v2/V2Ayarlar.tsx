import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';

interface Ayarlar {
  aylikBeyanSinirUsd: number;
  varsayilanKgFiyatiAzn: number | null;
  primOraniVarsayilan: number;
  kayitli: boolean;
}
interface Form {
  beyan: string;
  kg: string;
  prim: string;
}

const formdan = (ayarlar: Ayarlar): Form => ({
  beyan: String(ayarlar.aylikBeyanSinirUsd),
  kg: ayarlar.varsayilanKgFiyatiAzn === null ? '' : String(ayarlar.varsayilanKgFiyatiAzn),
  // Stored as a fraction (0.05), shown as a percentage (5).
  prim: String(Math.round(ayarlar.primOraniVarsayilan * 10000) / 100),
});
const sayi = (value: string) => Number(value.replace(',', '.'));
const hataMetni = (error: unknown) =>
  error instanceof Error ? error.message : 'Əməliyyat tamamlanmadı.';

/** v2 butik ayarları (K8, K11): yalnız sahiblər görür və dəyişir. */
export default function V2Ayarlar() {
  const [ayarlar, setAyarlar] = useState<Ayarlar | null>(null);
  const [form, setForm] = useState<Form>({ beyan: '', kg: '', prim: '' });
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/v2/ayarlar')
      .then((response) => response.json())
      .then((data: { ayarlar: Ayarlar }) => {
        setAyarlar(data.ayarlar);
        setForm(formdan(data.ayarlar));
      })
      .catch((error: unknown) => setMesaj(hataMetni(error)));
  }, []);

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ayarlar) return;
    const degisiklik: Record<string, number | null> = {};
    const beyan = sayi(form.beyan);
    if (beyan !== ayarlar.aylikBeyanSinirUsd) degisiklik.aylik_beyan_sinir_usd = beyan;
    const kg = form.kg.trim() ? sayi(form.kg) : null;
    if (kg !== ayarlar.varsayilanKgFiyatiAzn) degisiklik.varsayilan_kg_fiyati_azn = kg;
    const prim = Math.round(sayi(form.prim) * 100) / 10000;
    if (prim !== ayarlar.primOraniVarsayilan) degisiklik.prim_orani_varsayilan = prim;
    if (Object.keys(degisiklik).length === 0) {
      setMesaj('Dəyişiklik yoxdur.');
      return;
    }
    try {
      const response = await apiFetch('/api/v2/ayarlar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(degisiklik),
      });
      const data = (await response.json()) as { ayarlar: Ayarlar };
      setAyarlar(data.ayarlar);
      setForm(formdan(data.ayarlar));
      setMesaj('Ayarlar yadda saxlanıldı.');
    } catch (error) {
      setMesaj(hataMetni(error));
    }
  };

  const sahe = (key: keyof Form, etiket: string, ipucu: string) => (
    <label className="block text-xs text-slate-400">
      {etiket}
      <input
        inputMode="decimal"
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white"
      />
      <span className="mt-1 block text-[11px] text-slate-500">{ipucu}</span>
    </label>
  );

  return (
    <section aria-labelledby="v2-ayarlar" className="space-y-4">
      <h2 id="v2-ayarlar" className="text-base font-semibold">
        Butik ayarları (v2)
      </h2>
      {ayarlar && !ayarlar.kayitli && (
        <p className="text-xs text-amber-300">
          Hələ yadda saxlanılmayıb: standart dəyərlər göstərilir.
        </p>
      )}
      <form
        onSubmit={kaydet}
        className="grid gap-4 rounded-xl border border-slate-800 p-4 sm:grid-cols-3"
      >
        {sahe('beyan', 'Aylıq bəyan limiti (USD)', 'Alıcı başına aylıq cəm; standart 300.')}
        {sahe('kg', 'Standart kq qiyməti (AZN)', 'Boş: təyin edilməyib.')}
        {sahe('prim', 'Standart prim faizi (%)', 'Prim öncəsi mənfəətdən; standart 5%.')}
        <button
          type="submit"
          disabled={!ayarlar}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3"
        >
          Yadda saxla
        </button>
      </form>
      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}
    </section>
  );
}
