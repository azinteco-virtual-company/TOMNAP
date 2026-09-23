import React, { lazy, Suspense, useState, useMemo } from 'react';
import { Siparis } from '../types';
import {
  FileText,
  Printer,
  Plane,
  Package,
  Copy,
  Check,
  Calendar,
  Search,
  Filter,
  DollarSign,
  FileSpreadsheet,
  Layers,
  MapPin,
  RotateCcw,
  ArrowLeft,
  ExternalLink,
  Tag,
  Truck,
  ShieldCheck,
  RefreshCw,
  Upload,
  SlidersHorizontal,
  Activity,
  CheckCircle2,
  X,
} from 'lucide-react';
import { loadSpreadsheet, loadPdf, reportDocumentError } from '../utils/documentLibraries';
import { useDil } from '../context/DilKonteksti';
import { cleanPdfText, safePrintHtml } from '../utils/pdfHelpers';
import { useAppStore } from '../store/appStore';
import { fetchWithRetry } from '../lib/apiClient';
import { KargoEntegrasyonModal } from './KargoEntegrasyonModal';
import { V2_FLOW_ENABLED } from '../lib/featureFlags';

// v2 review screen: a separate chunk, loaded only when VITE_FF_V2_FLOW is on.
const ManifestEslestirmePaneli = lazy(() => import('./kargo-v2/ManifestEslestirmePaneli'));

interface KargoManifestoSayfasiProps {
  siparisler: Siparis[];
  onSiparislereDon?: () => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
}

type LojistikFiltreTipi =
  | 'kargo_ve_depo'
  | 'KANADA_DEPO'
  | 'ULUSLARARASI_KARGO'
  | 'BAKU_DAGITIM_ARKADAS'
  | 'TESLIM_EDILDI'
  | 'tumu';

type FinansFiltreTipi = 'tumu' | 'borclu' | 'odendi';

