import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Siparis } from './types';
import { useAppStore } from './store/appStore';
import { YanMenu } from './components/YanMenu';
import { UstBaslik } from './components/UstBaslik';
import { FinansLojistikOzet } from './components/FinansLojistikOzet';
import { SiparisTablosu } from './components/SiparisTablosu';
import { SiparisDetayModal } from './components/SiparisDetayModal';
import { WhatsAppBildirimModal } from './components/WhatsAppBildirimModal';
import { KargoManifestoModal } from './components/KargoManifestoModal';
import { KargoManifestoSayfasi } from './components/KargoManifestoSayfasi';
import { KargoMerkeziSayfasi } from './components/KargoMerkeziSayfasi';
import { BakuTahsilatModal } from './components/BakuTahsilatModal';
import { BakuTahsilatSayfasi } from './components/BakuTahsilatSayfasi';
import { OnayBekleyenlerModal } from './components/OnayBekleyenlerModal';
import { OnayBekleyenlerSayfasi } from './components/OnayBekleyenlerSayfasi';
import { MimariVeKodPaneli } from './components/MimariVeKodPaneli';
import { GorselVeAiSiparisMasasi } from './components/GorselVeAiSiparisMasasi';
import { MusteriRehberi } from './components/MusteriRehberi';
import { KuryeTeslimatMasasi } from './components/KuryeTeslimatMasasi';
import { KanbanGorunumu } from './components/KanbanGorunumu';
import { MobilAltNav } from './components/MobilAltNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { VeritabaniYonetimModal } from './components/VeritabaniYonetimModal';
import { IzolasyonDogrulamaModal } from './components/IzolasyonDogrulamaModal';
import { KargoEntegrasyonModal } from './components/KargoEntegrasyonModal';
import { LandingPage } from './components/landing/LandingPage';
import { ButikQeydiyyatModal } from './components/landing/ButikQeydiyyatModal';
import { AccessGateModal } from './components/AccessGateModal';
import { DavetQebulSayfasi } from './components/DavetQebulSayfasi';
import { DavetOlusturModal } from './components/DavetOlusturModal';
import { TenantOnayMerkeziModal } from './components/TenantOnayMerkeziModal';
import { CheckCircle2, Trash2, X, Loader2, RotateCcw } from 'lucide-react';

type SekmeTipi = 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'kargo-merkezi' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi';

const pathMap: Record<string, SekmeTipi> = {
  '/': 'panel',
  '/app': 'panel',
  '/kanban': 'kanban',
  '/gorsel-giris': 'gorsel-giris',
  '/musteriler': 'musteriler',
  '/kargo-manifest': 'kargo-manifest',
  '/kargo-merkezi': 'kargo-merkezi',
  '/baku-tahsilat': 'baku-tahsilat',
  '/inbox': 'inbox',
  '/kurye-masasi': 'kurye-masasi',
  '/kodlar': 'kodlar',
};

