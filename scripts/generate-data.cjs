const fs = require('fs');

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const musteriler = [
  { ad: 'Kəmalə Bədirbəyli', musId: 'mus-001', ig: '@kemale_bedirbeyli', tel: '+994 50 694 25 25', sehir: 'Gəncə', adres: 'Gəncə şəh., Ozan küç. 4', tip: 'SADIK_MUSTERI' },
  { ad: 'Aytən Məmmədova', musId: 'mus-002', ig: '@ayten_fashion_baku', tel: '+994 50 214 55 88', sehir: 'Bakı', adres: 'Nərimanov m/s, Təbriz küç. 55', tip: 'SADIK_MUSTERI' },
  { ad: 'Nərgiz Əliyeva', musId: 'mus-003', ig: '@nergiz_aliyeva_style', tel: '+994 55 312 88 44', sehir: 'Bakı', adres: 'Yasamal r., Həsən bəy Zərdabi 78', tip: 'VIP' },
  { ad: 'Leyla Hüseynova', musId: 'mus-004', ig: '@leyla.huseyn.baku', tel: '+994 70 821 44 90', sehir: 'Bakı', adres: 'Səbail r., Nizami küç. (Tarqovı)', tip: 'SADIK_MUSTERI' },
  { ad: 'Günel Qasımova', musId: 'mus-005', ig: '@gunel_qasimova_', tel: '+994 51 902 11 33', sehir: 'Sumqayıt', adres: 'Sumqayıt ş., 9-cu mkr, Sülh küç.', tip: 'TANIMADIK' },
  { ad: 'Rəna Sadıxova', musId: 'mus-006', ig: '@rena_sadikhova', tel: '+994 50 443 19 82', sehir: 'Bakı', adres: 'Xətai r., Xocalı pr. 14', tip: 'VIP' },
  { ad: 'Sevinc Vəliyeva', musId: 'mus-007', ig: '@sevinc_beauty_az', tel: '+994 55 601 77 22', sehir: 'Bakı', adres: 'Binəqədi r., Azadlıq pr. 102', tip: 'SADIK_MUSTERI' },
  { ad: 'Zəhra İsmayılova', musId: 'mus-008', ig: '@zehra_ismayil', tel: '+994 77 410 55 66', sehir: 'Mingəçevir', adres: 'Mingəçevir ş., Heydər Əliyev pr.', tip: 'TANIMADIK' },
  { ad: 'Fidan Kərimli', musId: 'mus-009', ig: '@fidan_kerimli', tel: '+994 55 700 88 11', sehir: 'Bakı', adres: 'İnşaatçılar m/s, Şərifzadə küç.', tip: 'AKRABA_YAKIN' },
  { ad: 'Səbinə Rüstəmova', musId: 'mus-010', ig: '@sabina_rustam', tel: '+994 50 611 78 90', sehir: 'Bakı', adres: 'İçərişəhər, Axundov bağı', tip: 'SADIK_MUSTERI' },
  { ad: 'Aynur Babayeva', musId: 'mus-011', ig: '@aynur_baku_trend', tel: '+994 50 882 34 19', sehir: 'Bakı', adres: 'Nəsimi r., 28 May m/s yaxınlığı', tip: 'SADIK_MUSTERI' },
  { ad: 'Elmira Paşayeva', musId: 'mus-012', ig: '@elmira_pashayeva', tel: '+994 55 209 88 77', sehir: 'Gəncə', adres: 'Gəncə ş., Nizami Gəncəvi pr. 11', tip: 'SADIK_MUSTERI' },
  { ad: 'Cəmilə Quliyeva', musId: 'mus-013', ig: '@cemile_quliyeva_official', tel: '+994 70 331 99 00', sehir: 'Bakı', adres: 'Nərimanov r., Aşıq Molla Cümə', tip: 'VIP' },
  { ad: 'Nigar Mehdiyeva', musId: 'mus-014', ig: '@nigar_mehdiyeva', tel: '+994 50 512 60 70', sehir: 'Bakı', adres: 'Xətai r., Əhmədli qəsəbəsi', tip: 'TANIMADIK' },
  { ad: 'Təranə Əsədova', musId: 'mus-015', ig: '@terane_asedova', tel: '+994 55 819 22 45', sehir: 'Lənkəran', adres: 'Lənkəran ş., Qala xiyabanı', tip: 'TANIMADIK' },
  { ad: 'Xədicə Məmmədli', musId: 'mus-016', ig: '@xedice_mammadli', tel: '+994 77 690 14 25', sehir: 'Bakı', adres: 'Elmlər Akademiyası m/s yanı', tip: 'SADIK_MUSTERI' },
  { ad: 'Vüsalə Tağıyeva', musId: 'mus-017', ig: '@vusala_tagiyeva', tel: '+994 50 310 90 80', sehir: 'Şəki', adres: 'Şəki ş., M.F.Axundov pr.', tip: 'TANIMADIK' }
];