export const KargoManifestoSayfasi: React.FC<KargoManifestoSayfasiProps> = ({
  siparisler,
  onSiparislereDon,
  onSiparisDetayAc,
}) => {
  const { t } = useDil();
  // Filtre durumları
  const [lojistikFiltre, setLojistikFiltre] = useState<LojistikFiltreTipi>('kargo_ve_depo');
  const [finansFiltre, setFinansFiltre] = useState<FinansFiltreTipi>('tumu');
  const [sehirFiltre, setSehirFiltre] = useState<string>('tumu');
  const [aramaMetni, setAramaMetni] = useState<string>('');

  // Tarih aralığı filtreleri
  const [baslangicTarih, setBaslangicTarih] = useState<string>('');
  const [bitisTarih, setBitisTarih] = useState<string>('');
  const [tarihPreset, setTarihPreset] = useState<'hepsi' | 'bugun' | 'son7gun' | 'buay' | 'ozel'>(
    'hepsi'
  );

  const [kopyalandi, setKopyalandi] = useState(false);
  const [yazdiriliyor, setYazdiriliyor] = useState(false);
  const [pdfHazirlaniyor, setPdfHazirlaniyor] = useState(false);
  const [excelHazirlaniyor, setExcelHazirlaniyor] = useState(false);

  // Kargo & Aramex Entegrasyon Durumları
  const { seciliFirmaId, siparisleriYukle } = useAppStore();
  const [v2Manifest, setV2Manifest] = useState<{ base64: string; ad: string } | null>(null);
  const [kargoModalAcik, setKargoModalAcik] = useState(false);
  const [kargoSenkronizeEdiliyor, setKargoSenkronizeEdiliyor] = useState(false);
  const [dispatchYukleniyor, setDispatchYukleniyor] = useState(false);
  const [kargoBildirimi, setKargoBildirimi] = useState<{
    tip: 'basari' | 'hata';
    mesaj: string;
  } | null>(null);
  const dispatchInputRef = React.useRef<HTMLInputElement>(null);

  // Aramex / Kargo Canlı Senkronizasyon Tetikleyicisi
  const handleAramexSenkronizeEt = async () => {
    setKargoSenkronizeEdiliyor(true);
    setKargoBildirimi(null);
    try {
      const res = await fetchWithRetry('/api/kargo/senkronize-et', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: seciliFirmaId || 'all' }),
      });
      const data = await res.json();
      if (data.basarili) {
        await siparisleriYukle();
        setKargoBildirimi({
          tip: 'basari',
          mesaj: data.mesaj || 'Kargo statusları uğurla yeniləndi!',
        });
        setTimeout(() => setKargoBildirimi(null), 6000);
      } else {
        setKargoBildirimi({ tip: 'hata', mesaj: data.hata || 'Sinxronizasiya xətası baş verdi.' });
      }
    } catch (err: any) {
      setKargoBildirimi({ tip: 'hata', mesaj: `Server xətası: ${err.message}` });
    } finally {
      setKargoSenkronizeEdiliyor(false);
    }
  };

  // Aramex Daily Dispatch / Excel Yükleme İşleyicisi
  const handleDispatchDosyaSecildi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDispatchYukleniyor(true);
    setKargoBildirimi(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string) || '';
        if (V2_FLOW_ENABLED) {
          // v2: nothing is written on upload; the user reviews and confirms suggestions.
          setV2Manifest({ base64, ad: file.name });
          return;
        }
        const res = await fetchWithRetry('/api/kargo/manifesto-yukle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dosya_base64: base64,
            dosya_adi: file.name,
            tenantId: seciliFirmaId,
            otomatik_esle: true,
          }),
        });
        const data = await res.json();
        if (data.basarili) {
          await siparisleriYukle();
          setKargoBildirimi({
            tip: 'basari',
            mesaj: data.mesaj || 'Excel faylı uğurla oxundu və sifarişlərə bağlandı!',
          });
          setTimeout(() => setKargoBildirimi(null), 7000);
        } else {
          setKargoBildirimi({
            tip: 'hata',
            mesaj:
              data.hata || (data.hatalar && data.hatalar[0]) || 'Fayl oxunarkən xəta baş verdi.',
          });
        }
      } catch (err: any) {
        setKargoBildirimi({ tip: 'hata', mesaj: `Yükləmə xətası: ${err.message}` });
      } finally {
        setDispatchYukleniyor(false);
        if (dispatchInputRef.current) dispatchInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Benzersiz şehir listesi
  const sehirler = useMemo(() => {
    const set = new Set<string>();
    siparisler.forEach((s) => {
      const sehir = (s.teslimat_sehri || '').trim();
      if (sehir) set.add(sehir);
    });
    return Array.from(set).sort();
  }, [siparisler]);

  // Hızlı Tarih Seçimi
  const handleTarihPresetSec = (preset: 'hepsi' | 'bugun' | 'son7gun' | 'buay') => {
    setTarihPreset(preset);
    const simdi = new Date();
    const bugunStr = simdi.toISOString().slice(0, 10);

    if (preset === 'hepsi') {
      setBaslangicTarih('');
      setBitisTarih('');
    } else if (preset === 'bugun') {
      setBaslangicTarih(bugunStr);
      setBitisTarih(bugunStr);
    } else if (preset === 'son7gun') {
      const once7 = new Date();
      once7.setDate(simdi.getDate() - 7);
      setBaslangicTarih(once7.toISOString().slice(0, 10));
      setBitisTarih(bugunStr);
    } else if (preset === 'buay') {
      const ayBasi = new Date(simdi.getFullYear(), simdi.getMonth(), 1);
      setBaslangicTarih(ayBasi.toISOString().slice(0, 10));
      setBitisTarih(bugunStr);
    }
  };

  const handleManuelTarihDegisimi = (tip: 'baslangic' | 'bitis', deger: string) => {
    setTarihPreset('ozel');
    if (tip === 'baslangic') setBaslangicTarih(deger);
    else setBitisTarih(deger);
  };

  const filtreleriSifirla = () => {
    setLojistikFiltre('kargo_ve_depo');
    setFinansFiltre('tumu');
    setSehirFiltre('tumu');
    setAramaMetni('');
    setBaslangicTarih('');
    setBitisTarih('');
    setTarihPreset('hepsi');
  };

  // Filtrelenmiş Siparişler
  const dahilSiparisler = useMemo(() => {
    return siparisler.filter((s) => {
      // 1. Lojistik Durumu Filtresi
      if (lojistikFiltre === 'kargo_ve_depo') {
        const uygundur =
          s.lojistik_durumu === 'KANADA_DEPO' ||
          s.lojistik_durumu === 'ULUSLARARASI_KARGO' ||
          s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS';
        if (!uygundur) return false;
      } else if (lojistikFiltre !== 'tumu') {
        if (s.lojistik_durumu !== lojistikFiltre) return false;
      }

      // 2. Finans Filtresi (Yalnız Borçlu Olanlar)
      if (finansFiltre === 'borclu' && (s.kalan_tutar || 0) <= 0) {
        return false;
      } else if (finansFiltre === 'odendi' && (s.kalan_tutar || 0) > 0) {
        return false;
      }

      // 3. Şehir Filtresi
      if (sehirFiltre !== 'tumu') {
        const siparisSehri = (s.teslimat_sehri || '').trim().toLowerCase();
        if (siparisSehri !== sehirFiltre.toLowerCase()) return false;
      }

      // 4. Tarih Aralığı Filtresi (Sipariş Oluşturulma Tarihine göre)
      if (baslangicTarih || bitisTarih) {
        const siparisTarihStr = (s.olusturma_tarihi || '').slice(0, 10);
        if (siparisTarihStr) {
          if (baslangicTarih && siparisTarihStr < baslangicTarih) return false;
          if (bitisTarih && siparisTarihStr > bitisTarih) return false;
        }
      }

      // 5. Metin Araması
      if (aramaMetni.trim()) {
        const aranan = aramaMetni.toLowerCase();
        const metinler = [
          s.musteri_adi,
          s.telefon_numarasi,
          s.urun_aciklamasi,
          s.kanada_takip_kodu,
          s.uluslararasi_kargo_kodu,
          s.teslimat_sehri,
          s.teslimat_adresi,
          s.ozel_not,
          s.baku_tahsilat_notu,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!metinler.includes(aranan)) return false;
      }

      return true;
    });
  }, [
    siparisler,
    lojistikFiltre,
    finansFiltre,
    sehirFiltre,
    baslangicTarih,
    bitisTarih,
    aramaMetni,
  ]);

  // Canlı İstatistikler
  const toplamDeger = useMemo(
    () => dahilSiparisler.reduce((acc, s) => acc + (s.toplam_tutar || 0), 0),
    [dahilSiparisler]
  );

  const toplamKalanBorc = useMemo(
    () => dahilSiparisler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0),
    [dahilSiparisler]
  );

  const toplamAdet = useMemo(
    () => dahilSiparisler.reduce((acc, s) => acc + (s.adet || 1), 0),
    [dahilSiparisler]
  );

  // Lojistik Durum Etiketleri
  const getLojistikEtiketi = (durum: string) => {
    switch (durum) {
      case 'KANADA_SATINALIM_BEKLIYOR':
        return { label: 'Kanada Satınalma', color: 'bg-amber-100 text-amber-900 border-amber-300' };
      case 'KANADA_DEPO':
        return { label: 'Kanada Anbarı', color: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 'ULUSLARARASI_KARGO':
        return { label: 'Uçuşda / Kargo', color: 'bg-sky-100 text-sky-900 border-sky-300' };
      case 'BAKU_DAGITIM_ARKADAS':
        return { label: 'Bakı Paylanış', color: 'bg-purple-100 text-purple-900 border-purple-300' };
      case 'TESLIM_EDILDI':
        return {
          label: 'Təhvil Verildi',
          color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        };
      default:
        return {
          label: durum.replace(/_/g, ' '),
          color: 'bg-slate-100 text-slate-700 border-slate-300',
        };
    }
  };

  // 1. Formatlı Excel (.xlsx) İndirme
  const excelIndir = async () => {
    if (excelHazirlaniyor) return;
    setExcelHazirlaniyor(true);
    try {
      const XLSX = await loadSpreadsheet();
      const baslik = [
        'Sıra',
        'Müştəri Adı',
        'Əlaqə Nömrəsi',
        'Şəhər',
        'Çatdırılma Ünvanı',
        'Məhsul Təsviri',
        'Ölçü / Rəng',
        'Say (ədəd)',
        'Məbləğ (AZN)',
        'Ödənilən (AZN)',
        'Qalıq Borc (AZN)',
        'Gömrük FİN Kodu',
        'Bakı Təhvil Kuryesi',
        'Lojistik Statusu',
        'Kanada İzləmə Kodu',
        'Beynəlxalq Kargo Kodu',
        'Xüsusi Qeyd',
        'Bakı Təhvilat Notu',
      ];

      const satirlar = dahilSiparisler.map((s, index) => [
        index + 1,
        s.musteri_adi || '',
        s.telefon_numarasi || '',
        s.teslimat_sehri || 'Bakı',
        s.teslimat_adresi || '',
        s.urun_aciklamasi || '',
        [s.beden_veya_olcu, s.renk].filter(Boolean).join(' / '),
        s.adet || 1,
        s.toplam_tutar || 0,
        s.alinan_tutar || 0,
        s.kalan_tutar || 0,
        s.gumruk_fin_kodu || '—',
        s.baku_kurye_adi || 'Bölgə üzrə',
        getLojistikEtiketi(s.lojistik_durumu).label,
        s.kanada_takip_kodu || '',
        s.uluslararasi_kargo_kodu || '',
        s.ozel_not || '',
        s.baku_tahsilat_notu || '',
      ]);

      satirlar.push([
        '',
        'YEKUN CƏMİ:',
        '',
        '',
        '',
        `${dahilSiparisler.length} Bağlama`,
        '',
        toplamAdet,
        toplamDeger,
        toplamDeger - toplamKalanBorc,
        toplamKalanBorc,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([baslik, ...satirlar]);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 16 },
        { wch: 14 },
        { wch: 28 },
        { wch: 32 },
        { wch: 14 },
        { wch: 8 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
        { wch: 26 },
        { wch: 26 },
      ];

      // Başlık satırını dondur (Freeze Top Row)
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Kargo Manifestosu');
      const dosyaAdi = `KNB_Kargo_Manifestosu_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, dosyaAdi);
    } catch (err) {
      console.error('Excel endirmə xətası:', err);
      reportDocumentError(err);
    } finally {
      setExcelHazirlaniyor(false);
    }
  };

  // 2. Formatlı PDF İndirme (A4 Landscape - Daşmayan və Dəqiq Hesablanmış)
  const pdfIndir = async () => {
    if (pdfHazirlaniyor) return;
    setPdfHazirlaniyor(true);
    try {
      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4',
      });

      const bugun = new Date().toLocaleDateString('az-AZ');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(
        cleanPdfText('KNB Lojistik - Kanada -> Baki Kargo Manifestosu & Ceki Listesi'),
        26,
        32
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        cleanPdfText(
          `Tarix: ${bugun} | Toplam Baglama: ${dahilSiparisler.length} eded | Toplam Mehsul: ${toplamAdet} eded`
        ),
        26,
        47
      );
      doc.text(
        cleanPdfText(
          `Cemi Deyer: ${toplamDeger.toFixed(2)} AZN | Bakida Alinacaq Qaliq Borc: ${toplamKalanBorc.toFixed(2)} AZN`
        ),
        26,
        60
      );

      const head = [
        [
          '#',
          cleanPdfText('Musteri & Elaqe'),
          cleanPdfText('Seher / Unvan'),
          cleanPdfText('Mehsul & Xususiyyet'),
          'Say',
          'Deyer',
          cleanPdfText('Qaliq Borc'),
          cleanPdfText('Status / Kargo Kodu'),
          cleanPdfText('Xususi Qeyd / Not'),
        ],
      ];

      const body = dahilSiparisler.map((s, idx) => {
        const lojRozet = getLojistikEtiketi(s.lojistik_durumu);
        const ozellik = [s.beden_veya_olcu, s.renk].filter(Boolean).join(' - ');
        const kargoKod = s.uluslararasi_kargo_kodu ? `\nKod: ${s.uluslararasi_kargo_kodu}` : '';
        const notlar = [
          s.ozel_not ? cleanPdfText(s.ozel_not) : '',
          s.baku_tahsilat_notu ? `[Baki: ${cleanPdfText(s.baku_tahsilat_notu)}]` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const musteri = cleanPdfText(
          `${s.musteri_adi || 'Adsiz'}\nTel: ${s.telefon_numarasi || '-'}${s.olusturma_tarihi ? `\n${s.olusturma_tarihi.slice(0, 10)}` : ''}`
        );

        const unvan = cleanPdfText(
          `${s.teslimat_sehri || 'Baki'}\n${s.teslimat_adresi || 'Merkez'}`
        );

        const mehsul = cleanPdfText(
          `${s.urun_aciklamasi || '-'}${ozellik ? `\n(${ozellik})` : ''}`
        );

        return [
          String(idx + 1),
          musteri,
          unvan,
          mehsul,
          String(s.adet || 1),
          `${(s.toplam_tutar || 0).toFixed(2)} AZN`,
          s.kalan_tutar > 0 ? `${s.kalan_tutar.toFixed(2)} AZN (BORC)` : 'ODENILIB',
          cleanPdfText(`${lojRozet.label}${kargoKod}`),
          notlar || '-',
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY: 72,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 7,
          cellPadding: 3,
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.5,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 4,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 22, halign: 'center' },
          1: { cellWidth: 95 },
          2: { cellWidth: 85 },
          3: { cellWidth: 145 },
          4: { cellWidth: 26, halign: 'center' },
          5: { cellWidth: 55, halign: 'right' },
          6: { cellWidth: 65, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 95 },
          8: { cellWidth: 200, overflow: 'linebreak' },
        },
        foot: [
          [
            '',
            'YEKUN CEMI',
            '',
            `${dahilSiparisler.length} Baglama`,
            String(toplamAdet),
            `${toplamDeger.toFixed(2)} AZN`,
            `${toplamKalanBorc.toFixed(2)} AZN`,
            '',
            cleanPdfText('Resmi KNB Lojistik Senedi'),
          ],
        ],
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 4,
        },
        margin: { left: 26, right: 26, top: 25, bottom: 25 },
        didDrawPage: (data) => {
          const pageCount = (doc as any).internal.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `KNB Express Logistics Manifestosu - Sehife ${data.pageNumber} / ${pageCount}`,
            26,
            580
          );
        },
      });

      const dosyaAdi = `KNB_Ceki_Listesi_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(dosyaAdi);
    } catch (err) {
      console.error('PDF hazırlama xətası:', err);
      reportDocumentError(err);
    } finally {
      setPdfHazirlaniyor(false);
    }
  };

  // 3. Tarayıcı Yazdırma (Print)
  const handleYazdir = () => {
    setYazdiriliyor(true);
    try {
      const bugun = new Date().toLocaleDateString('az-AZ');
      const rowsHtml = dahilSiparisler
        .map(
          (s, idx) => `
        <tr>
          <td style="text-align:center; padding: 6px 4px;">${idx + 1}</td>
          <td style="padding: 6px 6px;">
            <strong>${s.musteri_adi || 'Adsız'}</strong><br/>
            <span style="color:#64748b; font-size:10px;">${s.telefon_numarasi || '-'}</span>
          </td>
          <td style="padding: 6px 6px;">
            <strong>${s.teslimat_sehri || 'Bakı'}</strong><br/>
            <span style="color:#64748b; font-size:10px;">${s.teslimat_adresi || 'Bakı'}</span>
          </td>
          <td style="padding: 6px 6px;">
            ${s.urun_aciklamasi || '-'}<br/>
            <small style="color:#64748b;">${[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}</small>
          </td>
          <td style="text-align:center; font-weight:bold; padding: 6px 4px;">${s.adet || 1}</td>
          <td style="text-align:right; font-weight:bold; padding: 6px 6px;">${(s.toplam_tutar || 0).toFixed(2)} ${s.para_birimi || 'AZN'}</td>
          <td style="text-align:right; padding: 6px 6px; ${s.kalan_tutar > 0 ? 'color:#b45309; font-weight:bold;' : 'color:#15803d;'}">
            ${s.kalan_tutar > 0 ? `${s.kalan_tutar.toFixed(2)} AZN<br/><small>ALINACAQ</small>` : 'ÖDƏNİLİB'}
          </td>
          <td style="padding: 6px 6px;">
            <span style="font-size:10px; background:#f1f5f9; padding:2px 4px; border-radius:3px;">${getLojistikEtiketi(s.lojistik_durumu).label}</span>
            ${s.uluslararasi_kargo_kodu ? `<br/><code style="font-size:10px; color:#1d4ed8;">${s.uluslararasi_kargo_kodu}</code>` : ''}
          </td>
          <td style="padding: 6px 6px; font-size:10px;">
            ${s.ozel_not ? `<div>📌 ${s.ozel_not}</div>` : ''}
            ${s.baku_tahsilat_notu ? `<div style="color:#92400e;">💬 ${s.baku_tahsilat_notu}</div>` : ''}
          </td>
        </tr>
      `
        )
        .join('');

      const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Kargo Manifestosu - KNB Lojistik</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 11px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
            .title { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: -0.5px; }
            .meta { font-size: 11px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background-color: #0f172a; color: #ffffff; text-align: left; padding: 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            td { border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            tr:nth-child(even) td { background-color: #f8fafc; }
            .footer { margin-top: 15px; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">KNB Lojistik — Kanada ➔ Bakı Kargo Manifestosu</div>
              <div class="meta">Marşrut: Toronto / Vancouver ➔ Heydər Əliyev Beynəlxalq Hava Limanı (GYD)</div>
            </div>
            <div style="text-align: right;">
              <div><strong>Tarix:</strong> ${bugun}</div>
              <div class="meta">Toplam Paket: <strong>${dahilSiparisler.length}</strong> (${toplamAdet} ədəd)</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:25px; text-align:center;">#</th>
                <th style="width:130px;">Müştəri & Tel</th>
                <th style="width:120px;">Şəhər / Ünvan</th>
                <th>Məhsul & Xüsusiyyət</th>
                <th style="width:40px; text-align:center;">Say</th>
                <th style="width:85px; text-align:right;">Məbləğ</th>
                <th style="width:95px; text-align:right;">Qalıq Borc</th>
                <th style="width:120px;">Status / Kod</th>
                <th style="width:150px;">Qeyd & Təlimat</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">
            <div>Bəyannamə: Bu manifestodakı bağlamalar təhlükəsizlik və gömrük qaydalarına uyğun Toronto anbarında təhvil verilmişdir.</div>
            <div>
              <span>Toplam: ${toplamDeger.toFixed(2)} AZN</span> | 
              <span style="color:#b45309;">Bakıda Alınacaq: ${toplamKalanBorc.toFixed(2)} AZN</span>
            </div>
          </div>
        </body>
        </html>
      `;

      safePrintHtml(content, 'Kargo_Manifestosu');
    } catch (e) {
      console.error('Yazdırma xətası:', e);
      alert(
        'Yazdırma dialoqu açılarkən xəta baş verdi. Zəhmət olmasa PDF İndir seçimindən istifadə edin.'
      );
    } finally {
      setYazdiriliyor(false);
    }
  };

  // WhatsApp Kurye/Dağıtıcı Mesajı Kopyalama
  const metinKopyala = () => {
    let metin = `✈️ *KNB Lojistik — Kanada ➔ Bakı Kargo Manifestosu*\n`;
    metin += `📅 Tarix: ${new Date().toLocaleDateString('az-AZ')}\n`;
    metin += `📦 Toplam Bağlama: ${dahilSiparisler.length} ədəd (${toplamAdet} ədəd məhsul)\n`;
    metin += `💰 Toplam Dəyər: ${toplamDeger.toFixed(2)} AZN\n`;
    metin += `🔴 Bakıda Alınacaq Borc: ${toplamKalanBorc.toFixed(2)} AZN\n\n`;
    metin += `------------------------------------\n`;

    dahilSiparisler.forEach((s, i) => {
      metin += `${i + 1}. *${s.musteri_adi}* (${s.telefon_numarasi || 'Nömrə yoxdur'})\n`;
      metin += `   📍 Şəhər: ${s.teslimat_sehri || 'Bakı'} - ${s.teslimat_adresi || 'Bakı daxili'}\n`;
      metin += `   🛍️ Məhsul: ${s.urun_aciklamasi} (${s.adet || 1} əd)\n`;
      if (s.beden_veya_olcu || s.renk) {
        metin += `   🏷️ Xüsusiyyət: ${[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}\n`;
      }
      if (s.kalan_tutar > 0) {
        metin += `   ⚠️ *ALINACAQ BORC: ${s.kalan_tutar.toFixed(2)} ${s.para_birimi}*\n`;
      } else {
        metin += `   ✅ *ÖDƏNİLİB (0 AZN)*\n`;
      }
      if (s.gumruk_fin_kodu) {
        metin += `   🪪 FİN: ${s.gumruk_fin_kodu}\n`;
      }
      if (s.baku_kurye_adi) {
        metin += `   🛵 Kurye: ${s.baku_kurye_adi}\n`;
      }
      if (s.uluslararasi_kargo_kodu) {
        metin += `   📦 Kargo Kodu: ${s.uluslararasi_kargo_kodu}\n`;
      }
      if (s.baku_tahsilat_notu) {
        metin += `   💬 Bakı Notu: ${s.baku_tahsilat_notu}\n`;
      }
      metin += `\n`;
    });

    navigator.clipboard.writeText(metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2500);
  };

  // Çap: Paket Üzəri Beynəlxalq Kargo & Gömrük Stikeri (Avery / Termal format)
  const handleEtiketleriYazdir = () => {
    setYazdiriliyor(true);
    try {
      const etiketKartlari = dahilSiparisler
        .map(
          (s, idx) => `
        <div class="kargo-stiker">
          <div class="stiker-header">
            <div class="logo">✈️ KNB EXPRESS CARGO</div>
            <div class="yon">KANADA ➔ BAKU / AZERBAIJAN</div>
          </div>
          <div class="barkod-alani">
            <div class="barkod-cizgiler">||| | |||| | || |||| ||| || ||||</div>
            <div class="takip-kod">${s.uluslararasi_kargo_kodu || `KNB-${String(idx + 1).padStart(4, '0')}`}</div>
          </div>
          <div class="alici-bolumu">
            <div class="etiket-satir"><span class="etiket-baslik">ALICI (GÖMRÜK):</span> <strong class="alici-adi">${s.musteri_adi}</strong></div>
            <div class="etiket-satir"><span class="etiket-baslik">FİN KODU / Ş.V:</span> <span class="vurgu-kod">${s.gumruk_fin_kodu || 'QEYD EDİLMƏYİB'}</span></div>
            <div class="etiket-satir"><span class="etiket-baslik">TEL:</span> ${s.telefon_numarasi || '—'}</div>
            <div class="etiket-satir"><span class="etiket-baslik">ŞƏHƏR & ÜNVAN:</span> ${s.teslimat_sehri || 'Bakı'}, ${s.teslimat_adresi || 'Mərkəzi Təhvil'}</div>
          </div>
          <div class="operasyon-bolumu">
            <div class="operasyon-kurye">
              <span class="etiket-baslik">BAKI TƏHVİL / SAHƏ KURYESİ:</span>
              <div class="kurye-adi">🛵 ${s.baku_kurye_adi || 'Bölgə üzrə mərkəz'}</div>
            </div>
            <div class="tahsilat-kutu ${s.kalan_tutar > 0 ? 'borclu' : 'odendi'}">
              <span class="etiket-baslik">BAKIDA TƏHVİLDƏ:</span>
              <div class="tahsilat-mebleg">
                ${s.kalan_tutar > 0 ? `${s.kalan_tutar.toFixed(2)} AZN (ALINACAQ)` : 'TAM ÖDƏNİLİB'}
              </div>
            </div>
          </div>
          <div class="mehsul-qeyd">
            <div><strong>Məhsul:</strong> ${s.urun_aciklamasi} (${s.adet || 1} əd) ${[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}</div>
            ${s.ozel_not ? `<div class="not">Not: ${s.ozel_not}</div>` : ''}
          </div>
        </div>
      `
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>KNB Kargo Paket Stikerləri</title>
          <style>
            @page { size: portrait; margin: 8mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; }
            .stiker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .kargo-stiker { border: 2px solid #0f172a; border-radius: 8px; padding: 10px; page-break-inside: avoid; background: #fff; box-sizing: border-box; }
            .stiker-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin-bottom: 6px; }
            .logo { font-weight: 900; font-size: 11px; letter-spacing: 0.5px; }
            .yon { font-weight: bold; font-size: 9px; color: #1e3a8a; }
            .barkod-alani { text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 6px; }
            .barkod-cizgiler { font-family: monospace; font-size: 14px; letter-spacing: 2px; font-weight: bold; }
            .takip-kod { font-family: monospace; font-size: 11px; font-weight: 800; color: #0f172a; }
            .alici-bolumu { font-size: 10px; line-height: 1.4; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px; }
            .alici-adi { font-size: 12px; color: #0f172a; }
            .etiket-satir { margin-bottom: 2px; }
            .etiket-baslik { font-size: 8.5px; font-weight: 700; color: #64748b; }
            .vurgu-kod { font-family: monospace; font-weight: bold; background: #fef08a; padding: 1px 4px; border-radius: 3px; }
            .operasyon-bolumu { display: flex; justify-content: space-between; gap: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px; }
            .operasyon-kurye { flex: 1; font-size: 9.5px; }
            .kurye-adi { font-weight: 800; color: #1e293b; margin-top: 1px; }
            .tahsilat-kutu { padding: 4px 6px; border-radius: 4px; text-align: right; min-width: 100px; }
            .tahsilat-kutu.borclu { background: #fef2f2; border: 1px solid #f87171; }
            .tahsilat-kutu.odendi { background: #f0fdf4; border: 1px solid #4ade80; }
            .tahsilat-mebleg { font-weight: 900; font-size: 11px; }
            .tahsilat-kutu.borclu .tahsilat-mebleg { color: #b91c1c; }
            .tahsilat-kutu.odendi .tahsilat-mebleg { color: #15803d; }
            .mehsul-qeyd { font-size: 9px; color: #334155; line-height: 1.3; }
            .not { color: #d97706; font-style: italic; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="stiker-grid">
            ${etiketKartlari}
          </div>
        </body>
        </html>
      `;

      safePrintHtml(html, 'Kargo_Etiketleri');
    } catch (e) {
      console.error('Etiket yazdırma xətası:', e);
      alert('Etiket çap dialoqu açılarkən xəta baş verdi.');
    } finally {
      setYazdiriliyor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Üst Başlık & Eylem Çubuğu */}
      <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Plane className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-xl text-white tracking-tight">
                Kanada ➔ Bakı Kargo Manifestosu & Çeki Listesi
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Rəsmi Göndəriş Paneli
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Hava kargo şirkəti, gömrük bəyannaməsi və Bakı təhvil-paylanış anbarı üçün tam
              genişlikdə idarəetmə cədvəli
            </p>
          </div>
        </div>

        {/* Aksiyon Butonları (Aramex, Excel, PDF, Yazdır, Parametreler) */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Gizli Dispatch Dosya Yükleyici */}
          <input
            type="file"
            ref={dispatchInputRef}
            onChange={handleDispatchDosyaSecildi}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />

          {onSiparislereDon && (
            <button
              type="button"
              onClick={onSiparislereDon}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.siparislereDon}</span>
            </button>
          )}

          {/* Aramex / Kargo Canlı Senkronizasyon */}
          <button
            type="button"
            onClick={handleAramexSenkronizeEt}
            disabled={kargoSenkronizeEdiliyor}
            title="Aramex və ya aktiv kargo API ilə yoldakı bağlamaları dərhal yoxla"
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ring-1 ring-blue-400/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${kargoSenkronizeEdiliyor ? 'animate-spin' : ''}`} />
            <span>{kargoSenkronizeEdiliyor ? 'Sinxronlaşdırılır...' : 'Aramex Canlı Sinxron'}</span>
          </button>

          {/* Daily Dispatch Excel İçe Aktarma */}
          <button
            type="button"
            onClick={() => dispatchInputRef.current?.click()}
            disabled={dispatchYukleniyor}
            title="Aramex-in hər axşam e-poçtla göndərdiyi Daily Dispatch Excel/CSV faylını daxil et"
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Upload className={`w-3.5 h-3.5 ${dispatchYukleniyor ? 'animate-bounce' : ''}`} />
            <span>{dispatchYukleniyor ? 'Oxunur...' : 'Daily Dispatch İdxal'}</span>
          </button>

          <button
            type="button"
            onClick={excelIndir}
            disabled={excelHazirlaniyor}
            title="Excel (.xlsx)"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{excelHazirlaniyor ? 'Hazırlanır...' : t.excelIndir}</span>
          </button>

          <button
            type="button"
            onClick={pdfIndir}
            disabled={pdfHazirlaniyor}
            title="PDF"
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{pdfHazirlaniyor ? '...' : t.pdfIndir}</span>
          </button>

          <button
            type="button"
            onClick={handleYazdir}
            disabled={yazdiriliyor}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer border border-slate-700"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.manifestoCap}</span>
          </button>

          <button
            type="button"
            onClick={handleEtiketleriYazdir}
            disabled={yazdiriliyor}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>{t.paketStikerleri}</span>
          </button>

          {/* Kargo Ayarları Modalı Butonu */}
          <button
            type="button"
            onClick={() => setKargoModalAcik(true)}
            title="Kargo Provayder (Aramex, DHL, UPS) və API Tənzimləmələri"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer border border-slate-700"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Kargo Əməliyyat Bildirişi (Toast) */}
      {kargoBildirimi && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs border animate-in fade-in duration-200 ${
            kargoBildirimi.tip === 'basari'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {kargoBildirimi.tip === 'basari' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{kargoBildirimi.mesaj}</span>
          </div>
          <button
            type="button"
            onClick={() => setKargoBildirimi(null)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {V2_FLOW_ENABLED && v2Manifest && (
        <Suspense fallback={<div className="text-xs text-slate-500">Yüklənir...</div>}>
          <ManifestEslestirmePaneli
            dosyaBase64={v2Manifest.base64}
            dosyaAdi={v2Manifest.ad}
            onKapat={() => setV2Manifest(null)}
            onOnaylandi={() => siparisleriYukle()}
          />
        </Suspense>
      )}

      {/* 2. Dörtlü Canlı İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Toplam Bağlama</div>
            <div className="text-xl font-extrabold text-slate-900">
              {dahilSiparisler.length}{' '}
              <span className="text-xs font-normal text-slate-500">paket</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Toplam Məhsul</div>
            <div className="text-xl font-extrabold text-slate-900">
              {toplamAdet} <span className="text-xs font-normal text-slate-500">ədəd</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Sifariş Dəyəri</div>
            <div className="text-xl font-extrabold text-slate-900">
              {toplamDeger.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500">AZN</span>
            </div>
          </div>
        </div>

        <div className="bg-amber-50/80 p-4 rounded-2xl border border-amber-300 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold text-lg">
            !
          </div>
          <div>
            <div className="text-xs font-bold text-amber-900">Bakıda Təhsilat (Borc)</div>
            <div className="text-xl font-extrabold text-amber-700">
              {toplamKalanBorc.toFixed(2)}{' '}
              <span className="text-xs font-normal text-amber-900">AZN</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Çok Yönlü Filtre ve Kontrol Paneli */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* 1. Satır: Lojistik Durumu Filtresi */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-700 mr-1 flex items-center gap-1">
              <Filter className="w-4 h-4 text-slate-500" />
              Mərhələ:
            </span>
            <button
              type="button"
              onClick={() => setLojistikFiltre('kargo_ve_depo')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                lojistikFiltre === 'kargo_ve_depo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              ✈️ Yoldakı & Depodakı (
              {
                siparisler.filter((s) =>
                  ['KANADA_DEPO', 'ULUSLARARASI_KARGO', 'BAKU_DAGITIM_ARKADAS'].includes(
                    s.lojistik_durumu
                  )
                ).length
              }
              )
            </button>
            <button
              type="button"
              onClick={() => setLojistikFiltre('ULUSLARARASI_KARGO')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                lojistikFiltre === 'ULUSLARARASI_KARGO'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Yalnız Uçuşda (
              {siparisler.filter((s) => s.lojistik_durumu === 'ULUSLARARASI_KARGO').length})
            </button>
            <button
              type="button"
              onClick={() => setLojistikFiltre('KANADA_DEPO')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                lojistikFiltre === 'KANADA_DEPO'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Kanada Depo ({siparisler.filter((s) => s.lojistik_durumu === 'KANADA_DEPO').length})
            </button>
            <button
              type="button"
              onClick={() => setLojistikFiltre('BAKU_DAGITIM_ARKADAS')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                lojistikFiltre === 'BAKU_DAGITIM_ARKADAS'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bakı Paylanış (
              {siparisler.filter((s) => s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS').length})
            </button>
            <button
              type="button"
              onClick={() => setLojistikFiltre('tumu')}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                lojistikFiltre === 'tumu'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Bütün Sifarişlər ({siparisler.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={metinKopyala}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title="WhatsApp kurye/dağıtıcı mesajı formatında kopyala"
            >
              {kopyalandi ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Kopyalandı!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>WhatsApp Kurye Mətni</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Satır: Tarih Aralığı, Şehir, Borç ve Arama */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-slate-500" />
              Tarix:
            </span>
            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => handleTarihPresetSec('hepsi')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  tarihPreset === 'hepsi'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Bütün Vaxtlar
              </button>
              <button
                type="button"
                onClick={() => handleTarihPresetSec('bugun')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  tarihPreset === 'bugun'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Bu Gün
              </button>
              <button
                type="button"
                onClick={() => handleTarihPresetSec('son7gun')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  tarihPreset === 'son7gun'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Son 7 Gün
              </button>
              <button
                type="button"
                onClick={() => handleTarihPresetSec('buay')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  tarihPreset === 'buay'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Bu Ay
              </button>
            </div>

            {/* Başlangıç ve Bitiş Tarih Seçicileri */}
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="date"
                value={baslangicTarih}
                onChange={(e) => handleManuelTarihDegisimi('baslangic', e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                title="Başlanğıc Tarixi"
              />
              <span>➔</span>
              <input
                type="date"
                value={bitisTarih}
                onChange={(e) => handleManuelTarihDegisimi('bitis', e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                title="Bitiş Tarixi"
              />
            </div>

            {/* Finans Filtresi (Yalnız Borcu Olanlar) */}
            <button
              type="button"
              onClick={() => setFinansFiltre(finansFiltre === 'borclu' ? 'tumu' : 'borclu')}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                finansFiltre === 'borclu'
                  ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Yalnız Bakıda nağd pul ödəyəcək müştəriləri filtrlə"
            >
              <span>🔴 Yalnız Qalıq Borcu Olanlar</span>
              {finansFiltre === 'borclu' && <Check className="w-3.5 h-3.5 text-amber-700" />}
            </button>

            {/* Şehir Seçimi */}
            {sehirler.length > 0 && (
              <select
                value={sehirFiltre}
                onChange={(e) => setSehirFiltre(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="tumu">Bütün Şəhərlər</option>
                {sehirler.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Arama Kutusu & Sıfırla */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Müştəri, tel, kod, məhsul..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-48 sm:w-64"
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

            {(lojistikFiltre !== 'kargo_ve_depo' ||
              finansFiltre !== 'tumu' ||
              sehirFiltre !== 'tumu' ||
              baslangicTarih ||
              bitisTarih ||
              aramaMetni) && (
              <button
                type="button"
                onClick={filtreleriSifirla}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Bütün filtrləri sıfırla"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Ana Kargo Manifestosu Tablosu (Tam Genişlik) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Tablo Üst Başlık Bilgisi */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <span>Paket və Bağlama Siyahısı</span>
              <span className="text-xs font-bold text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full">
                {dahilSiparisler.length} Bağlama
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Marşrut: Toronto / Vancouver (Kanada) ➔ Heydər Əliyev Beynəlxalq Hava Limanı (GYD /
              Bakı)
            </p>
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div>
              Tarix:{' '}
              <strong className="text-slate-800">{new Date().toLocaleDateString('az-AZ')}</strong>
            </div>
            {baslangicTarih || bitisTarih ? (
              <div className="text-blue-700 font-semibold text-[11px]">
                Filtr Aralığı: {baslangicTarih || 'Əvvəl'} ➔ {bitisTarih || 'İndiyədək'}
              </div>
            ) : (
              <div className="text-[11px]">Bütün aktiv dövriyyə</div>
            )}
          </div>
        </div>

        {dahilSiparisler.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-xs bg-slate-50/50">
            <Package className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <div className="font-bold text-slate-700 text-base">
              Seçilmiş filtrə uyğun bağlama tapılmadı.
            </div>
            <p className="text-slate-500 mt-1 max-w-md mx-auto">
              Tarix aralığını, lojistik mərhələni və ya arama sözünü dəyişdirərək təkrar yoxlayın.
            </p>
            <button
              type="button"
              onClick={filtreleriSifirla}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Bütün Filtrləri Sıfırla</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-xs">
                <tr>
                  <th className="p-3 w-10 text-center">{t.sira}</th>
                  <th className="p-3 min-w-[160px]">{t.musteriVeElaqe}</th>
                  <th className="p-3 min-w-[150px]">{t.seherUnvan}</th>
                  <th className="p-3 min-w-[220px]">{t.mehsulTesvir}</th>
                  <th className="p-3 text-center w-14">{t.say}</th>
                  <th className="p-3 text-right min-w-[100px]">{t.mebleg}</th>
                  <th className="p-3 text-right min-w-[120px]">{t.qaliqBorc}</th>
                  <th className="p-3 min-w-[140px]">{t.gomrukBakuTehvil}</th>
                  <th className="p-3 min-w-[160px]">{t.lojistikMerhele}</th>
                  <th className="p-3 min-w-[200px]">{t.qeydNot}</th>
                  {onSiparisDetayAc && <th className="p-3 text-center w-14">{t.emeliyyat}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dahilSiparisler.map((s, index) => {
                  const lojRozet = getLojistikEtiketi(s.lojistik_durumu);
                  return (
                    <tr key={s.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-[11px] text-center font-bold">
                        {index + 1}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 text-sm">
                          {s.musteri_adi || 'Adsız Müştəri'}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {s.telefon_numarasi || 'Nömrə yoxdur'}
                        </div>
                        {s.olusturma_tarihi && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Qeyd: {s.olusturma_tarihi.slice(0, 10)}
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
                          {[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}
                        </div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-900 text-sm">
                        {s.adet || 1}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {(s.toplam_tutar || 0).toFixed(2)} {s.para_birimi || 'AZN'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Ödənilib: {(s.alinan_tutar || 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {s.kalan_tutar > 0 ? (
                          <div className="bg-amber-50 text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1 inline-block text-right shadow-2xs">
                            <div className="font-extrabold text-amber-800 text-xs sm:text-sm">
                              {s.kalan_tutar.toFixed(2)} {s.para_birimi || 'AZN'}
                            </div>
                            <div className="text-[9px] font-bold text-amber-700 uppercase">
                              Bakıda Alınacaq
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block text-xs">
                            ✓ Tam Ödənilib
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-xs">
                          {s.gumruk_fin_kodu ? (
                            <div className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md inline-block border border-slate-200">
                              🪪 {s.gumruk_fin_kodu}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              FİN qeyd yoxdur
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 font-medium mt-1 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{s.baku_kurye_adi || 'Bölgə üzrə mərkəz'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border inline-block ${lojRozet.color}`}
                        >
                          {lojRozet.label}
                        </span>
                        {s.uluslararasi_kargo_kodu && (
                          <div className="text-xs text-blue-700 font-mono font-bold mt-1.5 flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-normal">Kargo:</span>
                            <span>{s.uluslararasi_kargo_kodu}</span>
                          </div>
                        )}
                        {s.kanada_takip_kodu && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Kanada: {s.kanada_takip_kodu}
                          </div>
                        )}
                      </td>
                      <td className="p-3 space-y-1.5">
                        {s.ozel_not && (
                          <div className="text-xs text-slate-800 bg-slate-100 p-2 rounded-xl border border-slate-200">
                            <span className="font-bold text-blue-700">📌 Qeyd: </span>
                            {s.ozel_not}
                          </div>
                        )}
                        {s.baku_tahsilat_notu && (
                          <div className="text-xs text-amber-950 bg-amber-50 p-2 rounded-xl border border-amber-300 font-medium">
                            <span className="font-bold text-amber-800">💬 Bakı Notu: </span>
                            {s.baku_tahsilat_notu}
                          </div>
                        )}
                        {!s.ozel_not && !s.baku_tahsilat_notu && (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      {onSiparisDetayAc && (
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => onSiparisDetayAc(s)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Sipariş Detaylarını Aç"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tablo Alt Özeti */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="text-slate-600 max-w-lg">
            <strong className="text-slate-800">Rəsmi Bəyannamə: </strong>
            Bu manifestodakı bütün bağlamalar təhlükəsizlik və gömrük qaydalarına uyğun Toronto
            anbarında təhvil verilmiş və qeydiyyata alınmışdır.
          </div>
          <div className="flex flex-wrap items-center gap-3 font-bold text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <span>
              Toplam Bağlama: <span className="text-blue-600">{dahilSiparisler.length}</span>
            </span>
            <span>
              Toplam Ədəd: <span className="text-purple-600">{toplamAdet}</span>
            </span>
            <span>
              Cəmi Məbləğ: <span className="text-emerald-600">{toplamDeger.toFixed(2)} AZN</span>
            </span>
            <span className="text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
              Bakıda Alınacaq: {toplamKalanBorc.toFixed(2)} AZN
            </span>
          </div>
        </div>
      </div>

      {/* Kargo & Aramex Tənzimləmələri Modalı */}
      <KargoEntegrasyonModal
        acik={kargoModalAcik}
        onKapat={() => setKargoModalAcik(false)}
        seciliTenantId={seciliFirmaId}
        onAyarlarGuncellendi={() => {
          siparisleriYukle();
        }}
      />
    </div>
  );
};
