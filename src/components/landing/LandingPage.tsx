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
  HelpCircle
} from 'lucide-react';
import { ButikQeydiyyatModal } from './ButikQeydiyyatModal';

interface LandingPageProps {
  onPanelAc: () => void;
  onDemoAc: () => void;
  toplamSiparis?: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onPanelAc,
  onDemoAc,
  toplamSiparis = 109,
}) => {
  const [qeydiyyatAcik, setQeydiyyatAcik] = useState(false);
  const [seciliTab, setSeciliTab] = useState<'track' | 'order' | 'manage' | 'navigate' | 'automate' | 'parcel'>('track');
  const [acikFaq, setAcikFaq] = useState<number | null>(0);

  const tomnapFeatures = [
    {
      id: 'track',
      letter: 'T',
      title: 'Track — Canlı Kargo & AWB İzləmə',
      subtitle: 'Toronto YYZ ➔ Bakı GYD Aramex hava xətti üzrə dəqiqəbədəqiqə uçuş izləməsi',
      desc: 'Aramex API v2 birbaşa inteqrasiyası ilə bütün bağlamaların AWB nömrələri avtomatik yoxlanılır. Toronto anbarından təyyarəyə yüklənmə, GYD hava limanına eniş və Bakı anbarına daxil olma anında sistemə işlənir.',
      icon: Plane,
      color: 'from-blue-500 to-cyan-500',
      tag: 'Aramex REST API',
      metrics: ['100% Avtomatlaşdırılmış AWB', 'Gündəlik Çəki Cədvəlləri', 'Uçuş & Eniş Bildirişləri']
    },
    {
      id: 'order',
      letter: 'O',
      title: 'Order — Çoxkanallı Sifariş Qəbulu',
      subtitle: 'Instagram Canlı Yayım, Reels, DM və WhatsApp danışıqlarından bir toxunuşla sifariş',
      desc: 'Müştərilərinizdən gələn ekran görüntülərini və qrup mesajlarını əl ilə yazmağa ehtiyac yoxdur. Platforma müştəri adı, telefon, məhsul növü, qiymət və beh məbləğini dərhal çıxarır.',
      icon: Camera,
      color: 'from-emerald-500 to-teal-500',
      tag: 'Gemini AI Vision',
      metrics: ['2 Saniyəyə OCR Tanıma', 'İnstagram Linkləri', 'Beh & Borc Hesablama']
    },
    {
      id: 'manage',
      letter: 'M',
      title: 'Manage — Multi-Tenant Butik İdarəetməsi',
      subtitle: 'Hər butik üçün təcrid olunmuş müştəri bazası, kassa və komanda rolları',
      desc: 'Birdən çox butiki və ya tərəfdaşı tək platformadan idarə edin. Hər butikin sifarişləri, müştəri CRM məlumatları və maliyyə hesabatları PostgreSQL səviyyəsində bir-birindən tam təcrid olunur.',
      icon: Users,
      color: 'from-purple-500 to-pink-500',
      tag: 'PostgreSQL İzolasiyası',
      metrics: ['Tam Məlumat Təcridi', 'Patron, Satış, Finans Rolları', 'Xüsusi Komanda Dəvətləri']
    },
    {
      id: 'navigate',
      letter: 'N',
      title: 'Navigate — Qlobal Marşrut və Gömrük',
      subtitle: 'Kanada, ABŞ, Yaponiya və Türkiyədən multimodal multimodal çatdırılma',
      desc: 'Beynəlxalq alış-veriş zamanı gömrük bəyannamələrini və manifestlərini avtomatik formalaşdırın. Toronto (YYZ), New York (JFK), Tokyo (NRT) və İstanbuldan (IST) Bakıya (GYD) logistika xətləri dəstəklənir.',
      icon: Globe,
      color: 'from-amber-500 to-orange-500',
      tag: 'Çoxlu Daşıyıcı Dəstəyi',
      metrics: ['Avtomatik Bəyannamə', 'CAD ➔ AZN Valyuta Dönüşümü', 'Gömrük Siyahıları']
    },
    {
      id: 'automate',
      letter: 'A',
      title: 'Automate — Süni İntellektlə Avtomatlaşdırma',
      subtitle: 'Google Gemini AI ilə status dəyişiklikləri və müştəriyə WhatsApp bildirişi',
      desc: 'Kargo statusu dəyişdikdə və ya Bakıya çatdıqda müştəriyə avtomatik fərdiləşdirilmiş WhatsApp mesajı göndərin. Qalıq borc, çatdırılma ünvanı və kurye əlaqə nömrəsi bir toxunuşla müştəriyə çatır.',
      icon: Cpu,
      color: 'from-indigo-500 to-violet-500',
      tag: '1-Klik WhatsApp Şablonları',
      metrics: ['WhatsApp API Şablonları', 'Avtomatik Borc Xatırlatması', '0 Əl ilə Mesajlaşma']
    },
    {
      id: 'parcel',
      letter: 'P',
      title: 'Parcel — Son Kilometr və Kurye Təhsilatı',
      subtitle: 'Bakı daxili sahə kuryeləri üçün xüsusi mobil paylama və kassa masası',
      desc: 'Məhsul Bakıya çatdıqda sahə kuryesi öz telefonundan yalnız ona təhkim olunmuş paketləri görür. Qapıda nağd və ya kartla qalıq borcu təhsil edərək tək kliklə kassanı bağlayır.',
      icon: Truck,
      color: 'from-rose-500 to-red-500',
      tag: 'Mobil Kurye Masası',
      metrics: ['Telefon üçün Uyğunlaşdırılmış İnterfeys', 'Qapıda Qalıq Təhsilatı', 'Gündəlik Kassa Təhvili']
    },
  ];

  const faqs = [
    {
      q: 'TOMNAP platformasına necə qoşula bilərəm?',
      a: 'Yuxarıdakı "Qeydiyyatdan Keçin" düyməsinə klikləyərək butikinizin adını və əlaqə nömrənizi daxil edin. Məlumat təhlükəsizliyi və izolasiya standartlarımıza görə müraciətiniz Super Admin tərəfindən 1-2 saat ərzində təsdiqlənir və iş masanız aktivləşdirilir.'
    },
    {
      q: 'Qeydiyyatdan keçmədən sistemi sınaqdan keçirə bilərəmmi?',
      a: 'Bəli, tamamilə! "1-Kliklə Canlı Test Et (Demo)" düyməsinə klikləyərək 109 real nümunəvi sifariş, Aramex kargo izləməsi və Gemini AI masası olan canlı sandbox mühitimizdə sınaq sürüşü edə bilərsiniz.'
    },
    {
      q: 'Komanda üzvlərim üçün istifadəçi limitləri necə tənzimlənir?',
      a: 'Hər bir abunəlik paketimizdə xüsusi kotalar mövcuddur: Başlanğıc paketdə 1 Patron, 1 Kanada kargo istifadəçisi, 2 Satış, 1 Finans və 5 Sahə Kuryesi daxildir. Pro paketdə isə 10 kurye və 4 satış istifadəçisi verilir. Patron öz panelindən birbaşa dəvət linki kopyalayıb əməkdaşlarına göndərə bilir.'
    },
    {
      q: 'Aramex hesabım yoxdursa nə etməliyəm?',
      a: 'Platformada Aramex ilə yanaşı DHL, UPS, FedEx və Fərdi Karqo rejimi mövcuddur. Əgər rəsmi Aramex hesabınız varsa (#72470858 kimi), API açarlarınızı tənzimləmələrdən daxil edərək avtomatik sinxronizasiyanı aktivləşdirə bilərsiniz.'
    },
    {
      q: 'Müştəri məlumatlarım digər butiklərdən necə qorunur?',
      a: 'TOMNAP multi-tenant arxitekturası sayəsində hər bir butikin verilənləri PostgreSQL səviyyəsində unikal tenant_id ilə təcrid olunur. Başqa heç bir mağaza və ya istifadəçi sizin müştərilərinizi, qiymətlərinizi və ya sifarişlərinizi görə bilməz.'
    }
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
                <span className="text-xl font-black tracking-wider text-white uppercase">TOMNAP</span>
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
            <a href="#features" className="hover:text-white transition-colors">Xüsusiyyətlər</a>
            <a href="#tomnap-matrix" className="hover:text-white transition-colors">T-O-M-N-A-P</a>
            <a href="#pricing" className="hover:text-white transition-colors">Paketlər &amp; Limitlər</a>
            <a href="#logistics" className="hover:text-white transition-colors">Beynəlxalq Karqo</a>
            <a href="#faq" className="hover:text-white transition-colors">Suallar</a>
          </nav>

          {/* Sağ Əməliyyatlar */}
          <div className="flex items-center gap-2.5">
            {/* Canlı Demo Düyməsi */}
            <button
              type="button"
              onClick={onDemoAc}
              className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="109 Nümunəvi Sifarişlə Canlı Sınaq Sürüşü"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline">Canlı Demo</span>
            </button>

            {/* Panelə Giriş */}
            <button
              type="button"
              onClick={onPanelAc}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>Panelə Giriş</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Qeydiyyat CTA */}
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="hidden lg:flex px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
            >
              Qeydiyyat
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
            <span className="font-semibold text-white">🇨🇦 Kanada ➔ 🇦🇿 Bakı Express Hava Xətti</span>
            <span className="text-slate-500">•</span>
            <span className="text-indigo-400 font-bold">Aramex API &amp; Gemini AI Aktivdir</span>
          </div>

          {/* Əsas Başlıq */}
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              Qlobal Transsərhəd Ticarət və <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                Karqo Lojistika Platforması
              </span>
            </h1>
            <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
              Instagram və WhatsApp üzərindən satılan məhsulların Kanadadan qapıya qədər izlənməsi, süni intellektlə avtomatlaşdırılması, kurye paylanması və nağd/kart təhsilatı üçün tam inteqrasiya olunmuş B2B SaaS həlli.
            </p>
          </div>

          {/* Fəaliyyət Çağırışı (CTA) Düymələri */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-sm shadow-xl shadow-indigo-600/30 hover:scale-105 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Butikinizi Qeydiyyatdan Keçirin</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onDemoAc}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700 shadow-lg hover:border-slate-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>1-Kliklə Canlı Test Et (Demo)</span>
            </button>
          </div>

          {/* 4 Canlı Metrik Göstəricisi */}
          <div className="pt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto text-left">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Canlı Baza</span>
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white">{toplamSiparis}+</div>
              <p className="text-[11px] text-slate-400">Supabase canlı sifariş</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>OCR Sürəti</span>
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">~2.1 san</div>
              <p className="text-[11px] text-slate-400">Gemini AI foto oxuma</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Hava Xətti</span>
                <Plane className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-black text-white">YYZ ➔ GYD</div>
              <p className="text-[11px] text-slate-400">Aramex #72470858</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Təcrid Zəmanəti</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-black text-white">100%</div>
              <p className="text-[11px] text-slate-400">Multi-Tenant təhlükəsizlik</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. T-O-M-N-A-P PLATFORMA SÜTUNLARI (İnteraktiv Bölmə) */}
      <section id="tomnap-matrix" className="py-20 bg-slate-900/50 border-y border-slate-800/60 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400">
              Sistemin Anatomiyası
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black text-white">
              T-O-M-N-A-P Nə Deməkdir?
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Platformamız beynəlxalq parsel ticarətinin hər bir halqasını (Kanada anbarından Bakıda qapıya çatdırılmaya qədər) 6 inteqrasiya olunmuş modulda birləşdirir.
            </p>
          </div>

          {/* 6 Hərf Düymələri */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tomnapFeatures.map((f) => {
              const IconComponent = f.icon;
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
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs text-white bg-gradient-to-br ${f.color}`}>
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
                  <h4 className="text-2xl sm:text-3xl font-black text-white">
                    {f.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-indigo-200/90 font-medium">
                    {f.subtitle}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {f.desc}
                  </p>

                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {f.metrics.map((m, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2 text-xs text-slate-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 to-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-4 shadow-inner">
                  <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white shadow-xl shadow-indigo-500/20`}>
                    <IconComponent className="w-10 h-10" />
                  </div>
                  <div>
                    <h5 className="text-base font-bold text-white">Canlı Modul İnteqrasiyası</h5>
                    <p className="text-xs text-slate-400 mt-1">
                      Bu modul dərhal TOMNAP iş masasına inteqrasiya olunub və istifadəyə hazırdır.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onPanelAc}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Modula Bax</span>
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
              Şəffaf Qiymət Modeli
            </h2>
            <h3 className="text-2xl sm:text-4xl font-black text-white">
              Butikinizə Uyğun Abunəlik Paketləri
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Hər paketdə dəqiq istifadəçi sayı və komanda limitləri göstərilmişdir. Gizli ödəniş yoxdur.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Başlanğıc Butik */}
            <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold border border-blue-500/20">
                  Solo / Başlanğıc Butik
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-400">$</span>
                    <span className="text-4xl font-black text-white">49</span>
                    <span className="text-slate-400 text-sm font-bold">/ ay</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Yeni başlayan və tək mağazalı e-ticarət satıcıları üçün</p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="font-bold text-white text-[11px] uppercase tracking-wider text-slate-400">
                    İstifadəçi Limitləri:
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Patron (Şirkət Sahibi)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Kanada Satınalma İstifadəçisi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Satış &amp; Sifariş Girişi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Bakı Kassa &amp; Maliyyə Məsuliyyəti</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Bakı Sahə Kuryesi</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                Başlanğıc Paketi Seç
              </button>
            </div>

            {/* 2. Pro Şəbəkə (Ən Populyar) */}
            <div className="p-8 rounded-3xl bg-gradient-to-b from-indigo-950/60 to-slate-900 border-2 border-indigo-500/80 flex flex-col justify-between space-y-6 shadow-2xl shadow-indigo-600/20 relative">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black uppercase tracking-widest shadow-md">
                Ən Çox Seçilən
              </span>

              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                  Pro Butik Şəbəkəsi
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-indigo-400">$</span>
                    <span className="text-4xl font-black text-white">99</span>
                    <span className="text-indigo-300 text-sm font-bold">/ ay</span>
                  </div>
                  <p className="text-xs text-indigo-200/80 mt-1">Yüksək sifariş həcmi və aktiv kurye şəbəkəsi olan butiklər üçün</p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-200">
                  <div className="font-bold text-indigo-300 text-[11px] uppercase tracking-wider">
                    Genişləndirilmiş Limitlər:
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>1</strong> Patron (Şirkət Sahibi)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>2</strong> Kanada Satınalma &amp; Kargo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>2</strong> Satış &amp; Sifariş Girişi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>2</strong> Bakı Finans &amp; Kassa</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>5</strong> Bakı Sahə Kuryesi</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400 font-bold pt-1">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Aramex Canlı API + Limitsiz Gemini AI</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                Pro Şəbəkəyə Qoşul
              </button>
            </div>

            {/* 3. Enterprise Qlobal */}
            <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-6 hover:border-slate-700 transition-all">
              <div className="space-y-4">
                <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs font-bold border border-purple-500/20">
                  Qlobal Karqo &amp; Şirkət
                </span>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">Fərdi</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Öz kargo təyyarəsi və ya çoxlu xarici anbarları olan korporasiyalar</p>
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="font-bold text-white text-[11px] uppercase tracking-wider text-slate-400">
                    Limitsiz İmkânlar:
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>2+</strong> Patron İdarəçi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>5+</strong> Kanada, ABŞ, Yaponiya Satınalma</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>10+</strong> Satış Məsuliyyətlisi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span><strong>25+</strong> Bakı Sahə Kuryesi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Xüsusi Domain CNAME (app.butik.az)</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQeydiyyatAcik(true)}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                Bizimlə Əlaqə Saxlayın
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. TEZ-TEZ VERİLƏN SUALLAR (FAQ) */}
      <section id="faq" className="py-20 bg-slate-900/40 border-t border-slate-800/80 relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest text-indigo-400">Kömək Mərkəzi</h2>
            <h3 className="text-2xl sm:text-3xl font-black text-white">Tez-Tez Verilən Suallar</h3>
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
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${acik ? 'rotate-180 text-indigo-400' : ''}`} />
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
            Butikinizin Karqo və Sifariş Zəncirini Bu Gün Avtomatlaşdırın
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto">
            109+ aktiv canlı sifariş, Aramex kargo inteqrasiyası və Google Gemini AI ilə gücləndirilmiş TOMNAP platformasına indi qoşulun.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setQeydiyyatAcik(true)}
              className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
            >
              Qeydiyyatdan Keç
            </button>
            <button
              type="button"
              onClick={onDemoAc}
              className="px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 cursor-pointer transition-all"
            >
              Canlı Nümayişə Bax (Demo)
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
            <span>© 2026 tomnap.com. Bütün hüquqlar qorunur.</span>
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
        onBasariliKayit={() => {
          // İstəyə görə qeydiyyatdan sonra demoya yönləndirmə
        }}
      />
    </div>
  );
};