const urunler = [
  { urun: 'Michael Kors Greenwich Saffiano Dəri Çanta', beden: 'Medium', renk: 'Qara / Qızılı Toka', magaza: 'Yorkdale Mall Michael Kors', alisCad: 88, satisAzn: 180, agirlik: 0.95 },
  { urun: 'On Running Cloud 5 İdman Qadın Qaçış Ayaqqabısı', beden: '38 Numara', renk: 'All White (Ağ)', magaza: 'Sporting Life Toronto', alisCad: 125, satisAzn: 235, agirlik: 1.1 },
  { urun: 'Lululemon Align High-Rise 25 İdman Taytı', beden: 'Size 4', renk: 'Black (Qara)', magaza: 'Lululemon Queen St W', alisCad: 68, satisAzn: 135, agirlik: 0.38 },
  { urun: 'Coach Dempsey Tote 22 Siqnatur Çanta', beden: 'Standart', renk: 'Qəhvəyi / Qara Loqo', magaza: 'Coach Outlet Halton Hills', alisCad: 135, satisAzn: 260, agirlik: 1.05 },
  { urun: 'Sephora Rare Beauty Likit Allıq & Tonal Set', beden: '160C / Hope', renk: 'Gül Çəhrayısı', magaza: 'Sephora Eaton Centre', alisCad: 52, satisAzn: 110, agirlik: 0.45 },
  { urun: 'Stanley Quencher H2.0 FlowState 40oz Termos', beden: '40 oz (1.18 L)', renk: 'Rose Quartz', magaza: 'Indigo Books Toronto', alisCad: 45, satisAzn: 95, agirlik: 0.85 },
  { urun: 'Zara Qadın Klassik Yun Palto', beden: 'M (38)', renk: 'Dəvə Yun (Camel)', magaza: 'Zara Toronto Eaton', alisCad: 90, satisAzn: 165, agirlik: 1.9 },
  { urun: 'Nike Dunk Low Retro Bəyaz/Qara (Panda)', beden: '40 Numara', renk: 'Black / White', magaza: 'Nike Store Bloor St', alisCad: 110, satisAzn: 215, agirlik: 1.25 },
  { urun: 'Apple AirPods Pro (2. Nəsil) USB-C', beden: 'Universal', renk: 'Bəyaz', magaza: 'Apple Yorkdale', alisCad: 230, satisAzn: 420, agirlik: 0.4 },
  { urun: 'Charlotte Tilbury Pillow Talk Dodaq Boyası Seti', beden: 'Standart', renk: 'Nude Pink', magaza: 'Holt Renfrew Toronto', alisCad: 60, satisAzn: 125, agirlik: 0.3 },
  { urun: 'UGG Classic Ultra Mini Qadın Qış Çəkməsi', beden: '37 Numara', renk: 'Chestnut', magaza: 'Nordstrom Rack Toronto', alisCad: 130, satisAzn: 245, agirlik: 1.35 },
  { urun: 'Tommy Hilfiger İkonik Kapşonlu İsti Sviter', beden: 'L Bədən', renk: 'Boz Melanj', magaza: 'Winners Bloor West', alisCad: 48, satisAzn: 95, agirlik: 0.8 },
  { urun: 'Sol de Janeiro Brazilian Crush Cheirosa 68 Mist', beden: '240 ml', renk: 'Tropik Floral', magaza: 'Sephora Bloor St', alisCad: 38, satisAzn: 75, agirlik: 0.42 },
  { urun: 'Marc Jacobs The Tote Bag Kiçik Boy Dəri Çanta', beden: 'Small', renk: 'Bej / Krem', magaza: 'Saks Fifth Avenue Toronto', alisCad: 160, satisAzn: 295, agirlik: 1.15 },
  { urun: 'Massimo Dutti 100% Kətan Zolaqlı Köynək', beden: 'S (36)', renk: 'Mavi / Ağ Zolaqlı', magaza: 'Massimo Dutti Yorkdale', alisCad: 55, satisAzn: 105, agirlik: 0.35 },
  { urun: 'Carter\'s Körpə Üçün 5-li Üzvi Pambıq Bodi', beden: '6-9 Ay', renk: 'Qarışıq Pastel', magaza: 'Carter\'s OshKosh Dufferin', alisCad: 28, satisAzn: 58, agirlik: 0.5 },
  { urun: 'New Balance 530 Unisex İdman Ayaqqabısı', beden: '39 Numara', renk: 'White / Silver / Navy', magaza: 'Foot Locker Yonge St', alisCad: 105, satisAzn: 198, agirlik: 1.15 },
  { urun: 'ALDO Qadın Bej Hündürdaban Ziyafət Ayaqqabısı', beden: '38 Numara', renk: 'Nude Bej', magaza: 'ALDO Shoes Eaton', alisCad: 62, satisAzn: 120, agirlik: 0.9 },
  { urun: 'Tory Burch Kira Chevron Dəri Kartqabı & Pulqabı', beden: 'Kompakt', renk: 'Karamel Qəhvəyi', magaza: 'Tory Burch Yorkdale', alisCad: 75, satisAzn: 145, agirlik: 0.32 },
  { urun: 'Dyson Airwrap Çoxfunksiyalı Fen Başlıq Aksesuarı', beden: 'Standart', renk: 'Mis / Nikel', magaza: 'Dyson Demo Store Yorkdale', alisCad: 110, satisAzn: 210, agirlik: 0.95 }
];

