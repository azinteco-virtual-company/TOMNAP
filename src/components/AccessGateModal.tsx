import React, { useState } from 'react';
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, ArrowRight, Sparkles, X, AlertCircle } from 'lucide-react';
import { useDil } from '../context/DilKonteksti';

interface AccessGateModalProps {
  acik: boolean;
  hedef: 'panel' | 'demo';
  onBasariliGiris: (hedef: 'panel' | 'demo') => void;
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

  const [kod, setKod] = useState('');
  const [sifreGoster, setSifreGoster] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [titret, setTitret] = useState(false);

  if (!acik) return null;

  const envCode = (import.meta.env.VITE_ACCESS_CODE || '').trim().toLowerCase();
  const gecerliKodlar = new Set(['tomnap2026', 'admin2026', 'tomnap']);
  if (envCode) {
    gecerliKodlar.add(envCode);
  }

  const handleDogrula = (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);

    const temizKod = kod.trim().toLowerCase();
    if (!temizKod) {
      setHata(
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

    if (gecerliKodlar.has(temizKod)) {
      try {
        sessionStorage.setItem('tomnap_access_granted', 'true');
        localStorage.setItem('tomnap_access_granted', 'true');
      } catch {}
      onBasariliGiris(hedef);
    } else {
      setHata(
        isEn
          ? 'Invalid access code. Please verify or register your boutique.'
          : isRu
          ? 'Неверный код доступа. Проверьте или зарегистрируйте бутик.'
          : 'Daxil edilmiş kod yanlışdır. Dəqiqləşdirin və ya butik qeydiyyatından keçin.'
      );
      setTitret(true);
      setTimeout(() => setTitret(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
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

        <div className="p-6 sm:p-8 space-y-6">
          {/* Başlıq İkonu və Mətn */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-blue-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
              <Lock className="w-8 h-8 text-indigo-400" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase tracking-widest">
                <ShieldCheck className="w-3 h-3" />
                <span>
                  {isEn ? 'Restricted Access' : isRu ? 'Закрытый Доступ' : 'Qorunan Giriş'}
                </span>
              </div>

              <h3 className="text-xl font-black text-white tracking-tight">
                {isEn
                  ? hedef === 'demo'
                    ? 'Unlock Live Demo Sandbox'
                    : 'TOMNAP Workspace Access'
                  : isRu
                  ? hedef === 'demo'
                    ? 'Разблокировать Демо-Среду'
                    : 'Вход в Панель Управления'
                  : hedef === 'demo'
                  ? 'Canlı Demo Mühitinə Giriş'
                  : 'TOMNAP İdarəetmə Paneli'}
              </h3>

              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                {isEn
                  ? 'TOMNAP is currently in restricted pilot preview. Please enter your authorized access code or team security token to proceed.'
                  : isRu
                  ? 'TOMNAP работает в режиме закрытого пилотного тестирования. Введите код доступа или токен команды для продолжения.'
                  : 'TOMNAP hazırda qapalı sınaq rejimindədir. Davam etmək üçün səlahiyyətli giriş kodunuzu və ya komanda tokenini daxil edin.'}
              </p>
            </div>
          </div>

          {/* Forma */}
          <form onSubmit={handleDogrula} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>{isEn ? 'Access Passcode / Token' : isRu ? 'Код доступа / Токен' : 'Giriş Kodu / Token'}</span>
                <span className="text-[10px] text-indigo-400 font-medium">
                  {isEn ? 'Case-insensitive' : isRu ? 'Без учета регистра' : 'Böyük/kiçik hərf fərqsiz'}
                </span>
              </label>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                </div>
                <input
                  type={sifreGoster ? 'text' : 'password'}
                  autoFocus
                  value={kod}
                  onChange={(e) => {
                    setKod(e.target.value);
                    if (hata) setHata(null);
                  }}
                  placeholder={
                    isEn
                      ? 'Enter passcode (e.g. tomnap2026)'
                      : isRu
                      ? 'Введите код (напр. tomnap2026)'
                      : 'Giriş kodunu daxil edin (məs: tomnap2026)'
                  }
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-mono"
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

              {hata && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 pt-1 animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{hata}</span>
                </div>
              )}
            </div>

            {/* Sınaq Kodu İpucu Rozeti (Preview hint) */}
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-900/60 flex items-center justify-between text-[11px] text-indigo-300">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isEn ? 'Preview Passcode:' : isRu ? 'Тестовый код:' : 'Sınaq Giriş Kodu:'}</span>
              </span>
              <button
                type="button"
                onClick={() => setKod('tomnap2026')}
                className="font-mono font-bold bg-indigo-500/20 hover:bg-indigo-500/30 px-2 py-0.5 rounded-md text-indigo-200 transition-colors cursor-pointer"
                title={isEn ? 'Click to auto-fill' : 'Klikləyərək daxil edin'}
              >
                tomnap2026
              </button>
            </div>

            {/* Əsas Giriş Düyməsi */}
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                {isEn
                  ? hedef === 'demo'
                    ? 'Launch Live Demo'
                    : 'Unlock & Enter Workspace'
                  : isRu
                  ? hedef === 'demo'
                    ? 'Открыть Демо-Среду'
                    : 'Разблокировать и Войти'
                  : hedef === 'demo'
                  ? 'Canlı Demoya Başla'
                  : 'Kilidi Aç və Daxil Ol'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Qeydiyyat Çağırışı */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-400 mb-2">
              {isEn
                ? "Don't have an access code yet?"
                : isRu
                ? 'Еще нет кода доступа?'
                : 'Hələ giriş kodunuz yoxdur?'}
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
                ? 'Register your boutique for review →'
                : isRu
                ? 'Подайте заявку на подключение бутика →'
                : 'Butikiniz üçün qeydiyyatdan keçin →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
