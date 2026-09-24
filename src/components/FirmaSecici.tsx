import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Plus, Store, Sparkles, ShieldCheck } from 'lucide-react';
import { FirmaTenant } from '../types';

interface FirmaSeciciProps {
  firmalar: FirmaTenant[];
  seciliFirmaId: string;
  onFirmaSec: (firmaId: string) => void;
  onYeniFirmaAc?: () => void;
  siparisSayilari?: Record<string, number>;
}

export const FirmaSecici: React.FC<FirmaSeciciProps> = ({
  firmalar,
  seciliFirmaId,
  onFirmaSec,
  onYeniFirmaAc,
  siparisSayilari = {},
}) => {
  const [acik, setAcik] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const seciliFirma = firmalar.find((f) => f.id === seciliFirmaId);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id="btn-firma-secici"
        onClick={() => setAcik((o) => !o)}
        className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer shadow-2xs text-left"
        title="Aktiv Firma / Butik Seçimi"
      >
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 relative ${
            seciliFirma?.isDemo ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {seciliFirma?.isDemo ? (
            <Sparkles className="w-3.5 h-3.5" />
          ) : (
            <Store className="w-3.5 h-3.5" />
          )}
          {seciliFirmaId !== 'all' && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
              title="İzolyasiya aktivdir"
            />
          )}
        </div>
        <div className="hidden sm:flex flex-col min-w-0 max-w-[130px] lg:max-w-[160px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none flex items-center gap-1">
            {seciliFirma?.isDemo ? 'Sınaq Butiki' : 'Aktiv Butik'}
            {seciliFirmaId !== 'all' && <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />}
          </span>
          <span className="text-xs font-semibold text-slate-800 truncate leading-tight mt-0.5">
            {seciliFirmaId === 'all' ? 'Bütün Butiklər (Qlobal)' : seciliFirma?.ad || 'Butik seçin'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
      </button>

      {acik && (
        <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3.5 py-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                İş Sahəsi / Butik
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                Multi-Tenant SaaS
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hər butikin özünəməxsus müştəri bazası və sifarişləri izolyasiya edilir.
            </p>
          </div>

          <div className="max-h-60 overflow-y-auto py-1 px-1.5 space-y-0.5">
            {/* Bütün Butiklər / Qlobal Görünüş */}
            <button
              type="button"
              onClick={() => {
                onFirmaSec('all');
                setAcik(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                seciliFirmaId === 'all'
                  ? 'bg-blue-50 text-blue-900 font-bold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Bütün Butiklər (Qlobal)</div>
                  <div className="text-[10px] text-slate-500">Super Admin ümumi icmalı</div>
                </div>
              </div>
              {seciliFirmaId === 'all' && <Check className="w-4 h-4 text-blue-600" />}
            </button>

            <div className="my-1 border-t border-slate-100" />

            {/* Firma siyahısı */}
            {firmalar.map((firma) => {
              const secili = seciliFirmaId === firma.id;
              const say = siparisSayilari[firma.id] || 0;
              return (
                <button
                  key={firma.id}
                  type="button"
                  onClick={() => {
                    onFirmaSec(firma.id);
                    setAcik(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    secili
                      ? 'bg-blue-50 text-blue-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        firma.isDemo ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {firma.isDemo ? (
                        <Sparkles className="w-3.5 h-3.5" />
                      ) : (
                        <Store className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{firma.ad}</span>
                        {firma.isDemo && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                            Demo
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                        <span>{firma.sehir}</span>
                        <span>•</span>
                        <span>{say} sifariş</span>
                      </div>
                    </div>
                  </div>
                  {secili && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 px-2 border-t border-slate-100 space-y-1">
            <p className="px-3 py-1.5 text-[11px] text-slate-500">
              Tenant izolasyonu: otomatik testlerle doğrulanıyor (CI)
            </p>

            {onYeniFirmaAc && (
              <button
                type="button"
                onClick={() => {
                  setAcik(false);
                  onYeniFirmaAc();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni Butik / Firma Əlavə Et</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