const kuryeler = [
  { ad: 'Elvin M. (Nərimanov/Mərkəz)', id: 'kurye-elvin', bolge: 'Nərimanov' },
  { ad: 'Rəşad K. (Yasamal/Elmlər)', id: 'kurye-resad', bolge: 'Yasamal' },
  { ad: 'Samir Q. (Xətai/Əhmədli)', id: 'kurye-samir', bolge: 'Xətai' },
  { ad: 'Vüqar T. (Gəncə/Rayonlar)', id: 'kurye-vuqar', bolge: 'Gəncə / Rayon' },
  { ad: 'Ofis / Mərkəzdən Təhvil', id: 'ofis-tahvil', bolge: 'Ofis' }
];

const kaynaklar = ['INSTAGRAM_LIVE', 'WHATSAPP', 'INSTAGRAM_DM', 'INSTAGRAM_REELS'];

const siparisler = [];

// 1. Aşama: KANADA_SATINALIM_BEKLIYOR (0 - 3 gün önce, 8 sipariş)
const satinalmaAralik = [
  { saat: 3, urunIdx: 0, musIdx: 0, kaynak: 'WHATSAPP', odeme: 'KISMI_ODEME', behOrani: 0.55 },
  { saat: 9, urunIdx: 2, musIdx: 1, kaynak: 'INSTAGRAM_LIVE', odeme: 'ODENDI', behOrani: 1.0 },
  { saat: 16, urunIdx: 3, musIdx: 2, kaynak: 'INSTAGRAM_DM', odeme: 'KISMI_ODEME', behOrani: 0.5 },
  { saat: 25, urunIdx: 5, musIdx: 3, kaynak: 'INSTAGRAM_LIVE', odeme: 'ODENDI', behOrani: 1.0 },
  { saat: 36, urunIdx: 7, musIdx: 4, kaynak: 'WHATSAPP', odeme: 'BEKLIYOR', behOrani: 0.0 },
  { saat: 45, urunIdx: 9, musIdx: 5, kaynak: 'INSTAGRAM_REELS', odeme: 'KISMI_ODEME', behOrani: 0.4 },
  { saat: 56, urunIdx: 12, musIdx: 6, kaynak: 'INSTAGRAM_DM', odeme: 'ODENDI', behOrani: 1.0 },
  { saat: 66, urunIdx: 14, musIdx: 7, kaynak: 'INSTAGRAM_LIVE', odeme: 'KISMI_ODEME', behOrani: 0.6 }
];

