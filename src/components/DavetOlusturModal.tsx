import React, { useState } from 'react';
import { X, UserPlus, Copy, Check, Share2, Shield, Users, AlertCircle, Loader2 } from 'lucide-react';
import { FirmaTenant, KullaniciRolu } from '../types';

interface DavetOlusturModalProps {
  acik: boolean;
  onKapat: () => void;
  seciliFirma: FirmaTenant | null;
}

export const DavetOlusturModal: React.FC<DavetOlusturModalProps> = ({
  acik,
  onKapat,
  seciliFirma,
}) => {
  const [seciliRol, setSeciliRol] = useState<KullaniciRolu>('BAKU_KURYE');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [davetUrl, setDavetUrl] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  if (!acik || !seciliFirma) return null;

  const rolLimitleri = seciliFirma.rolLimitleri || {
    PATRON: 1,
    KANADA_SATINALMA: 2,
    SATIS_SORUMLUSU: 4,
    BAKU_FINANS: 2,
    BAKU_KURYE: 10,
  };

  const aktifSayilar = seciliFirma.aktifKullaniciSayilari || {
    PATRON: 1,
    KANADA_SATINALMA: 0,
    SATIS_SORUMLUSU: 0,
    BAKU_FINANS: 0,
    BAKU_KURYE: 0,
  };

  const limit = (rolLimitleri as any)[seciliRol] || 5;
  const movcud = (aktifSayilar as any)[seciliRol] || 0;
  const qalanYer = Math.max(0, limit - movcud);

  const handleLinkYarat = async () => {
    setHata(null);
    setYukleniyor(true);
    try {
      const res = await fetch('/api/firmalar/davet-olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: seciliFirma.id,
          rol: seciliRol,
          olusturanKisi: 'Butik İdarəçisi',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.basarili) {
        throw new Error(data.hata || 'Dəvət yaradılarkən xəta baş verdi.');
      }

      const tamUrl = `${window.location.origin}${data.davetUrl}`;
      setDavetUrl(tamUrl);
    } catch (err: any) {
      setHata(err.message || 'Xəta baş verdi.');
    } finally {
      setYukleniyor(false);
    }
  };

  const handleKopyala = () => {
    if (!davetUrl) return;
    navigator.clipboard.writeText(davetUrl);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 3000);
  };

  const handleWhatsAppGonder = () => {
    if (!davetUrl) return;
    const mesaj = encodeURIComponent(
      `Salam! "${seciliFirma.ad}" komandasına ${seciliRol} olaraq qoşulmaq üçün dəvət linkiniz:\n${davetUrl}\nLinki açıb adınızı daxil edərək dərhal iş masanıza başlaya bilərsiniz.`
    );
    window.open(`https://api.whatsapp.com/send?text=${mesaj}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600" />

        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Komanda Dəvət Linki</h3>
              <p className="text-[11px] text-slate-400">{seciliFirma.ad}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {hata && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{hata}</span>
            </div>
          )}

          {/* Vəzifə Seçimi */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Dəvət Ediləcək Rol
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSeciliRol('BAKU_KURYE');
                  setDavetUrl(null);
                }}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  seciliRol === 'BAKU_KURYE'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div>Sahə Kuryesi</div>
                <div className="text-[10px] opacity-80 mt-0.5">Paketləri paylayır</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSeciliRol('SATIS_SORUMLUSU');
                  setDavetUrl(null);
                }}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  seciliRol === 'SATIS_SORUMLUSU'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div>Satış Məsuliyyətlisi</div>
                <div className="text-[10px] opacity-80 mt-0.5">Sifarişləri daxil edir</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSeciliRol('KANADA_SATINALMA');
                  setDavetUrl(null);
                }}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  seciliRol === 'KANADA_SATINALMA'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div>Kanada Kargo</div>
                <div className="text-[10px] opacity-80 mt-0.5">AWB &amp; qəbzləri idarə edir</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSeciliRol('BAKU_FINANS');
                  setDavetUrl(null);
                }}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                  seciliRol === 'BAKU_FINANS'
                    ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div>Bakı Maliyyə / Kassa</div>
                <div className="text-[10px] opacity-80 mt-0.5">Qalıq borcu bağlayır</div>
              </button>
            </div>
          </div>

          {/* Kota Məlumatı */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-400">Vəzifə Kvotası:</span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">
                {movcud} / {limit} istifadədə
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${qalanYer > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {qalanYer} boş yer
              </span>
            </div>
          </div>

          {/* Link Yarat Butonu və ya Link Nəticəsi */}
          {!davetUrl ? (
            <button
              type="button"
              disabled={yukleniyor || qalanYer <= 0}
              onClick={handleLinkYarat}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {yukleniyor ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dəvət Kodu Yaradılır...</span>
                </>
              ) : qalanYer <= 0 ? (
                <span>Bu Rol Üzrə Limit Dolmuşdur</span>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Dəvət Linki Yarat</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3 animate-in fade-in">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-indigo-500/50 flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 truncate font-mono text-[11px]">
                  {davetUrl}
                </span>
                <button
                  type="button"
                  onClick={handleKopyala}
                  className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shrink-0"
                  title="Linki Kopyala"
                >
                  {kopyalandi ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleKopyala}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {kopyalandi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{kopyalandi ? 'Kopyalandı!' : 'Linki Kopyala'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppGonder}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>WhatsApp ilə Paylaş</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
