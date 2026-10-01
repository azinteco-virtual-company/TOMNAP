import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { Siparis } from '../types';
import { loadSpreadsheet, loadPdf, reportDocumentError } from '../utils/documentLibraries';
import { safePrintHtml } from '../utils/pdfHelpers';
import { useAppStore } from '../store/appStore';
import { fetchWithRetry } from '../lib/apiClient';
import { KargoEntegrasyonModal } from './KargoEntegrasyonModal';
import { AWB_REVIEW_ENABLED } from '../lib/featureFlags';
import { useBelgeCevirisi, useBelgeDili } from '../i18n/belge';
import {
  bugununTarihi,
  kuryeMetni,
  manifestoExcelVerisi,
  manifestoOzeti,
  type ManifestoBaglami,
} from '../belgeler/manifesto';
import { manifestoYazdirmaSablonu, paketEtiketleriSablonu } from '../belgeler/manifestoYazdirma';
import { ManifestoBasligi } from './kargoManifesto/ManifestoBasligi';
import { ManifestoFiltreleri, ManifestoIstatistikleri } from './kargoManifesto/ManifestoFiltreleri';
import { ManifestoTablosu } from './kargoManifesto/ManifestoTablosu';
import {
  VARSAYILAN_FILTRE,
  manifestoyuFiltrele,
  sehirListesi,
  tarihAraligi,
  type ManifestoFiltresi,
  type TarihOnAyari,
} from './kargoManifesto/manifestoFiltresi';

// Manifest AWB review: a separate chunk, built and loaded only when VITE_FF_AWB_REVIEW
// is on; with the flag off the import is not in the build at all (Codex R3 F18).
const ManifestEslestirmePaneli = AWB_REVIEW_ENABLED
  ? lazy(() => import('./awb-eslestirme/ManifestEslestirmePaneli'))
  : null;

interface KargoManifestoSayfasiProps {
  siparisler: Siparis[];
  onSiparislereDon?: () => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
}

/**
 * Kargo manifestosu (docs/i18n.md, B1): ekran arayüz dilinde; yazdırılan manifesto, paket
 * etiketleri, Excel, PDF ve kurye metni butiğin belge dilinde (src/belgeler).
 */
