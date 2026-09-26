import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Plane,
  Package,
  ShieldCheck,
  Users,
  Smartphone,
  Cpu,
  Zap,
  Globe,
  ChevronRight,
  Camera,
  Wallet,
  Truck,
  Clock,
  Star,
  ExternalLink,
  ChevronDown,
  Layers,
  HelpCircle,
  Lock,
} from 'lucide-react';
import { ButikQeydiyyatModal } from './ButikQeydiyyatModal';
import { DilSecici } from '../DilSecici';
import { useDil } from '../../context/DilKonteksti';

interface LandingPageProps {
  onPanelAc: () => void;
  onDemoAc: () => void;
  onBasariliKayit?: (yeniFirma: any) => void;
  toplamSiparis?: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onPanelAc,
  onDemoAc,
  onBasariliKayit,
  toplamSiparis = 0,
}) => {
  const { dil } = useDil();
  const isEn = dil === 'en';
  const isRu = dil === 'ru';

  const [qeydiyyatAcik, setQeydiyyatAcik] = useState(false);
  const [seciliTab, setSeciliTab] = useState<
    'track' | 'order' | 'manage' | 'navigate' | 'automate' | 'parcel'
  >('track');
  const [acikFaq, setAcikFaq] = useState<number | null>(0);

  const tomnapFeatures = [
    {
      id: 'track',
      letter: 'T',
      title: isEn
        ? 'Track — Live Cargo & AWB Tracking'
        : isRu
          ? 'Track — Отслеживание Грузов и AWB'
          : 'Track — Canlı Kargo & AWB İzləmə',
      subtitle: isEn
        ? 'Minute-by-minute flight tracking across Toronto YYZ ➔ Baku GYD Aramex air route'
        : isRu
          ? 'Поминутное отслеживание рейсов по авиамаршруту Торонто YYZ ➔ Баку GYD'
          : 'Toronto YYZ ➔ Bakı GYD Aramex hava xətti üzrə dəqiqəbədəqiqə uçuş izləməsi',
      desc: isEn
        ? 'Direct Aramex REST API v2 integration synchronizes parcel airway bills (AWB) in real time. Track pallet dispatch from Toronto, scheduled flight departures, GYD customs clearance, and inbound scanning into the Baku hub.'
        : isRu
          ? 'Прямая интеграция с Aramex REST API v2 синхронизирует номера авианакладных AWB в реальном времени. Отслеживайте отгрузку со склада в Торонто, вылет рейса, таможню в Баку и прием на сортировочном складе.'
          : 'Aramex API v2 birbaşa inteqrasiyası ilə bütün bağlamaların AWB nömrələri avtomatik yoxlanılır. Toronto anbarından təyyarəyə yüklənmə, GYD hava limanına eniş və Bakı anbarına daxil olma anında sistemə işlənir.',
      icon: Plane,
      color: 'from-blue-500 to-cyan-500',
      tag: 'Aramex REST API v2',
      metrics: isEn
        ? [
            '100% Automated AWB Sync',
            'Daily Dispatch Weight Lists',
            'Real-time Flight Milestone Alerts',
          ]
        : isRu
          ? [
              '100% Авто-синхронизация AWB',
              'Ежедневные весовые реестры',
              'Уведомления о вылете и посадке',
            ]
          : ['100% Avtomatlaşdırılmış AWB', 'Gündəlik Çəki Cədvəlləri', 'Uçuş & Eniş Bildirişləri'],
    },
    {
      id: 'order',
      letter: 'O',
      title: isEn
        ? 'Order — Omnichannel Ingestion'
        : isRu
          ? 'Order — Мультиканальный Прием Заказов'
          : 'Order — Çoxkanallı Sifariş Qəbulu',
      subtitle: isEn
        ? 'One-click parsing from Instagram Live, Reels, DMs, and WhatsApp chats'
        : isRu
          ? 'Создание заказов в 1 клик из Instagram Live, Reels, Direct и WhatsApp'
          : 'Instagram Canlı Yayım, Reels, DM və WhatsApp danışıqlarından bir toxunuşla sifariş',
      desc: isEn
        ? 'No more tedious copy-pasting. Google Gemini AI Vision reads order screenshots and chat logs to instantly extract recipient details, phone numbers, items, CAD/USD prices, and initial deposit amounts.'
        : isRu
          ? 'Забудьте о ручном вводе данных. Google Gemini AI Vision распознает скриншоты заказов и переписки, мгновенно извлекая имя клиента, телефон, товар, цену и предоплату.'
          : 'Müştərilərinizdən gələn ekran görüntülərini və qrup mesajlarını əl ilə yazmağa ehtiyac yoxdur. Platforma müştəri adı, telefon, məhsul növü, qiymət və beh məbləğini dərhal çıxarır.',
      icon: Camera,
      color: 'from-emerald-500 to-teal-500',
      tag: 'Gemini AI Vision',
      metrics: isEn
        ? [
            '< 2s OCR Vision Recognition',
            'Instagram Post Deep-Linking',
            'Instant Deposit & Balance Balancing',
          ]
        : isRu
          ? [
              'Распознавание за ~2 сек',
              'Интеграция ссылок Instagram',
              'Расчет предоплаты и остатка',
            ]
          : ['2 Saniyəyə OCR Tanıma', 'İnstagram Linkləri', 'Beh & Borc Hesablama'],
    },
    {
      id: 'manage',
      letter: 'M',
      title: isEn
        ? 'Manage — Multi-Tenant Boutique CRM'
        : isRu
          ? 'Manage — Мульти-Тенант CRM Бутиков'
          : 'Manage — Multi-Tenant Butik İdarəetməsi',
      subtitle: isEn
        ? 'Completely isolated customer databases, ledgers, and team roles for every boutique'
        : isRu
          ? 'Изолированная база клиентов, касса и ролевой доступ для каждого бутика'
          : 'Hər butik üçün təcrid olunmuş müştəri bazası, kassa və komanda rolları',
      desc: isEn
        ? 'Manage multiple partner boutiques from a single master platform. Each boutique operates with its own customers, order ledgers, and team members, protected by company and role access checks.'
        : isRu
          ? 'Управляйте несколькими бутиками-партнерами с единой платформы. Данные каждого магазина, база CRM и финансовая отчетность доступны согласно компании и роли пользователя.'
          : 'Birdən çox butiki və ya tərəfdaşı tək platformadan idarə edin. Hər butikin sifarişləri, müştəri CRM məlumatları və maliyyə hesabatları butik və istifadəçi rolu üzrə giriş nəzarəti ilə qorunur.',
      icon: Users,
      color: 'from-purple-500 to-pink-500',
      tag: 'Company Access',
      metrics: isEn
        ? [
            'Company and role access controls',
            'Owner, Sales, Purchasing & Finance Roles',
            'Custom Invite Links with Quotas',
          ]
        : isRu
          ? [
              'Контроль доступа к данным',
              'Роли: Владелец, Продажи, Финансы',
              'Приглашения в команду по квотам',
            ]
          : ['Tam Məlumat Təcridi', 'Patron, Satış, Finans Rolları', 'Xüsusi Komanda Dəvətləri'],
    },
    {
      id: 'navigate',
      letter: 'N',
      title: isEn
        ? 'Navigate — Global Customs & Routing'
        : isRu
          ? 'Navigate — Международная Таможня и Маршруты'
          : 'Navigate — Qlobal Marşrut və Gömrük',
      subtitle: isEn
        ? 'Air logistics corridors from Canada, the United States, Japan, and Turkey to Baku'
        : isRu
          ? 'Логистические коридоры из Канады, США, Японии и Турции в Баку'
          : 'Kanada, ABŞ, Yaponiya və Türkiyədən multimodal çatdırılma',
      desc: isEn
        ? 'Automatically generate standardized customs declarations, air waybill manifests, and packing lists. Full route support for Toronto (YYZ), New York (JFK), Tokyo (NRT), and Istanbul (IST) landing into Baku (GYD).'
        : isRu
          ? 'Автоматическое формирование таможенных деклараций, грузовых манифестов и упаковочных листов. Поддержка направлений Торонто (YYZ), Нью-Йорк (JFK), Токио (NRT) и Стамбул (IST) в Баку (GYD).'
          : 'Beynəlxalq alış-veriş zamanı gömrük bəyannamələrini və manifestlərini avtomatik formalaşdırın. Toronto (YYZ), New York (JFK), Tokyo (NRT) və İstanbuldan (IST) Bakıya (GYD) logistika xətləri dəstəklənir.',
      icon: Globe,
      color: 'from-amber-500 to-orange-500',
      tag: 'Multi-Carrier Logistics',
      metrics: isEn
        ? [
            'Automated Customs Declarations',
            'CAD / USD ➔ AZN Live Currency Conversion',
            'Consolidated Flight Cargo Manifests',
          ]
        : isRu
          ? [
              'Авто-декларации для таможни',
              'Конвертация валют CAD/USD ➔ AZN',
              'Консолидированные авиаманифесты',
            ]
          : ['Avtomatik Bəyannamə', 'CAD ➔ AZN Valyuta Dönüşümü', 'Gömrük Siyahıları'],
    },
    {
      id: 'automate',
      letter: 'A',
      title: isEn
        ? 'Automate — AI Workflow Engine'
        : isRu
          ? 'Automate — ИИ-Автоматизация и Оповещения'
          : 'Automate — Süni İntellektlə Avtomatlaşdırma',
      subtitle: isEn
        ? 'Google Gemini AI status updates and 1-click personalized WhatsApp notifications'
        : isRu
          ? 'Смена статусов через Gemini AI и отправка WhatsApp уведомлений клиентам в 1 клик'
          : 'Google Gemini AI ilə status dəyişiklikləri və müştəriyə WhatsApp bildirişi',
      desc: isEn
        ? 'Notify buyers immediately when their parcel departs North America or clears customs in Baku. Send tailored WhatsApp arrival alerts with remaining balance due, delivery address, and courier contact in 1 tap.'
        : isRu
          ? 'Автоматически оповещайте клиентов о вылете посылки или прибытии в Баку. Отправляйте персонализированные сообщения в WhatsApp с остатком к оплате и контактами курьера в один клик.'
          : 'Kargo statusu dəyişdikdə və ya Bakıya çatdıqda müştəriyə avtomatik fərdiləşdirilmiş WhatsApp mesajı göndərin. Qalıq borc, çatdırılma ünvanı və kurye əlaqə nömrəsi bir toxunuşla müştəriyə çatır.',
      icon: Cpu,
      color: 'from-indigo-500 to-violet-500',
      tag: '1-Click WhatsApp Templates',
      metrics: isEn
        ? [
            'Pre-Formatted WhatsApp Templates',
            'Automated Balance Due Reminders',
            'Zero Manual Communication Overhead',
          ]
        : isRu
          ? ['Шаблоны сообщений WhatsApp', 'Напоминания об остатке долга', 'Ноль ручных сообщений']
          : ['WhatsApp API Şablonları', 'Avtomatik Borc Xatırlatması', '0 Əl ilə Mesajlaşma'],
    },
    {
      id: 'parcel',
      letter: 'P',
      title: isEn
        ? 'Parcel — Last-Mile Delivery & COD'
        : isRu
          ? 'Parcel — Доставка Курьером и Инкассация (COD)'
          : 'Parcel — Son Kilometr və Kurye Təhsilatı',
      subtitle: isEn
        ? 'Dedicated mobile courier interface for Baku field drivers with instant cash reconciliation'
        : isRu
          ? 'Специальный мобильный интерфейс для курьеров в Баку с мгновенным закрытием кассы'
          : 'Bakı daxili sahə kuryeləri üçün xüsusi mobil paylama və kassa masası',
      desc: isEn
        ? 'When parcels land in Baku, field couriers access a lightweight mobile view showing only their assigned parcels. Drivers collect cash or card payments on delivery and balance their registers with 1 click.'
        : isRu
          ? 'По прибытии посылок в Баку курьеры видят на своих смартфонах только назначенные им заказы. Они принимают оплату наличными или картой у двери и в один клик закрывают смену.'
          : 'Məhsul Bakıya çatdıqda sahə kuryesi öz telefonundan yalnız ona təhkim olunmuş paketləri görür. Qapıda nağd və ya kartla qalıq borcu təhsil edərək tək kliklə kassanı bağlayır.',
      icon: Truck,
      color: 'from-rose-500 to-red-500',
      tag: 'Mobile Courier Desk',
      metrics: isEn
        ? [
            'Mobile-Optimized Courier Desk',
            'Doorstep Cash & Card Reconciliation',
            'Daily Cash Register Closeout',
          ]
        : isRu
          ? [
              'Мобильный интерфейс для водителей',
              'Инкассация у двери получателя',
              'Ежедневная сдача кассы',
            ]
          : [
              'Telefon üçün Uyğunlaşdırılmış İnterfeys',
              'Qapıda Qalıq Təhsilatı',
              'Gündəlik Kassa Təhvili',
            ],
    },
  ];

  const faqs = [
    {
      q: isEn
        ? 'How can our boutique join the TOMNAP platform?'
        : isRu
          ? 'Как наш бутик может подключиться к TOMNAP?'
          : 'TOMNAP platformasına necə qoşula bilərəm?',
      a: isEn
        ? 'Click the "Register Boutique" button to enter your store name, owner name, and contact details. For data isolation and security assurance, submissions are reviewed and activated by our team within 1–2 hours.'
        : isRu
          ? 'Нажмите кнопку «Регистрация» вверху, укажите название бутика и контакты. В целях безопасности данных заявка одобряется администратором в течение 1–2 часов.'
          : 'Yuxarıdakı "Qeydiyyatdan Keçin" düyməsinə klikləyərək butikinizin adını və əlaqə nömrənizi daxil edin. Məlumat təhlükəsizliyi və izolasiya standartlarımıza görə müraciətiniz Super Admin tərəfindən 1-2 saat ərzində təsdiqlənir və iş masanız aktivləşdirilir.',
    },
    {
      q: isEn
        ? 'Can I test the platform before registering?'
        : isRu
          ? 'Можно ли протестировать систему без регистрации?'
          : 'Qeydiyyatdan keçmədən sistemi sınaqdan keçirə bilərəmmi?',
      a: isEn
        ? 'Public demo access is currently disabled. Sign in with a registered personal account to access your workspace.'
        : isRu
          ? 'Публичный демо-доступ сейчас отключён. Для доступа к рабочему пространству войдите в личный аккаунт.'
          : 'İctimai demo hazırda bağlıdır. İş sahəsinə qeydiyyatlı şəxsi hesabınızla daxil olun.',
    },
    {
      q: isEn
        ? 'How do team user limits and quotas work across subscription tiers?'
        : isRu
          ? 'Как работают лимиты пользователей и роли в тарифах?'
          : 'Komanda üzvlərim üçün istifadəçi limitləri necə tənzimlənir?',
      a: isEn
        ? 'Every plan comes with strict role seats: The Starter Tier ($49/mo) includes 1 Owner, 1 Canada Purchasing, 1 Sales, 1 Finance, and 1 Courier. The Pro Tier ($99/mo) expands to 1 Owner, 2 Canada Purchasing, 2 Sales, 2 Finance, and 5 Couriers. Store owners generate custom invite links directly from their dashboard.'
        : isRu
          ? 'В каждом тарифе предусмотрены четкие квоты: Starter ($49/мес) включает 1 владельца, 1 закупщика в Канаде, 1 менеджера продаж, 1 финансиста и 1 курьера. Pro ($99/мес) включает 1 владельца, 2 закупщиков, 2 продавцов, 2 финансистов и 5 курьеров.'
          : 'Hər bir abunəlik paketimizdə xüsusi kotalar mövcuddur: Başlanğıc paketdə 1 Patron, 1 Kanada kargo istifadəçisi, 1 Satış, 1 Finans və 1 Sahə Kuryesi daxildir. Pro paketdə isə 1 Patron, 2 Kanada Satınalma, 2 Satış, 2 Finans və 5 Sahə Kuryesi verilir. Patron öz panelindən birbaşa dəvət linki kopyalayıb əməkdaşlarına göndərə bilir.',
    },
    {
      q: isEn
        ? 'What if our business does not have an Aramex corporate account?'
        : isRu
          ? 'Что делать, если у нас нет корпоративного аккаунта Aramex?'
          : 'Aramex hesabım yoxdursa nə etməliyəm?',
      a: isEn
        ? 'In addition to Aramex, TOMNAP supports DHL, UPS, FedEx, and Custom Cargo modes. If you possess an official Aramex corporate account, simply input your credentials in Settings to enable automated sync.'
        : isRu
          ? 'Помимо Aramex, платформа поддерживает интеграцию с DHL, UPS, FedEx и режим собственного карго. При наличии корпоративного аккаунта Aramex достаточно ввести ключи в настройках для автосинхронизации.'
          : 'Platformada Aramex ilə yanaşı DHL, UPS, FedEx və Fərdi Karqo rejimi mövcuddur. Əgər rəsmi Aramex hesabınız varsa, API açarlarınızı tənzimləmələrdən daxil edərək avtomatik sinxronizasiyanı aktivləşdirə bilərsiniz.',
    },
    {
      q: isEn
        ? 'How is our customer data and pricing protected from competing boutiques?'
        : isRu
          ? 'Как данные наших клиентов защищены от других магазинов?'
          : 'Müştəri məlumatlarım digər butiklərdən necə qorunur?',
      a: isEn
        ? 'Signed-in users access records for their company and assigned role. Platform administrators manage access across companies.'
        : isRu
          ? 'Доступ к данным определяется компанией и ролью пользователя. Администраторы платформы управляют доступом к компаниям.'
          : 'Məlumatlara giriş istifadəçinin butiki və rolu üzrə yoxlanılır. Platforma administratorları butiklər üzrə girişi idarə edir.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Arxa Plan İşıqlandırma Qradiyentləri (Glassmorphic Glows) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="absolute top-[30%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-600/15 blur-[140px]" />
        <div className="absolute bottom-[10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-[130px]" />
      </div>

      {/* 1. ÜST NAVİQASİYA BAR (Sticky Glass Header) */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={onPanelAc}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <span>T</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-wider text-white uppercase">
                  TOMNAP
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  SAAS
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium tracking-tight">
                Global Parcel &amp; Commerce Platform
              </p>
            </div>
          </div>

          {/* Nav Links (Masaüstü) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">
              {isEn ? 'Features' : isRu ? 'Возможности' : 'Xüsusiyyətlər'}
            </a>
            <a href="#tomnap-matrix" className="hover:text-white transition-colors">
              T-O-M-N-A-P
            </a>
            <a href="#pricing" className="hover:text-white transition-colors">
              {isEn ? 'Pricing & Limits' : isRu ? 'Тарифы и Квоты' : 'Paketlər & Limitlər'}
            </a>
            <a href="#logistics" className="hover:text-white transition-colors">
              {isEn ? 'Global Logistics' : isRu ? 'Авиакарго' : 'Beynəlxalq Karqo'}
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              {isEn ? 'FAQ' : isRu ? 'Частые Вопросы' : 'Suallar'}
            </a>
          </nav>

          {/* Sağ Əməliyyatlar: Dil Seçici + Canlı Demo + Giriş */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dil Seçici (Dark Theme) */}
            <DilSecici darkTheme={true} />

            {/* Canlı Demo Düyməsi */}
            <button
              type="button"
              onClick={onDemoAc}
              className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title={
                isEn
                  ? 'Interactive Sandbox with 109 Sample Orders'
                  : '109 Nümunəvi Sifarişlə Canlı Sınaq Sürüşü'
              }
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline">
                {isEn ? 'Live Demo' : isRu ? 'Демо' : 'Canlı Demo'}
              </span>
            </button>

            {/* Panelə Giriş */}
            <button
              type="button"
              onClick={onPanelAc}
              className="px-3.5 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 hidden xs:inline opacity-80" />
              <span>{isEn ? 'Panel Access' : isRu ? 'Вход в Панель' : 'Panelə Giriş'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Qeydiyyat CTA */}
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="hidden lg:flex px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {isEn ? 'Register' : isRu ? 'Регистрация' : 'Qeydiyyat'}
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO BÖLMƏSİ */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          {/* Canlı Sistem Rozeti */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-lg text-xs text-slate-300 animate-in fade-in slide-in-from-top-4 duration-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold text-white">
              {isEn
                ? '🇨🇦 Canada ➔ 🇦🇿 Baku Express Air Corridor'
                : isRu
                  ? '🇨🇦 Канада ➔ 🇦🇿 Баку Экспресс Авиалиния'
                  : '🇨🇦 Kanada ➔ 🇦🇿 Bakı Express Hava Xətti'}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-indigo-400 font-bold">
              {isEn ? 'Aramex API & Gemini AI Live' : 'Aramex API & Gemini AI Aktivdir'}
            </span>
          </div>

          {/* Əsas Başlıq */}
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              {isEn ? (
                <>
                  Global Cross-Border Commerce &amp; <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                    Parcel Logistics Platform
                  </span>
                </>
              ) : isRu ? (
                <>
                  Глобальная Трансграничная Торговля и <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                    Логистическая Платформа
                  </span>
                </>
              ) : (
                <>
                  Qlobal Transsərhəd Ticarət və <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                    Karqo Lojistika Platforması
                  </span>
                </>
              )}
            </h1>
            <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
              {isEn
                ? 'The end-to-end B2B operating system for cross-border boutique commerce. Ingest orders from WhatsApp & Instagram via Gemini AI, track flight manifests from Toronto to Baku with Aramex, isolate multi-tenant stores, and reconcile doorstep courier cash on delivery.'
                : isRu
                  ? 'Комплексное B2B SaaS решение для трансграничной торговли. Прием заказов из WhatsApp и Instagram с помощью Gemini AI, онлайн-трекинг рейсов Торонто ➔ Баку с Aramex, изоляция бутиков и инкассация курьерами у двери.'
                  : 'Instagram və WhatsApp üzərindən satılan məhsulların Kanadadan qapıya qədər izlənməsi, süni intellektlə avtomatlaşdırılması, kurye paylanması və nağd/kart təhsilatı üçün tam inteqrasiya olunmuş B2B SaaS həlli.'}
            </p>
          </div>

          {/* Fəaliyyət Çağırışı (CTA) Düymələri */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 hover:scale-105 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>
                {isEn
                  ? 'Register Your Boutique'
                  : isRu
                    ? 'Зарегистрировать Бутик'
                    : 'Butikinizi Qeydiyyatdan Keçirin'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onDemoAc}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700 shadow-lg hover:border-slate-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>
                {isEn ? 'Demo access information' : isRu ? 'Доступ к демо' : 'Demo giriş məlumatı'}
              </span>
            </button>
          </div>

          {/* 4 Canlı Metrik Göstəricisi */}
          <div className="pt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto text-left">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Live Database' : isRu ? 'База Заказов' : 'Canlı Baza'}</span>
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white">{toplamSiparis}+</div>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Supabase cloud orders'
                  : isRu
                    ? 'Заказов в базе Supabase'
                    : 'Supabase canlı sifariş'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'OCR Speed' : isRu ? 'Скорость OCR' : 'OCR Sürəti'}</span>
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">~2.1s</div>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Gemini AI visual parsing'
                  : isRu
                    ? 'Распознавание Gemini AI'
                    : 'Gemini AI foto oxuma'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Air Cargo Route' : isRu ? 'Авиакоридор' : 'Hava Xətti'}</span>
                <Plane className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black text-white">YYZ ➔ GYD</div>
              <p className="text-[11px] text-slate-400">Aramex</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Tenant Isolation' : isRu ? 'Изоляция Данных' : 'Butik Girişi'}</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-black text-white">TOMNAP</div>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'Company and role access controls'
                  : isRu
                    ? 'Безопасность мульти-тенант'
                    : 'Multi-Tenant təhlükəsizlik'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. T-O-M-N-A-P PLATFORMA SÜTUNLARI (İnteraktiv Bölmə) */}
      <section
        id="tomnap-matrix"
        className="py-20 bg-slate-900/50 border-y border-slate-800/60 relative z-10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400">
              {isEn ? 'System Architecture' : isRu ? 'Анатомия Системы' : 'Sistemin Anatomiyası'}
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black text-white">
              {isEn
                ? 'What Does T-O-M-N-A-P Stand For?'
                : isRu
                  ? 'Что Означает T-O-M-N-A-P?'
                  : 'T-O-M-N-A-P Nə Deməkdir?'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              {isEn
                ? 'Our platform unifies the entire cross-border parcel lifecycle — from Toronto dispatch to Baku doorstep delivery — across 6 fully integrated modules.'
                : isRu
                  ? 'TOMNAP объединяет всю цепочку трансграничной доставки (от склада в Канаде до двери клиента в Баку) в 6 взаимосвязанных модулях.'
                  : 'Platformamız beynəlxalq parsel ticarətinin hər bir halqasını (Kanada anbarından Bakıda qapıya çatdırılmaya qədər) 6 inteqrasiya olunmuş modulda birləşdirir.'}
            </p>
          </div>

          {/* 6 Hərf Düymələri */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tomnapFeatures.map((f) => {
              const aktiv = seciliTab === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setSeciliTab(f.id as any)}
                  className={`px-4 py-3 rounded-2xl border transition-all flex items-center gap-2.5 cursor-pointer ${
                    aktiv
                      ? 'bg-slate-800 border-indigo-500/80 text-white shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs text-white bg-gradient-to-br ${f.color}`}
                  >
                    {f.letter}
                  </span>
                  <span className="text-xs font-bold">{f.id.toUpperCase()}</span>
                </button>
              );
            })}
          </div>

          {/* Seçili Hərfin Ətraflı Vitrini */}
          {(() => {
            const f = tomnapFeatures.find((item) => item.id === seciliTab)!;
            const IconComponent = f.icon;
            return (
              <div className="p-6 sm:p-10 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    <span>{f.tag}</span>
                  </div>
                  <h4 className="text-2xl sm:text-3xl font-black text-white">{f.title}</h4>
                  <p className="text-xs sm:text-sm text-indigo-200/90 font-medium">{f.subtitle}</p>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{f.desc}</p>

                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {f.metrics.map((m, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2 text-xs text-slate-200"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 to-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-4 shadow-inner">
                  <div
                    className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white shadow-xl shadow-indigo-500/20`}
                  >
                    <IconComponent className="w-10 h-10" />
                  </div>
                  <div>
                    <h5 className="text-base font-bold text-white">
                      {isEn
                        ? 'Live Module Integration'
                        : isRu
                          ? 'Модуль Готов к Работе'
                          : 'Canlı Modul İnteqrasiyası'}
                    </h5>
                    <p className="text-xs text-slate-400 mt-1">
                      {isEn
                        ? 'This module is fully integrated into the TOMNAP platform workspace and available for testing.'
                        : isRu
                          ? 'Этот модуль полностью подключен к панели TOMNAP и доступен для использования.'
                          : 'Bu modul dərhal TOMNAP iş masasına inteqrasiya olunub və istifadəyə hazırdır.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onPanelAc}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>
                      {isEn ? 'Inspect in Workspace' : isRu ? 'Перейти к Модулю' : 'Modula Bax'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* 4. ABUNƏLİK PAKETLƏRİ VƏ ROL LİMİTLƏRİ (#pricing) */}
      <section id="pricing" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400">
              {isEn ? 'Transparent Pricing' : isRu ? 'Прозрачные Тарифы' : 'Şəffaf Qiymət Modeli'}
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black text-white">
              {isEn
                ? 'Choose the Right Plan for Your Boutique'
                : isRu
                  ? 'Тарифные Планы для Бутиков'
                  : 'Butikinizə Uyğun Abunəlik Paketləri'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              {isEn
                ? 'Every tier specifies exact user seat limits and team roles. No hidden transaction fees.'
                : isRu
                  ? 'В каждом тарифе четко указано количество пользователей и ролей. Без скрытых платежей.'
                  : 'Hər paketdə dəqiq istifadəçi sayı və komanda limitləri göstərilmişdir. Gizli ödəniş yoxdur.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Başlanğıc Butik ($49/mo) */}
            <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20">
                  {isEn ? 'Starter Boutique' : isRu ? 'Стартовый Бутик' : 'Solo / Başlanğıc Butik'}
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-400">$</span>
                    <span className="text-4xl font-black text-white">49</span>
                    <span className="text-slate-400 text-sm font-bold">
                      / {isEn ? 'month' : isRu ? 'мес.' : 'ay'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isEn
                      ? 'Designed for solo owners and early-stage boutique sellers'
                      : isRu
                        ? 'Для начинающих продавцов и единичных бутиков'
                        : 'Yeni başlayan və tək mağazalı e-ticarət satıcıları üçün'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="font-bold text-white text-[11px] uppercase tracking-wider text-slate-400">
                    {isEn
                      ? 'Team Seat Quotas (1-1-1-1-1):'
                      : isRu
                        ? 'Квоты пользователей (1-1-1-1-1):'
                        : 'İstifadəçi Limitləri:'}
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Owner / Executive Seat'
                        : isRu
                          ? 'Владелец (Шеф)'
                          : 'Patron (Şirkət Sahibi)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Canada Purchasing Agent'
                        : isRu
                          ? 'Закупщик в Канаде'
                          : 'Kanada Satınalma İstifadəçisi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Sales & Ingestion Lead'
                        : isRu
                          ? 'Менеджер Продаж'
                          : 'Satış & Sifariş Girişi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Baku Finance & Cash Register'
                        : isRu
                          ? 'Кассир / Финансы Баку'
                          : 'Bakı Kassa & Maliyyə Məsuliyyəti'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Baku Field Courier'
                        : isRu
                          ? 'Курьер доставки в Баку'
                          : 'Bakı Sahə Kuryesi'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                {isEn ? 'Select Starter Plan' : isRu ? 'Выбрать Starter' : 'Başlanğıc Paketi Seç'}
              </button>
            </div>

            {/* 2. Pro Şəbəkə ($99/mo) */}
            <div className="p-8 rounded-3xl bg-gradient-to-b from-indigo-950/60 to-slate-900 border-2 border-indigo-500/80 flex flex-col justify-between space-y-6 shadow-2xl shadow-indigo-600/20 relative">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black uppercase tracking-widest shadow-md">
                {isEn ? 'Most Popular' : isRu ? 'Популярный Выбор' : 'Ən Çox Seçilən'}
              </span>

              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                  {isEn ? 'Pro Boutique Network' : isRu ? 'Сеть Бутиков Pro' : 'Pro Butik Şəbəkəsi'}
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-indigo-400">$</span>
                    <span className="text-4xl font-black text-white">99</span>
                    <span className="text-indigo-300 text-sm font-bold">
                      / {isEn ? 'month' : isRu ? 'мес.' : 'ay'}
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/80 mt-1">
                    {isEn
                      ? 'For high-volume boutiques with active sales reps and field couriers'
                      : isRu
                        ? 'Для растущих бутиков с командой продаж и курьерской службой'
                        : 'Yüksək sifariş həcmi və aktiv kurye şəbəkəsi olan butiklər üçün'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-200">
                  <div className="font-bold text-indigo-300 text-[11px] uppercase tracking-wider">
                    {isEn
                      ? 'Expanded Quotas (1-2-2-2-5):'
                      : isRu
                        ? 'Расширенные квоты (1-2-2-2-5):'
                        : 'Genişləndirilmiş Limitlər:'}
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>1</strong>{' '}
                      {isEn
                        ? 'Owner / Executive Seat'
                        : isRu
                          ? 'Владелец'
                          : 'Patron (Şirkət Sahibi)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>2</strong>{' '}
                      {isEn
                        ? 'Canada Purchasing & Cargo Seats'
                        : isRu
                          ? 'Закупщика в Канаде'
                          : 'Kanada Satınalma & Kargo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>2</strong>{' '}
                      {isEn
                        ? 'Sales & Ingestion Reps'
                        : isRu
                          ? 'Менеджера Продаж'
                          : 'Satış & Sifariş Girişi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>2</strong>{' '}
                      {isEn
                        ? 'Baku Finance & Cash Managers'
                        : isRu
                          ? 'Сотрудника Финансов Баку'
                          : 'Bakı Finans & Kassa'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>5</strong>{' '}
                      {isEn
                        ? 'Baku Field Couriers'
                        : isRu
                          ? 'Курьеров доставки по Баку'
                          : 'Bakı Sahə Kuryesi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 font-bold pt-1">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      {isEn
                        ? 'Aramex Live API + Unlimited Gemini AI'
                        : isRu
                          ? 'Live API Aramex + Gemini AI без лимитов'
                          : 'Aramex Canlı API + Limitsiz Gemini AI'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                {isEn ? 'Join Pro Network' : isRu ? 'Подключить Pro' : 'Pro Şəbəkəyə Qoşul'}
              </button>
            </div>

            {/* 3. Enterprise Qlobal */}
            <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold border border-purple-500/20">
                  {isEn
                    ? 'Global Enterprise'
                    : isRu
                      ? 'Корпоративный Тариф'
                      : 'Qlobal Karqo & Şirkət'}
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">
                      {isEn ? 'Custom' : isRu ? 'Индивидуально' : 'Fərdi'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isEn
                      ? 'For international logistics carriers and enterprise retail chains'
                      : isRu
                        ? 'Для логистических компаний и сетей магазинов'
                        : 'Öz kargo təyyarəsi və ya çoxlu xarici anbarları olan korporasiyalar'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="font-bold text-white text-[11px] uppercase tracking-wider text-slate-400">
                    {isEn
                      ? 'Unlimited Capabilities:'
                      : isRu
                        ? 'Безлимитные возможности:'
                        : 'Limitsiz İmkânlar:'}
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>2+</strong>{' '}
                      {isEn ? 'Executive Admins' : isRu ? 'Администратора' : 'Patron İdarəçi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>5+</strong>{' '}
                      {isEn
                        ? 'Canada, US & Japan Purchasing Leads'
                        : isRu
                          ? 'Закупщиков (Канада, США, Япония)'
                          : 'Kanada, ABŞ, Yaponiya Satınalma'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>10+</strong>{' '}
                      {isEn
                        ? 'Sales Representatives'
                        : isRu
                          ? 'Менеджеров'
                          : 'Satış Məsuliyyətlisi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>25+</strong>{' '}
                      {isEn
                        ? 'Field Couriers & Drivers'
                        : isRu
                          ? 'Курьеров и водителей'
                          : 'Bakı Sahə Kuryesi'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      {isEn
                        ? 'Custom Domain CNAME (app.yourbrand.com)'
                        : isRu
                          ? 'Свой домен CNAME (app.brand.com)'
                          : 'Xüsusi Domain CNAME (app.butik.az)'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                {isEn
                  ? 'Contact Enterprise Sales'
                  : isRu
                    ? 'Связаться с Нами'
                    : 'Bizimlə Əlaqə Saxlayın'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. TEZ-TEZ VERİLƏN SUALLAR (FAQ) */}
      <section
        id="faq"
        className="py-20 bg-slate-900/40 border-t border-slate-800/80 relative z-10"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400">
              {isEn ? 'Help & Knowledge Hub' : isRu ? 'Центр Помощи' : 'Kömək Mərkəzi'}
            </h2>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              {isEn
                ? 'Frequently Asked Questions'
                : isRu
                  ? 'Часто Задаваемые Вопросы'
                  : 'Tez-Tez Verilən Suallar'}
            </h3>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const acik = acikFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setAcikFaq(acik ? null : index)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm text-white cursor-pointer hover:bg-slate-800/40"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${acik ? 'rotate-180 text-indigo-400' : ''}`}
                    />
                  </button>
                  {acik && (
                    <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/50 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. ALT BANNER VƏ ÇAĞIRIŞ (Global Footer CTA) */}
      <section className="py-16 relative z-10 bg-gradient-to-r from-blue-900/40 via-indigo-950/60 to-slate-950 border-t border-indigo-900/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h3 className="text-2xl sm:text-4xl font-black text-white">
            {isEn
              ? 'Automate Your Cross-Border Logistics & Order Pipeline Today'
              : isRu
                ? 'Автоматизируйте Карго и Заказы Вашего Бутика Сегодня'
                : 'Butikinizin Karqo və Sifariş Zəncirini Bu Gün Avtomatlaşdırın'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            {isEn
              ? 'Manage orders, shipping and product information in one workspace.'
              : isRu
                ? 'Управляйте заказами, доставкой и товарами в одном рабочем пространстве.'
                : 'Sifarişləri, çatdırılmanı və məhsulları bir iş sahəsində idarə edin.'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
            >
              {isEn ? 'Register Boutique' : isRu ? 'Зарегистрироваться' : 'Qeydiyyatdan Keç'}
            </button>
            <button
              type="button"
              onClick={onDemoAc}
              className="px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 cursor-pointer transition-all"
            >
              {isEn
                ? 'Explore Interactive Demo'
                : isRu
                  ? 'Смотреть Демо'
                  : 'Canlı Nümayişə Bax (Demo)'}
            </button>
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="py-8 bg-slate-950 border-t border-slate-800/80 text-xs text-slate-500 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-[10px]">
              T
            </div>
            <span className="font-bold text-slate-400">TOMNAP</span>
            <span>•</span>
            <span>
              © 2026 tomnap.com.{' '}
              {isEn
                ? 'All rights reserved.'
                : isRu
                  ? 'Все права защищены.'
                  : 'Bütün hüquqlar qorunur.'}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>Express Node &amp; Supabase PostgreSQL</span>
            <span>•</span>
            <span>Google Gemini AI</span>
            <span>•</span>
            <span>Aramex REST Tracking</span>
          </div>
        </div>
      </footer>

      {/* Qeydiyyat Modalı */}
      <ButikQeydiyyatModal
        acik={qeydiyyatAcik}
        onKapat={() => setQeydiyyatAcik(false)}
        onDemoAc={onDemoAc}
        onBasariliKayit={onBasariliKayit}
      />
    </div>
  );
};
