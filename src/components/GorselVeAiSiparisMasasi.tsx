import React, { useState, useEffect, useRef } from 'react';
import { Siparis } from '../types';
import { 
  Camera, 
  UploadCloud, 
  Sparkles, 
  Trash2, 
  Check, 
  AlertCircle, 
  ArrowRight, 
  Info, 
  DollarSign, 
  Tag, 
  User, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  MessageSquare, 
  HelpCircle, 
  Plus, 
  Images, 
  Package, 
  Layers,
  Loader2,
  RefreshCw 
} from 'lucide-react';
import { uretKanadaTakipKodu, uretUluslararasiKargoKodu } from '../utils/pdfHelpers';

export interface YuklenenGorsel {
  id: string;
  base64: string;
  mimeType: string;
  dosyaAdi: string;
  boyutStr?: string;
}

interface GorselVeAiSiparisMasasiProps {
  onSiparisEklendi: (yeniSiparis: Siparis) => void;
  onSiparislereDon?: () => void;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
}

export const GorselVeAiSiparisMasasi: React.FC<GorselVeAiSiparisMasasiProps> = ({
  onSiparisEklendi,
  onSiparislereDon,
  seciliFirmaId,
  seciliFirmaAd,
}) => {
  const [hamMetin, setHamMetin] = useState('');
  const [gorseller, setGorseller] = useState<YuklenenGorsel[]>([]);
  const [siparisKaynagi, setSiparisKaynagi] = useState<'WHATSAPP' | 'INSTAGRAM_DM' | 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS'>('WHATSAPP');
  
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState(false);
  const [ayristirilanTaslak, setAyristirilanTaslak] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Panodan (Ctrl+V) yapıştırma yakalama - Birden fazla görsel ardı ardına veya toplu yapıştırılabilir
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const bulunanDosyalar: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            bulunanDosyalar.push(blob);
          }
        }
      }

      if (bulunanDosyalar.length > 0) {
        dosyalariIsle(bulunanDosyalar, 'Panodan_Ekran_Goruntusu');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Görselleri HTML5 Canvas ile optimize edip listeye ekleme
  const dosyalariIsle = (files: FileList | File[], ozelAdPrefix?: string) => {
    const fileArray: File[] = Array.from(files).filter(f => f.type.startsWith('image/'));

    if (fileArray.length === 0) {
      setHata('Lütfen sadece fotoğraf veya ekran görüntüsü yükleyin (PNG, JPG, WebP).');
      return;
    }
    setHata(null);

    fileArray.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          let dataUrl = e.target?.result as string;
          let mime = 'image/jpeg';
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }

          const dosyaAdi = ozelAdPrefix 
            ? `${ozelAdPrefix}_${Date.now()}_${index + 1}.png` 
            : file.name;

          setGorseller((onceki) => [
            ...onceki,
            {
              id: `gorsel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              base64: dataUrl,
              mimeType: mime,
              dosyaAdi: dosyaAdi,
              boyutStr: `${w}x${h}px`,
            },
          ]);
        };
        img.onerror = () => {
          setGorseller((onceki) => [
            ...onceki,
            {
              id: `gorsel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              base64: e.target?.result as string,
              mimeType: file.type || 'image/jpeg',
              dosyaAdi: file.name,
            },
          ]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      dosyalariIsle(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      dosyalariIsle(e.dataTransfer.files);
    }
  };

  const gorselSil = (id: string) => {
    setGorseller((onceki) => onceki.filter((g) => g.id !== id));
  };

  const tumGorselleriTemizle = () => {
    setGorseller([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Örnek Hızlı Test Düğmeleri
  const ornekDoldur = (tip: 'konul_isaq' | 'kemale' | 'coklu_kemale' | 'tommy' | 'zara') => {
    if (tip === 'konul_isaq') {
      setHamMetin('Könül İsaq\n0552843911\nBakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək\n\nNəcəf Nərimanov 97\nKarl Lagerfeld 125 azn');
      setSiparisKaynagi('WHATSAPP');
    } else if (tip === 'kemale') {
      setHamMetin('Kemake xanım +994 50 694 25 25 Gence seheri Ozan kucesi. On Cloud ayagqabi 338 azn tam odenildi.');
      setSiparisKaynagi('WHATSAPP');
    } else if (tip === 'coklu_kemale') {
      setHamMetin('Kəmalə Bədirbəyli +994 50 694 25 25 Gəncə. 2 məhsul: 1 cüt On Cloud ağ ayaqqabı 338 AZN və 1 ədəd Michael Kors çanta 180 AZN. Ümumi 518 AZN tam ödənilib.');
      setSiparisKaynagi('WHATSAPP');
    } else if (tip === 'tommy') {
      setHamMetin('Elmir Tommy Hilfiger köynək L razmer boz rəng, 80 manat beh atdı bibiyə. Qalan 40 manatı Bakıda təhvil verəndə ödəyəcək.');
      setSiparisKaynagi('WHATSAPP');
    } else {
      setHamMetin('Aytən xanım Zara qara dəri kurtka S razmer 180 AZN + Zara kəmər 45 AZN. Cəmi 225 AZN. Nərimanov m/s yaxınlığı.');
      setSiparisKaynagi('WHATSAPP');
    }
    setHata(null);
  };

  // Gemini AI ile Ayrıştır (Çoklu Görsel + Metin)
  const handleAiAyristir = async (otomatikKaydet: boolean = false) => {
    if (!hamMetin.trim() && gorseller.length === 0) {
      setHata('Lütfen WhatsApp grubundaki metin notunu yazın veya en az bir ürün ekran görüntüsü / fotoğrafı yükleyin.');
      return;
    }

    setYukleniyor(true);
    setHata(null);
    setBasari(false);

    try {
      const response = await fetch('/api/ayristir-siparis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ham_mesaj: hamMetin.trim(),
          siparis_kaynagi: siparisKaynagi,
          gorseller: gorseller.map((g) => ({
            gorsel_base64: g.base64,
            gorsel_mime_type: g.mimeType,
            dosya_adi: g.dosyaAdi,
          })),
          gorsel_base64: gorseller[0]?.base64 || null,
          gorsel_mime_type: gorseller[0]?.mimeType || 'image/jpeg',
          otomatik_kaydet: otomatikKaydet,
          tenant_id: seciliFirmaId && seciliFirmaId !== 'all' ? seciliFirmaId : 'kanada_shopper_baku',
        }),
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error('Sunucu JSON yanıtı vermedi. Görsellerin boyutu yüksek olabilir veya sunucu yeniden başlatılıyor.');
      }

      if (!response.ok || !data.basarili) {
        throw new Error(data.hata || 'Ayrıştırma işlemi gerçekleştirilemedi.');
      }

      const bulunanSiparis = data.siparis || data.ayristirilan_veri;
      setAyristirilanTaslak(bulunanSiparis);

      if (otomatikKaydet) {
        setBasari(true);
        onSiparisEklendi(bulunanSiparis);
        // Formu sıfırla
        setHamMetin('');
        tumGorselleriTemizle();
      }
    } catch (err: any) {
      setHata(err.message || 'Sunucu ile bağlantı kurulurken bir hata oluştu.');
    } finally {
      setYukleniyor(false);
    }
  };

  // Taslağı Onaylayıp Kaydet
  const handleTaslagiKaydet = async () => {
    if (!ayristirilanTaslak) return;
    setYukleniyor(true);
    setHata(null);
    try {
      const res = await fetch('/api/siparisler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ayristirilanTaslak,
          tenant_id: ayristirilanTaslak.tenant_id || (seciliFirmaId && seciliFirmaId !== 'all' ? seciliFirmaId : 'kanada_shopper_baku'),
        }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error('Sunucudan geçersiz yanıt alındı. Lütfen tekrar deneyin.');
      }

      const kaydedilenSiparis = data.siparis || (data.id ? data : null);
      if ((data.basarili || data.id) && kaydedilenSiparis) {
        setBasari(true);
        onSiparisEklendi(kaydedilenSiparis);
        setAyristirilanTaslak(null);
        setHamMetin('');
        tumGorselleriTemizle();
      } else {
        throw new Error(data.hata || data.error || data.message || 'Veritabanına kayıt sırasında bir hata oluştu.');
      }
    } catch (e: any) {
      setHata(e.message || 'Veritabanına kayıt sırasında bir hata oluştu.');
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Üst Karşılama ve Rol Açıklaması */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <Camera className="w-4 h-4" />
              WhatsApp Grubu & Çoklu Ekran Görüntüsü Sipariş Masası
            </div>
            <h2 className="text-2xl font-extrabold mt-1 text-white tracking-tight">
              Birden Fazla Ekran Görüntüsü & Sohbet Notu ile Hızlı Giriş
            </h2>
            <p className="text-xs text-slate-300 mt-1.5 max-w-3xl leading-relaxed">
              Tek bir müşterinin birden fazla siparişi varsa (Örn: ayakkabı + çanta) ya da ürün ekran görüntüsü ve ödeme dekontunu birlikte eklemek istiyorsanız, <strong>birden fazla görseli tek seferde yükleyebilir</strong> veya klavyenizden <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-amber-300 font-mono">Ctrl+V</kbd> ile ardı ardına yapıştırabilirsiniz. Google Gemini tüm görselleri tek seferde analiz eder.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onSiparislereDon && (
              <button
                onClick={onSiparislereDon}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border border-slate-700"
              >
                Sipariş Listesine Dön
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ana Çalışma Alanı: 2 Kolon (Sol: Giriş Formu & Çoklu Görsel Yükleyici, Sağ: AI Çıkarım & Canlı Önizleme) */}
      <div className="grid grid-cols-12 gap-6">
        {/* SOL KOLON: Görsel Yükleme & WhatsApp Notu (7 Kolon) */}
        <div className="col-span-12 lg:col-span-7 space-y-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center">1</span>
                <h3 className="text-sm font-bold text-slate-900">Ürün Fotoğrafları & Ekran Görüntüleri</h3>
              </div>
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Çoklu Seçim Desteklenir
              </span>
            </div>

            {/* Gizli Dosya Seçici Input (multiple aktif) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />

            {/* Çoklu Görsel Alanı: Hiç görsel yoksa büyük dropzone, varsa galeri grid */}
            {gorseller.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-7 text-center cursor-pointer transition-all bg-slate-50/70 hover:bg-emerald-50/30 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 text-slate-600 group-hover:text-emerald-600 group-hover:border-emerald-300 flex items-center justify-center mx-auto transition-all">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="mt-3 text-xs font-bold text-slate-800">
                  Fotoğrafları veya Ekran Görüntülerini Buraya Sürükleyin ya da Tıklayın
                </div>
                <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                  Aynı anda <strong>birden fazla dosya</strong> seçebilirsiniz. WhatsApp'tan aldığınız ekran görüntülerini sırayla <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-slate-700">Ctrl + V</kbd> ile ardı ardına yapıştırabilirsiniz!
                </p>
                <div className="mt-2.5 inline-flex items-center gap-2 text-[10px] text-emerald-700 bg-emerald-100/60 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  <Images className="w-3 h-3" />
                  Çoklu Ayakkabı, Çanta & Dekont Ekran Görüntüsü
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Üst Bar: Görsel Sayısı ve Hızlı Butonlar */}
                <div className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900">
                      📸 {gorseller.length} Ekran Görüntüsü / Fotoğraf Eklendi
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      Multimodal Hazır
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Daha Fazla Ekle
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={tumGorselleriTemizle}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                    >
                      Tümünü Sil
                    </button>
                  </div>
                </div>

                {/* Görsellerin Küçük Önizleme Grid'i */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-900 rounded-2xl border border-slate-800 max-h-80 overflow-y-auto">
                  {gorseller.map((gorsel, index) => (
                    <div
                      key={gorsel.id}
                      className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group shadow-sm flex flex-col justify-between"
                    >
                      {/* Resim */}
                      <div className="h-28 w-full overflow-hidden flex items-center justify-center bg-black/40">
                        <img
                          src={gorsel.base64}
                          alt={gorsel.dosyaAdi}
                          className="h-full w-full object-contain p-1 group-hover:scale-105 transition-all"
                        />
                      </div>

                      {/* Sıra Numarası Rozeti */}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/75 backdrop-blur-xs text-[10px] font-bold text-white rounded-md border border-white/20">
                        #{index + 1}
                      </div>

                      {/* Silme Düğmesi */}
                      <button
                        type="button"
                        onClick={() => gorselSil(gorsel.id)}
                        className="absolute top-2 right-2 p-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-lg shadow-md transition-all cursor-pointer opacity-90 group-hover:opacity-100"
                        title="Bu ekran görüntüsünü kaldır"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      {/* Dosya Adı Alt Bilgi */}
                      <div className="p-1.5 bg-slate-950/90 border-t border-slate-800/80 text-[10px] text-slate-400 truncate px-2">
                        {gorsel.dosyaAdi}
                      </div>
                    </div>
                  ))}

                  {/* Yeni Görsel Ekleme Kartı (Grid içi) */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-36 border-2 border-dashed border-slate-700 hover:border-emerald-400 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer text-slate-400 hover:text-emerald-300 transition-all hover:bg-slate-800/50 p-3 text-center"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold">Yeni Ekran Görüntüsü</span>
                    <span className="text-[9px] text-slate-500">veya Ctrl + V</span>
                  </div>
                </div>
              </div>
            )}

            {/* Bölüm 2: WhatsApp / Sohbet Notu */}
            <div className="pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center">2</span>
                  <label htmlFor="ham-metin" className="text-sm font-bold text-slate-900">
                    WhatsApp Grubu Mesajı veya Müşteri Notu
                  </label>
                </div>

                {/* Sipariş Kanalı Seçimi */}
                <select
                  value={siparisKaynagi}
                  onChange={(e: any) => setSiparisKaynagi(e.target.value)}
                  className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-700 outline-none"
                >
                  <option value="WHATSAPP">💬 WhatsApp Grubu</option>
                  <option value="INSTAGRAM_DM">📩 Instagram DM</option>
                  <option value="INSTAGRAM_LIVE">🎥 Instagram Live</option>
                  <option value="INSTAGRAM_REELS">🎬 Instagram Reels</option>
                </select>
              </div>

              <textarea
                id="ham-metin"
                rows={4}
                value={hamMetin}
                onChange={(e) => setHamMetin(e.target.value)}
                placeholder="Örnek: Kəmalə xanım üçün 2 məhsul: On Cloud ağ ayaqqabı 338 AZN və Michael Kors çanta 180 AZN. Beh atılıb qalanı Bakıda..."
                className="w-full text-xs font-sans p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all leading-relaxed placeholder:text-slate-400"
              />

              {/* Hızlı Örnek Doldurma Çipleri */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                  Örnek Senaryolar:
                </span>
                <button
                  type="button"
                  onClick={() => ornekDoldur('konul_isaq')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  📌 Könül İsaq (Sürücü Götürəcək - 125 AZN)
                </button>
                <button
                  type="button"
                  onClick={() => ornekDoldur('coklu_kemale')}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  👟+👜 Kəmalə (2 Farklı Ürün: 518 AZN)
                </button>
                <button
                  type="button"
                  onClick={() => ornekDoldur('kemale')}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  👟 Kəmalə (On Cloud & Gəncə)
                </button>
                <button
                  type="button"
                  onClick={() => ornekDoldur('tommy')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-all cursor-pointer"
                >
                  👔 Tommy Gömlek (Elmir)
                </button>
                <button
                  type="button"
                  onClick={() => ornekDoldur('zara')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-all cursor-pointer"
                >
                  🧥 Zara Kurtka + Kemer (2 Ürün)
                </button>
              </div>
            </div>

            {/* Hata Bildirimi */}
            {hata && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed">{hata}</div>
              </div>
            )}

            {/* Başarı Bildirimi */}
            {basari && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">Sipariş başarıyla işlendi ve veritabanına eklendi!</span>
              </div>
            )}

            {/* Ayrıştırma Butonları */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                disabled={yukleniyor}
                onClick={() => handleAiAyristir(false)}
                className="w-full sm:flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {yukleniyor ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gemini {gorseller.length > 0 ? `${gorseller.length} Görseli` : ''} İnceliyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    {gorseller.length > 1 ? `${gorseller.length} Görseli ve Notu Analiz Et` : 'Görselleri & Notu Analiz Et'}
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={yukleniyor}
                onClick={() => handleAiAyristir(true)}
                className="w-full sm:w-auto py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Doğrudan Veritabanına Ekle
              </button>
            </div>
          </div>
        </div>

        {/* SAĞ KOLON: Çıkarılan Canlı Sipariş Taslağı (5 Kolon) */}
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">AI Ayrıştırma Canlı Taslağı</h3>
              </div>
              {ayristirilanTaslak && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-extrabold">
                  %{(ayristirilanTaslak.ai_guven_skoru ? ayristirilanTaslak.ai_guven_skoru * 100 : 96).toFixed(0)} Güven
                </span>
              )}
            </div>

            {!ayristirilanTaslak ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-3 bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div className="text-xs font-bold text-slate-700">
                  Henüz Bir Analiz Yapılmadı
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Sol taraftan ürün fotoğraflarını / ekran görüntülerini yükleyin (birden fazla ekleyebilirsiniz) ve notunuzu yazdıktan sonra <strong>"Analiz Et"</strong> butonuna basın. Tek bir müşteriye ait birden fazla ürün kalemi ve toplam tutar burada otomatik olarak listelenecektir.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Müşteri Tanıma ve Yazım Hatası Düzeltme Bildirimi */}
                {ayristirilanTaslak.duzeltilen_yazim_hatasi && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200/80 rounded-xl text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Yapay Zeka Müşteri Eşleştirmesi & İsim Düzeltildi
                    </div>
                    <div className="text-[11px] text-indigo-700 leading-snug">
                      {ayristirilanTaslak.duzeltilen_yazim_hatasi}
                    </div>
                  </div>
                )}

                {/* Müşteri ve Ürün Başlığı */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Müşteri</span>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-slate-900 block">{ayristirilanTaslak.musteri_adi}</span>
                      {ayristirilanTaslak.musteri_durumu === 'MEVCUT_MUSTERI' && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-bold">
                          ✓ Kayıtlı Müşteri ({ayristirilanTaslak.musteri_tipi || 'SADIK_MUSTERI'})
                        </span>
                      )}
                    </div>
                  </div>

                  {ayristirilanTaslak.telefon_numarasi && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Telefon</span>
                      <span className="font-semibold text-slate-800">{ayristirilanTaslak.telefon_numarasi}</span>
                    </div>
                  )}

                  {(ayristirilanTaslak.teslimat_sehri || ayristirilanTaslak.teslimat_adresi) && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Teslimat</span>
                      <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate">
                        {ayristirilanTaslak.teslimat_sehri || 'Bakü'} {ayristirilanTaslak.teslimat_adresi ? `(${ayristirilanTaslak.teslimat_adresi})` : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Genel Tanım</span>
                    <span className="text-xs font-bold text-emerald-700 text-right max-w-[230px]">{ayristirilanTaslak.urun_aciklamasi}</span>
                  </div>

                  {(!ayristirilanTaslak.urunler || ayristirilanTaslak.urunler.length <= 1) && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Beden / Renk</span>
                      <span className="text-xs font-semibold text-slate-800">
                        {ayristirilanTaslak.beden_veya_olcu || 'Standart'} • {ayristirilanTaslak.renk || 'Belirtilmedi'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Birden Fazla Ürün Varsa: Detaylı Kalemler Tablosu */}
                {ayristirilanTaslak.urunler && ayristirilanTaslak.urunler.length > 0 && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-emerald-600" />
                        Tespit Edilen Ürün Kalemleri ({ayristirilanTaslak.urunler.length} Kalem)
                      </span>
                      <span className="text-[10px] bg-emerald-200/70 px-2 py-0.5 rounded text-emerald-900 font-extrabold">
                        Çoklu Sipariş
                      </span>
                    </div>
                    <div className="divide-y divide-emerald-100 text-xs">
                      {ayristirilanTaslak.urunler.map((u: any, idx: number) => {
                        const gorsel = u.urun_gorseli || u.orijinal_gorsel_url || (Array.isArray(ayristirilanTaslak.gorsel_urlleri) ? ayristirilanTaslak.gorsel_urlleri[idx] : undefined);
                        return (
                          <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {gorsel ? (
                                <img 
                                  src={gorsel} 
                                  alt={u.urun_adi || u.urun_aciklamasi} 
                                  className="w-11 h-11 object-contain rounded-lg border border-emerald-200 bg-white p-0.5 shrink-0 shadow-xs" 
                                />
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <span className="font-bold text-slate-900 block truncate">{u.urun_adi || u.urun_aciklamasi}</span>
                                <div className="text-[10px] text-slate-500 flex flex-wrap items-center gap-1.5">
                                  <span>{u.adet} Adet</span>
                                  {u.beden_veya_olcu && <span>• Beden: {u.beden_veya_olcu}</span>}
                                  {u.renk && <span>• {u.renk}</span>}
                                </div>
                                {(u.ilgili_telefon || u.odeme_notu || u.ozel_not) && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    {u.ilgili_telefon && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 text-[10px] font-bold border border-sky-200">
                                        <Phone className="w-2.5 h-2.5 text-sky-600" />
                                        {u.ilgili_telefon}
                                      </span>
                                    )}
                                    {u.odeme_notu && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                                        ✓ {u.odeme_notu}
                                      </span>
                                    )}
                                    {u.ozel_not && (
                                      <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 text-[10px] border border-amber-200">
                                        {u.ozel_not}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {(u.tutar || u.birim_fiyat) ? (
                              <span className="font-extrabold text-emerald-800 text-xs shrink-0 bg-white px-2 py-1 rounded-md border border-emerald-100">
                                {u.tutar || u.birim_fiyat} {ayristirilanTaslak.para_birimi || 'AZN'}
                              </span>
                            ) : (
                              <span className="font-bold text-amber-800 text-[10px] shrink-0 bg-amber-50 px-2 py-1 rounded-md border border-amber-200">
                                ⚠️ Fiyat Teyit Edilecek
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Lojistik Aşaması Seçimi (Varsayılan: ULUSLARARASI_KARGO) */}
                <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                    <span>✈️</span>
                    <span>Lojistik Aşaması:</span>
                  </div>
                  <select
                    value={ayristirilanTaslak.lojistik_durumu || 'ULUSLARARASI_KARGO'}
                    onChange={(e) =>
                      setAyristirilanTaslak({
                        ...ayristirilanTaslak,
                        lojistik_durumu: e.target.value as any,
                      })
                    }
                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="ULUSLARARASI_KARGO">✈️ Uluslararası Kargoda (Varsayılan)</option>
                    <option value="KANADA_SATINALIM_BEKLIYOR">🇨🇦 Kanada Satınalım Bekliyor</option>
                    <option value="KANADA_DEPO">🇨🇦 Kanada Depoda</option>
                    <option value="BAKU_DAGITIM_ARKADAS">🇦🇿 Bakü Dağıtım (Arkadaşta)</option>
                    <option value="TESLIM_EDILDI">✅ Teslim Edildi</option>
                  </select>
                </div>

                {/* Kanada ve Uluslararası Takip Kodları */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-700">🇨🇦 Kanada Takip / Kod</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAyristirilanTaslak({
                            ...ayristirilanTaslak,
                            kanada_takip_kodu: uretKanadaTakipKodu(ayristirilanTaslak.urun_aciklamasi, 'TOR'),
                          })
                        }
                        className="text-[9px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Oluştur</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ayristirilanTaslak.kanada_takip_kodu || ''}
                      onChange={(e) =>
                        setAyristirilanTaslak({
                          ...ayristirilanTaslak,
                          kanada_takip_kodu: e.target.value,
                        })
                      }
                      placeholder="Örn: TOR-MK-9842"
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-medium"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-700">✈️ Kargo Konşimento</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAyristirilanTaslak({
                            ...ayristirilanTaslak,
                            uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
                          })
                        }
                        className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Oluştur</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ayristirilanTaslak.uluslararasi_kargo_kodu || ''}
                      onChange={(e) =>
                        setAyristirilanTaslak({
                          ...ayristirilanTaslak,
                          uluslararasi_kargo_kodu: e.target.value,
                        })
                      }
                      placeholder="Örn: AZ-CARGO-7749-YYZ"
                      className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-medium"
                    />
                  </div>
                </div>

                {/* Yüklenen Görsellerin Mini Şeridi */}
                {gorseller.length > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl overflow-x-auto">
                    <span className="text-[10px] font-bold text-slate-500 shrink-0 px-1">Görseller ({gorseller.length}):</span>
                    {gorseller.map((g, idx) => (
                      <img
                        key={g.id}
                        src={g.base64}
                        alt={`Görsel ${idx + 1}`}
                        className="w-9 h-9 object-cover rounded-lg border border-slate-300 shrink-0"
                        title={g.dosyaAdi}
                      />
                    ))}
                  </div>
                )}

                {/* Finans Özeti */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-slate-100/70 rounded-xl text-center">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Toplam</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                      {ayristirilanTaslak.toplam_tutar} {ayristirilanTaslak.para_birimi || 'AZN'}
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                    <div className="text-[10px] font-bold text-emerald-700 uppercase">Alınan Beh</div>
                    <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                      {ayristirilanTaslak.alinan_tutar} {ayristirilanTaslak.para_birimi || 'AZN'}
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl text-center border border-amber-100">
                    <div className="text-[10px] font-bold text-amber-700 uppercase">Bakı Qalıq</div>
                    <div className="text-sm font-extrabold text-amber-700 mt-0.5">
                      {ayristirilanTaslak.kalan_tutar} {ayristirilanTaslak.para_birimi || 'AZN'}
                    </div>
                  </div>
                </div>

                {/* Özel Teslimat / Kargo / Sürücü Talimatı (Müşteri Notu) */}
                <div className="p-3 bg-amber-50/90 border border-amber-300/80 rounded-xl space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <span className="text-amber-600">📌</span>
                      Özel Teslimat & Sürücü / Operasyon Notu
                    </span>
                    <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                      Kargo / Elden Talimat
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={ayristirilanTaslak.ozel_not || ''}
                    onChange={(e) =>
                      setAyristirilanTaslak({
                        ...ayristirilanTaslak,
                        ozel_not: e.target.value,
                      })
                    }
                    placeholder="Örn: Bakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək (Kargo olmasın)"
                    className="w-full text-xs p-2.5 rounded-lg border border-amber-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-medium leading-relaxed"
                  />
                  <p className="text-[10px] text-amber-800 leading-tight">
                    💡 <em>AI müşteri mesajından veya gruptan özel sürücü, kargo istememe veya hediye talimatlarını otomatik çeker. İsterseniz buradan düzenleyebilirsiniz.</em>
                  </p>
                </div>

                {/* Bakü Tahsilat Notu */}
                {ayristirilanTaslak.baku_tahsilat_notu && (
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-[11px] text-slate-800 leading-relaxed">
                    <strong>Bakü Akraba Notu:</strong> {ayristirilanTaslak.baku_tahsilat_notu}
                  </div>
                )}

                {/* Eksik Bilgi Uyarısı */}
                {ayristirilanTaslak.eksik_bilgiler && ayristirilanTaslak.eksik_bilgiler.length > 0 && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Eksik Bilgiler: {ayristirilanTaslak.eksik_bilgiler.join(', ')}</span>
                  </div>
                )}

                {/* Hata Bildirimi (Taslak Altı) */}
                {hata && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1 font-medium leading-relaxed">{hata}</div>
                  </div>
                )}

                {/* Onayla ve Kaydet Butonu */}
                <button
                  type="button"
                  onClick={handleTaslagiKaydet}
                  disabled={yukleniyor}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {yukleniyor ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Veritabanına Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Bu Taslağı Onayla & Siparişlere Ekle
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* İpucu Kutusu */}
          <div className="p-4 bg-slate-900 text-slate-300 rounded-2xl text-xs space-y-2 border border-slate-800">
            <div className="font-bold text-white flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
              Çoklu Ekran Görüntüsü & Müşteri İpuçları
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              • <strong>Aynı Anda Birden Fazla Seçim:</strong> Dosya seçici açıldığında <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 rounded text-slate-300">Ctrl</kbd> veya <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 rounded text-slate-300">Shift</kbd> tuşuna basılı tutarak tüm ekran görüntülerini birden seçebilirsiniz.
            </p>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              • <strong>Ardı Ardına Yapıştırma:</strong> WhatsApp'tan bir ayakkabı ekran görüntüsü kopyalayıp <kbd className="px-1 py-0.2 bg-slate-800 border border-slate-700 rounded text-slate-300">Ctrl+V</kbd> yapın, ardından çantayı kopyalayıp tekrar yapıştırın. Hepsi galeriye eklenir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
