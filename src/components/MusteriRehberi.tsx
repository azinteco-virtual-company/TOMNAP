import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Phone,
  MapPin,
  ShoppingBag,
  CreditCard,
  Clock,
  CheckCircle2,
  Sparkles,
  Plus,
  MessageCircle,
  UserCheck,
  HeartHandshake,
  Crown,
  Filter,
  ArrowUpDown,
  FileText,
  ExternalLink,
  ChevronRight,
  Package,
  Truck,
  AlertCircle,
  Calendar,
  DollarSign,
  Store,
  RefreshCw,
} from 'lucide-react';
import { Musteri, MusteriTipi, Siparis } from '../types';

interface MusteriRehberiProps {
  onSiparislereGit: () => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
}

type SiralamaTuru =
  'SON_SIPARIS' | 'AD_AZ' | 'AD_ZA' | 'SIPARIS_SAYISI' | 'TOPLAM_HARCAMA' | 'KALAN_BORC';

export const MusteriRehberi: React.FC<MusteriRehberiProps> = ({
  onSiparislereGit,
  onSiparisDetayAc,
  seciliFirmaId,
  seciliFirmaAd,
}) => {
  const [musteriler, setMusteriler] = useState<Musteri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState('');
  const [tipFiltresi, setTipFiltresi] = useState<string>('TUMU');
  const [siralama, setSiralama] = useState<SiralamaTuru>('SON_SIPARIS');
  const [seciliMusteri, setSeciliMusteri] = useState<Musteri | null>(null);
  const [musteriSiparisleri, setMusteriSiparisleri] = useState<Siparis[]>([]);
  const [gecmisYukleniyor, setGecmisYukleniyor] = useState(false);

  // Müşterileri API'den yükle (Zorunlu Tenant İzolasyonlu Veritabanı Sorgusu)
  const musterileriGetir = async () => {
    try {
      setYukleniyor(true);
      // tenant_id filtresini veritabanı sorgusu için her zaman zorunlu kıl
      const aktifTenant = seciliFirmaId || 'all';
      const url = `/api/musteriler?tenant_id=${encodeURIComponent(aktifTenant)}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (data.basarili && Array.isArray(data.musteriler)) {
        setMusteriler(data.musteriler);
      } else {
        setMusteriler([]);
      }
    } catch (e) {
      console.error('Müşteriler alınamadı:', e);
      setMusteriler([]);
    } finally {
      setYukleniyor(false);
    }
  };

  // Firma (tenant) değiştirildiğinde rehberi anlık olarak güncelleyen useEffect tetikleyicisi
  useEffect(() => {
    // Önceki firmadan açık kalan müşteri detay modalını ve siparişlerini anında sıfırla
    setSeciliMusteri(null);
    setMusteriSiparisleri([]);
    setAramaMetni('');
    // Seçili firma verilerini anında veritabanından yeniden yükle
    musterileriGetir();
  }, [seciliFirmaId]);

  // Seçili müşterinin sipariş geçmişini yükle (Zorunlu tenant_id filtresi ile)
  const musteriGecmisiAc = async (musteri: Musteri) => {
    setSeciliMusteri(musteri);
    try {
      setGecmisYukleniyor(true);
      const aktifTenant = seciliFirmaId || 'all';
      const url = `/api/musteriler/${encodeURIComponent(musteri.id)}/siparisler?tenant_id=${encodeURIComponent(aktifTenant)}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (data.basarili && Array.isArray(data.siparisler)) {
        setMusteriSiparisleri(data.siparisler);
      } else {
        setMusteriSiparisleri([]);
      }
    } catch (e) {
      console.error('Sipariş geçmişi hatası:', e);
      setMusteriSiparisleri([]);
    } finally {
      setGecmisYukleniyor(false);
    }
  };

  // Filtreleme ve Sıralama
  const islenmisMusteriler = useMemo(() => {
    // 1. Filtrele
    let sonuc = musteriler.filter((m) => {
      // Çift katmanlı Tenant İzolasyonu
      if (seciliFirmaId && seciliFirmaId !== 'all') {
        const tid = m.tenant_id;
        if (tid !== seciliFirmaId) return false;
      }

      const arama = aramaMetni.toLowerCase().trim();
      const aramaUygun =
        !arama ||
        m.ad_soyad.toLowerCase().includes(arama) ||
        (m.telefon && m.telefon.includes(arama)) ||
        (m.sehir && m.sehir.toLowerCase().includes(arama)) ||
        (m.adres && m.adres.toLowerCase().includes(arama)) ||
        (m.son_urun_aciklamasi && m.son_urun_aciklamasi.toLowerCase().includes(arama));

      const tipUygun =
        tipFiltresi === 'TUMU' ||
        (tipFiltresi === 'BORCLU'
          ? (m.kalan_toplam_borc || 0) > 0
          : m.musteri_tipi === tipFiltresi);

      return aramaUygun && tipUygun;
    });

    // 2. Sırala
    sonuc = [...sonuc].sort((a, b) => {
      switch (siralama) {
        case 'AD_AZ':
          return a.ad_soyad.localeCompare(b.ad_soyad, 'tr');
        case 'AD_ZA':
          return b.ad_soyad.localeCompare(a.ad_soyad, 'tr');
        case 'SIPARIS_SAYISI':
          return (b.toplam_siparis_sayisi || 0) - (a.toplam_siparis_sayisi || 0);
        case 'TOPLAM_HARCAMA':
          return (b.toplam_harcama || 0) - (a.toplam_harcama || 0);
        case 'KALAN_BORC':
          return (b.kalan_toplam_borc || 0) - (a.kalan_toplam_borc || 0);
        case 'SON_SIPARIS':
        default:
          return (
            new Date(b.son_siparis_tarihi || 0).getTime() -
            new Date(a.son_siparis_tarihi || 0).getTime()
          );
      }
    });

    return sonuc;
  }, [musteriler, aramaMetni, tipFiltresi, siralama]);

  // İstatistikler
  const toplamMusteriSayisi = musteriler.length;
  const sadikSayisi = musteriler.filter((m) => m.musteri_tipi === 'SADIK_MUSTERI').length;
  const akrabaSayisi = musteriler.filter((m) => m.musteri_tipi === 'AKRABA_YAKIN').length;
  const vipSayisi = musteriler.filter((m) => m.musteri_tipi === 'VIP').length;
  const borcluMusteriSayisi = musteriler.filter((m) => (m.kalan_toplam_borc || 0) > 0).length;
  const toplamKalanBorc = musteriler.reduce((acc, m) => acc + (m.kalan_toplam_borc || 0), 0);

  const getTipRozet = (tip: string) => {
    switch (tip) {
      case 'SADIK_MUSTERI':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <UserCheck className="w-3 h-3" /> Sadık Müşteri
          </span>
        );
      case 'VIP':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Crown className="w-3 h-3" /> VIP Müşteri
          </span>
        );
      case 'AKRABA_YAKIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <HeartHandshake className="w-3 h-3" /> Akraba / Tanıdık
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Yeni / Tanımadık
          </span>
        );
    }
  };

  const getLojistikRozet = (durum: string) => {
    switch (durum) {
      case 'TESLIM_EDILDI':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            ✅ Təhvil Verildi
          </span>
        );
      case 'BAKU_DAGITIM_ARKADAS':
        return (
          <span className="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800 text-[10px] font-bold">
            🛵 Bakı Paylaşımda
          </span>
        );
      case 'ULUSLARARASI_KARGO':
        return (
          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold">
            ✈️ Təyyarədə (Yolda)
          </span>
        );
      case 'KANADA_DEPO':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
            📦 Kanada Anbarda
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
            ⏳ Satınalma Gözləyir
          </span>
        );
    }
  };

  const tarihFormatla = (tarihStr?: string) => {
    if (!tarihStr) return '';
    try {
      const d = new Date(tarihStr);
      const simdi = Date.now();
      const farkGun = Math.floor((simdi - d.getTime()) / (1000 * 60 * 60 * 24));
      if (farkGun === 0) return 'Bugün';
      if (farkGun === 1) return 'Dün';
      if (farkGun < 30) return `${farkGun} gün önce`;
      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Üst Karşılama ve Açıklama */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">Müşteri Rehberi & CRM Masası</h2>
                {seciliFirmaAd && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-blue-600" />
                    {seciliFirmaAd}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kişi bazında toplanmış sipariş geçmişi, son alınan ürünler, kalan borçlar ve sadakat
                seviyeleri.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={musterileriGetir}
            disabled={yukleniyor}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Müştəri siyahısını yenilə"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${yukleniyor ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">Yenilə</span>
          </button>
          <button
            type="button"
            onClick={onSiparislereGit}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            ← Sipariş Masasına Dön
          </button>
        </div>
      </div>

      {/* İstatistik Metrik Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Kayıtlı Müşteri
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{toplamMusteriSayisi}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Aktif CRM Portföyü</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Sadık & VIP
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{sadikSayisi + vipSayisi}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Tekrar sipariş verenler</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-xs">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Akraba & Yakın
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1">{akrabaSayisi}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Elden / özel tahsilat</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-xs">
          <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
            Kalan Toplam Borç
          </div>
          <div className="text-2xl font-black text-rose-700 mt-1">
            {toplamKalanBorc.toFixed(0)} AZN
          </div>
          <div className="text-[11px] text-rose-600 mt-0.5">
            {borcluMusteriSayisi} müşteride borç var
          </div>
        </div>
      </div>

      {/* Akıllı Yazım Düzeltme & Bilgi Notu */}
      <div className="p-4 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white rounded-2xl shadow-sm space-y-1.5 border border-emerald-800/40">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>Akıllı Müşteri Eşleştirme & Otomatik Yazım Düzeltme (AI Autocorrect)</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Instagram Live, DM veya WhatsApp mesajlarında müşteri adı yanlış yazılsa bile (örneğin{' '}
          <strong>"Kemake"</strong>), sistem telefon numarası (+994 50 694 25 25) veya adresinden
          müşterinin <strong>Kəmalə Bədirbəyli</strong> olduğunu anlar; yeni kopya kayıt açmak
          yerine doğrudan bu müşterinin kartına bağlar.
        </p>
      </div>

      {/* Filtre, Arama ve Sıralama Çubuğu */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Arama Alanı */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            placeholder="Müşteri adı, son aldığı ürün, telefon, şehir..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
          />
        </div>

        {/* Hızlı Filtre Butonları */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {[
            { key: 'TUMU', label: 'Tümü' },
            { key: 'VIP', label: '👑 VIP' },
            { key: 'SADIK_MUSTERI', label: '💎 Sadık' },
            { key: 'AKRABA_YAKIN', label: '🤝 Akraba' },
            { key: 'BORCLU', label: '⚠️ Borcu Olanlar' },
          ].map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setTipFiltresi(btn.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                tipFiltresi === btn.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Sıralama Seçenekleri (A-Z, Ciro, Sipariş Sayısı vb.) */}
        <div className="flex items-center gap-2 border-t lg:border-t-0 pt-2 lg:pt-0 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" /> Sırala:
          </span>
          <select
            value={siralama}
            onChange={(e) => setSiralama(e.target.value as SiralamaTuru)}
            className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-emerald-500 focus:bg-white cursor-pointer"
          >
            <option value="SON_SIPARIS">🕒 En Son Sipariş Veren</option>
            <option value="AD_AZ">🔤 Ada Göre (A'dan Z'ye)</option>
            <option value="AD_ZA">🔤 Ada Göre (Z'den A'ya)</option>
            <option value="SIPARIS_SAYISI">📦 En Çok Siparişi Olan</option>
            <option value="TOPLAM_HARCAMA">💰 En Çok Harcayan (Ciro)</option>
            <option value="KALAN_BORC">⏳ En Yüksek Borcu Olan</option>
          </select>
        </div>
      </div>

      {/* Müşteri Listesi Tablosu */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Müşteri Adı Soyadı</th>
                <th className="py-3 px-4">Son Aldığı Ürün</th>
                <th className="py-3 px-4">Kategori / Tip</th>
                <th className="py-3 px-4">İletişim & Şehir</th>
                <th className="py-3 px-4 text-center">Sipariş Sayısı</th>
                <th className="py-3 px-4 text-right">Toplam Ciro</th>
                <th className="py-3 px-4 text-right">Kalan Borç</th>
                <th className="py-3 px-4 text-center">Sipariş Geçmişi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {yukleniyor ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-2" />
                    Müşteri kayıtları yükleniyor...
                  </td>
                </tr>
              ) : islenmisMusteriler.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-3">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-slate-700 text-sm">
                        {aramaMetni
                          ? 'Axtarışa uyğun müştəri tapılmadı'
                          : `"${seciliFirmaAd || 'Seçilmiş butik'}" üçün hələ müştəri qeydiyyatı yoxdur`}
                      </div>
                      <p className="text-xs text-slate-400">
                        {aramaMetni
                          ? 'Zəhmət olmasa axtarış sözünü dəyişdirərək yenidən yoxlayın.'
                          : 'Bu butik üçün yeni sifariş qəbul edildikdə və ya müştəri əlavə edildikdə CRM bazası avtomatik formalaşacaqdır.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                islenmisMusteriler.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Müşteri Adı */}
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                        {m.ad_soyad}
                        {m.toplam_siparis_sayisi > 1 && (
                          <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md border border-emerald-200">
                            {m.toplam_siparis_sayisi}x Alışveriş
                          </span>
                        )}
                      </div>
                      {m.instagram_kullanici_adi && (
                        <div className="text-[11px] text-purple-600 font-medium mt-0.5">
                          {m.instagram_kullanici_adi}
                        </div>
                      )}
                    </td>

                    {/* Son Aldığı Ürün (Kullanıcı Önerisi) */}
                    <td className="py-3 px-4 max-w-xs">
                      {m.son_urun_aciklamasi ? (
                        <div>
                          <div className="font-bold text-slate-800 truncate text-[11px] flex items-center gap-1">
                            <span className="text-slate-400">🛍️</span> {m.son_urun_aciklamasi}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            {m.son_siparis_tutari ? (
                              <span className="font-semibold text-slate-700">
                                {m.son_siparis_tutari} AZN
                              </span>
                            ) : null}
                            {m.son_siparis_tarihi && (
                              <span>• {tarihFormatla(m.son_siparis_tarihi)}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Kayıtlı ürün yok</span>
                      )}
                    </td>

                    {/* Tip */}
                    <td className="py-3 px-4 whitespace-nowrap">{getTipRozet(m.musteri_tipi)}</td>

                    {/* İletişim & Şehir */}
                    <td className="py-3 px-4">
                      {m.telefon ? (
                        <div className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{m.telefon}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Telefon yok</span>
                      )}
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{m.sehir || 'Bakü'}</span>
                        {m.adres && <span className="truncate max-w-[120px]">({m.adres})</span>}
                      </div>
                    </td>

                    {/* Sipariş Sayısı */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-1 font-black rounded-lg text-xs ${
                          m.toplam_siparis_sayisi >= 3
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : m.toplam_siparis_sayisi > 1
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {m.toplam_siparis_sayisi || 1} Adet
                      </span>
                    </td>

                    {/* Toplam Ciro */}
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {(m.toplam_harcama || 0).toFixed(2)} AZN
                    </td>

                    {/* Kalan Borç */}
                    <td className="py-3 px-4 text-right">
                      {(m.kalan_toplam_borc || 0) > 0 ? (
                        <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-xs">
                          {m.kalan_toplam_borc.toFixed(2)} AZN
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-600 text-[11px] flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Borç Yok
                        </span>
                      )}
                    </td>

                    {/* İşlem: Sipariş Geçmişi */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => musteriGecmisiAc(m)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 mx-auto group-hover:scale-105"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Sipariş Geçmişi</span>
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MÜŞTERİ SİPARİŞ GEÇMİŞİ VE İNCELEME MODALI */}
      {seciliMusteri && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Başlık */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shadow-xs">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      {seciliMusteri.ad_soyad}
                    </h3>
                    {getTipRozet(seciliMusteri.musteri_tipi)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                    <span>📞 {seciliMusteri.telefon || 'Telefon belirtilmemiş'}</span>
                    <span>
                      📍 {seciliMusteri.sehir || 'Bakü'}{' '}
                      {seciliMusteri.adres ? `(${seciliMusteri.adres})` : ''}
                    </span>
                    {seciliMusteri.instagram_kullanici_adi && (
                      <span className="text-purple-600 font-semibold">
                        {seciliMusteri.instagram_kullanici_adi}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSeciliMusteri(null)}
                className="w-8 h-8 rounded-lg bg-slate-200/70 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-sm font-bold cursor-pointer transition-all"
              >
                ✕
              </button>
            </div>

            {/* Finansal Özet Kartları */}
            <div className="px-5 pt-4 pb-2 bg-slate-50/50 border-b border-slate-100">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-white rounded-xl border border-slate-200 text-center shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Toplam Sipariş Adedi
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {musteriSiparisleri.length > 0
                      ? musteriSiparisleri.length
                      : seciliMusteri.toplam_siparis_sayisi}{' '}
                    Adet
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center shadow-2xs">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">
                    Toplam Harcama (Ciro)
                  </div>
                  <div className="text-lg font-black text-emerald-800 mt-0.5">
                    {seciliMusteri.toplam_harcama.toFixed(0)} AZN
                  </div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-center shadow-2xs">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">
                    Bakü Kalan Borç
                  </div>
                  <div className="text-lg font-black text-rose-700 mt-0.5">
                    {seciliMusteri.kalan_toplam_borc.toFixed(0)} AZN
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Gövdesi: Siparişlerin Zaman Çizelgesi (Timeline) */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Müşterinin Tüm Siparişleri ({musteriSiparisleri.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  En yeni sipariş en üstte listelenir
                </span>
              </div>

              {gecmisYukleniyor ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <span className="inline-block w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-2" />
                  Sipariş geçmişi getiriliyor...
                </div>
              ) : musteriSiparisleri.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Bu müşteriye ait henüz kaydedilmiş geçmiş sipariş bulunamadı.
                </div>
              ) : (
                <div className="space-y-3">
                  {musteriSiparisleri.map((sip, index) => (
                    <div
                      key={sip.id}
                      className="p-4 bg-slate-50/80 hover:bg-slate-100/90 rounded-xl border border-slate-200 transition-all space-y-3"
                    >
                      {/* Üst Kısım: Sıra, Tarih, Durum Rozetleri */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-[11px] font-black flex items-center justify-center">
                            #{musteriSiparisleri.length - index}
                          </span>
                          <span className="font-extrabold text-xs text-slate-900">{sip.id}</span>
                          <span className="text-[11px] text-slate-400">
                            •{' '}
                            {new Date(sip.olusturma_tarihi).toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                            ({tarihFormatla(sip.olusturma_tarihi)})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {getLojistikRozet(sip.lojistik_durumu)}
                          {sip.finans_durumu === 'ODENDI' ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              Tam Ödendi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold">
                              Borç: {sip.kalan_tutar} AZN
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Orta Kısım: Ürün Detayları ve Finans */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-black text-sm text-slate-900">
                            {sip.urun_aciklamasi}
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                            <span>
                              Adet: <strong>{sip.adet}</strong>
                            </span>
                            {sip.beden_veya_olcu && (
                              <span>
                                Beden/Ölçü: <strong>{sip.beden_veya_olcu}</strong>
                              </span>
                            )}
                            {sip.renk && (
                              <span>
                                Renk: <strong>{sip.renk}</strong>
                              </span>
                            )}
                            {sip.kanada_takip_kodu && (
                              <span className="font-mono text-[10px] bg-slate-200/60 px-1.5 py-0.5 rounded">
                                Kanada: {sip.kanada_takip_kodu}
                              </span>
                            )}
                            {sip.uluslararasi_kargo_kodu && (
                              <span className="font-mono text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                                Kargo: {sip.uluslararasi_kargo_kodu}
                              </span>
                            )}
                          </div>

                          {sip.baku_tahsilat_notu && (
                            <div className="text-[11px] text-amber-800 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 mt-1">
                              <strong>Bakı Qeydi:</strong> {sip.baku_tahsilat_notu}
                            </div>
                          )}
                        </div>

                        {/* Fiyat Bilgisi ve Detay Aç Butonu */}
                        <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2">
                          <div>
                            <div className="text-base font-black text-slate-900">
                              {sip.toplam_tutar} {sip.para_birimi || 'AZN'}
                            </div>
                            {sip.alinan_tutar > 0 && sip.kalan_tutar > 0 && (
                              <div className="text-[11px] text-slate-500">
                                Behdə: {sip.alinan_tutar} AZN • Qalıq:{' '}
                                <strong className="text-rose-600">{sip.kalan_tutar} AZN</strong>
                              </div>
                            )}
                          </div>

                          {/* KULLANICININ İSTEDİĞİ: SİPARİŞİN DETAYLARINA GİRME BUTONU */}
                          {onSiparisDetayAc && (
                            <button
                              type="button"
                              onClick={() => {
                                setSeciliMusteri(null);
                                onSiparisDetayAc(sip);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Sipariş Detaylarını Aç</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Alt Kısım */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {seciliMusteri.telefon ? (
                <a
                  href={`https://wa.me/${seciliMusteri.telefon.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>WhatsApp ile İletişim Aç</span>
                </a>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSeciliMusteri(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Pəncərəni Bağla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
