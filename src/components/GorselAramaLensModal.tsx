import React, { useState, useRef, useEffect } from 'react';
import {
  Scan,
  Search,
  Maximize2,
  Minimize2,
  RotateCcw,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Upload,
  X,
  Sparkles,
  Globe,
  ImageIcon,
  Crop,
} from 'lucide-react';
import { SiparisUrunKalemi } from '../types';
import { cropImageFromBox } from '../utils/imageCropper';

interface GorselAramaLensModalProps {
  urun: SiparisUrunKalemi;
  urunIndex: number;
  siparisId: string;
  tumGorseller: string[];
  mevcutUrunGorseli?: string;
  onKapat: () => void;
  onGorselSecildi: (gorselUrl: string, urunSayfasi?: string, resmiAd?: string) => Promise<void>;
  onOrijinaleDon?: () => Promise<void>;
}

export const GorselAramaLensModal: React.FC<GorselAramaLensModalProps> = ({
  urun,
  urunIndex,
  siparisId,
  tumGorseller,
  mevcutUrunGorseli,
  onKapat,
  onGorselSecildi,
  onOrijinaleDon,
}) => {
  // Seçili kaynak görsel (kullanıcı birden fazla ham görsel arasından seçebilir)
  const [seciliKaynakGorsel, setSeciliKaynakGorsel] = useState<string>(() => {
    return urun.orijinal_gorsel_url || tumGorseller[0] || mevcutUrunGorseli || '';
  });

  // Odak alanı (0 - 1000 normalize koordinatlar)
  const [ymin, setYmin] = useState(urun.urun_alani?.ymin ?? 150);
  const [xmin, setXmin] = useState(urun.urun_alani?.xmin ?? 150);
  const [ymax, setYmax] = useState(urun.urun_alani?.ymax ?? 850);
  const [xmax, setXmax] = useState(urun.urun_alani?.xmax ?? 850);

  // İsteğe bağlı ek arama ipucu
  const [ekIpucu, setEkIpucu] = useState('');

  // Arama durumu
  const [araniyor, setAraniyor] = useState(false);
  const [aramaHatasi, setAramaHatasi] = useState<string | null>(null);
  const [aramaSonucu, setAramaSonucu] = useState<any>(null);
  const [tarananKirpinti, setTarananKirpinti] = useState<string | null>(null);
  const [denenenGorselSrc, setDenenenGorselSrc] = useState<string>('');
  const [proxyDendiMi, setProxyDendiMi] = useState<boolean>(false);
  const [sonucGorselGecerli, setSonucGorselGecerli] = useState<boolean | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [manuelUrl, setManuelUrl] = useState('');
  const [kaynakGorselYuklemeHatasi, setKaynakGorselYuklemeHatasi] = useState(false);

  // Sürükleme ve 4 köşeden / kenarlardan yeniden boyutlandırma
  type EtkilesimModu = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | null;
  const [etkilesimModu, setEtkilesimModu] = useState<EtkilesimModu>(null);
  const etkilesimRef = useRef<{
    mod: EtkilesimModu;
    startX: number;
    startY: number;
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  }>({
    mod: null,
    startX: 0,
    startY: 0,
    xmin: 150,
    ymin: 150,
    xmax: 850,
    ymax: 850,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dosyaYukleRef = useRef<HTMLInputElement>(null);

  // URL Çözümleyici
  const urlCozumle = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('/uploads/')) {
      return url;
    }
    if (url.includes('.png') || url.includes('.jpg') || url.includes('Panodan_')) {
      return `/uploads/${url}`;
    }
    return url;
  };

  const gorselUrl = urlCozumle(seciliKaynakGorsel);

  // Hızlı Hazır Odak Seçimleri
  const hizliAyarUygula = (tur: 'tum' | 'merkez' | 'ust' | 'alt' | 'kucult' | 'buyut') => {
    switch (tur) {
      case 'tum':
        setXmin(30);
        setYmin(30);
        setXmax(970);
        setYmax(970);
        break;
      case 'merkez':
        setXmin(200);
        setYmin(200);
        setXmax(800);
        setYmax(800);
        break;
      case 'ust':
        setXmin(100);
        setYmin(50);
        setXmax(900);
        setYmax(500);
        break;
      case 'alt':
        setXmin(100);
        setYmin(500);
        setXmax(900);
        setYmax(950);
        break;
      case 'buyut':
        setXmin(Math.max(20, xmin - 50));
        setYmin(Math.max(20, ymin - 50));
        setXmax(Math.min(980, xmax + 50));
        setYmax(Math.min(980, ymax + 50));
        break;
      case 'kucult':
        if (xmax - xmin > 200 && ymax - ymin > 200) {
          setXmin(xmin + 40);
          setYmin(ymin + 40);
          setXmax(xmax - 40);
          setYmax(ymax - 40);
        }
        break;
    }
  };

  // Etkileşim Başlatıcı (Taşıma veya Köşe / Kenar Boyutlandırma)
  const handleEtkilesimBaslat = (mod: EtkilesimModu, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    etkilesimRef.current = {
      mod,
      startX: clientX,
      startY: clientY,
      xmin,
      ymin,
      xmax,
      ymax,
    };
    setEtkilesimModu(mod);
  };

  useEffect(() => {
    if (!etkilesimModu) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const { mod, startX, startY, xmin: sXmin, ymin: sYmin, xmax: sXmax, ymax: sYmax } = etkilesimRef.current;
      if (!mod || !containerRef.current) return;

      if (e.cancelable) {
        e.preventDefault();
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dx = ((clientX - startX) / rect.width) * 1000;
      const dy = ((clientY - startY) / rect.height) * 1000;

      const MIN_BOYUT = 60; // Asgari %6 boyut

      if (mod === 'move') {
        const genislik = sXmax - sXmin;
        const yukseklik = sYmax - sYmin;

        let yeniXmin = Math.max(0, Math.min(1000 - genislik, sXmin + dx));
        let yeniYmin = Math.max(0, Math.min(1000 - yukseklik, sYmin + dy));

        setXmin(Math.round(yeniXmin));
        setYmin(Math.round(yeniYmin));
        setXmax(Math.round(yeniXmin + genislik));
        setYmax(Math.round(yeniYmin + yukseklik));
        return;
      }

      let yeniXmin = sXmin;
      let yeniYmin = sYmin;
      let yeniXmax = sXmax;
      let yeniYmax = sYmax;

      // Yatay Boyutlandırma
      if (mod === 'nw' || mod === 'sw' || mod === 'w') {
        yeniXmin = Math.max(0, Math.min(sXmax - MIN_BOYUT, sXmin + dx));
      } else if (mod === 'ne' || mod === 'se' || mod === 'e') {
        yeniXmax = Math.min(1000, Math.max(sXmin + MIN_BOYUT, sXmax + dx));
      }

      // Dikey Boyutlandırma
      if (mod === 'nw' || mod === 'ne' || mod === 'n') {
        yeniYmin = Math.max(0, Math.min(sYmax - MIN_BOYUT, sYmin + dy));
      } else if (mod === 'sw' || mod === 'se' || mod === 's') {
        yeniYmax = Math.min(1000, Math.max(sYmin + MIN_BOYUT, sYmax + dy));
      }

      setXmin(Math.round(yeniXmin));
      setYmin(Math.round(yeniYmin));
      setXmax(Math.round(yeniXmax));
      setYmax(Math.round(yeniYmax));
    };

    const handlePointerEnd = () => {
      etkilesimRef.current.mod = null;
      setEtkilesimModu(null);
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerEnd);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerEnd);
    window.addEventListener('touchcancel', handlePointerEnd);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerEnd);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerEnd);
      window.removeEventListener('touchcancel', handlePointerEnd);
    };
  }, [etkilesimModu]);

  // Aktif imleç türü
  const getImlecSinifi = () => {
    switch (etkilesimModu) {
      case 'move': return 'cursor-grabbing';
      case 'nw':
      case 'se': return 'cursor-nwse-resize';
      case 'ne':
      case 'sw': return 'cursor-nesw-resize';
      case 'n':
      case 's': return 'cursor-ns-resize';
      case 'w':
      case 'e': return 'cursor-ew-resize';
      default: return '';
    }
  };

  // Google Lens Tarama Başlat
  const handleLensAramaBaslat = async () => {
    if (!gorselUrl) return;
    setAraniyor(true);
    setAramaHatasi(null);
    setAramaSonucu(null);
    setSonucGorselGecerli(null);

    try {
      // 1. Seçili alanı istemcide kırpıp base64 üret (böylece tam aranan ürün Gemini'ye gider)
      const kirpintiBase64 = await cropImageFromBox(gorselUrl, {
        ymin,
        xmin,
        ymax,
        xmax,
      });
      setTarananKirpinti(kirpintiBase64);

      // 2. Backend'deki multimodal Lens servisine gönder
      const res = await fetch('/api/gorselden-urun-ara', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gorsel: kirpintiBase64,
          mevcut_urun_adi: urun.urun_adi || urun.urun_aciklamasi,
          ek_ipucu: ekIpucu.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.basarili && data.sonuc) {
        setAramaSonucu(data);
        const ilkGorsel = data.sonuc.katalog_gorsel_url || '';
        setDenenenGorselSrc(ilkGorsel);
        setProxyDendiMi(false);
        setSonucGorselGecerli(ilkGorsel ? null : false);
      } else {
        setAramaHatasi(data.hata || 'Görsel üzerinden ürün bilgisi tespit edilemedi.');
      }
    } catch (err: any) {
      console.error('Lens arama hatası:', err);
      setAramaHatasi(err.message || 'Arama sırasında bir hata oluştu.');
    } finally {
      setAraniyor(false);
    }
  };

  // Katalog stüdyo görseli doğrudan yüklenemezse vekil sunucuyu (proxy) dene
  const handleKatalogGorselHata = () => {
    if (!proxyDendiMi && denenenGorselSrc && denenenGorselSrc.startsWith('http') && !denenenGorselSrc.includes('/api/proxy-gorsel')) {
      console.log('[Lens] Görsel doğrudan yüklenemedi, vekil sunucu (proxy) deneniyor...');
      setProxyDendiMi(true);
      setDenenenGorselSrc(`/api/proxy-gorsel?url=${encodeURIComponent(denenenGorselSrc)}`);
    } else {
      setSonucGorselGecerli(false);
    }
  };

  // Bulunan Görseli Ürüne Tanımla
  const handleSecVeKaydet = async (gorselSecilenUrl: string, urunSayfasi?: string, resmiAd?: string) => {
    if (!gorselSecilenUrl) return;
    setKaydediliyor(true);
    try {
      await onGorselSecildi(gorselSecilenUrl, urunSayfasi, resmiAd);
      onKapat();
    } catch (err) {
      console.error('Görsel kaydetme hatası:', err);
    } finally {
      setKaydediliyor(false);
    }
  };

  // Cihazdan Yeni Fotoğraf Yükleme
  const handleDosyadanKatalogYukle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) {
        await handleSecVeKaydet(base64, aramaSonucu?.sonuc?.urun_sayfasi_url, aramaSonucu?.sonuc?.resmi_urun_adi);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Üst Başlık Çubuğu */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <span>Google Lens & Görselden Ara</span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/30 border border-sky-400/30 text-[10px] text-sky-200 font-extrabold uppercase">
                    AI Visual Search
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-300">
                Görseldeki ürünü çerçeve içine alıp aratın; yapay zeka orijinal stüdyo fotoğrafını ve mağaza linkini bulsun.
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ana İçerik: İki Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* SOL PANEL: Görsel ve Odak Vizörü (7 kolon) */}
          <div className="lg:col-span-7 p-4 sm:p-5 space-y-4 flex flex-col justify-between bg-slate-50/50">
            <div className="space-y-3">
              {/* Çoklu Görsel Seçimi (Varsa) */}
              {tumGorseller.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">Görsel Seç:</span>
                  {tumGorseller.map((imgUrl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSeciliKaynakGorsel(imgUrl)}
                      className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all cursor-pointer ${
                        seciliKaynakGorsel === imgUrl
                          ? 'border-sky-600 ring-2 ring-sky-200 scale-105'
                          : 'border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={urlCozumle(imgUrl)}
                        alt={`Görsel ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Görsel ve Google Lens Vizörü Konteyneri */}
              <div className="relative w-full max-h-[420px] min-h-[300px] bg-slate-950 rounded-xl overflow-hidden border border-slate-700 select-none flex items-center justify-center p-3 group">
                {etkilesimModu && (
                  <div className={`fixed inset-0 z-50 ${getImlecSinifi()} select-none`} />
                )}
                {gorselUrl && !kaynakGorselYuklemeHatasi ? (
                  <div
                    ref={containerRef}
                    className={`relative inline-block max-h-[390px] max-w-full rounded-lg shadow-2xl ${
                      etkilesimModu ? getImlecSinifi() : ''
                    }`}
                  >
                    <img
                      src={gorselUrl}
                      alt="Arama Görseli"
                      className="max-h-[390px] max-w-full w-auto h-auto block object-contain pointer-events-none rounded-lg"
                      onLoad={() => setKaynakGorselYuklemeHatasi(false)}
                      onError={() => setKaynakGorselYuklemeHatasi(true)}
                    />

                    {/* Karartma Maskesi */}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none rounded-lg" />

                    {/* Vizör Odak Çerçevesi (Google Lens Kutusu) */}
                    <div
                      onMouseDown={(e) => handleEtkilesimBaslat('move', e)}
                      onTouchStart={(e) => handleEtkilesimBaslat('move', e)}
                      style={{
                        top: `${ymin / 10}%`,
                        left: `${xmin / 10}%`,
                        width: `${(xmax - xmin) / 10}%`,
                        height: `${(ymax - ymin) / 10}%`,
                      }}
                      className={`absolute border-2 border-white rounded-lg shadow-2xl z-20 touch-none ${
                        etkilesimModu === 'move'
                          ? 'cursor-grabbing ring-4 ring-sky-400/60 shadow-[0_0_20px_rgba(56,189,248,0.5)]'
                          : 'cursor-grab hover:border-sky-300'
                      }`}
                    >
                      {/* Şeffaf iç alan */}
                      <div className="w-full h-full bg-white/5 backdrop-contrast-125 relative">
                        {/* 4 Köşede Tutulabilir & Boyutlandırılabilir Google Lens Köşe Tutamaçları */}
                        
                        {/* Sol-Üst Köşe (NW) */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('nw', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('nw', e)}
                          title="Köşeden Boyutlandır (Sol-Üst)"
                          className="absolute -top-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize z-30 group/corner touch-none"
                        >
                          <div className="relative w-4 h-4 flex items-center justify-center">
                            <div className="absolute inset-0 border-t-3 border-l-3 border-sky-400 rounded-tl shadow-[0_0_8px_rgba(56,189,248,0.9)] group-hover/corner:border-white group-hover/corner:scale-125 transition-transform" />
                            <div className="w-2 h-2 rounded-full bg-white shadow border border-sky-500 group-hover/corner:scale-125 transition-transform" />
                          </div>
                        </div>

                        {/* Sağ-Üst Köşe (NE) */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('ne', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('ne', e)}
                          title="Köşeden Boyutlandır (Sağ-Üst)"
                          className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize z-30 group/corner touch-none"
                        >
                          <div className="relative w-4 h-4 flex items-center justify-center">
                            <div className="absolute inset-0 border-t-3 border-r-3 border-sky-400 rounded-tr shadow-[0_0_8px_rgba(56,189,248,0.9)] group-hover/corner:border-white group-hover/corner:scale-125 transition-transform" />
                            <div className="w-2 h-2 rounded-full bg-white shadow border border-sky-500 group-hover/corner:scale-125 transition-transform" />
                          </div>
                        </div>

                        {/* Sol-Alt Köşe (SW) */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('sw', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('sw', e)}
                          title="Köşeden Boyutlandır (Sol-Alt)"
                          className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize z-30 group/corner touch-none"
                        >
                          <div className="relative w-4 h-4 flex items-center justify-center">
                            <div className="absolute inset-0 border-b-3 border-l-3 border-sky-400 rounded-bl shadow-[0_0_8px_rgba(56,189,248,0.9)] group-hover/corner:border-white group-hover/corner:scale-125 transition-transform" />
                            <div className="w-2 h-2 rounded-full bg-white shadow border border-sky-500 group-hover/corner:scale-125 transition-transform" />
                          </div>
                        </div>

                        {/* Sağ-Alt Köşe (SE) */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('se', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('se', e)}
                          title="Köşeden Boyutlandır (Sağ-Alt)"
                          className="absolute -bottom-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize z-30 group/corner touch-none"
                        >
                          <div className="relative w-4 h-4 flex items-center justify-center">
                            <div className="absolute inset-0 border-b-3 border-r-3 border-sky-400 rounded-br shadow-[0_0_8px_rgba(56,189,248,0.9)] group-hover/corner:border-white group-hover/corner:scale-125 transition-transform" />
                            <div className="w-2 h-2 rounded-full bg-white shadow border border-sky-500 group-hover/corner:scale-125 transition-transform" />
                          </div>
                        </div>

                        {/* 4 Kenar Tutamaçları (Üst, Alt, Sol, Sağ) */}
                        {/* Üst Kenar */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('n', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('n', e)}
                          title="Üst Kenardan Boyutlandır"
                          className="absolute -top-2 left-6 right-6 h-4 cursor-ns-resize z-20 flex items-center justify-center group/edge touch-none"
                        >
                          <div className="w-8 h-1 bg-white/70 group-hover/edge:bg-sky-400 group-hover/edge:h-1.5 rounded-full shadow transition-all" />
                        </div>

                        {/* Alt Kenar */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('s', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('s', e)}
                          title="Alt Kenardan Boyutlandır"
                          className="absolute -bottom-2 left-6 right-6 h-4 cursor-ns-resize z-20 flex items-center justify-center group/edge touch-none"
                        >
                          <div className="w-8 h-1 bg-white/70 group-hover/edge:bg-sky-400 group-hover/edge:h-1.5 rounded-full shadow transition-all" />
                        </div>

                        {/* Sol Kenar */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('w', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('w', e)}
                          title="Sol Kenardan Boyutlandır"
                          className="absolute -left-2 top-6 bottom-6 w-4 cursor-ew-resize z-20 flex items-center justify-center group/edge touch-none"
                        >
                          <div className="h-8 w-1 bg-white/70 group-hover/edge:bg-sky-400 group-hover/edge:w-1.5 rounded-full shadow transition-all" />
                        </div>

                        {/* Sağ Kenar */}
                        <div
                          onMouseDown={(e) => handleEtkilesimBaslat('e', e)}
                          onTouchStart={(e) => handleEtkilesimBaslat('e', e)}
                          title="Sağ Kenardan Boyutlandır"
                          className="absolute -right-2 top-6 bottom-6 w-4 cursor-ew-resize z-20 flex items-center justify-center group/edge touch-none"
                        >
                          <div className="h-8 w-1 bg-white/70 group-hover/edge:bg-sky-400 group-hover/edge:w-1.5 rounded-full shadow transition-all" />
                        </div>

                        {/* Tarama Çizgisi Animasyonu (Arama yapılıyorsa) */}
                        {araniyor && (
                          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-sky-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce" />
                        )}

                        {/* Orta Rozet */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-slate-900/85 text-white text-[9.5px] font-bold backdrop-blur-xs pointer-events-none whitespace-nowrap shadow-md flex items-center gap-1.5 border border-white/20 select-none opacity-85 group-hover:opacity-100 transition-opacity">
                          <Scan className="w-3 h-3 text-sky-400 shrink-0" />
                          <span>Odak Alanı (Taşıyın veya Köşelerden Büyütün)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-300 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-amber-400 border border-slate-700">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Görsel Yüklenemedi veya Dosya Bulunamadı</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Aşağıdaki butona basarak cihazınızdan fotoğraf yükleyebilir veya sağdaki alandan ürün linki verebilirsiniz.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dosyaYukleRef.current?.click()}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Cihazdan Fotoğraf Yükle</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Hızlı Vizör Kontrolleri */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('tum')}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    Tüm Görsel
                  </button>
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('merkez')}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    Merkez
                  </button>
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('ust')}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    Üst Kısım
                  </button>
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('alt')}
                    className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-[11px] font-semibold cursor-pointer transition-colors"
                  >
                    Alt Kısım
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('buyut')}
                    title="Alanı Genişlet"
                    className="p-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => hizliAyarUygula('kucult')}
                    title="Alanı Daralt"
                    className="p-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* İsteğe Bağlı Ek Arama İpucu */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <span>Ek Ürün İpucu (İsteğe Bağlı):</span>
                  <span className="text-[10px] text-slate-400 font-normal">ör: "Karl Lagerfeld terlik", "Siyah çanta"</span>
                </label>
                <input
                  type="text"
                  value={ekIpucu}
                  onChange={(e) => setEkIpucu(e.target.value)}
                  placeholder={urun.urun_adi || urun.urun_aciklamasi || 'Model veya marka ipucu girebilirsiniz...'}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Arama Başlat Butonu */}
            <div className="pt-2">
              <button
                type="button"
                disabled={araniyor || !gorselUrl}
                onClick={handleLensAramaBaslat}
                className="w-full py-2.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-98"
              >
                {araniyor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Görseldeki Ürün Web'de Taranıyor...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-sky-200" />
                    <span>Seçilen Odak Alanını İnternette Ara (Google Lens)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SAĞ PANEL: Arama Sonuçları & Orijinal Katalog Fotoğrafı (5 kolon) */}
          <div className="lg:col-span-5 p-4 sm:p-5 space-y-4 flex flex-col justify-between bg-white">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                  <span>Arama Sonuçları & Eşleşmeler</span>
                </span>
                {tarananKirpinti && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span>Taranan Alan:</span>
                    <img
                      src={tarananKirpinti}
                      alt="Taranan"
                      className="w-6 h-6 rounded object-cover border border-slate-300"
                    />
                  </div>
                )}
              </div>

              {/* Hata Durumu */}
              {aramaHatasi && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Eşleşme Bulunamadı</div>
                    <div className="text-[11px] text-rose-700 mt-0.5">{aramaHatasi}</div>
                    <p className="text-[10px] text-rose-600 mt-1">
                      İpucu: Soldaki çerçeveyi doğrudan ürünün logosuna veya gövdesine odaklayıp tekrar deneyebilirsiniz.
                    </p>
                  </div>
                </div>
              )}

              {/* Yükleniyor Durumu */}
              {araniyor && (
                <div className="p-8 text-center space-y-3 bg-sky-50/50 rounded-xl border border-sky-100">
                  <div className="relative w-12 h-12 mx-auto">
                    <div className="absolute inset-0 rounded-full border-4 border-sky-200 animate-ping" />
                    <div className="w-12 h-12 rounded-full border-4 border-sky-600 border-t-transparent animate-spin flex items-center justify-center">
                      <Scan className="w-5 h-5 text-sky-600" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-slate-800">Yapay Zeka Görseli İnceliyor</div>
                    <p className="text-[11px] text-slate-500">
                      Görseldeki desen, logo ve model analiz edilip Google arama dizininde eşleştiriliyor...
                    </p>
                  </div>
                </div>
              )}

              {/* Başarılı Arama Sonucu */}
              {aramaSonucu && aramaSonucu.sonuc && (
                <div className="space-y-3">
                  {/* Marka & Model Kartı */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-extrabold uppercase tracking-wide">
                        {aramaSonucu.sonuc.marka || 'Tespit Edilen Marka'}
                      </span>
                      {aramaSonucu.sonuc.urun_tipi && (
                        <span className="text-[10px] font-semibold text-slate-500">
                          {aramaSonucu.sonuc.urun_tipi}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {aramaSonucu.sonuc.resmi_urun_adi || urun.urun_adi}
                    </h4>
                    {aramaSonucu.sonuc.belirgin_ozellikler && (
                      <p className="text-[11px] text-slate-600">
                        <span className="font-semibold">Detaylar:</span> {aramaSonucu.sonuc.belirgin_ozellikler}
                      </p>
                    )}
                  </div>

                  {/* 1. Seçenek: Çerçevenin İçindeki Kırpılmış Net Görsel (Her zaman net ve hazır) */}
                  {tarananKirpinti && (
                    <div className="p-3 bg-sky-50/80 rounded-xl border border-sky-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Crop className="w-3.5 h-3.5 text-sky-600" />
                          <span>Çerçevedeki Kırpılmış Ürün Fotoğrafı</span>
                        </div>
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                          ✓ Hazır & Net
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-16 bg-white rounded-lg border border-sky-300 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                          <img
                            src={tarananKirpinti}
                            alt="Kırpılan Görsel"
                            className="w-full h-full object-contain p-0.5"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <p className="text-[10px] text-slate-600 leading-tight">
                            WhatsApp ekranındaki mesaj ve gereksiz alanları kırparak yalnızca bu ürünü kaydeder.
                          </p>
                          <button
                            type="button"
                            disabled={kaydediliyor}
                            onClick={() => handleSecVeKaydet(
                              tarananKirpinti,
                              aramaSonucu?.sonuc?.urun_sayfasi_url,
                              aramaSonucu?.sonuc?.resmi_urun_adi
                            )}
                            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Kırpılan Görseli Ürüne Ata</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Seçenek: Web'den Bulunan Orijinal Stüdyo Fotoğrafı */}
                  {denenenGorselSrc ? (
                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="relative w-20 h-20 bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {sonucGorselGecerli === false ? (
                            <div className="p-1.5 text-center text-amber-700 text-[9px] font-bold">
                              <AlertTriangle className="w-4 h-4 mx-auto mb-0.5 text-amber-600" />
                              Korumalı Link
                            </div>
                          ) : (
                            <img
                              src={denenenGorselSrc}
                              alt="Katalog Görseli"
                              className="w-full h-full object-contain p-1"
                              referrerPolicy="no-referrer"
                              onLoad={() => setSonucGorselGecerli(true)}
                              onError={handleKatalogGorselHata}
                            />
                          )}
                          {sonucGorselGecerli === true && (
                            <div className="absolute top-1 right-1 px-1 py-0.2 rounded bg-emerald-600 text-white text-[8px] font-extrabold">
                              ✓ Doğrulandı
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-1.5">
                          <div className="text-xs font-bold text-slate-800">
                            Web Stüdyo / Katalog Fotoğrafı
                          </div>
                          {sonucGorselGecerli === false ? (
                            <p className="text-[10px] text-amber-800 leading-tight">
                              Bu mağaza görsel linkini harici erişime kapatmış. Yukarıdaki <strong>Kırpılan Görseli Ata</strong> seçeneğini veya aşağıdaki <strong>Google Görseller</strong> aramasını kullanabilirsiniz.
                            </p>
                          ) : (
                            <>
                              <p className="text-[10px] text-slate-500 leading-tight">
                                İnternetten bulunan orijinal ürün fotoğrafını siparişteki ürün fotoğrafı olarak kaydeder.
                              </p>
                              <button
                                type="button"
                                disabled={kaydediliyor || sonucGorselGecerli === false}
                                onClick={() => handleSecVeKaydet(
                                  denenenGorselSrc,
                                  aramaSonucu.sonuc.urun_sayfasi_url,
                                  aramaSonucu.sonuc.resmi_urun_adi
                                )}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Bu Fotoğrafı Ürüne Ata & Kaydet</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Doğrudan Stüdyo Fotoğrafı Linki Alınamadı</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Ürün bilgileri başarıyla tespit edildi. Yukarıdaki kırpılan görseli atayabilir veya aşağıdaki Google Görseller linkinden dilediğiniz fotoğrafın adresini ekleyebilirsiniz.
                      </p>
                    </div>
                  )}

                  {/* Google Görseller ve Mağaza Linkleri */}
                  <div className="space-y-1.5 pt-1">
                    {aramaSonucu.google_gorsel_arama_url && (
                      <a
                        href={aramaSonucu.google_gorsel_arama_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center justify-between transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-sky-600" />
                          <span>Google Görsellerde Canlı Sonuçları Aç</span>
                        </span>
                        <ExternalLink className="w-3 h-3 text-sky-600" />
                      </a>
                    )}

                    {aramaSonucu.web_linkleri && aramaSonucu.web_linkleri.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tespit Edilen Mağazalar & Sayfalar:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {aramaSonucu.web_linkleri.map((wl: any, idx: number) => (
                            <a
                              key={idx}
                              href={wl.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 hover:text-sky-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                            >
                              <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                              <span className="max-w-[150px] truncate">{wl.baslik}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Henüz Arama Yapılmamışsa Rehber Kutusu */}
              {!aramaSonucu && !araniyor && !aramaHatasi && (
                <div className="p-5 text-center space-y-2 bg-slate-50 rounded-xl border border-slate-200">
                  <Scan className="w-8 h-8 text-sky-600 mx-auto opacity-75" />
                  <div className="text-xs font-bold text-slate-800">Nasıl Kullanılır?</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    1. Soldaki vizör çerçevesini fareyle aramak istediğiniz ürünün (terlik, çanta, saat vb.) üzerine sürükleyin.
                    <br />
                    2. <strong>Çerçevenin 4 köşesindeki veya kenarlarındaki tutamaçlardan</strong> tutarak alanı büyütüp küçültebilirsiniz.
                    <br />
                    3. <strong>"İnternette Ara"</strong> butonuna tıklayın.
                  </p>
                </div>
              )}

              {/* Manuel Resim Linki Yapıştırma veya Cihazdan Yükleme */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-bold text-slate-600">Alternatif: Manuel Resim Tanımla</div>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={manuelUrl}
                    onChange={(e) => setManuelUrl(e.target.value)}
                    placeholder="https://... (Doğrudan görsel linki)"
                    className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white focus:ring-1 focus:ring-sky-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!manuelUrl}
                    onClick={() => handleSecVeKaydet(manuelUrl)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Uygula
                  </button>
                </div>

                <div>
                  <input
                    ref={dosyaYukleRef}
                    type="file"
                    accept="image/*"
                    onChange={handleDosyadanKatalogYukle}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => dosyaYukleRef.current?.click()}
                    className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cihazdan Fotoğraf Seç</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Alt İşlemler */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              {onOrijinaleDon && (
                <button
                  type="button"
                  onClick={async () => {
                    await onOrijinaleDon();
                    onKapat();
                  }}
                  className="text-xs font-bold text-amber-900 hover:text-amber-950 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Orijinal WhatsApp Fotoğrafına Dön</span>
                </button>
              )}
              <button
                type="button"
                onClick={onKapat}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer border border-slate-200 ml-auto"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