export const KargoManifestoSayfasi: React.FC<KargoManifestoSayfasiProps> = ({
  siparisler,
  onSiparislereDon,
  onSiparisDetayAc,
}) => {
  const { t } = useTranslation('kargo');
  const bt = useBelgeCevirisi();
  const [filtre, setFiltre] = useState<ManifestoFiltresi>(VARSAYILAN_FILTRE);
  const [onAyar, setOnAyar] = useState<TarihOnAyari>('hepsi');
  const [kopyalandi, setKopyalandi] = useState(false);
  const [yazdiriliyor, setYazdiriliyor] = useState(false);
  const [pdfHazirlaniyor, setPdfHazirlaniyor] = useState(false);
  const [excelHazirlaniyor, setExcelHazirlaniyor] = useState(false);

  const { seciliFirmaId, siparisleriYukle, firmalar } = useAppStore();
  const belgeDili = useBelgeDili();
  const [awbManifest, setAwbManifest] = useState<{ base64: string; ad: string } | null>(null);
  const [kargoModalAcik, setKargoModalAcik] = useState(false);
  const [senkronize, setSenkronize] = useState(false);
  const [dispatchYukleniyor, setDispatchYukleniyor] = useState(false);
  const [bildirim, setBildirim] = useState<{ tip: 'basari' | 'hata'; mesaj: string } | null>(null);
  const dispatchInputRef = React.useRef<HTMLInputElement>(null);

  const butik = firmalar.find((f) => f.id === seciliFirmaId)?.ad || t('baslik.butunButikler');
  const dahil = useMemo(() => manifestoyuFiltrele(siparisler, filtre), [siparisler, filtre]);
  const ozet = useMemo(() => manifestoOzeti(dahil), [dahil]);
  const sehirler = useMemo(() => sehirListesi(siparisler), [siparisler]);
  const baglam = (): ManifestoBaglami => ({ bt, butik, bugun: bugununTarihi() });

  const degis = (degisiklik: Partial<ManifestoFiltresi>) =>
    setFiltre((onceki) => ({ ...onceki, ...degisiklik }));
  const sifirla = () => {
    setFiltre(VARSAYILAN_FILTRE);
    setOnAyar('hepsi');
  };

  const handleSenkronize = async () => {
    setSenkronize(true);
    setBildirim(null);
    try {
      const res = await fetchWithRetry('/api/kargo/senkronize-et', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: seciliFirmaId || 'all' }),
      });
      const data = (await res.json()) as { basarili?: boolean; mesaj?: string; hata?: string };
      if (data.basarili) {
        await siparisleriYukle();
        setBildirim({ tip: 'basari', mesaj: data.mesaj || t('bildirim.senkronOk') });
        setTimeout(() => setBildirim(null), 6000);
      } else {
        setBildirim({ tip: 'hata', mesaj: data.hata || t('bildirim.senkronHata') });
      }
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      setBildirim({ tip: 'hata', mesaj: t('bildirim.serverHatasi', { mesaj }) });
    } finally {
      setSenkronize(false);
    }
  };

  const handleDispatchDosyaSecildi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDispatchYukleniyor(true);
    setBildirim(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string) || '';
        if (AWB_REVIEW_ENABLED) {
          // Nothing is written on upload; the user reviews and confirms suggestions.
          setAwbManifest({ base64, ad: file.name });
          return;
        }
        const res = await fetchWithRetry('/api/kargo/manifesto-yukle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dosya_base64: base64,
            dosya_adi: file.name,
            tenantId: seciliFirmaId,
            otomatik_esle: true,
          }),
        });
        const data = (await res.json()) as {
          basarili?: boolean;
          mesaj?: string;
          hata?: string;
          hatalar?: string[];
        };
        if (data.basarili) {
          await siparisleriYukle();
          setBildirim({ tip: 'basari', mesaj: data.mesaj || t('bildirim.excelOk') });
          setTimeout(() => setBildirim(null), 7000);
        } else {
          setBildirim({
            tip: 'hata',
            mesaj: data.hata || data.hatalar?.[0] || t('bildirim.faylHata'),
          });
        }
      } catch (err) {
        const mesaj = err instanceof Error ? err.message : String(err);
        setBildirim({ tip: 'hata', mesaj: t('bildirim.yuklemeHatasi', { mesaj }) });
      } finally {
        setDispatchYukleniyor(false);
        if (dispatchInputRef.current) dispatchInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const excelIndir = async () => {
    if (excelHazirlaniyor) return;
    setExcelHazirlaniyor(true);
    try {
      const XLSX = await loadSpreadsheet();
      const veri = manifestoExcelVerisi(dahil, ozet, baglam());
      const ws = XLSX.utils.aoa_to_sheet([veri.baslik, ...veri.satirlar]);
      ws['!cols'] = [6, 22, 16, 14, 28, 32, 14, 8, 14, 14, 16, 18, 20, 22, 26, 26].map((wch) => ({
        wch,
      }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, veri.sayfa);
      XLSX.writeFile(wb, veri.dosya);
    } catch (err) {
      console.error('Excel endirmə xətası:', err);
      reportDocumentError(err);
    } finally {
      setExcelHazirlaniyor(false);
    }
  };

  const pdfIndir = async () => {
    if (pdfHazirlaniyor) return;
    setPdfHazirlaniyor(true);
    try {
      const [araclar, { manifestoPdfOlustur, manifestoPdfDosyaAdi }] = await Promise.all([
        loadPdf(),
        import('../belgeler/manifestoPdf'),
      ]);
      const doc = await manifestoPdfOlustur(araclar, dahil, ozet, belgeDili, baglam());
      doc.save(manifestoPdfDosyaAdi(bt));
    } catch (err) {
      console.error('PDF hazırlama xətası:', err);
      reportDocumentError(err);
    } finally {
      setPdfHazirlaniyor(false);
    }
  };

  const handleYazdir = () => {
    setYazdiriliyor(true);
    try {
      safePrintHtml(
        manifestoYazdirmaSablonu(dahil, ozet, belgeDili, baglam()),
        'Kargo_Manifestosu'
      );
    } catch (e) {
      console.error('Yazdırma xətası:', e);
      alert(t('bildirim.yazdirmaHata'));
    } finally {
      setYazdiriliyor(false);
    }
  };

  const handleEtiketleriYazdir = () => {
    setYazdiriliyor(true);
    try {
      safePrintHtml(paketEtiketleriSablonu(dahil, belgeDili, baglam()), 'Kargo_Etiketleri');
    } catch (e) {
      console.error('Etiket yazdırma xətası:', e);
      alert(t('bildirim.etiketHata'));
    } finally {
      setYazdiriliyor(false);
    }
  };

  const metinKopyala = () => {
    navigator.clipboard.writeText(kuryeMetni(dahil, ozet, baglam()));
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2500);
  };

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={dispatchInputRef}
        onChange={handleDispatchDosyaSecildi}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />
      <ManifestoBasligi
        butik={butik}
        onSiparislereDon={onSiparislereDon}
        onSenkronize={handleSenkronize}
        onDispatchSec={() => dispatchInputRef.current?.click()}
        onExcel={excelIndir}
        onPdf={pdfIndir}
        onYazdir={handleYazdir}
        onEtiketler={handleEtiketleriYazdir}
        onAyarlar={() => setKargoModalAcik(true)}
        senkronize={senkronize}
        dispatchYukleniyor={dispatchYukleniyor}
        excelHazirlaniyor={excelHazirlaniyor}
        pdfHazirlaniyor={pdfHazirlaniyor}
        yazdiriliyor={yazdiriliyor}
      />

      {bildirim && (
        <div
          role={bildirim.tip === 'hata' ? 'alert' : 'status'}
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-xs border animate-in fade-in duration-200 ${
            bildirim.tip === 'basari'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {bildirim.tip === 'basari' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{bildirim.mesaj}</span>
          </div>
          <button
            type="button"
            onClick={() => setBildirim(null)}
            aria-label={t('ortak:bagla')}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {ManifestEslestirmePaneli && awbManifest && (
        <Suspense fallback={<div className="text-xs text-slate-500">{t('ortak:yukleniyor')}</div>}>
          <ManifestEslestirmePaneli
            dosyaBase64={awbManifest.base64}
            dosyaAdi={awbManifest.ad}
            onKapat={() => setAwbManifest(null)}
            onOnaylandi={() => siparisleriYukle()}
          />
        </Suspense>
      )}

      <ManifestoIstatistikleri ozet={ozet} />

      <ManifestoFiltreleri
        siparisler={siparisler}
        sehirler={sehirler}
        filtre={filtre}
        onizleme={onAyar}
        kopyalandi={kopyalandi}
        onDegis={degis}
        onOnAyar={(secilen) => {
          setOnAyar(secilen);
          degis(tarihAraligi(secilen));
        }}
        onTarih={(alan, deger) => {
          setOnAyar('ozel');
          degis({ [alan]: deger });
        }}
        onKopyala={metinKopyala}
        onSifirla={sifirla}
      />

      <ManifestoTablosu
        liste={dahil}
        ozet={ozet}
        filtre={filtre}
        onSifirla={sifirla}
        onSiparisDetayAc={onSiparisDetayAc}
      />

      <KargoEntegrasyonModal
        acik={kargoModalAcik}
        onKapat={() => setKargoModalAcik(false)}
        seciliTenantId={seciliFirmaId}
        onAyarlarGuncellendi={() => {
          siparisleriYukle();
        }}
      />
    </div>
  );
};