const sekmeToPath: Record<SekmeTipi, string> = {
  'panel': '/app',
  'kanban': '/kanban',
  'gorsel-giris': '/gorsel-giris',
  'musteriler': '/musteriler',
  'kargo-manifest': '/kargo-manifest',
  'kargo-merkezi': '/kargo-merkezi',
  'baku-tahsilat': '/baku-tahsilat',
  'inbox': '/inbox',
  'kurye-masasi': '/kurye-masasi',
  'kodlar': '/kodlar',
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Zustand Global Store
  const {
    siparisler,
    firmalar,
    seciliFirmaId,
    aktifRol,
    inboxSayisi,
    bildirim,
    dbKaynak,
    menuDar,
    seciliKuryeId,
    firmaSiparisSayilariServer,
    setFirmalar,
    setSeciliFirmaId,
    setAktifRol,
    setBildirim,
    setMenuDar,
    setSeciliKuryeId,
    siparisEkle,
    siparisGuncelle,
    siparisSil,
    siparisleriYukle,
    firmalariYukle,
    inboxSayisiGuncelle,
  } = useAppStore();

  // URL tabanlı aktif sekme senkronizasyonu
  const aktifSekme: SekmeTipi = pathMap[location.pathname] || 'panel';

  const handleSekmeDegistir = (yeniSekme: SekmeTipi) => {
    const hedefYol = sekmeToPath[yeniSekme] || '/';
    navigate(hedefYol);
  };

  // Local UI State (Modallar ve Geçici Seçimler)
  const [veritabaniModalAcik, setVeritabaniModalAcik] = useState(false);
  const [izolasyonModalAcik, setIzolasyonModalAcik] = useState(false);
  const [seciliKodSekmesi, setSeciliKodSekmesi] = useState<string>('kurulum');
  const [mobilMenuAcik, setMobilMenuAcik] = useState(false);
  const [seciliSiparis, setSeciliSiparis] = useState<Siparis | null>(null);
  const [whatsappSiparis, setWhatsappSiparis] = useState<Siparis | null>(null);
  const [silinecekSiparis, setSilinecekSiparis] = useState<Siparis | null>(null);
  const [silmeIslemiSuruyor, setSilmeIslemiSuruyor] = useState(false);
  const [kargoManifestAcik, setKargoManifestAcik] = useState(false);
  const [kargoModalAcik, setKargoModalAcik] = useState(false);
  const [bakuTahsilatAcik, setBakuTahsilatAcik] = useState(false);
  const [inboxAcik, setInboxAcik] = useState(false);
  const [davetModalAcik, setDavetModalAcik] = useState(false);
  const [tenantOnayModalAcik, setTenantOnayModalAcik] = useState(false);
  const [accessGateAcik, setAccessGateAcik] = useState(false);
  const [gateHedef, setGateHedef] = useState<'panel' | 'demo'>('panel');
  const [butikQeydiyyatAcik, setButikQeydiyyatAcik] = useState(false);

  // Giriş icazəsi: sessionStorage və ya localStorage
  const [hasAccess, setHasAccess] = useState<boolean>(() => {
    try {
      if (sessionStorage.getItem('tomnap_access_granted') === 'true') return true;
      if (localStorage.getItem('tomnap_access_granted') === 'true') return true;
    } catch {}
    return false;
  });

  const bekleyenTenantSayisi = useMemo(() => {
    return firmalar.filter((f) => f.onayDurumu === 'BEKLEMEDE').length;
  }, [firmalar]);

  const handleMenuDarDegistir = (yeniDurum?: boolean) => {
    setMenuDar((onceki) => (typeof yeniDurum === 'boolean' ? yeniDurum : !onceki));
  };

  useEffect(() => {
    firmalariYukle();
  }, []);

  useEffect(() => {
    siparisleriYukle(seciliFirmaId);
    inboxSayisiGuncelle(seciliFirmaId);
  }, [seciliFirmaId]);

  // Multi-Tenant Filtreleme: Seçili firmaya göre siparişleri izole et
  const goruntulenenSiparisler = useMemo(() => {
    if (seciliFirmaId === 'all') return siparisler;
    return siparisler.filter((s) => (s.tenant_id || 'kanada_shopper_baku') === seciliFirmaId);
  }, [siparisler, seciliFirmaId]);

  // Her firmanın sipariş sayısı
  const firmaSiparisSayilari = useMemo(() => {
    const counts: Record<string, number> = { ...firmaSiparisSayilariServer };
    for (const s of siparisler) {
      const tid = s.tenant_id || 'kanada_shopper_baku';
      counts[tid] = (counts[tid] || 0) + 1;
    }
    return counts;
  }, [siparisler, firmaSiparisSayilariServer]);

  const bildirimGoster = (mesaj: string) => {
    setBildirim(mesaj);
    setTimeout(() => setBildirim(null), 3500);
  };

  // URL query parameter token kontrolü: ?key=tomnap2026 və ya ?token=tomnap2026
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlKey = (searchParams.get('key') || searchParams.get('token') || searchParams.get('access_code') || '').trim().toLowerCase();
      const envCode = (import.meta.env.VITE_ACCESS_CODE || '').trim().toLowerCase();
      const validCodes = new Set(['tomnap2026', 'admin2026', 'tomnap']);
      if (envCode) validCodes.add(envCode);

      if (urlKey && validCodes.has(urlKey)) {
        sessionStorage.setItem('tomnap_access_granted', 'true');
        localStorage.setItem('tomnap_access_granted', 'true');
        setHasAccess(true);
        // Parametri URL-dən təmizlə
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        bildirimGoster('Səlahiyyətli giriş təsdiqləndi! Xoş gəlmisiniz.');
      }
    } catch {}
  }, []);

  const handlePanelGirisIsteyi = () => {
    if (hasAccess) {
      navigate('/app');
    } else {
      setGateHedef('panel');
      setAccessGateAcik(true);
    }
  };

  const handleDemoGirisIsteyi = () => {
    if (hasAccess) {
      setSeciliFirmaId('demo_sandbox');
      bildirimGoster('Canlı Sandbox Demo Mühitinə keçid edildi! 109 nümunəvi sifariş aktivdir.');
      navigate('/app');
    } else {
      setGateHedef('demo');
      setAccessGateAcik(true);
    }
  };

  const handleBasariliGiris = (hedef: 'panel' | 'demo') => {
    setHasAccess(true);
    setAccessGateAcik(false);
    if (hedef === 'demo') {
      setSeciliFirmaId('demo_sandbox');
      bildirimGoster('Canlı Sandbox Demo Mühitinə keçid edildi! 109 nümunəvi sifariş aktivdir.');
    } else {
      bildirimGoster('İş masasına giriş təsdiqləndi.');
    }
    navigate('/app');
  };

  const handleBasariliKayit = (yeniFirma: any) => {
    try {
      sessionStorage.setItem('tomnap_access_granted', 'true');
      localStorage.setItem('tomnap_access_granted', 'true');
    } catch {}
    setHasAccess(true);
    setAccessGateAcik(false);
    setButikQeydiyyatAcik(false);
    if (yeniFirma?.id) {
      setSeciliFirmaId(yeniFirma.id);
    }
    firmalariYukle();
    bildirimGoster(`Təbriklər! "${yeniFirma?.ad || 'Yeni Butik'}" iş sahəsinə daxil oldunuz.`);
    navigate('/app');
  };

  const handleKilidle = () => {
    try {
      sessionStorage.removeItem('tomnap_access_granted');
      localStorage.removeItem('tomnap_access_granted');
    } catch {}
    setHasAccess(false);
    bildirimGoster('İş masası kilidləndi.');
    navigate('/');
  };

  // 1. İctimai Landing Page (Vitrin) — tomnap.com ana səhifəsi
  if (location.pathname === '/' || location.pathname === '/landing') {
    return (
      <>
        <LandingPage
          onPanelAc={handlePanelGirisIsteyi}
          onDemoAc={handleDemoGirisIsteyi}
          onBasariliKayit={handleBasariliKayit}
          toplamSiparis={siparisler.length}
        />
        <AccessGateModal
          acik={accessGateAcik}
          hedef={gateHedef}
          onBasariliGiris={handleBasariliGiris}
          onKapat={() => setAccessGateAcik(false)}
          onQeydiyyatAc={() => setButikQeydiyyatAcik(true)}
        />
        <ButikQeydiyyatModal
          acik={butikQeydiyyatAcik}
          onKapat={() => setButikQeydiyyatAcik(false)}
          onDemoAc={handleDemoGirisIsteyi}
          onBasariliKayit={handleBasariliKayit}
        />
      </>
    );
  }

  // 2. Komanda Dəvət Qəbul Səhifəsi (/davet və ya /davet/:token)
  if (location.pathname === '/davet' || location.pathname.startsWith('/davet')) {
    return <DavetQebulSayfasi />;
  }

  // 3. Qorunan Sahə: Əgər daxili yola (/app, /kurye və s.) icazəsiz daxil olmaq istəyirsə
  if (!hasAccess) {
    return (
      <>
        <LandingPage
          onPanelAc={handlePanelGirisIsteyi}
          onDemoAc={handleDemoGirisIsteyi}
          onBasariliKayit={handleBasariliKayit}
          toplamSiparis={siparisler.length}
        />
        <AccessGateModal
          acik={true}
          hedef="panel"
          onBasariliGiris={handleBasariliGiris}
          onKapat={() => navigate('/')}
          onQeydiyyatAc={() => setButikQeydiyyatAcik(true)}
        />
        <ButikQeydiyyatModal
          acik={butikQeydiyyatAcik}
          onKapat={() => setButikQeydiyyatAcik(false)}
          onDemoAc={handleDemoGirisIsteyi}
          onBasariliKayit={handleBasariliKayit}
        />
      </>
    );
  }

  // Yeni sipariş eklendiğinde
  const handleSiparisEklendi = (yeniSiparis: Siparis) => {
    siparisEkle(yeniSiparis);
    bildirimGoster(`"${yeniSiparis.musteri_adi}" adlı müşterinin siparişi başarıyla işlendi.`);
  };

  // Durum veya alan güncelleme
  const handleDurumGuncelle = async (id: string, guncellemeler: Partial<Siparis>) => {
    // 1. İyimser yerel güncelleme
    siparisGuncelle(id, guncellemeler);

    if (seciliSiparis && seciliSiparis.id === id) {
      setSeciliSiparis((onceki) => (onceki ? { ...onceki, ...guncellemeler } : null));
    }

    // 2. Sunucuya bildirme
    try {
      await fetch(`/api/siparisler/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guncellemeler),
      });
      bildirimGoster('Sipariş durumu güncellendi.');
    } catch (err) {
      console.error('Güncelleme hatası:', err);
    }
  };

  // Sipariş silme onayı başlat
  const handleSiparisSil = (id: string) => {
    const s = siparisler.find((item) => item.id === id);
    if (s) {
      setSilinecekSiparis(s);
    }
  };

  // Onaylandıktan sonra sunucu ve Supabase'den kalıcı silme
  const handleSiparisKesinSil = async () => {
    if (!silinecekSiparis) return;
    const silinecekId = silinecekSiparis.id;
    const musteriAdi = silinecekSiparis.musteri_adi;
    setSilmeIslemiSuruyor(true);

    try {
      await fetch(`/api/siparisler/${silinecekId}`, { method: 'DELETE' });
      siparisSil(silinecekId);
      if (seciliSiparis?.id === silinecekId) setSeciliSiparis(null);
      setSilinecekSiparis(null);
      bildirimGoster(`"${musteriAdi}" adlı müşterinin siparişi başarıyla silindi.`);
    } catch (err) {
      console.error('Silme hatası:', err);
      siparisSil(silinecekId);
      setSilinecekSiparis(null);
      bildirimGoster('Sipariş yerel listeden kaldırıldı.');
    } finally {
      setSilmeIslemiSuruyor(false);
    }
  };

  // Demo Sandbox sıfırlama
  const [demoSifirlanir, setDemoSifirlanir] = useState(false);
  const handleDemoSifirla = async () => {
    setDemoSifirlanir(true);
    try {
      const res = await fetch('/api/demo/sifirla', { method: 'POST' });
      const data = await res.json();
      if (data.basarili) {
        bildirimGoster(data.mesaj);
        siparisleriYukle('demo_sandbox');
      }
    } catch (e) {
      bildirimGoster('Demo mühiti sıfırlanarkən xəta baş verdi.');
    } finally {
      setDemoSifirlanir(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Sol Sidebar (Yan Menü) */}
      <YanMenu
        aktifSekme={aktifSekme}
        setAktifSekme={handleSekmeDegistir}
        seciliKodSekmesi={seciliKodSekmesi}
        setSeciliKodSekmesi={setSeciliKodSekmesi}
        toplamSiparis={goruntulenenSiparisler.length}
        mobilAcik={mobilMenuAcik}
        setMobilAcik={setMobilMenuAcik}
        dar={menuDar}
        onDarDegistir={handleMenuDarDegistir}
        onKargoManifestAc={() => handleSekmeDegistir('kargo-manifest')}
        onBakuTahsilatAc={() => handleSekmeDegistir('baku-tahsilat')}
        onInboxAc={() => handleSekmeDegistir('inbox')}
        inboxSayisi={inboxSayisi}
        aktifRol={aktifRol}
        onVeritabaniModalAc={() => setVeritabaniModalAcik(true)}
        onVitrinAc={() => navigate('/')}
        onDavetModalAc={() => setDavetModalAcik(true)}
        onTenantOnayModalAc={() => setTenantOnayModalAcik(true)}
        bekleyenTenantSayisi={bekleyenTenantSayisi}
      />

      {/* Ana Çalışma Alanı */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Üst Başlık Barı */}
        <UstBaslik
          aktifSekme={aktifSekme}
          setAktifSekme={handleSekmeDegistir}
          toplamSiparis={goruntulenenSiparisler.length}
          onMobilMenuAc={() => setMobilMenuAcik(true)}
          menuDar={menuDar}
          onMenuDarDegistir={() => handleMenuDarDegistir()}
          dbKaynak={dbKaynak}
          onInboxAc={() => handleSekmeDegistir('inbox')}
          inboxSayisi={inboxSayisi}
          aktifRol={aktifRol}
          onRolDegistir={(yeniRol) => {
            setAktifRol(yeniRol);
            if (yeniRol === 'BAKU_KURYE') {
              handleSekmeDegistir('kurye-masasi');
            } else if (yeniRol === 'PATRON' && aktifSekme === 'kodlar') {
              handleSekmeDegistir('panel');
            }
            bildirimGoster(`Rol dəyişdirildi: ${yeniRol}`);
          }}
          seciliKuryeId={seciliKuryeId}
          onKuryeSec={(id) => {
            setSeciliKuryeId(id);
            bildirimGoster(`Aktiv kurye seçildi.`);
          }}
          firmalar={firmalar}
          seciliFirmaId={seciliFirmaId}
          onFirmaSec={(id) => {
            setSeciliFirmaId(id);
            const secilenFirma = firmalar.find(f => f.id === id);
            bildirimGoster(id === 'all' ? 'Bütün butiklərin sifarişləri göstərilir' : `İş sahəsi: ${secilenFirma?.ad || id}`);
          }}
          onVeritabaniModalAc={() => setVeritabaniModalAcik(true)}
          onYeniFirmaAc={() => setVeritabaniModalAcik(true)}
          firmaSiparisSayilari={firmaSiparisSayilari}
          onIzolasyonModalAc={() => setIzolasyonModalAcik(true)}
          onKargoModalAc={() => setKargoModalAcik(true)}
          onVitrinAc={() => navigate('/')}
          onDavetModalAc={() => setDavetModalAcik(true)}
          onTenantOnayModalAc={() => setTenantOnayModalAcik(true)}
          bekleyenTenantSayisi={bekleyenTenantSayisi}
          onKilidle={handleKilidle}
        />

        {/* Canlı Demo Sandbox Xəbərdarlıq və Sıfırlama Paneli */}
        {seciliFirmaId === 'demo_sandbox' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 shrink-0 shadow-2xs">
            <div className="flex items-center space-x-2.5">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span>
                <strong className="font-semibold text-amber-950">🧪 Sınaq Sandbox Mühiti (Canlı Demo):</strong> Bu rejimdə istədiyiniz sifarişi əlavə edə, redaktə edə və ya silə bilərsiniz. Canlı verilənlər bazası 100% zirehli qorunur.
              </span>
            </div>
            <button
              type="button"
              onClick={handleDemoSifirla}
              disabled={demoSifirlanir}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-medium rounded-lg shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0 ml-3"
              title="Orijinal 96 qızıl sifariş məlumatını ilkin vəziyyətinə qaytar"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${demoSifirlanir ? 'animate-spin' : ''}`} />
              <span>{demoSifirlanir ? 'Sıfırlanır...' : 'Demo Məlumatlarını Sıfırla'}</span>
            </button>
          </div>
        )}

        {/* Başarı / Bilgi Bildirim Toast */}
        {bildirim && (
          <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{bildirim}</span>
          </div>
        )}

        {/* Ana İçerik Scroll Alanı */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-24 lg:pb-8">
          {aktifSekme === 'panel' ? (
            <>
              {/* 1. Finans & Lojistik İstatistikleri (4 Metrik Kartı) */}
              <FinansLojistikOzet siparisler={goruntulenenSiparisler} />

              {/* Hızlı Görsel Giriş Çağrı Bannerı */}
              <div className="bg-gradient-to-r from-emerald-900/90 via-slate-900 to-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-700/40 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <span className="text-lg">📸</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">WhatsApp Grubu & Görsel Sipariş Masası</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Gruptan gelen ürün fotoğraflarını ve konuşma notlarını tek hamlede yükleyip Gemini AI ile siparişe dönüştürün.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleSekmeDegistir('gorsel-giris')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-2"
                >
                  <span>Görsel Masasını Aç</span>
                  <span>→</span>
                </button>
              </div>

              {/* Kargo & Aramex Lojistika Mərkəzi Çağrı Bannerı */}
              <div className="bg-gradient-to-r from-blue-900/90 via-slate-900 to-indigo-950 p-4 sm:p-5 rounded-2xl border border-blue-700/40 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                    <span className="text-lg">✈️</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Kargo & Aramex Lojistika Mərkəzi</h4>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 border border-blue-400/40 uppercase">
                        Canlı Aramex API
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Toronto ➔ Bakı kargo uçuşları, AWB barkod izləməsi, gündəlik ixracat cədvəlləri və daşıyıcı tənzimləmələri.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-banner-kargo-merkezi"
                  onClick={() => handleSekmeDegistir('kargo-merkezi')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-2"
                >
                  <span>Kargo Mərkəzini Aç</span>
                  <span>→</span>
                </button>
              </div>

              {/* 2. Ana Sipariş Tablosu */}
              <SiparisTablosu
                siparisler={goruntulenenSiparisler}
                onDurumGuncelle={handleDurumGuncelle}
                onSiparisSil={handleSiparisSil}
                onSiparisSec={(siparis) => setSeciliSiparis(siparis)}
                onWhatsAppSec={(siparis) => setWhatsappSiparis(siparis)}
                onKargoManifestAc={() => handleSekmeDegistir('kargo-manifest')}
                onBakuTahsilatAc={() => handleSekmeDegistir('baku-tahsilat')}
                onInboxAc={() => handleSekmeDegistir('inbox')}
                inboxSayisi={inboxSayisi}
              />
            </>
          ) : aktifSekme === 'kanban' ? (
            /* Lojistik Kanban Boru Xətti (5 Mərhələ) */
            <div className="space-y-4">
              <KanbanGorunumu
                siparisler={goruntulenenSiparisler}
                onDurumGuncelle={handleDurumGuncelle}
                onSiparisSec={(siparis) => setSeciliSiparis(siparis)}
                onWhatsAppSec={(siparis) => setWhatsappSiparis(siparis)}
              />
            </div>
          ) : aktifSekme === 'gorsel-giris' ? (
            /* 2. Özel Görsel & WhatsApp AI Giriş Masası */
            <GorselVeAiSiparisMasasi
              onSiparisEklendi={handleSiparisEklendi}
              onSiparislereDon={() => handleSekmeDegistir('panel')}
              seciliFirmaId={seciliFirmaId}
              seciliFirmaAd={firmalar.find(f => f.id === seciliFirmaId)?.ad}
            />
          ) : aktifSekme === 'musteriler' ? (
            /* 3. Müşteri Veritabanı & CRM Rehberi */
            <MusteriRehberi
              onSiparislereGit={() => handleSekmeDegistir('panel')}
              onSiparisDetayAc={(siparis) => setSeciliSiparis(siparis)}
              seciliFirmaId={seciliFirmaId}
              seciliFirmaAd={firmalar.find(f => f.id === seciliFirmaId)?.ad}
            />
          ) : aktifSekme === 'kargo-manifest' ? (
            /* 4. Kanada ➔ Bakü Kargo Manifestosu & Çeki Listesi */
            <KargoManifestoSayfasi
              siparisler={goruntulenenSiparisler}
              onSiparislereDon={() => handleSekmeDegistir('panel')}
              onSiparisDetayAc={(siparis) => setSeciliSiparis(siparis)}
            />
          ) : aktifSekme === 'kargo-merkezi' ? (
            /* 4.1 Kargo & Aramex Lojistika Mərkəzi */
            <KargoMerkeziSayfasi
              siparisler={goruntulenenSiparisler}
              onSiparisDetayAc={(siparis) => setSeciliSiparis(siparis)}
            />
          ) : aktifSekme === 'baku-tahsilat' ? (
            /* 5. Bakı Qalıq Borc & Təhsilat Masası */
            <BakuTahsilatSayfasi
              siparisler={goruntulenenSiparisler}
              onDurumGuncelle={handleDurumGuncelle}
              onSiparislereDon={() => handleSekmeDegistir('panel')}
              onSiparisDetayAc={(siparis) => setSeciliSiparis(siparis)}
            />
          ) : aktifSekme === 'inbox' ? (
            /* 6. Gələn Qutusu: Təsdiq Gözləyən Sifarişlər */
            <OnayBekleyenlerSayfasi
              onSiparisOnaylandi={(yeniSiparis) => {
                handleSiparisEklendi(yeniSiparis);
                inboxSayisiGuncelle();
                bildirimGoster(`✅ "${yeniSiparis.musteri_adi}" sifarişi təsdiqləndi və əsas bazaya əlavə edildi!`);
              }}
              onSiparislereDon={() => handleSekmeDegistir('panel')}
              onYenile={inboxSayisiGuncelle}
              seciliFirmaId={seciliFirmaId}
              seciliFirmaAd={firmalar.find(f => f.id === seciliFirmaId)?.ad}
            />
          ) : aktifSekme === 'kurye-masasi' ? (
            /* 7. Bakü Kurye & Saha Dağıtım Masası (Mobil Uyumlu) */
            <KuryeTeslimatMasasi
              siparisler={goruntulenenSiparisler}
              seciliKuryeId={seciliKuryeId}
              onKuryeDegistir={setSeciliKuryeId}
              onSiparisGuncelle={(guncel) => handleDurumGuncelle(guncel.id, guncel)}
              onSiparisDetayAc={(siparis) => setSeciliSiparis(siparis)}
              kullaniciRolu={aktifRol}
              seciliFirmaId={seciliFirmaId}
              seciliFirmaAd={firmalar.find(f => f.id === seciliFirmaId)?.ad}
              firmalar={firmalar}
              onFirmaSec={(id) => {
                setSeciliFirmaId(id);
                const secilenFirma = firmalar.find(f => f.id === id);
                bildirimGoster(id === 'all' ? 'Bütün butiklərin sifarişləri göstərilir' : `Aktiv butik: ${secilenFirma?.ad || id}`);
              }}
              onSiparisleriYukle={siparisleriYukle}
            />
          ) : (
            /* 8. Sistem Mimarisi & Kod Üreticisi */
            <MimariVeKodPaneli
              seciliAltSekme={seciliKodSekmesi}
              onAltSekmeDegistir={setSeciliKodSekmesi}
            />
          )}

          {/* Alt Bilgi Footer */}
          <footer className="border-t border-slate-200 pt-4 mt-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
              <div>
                Kanada ➔ Bakü Instagram E-Ticaret & Lojistik Yönetim Platformu
              </div>
              <div className="flex items-center gap-3">
                <span>Express Modüler Mimari</span>
                <span>•</span>
                <span>Supabase PostgreSQL</span>
                <span>•</span>
                <span>Google Gemini AI</span>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* 1. Sipariş Detay Modalı */}
      <SiparisDetayModal
        siparis={seciliSiparis}
        onKapat={() => setSeciliSiparis(null)}
        onGuncelle={handleDurumGuncelle}
        onWhatsAppAc={(siparis) => setWhatsappSiparis(siparis)}
      />

      {/* 2. Müşteriye WhatsApp Bildirim Modalı */}
      <WhatsAppBildirimModal
        siparis={whatsappSiparis}
        onKapat={() => setWhatsappSiparis(null)}
      />

      {/* 3. Kanada ➔ Bakü Kargo Manifestosu & Çeki Listesi Modalı */}
      {kargoManifestAcik && (
        <KargoManifestoModal
          siparisler={goruntulenenSiparisler}
          onKapat={() => setKargoManifestAcik(false)}
        />
      )}

      {/* 4. Bakü Tahsilat & Kasa Raporu Modalı */}
      {bakuTahsilatAcik && (
        <BakuTahsilatModal
          siparisler={goruntulenenSiparisler}
          onDurumGuncelle={handleDurumGuncelle}
          onKapat={() => setBakuTahsilatAcik(false)}
        />
      )}

      {/* 5. Gelen Kutusu (Onay Bekleyenler) Modalı */}
      {inboxAcik && (
        <OnayBekleyenlerModal
          seciliFirmaId={seciliFirmaId}
          seciliFirmaAd={firmalar.find(f => f.id === seciliFirmaId)?.ad}
          onKapat={() => {
            setInboxAcik(false);
            inboxSayisiGuncelle();
          }}
          onSiparisOnaylandi={(yeniSiparis) => {
            handleSiparisEklendi(yeniSiparis);
            inboxSayisiGuncelle();
            setBildirim(`✅ "${yeniSiparis.musteri_adi}" siparişi onaylandı ve resmi listeye eklendi!`);
            setTimeout(() => setBildirim(null), 4000);
          }}
        />
      )}

      {/* 6. İframe Uyumlu Sipariş Silme Onay Modalı */}
      {silinecekSiparis && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Siparişi Silmek İstiyor musunuz?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Bu işlem siparişi ve bağlı verileri veritabanından silecektir.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSilinecekSiparis(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Müşteri:</span>
                <span className="font-bold text-slate-900">{silinecekSiparis.musteri_adi}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Ürün(ler):</span>
                <span className="font-semibold text-slate-800 text-right max-w-[220px] truncate">
                  {silinecekSiparis.urun_aciklamasi}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Toplam Tutar:</span>
                <span className="font-extrabold text-slate-900">
                  {silinecekSiparis.toplam_tutar} {silinecekSiparis.para_birimi || 'AZN'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSilinecekSiparis(null)}
                disabled={silmeIslemiSuruyor}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSiparisKesinSil}
                disabled={silmeIslemiSuruyor}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {silmeIslemiSuruyor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Siliniyor...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Evet, Kalıcı Olarak Sil
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobil Cihazlar İçin Alt Hızlı Navigasyon Barı */}
      <MobilAltNav
        aktifSekme={aktifSekme}
        setAktifSekme={handleSekmeDegistir}
        onMobilMenuAc={() => setMobilMenuAcik(true)}
        inboxSayisi={inboxSayisi}
      />

      {/* Verilənlər Bazası & Canlı/Demo SaaS İdarəetmə Modalı */}
      <VeritabaniYonetimModal
        acik={veritabaniModalAcik}
        onKapat={() => setVeritabaniModalAcik(false)}
        firmalar={firmalar}
        onFirmalarGuncelle={firmalariYukle}
        onSiparislerYenilendi={siparisleriYukle}
        bildirimGoster={bildirimGoster}
        seciliFirmaId={seciliFirmaId}
        onFirmaSec={setSeciliFirmaId}
      />

      {/* Tenant İzolasiya & Təhlükəsizlik Testi Modalı */}
      <IzolasyonDogrulamaModal
        acik={izolasyonModalAcik}
        onKapat={() => setIzolasyonModalAcik(false)}
        seciliFirmaId={seciliFirmaId}
        firmalar={firmalar}
      />

      {/* Çoxlu Kargo (Multi-Carrier) & Aramex API İnteqrasiya Modalı */}
      <KargoEntegrasyonModal
        acik={kargoModalAcik}
        onKapat={() => setKargoModalAcik(false)}
        seciliTenantId={seciliFirmaId}
        onAyarlarGuncellendi={() => {
          siparisleriYukle(seciliFirmaId);
        }}
      />

      {/* 7. Komanda Dəvət Linki Modalı (Patron & Super Admin) */}
      <DavetOlusturModal
        acik={davetModalAcik}
        onKapat={() => setDavetModalAcik(false)}
        seciliFirma={firmalar.find((f) => f.id === seciliFirmaId) || firmalar[0] || null}
      />

      {/* 8. Super Admin Butik Təsdiq Mərkəzi Modalı */}
      <TenantOnayMerkeziModal
        acik={tenantOnayModalAcik}
        onKapat={() => setTenantOnayModalAcik(false)}
        firmalar={firmalar}
        onFirmalariYenile={firmalariYukle}
      />

      {/* İnternet ve Oflayn Durum Bildiricisi */}
      <OfflineIndicator />
    </div>
  );
}
