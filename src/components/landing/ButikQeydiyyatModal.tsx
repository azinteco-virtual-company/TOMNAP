import React, { useState } from 'react';
import { X, Sparkles, Building2, User, Phone, Mail, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { butikKaydet, type ButikKayitSonucu } from '../../lib/butikKayit';
import { PAKET_ROL_LIMITLERI } from '../../shared/roller';
import { hataMetni } from '../../i18n/hata';

interface ButikQeydiyyatModalProps {
  acik: boolean;
  onKapat: () => void;
  onBasariliKayit?: (yeniFirma: ButikKayitSonucu['firma']) => void;
  onDemoAc?: () => void;
}

const ULKELER = [
  { kod: 'CA', bayrak: '🇨🇦' },
  { kod: 'US', bayrak: '🇺🇸' },
  { kod: 'TR', bayrak: '🇹🇷' },
  { kod: 'JP', bayrak: '🇯🇵' },
  { kod: 'GB', bayrak: '🇬🇧' },
  { kod: 'DE', bayrak: '🇩🇪' },
] as const;

const GIRDI =
  'w-full bg-slate-800/80 border border-slate-700 rounded-xl ps-9 pe-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

export const ButikQeydiyyatModal: React.FC<ButikQeydiyyatModalProps> = ({
  acik,
  onKapat,
  onDemoAc,
}) => {
  const { t } = useTranslation('giris');
  const [butikAdi, setButikAdi] = useState('');
  const [sahipAdi, setSahipAdi] = useState('');
  const [sahipTelefon, setSahipTelefon] = useState('+994 ');
  const [sahipEmail, setSahipEmail] = useState('');
  const [sehir, setSehir] = useState(() => t('kayit.form.sehirVarsayilan'));
  const [menseiUlke, setMenseiUlke] = useState('CA');
  const [paket, setPaket] = useState<'BASLANGIC' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [tamamlandi, setTamamlandi] = useState(false);
  const [kayitliButik, setKayitliButik] = useState<ButikKayitSonucu['firma'] | null>(null);
  const [emailGonderildi, setEmailGonderildi] = useState(false);

  if (!acik) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);

    if (
      !butikAdi.trim() ||
      !sahipAdi.trim() ||
      !sahipTelefon.trim() ||
      !sahipEmail.trim() ||
      !sahipEmail.includes('@') ||
      sahipTelefon.length < 9
    ) {
      setHata(t('kayit.form.alanEksik'));
      return;
    }

    setYukleniyor(true);
    try {
      const sonuc = await butikKaydet(
        {
          ad: butikAdi.trim(),
          sehir: sehir.trim() || t('kayit.form.sehirVarsayilan'),
          sahipAdi: sahipAdi.trim(),
          sahipEmail: sahipEmail.trim().toLowerCase(),
          sahipTelefon: sahipTelefon.trim(),
          paket,
          menseiUlke,
        },
        t('kayit.form.tamamlanmadi')
      );

      setKayitliButik(sonuc.firma);
      setEmailGonderildi(sonuc.emailGonderildi);
      setTamamlandi(true);
    } catch (err) {
      console.error('Butik qeydiyyatı xətası:', err);
      setHata(hataMetni(err, t('kayit.form.baglantiHatasi')));
    } finally {
      setYukleniyor(false);
    }
  };

  const limit = (rol: keyof (typeof PAKET_ROL_LIMITLERI)['PRO']) =>
    kayitliButik?.rolLimitleri?.[rol] || PAKET_ROL_LIMITLERI.PRO[rol];

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
                {tamamlandi ? t('kayit.tamam.baslik') : t('kayit.baslik')}
              </h3>
              <p className="text-xs text-slate-400">
                {tamamlandi ? t('kayit.tamam.altBaslik') : t('kayit.altBaslik')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            aria-label={t('ortak:bagla')}
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
                  {t('kayit.tamam.tebrik', { butik: kayitliButik?.ad ?? '' })}
                </h4>
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs leading-relaxed space-y-1">
                  <div className="font-bold flex items-center justify-center gap-1.5 text-indigo-300">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>
                      {emailGonderildi
                        ? t('kayit.tamam.epostaGonderildi')
                        : t('kayit.tamam.epostaGonderilmedi')}
                    </span>
                  </div>
                  <p>
                    {emailGonderildi
                      ? t('kayit.tamam.epostaYonerge', { email: sahipEmail })
                      : t('kayit.tamam.destekYonerge')}
                  </p>
                </div>
              </div>

              {/* Seçilmiş Paket Xülasəsi */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 text-start space-y-2.5 max-w-md mx-auto text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="font-semibold text-white">{t('kayit.tamam.seciliPaket')}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {kayitliButik?.paket === 'PRO'
                      ? t('kayit.tamam.paketPro')
                      : kayitliButik?.paket === 'BASLANGIC'
                        ? t('kayit.tamam.paketBaslangic')
                        : t('kayit.paket.enterprise')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-700/50">
                  <div>• {t('kayit.ozet.patron', { count: 1 })}</div>
                  <div>• {t('kayit.ozet.kanada', { count: limit('KANADA_SATINALMA') })}</div>
                  <div>• {t('kayit.ozet.satis', { count: limit('SATIS_SORUMLUSU') })}</div>
                  <div>• {t('kayit.ozet.kurye', { count: limit('BAKU_KURYE') })}</div>
                </div>
              </div>

              {/* Qeydiyyat giriş sessiyası yaratmır; e-poçt təsdiqini gözləyin. */}
              <div className="pt-2 flex flex-col gap-2.5 max-w-md mx-auto">
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
                      <span>{t('kayit.tamam.demo')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onKapat}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium cursor-pointer transition-all border border-slate-800"
                  >
                    {t('ortak:bagla')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {hata && (
                <div
                  role="alert"
                  className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2"
                >
                  <span className="shrink-0 font-bold">⚠️</span>
                  <span>{hata}</span>
                </div>
              )}

              {/* Butik və Sahib Məlumatları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.butikAdi')}</span>
                  <span className="relative block">
                    <Building2 className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder={t('kayit.form.butikOrnek')}
                      value={butikAdi}
                      onChange={(e) => setButikAdi(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.sahipAdi')}</span>
                  <span className="relative block">
                    <User className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder={t('kayit.form.sahipOrnek')}
                      value={sahipAdi}
                      onChange={(e) => setSahipAdi(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>
              </div>

              {/* Əlaqə: Telefon və Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.telefon')}</span>
                  <span className="relative block">
                    <Phone className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="+994 50 123 45 67"
                      value={sahipTelefon}
                      onChange={(e) => setSahipTelefon(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.eposta')}</span>
                  <span className="relative block">
                    <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-2.5" />
                    <input
                      type="email"
                      required
                      placeholder={t('kayit.form.epostaOrnek')}
                      value={sahipEmail}
                      onChange={(e) => setSahipEmail(e.target.value)}
                      className={GIRDI}
                    />
                  </span>
                </label>
              </div>

              {/* Çıxış Ölkəsi və Şəhər */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.ulke')}</span>
                  <select
                    value={menseiUlke}
                    onChange={(e) => setMenseiUlke(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  >
                    {ULKELER.map((u) => (
                      <option key={u.kod} value={u.kod}>
                        {u.bayrak} {t(`kayit.ulke.${u.kod}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold text-slate-300">
                  <span className="block mb-1">{t('kayit.form.sehir')}</span>
                  <input
                    type="text"
                    value={sehir}
                    onChange={(e) => setSehir(e.target.value)}
                    placeholder={t('kayit.form.sehirVarsayilan')}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </label>
              </div>

              {/* Paket Seçimi və Rol Limitləri */}
              <div className="space-y-2 pt-2">
                <span className="block text-xs font-semibold text-slate-300">
                  {t('kayit.form.paketSec')}
                </span>
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
                        {t('kayit.paket.baslangic')}
                      </span>
                      <span className="text-[10px] text-blue-300 font-black">
                        {t('kayit.paket.aylik', { fiyat: '$49' })}
                      </span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-0.5">
                      <li>• {t('kayit.paket.patron', { count: 1 })}</li>
                      <li>• {t('kayit.paket.kanadaKargo', { count: 1 })}</li>
                      <li>• {t('kayit.paket.satis', { count: 1 })}</li>
                      <li>• {t('kayit.paket.kassa', { count: 1 })}</li>
                      <li>• {t('kayit.paket.kurye', { count: 1 })}</li>
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
                    <span className="absolute -top-2 end-2 px-1.5 py-0.2 rounded-full bg-indigo-500 text-[8px] font-black text-white uppercase tracking-wider">
                      {t('kayit.paket.tavsiye')}
                    </span>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-white">{t('kayit.paket.pro')}</span>
                      <span className="text-[10px] text-indigo-300 font-black">
                        {t('kayit.paket.aylik', { fiyat: '$99' })}
                      </span>
                    </div>
                    <ul className="text-[10px] text-slate-300 space-y-0.5 font-medium">
                      <li>• {t('kayit.paket.patron', { count: 1 })}</li>
                      <li>• {t('kayit.paket.kanadaKargo', { count: 2 })}</li>
                      <li>• {t('kayit.paket.satis', { count: 2 })}</li>
                      <li>• {t('kayit.paket.kassa', { count: 2 })}</li>
                      <li>• {t('kayit.paket.kurye', { count: 5 })}</li>
                      <li className="text-emerald-400 font-bold">• {t('kayit.paket.aramexAi')}</li>
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
                      <span className="text-xs font-bold text-white">
                        {t('kayit.paket.enterprise')}
                      </span>
                      <span className="text-[10px] text-purple-300 font-black">
                        {t('kayit.paket.ozel')}
                      </span>
                    </div>
                    <ul className="text-[10px] text-slate-400 space-y-0.5">
                      <li>• {t('kayit.paket.idareci', { count: 2 })}</li>
                      <li>• {t('kayit.paket.xariciKargo', { count: 5 })}</li>
                      <li>• {t('kayit.paket.satisMesul', { count: 10 })}</li>
                      <li>• {t('kayit.paket.kurye', { count: 25 })}</li>
                      <li>• {t('kayit.paket.domain')}</li>
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
                      <span>{t('kayit.form.gonderiliyor')}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('kayit.form.gonder')}</span>
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center pt-1">
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('kayit.form.epostaNotu')}</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
