import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  X,
  AlertCircle,
  Store,
  Phone,
  Loader2,
} from 'lucide-react';
import { useDil } from '../context/DilKonteksti';
import { KullaniciRolu } from '../types';

interface AccessGateModalProps {
  acik: boolean;
  hedef: 'panel' | 'demo';
  onBasariliGiris: (hedef: 'panel' | 'demo', firma?: any, rol?: KullaniciRolu) => void;
  onKapat: () => void;
  onQeydiyyatAc: () => void;
}

export const AccessGateModal: React.FC<AccessGateModalProps> = ({
  acik,
  hedef,
  onBasariliGiris,
  onKapat,
  onQeydiyyatAc,
}) => {
  const { dil } = useDil();
  const isEn = dil === 'en';
  const isRu = dil === 'ru';

  const [aktifTab, setAktifTab] = useState<'butik' | 'demo'>(hedef === 'demo' ? 'demo' : 'butik');

  // Butik Girişi üçün sahələr
  const [identifikator, setIdentifikator] = useState('+994 ');
  const [butikYukleniyor, setButikYukleniyor] = useState(false);
  const [butikHata, setButikHata] = useState<string | null>(null);

  // Demo / Super Admin Kodu üçün sahələr
  const [kod, setKod] = useState('');
  const [sifreGoster, setSifreGoster] = useState(false);
  const [demoHata, setDemoHata] = useState<string | null>(null);
  const [titret, setTitret] = useState(false);

  if (!acik) return null;

  // 1. Butik Sahibi Giriş İşi
  const handleButikGiris = async (e: React.FormEvent) => {
    e.preventDefault();
    setButikHata(null);

    const temizMetin = identifikator.trim();
    if (!temizMetin || temizMetin === '+994' || temizMetin.length < 4) {
      setButikHata(
        isEn
          ? 'Please enter your registered phone number, email, or boutique name.'
          : isRu
          ? 'Пожалуйста, введите ваш телефон, email или название бутика.'
          : 'Zəhmət olmasa qeydiyyatdan keçdiyiniz telefon nömrəsi, e-poçt və ya butik adını daxil edin.'
      );
      return;
    }

    setButikYukleniyor(true);
    try {
      let data: any = null;
      try {
        const res = await fetch('/api/firmalar/giris', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifikator: temizMetin }),
        });
        data = await res.json();
      } catch (fetchErr) {
        console.warn('API giriş xətası, yerli axtarış yoxlanılır:', fetchErr);
      }

      // Əgər API tapdısa
      if (data && data.basarili) {
        sessionStorage.setItem('tomnap_access_granted', 'true');
        localStorage.setItem('tomnap_access_granted', 'true');
        if (data.tenantId) localStorage.setItem('tomnap_aktif_tenant', data.tenantId);
        if (data.rol) localStorage.setItem('tomnap_aktif_rol', data.rol);

        onBasariliGiris(
          data.tip === 'demo' ? 'demo' : 'panel',
          data.firma,
          (data.rol as KullaniciRolu) || 'PATRON'
        );
        return;
      }

      // Ehtiyat Rejim: LocalStorage firmaları arasında axtar
      try {
        const localList = JSON.parse(localStorage.getItem('tomnap_yerel_firmalar') || '[]');
        const reqDigits = temizMetin.replace(/[^0-9]/g, '');
        const lower = temizMetin.toLowerCase();

        const tapilan = localList.find((f: any) => {
          const fDigits = String(f.sahipTelefon || '').replace(/[^0-9]/g, '');
          const phoneMatch =
            reqDigits.length >= 7 &&
            fDigits.length >= 7 &&
            (reqDigits.endsWith(fDigits.slice(-7)) || fDigits.endsWith(reqDigits.slice(-7)));
          const emailMatch = f.sahipEmail && f.sahipEmail.toLowerCase() === lower;
          const adMatch = (f.ad || '').toLowerCase() === lower || (f.id || '').toLowerCase() === lower;
          return phoneMatch || emailMatch || adMatch;
        });

        if (tapilan) {
          sessionStorage.setItem('tomnap_access_granted', 'true');
          localStorage.setItem('tomnap_access_granted', 'true');
          localStorage.setItem('tomnap_aktif_tenant', tapilan.id);
          localStorage.setItem('tomnap_aktif_rol', 'PATRON');

          onBasariliGiris('panel', tapilan, 'PATRON');
          return;
        }
      } catch {}

      throw new Error(
        data?.hata ||
          (isEn
            ? 'No boutique found with these credentials. Please check or register.'
            : isRu
            ? 'Бутик с такими данными не найден. Проверьте или зарегистрируйтесь.'
            : 'Bu məlumatlara uyğun aktiv butik tapılmadı. Nömrənizi yoxlayın və ya qeydiyyatdan keçin.')
      );
    } catch (err: any) {
      setButikHata(err.message || 'Giriş xətası baş verdi.');
      setTitret(true);
      setTimeout(() => setTitret(false), 500);
    } finally {
      setButikYukleniyor(false);
    }
  };

  // 2. Demo və ya Super Admin Kodu İşi
  const handleDemoDogrula = (e: React.FormEvent) => {
    e.preventDefault();
    setDemoHata(null);

    const temizKod = kod.trim().toLowerCase();
    if (!temizKod) {
      setDemoHata(
        isEn
          ? 'Please enter the access code or token.'
          : isRu
          ? 'Пожалуйста, введите код доступа.'
          : 'Zəhmət olmasa giriş kodunu və ya tokeni daxil edin.'
      );
      setTitret(true);
      setTimeout(() => setTitret(false), 500);
      return;
    }

    if (temizKod === 'admin2026') {
      sessionStorage.setItem('tomnap_access_granted', 'true');
      localStorage.setItem('tomnap_access_granted', 'true');
      localStorage.setItem('tomnap_aktif_tenant', 'all');
      localStorage.setItem('tomnap_aktif_rol', 'SUPER_ADMIN');
      onBasariliGiris('panel', undefined, 'SUPER_ADMIN');
      return;
    }

    if (temizKod === 'tomnap2026' || temizKod === 'tomnap') {
      sessionStorage.setItem('tomnap_access_granted', 'true');
      localStorage.setItem('tomnap_access_granted', 'true');
      localStorage.setItem('tomnap_aktif_tenant', 'demo_sandbox');
      localStorage.setItem('tomnap_aktif_rol', 'SUPER_ADMIN');
      onBasariliGiris('demo', undefined, 'SUPER_ADMIN');
      return;
    }

    setDemoHata(
      isEn
        ? 'Invalid code. Use tomnap2026 for demo or register your boutique.'
        : isRu
        ? 'Неверный код. Используйте tomnap2026 для демо или зарегистрируйтесь.'
        : 'Daxil edilmiş kod yanlışdır. Demo üçün tomnap2026 daxil edin və ya butikinizi qeydiyyatdan keçirin.'
    );
    setTitret(true);
    setTimeout(() => setTitret(false), 500);
  };

  const handleDemoTekTikla = () => {
    sessionStorage.setItem('tomnap_access_granted', 'true');
    localStorage.setItem('tomnap_access_granted', 'true');
    localStorage.setItem('tomnap_aktif_tenant', 'demo_sandbox');
    localStorage.setItem('tomnap_aktif_rol', 'SUPER_ADMIN');
    onBasariliGiris('demo', undefined, 'SUPER_ADMIN');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div
        className={`relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col transition-all ${
          titret ? 'animate-shake ring-2 ring-rose-500' : ''
        }`}
      >
        {/* Dekorativ Üst Gradient */}
        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 shrink-0" />

        {/* Bağlama Düyməsi */}
        <button
          type="button"
          onClick={onKapat}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Başlıq İkonu və Mətn */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-blue-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
              <Lock className="w-7 h-7 text-indigo-400" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white tracking-tight">
                {isEn ? 'TOMNAP Platform Login' : isRu ? 'Вход в Платформу TOMNAP' : 'TOMNAP Giriş Paneli'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                {isEn
                  ? 'Access your boutique workspace or launch the live interactive demo.'
                  : isRu
                  ? 'Войдите в свой бутик или запустите интерактивную демо-среду.'
                  : 'Qeydiyyatlı butikinizə daxil olun və ya canlı demo mühitini başladın.'}
              </p>
            </div>
          </div>

          {/* İki Rejimli Tab Düymələri (Butik Girişi vs Canlı Demo) */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setAktifTab('butik')}
              className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                aktifTab === 'butik'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{isEn ? 'Boutique Login' : isRu ? 'Вход в Бутик' : 'Butik Girişi'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAktifTab('demo')}
              className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                aktifTab === 'demo'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isEn ? 'Live Demo' : isRu ? 'Демо-Среда' : 'Canlı Demo'}</span>
            </button>
          </div>

          {/* TAB 1: Butik Girişi */}
          {aktifTab === 'butik' && (
            <form onSubmit={handleButikGiris} className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>
                    {isEn
                      ? 'Owner Phone / Email / Store Name'
                      : isRu
                      ? 'Телефон / Email / Имя Бутика'
                      : 'Qeydiyyatlı Telefon / E-poçt / Butik Adı'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{isEn ? 'Direct Entry' : 'Birbaşa Giriş'}</span>
                  </span>
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Phone className="w-4 h-4 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    autoFocus
                    value={identifikator}
                    onChange={(e) => {
                      setIdentifikator(e.target.value);
                      if (butikHata) setButikHata(null);
                    }}
                    placeholder="+994 50 123 45 67"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-950/80 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-sans"
                  />
                </div>

                {butikHata && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 pt-1 animate-in fade-in">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{butikHata}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={butikYukleniyor}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {butikYukleniyor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Verifying...' : isRu ? 'Проверка...' : 'Yoxlanılır...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isEn ? 'Sign in to My Boutique' : isRu ? 'Войти в свой бутик' : 'Öz Butikimə Daxil Ol'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: Canlı Demo & Təqdimat Rejimi (Toxunulmaz) */}
          {aktifTab === 'demo' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* 1-Kliklə Demo Sınaq Sürüşü Düyməsi */}
              <button
                type="button"
                onClick={handleDemoTekTikla}
                className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-indigo-600/20 border border-emerald-500/40 hover:border-emerald-400 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-white group-hover:text-emerald-300 transition-colors">
                      {isEn ? 'Launch Live Sandbox Demo' : isRu ? 'Запуск Интерактивного Демо' : 'Canlı Sandbox Demo (109 Sifariş)'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {isEn ? 'Instant 1-click access for presentations' : 'Müştəri təqdimatları üçün dərhal sınaq sürüşü'}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Parol Girişi (tomnap2026 və ya admin2026 üçün) */}
              <form onSubmit={handleDemoDogrula} className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>{isEn ? 'Access Code / Passcode' : 'Sınaq Kodu / Token'}</span>
                    <span className="text-[10px] text-indigo-400 font-mono">tomnap2026</span>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4 text-indigo-400" />
                    </div>
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      value={kod}
                      onChange={(e) => {
                        setKod(e.target.value);
                        if (demoHata) setDemoHata(null);
                      }}
                      placeholder="tomnap2026"
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setSifreGoster(!sifreGoster)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      tabIndex={-1}
                    >
                      {sifreGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {demoHata && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 pt-1 animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{demoHata}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
                >
                  <span>{isEn ? 'Authorize Passcode' : 'Kodu Təsdiqlə'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {/* Qeydiyyat Çağırışı */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400 mb-1.5">
              {isEn
                ? "Don't have a registered boutique yet?"
                : isRu
                ? 'Еще нет зарегистрированного бутика?'
                : 'Hələ butikiniz qeydiyyatdan keçməyib?'}
            </p>
            <button
              type="button"
              onClick={() => {
                onKapat();
                onQeydiyyatAc();
              }}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer underline underline-offset-4"
            >
              {isEn
                ? 'Register your boutique on TOMNAP →'
                : isRu
                ? 'Зарегистрируйте свой бутик в TOMNAP →'
                : 'TOMNAP-da Butik Qeydiyyatından Keçin →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
