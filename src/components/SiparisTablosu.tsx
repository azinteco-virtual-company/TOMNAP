import React, { useState } from 'react';
import { 
  Siparis, 
  FinansDurumu, 
  LojistikDurumu 
} from '../types';
import { 
  Search, 
  Filter, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Truck, 
  DollarSign, 
  MoreHorizontal, 
  Eye, 
  Trash2, 
  MessageCircle,
  ExternalLink,
  Edit2,
  Sparkles,
  Package,
  Plane,
  LayoutGrid,
  List,
  Layers
} from 'lucide-react';
import { useDil } from '../context/DilKonteksti';
import { KanbanGorunumu } from './KanbanGorunumu';

interface SiparisTablosuProps {
  siparisler: Siparis[];
  onDurumGuncelle: (id: string, guncellemeler: Partial<Siparis>) => void;
  onSiparisSil: (id: string) => void;
  onSiparisSec: (siparis: Siparis) => void;
  onWhatsAppSec?: (siparis: Siparis) => void;
  onKargoManifestAc?: () => void;
  onBakuTahsilatAc?: () => void;
  onInboxAc?: () => void;
  inboxSayisi?: number;
}

export const SiparisTablosu: React.FC<SiparisTablosuProps> = ({
  siparisler,
  onDurumGuncelle,
  onSiparisSil,
  onSiparisSec,
  onWhatsAppSec,
  onKargoManifestAc,
  onBakuTahsilatAc,
  onInboxAc,
  inboxSayisi = 2,
}) => {
  const { t } = useDil();
  const [aramaMetni, setAramaMetni] = useState('');
  const [seciliFinans, setSeciliFinans] = useState<string>('TUMU');
  const [seciliLojistik, setSeciliLojistik] = useState<string>('TUMU');
  const [sadeceEksikOlanlar, setSadeceEksikOlanlar] = useState(false);
  const [gorunumTipi, setGorunumTipi] = useState<'tablo' | 'kart' | 'kanban'>('tablo');

  // Filtreleme
  const filtrelenmisSiparisler = siparisler.filter((s) => {
    const aramaUyumu =
      !aramaMetni ||
      s.musteri_adi.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      s.urun_aciklamasi.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      (s.instagram_kullanici_adi &&
        s.instagram_kullanici_adi.toLowerCase().includes(aramaMetni.toLowerCase())) ||
      (s.ozel_not && s.ozel_not.toLowerCase().includes(aramaMetni.toLowerCase())) ||
      (s.telefon_numarasi && s.telefon_numarasi.includes(aramaMetni));

    const finansUyumu = seciliFinans === 'TUMU' || s.finans_durumu === seciliFinans;
    const lojistikUyumu =
      seciliLojistik === 'TUMU' ||
      (seciliLojistik === 'YOLDA'
        ? s.lojistik_durumu === 'KANADA_DEPO' ||
          s.lojistik_durumu === 'ULUSLARARASI_KARGO' ||
          s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS'
        : s.lojistik_durumu === seciliLojistik);
    const eksikUyumu = !sadeceEksikOlanlar || (s.eksik_bilgiler && s.eksik_bilgiler.length > 0);

    return aramaUyumu && finansUyumu && lojistikUyumu && eksikUyumu;
  });

  const handleFinansDurumDegistir = (siparis: Siparis, yeniDurum: FinansDurumu) => {
    let alinan = siparis.alinan_tutar;
    if (yeniDurum === 'ODENDI') {
      alinan = siparis.toplam_tutar;
    } else if (yeniDurum === 'BEKLIYOR') {
      alinan = 0;
    }
    onDurumGuncelle(siparis.id, {
      finans_durumu: yeniDurum,
      alinan_tutar: alinan,
      kalan_tutar: Math.max(0, siparis.toplam_tutar - alinan),
    });
  };

  const handleLojistikDurumDegistir = (id: string, yeniDurum: LojistikDurumu) => {
    onDurumGuncelle(id, { lojistik_durumu: yeniDurum });
  };

  const lojistikSiralamasi: LojistikDurumu[] = [
    'KANADA_SATINALIM_BEKLIYOR',
    'KANADA_DEPO',
    'ULUSLARARASI_KARGO',
    'BAKU_DAGITIM_ARKADAS',
    'TESLIM_EDILDI',
  ];

  // Chip Sayaçları
  const tumuSayisi = siparisler.length;
  const hazirlaniyorSayisi = siparisler.filter(s => s.lojistik_durumu === 'KANADA_SATINALIM_BEKLIYOR').length;
  const yoldaSayisi = siparisler.filter(s => 
    s.lojistik_durumu === 'KANADA_DEPO' || 
    s.lojistik_durumu === 'ULUSLARARASI_KARGO' || 
    s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS'
  ).length;
  const teslimEdildiSayisi = siparisler.filter(s => s.lojistik_durumu === 'TESLIM_EDILDI').length;

  const sonrakiLojistikDurumunaIlerlet = (siparis: Siparis) => {
    const suankiIndex = lojistikSiralamasi.indexOf(siparis.lojistik_durumu);
    if (suankiIndex < lojistikSiralamasi.length - 1) {
      const sonraki = lojistikSiralamasi[suankiIndex + 1];
      handleLojistikDurumDegistir(siparis.id, sonraki);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Tablo Üst Kontrolleri & Filtreler */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-700">Güncel Sipariş Takibi</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Toplam {filtrelenmisSiparisler.length} sipariş listeleniyor
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Arama Kutusu */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="input-tablo-arama"
              placeholder={t.axtarisYeri}
              value={aramaMetni}
              onChange={(e) => setAramaMetni(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 outline-none bg-white text-slate-700 focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
            />
          </div>

          {/* Finans Filtresi */}
          <select
            id="select-filtre-finans"
            value={seciliFinans}
            onChange={(e) => setSeciliFinans(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white text-slate-700 cursor-pointer focus:ring-1 focus:ring-blue-500"
          >
            <option value="TUMU">Tüm Finans Durumları</option>
            <option value="ODENDI">Ödendi (ODENDI)</option>
            <option value="KISMI_ODEME">Kısmi Ödeme (KISMI_ODEME)</option>
            <option value="BEKLIYOR">Bekliyor (BEKLIYOR)</option>
          </select>

          {/* Lojistik Filtresi */}
          <select
            id="select-filtre-lojistik"
            value={seciliLojistik}
            onChange={(e) => setSeciliLojistik(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white text-slate-700 cursor-pointer focus:ring-1 focus:ring-blue-500"
          >
            <option value="TUMU">Tüm Lojistik Aşamaları</option>
            <option value="KANADA_SATINALIM_BEKLIYOR">🇨🇦 Kanada Satınalım</option>
            <option value="KANADA_DEPO">🇨🇦 Kanada Depoda</option>
            <option value="ULUSLARARASI_KARGO">✈️ Uluslararası Kargoda</option>
            <option value="BAKU_DAGITIM_ARKADAS">🇦🇿 Bakü Dağıtım (Arkadaşta)</option>
            <option value="TESLIM_EDILDI">✅ Teslim Edildi</option>
          </select>

          {/* Eksik Bilgi Filtresi Butonu */}
          <button
            type="button"
            id="btn-filtre-eksik"
            onClick={() => setSadeceEksikOlanlar(!sadeceEksikOlanlar)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
              sadeceEksikOlanlar
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Eksikler ({siparisler.filter(s => s.eksik_bilgiler?.length > 0).length})</span>
          </button>

          {/* Hepsini Uluslararası Kargo Yap Butonu */}
          <button
            type="button"
            id="btn-toplu-uluslararasi-kargo"
            onClick={async () => {
              try {
                await fetch('/api/siparisler/tumunu-uluslararasi-kargo-yap', { method: 'POST' });
                siparisler.forEach((s) => {
                  if (s.lojistik_durumu !== 'TESLIM_EDILDI') {
                    onDurumGuncelle(s.id, { lojistik_durumu: 'ULUSLARARASI_KARGO' });
                  }
                });
              } catch (e) {
                console.error(e);
              }
            }}
            title="Tüm açık siparişleri Uluslararası Kargo aşamasına alır"
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Truck className="w-3.5 h-3.5 text-sky-600" />
            <span>Tümü Uluslararası Kargo</span>
          </button>

          {/* Bakü Tahsilat Raporu Butonu */}
          {onBakuTahsilatAc && (
            <button
              type="button"
              id="btn-baku-tahsilat-toolbar"
              onClick={onBakuTahsilatAc}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <DollarSign className="w-3.5 h-3.5 text-amber-700" />
              <span>Bakı Qalıq Borc</span>
            </button>
          )}

          {/* Kargo Manifestosu Butonu */}
          {onKargoManifestAc && (
            <button
              type="button"
              id="btn-kargo-manifest-toolbar"
              onClick={onKargoManifestAc}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Truck className="w-3.5 h-3.5 text-blue-700" />
              <span>Kargo Manifestosu</span>
            </button>
          )}

          {/* Onay Bekleyenler Butonu */}
          {onInboxAc && (
            <button
              type="button"
              id="btn-inbox-toolbar"
              onClick={onInboxAc}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Onay Bekleyenler</span>
              {inboxSayisi > 0 && (
                <span className="w-4 h-4 rounded-full bg-white text-amber-800 text-[10px] font-bold flex items-center justify-center">
                  {inboxSayisi}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Chip Tabanlı Durum Filtre Menüsü */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline-block">
            Status:
          </span>

          {/* Chip 1: Tümü */}
          <button
            type="button"
            onClick={() => setSeciliLojistik('TUMU')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              seciliLojistik === 'TUMU'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Hamısı</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
              seciliLojistik === 'TUMU' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {tumuSayisi}
            </span>
          </button>

          {/* Chip 2: Hazırlanıyor (Kanada Satınalım) */}
          <button
            type="button"
            onClick={() => setSeciliLojistik('KANADA_SATINALIM_BEKLIYOR')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              seciliLojistik === 'KANADA_SATINALIM_BEKLIYOR'
                ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200/70 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Hazırlanır</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
              seciliLojistik === 'KANADA_SATINALIM_BEKLIYOR' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
            }`}>
              {hazirlaniyorSayisi}
            </span>
          </button>

          {/* Chip 3: Yolda (Kanada Depo / Uluslararası Kargo / Bakü Dağıtım) */}
          <button
            type="button"
            onClick={() => {
              setSeciliLojistik(seciliLojistik === 'YOLDA' ? 'TUMU' : 'YOLDA');
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              seciliLojistik === 'YOLDA' || seciliLojistik === 'ULUSLARARASI_KARGO' || seciliLojistik === 'KANADA_DEPO' || seciliLojistik === 'BAKU_DAGITIM_ARKADAS'
                ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-200'
                : 'bg-sky-50 text-sky-900 border border-sky-200/70 hover:bg-sky-100'
            }`}
          >
            <Plane className="w-3.5 h-3.5 text-sky-500" />
            <span>Yolda</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
              seciliLojistik === 'YOLDA' || seciliLojistik === 'ULUSLARARASI_KARGO' || seciliLojistik === 'KANADA_DEPO' || seciliLojistik === 'BAKU_DAGITIM_ARKADAS'
                ? 'bg-sky-700 text-white'
                : 'bg-sky-200 text-sky-900'
            }`}>
              {yoldaSayisi}
            </span>
          </button>

          {/* Chip 4: Teslim Edildi */}
          <button
            type="button"
            onClick={() => setSeciliLojistik('TESLIM_EDILDI')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              seciliLojistik === 'TESLIM_EDILDI'
                ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200'
                : 'bg-emerald-50 text-emerald-900 border border-emerald-200/70 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Təhvil Verildi</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
              seciliLojistik === 'TESLIM_EDILDI' ? 'bg-emerald-700 text-white' : 'bg-emerald-200 text-emerald-900'
            }`}>
              {teslimEdildiSayisi}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Seçili Filtre Temizleme */}
          {seciliLojistik !== 'TUMU' && (
            <button
              type="button"
              onClick={() => setSeciliLojistik('TUMU')}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors shrink-0 underline decoration-slate-300 cursor-pointer"
            >
              Filtri Sıfırla
            </button>
          )}

          {/* Görünüş Rejimi Seçicisi (Cədvəl / Kartlar / Kanban) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setGorunumTipi('tablo')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                gorunumTipi === 'tablo' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Cədvəl Görünüşü"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cədvəl</span>
            </button>
            <button
              type="button"
              onClick={() => setGorunumTipi('kart')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                gorunumTipi === 'kart' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Kart Görünüşü"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kart</span>
            </button>
            <button
              type="button"
              onClick={() => setGorunumTipi('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                gorunumTipi === 'kanban' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-indigo-700 hover:bg-indigo-50'
              }`}
              title="Kanban Boru Xətti (5 Mərhələ)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Kanban</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-extrabold ${
                gorunumTipi === 'kanban' ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-800'
              }`}>
                5
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. Kanban Görünüşü */}
      {gorunumTipi === 'kanban' ? (
        <div className="p-3">
          <KanbanGorunumu
            siparisler={siparisler}
            onDurumGuncelle={onDurumGuncelle}
            onSiparisSec={onSiparisSec}
            onWhatsAppSec={onWhatsAppSec || (() => {})}
          />
        </div>
      ) : (
        <>
          {/* Mobil / Kart Görünümü */}
          <div className={`space-y-3 p-3 ${gorunumTipi === 'kart' ? 'block' : 'block md:hidden'}`}>
        {filtrelenmisSiparisler.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            Axtarış və ya filtr meyarlarına uyğun sifariş tapılmadı.
          </div>
        ) : (
          filtrelenmisSiparisler.map((siparis) => {
            const qaliq = siparis.kalan_baku_tahsilat_azn ?? (
              (siparis.baku_tahsilat_azn || 0) - (siparis.baku_tahsil_edilen_azn || 0)
            );
            const ilkGorsel = siparis.urunler?.[0]?.urun_gorseli || siparis.gorsel_urlleri?.[0] || siparis.gorsel_url;
            const temizGorsel = ilkGorsel && (ilkGorsel.startsWith('/uploads/') || ilkGorsel.startsWith('data:') || ilkGorsel.startsWith('http')) 
              ? ilkGorsel 
              : (ilkGorsel && ilkGorsel.includes('.svg') ? `/uploads/${ilkGorsel}` : undefined);

            return (
              <div 
                key={`mobil-kart-${siparis.id}`}
                className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs transition-shadow"
              >
                {/* Kart Başlığı: Müştəri və Əməliyyatlar */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                      <span>{siparis.musteri_adi}</span>
                      {siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Əskik məlumat var" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      {siparis.instagram_kullanici_adi ? (
                        <span className="text-blue-600 font-medium truncate">
                          {siparis.instagram_kullanici_adi}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">DM</span>
                      )}
                      {siparis.telefon_numarasi && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 truncate">{siparis.telefon_numarasi}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobil Əməliyyat Düymələri (Geniş toxunuş sahəsi) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {onWhatsAppSec && (
                      <button
                        type="button"
                        onClick={() => onWhatsAppSec(siparis)}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 active:scale-95 transition-transform"
                        title="WhatsApp Bildirişi Göndər"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSiparisSec(siparis)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 active:scale-95 transition-transform"
                      title="Sifariş Təfərrüatları"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSiparisSil(siparis.id)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 active:scale-95 transition-transform"
                      title="Siparişi Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Kart Məzmunu: Şəkil və Təsvir */}
                <div className="py-2.5 flex items-start gap-3">
                  {temizGorsel && (
                    <img
                      src={temizGorsel}
                      alt="Məhsul"
                      className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-200 p-0.5 shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-relaxed">
                      {siparis.urun_aciklamasi}
                    </p>
                    {siparis.ozel_not && (
                      <p className="text-[11px] text-slate-500 italic mt-1 line-clamp-1">
                        "{siparis.ozel_not}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Kart Altı: Lojistik Seçici və Qiymət/Qalıq */}
                <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                      Lojistik Mərhələ
                    </span>
                    <select
                      value={siparis.lojistik_durumu}
                      onChange={(e) => onDurumGuncelle(siparis.id, { lojistik_durumu: e.target.value as any })}
                      className="w-full text-xs font-semibold rounded-lg bg-slate-50 border border-slate-200 py-1.5 px-2 text-slate-800 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="KANADA_SATINALIM_BEKLIYOR">Satınalma Gözləyir</option>
                      <option value="KANADA_DEPO">Kanada Anbarı</option>
                      <option value="ULUSLARARASI_KARGO">Uçuşda / Kargo</option>
                      <option value="BAKU_DAGITIM_ARKADAS">Bakı Paylanma</option>
                      <option value="TESLIM_EDILDI">Təhvil Verildi</option>
                    </select>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                      Məbləğ & Qalıq
                    </span>
                    <div className="font-extrabold text-slate-900 text-xs">
                      {siparis.toplam_tutar_cad ? `${siparis.toplam_tutar_cad} CAD` : '-'}
                    </div>
                    <div className="text-[11px] font-bold mt-0.5">
                      {qaliq > 0 ? (
                        <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 inline-block">
                          Qalıq: {qaliq} ₼
                        </span>
                      ) : (
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block">
                          Tam Ödənildi ✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tablo İçeriği (Masaüstü və ya istifadəçi Cədvəl seçdikdə) */}
      <div className={`overflow-x-auto max-h-[72vh] border border-slate-200/80 rounded-xl shadow-xs ${
        gorunumTipi === 'tablo' ? 'block' : 'hidden'
      }`}>
        <table className="w-full text-left text-xs min-w-[1040px]">
          <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10 shadow-xs">
            <tr>
              <th className="p-3 w-[170px]">{t.musteriVeElaqe}</th>
              <th className="p-3 min-w-[210px]">{t.mehsulTesvir}</th>
              <th className="p-3 w-[130px]">{t.qaliqBorc}</th>
              <th className="p-3 w-[220px]">{t.lojistikMerhele}</th>
              <th className="p-3 w-[120px]">{t.mebleg}</th>
              <th className="p-3 min-w-[200px]">{t.qeydNot}</th>
              <th className="p-3 w-[130px]">{t.gomrukBakuTehvil}</th>
              <th className="p-3 w-[90px] text-right">{t.emeliyyat}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrelenmisSiparisler.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400">
                  Arama veya filtreleme kriterlerine uygun sipariş bulunamadı.
                </td>
              </tr>
            ) : (
              filtrelenmisSiparisler.map((siparis) => {
                return (
                  <tr
                    key={siparis.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* 1. Müşteri */}
                    <td className="p-3">
                      <div className="font-bold text-slate-900">
                        {siparis.musteri_adi}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {siparis.instagram_kullanici_adi ? (
                          <span className="text-blue-600 font-medium text-[11px]">
                            {siparis.instagram_kullanici_adi}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">DM / No handle</span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-medium">
                          {siparis.siparis_kaynagi.replace('INSTAGRAM_', 'IG ')}
                        </span>
                      </div>
                      {siparis.telefon_numarasi && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {siparis.telefon_numarasi}
                        </div>
                      )}
                    </td>

                    {/* 2. Ürün */}
                    <td className="p-3 max-w-xs">
                      {(() => {
                        const ilkGorsel = siparis.urunler?.[0]?.urun_gorseli || siparis.gorsel_urlleri?.[0] || siparis.gorsel_url;
                        const temizGorsel = ilkGorsel && (ilkGorsel.startsWith('/uploads/') || ilkGorsel.startsWith('data:') || ilkGorsel.startsWith('http')) ? ilkGorsel : (ilkGorsel && ilkGorsel.includes('.svg') ? `/uploads/${ilkGorsel}` : undefined);
                        return (
                          <div className="flex items-center gap-2">
                            {temizGorsel && (
                              <img
                                src={temizGorsel}
                                alt="Ürün"
                                className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0 shadow-2xs"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <div className="font-semibold text-slate-800 line-clamp-1 text-xs">
                                  {siparis.urun_aciklamasi}
                                </div>
                                {siparis.urunler && siparis.urunler.length > 1 && (
                                  <span className="shrink-0 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded">
                                    {siparis.urunler.length} Ürün
                                  </span>
                                )}
                                {siparis.gorsel_urlleri && siparis.gorsel_urlleri.length > 1 && (
                                  <span className="shrink-0 px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[10px] font-medium rounded border border-slate-200">
                                    📸 {siparis.gorsel_urlleri.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {siparis.beden_veya_olcu && (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                            {siparis.beden_veya_olcu}
                          </span>
                        )}
                        {siparis.renk && (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                            {siparis.renk}
                          </span>
                        )}
                        <span>{siparis.adet} adet</span>
                      </div>
                    </td>

                    {/* 3. Ödeme Durumu Dropdown / Badge */}
                    <td className="p-3">
                      <select
                        value={siparis.finans_durumu}
                        onChange={(e) =>
                          handleFinansDurumDegistir(siparis, e.target.value as FinansDurumu)
                        }
                        className={`text-xs font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${
                          siparis.finans_durumu === 'ODENDI'
                            ? 'bg-emerald-100 text-emerald-700'
                            : siparis.finans_durumu === 'KISMI_ODEME'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        <option value="ODENDI">ODENDI</option>
                        <option value="KISMI_ODEME">KISMI_ODEME</option>
                        <option value="BEKLIYOR">BEKLIYOR</option>
                      </select>
                    </td>

                    {/* 4. Lojistik Aşaması */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={siparis.lojistik_durumu}
                          onChange={(e) =>
                            handleLojistikDurumDegistir(
                              siparis.id,
                              e.target.value as LojistikDurumu
                            )
                          }
                          className={`text-xs font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${
                            siparis.lojistik_durumu === 'ULUSLARARASI_KARGO'
                              ? 'bg-blue-100 text-blue-700'
                              : siparis.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS'
                              ? 'bg-purple-100 text-purple-700'
                              : siparis.lojistik_durumu === 'TESLIM_EDILDI'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <option value="KANADA_SATINALIM_BEKLIYOR">
                            KANADA_SATINALIM_BEKLIYOR
                          </option>
                          <option value="KANADA_DEPO">KANADA_DEPO</option>
                          <option value="ULUSLARARASI_KARGO">ULUSLARARASI_KARGO</option>
                          <option value="BAKU_DAGITIM_ARKADAS">
                            BAKU_DAGITIM_ARKADAS
                          </option>
                          <option value="TESLIM_EDILDI">TESLIM_EDILDI</option>
                        </select>

                        {siparis.lojistik_durumu !== 'TESLIM_EDILDI' && (
                          <button
                            title="Bir sonraki lojistik aşamasına geçir"
                            onClick={() => sonrakiLojistikDurumunaIlerlet(siparis)}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Takip Kodları Mini Gösterim */}
                      {(siparis.kanada_takip_kodu || siparis.uluslararasi_kargo_kodu) && (
                        <div className="mt-1 space-y-0.5 font-mono text-[10px] leading-tight">
                          {siparis.kanada_takip_kodu && (
                            <div className="text-rose-700 font-semibold truncate" title={`Kanada Takip: ${siparis.kanada_takip_kodu}`}>
                              🇨🇦 {siparis.kanada_takip_kodu}
                            </div>
                          )}
                          {siparis.uluslararasi_kargo_kodu && (
                            <div className="text-blue-700 font-semibold truncate" title={`Kargo Kodu: ${siparis.uluslararasi_kargo_kodu}`}>
                              ✈️ {siparis.uluslararasi_kargo_kodu}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 5. Tutar */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-bold text-slate-900">
                        {siparis.toplam_tutar.toFixed(2)} {siparis.para_birimi}
                      </div>
                      <div className="text-[11px] mt-0.5">
                        {siparis.kalan_tutar > 0 ? (
                          <span className="text-amber-700 font-semibold">
                            Kalan: {siparis.kalan_tutar.toFixed(2)} {siparis.para_birimi}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Tamamı Ödendi</span>
                        )}
                      </div>
                    </td>

                    {/* 6. Özel Not & Teslimat Talimatı */}
                    <td className="p-3 max-w-[230px]">
                      {siparis.ozel_not ? (
                        <div
                          onClick={() => onSiparisSec(siparis)}
                          className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/90 transition-all text-amber-950 cursor-pointer shadow-2xs group/note"
                          title={`Özel Talimat: ${siparis.ozel_not}\n(Detayı görmek veya düzenlemek için tıklayın)`}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-extrabold text-amber-800 uppercase tracking-tight mb-0.5">
                            <span>📌</span>
                            <span>Talimat:</span>
                          </div>
                          <div className="text-[11px] font-semibold leading-snug line-clamp-2">
                            {siparis.ozel_not}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSiparisSec(siparis)}
                          className="text-[11px] text-slate-400 hover:text-amber-700 hover:bg-amber-50/80 px-2 py-1 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-amber-200 flex items-center gap-1"
                          title="Bu siparişe özel kargo/teslimat notu ekle"
                        >
                          <span>+ Not Ekle</span>
                        </button>
                      )}
                    </td>

                    {/* 7. Eksik Bilgi / Tahsilat */}
                    <td className="p-3 max-w-xs">
                      {siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {siparis.eksik_bilgiler.map((e, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200 font-medium"
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mb-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Eksiksiz</span>
                        </div>
                      )}

                      {siparis.baku_tahsilat_notu && (
                        <div className="text-[11px] text-slate-500 italic line-clamp-1" title={siparis.baku_tahsilat_notu}>
                          "{siparis.baku_tahsilat_notu}"
                        </div>
                      )}
                    </td>

                    {/* 7. İşlemler */}
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {onWhatsAppSec && (
                          <button
                            type="button"
                            onClick={() => onWhatsAppSec(siparis)}
                            title="Müştəriyə WhatsApp Bildirişi Hazırla"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer border border-emerald-200"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSiparisSec(siparis)}
                          title="Sipariş Detayını ve Orijinal Mesajı Gör"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSiparisSil(siparis.id)}
                          title="Siparişi Sil"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
};