satinalmaAralik.forEach((item, idx) => {
  const m = musteriler[item.musIdx % musteriler.length];
  const u = urunler[item.urunIdx % urunler.length];
  const tarih = new Date(now - item.saat * HOUR).toISOString();
  const alinan = Math.round(u.satisAzn * item.behOrani);
  const kalan = u.satisAzn - alinan;

  siparisler.push({
    id: `sip-sat-${String(idx + 1).padStart(3, '0')}`,
    olusturma_tarihi: tarih,
    ham_mesaj: `${m.ad}: ${u.urun} (${u.beden}, ${u.renk}). ${item.odeme === 'ODENDI' ? 'Tam məbləği kartınıza ödədim.' : item.odeme === 'KISMI_ODEME' ? `${alinan} AZN beh ödədim, qalan ${kalan} AZN çatanda veriləcək.` : 'Ödənişi sabah edəcəm zəhmət olmasa ayırın.'}`,
    musteri_adi: m.ad,
    musteri_id: m.musId,
    musteri_tipi: m.tip,
    instagram_kullanici_adi: m.ig,
    telefon_numarasi: m.tel,
    teslimat_sehri: m.sehir,
    teslimat_adresi: m.adres,
    urun_aciklamasi: u.urun,
    beden_veya_olcu: u.beden,
    renk: u.renk,
    adet: 1,
    toplam_tutar: u.satisAzn,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    para_birimi: 'AZN',
    finans_durumu: item.odeme,
    lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
    baku_tahsilat_notu: kalan > 0 ? `${kalan} AZN qalıq məbləğ Bakıda kuryer təhvili zamanı toplanmalıdır.` : 'Bütün məbləğ ödənilib.',
    kanada_magaza_adi: u.magaza,
    kanada_alis_fiyati_cad: u.alisCad,
    kanada_alis_fiyati_azn: Math.round(u.alisCad * 1.25),
    kargo_agirligi_kg: u.agirlik,
    kargo_ucreti_azn: Math.round(u.agirlik * 7.5),
    eksik_bilgiler: item.odeme === 'BEKLIYOR' ? ['Ödəniş qəbzi təsdiqlənməyib'] : [],
    ai_guven_skoru: 0.98,
    siparis_kaynagi: item.kaynak
  });
});

// 2. Aşama: KANADA_DEPO (3 - 8 gün önce, 10 sipariş)
const depoAralik = [
  { gun: 3.2, urunIdx: 1, musIdx: 8, odeme: 'KISMI_ODEME', beh: 0.5 },
  { gun: 3.8, urunIdx: 4, musIdx: 9, odeme: 'ODENDI', beh: 1.0 },
  { gun: 4.4, urunIdx: 6, musIdx: 10, odeme: 'ODENDI', beh: 1.0 },
  { gun: 4.9, urunIdx: 8, musIdx: 11, odeme: 'KISMI_ODEME', beh: 0.6 },
  { gun: 5.5, urunIdx: 11, musIdx: 12, odeme: 'ODENDI', beh: 1.0 },
  { gun: 6.1, urunIdx: 13, musIdx: 13, odeme: 'KISMI_ODEME', beh: 0.5 },
  { gun: 6.7, urunIdx: 16, musIdx: 14, odeme: 'ODENDI', beh: 1.0 },
  { gun: 7.2, urunIdx: 18, musIdx: 15, odeme: 'ODENDI', beh: 1.0 },
  { gun: 7.6, urunIdx: 19, musIdx: 16, odeme: 'KISMI_ODEME', beh: 0.55 },
  { gun: 7.9, urunIdx: 3, musIdx: 0, odeme: 'ODENDI', beh: 1.0 }
];

