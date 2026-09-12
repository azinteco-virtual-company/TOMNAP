import React, { createContext, useContext, useState, useEffect } from 'react';

export type DilKodu = 'az' | 'en' | 'ru';

export interface Sozluk {
  // Brand & Header
  platformAdi: string;
  platformAltBaslik: string;
  torontoSaat: string;
  bakuSaat: string;
  onayBekleyenler: string;
  canliBagli: string;
  sistemAktif: string;

  // Tabs / Navigation
  siparislerTablo: string;
  kuryeMasasi: string;
  gorselGiris: string;
  musteriRehberi: string;
  kargoManifest: string;
  bakuTahsilat: string;
  inboxGelen: string;
  sistemDevir: string;
  yonetim: string;

  // Sections & Breadcrumbs
  siparisYonetimTablosu: string;
  gorselSiparisMasasi: string;
  musteriVeritabani: string;
  kargoManifestosuCeki: string;
  bakuTahsilatQaliq: string;
  bakuKuryeDagitim: string;
  inboxTesdiqGozleyen: string;

  // Banner
  bannerBaslik: string;
  bannerAciklama: string;
  bannerAc: string;

  // Table Columns
  sira: string;
  musteriVeElaqe: string;
  seherUnvan: string;
  mehsulTesvir: string;
  say: string;
  mebleg: string;
  qaliqBorc: string;
  gomrukBakuTehvil: string;
  lojistikMerhele: string;
  qeydNot: string;
  emeliyyat: string;
  tamOdenilib: string;
  alinacaqBorc: string;

  // Logistic Statuses
  durumKanadaSatinalim: string;
  durumKanadaDepo: string;
  durumUluslararasiKargo: string;
  durumBakuDagitim: string;
  durumTeslimEdildi: string;
  durumIptal: string;

  // Payment Statuses
  odemeOdendi: string;
  odemeKismi: string;
  odemeGozleyir: string;

  // Stat Cards
  bakuTehsilatKarti: string;
  canli: string;
  dovriyye: string;
  qaliq: string;
  yoldakiKargo: string;
  eded: string;
  satinalmaGozleyir: string;
  bakude: string;
  odemeVeziyyeti: string;
  sifaris: string;
  qismenOdenilib: string;
  aiAparati: string;
  natamamMelumat: string;
  suret: string;
  deqiqlik: string;

  // Actions & Filters
  excelIndir: string;
  pdfIndir: string;
  manifestoCap: string;
  paketStikerleri: string;
  siparislereDon: string;
  filtreleriSifirla: string;
  axtarisYeri: string;
  yeniSiparisEkle: string;
  filtrele: string;
  kopyala: string;
  kopyalandi: string;
  yaddaSaxla: string;
  bagla: string;
  sil: string;
  tumuLojistik: string;
  tumuOdeme: string;
  eksikler: string;
  tumuUluslararasiKargo: string;
  detayBax: string;
  whatsappMesaj: string;
  sonrakiMerhele: string;

  // Roles
  rolSuperAdmin: string;
  rolPatron: string;
  rolSatis: string;
  rolKanadaSatinalma: string;
  rolBakuFinans: string;
  rolBakuKurye: string;

  // Courier Page
  dagidilacaqPaket: string;
  tehvilGozleyir: string;
  toplanacaqMebleg: string;
  tehvilatMesuliyyeti: string;
  tamamlananTehvil: string;
  ugurlaCatdirildi: string;
  tehvilVerildiIsaretle: string;
  borcuAlVeTehvilVer: string;
  tehvilBekleyenler: string;
  tehvilEdilenler: string;
  hamisi: string;
  kuryeSec: string;
  bolge: string;
  telefonYoxdur: string;
  unvanYoxdur: string;
  paketTapilmadi: string;
}

