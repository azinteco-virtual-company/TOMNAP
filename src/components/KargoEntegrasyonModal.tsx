import React, { useState, useEffect, useRef } from 'react';
import {
  Plane,
  Truck,
  ShieldCheck,
  ShieldAlert,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Lock,
  Globe,
  Key,
  Check,
  Zap,
  ArrowRight,
  ExternalLink,
  Layers,
  Save,
  Activity,
  FileSpreadsheet,
} from 'lucide-react';
import { fetchWithRetry } from '../lib/apiClient';

interface SaglayiciItem {
  id: string;
  ad: string;
  aciklama: string;
  durum: 'AKTIF' | 'GENISLETILEBILIR';
}

interface UlkeItem {
  kod: string;
  ad: string;
  bayrak: string;
  anaHavalimani: string;
}

interface KargoEntegrasyonModalProps {
  acik: boolean;
  onKapat: () => void;
  seciliTenantId: string;
  onAyarlarGuncellendi?: () => void;
}

export const KargoEntegrasyonModal: React.FC<KargoEntegrasyonModalProps> = ({
  acik,
  onKapat,
  seciliTenantId,
  onAyarlarGuncellendi,
}) => {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [testEdiliyor, setTestEdiliyor] = useState(false);
  const [testSonucu, setTestSonucu] = useState<{
    basarili: boolean;
    mesaj: string;
    gecikmeMs: number;
    detay?: any;
  } | null>(null);
  const [bildirim, setBildirim] = useState<{ tip: 'basari' | 'hata'; mesaj: string } | null>(null);

  // Form Değerleri
  const [loadedVersion, setLoadedVersion] = useState<{ tenantId: string; revision: number } | null>(
    null
  );
  const currentTenant = useRef(seciliTenantId);
  currentTenant.current = seciliTenantId;
  const [saglayici, setSaglayici] = useState<string>('ARAMEX');
  const [cikisUlkesi, setCikisUlkesi] = useState<string>('CA');
  const [cikisSehri, setCikisSehri] = useState<string>('Toronto (YYZ)');
  const [varisUlkesi, setVarisUlkesi] = useState<string>('AZ');
  const [varisHavalimani, setVarisHavalimani] = useState<string>(
    'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)'
  );

  // Kimlik Formu
  const [kullaniciAdi, setKullaniciAdi] = useState<string>('');
  const [sifre, setSifre] = useState<string>('');
  const [hesapNo, setHesapNo] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [entity, setEntity] = useState<string>('YYZ');
  const [testModu, setTestModu] = useState<boolean>(true);
  const [otomatikSenkronizasyon, setOtomatikSenkronizasyon] = useState<boolean>(true);

  // API Listeleri
  const [saglayicilar, setSaglayicilar] = useState<SaglayiciItem[]>([]);
  const [ulkeler, setUlkeler] = useState<UlkeItem[]>([]);

  // Ayarları Yükle
  useEffect(() => {
    if (!acik) return;
    setYukleniyor(true);
    setTestSonucu(null);
    setBildirim(null);

    const requestedTenant = seciliTenantId;
    setLoadedVersion(null);
    setKullaniciAdi('');
    setSifre('');
    setHesapNo('');
    setPin('');
    setEntity('');
    setTestModu(true);
    setTestSonucu(null);
    fetchWithRetry(`/api/kargo/ayarlar?tenant_id=${encodeURIComponent(seciliTenantId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (currentTenant.current !== requestedTenant) return;
        if (!data.basarili) throw new Error(data.hata || 'Kargo ayarları yüklenemedi.');
        if (data.basarili && data.ayarlar) {
          const ayar = data.ayarlar;
          setLoadedVersion({ tenantId: requestedTenant, revision: ayar.revision });
          setSaglayici(ayar.saglayici || 'ARAMEX');
          setCikisUlkesi(ayar.cikisUlkesi || 'CA');
          setCikisSehri(ayar.cikisSehri || 'Toronto (YYZ)');
          setVarisUlkesi(ayar.varisUlkesi || 'AZ');
          setVarisHavalimani(ayar.varisHavalimani || 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)');
          setOtomatikSenkronizasyon(ayar.otomatikSenkronizasyon ?? true);

          const kimlik = ayar.kimlikBilgileri || {};
          setKullaniciAdi(kimlik.kullaniciAdi || '');
          setSifre(kimlik.sifre || '');
          setHesapNo(kimlik.hesapNo || '');
          setPin(kimlik.pin || '');
          setEntity(kimlik.entity || 'YYZ');
          setTestModu(kimlik.testModu ?? true);
        }
        if (Array.isArray(data.desteklenenSaglayicilar)) {
          setSaglayicilar(data.desteklenenSaglayicilar);
        }
        if (Array.isArray(data.desteklenenUlkeler)) {
          setUlkeler(data.desteklenenUlkeler);
        }
      })
      .catch((err) => {
        console.error('Kargo ayarları yükləmə xətası:', err);
      })
      .finally(() => {
        setYukleniyor(false);
      });
  }, [acik, seciliTenantId]);

  // Ülke değişince şehri otomatik güncelle
  const handleUlkeSecimi = (ulkeKodu: string) => {
    setCikisUlkesi(ulkeKodu);
    const secilen = ulkeler.find((u) => u.kod === ulkeKodu);
    if (secilen) {
      setCikisSehri(secilen.anaHavalimani);
    }
  };

  // Bağlantı Testi (Test Connection)
  const handleBaglantiTesti = async () => {
    if (!loadedVersion || loadedVersion.tenantId !== seciliTenantId || yukleniyor) {
      setBildirim({ tip: 'hata', mesaj: 'Önce firma ayarlarını yükleyin.' });
      return;
    }
    setTestEdiliyor(true);
    setTestSonucu(null);
    try {
      const res = await fetchWithRetry('/api/kargo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: seciliTenantId,
          ayarlar: {
            saglayici,
            cikisUlkesi,
            cikisSehri,
            kimlikBilgileri: {
              kullaniciAdi,
              sifre,
              hesapNo,
              pin,
              entity,
              testModu,
            },
          },
        }),
      });
      const data = await res.json();
      setTestSonucu(data);
    } catch (err: any) {
      setTestSonucu({
        basarili: false,
        mesaj: `Bağlantı xətası: ${err.message}`,
        gecikmeMs: 0,
      });
    } finally {
      setTestEdiliyor(false);
    }
  };

  // Ayarları Kaydet
  const handleKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadedVersion || loadedVersion.tenantId !== seciliTenantId) {
      setBildirim({ tip: 'hata', mesaj: 'Ayarlar yüklenemedi; sayfayı yenileyin.' });
      return;
    }
    setKaydediliyor(true);
    setBildirim(null);

    try {
      const res = await fetchWithRetry('/api/kargo/ayarlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: seciliTenantId,
          revision: loadedVersion.revision,
          saglayici,
          cikisUlkesi,
          cikisSehri,
          varisUlkesi,
          varisHavalimani,
          otomatikSenkronizasyon,
          aktif: true,
          kimlikBilgileri: {
            kullaniciAdi,
            sifre,
            hesapNo,
            pin,
            entity,
            testModu,
          },
        }),
      });

      const data = await res.json();
      if (data.basarili) {
        if (currentTenant.current !== seciliTenantId) return;
        setLoadedVersion({ tenantId: seciliTenantId, revision: data.ayarlar.revision });
        setSifre(data.ayarlar.kimlikBilgileri.sifre || '');
        setPin(data.ayarlar.kimlikBilgileri.pin || '');
        setBildirim({ tip: 'basari', mesaj: 'Kargo tənzimləmələri uğurla yadda saxlanıldı!' });
        if (onAyarlarGuncellendi) onAyarlarGuncellendi();
        setTimeout(() => setBildirim(null), 3500);
      } else {
        setBildirim({ tip: 'hata', mesaj: data.hata || 'Yadda saxlanılarkən xəta baş verdi.' });
      }
    } catch (err: any) {
      setBildirim({ tip: 'hata', mesaj: `Server xətası: ${err.message}` });
    } finally {
      setKaydediliyor(false);
    }
  };

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Başlığı */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Çoxlu Kargo (Multi-Carrier) & API İnteqrasiyası
                </h3>
                <span className="px-2 py-0.5 rounded-full text-2xs font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                  SaaS Mərkəzi
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aramex, DHL, UPS və digər beynəlxalq logistika provayderlərinin canlı API və çıxış
                ölkəsi parametrləri
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal İçeriği */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {bildirim && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in ${
                bildirim.tip === 'basari'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {bildirim.tip === 'basari' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                )}
                <span>{bildirim.mesaj}</span>
              </div>
              <button
                type="button"
                onClick={() => setBildirim(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form id="kargo-ayarlar-form" onSubmit={handleKaydet} className="space-y-6">
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
                      onClick={() => {
                        if (p.id !== saglayici) {
                          setSaglayici(p.id);
                          setKullaniciAdi('');
                          setSifre('');
                          setHesapNo('');
                          setPin('');
                          setEntity('');
                          setTestModu(true);
                        }
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          {isAramex ? '📦' : p.id === 'DHL' ? '🟡' : p.id === 'UPS' ? '🟤' : '🚚'}{' '}
                          {p.ad}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      <p className="text-2xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {p.aciklama}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span
                          className={`text-3xs font-extrabold px-1.5 py-0.5 rounded ${
                            p.durum === 'AKTIF'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                          }`}
                        >
                          {p.durum === 'AKTIF' ? 'Canlı Aktiv' : 'Genişlənə Bilən'}
                        </span>
                      </div>
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
                  onChange={(e) => handleUlkeSecimi(e.target.value)}
                  className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  {ulkeler.map((u) => (
                    <option key={u.kod} value={u.kod}>
                      {u.bayrak} {u.ad} ({u.kod})
                    </option>
                  ))}
                </select>
                <p className="text-3xs text-slate-500 mt-1">
                  Bugün Kanada, sabah ABŞ, Yaponiya və ya İngiltərə seçilə bilər.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Çıxış Limanı / Məntəqə
                </label>
                <input
                  type="text"
                  value={cikisSehri}
                  onChange={(e) => setCikisSehri(e.target.value)}
                  placeholder="Məs: Toronto Pearson (YYZ)"
                  className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-3xs text-slate-500 mt-1">Hədəf: {varisHavalimani}</p>
              </div>
            </div>

            {/* 3. Kurumsal Kimlik Formu */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-600" /> 2. {saglayici} Kurumsal API Kimlik
                  Bilgiləri
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

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Kullanıcı Adı / E-poçt (UserName)
                    </label>
                    <input
                      type="text"
                      value={kullaniciAdi}
                      onChange={(e) => setKullaniciAdi(e.target.value)}
                      placeholder="Kargo hesabınız"
                      className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                      className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
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
                      placeholder="Hesap numaranız"
                      className="w-full text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
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
                      className="w-full text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                  <span className="text-2xs text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" /> Şifrə və PIN kodları
                    maskələnərək qorunur.
                  </span>

                  <button
                    type="button"
                    onClick={handleBaglantiTesti}
                    disabled={
                      testEdiliyor || yukleniyor || loadedVersion?.tenantId !== seciliTenantId
                    }
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                  >
                    <Activity
                      className={`w-3.5 h-3.5 text-blue-600 ${testEdiliyor ? 'animate-spin' : ''}`}
                    />
                    <span>{testEdiliyor ? 'Yoxlanılır...' : 'Bağlantını Sına (Test)'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Test Sonucu Rozeti */}
            {testSonucu && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  testSonucu.basarili
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testSonucu.basarili ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{testSonucu.mesaj}</span>
                </div>
                <span className="font-mono text-2xs opacity-80">{testSonucu.gecikmeMs}ms</span>
              </div>
            )}

            {/* 4. Aramex Daily Dispatch İpucu Kutusu */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <strong>Aramex E-poçt Hesabatı (Daily Dispatch):</strong> Toronto anbarından
                Aramex-ə təslim etdiyiniz bağlamaların axşam e-poçtunuza gələn Excel faylını birbaşa{' '}
                <strong>Kargo Manifestosu</strong> səhifəsindəki{' '}
                <strong>"Daily Dispatch Excel İdxal Et"</strong> düyməsinə sürükləyərək 50 kargonun
                AWB kodunu 1 saniyədə sistemə bağlaya bilərsiniz.
              </div>
            </div>
          </form>
        </div>

        {/* Modal Altlığı (Actions) */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Bağla
          </button>

          <button
            type="submit"
            form="kargo-ayarlar-form"
            disabled={kaydediliyor}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{kaydediliyor ? 'Yadda saxlanılır...' : 'Tənzimləmələri Yadda Saxla'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