depoAralik.forEach((item, idx) => {
  const m = musteriler[item.musIdx % musteriler.length];
  const u = urunler[item.urunIdx % urunler.length];
  const tarih = new Date(now - item.gun * DAY).toISOString();
  const alinan = Math.round(u.satisAzn * item.beh);
  const kalan = u.satisAzn - alinan;

  siparisler.push({
    id: `sip-dep-${String(idx + 1).padStart(3, '0')}`,
    olusturma_tarihi: tarih,
    ham_mesaj: `${m.ad}: ${u.urun} sifarişi Toronto anbarına daxil oldu. Barkod yoxlandı.`,
    musteri_adi: m.ad,
    musteri_id: m.musId,
    musteri_tipi: m.tip,
    instagram_kullanici_adi: m.ig,
    telefon_numarasi: m.tel,
    teslimat_sehri: m.sehir,
    teslimat_adresi: m.adres,
    urun_aciklamasi: u.urun,
    beden_veya_olcu: u.beden,
    renk: u.renk,
    adet: 1,
    toplam_tutar: u.satisAzn,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    para_birimi: 'AZN',
    finans_durumu: item.odeme,
    lojistik_durumu: 'KANADA_DEPO',
    baku_tahsilat_notu: kalan > 0 ? `${kalan} AZN qalıq borc var.` : 'Ödəniş tam tamamlandı.',
    kanada_magaza_adi: u.magaza,
    kanada_alis_fiyati_cad: u.alisCad,
    kanada_alis_fiyati_azn: Math.round(u.alisCad * 1.25),
    kargo_agirligi_kg: u.agirlik,
    kargo_ucreti_azn: Math.round(u.agirlik * 7.5),
    kanada_takip_kodu: `TOR-WH-${8100 + idx}`,
    eksik_bilgiler: [],
    ai_guven_skoru: 0.99,
    siparis_kaynagi: kaynaklar[idx % kaynaklar.length]
  });
});

// 3. Aşama: ULUSLARARASI_KARGO (8 - 16 gün önce, 14 sipariş)
const kargoAralik = [
  { gun: 8.2, urunIdx: 0, musIdx: 1, flight: 'AZ-CARGO-8841-YYZ' },
  { gun: 8.9, urunIdx: 2, musIdx: 3, flight: 'AZ-CARGO-8841-YYZ' },
  { gun: 9.5, urunIdx: 5, musIdx: 5, flight: 'AZ-CARGO-8841-YYZ' },
  { gun: 10.1, urunIdx: 7, musIdx: 7, flight: 'AZ-CARGO-8841-YYZ' },
  { gun: 11.0, urunIdx: 9, musIdx: 9, flight: 'AZ-CARGO-8920-YYZ' },
  { gun: 11.6, urunIdx: 12, musIdx: 11, flight: 'AZ-CARGO-8920-YYZ' },
  { gun: 12.3, urunIdx: 14, musIdx: 13, flight: 'AZ-CARGO-8920-YYZ' },
  { gun: 13.0, urunIdx: 1, musIdx: 15, flight: 'AZ-CARGO-8920-YYZ' },
  { gun: 13.8, urunIdx: 4, musIdx: 2, flight: 'KNB-AIR-3312-YYZ' },
  { gun: 14.2, urunIdx: 6, musIdx: 4, flight: 'KNB-AIR-3312-YYZ' },
  { gun: 14.8, urunIdx: 8, musIdx: 6, flight: 'KNB-AIR-3312-YYZ' },
  { gun: 15.2, urunIdx: 10, musIdx: 8, flight: 'KNB-AIR-3312-YYZ' },
  { gun: 15.6, urunIdx: 15, musIdx: 10, flight: 'KNB-AIR-3312-YYZ' },
  { gun: 16.0, urunIdx: 17, musIdx: 12, flight: 'KNB-AIR-3312-YYZ' }
];

