import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/appStore';
import { hataMetni } from '../i18n/hata';
import { DilSecici } from './DilSecici';

interface AccessGateModalProps {
  acik: boolean;
  hedef: 'panel' | 'demo';
  onBasariliGiris: () => void;
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
  const { t } = useTranslation('giris');
  const login = useAppStore((state) => state.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!acik) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(identifier.trim(), password);
      setPassword('');
      onBasariliGiris();
    } catch (error) {
      setError(hataMetni(error, t('giris.olmadi')));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-100 shadow-2xl"
      >
        <div className="absolute start-4 top-4">
          <DilSecici darkTheme />
        </div>
        <button
          type="button"
          aria-label={t('ortak:bagla')}
          onClick={onKapat}
          className="absolute end-4 top-4 p-2"
        >
          <X className="h-5 w-5" />
        </button>
        <Lock className="mb-4 mt-8 h-8 w-8 text-indigo-400" />
        <h2 id="login-title" className="text-xl font-bold">
          {t('giris.baslik')}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{t('giris.aciklama')}</p>
        {hedef === 'demo' && (
          <p className="mt-3 rounded-xl bg-indigo-950 p-3 text-sm text-indigo-100">
            {t('giris.demoKapali')}
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">
            {t('giris.kimlik')}
            <input
              name="username"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
            />
          </label>
          <label className="block text-sm">
            {t('giris.sifre')}
            <div className="relative mt-2">
              <input
                name="password"
                autoComplete="current-password"
                required
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 pe-12"
              />
              <button
                type="button"
                aria-label={visible ? t('giris.sifreGizle') : t('giris.sifreGoster')}
                onClick={() => setVisible(!visible)}
                className="absolute end-3 top-3"
              >
                {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('giris.girisYap')}
          </button>
          <button
            type="button"
            onClick={onQeydiyyatAc}
            className="w-full py-2 text-sm text-indigo-200"
          >
            {t('giris.yeniButik')}
          </button>
        </form>
      </section>
    </div>
  );
};
