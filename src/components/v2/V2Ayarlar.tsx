import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import { DESTEKLENEN_DILLER } from '../../shared/diller';
import { hataMetni } from '../../i18n/hata';
import {
  ayarDegisiklikleri,
  ayarFormu as formdan,
  type AyarDegerleri,
  type AyarFormu as Form,
} from './ayarFormu';

interface Ayarlar extends AyarDegerleri {
  kayitli: boolean;
  /** Boutique default language (migration 20). */
  varsayilanDil?: string;
}

function kendiAdi(dil: string) {
  try {
    const ad = new Intl.DisplayNames([dil], { type: 'language' }).of(dil) ?? dil;
    return ad.charAt(0).toLocaleUpperCase(dil) + ad.slice(1);
  } catch {
    return dil.toUpperCase();
  }
}

/**
 * v2 butik ayarları (K8, K11): yalnız sahiblər görür və dəyişir. Butikin dilini
 * (docs/i18n.md) yalnız PATRON dəyişir; SUPER_ADMIN görür.
 */
export default function V2Ayarlar() {
  const { t } = useTranslation('v2');
  const aktifRol = useAppStore((state) => state.aktifRol);
  const oturumButigi = useAppStore((state) => state.session?.tenantId);
  const seciliFirmaId = useAppStore((state) => state.seciliFirmaId);
  const setButikDili = useAppStore((state) => state.setButikDili);
  const [ayarlar, setAyarlar] = useState<Ayarlar | null>(null);
  const [form, setForm] = useState<Form>({ beyan: '', kg: '', prim: '' });
  const [mesaj, setMesaj] = useState<string | null>(null);
  const dilDegistirebilir = aktifRol === 'PATRON';

  useEffect(() => {
    apiFetch('/api/v2/ayarlar')
      .then((response) => response.json())
      .then((data: { ayarlar: Ayarlar }) => {
        setAyarlar(data.ayarlar);
        setForm(formdan(data.ayarlar));
      })
      .catch((error: unknown) => setMesaj(hataMetni(error, t('ayarlar.xeta'))));
  }, [t]);

  const gonder = async (degisiklik: Record<string, unknown>, basari: string) => {
    try {
      const response = await apiFetch('/api/v2/ayarlar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(degisiklik),
      });
      const data = (await response.json()) as { ayarlar: Ayarlar };
      setAyarlar(data.ayarlar);
      setForm(formdan(data.ayarlar));
      setMesaj(basari);
      return data.ayarlar;
    } catch (error) {
      setMesaj(hataMetni(error, t('ayarlar.xeta')));
      return null;
    }
  };

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ayarlar) return;
    // Codex R3 F11: a typo is an error, never a cleared value.
    const sonuc = ayarDegisiklikleri(ayarlar, form);
    if (sonuc.hata !== undefined) {
      setMesaj(t(sonuc.hata));
      return;
    }
    if (Object.keys(sonuc.degisiklik).length === 0) {
      setMesaj(t('ayarlar.degisiklikYoxdur'));
      return;
    }
    await gonder(sonuc.degisiklik, t('ayarlar.saxlanildi'));
  };

  const dilKaydet = async (dil: string) => {
    const yeni = await gonder({ varsayilan_dil: dil }, t('ayarlar.dil.saxlanildi'));
    // The owner's own boutique: the interface and documents follow at once.
    if (yeni?.varsayilanDil && seciliFirmaId === oturumButigi) setButikDili(yeni.varsayilanDil);
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
        {t('ayarlar.baslik')}
      </h2>
      {ayarlar && !ayarlar.kayitli && (
        <p className="text-xs text-amber-300">{t('ayarlar.kaydedilmeyib')}</p>
      )}
      <form
        onSubmit={kaydet}
        className="grid gap-4 rounded-xl border border-slate-800 p-4 sm:grid-cols-3"
      >
        {sahe('beyan', t('ayarlar.beyan'), t('ayarlar.beyanIpucu'))}
        {sahe('kg', t('ayarlar.kg'), t('ayarlar.kgIpucu'))}
        {ayarlar?.primOraniVarsayilan !== undefined &&
          sahe('prim', t('ayarlar.prim'), t('ayarlar.primIpucu'))}
        <button
          type="submit"
          disabled={!ayarlar}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3"
        >
          {t('ayarlar.yaddaSaxla')}
        </button>
      </form>

      {ayarlar?.varsayilanDil && (
        <div className="space-y-2 rounded-xl border border-slate-800 p-4">
          <label className="block text-xs text-slate-400">
            {t('ayarlar.dil.baslik')}
            <select
              value={ayarlar.varsayilanDil}
              disabled={!dilDegistirebilir}
              onChange={(event) => void dilKaydet(event.target.value)}
              className="mt-1 block w-full rounded-lg bg-slate-800 p-2 text-sm text-white disabled:opacity-60 sm:w-64"
            >
              {DESTEKLENEN_DILLER.map((dil) => (
                <option key={dil} value={dil} lang={dil}>
                  {kendiAdi(dil)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">{t('ayarlar.dil.aciklama')}</p>
          {!dilDegistirebilir && (
            <p className="text-[11px] text-amber-300">{t('ayarlar.dil.yalnizPatron')}</p>
          )}
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
