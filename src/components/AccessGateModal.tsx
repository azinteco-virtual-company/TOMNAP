import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';

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
      setError(error instanceof Error ? error.message : 'Giriş mümkün olmadı.');
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
        <button
          type="button"
          aria-label="Bağla"
          onClick={onKapat}
          className="absolute right-4 top-4 p-2"
        >
          <X className="h-5 w-5" />
        </button>
        <Lock className="mb-4 h-8 w-8 text-indigo-400" />
        <h2 id="login-title" className="text-xl font-bold">
          TOMNAP Giriş Paneli
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Qeydiyyatlı e-poçt ünvanınız və ya telefonunuzla daxil olun.
        </p>
        {hedef === 'demo' && (
          <p className="mt-3 rounded-xl bg-indigo-950 p-3 text-sm text-indigo-100">
            İctimai demo hazırda bağlıdır. İş sahəsinə yalnız şəxsi hesabınızla daxil ola
            bilərsiniz.
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">
            E-poçt və ya telefon
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
            Şifrə
            <div className="relative mt-2">
              <input
                name="password"
                autoComplete="current-password"
                required
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 pr-12"
              />
              <button
                type="button"
                aria-label={visible ? 'Şifrəni gizlət' : 'Şifrəni göstər'}
                onClick={() => setVisible(!visible)}
                className="absolute right-3 top-3"
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
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}Daxil ol
          </button>
          <button
            type="button"
            onClick={onQeydiyyatAc}
            className="w-full py-2 text-sm text-indigo-200"
          >
            Yeni butik qeydiyyatı
          </button>
        </form>
      </section>
    </div>
  );
};
