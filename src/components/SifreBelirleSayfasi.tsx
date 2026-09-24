import { apiFetch } from '../lib/apiClient';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { KullaniciRolu } from '../types';
import type { EkipRolu } from '../shared/roller';

export const SifreBelirleSayfasi: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setBildirim } = useAppStore();

  const [token, setToken] = useState<string>('');
  const [tokenBilgisi, setTokenBilgisi] = useState<any>(null);
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
    const t =
      params.get('token') ||
      location.pathname.replace('/sifre-belirle/', '').replace('/sifre-belirle', '');
    if (!t || t.length < 5) {
      setHata('Təhlükəsizlik və aktivasiya kodu tapılmadı.');
      setYukleniyor(false);
      return;
    }
    setToken(t);

    apiFetch(`/api/auth/token-kontrol/${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.basarili) {
          setHata(data.hata || 'Bu link etibarsızdır və ya vaxtı bitmişdir.');
        } else {
          setTokenBilgisi(data);
        }
      })
      .catch(() => setHata('Serverlə əlaqə qurularkən xəta baş verdi.'))
      .finally(() => setYukleniyor(false));
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sifre.length < 6) {
      alert('Şifrə ən azı 6 simvoldan ibarət olmalıdır.');
      return;
    }

    if (sifre !== sifreTekrar) {
      alert('Daxil edilən şifrələr bir-biri ilə eyni deyil!');
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

      const data = await res.json();
      if (!res.ok || !data.basarili) {
        throw new Error(data.hata || 'Şifrə təyin edilərkən xəta baş verdi');
      }

      setTamamlandi(true);

      setBildirim('Şifrəniz təyin edildi. Şəxsi hesabınızla daxil olun.');
    } catch (err: any) {
      alert(err.message || 'Xəta baş verdi');
    } finally {
      setGonderiliyor(false);
    }
  };

  const rolEtiketleri: Record<EkipRolu, string> = {
    PATRON: 'Butik Patronu (Yüksək İdarəçi)',
    KANADA_SATINALMA: 'Kanada Satınalma & Kargo Məsuliyyətlisi',
    SATIS_SORUMLUSU: 'Satış & AI Sifariş Girişi',
    BAKU_FINANS: 'Bakı Maliyyə & Kassa Məsuliyyətlisi',
    BAKU_KURYE: 'Bakı Daxili Kuryer',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10">
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-indigo-500/25">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white">TOMNAP</span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  Təhlükəsizlik
                </span>
              </div>
              <p className="text-xs text-slate-400">Şəxsi Şifrə Təyini & Aktivasiya</p>
            </div>
          </div>

          {yukleniyor ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Təhlükəsizlik linki yoxlanılır...</span>
            </div>
          ) : hata ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-rose-200">Aktivasiya Linki Etibarsızdır</h4>
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
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">Şifrəniz Uğurla Təyin Edildi!</h4>
                <p className="text-xs text-slate-300">
                  Hesabınız tam aktivləşdirildi. Artıq sistemə daxil ola bilərsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Şəxsi hesabımla daxil ol</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Hesab Xülasəsi */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
                {tokenBilgisi?.butikAdi && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Butik:</span>
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{tokenBilgisi.butikAdi}</span>
                    </span>
                  </div>
                )}
                {tokenBilgisi?.adSoyad && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">İstifadəçi:</span>
                    <span className="font-semibold text-slate-200">{tokenBilgisi.adSoyad}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">E-poçt:</span>
                  <span className="font-mono text-slate-300">{tokenBilgisi?.email}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700/40">
                  <span className="text-slate-400">Vəzifə / Rol:</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 text-[11px]">
                    {rolEtiketleri[tokenBilgisi?.rol] || tokenBilgisi?.rol || 'Patron'}
                  </span>
                </div>
              </div>

              {tokenBilgisi?.tip === 'davet' && !tokenBilgisi?.email && (
                <div>
                  <label
                    htmlFor="invite-email"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    Giriş üçün e-poçt ünvanınız *
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
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Yeni Şifrəniz (Minimum 6 simvol) *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={gosterSifre ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={sifre}
                      onChange={(e) => setSifre(e.target.value)}
                      minLength={6}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setGosterSifre(!gosterSifre)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {gosterSifre ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                      type={gosterSifre ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={sifreTekrar}
                      onChange={(e) => setSifreTekrar(e.target.value)}
                      minLength={6}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {sifre && sifreTekrar && (
                  <div className="text-[11px] flex items-center gap-1.5">
                    {sifre === sifreTekrar ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Şifrələr uyğundur
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Şifrələr uyğun gəlmir
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
                    <span>Şifrə Təyin Edilir...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Şifrəni Təyin Et və Giriş Et</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
                <Lock className="w-3 h-3 text-slate-500" />
                <span>Şifrəniz yüksək təhlükəsizlikli scrypt KDF ilə qorunur.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
export default SifreBelirleSayfasi;