kargoAralik.forEach((item, idx) => {
  const m = musteriler[item.musIdx % musteriler.length];
  const u = urunler[item.urunIdx % urunler.length];
  const tarih = new Date(now - item.gun * DAY).toISOString();
  const odendiMi = idx % 3 !== 0;
  const alinan = odendiMi ? u.satisAzn : Math.round(u.satisAzn * 0.5);
  const kalan = u.satisAzn - alinan;

  siparisler.push({
    id: `sip-krg-${String(idx + 1).padStart(3, '0')}`,
    olusturma_tarihi: tarih,
    ham_mesaj: `${m.ad}: ${u.urun} bağlaması Toronto Pearson hava limanından Bakıya uçuşdadır (${item.flight}).`,
    musteri_adi: m.ad,
    musteri_id: m.musId,
    musteri_tipi: m.tip,
    instagram_kullanici_adi: m.ig,
    telefon_numarasi: m.tel,
    teslimat_sehri: m.sehir,
    teslimat_adresi: m.adres,
    urun_aciklamasi: u.urun,
    beden_veya_olcu: u.beden,
    renk: u.renk,
    adet: 1,
    toplam_tutar: u.satisAzn,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    para_birimi: 'AZN',
    finans_durumu: kalan === 0 ? 'ODENDI' : 'KISMI_ODEME',
    lojistik_durumu: 'ULUSLARARASI_KARGO',
    baku_tahsilat_notu: kalan > 0 ? `${kalan} AZN qalıq borc var, Bakıda alınacaq.` : 'Tam ödənilib.',
    kanada_magaza_adi: u.magaza,
    kanada_alis_fiyati_cad: u.alisCad,
    kanada_alis_fiyati_azn: Math.round(u.alisCad * 1.25),
    kargo_agirligi_kg: u.agirlik,
    kargo_ucreti_azn: Math.round(u.agirlik * 7.5),
    kanada_takip_kodu: `TOR-EXP-${7200 + idx}`,
    uluslararasi_kargo_kodu: item.flight,
    eksik_bilgiler: [],
    ai_guven_skoru: 0.99,
    siparis_kaynagi: kaynaklar[idx % kaynaklar.length]
  });
});

// 4. Aşama: BAKU_DAGITIM_ARKADAS (16 - 25 gün önce, 12 sipariş)
const bakuDagitim = [
  { gun: 16.5, urunIdx: 3, musIdx: 0, kuryeIdx: 3 }, // Gəncə
  { gun: 17.2, urunIdx: 1, musIdx: 1, kuryeIdx: 0 }, // Nərimanov
  { gun: 18.0, urunIdx: 5, musIdx: 2, kuryeIdx: 1 }, // Yasamal
  { gun: 18.8, urunIdx: 7, musIdx: 3, kuryeIdx: 0 }, // Səbail
  { gun: 19.5, urunIdx: 9, musIdx: 5, kuryeIdx: 2 }, // Xətai
  { gun: 20.3, urunIdx: 11, musIdx: 6, kuryeIdx: 1 }, // Binəqədi
  { gun: 21.1, urunIdx: 13, musIdx: 8, kuryeIdx: 1 }, // Yasamal
  { gun: 21.8, urunIdx: 16, musIdx: 10, kuryeIdx: 0 }, // Nəsimi
  { gun: 22.5, urunIdx: 18, musIdx: 12, kuryeIdx: 0 }, // Nərimanov
  { gun: 23.2, urunIdx: 2, musIdx: 13, kuryeIdx: 2 }, // Xətai
  { gun: 24.0, urunIdx: 8, musIdx: 15, kuryeIdx: 1 }, // Yasamal
  { gun: 24.8, urunIdx: 14, musIdx: 16, kuryeIdx: 3 } // Şəki / Rayon
];

