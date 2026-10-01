import React, { useState, useMemo } from 'react';
import { Siparis } from '../types';
import {
  Building,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  Copy,
  Check,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  Filter,
  ArrowLeft,
  Calendar,
  RotateCcw,
  ExternalLink,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { loadSpreadsheet, loadPdf, reportDocumentError } from '../utils/documentLibraries';
import { safePrintHtml } from '../utils/pdfHelpers';
import { useAppStore } from '../store/appStore';
import { useBelgeCevirisi, useBelgeDili } from '../i18n/belge';
import { bugununTarihi } from '../belgeler/manifesto';
import {
  tahsilatExcelVerisi,
  tahsilatPdfDosyaAdi,
  tahsilatPdfOlustur,
  tahsilatRaporuMetni,
  tahsilatYazdirmaSablonu,
  type TahsilatBaglami,
} from '../belgeler/tahsilat';

interface BakuTahsilatSayfasiProps {
  siparisler: Siparis[];
  onDurumGuncelle: (id: string, guncellemeler: Partial<Siparis>) => void;
  onSiparislereDon?: () => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
}

export const BakuTahsilatSayfasi: React.FC<BakuTahsilatSayfasiProps> = ({
  siparisler,
  onDurumGuncelle,
  onSiparislereDon,
  onSiparisDetayAc,
}) => {
  const [filtre, setFiltre] = useState<'borclu' | 'odendi' | 'tumu'>('borclu');
  const [sehirFiltre, setSehirFiltre] = useState<string>('tumu');
  const [aramaMetni, setAramaMetni] = useState<string>('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const [yazdiriliyor, setYazdiriliyor] = useState(false);
  const [pdfHazirlaniyor, setPdfHazirlaniyor] = useState(false);
  const [excelHazirlaniyor, setExcelHazirlaniyor] = useState(false);
  const bt = useBelgeCevirisi();
  const belgeDili = useBelgeDili();
  const { firmalar, seciliFirmaId } = useAppStore();
  const butik = firmalar.find((f) => f.id === seciliFirmaId)?.ad || 'TOMNAP';

  // Şehirler listesi
  const sehirler = useMemo(() => {
    const set = new Set<string>();
    siparisler.forEach((s) => {
      const sehir = (s.teslimat_sehri || '').trim();
      if (sehir) set.add(sehir);
    });
    return Array.from(set).sort();
  }, [siparisler]);

  // Filtrelenmiş Liste
  const listelenenSiparisler = useMemo(() => {
    return siparisler.filter((s) => {
      // 1. Borç / Ödeme Durumu Filtresi
      if (filtre === 'borclu' && (s.kalan_tutar || 0) <= 0) return false;
      if (filtre === 'odendi' && (s.kalan_tutar || 0) > 0) return false;

      // 2. Şehir Filtresi
      if (sehirFiltre !== 'tumu') {
        const sipSehir = (s.teslimat_sehri || '').trim().toLowerCase();
        if (sipSehir !== sehirFiltre.toLowerCase()) return false;
      }

      // 3. Arama Metni
      if (aramaMetni.trim()) {
        const aranan = aramaMetni.toLowerCase();
        const metin = [
          s.musteri_adi,
          s.telefon_numarasi,
          s.teslimat_sehri,
          s.teslimat_adresi,
          s.urun_aciklamasi,
          s.ozel_not,
          s.baku_tahsilat_notu,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!metin.includes(aranan)) return false;
      }

      return true;
    });
  }, [siparisler, filtre, sehirFiltre, aramaMetni]);

  // Canlı Metrikler
  const toplamToplanacakBorc = useMemo(
    () => listelenenSiparisler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0),
    [listelenenSiparisler]
  );

  const toplamBorcluPaketSayisi = useMemo(
    () => siparisler.filter((s) => (s.kalan_tutar || 0) > 0).length,
    [siparisler]
  );

  const genelToplamBorc = useMemo(
    () => siparisler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0),
    [siparisler]
  );

  const toplamTahsilEdilen = useMemo(
    () => siparisler.reduce((acc, s) => acc + (s.alinan_tutar || 0), 0),
    [siparisler]
  );

  // Tek tıkla tam tahsilat kaydetme
  const handleTamaminiOde = (siparis: Siparis) => {
    const bugunStr = new Date().toLocaleDateString('az-AZ');
    onDurumGuncelle(siparis.id, {
      alinan_tutar: siparis.toplam_tutar,
      kalan_tutar: 0,
      finans_durumu: 'ODENDI',
      baku_tahsilat_notu:
        (siparis.baku_tahsilat_notu ? siparis.baku_tahsilat_notu + ' • ' : '') +
        `Bakıda tam ödənildi (${bugunStr})`,
    });
  };

  // Belgeler (docs/i18n.md): butikin belge dilində, arayüz dilindən asılı deyil.
  const baglam = (): TahsilatBaglami => ({ bt, butik, bugun: bugununTarihi() });

  const handleMetniKopyala = () => {
    navigator.clipboard.writeText(tahsilatRaporuMetni(listelenenSiparisler, baglam()));
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2500);
  };

  // Excel (.xlsx) İndirme
  const excelIndir = async () => {
    if (excelHazirlaniyor) return;
    setExcelHazirlaniyor(true);
    try {
      const XLSX = await loadSpreadsheet();
      const veri = tahsilatExcelVerisi(listelenenSiparisler, baglam());
      const ws = XLSX.utils.aoa_to_sheet([veri.baslik, ...veri.satirlar]);
      ws['!cols'] = [6, 22, 16, 14, 28, 30, 16, 14, 18, 20, 26, 26].map((wch) => ({ wch }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, veri.sayfa);
      XLSX.writeFile(wb, veri.dosya);
    } catch (e) {
      console.error('Excel endirmə xətası:', e);
      reportDocumentError(e);
    } finally {
      setExcelHazirlaniyor(false);
    }
  };

  // PDF İndirme (Unicode font: Azərbaycan hərfləri olduğu kimi qalır)
  const pdfIndir = async () => {
    if (pdfHazirlaniyor) return;
    setPdfHazirlaniyor(true);
    try {
      const araclar = await loadPdf();
      const doc = await tahsilatPdfOlustur(araclar, listelenenSiparisler, belgeDili, baglam());
      doc.save(tahsilatPdfDosyaAdi(bt));
    } catch (e) {
      console.error('PDF xətası:', e);
      reportDocumentError(e);
    } finally {
      setPdfHazirlaniyor(false);
    }
  };

  // Yazdırma (Print)
  const handleYazdir = () => {
    setYazdiriliyor(true);
    try {
      safePrintHtml(
        tahsilatYazdirmaSablonu(listelenenSiparisler, belgeDili, baglam()),
        'Baki_Tahsilat_Hesabati'
      );
    } catch (e) {
      console.error('Yazdırma xətası:', e);
      alert(
        'Yazdırma dialoqu açılarkən xəta baş verdi. Zəhmət olmasa PDF İndir seçimindən istifadə edin.'
      );
    } finally {
      setYazdiriliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık & Eylem Çubuğu */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-800 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-100 shrink-0">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-xl text-white tracking-tight">
                Bakı Təhsilat & Qalıq Borc Masası
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/30 text-amber-100 border border-amber-400/40">
                Kassa & Təhvilat Nəzarəti
              </span>
            </div>
            <p className="text-xs text-amber-100/90 mt-1">
              Bakıdakı nümayəndə / dost üçün nağd və ya m10 ilə toplanacaq kassa hesabatı və anlıq
              ödəniş qeydiyyatı
            </p>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onSiparislereDon && (
            <button
              type="button"
              onClick={onSiparislereDon}
              className="px-3.5 py-2 bg-black/20 hover:bg-black/30 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-white/20"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Siparişlərə Qayıt</span>
            </button>
          )}

          <button
            type="button"
            onClick={excelIndir}
            disabled={excelHazirlaniyor}
            title="Formatlanmış Excel (.xlsx) cədvəli kimi yüklə"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{excelHazirlaniyor ? 'Hazırlanır...' : 'Excel İndir (.xlsx)'}</span>
          </button>

          <button
            type="button"
            onClick={pdfIndir}
            disabled={pdfHazirlaniyor}
            title="Rəsmi PDF cədvəli kimi yüklə"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{pdfHazirlaniyor ? 'Hazırlanır...' : 'PDF İndir'}</span>
          </button>

          <button
            type="button"
            onClick={handleYazdir}
            disabled={yazdiriliyor}
            title="Yazdır və ya PDF kimi saxla"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{yazdiriliyor ? 'Çap açılır...' : 'Çap Et'}</span>
          </button>
        </div>
      </div>

      {/* 2. Dörtlü Finans Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-900">Toplanacaq Qalıq Borc</div>
            <div className="text-xl font-extrabold text-amber-800">
              {toplamToplanacakBorc.toFixed(2)}{' '}
              <span className="text-xs font-normal text-amber-950">AZN</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Öncədən Toplanan</div>
            <div className="text-xl font-extrabold text-slate-900">
              {toplamTahsilEdilen.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500">AZN</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Borclu Paket Sayı</div>
            <div className="text-xl font-extrabold text-slate-900">
              {toplamBorcluPaketSayisi}{' '}
              <span className="text-xs font-normal text-slate-500">bağlama</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Cəmi Borc Həcmi</div>
            <div className="text-xl font-extrabold text-slate-900">
              {genelToplamBorc.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500">AZN</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filtreleme ve Kontrol Çubuğu */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-700 mr-1 flex items-center gap-1">
              <Filter className="w-4 h-4 text-slate-500" />
              Status:
            </span>
            <button
              type="button"
              onClick={() => setFiltre('borclu')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                filtre === 'borclu'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              🔴 Yalnız Qalıq Borcu Olanlar ({toplamBorcluPaketSayisi})
            </button>
            <button
              type="button"
              onClick={() => setFiltre('odendi')}
              className={`px-3.5 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                filtre === 'odendi'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              ✓ Tam Ödənilənlər ({siparisler.length - toplamBorcluPaketSayisi})
            </button>
            <button
              type="button"
              onClick={() => setFiltre('tumu')}
              className={`px-3.5 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                filtre === 'tumu'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bütün Sifarişlər ({siparisler.length})
            </button>

            {/* Şehir Seçimi */}
            {sehirler.length > 0 && (
              <div className="flex items-center gap-1 ml-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sehirFiltre}
                  onChange={(e) => setSehirFiltre(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="tumu">Bütün Şəhərlər</option>
                  {sehirler.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMetniKopyala}
              className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="WhatsApp vasitəsilə Bakıdakı dostunuza/kuryerə göndərmək üçün kopyalayın"
            >
              {kopyalandi ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-800 font-bold">Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-700" />
                  <span>WhatsApp Təhsilat Mətni</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Canlı Arama ve Sıfırlama */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Müştəri adı, telefon, ünvan, məhsul..."
              value={aramaMetni}
              onChange={(e) => setAramaMetni(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 w-64 sm:w-80"
            />
            {aramaMetni && (
              <button
                onClick={() => setAramaMetni('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ×
              </button>
            )}
          </div>

          {(filtre !== 'borclu' || sehirFiltre !== 'tumu' || aramaMetni) && (
            <button
              type="button"
              onClick={() => {
                setFiltre('borclu');
                setSehirFiltre('tumu');
                setAramaMetni('');
              }}
              className="px-3 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Filtrləri Sıfırla</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Ana Təhsilat Cədvəli */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <span>Bakı Təhsilat Cədvəli</span>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                {listelenenSiparisler.length} Sifariş
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Müştərilərdən nağd və ya m10 / Card-to-Card ilə toplanacaq məbləğlər
            </p>
          </div>
          <div className="text-xs font-bold text-slate-700">
            Toplanacaq Cəmi:{' '}
            <span className="text-amber-700 text-sm font-extrabold">
              {toplamToplanacakBorc.toFixed(2)} AZN
            </span>
          </div>
        </div>

        {listelenenSiparisler.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-xs bg-slate-50/50">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
            <div className="font-bold text-slate-700 text-base">
              Əla! Bu filtrə uyğun borclu bağlama yoxdur.
            </div>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">
              Bütün ödənişlər alınıb və ya axtarış meyarlarına uyğun sifariş tapılmadı.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-xs">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[170px]">Müştəri & Əlaqə</th>
                  <th className="p-3 min-w-[160px]">Şəhər / Ünvan</th>
                  <th className="p-3 min-w-[200px]">Məhsul & Xüsusiyyət</th>
                  <th className="p-3 text-right min-w-[100px]">Məbləğ</th>
                  <th className="p-3 text-right min-w-[100px]">Ödənilib</th>
                  <th className="p-3 text-right min-w-[130px]">Qalıq Borc</th>
                  <th className="p-3 min-w-[180px]">Təhvilat Notu / Qeyd</th>
                  <th className="p-3 text-center min-w-[140px]">Təhsilat Əməliyyatı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listelenenSiparisler.map((s, index) => {
                  const borclu = (s.kalan_tutar || 0) > 0;
                  return (
                    <tr key={s.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-[11px] text-center font-bold">
                        {index + 1}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{s.musteri_adi || 'Adsız Müştəri'}</span>
                        </div>
                        <div className="text-xs text-slate-600 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{s.telefon_numarasi || 'Nömrə yoxdur'}</span>
                        </div>
                        {s.instagram_kullanici_adi && (
                          <div className="text-[10px] text-pink-600 font-medium mt-0.5">
                            @{s.instagram_kullanici_adi.replace('@', '')}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{s.teslimat_sehri || 'Bakı'}</span>
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-2 max-w-[180px] mt-0.5">
                          {s.teslimat_adresi || 'Bakı daxili'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900 text-xs sm:text-sm">
                          {s.urun_aciklamasi}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}{' '}
                          {s.adet && s.adet > 1 ? `(${s.adet} əd)` : ''}
                        </div>
                        <div className="text-[10px] text-blue-700 font-medium mt-1">
                          Status: {s.lojistik_durumu.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {(s.toplam_tutar || 0).toFixed(2)} {s.para_birimi || 'AZN'}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="text-emerald-700 font-semibold text-xs sm:text-sm">
                          {(s.alinan_tutar || 0).toFixed(2)} {s.para_birimi || 'AZN'}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {borclu ? (
                          <div className="bg-amber-100 text-amber-950 border border-amber-400 rounded-xl px-3 py-1.5 inline-block text-right shadow-2xs">
                            <div className="font-black text-amber-900 text-sm">
                              {s.kalan_tutar.toFixed(2)} {s.para_birimi || 'AZN'}
                            </div>
                            <div className="text-[9px] font-bold text-amber-800 uppercase tracking-tight">
                              ALINACAQ BORC
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block text-xs">
                            ✓ Tam Ödənilib
                          </span>
                        )}
                      </td>
                      <td className="p-3 space-y-1">
                        {s.baku_tahsilat_notu ? (
                          <div className="text-xs text-amber-950 bg-amber-50 p-2 rounded-xl border border-amber-300 font-medium">
                            <span className="font-bold text-amber-800">💬 Bakı Notu: </span>
                            {s.baku_tahsilat_notu}
                          </div>
                        ) : null}
                        {s.ozel_not ? (
                          <div className="text-[11px] text-slate-600 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                            <span className="font-bold text-slate-700">📌 Qeyd: </span>
                            {s.ozel_not}
                          </div>
                        ) : null}
                        {!s.baku_tahsilat_notu && !s.ozel_not && (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {borclu ? (
                          <button
                            type="button"
                            onClick={() => handleTamaminiOde(s)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer inline-flex items-center gap-1.5"
                            title="Müştəri Bakıda borcunu tam nağd və ya m10 ilə ödədi kimi qeyd et"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Ödənildi İşarələ</span>
                          </button>
                        ) : (
                          <div className="text-emerald-700 font-semibold text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Tamamlandı</span>
                          </div>
                        )}
                        {onSiparisDetayAc && (
                          <button
                            type="button"
                            onClick={() => onSiparisDetayAc(s)}
                            className="block mx-auto mt-1.5 text-[11px] text-slate-500 hover:text-blue-600 underline cursor-pointer"
                          >
                            Detallara Bax
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cədvəl Alt Yekunu */}
        <div className="p-4 bg-amber-50/70 border-t border-amber-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="text-slate-700">
            Bakıdakı nümayəndə bu cədvələ baxaraq məhsulu müştəriyə təhvil verdiyi an{' '}
            <strong>"Ödənildi İşarələ"</strong> düyməsinə basaraq kassa borcunu bağlaya bilər.
          </div>
          <div className="flex flex-wrap items-center gap-3 font-bold text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-amber-300 shadow-2xs">
            <span>
              Göstərilən: <strong className="text-slate-900">{listelenenSiparisler.length}</strong>
            </span>
            <span>
              Cəmi Məbləğ:{' '}
              <strong className="text-slate-900">
                {listelenenSiparisler.reduce((a, b) => a + (b.toplam_tutar || 0), 0).toFixed(2)} AZN
              </strong>
            </span>
            <span className="text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 text-sm">
              Toplanacaq Cəmi Borc: {toplamToplanacakBorc.toFixed(2)} AZN
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
