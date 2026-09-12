import React, { useMemo, useState } from 'react';
import { Siparis } from '../types';
import { useDil } from '../context/DilKonteksti';
import {
  TarihAralikTipi,
  GorunumSekmesi,
  QrupModu,
  TrendNoktasiVerisi,
  AylikMaliyeSatiri,
  MetrikKartlari,
  FinansToolbar,
  TrendGrafikleri,
  AylikMaliyeTablosu,
} from './finans';

export type { TarihAralikTipi, GorunumSekmesi, QrupModu };

interface FinansLojistikOzetProps {
  siparisler: Siparis[];
}

export const FinansLojistikOzet: React.FC<FinansLojistikOzetProps> = ({ siparisler }) => {
  const { t } = useDil();
  const [gorunumSekmesi, setGorunumSekmesi] = useState<GorunumSekmesi>('trend');
  const [tarihAraligi, setTarihAraligi] = useState<TarihAralikTipi>('90gun');
  const [qrupModu, setQrupModu] = useState<QrupModu>('otomatik');

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
  const odendiSayisi = siparisler.filter((s) => s.finans_durumu === 'ODENDI').length;
  const kanadaDepoda = siparisler.filter((s) => s.lojistik_durumu === 'KANADA_DEPO').length;
  const uluslararasiKargoda = siparisler.filter((s) => s.lojistik_durumu === 'ULUSLARARASI_KARGO').length;
  const bakuDagitimda = siparisler.filter((s) => s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS').length;
  const teslimEdildi = siparisler.filter((s) => s.lojistik_durumu === 'TESLIM_EDILDI').length;

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
          const tVal = new Date(s.olusturma_tarihi).getTime();
          if (!isNaN(tVal) && tVal < enEskiZaman) {
            enEskiZaman = tVal;
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
        lojistikBasariYuzdesi: 100,
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

        const kargoAzn = Number(s.kargo_ucreti_azn) || kiloVal * 6.5;
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
    const efektifQrup =
      qrupModu === 'otomatik'
        ? tarihAraligi === '1yil' || tarihAraligi === 'hepsi'
          ? 'aylik'
          : tarihAraligi === '90gun'
          ? 'haftalik'
          : 'gunluk'
        : qrupModu;

    if (efektifQrup === 'gunluk') {
      return gunlukDizi;
    }

    if (efektifQrup === 'haftalik') {
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
          lojistikBasariYuzdesi: 100,
        };

        if (birlesik.siparisSayisi > 0) {
          birlesik.lojistikBasariYuzdesi = Math.round(
            ((birlesik.teslimEdilen + birlesik.yoldakiKargo) / birlesik.siparisSayisi) * 100
          );
        }

        haftalikDizi.push(birlesik);
      }
      return haftalikDizi;
    }

    if (efektifQrup === 'aylik') {
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
            lojistikBasariYuzdesi: 100,
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
        'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
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
          teslimOrani: 100,
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

      const kargoAzn = Number(s.kargo_ucreti_azn) || kiloVal * 6.5;
      const netKarVal = Math.max(0, ciroVal - alisAzn - kargoAzn);

      m.siparisSayisi += 1;
      m.ciro += ciroVal;
      m.tahsilat += alinanVal;
      m.kalan += kalanVal;
      m.kanadaAlisAzn += alisAzn;
      m.kargoMaliyetAzn += kargoAzn;
      m.netKar += netKarVal;
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

  return (
    <div className="space-y-4">
      {/* 4 Ana Metrik Kartı */}
      <MetrikKartlari
        toplananTutar={toplananTutar}
        toplamCiro={toplamCiro}
        kalanAlacak={kalanAlacak}
        toplamKargoAgirligi={toplamKargoAgirligi}
        aktifYoldakiKargo={aktifYoldakiKargo}
        genelTeslimOrani={genelTeslimOrani}
        toplamSiparisSayisi={toplamSiparis}
        odenenSiparisSayisi={odendiSayisi}
        odemeYuzdesi={toplamSiparis > 0 ? Math.round((odendiSayisi / toplamSiparis) * 100) : 0}
        tahminiNetKar={toplamNetKar}
        toplamKanadaAlisMaliyetiAzn={toplamKanadaAlisAzn}
        toplamKargoMaliyetiAzn={toplamKargoMaliyetiAzn}
        t={t}
      />

      {/* Finans & Lojistik Analitika Paneli */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        {/* Toolbar & Zaman Filtresi */}
        <FinansToolbar
          aralikBasligi={aralikBasligi}
          trendKarsilastirma={trendKarsilastirma}
          gorunumSekmesi={gorunumSekmesi}
          setGorunumSekmesi={setGorunumSekmesi}
          tarihAraligi={tarihAraligi}
          setTarihAraligi={setTarihAraligi}
          qrupModu={qrupModu}
          setQrupModu={setQrupModu}
          ozelBaslangic={ozelBaslangic}
          setOzelBaslangic={setOzelBaslangic}
          ozelBitis={ozelBitis}
          setOzelBitis={setOzelBitis}
          aralikToplamSiparis={aralikToplamSiparis}
          aralikLojistikBasari={aralikLojistikBasari}
          aralikToplamCiro={aralikToplamCiro}
          aralikTahminiNetKar={aralikToplamNetKar}
        />

        {/* Grafikler (Trend, Maliye, Lojistik) */}
        {gorunumSekmesi !== 'cedvel' && (
          <TrendGrafikleri
            gorunumSekmesi={gorunumSekmesi}
            seciliAralikTrendi={seciliAralikTrendi}
          />
        )}

        {/* Cədvəl Görünüşü */}
        {gorunumSekmesi === 'cedvel' && (
          <AylikMaliyeTablosu
            aylikMaliyeTablosu={aylikMaliyeTablosu}
            toplamSiparis={toplamSiparis}
            toplamCiro={toplamCiro}
            toplananTutar={toplananTutar}
            kalanAlacak={kalanAlacak}
            toplamKanadaAlisAzn={toplamKanadaAlisAzn}
            toplamKargoMaliyetiAzn={toplamKargoMaliyetiAzn}
            toplamNetKar={toplamNetKar}
            ortalamaKarMarji={ortalamaKarMarji}
            toplamKargoAgirligi={toplamKargoAgirligi}
            genelTeslimOrani={genelTeslimOrani}
          />
        )}
      </div>
    </div>
  );
};