bakuDagitim.forEach((item, idx) => {
  const m = musteriler[item.musIdx % musteriler.length];
  const u = urunler[item.urunIdx % urunler.length];
  const k = kuryeler[item.kuryeIdx % kuryeler.length];
  const tarih = new Date(now - item.gun * DAY).toISOString();
  const odendiMi = idx % 2 === 0;
  const alinan = odendiMi ? u.satisAzn : Math.round(u.satisAzn * 0.6);
  const kalan = u.satisAzn - alinan;

  siparisler.push({
    id: `sip-bku-${String(idx + 1).padStart(3, '0')}`,
    olusturma_tarihi: tarih,
    ham_mesaj: `${m.ad}: ${u.urun} bağlaması Bakı mərkəzinə çatdı. Kuryer (${k.ad}) təhvil paylanışındadır.`,
    musteri_adi: m.ad,
    musteri_id: m.musId,
    musteri_tipi: m.tip,
    instagram_kullanici_adi: m.ig,
    telefon_numarasi: m.tel,
    teslimat_sehri: m.sehir,
    teslimat_adresi: m.adres,
    urun_aciklamasi: u.urun,
    beden_veya_olcu: u.beden,
    renk: u.renk,
    adet: 1,
    toplam_tutar: u.satisAzn,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    para_birimi: 'AZN',
    finans_durumu: kalan === 0 ? 'ODENDI' : 'KISMI_ODEME',
    lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
    baku_tahsilat_notu: kalan > 0 ? `Kuryer ${k.ad} vasitəsilə ${kalan} AZN nağd/kart toplanacaq.` : 'Məbləğ tam ödənilib.',
    baku_kurye_id: k.id,
    baku_kurye_adi: k.ad,
    baku_kurye_bolgesi: k.bolge,
    kanada_magaza_adi: u.magaza,
    kanada_alis_fiyati_cad: u.alisCad,
    kanada_alis_fiyati_azn: Math.round(u.alisCad * 1.25),
    kargo_agirligi_kg: u.agirlik,
    kargo_ucreti_azn: Math.round(u.agirlik * 7.5),
    uluslararasi_kargo_kodu: `GYD-EXP-${5510 + idx}`,
    eksik_bilgiler: [],
    ai_guven_skoru: 0.99,
    siparis_kaynagi: kaynaklar[idx % kaynaklar.length]
  });
});

// 5. Aşama: TESLIM_EDILDI (25 - 365 gün önce, zengin 52 sipariş)
const teslimGunleri = [
  26, 28, 31, 34, 38, 42, 45, 49, 52, 56, 60, 64, 68, 72, 76, 80, 83, 86, 89, 92, 95, 98,
  105, 112, 119, 126, 133, 140, 147, 155, 162, 170, 178, 185, 195, 205, 215,
  230, 245, 260, 275, 290, 305, 318, 328, 335, 342, 349, 355, 360, 363, 365
];

