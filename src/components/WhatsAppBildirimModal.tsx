import React, { useState } from 'react';
import { Siparis } from '../types';
import { 
  X, 
  MessageSquare, 
  Copy, 
  Check, 
  Send, 
  Smartphone, 
  User, 
  MapPin, 
  DollarSign, 
  Truck,
  Sparkles
} from 'lucide-react';

interface WhatsAppBildirimModalProps {
  siparis: Siparis | null;
  onKapat: () => void;
}

type BildirimTipi = 'durum_guncelleme' | 'baku_tahsilat' | 'kargo_takip' | 'eksik_bilgi';

export const WhatsAppBildirimModal: React.FC<WhatsAppBildirimModalProps> = ({
  siparis,
  onKapat,
}) => {
  if (!siparis) return null;

  const [bildirimTipi, setBildirimTipi] = useState<BildirimTipi>('durum_guncelleme');
  const [kopyalandi, setKopyalandi] = useState(false);

  // Telefon numarasını temizle (boşlukları, parantezleri ve + işaretini kaldır)
  const temizTelefon = siparis.telefon_numarasi
    ? siparis.telefon_numarasi.replace(/[^0-9]/g, '')
    : '';

  // Azerbaycan Türkçesinde duruma özel mesaj şablonları
  const mesajUret = (): string => {
    const musteri = siparis.musteri_adi || 'Dəyərli Müştərimiz';
    const urun = siparis.urun_aciklamasi;
    const bedenRenk = [siparis.beden_veya_olcu, siparis.renk].filter(Boolean).join(', ');
    const kalanTutar = siparis.kalan_tutar;
    const paraBirimi = siparis.para_birimi || 'AZN';

    switch (bildirimTipi) {
      case 'durum_guncelleme':
        if (siparis.lojistik_durumu === 'KANADA_DEPO') {
          return `Salam ${musteri}! 🇨🇦\nKanadadan sifariş etdiyiniz "${urun}" (${bedenRenk}) artıq Toronto depomuza çatdı və qablaşdırıldı. Növbəti beynəlxalq hava reysi ilə Bakıya yola salınacaq. Təşəkkür edirik! ✈️`;
        }
        if (siparis.lojistik_durumu === 'ULUSLARARASI_KARGO') {
          return `Salam ${musteri}! ✈️\nSifarişiniz ("${urun}") beynəlxalq hava karqosu ilə Kanadadan Bakıya yola düşdü. Təqribi 4-6 iş günü ərzində Bakıda olacaq. Kargo kodu: ${siparis.uluslararasi_kargo_kodu || 'AZ-CARGO-YYZ'}`;
        }
        if (siparis.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS') {
          const odemeNotu = kalanTutar > 0 
            ? `Qeyd: Təhvil alarkən ödəniləcək qalıq məbləğ: ${kalanTutar.toFixed(2)} ${paraBirimi}.` 
            : `Qeyd: Ödənişiniz tam başa çatıb (0 ${paraBirimi} borc).`;
          return `Salam ${musteri}! 🇦🇿📦\nŞad xəbər! Kanadadan sifarişiniz ("${urun}") artıq Bakıya çatdı və paylanışdadır. Çatdırılma üçün qısa zamanda sizinlə əlaqə saxlayacağıq.\n${odemeNotu}\nÜnvan: ${siparis.teslimat_adresi || 'Bakı daxili'}`;
        }
        if (siparis.lojistik_durumu === 'TESLIM_EDILDI') {
          return `Salam ${musteri}! 🎉\nSifarişiniz ("${urun}") sizə uğurla təhvil verildi. Bizi seçdiyiniz üçün minnətdarıq! Gözəl günlərdə istifadə edin. Yeni sifarişlərinizi gözləyirik. ❤️`;
        }
        return `Salam ${musteri}! 🛍️\nKanadadan sifarişiniz ("${urun}") qeydə alındı. Hazırda Kanadada rəsmi mağazadan satın alım mərhələsindədir.`;

      case 'baku_tahsilat':
        return `Salam ${musteri}! 💳\nBakıdakı nümayəndəmiz vasitəsilə sifarişinizin təsdiqi barədə:\nSifariş: ${urun}\nToplam məbləğ: ${siparis.toplam_tutar.toFixed(2)} ${paraBirimi}\nÖdənilən: ${siparis.alinan_tutar.toFixed(2)} ${paraBirimi}\nQalan borc: ${siparis.kalan_tutar.toFixed(2)} ${paraBirimi}\n${siparis.baku_tahsilat_notu ? `Qeyd: ${siparis.baku_tahsilat_notu}` : ''}\nÖdəniş və təhvil-təslim üçün əlaqə saxlayacağıq.`;

      case 'kargo_takip':
        return `Salam ${musteri}! 📦 Kargo İzləmə Məlumatı:\nÜrün: ${urun}\nKanada İçi İzləmə: ${siparis.kanada_takip_kodu || 'Təyin olunur'}\nBeynəlxalq Karqo Kodu: ${siparis.uluslararasi_kargo_kodu || 'Yolda təqdim olunacaq'}\nCari Mərhələ: ${siparis.lojistik_durumu.replace(/_/g, ' ')}\nStatus yeniləndikcə məlumat veriləcək.`;

      case 'eksik_bilgi':
        const eksikler = (siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0)
          ? siparis.eksik_bilgiler.join(', ')
          : 'ünvan və ya telefon nömrəsi';
        return `Salam ${musteri}! 📝\nKanadadan sifarişinizi tamamlamaq və Bakıya çatdırılmanı dəqiqləşdirmək üçün zəhmət olmasa çatışmayan məlumatları (${eksikler}) bizə göndərəsiniz. Təşəkkür edirik!`;

      default:
        return '';
    }
  };

  const aktifMesaj = mesajUret();

  const handleKopyala = () => {
    navigator.clipboard.writeText(aktifMesaj);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  };

  const handleWhatsAppAc = () => {
    const encoded = encodeURIComponent(aktifMesaj);
    const url = temizTelefon
      ? `https://wa.me/${temizTelefon}?text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Başlık */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur-xs flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Müştəriyə WhatsApp Bildirişi
              </h3>
              <p className="text-xs text-emerald-100">
                {siparis.musteri_adi} • {siparis.telefon_numarasi || 'Telefon qeyd olunmayıb'}
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sekmeler / Şablon Seçimi */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setBildirimTipi('durum_guncelleme')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              bildirimTipi === 'durum_guncelleme'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Lojistik Statusu
          </button>

          <button
            type="button"
            onClick={() => setBildirimTipi('baku_tahsilat')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              bildirimTipi === 'baku_tahsilat'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Ödəniş / Qalıq Borc
          </button>

          <button
            type="button"
            onClick={() => setBildirimTipi('kargo_takip')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              bildirimTipi === 'kargo_takip'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Kargo Kodu
          </button>

          {siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0 && (
            <button
              type="button"
              onClick={() => setBildirimTipi('eksik_bilgi')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                bildirimTipi === 'eksik_bilgi'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-300'
              }`}
            >
              Çatışmayan Məlumat Sorğusu
            </button>
          )}
        </div>

        {/* Mesaj Önizleme Alanı */}
        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Hazır Mesaj Mətni (Azərbaycan Türkcəsi):
              </label>
              <span className="text-[11px] text-slate-400">
                {aktifMesaj.length} simvol
              </span>
            </div>

            <div className="relative">
              <textarea
                readOnly
                rows={7}
                value={aktifMesaj}
                className="w-full text-xs font-mono p-3 bg-slate-900 text-emerald-300 rounded-xl border border-slate-800 focus:outline-none resize-none leading-relaxed selection:bg-emerald-700 selection:text-white"
              />
              <button
                type="button"
                onClick={handleKopyala}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-medium flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              >
                {kopyalandi ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    <span>Kopyala</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Müşteri ve Telefon Bilgi Kutusu */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-slate-800">
                Müştəri Nömrəsi:
              </span>
              <span className="text-emerald-900 font-mono">
                {siparis.telefon_numarasi || '(Qeyd olunmayıb)'}
              </span>
            </div>
            {temizTelefon ? (
              <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                WhatsApp Aktiv
              </span>
            ) : (
              <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                Nömrə əl ilə daxil ediləcək
              </span>
            )}
          </div>
        </div>

        {/* Alt Butonlar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Bağla
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleKopyala}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Metni Kopyala</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsAppAc}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>WhatsApp İlə Göndər</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
