import React, { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DESTEKLENEN_DILLER } from '../shared/diller';
import { elleDilSec } from '../i18n';

/** A language's own name ("Azərbaycan", "English"), from the browser's language data. */
function kendiAdi(dil: string) {
  try {
    const ad = new Intl.DisplayNames([dil], { type: 'language' }).of(dil) ?? dil;
    return ad.charAt(0).toLocaleUpperCase(dil) + ad.slice(1);
  } catch {
    return dil.toUpperCase();
  }
}

interface DilSeciciProps {
  darkTheme?: boolean;
}

/**
 * Dil seçici (docs/i18n.md): yalnız desteklenen diller; seçim bu cihazda saklanır ve
 * butiğin varsayılan dilinin önüne geçer.
 */
export const DilSecici: React.FC<DilSeciciProps> = ({ darkTheme = false }) => {
  const { t, i18n } = useTranslation('ortak');
  const [acik, setAcik] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dil = i18n.language;

  useEffect(() => {
    const disariTikla = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener('mousedown', disariTikla);
    return () => document.removeEventListener('mousedown', disariTikla);
  }, []);

  return (
    <div className="relative inline-block text-start" ref={containerRef}>
      <button
        type="button"
        id="btn-dil-secici"
        onClick={() => setAcik(!acik)}
        aria-haspopup="true"
        aria-expanded={acik}
        aria-label={t('dil.sec')}
        title={t('dil.sec')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs ${
          darkTheme
            ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600'
            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
        }`}
      >
        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
        <span className={`font-semibold ${darkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
          {dil.toUpperCase()}
        </span>
      </button>

      {acik && (
        <div
          className={`absolute end-0 mt-2 w-44 rounded-2xl shadow-2xl p-1.5 z-50 ${
            darkTheme
              ? 'bg-slate-900 border border-slate-800 text-slate-100 shadow-black/60'
              : 'bg-white border border-slate-200 text-slate-800 shadow-xl'
          }`}
        >
          <div
            className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b mb-1 flex items-center gap-1.5 ${
              darkTheme ? 'text-slate-400 border-slate-800' : 'text-slate-400 border-slate-100'
            }`}
          >
            <Globe className="w-3 h-3 text-indigo-400" aria-hidden="true" />
            <span>{t('dil.baslik')}</span>
          </div>
          <div className="space-y-0.5">
            {DESTEKLENEN_DILLER.map((kod) => {
              const aktif = kod === dil;
              return (
                <button
                  key={kod}
                  type="button"
                  lang={kod}
                  onClick={() => {
                    elleDilSec(kod);
                    setAcik(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    aktif
                      ? darkTheme
                        ? 'bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/40'
                        : 'bg-blue-50 text-blue-800 font-bold'
                      : darkTheme
                        ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{kendiAdi(kod)}</span>
                  {aktif && <Check className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
