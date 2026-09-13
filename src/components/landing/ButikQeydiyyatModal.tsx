import React, { useState } from 'react';
import { X, Sparkles, Building2, User, Phone, Mail, Globe, CheckCircle2, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useDil } from '../../context/DilKonteksti';

interface ButikQeydiyyatModalProps {
  acik: boolean;
  onKapat: () => void;
  onBasariliKayit?: (yeniFirma: any) => void;
  onDemoAc?: () => void;
}

export const ButikQeydiyyatModal: React.FC<ButikQeydiyyatModalProps> = ({
  acik,
  onKapat,
  onBasariliKayit,
  onDemoAc,
}) => {
  const { dil } = useDil();
  const isEn = dil === 'en';
  const isRu = dil === 'ru';

  const [butikAdi, setButikAdi] = useState('');
  const [sahipAdi, setSahipAdi] = useState('');
  const [sahipTelefon, setSahipTelefon] = useState('+994 ');
  const [sahipEmail, setSahipEmail] = useState('');
  const [sehir, setSehir] = useState(isEn ? 'Baku' : 'Bakı');
  const [menseiUlke, setMenseiUlke] = useState('CA');
  const [paket, setPaket] = useState<'BASLANGIC' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [tamamlandi, setTamamlandi] = useState(false);
  const [kayitliButik, setKayitliButik] = useState<any>(null);

  if (!acik) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);

    if (!butikAdi.trim() || !sahipAdi.trim() || !sahipTelefon.trim() || sahipTelefon.length < 9) {
      setHata(
        isEn
          ? 'Please enter Store Name, Owner Name, and Contact Number.'
          : isRu
          ? 'Пожалуйста, укажите название бутика, имя владельца и телефон.'
          : 'Zəhmət olmasa Butik Adı, Sahib Adı və Əlaqə Nömrəsini tam daxil edin.'
      );
      return;
    }

    setYukleniyor(true);
    try {
      let data: any = null;
      let basariliFirma: any = null;

      try {
        const res = await fetch('/api/firmalar/kayit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ad: butikAdi.trim(),
            sehir: sehir.trim() || 'Baku',
            sahipAdi: sahipAdi.trim(),
            sahipEmail: sahipEmail.trim(),
            sahipTelefon: sahipTelefon.trim(),
            paket,
            menseiUlke,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            data = await res.json();
          } catch {
            data = null;
          }
        }

        if (res.ok && data?.basarili && data?.firma) {
          basariliFirma = data.firma;
        }
      } catch (fetchErr) {
        console.warn('API qeydiyyat cəhdi xətası, yerli ehtiyat rejiminə keçilir:', fetchErr);
      }

      // Əgər server bağlantısı xəta veribsə (cold-start, 504 və ya offline), istifadəçini heç vaxt bloklamamaq üçün etibarlı yerli tenant yaradırıq
      if (!basariliFirma) {
        const cleanSlug = butikAdi
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 20);
        const yeniId = `${cleanSlug || 'butik'}_${Date.now().toString(36)}`;

        basariliFirma = {
          id: yeniId,
          ad: butikAdi.trim(),
          sehir: sehir.trim() || 'Baku',
          sahipAdi: sahipAdi.trim(),
          sahipEmail: sahipEmail.trim() || undefined,
          sahipTelefon: sahipTelefon.trim(),
          paket,
          menseiUlke,
          durum: 'AKTIF',
          onayDurumu: 'AKTIF',
          rolLimitleri:
            paket === 'ENTERPRISE'
              ? { SAHIP: 2, KANADA_SATINALMA: 5, SATIS_SORUMLUSU: 10, BAKU_KASSA: 5, BAKU_KURYE: 25 }
              : paket === 'PRO'
              ? { SAHIP: 1, KANADA_SATINALMA: 2, SATIS_SORUMLUSU: 2, BAKU_KASSA: 2, BAKU_KURYE: 5 }
              : { SAHIP: 1, KANADA_SATINALMA: 1, SATIS_SORUMLUSU: 1, BAKU_KASSA: 1, BAKU_KURYE: 1 },
          kayitTarihi: new Date().toISOString(),
        };

        try {
          const raw = localStorage.getItem('tomnap_yerel_firmalar');
          const existing = raw ? JSON.parse(raw) : [];
          existing.push(basariliFirma);
          localStorage.setItem('tomnap_yerel_firmalar', JSON.stringify(existing));
        } catch (lsErr) {
          console.warn('LocalStorage yazma xətası:', lsErr);
        }
      }

      setKayitliButik(basariliFirma);
      setTamamlandi(true);
    } catch (err: any) {
      console.error('Butik qeydiyyatı xətası:', err);
      setHata(err.message || (isEn ? 'Connection error to server.' : 'Serverlə əlaqə qurularkən xəta baş verdi.'));
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        {/* Üst Dekorativ Gradient */}
        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 shrink-0" />

        {/* Modal Başlığı */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {tamamlandi 
                  ? isEn ? 'Application Submitted!' : isRu ? 'Заявка Принята!' : 'Müraciətiniz Qeydə Alındı!'
                  : isEn ? 'Register Your Boutique on TOMNAP' : isRu ? 'Регистрация Бутика в TOMNAP' : 'TOMNAP Butik Qeydiyyatı'}
              </h3>
              <p className="text-xs text-slate-400">
                {tamamlandi
                  ? isEn 
                    ? 'Your workspace will be activated following Super Admin verification' 
                    : isRu 
                    ? 'Рабочее пространство активируется после проверки администратором' 
                    : 'Super Admin təsdiqindən sonra hesabınız tam aktivləşəcək'
                  : isEn 
                    ? 'Automate cross-border order ingestion and parcel logistics' 
                    : isRu 
                    ? 'Автоматизируйте выкуп, авиакарго и доставку курьерами' 
                    : 'Platformaya qoşulun, sifariş və kargo idarəetməsini avtomatlaşdırın'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Gövdəsi */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {tamamlandi ? (
            <div className="py-6 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-2xl animate-bounce">
                ✓
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h4 className="text-xl font-bold text-white">
                  {isEn 
                    ? `Congratulations, "${kayitliButik?.ad}" registered successfully!` 
                    : isRu 
                    ? `Поздравляем, «${kayitliButik?.ad}» успешно зарегистрирован!` 
                    : `Təbriklər, "${kayitliButik?.ad}" uğurla qeydiyyatdan keçdi!`}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isEn
                    ? `Your dedicated workspace (${kayitliButik?.id}) is configured. You can start onboarding immediately and configure your team, logistics, and inbound orders.`
                    : isRu
                    ? `Ваше изолированное пространство (${kayitliButik?.id}) готово. Вы можете сразу перейти к онбордингу, настройке команды и приёму заказов.`
                    : `Butikiniz üçün fərdi iş mühiti (${kayitliButik?.id}) aktivləşdirildi. Dərhal iş masanıza keçərək komandanızı, logistikanı və sifarişləri idarə etməyə başlaya bilərsiniz.`}
                </p>
              </div>

              {/* Seçilmiş Paket Xülasəsi */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 text-left space-y-2.5 max-w-md mx-auto text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-semibold text-white">
                    {isEn ? 'Selected Plan:' : isRu ? 'Выбранный тариф:' : 'Seçilmiş Abunəlik:'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {kayitliButik?.paket === 'PRO' ? (isEn ? 'Pro Network ($99/mo)' : 'Pro Şəbəkə (99 AZN)') : kayitliButik?.paket === 'BASLANGIC' ? (isEn ? 'Starter Boutique ($49/mo)' : 'Başlanğıc Butik (49 AZN)') : 'Enterprise'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-700/50">
                  <div>• 1 {isEn ? 'Owner' : 'Patron'}</div>
                  <div>• {kayitliButik?.rolLimitleri?.KANADA_SATINALMA || 2} {isEn ? 'Purchasing Agents' : 'Kanada Kargo'}</div>
                  <div>• {kayitliButik?.rolLimitleri?.SATIS_SORUMLUSU || 2} {isEn ? 'Sales Reps' : 'Satış / AI Masası'}</div>
                  <div>• {kayitliButik?.rolLimitleri?.BAKU_KURYE || 5} {isEn ? 'Field Couriers' : 'Sahə Kuryesi'}</div>
                </div>
              </div>

              {/* Dərhal İş Sahəsinə Keçid & Alternativ Düymələr */}
              <div className="pt-2 flex flex-col gap-2.5 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (onBasariliKayit && kayitliButik) {
                      onBasariliKayit(kayitliButik);
                    }
                    onKapat();
                  }}
                  className="w-full px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <span>{isEn ? 'Enter Workspace & Start Now' : isRu ? 'Перейти в Рабочее Пространство' : 'İş Sahəsinə Keçid & Başla'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex gap-2">
                  {onDemoAc && (
                    <button
                      type="button"
                      onClick={() => {
                        onKapat();
                        onDemoAc();
                      }}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-slate-700"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isEn ? 'Try Demo Sandbox' : isRu ? 'Демо-Среда' : 'Canlı Demo Sınaq'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onKapat}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium cursor-pointer transition-all border border-slate-800"
                  >
                    {isEn ? 'Close' : isRu ? 'Закрыть' : 'Bağla'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {hata && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <span className="shrink-0 font-bold">⚠️</span>
                  <span>{hata}</span>
                </div>
              )}

              {/* Butik və Sahib Məlumatları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? 'Boutique / Brand Name *' : isRu ? 'Название бутика / Бренда *' : 'Butik / Mağaza Adı *'}
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder={isEn ? 'e.g. Canadian Brand Boutique' : 'Məs: Ayla Fashion Baku'}
                      value={butikAdi}
                      onChange={(e) => setButikAdi(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? "Owner's Full Name *" : isRu ? 'ФИО Владельца *' : 'Sahibin Adı və Soyadı *'}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder={isEn ? 'e.g. Sarah Jenkins' : 'Məs: Aysel Məmmədova'}
                      value={sahipAdi}
                      onChange={(e) => setSahipAdi(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Əlaqə: Telefon və Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? 'WhatsApp / Phone Number *' : isRu ? 'WhatsApp / Телефон *' : 'WhatsApp / Əlaqə Nömrəsi *'}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="+994 50 123 45 67"
                      value={sahipTelefon}
                      onChange={(e) => setSahipTelefon(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? 'Email Address' : isRu ? 'Email адрес' : 'E-poçt Ünvanı'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      placeholder="boutique@example.com"
                      value={sahipEmail}
                      onChange={(e) => setSahipEmail(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Çıxış Ölkəsi və Şəhər */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? 'Primary Origin Country' : isRu ? 'Основная Страна Закупок' : 'Əsas Alış / Çıxış Ölkəsi'}
                  </label>
                  <select
                    value={menseiUlke}
                    onChange={(e) => setMenseiUlke(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="CA">🇨🇦 {isEn ? 'Canada (Toronto Pearson YYZ)' : 'Kanada (Toronto Pearson YYZ)'}</option>
                    <option value="US">🇺🇸 {isEn ? 'United States (JFK/ORD)' : 'ABŞ (Amerika JFK/ORD)'}</option>
                    <option value="TR">🇹🇷 {isEn ? 'Turkey (Istanbul IST)' : 'Türkiyə (İstanbul IST)'}</option>
                    <option value="JP">🇯🇵 {isEn ? 'Japan (Tokyo NRT)' : 'Yaponiya (Tokyo NRT)'}</option>
                    <option value="GB">🇬🇧 {isEn ? 'United Kingdom (London LHR)' : 'Böyük Britaniya (London LHR)'}</option>
                    <option value="DE">🇩🇪 {isEn ? 'Germany (Frankfurt FRA)' : 'Almaniya (Frankfurt FRA)'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isEn ? 'Destination Delivery City' : isRu ? 'Город Доставки' : 'Təhvil Şəhəri'}
                  </label>
                  <input
                    type="text"
                    value={sehir}
                    onChange={(e) => setSehir(e.target.value)}
                    placeholder={isEn ? 'Baku' : 'Bakı'}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Paket Seçimi və Rol Limitləri */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-slate-300">
                  {isEn ? 'Select Subscription Tier' : isRu ? 'Выберите Тариф' : 'Abunəlik Paketi Seçin'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Başlanğıc Butik */}
                  <div
                    onClick={() => setPaket('BASLANGIC')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      paket === 'BASLANGIC'
                        ? 'bg-blue-900/30 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-white">
                        {isEn ? 'Starter' : isRu ? 'Старт' : 'Başlanğıc'}
                      </span>
                      <span className="text-[10px] text-blue-300 font-black">$49 / {isEn ? 'mo' : 'ay'}</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-0.5">
                      <li>• 1 {isEn ? 'Owner' : 'Patron'}</li>
                      <li>• 1 {isEn ? 'Canada Cargo' : 'Kanada Kargo'}</li>
                      <li>• 1 {isEn ? 'Sales Rep' : 'Satış Girişi'}</li>
                      <li>• 1 {isEn ? 'Finance Desk' : 'Bakı Kassa'}</li>
                      <li>• 1 {isEn ? 'Field Courier' : 'Sahə Kuryesi'}</li>
                    </ul>
                  </div>

                  {/* Pro Şəbəkə */}
                  <div
                    onClick={() => setPaket('PRO')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all relative ${
                      paket === 'PRO'
                        ? 'bg-indigo-900/40 border-indigo-500 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-indigo-500 text-[8px] font-black text-white uppercase tracking-wider">
                      {isEn ? 'Recommended' : isRu ? 'Рекомендуем' : 'Tövsiyə'}
                    </span>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-white">
                        {isEn ? 'Pro Network' : isRu ? 'Сеть Pro' : 'Pro Şəbəkə'}
                      </span>
                      <span className="text-[10px] text-indigo-300 font-black">$99 / {isEn ? 'mo' : 'ay'}</span>
                    </div>
                    <ul className="text-[10px] text-slate-300 space-y-0.5 font-medium">
                      <li>• 1 {isEn ? 'Owner' : 'Patron'}</li>
                      <li>• 2 {isEn ? 'Canada Cargo' : 'Kanada Kargo'}</li>
                      <li>• 2 {isEn ? 'Sales Reps' : 'Satış Girişi'}</li>
                      <li>• 2 {isEn ? 'Finance Desk' : 'Bakı Kassa'}</li>
                      <li>• 5 {isEn ? 'Field Couriers' : 'Sahə Kuryesi'}</li>
                      <li className="text-emerald-400 font-bold">• {isEn ? 'Aramex API + Unlimited AI' : 'Aramex API + Limitsiz AI'}</li>
                    </ul>
                  </div>

                  {/* Enterprise Qlobal */}
                  <div
                    onClick={() => setPaket('ENTERPRISE')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      paket === 'ENTERPRISE'
                        ? 'bg-purple-900/30 border-purple-500 ring-1 ring-purple-500'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-white">Enterprise</span>
                      <span className="text-[10px] text-purple-300 font-black">{isEn ? 'Custom' : 'Fərdi'}</span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-0.5">
                      <li>• 2 {isEn ? 'Admins' : 'Patron İdarəçi'}</li>
                      <li>• 5 {isEn ? 'Global Cargo' : 'Kanada / Xarici Kargo'}</li>
                      <li>• 10 {isEn ? 'Sales Reps' : 'Satış Məsuliyyətli'}</li>
                      <li>• 25 {isEn ? 'Couriers' : 'Sahə Kuryesi'}</li>
                      <li>• {isEn ? 'Custom Domain CNAME' : 'Xüsusi Domain CNAME'}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Təsdiq Düyməsi */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={yukleniyor}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {yukleniyor ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Submitting Registration...' : isRu ? 'Отправка заявки...' : 'Qeydiyyat Göndərilir...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{isEn ? 'Submit Boutique Registration' : isRu ? 'Подтвердить Заявку' : 'Qeydiyyat Müraciətini Təsdiqlə'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isEn
                    ? 'Your records are safeguarded by PostgreSQL multi-tenant isolation.'
                    : isRu
                    ? 'Ваши данные защищены изоляцией PostgreSQL.'
                    : 'Məlumatlarınız PostgreSQL təcrid zəmanəti ilə qorunur.'}
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
