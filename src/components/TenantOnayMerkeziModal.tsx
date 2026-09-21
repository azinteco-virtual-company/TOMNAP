import { apiFetch } from '../lib/apiClient';
import React, { useState } from 'react';
import {
  X,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  UserCheck,
  Phone,
  Mail,
  Globe,
  Search,
  RefreshCw,
} from 'lucide-react';
import { FirmaTenant } from '../types';

interface TenantOnayMerkeziModalProps {
  acik: boolean;
  onKapat: () => void;
  firmalar: FirmaTenant[];
  onFirmalariYenile: () => void;
}

export const TenantOnayMerkeziModal: React.FC<TenantOnayMerkeziModalProps> = ({
  acik,
  onKapat,
  firmalar,
  onFirmalariYenile,
}) => {
  const [filtre, setFiltre] = useState<'HEPSI' | 'BEKLEMEDE' | 'AKTIF'>('BEKLEMEDE');
  const [arama, setArama] = useState('');
  const [islemSuruyorId, setIslemSuruyorId] = useState<string | null>(null);

  if (!acik) return null;

  const handleOnayDegistir = async (firmaId: string, yeniDurum: 'AKTIF' | 'REDDEDILDI') => {
    setIslemSuruyorId(firmaId);
    try {
      const res = await apiFetch(`/api/firmalar/${firmaId}/onay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onayDurumu: yeniDurum }),
      });
      const data = await res.json();
      if (res.ok && data.basarili) {
        onFirmalariYenile();
      } else {
        alert(data.hata || 'Xəta baş verdi');
      }
    } catch (err) {
      alert('Serverlə əlaqə xətası');
    } finally {
      setIslemSuruyorId(null);
    }
  };

  const suzulenFirmalar = firmalar.filter((f) => {
    const durum = f.onayDurumu || 'AKTIF';
    const uygunDurum = filtre === 'HEPSI' ? true : durum === filtre;
    const uygunArama =
      !arama ||
      f.ad.toLowerCase().includes(arama.toLowerCase()) ||
      (f.sahipAdi && f.sahipAdi.toLowerCase().includes(arama.toLowerCase())) ||
      (f.sahipTelefon && f.sahipTelefon.includes(arama));
    return uygunDurum && uygunArama;
  });

  const bekleyenSayisi = firmalar.filter((f) => f.onayDurumu === 'BEKLEMEDE').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[85vh]">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-400" />

        {/* Modal Başlığı */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Super Admin Butik Təsdiq Mərkəzi</h3>
                {bekleyenSayisi > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black animate-pulse">
                    {bekleyenSayisi} Gözləyir
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Yeni qeydiyyatdan keçən butiklərin təsdiqlənməsi və istifadəçi kvotaları
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onFirmalariYenile}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              title="Yenilə"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onKapat}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filtre və Axtarış */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/80 border border-slate-700 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFiltre('BEKLEMEDE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filtre === 'BEKLEMEDE'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Gözləyənlər ({bekleyenSayisi})
            </button>
            <button
              type="button"
              onClick={() => setFiltre('AKTIF')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filtre === 'AKTIF'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aktiv Butiklər
            </button>
            <button
              type="button"
              onClick={() => setFiltre('HEPSI')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filtre === 'HEPSI'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hamısı ({firmalar.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Butik və ya telefon axtar..."
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Butik Siyahısı */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3.5">
          {suzulenFirmalar.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-60" />
              <p>Bu filtrə uyğun butik tapılmadı.</p>
            </div>
          ) : (
            suzulenFirmalar.map((f) => {
              const durum = f.onayDurumu || 'AKTIF';
              const islemde = islemSuruyorId === f.id;
              return (
                <div
                  key={f.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    durum === 'BEKLEMEDE'
                      ? 'bg-amber-950/20 border-amber-800/50 shadow-sm'
                      : 'bg-slate-800/40 border-slate-700/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white truncate">{f.ad}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {f.id}
                        </span>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${
                            durum === 'AKTIF'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : durum === 'BEKLEMEDE'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {durum}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        {f.sahipAdi && (
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">Sahib:</span>
                            <span className="text-slate-200 font-medium">{f.sahipAdi}</span>
                          </span>
                        )}
                        {f.sahipTelefon && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <a
                              href={`tel:${f.sahipTelefon}`}
                              className="text-indigo-300 hover:underline"
                            >
                              {f.sahipTelefon}
                            </a>
                          </span>
                        )}
                        <span>
                          Paket: <strong className="text-white">{f.paket || 'PRO'}</strong>
                        </span>
                        <span>Şəhər: {f.sehir}</span>
                      </div>
                    </div>

                    {/* Əməliyyat Düymələri */}
                    <div className="flex items-center gap-2 shrink-0">
                      {durum === 'BEKLEMEDE' ? (
                        <>
                          <button
                            type="button"
                            disabled={islemde}
                            onClick={() => handleOnayDegistir(f.id, 'AKTIF')}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Təsdiqlə və Aç</span>
                          </button>
                          <button
                            type="button"
                            disabled={islemde}
                            onClick={() => handleOnayDegistir(f.id, 'REDDEDILDI')}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/50 hover:text-rose-200 text-slate-400 text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aktiv Butik
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rol Limitləri Xülasəsi */}
                  <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                    <span>
                      Patron:{' '}
                      <strong className="text-slate-200">
                        {f.aktifKullaniciSayilari?.PATRON || 1} / {f.rolLimitleri?.PATRON || 1}
                      </strong>
                    </span>
                    <span>
                      Kanada:{' '}
                      <strong className="text-slate-200">
                        {f.aktifKullaniciSayilari?.KANADA_SATINALMA || 0} /{' '}
                        {f.rolLimitleri?.KANADA_SATINALMA || 2}
                      </strong>
                    </span>
                    <span>
                      Satış:{' '}
                      <strong className="text-slate-200">
                        {f.aktifKullaniciSayilari?.SATIS_SORUMLUSU || 0} /{' '}
                        {f.rolLimitleri?.SATIS_SORUMLUSU || 4}
                      </strong>
                    </span>
                    <span>
                      Kurye:{' '}
                      <strong className="text-slate-200">
                        {f.aktifKullaniciSayilari?.BAKU_KURYE || 0} /{' '}
                        {f.rolLimitleri?.BAKU_KURYE || 10}
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
