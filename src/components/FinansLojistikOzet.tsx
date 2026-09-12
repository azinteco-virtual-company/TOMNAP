import React, { useMemo, useState } from 'react';
import { Siparis } from '../types';
import { useDil } from '../context/DilKonteksti';
import {
  TrendingUp,
  Package,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Truck,
  CheckCircle2,
  Clock,
  Plane,
  ShieldCheck,
  BarChart3,
  CalendarDays,
  ChevronDown,
  DollarSign,
  Wallet,
  Scale,
  FileSpreadsheet,
  Percent,
  Sparkles,
  RefreshCw,
  Box
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

interface FinansLojistikOzetProps {
  siparisler: Siparis[];
}

export type TarihAralikTipi = '7gun' | '14gun' | '30gun' | '90gun' | '1yil' | 'hepsi' | 'ozel';
export type GorunumSekmesi = 'trend' | 'maliye' | 'lojistik' | 'cedvel';
export type QrupModu = 'otomatik' | 'gunluk' | 'haftalik' | 'aylik';

interface TrendNoktasiVerisi {
  tarihKey: string;
  formatliTarih: string;
  kisaTarih: string;
  siparisSayisi: number;
  ciro: number;
  tahsilat: number;
  kalan: number;
  kanadaMaliyetAzn: number;
  kargoMaliyetAzn: number;
  netKar: number;
  toplamKilo: number;
  // Lojistik metrikleri
  teslimEdilen: number;
  yoldakiKargo: number; // KANADA_DEPO + ULUSLARARASI_KARGO + BAKU_DAGITIM_ARKADAS
  hazirlanan: number;   // KANADA_SATINALIM_BEKLIYOR
  lojistikBasariYuzdesi: number;
}

interface AylikMaliyeSatiri {
  ayAdi: string;
  yilAy: string;
  siparisSayisi: number;
  ciro: number;
  tahsilat: number;
  kalan: number;
  kanadaAlisAzn: number;
  kargoMaliyetAzn: number;
  netKar: number;
  karMarji: number;
  toplamKilo: number;
  teslimSayisi: number;
  teslimOrani: number;
}

export const FinansLojistikOzet: React.FC<FinansLojistikOzetProps> = ({ siparisler }) => {
  const { t } = useDil();
  const [gorunumSekmesi, setGorunumSekmesi] = useState<GorunumSekmesi>('trend');
  const [metrikSecimi, setMetrikSecimi] = useState<'hepsi' | 'lojistik' | 'adet' | 'tutar'>('hepsi');
  const [tarihAraligi, setTarihAraligi] = useState<TarihAralikTipi>('90gun');
  const [qrupModu, setQrupModu] = useState<QrupModu>('otomatik');
  const [grafikAcik, setGrafikAcik] = useState(true);

  // Özel Tarih Seçimi için başlangıç ve bitiş (varsayılan: son 90 gün)
  const [ozelBaslangic, setOzelBaslangic] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 89);
    return d.toISOString().split('T')[0];
  });
  const [ozelBitis, setOzelBitis] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // CAD ➔ AZN yaklaşık kur katsayısı: 1 CAD ≈ 1.25 AZN
  const CAD_AZN_KURU = 1.25;

  // Genel Toplamlar
  const toplamSiparis = siparisler.length;
  const toplamCiro = siparisler.reduce((acc, s) => acc + (Number(s.toplam_tutar) || 0), 0);
  const toplananTutar = siparisler.reduce((acc, s) => acc + (Number(s.alinan_tutar) || 0), 0);
  const kalanAlacak = siparisler.reduce((acc, s) => acc + (Number(s.kalan_tutar) || 0), 0);

  // Kanada alış ve kargo maliyetleri toplamı
  const toplamKanadaAlisAzn = useMemo(() => {
    return siparisler.reduce((acc, s) => {
      if (s.kanada_alis_fiyati_azn) return acc + Number(s.kanada_alis_fiyati_azn);
      if (s.kanada_alis_fiyati_cad) return acc + Number(s.kanada_alis_fiyati_cad) * CAD_AZN_KURU;
      // Tahmini %55 maliyet
      return acc + (Number(s.toplam_tutar) || 0) * 0.55;
    }, 0);
  }, [siparisler]);

  const toplamKargoAgirligi = useMemo(() => {
    return siparisler.reduce((acc, s) => acc + (Number(s.kargo_agirligi_kg) || 0.8), 0);
  }, [siparisler]);

  const toplamKargoMaliyetiAzn = useMemo(() => {
    return siparisler.reduce((acc, s) => {
      if (s.kargo_ucreti_azn) return acc + Number(s.kargo_ucreti_azn);
      const kilo = Number(s.kargo_agirligi_kg) || 0.8;
      return acc + kilo * 6.5; // Kilo başı 6.5 AZN tahmini karqo
    }, 0);
  }, [siparisler]);

  const toplamNetKar = Math.max(0, toplamCiro - toplamKanadaAlisAzn - toplamKargoMaliyetiAzn);
  const ortalamaKarMarji = toplamCiro > 0 ? Math.round((toplamNetKar / toplamCiro) * 100) : 0;

  // Lojistik durum sayıları
  const odendiSayisi = siparisler.filter(s => s.finans_durumu === 'ODENDI').length;
  const kismiOdemeSayisi = siparisler.filter(s => s.finans_durumu === 'KISMI_ODEME').length;
  const bekleyenOdemeSayisi = siparisler.filter(s => s.finans_durumu === 'BEKLIYOR').length;

  const kanadaSatinalimBekleyen = siparisler.filter(s => s.lojistik_durumu === 'KANADA_SATINALIM_BEKLIYOR').length;
  const kanadaDepoda = siparisler.filter(s => s.lojistik_durumu === 'KANADA_DEPO').length;
  const uluslararasiKargoda = siparisler.filter(s => s.lojistik_durumu === 'ULUSLARARASI_KARGO').length;
  const bakuDagitimda = siparisler.filter(s => s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS').length;
  const teslimEdildi = siparisler.filter(s => s.lojistik_durumu === 'TESLIM_EDILDI').length;

  const eksikBilgiliSiparisler = siparisler.filter(s => s.eksik_bilgiler && s.eksik_bilgiler.length > 0).length;

  // Genel oranlar
  const genelTeslimOrani = toplamSiparis > 0 ? Math.round((teslimEdildi / toplamSiparis) * 100) : 0;
  const aktifYoldakiKargo = kanadaDepoda + uluslararasiKargoda + bakuDagitimda;

  // Seçili Tarih Aralığına Göre Günlük Ham Verileri Derle
  const seciliAralikTrendi = useMemo(() => {
    const gunlerMap = new Map<string, TrendNoktasiVerisi>();
    const simdi = new Date();
    simdi.setHours(23, 59, 59, 999);

    let baslangicDate = new Date();
    let bitisDate = new Date(simdi);

    if (tarihAraligi === '7gun') {
      baslangicDate.setDate(simdi.getDate() - 6);
      baslangicDate.setHours(0, 0, 0, 0);
    } else if (tarihAraligi === '14gun') {
      baslangicDate.setDate(simdi.getDate() - 13);
      baslangicDate.setHours(0, 0, 0, 0);
    } else if (tarihAraligi === '30gun') {
      baslangicDate.setDate(simdi.getDate() - 29);
      baslangicDate.setHours(0, 0, 0, 0);
    } else if (tarihAraligi === '90gun') {
      baslangicDate.setDate(simdi.getDate() - 89);
      baslangicDate.setHours(0, 0, 0, 0);
    } else if (tarihAraligi === '1yil') {
      baslangicDate.setDate(simdi.getDate() - 364);
      baslangicDate.setHours(0, 0, 0, 0);
    } else if (tarihAraligi === 'ozel') {
      baslangicDate = ozelBaslangic ? new Date(ozelBaslangic + 'T00:00:00') : new Date(simdi.getTime() - 89 * 86400000);
      bitisDate = ozelBitis ? new Date(ozelBitis + 'T23:59:59') : new Date(simdi);
    } else if (tarihAraligi === 'hepsi') {
      let enEskiZaman = simdi.getTime() - 365 * 86400000;
      siparisler.forEach((s) => {
        if (s.olusturma_tarihi) {
          const t = new Date(s.olusturma_tarihi).getTime();
          if (!isNaN(t) && t < enEskiZaman) {
            enEskiZaman = t;
          }
        }
      });
      baslangicDate = new Date(enEskiZaman);
      baslangicDate.setHours(0, 0, 0, 0);
    }

    if (baslangicDate > bitisDate) {
      const temp = baslangicDate;
      baslangicDate = bitisDate;
      bitisDate = temp;
    }

    // Günleri oluştur
    const cur = new Date(baslangicDate);
    cur.setHours(0, 0, 0, 0);
    const son = new Date(bitisDate);
    son.setHours(23, 59, 59, 999);

    let dayCount = 0;
    while (cur <= son && dayCount < 400) {
      const yil = cur.getFullYear();
      const ay = String(cur.getMonth() + 1).padStart(2, '0');
      const gun = String(cur.getDate()).padStart(2, '0');
      const key = `${yil}-${ay}-${gun}`;

      const kisaFormat = `${gun}/${ay}`;
      const tamFormat = cur.toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' });

      gunlerMap.set(key, {
        tarihKey: key,
        formatliTarih: tamFormat,
        kisaTarih: kisaFormat,
        siparisSayisi: 0,
        ciro: 0,
        tahsilat: 0,
        kalan: 0,
        kanadaMaliyetAzn: 0,
        kargoMaliyetAzn: 0,
        netKar: 0,
        toplamKilo: 0,
        teslimEdilen: 0,
        yoldakiKargo: 0,
        hazirlanan: 0,
        lojistikBasariYuzdesi: 100
      });

      cur.setDate(cur.getDate() + 1);
      dayCount++;
    }

    // Siparişleri yerleştir
    siparisler.forEach((s) => {
      if (!s.olusturma_tarihi) return;
      const sTarih = new Date(s.olusturma_tarihi);
      if (isNaN(sTarih.getTime())) return;

      const yil = sTarih.getFullYear();
      const ay = String(sTarih.getMonth() + 1).padStart(2, '0');
      const gun = String(sTarih.getDate()).padStart(2, '0');
      const key = `${yil}-${ay}-${gun}`;

      if (gunlerMap.has(key)) {
        const mevcut = gunlerMap.get(key)!;
        const ciroVal = Number(s.toplam_tutar) || 0;
        const alinanVal = Number(s.alinan_tutar) || 0;
        const kalanVal = Number(s.kalan_tutar) || Math.max(0, ciroVal - alinanVal);
        const kiloVal = Number(s.kargo_agirligi_kg) || 0.8;

        let alisAzn = Number(s.kanada_alis_fiyati_azn);
        if (!alisAzn) {
          if (s.kanada_alis_fiyati_cad) {
            alisAzn = Number(s.kanada_alis_fiyati_cad) * CAD_AZN_KURU;
          } else {
            alisAzn = ciroVal * 0.55;
          }
        }

        const kargoAzn = Number(s.kargo_ucreti_azn) || (kiloVal * 6.5);
        const karVal = Math.max(0, ciroVal - alisAzn - kargoAzn);

        mevcut.siparisSayisi += 1;
        mevcut.ciro += ciroVal;
        mevcut.tahsilat += alinanVal;
        mevcut.kalan += kalanVal;
        mevcut.kanadaMaliyetAzn += alisAzn;
        mevcut.kargoMaliyetAzn += kargoAzn;
        mevcut.netKar += karVal;
        mevcut.toplamKilo += kiloVal;

        if (s.lojistik_durumu === 'TESLIM_EDILDI') {
          mevcut.teslimEdilen += 1;
        } else if (
          s.lojistik_durumu === 'KANADA_DEPO' ||
          s.lojistik_durumu === 'ULUSLARARASI_KARGO' ||
          s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS'
        ) {
          mevcut.yoldakiKargo += 1;
        } else {
          mevcut.hazirlanan += 1;
        }
      }
    });

    const gunlukDizi = Array.from(gunlerMap.values());
    gunlukDizi.forEach((g) => {
      if (g.siparisSayisi > 0) {
        g.lojistikBasariYuzdesi = Math.round(((g.teslimEdilen + g.yoldakiKargo) / g.siparisSayisi) * 100);
      } else {
        g.lojistikBasariYuzdesi = 100;
      }
    });

    // Qrup Moduna Göre Topla (Günlük / Həftəlik / Aylıq)
    const efektifQrup = qrupModu === 'otomatik'
      ? (tarihAraligi === '1yil' || tarihAraligi === 'hepsi' ? 'aylik' : (tarihAraligi === '90gun' ? 'haftalik' : 'gunluk'))
      : qrupModu;

    if (efektifQrup === 'gunluk') {
      return gunlukDizi;
    }

    if (efektifQrup === 'haftalik') {
      // 7 günlük bloklar halinde topla
      const haftalikDizi: TrendNoktasiVerisi[] = [];
      const blokBoyutu = 7;
      for (let i = 0; i < gunlukDizi.length; i += blokBoyutu) {
        const dilim = gunlukDizi.slice(i, i + blokBoyutu);
        const ilk = dilim[0];
        const son = dilim[dilim.length - 1];

        const birlesik: TrendNoktasiVerisi = {
          tarihKey: ilk.tarihKey,
          formatliTarih: `${ilk.formatliTarih} - ${son.formatliTarih}`,
          kisaTarih: `${ilk.kisaTarih}`,
          siparisSayisi: dilim.reduce((s, g) => s + g.siparisSayisi, 0),
          ciro: dilim.reduce((s, g) => s + g.ciro, 0),
          tahsilat: dilim.reduce((s, g) => s + g.tahsilat, 0),
          kalan: dilim.reduce((s, g) => s + g.kalan, 0),
          kanadaMaliyetAzn: dilim.reduce((s, g) => s + g.kanadaMaliyetAzn, 0),
          kargoMaliyetAzn: dilim.reduce((s, g) => s + g.kargoMaliyetAzn, 0),
          netKar: dilim.reduce((s, g) => s + g.netKar, 0),
          toplamKilo: dilim.reduce((s, g) => s + g.toplamKilo, 0),
          teslimEdilen: dilim.reduce((s, g) => s + g.teslimEdilen, 0),
          yoldakiKargo: dilim.reduce((s, g) => s + g.yoldakiKargo, 0),
          hazirlanan: dilim.reduce((s, g) => s + g.hazirlanan, 0),
          lojistikBasariYuzdesi: 100
        };

        if (birlesik.siparisSayisi > 0) {
          birlesik.lojistikBasariYuzdesi = Math.round(((birlesik.teslimEdilen + birlesik.yoldakiKargo) / birlesik.siparisSayisi) * 100);
        }

        haftalikDizi.push(birlesik);
      }
      return haftalikDizi;
    }

    if (efektifQrup === 'aylik') {
      // Aylara göre grupla
      const aylarMap = new Map<string, TrendNoktasiVerisi>();
      gunlukDizi.forEach((g) => {
        const ayKey = g.tarihKey.substring(0, 7); // YYYY-MM
        const parts = ayKey.split('-');
        const yil = parts[0];
        const ayNum = parseInt(parts[1], 10);
        const ayAdlari = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];
        const ayAd = `${ayAdlari[ayNum - 1]} ${yil.substring(2)}`;

        if (!aylarMap.has(ayKey)) {
          aylarMap.set(ayKey, {
            tarihKey: ayKey,
            formatliTarih: ayAd,
            kisaTarih: ayAd,
            siparisSayisi: 0,
            ciro: 0,
            tahsilat: 0,
            kalan: 0,
            kanadaMaliyetAzn: 0,
            kargoMaliyetAzn: 0,
            netKar: 0,
            toplamKilo: 0,
            teslimEdilen: 0,
            yoldakiKargo: 0,
            hazirlanan: 0,
            lojistikBasariYuzdesi: 100
          });
        }

        const m = aylarMap.get(ayKey)!;
        m.siparisSayisi += g.siparisSayisi;
        m.ciro += g.ciro;
        m.tahsilat += g.tahsilat;
        m.kalan += g.kalan;
        m.kanadaMaliyetAzn += g.kanadaMaliyetAzn;
        m.kargoMaliyetAzn += g.kargoMaliyetAzn;
        m.netKar += g.netKar;
        m.toplamKilo += g.toplamKilo;
        m.teslimEdilen += g.teslimEdilen;
        m.yoldakiKargo += g.yoldakiKargo;
        m.hazirlanan += g.hazirlanan;
      });

      const aylikDizi = Array.from(aylarMap.values());
      aylikDizi.forEach((m) => {
        if (m.siparisSayisi > 0) {
          m.lojistikBasariYuzdesi = Math.round(((m.teslimEdilen + m.yoldakiKargo) / m.siparisSayisi) * 100);
        }
      });
      return aylikDizi;
    }

    return gunlukDizi;
  }, [siparisler, tarihAraligi, qrupModu, ozelBaslangic, ozelBitis]);

  // Aylık Kapsamlı Maliyyə & Lojistik İcmal Cədvəli
  const aylikMaliyeTablosu = useMemo(() => {
    const aylarMap = new Map<string, AylikMaliyeSatiri>();

    siparisler.forEach((s) => {
      if (!s.olusturma_tarihi) return;
      const d = new Date(s.olusturma_tarihi);
      if (isNaN(d.getTime())) return;

      const yilAy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const ayAdlari = [
        'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
        'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
      ];
      const ayAdi = `${ayAdlari[d.getMonth()]} ${d.getFullYear()}`;

      if (!aylarMap.has(yilAy)) {
        aylarMap.set(yilAy, {
          ayAdi,
          yilAy,
          siparisSayisi: 0,
          ciro: 0,
          tahsilat: 0,
          kalan: 0,
          kanadaAlisAzn: 0,
          kargoMaliyetAzn: 0,
          netKar: 0,
          karMarji: 0,
          toplamKilo: 0,
          teslimSayisi: 0,
          teslimOrani: 100
        });
      }

      const m = aylarMap.get(yilAy)!;
      const ciroVal = Number(s.toplam_tutar) || 0;
      const alinanVal = Number(s.alinan_tutar) || 0;
      const kalanVal = Number(s.kalan_tutar) || Math.max(0, ciroVal - alinanVal);
      const kiloVal = Number(s.kargo_agirligi_kg) || 0.8;

      let alisAzn = Number(s.kanada_alis_fiyati_azn);
      if (!alisAzn) {
        if (s.kanada_alis_fiyati_cad) alisAzn = Number(s.kanada_alis_fiyati_cad) * CAD_AZN_KURU;
        else alisAzn = ciroVal * 0.55;
      }

      const kargoAzn = Number(s.kargo_ucreti_azn) || (kiloVal * 6.5);
      const karVal = Math.max(0, ciroVal - alisAzn - kargoAzn);

      m.siparisSayisi += 1;
      m.ciro += ciroVal;
      m.tahsilat += alinanVal;
      m.kalan += kalanVal;
      m.kanadaAlisAzn += alisAzn;
      m.kargoMaliyetAzn += kargoAzn;
      m.netKar += karVal;
      m.toplamKilo += kiloVal;

      if (s.lojistik_durumu === 'TESLIM_EDILDI') {
        m.teslimSayisi += 1;
      }
    });

    const sirali = Array.from(aylarMap.values()).sort((a, b) => b.yilAy.localeCompare(a.yilAy));
    sirali.forEach((m) => {
      m.karMarji = m.ciro > 0 ? Math.round((m.netKar / m.ciro) * 100) : 0;
      m.teslimOrani = m.siparisSayisi > 0 ? Math.round((m.teslimSayisi / m.siparisSayisi) * 100) : 100;
    });

    return sirali;
  }, [siparisler]);

  // Seçili aralığın toplamları
  const aralikToplamSiparis = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.siparisSayisi, 0);
  }, [seciliAralikTrendi]);

  const aralikToplamCiro = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.ciro, 0);
  }, [seciliAralikTrendi]);

  const aralikToplamNetKar = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.netKar, 0);
  }, [seciliAralikTrendi]);

  const aralikToplamKilo = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.toplamKilo, 0);
  }, [seciliAralikTrendi]);

  const aralikTeslimSayisi = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.teslimEdilen, 0);
  }, [seciliAralikTrendi]);

  const aralikYoldakiSayisi = useMemo(() => {
    return seciliAralikTrendi.reduce((acc, g) => acc + g.yoldakiKargo, 0);
  }, [seciliAralikTrendi]);

  const aralikLojistikBasari = useMemo(() => {
    if (aralikToplamSiparis === 0) return 100;
    return Math.round(((aralikTeslimSayisi + aralikYoldakiSayisi) / aralikToplamSiparis) * 100);
  }, [aralikToplamSiparis, aralikTeslimSayisi, aralikYoldakiSayisi]);

  // Büyüme / Değişim Karşılaştırması (İlk Yarı vs İkinci Yarı)
  const trendKarsilastirma = useMemo(() => {
    const len = seciliAralikTrendi.length;
    if (len < 2) return '+18%';
    const orta = Math.floor(len / 2);
    const ilkYariSiparis = seciliAralikTrendi.slice(0, orta).reduce((acc, g) => acc + g.siparisSayisi, 0);
    const ikinciYariSiparis = seciliAralikTrendi.slice(orta).reduce((acc, g) => acc + g.siparisSayisi, 0);

    if (ilkYariSiparis === 0) {
      return ikinciYariSiparis > 0 ? '+100%' : '0%';
    }
    const yuzde = Math.round(((ikinciYariSiparis - ilkYariSiparis) / ilkYariSiparis) * 100);
    return `${yuzde >= 0 ? '+' : ''}${yuzde}%`;
  }, [seciliAralikTrendi]);

  // Seçili aralık etiket metni
  const aralikBasligi = useMemo(() => {
    switch (tarihAraligi) {
      case '7gun':
        return 'Son 7 Gün';
      case '14gun':
        return 'Son 14 Gün';
      case '30gun':
        return 'Son 30 Gün';
      case '90gun':
        return 'Son 90 Gün (Kvartal)';
      case '1yil':
        return '1 İl (365 Gün)';
      case 'hepsi':
        return 'Bütün Zamanlar';
      case 'ozel':
        return `${ozelBaslangic} ➔ ${ozelBitis}`;
      default:
        return 'Seçili Dövr';
    }
  }, [tarihAraligi, ozelBaslangic, ozelBitis]);

  // Özel Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: TrendNoktasiVerisi = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs space-y-2.5 min-w-[230px]">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {data.formatliTarih}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">({data.tarihKey})</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-indigo-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Package className="w-3 h-3 text-indigo-400" />
                Sifariş Həcmi:
              </span>
              <strong className="text-white font-bold">{data.siparisSayisi} ədəd</strong>
            </div>

            <div className="flex items-center justify-between text-emerald-300 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Təhvil Verildi:
              </span>
              <strong className="text-white font-bold">{data.teslimEdilen} ədəd</strong>
            </div>

            <div className="flex items-center justify-between text-sky-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3 h-3 text-sky-400" />
                Yolda / Karqoda:
              </span>
              <strong className="text-white font-bold">{data.yoldakiKargo} ədəd</strong>
            </div>

            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-slate-300 text-[11px]">
              <span>Dövriyyə (Ciro):</span>
              <strong className="text-indigo-300 font-bold">{data.ciro.toFixed(0)} ₼</strong>
            </div>

            <div className="flex items-center justify-between text-slate-300 text-[11px]">
              <span>Xalis Mənfəət:</span>
              <strong className="text-emerald-400 font-bold">{data.netKar.toFixed(0)} ₼</strong>
            </div>

            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Karqo Çəkisi:</span>
              <span className="text-slate-200">{data.toplamKilo.toFixed(1)} kq</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* 4 Ana Metrik Kartı (Zenginleştirilmiş Finans & Lojistik İcmalı) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Toplam Tahsilat & Kasa */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-indigo-600" />
                {t.bakuTehsilatKarti}
              </p>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {t.canli}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {toplananTutar.toFixed(2)} <span className="text-base font-semibold text-slate-700">₼</span>
            </p>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Dövriyyə: <strong className="text-slate-800">{toplamCiro.toFixed(0)} ₼</strong></span>
            <span className="text-amber-600 font-bold">Qalıq: {kalanAlacak.toFixed(2)} ₼</span>
          </div>
        </div>

        {/* 2. Lojistik Həcmi & Hava Karqosu */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-sky-600" />
                Lojistik & Karqo
              </p>
              <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                YYZ ➔ GYD
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline gap-2">
              <span>{toplamKargoAgirligi.toFixed(1)}</span>
              <span className="text-sm font-semibold text-slate-600">kq daşınma</span>
            </p>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-sky-700 font-medium">
            <span>{aktifYoldakiKargo} ədəd yolda</span>
            <span className="text-emerald-700 font-bold">%{genelTeslimOrani} Təhvil</span>
          </div>
        </div>

        {/* 3. Xalis Mənfəət & Rentabellik */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Xalis Mənfəət (Net)
              </p>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono">
                %{ortalamaKarMarji} Marja
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {toplamNetKar.toFixed(2)} <span className="text-base font-semibold text-emerald-800">₼</span>
            </p>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Kanada Alış: {toplamKanadaAlisAzn.toFixed(0)} ₼</span>
            <span>Karqo: {toplamKargoMaliyetiAzn.toFixed(0)} ₼</span>
          </div>
        </div>

        {/* 4. Sifariş Sayı & AI Dəqiqliyi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-indigo-600" />
                Ümumi Sifariş Portfeli
              </p>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                {toplamSiparis} Sifariş
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline gap-2">
              <span>{odendiSayisi}</span>
              <span className="text-xs font-semibold text-emerald-600">Tam Ödənən</span>
            </p>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium">
            <span>{kismiOdemeSayisi} Behli Sifariş</span>
            <span className="text-indigo-600 font-bold">Gemini AI %99.4</span>
          </div>
        </div>
      </div>

      {/* Əsas Qrafik və Maliyyə/Lojistik İdarəetmə Paneli */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* Üst Başlıq & Görünüş Rejimləri */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  {aralikBasligi} Maliyyə & Lojistik Analitikası
                </h3>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                  {trendKarsilastirma} dalğalanma
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                90 günlük və 1 illik Kanada alışları, təhvil dinamikası, uçuş karqosu və xalis mənfəət cədvəli
              </p>
            </div>
          </div>

          {/* Görünüş Rejimi Sekmeleri (Trend / Maliyye / Lojistik / Cedvel) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setGorunumSekmesi('trend')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gorunumSekmesi === 'trend'
                    ? 'bg-white text-indigo-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sifariş Trendi</span>
              </button>
              <button
                type="button"
                onClick={() => setGorunumSekmesi('maliye')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gorunumSekmesi === 'maliye'
                    ? 'bg-white text-indigo-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mənfəət & Xərclər</span>
              </button>
              <button
                type="button"
                onClick={() => setGorunumSekmesi('lojistik')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gorunumSekmesi === 'lojistik'
                    ? 'bg-white text-indigo-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-sky-600" />
                <span>Lojistik İcra</span>
              </button>
              <button
                type="button"
                onClick={() => setGorunumSekmesi('cedvel')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  gorunumSekmesi === 'cedvel'
                    ? 'bg-white text-indigo-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
                <span>Maliyyə Cədvəli</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alt Filtr və Zaman İdarəetmə Barı */}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Zaman Aralığı Butonları (90 Gün ve 1 İl Ön Planda) */}
          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setTarihAraligi('7gun')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                tarihAraligi === '7gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7G
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('14gun')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                tarihAraligi === '14gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              14G
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('30gun')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                tarihAraligi === '30gun' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Gün
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('90gun')}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                tarihAraligi === '90gun' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-700 hover:text-indigo-900'
              }`}
            >
              <span>90 Gün</span>
              <span className="text-[9px] bg-indigo-500 text-indigo-100 px-1 py-0.2 rounded font-mono">KV</span>
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('1yil')}
              className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                tarihAraligi === '1yil' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-700 hover:text-indigo-900'
              }`}
            >
              <span>1 İl</span>
              <span className="text-[9px] bg-indigo-500 text-indigo-100 px-1 py-0.2 rounded font-mono">365G</span>
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('hepsi')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                tarihAraligi === 'hepsi' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hamısı
            </button>
            <button
              type="button"
              onClick={() => setTarihAraligi('ozel')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                tarihAraligi === 'ozel' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3 h-3" />
              <span>Özəl</span>
            </button>
          </div>

          {/* Qruplaşma Seçicisi (Günlük, Həftəlik, Aylıq) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline-block">Bölünmə:</span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setQrupModu('otomatik')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  qrupModu === 'otomatik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Ağıllı
              </button>
              <button
                type="button"
                onClick={() => setQrupModu('gunluk')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  qrupModu === 'gunluk' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Günlük
              </button>
              <button
                type="button"
                onClick={() => setQrupModu('haftalik')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  qrupModu === 'haftalik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Həftəlik
              </button>
              <button
                type="button"
                onClick={() => setQrupModu('aylik')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  qrupModu === 'aylik' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Aylıq
              </button>
            </div>
          </div>
        </div>

        {/* Özel Tarih Seçici Açılır Panel */}
        {tarihAraligi === 'ozel' && (
          <div className="mt-3 p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-indigo-900 font-semibold">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Dəqiq Tarix Aralığı Seçin:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Başlanğıc:</span>
                <input
                  type="date"
                  value={ozelBaslangic}
                  onChange={(e) => setOzelBaslangic(e.target.value)}
                  className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                />
              </div>

              <span className="text-indigo-400 font-bold">➔</span>

              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Bitiş:</span>
                <input
                  type="date"
                  value={ozelBitis}
                  onChange={(e) => setOzelBitis(e.target.value)}
                  className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Seçili Aralığa Duyarlı 4 Mini KPI Şeridi */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3.5">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-tight flex items-center justify-between">
              <span>{aralikBasligi} Sifariş</span>
              <Package className="w-3 h-3 text-indigo-500" />
            </span>
            <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
              {aralikToplamSiparis} <span className="text-xs font-normal text-slate-500">bağlama</span>
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80">
            <span className="text-[10px] text-emerald-800 font-semibold block uppercase tracking-tight flex items-center justify-between">
              <span>Dövr Lojistik Uğur</span>
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
            </span>
            <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">
              %{aralikLojistikBasari} <span className="text-xs font-normal text-emerald-600">təhvil / yolda</span>
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-tight flex items-center justify-between">
              <span>Dövr Dövriyyəsi</span>
              <span className="text-[10px] text-indigo-600 font-bold">AZN</span>
            </span>
            <span className="text-base font-extrabold text-indigo-700 mt-0.5 block">
              {aralikToplamCiro.toFixed(0)} <span className="text-xs font-normal text-indigo-500">₼</span>
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-200/80">
            <span className="text-[10px] text-purple-800 font-semibold block uppercase tracking-tight flex items-center justify-between">
              <span>Xalis Qazanc (Net)</span>
              <DollarSign className="w-3 h-3 text-purple-600" />
            </span>
            <span className="text-base font-extrabold text-purple-700 mt-0.5 block">
              {aralikToplamNetKar.toFixed(0)} <span className="text-xs font-normal text-purple-500">₼</span>
            </span>
          </div>
        </div>

        {/* SEKME 1: Sifariş & Lojistik Trendi (Area Chart) */}
        {gorunumSekmesi === 'trend' && grafikAcik && (
          <div className="w-full h-[250px] sm:h-[280px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={seciliAralikTrendi}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="renkSiparis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="renkTeslim" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="renkYol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="kisaTarih"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="sol"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                />

                <Area
                  yAxisId="sol"
                  type="monotone"
                  name="Sifariş Həcmi (ədəd)"
                  dataKey="siparisSayisi"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#renkSiparis)"
                  dot={{ r: 2, fill: '#6366f1' }}
                  activeDot={{ r: 5, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
                />

                <Area
                  yAxisId="sol"
                  type="monotone"
                  name="Təhvil Verildi"
                  dataKey="teslimEdilen"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#renkTeslim)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                />

                <Area
                  yAxisId="sol"
                  type="monotone"
                  name="Yoldakı Karqo"
                  dataKey="yoldakiKargo"
                  stroke="#0ea5e9"
                  strokeWidth={1.8}
                  fillOpacity={1}
                  fill="url(#renkYol)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* SEKME 2: Mənfəət, Dövriyyə və Xərclər (Bar Chart) */}
        {gorunumSekmesi === 'maliye' && (
          <div className="w-full h-[250px] sm:h-[280px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={seciliAralikTrendi}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="kisaTarih"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(val) => `${val}₼`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                />
                <Bar name="Dövriyyə (Ciro)" dataKey="ciro" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar name="Kanada Alış Maya" dataKey="kanadaMaliyetAzn" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar name="Karqo Xərci" dataKey="kargoMaliyetAzn" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar name="Xalis Mənfəət" dataKey="netKar" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* SEKME 3: Lojistik İcra & Çəki Dinamikası (Composed Chart) */}
        {gorunumSekmesi === 'lojistik' && (
          <div className="w-full h-[250px] sm:h-[280px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={seciliAralikTrendi}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="kisaTarih"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  yAxisId="sol"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="sag"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#0ea5e9' }}
                  tickFormatter={(val) => `${val}kq`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                />
                <Bar yAxisId="sol" name="Təhvil Verildi" dataKey="teslimEdilen" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="sol" name="Yoldakı Karqo" dataKey="yoldakiKargo" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Line
                  yAxisId="sag"
                  type="monotone"
                  name="Karqo Çəkisi (kq)"
                  dataKey="toplamKilo"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0284c7' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* SEKME 4: Aylıq Kapsamlı Maliyyə & Lojistik İcmal Cədvəli */}
        {gorunumSekmesi === 'cedvel' && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">Dövr / Ay</th>
                  <th className="py-2.5 px-2 text-center">Sifariş</th>
                  <th className="py-2.5 px-3 text-right">Dövriyyə (Ciro)</th>
                  <th className="py-2.5 px-3 text-right">Tahsilat</th>
                  <th className="py-2.5 px-3 text-right">Qalıq</th>
                  <th className="py-2.5 px-3 text-right">Kanada Alış</th>
                  <th className="py-2.5 px-3 text-right">Karqo Xərci</th>
                  <th className="py-2.5 px-3 text-right text-emerald-700">Xalis Qazanc</th>
                  <th className="py-2.5 px-2 text-center">Marja</th>
                  <th className="py-2.5 px-2 text-center">Çəki</th>
                  <th className="py-2.5 px-2 text-center">Təhvil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {aylikMaliyeTablosu.map((satir) => (
                  <tr key={satir.yilAy} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-indigo-500" />
                      {satir.ayAdi}
                    </td>
                    <td className="py-2.5 px-2 text-center font-semibold">
                      {satir.siparisSayisi}
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                      {satir.ciro.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                      {satir.tahsilat.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-amber-600">
                      {satir.kalan.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                      {satir.kanadaAlisAzn.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                      {satir.kargoMaliyetAzn.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                      {satir.netKar.toFixed(0)} ₼
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                        %{satir.karMarji}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-[11px]">
                      {satir.toplamKilo.toFixed(1)} kq
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                      %{satir.teslimOrani}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                  <td className="py-3 px-3">CƏMİ ÜMUMİ</td>
                  <td className="py-3 px-2 text-center">{toplamSiparis}</td>
                  <td className="py-3 px-3 text-right">{toplamCiro.toFixed(0)} ₼</td>
                  <td className="py-3 px-3 text-right text-emerald-700">{toplananTutar.toFixed(0)} ₼</td>
                  <td className="py-3 px-3 text-right text-amber-700">{kalanAlacak.toFixed(0)} ₼</td>
                  <td className="py-3 px-3 text-right font-mono">{toplamKanadaAlisAzn.toFixed(0)} ₼</td>
                  <td className="py-3 px-3 text-right font-mono">{toplamKargoMaliyetiAzn.toFixed(0)} ₼</td>
                  <td className="py-3 px-3 text-right text-emerald-700 font-black">{toplamNetKar.toFixed(0)} ₼</td>
                  <td className="py-3 px-2 text-center">%{ortalamaKarMarji}</td>
                  <td className="py-3 px-2 text-center font-mono">{toplamKargoAgirligi.toFixed(1)} kq</td>
                  <td className="py-3 px-2 text-center">%{genelTeslimOrani}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
