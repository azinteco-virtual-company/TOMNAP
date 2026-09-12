import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [oncekiDurumOnline, setOncekiDurumOnline] = useState(true);
  const [baglantiGeriGeldiBildirimi, setBaglantiGeriGeldiBildirimi] = useState(false);

  useEffect(() => {
    if (!isOnline && oncekiDurumOnline) {
      setOncekiDurumOnline(false);
    } else if (isOnline && !oncekiDurumOnline) {
      setOncekiDurumOnline(true);
      setBaglantiGeriGeldiBildirimi(true);
      const timer = setTimeout(() => setBaglantiGeriGeldiBildirimi(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, oncekiDurumOnline]);

  if (isOnline && !baglantiGeriGeldiBildirimi) {
    return null;
  }

  if (baglantiGeriGeldiBildirimi) {
    return (
      <div className="fixed bottom-20 lg:bottom-6 left-4 z-50 flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-3 duration-300 border border-emerald-400">
        <Wifi className="w-4 h-4 text-white" />
        <span>İnternet bağlantısı bərpa olundu. Məlumatlar sinxronlaşdırılır.</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-3 duration-300 border border-amber-400">
      <span className="flex h-2 w-2 rounded-full bg-white animate-ping" />
      <WifiOff className="w-4 h-4 text-white" />
      <span>Oflayn Rejim — Saxlanılan keş məlumatları göstərilir.</span>
    </div>
  );
};
