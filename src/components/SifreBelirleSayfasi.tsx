import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  ShieldCheck,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { hataMetni } from '../i18n/hata';
import { DilSecici } from './DilSecici';

interface TokenBilgisi {
  tip?: string;
  email?: string;
  adSoyad?: string;
  telefon?: string;
  butikAdi?: string;
  rol?: string;
}

const GIRDI =
  'w-full bg-slate-800/80 border border-slate-700 rounded-xl ps-9 pe-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

export const SifreBelirleSayfasi: React.FC = () => {
  const { t } = useTranslation('giris');
  const location = useLocation();
  const navigate = useNavigate();
  const { setBildirim } = useAppStore();

  const [token, setToken] = useState<string>('');
  const [tokenBilgisi, setTokenBilgisi] = useState<TokenBilgisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [davetEmail, setDavetEmail] = useState('');
  const [sifre, setSifre] = useState('');
  const [sifreTekrar, setSifreTekrar] = useState('');
  const [gosterSifre, setGosterSifre] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [tamamlandi, setTamamlandi] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const kod =
      params.get('token') ||
      location.pathname.replace('/sifre-belirle/', '').replace('/sifre-belirle', '');
    if (!kod || kod.length < 5) {
      setHata(t('sifre.kodYok'));
      setYukleniyor(false);
      return;
    }
    setToken(kod);

    apiFetch(`/api/auth/token-kontrol/${encodeURIComponent(kod)}`)
      .then((r) => r.json())
      .then((data: TokenBilgisi & { basarili?: boolean }) => {
        if (!data.basarili) setHata(t('sifre.linkEtibarsiz'));
        else setTokenBilgisi(data);
      })
      .catch((err: unknown) => setHata(hataMetni(err, t('ortak:baglantiHatasi'))))
      .finally(() => setYukleniyor(false));
  }, [location, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sifre.length < 6) {
      alert(t('sifre.enAz6'));
      return;
    }
    if (sifre !== sifreTekrar) {
      alert(t('sifre.eslesmiyor'));
      return;
    }

    setGonderiliyor(true);
    try {
      const res = await apiFetch('/api/auth/sifre-belirle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          sifre,
          email: tokenBilgisi?.email || davetEmail.trim(),
          adSoyad: tokenBilgisi?.adSoyad,
          telefon: tokenBilgisi?.telefon,
        }),
      });
      const data = (await res.json()) as { basarili?: boolean };
      if (!data.basarili) throw new Error(t('sifre.teyinXetasi'));

      setTamamlandi(true);
      setBildirim(t('sifre.bildirim'));
    } catch (err) {
      alert(hataMetni(err, t('ortak:xetaBasVerdi')));
    } finally {
      setGonderiliyor(false);
    }
  };

  const rolAdi = (rol?: string) => t(`rol.${rol ?? 'PATRON'}`, { defaultValue: rol ?? '' });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background glow */}
      <div className="absolute top-1/4 start-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 end-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/25">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white">{t('ortak:marka.ad')}</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {t('sifre.etiket')}
                </span>
              </div>
              <p className="text-xs text-slate-400">{t('sifre.altBaslik')}</p>
            </div>
            <DilSecici darkTheme />
          </div>

          {yukleniyor ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>{t('sifre.yoxlanilir')}</span>
            </div>
          ) : hata ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-rose-200">{t('sifre.etibarsiz')}</h4>
              <p className="text-xs text-slate-300">{hata}</p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                {t('ortak:anaSehifeyeQayit')}
              </button>
            </div>
          ) : tamamlandi ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">{t('sifre.teyinEdildi')}</h4>
                <p className="text-xs text-slate-300">{t('sifre.aktivlesdirildi')}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>{t('sifre.hesabimlaDaxilOl')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Hesab Xülasəsi */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
                {tokenBilgisi?.butikAdi && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{t('sifre.butik')}</span>
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{tokenBilgisi.butikAdi}</span>
                    </span>
                  </div>
                )}
                {tokenBilgisi?.adSoyad && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{t('sifre.istifadeci')}</span>
                    <span className="font-semibold text-slate-200">{tokenBilgisi.adSoyad}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('sifre.eposta')}</span>
                  <span className="font-mono text-slate-300">{tokenBilgisi?.email}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700/40">
                  <span className="text-slate-400">{t('sifre.vezife')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 text-[11px]">
                    {rolAdi(tokenBilgisi?.rol)}
                  </span>
                </div>
              </div>

              {tokenBilgisi?.tip === 'davet' && !tokenBilgisi?.email && (
                <div>
                  <label
                    htmlFor="invite-email"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('sifre.girisEpostasi')}
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={davetEmail}
                    onChange={(event) => setDavetEmail(event.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Şifrə Sahələri */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('sifre.yeniSifre')}</span>
                  <span className="relative block">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type={gosterSifre ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={sifre}
                      onChange={(e) => setSifre(e.target.value)}
                      minLength={6}
                      className={`${GIRDI} pe-10`}
                    />
                    <button
                      type="button"
                      aria-label={gosterSifre ? t('giris.sifreGizle') : t('giris.sifreGoster')}
                      onClick={() => setGosterSifre(!gosterSifre)}
                      className="absolute end-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {gosterSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('sifre.tekrar')}</span>
                  <span className="relative block">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type={gosterSifre ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={sifreTekrar}
                      onChange={(e) => setSifreTekrar(e.target.value)}
                      minLength={6}
                      className={GIRDI}
                    />
                  </span>
                </label>

                {sifre && sifreTekrar && (
                  <div className="text-[11px] flex items-center gap-1.5">
                    {sifre === sifreTekrar ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t('sifre.uygun')}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {t('sifre.uygunDeyil')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Təsdiq Düyməsi */}
              <button
                type="submit"
                disabled={gonderiliyor || (sifre.length >= 6 && sifre !== sifreTekrar)}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {gonderiliyor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('sifre.teyinEdilir')}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{t('sifre.teyinEt')}</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3 text-slate-500" />
                <span>{t('sifre.qorunur')}</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default SifreBelirleSayfasi;
