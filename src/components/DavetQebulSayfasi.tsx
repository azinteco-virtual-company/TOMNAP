import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { hataMetni } from '../i18n/hata';
import { DilSecici } from './DilSecici';

interface DavetBilgisi {
  rol?: string;
  tenantAd?: string;
}
interface FirmaBilgisi {
  ad?: string;
}

const GIRDI =
  'w-full bg-slate-800/80 border border-slate-700 rounded-xl ps-9 pe-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

export const DavetQebulSayfasi: React.FC = () => {
  const { t } = useTranslation('giris');
  const location = useLocation();
  const navigate = useNavigate();
  const { setBildirim } = useAppStore();

  const [token, setToken] = useState<string>('');
  const [davet, setDavet] = useState<DavetBilgisi | null>(null);
  const [firma, setFirma] = useState<FirmaBilgisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [adSoyad, setAdSoyad] = useState('');
  const [telefon, setTelefon] = useState('+994 ');
  const [sifre, setSifre] = useState('');
  const [sifreTekrar, setSifreTekrar] = useState('');
  const [sifreGoster, setSifreGoster] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [tamamlandi, setTamamlandi] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const kod =
      params.get('token') || location.pathname.replace('/davet/', '').replace('/davet', '');
    if (!kod || kod.length < 5) {
      setHata(t('davet.kodYok'));
      setYukleniyor(false);
      return;
    }
    setToken(kod);

    apiFetch(`/api/firmalar/davet/${encodeURIComponent(kod)}`)
      .then((r) => r.json())
      .then((data: { basarili?: boolean; davet?: DavetBilgisi; firma?: FirmaBilgisi }) => {
        if (!data.basarili) {
          setHata(t('davet.bulunamadi'));
        } else {
          setDavet(data.davet ?? null);
          setFirma(data.firma ?? null);
        }
      })
      .catch((err: unknown) => setHata(hataMetni(err, t('ortak:baglantiHatasi'))))
      .finally(() => setYukleniyor(false));
  }, [location, t]);

  const handleQatil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adSoyad.trim() || !telefon.trim() || telefon.length < 9) {
      alert(t('davet.adTelefonEksik'));
      return;
    }
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
      const res = await apiFetch('/api/firmalar/davet/katil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, adSoyad, telefon, sifre }),
      });
      const data = (await res.json()) as { basarili?: boolean };
      if (!data.basarili) throw new Error(t('davet.qosulmaXetasi'));

      setTamamlandi(true);
      setBildirim(t('davet.bildirim'));
    } catch (err) {
      alert(hataMetni(err, t('ortak:xetaBasVerdi')));
    } finally {
      setGonderiliyor(false);
    }
  };

  const rolAdi = (rol?: string) => (rol ? t(`rol.${rol}`, { defaultValue: rol }) : '');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Glow effektləri */}
      <div className="absolute top-1/4 start-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 end-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10">
        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        <div className="p-8 space-y-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/25">
              <span>{t('ortak:marka.harf')}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white">{t('ortak:marka.ad')}</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {t('davet.etiket')}
                </span>
              </div>
              <p className="text-xs text-slate-400">{t('davet.altBaslik')}</p>
            </div>
            <DilSecici darkTheme />
          </div>

          {yukleniyor ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>{t('davet.yoxlanilir')}</span>
            </div>
          ) : hata ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-rose-200">{t('davet.etibarsiz')}</h4>
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
                ✓
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">{t('davet.qosuldunuz')}</h4>
                <p className="text-xs text-slate-300">
                  {t('davet.aktivlesdirildi', { butik: firma?.ad ?? '', rol: rolAdi(davet?.rol) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>{t('sifre.hesabimlaDaxilOl')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleQatil} className="space-y-5">
              {/* Dəvət Kartı Xülasəsi */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('davet.davetEdenButik')}</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{firma?.ad || davet?.tenantAd}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400">{t('davet.vezife')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 text-[11px]">
                    {rolAdi(davet?.rol)}
                  </span>
                </div>
              </div>

              {/* Məlumat Girişi */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('davet.adSoyad')}</span>
                  <span className="relative block">
                    <User className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder={t('davet.adOrnek')}
                      value={adSoyad}
                      onChange={(e) => setAdSoyad(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('davet.mobil')}</span>
                  <span className="relative block">
                    <Phone className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="+994 50 123 45 67"
                      value={telefon}
                      onChange={(e) => setTelefon(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('sifre.girisSifresi')}</span>
                  <span className="relative block">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={sifre}
                      onChange={(e) => setSifre(e.target.value)}
                      className={`${GIRDI} pe-10`}
                    />
                    <button
                      type="button"
                      aria-label={sifreGoster ? t('giris.sifreGizle') : t('giris.sifreGoster')}
                      onClick={() => setSifreGoster(!sifreGoster)}
                      className="absolute end-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {sifreGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('sifre.tekrar')}</span>
                  <span className="relative block">
                    <Lock className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={sifreTekrar}
                      onChange={(e) => setSifreTekrar(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>
              </div>

              {/* Təsdiq Düyməsi */}
              <button
                type="submit"
                disabled={gonderiliyor}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {gonderiliyor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('davet.tesdiqlenir')}</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>{t('davet.qebulEt')}</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('davet.kvota')}</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
