import React from 'react';
import { 
  LayoutDashboard, 
  Camera, 
  Truck, 
  Wallet, 
  Menu, 
  Inbox
} from 'lucide-react';
import { useDil } from '../context/DilKonteksti';

interface MobilAltNavProps {
  aktifSekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi';
  setAktifSekme: (sekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi') => void;
  onMobilMenuAc: () => void;
  inboxSayisi?: number;
}

export const MobilAltNav: React.FC<MobilAltNavProps> = ({
  aktifSekme,
  setAktifSekme,
  onMobilMenuAc,
  inboxSayisi = 0,
}) => {
  const { t } = useDil();

  return (
    <nav 
      aria-label="Mobil Alt Naviqasiya" 
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl flex items-center justify-around"
    >
      {/* 1. Sifarişlər (Panel) */}
      <button
        type="button"
        onClick={() => setAktifSekme('panel')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all cursor-pointer ${
          aktifSekme === 'panel'
            ? 'text-emerald-400 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className={`p-1 rounded-lg ${aktifSekme === 'panel' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
          <LayoutDashboard className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">Sifarişlər</span>
      </button>

      {/* 2. AI & Foto Sifariş Girişi */}
      <button
        type="button"
        onClick={() => setAktifSekme('gorsel-giris')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all cursor-pointer ${
          aktifSekme === 'gorsel-giris'
            ? 'text-emerald-400 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className={`p-1 rounded-lg ${aktifSekme === 'gorsel-giris' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
          <Camera className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">AI Giriş</span>
      </button>

      {/* 3. Kurye & Dağıtım Masası */}
      <button
        type="button"
        onClick={() => setAktifSekme('kurye-masasi')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all cursor-pointer ${
          aktifSekme === 'kurye-masasi'
            ? 'text-emerald-400 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className={`p-1 rounded-lg ${aktifSekme === 'kurye-masasi' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
          <Truck className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">Kurye</span>
      </button>

      {/* 4. Təhsilat & Qalıq Borc */}
      <button
        type="button"
        onClick={() => setAktifSekme('baku-tahsilat')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all cursor-pointer ${
          aktifSekme === 'baku-tahsilat'
            ? 'text-emerald-400 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className={`p-1 rounded-lg ${aktifSekme === 'baku-tahsilat' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
          <Wallet className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">Təhsilat</span>
      </button>

      {/* 5. Tam Menyu (Daha çox) */}
      <button
        type="button"
        onClick={onMobilMenuAc}
        className="flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl text-slate-400 hover:text-slate-200 transition-all cursor-pointer relative"
      >
        <div className="p-1 rounded-lg">
          <Menu className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5">Menyu</span>
        {inboxSayisi > 0 && (
          <span className="absolute top-1 right-2 w-4 h-4 bg-amber-500 text-slate-900 rounded-full text-[9px] font-black flex items-center justify-center">
            {inboxSayisi}
          </span>
        )}
      </button>
    </nav>
  );
};
