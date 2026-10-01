import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/apiClient';
import { hataMetni as cevrilmisHata } from '../../i18n/hata';
import { tarihSaat } from '../../i18n/bicim';
import { useAppStore } from '../../store/appStore';
import {
  YONTEMLER,
  azn,
  bosOdemeFormu,
  durumAdi,
  kaynakAdi,
  kaynakSecenekleri,
  odemeIstegi,
  tersKayitIstegi,
  tersKayitYapilabilir,
  type OdemeDefteriYaniti,
  type OdemeFormu,
} from './odemeFormu';

const girdi = 'mt-1 w-full rounded-lg bg-slate-800 p-2 text-sm text-white';
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Bir v2 siparişinin ödeme defteri (A10): özet, satırlar, yeni ödeme ve ters kayıt.
 * Silme yok; düzeltme ters kayıttır (K16). Durum defterden türetilir.
 */
export default function OdemeDefteri({
  siparisId,
  onDegisti,
}: {
  siparisId: string;
  onDegisti?: () => void;
}) {
  const { t } = useTranslation('v2');
  const hataMetni = (error: unknown) => cevrilmisHata(error, t('ortak.xeta'));
  const aktifRol = useAppStore((state) => state.aktifRol);
  const kullaniciId = useAppStore((state) => state.session?.id ?? null);
  const kaynaklar = kaynakSecenekleri(aktifRol);
  const [defter, setDefter] = useState<OdemeDefteriYaniti | null>(null);
  const [form, setFormState] = useState<OdemeFormu>(() => bosOdemeFormu(kaynaklar[0]));
  // One operation key per payment intent (Codex R3 F15): a retry of the same form sends
  // the same key, so a payment whose answer was lost is not recorded twice. Any change
  // of the form, or a recorded payment, starts a new intent.
  const islemAnahtari = useRef<string | null>(null);
  const setForm = (yeni: OdemeFormu) => {
    islemAnahtari.current = null;
    setFormState(yeni);
  };
  const [hatalar, setHatalar] = useState<string[]>([]);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [tersAcik, setTersAcik] = useState<string | null>(null);
  const [gerekce, setGerekce] = useState('');

  const yukle = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/v2/siparisler/${siparisId}/odemeler`);
      setDefter((await response.json()) as OdemeDefteriYaniti);
    } catch (error) {
      setMesaj(hataMetni(error));
    }
  }, [siparisId]);
  useEffect(() => {
    setDefter(null);
    setMesaj(null);
    void yukle();
  }, [yukle]);

  const gonder = async (url: string, body: unknown, basari: string) => {
    setBekliyor(true);
    setMesaj(null);
    try {
      await apiFetch(url, json(body));
      setMesaj(basari);
      await yukle();
      onDegisti?.();
      return true;
    } catch (error) {
      setMesaj(hataMetni(error));
      return false;
    } finally {
      setBekliyor(false);
    }
  };

  const kaydet = async (event: React.FormEvent) => {
    event.preventDefault();
    islemAnahtari.current ??= crypto.randomUUID();
    const { govde, hatalar: yeni } = odemeIstegi(siparisId, form, islemAnahtari.current);
    setHatalar(yeni);
    if (govde && (await gonder('/api/v2/odemeler', govde, t('odeme.defter.yazildi'))))
      setForm(bosOdemeFormu(form.kaynak));
  };

  const tersKaydet = async (odemeId: string) => {
    const { govde, hata } = tersKayitIstegi(gerekce);
    if (!govde) return setMesaj(hata);
    if (
      await gonder(
        `/api/v2/odemeler/${odemeId}/ters-kayit`,
        govde,
        t('odeme.defter.geriQaytarildi')
      )
    ) {
      setTersAcik(null);
      setGerekce('');
    }
  };

  if (!defter)
    return <p className="text-sm text-slate-400">{mesaj ?? t('odeme.defter.yuklenir')}</p>;
  const { ozet } = defter;
  return (
    <section aria-label={t('odeme.defter.etiket')} className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {(
          [
            [t('odeme.defter.cem'), azn(ozet.toplamTutar)],
            [t('odeme.defter.odenib'), azn(ozet.odenenTutar)],
            [t('odeme.defter.qaliq'), azn(ozet.kalanTutar)],
            [t('odeme.defter.veziyyet'), durumAdi(ozet.durum)],
          ] as const
        ).map(([ad, deger]) => (
          <div key={ad} className="rounded-lg bg-slate-900 p-3">
            <dt className="text-xs text-slate-400">{ad}</dt>
            <dd className="font-semibold">{deger}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full text-start text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2">{t('odeme.defter.tarix')}</th>
            <th>{t('odeme.defter.mebleg')}</th>
            <th>{t('odeme.defter.usul')}</th>
            <th>{t('odeme.defter.menbe')}</th>
            <th>{t('odeme.defter.qeyd')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {defter.odemeler.length === 0 && (
            <tr>
              <td colSpan={6} className="py-2 text-slate-400">
                {t('odeme.defter.bos')}
              </td>
            </tr>
          )}
          {defter.odemeler.map((satir) => (
            <tr key={satir.id} className="border-t border-slate-800 align-top">
              <td className="py-2 text-slate-400">{tarihSaat(satir.almaZamani)}</td>
              <td className={satir.tutarAzn < 0 ? 'text-rose-300' : ''}>{azn(satir.tutarAzn)}</td>
              <td>{YONTEMLER.find((y) => y.id === satir.yontem)?.ad ?? satir.yontem}</td>
              <td>{kaynakAdi(satir.kaynak)}</td>
              <td className="text-slate-400">
                {satir.tersKayitOdemeId ? `${t('odeme.defter.geriQaytarma')} ` : ''}
                {satir.aciklama ?? ''}
                {satir.tersKaydiVar ? ` ${t('odeme.defter.geriQaytarilib')}` : ''}
              </td>
              <td className="text-end">
                {tersKayitYapilabilir(aktifRol, kullaniciId, satir) &&
                  (tersAcik === satir.id ? (
                    <span className="flex gap-2">
                      <input
                        aria-label={t('odeme.defter.sebeb')}
                        value={gerekce}
                        maxLength={500}
                        onChange={(event) => setGerekce(event.target.value)}
                        className="rounded bg-slate-800 p-1 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={bekliyor}
                        onClick={() => void tersKaydet(satir.id)}
                        className="rounded bg-rose-700 px-2 text-xs text-white disabled:opacity-50"
                      >
                        {t('odeme.defter.tesdiqle')}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTersAcik(satir.id);
                        setGerekce('');
                      }}
                      className="text-xs text-rose-300 underline"
                    >
                      {t('odeme.defter.geriQaytar')}
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {kaynaklar.length > 0 && (
        <form
          onSubmit={kaydet}
          className="grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-5"
        >
          <label className="text-xs text-slate-400">
            {t('odeme.defter.meblegAzn')}
            <input
              inputMode="decimal"
              value={form.tutar}
              onChange={(event) => setForm({ ...form, tutar: event.target.value })}
              className={girdi}
            />
          </label>
          <label className="text-xs text-slate-400">
            {t('odeme.defter.usul')}
            <select
              value={form.yontem}
              onChange={(event) =>
                setForm({ ...form, yontem: event.target.value as OdemeFormu['yontem'] })
              }
              className={girdi}
            >
              {YONTEMLER.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.ad}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            {t('odeme.defter.menbe')}
            <select
              value={form.kaynak}
              onChange={(event) =>
                setForm({ ...form, kaynak: event.target.value as OdemeFormu['kaynak'] })
              }
              className={girdi}
            >
              {kaynaklar.map((k) => (
                <option key={k} value={k}>
                  {kaynakAdi(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            {t('odeme.defter.qeyd')}
            <input
              value={form.aciklama}
              maxLength={500}
              onChange={(event) => setForm({ ...form, aciklama: event.target.value })}
              className={girdi}
            />
          </label>
          <button
            type="submit"
            disabled={bekliyor}
            className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('odeme.defter.odenisYaz')}
          </button>
          {hatalar.length > 0 && (
            <ul role="alert" className="list-disc ps-5 text-xs text-rose-300 sm:col-span-5">
              {hatalar.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </form>
      )}
      {mesaj && (
        <p role="status" className="text-sm text-slate-300">
          {mesaj}
        </p>
      )}
    </section>
  );
}
