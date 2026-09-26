import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Building2,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
  User,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { KullaniciRolu } from '../types';
import type { EkipRolu } from '../shared/roller';

export const DavetQebulSayfasi: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setBildirim } = useAppStore();

  const [token, setToken] = useState<string>('');
  const [davet, setDavet] = useState<any>(null);
  const [firma, setFirma] = useState<any>(null);
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
    const t = params.get('token') || location.pathname.replace('/davet/', '').replace('/davet', '');
    if (!t || t.length < 5) {
      setHata('Dəvət kodu tapılmadı və ya etibarsızdır.');
      setYukleniyor(false);
      return;
    }
    setToken(t);

    apiFetch(`/api/firmalar/davet/${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.basarili) {
          setHata(data.hata || 'Dəvət tapılmadı və ya vaxtı bitmişdir.');
        } else {
          setDavet(data.davet);
          setFirma(data.firma);
        }
      })
      .catch((err) => setHata('Serverlə əlaqə qurularkən xəta baş verdi.'))
      .finally(() => setYukleniyor(false));
  }, [location]);

  const handleQatil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adSoyad.trim() || !telefon.trim() || telefon.length < 9) {
      alert('Zəhmət olmasa ad, soyad və əlaqə nömrənizi daxil edin.');
      return;
    }

    if (sifre.length < 6) {
      alert('Zəhmət olmasa ən azı 6 simvoldan ibarət şifrə təyin edin.');
      return;
    }

    if (sifre !== sifreTekrar) {
      alert('Daxil edilən şifrələr bir-biri ilə eyni deyil!');
      return;
    }

    setGonderiliyor(true);
    try {
      const res = await apiFetch('/api/firmalar/davet/katil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, adSoyad, telefon, sifre }),
      });
      const data = await res.json();
      if (!res.ok || !data.basarili) {
        throw new Error(data.hata || 'Qoşulma xətası');
      }

      setTamamlandi(true);
      setBildirim('Dəvət qəbul edildi. Şəxsi hesabınızla daxil olun.');
    } catch (err: any) {
      alert(err.message || 'Xəta baş verdi');
    } finally {
      setGonderiliyor(false);
    }
  };

  const rolEtiketleri: Record<EkipRolu, string> = {
    PATRON: 'Butik Patronu (Yüksək İdarəçi)',
    KANADA_SATINALMA: 'Kanada Satınalma & Kargo Məsuliyyətlisi',
    ABD_SATINALMA: 'ABD Satınalma & Anbar Məsuliyyətlisi',
    SATIS_SORUMLUSU: 'Satış & AI Sifariş Girişi',
    BAKU_FINANS: 'Bakı Maliyyə, Kassa & Qalıq Borc Məsuliyyətlisi',
    BAKU_KURYE: 'Bakı Sahə Kuryesi (Sürətli Çatdırılma)',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Glow effektləri */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10">
        <div className="h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        <div className="p-8 space-y-6">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/25">
              <span>T</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white">TOMNAP</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  Dəvət Qəbulu
                </span>
              </div>
              <p className="text-xs text-slate-400">Komandaya Qoşulma Paneli</p>
            </div>
          </div>

          {yukleniyor ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Dəvət kodu yoxlanılır...</span>
            </div>
          ) : hata ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-rose-200">Dəvət Linki Etibarsızdır</h4>
              <p className="text-xs text-slate-300">{hata}</p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Ana Səhifəyə Qayıt
              </button>
            </div>
          ) : tamamlandi ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto text-xl">
                ✓
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">Komandaya Uğurla Qoşuldunuz!</h4>
                <p className="text-xs text-slate-300">
                  <strong>{firma?.ad}</strong> heyətində{' '}
                  <strong>{rolEtiketleri[davet?.rol] || davet?.rol}</strong> vəzifəniz
                  aktivləşdirildi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Şəxsi hesabımla daxil ol</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleQatil} className="space-y-5">
              {/* Dəvət Kartı Xülasəsi */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Dəvət Edən Butik:</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{firma?.ad || davet?.tenantAd}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400">Təyin Edilən Vəzifə:</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 text-[11px]">
                    {rolEtiketleri[davet?.rol] || davet?.rol}
                  </span>
                </div>
              </div>

              {/* Məlumat Girişi */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Adınız və Soyadınız *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="Məs: Rəşad Quliyev"
                      value={adSoyad}
                      onChange={(e) => setAdSoyad(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mobil Nömrəniz *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="+994 50 123 45 67"
                      value={telefon}
                      onChange={(e) => setTelefon(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Giriş Şifrəniz (Minimum 6 simvol) *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={sifre}
                      onChange={(e) => setSifre(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setSifreGoster(!sifreGoster)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {sifreGoster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Şifrənin Təkrarı *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={sifreGoster ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={sifreTekrar}
                      onChange={(e) => setSifreTekrar(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
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
                    <span>Dəvət Təsdiqlənir...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Dəvəti Qəbul Et və Komandaya Qoşul</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hesabınız bu butikin təyin olunmuş rol kvotasına daxil ediləcək.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
