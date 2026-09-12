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
import { CheckCircle2, Trash2, X, Loader2 } from 'lucide-react';

type SekmeTipi = 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi';

const pathMap: Record<string, SekmeTipi> = {
  '/': 'panel',
  '/kanban': 'kanban',
  '/gorsel-giris': 'gorsel-giris',
  '/musteriler': 'musteriler',
  '/kargo-manifest': 'kargo-manifest',
  '/baku-tahsilat': 'baku-tahsilat',
  '/inbox': 'inbox',
  '/kurye-masasi': 'kurye-masasi',
  '/kodlar': 'kodlar',
};

const sekmeToPath: Record<SekmeTipi, string> = {
  'panel': '/',
  'kanban': '/kanban',
  'gorsel-giris': '/gorsel-giris',
  'musteriler': '/musteriler',
  'kargo-manifest': '/kargo-manifest',
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
  const [bakuTahsilatAcik, setBakuTahsilatAcik] = useState(false);
  const [inboxAcik, setInboxAcik] = useState(false);

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
        />

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

      {/* İnternet ve Oflayn Durum Bildiricisi */}
      <OfflineIndicator />
    </div>
  );
}
