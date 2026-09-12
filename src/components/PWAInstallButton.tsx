import React, { useState } from 'react';
import { Download, Smartphone, X, Share2, PlusSquare, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'menu';
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  // Uygulama zaten standalone / PWA olarak çalışıyorsa gizle
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setYukleniyor(true);
      const basarili = await install();
      setYukleniyor(false);
      if (basarili && onInstalled) {
        onInstalled();
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // Diğer tarayıcılar için bilgilendirici modal
      setShowIOSGuide(true);
    }
  };

  // Header Varyantı: Kompakt ve şık buton
  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          id="btn-pwa-install-header"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs hover:shadow-sm transition-all cursor-pointer active:scale-95"
          title="Tətbiqi Mobil Cihaza və ya Kompüterə Quraşdır"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quraşdır</span>
        </button>

        {/* Rehber Modalı */}
        {showIOSGuide && (
          <PWAInstallGuideModal onClose={() => setShowIOSGuide(false)} isIOS={isIOS} />
        )}
      </>
    );
  }

  // Menü Varyantı: Yan menüde veya ayarlarda yer alan satır
  if (variant === 'menu') {
    return (
      <>
        <button
          type="button"
          id="btn-pwa-install-menu"
          onClick={handleInstallClick}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-blue-900/40 to-indigo-900/30 border border-blue-500/30 text-blue-200 hover:text-white hover:bg-blue-800/40 transition-all cursor-pointer group text-xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <Download className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold text-white leading-tight">Tətbiqi Quraşdır</div>
              <div className="text-[10px] text-blue-300">Mobil / Masaüstü PWA</div>
            </div>
          </div>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 font-semibold px-2 py-0.5 rounded-full border border-blue-400/30">
            {isIOS ? 'iOS' : 'PWA'}
          </span>
        </button>

        {showIOSGuide && (
          <PWAInstallGuideModal onClose={() => setShowIOSGuide(false)} isIOS={isIOS} />
        )}
      </>
    );
  }

  // Banner Varyantı: Ekranın altında veya sayfa başında dikkat çekici kart
  return (
    <>
      <div className="p-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/50 rounded-2xl text-white shadow-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">Ana Ekrana Əlavə Edin (PWA)</div>
            <div className="text-[11px] text-slate-300 truncate">
              Tam ekran rejimində, internet kəsildikdə belə operativ idarəetmə.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleInstallClick}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm shrink-0 cursor-pointer flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Quraşdır</span>
        </button>
      </div>

      {showIOSGuide && (
        <PWAInstallGuideModal onClose={() => setShowIOSGuide(false)} isIOS={isIOS} />
      )}
    </>
  );
};

// Rehber Modalı Bileşeni
interface PWAInstallGuideModalProps {
  onClose: () => void;
  isIOS: boolean;
}

const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({ onClose, isIOS }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 text-slate-800 animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              🍁
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">KNB Lojistik Tətbiqi</h3>
              <p className="text-[11px] text-slate-500">Mobil Cihaza Quraşdırma</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-3.5 text-xs text-slate-600">
          <p className="text-[13px] font-medium text-slate-700">
            {isIOS
              ? 'iPhone və iPad cihazlarında Safari brauzeri vasitəsilə ana ekrana əlavə edə bilərsiniz:'
              : 'Android və ya Kompüterdə proqramı ana ekrana / masaüstünə əlavə etmək üçün:'}
          </p>

          {isIOS ? (
            <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  1
                </span>
                <span>
                  Safari brauzerinin alt panelindəki{' '}
                  <strong className="text-slate-900 inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    <Share2 className="w-3.5 h-3.5 text-blue-600 inline" /> Paylaş
                  </strong>{' '}
                  düyməsinə toxunun.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  2
                </span>
                <span>
                  Aşağı diyirləyib{' '}
                  <strong className="text-slate-900 inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    <PlusSquare className="w-3.5 h-3.5 text-slate-700 inline" /> Ana Ekrana Əlavə Et
                  </strong>{' '}
                  seçin.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  3
                </span>
                <span>
                  Yuxarı sağdakı <strong className="text-blue-600">«Əlavə et»</strong> düyməsini sıxaraq tamamlayın.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  1
                </span>
                <span>
                  Brauzerin sağ yuxarı küncündəki <strong>(⋮) Menyu</strong> və ya ünvan sətrindəki <strong>Quraşdır</strong> simvoluna toxunun.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0">
                  2
                </span>
                <span>
                  <strong>«Tətbiqi quraşdır»</strong> və ya <strong>«Ana ekrana əlavə et»</strong> seçin.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Quraşdırıldıqdan sonra tətbiq yerli proqram kimi tam ekranda və daha sürətli açılacaqdır.</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          Anladım, Bağla
        </button>
      </div>
    </div>
  );
};
