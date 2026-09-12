import React, { useState, useMemo } from 'react';
import { Siparis, LojistikDurumu } from '../types';
import { useDil } from '../context/DilKonteksti';
import {
  ShoppingBag,
  Package,
  Plane,
  Truck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Search,
  DollarSign,
  Phone,
  MessageCircle,
  AlertTriangle,
  MapPin,
  ExternalLink,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  Filter
} from 'lucide-react';

interface KanbanGorunumuProps {
  siparisler: Siparis[];
  onDurumGuncelle: (id: string, guncelAlanlar: Partial<Siparis>) => void;
  onSiparisSec: (siparis: Siparis) => void;
  onWhatsAppSec: (siparis: Siparis) => void;
}

interface SütunTanimi {
  id: LojistikDurumu;
  baslik: string;
  altBaslik: string;
  ulke: string;
  icon: React.ComponentType<{ className?: string }>;
  renkSinifi: {
    bg: string;
    border: string;
    text: string;
    badgeBg: string;
    headerAccent: string;
    buttonHover: string;
  };
}

const SUTUNLAR: SütunTanimi[] = [
  {
    id: 'KANADA_SATINALIM_BEKLIYOR',
    baslik: 'Satınalma Gözləyir',
    altBaslik: 'Toronto mağazalarından alınacaq',
    ulke: '🇨🇦 Toronto',
    icon: ShoppingBag,
    renkSinifi: {
      bg: 'bg-amber-50/40',
      border: 'border-amber-200/90',
      text: 'text-amber-900',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
      headerAccent: 'bg-amber-500',
      buttonHover: 'hover:bg-amber-100 text-amber-700'
    }
  },
  {
    id: 'KANADA_DEPO',
    baslik: 'Kanada Anbarında',
    altBaslik: 'Qəbul edildi, yoxlanıldı və paketləndi',
    ulke: '🇨🇦 Toronto Hub',
    icon: Package,
    renkSinifi: {
      bg: 'bg-indigo-50/40',
      border: 'border-indigo-200/90',
      text: 'text-indigo-900',
      badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      headerAccent: 'bg-indigo-600',
      buttonHover: 'hover:bg-indigo-100 text-indigo-700'
    }
  },
  {
    id: 'ULUSLARARASI_KARGO',
    baslik: 'Uçuşda / Karqo',
    altBaslik: 'YYZ ➔ GYD Hava Limanı reysi',
    ulke: '✈️ Beynəlxalq',
    icon: Plane,
    renkSinifi: {
      bg: 'bg-sky-50/40',
      border: 'border-sky-200/90',
      text: 'text-sky-900',
      badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
      headerAccent: 'bg-sky-600',
      buttonHover: 'hover:bg-sky-100 text-sky-700'
    }
  },
  {
    id: 'BAKU_DAGITIM_ARKADAS',
    baslik: 'Bakı Paylanışı',
    altBaslik: 'Gömrükdən keçdi, kuryerə verildi',
    ulke: '🇦🇿 Bakı Mərkəz',
    icon: Truck,
    renkSinifi: {
      bg: 'bg-purple-50/40',
      border: 'border-purple-200/90',
      text: 'text-purple-900',
      badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
      headerAccent: 'bg-purple-600',
      buttonHover: 'hover:bg-purple-100 text-purple-700'
    }
  },
  {
    id: 'TESLIM_EDILDI',
    baslik: 'Təhvil Verildi',
    altBaslik: 'Müştəriyə çatdırıldı, hesab bağlandı',
    ulke: '✅ Tamamlandı',
    icon: CheckCircle2,
    renkSinifi: {
      bg: 'bg-emerald-50/40',
      border: 'border-emerald-200/90',
      text: 'text-emerald-900',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      headerAccent: 'bg-emerald-600',
      buttonHover: 'hover:bg-emerald-100 text-emerald-700'
    }
  }
];

const SIRALI_DURUMLAR: LojistikDurumu[] = [
  'KANADA_SATINALIM_BEKLIYOR',
  'KANADA_DEPO',
  'ULUSLARARASI_KARGO',
  'BAKU_DAGITIM_ARKADAS',
  'TESLIM_EDILDI'
];

