import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  eslesmeleriOnayla,
  onerileriGetir,
  type EslesmeRaporu,
  type EslesmeSecimi,
  type ManifestSatirOnerisi,
  type OnaySonucu,
  type SatirDurumu,
} from './manifestEslestirmeApi';
import EslestirmeSatirlari from './EslestirmeSatirlari';
import CakismaListesi from './CakismaListesi';

// v2 (VITE_FF_V2_FLOW): manifest rows are only SUGGESTED. Nothing is written until
// the user explicitly confirms selected pairs; weak/ambiguous rows are never pre-selected.

const RED_SEBEBI: Record<string, string> = {
  SIPARIS_BULUNAMADI: 'sifariş tapılmadı',
  TESLIM_EDILDI: 'sifariş təhvil verilib',
  MEVCUT_AWB: 'sifarişin artıq AWB-si var',
  AWB_BASKA_SIPARISTE: 'bu AWB başqa sifarişdədir',
};

const OZET_SIRASI: Array<[SatirDurumu, string]> = [
  ['ONERILDI', 'Güclü təklif'],
  ['BELIRSIZ', 'Qeyri-müəyyən'],
  ['ZAYIF_ADAY', 'Zəif namizəd'],
  ['ZATEN_BAGLI', 'Artıq bağlı'],
  ['CAKISMA', 'Konflikt'],
  ['ESLESME_YOK', 'Uyğunluq yoxdur'],
  ['GECERSIZ_AWB', 'Etibarsız AWB'],
];

interface Props {
  dosyaBase64: string;
  dosyaAdi: string;
  onKapat: () => void;
  onOnaylandi: () => Promise<void> | void;
}

export default function ManifestEslestirmePaneli({ dosyaBase64, dosyaAdi, onKapat, onOnaylandi }: Props) {
  const [rapor, setRapor] = useState<EslesmeRaporu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [secimler, setSecimler] = useState<Record<number, string>>({});
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [sonuc, setSonuc] = useState<OnaySonucu | null>(null);
  const [surum, setSurum] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setYukleniyor(true);
    setHata(null);
    onerileriGetir(dosyaBase64, dosyaAdi, controller.signal)
      .then((data) => {
        setRapor(data);
        const onceden: Record<number, string> = {};
        for (const satir of data.satirlar)
          if (satir.durum === 'ONERILDI' && satir.onerilenSiparisId)
            onceden[satir.satirNo] = satir.onerilenSiparisId;
        setSecimler(onceden);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setHata(error instanceof Error ? error.message : 'Təkliflər alına bilmədi.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setYukleniyor(false);
      });
    return () => controller.abort();
  }, [dosyaBase64, dosyaAdi, surum]);

  const secilenler = useMemo<EslesmeSecimi[]>(
    () =>
      (rapor?.satirlar ?? []).flatMap((satir: ManifestSatirOnerisi): EslesmeSecimi[] => {
        const siparisId = secimler[satir.satirNo];
        return siparisId ? [{ siparisId, takipNo: satir.takipNo, agirlikKg: satir.agirlikKg }] : [];
      }),
    [rapor, secimler]
  );
  const tekrarVar = useMemo(
    () => new Set(secilenler.map((secim: EslesmeSecimi) => secim.siparisId)).size !== secilenler.length,
    [secilenler]
  );

  const sec = useCallback((satirNo: number, siparisId: string | null) => {
    setSonuc(null);
    setSecimler((onceki: Record<number, string>) => {
      const sonraki = { ...onceki };
      if (siparisId) sonraki[satirNo] = siparisId;
      else delete sonraki[satirNo];
      return sonraki;
    });
  }, []);

  const onayla = async () => {
    if (secilenler.length === 0 || tekrarVar || onaylaniyor) return;
    setOnaylaniyor(true);
    setHata(null);
    try {
      const sonucVerisi = await eslesmeleriOnayla(secilenler);
      setSonuc(sonucVerisi);
      if (sonucVerisi.basarili) {
        await onOnaylandi();
        setSurum((deger: number) => deger + 1);
      }
    } catch (error: unknown) {
      setHata(error instanceof Error ? error.message : 'Təsdiq alınmadı.');
    } finally {
      setOnaylaniyor(false);
    }
  };

  return (
    <section
      aria-label="Manifest eşləşdirmə təklifləri"
      className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 shadow-xs space-y-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            Manifest eşləşdirmə təklifləri
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {dosyaAdi} · Heç bir AWB avtomatik yazılmır; yalnız seçib təsdiqlədiyiniz cütlər yazılır.
            Ad oxşarlığı yalnız zəif namizəddir və əvvəlcədən seçilmir.
          </p>
        </div>
        <button type="button" onClick={onKapat} aria-label="Bağla" className="p-1 rounded-md text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </header>

      {yukleniyor && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Təkliflər hazırlanır...
        </div>
      )}
      {hata && (
        <div role="alert" className="p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800">
          {hata}
        </div>
      )}

      {rapor && !yukleniyor && (
        <>
          <div className="flex flex-wrap gap-2">
            {OZET_SIRASI.filter(([durum]) => (rapor.ozet[durum] ?? 0) > 0).map(([durum, etiket]) => (
              <span key={durum} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-2xs font-bold text-slate-600 dark:text-slate-300">
                {etiket}: {rapor.ozet[durum]}
              </span>
            ))}
          </div>
          <EslestirmeSatirlari satirlar={rapor.satirlar} secimler={secimler} onSec={sec} />
          <CakismaListesi cakismalar={rapor.cakismalar} />
          <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {secilenler.length} cüt seçilib
              {tekrarVar && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" /> Eyni sifariş bir neçə sətirdə seçilib
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onayla}
              disabled={secilenler.length === 0 || tekrarVar || onaylaniyor}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {onaylaniyor ? 'Yazılır...' : 'Seçilənləri təsdiqlə'}
            </button>
          </footer>
        </>
      )}

      {sonuc && (
        <div
          role="status"
          className={`p-3 rounded-xl text-xs border ${
            sonuc.basarili
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {sonuc.basarili ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {sonuc.mesaj}
          </div>
          {sonuc.reddedilenler.length > 0 && (
            <ul className="mt-2 space-y-0.5 list-disc pl-5">
              {sonuc.reddedilenler.map((red: OnaySonucu['reddedilenler'][number]) => (
                <li key={`${red.siparisId}-${red.takipNo}`}>
                  <span className="font-mono">{red.takipNo}</span>: {RED_SEBEBI[red.sebep] ?? red.sebep}
                  {red.mevcutAwb ? ` (${red.mevcutAwb})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
