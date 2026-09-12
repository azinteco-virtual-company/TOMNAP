import React, { useState, useRef } from 'react';
import { Siparis, SiparisUrunKalemi } from '../types';
import { 
  Images, 
  Maximize2, 
  Crop, 
  Package, 
  X, 
  Check, 
  Sparkles, 
  ZoomIn, 
  RotateCw,
  Image as ImageIcon,
  Upload,
  ExternalLink,
  Plus,
  Phone,
  Globe,
  Search,
  Loader2,
  RotateCcw,
  AlertTriangle,
  Scan
} from 'lucide-react';
import { cropImageFromBox, sunucuyaGorselYukle } from '../utils/imageCropper';
import { GorselAramaLensModal } from './GorselAramaLensModal';

interface UrunGorselleriGalerisiProps {
  siparis: Siparis;
  onGuncelle?: (id: string, guncellemeler: Partial<Siparis>) => void;
}

export const UrunGorselleriGalerisi: React.FC<UrunGorselleriGalerisiProps> = ({
  siparis,
  onGuncelle,
}) => {
  const [seciliBuyutmeGorsel, setSeciliBuyutmeGorsel] = useState<{ url: string; baslik: string } | null>(null);
  const [kirpmaModalHedef, setKirpmaModalHedef] = useState<{
    urunIndex: number;
    urun: SiparisUrunKalemi;
    kaynakGorsel: string;
  } | null>(null);
  const [lensAramaHedef, setLensAramaHedef] = useState<{
    urunIndex: number;
    urun: SiparisUrunKalemi;
  } | null>(null);
  const [kirpmaYukleniyor, setKirpmaYukleniyor] = useState(false);
  const [yeniGorselYukleniyor, setYeniGorselYukleniyor] = useState(false);
  const dosyaGirdiRef = useRef<HTMLInputElement>(null);
  const dosyaGirdiKatalogRef = useRef<HTMLInputElement>(null);

  // Web Orijinal Katalog Arama Durumu
  const [katalogAramaHedef, setKatalogAramaHedef] = useState<{
    urunIndex: number;
    urun: SiparisUrunKalemi;
  } | null>(null);
  const [katalogAraniyor, setKatalogAraniyor] = useState(false);
  const [katalogSonuc, setKatalogSonuc] = useState<any>(null);
  const [katalogHata, setKatalogHata] = useState<string | null>(null);
  const [katalogGorselGecerliMi, setKatalogGorselGecerliMi] = useState<boolean | null>(null);
  const [geriDonuluyorIndex, setGeriDonuluyorIndex] = useState<number | null>(null);
  const [manuelGorselUrl, setManuelGorselUrl] = useState<string>('');
  const [kayitMesaji, setKayitMesaji] = useState<{ tur: 'basari' | 'hata'; metin: string } | null>(null);
  const [kirikGorseller, setKirikGorseller] = useState<{ [key: number]: boolean }>({});

  // Kırpma alan ayarları (0-1000 normalize)
  const [cropYmin, setCropYmin] = useState(150);
  const [cropYmax, setCropYmax] = useState(800);
  const [cropXmin, setCropXmin] = useState(100);
  const [cropXmax, setCropXmax] = useState(900);

  // Ürünlerin listesi
  const urunler: SiparisUrunKalemi[] = (siparis.urunler && siparis.urunler.length > 0)
    ? siparis.urunler
    : [
        {
          urun_aciklamasi: siparis.urun_aciklamasi || 'Sipariş Edilen Ürün',
          adet: siparis.adet || 1,
          birim_fiyat: siparis.toplam_tutar,
          tutar: siparis.toplam_tutar,
          urun_gorseli: siparis.gorsel_url,
        },
      ];

  // Ham ekran görüntüleri (WhatsApp vs.)
  const hamGorseller = (siparis.gorsel_urlleri && siparis.gorsel_urlleri.length > 0)
    ? siparis.gorsel_urlleri
    : siparis.gorsel_url
    ? [siparis.gorsel_url]
    : [];

  // Geçerli görsel URL'i oluşturma ve çözümleme
  const urlCozumle = (url?: string, idx: number = 0): string => {
    if (!url) {
      if (hamGorseller.length > idx) return urlCozumle(hamGorseller[idx]);
      return '';
    }
    // Eğer sadece dosya adı verilmişse ve uploads'ta kayıtlıysa
    if (url.startsWith('/uploads/') || url.startsWith('data:') || url.startsWith('http')) {
      return url;
    }
    // Eski veya panodan adları
    if (url.includes('Panodan_') || url.includes('.png') || url.includes('.jpg')) {
      return `/uploads/${url}`;
    }
    return url;
  };

  // Kırpma modalini aç
  const handleKirpmaBaslat = (urun: SiparisUrunKalemi, uIdx: number) => {
    // Kaynak ham görseli bul
    let kaynak = urun.orijinal_gorsel_url || urun.urun_gorseli || hamGorseller[uIdx] || hamGorseller[0];
    kaynak = urlCozumle(kaynak, uIdx);
    
    // Varsayılan koordinatlar varsa yükle
    if (urun.urun_alani) {
      setCropYmin(urun.urun_alani.ymin);
      setCropYmax(urun.urun_alani.ymax);
      setCropXmin(urun.urun_alani.xmin);
      setCropXmax(urun.urun_alani.xmax);
    } else {
      setCropYmin(150);
      setCropYmax(820);
      setCropXmin(100);
      setCropXmax(900);
    }

    setKirpmaModalHedef({
      urunIndex: uIdx,
      urun,
      kaynakGorsel: kaynak,
    });
  };

  // Kırpmayı uygula ve kaydet
  const handleKirpmaKaydet = async () => {
    if (!kirpmaModalHedef || !onGuncelle) return;
    setKirpmaYukleniyor(true);

    try {
      const croppedBase64 = await cropImageFromBox(kirpmaModalHedef.kaynakGorsel, {
        ymin: cropYmin,
        xmin: cropXmin,
        ymax: cropYmax,
        xmax: cropXmax,
      });

      // Sunucuya kalıcı dosya olarak yükle
      const sunucuUrl = await sunucuyaGorselYukle(
        croppedBase64,
        `urun_kirp_${Date.now()}_${kirpmaModalHedef.urunIndex + 1}.jpg`
      );

      // Yeni ürünler listesi
      const guncelUrunler = [...urunler];
      guncelUrunler[kirpmaModalHedef.urunIndex] = {
        ...guncelUrunler[kirpmaModalHedef.urunIndex],
        urun_gorseli: sunucuUrl,
        urun_alani: {
          ymin: cropYmin,
          xmin: cropXmin,
          ymax: cropYmax,
          xmax: cropXmax,
        },
      };

      onGuncelle(siparis.id, {
        urunler: guncelUrunler,
      });

      setKirpmaModalHedef(null);
    } catch (err) {
      console.error('Kırpma kaydetme hatası:', err);
    } finally {
      setKirpmaYukleniyor(false);
    }
  };

  // Web'den Orijinal Katalog Fotoğrafı Arama Başlat
  const handleKatalogAramaBaslat = async (urun: SiparisUrunKalemi, idx: number) => {
    setKatalogAramaHedef({ urunIndex: idx, urun });
    setKatalogAraniyor(true);
    setKatalogHata(null);
    setKatalogSonuc(null);
    setKatalogGorselGecerliMi(null);
    setManuelGorselUrl('');
    setKayitMesaji(null);

    try {
      const res = await fetch('/api/urun-katalog-gorseli-ara', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urun_adi: urun.urun_adi || urun.urun_aciklamasi,
          renk: urun.renk,
        }),
      });
      const data = await res.json();
      if (data.basarili && data.sonuc) {
        setKatalogSonuc(data);
      } else {
        setKatalogHata(data.hata || 'Ürünün resmi katalog bilgisi bulunamadı.');
      }
    } catch (e: any) {
      setKatalogHata(e.message || 'Katalog araması yapılamadı.');
    } finally {
      setKatalogAraniyor(false);
    }
  };

  // Bulunan Orijinal Görseli Ürüne Tanımla & Kaydet
  const handleKatalogGorseliSec = async (gorselUrl: string, urunSayfasi?: string, resmiAd?: string) => {
    if (!katalogAramaHedef || !gorselUrl) return;
    const { urunIndex } = katalogAramaHedef;
    setKayitMesaji(null);

    try {
      const res = await fetch('/api/katalog-gorseli-kaydet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siparis_id: siparis.id,
          urun_indeksi: urunIndex,
          katalog_gorsel_url: gorselUrl,
          urun_sayfasi_url: urunSayfasi,
          resmi_urun_adi: resmiAd,
        }),
      });

      const data = await res.json();
      if (!data.basarili) {
        setKayitMesaji({ tur: 'hata', metin: data.hata || 'Görsel kaydedilemedi.' });
        return;
      }

      if (onGuncelle && data.siparis?.urunler) {
        onGuncelle(siparis.id, { urunler: data.siparis.urunler });
      } else if (onGuncelle) {
        const guncelUrunler = [...urunler];
        if (guncelUrunler[urunIndex]) {
          guncelUrunler[urunIndex] = {
            ...guncelUrunler[urunIndex],
            katalog_gorseli: gorselUrl,
            urun_gorseli: gorselUrl,
            urun_sayfasi_url: urunSayfasi || guncelUrunler[urunIndex].urun_sayfasi_url,
            resmi_urun_adi: resmiAd || guncelUrunler[urunIndex].resmi_urun_adi,
          };
          onGuncelle(siparis.id, { urunler: guncelUrunler });
        }
      }

      setKatalogAramaHedef(null);
    } catch (err: any) {
      console.error('Katalog görseli uygulama hatası:', err);
      setKayitMesaji({ tur: 'hata', metin: err.message || 'Bağlantı hatası.' });
    }
  };

  // Google Lens / Görselden Arama ile bulunan görseli kaydet
  const handleLensGorseliKaydet = async (urunIndex: number, gorselUrl: string, urunSayfasi?: string, resmiAd?: string) => {
    if (!gorselUrl) return;
    try {
      const res = await fetch('/api/katalog-gorseli-kaydet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siparis_id: siparis.id,
          urun_indeksi: urunIndex,
          katalog_gorsel_url: gorselUrl,
          urun_sayfasi_url: urunSayfasi,
          resmi_urun_adi: resmiAd,
        }),
      });

      const data = await res.json();
      if (onGuncelle && data.siparis?.urunler) {
        onGuncelle(siparis.id, { urunler: data.siparis.urunler });
      } else if (onGuncelle) {
        const guncelUrunler = [...urunler];
        if (guncelUrunler[urunIndex]) {
          guncelUrunler[urunIndex] = {
            ...guncelUrunler[urunIndex],
            katalog_gorseli: gorselUrl,
            urun_gorseli: gorselUrl,
            urun_sayfasi_url: urunSayfasi || guncelUrunler[urunIndex].urun_sayfasi_url,
            resmi_urun_adi: resmiAd || guncelUrunler[urunIndex].resmi_urun_adi,
          };
          onGuncelle(siparis.id, { urunler: guncelUrunler });
        }
      }
      setLensAramaHedef(null);
    } catch (err) {
      console.error('Lens görsel kaydetme hatası:', err);
    }
  };

  // Orijinal Ekran Görüntüsüne Geri Dön (Geri Al)
  const handleOrijinalGorseleDon = async (urun: SiparisUrunKalemi, idx: number) => {
    setGeriDonuluyorIndex(idx);
    setKirikGorseller(prev => ({ ...prev, [idx]: false }));
    try {
      const res = await fetch('/api/urun-orijinal-gorsele-don', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siparis_id: siparis.id,
          urun_indeksi: idx,
        }),
      });
      const data = await res.json();
      if (data.basarili && onGuncelle && data.siparis?.urunler) {
        onGuncelle(siparis.id, { urunler: data.siparis.urunler });
      } else if (onGuncelle) {
        const guncelUrunler = [...urunler];
        const geriDonenGorsel = urun.orijinal_gorsel_url || (hamGorseller && hamGorseller[0]) || '';
        guncelUrunler[idx] = {
          ...guncelUrunler[idx],
          urun_gorseli: geriDonenGorsel,
          katalog_gorseli: undefined,
          urun_sayfasi_url: undefined,
          resmi_urun_adi: undefined,
        };
        onGuncelle(siparis.id, { urunler: guncelUrunler });
      }
    } catch (err) {
      console.error('Orijinal görsele dönme hatası:', err);
    } finally {
      setGeriDonuluyorIndex(null);
      if (katalogAramaHedef?.urunIndex === idx) {
        setKatalogAramaHedef(null);
      }
    }
  };

  // Doğrudan Fotoğraf Seçerek Ürüne Atama (Dosyadan Yükle)
  const handleKatalogDosyaYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!katalogAramaHedef) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const { urunIndex } = katalogAramaHedef;

    try {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (!base64) return;
        const safeName = `urun_katalog_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const sunucuUrl = await sunucuyaGorselYukle(base64, safeName);
        await handleKatalogGorseliSec(sunucuUrl);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Fotoğraf yükleme hatası:', err);
    }
  };

  // Yeni Orijinal Ekran Görüntüsü / Fotoğraf Yükleme
  const handleYeniGorselYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setYeniGorselYukleniyor(true);
    try {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (!base64) {
          setYeniGorselYukleniyor(false);
          return;
        }
        const safeName = `orijinal_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const sunucuUrl = await sunucuyaGorselYukle(base64, safeName);
        
        const yeniGorselListesi = [...hamGorseller, sunucuUrl];
        if (onGuncelle) {
          onGuncelle(siparis.id, {
            gorsel_urlleri: yeniGorselListesi,
            gorsel_url: siparis.gorsel_url || sunucuUrl,
          });
        }
        setYeniGorselYukleniyor(false);
        if (dosyaGirdiRef.current) dosyaGirdiRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Yeni görsel yüklenemedi:', err);
      setYeniGorselYukleniyor(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. BÖLÜM: Ayrıştırılmış & Net Ürün Fotoğrafları */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <Package className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Ayrıştırılan Ürün Fotoğrafları
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                  {urunler.length} Ürün Kalemi
                </span>
              </h4>
              <p className="text-[11px] text-slate-500">
                WhatsApp konuşması ve arka plan gereksizlikleri elenerek ayrıştırılmış ürün fotoğrafları
              </p>
            </div>
          </div>
        </div>

        {/* Ürün Görselleri Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {urunler.map((urun, uIdx) => {
            const gorselUrl = urlCozumle(urun.urun_gorseli, uIdx);
            const urunBaslik = urun.urun_adi || urun.urun_aciklamasi || `Ürün #${uIdx + 1}`;
            const fiyat = urun.tutar || urun.birim_fiyat;

            return (
              <div 
                key={uIdx} 
                className="group relative rounded-xl border border-slate-200 hover:border-emerald-300 bg-slate-50/50 hover:bg-emerald-50/20 p-3 transition-all flex gap-3.5 items-center"
              >
                {/* Ürün Fotoğraf Kutusu */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                  {kirikGorseller[uIdx] ? (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-1 text-center space-y-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-[9px] font-bold text-slate-700 leading-tight">Yüklenemedi</span>
                      <button
                        type="button"
                        onClick={() => {
                          setKirikGorseller(prev => ({ ...prev, [uIdx]: false }));
                        }}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[8px] font-semibold cursor-pointer transition-colors"
                      >
                        Tekrar Dene
                      </button>
                    </div>
                  ) : gorselUrl ? (
                    <img
                      src={gorselUrl}
                      alt={urunBaslik}
                      className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                      onError={() => {
                        setKirikGorseller(prev => ({ ...prev, [uIdx]: true }));
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                      <ImageIcon className="w-6 h-6 text-slate-300 mb-1" />
                      <span className="text-[10px] text-slate-400 font-semibold">Fotoğraf Bekleniyor</span>
                    </div>
                  )}

                  {/* Sıra Numarası Rozeti */}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/80 text-white rounded text-[9px] font-extrabold backdrop-blur-xs">
                    #{uIdx + 1}
                  </div>

                  {/* Büyütme Hızlı Butonu */}
                  {gorselUrl && !kirikGorseller[uIdx] && (
                    <button
                      type="button"
                      onClick={() => setSeciliBuyutmeGorsel({ url: gorselUrl, baslik: urunBaslik })}
                      title="Büyük Boyutta İncele"
                      className="absolute bottom-1.5 right-1.5 p-1 rounded-md bg-white/90 text-slate-700 hover:text-emerald-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Görselden Ara (Lens) Hızlı Butonu */}
                  {gorselUrl && !kirikGorseller[uIdx] && (
                    <button
                      type="button"
                      onClick={() => setLensAramaHedef({ urun, urunIndex: uIdx })}
                      title="Google Lens / Görselden Ara (Alan Seç ve Bul)"
                      className="absolute top-1.5 right-1.5 p-1 px-1.5 rounded-md bg-indigo-600/90 hover:bg-indigo-700 text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 text-[10px] font-bold backdrop-blur-xs"
                    >
                      <Scan className="w-3 h-3" />
                      <span>Lens</span>
                    </button>
                  )}
                </div>

                {/* Ürün Bilgileri ve Düzenleme Butonları */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <h5 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                      {urunBaslik}
                    </h5>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-900 font-extrabold">
                      {urun.adet} Adet
                    </span>
                    {fiyat ? (
                      <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-800 font-extrabold">
                        {fiyat} {siparis.para_birimi || 'AZN'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100/90 text-amber-900 font-bold border border-amber-200">
                        ⚠️ Fiyat Teyit Edilecek
                      </span>
                    )}
                    {urun.beden_veya_olcu && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        Beden: {urun.beden_veya_olcu}
                      </span>
                    )}
                    {urun.renk && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        Renk: {urun.renk}
                      </span>
                    )}
                  </div>

                  {/* Ürüne Özel Telefon ve Ödeme Notu */}
                  {(urun.ilgili_telefon || urun.odeme_notu || urun.ozel_not) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {urun.ilgili_telefon && (
                        <a
                          href={`tel:${urun.ilgili_telefon.replace(/\s+/g, '')}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 text-[10px] font-bold border border-sky-200 transition-colors"
                          title="Telefonu Ara veya WhatsApp ile Bağlan"
                        >
                          <Phone className="w-2.5 h-2.5 text-sky-600" />
                          <span>{urun.ilgili_telefon}</span>
                        </a>
                      )}
                      {urun.odeme_notu && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                          ✓ {urun.odeme_notu}
                        </span>
                      )}
                      {urun.ozel_not && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 text-[10px] border border-amber-200">
                          {urun.ozel_not}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Aksiyon Butonları */}
                  <div className="pt-1 flex flex-wrap items-center gap-1.5">
                    {gorselUrl && (
                      <button
                        type="button"
                        onClick={() => setSeciliBuyutmeGorsel({ url: gorselUrl, baslik: urunBaslik })}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-emerald-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        Büyüt
                      </button>
                    )}

                    {/* Görselden Ara (Google Lens / AliExpress Tarzı) Butonu */}
                    <button
                      type="button"
                      onClick={() => setLensAramaHedef({ urun, urunIndex: uIdx })}
                      className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="Fotoğraf üzerinden alanı seçerek Google Lens ve AliExpress mantığıyla orijinal stüdyo fotoğrafını bul"
                    >
                      <Scan className="w-3 h-3 text-indigo-600" />
                      <span>Görselden Ara (Lens)</span>
                    </button>

                    {/* Web'den Orijinalini Bul Butonu */}
                    <button
                      type="button"
                      onClick={() => handleKatalogAramaBaslat(urun, uIdx)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Google & Yapay Zeka ile internetten orijinal stüdyo fotoğrafını ve ürün linkini bul"
                    >
                      <Globe className="w-3 h-3" />
                      <span>Web'den Orijinalini Bul</span>
                    </button>

                    {/* Orijinal Ekran Görüntüsüne Geri Dön (Geri Al) Butonu */}
                    {(urun.katalog_gorseli || (urun.orijinal_gorsel_url && urun.urun_gorseli !== urun.orijinal_gorsel_url) || kirikGorseller[uIdx]) && (
                      <button
                        type="button"
                        onClick={() => handleOrijinalGorseleDon(urun, uIdx)}
                        disabled={geriDonuluyorIndex === uIdx}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        title="Web'den seçilen fotoğrafı kaldırıp müşterinin gönderdiği orijinal WhatsApp ekran görüntüsüne geri dön"
                      >
                        {geriDonuluyorIndex === uIdx ? (
                          <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                        ) : (
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                        )}
                        <span>Orijinal Fotoğrafa Dön</span>
                      </button>
                    )}

                    {urun.urun_sayfasi_url && (
                      <a
                        href={urun.urun_sayfasi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                        title="Resmi Ürün Satış Sayfasına Git"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Resmi Sayfa</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. BÖLÜM: Orijinal WhatsApp & Sipariş Kanıt Ekran Görüntüleri */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-white space-y-3">
        <div className="flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <Images className="w-4 h-4" />
            <span>Müşteriden Gelen Ham Ekran Görüntüleri ({hamGorseller.length} Görsel)</span>
          </div>

          {onGuncelle && (
            <div className="flex items-center gap-2">
              <input
                ref={dosyaGirdiRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleYeniGorselYukle}
              />
              <button
                type="button"
                onClick={() => dosyaGirdiRef.current?.click()}
                disabled={yeniGorselYukleniyor}
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {yeniGorselYukleniyor ? (
                  <>
                    <RotateCw className="w-3 h-3 animate-spin" />
                    <span>Yükleniyor...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>Orijinal Ekran Görüntüsü / Fotoğraf Ekle</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {hamGorseller.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
            {hamGorseller.map((gUrl, gIdx) => {
              const gercekUrl = urlCozumle(gUrl, gIdx);
              return (
                <div 
                  key={gIdx} 
                  onClick={() => setSeciliBuyutmeGorsel({ url: gercekUrl, baslik: `Ekran Görüntüsü #${gIdx + 1}` })}
                  className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-700 hover:border-emerald-500 h-28 flex items-center justify-center group cursor-pointer transition-all"
                >
                  <img 
                    src={gercekUrl} 
                    alt={`Sipariş Görseli ${gIdx + 1}`} 
                    className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="flex flex-col items-center justify-center text-slate-500 p-2 text-center">
                            <span class="text-xs font-bold text-slate-400">📸 Ekran Görüntüsü</span>
                            <span class="text-[9px] text-slate-600 mt-0.5">#${gIdx + 1}</span>
                          </div>
                        `;
                      }
                    }} 
                  />
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[9px] font-bold text-white rounded">
                    #{gIdx + 1}
                  </div>
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="px-2 py-1 bg-slate-900/90 text-emerald-300 text-[10px] font-bold rounded-md flex items-center gap-1">
                      <ZoomIn className="w-3 h-3" /> İncele
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-4 text-center text-slate-400 text-xs bg-slate-950/50 rounded-xl border border-slate-800 border-dashed">
            Henüz eklenmiş ham görsel bulunmuyor. Yukarıdaki butondan ekleyebilirsiniz.
          </div>
        )}
      </div>

      {/* Lightbox: Görseli Büyük İnceleme Modalı */}
      {seciliBuyutmeGorsel && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setSeciliBuyutmeGorsel(null)}
        >
          <div 
            className="relative w-full max-w-4xl min-h-[420px] max-h-[92vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Üst Barı */}
            <div className="w-full flex items-center justify-between py-3 px-4 border-b border-slate-800 bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                  <ZoomIn className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold text-slate-100 truncate">
                  {seciliBuyutmeGorsel.baslik}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={seciliBuyutmeGorsel.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-emerald-400 transition-colors flex items-center gap-1.5 text-xs font-semibold border border-slate-700"
                  title="Yeni Sekmede Tam Boyut Aç"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Yeni Sekmede Aç</span>
                </a>
                <button
                  onClick={() => setSeciliBuyutmeGorsel(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Kapat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Görsel Görüntüleme Alanı */}
            <div className="flex-1 w-full min-h-[350px] max-h-[78vh] flex items-center justify-center p-4 sm:p-6 bg-slate-950/95 overflow-auto">
              <img
                src={seciliBuyutmeGorsel.url}
                alt={seciliBuyutmeGorsel.baslik}
                className="max-h-[72vh] max-w-full min-h-[220px] w-auto h-auto rounded-lg object-contain shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Kırpma / Odaklama Modalı */}
      {kirpmaModalHedef && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setKirpmaModalHedef(null)}
        >
          <div 
            className="relative max-w-2xl w-full bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Crop className="w-4 h-4 text-emerald-600" />
                  Ürün Fotoğrafını Kırp ve Odakla
                </h3>
                <p className="text-xs text-slate-500">
                  {kirpmaModalHedef.urun.urun_adi || kirpmaModalHedef.urun.urun_aciklamasi}
                </p>
              </div>
              <button
                onClick={() => setKirpmaModalHedef(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Kaynak Görsel Seçimi (Eğer birden fazla ham görsel varsa) */}
            {hamGorseller.length > 1 && (
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto">
                <span className="text-xs font-bold text-slate-700 shrink-0">Kırpılacak Görsel:</span>
                <div className="flex items-center gap-2">
                  {hamGorseller.map((g, gIdx) => {
                    const cUrl = urlCozumle(g, gIdx);
                    const secili = kirpmaModalHedef.kaynakGorsel === cUrl;
                    return (
                      <button
                        key={gIdx}
                        type="button"
                        onClick={() => setKirpmaModalHedef({ ...kirpmaModalHedef, kaynakGorsel: cUrl })}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                          secili 
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Görsel #{gIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Önizleme ve Kırpma Alanı */}
            <div className="relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-2 min-h-[260px] max-h-[400px]">
              <div className="relative inline-block max-h-[380px]">
                <img
                  src={kirpmaModalHedef.kaynakGorsel}
                  alt="Kırpma Kaynağı"
                  className="max-h-[380px] w-auto object-contain rounded opacity-80"
                />
                {/* Kırpma Kılavuz Çerçevesi (Overlay) */}
                <div 
                  className="absolute border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none transition-all"
                  style={{
                    top: `${cropYmin / 10}%`,
                    left: `${cropXmin / 10}%`,
                    width: `${Math.max(5, (cropXmax - cropXmin) / 10)}%`,
                    height: `${Math.max(5, (cropYmax - cropYmin) / 10)}%`,
                  }}
                >
                  <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                    Seçilen Ürün Alanı
                  </span>
                </div>
              </div>
            </div>

            {/* Hızlı Kırpma Şablonları */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-700 font-bold">
                <span>Hızlı Odak Şablonları:</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setCropYmin(100); setCropYmax(520); setCropXmin(50); setCropXmax(950); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 cursor-pointer"
                >
                  1. Üst Ürün (Çanta / Ayakkabı)
                </button>
                <button
                  type="button"
                  onClick={() => { setCropYmin(480); setCropYmax(900); setCropXmin(50); setCropXmax(950); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 cursor-pointer"
                >
                  2. Alt Ürün (2. Çanta / Talimat)
                </button>
                <button
                  type="button"
                  onClick={() => { setCropYmin(140); setCropYmax(840); setCropXmin(80); setCropXmax(920); }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 cursor-pointer"
                >
                  Merkez Odak (Sohbetsiz)
                </button>
              </div>
            </div>

            {/* İnce Ayar Kaydırıcıları (Sliders) */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Dikey Konum & Yükseklik: {cropYmin}-{cropYmax}
                </label>
                <div className="flex gap-2">
                  <input
                    type="range"
                    min="0"
                    max="800"
                    step="20"
                    value={cropYmin}
                    onChange={(e) => setCropYmin(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <input
                    type="range"
                    min="200"
                    max="1000"
                    step="20"
                    value={cropYmax}
                    onChange={(e) => setCropYmax(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Yatay Konum & Genişlik: {cropXmin}-{cropXmax}
                </label>
                <div className="flex gap-2">
                  <input
                    type="range"
                    min="0"
                    max="800"
                    step="20"
                    value={cropXmin}
                    onChange={(e) => setCropXmin(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <input
                    type="range"
                    min="200"
                    max="1000"
                    step="20"
                    value={cropXmax}
                    onChange={(e) => setCropXmax(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Modal Alt Butonları */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setKirpmaModalHedef(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleKirpmaKaydet}
                disabled={kirpmaYukleniyor}
                className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {kirpmaYukleniyor ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    Kırpılıyor & Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Bu Alanı Ürün Fotoğrafı Olarak Kaydet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: Web'den Orijinal Ürün Katalog Fotoğrafı Arama & Bağlama */}
      {katalogAramaHedef && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Başlık */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Web'den Orijinal Katalog Fotoğrafı Bul</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Google Search Grounding & AI ile resmi marka ve e-ticaret sitelerinde aranır.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setKatalogAramaHedef(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Kutusu */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700">Aranan Ürün:</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  defaultValue={katalogAramaHedef.urun.urun_adi || katalogAramaHedef.urun.urun_aciklamasi}
                  id="katalog_arama_input"
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  placeholder="Örn: Karl Lagerfeld Beyaz Terlik..."
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('katalog_arama_input') as HTMLInputElement;
                    const yeniAd = input?.value || katalogAramaHedef.urun.urun_adi || '';
                    handleKatalogAramaBaslat({ ...katalogAramaHedef.urun, urun_adi: yeniAd }, katalogAramaHedef.urunIndex);
                  }}
                  disabled={katalogAraniyor}
                  className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {katalogAraniyor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Ara</span>
                </button>
              </div>
            </div>

            {/* Arama Durumu / Yükleniyor */}
            {katalogAraniyor && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-sky-600 animate-spin mx-auto" />
                <div className="text-xs font-semibold text-slate-700">İnternette Resmi Siteler Taranıyor...</div>
                <div className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Farfetch, Nordstrom, Karl.com ve yetkili lüks kataloglar incelenerek stüdyo fotoğrafı ve ürün detayları getiriliyor.
                </div>
              </div>
            )}

            {/* Hata Durumu */}
            {katalogHata && !katalogAraniyor && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs flex items-center justify-between">
                <span>{katalogHata}</span>
                <button
                  onClick={() => handleKatalogAramaBaslat(katalogAramaHedef.urun, katalogAramaHedef.urunIndex)}
                  className="underline font-bold hover:text-rose-900"
                >
                  Tekrar Dene
                </button>
              </div>
            )}

            {/* Sonuç Alanı */}
            {katalogSonuc && !katalogAraniyor && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                        {katalogSonuc.sonuc?.marka || 'Bulunan Katalog Kaydı'}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">
                        {katalogSonuc.sonuc?.resmi_urun_adi || katalogAramaHedef.urun.urun_adi}
                      </h4>
                    </div>
                    {katalogSonuc.sonuc?.urun_sayfasi_url && (
                      <a
                        href={katalogSonuc.sonuc.urun_sayfasi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-600 hover:text-sky-800 font-bold flex items-center gap-1 shrink-0 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <span>Resmi Sayfayı Aç</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {katalogSonuc.sonuc?.aciklama && (
                    <p className="text-xs text-slate-600 line-clamp-3">
                      {katalogSonuc.sonuc.aciklama}
                    </p>
                  )}

                  {/* Kayıt Hata Mesajı Banner'ı */}
                  {kayitMesaji && (
                    <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      kayitMesaji.tur === 'hata' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}>
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{kayitMesaji.metin}</span>
                    </div>
                  )}

                  {/* Görsel Önizleme ve Seçme */}
                  {katalogSonuc.sonuc?.katalog_gorsel_url ? (
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-start gap-4">
                        <div className="relative w-28 h-28 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                          {katalogGorselGecerliMi === false ? (
                            <div className="p-2 text-center flex flex-col items-center justify-center text-rose-600 space-y-1">
                              <AlertTriangle className="w-6 h-6 text-rose-500" />
                              <span className="text-[10px] font-bold leading-tight">Görsel Yüklenemedi</span>
                              <span className="text-[9px] text-slate-500 leading-tight">(Web sayfası veya hotlink engeli)</span>
                            </div>
                          ) : (
                            <img
                              src={katalogSonuc.sonuc.katalog_gorsel_url}
                              alt="Katalog Görseli"
                              className="w-full h-full object-contain p-1"
                              referrerPolicy="no-referrer"
                              onLoad={() => setKatalogGorselGecerliMi(true)}
                              onError={() => setKatalogGorselGecerliMi(false)}
                            />
                          )}
                          {katalogGorselGecerliMi === true && (
                            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-extrabold shadow-xs">
                              ✓ Doğrulandı
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="text-xs font-bold text-slate-800">
                            {katalogGorselGecerliMi === false ? 'Geçersiz Görsel Bağlantısı' : 'Orijinal Stüdyo Çekimi Görseli'}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {katalogGorselGecerliMi === false
                              ? 'Bu bağlantı doğrudan bir resim dosyası (.jpg/.png) değil, web sayfasıdır. Hatalı görsel kaydedilmesini önlemek için seçim devre dışıdır.'
                              : 'Bu stüdyo fotoğrafı siparişteki WhatsApp ekran görüntüsü yerine ana ürün görseli olarak atanacaktır.'}
                          </p>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={katalogGorselGecerliMi === false}
                              onClick={() => handleKatalogGorseliSec(
                                katalogSonuc.sonuc.katalog_gorsel_url,
                                katalogSonuc.sonuc.urun_sayfasi_url,
                                katalogSonuc.sonuc.resmi_urun_adi
                              )}
                              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                                katalogGorselGecerliMi === false
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{katalogGorselGecerliMi === false ? 'Görsel Seçilemez' : 'Bu Görseli Ürüne Tanımla & Kaydet'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Resmi ürün sayfası bulundu fakat doğrudan resim linki alınamadı.</span>
                      </div>
                      <p className="text-[11px]">
                        Aşağıdaki resmi sayfa bağlantısından görselin üzerine sağ tıklayıp "Resim adresini kopyala" diyerek URL'yi yapıştırabilir veya doğrudan cihazınızdan fotoğraf yükleyebilirsiniz.
                      </p>
                    </div>
                  )}

                  {/* Google Arama Kaynakları */}
                  {katalogSonuc.web_linkleri && katalogSonuc.web_linkleri.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">İlgili Resmi Web Sayfaları:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {katalogSonuc.web_linkleri.map((wl: any, idx: number) => (
                          <a
                            key={idx}
                            href={wl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-700 hover:text-sky-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors"
                          >
                            <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                            <span className="max-w-[200px] truncate">{wl.baslik}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternatif Görsel Seçenekleri: Manuel URL veya Cihazdan Yükleme */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Alternatif: Doğrudan Resim Linki Yapıştırın veya Dosya Yükleyin</span>
                    </div>

                    {/* Manuel Görsel URL Yapıştırma */}
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={manuelGorselUrl}
                        onChange={(e) => {
                          setManuelGorselUrl(e.target.value);
                          setKayitMesaji(null);
                        }}
                        placeholder="https://... (Örn: .jpg veya .png ile biten doğrudan resim linki)"
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={!manuelGorselUrl}
                        onClick={() => {
                          if (manuelGorselUrl) {
                            handleKatalogGorseliSec(
                              manuelGorselUrl,
                              katalogSonuc.sonuc?.urun_sayfasi_url,
                              katalogSonuc.sonuc?.resmi_urun_adi
                            );
                          }
                        }}
                        className="px-3.5 py-1.5 bg-sky-700 hover:bg-sky-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                      >
                        URL'yi Tanımla
                      </button>
                    </div>

                    {/* Cihazdan / Galeriden Fotoğraf Yükleme */}
                    <div>
                      <input
                        ref={dosyaGirdiKatalogRef}
                        type="file"
                        accept="image/*"
                        onChange={handleKatalogDosyaYukle}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => dosyaGirdiKatalogRef.current?.click()}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-300 transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Cihazdan Orijinal Stüdyo Fotoğrafı Yükle</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Alt Aksiyonlar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              {/* Orijinal Ekran Görüntüsüne Geri Dön (Geri Al) Butonu */}
              {katalogAramaHedef && (katalogAramaHedef.urun.katalog_gorseli || (katalogAramaHedef.urun.orijinal_gorsel_url && katalogAramaHedef.urun.urun_gorseli !== katalogAramaHedef.urun.orijinal_gorsel_url)) ? (
                <button
                  type="button"
                  onClick={() => handleOrijinalGorseleDon(katalogAramaHedef.urun, katalogAramaHedef.urunIndex)}
                  disabled={geriDonuluyorIndex === katalogAramaHedef.urunIndex}
                  className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {geriDonuluyorIndex === katalogAramaHedef.urunIndex ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>Bu Ürünü Orijinal Ekran Görüntüsüne Geri Döndür</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setKatalogAramaHedef(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer border border-slate-200"
              >
                Vazgeç / Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BÖLÜM: Google Lens & AliExpress Görselden Ürün Arama Modalı */}
      {lensAramaHedef && (
        <GorselAramaLensModal
          urun={lensAramaHedef.urun}
          urunIndex={lensAramaHedef.urunIndex}
          siparisId={siparis.id}
          tumGorseller={hamGorseller}
          mevcutUrunGorseli={lensAramaHedef.urun.urun_gorseli}
          onKapat={() => setLensAramaHedef(null)}
          onGorselSecildi={async (gorselUrl, urunSayfasi, resmiAd) => {
            await handleLensGorseliKaydet(lensAramaHedef.urunIndex, gorselUrl, urunSayfasi, resmiAd);
          }}
          onOrijinaleDon={
            (lensAramaHedef.urun.katalog_gorseli || (lensAramaHedef.urun.orijinal_gorsel_url && lensAramaHedef.urun.urun_gorseli !== lensAramaHedef.urun.orijinal_gorsel_url))
              ? async () => {
                  await handleOrijinalGorseleDon(lensAramaHedef.urun, lensAramaHedef.urunIndex);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
