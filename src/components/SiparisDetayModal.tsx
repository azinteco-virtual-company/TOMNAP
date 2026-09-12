import React, { useState } from 'react';
import { Siparis } from '../types';
import { UrunGorselleriGalerisi } from './UrunGorselleriGalerisi';
import { BAKU_KURYELER } from '../data/kuryeler';
import { 
  X, 
  Sparkles, 
  MessageSquare, 
  Send, 
  Phone, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check,
  Truck,
  DollarSign,
  User,
  Package,
  Images,
  Camera,
  Receipt,
  Store,
  Upload,
  RefreshCw
} from 'lucide-react';
import { useDil } from '../context/DilKonteksti';
import { uretKanadaTakipKodu, uretUluslararasiKargoKodu } from '../utils/pdfHelpers';

interface SiparisDetayModalProps {
  siparis: Siparis | null;
  onKapat: () => void;
  onGuncelle: (id: string, guncellemeler: Partial<Siparis>) => void;
  onWhatsAppAc?: (siparis: Siparis) => void;
}

export const SiparisDetayModal: React.FC<SiparisDetayModalProps> = ({
  siparis,
  onKapat,
  onGuncelle,
  onWhatsAppAc,
}) => {
  const { t } = useDil();
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [kanadaTakip, setKanadaTakip] = useState(siparis?.kanada_takip_kodu || '');
  const [kargoKodu, setKargoKodu] = useState(siparis?.uluslararasi_kargo_kodu || '');
  const [tahsilatNotu, setTahsilatNotu] = useState(siparis?.baku_tahsilat_notu || '');
  const [ozelNot, setOzelNot] = useState(siparis?.ozel_not || '');

  // Yeni Lojistik ve Satınalma Alanları
  const [magazaAdi, setMagazaAdi] = useState(siparis?.kanada_magaza_adi || '');
  const [alisFiyatiCad, setAlisFiyatiCad] = useState(siparis?.kanada_alis_fiyati_cad?.toString() || '');
  const [faturaGorseli, setFaturaGorseli] = useState(siparis?.kanada_fatura_gorseli || '');
  const [bakuKuryeId, setBakuKuryeId] = useState(siparis?.baku_kurye_id || '');
  const [finKodu, setFinKodu] = useState(siparis?.gumruk_fin_kodu || '');
  const [pasaportNo, setPasaportNo] = useState(siparis?.gumruk_pasaport_no || '');

  React.useEffect(() => {
    if (siparis) {
      setKanadaTakip(siparis.kanada_takip_kodu || '');
      setKargoKodu(siparis.uluslararasi_kargo_kodu || '');
      setTahsilatNotu(siparis.baku_tahsilat_notu || '');
      setOzelNot(siparis.ozel_not || '');
      setMagazaAdi(siparis.kanada_magaza_adi || '');
      setAlisFiyatiCad(siparis.kanada_alis_fiyati_cad?.toString() || '');
      setFaturaGorseli(siparis.kanada_fatura_gorseli || '');
      setBakuKuryeId(siparis.baku_kurye_id || '');
      setFinKodu(siparis.gumruk_fin_kodu || '');
      setPasaportNo(siparis.gumruk_pasaport_no || '');
    }
  }, [siparis]);

  if (!siparis) return null;

  // Eksik bilgi varsa müşteriye yazılacak hazır WhatsApp şablonu
  const whatsappEksikBilgiMesaji = `Salam hörmətli ${siparis.musteri_adi}, sifarişiniz (${siparis.urun_aciklamasi}) qeydə alındı. Lakin çatdırılmanı tamamlamaq üçün aşağıdakı məlumatlar lazımdır: ${
    siparis.eksik_bilgiler?.length > 0 ? siparis.eksik_bilgiler.join(', ') : 'ünvan və əlaqə nömrəsi'
  }. Zəhmət olmasa qeyd edərdiniz.`;

  // Bakü teslimat bildirimi şablonu
  const whatsappTeslimatMesaji = `Salam hörmətli ${siparis.musteri_adi}, Kanadadan sifariş etdiyiniz "${siparis.urun_aciklamasi}" artıq Bakıdadır! Dostumuz vasitəsilə təhvil ala bilərsiniz. Qalan borcunuz: ${siparis.kalan_tutar} ${siparis.para_birimi}. Əlaqə üçün yazın.`;

  const kopyalaMetin = (metin: string) => {
    navigator.clipboard.writeText(metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  };

  const handleFaturaYukle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFaturaGorseli(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const kaydetDetaylar = () => {
    const seciliKurye = BAKU_KURYELER.find(k => k.id === bakuKuryeId);

    onGuncelle(siparis.id, {
      kanada_takip_kodu: kanadaTakip,
      uluslararasi_kargo_kodu: kargoKodu,
      baku_tahsilat_notu: tahsilatNotu,
      ozel_not: ozelNot,
      kanada_magaza_adi: magazaAdi,
      kanada_alis_fiyati_cad: alisFiyatiCad ? parseFloat(alisFiyatiCad) : undefined,
      kanada_fatura_gorseli: faturaGorseli,
      baku_kurye_id: bakuKuryeId || undefined,
      baku_kurye_adi: seciliKurye ? seciliKurye.ad_soyad : undefined,
      gumruk_fin_kodu: finKodu,
      gumruk_pasaport_no: pasaportNo
    });
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Başlığı */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              ID
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Sipariş Detayı: {siparis.musteri_adi}
              </h3>
              <p className="text-xs text-slate-500">
                Oluşturulma: {new Date(siparis.olusturma_tarihi).toLocaleString('tr-TR')} • Kanal: {siparis.siparis_kaynagi}
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Gövdesi */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 1. Müşterinin Orijinal Dağınık Mesajı */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                Müşterinin Gönderdiği Orijinal Ham Mesaj
              </span>
              <span className="text-[11px] text-slate-400">Gemini Girişi</span>
            </div>
            <p className="text-sm text-slate-800 italic bg-white p-3 rounded-lg border border-slate-200">
              "{siparis.ham_mesaj}"
            </p>
          </div>

          {/* Ayrıştırılan Ürün Fotoğrafları ve Orijinal Ekran Görüntüleri Galerisi */}
          <UrunGorselleriGalerisi siparis={siparis} onGuncelle={onGuncelle} />

          {/* 2. Finans ve Lojistik Durum Paneli */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Finans Durumu
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  siparis.finans_durumu === 'ODENDI'
                    ? 'bg-emerald-100 text-emerald-800'
                    : siparis.finans_durumu === 'KISMI_ODEME'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {siparis.finans_durumu}
                </span>
              </div>
              <div className="text-sm">
                Toplam Tutar: <strong>{siparis.toplam_tutar} {siparis.para_birimi}</strong>
              </div>
              <div className="text-sm text-emerald-700">
                Tahsil Edilen (Bakü Akraba): <strong>{siparis.alinan_tutar} {siparis.para_birimi}</strong>
              </div>
              <div className="text-sm text-amber-700 font-semibold">
                Kalan Borç: <strong>{siparis.kalan_tutar} {siparis.para_birimi}</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-600" /> Lojistik Durumu
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                  {siparis.lojistik_durumu}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                <strong>Teslimat Şehri:</strong> {siparis.teslimat_sehri || 'Bakü'}
              </div>
              <div className="text-xs text-slate-600">
                <strong>Adres:</strong> {siparis.teslimat_adresi || 'Belirtilmedi'}
              </div>
              <div className="text-xs text-slate-600">
                <strong>İletişim:</strong> {siparis.telefon_numarasi || 'Telefon Eksik'}
              </div>
            </div>
          </div>

          {/* 3. Kanada Satınalma & Fatura / Fiş Yükleme Masası */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-rose-600" />
                🇨🇦 Kanada Satınalma Fişi / Faturası & Mağaza Detayı
              </span>
              <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                Kanada Operasyon
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Alınan Mağaza / AVM
                </label>
                <div className="relative">
                  <Store className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={magazaAdi}
                    onChange={(e) => setMagazaAdi(e.target.value)}
                    placeholder="Örn: Toronto Eaton Centre (Zara / Sephora)"
                    className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kanada Alış Tutarı (CAD $)
                </label>
                <div className="relative">
                  <span className="text-slate-400 text-xs font-bold absolute left-3 top-1/2 -translate-y-1/2">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={alisFiyatiCad}
                    onChange={(e) => setAlisFiyatiCad(e.target.value)}
                    placeholder="Örn: 89.99"
                    className="w-full text-xs pl-7 pr-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Fatura / Fiş Görseli */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fatura / Fiş Fotoğrafı veya Belgesi
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 hover:bg-rose-50 cursor-pointer shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-rose-600" />
                  <span>Fiş/Fatura Fotoğrafı Yükle</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFaturaYukle}
                    className="hidden"
                  />
                </label>
                {faturaGorseli ? (
                  <div className="flex items-center gap-2">
                    <img 
                      src={faturaGorseli} 
                      alt="Fatura" 
                      className="w-10 h-10 object-cover rounded-lg border border-slate-300 shadow-xs" 
                    />
                    <span className="text-[11px] text-emerald-700 font-semibold">✓ Fiş Yüklendi</span>
                    <button
                      type="button"
                      onClick={() => setFaturaGorseli('')}
                      className="text-[11px] text-rose-600 hover:underline ml-1"
                    >
                      Kaldır
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Fiş yüklenmedi</span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Bakü Bölgesel Kurye Ataması & Resmi Gümrük Alıcısı (FIN Kodu) */}
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-purple-600" />
                Bakü Bölgesel Kurye & Resmi Gümrük (FIN) Bilgileri
              </span>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                Lojistik Dağıtım
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Kurye Atama */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Atanan Bakü Kuryesi / Təhvilatçı
                </label>
                <select
                  value={bakuKuryeId}
                  onChange={(e) => setBakuKuryeId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-purple-300 rounded-lg bg-white font-medium text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="">-- Henüz Kurye Atanmadı --</option>
                  {BAKU_KURYELER.map(k => (
                    <option key={k.id} value={k.id}>
                      {k.ad_soyad} ({k.bolge})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  * Kurye sadece kendine atanan paketleri kendi teslimat ekranında görür.
                </p>
              </div>

              {/* Gümrük FIN Kodu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Müştəri FİN Kodu / Smart Customs (Gümrük Alıcısı)
                </label>
                <input
                  type="text"
                  value={finKodu}
                  onChange={(e) => setFinKodu(e.target.value.toUpperCase())}
                  placeholder="Örn: 7ABC123 (7 haneli FİN)"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white uppercase font-mono font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  * Kargo konşimentosunda resmi alıcı olarak beyan edilir.
                </p>
              </div>
            </div>
          </div>

          {/* 5. Operasyonel Kodlar ve Notlar */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Operasyonel Takip ve Tahsilat Notları
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    🇨🇦 Kanada Mağaza / Kargo Kodu
                  </label>
                  <button
                    type="button"
                    onClick={() => setKanadaTakip(uretKanadaTakipKodu(magazaAdi || siparis.urun_aciklamasi, 'TOR'))}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                    title="Yeni Kanada takip kodu yarat"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Avto Yarat</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={kanadaTakip}
                  onChange={(e) => setKanadaTakip(e.target.value)}
                  placeholder="Örn: TOR-ZARA-9821"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    ✈️ Uluslararası Hava Kargo Kodu
                  </label>
                  <button
                    type="button"
                    onClick={() => setKargoKodu(uretUluslararasiKargoKodu())}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                    title="Yeni beynəlxalq hava kargo kodu yarat"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Avto Yarat</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={kargoKodu}
                  onChange={(e) => setKargoKodu(e.target.value)}
                  placeholder="Örn: AZ-CARGO-7749-YYZ"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>

            {/* Özel Teslimat ve Müşteri Talimatı (ozel_not) */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1.5 shadow-2xs">
              <label className="block text-xs font-bold text-amber-950 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-600">📌</span>
                  <span>Müşteri Özel Teslimat & Sürücü / Operasyon Talimatı</span>
                </span>
                <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                  Kargo / Elden Talimatı
                </span>
              </label>
              <textarea
                rows={2}
                value={ozelNot}
                onChange={(e) => setOzelNot(e.target.value)}
                placeholder="Örn: Bakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək (Kargo olmasın, elden teslim)"
                className="w-full text-xs p-2.5 border border-amber-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-medium"
              />
              <p className="text-[10px] text-amber-800 italic">
                * Bu not kargo manifestosunda ve Bakü teslimat raporunda görünür, şoför/kurye ve Baküdeki arkadaş tarafından dikkate alınır.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bakü Akraba Tahsilat Notu
              </label>
              <textarea
                rows={2}
                value={tahsilatNotu}
                onChange={(e) => setTahsilatNotu(e.target.value)}
                placeholder="Örn: 20 manat Bakü akrabasına elden verildi, kalan maaşta ödenecek..."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Kaydedildi Başarı Bildirimi */}
          {kaydedildi && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Sipariş notları ve takip kodları başarıyla güncellendi!</span>
            </div>
          )}

          {/* 4. WhatsApp Hızlı İletişim Şablonları */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                Müşteriye Hazır WhatsApp Mesaj Şablonu
              </span>
              {kopyalandi && (
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Kopyalandı
                </span>
              )}
            </div>

            {siparis.eksik_bilgiler && siparis.eksik_bilgiler.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-emerald-800">
                  Yapay zeka bu siparişte <strong>{siparis.eksik_bilgiler.join(', ')}</strong> bilgilerinin eksik olduğunu tespit etti:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={whatsappEksikBilgiMesaji}
                    className="w-full text-xs p-2 bg-white border border-emerald-300 rounded-lg text-slate-700"
                  />
                  <button
                    onClick={() => kopyalaMetin(whatsappEksikBilgiMesaji)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shrink-0 cursor-pointer"
                  >
                    Kopyala
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-emerald-800">
                  Teslimat aşamasında Bakü dağıtım arkadaşı için müşteriye bildirim mesajı:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={whatsappTeslimatMesaji}
                    className="w-full text-xs p-2 bg-white border border-emerald-300 rounded-lg text-slate-700"
                  />
                  <button
                    onClick={() => kopyalaMetin(whatsappTeslimatMesaji)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shrink-0 cursor-pointer"
                  >
                    Kopyala
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Alt Butonları */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2.5">
          <div>
            {onWhatsAppAc && (
              <button
                type="button"
                onClick={() => onWhatsAppAc(siparis)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Bildirişi Aç</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onKapat}
              className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white transition-colors cursor-pointer"
            >
              {t.bagla}
            </button>
            <button
              onClick={kaydetDetaylar}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer"
            >
              {kaydedildi ? t.kopyalandi : t.yaddaSaxla}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