const SOZLUKLER: Record<DilKodu, Sozluk> = {
  az: {
    platformAdi: 'TOMNAP — Qlobal Trans-Sərhəd Ticarət və Karqo',
    platformAltBaslik: 'Kanada (YYZ) ➔ Bakı (GYD) & Qlobal Parsel Masası',
    torontoSaat: 'Toronto: EST',
    bakuSaat: 'Bakı: AZT (+4)',
    onayBekleyenler: 'Təsdiq Gözləyənlər',
    canliBagli: 'Supabase Canlı DB Bağlı',
    sistemAktif: 'Sistem Aktiv',

    siparislerTablo: 'Sifarişlər Cədvəli',
    kuryeMasasi: 'Bakı Kurye Masası',
    gorselGiris: 'Görsəl & WhatsApp Girişi',
    musteriRehberi: 'Müştəri Baza & CRM',
    kargoManifest: 'Kargo Manifestosu',
    bakuTahsilat: 'Bakı Qalıq Borclar',
    inboxGelen: 'Gələn Tələblər (Inbox)',
    sistemDevir: 'Sistem & Memarlıq',
    yonetim: 'İdarəetmə',

    siparisYonetimTablosu: 'Sifariş İdarəetmə Cədvəli',
    gorselSiparisMasasi: 'WhatsApp & Görsəl Sifariş Masası',
    musteriVeritabani: 'Müştəri Veritabanı & CRM Rehberi',
    kargoManifestosuCeki: 'Kanada ➔ Bakı Kargo Manifestosu & Çəki Siyahısı',
    bakuTahsilatQaliq: 'Bakı Təhsilat & Qalıq Borc Masası',
    bakuKuryeDagitim: 'Bakı Kurye & Sahə Çatdırılma Masası',
    inboxTesdiqGozleyen: 'Gələn Qutusu: Təsdiq Gözləyən Sifarişlər',

    bannerBaslik: 'WhatsApp Qrupu & Görsəl Sifariş Masası',
    bannerAciklama: 'Qrupdan gələn məhsul şəkillərini və söhbət notlarını tək toxunuşla yükləyib Gemini AI ilə sifarişə çevirin.',
    bannerAc: 'Görsəl Masanı Aç',

    sira: '№',
    musteriVeElaqe: 'Müştəri & Əlaqə',
    seherUnvan: 'Şəhər / Ünvan',
    mehsulTesvir: 'Məhsul & Təsvir',
    say: 'Say',
    mebleg: 'Məbləğ',
    qaliqBorc: 'Qalıq Borc',
    gomrukBakuTehvil: 'Gömrük & Bakı Təhvil',
    lojistikMerhele: 'Lojistika Mərhələsi',
    qeydNot: 'Xüsusi Təlimat & Bakı Notu',
    emeliyyat: 'Əməliyyat',
    tamOdenilib: '✓ Tam Ödənilib',
    alinacaqBorc: 'Bakıda Alınacaq',

    durumKanadaSatinalim: '🇨🇦 Kanada Satınalma',
    durumKanadaDepo: '🇨🇦 Kanada Anbarı',
    durumUluslararasiKargo: '✈️ Beynəlxalq Kargo',
    durumBakuDagitim: '🇦🇿 Bakı Paylanış',
    durumTeslimEdildi: '✅ Təhvil Verildi',
    durumIptal: '❌ Ləğv Edildi',

    odemeOdendi: 'Ödənildi',
    odemeKismi: 'Qismən Ödəniş (Beh)',
    odemeGozleyir: 'Gözləyir',

    bakuTehsilatKarti: 'Bakı Təhsilatı (Qalıq Borc)',
    canli: 'Canlı',
    dovriyye: 'Dövriyyə',
    qaliq: 'Qalıq Borc',
    yoldakiKargo: 'Yoldakı Kargo',
    eded: 'Ədəd',
    satinalmaGozleyir: 'Satınalma Gözləyir',
    bakude: 'Bakıda',
    odemeVeziyyeti: 'Ödəniş Vəziyyəti',
    sifaris: 'Sifariş',
    qismenOdenilib: 'Qismən Beh',
    aiAparati: 'AI Emal & Dəqiqlik',
    natamamMelumat: 'sifarişdə çatışmayan məlumat',
    suret: 'Sürət: ~1.2s',
    deqiqlik: '98% Dəqiqlik Skoru',

    excelIndir: 'Excel İndir (.xlsx)',
    pdfIndir: 'PDF İndir',
    manifestoCap: 'Manifesto Çap Et',
    paketStikerleri: 'Paket Stikerləri (Barkod)',
    siparislereDon: 'Sifarişlərə Qayıt',
    filtreleriSifirla: 'Bütün Filtrləri Sıfırla',
    axtarisYeri: 'Müştəri adı, telefon, kod, məhsul...',
    yeniSiparisEkle: 'Yeni Sifariş Əlavə Et',
    filtrele: 'Filtrlə',
    kopyala: 'Kopyala',
    kopyalandi: 'Kopyalandı!',
    yaddaSaxla: 'Yadda Saxla',
    bagla: 'Bağla',
    sil: 'Sil',
    tumuLojistik: 'Bütün Lojistika Mərhələləri',
    tumuOdeme: 'Bütün Ödəniş Vəziyyətləri',
    eksikler: 'Çatışmayanlar',
    tumuUluslararasiKargo: 'Hamısını Beynəlxalq Kargo Et',
    detayBax: 'Detala Bax',
    whatsappMesaj: 'WhatsApp Mesajı Göndər',
    sonrakiMerhele: 'Növbəti lojistika mərhələsinə keçir',

    rolSuperAdmin: 'Süper Admin (Dev)',
    rolPatron: 'Patron / İdarəçi',
    rolSatis: 'Satış Məsulü',
    rolKanadaSatinalma: 'Kanada Satınalma',
    rolBakuFinans: 'Bakı Finans',
    rolBakuKurye: 'Bakı Kuryesi',

    dagidilacaqPaket: 'Çatdırılacaq Paket',
    tehvilGozleyir: 'Təhvil Gözləyir',
    toplanacaqMebleg: 'Toplanacaq Məbləğ',
    tehvilatMesuliyyeti: 'Təhsilat Məsuliyyəti',
    tamamlananTehvil: 'Tamamlanan Təhvilat',
    ugurlaCatdirildi: 'Uğurla Çatdırıldı',
    tehvilVerildiIsaretle: '✓ Təhvil Verildi',
    borcuAlVeTehvilVer: '💵 Borcu Aldım və Təhvil Verdim',
    tehvilBekleyenler: '⏳ Çatdırılma Gözləyən',
    tehvilEdilenler: '✅ Təhvil Verilənlər',
    hamisi: 'Hamısı',
    kuryeSec: 'Kurye / Sahə:',
    bolge: 'Bölgə',
    telefonYoxdur: 'Telefon qeyd olunmayıb',
    unvanYoxdur: 'Ünvan qeyd olunmayıb',
    paketTapilmadi: 'Bu filtr üzrə çatdırılma paketi tapılmadı.'
  },

  en: {
    platformAdi: 'TOMNAP — Global Cross-Border Commerce & Parcel Logistics Platform',
    platformAltBaslik: 'Toronto (YYZ) ➔ Baku (GYD) & Worldwide Parcel Operations Hub',
    torontoSaat: 'Toronto: EST',
    bakuSaat: 'Baku: AZT (+4)',
    onayBekleyenler: 'Pending Approvals',
    canliBagli: 'Supabase DB Live',
    sistemAktif: 'System Active',

    siparislerTablo: 'Orders Table',
    kuryeMasasi: 'Baku Courier Desk',
    gorselGiris: 'Visual & WhatsApp Entry',
    musteriRehberi: 'Customer Directory & CRM',
    kargoManifest: 'Cargo Manifest',
    bakuTahsilat: 'Baku Balances & COD',
    inboxGelen: 'Inbox (New Requests)',
    sistemDevir: 'System & Architecture',
    yonetim: 'Management',

    siparisYonetimTablosu: 'Order Management Table',
    gorselSiparisMasasi: 'WhatsApp & Visual Order Desk',
    musteriVeritabani: 'Customer Database & CRM Directory',
    kargoManifestosuCeki: 'Canada ➔ Baku Air Cargo Manifest & Packing List',
    bakuTahsilatQaliq: 'Baku Collection & Balance Due Desk',
    bakuKuryeDagitim: 'Baku Courier & Last-Mile Delivery Desk',
    inboxTesdiqGozleyen: 'Inbox: Pending Order Approvals',

    bannerBaslik: 'WhatsApp Group & Visual Order Desk',
    bannerAciklama: 'Upload customer order photos and chat messages instantly to convert them into orders using Gemini AI.',
    bannerAc: 'Open Visual Desk',

    sira: '#',
    musteriVeElaqe: 'Customer & Contact',
    seherUnvan: 'City / Address',
    mehsulTesvir: 'Item & Description',
    say: 'Qty',
    mebleg: 'Amount',
    qaliqBorc: 'Balance Due',
    gomrukBakuTehvil: 'Customs & Baku Delivery',
    lojistikMerhele: 'Logistics Stage',
    qeydNot: 'Special Notes & Baku Instructions',
    emeliyyat: 'Actions',
    tamOdenilib: '✓ Fully Paid',
    alinacaqBorc: 'Collect on Delivery (COD)',

    durumKanadaSatinalim: '🇨🇦 Canada Purchasing',
    durumKanadaDepo: '🇨🇦 Canada Warehouse',
    durumUluslararasiKargo: '✈️ International Air Cargo',
    durumBakuDagitim: '🇦🇿 Baku Last-Mile Delivery',
    durumTeslimEdildi: '✅ Delivered',
    durumIptal: '❌ Cancelled',

    odemeOdendi: 'Paid',
    odemeKismi: 'Partial Payment (Deposit)',
    odemeGozleyir: 'Pending',

    bakuTehsilatKarti: 'Baku COD & Collections',
    canli: 'Live',
    dovriyye: 'Gross Revenue',
    qaliq: 'Balance Due',
    yoldakiKargo: 'Cargo in Transit',
    eded: 'Items',
    satinalmaGozleyir: 'Purchasing Pending',
    bakude: 'In Baku',
    odemeVeziyyeti: 'Payment Status Breakdown',
    sifaris: 'Orders',
    qismenOdenilib: 'Partial Deposit',
    aiAparati: 'AI Processing & Accuracy',
    natamamMelumat: 'orders with missing data',
    suret: 'Speed: ~1.2s',
    deqiqlik: '98% Accuracy Score',

    excelIndir: 'Export Excel (.xlsx)',
    pdfIndir: 'Download PDF',
    manifestoCap: 'Print Manifest',
    paketStikerleri: 'Package Labels (Barcode)',
    siparislereDon: 'Back to Orders',
    filtreleriSifirla: 'Reset All Filters',
    axtarisYeri: 'Customer, phone, code, item...',
    yeniSiparisEkle: 'Add New Order',
    filtrele: 'Filter',
    kopyala: 'Copy',
    kopyalandi: 'Copied!',
    yaddaSaxla: 'Save Details',
    bagla: 'Close',
    sil: 'Delete',
    tumuLojistik: 'All Logistics Stages',
    tumuOdeme: 'All Payment Statuses',
    eksikler: 'Missing Info',
    tumuUluslararasiKargo: 'Set All to Air Cargo',
    detayBax: 'View Details',
    whatsappMesaj: 'Send WhatsApp Message',
    sonrakiMerhele: 'Advance to next logistic stage',

    rolSuperAdmin: 'Super Admin (Dev)',
    rolPatron: 'Owner / Executive',
    rolSatis: 'Sales Representative',
    rolKanadaSatinalma: 'Canada Purchasing',
    rolBakuFinans: 'Baku Finance',
    rolBakuKurye: 'Baku Courier',

    dagidilacaqPaket: 'Packages to Deliver',
    tehvilGozleyir: 'Awaiting Delivery',
    toplanacaqMebleg: 'Cash to Collect',
    tehvilatMesuliyyeti: 'COD Responsibility',
    tamamlananTehvil: 'Delivered Packages',
    ugurlaCatdirildi: 'Successfully Delivered',
    tehvilVerildiIsaretle: '✓ Mark Delivered',
    borcuAlVeTehvilVer: '💵 Collected Cash & Delivered',
    tehvilBekleyenler: '⏳ Pending Delivery',
    tehvilEdilenler: '✅ Delivered',
    hamisi: 'All',
    kuryeSec: 'Courier / Area:',
    bolge: 'Zone',
    telefonYoxdur: 'No phone provided',
    unvanYoxdur: 'No address provided',
    paketTapilmadi: 'No delivery packages found matching this filter.'
  },

  ru: {
    platformAdi: 'TOMNAP — Глобальная Платформа Трансграничной Торговли и Логистики',
    platformAltBaslik: 'Торонто (YYZ) ➔ Баку (GYD) & Глобальный Логистический Хаб',
    torontoSaat: 'Торонто: EST',
    bakuSaat: 'Баку: AZT (+4)',
    onayBekleyenler: 'Ожидают подтверждения',
    canliBagli: 'База Supabase Активна',
    sistemAktif: 'Система Активна',

    siparislerTablo: 'Таблица Заказов',
    kuryeMasasi: 'Курьерский стол (Баку)',
    gorselGiris: 'Прием фото и WhatsApp',
    musteriRehberi: 'База клиентов и CRM',
    kargoManifest: 'Грузовой Манифест',
    bakuTahsilat: 'Остаток долга (Баку)',
    inboxGelen: 'Входящие заявки (Inbox)',
    sistemDevir: 'Система и Архитектура',
    yonetim: 'Управление',

    siparisYonetimTablosu: 'Таблица Управления Заказами',
    gorselSiparisMasasi: 'Стол WhatsApp и Визуальных Заказов',
    musteriVeritabani: 'База данных Клиентов и CRM',
    kargoManifestosuCeki: 'Канада ➔ Баку: Авиаманифест и Упаковочный лист',
    bakuTahsilatQaliq: 'Сбор Оплат и Остатков в Баку',
    bakuKuryeDagitim: 'Курьерская доставка по Баку (Last-Mile)',
    inboxTesdiqGozleyen: 'Входящие: Заказы на подтверждении',

    bannerBaslik: 'Группа WhatsApp и Стол Визуальных Заказов',
    bannerAciklama: 'Загружайте фотографии товаров и текст из чатов в один клик, превращая их в заказы с помощью Gemini AI.',
    bannerAc: 'Открыть Фото-Стол',

    sira: '№',
    musteriVeElaqe: 'Клиент и Контакты',
    seherUnvan: 'Город / Адрес',
    mehsulTesvir: 'Товар и Описание',
    say: 'Кол-во',
    mebleg: 'Сумма',
    qaliqBorc: 'Остаток к оплате',
    gomrukBakuTehvil: 'Таможня и Курьер в Баку',
    lojistikMerhele: 'Этап логистики',
    qeydNot: 'Особые отметки и инструкции',
    emeliyyat: 'Действия',
    tamOdenilib: '✓ Оплачено',
    alinacaqBorc: 'К оплате при получении (COD)',

    durumKanadaSatinalim: '🇨🇦 Выкуп в Канаде',
    durumKanadaDepo: '🇨🇦 Склад в Канаде',
    durumUluslararasiKargo: '✈️ Международный Авиарейс',
    durumBakuDagitim: '🇦🇿 Доставка по Баку (Курьер)',
    durumTeslimEdildi: '✅ Доставлено',
    durumIptal: '❌ Отменено',

    odemeOdendi: 'Оплачено',
    odemeKismi: 'Частичная предоплата',
    odemeGozleyir: 'Ожидает оплаты',

    bakuTehsilatKarti: 'Сбор Оплат в Баку (Остатки)',
    canli: 'Онлайн',
    dovriyye: 'Оборот',
    qaliq: 'Остаток долга',
    yoldakiKargo: 'Груз в пути',
    eded: 'Шт.',
    satinalmaGozleyir: 'Ожидает выкупа',
    bakude: 'В Баку',
    odemeVeziyyeti: 'Статус Оплат',
    sifaris: 'Заказов',
    qismenOdenilib: 'Предоплата',
    aiAparati: 'AI Обработка и Точность',
    natamamMelumat: 'заказов с неполными данными',
    suret: 'Скорость: ~1.2с',
    deqiqlik: '98% Точность распознавания',

    excelIndir: 'Экспорт в Excel (.xlsx)',
    pdfIndir: 'Скачать PDF',
    manifestoCap: 'Печать Манифеста',
    paketStikerleri: 'Стикеры посылок (Штрихкод)',
    siparislereDon: 'Назад к заказам',
    filtreleriSifirla: 'Сбросить все фильтры',
    axtarisYeri: 'Клиент, телефон, код, товар...',
    yeniSiparisEkle: 'Добавить Заказ',
    filtrele: 'Фильтр',
    kopyala: 'Копировать',
    kopyalandi: 'Скопировано!',
    yaddaSaxla: 'Сохранить',
    bagla: 'Закрыть',
    sil: 'Удалить',
    tumuLojistik: 'Все этапы логистики',
    tumuOdeme: 'Все статусы оплаты',
    eksikler: 'Неполные данные',
    tumuUluslararasiKargo: 'Перевести все в Авиарейс',
    detayBax: 'Подробнее',
    whatsappMesaj: 'Отправить в WhatsApp',
    sonrakiMerhele: 'Перевести на следующий этап логистики',

    rolSuperAdmin: 'Супер Админ (Dev)',
    rolPatron: 'Владелец / Директор',
    rolSatis: 'Менеджер продаж',
    rolKanadaSatinalma: 'Закупки в Канаде',
    rolBakuFinans: 'Финансы в Баку',
    rolBakuKurye: 'Курьер по Баку',

    dagidilacaqPaket: 'Посылок на доставку',
    tehvilGozleyir: 'Ожидает вручения',
    toplanacaqMebleg: 'Сумма к получению',
    tehvilatMesuliyyeti: 'Инкассация',
    tamamlananTehvil: 'Доставлено посылок',
    ugurlaCatdirildi: 'Успешно передано клиентам',
    tehvilVerildiIsaretle: '✓ Доставлено',
    borcuAlVeTehvilVer: '💵 Деньги получены и доставлено',
    tehvilBekleyenler: '⏳ Ожидает доставки',
    tehvilEdilenler: '✅ Доставленные',
    hamisi: 'Все',
    kuryeSec: 'Курьер / Зона:',
    bolge: 'Район',
    telefonYoxdur: 'Телефон не указан',
    unvanYoxdur: 'Адрес не указан',
    paketTapilmadi: 'По данному фильтру посылок не найдено.'
  }
};

interface DilKontekstiTipi {
  dil: DilKodu;
  setDil: (yeniDil: DilKodu) => void;
  t: Sozluk;
}

const DilKonteksti = createContext<DilKontekstiTipi>({
  dil: 'en',
  setDil: () => {},
  t: SOZLUKLER.en
});

export const DilSaglayici: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dil, setDilState] = useState<DilKodu>(() => {
    try {
      const kayitli = (localStorage.getItem('tomnap_dil') || localStorage.getItem('knb_dil')) as DilKodu;
      if (kayitli === 'az' || kayitli === 'en' || kayitli === 'ru') {
        return kayitli;
      }
    } catch {}
    return 'en'; // Default is English!
  });

  const setDil = (yeniDil: DilKodu) => {
    setDilState(yeniDil);
    try {
      localStorage.setItem('tomnap_dil', yeniDil);
    } catch {}
  };

  const t = SOZLUKLER[dil] || SOZLUKLER.az;

  return (
    <DilKonteksti.Provider value={{ dil, setDil, t }}>
      {children}
    </DilKonteksti.Provider>
  );
};

export const useDil = () => useContext(DilKonteksti);
