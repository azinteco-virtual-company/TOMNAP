import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  Building2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Server,
  Sparkles,
  ShieldCheck,
  X,
  RefreshCw,
  Store,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { FirmaTenant } from '../types';

interface VeritabaniDurum {
  supabase_bagli: boolean;
  kaynak: 'supabase' | 'bellek';
  toplam_siparis: number;
  demo_siparis_sayisi: number;
  canli_siparis_sayisi: number;
  rejim: 'TEMIZ_CANLI' | 'DEMO_MODU' | 'CANLI_MODU';
  firma_dagilimi: Record<string, number>;
  hata?: string | null;
}

interface VeritabaniYonetimModalProps {
  acik: boolean;
  onKapat: () => void;
  firmalar: FirmaTenant[];
  onFirmalarGuncelle: () => void;
  onSiparislerYenilendi: () => void;
  bildirimGoster: (mesaj: string) => void;
  seciliFirmaId: string;
  onFirmaSec: (id: string) => void;
}

export const VeritabaniYonetimModal: React.FC<VeritabaniYonetimModalProps> = ({
  acik,
  onKapat,
  firmalar,
  onFirmalarGuncelle,
  onSiparislerYenilendi,
  bildirimGoster,
  seciliFirmaId,
  onFirmaSec,
}) => {
  const [aktifTab, setAktifTab] = useState<'demo-canli' | 'firmalar'>('demo-canli');
  const [durum, setDurum] = useState<VeritabaniDurum | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemDevam, setIslemDevam] = useState<string | null>(null);
  const [silmeOnayGoster, setSilmeOnayGoster] = useState(false);

  // Yeni Firma Formu
  const [yeniFirmaAd, setYeniFirmaAd] = useState('');
  const [yeniFirmaSehir, setYeniFirmaSehir] = useState('Bakı');
  const [yeniFirmaParaBirimi, setYeniFirmaParaBirimi] = useState<'AZN' | 'CAD' | 'USD'>('AZN');
  const [yeniFirmaKomisyon, setYeniFirmaKomisyon] = useState(15);
  const [yeniFirmaNot, setYeniFirmaNot] = useState('');
  const [yeniFirmaFormAcik, setYeniFirmaFormAcik] = useState(false);

  const dosyaInputRef = useRef<HTMLInputElement>(null);

  const durumGetir = async () => {
    try {
      setYukleniyor(true);
      const res = await apiFetch('/api/veritabani/durum');
      const data = await res.json();
      if (data.basarili) {
        setDurum(data);
      }
    } catch (e) {
      console.error('Veritabanı durumu alınamadı:', e);
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    if (acik) {
      durumGetir();
    }
  }, [acik]);

  if (!acik) return null;

  // 1. Canlıya Geç: Demo ve Test Verilerini Temizle
  const handleVeritabaniTemizle = async () => {
    setIslemDevam('temizle');
    try {
      const res = await apiFetch('/api/veritabani/temizle', { method: 'POST' });
      const data = await res.json();
      if (data.basarili) {
        bildirimGoster(
          data.mesaj ||
            'Verilənlər bazası təmizləndi! Sistem canlı sifarişləri qəbul etməyə hazırdır.'
        );
        setSilmeOnayGoster(false);
        await durumGetir();
        onSiparislerYenilendi();
      } else {
        alert('Xəta baş verdi: ' + (data.hata || 'Bilinməyən xəta'));
      }
    } catch (err: any) {
      alert('Əməliyyat uğursuz oldu: ' + err.message);
    } finally {
      setIslemDevam(null);
    }
  };

  // 2. Demo Verilənləri Bərpa Et (Təqdimat Rejimi)
  const handleDemoYukle = async () => {
    setIslemDevam('demo-yukle');
    try {
      const res = await apiFetch('/api/veritabani/demo-yukle', { method: 'POST' });
      const data = await res.json();
      if (data.basarili) {
        bildirimGoster(data.mesaj || 'Demo məlumatlar bazaya bərpa edildi!');
        await durumGetir();
        onSiparislerYenilendi();
      } else {
        alert('Xəta baş verdi: ' + (data.hata || 'Bilinməyən xəta'));
      }
    } catch (err: any) {
      alert('Əməliyyat uğursuz oldu: ' + err.message);
    } finally {
      setIslemDevam(null);
    }
  };

  // 3. JSON Ehtiyat Nüsxə Endir (Backup)
  const handleYedekIndir = async () => {
    setIslemDevam('yedek-al');
    try {
      const res = await apiFetch('/api/veritabani/yedek-al');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knb_siparisler_yedek_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      bildirimGoster('Ehtiyat nüsxə (.json) uğurla kompüterinizə endirildi.');
    } catch (err: any) {
      alert('Yedək alınarkən xəta baş verdi: ' + err.message);
    } finally {
      setIslemDevam(null);
    }
  };

  // 4. JSON Ehtiyat Nüsxə Yüklə (Restore)
  const handleDosyaSecildi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        const siparisListesi = Array.isArray(parsed) ? parsed : parsed.siparisler || [];

        if (!siparisListesi || siparisListesi.length === 0) {
          alert('Faylın içərisində etibarlı sifariş siyahısı tapılmadı.');
          return;
        }

        const onay = window.confirm(
          `Faylda ${siparisListesi.length} sifariş aşkarlandı. Bazaya bərpa etmək istəyirsiniz?`
        );
        if (!onay) return;

        setIslemDevam('yedek-yukle');
        const res = await apiFetch('/api/veritabani/yedek-yukle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siparisler: siparisListesi, temizleVeYukle: true }),
        });
        const respData = await res.json();
        if (respData.basarili) {
          bildirimGoster(respData.mesaj || 'Ehtiyat nüsxə uğurla bərpa olundu!');
          await durumGetir();
          onSiparislerYenilendi();
        } else {
          alert('Xəta: ' + (respData.hata || 'Bərpa edilə bilmədi'));
        }
      } catch (jsonErr: any) {
        alert('JSON faylı oxuna bilmədi: ' + jsonErr.message);
      } finally {
        setIslemDevam(null);
        if (dosyaInputRef.current) dosyaInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // 5. Yeni Firma / Butik Əlavə Et
  const handleYeniFirmaKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yeniFirmaAd.trim()) return;

    try {
      setIslemDevam('firma-ekle');
      const res = await apiFetch('/api/firmalar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad: yeniFirmaAd.trim(),
          sehir: yeniFirmaSehir,
          varsayilanParaBirimi: yeniFirmaParaBirimi,
          varsayilanKomisyonYuzdesi: yeniFirmaKomisyon,
          aciklama: yeniFirmaNot,
        }),
      });
      const data = await res.json();
      if (data.basarili) {
        bildirimGoster(`"${yeniFirmaAd}" butiki uğurla yaradıldı və aktiv seçildi!`);
        setYeniFirmaAd('');
        setYeniFirmaNot('');
        setYeniFirmaFormAcik(false);
        onFirmalarGuncelle();
        if (data.firma && data.firma.id) {
          onFirmaSec(data.firma.id);
        }
        await durumGetir();
      } else {
        alert('Xəta: ' + (data.hata || 'Firma əlavə edilə bilmədi'));
      }
    } catch (err: any) {
      alert('Xəta baş verdi: ' + err.message);
    } finally {
      setIslemDevam(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Başlıq */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Verilənlər Bazası & Canlı/Demo İdarəetmə Mərkəzi
                </h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  SaaS Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Supabase PostgreSQL sinxronizasiyası, demo/canlı keçidi və çoxlu butik izolyasiyası
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Menüsü */}
        <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
          <button
            onClick={() => setAktifTab('demo-canli')}
            className={`py-3 px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              aktifTab === 'demo-canli'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Canlı & Demo Baza İdarəetməsi</span>
          </button>
          <button
            onClick={() => setAktifTab('firmalar')}
            className={`py-3 px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
              aktifTab === 'firmalar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Çoxlu Firma / Butiklər ({firmalar.length})</span>
          </button>
        </div>

        {/* Məzmun Sahəsi */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Canlı Sistem Status Kartı */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h4 className="text-sm font-bold text-white">
                      {durum?.supabase_bagli
                        ? 'Supabase PostgreSQL Canlı Əlaqə Qurulub'
                        : 'Lokal Yaddaş Rejimi'}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Cari rejim:{' '}
                    <span className="font-bold text-amber-300">
                      {durum?.rejim === 'TEMIZ_CANLI'
                        ? 'Təmiz Canlı İstehsalat (0 test sifarişi)'
                        : durum?.rejim === 'DEMO_MODU'
                          ? 'Təqdimat / Demo Rejimi (Tarixi zəngin məlumatlar)'
                          : 'Qarışıq / Canlı Rejim'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700 self-start sm:self-auto">
                <div className="text-center">
                  <div className="text-xs text-slate-400">Ümumi Sifariş</div>
                  <div className="text-base font-extrabold text-white">
                    {durum?.toplam_siparis ?? '...'}
                  </div>
                </div>
                <div className="h-6 w-px bg-slate-700" />
                <div className="text-center">
                  <div className="text-xs text-slate-400">Demo / Sınaq</div>
                  <div className="text-base font-extrabold text-amber-400">
                    {durum?.demo_siparis_sayisi ?? '...'}
                  </div>
                </div>
                <div className="h-6 w-px bg-slate-700" />
                <button
                  onClick={durumGetir}
                  disabled={yukleniyor}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  title="Yenilə"
                >
                  <RefreshCw className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* TAB 1: DEMO & CANLI İDARƏETMƏSİ */}
          {aktifTab === 'demo-canli' && (
            <div className="space-y-5">
              {/* Əsas Hərəkət Kartları */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. KART: Canlıya Keç / Bütün Demo Verilənləri Təmizlə */}
                <div className="p-5 rounded-2xl border-2 border-rose-100 bg-rose-50/40 hover:bg-rose-50/70 transition-all flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Canlıya Keç (Bazanı Təmizlə)
                    </h4>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Sistem real fəaliyyətə başladıqda bütün sınaq və demo sifarişlərini
                      Supabase-dən tək kliklə sıfırlayın. İlk real müştəri sifarişinizi qəbul etmək
                      üçün baza tər-təmiz açılır.
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-rose-200/60">
                    {!silmeOnayGoster ? (
                      <button
                        type="button"
                        onClick={() => setSilmeOnayGoster(true)}
                        disabled={islemDevam !== null}
                        className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Demo Verilənləri Təmizlə</span>
                      </button>
                    ) : (
                      <div className="bg-white p-3 rounded-xl border border-rose-300 shadow-sm space-y-2">
                        <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Bütün sifarişlər silinəcək. Əminsiniz?</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleVeritabaniTemizle}
                            disabled={islemDevam === 'temizle'}
                            className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            {islemDevam === 'temizle' ? 'Təmizlənir...' : 'Bəli, Təmizlə'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSilmeOnayGoster(false)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            İmtina
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. KART: Demo Verilənləri Bərpa Et (Təqdimat Rejimi) */}
                <div className="p-5 rounded-2xl border-2 border-blue-100 bg-blue-50/40 hover:bg-blue-50/70 transition-all flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Təqdimat Rejimi (Demo Bərpa Et)
                    </h4>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Yeni müştəriyə, butik sahibinə və ya investora sistemin gücünü göstərmək üçün
                      100+ real Kanada sifarişini, 90 günlük maliyyə qrafiklərini və Kanban
                      kartlarını dərhal geri yükləyin.
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-blue-200/60">
                    <button
                      type="button"
                      onClick={handleDemoYukle}
                      disabled={islemDevam !== null}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <RotateCcw
                        className={`w-4 h-4 ${islemDevam === 'demo-yukle' ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {islemDevam === 'demo-yukle'
                          ? 'Supabase-ə Yüklənir...'
                          : '100+ Demo Sifarişi Bərpa Et'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. BÖLMƏ: Ehtiyat Nüsxə (Backup & Restore) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Təhlükəsizlik & Ehtiyat Nüsxə (Backup / Restore)</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  İstənilən vaxt sistemdəki canlı və ya demo sifarişləri JSON formatında
                  kompüterinizə endirə və ya əvvəllər götürülmüş ehtiyat nüsxəni tək toxunuşla geri
                  yükləyə bilərsiniz.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  {/* İxrac (Export) */}
                  <button
                    type="button"
                    onClick={handleYedekIndir}
                    disabled={islemDevam !== null}
                    className="flex-1 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Ehtiyat Nüsxə Endir (.JSON)</span>
                  </button>

                  {/* İdxal (Import) */}
                  <input
                    type="file"
                    ref={dosyaInputRef}
                    onChange={handleDosyaSecildi}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => dosyaInputRef.current?.click()}
                    disabled={islemDevam !== null}
                    className="flex-1 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>
                      {islemDevam === 'yedek-yukle' ? 'Yüklənir...' : 'Ehtiyat Nüsxəni Geri Yüklə'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ÇOXLU FİRMA / BUTİK (MULTI-TENANT SAAS) */}
          {aktifTab === 'firmalar' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Qeydiyyatdan Keçmiş Butiklər & Filiallar
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hər firma öz sifarişlərini ayrı iş sahəsində idarə edir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setYeniFirmaFormAcik((o) => !o)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Butik Əlavə Et</span>
                </button>
              </div>

              {/* Yeni Butik Əlavə Et Formu */}
              {yeniFirmaFormAcik && (
                <form
                  onSubmit={handleYeniFirmaKaydet}
                  className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                      Yeni Tərəfdaş Butik Qeydiyyatı
                    </h5>
                    <button
                      type="button"
                      onClick={() => setYeniFirmaFormAcik(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Bağla
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Butik / Şirkət Adı *
                      </label>
                      <input
                        type="text"
                        value={yeniFirmaAd}
                        onChange={(e) => setYeniFirmaAd(e.target.value)}
                        placeholder="Məs: Bella Boutique Baku"
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Şəhər / Region
                      </label>
                      <input
                        type="text"
                        value={yeniFirmaSehir}
                        onChange={(e) => setYeniFirmaSehir(e.target.value)}
                        placeholder="Bakı, Gəncə, Sumqayıt..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Standart Əməliyyat Valyutası
                      </label>
                      <select
                        value={yeniFirmaParaBirimi}
                        onChange={(e: any) => setYeniFirmaParaBirimi(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      >
                        <option value="AZN">AZN (Azərbaycan Manatı)</option>
                        <option value="CAD">CAD (Kanada Dolları)</option>
                        <option value="USD">USD (ABŞ Dolları)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Standart Komissiya Dərəcəsi (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={yeniFirmaKomisyon}
                        onChange={(e) => setYeniFirmaKomisyon(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Xüsusi Qeyd / İzah
                    </label>
                    <input
                      type="text"
                      value={yeniFirmaNot}
                      onChange={(e) => setYeniFirmaNot(e.target.value)}
                      placeholder="Məs: Brend çanta və ayaqqabı satışı üzrə partnyor"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setYeniFirmaFormAcik(false)}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
                    >
                      Ləğv et
                    </button>
                    <button
                      type="submit"
                      disabled={islemDevam === 'firma-ekle'}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      {islemDevam === 'firma-ekle' ? 'Yaradılır...' : 'Butiki Yadda Saxla'}
                    </button>
                  </div>
                </form>
              )}

              {/* Butiklər Cədvəli */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Butik / Firma</th>
                        <th className="px-4 py-3">Şəhər</th>
                        <th className="px-4 py-3">Komissiya</th>
                        <th className="px-4 py-3">Sifariş Sayı</th>
                        <th className="px-4 py-3 text-right">Fəaliyyət</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {firmalar.map((firma) => {
                        const say = durum?.firma_dagilimi?.[firma.id] ?? 0;
                        const aktif = seciliFirmaId === firma.id;
                        return (
                          <tr
                            key={firma.id}
                            className={`hover:bg-slate-50/80 ${aktif ? 'bg-blue-50/40' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    firma.isDemo
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {firma.isDemo ? (
                                    <Sparkles className="w-4 h-4" />
                                  ) : (
                                    <Store className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>{firma.ad}</span>
                                    {firma.isDemo && (
                                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                                        Demo / Təlim
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                    {firma.aciklama || firma.id}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-600">{firma.sehir}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              %{firma.varsayilanKomisyonYuzdesi}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                                {say} ədəd
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  onFirmaSec(firma.id);
                                  bildirimGoster(`Aktiv butik: ${firma.ad}`);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                  aktif
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {aktif ? 'Aktiv İş Sahəsi' : 'İş Sahəsinə Keç'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alt Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>SaaS Architecture Ready (Tenant Isolation)</span>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
