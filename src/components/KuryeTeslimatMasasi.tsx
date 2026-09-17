import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Phone,
  MapPin,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
  Search,
  Package,
  Filter,
  Navigation,
  Check,
  ShieldCheck,
  Calendar,
  Sparkles,
  Store,
  RefreshCw,
} from 'lucide-react';
import { Siparis, BakuKuryeProfili, FirmaTenant } from '../types';
import { BAKU_KURYELER } from '../data/kuryeler';

interface KuryeTeslimatMasasiProps {
  siparisler: Siparis[];
  seciliKuryeId: string;
  onKuryeDegistir: (id: string) => void;
  onSiparisGuncelle: (guncelSiparis: Siparis) => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
  kullaniciRolu?: string;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
  firmalar?: FirmaTenant[];
  onFirmaSec?: (id: string) => void;
  onSiparisleriYukle?: (hedefFirmaId?: string) => Promise<void> | void;
}

export const KuryeTeslimatMasasi: React.FC<KuryeTeslimatMasasiProps> = ({
  siparisler,
  seciliKuryeId,
  onKuryeDegistir,
  onSiparisGuncelle,
  onSiparisDetayAc,
  kullaniciRolu = 'BAKU_KURYE',
  seciliFirmaId,
  seciliFirmaAd,
  firmalar,
  onFirmaSec,
  onSiparisleriYukle,
}) => {
  const [aramaMetni, setAramaMetni] = useState('');
  const [durumFiltresi, setDurumFiltresi] = useState<'HEPSI' | 'TESLIM_BEKLEYEN' | 'TESLIM_EDILDI'>(
    'TESLIM_BEKLEYEN'
  );
  const [islemBildirimi, setIslemBildirimi] = useState<string | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);

  // Tenant değiştiğinde siparişleri doğrudan seçili tenant_id filtresi ile yeniden çek
  useEffect(() => {
    if (onSiparisleriYukle) {
      onSiparisleriYukle(seciliFirmaId);
    }
  }, [seciliFirmaId]);

  const handleYenile = async () => {
    if (onSiparisleriYukle) {
      setYenileniyor(true);
      try {
        await onSiparisleriYukle(seciliFirmaId);
      } finally {
        setTimeout(() => setYenileniyor(false), 500);
      }
    }
  };

  const aktifKurye = BAKU_KURYELER.find((k) => k.id === seciliKuryeId) || BAKU_KURYELER[0];

  // Bu kuryeye atanmış veya bölgesine düşen siparişler
  const kuryeSiparisleri = useMemo(() => {
    return siparisler.filter((s) => {
      // 1. Doğrudan bu kuryeye atanmış mı?
      if (s.baku_kurye_id && s.baku_kurye_id === seciliKuryeId) return true;

      // 2. Kurye atanmamış ama adreste kuryenin bölgesi geçiyor mu? (Otomatik akıllı öneri)
      const adresVeSehir = `${s.teslimat_sehri || ''} ${s.teslimat_adresi || ''}`.toLowerCase();
      if (seciliKuryeId === 'kurye-elvin') {
        if (
          adresVeSehir.includes('nərimanov') ||
          adresVeSehir.includes('gənclik') ||
          adresVeSehir.includes('təbriz')
        )
          return true;
      } else if (seciliKuryeId === 'kurye-resad') {
        if (
          adresVeSehir.includes('yasamal') ||
          adresVeSehir.includes('elmlər') ||
          adresVeSehir.includes('28 may') ||
          adresVeSehir.includes('içərişəhər')
        )
          return true;
      } else if (seciliKuryeId === 'kurye-vuqar') {
        if (
          adresVeSehir.includes('gəncə') ||
          adresVeSehir.includes('sumqayıt') ||
          adresVeSehir.includes('rayon')
        )
          return true;
      } else if (seciliKuryeId === 'ofis-tehvil') {
        if (
          s.ozel_not?.toLowerCase().includes('sürücü') ||
          s.ozel_not?.toLowerCase().includes('özü') ||
          s.ham_mesaj.toLowerCase().includes('özü')
        )
          return true;
      }

      return false;
    });
  }, [siparisler, seciliKuryeId]);

  // Filtreleme
  const filtrelenmisSiparisler = useMemo(() => {
    return kuryeSiparisleri.filter((s) => {
      const arama = aramaMetni.toLowerCase().trim();
      const aramaUygun =
        !arama ||
        s.musteri_adi.toLowerCase().includes(arama) ||
        (s.telefon_numarasi && s.telefon_numarasi.includes(arama)) ||
        (s.teslimat_adresi && s.teslimat_adresi.toLowerCase().includes(arama)) ||
        s.urun_aciklamasi.toLowerCase().includes(arama);

      if (!aramaUygun) return false;

      if (durumFiltresi === 'TESLIM_BEKLEYEN') {
        return s.lojistik_durumu !== 'TESLIM_EDILDI';
      }
      if (durumFiltresi === 'TESLIM_EDILDI') {
        return s.lojistik_durumu === 'TESLIM_EDILDI';
      }
      return true;
    });
  }, [kuryeSiparisleri, aramaMetni, durumFiltresi]);

  // Hızlı Aksiyon: Teslim Ettim & Borcu Tahsil Ettim
  const handleTeslimEtVeTahsilEt = (siparis: Siparis, borcAlindi: boolean) => {
    const yeniSiparis: Siparis = {
      ...siparis,
      lojistik_durumu: 'TESLIM_EDILDI',
      teslim_tarihi: new Date().toISOString(),
      teslim_eden_kisi: aktifKurye.ad_soyad,
      finans_durumu: borcAlindi || siparis.kalan_tutar <= 0 ? 'ODENDI' : siparis.finans_durumu,
      alinan_tutar: borcAlindi ? siparis.toplam_tutar : siparis.alinan_tutar,
      kalan_tutar: borcAlindi ? 0 : siparis.kalan_tutar,
      baku_tahsilat_notu: borcAlindi
        ? `${siparis.baku_tahsilat_notu || ''} [Kurye ${aktifKurye.ad_soyad} tarafından teslim edildi ve ${siparis.kalan_tutar} AZN tahsil edildi]`.trim()
        : `${siparis.baku_tahsilat_notu || ''} [Kurye ${aktifKurye.ad_soyad} tarafından teslim edildi]`.trim(),
    };

    onSiparisGuncelle(yeniSiparis);
    setIslemBildirimi(`✅ ${siparis.musteri_adi} paketi teslim edildi olarak işaretlendi!`);
    setTimeout(() => setIslemBildirimi(null), 4000);
  };

  // İstatistikler
  const bekleyenSayisi = kuryeSiparisleri.filter(
    (s) => s.lojistik_durumu !== 'TESLIM_EDILDI'
  ).length;
  const teslimEdilenSayisi = kuryeSiparisleri.filter(
    (s) => s.lojistik_durumu === 'TESLIM_EDILDI'
  ).length;
  const toplanacakToplamBorc = kuryeSiparisleri
    .filter((s) => s.lojistik_durumu !== 'TESLIM_EDILDI')
    .reduce((acc, s) => acc + (s.kalan_tutar || 0), 0);

  return (
    <div className="space-y-6">
      {/* Kurye Başlık ve Bölge Seçimi */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold shadow-xs">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">{aktifKurye.ad_soyad}</h2>
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px] border border-purple-200">
                Saha Kuryesi
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>
                📍 Bölge: <strong>{aktifKurye.bolge}</strong>
              </span>
              <span>• 📞 {aktifKurye.telefon}</span>
            </p>
          </div>
        </div>

        {/* Sağ Taraf: Aktif Butik Rozeti ve Kurye / Bölge Seçimi */}
        <div className="flex flex-wrap items-center gap-2.5">
          {seciliFirmaAd && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold">
              <Store className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Butik: <strong>{seciliFirmaAd}</strong>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 hidden sm:inline">
              Kurye / Bölge:
            </span>
            <select
              value={seciliKuryeId}
              onChange={(e) => onKuryeDegistir(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-purple-500 focus:bg-white cursor-pointer"
            >
              {BAKU_KURYELER.map((k) => {
                const kuryeBekleyenPaketSayisi = siparisler.filter((s) => {
                  if (seciliFirmaId && seciliFirmaId !== 'all') {
                    if (s.tenant_id !== seciliFirmaId) return false;
                  }
                  if (s.lojistik_durumu === 'TESLIM_EDILDI') return false;
                  if (s.baku_kurye_id === k.id) return true;
                  const adres =
                    `${s.teslimat_sehri || ''} ${s.teslimat_adresi || ''}`.toLowerCase();
                  if (
                    k.id === 'kurye-elvin' &&
                    (adres.includes('nərimanov') ||
                      adres.includes('gənclik') ||
                      adres.includes('təbriz'))
                  )
                    return true;
                  if (
                    k.id === 'kurye-resad' &&
                    (adres.includes('yasamal') ||
                      adres.includes('elmlər') ||
                      adres.includes('28 may') ||
                      adres.includes('içərişəhər'))
                  )
                    return true;
                  if (
                    k.id === 'kurye-vuqar' &&
                    (adres.includes('gəncə') ||
                      adres.includes('sumqayıt') ||
                      adres.includes('rayon'))
                  )
                    return true;
                  if (
                    k.id === 'ofis-tehvil' &&
                    (s.ozel_not?.toLowerCase().includes('sürücü') ||
                      s.ozel_not?.toLowerCase().includes('özü') ||
                      s.ham_mesaj?.toLowerCase().includes('özü'))
                  )
                    return true;
                  return false;
                }).length;

                return (
                  <option key={k.id} value={k.id}>
                    {k.ad_soyad} ({k.bolge}) — {kuryeBekleyenPaketSayisi} Paket
                  </option>
                );
              })}
            </select>
            {onSiparisleriYukle && (
              <button
                type="button"
                onClick={handleYenile}
                disabled={yenileniyor}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                title="Kurye bağlamalarını verilənlər bazasından yenilə"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${yenileniyor ? 'animate-spin text-purple-600' : 'text-slate-600'}`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* İstatistik Metrikleri */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-center">
          <div className="text-[11px] font-bold text-slate-400 uppercase">Dağıtılacak Paket</div>
          <div className="text-2xl font-black text-purple-700 mt-1">{bekleyenSayisi} Adet</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Teslimat Bekliyor</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-2xs text-center">
          <div className="text-[11px] font-bold text-amber-700 uppercase">Toplanacak Para</div>
          <div className="text-2xl font-black text-amber-800 mt-1">
            {toplanacakToplamBorc.toFixed(0)} AZN
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">Tahsilat Sorumluluğu</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-2xs text-center">
          <div className="text-[11px] font-bold text-emerald-700 uppercase">
            Tamamlanan Teslimat
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{teslimEdilenSayisi} Adet</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Başarıyla Verildi</div>
        </div>
      </div>

      {/* İşlem Başarı Bildirimi */}
      {islemBildirimi && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <span>{islemBildirimi}</span>
          <button
            onClick={() => setIslemBildirimi(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Arama ve Filtreleme */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={aramaMetni}
            onChange={(e) => setAramaMetni(e.target.value)}
            placeholder="Müşteri adı, adres, telefon veya ürün ara..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-purple-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
          {[
            { key: 'TESLIM_BEKLEYEN', label: '⏳ Dağıtım Bekleyen' },
            { key: 'TESLIM_EDILDI', label: '✅ Teslim Edilenler' },
            { key: 'HEPSI', label: 'Tümü' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setDurumFiltresi(f.key as any)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                durumFiltresi === f.key
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kurye Teslimat Kartları Listesi (Mobil Uygun) */}
      <div className="space-y-3">
        {filtrelenmisSiparisler.length === 0 ? (
          <div className="bg-white p-10 text-center rounded-2xl border border-dashed border-slate-200 text-slate-500 space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 mx-auto flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div className="font-bold text-slate-800 text-sm">
              {seciliFirmaAd && seciliFirmaId !== 'all'
                ? `"${seciliFirmaAd}" Butiki Üzrə Çatdırılma Paketi Yoxdur`
                : `${aktifKurye.ad_soyad} üçün bu filtrdə çatdırılma paketi tapılmadı`}
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {seciliFirmaId && seciliFirmaId !== 'all'
                ? `Hazırda "${seciliFirmaAd || seciliFirmaId}" butiki üçün ${aktifKurye.ad_soyad} kuryesinə təyin olunmuş bağlama yoxdur. Kanada satınalması edilib Bakı anbarına daxil olduqda və ya kuryeyə verildikdə avtomatik burada əks olunacaq.`
                : `${aktifKurye.ad_soyad} (${aktifKurye.bolge}) kuryesi üzrə seçilmiş filtrə uyğun heç bir bağlama tapılmadı.`}
            </p>
            {seciliFirmaId && seciliFirmaId !== 'all' && onFirmaSec && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onFirmaSec('all')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5 text-slate-500" />
                  Bütün Butiklərin Kurye Paketlərini Göstər
                </button>
              </div>
            )}
          </div>
        ) : (
          filtrelenmisSiparisler.map((sip) => {
            const teslimEdildi = sip.lojistik_durumu === 'TESLIM_EDILDI';

            return (
              <div
                key={sip.id}
                className={`bg-white rounded-2xl border transition-all p-4 space-y-3 shadow-xs ${
                  teslimEdildi
                    ? 'border-emerald-200 bg-emerald-50/20 opacity-80'
                    : 'border-slate-200 hover:border-purple-300'
                }`}
              >
                {/* Üst Satır: Müşteri Adı, Telefon, Durum */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                        teslimEdildi
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {teslimEdildi ? '✓' : '📦'}
                    </div>
                    <div>
                      <div className="font-black text-sm text-slate-900 flex items-center gap-2">
                        <span>{sip.musteri_adi}</span>
                        {sip.instagram_kullanici_adi && (
                          <span className="text-[11px] text-purple-600 font-semibold">
                            {sip.instagram_kullanici_adi}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span className="font-semibold text-slate-700">
                          {sip.telefon_numarasi || 'Telefon yok'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Durum Rozeti */}
                  <div>
                    {teslimEdildi ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Teslim Edildi
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Dağıtımda
                      </span>
                    )}
                  </div>
                </div>

                {/* Orta Satır: Adres ve Ürün */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Adres */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-rose-500" />
                      <span>Teslimat Adresi & Şehir</span>
                    </div>
                    <div className="font-bold text-slate-800">
                      {sip.teslimat_sehri || 'Bakü'}, {sip.teslimat_adresi || 'Adres belirtilmemiş'}
                    </div>
                    {sip.ozel_not && (
                      <div className="text-[11px] text-amber-800 font-bold bg-amber-50 p-1.5 rounded border border-amber-200 mt-1">
                        ⚠️ Not: {sip.ozel_not}
                      </div>
                    )}
                  </div>

                  {/* Ürün & Tutar */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Package className="w-3 h-3 text-purple-500" />
                      <span>Ürün Bilgisi</span>
                    </div>
                    <div className="font-bold text-slate-800 truncate">
                      {sip.urun_aciklamasi} ({sip.adet} Adet{' '}
                      {sip.beden_veya_olcu ? `• ${sip.beden_veya_olcu}` : ''})
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500">Toplam: {sip.toplam_tutar} AZN</span>
                      <div>
                        {sip.kalan_tutar > 0 ? (
                          <span className="font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Tahsil Edilecek: {sip.kalan_tutar} AZN
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Tam Ödenmiş
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alt Satır: Hızlı Kurye Aksiyon Butonları */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Telefon Arama */}
                    {sip.telefon_numarasi && (
                      <a
                        href={`tel:${sip.telefon_numarasi.replace(/\s+/g, '')}`}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>Ara</span>
                      </a>
                    )}

                    {/* WhatsApp */}
                    {sip.telefon_numarasi && (
                      <a
                        href={`https://wa.me/${sip.telefon_numarasi.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1 border border-emerald-200"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>WhatsApp</span>
                      </a>
                    )}

                    {onSiparisDetayAc && (
                      <button
                        type="button"
                        onClick={() => onSiparisDetayAc(sip)}
                        className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Detay Gör
                      </button>
                    )}
                  </div>

                  {/* Teslimat Tamamlama Butonları */}
                  {!teslimEdildi ? (
                    <div className="flex items-center gap-2">
                      {sip.kalan_tutar > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleTeslimEtVeTahsilEt(sip, true)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Təhvil Verdim + {sip.kalan_tutar} AZN Aldım</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleTeslimEtVeTahsilEt(sip, false)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Müştəriyə Təhvil Verildi</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      {sip.teslim_tarihi &&
                        `Teslim zamanı: ${new Date(sip.teslim_tarihi).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
