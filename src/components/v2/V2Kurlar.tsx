import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni as cevrilmisHata } from '../../i18n/hata';
import { tarihSaat } from '../../i18n/bicim';
import { bakuTarihi } from '../../shared/bakuTarihi';

type ParaBirimi = 'CAD' | 'USD';
interface Kur {
  id: string;
  paraBirimi: ParaBirimi;
  tarih: string;
  aznKarsiligi: number;
  kaynak: string | null;
  olusturmaZamani: string;
}
interface KurListesi {
  guncel: Record<ParaBirimi, Kur | null>;
  kurlar: Kur[];
}

// Today in Baku, not in UTC (Codex R3 F13).
const bugun = () => bakuTarihi();

/**
 * Kurlar (K4): güncel kur ve son girişler. Kurlar dəyişdirilmir; düzəliş yeni
 * bir girişdir və ən son giriş güncel kur olur. localStorage kuru hələ qalır
 * (kâr hesabı Faz D-də serverə keçəndə götürüləcək).
 */
export default function V2Kurlar() {
  const { t } = useTranslation('v2');
  const hataMetni = (error: unknown) => cevrilmisHata(error, t('ortak.xeta'));
  const [liste, setListe] = useState<KurListesi | null>(null);
  const [para, setPara] = useState<ParaBirimi>('CAD');
  const [tarih, setTarih] = useState(bugun);
  const [oran, setOran] = useState('');
  const [kaynak, setKaynak] = useState('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setListe((await (await apiFetch('/api/v2/kurlar')).json()) as KurListesi);
    } catch (error) {
      setMesaj(hataMetni(error));
    }
  }, []);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault();
    const deger = Number(oran.replace(',', '.'));
    if (!Number.isFinite(deger) || deger <= 0) {
      setMesaj(t('kurlar.musbet'));
      return;
    }
    setGonderiliyor(true);
    setMesaj(null);
    try {
      await apiFetch('/api/v2/kurlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para_birimi: para,
          tarih,
          azn_karsiligi: deger,
          ...(kaynak.trim() ? { kaynak: kaynak.trim() } : {}),
        }),
      });
      setOran('');
      setKaynak('');
      setMesaj(t('kurlar.saxlanildi'));
      await yukle();
    } catch (error) {
      setMesaj(hataMetni(error));
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <section aria-labelledby="v2-kurlar" className="space-y-6">
      <h2 id="v2-kurlar" className="text-base font-semibold">
        {t('kurlar.baslik')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {(['CAD', 'USD'] as const).map((kod) => {
          const kayit = liste?.guncel[kod];
          return (
            <div key={kod} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-400">{t('kurlar.cevirme', { kod })}</p>
              <p className="text-2xl font-bold">{kayit ? kayit.aznKarsiligi : '—'}</p>
              <p className="text-xs text-slate-500">{kayit ? kayit.tarih : t('kurlar.yoxdur')}</p>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={kaydet}
        className="grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-5"
      >
        <label className="text-xs text-slate-400">
          {t('kurlar.valyuta')}
          <select
            value={para}
            onChange={(event) => setPara(event.target.value as ParaBirimi)}
            className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white"
          >
            <option value="CAD">{'CAD'}</option>
            <option value="USD">{'USD'}</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          {t('kurlar.tarix')}
          <input
            type="date"
            value={tarih}
            max={bugun()}
            onChange={(event) => setTarih(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('kurlar.aznQarsiligi')}
          <input
            inputMode="decimal"
            value={oran}
            onChange={(event) => setOran(event.target.value)}
            placeholder="1.2500"
            className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          {t('kurlar.menbeIsteye')}
          <input
            value={kaynak}
            maxLength={100}
            onChange={(event) => setKaynak(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={gonderiliyor}
          className="self-end rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('kurlar.elaveEt')}
        </button>
      </form>
      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}
      <table className="w-full text-start text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2">{t('kurlar.tarix')}</th>
            <th>{t('kurlar.valyuta')}</th>
            <th>{'AZN'}</th>
            <th>{t('kurlar.menbe')}</th>
            <th>{t('kurlar.daxilEdilib')}</th>
          </tr>
        </thead>
        <tbody>
          {(liste?.kurlar ?? []).map((kayit) => (
            <tr key={kayit.id} className="border-t border-slate-800">
              <td className="py-2">{kayit.tarih}</td>
              <td>{kayit.paraBirimi}</td>
              <td>{kayit.aznKarsiligi}</td>
              <td className="text-slate-400">{kayit.kaynak ?? '—'}</td>
              <td className="text-slate-500">{tarihSaat(kayit.olusturmaZamani)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
