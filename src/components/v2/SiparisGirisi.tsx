import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni as cevrilmisHata } from '../../i18n/hata';
import { sayi } from '../../i18n/bicim';
import { useAppStore } from '../../store/appStore';
import { PLATFORM_ROLU, rolGrubunda } from '../../shared/roller';
import SatirTablosu from './SatirTablosu';
import SiparisListesi, { type V2SiparisOzeti } from './SiparisListesi';
import { KUCULTME, gorseliKucult, type GonderilecekGorsel } from './gorselKucult';
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

const girdi = 'mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white';
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
  const { t } = useTranslation('v2');
  const hataMetni = (error: unknown) => cevrilmisHata(error, t('ortak.xeta'));
  const aktifRol = useAppStore((state) => state.aktifRol);
  const girebilir = rolGrubunda(aktifRol, 'SALES');
  const sahipSecebilir = rolGrubunda(aktifRol, 'OWNERS');
  // A platform admin is not a team member: it always names the owner (O-24).
  const sahipZorunlu = aktifRol === PLATFORM_ROLU;
  const [form, setForm] = useState<SiparisFormu>(bosForm);
  const [adaylar, setAdaylar] = useState<AyristirmaSonucu['musteriAdaylari']>([]);
  const [eksik, setEksik] = useState<string[]>([]);
  const [hatalar, setHatalar] = useState<string[]>([]);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState<'ai' | 'kayit' | null>(null);
  const [sahipler, setSahipler] = useState<Sahip[]>([]);
  const [siparisler, setSiparisler] = useState<V2SiparisOzeti[]>([]);
  // A9b: screenshots, downscaled in the browser; used for the suggestion only, never stored.
  const [gorseller, setGorseller] = useState<Array<GonderilecekGorsel & { ad: string }>>([]);

  const gorselSec = async (files: FileList | null) => {
    const secilen = Array.from(files ?? []).slice(0, KUCULTME.adet - gorseller.length);
    setMesaj(null);
    try {
      const yeni = await Promise.all(
        secilen.map(async (file) => ({ ...(await gorseliKucult(file)), ad: file.name }))
      );
      setGorseller([...gorseller, ...yeni]);
    } catch (error) {
      setMesaj(hataMetni(error));
    }
  };

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
    if (!form.hamMesaj.trim() && !gorseller.length) return;
    setBekliyor('ai');
    setMesaj(null);
    try {
      const response = await apiFetch(
        '/api/v2/siparisler/ayristir',
        json({
          ...(form.hamMesaj.trim() ? { ham_mesaj: form.hamMesaj } : {}),
          ...(gorseller.length
            ? {
                gorseller: gorseller.map(({ mime_type, veri_base64 }) => ({
                  mime_type,
                  veri_base64,
                })),
              }
            : {}),
        })
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
    const { govde, hatalar: yeniHatalar } = formdanIstek(form, { sahipZorunlu });
    setHatalar(yeniHatalar);
    if (!govde) return;
    setBekliyor('kayit');
    setMesaj(null);
    try {
      await apiFetch('/api/v2/siparisler', json(govde));
      setForm(bosForm());
      setGorseller([]);
      setAdaylar([]);
      setEksik([]);
      setMesaj(t('siparis.saxlanildi'));
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
        {t('siparis.baslik')}
      </h2>
      {girebilir && (
        <form onSubmit={kaydet} className="space-y-6 rounded-xl border border-slate-800 p-4">
          <div>
            <label className="block text-xs text-slate-400">
              {t('siparis.mesaj')}
              <textarea
                value={form.hamMesaj}
                onChange={(event) => alan('hamMesaj')(event.target.value)}
                rows={4}
                maxLength={20000}
                className={girdi}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <label className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800">
                {t('siparis.gorselEkle', { sayi: gorseller.length, en: KUCULTME.adet })}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={gorseller.length >= KUCULTME.adet || bekliyor !== null}
                  onChange={(event) => {
                    void gorselSec(event.target.files);
                    event.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>
              {gorseller.map((g, index) => (
                <button
                  key={`${g.ad}-${index}`}
                  type="button"
                  onClick={() => setGorseller(gorseller.filter((_, i) => i !== index))}
                  className="rounded-full border border-slate-700 px-2 py-0.5"
                  aria-label={t('siparis.gorselSil', { ad: g.ad })}
                >
                  {g.ad} ×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={ayristir}
              disabled={bekliyor !== null || (!form.hamMesaj.trim() && !gorseller.length)}
              className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {bekliyor === 'ai' ? t('siparis.ayrisdirilir') : t('siparis.aiAyir')}
            </button>
            {eksik.length > 0 && (
              <ul className="mt-2 list-disc ps-5 text-xs text-amber-300">
                {eksik.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(['musteriAdi', 'telefon', 'instagram', 'sehir', 'adres', 'ozelNot'] as const).map(
              (key) => (
                <label key={key} className="text-xs text-slate-400">
                  {t(`siparis.alan.${key}`)}
                  <input
                    value={form[key]}
                    onChange={(event) => alan(key)(event.target.value)}
                    className={girdi}
                  />
                </label>
              )
            )}
          </div>

          <div className="text-xs text-slate-400">
            {form.musteriId ? (
              <p>
                {t('siparis.kartaBagli', { id: form.musteriId })}{' '}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, musteriId: null })}
                  className="text-sky-400 underline"
                >
                  {t('siparis.baglantiSil')}
                </button>
              </p>
            ) : (
              <p>{t('siparis.kartYoxdur')}</p>
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
              {t('siparis.sahib')}
              <select
                value={form.sahipKullaniciId ?? ''}
                onChange={(event) =>
                  setForm({ ...form, sahipKullaniciId: event.target.value || null })
                }
                className={girdi}
              >
                <option value="">
                  {sahipZorunlu ? t('siparis.sahibSecin') : t('siparis.men')}
                </option>
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
          <p className="text-end text-sm text-slate-200">
            {t('siparis.cem')}{' '}
            <strong>
              {sayi(formToplami(form))} {'AZN'}
            </strong>
          </p>

          {hatalar.length > 0 && (
            <ul role="alert" className="list-disc ps-5 text-xs text-rose-300">
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
            {bekliyor === 'kayit' ? t('siparis.saxlanilir') : t('siparis.tesdiqle')}
          </button>
        </form>
      )}

      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}

      <SiparisListesi siparisler={siparisler} sahipAdi={sahipAdi} onDegisti={listeyiYukle} />
    </section>
  );
}
