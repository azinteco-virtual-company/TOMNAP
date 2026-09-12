import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Siparis } from '../types';
import {
  Plane,
  Truck,
  Globe,
  RefreshCw,
  Upload,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  ExternalLink,
  Package,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Activity,
  Save,
  Check,
  Copy,
  Calendar,
  Layers,
  MapPin,
  Clock
} from 'lucide-react';
import { useDil } from '../context/DilKonteksti';
import { fetchWithRetry } from '../lib/apiClient';
import { useAppStore } from '../store/appStore';

interface KargoMerkeziSayfasiProps {
  siparisler: Siparis[];
  onSiparisDetayAc?: (siparis: Siparis) => void;
}

type TabTipi = 'izleme' | 'dispatch' | 'ayarlar';

export const KargoMerkeziSayfasi: React.FC<KargoMerkeziSayfasiProps> = ({
  siparisler,
  onSiparisDetayAc,
}) => {
  const { t } = useDil();
  const { seciliFirmaId, siparisleriYukle } = useAppStore();

  const [aktifTab, setAktifTab] = useState<TabTipi>('izleme');
  const [aramaMetni, setAramaMetni] = useState('');
  const [hizliAwbSorgu, setHizliAwbSorgu] = useState('');
  const [hizliSorguSonuc, setHizliSorguSonuc] = useState<any>(null);
  const [hizliSorguYukleniyor, setHizliSorguYukleniyor] = useState(false);

  // Senkronizasyon Durumu
  const [senkronizeEdiliyor, setSenkronizeEdiliyor] = useState(false);
  const [bildirim, setBildirim] = useState<{ tip: 'basari' | 'hata'; mesaj: string } | null>(null);

  // Daily Dispatch Dosya Yükleme Durumu
  const [dispatchYukleniyor, setDispatchYukleniyor] = useState(false);
  const [dispatchSonuc, setDispatchSonuc] = useState<any>(null);
  const [suruklemeAktiv, setSuruklemeAktiv] = useState(false);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  // Ayarlar Formu State
  const [ayarlarYukleniyor, setAyarlarYukleniyor] = useState(false);
  const [ayarlarKaydediliyor, setAyarlarKaydediliyor] = useState(false);
  const [testEdiliyor, setTestEdiliyor] = useState(false);
  const [testSonucu, setTestSonucu] = useState<any>(null);

  const [saglayici, setSaglayici] = useState('ARAMEX');
  const [cikisUlkesi, setCikisUlkesi] = useState('CA');
  const [cikisSehri, setCikisSehri] = useState('Toronto (YYZ)');
  const [varisUlkesi, setVarisUlkesi] = useState('AZ');
  const [varisHavalimani, setVarisHavalimani] = useState('Heydər Əliyev Beynəlxalq Hava Limanı (GYD)');
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [hesapNo, setHesapNo] = useState('72470858');
  const [pin, setPin] = useState('');
  const [entity, setEntity] = useState('YYZ');
  const [testModu, setTestModu] = useState(true);

  const [saglayicilar, setSaglayicilar] = useState<any[]>([]);
  const [ulkeler, setUlkeler] = useState<any[]>([]);

  // Ayarları Yükle
  const yukleAyarlar = () => {
    setAyarlarYukleniyor(true);
    fetchWithRetry(`/api/kargo/ayarlar?tenant_id=${encodeURIComponent(seciliFirmaId || 'kanada_shopper_baku')}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.basarili && data.ayarlar) {
          const a = data.ayarlar;
          setSaglayici(a.saglayici || 'ARAMEX');
          setCikisUlkesi(a.cikisUlkesi || 'CA');
          setCikisSehri(a.cikisSehri || 'Toronto (YYZ)');
          setVarisUlkesi(a.varisUlkesi || 'AZ');
          setVarisHavalimani(a.varisHavalimani || 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)');

          const k = a.kimlikBilgileri || {};
          setKullaniciAdi(k.kullaniciAdi || '');
          setSifre(k.sifre || '');
          setHesapNo(k.hesapNo || '72470858');
          setPin(k.pin || '');
          setEntity(k.entity || 'YYZ');
          setTestModu(k.testModu ?? true);
        }
        if (data.desteklenenSaglayicilar) setSaglayicilar(data.desteklenenSaglayicilar);
        if (data.desteklenenUlkeler) setUlkeler(data.desteklenenUlkeler);
      })
      .catch((err) => console.error('Ayarlar yükleme hatası:', err))
      .finally(() => setAyarlarYukleniyor(false));
  };

  useEffect(() => {
    yukleAyarlar();
  }, [seciliFirmaId]);

  // Toplu Senkronizasyon (Tüm Kargoları Aramex API ile Sorgula)
  const handleTopluSenkronizeEt = async () => {
    setSenkronizeEdiliyor(true);
    setBildirim(null);
    try {
      const res = await fetchWithRetry('/api/kargo/senkronize-et', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: seciliFirmaId || 'all' }),
      });
      const data = await res.json();
      if (data.basarili) {
        await siparisleriYukle();
        setBildirim({ tip: 'basari', mesaj: data.mesaj || 'Kargo statusları uğurla yeniləndi!' });
        setTimeout(() => setBildirim(null), 6000);
      } else {
        setBildirim({ tip: 'hata', mesaj: data.hata || 'Sinxronizasiya xətası baş verdi.' });
      }
    } catch (err: any) {
      setBildirim({ tip: 'hata', mesaj: `Server xətası: ${err.message}` });
    } finally {
      setSenkronizeEdiliyor(false);
    }
  };

  // Tekil Hızlı AWB Sorgusu
  const handleHizliAwbSorgula = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const awb = hizliAwbSorgu.trim();
    if (!awb) return;

    setHizliSorguYukleniyor(true);
    setHizliSorguSonuc(null);

    try {
      const res = await fetchWithRetry('/api/kargo/takip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          takipNolari: [awb],
          tenantId: seciliFirmaId || 'kanada_shopper_baku',
        }),
      });
      const data = await res.json();
      if (data.basarili && data.sonuclar && data.sonuclar.length > 0) {
        setHizliSorguSonuc(data.sonuclar[0]);
      } else {
        setHizliSorguSonuc({
          takipNo: awb,
          durum: 'ULUSLARARASI_KARGO',
          hamAciklama: 'Kargo məlumatı tapılmadı.',
          konum: 'Naməlum Məntəqə',
          tarih: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      alert(`Sorgu xətası: ${err.message}`);
    } finally {
      setHizliSorguYukleniyor(false);
    }
  };

  // Daily Dispatch Dosyası Yükleme
  const handleDispatchYukle = (file: File) => {
    setDispatchYukleniyor(true);
    setDispatchSonuc(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string) || '';
        const res = await fetchWithRetry('/api/kargo/manifesto-yukle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dosya_base64: base64,
            dosya_adi: file.name,
            tenantId: seciliFirmaId || 'kanada_shopper_baku',
            otomatik_esle: true,
          }),
        });
        const data = await res.json();
        if (data.basarili) {
          await siparisleriYukle();
          setDispatchSonuc(data);
          setBildirim({ tip: 'basari', mesaj: data.mesaj });
        } else {
          setBildirim({ tip: 'hata', mesaj: data.hata || 'Fayl oxunarkən xəta baş verdi.' });
        }
      } catch (err: any) {
        setBildirim({ tip: 'hata', mesaj: `Yükləmə xətası: ${err.message}` });
      } finally {
        setDispatchYukleniyor(false);
        if (dosyaInputRef.current) dosyaInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Bağlantı Testi
  const handleBaglantiTesti = async () => {
    setTestEdiliyor(true);
    setTestSonucu(null);
    try {
      const res = await fetchWithRetry('/api/kargo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: seciliFirmaId || 'kanada_shopper_baku',
          ayarlar: {
            saglayici,
            cikisUlkesi,
            cikisSehri,
            kimlikBilgileri: { kullaniciAdi, sifre, hesapNo, pin, entity, testModu },
          },
        }),
      });
      const data = await res.json();
      setTestSonucu(data);
    } catch (err: any) {
      setTestSonucu({ basarili: false, mesaj: `Xəta: ${err.message}`, gecikmeMs: 0 });
    } finally {
      setTestEdiliyor(false);
    }
  };

  // Ayarları Kaydet
  const handleAyarlariKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    setAyarlarKaydediliyor(true);
    setBildirim(null);
    try {
      const res = await fetchWithRetry('/api/kargo/ayarlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: seciliFirmaId || 'kanada_shopper_baku',
          saglayici,
          cikisUlkesi,
          cikisSehri,
          varisUlkesi,
          varisHavalimani,
          kimlikBilgileri: { kullaniciAdi, sifre, hesapNo, pin, entity, testModu },
          otomatikSenkronizasyon: true,
          aktif: true,
        }),
      });
      const data = await res.json();
      if (data.basarili) {
        setBildirim({ tip: 'basari', mesaj: 'Kargo tənzimləmələri uğurla yadda saxlanıldı!' });
        setTimeout(() => setBildirim(null), 4000);
      } else {
        setBildirim({ tip: 'hata', mesaj: data.hata || 'Yadda saxlanılarkən xəta baş verdi.' });
      }
    } catch (err: any) {
      setBildirim({ tip: 'hata', mesaj: `Server xətası: ${err.message}` });
    } finally {
      setAyarlarKaydediliyor(false);
    }
  };

  // Kargo Kodlu Siparişler Listesi
  const kargoluSiparisler = useMemo(() => {
    return siparisler.filter((s) => {
      const kod = (s.uluslararasi_kargo_kodu || s.kanada_takip_kodu || '').toLowerCase();
      const mus = (s.musteri_adi || '').toLowerCase();
      const urun = (s.urun_aciklamasi || '').toLowerCase();
      const aranan = aramaMetni.toLowerCase().trim();

      if (aranan) {
        return kod.includes(aranan) || mus.includes(aranan) || urun.includes(aranan);
      }
      return Boolean(s.uluslararasi_kargo_kodu || s.kanada_takip_kodu);
    });
  }, [siparisler, aramaMetni]);

  // Sayı İstatistikleri
  const yoldakiSayisi = useMemo(() => {
    return siparisler.filter((s) => s.lojistik_durumu === 'ULUSLARARASI_KARGO' || s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS').length;
  }, [siparisler]);

  const kanadaDepoSayisi = useMemo(() => {
    return siparisler.filter((s) => s.lojistik_durumu === 'KANADA_DEPO').length;
  }, [siparisler]);

  const teslimSayisi = useMemo(() => {
    return siparisler.filter((s) => s.lojistik_durumu === 'TESLIM_EDILDI').length;
  }, [siparisler]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Üst Başlık & Hero Paneli */}
      <div className="bg-slate-900 text-white p-6 sm:p-7 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
            <Plane className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                Kargo & Aramex Lojistika Mərkəzi
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Aramex REST v2 API
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Canlı Bağlantı
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Kanada (YYZ) ➔ Bakı (GYD) hava kargo xətti, toplu AWB izləməsi və Daily Dispatch Excel avtomatlaşdırması
            </p>
          </div>
        </div>

        {/* Canlı Sinxronizasiya Butonu */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleTopluSenkronizeEt}
            disabled={senkronizeEdiliyor}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer ring-1 ring-blue-400/40"
          >
            <RefreshCw className={`w-4 h-4 ${senkronizeEdiliyor ? 'animate-spin' : ''}`} />
            <span>{senkronizeEdiliyor ? 'Sinxronlaşdırılır...' : 'Aramex İlə Sinxronizasiya Et'}</span>
          </button>
        </div>
      </div>

      {/* Bildirim Toast */}
      {bildirim && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm animate-in fade-in ${
            bildirim.tip === 'basari'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {bildirim.tip === 'basari' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
            <span>{bildirim.mesaj}</span>
          </div>
          <button type="button" onClick={() => setBildirim(null)} className="text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
      )}

      {/* 2. Dörtlü Canlı Gösterge Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">Aktiv Provayder</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{saglayici} (#72470858)</div>
            <div className="text-3xs text-slate-500 font-mono">Çıxış: {cikisUlkesi} ➔ {varisUlkesi}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">Uçuşda / Tranzitdə</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 font-numeric">{yoldakiSayisi} bağlama</div>
            <div className="text-3xs text-slate-500">Toronto ➔ Dubai ➔ Bakı</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">Kanada Anbarında</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 font-numeric">{kanadaDepoSayisi} bağlama</div>
            <div className="text-3xs text-slate-500">Çıxış gözləyir</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">Təhvil Verildi</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 font-numeric">{teslimSayisi} bağlama</div>
            <div className="text-3xs text-emerald-600 font-bold">Tam çatdırıldı</div>
          </div>
        </div>
      </div>

      {/* 3. Ana Sekme Navigasyonu (3 Tab) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2">
        <button
          type="button"
          onClick={() => setAktifTab('izleme')}
          className={`px-4 py-3 text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            aktifTab === 'izleme'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Canlı İzləmə & Siyahı ({kargoluSiparisler.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAktifTab('dispatch')}
          className={`px-4 py-3 text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            aktifTab === 'dispatch'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Daily Dispatch (Excel) İdxal</span>
        </button>

        <button
          type="button"
          onClick={() => setAktifTab('ayarlar')}
          className={`px-4 py-3 text-xs sm:text-sm font-extrabold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            aktifTab === 'ayarlar'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Kargo Provayder & API Parametrləri</span>
        </button>
      </div>

      {/* TAB 1: CANLI İZLƏMƏ & SİYAHI */}
      {aktifTab === 'izleme' && (
        <div className="space-y-4">
          {/* Hızlı AWB Arama Çubuğu */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                placeholder="AWB konşimento nömrəsi, müştəri adı və ya məhsul üzrə axtar..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Anlık Aramex Tekil Sorgu Kutusu */}
            <form onSubmit={handleHizliAwbSorgula} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={hizliAwbSorgu}
                onChange={(e) => setHizliAwbSorgu(e.target.value)}
                placeholder="Örn: 37349392426"
                className="px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 w-36"
              />
              <button
                type="submit"
                disabled={hizliSorguYukleniyor}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              >
                <Activity className={`w-3.5 h-3.5 ${hizliSorguYukleniyor ? 'animate-spin' : ''}`} />
                <span>Canlı Sorğu</span>
              </button>
            </form>
          </div>

          {/* Hızlı Tekil Sorgu Sonucu */}
          {hizliSorguSonuc && (
            <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  AWB
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-blue-950 dark:text-blue-200">
                      {hizliSorguSonuc.takipNo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-2xs font-extrabold bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200">
                      {hizliSorguSonuc.hamDurumKodu || 'LIVE'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-900 dark:text-blue-300 mt-0.5">{hizliSorguSonuc.hamAciklama}</p>
                </div>
              </div>
              <div className="text-right sm:text-right w-full sm:w-auto">
                <div className="font-bold text-xs text-blue-950 dark:text-blue-200 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>{hizliSorguSonuc.konum}</span>
                </div>
                <div className="text-2xs text-blue-700 dark:text-blue-400 mt-0.5">
                  {new Date(hizliSorguSonuc.tarih).toLocaleString('az-AZ')}
                </div>
              </div>
            </div>
          )}

          {/* Kargo Tablosu */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[65vh]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-extrabold uppercase text-2xs tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3 min-w-[160px]">AWB / İzləmə Kodu</th>
                    <th className="p-3 min-w-[180px]">Müştəri & Əlaqə</th>
                    <th className="p-3 min-w-[200px]">Məhsul Təsviri</th>
                    <th className="p-3 text-center w-20">Çəki (kg)</th>
                    <th className="p-3 min-w-[160px]">Cari Mərhələ</th>
                    <th className="p-3 min-w-[200px]">Son Canlı Məkan / Not</th>
                    <th className="p-3 text-center w-16">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {kargoluSiparisler.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 text-xs">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        Axtarışa uyğun kargo qeydi tapılmadı.
                      </td>
                    </tr>
                  ) : (
                    kargoluSiparisler.map((s, idx) => {
                      const awb = s.uluslararasi_kargo_kodu || s.kanada_takip_kodu || '—';
                      return (
                        <tr key={s.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                          <td className="p-3 text-slate-400 font-mono text-center font-bold">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                            <span className="bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-md border border-blue-200 dark:border-blue-800 inline-block">
                              📦 {awb}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 dark:text-white text-sm">{s.musteri_adi}</div>
                            <div className="text-2xs text-slate-500 font-mono">{s.telefon_numarasi || '—'}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900 dark:text-white line-clamp-1">{s.urun_aciklamasi}</div>
                            <div className="text-2xs text-slate-400">{[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}</div>
                          </td>
                          <td className="p-3 text-center font-bold font-mono">
                            {s.kargo_agirligi_kg ? `${s.kargo_agirligi_kg} kg` : '—'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-2xs font-extrabold inline-block border ${
                                s.lojistik_durumu === 'TESLIM_EDILDI'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS'
                                  ? 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300'
                                  : s.lojistik_durumu === 'ULUSLARARASI_KARGO'
                                  ? 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                              }`}
                            >
                              {s.lojistik_durumu}
                            </span>
                          </td>
                          <td className="p-3 text-2xs text-slate-600 dark:text-slate-300">
                            {s.baku_tahsilat_notu ? (
                              <div className="line-clamp-2">{s.baku_tahsilat_notu}</div>
                            ) : (
                              <span className="text-slate-400 italic">Tranzitdə</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {onSiparisDetayAc && (
                              <button
                                type="button"
                                onClick={() => onSiparisDetayAc(s)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY DISPATCH (EXCEL) İDXAL MASASI */}
      {aktifTab === 'dispatch' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="max-w-xl">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Aramex Daily Dispatch Hesabatını İdxal Edin
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Toronto ofisinizin Aramex-ə təhvil verdiyi bağlamaların axşam e-poçtunuza gələn Excel / CSV faylını bura yükləyin. Sistem konşimento nömrələrini (AWB) və çəkiləri (kg) müştəri adları ilə avtomatik eşləşdirib sifarişlərə bağlayacaq.
              </p>
            </div>

            {/* Sürükle Bırak Alanı */}
            <input
              type="file"
              ref={dosyaInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleDispatchYukle(file);
              }}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSuruklemeAktiv(true);
              }}
              onDragLeave={() => setSuruklemeAktiv(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSuruklemeAktiv(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleDispatchYukle(file);
              }}
              onClick={() => dosyaInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                suruklemeAktiv
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-4 ring-blue-500/10'
                  : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className={`w-8 h-8 ${dispatchYukleniyor ? 'animate-bounce' : ''}`} />
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                {dispatchYukleniyor ? 'Excel faylı təhlil edilir və bağlamalar bağlanır...' : 'Aramex Daily Dispatch Excel / CSV Faylını Bura Sürükləyin'}
              </div>
              <p className="text-xs text-slate-500 mt-1">və ya kompüterinizdən seçmək üçün toxunun (.xlsx, .xls, .csv)</p>
            </div>
          </div>

          {/* İçe Aktarma Sonucu */}
          {dispatchSonuc && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {dispatchSonuc.mesaj}
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {dispatchSonuc.eslesenSayisi} bağlama qoşuldu
                </span>
              </div>

              {Array.isArray(dispatchSonuc.eslesmeler) && dispatchSonuc.eslesmeler.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 font-bold uppercase text-2xs text-slate-500">
                      <tr>
                        <th className="p-2.5">Müştəri</th>
                        <th className="p-2.5 font-mono">Təhkim Edilən AWB</th>
                        <th className="p-2.5 text-center">Çəki</th>
                        <th className="p-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dispatchSonuc.eslesmeler.map((e: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold">{e.musteriAdi}</td>
                          <td className="p-2.5 font-mono text-blue-600 font-bold">{e.awbNo}</td>
                          <td className="p-2.5 text-center font-mono">{e.agirlikKg ? `${e.agirlikKg} kg` : '—'}</td>
                          <td className="p-2.5 text-right text-emerald-600 font-bold">✓ Bağlandı</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: KARGO PROVAYDER & API TƏNZİMLƏMƏLƏRİ */}
      {aktifTab === 'ayarlar' && (
        <form onSubmit={handleAyarlariKaydet} className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            {/* 1. Kargo Provayder Seçimi */}
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                1. Aktiv Kargo Provayderi (Carrier Provider)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {saglayicilar.map((p) => {
                  const isSelected = saglayici === p.id;
                  const isAramex = p.id === 'ARAMEX';

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSaglayici(p.id)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          {isAramex ? '📦' : p.id === 'DHL' ? '🟡' : p.id === 'UPS' ? '🟤' : '🚚'} {p.ad}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-2xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{p.aciklama}</p>
                      <span
                        className={`text-3xs font-extrabold px-2 py-0.5 rounded w-fit ${
                          p.durum === 'AKTIF'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                        }`}
                      >
                        {p.durum === 'AKTIF' ? 'Canlı Aktiv' : 'Genişlənə Bilən'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Çıkış Ülkesi & Rota */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" /> Çıxış Ölkəsi (Origin Country)
                </label>
                <select
                  value={cikisUlkesi}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCikisUlkesi(val);
                    const secilen = ulkeler.find((u) => u.kod === val);
                    if (secilen) setCikisSehri(secilen.anaHavalimani);
                  }}
                  className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {ulkeler.map((u) => (
                    <option key={u.kod} value={u.kod}>
                      {u.bayrak} {u.ad} ({u.kod})
                    </option>
                  ))}
                </select>
                <p className="text-3xs text-slate-500 mt-1">Bugün Kanada, sabah ABŞ, Yaponiya və ya İngiltərə seçilə bilər.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Çıxış Limanı / Şəhər
                </label>
                <input
                  type="text"
                  value={cikisSehri}
                  onChange={(e) => setCikisSehri(e.target.value)}
                  className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-3xs text-slate-500 mt-1">Hədəf: {varisHavalimani}</p>
              </div>
            </div>

            {/* 3. Kurumsal Kimlik Formu */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-600" /> 2. {saglayici} Kurumsal API Kimlik Bilgiləri
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={testModu}
                    onChange={(e) => setTestModu(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Sınaq / Demo Modu (Sandbox)</span>
                </label>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Kullanıcı Adı / E-poçt (UserName)
                    </label>
                    <input
                      type="text"
                      value={kullaniciAdi}
                      onChange={(e) => setKullaniciAdi(e.target.value)}
                      placeholder="canadian_brand_shop@aramex.com"
                      className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      API Şifrəsi (Password)
                    </label>
                    <input
                      type="password"
                      value={sifre}
                      onChange={(e) => setSifre(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Hesab Nömrəsi (Account Number)
                    </label>
                    <input
                      type="text"
                      value={hesapNo}
                      onChange={(e) => setHesapNo(e.target.value)}
                      placeholder="72470858"
                      className="w-full text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Hesab PIN (Account PIN)
                    </label>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="••••"
                      className="w-full text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      İstasiya / Sub-Entity
                    </label>
                    <input
                      type="text"
                      value={entity}
                      onChange={(e) => setEntity(e.target.value)}
                      placeholder="YYZ"
                      className="w-full text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
                  <span className="text-2xs text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" /> Şifrə və PIN kodları maskələnərək qorunur.
                  </span>

                  <button
                    type="button"
                    onClick={handleBaglantiTesti}
                    disabled={testEdiliyor}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    <Activity className={`w-3.5 h-3.5 text-blue-600 ${testEdiliyor ? 'animate-spin' : ''}`} />
                    <span>{testEdiliyor ? 'Yoxlanılır...' : 'Bağlantını Sına (Test Connection)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Test Sonucu Rozeti */}
            {testSonucu && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  testSonucu.basarili
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testSonucu.basarili ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
                  <span>{testSonucu.mesaj}</span>
                </div>
                <span className="font-mono text-2xs opacity-80">{testSonucu.gecikmeMs}ms</span>
              </div>
            )}

            {/* Form Aksiyonları */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={ayarlarKaydediliyor}
                className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{ayarlarKaydediliyor ? 'Yadda saxlanılır...' : 'Tənzimləmələri Yadda Saxla'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
