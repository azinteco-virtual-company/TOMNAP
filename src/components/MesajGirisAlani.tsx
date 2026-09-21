import { apiFetch } from '../lib/apiClient';
import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Truck,
  User,
  Phone,
  MapPin,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { HAZIR_TEST_MESAJLARI } from '../data/ornek-siparisler';
import { Siparis } from '../types';

interface MesajGirisAlaniProps {
  onSiparisEklendi: (yeniSiparis: Siparis) => void;
}

export const MesajGirisAlani: React.FC<MesajGirisAlaniProps> = ({ onSiparisEklendi }) => {
  const [hamMesaj, setHamMesaj] = useState('');
  const [siparisKaynagi, setSiparisKaynagi] = useState<
    'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'INSTAGRAM_DM' | 'WHATSAPP'
  >('INSTAGRAM_LIVE');
  const [musteriIpucu, setMusteriIpucu] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  const [sonAyristirilan, setSonAyristirilan] = useState<Siparis | null>(null);
  const [basariMesaji, setBasariMesaji] = useState<string | null>(null);

  const ornekYukle = (ornek: (typeof HAZIR_TEST_MESAJLARI)[0]) => {
    setHamMesaj(ornek.mesaj);
    setSiparisKaynagi(ornek.kaynak);
    setMusteriIpucu(ornek.ipucu);
    setHataMesaji(null);
    setBasariMesaji(null);
  };

  const handleAyristir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hamMesaj.trim()) return;

    setYukleniyor(true);
    setHataMesaji(null);
    setBasariMesaji(null);

    try {
      const yanit = await apiFetch('/api/ayristir-siparis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ham_mesaj: hamMesaj,
          musteri_adi_ipucu: musteriIpucu,
          siparis_kaynagi: siparisKaynagi,
          otomatik_kaydet: true,
        }),
      });

      const sonuc = await yanit.json();

      if (sonuc.basarili && sonuc.ayristirilan_veri) {
        setSonAyristirilan(sonuc.ayristirilan_veri);
        onSiparisEklendi(sonuc.ayristirilan_veri);
        setBasariMesaji('Sipariş Gemini AI ile başarıyla ayrıştırıldı ve veritabanına kaydedildi!');
        setHamMesaj('');
        setMusteriIpucu('');
      } else {
        setHataMesaji(sonuc.hata || 'Yapay zeka ayrıştırması başarısız oldu.');
      }
    } catch (err: any) {
      setHataMesaji('Sunucu ile iletişim kurulamadı: ' + (err?.message || 'Hata'));
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Kart Başlığı */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-800 flex items-center">
            <Sparkles className="w-4 h-4 text-blue-600 mr-2 shrink-0" />
            <span>AI Sipariş Girişi & Doğal Dil Ayrıştırıcı</span>
          </h3>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase font-bold">
            Canlı Gemini
          </span>
        </div>

        <div className="p-4 space-y-3.5">
          {/* Hızlı Test Örnekleri Butonları */}
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Hızlı Test İçin Örnek Mesaj Seçin:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {HAZIR_TEST_MESAJLARI.map((ornek, index) => (
                <button
                  key={index}
                  type="button"
                  id={`btn-ornek-${index}`}
                  onClick={() => ornekYukle(ornek)}
                  className="text-left p-2 rounded-lg border border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 transition-all text-xs group cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 group-hover:text-blue-700 truncate">
                    {ornek.baslik}
                  </div>
                  <div className="text-slate-500 line-clamp-1 text-[11px]">"{ornek.mesaj}"</div>
                </button>
              ))}
            </div>
          </div>

          {/* Ayrıştırma Formu */}
          <form onSubmit={handleAyristir} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Dağınık Müşteri Mesajı
              </label>
              <textarea
                id="input-ham-mesaj"
                rows={3}
                value={hamMesaj}
                onChange={(e) => setHamMesaj(e.target.value)}
                placeholder="Örn: 'Dünkü kırmızı elbise M beden benim olsun, 20 manatı akrabana verdim, kalanını maaşta vereceğim'..."
                className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-400 font-sans"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Sipariş Kaynağı */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Sipariş Kanalı
                </label>
                <select
                  id="select-siparis-kaynagi"
                  value={siparisKaynagi}
                  onChange={(e) =>
                    setSiparisKaynagi(
                      e.target.value as
                        'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'INSTAGRAM_DM' | 'WHATSAPP'
                    )
                  }
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="INSTAGRAM_LIVE">Instagram Canlı Yayın (Live)</option>
                  <option value="INSTAGRAM_REELS">Instagram Reels Yorumu</option>
                  <option value="INSTAGRAM_DM">Instagram Direkt Mesaj (DM)</option>
                  <option value="WHATSAPP">WhatsApp Mesajı</option>
                </select>
              </div>

              {/* Müşteri İpucu (Kullanıcı Adı veya Telefon) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Müşteri İpucu (İsteğe Bağlı)
                </label>
                <input
                  id="input-musteri-ipucu"
                  type="text"
                  value={musteriIpucu}
                  onChange={(e) => setMusteriIpucu(e.target.value)}
                  placeholder="@kullanici_adi veya +994..."
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Gönder / Ayrıştır Butonu */}
            <button
              type="submit"
              id="btn-gemini-ayristir"
              disabled={yukleniyor || !hamMesaj.trim()}
              className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              {yukleniyor ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Gemini Ayrıştırıyor...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>Ayrıştır & Veritabanına Ekle</span>
                </>
              )}
            </button>
          </form>

          {/* Hata Bildirimi */}
          {hataMesaji && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Ayrıştırma Hatası:</strong> {hataMesaji}
              </div>
            </div>
          )}

          {/* Başarı Bildirimi */}
          {basariMesaji && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{basariMesaji}</span>
            </div>
          )}
        </div>
      </div>

      {/* AI JSON Çıktısı (Canlı Terminal) */}
      <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-hidden border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-2 font-mono text-[11px]">
          <span>// AI JSON Çıktısı (Canlı Gemini 3.8 Flash)</span>
          <span className="text-slate-500">JSON Schema</span>
        </div>
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-200 max-h-48">
          {sonAyristirilan
            ? JSON.stringify(
                {
                  musteri: sonAyristirilan.musteri_adi,
                  instagram: sonAyristirilan.instagram_kullanici_adi || null,
                  telefon: sonAyristirilan.telefon_numarasi || null,
                  urun: sonAyristirilan.urun_aciklamasi,
                  beden: sonAyristirilan.beden_veya_olcu || null,
                  renk: sonAyristirilan.renk || null,
                  adet: sonAyristirilan.adet,
                  toplam: `${sonAyristirilan.toplam_tutar} ${sonAyristirilan.para_birimi}`,
                  odenen: `${sonAyristirilan.alinan_tutar} ${sonAyristirilan.para_birimi}`,
                  kalan: `${sonAyristirilan.kalan_tutar} ${sonAyristirilan.para_birimi}`,
                  finans_durumu: sonAyristirilan.finans_durumu,
                  lojistik_durumu: sonAyristirilan.lojistik_durumu,
                  baku_tahsilat_notu: sonAyristirilan.baku_tahsilat_notu,
                  eksik_bilgiler: sonAyristirilan.eksik_bilgiler || [],
                },
                null,
                2
              )
            : JSON.stringify(
                {
                  musteri: '@ayten_baku',
                  urun: 'Zara Trençkot',
                  beden: 'M',
                  renk: 'Bej',
                  toplam: '120 AZN',
                  odenen: '50 AZN (Kapora)',
                  kalan: '70 AZN (Maaşta)',
                  finans_durumu: 'KISMI_ODEME',
                  lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
                  baku_tahsilat_notu: '20 manat verildi, kalan maaşta',
                },
                null,
                2
              )}
        </pre>
      </div>

      {/* Son Ayrıştırılan Sipariş Önizleme Kartı */}
      {sonAyristirilan && (
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-800">Ayrıştırılan Sipariş Özeti</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Güven Skoru: %{Math.round((sonAyristirilan.ai_guven_skoru || 0.95) * 100)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Müşteri</span>
              <span className="font-bold text-slate-800 truncate block">
                {sonAyristirilan.musteri_adi}
              </span>
              {sonAyristirilan.instagram_kullanici_adi && (
                <span className="block text-blue-600 text-[11px]">
                  {sonAyristirilan.instagram_kullanici_adi}
                </span>
              )}
            </div>

            <div className="bg-slate-50 p-2 rounded border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Ürün</span>
              <span className="font-bold text-slate-800 truncate block">
                {sonAyristirilan.urun_aciklamasi}
              </span>
              <span className="text-slate-500 text-[11px]">
                {sonAyristirilan.beden_veya_olcu || '-'} / {sonAyristirilan.renk || '-'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