export const KanbanGorunumu: React.FC<KanbanGorunumuProps> = ({
  siparisler,
  onDurumGuncelle,
  onSiparisSec,
  onWhatsAppSec
}) => {
  const { t } = useDil();
  const [aramaMetni, setAramaMetni] = useState('');
  const [seciliFinansFiltresi, setSeciliFinansFiltresi] = useState<string>('TUMU');
  const [seciliZamanFiltresi, setSeciliZamanFiltresi] = useState<'TUMU' | '30gun' | '90gun' | '1yil'>('TUMU');

  // Filtrelenmiş Siparişler
  const filtrelenmisSiparisler = useMemo(() => {
    const simdi = Date.now();
    const gun30 = 30 * 24 * 60 * 60 * 1000;
    const gun90 = 90 * 24 * 60 * 60 * 1000;
    const gun365 = 365 * 24 * 60 * 60 * 1000;

    return siparisler.filter((s) => {
      // Metin Arama
      if (aramaMetni.trim()) {
        const aranan = aramaMetni.toLowerCase();
        const adUygun = s.musteri_adi?.toLowerCase().includes(aranan);
        const urunUygun = s.urun_aciklamasi?.toLowerCase().includes(aranan);
        const igUygun = s.instagram_kullanici_adi?.toLowerCase().includes(aranan);
        const telUygun = s.telefon_numarasi?.replace(/\s+/g, '').includes(aranan);
        const kargoUygun = (s.uluslararasi_kargo_kodu || s.kanada_takip_kodu || '').toLowerCase().includes(aranan);
        const sehirUygun = (s.teslimat_sehri || '').toLowerCase().includes(aranan);
        if (!adUygun && !urunUygun && !igUygun && !telUygun && !kargoUygun && !sehirUygun) {
          return false;
        }
      }

      // Finans Durumu
      if (seciliFinansFiltresi !== 'TUMU' && s.finans_durumu !== seciliFinansFiltresi) {
        return false;
      }

      // Zaman Filtresi
      if (seciliZamanFiltresi !== 'TUMU') {
        const t = new Date(s.olusturma_tarihi).getTime();
        if (!isNaN(t)) {
          const fark = simdi - t;
          if (seciliZamanFiltresi === '30gun' && fark > gun30) return false;
          if (seciliZamanFiltresi === '90gun' && fark > gun90) return false;
          if (seciliZamanFiltresi === '1yil' && fark > gun365) return false;
        }
      }

      return true;
    });
  }, [siparisler, aramaMetni, seciliFinansFiltresi, seciliZamanFiltresi]);

  // Sütunlara göre grupla
  const sutunGruplari = useMemo(() => {
    const gruplar: Record<LojistikDurumu, Siparis[]> = {
      KANADA_SATINALIM_BEKLIYOR: [],
      KANADA_DEPO: [],
      ULUSLARARASI_KARGO: [],
      BAKU_DAGITIM_ARKADAS: [],
      TESLIM_EDILDI: []
    };

    filtrelenmisSiparisler.forEach((s) => {
      if (gruplar[s.lojistik_durumu]) {
        gruplar[s.lojistik_durumu].push(s);
      } else {
        gruplar.KANADA_SATINALIM_BEKLIYOR.push(s);
      }
    });

    return gruplar;
  }, [filtrelenmisSiparisler]);

  // Durum İlerletme
  const sonrakiAşama = (durum: LojistikDurumu): LojistikDurumu | null => {
    const idx = SIRALI_DURUMLAR.indexOf(durum);
    if (idx !== -1 && idx < SIRALI_DURUMLAR.length - 1) {
      return SIRALI_DURUMLAR[idx + 1];
    }
    return null;
  };

  // Durum Geri Alma
  const oncekiAşama = (durum: LojistikDurumu): LojistikDurumu | null => {
    const idx = SIRALI_DURUMLAR.indexOf(durum);
    if (idx > 0) {
      return SIRALI_DURUMLAR[idx - 1];
    }
    return null;
  };

  const handleAsamaDegistir = (e: React.MouseEvent, id: string, yeniDurum: LojistikDurumu) => {
    e.stopPropagation();
    onDurumGuncelle(id, { lojistik_durumu: yeniDurum });
  };

  return (
    <div className="space-y-4">
      {/* Kanban Üst Kontrol & Filtre Barı */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 truncate">
                Lojistik Boru Xətti (Kanban Görünüşü)
              </h3>
              <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0">
                {filtrelenmisSiparisler.length} Sifariş
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Kanada satınalmasından Bakı qapıda təhvilə qədər bütün 5 mərhələ canlı idarəetmə
            </p>
          </div>
        </div>

        {/* Filtre Kontrolleri */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Arama Input */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Müştəri, məhsul, karqo kodu..."
              value={aramaMetni}
              onChange={(e) => setAramaMetni(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Zaman Aralığı Seçici */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setSeciliZamanFiltresi('TUMU')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                seciliZamanFiltresi === 'TUMU' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Hamısı
            </button>
            <button
              type="button"
              onClick={() => setSeciliZamanFiltresi('30gun')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                seciliZamanFiltresi === '30gun' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              30 Gün
            </button>
            <button
              type="button"
              onClick={() => setSeciliZamanFiltresi('90gun')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                seciliZamanFiltresi === '90gun' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              90 Gün
            </button>
            <button
              type="button"
              onClick={() => setSeciliZamanFiltresi('1yil')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                seciliZamanFiltresi === '1yil' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              1 İl (365G)
            </button>
          </div>

          {/* Finans Filtresi */}
          <select
            value={seciliFinansFiltresi}
            onChange={(e) => setSeciliFinansFiltresi(e.target.value)}
            className="text-xs border border-slate-200 bg-white rounded-xl px-2.5 py-1.5 outline-none text-slate-700 cursor-pointer focus:ring-1 focus:ring-indigo-500 shrink-0"
          >
            <option value="TUMU">Bütün Ödənişlər</option>
            <option value="ODENDI">Tam Ödəndi</option>
            <option value="KISMI_ODEME">Qismən (Beh/Kapora)</option>
            <option value="BEKLIYOR">Ödəniş Gözləyir</option>
          </select>
        </div>
      </div>

      {/* 5 Sütunlu Kanban Lövhəsi (Responsive Horizontal Scroll) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5 items-start overflow-x-auto pb-4">
        {SUTUNLAR.map((sutun) => {
          const siparisListesi = sutunGruplari[sutun.id] || [];
          const sutunToplamTutar = siparisListesi.reduce((sum, s) => sum + (Number(s.toplam_tutar) || 0), 0);
          const sutunToplamKilo = siparisListesi.reduce((sum, s) => sum + (Number(s.kargo_agirligi_kg) || 0.8), 0);
          const IconBileseni = sutun.icon;

          return (
            <div
              key={sutun.id}
              className={`rounded-2xl border ${sutun.renkSinifi.border} ${sutun.renkSinifi.bg} p-3 flex flex-col min-w-[270px] xl:min-w-0 transition-shadow hover:shadow-xs`}
            >
              {/* Sütun Başlığı */}
              <div className="pb-2.5 border-b border-slate-200/80 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg ${sutun.renkSinifi.headerAccent} text-white flex items-center justify-center shrink-0 shadow-2xs`}>
                      <IconBileseni className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {sutun.baslik}
                      </h4>
                      <span className="text-[10px] font-semibold text-slate-500 block truncate">
                        {sutun.ulke}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${sutun.renkSinifi.badgeBg}`}>
                    {siparisListesi.length}
                  </span>
                </div>

                {/* Sütun Cəmi İcmal Metrik */}
                <div className="mt-2 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[11px] text-slate-600 font-medium">
                  <span>Həcm: <strong className="text-slate-900 font-bold">{sutunToplamTutar.toFixed(0)} ₼</strong></span>
                  <span>Çəki: <strong className="text-slate-900 font-bold">{sutunToplamKilo.toFixed(1)} kq</strong></span>
                </div>
              </div>

              {/* Sütun Kartları */}
              <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
                {siparisListesi.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-white/70 rounded-xl border border-dashed border-slate-200 text-xs">
                    Bu mərhələdə sifariş yoxdur
                  </div>
                ) : (
                  siparisListesi.map((siparis) => {
                    const qaliq = siparis.kalan_tutar ?? (
                      (siparis.toplam_tutar || 0) - (siparis.alinan_tutar || 0)
                    );
                    const sonraki = sonrakiAşama(siparis.lojistik_durumu);
                    const onceki = oncekiAşama(siparis.lojistik_durumu);

                    return (
                      <div
                        key={siparis.id}
                        onClick={() => onSiparisSec(siparis)}
                        className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex flex-col justify-between relative"
                      >
                        {/* Kart Üst: Müştəri və Şəhər */}
                        <div>
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-900 text-xs truncate block group-hover:text-indigo-600 transition-colors">
                                {siparis.musteri_adi}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5 truncate">
                                {siparis.instagram_kullanici_adi && (
                                  <span className="truncate text-pink-600 font-medium">
                                    {siparis.instagram_kullanici_adi}
                                  </span>
                                )}
                                {siparis.teslimat_sehri && (
                                  <span className="flex items-center gap-0.5 text-slate-400 shrink-0">
                                    • <MapPin className="w-2.5 h-2.5" />
                                    {siparis.teslimat_sehri}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Əskik məlumat bildirişi */}
                            {siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0 && (
                              <span
                                className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse"
                                title="Əskik məlumat var"
                              />
                            )}
                          </div>

                          {/* Məhsul Məlumatı */}
                          <p className="text-xs text-slate-700 font-semibold mt-2 line-clamp-2 leading-snug">
                            {siparis.urun_aciklamasi}
                          </p>

                          {/* Bədən və Rəng */}
                          {(siparis.beden_veya_olcu || siparis.renk) && (
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {siparis.beden_veya_olcu && (
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                                  {siparis.beden_veya_olcu}
                                </span>
                              )}
                              {siparis.renk && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                  {siparis.renk}
                                </span>
                              )}
                              {siparis.kargo_agirligi_kg && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-medium">
                                  {siparis.kargo_agirligi_kg} kq
                                </span>
                              )}
                            </div>
                          )}

                          {/* Maliyyə Durumu Rozeti */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-extrabold text-slate-900">
                              {siparis.toplam_tutar} <span className="text-[10px] font-semibold text-slate-500">AZN</span>
                            </span>

                            {siparis.finans_durumu === 'ODENDI' ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                                Ödənildi
                              </span>
                            ) : siparis.finans_durumu === 'KISMI_ODEME' ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded" title={`Qalıq: ${qaliq} AZN`}>
                                Qalıq: {qaliq} ₼
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.5 rounded">
                                Gözləyir
                              </span>
                            )}
                          </div>

                          {/* Lojistik və Karqo İzləmə Kodu / Kuryer */}
                          {(siparis.uluslararasi_kargo_kodu || siparis.kanada_takip_kodu || siparis.baku_kurye_adi) && (
                            <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                              {siparis.baku_kurye_adi ? (
                                <span className="text-purple-700 font-semibold truncate flex items-center gap-1">
                                  <Truck className="w-2.5 h-2.5 shrink-0" />
                                  {siparis.baku_kurye_adi}
                                </span>
                              ) : siparis.uluslararasi_kargo_kodu ? (
                                <span className="text-sky-700 font-semibold truncate flex items-center gap-1">
                                  <Plane className="w-2.5 h-2.5 shrink-0" />
                                  {siparis.uluslararasi_kargo_kodu}
                                </span>
                              ) : (
                                <span className="text-slate-600 truncate">
                                  📦 {siparis.kanada_takip_kodu}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Kart Alt: Əməliyyat Düymələri (Mərhələ İrəli / Geri & WhatsApp) */}
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                          {/* Geri Al */}
                          {onceki ? (
                            <button
                              type="button"
                              onClick={(e) => handleAsamaDegistir(e, siparis.id, onceki)}
                              title="Əvvəlki mərhələyə qaytar"
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          ) : <div className="w-5" />}

                          {/* WhatsApp Bildirişi Göndər */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWhatsAppSec(siparis);
                            }}
                            title="Müştəriyə WhatsApp ilə məlumat ver"
                            className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <MessageCircle className="w-2.5 h-2.5" />
                            <span>WhatsApp</span>
                          </button>

                          {/* İrəli Keçir */}
                          {sonraki ? (
                            <button
                              type="button"
                              onClick={(e) => handleAsamaDegistir(e, siparis.id, sonraki)}
                              title="Növbəti mərhələyə keçir"
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-0.5 transition-all shadow-2xs cursor-pointer"
                            >
                              <span>İrəli</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Bitdi</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
