import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Copy,
  Check,
  Store,
  Server,
  Layers,
  Lock,
} from 'lucide-react';
import { fetchWithRetry } from '../lib/apiClient';
import { FirmaTenant } from '../types';

interface TestSonucu {
  modul: string;
  toplam_kayit: number;
  sizinti_sayisi: number;
  durum: 'GECTI' | 'BASARISIZ';
  aciklama: string;
}

interface TestRaporu {
  basarili: boolean;
  test_zamani: string;
  tenant_id: string;
  tum_testler_gecti: boolean;
  toplam_sizinti_sayisi: number;
  guvenlik_derecesi: string;
  sonuclar: TestSonucu[];
  ozet: string;
}

interface IzolasyonDogrulamaModalProps {
  acik: boolean;
  onKapat: () => void;
  seciliFirmaId: string;
  firmalar: FirmaTenant[];
}

export const IzolasyonDogrulamaModal: React.FC<IzolasyonDogrulamaModalProps> = ({
  acik,
  onKapat,
  seciliFirmaId,
  firmalar,
}) => {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [rapor, setRapor] = useState<TestRaporu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sqlKopyalandi, setSqlKopyalandi] = useState(false);

  const aktifFirma = firmalar.find((f) => f.id === seciliFirmaId) || {
    id: seciliFirmaId || 'all',
    ad: seciliFirmaId === 'all' ? 'Bütün Butiklər (Qlobal)' : seciliFirmaId,
    sehir: 'Bakı',
    varsayilan_para_birimi: 'AZN',
    varsayilan_komisyon_yuzdesi: 15,
  };

  const testiCalistir = async () => {
    try {
      setYukleniyor(true);
      setHata(null);
      const url = `/api/tenant/izolasyon-testi?tenant_id=${encodeURIComponent(seciliFirmaId)}`;
      const res = await fetchWithRetry(url, { timeoutMs: 9000, retries: 2 });
      const data = await res.json();
      if (data.basarili) {
        setRapor(data);
      } else {
        setHata(data.hata || 'Test icra edilərkən xəta baş verdi.');
      }
    } catch (err: any) {
      setHata(err.message || 'Serverə qoşulma zaman aşımına uğradı.');
    } finally {
      setYukleniyor(false);
    }
  };

  useEffect(() => {
    if (acik) {
      testiCalistir();
    }
  }, [acik, seciliFirmaId]);

  if (!acik) return null;

  const sqlMetni = `-- Supabase Multi-Tenant İndekslər & DDL Doğrulaması
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_id ON public.siparisler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_lojistik ON public.siparisler(tenant_id, lojistik_durumu);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_id ON public.musteriler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kuryeler_tenant_id ON public.kuryeler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_tenant_id ON public.inbox_mesajlar(tenant_id);`;

  const handleSqlKopyala = () => {
    navigator.clipboard.writeText(sqlMetni);
    setSqlKopyalandi(true);
    setTimeout(() => setSqlKopyalandi(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Başlıq */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base">
                  Tenant Veri İzolasiyası & Təhlükəsizlik Testi
                </h3>
                <span className="text-[10px] uppercase tracking-wider bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Tam İzolə
                </span>
              </div>
              <p className="text-xs text-blue-200/80">
                Firma üzrə verilənlər bazası və sorğu qatında sızmasız multi-tenant yoxlaması
              </p>
            </div>
          </div>
          <button
            onClick={onKapat}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Gövdəsi */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Aktiv Butik İcmal Kartı */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                  Yoxlanılan Butik
                </div>
                <div className="text-base font-black text-slate-900 flex items-center gap-2">
                  {aktifFirma.ad}
                  <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-200/70 rounded text-slate-700">
                    ID: {aktifFirma.id}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={testiCalistir}
              disabled={yukleniyor}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${yukleniyor ? 'animate-spin' : ''}`} />
              <span>{yukleniyor ? 'Yoxlanılır...' : 'Testi Yenidən Başlat'}</span>
            </button>
          </div>

          {/* Xəta Mesajı */}
          {hata && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{hata}</span>
            </div>
          )}

          {/* Test Nəticələri Raporu */}
          {rapor && (
            <div className="space-y-4">
              {/* Ümumi Status Banneri */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                  rapor.tum_testler_gecti
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  {rapor.tum_testler_gecti ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-7 h-7 text-red-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-black">
                      {rapor.tum_testler_gecti
                        ? 'FİLTRLƏNMİŞ SORĞULAR UYĞUNDUR'
                        : 'DİQQƏT: MƏLUMAT SIZMASI AŞKARLANDI'}
                    </h4>
                    <p className="text-xs mt-0.5 text-slate-600">{rapor.ozet}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-white shadow-2xs border border-emerald-300 text-emerald-800">
                    Sızma: {rapor.toplam_sizinti_sayisi}
                  </span>
                </div>
              </div>

              {/* Modul üzrə Test Detalları */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Modul İnteqrasiya Yoxlamaları
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rapor.sonuclar.map((s, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border bg-white shadow-2xs space-y-1.5 ${
                        s.durum === 'GECTI' ? 'border-slate-200' : 'border-red-300 bg-red-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          {s.durum === 'GECTI' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          )}
                          {s.modul}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            s.durum === 'GECTI'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {s.durum === 'GECTI' ? 'KEÇDİ' : 'XƏTA'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Yoxlanılan Qeyd: <strong>{s.toplam_kayit}</strong>
                        </span>
                        <span>
                          Sızan Qeyd:{' '}
                          <strong
                            className={s.sizinti_sayisi === 0 ? 'text-emerald-700' : 'text-red-700'}
                          >
                            {s.sizinti_sayisi}
                          </strong>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {s.aciklama}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verilənlər Bazası İndeksləri & Şeması */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">
                      SQL İndeksləri & Cədvəl Şeması Doğrulaması
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSqlKopyala}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                  >
                    {sqlKopyalandi ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{sqlKopyalandi ? 'Kopyalandı!' : 'SQL Kodu'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <div className="text-slate-400 text-[10px]">siparisler</div>
                    <div className="text-emerald-400 font-mono font-bold mt-0.5">
                      tenant_id (İndeksli)
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <div className="text-slate-400 text-[10px]">musteriler</div>
                    <div className="text-emerald-400 font-mono font-bold mt-0.5">
                      tenant_id (İndeksli)
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <div className="text-slate-400 text-[10px]">kuryeler</div>
                    <div className="text-emerald-400 font-mono font-bold mt-0.5">
                      tenant_id (İndeksli)
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <div className="text-slate-400 text-[10px]">inbox_mesajlar</div>
                    <div className="text-emerald-400 font-mono font-bold mt-0.5">
                      tenant_id (İndeksli)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Altlığı */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            Yoxlama vaxtı:{' '}
            {rapor ? new Date(rapor.test_zamani).toLocaleTimeString('az-AZ') : 'Gözlənilir...'}
          </span>
          <button
            type="button"
            onClick={onKapat}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold cursor-pointer transition-colors"
          >
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
};