teslimGunleri.forEach((gun, idx) => {
  const m = musteriler[idx % musteriler.length];
  const u = urunler[(idx * 3) % urunler.length];
  const k = kuryeler[idx % kuryeler.length];
  const sipTarihi = new Date(now - gun * DAY).toISOString();
  const teslimTarihi = new Date(now - (gun - 7) * DAY).toISOString();

  siparisler.push({
    id: `sip-arc-${String(idx + 1).padStart(3, '0')}`,
    olusturma_tarihi: sipTarihi,
    ham_mesaj: `${m.ad}: ${u.urun} sifarişi uğurla təhvil verildi və bütün hesablaşma bağlandı.`,
    musteri_adi: m.ad,
    musteri_id: m.musId,
    musteri_tipi: m.tip,
    instagram_kullanici_adi: m.ig,
    telefon_numarasi: m.tel,
    teslimat_sehri: m.sehir,
    teslimat_adresi: m.adres,
    urun_aciklamasi: u.urun,
    beden_veya_olcu: u.beden,
    renk: u.renk,
    adet: 1,
    toplam_tutar: u.satisAzn,
    alinan_tutar: u.satisAzn,
    kalan_tutar: 0,
    para_birimi: 'AZN',
    finans_durumu: 'ODENDI',
    lojistik_durumu: 'TESLIM_EDILDI',
    baku_tahsilat_notu: 'Məhsul müştəriyə təhvil verildi, ödəniş tam qəbul edildi.',
    baku_kurye_id: k.id,
    baku_kurye_adi: k.ad,
    baku_kurye_bolgesi: k.bolge,
    teslim_tarihi: teslimTarihi,
    teslim_eden_kisi: k.ad,
    kanada_magaza_adi: u.magaza,
    kanada_alis_fiyati_cad: u.alisCad,
    kanada_alis_fiyati_azn: Math.round(u.alisCad * 1.25),
    kargo_agirligi_kg: u.agirlik,
    kargo_ucreti_azn: Math.round(u.agirlik * 7.5),
    kanada_takip_kodu: `TOR-ARC-${4000 + idx}`,
    uluslararasi_kargo_kodu: `AZ-HIST-${3000 + idx}-YYZ`,
    eksik_bilgiler: [],
    ai_guven_skoru: 0.99,
    siparis_kaynagi: kaynaklar[idx % kaynaklar.length]
  });
});

console.log('Toplam sipariş adedi:', siparisler.length);

const dosyaIcerigi = `import { Siparis } from '../types';

export const BASLANGIC_SIPARISLER: Siparis[] = ${JSON.stringify(siparisler, null, 2)};

export const HAZIR_TEST_MESAJLARI = [
  {
    baslik: 'Örnek 1: Canlı Yayın (Kısmi Ödeme + Maaş Sözü)',
    kaynak: 'INSTAGRAM_LIVE' as const,
    mesaj: 'Dünkü kırmızı elbise M beden benim olsun, 20 manatı akrabana verdim, kalanını maaşta vereceğim',
    ipucu: 'Müşteri: @aynur_baku'
  },
  {
    baslik: 'Örnek 2: Reels Yorumu (Tam Ödeme + Eksik Adres)',
    kaynak: 'INSTAGRAM_REELS' as const,
    mesaj: 'Salam, videodakı Guess qara krossvork 39 razmer mənim olsun. Bütün 140 manatı Bakıda qardaşınıza göndərdim. Nömrəm 050 345 67 89, zəng edin.',
    ipucu: 'Müşteri: @sevda_fashion'
  },
  {
    baslik: 'Örnek 3: WhatsApp (Ödeme Bekliyor + Eksik Beden)',
    kaynak: 'WHATSAPP' as const,
    mesaj: 'Salam xanım, o sarı Zara paltodan mənə də sifariş edin zəhmət olmasa. Pulu sabah akrabanıza gətirib verəcəm Bakıda. Ünvanım Əhmədli m/s.',
    ipucu: 'WhatsApp: +994 70 812 34 56'
  },
  {
    baslik: 'Örnek 4: Instagram DM (Kapora + Bakü Dağıtım Notu)',
    kaynak: 'INSTAGRAM_DM' as const,
    mesaj: 'Canım Tommy Hilfiger kapşonlu boz rəng sviter L razmer. 30 manat beh atdım, qalan 50 manatı dostunuz Bakıda təhvil verəndə verəcəm. Tel: 055 900 12 34, Nizami küçəsi.',
    ipucu: 'Müşteri: @elmir_baku'
  }
];
`;

fs.writeFileSync('src/data/ornek-siparisler.ts', dosyaIcerigi, 'utf8');
console.log('src/data/ornek-siparisler.ts yazildi!');
