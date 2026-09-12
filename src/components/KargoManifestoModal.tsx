import React, { useState, useMemo } from 'react';
import { Siparis } from '../types';
import { 
  X, 
  FileText, 
  Download, 
  Printer, 
  Plane, 
  Package, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Check,
  Calendar,
  Search,
  Filter,
  DollarSign,
  FileSpreadsheet,
  Layers,
  MapPin,
  Clock,
  RotateCcw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cleanPdfText, safePrintHtml } from '../utils/pdfHelpers';

interface KargoManifestoModalProps {
  siparisler: Siparis[];
  onKapat: () => void;
}

type LojistikFiltreTipi = 
  | 'kargo_ve_depo'
  | 'KANADA_DEPO'
  | 'ULUSLARARASI_KARGO'
  | 'BAKU_DAGITIM_ARKADAS'
  | 'TESLIM_EDILDI'
  | 'tumu';

type FinansFiltreTipi = 'tumu' | 'borclu' | 'odendi';

export const KargoManifestoModal: React.FC<KargoManifestoModalProps> = ({
  siparisler,
  onKapat,
}) => {
  // Filtre durumları
  const [lojistikFiltre, setLojistikFiltre] = useState<LojistikFiltreTipi>('kargo_ve_depo');
  const [finansFiltre, setFinansFiltre] = useState<FinansFiltreTipi>('tumu');
  const [sehirFiltre, setSehirFiltre] = useState<string>('tumu');
  const [aramaMetni, setAramaMetni] = useState<string>('');
  
  // Tarih aralığı filtreleri
  const [baslangicTarih, setBaslangicTarih] = useState<string>('');
  const [bitisTarih, setBitisTarih] = useState<string>('');
  const [tarihPreset, setTarihPreset] = useState<'hepsi' | 'bugun' | 'son7gun' | 'buay' | 'ozel'>('hepsi');

  const [kopyalandi, setKopyalandi] = useState(false);
  const [yazdiriliyor, setYazdiriliyor] = useState(false);
  const [pdfHazirlaniyor, setPdfHazirlaniyor] = useState(false);

  // Benzersiz şehir listesi
  const sehirler = useMemo(() => {
    const set = new Set<string>();
    siparisler.forEach(s => {
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

      // 2. Finans Durumu Filtresi
      if (finansFiltre === 'borclu' && s.kalan_tutar <= 0) return false;
      if (finansFiltre === 'odendi' && s.kalan_tutar > 0) return false;

      // 3. Şehir Filtresi
      if (sehirFiltre !== 'tumu') {
        if ((s.teslimat_sehri || '').toLowerCase() !== sehirFiltre.toLowerCase()) return false;
      }

      // 4. Tarih Aralığı Filtresi (Sipariş oluşturma tarihine göre)
      if (baslangicTarih || bitisTarih) {
        const sTarih = (s.olusturma_tarihi || '').slice(0, 10);
        if (baslangicTarih && sTarih < baslangicTarih) return false;
        if (bitisTarih && sTarih > bitisTarih) return false;
      }

      // 5. Arama Metni
      if (aramaMetni.trim()) {
        const q = aramaMetni.toLowerCase().trim();
        const metinler = [
          s.musteri_adi,
          s.telefon_numarasi,
          s.urun_aciklamasi,
          s.kanada_takip_kodu,
          s.uluslararasi_kargo_kodu,
          s.ozel_not,
          s.baku_tahsilat_notu,
          s.teslimat_sehri,
          s.teslimat_adresi,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!metinler.includes(q)) return false;
      }

      return true;
    });
  }, [siparisler, lojistikFiltre, finansFiltre, sehirFiltre, baslangicTarih, bitisTarih, aramaMetni]);

  // İstatistikler
  const toplamAdet = dahilSiparisler.reduce((acc, s) => acc + (s.adet || 1), 0);
  const toplamDeger = dahilSiparisler.reduce((acc, s) => acc + (s.toplam_tutar || 0), 0);
  const toplamKalanBorc = dahilSiparisler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0);
  const toplamAlinan = dahilSiparisler.reduce((acc, s) => acc + (s.alinan_tutar || 0), 0);

  // Lojistik durumu rozeti metni
  const getLojistikEtiketi = (durum: string) => {
    switch (durum) {
      case 'KANADA_DEPO':
        return { label: 'Kanada Depo', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'ULUSLARARASI_KARGO':
        return { label: '✈️ Uçuşda / Yolda', color: 'bg-sky-100 text-sky-800 border-sky-300' };
      case 'BAKU_DAGITIM_ARKADAS':
        return { label: 'Bakı Paylanış', color: 'bg-purple-100 text-purple-800 border-purple-300' };
      case 'TESLIM_EDILDI':
        return { label: '✓ Çatdırıldı', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'KANADA_SATINALIM_BEKLIYOR':
        return { label: 'Satınalma Gözləyir', color: 'bg-slate-100 text-slate-800 border-slate-300' };
      default:
        return { label: durum.replace(/_/g, ' '), color: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
  };

  // 1. GERÇEK EXCEL (.xlsx) İNDİRME
  const excelIndir = () => {
    const basliklar = [
      'Sıra',
      'Tarix',
      'Müştəri Adı',
      'Telefon',
      'Şəhər',
      'Çatdırılma Ünvanı',
      'Məhsul Təsviri',
      'Ölçü / Bədən',
      'Rəng',
      'Ədəd',
      'Toplam Məbləğ (AZN)',
      'Ödənilən (AZN)',
      'Qalıq Borc (AZN)',
      'Ödəniş Statusu',
      'Lojistik Mərhələsi',
      'Kanada İzləmə Kodu',
      'Beynəlxalq Kargo Kodu',
      'Xüsusi Qeyd / Təlimat',
      'Bakı Təhvil & Təhsilat Qeydi'
    ];

    const dataRows = dahilSiparisler.map((s, idx) => [
      idx + 1,
      s.olusturma_tarihi ? s.olusturma_tarihi.slice(0, 10) : '',
      s.musteri_adi || '',
      s.telefon_numarasi || '',
      s.teslimat_sehri || 'Bakı',
      s.teslimat_adresi || '',
      s.urun_aciklamasi || '',
      s.beden_veya_olcu || '',
      s.renk || '',
      s.adet || 1,
      Number((s.toplam_tutar || 0).toFixed(2)),
      Number((s.alinan_tutar || 0).toFixed(2)),
      Number((s.kalan_tutar || 0).toFixed(2)),
      s.finans_durumu === 'ODENDI' ? 'Ödənilib' : s.finans_durumu === 'KISMI_ODEME' ? 'Qismən Ödənilib' : 'Gözləyir',
      getLojistikEtiketi(s.lojistik_durumu).label,
      s.kanada_takip_kodu || '',
      s.uluslararasi_kargo_kodu || '',
      s.ozel_not || '',
      s.baku_tahsilat_notu || ''
    ]);

    const toplamRow = [
      'CƏMİ',
      '',
      `${dahilSiparisler.length} Bağlama`,
      '',
      '',
      '',
      '',
      '',
      '',
      toplamAdet,
      Number(toplamDeger.toFixed(2)),
      Number(toplamAlinan.toFixed(2)),
      Number(toplamKalanBorc.toFixed(2)),
      '',
      '',
      '',
      '',
      '',
      `Bakıda Nağd Alınacaq Qalıq: ${toplamKalanBorc.toFixed(2)} AZN`
    ];

    const sheetData = [basliklar, ...dataRows, toplamRow];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 6 },   // Sıra
      { wch: 12 },  // Tarix
      { wch: 24 },  // Müştəri
      { wch: 18 },  // Telefon
      { wch: 12 },  // Şəhər
      { wch: 28 },  // Ünvan
      { wch: 40 },  // Məhsul
      { wch: 12 },  // Ölçü
      { wch: 12 },  // Rəng
      { wch: 8 },   // Ədəd
      { wch: 18 },  // Toplam
      { wch: 16 },  // Ödənilən
      { wch: 16 },  // Qalıq
      { wch: 16 },  // Finans
      { wch: 22 },  // Lojistik
      { wch: 20 },  // Kanada Takip
      { wch: 22 },  // Kargo Kodu
      { wch: 35 },  // Xüsusi Not
      { wch: 40 },  // Bakı Təhsilat Notu
    ];

    // Başlık satırını dondur (Freeze Top Row)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, 'Kargo Manifestosu');
    const dosyaAdi = `Kargo_Manifestosu_KNB_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, dosyaAdi);
  };

  // 2. CSV formatında indirme
  const csvIndir = () => {
    const basliklar = [
      'Sira',
      'Tarix',
      'Musteri Adi',
      'Telefon',
      'Teslimat Sehri',
      'Urun Aciklamasi',
      'Beden/Olcu',
      'Renk',
      'Adet',
      'Toplam Tutar (AZN)',
      'Alinan Tutar (AZN)',
      'Kalan Borc (AZN)',
      'Finans Durumu',
      'Lojistik Asamasi',
      'Kanada Takip No',
      'Uluslararasi Kargo Kodu',
      'Ozel Not ve Teslimat Talimati',
      'Baku Tahsilat Notu',
    ];

    const satirlar = dahilSiparisler.map((s, idx) => [
      idx + 1,
      s.olusturma_tarihi ? s.olusturma_tarihi.slice(0, 10) : '',
      `"${(s.musteri_adi || '').replace(/"/g, '""')}"`,
      `"${(s.telefon_numarasi || '').replace(/"/g, '""')}"`,
      `"${(s.teslimat_sehri || 'Bakü').replace(/"/g, '""')}"`,
      `"${(s.urun_aciklamasi || '').replace(/"/g, '""')}"`,
      `"${(s.beden_veya_olcu || '').replace(/"/g, '""')}"`,
      `"${(s.renk || '').replace(/"/g, '""')}"`,
      s.adet || 1,
      (s.toplam_tutar || 0).toFixed(2),
      (s.alinan_tutar || 0).toFixed(2),
      (s.kalan_tutar || 0).toFixed(2),
      s.finans_durumu,
      s.lojistik_durumu,
      `"${(s.kanada_takip_kodu || '').replace(/"/g, '""')}"`,
      `"${(s.uluslararasi_kargo_kodu || '').replace(/"/g, '""')}"`,
      `"${(s.ozel_not || '').replace(/"/g, '""')}"`,
      `"${(s.baku_tahsilat_notu || '').replace(/"/g, '""')}"`,
    ]);

    const csvIcerik = '\uFEFF' + [basliklar.join(','), ...satirlar.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvIcerik], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `KNB_Kargo_Manifesto_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. DOĞRUDAN PROFESYONEL PDF İNDİRME (.pdf)
  const pdfIndir = () => {
    try {
      setPdfHazirlaniyor(true);

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      // Başlık alanı
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 297, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanPdfText('KNB LOJISTIK -- KANADA - BAKU KARGO MANIFESTOSU & CEKI LISTESI'), 14, 11);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(
        cleanPdfText(`Marsrut: Toronto / Vancouver (Kanada) -> Heydar Aliyev Beynelxalq Hava Limani (GYD / Baku) | Tarix: ${new Date().toLocaleDateString('az-AZ')}`),
        14,
        18
      );

      // Özet Kartı
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, 28, 269, 14, 2, 2, 'F');

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(cleanPdfText(`Toplam Baglama: ${dahilSiparisler.length} eded`), 20, 36);
      doc.text(cleanPdfText(`Toplam Mehsul: ${toplamAdet} eded`), 85, 36);
      doc.text(cleanPdfText(`Toplam Mebleg: ${toplamDeger.toFixed(2)} AZN`), 150, 36);

      doc.setTextColor(185, 28, 28);
      doc.text(cleanPdfText(`Bakida Tehsildar Qaliq Borc: ${toplamKalanBorc.toFixed(2)} AZN`), 215, 36);

      // Tablo Sütunları
      const tableColumn = [
        '#',
        cleanPdfText('Musteri & Elaqe'),
        cleanPdfText('Seher / Unvan'),
        cleanPdfText('Mehsul ve Xususiyyet'),
        'Say',
        'Mebleg',
        cleanPdfText('Qaliq Borc'),
        cleanPdfText('Lojistik / Kod'),
        cleanPdfText('Xususi Qeyd & Baki Tehvil Notu'),
      ];

      const tableRows = dahilSiparisler.map((s, index) => {
        const musteri = cleanPdfText(`${s.musteri_adi || '-'}\n${s.telefon_numarasi || ''}`.trim());
        const yer = cleanPdfText(`${s.teslimat_sehri || 'Baku'}\n${s.teslimat_adresi || ''}`.trim());
        const ozellik = [s.beden_veya_olcu, s.renk].filter(Boolean).join(' / ');
        const mehsul = cleanPdfText(`${s.urun_aciklamasi || '-'}${ozellik ? ` (${ozellik})` : ''}`);
        const mebleg = `${(s.toplam_tutar || 0).toFixed(2)} AZN`;
        const qaliq = (s.kalan_tutar || 0) > 0 ? `${(s.kalan_tutar || 0).toFixed(2)} AZN` : 'ODENILIB';
        const kod = s.uluslararasi_kargo_kodu ? `Kod: ${s.uluslararasi_kargo_kodu}` : (s.kanada_takip_kodu || '-');
        const notlar = [
          s.ozel_not ? `Not: ${cleanPdfText(s.ozel_not)}` : '',
          s.baku_tahsilat_notu ? `Baki: ${cleanPdfText(s.baku_tahsilat_notu)}` : ''
        ]
          .filter(Boolean)
          .join('\n');

        return [
          index + 1,
          musteri,
          yer,
          mehsul,
          s.adet || 1,
          mebleg,
          qaliq,
          cleanPdfText(`${getLojistikEtiketi(s.lojistik_durumu).label}\n${kod}`),
          notlar || '-',
        ];
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 46,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'left',
        },
        bodyStyles: {
          fontSize: 7.5,
          cellPadding: 2.5,
          textColor: [30, 41, 59],
          overflow: 'linebreak',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 36 },
          2: { cellWidth: 26 },
          3: { cellWidth: 62 },
          4: { cellWidth: 10, halign: 'center' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 32 },
          8: { cellWidth: 53, overflow: 'linebreak' },
        },
        margin: { left: 14, right: 14, top: 46, bottom: 15 },
        didDrawPage: (data) => {
          const pageCount = (doc as any).internal.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `KNB Express Logistics Manifestosu - Sehife ${data.pageNumber} / ${pageCount}`,
            14,
            202
          );
        },
      });

      const dosyaAdi = `Kargo_Manifestosu_KNB_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(dosyaAdi);
    } catch (err: any) {
      console.error('PDF oluşturma hatası:', err);
      alert('PDF hazırlanırken bir xəta baş verdi: ' + (err.message || 'Bilinməyən xəta'));
    } finally {
      setPdfHazirlaniyor(false);
    }
  };

  // 4. ÇAP ET (PRINT) / ADOBE PDF İLE YAZDIRMA
  const handleYazdir = () => {
    setYazdiriliyor(true);

    try {
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Kargo Manifestosu - KNB Lojistik</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              font-size: 11px;
            }
            .header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 12px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .title {
              font-size: 16px;
              font-weight: 800;
              text-transform: uppercase;
              color: #0f172a;
            }
            .subtitle {
              font-size: 10px;
              color: #64748b;
            }
            .summary-box {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 8px 12px;
              margin-bottom: 12px;
              display: flex;
              gap: 24px;
              font-size: 11px;
            }
            .summary-item strong {
              color: #0f172a;
            }
            .debt {
              color: #b91c1c;
              font-weight: bold;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 12px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 5px 7px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #f1f5f9;
              font-weight: 700;
              font-size: 10px;
              text-transform: uppercase;
            }
            tr:nth-child(even) td {
              background-color: #fafafa;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 600;
              background: #e2e8f0;
            }
            .footer {
              margin-top: 14px;
              font-size: 9px;
              color: #64748b;
              display: flex;
              justify-content: space-between;
              border-top: 1px solid #e2e8f0;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">✈️ KNB Lojistik — Kanada ➔ Bakı Kargo Manifestosu & Çeki Listesi</div>
              <div class="subtitle">Marşrut: Toronto / Vancouver (Kanada) ➔ Heydər Əliyev Beynəlxalq Hava Limanı (GYD / Bakı)</div>
            </div>
            <div style="text-align: right;">
              <div><strong>Tarix:</strong> ${new Date().toLocaleDateString('az-AZ')}</div>
              <div class="subtitle">Çap vaxtı: ${new Date().toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>

          <div class="summary-box">
            <div class="summary-item">Toplam Bağlama: <strong>${dahilSiparisler.length}</strong></div>
            <div class="summary-item">Toplam Məhsul Sayı: <strong>${toplamAdet} ədəd</strong></div>
            <div class="summary-item">Toplam Dəyər: <strong>${toplamDeger.toFixed(2)} AZN</strong></div>
            <div class="summary-item debt">Bakıda Təhvil Zamanı Alınacaq Qalıq Borc: <strong>${toplamKalanBorc.toFixed(2)} AZN</strong></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 25px;" class="text-center">#</th>
                <th style="width: 130px;">Müştəri & Telefon</th>
                <th style="width: 90px;">Şəhər / Ünvan</th>
                <th>Məhsul Təsviri & Xüsusiyyət</th>
                <th style="width: 35px;" class="text-center">Say</th>
                <th style="width: 65px;" class="text-right">Məbləğ</th>
                <th style="width: 65px;" class="text-right">Qalıq Borc</th>
                <th style="width: 100px;">Lojistik / Kod</th>
                <th style="width: 140px;">Xüsusi Not & Bakı Təhvil Qeydi</th>
              </tr>
            </thead>
            <tbody>
              ${dahilSiparisler.map((s, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td>
                    <strong>${s.musteri_adi || '-'}</strong>
                    <div style="font-size: 10px; color: #475569;">${s.telefon_numarasi || ''}</div>
                  </td>
                  <td>
                    <div>${s.teslimat_sehri || 'Bakı'}</div>
                    <div style="font-size: 9px; color: #64748b;">${s.teslimat_adresi || ''}</div>
                  </td>
                  <td>
                    <div>${s.urun_aciklamasi || '-'}</div>
                    <div style="font-size: 9px; color: #64748b;">${[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}</div>
                  </td>
                  <td class="text-center"><strong>${s.adet || 1}</strong></td>
                  <td class="text-right">${(s.toplam_tutar || 0).toFixed(2)} AZN</td>
                  <td class="text-right ${s.kalan_tutar > 0 ? 'debt' : ''}">
                    ${s.kalan_tutar > 0 ? `${s.kalan_tutar.toFixed(2)} AZN` : '<span style="color: #059669;">Ödənilib</span>'}
                  </td>
                  <td>
                    <span class="badge">${getLojistikEtiketi(s.lojistik_durumu).label}</span>
                    ${s.uluslararasi_kargo_kodu ? `<div style="font-size: 9px; font-family: monospace; margin-top: 2px;">Kod: ${s.uluslararasi_kargo_kodu}</div>` : ''}
                    ${s.kanada_takip_kodu ? `<div style="font-size: 8px; color: #64748b;">${s.kanada_takip_kodu}</div>` : ''}
                  </td>
                  <td style="font-size: 9.5px;">
                    ${s.ozel_not ? `<div><strong>📌 Not:</strong> ${s.ozel_not}</div>` : ''}
                    ${s.baku_tahsilat_notu ? `<div style="color: #92400e; font-style: italic; margin-top: 2px;">💬 ${s.baku_tahsilat_notu}</div>` : ''}
                    ${!s.ozel_not && !s.baku_tahsilat_notu ? '—' : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <div>Bu sənəd KNB Ekspress Lojistik sistemi tərəfindən avtomatik tərtib edilmişdir.</div>
            <div>Çap tarixi: ${new Date().toLocaleString('az-AZ')}</div>
          </div>
        </body>
        </html>
      `;

      safePrintHtml(printContent, 'Kargo_Manifestosu');
    } catch (err) {
      console.error('Yazdırma hatası:', err);
      pdfIndir();
    } finally {
      setYazdiriliyor(false);
    }
  };

  // 5. METİN OLARAK KOPYALA
  const metinKopyala = () => {
    const metin = [
      `✈️ *KANADA ➔ BAKI KARGO MANIFESTOSU*`,
      `📅 Tarix: ${new Date().toLocaleDateString('az-AZ')}`,
      `📦 Toplam Bağlama: ${dahilSiparisler.length} ədəd | Məhsul Sayı: ${toplamAdet} ədəd`,
      `💰 Toplam Məbləğ: ${toplamDeger.toFixed(2)} AZN`,
      `🔴 Bakıda Təhvil Zamanı Alınacaq Qalıq Borc: ${toplamKalanBorc.toFixed(2)} AZN`,
      `------------------------------------------`,
      ...dahilSiparisler.map((s, idx) => {
        const borcStr = s.kalan_tutar > 0 ? `Qalıq Borc: ${s.kalan_tutar.toFixed(2)} AZN` : `Tam Ödənilib`;
        const kodStr = s.uluslararasi_kargo_kodu ? ` [Kod: ${s.uluslararasi_kargo_kodu}]` : '';
        const notStr = s.baku_tahsilat_notu ? `\n   💬 Bakı Notu: ${s.baku_tahsilat_notu}` : '';
        const ozelNotStr = s.ozel_not ? `\n   📌 Təlimat: ${s.ozel_not}` : '';
        return `${idx + 1}. *${s.musteri_adi}* (${s.telefon_numarasi || 'Nömrəsiz'}) - ${s.teslimat_sehri || 'Bakı'}\n   📦 ${s.urun_aciklamasi} (${s.adet || 1} ədəd) - ${s.toplam_tutar.toFixed(2)} AZN (${borcStr})${kodStr}${ozelNotStr}${notStr}`;
      }),
      `------------------------------------------`,
      `KNB Lojistik Toronto Anbarı Göndəriş Siyahısı`
    ].join('\n');

    navigator.clipboard.writeText(metin);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2500);
  };


  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full border border-slate-200 shadow-2xl overflow-hidden my-4 flex flex-col max-h-[92vh]">
        {/* Modal Üst Başlığı */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Plane className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white tracking-tight">
                  Kanada ➔ Bakı Kargo Manifestosu & Çeki Listesi
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Rəsmi Göndəriş Sənədi
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Hava kargo şirkəti, gömrük bəyannaməsi və Bakı təhvil-paylanış məntəqəsi üçün tam icmal
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Bağla"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4'lü Canlı İstatistik Özet Kartları */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-100/70 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Toplam Bağlama</div>
              <div className="text-base font-extrabold text-slate-900">
                {dahilSiparisler.length} <span className="text-xs font-normal text-slate-500">paket</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Toplam Məhsul</div>
              <div className="text-base font-extrabold text-slate-900">
                {toplamAdet} <span className="text-xs font-normal text-slate-500">ədəd</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">Sifariş Dəyəri</div>
              <div className="text-base font-extrabold text-slate-900">
                {toplamDeger.toFixed(2)} <span className="text-xs font-normal text-slate-500">AZN</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-300/80 shadow-xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold">
              !
            </div>
            <div>
              <div className="text-[11px] font-bold text-amber-900">Bakıda Təhsilat (Borc)</div>
              <div className="text-base font-extrabold text-amber-700">
                {toplamKalanBorc.toFixed(2)} <span className="text-xs font-normal text-amber-900">AZN</span>
              </div>
            </div>
          </div>
        </div>

        {/* Çok Yönlü Filtre ve Kontrol Paneli */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
          {/* 1. Satır: Lojistik Durumu ve İhracat Butonları */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-700 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                Mərhələ:
              </span>
              <button
                type="button"
                onClick={() => setLojistikFiltre('kargo_ve_depo')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  lojistikFiltre === 'kargo_ve_depo'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                ✈️ Yoldakı & Depodakı ({siparisler.filter(s => ['KANADA_DEPO', 'ULUSLARARASI_KARGO', 'BAKU_DAGITIM_ARKADAS'].includes(s.lojistik_durumu)).length})
              </button>
              <button
                type="button"
                onClick={() => setLojistikFiltre('ULUSLARARASI_KARGO')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  lojistikFiltre === 'ULUSLARARASI_KARGO'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Yalnız Uçuşda ({siparisler.filter(s => s.lojistik_durumu === 'ULUSLARARASI_KARGO').length})
              </button>
              <button
                type="button"
                onClick={() => setLojistikFiltre('KANADA_DEPO')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  lojistikFiltre === 'KANADA_DEPO'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Kanada Depo ({siparisler.filter(s => s.lojistik_durumu === 'KANADA_DEPO').length})
              </button>
              <button
                type="button"
                onClick={() => setLojistikFiltre('BAKU_DAGITIM_ARKADAS')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  lojistikFiltre === 'BAKU_DAGITIM_ARKADAS'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Bakı Paylanış ({siparisler.filter(s => s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS').length})
              </button>
              <button
                type="button"
                onClick={() => setLojistikFiltre('tumu')}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  lojistikFiltre === 'tumu'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Bütün Sifarişlər ({siparisler.length})
              </button>
            </div>

            {/* İhracat & Aksiyon Butonları */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={excelIndir}
                title="Formatlanmış səliqəli Excel (.xlsx) cədvəli kimi yüklə"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel (.xlsx) İndir</span>
              </button>

              <button
                type="button"
                onClick={pdfIndir}
                disabled={pdfHazirlaniyor}
                title="Rəsmi Çeki Listesi PDF faylı kimi birbaşa yüklə"
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{pdfHazirlaniyor ? 'Hazırlanır...' : 'PDF İndir'}</span>
              </button>

              <button
                type="button"
                onClick={handleYazdir}
                disabled={yazdiriliyor}
                title="Çap et və ya Adobe PDF ilə Saxla pəncərəsini aç"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{yazdiriliyor ? 'Çap açılır...' : 'Çap Et (Print)'}</span>
              </button>
            </div>
          </div>

          {/* 2. Satır: Tarih Aralığı, Şehir ve Arama */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
            {/* Tarih Aralığı Kontrolleri */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Tarix:
              </span>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleTarihPresetSec('hepsi')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tarihPreset === 'hepsi' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Bütün Vaxtlar
                </button>
                <button
                  type="button"
                  onClick={() => handleTarihPresetSec('bugun')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tarihPreset === 'bugun' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Bu Gün
                </button>
                <button
                  type="button"
                  onClick={() => handleTarihPresetSec('son7gun')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tarihPreset === 'son7gun' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Son 7 Gün
                </button>
                <button
                  type="button"
                  onClick={() => handleTarihPresetSec('buay')}
                  className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    tarihPreset === 'buay' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Bu Ay
                </button>
              </div>

              {/* Başlangıç ve Bitiş Tarih Seçicileri */}
              <div className="flex items-center gap-1 text-[11px] text-slate-600">
                <input
                  type="date"
                  value={baslangicTarih}
                  onChange={(e) => handleManuelTarihDegisimi('baslangic', e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  title="Başlanğıc Tarixi"
                />
                <span>➔</span>
                <input
                  type="date"
                  value={bitisTarih}
                  onChange={(e) => handleManuelTarihDegisimi('bitis', e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  title="Bitiş Tarixi"
                />
              </div>

              {/* Finans Filtresi (Yalnız Borcu Olanlar) */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => setFinansFiltre(finansFiltre === 'borclu' ? 'tumu' : 'borclu')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                    finansFiltre === 'borclu'
                      ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                  title="Yalnız Bakıda nağd pul ödəyəcək müştəriləri filtrlə"
                >
                  <span>🔴 Yalnız Qalıq Borcu Olanlar</span>
                  {finansFiltre === 'borclu' && <Check className="w-3 h-3 text-amber-700" />}
                </button>
              </div>

              {/* Şehir Seçimi */}
              {sehirler.length > 0 && (
                <div className="flex items-center gap-1">
                  <select
                    value={sehirFiltre}
                    onChange={(e) => setSehirFiltre(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
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

            {/* Arama Kutusu & Kopyalama */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Müştəri, tel, kod, məhsul..."
                  value={aramaMetni}
                  onChange={(e) => setAramaMetni(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-44 md:w-56"
                />
                {aramaMetni && (
                  <button
                    onClick={() => setAramaMetni('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              {(lojistikFiltre !== 'kargo_ve_depo' || finansFiltre !== 'tumu' || sehirFiltre !== 'tumu' || baslangicTarih || bitisTarih || aramaMetni) && (
                <button
                  type="button"
                  onClick={filtreleriSifirla}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  title="Bütün filtrləri sıfırla"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={metinKopyala}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="WhatsApp kurye/dağıtıcı mesajı formatında kopyala"
              >
                {kopyalandi ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>WhatsApp Mətni</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={csvIndir}
                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                title="Köhnə sistemlər üçün sadə CSV formatı"
              >
                CSV
              </button>
            </div>
          </div>
        </div>

        {/* Tablo İçeriği */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* Manifesto Başlık Özeti */}
          <div className="mb-3 pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight uppercase flex items-center gap-1.5">
                <span>KNB Lojistik — Göndəriş Manifestosu</span>
                <span className="text-xs font-bold text-blue-600 normal-case bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {dahilSiparisler.length} Bağlama
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Marşrut: Toronto / Vancouver (Kanada) ➔ Heydər Əliyev Beynəlxalq Hava Limanı (GYD / Bakı)
              </p>
            </div>
            <div className="text-right text-xs">
              <div className="font-bold text-slate-800">
                Tarix: {new Date().toLocaleDateString('az-AZ')}
              </div>
              <div className="text-slate-500 text-[11px]">
                {baslangicTarih || bitisTarih ? (
                  <span className="text-blue-700 font-medium">
                    Filtir: {baslangicTarih || 'Əvvəl'} ➔ {bitisTarih || 'İndiyədək'}
                  </span>
                ) : (
                  <span>Bütün aktiv sifarişlər</span>
                )}
              </div>
            </div>
          </div>

          {dahilSiparisler.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-300">
              <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <div className="font-bold text-slate-600 text-sm">Seçilmiş filtrə uyğun bağlama tapılmadı.</div>
              <p className="text-slate-400 mt-1 max-w-sm mx-auto">
                Tarix aralığını və ya filtr meyarlarını dəyişdirərək təkrar yoxlayın.
              </p>
              <button
                type="button"
                onClick={filtreleriSifirla}
                className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Filtrləri Sıfırla</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 shadow-xs">
                  <tr>
                    <th className="p-2.5 w-8 text-center">#</th>
                    <th className="p-2.5">Müştəri & Əlaqə</th>
                    <th className="p-2.5">Şəhər / Ünvan</th>
                    <th className="p-2.5">Məhsul & Təsvir</th>
                    <th className="p-2.5 text-center">Say</th>
                    <th className="p-2.5 text-right">Məbləğ</th>
                    <th className="p-2.5 text-right">Qalıq Borc</th>
                    <th className="p-2.5">Lojistik Mərhələsi</th>
                    <th className="p-2.5">Xüsusi Təlimat & Bakı Notu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dahilSiparisler.map((s, index) => {
                    const lojRozet = getLojistikEtiketi(s.lojistik_durumu);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2.5 text-slate-400 font-mono text-[11px] text-center">
                          {index + 1}
                        </td>
                        <td className="p-2.5">
                          <div className="font-bold text-slate-900">{s.musteri_adi || 'Adsız Müştəri'}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{s.telefon_numarasi || 'Nömrə yoxdur'}</div>
                          {s.olusturma_tarihi && (
                            <div className="text-[10px] text-slate-400">
                              {s.olusturma_tarihi.slice(0, 10)}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="font-semibold text-slate-800 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{s.teslimat_sehri || 'Bakı'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-2 max-w-[140px]">
                            {s.teslimat_adresi || 'Bakı daxili'}
                          </div>
                        </td>
                        <td className="p-2.5 max-w-xs">
                          <div className="font-medium text-slate-900">{s.urun_aciklamasi}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {[s.beden_veya_olcu, s.renk].filter(Boolean).join(' • ')}
                          </div>
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-900">
                          {s.adet || 1}
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {(s.toplam_tutar || 0).toFixed(2)} {s.para_birimi || 'AZN'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Ödənilib: {(s.alinan_tutar || 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="p-2.5 text-right whitespace-nowrap">
                          {s.kalan_tutar > 0 ? (
                            <div className="bg-amber-50 text-amber-900 border border-amber-300 rounded px-2 py-0.5 inline-block text-right">
                              <div className="font-extrabold text-amber-800">
                                {s.kalan_tutar.toFixed(2)} {s.para_birimi || 'AZN'}
                              </div>
                              <div className="text-[9px] font-bold text-amber-700 uppercase">Bakıda Alınacaq</div>
                            </div>
                          ) : (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              ✓ Ödənilib
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${lojRozet.color}`}>
                            {lojRozet.label}
                          </span>
                          {s.uluslararasi_kargo_kodu && (
                            <div className="text-[10px] text-blue-700 font-mono font-bold mt-1">
                              Kod: {s.uluslararasi_kargo_kodu}
                            </div>
                          )}
                          {s.kanada_takip_kodu && (
                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                              Kanada: {s.kanada_takip_kodu}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 max-w-xs space-y-1">
                          {s.ozel_not && (
                            <div className="text-[10px] text-slate-800 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                              <span className="font-bold text-blue-700">📌 Qeyd: </span>
                              {s.ozel_not}
                            </div>
                          )}
                          {s.baku_tahsilat_notu && (
                            <div className="text-[10px] text-amber-950 bg-amber-50/90 p-1.5 rounded-lg border border-amber-300 font-medium">
                              <span className="font-bold text-amber-800">💬 Bakı Notu: </span>
                              {s.baku_tahsilat_notu}
                            </div>
                          )}
                          {!s.ozel_not && !s.baku_tahsilat_notu && (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Manifesto Alt İmzalı Bəyannamə və Yekun */}
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="text-slate-600 max-w-lg">
              <span className="font-bold text-slate-800">Bəyannamə: </span>
              Bu manifestodakı bütün bağlamalar təhlükəsizlik və gömrük qaydalarına uyğun Toronto anbarında təhvil verilmiş və qeydiyyata alınmışdır.
            </div>
            <div className="flex flex-wrap items-center gap-4 font-bold text-slate-900 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
              <span>Toplam Bağlama: <span className="text-blue-600">{dahilSiparisler.length}</span></span>
              <span>Toplam Ədəd: <span className="text-purple-600">{toplamAdet}</span></span>
              <span>Cəmi Məbləğ: <span className="text-emerald-600">{toplamDeger.toFixed(2)} AZN</span></span>
              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Alınacaq Borc: {toplamKalanBorc.toFixed(2)} AZN
              </span>
            </div>
          </div>
        </div>

        {/* Modal Alt Kapatma Çubuğu */}
        <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {dahilSiparisler.length > 0 && (
              <span>Göstərilən: <strong>{dahilSiparisler.length}</strong> / {siparisler.length} sifariş</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={excelIndir}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel İndir (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={pdfIndir}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF İndir</span>
            </button>
            <button
              type="button"
              onClick={onKapat}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              Pəncərəni Bağla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
