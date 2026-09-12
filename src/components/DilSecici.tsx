import React, { useState, useRef, useEffect } from 'react';
import { useDil, DilKodu } from '../context/DilKonteksti';
import { Globe, Check } from 'lucide-react';

const DILLER: { kod: DilKodu; ad: string; bayrak: string; kisaAd: string }[] = [
  { kod: 'az', ad: 'Azərbaycanca', bayrak: '🇦🇿', kisaAd: 'AZ' },
  { kod: 'en', ad: 'English', bayrak: '🇨🇦', kisaAd: 'EN' },
  { kod: 'ru', ad: 'Русский', bayrak: '🇷🇺', kisaAd: 'RU' },
];

export const DilSecici: React.FC = () => {
  const { dil, setDil } = useDil();
  const [acik, setAcik] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const seciliDil = DILLER.find((d) => d.kod === dil) || DILLER[0];

  useEffect(() => {
    const handleDisariTikla = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    document.addEventListener('mousedown', handleDisariTikla);
    return () => document.removeEventListener('mousedown', handleDisariTikla);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        id="btn-dil-secici"
        onClick={() => setAcik(!acik)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer shadow-2xs"
        title="Dili dəyişdir / Change Language / Сменить язык"
      >
        <span className="text-sm leading-none">{seciliDil.bayrak}</span>
        <span className="font-semibold text-slate-800">{seciliDil.kisaAd}</span>
      </button>

      {acik && (
        <div className="absolute right-0 mt-2 w-44 rounded-2xl bg-white shadow-xl border border-slate-200 p-1.5 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-blue-500" />
            <span>Dil / Language / Язык</span>
          </div>

          <div className="space-y-0.5">
            {DILLER.map((d) => {
              const aktif = d.kod === dil;
              return (
                <button
                  key={d.kod}
                  type="button"
                  onClick={() => {
                    setDil(d.kod);
                    setAcik(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    aktif
                      ? 'bg-blue-50 text-blue-800 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{d.bayrak}</span>
                    <span>{d.ad}</span>
                  </div>
                  {aktif && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
