import React from 'react';
import { Menu, Inbox, PanelLeftClose, PanelLeftOpen, Database, Plane, Globe, UserPlus, Building2, Lock } from 'lucide-react';
import { KullaniciRolu, FirmaTenant } from '../types';
import { RolSecici } from './RolSecici';
import { DilSecici } from './DilSecici';
import { FirmaSecici } from './FirmaSecici';
import { PWAInstallButton } from './PWAInstallButton';
import { useDil } from '../context/DilKonteksti';

interface UstBaslikProps {
  aktifSekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'kargo-merkezi' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi';
  setAktifSekme: (sekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'kargo-merkezi' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi') => void;
  toplamSiparis: number;
  onMobilMenuAc?: () => void;
  menuDar?: boolean;
  onMenuDarDegistir?: () => void;
  dbKaynak?: 'supabase' | 'bellek';
  onInboxAc?: () => void;
  inboxSayisi?: number;
  aktifRol?: KullaniciRolu;
  onRolDegistir?: (rol: KullaniciRolu) => void;
  seciliKuryeId?: string;
  onKuryeSec?: (id: string) => void;
  firmalar?: FirmaTenant[];
  seciliFirmaId?: string;
  onFirmaSec?: (firmaId: string) => void;
  onVeritabaniModalAc?: () => void;
  onYeniFirmaAc?: () => void;
  firmaSiparisSayilari?: Record<string, number>;
  onIzolasyonModalAc?: () => void;
  onKargoModalAc?: () => void;
  onVitrinAc?: () => void;
  onDavetModalAc?: () => void;
  onTenantOnayModalAc?: () => void;
  bekleyenTenantSayisi?: number;
  onKilidle?: () => void;
}

export const UstBaslik: React.FC<UstBaslikProps> = ({
  aktifSekme,
  setAktifSekme,
  toplamSiparis,
  onMobilMenuAc,
  menuDar = false,
  onMenuDarDegistir,
  dbKaynak = 'supabase',
  onInboxAc,
  inboxSayisi = 2,
  aktifRol = 'SUPER_ADMIN',
  onRolDegistir,
  seciliKuryeId,
  onKuryeSec,
  firmalar = [],
  seciliFirmaId = 'all',
  onFirmaSec,
  onVeritabaniModalAc,
  onYeniFirmaAc,
  firmaSiparisSayilari = {},
  onIzolasyonModalAc,
  onKargoModalAc,
  onVitrinAc,
  onDavetModalAc,
  onTenantOnayModalAc,
  bekleyenTenantSayisi = 0,
  onKilidle,
}) => {
  const { t } = useDil();

  const getSekmeBasligi = () => {
    switch (aktifSekme) {
      case 'panel':
        return t.siparisYonetimTablosu;
      case 'gorsel-giris':
        return t.gorselSiparisMasasi;
      case 'musteriler':
        return t.musteriVeritabani;
      case 'kargo-manifest':
        return t.kargoManifestosuCeki;
      case 'kargo-merkezi':
        return 'Kargo & Aramex Lojistika Mərkəzi';
      case 'baku-tahsilat':
        return t.bakuTahsilatQaliq;
      case 'kurye-masasi':
        return t.bakuKuryeDagitim;
      case 'inbox':
        return t.inboxTesdiqGozleyen;
      default:
        return t.sistemDevir;
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0 sticky top-0 z-30 shadow-xs">
      <div className="flex items-center space-x-3 min-w-0">
        {/* Mobil Menü Butonu */}
        <button
          type="button"
          onClick={onMobilMenuAc}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
          title="Menüyü Aç"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Masaüstü Menü Daralt / Genişlet Butonu */}
        {onMenuDarDegistir && (
          <button
            type="button"
            id="btn-header-menu-toggle"
            onClick={onMenuDarDegistir}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              menuDar
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title={menuDar ? 'Menüyü Genişlet' : 'Geniş Tablo Modu (Sol Menüyü Daralt)'}
          >
            {menuDar ? (
              <>
                <PanelLeftOpen className="w-4 h-4 text-blue-600" />
                <span className="hidden xl:inline">Menü</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 text-slate-500" />
                <span className="hidden xl:inline">Geniş Tablo</span>
              </>
            )}
          </button>
        )}

        {/* Ekmek Kırıntısı (Breadcrumb) */}
        <div className="flex items-center space-x-2 text-xs sm:text-sm truncate">
          <span className="text-indigo-600 font-extrabold tracking-wider hidden md:inline">TOMNAP</span>
          <span className="text-slate-300 hidden md:inline">/</span>
          <span className="font-semibold text-slate-800 truncate">
            {getSekmeBasligi()}
          </span>
          {aktifSekme === 'panel' && (
            <span className="hidden sm:inline-block text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full ml-2 shrink-0 border border-slate-200/60">
              {toplamSiparis}
            </span>
          )}
        </div>
      </div>

      {/* Sağ Bilgi Rozetleri, Dil Seçici, Rol Seçici & Onay Bekleyenler */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Butik / Firma Seçici (Multi-Tenant SaaS - İzolasyon Göstergesi Dahil) */}
        {firmalar.length > 0 && onFirmaSec && (
          <FirmaSecici
            firmalar={firmalar}
            seciliFirmaId={seciliFirmaId}
            onFirmaSec={onFirmaSec}
            onYeniFirmaAc={onYeniFirmaAc}
            siparisSayilari={firmaSiparisSayilari}
            onIzolasyonModalAc={onIzolasyonModalAc}
          />
        )}

        {/* Onay Bekleyenler (Inbox) Kompakt Bildirim Butonu */}
        {onInboxAc && (
          <button
            type="button"
            onClick={onInboxAc}
            id="btn-header-inbox"
            className="relative p-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition-all cursor-pointer shadow-2xs"
            title={`${t.onayBekleyenler} (${inboxSayisi} gözləyir)`}
          >
            <Inbox className="w-4 h-4 text-amber-700" />
            {inboxSayisi > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                {inboxSayisi}
              </span>
            )}
          </button>
        )}

        {/* Canlı Rol Değiştirici (Simülasyon Butonu) */}
        {onRolDegistir && (
          <RolSecici
            aktifRol={aktifRol}
            onRolDegistir={onRolDegistir}
            seciliKuryeId={seciliKuryeId}
            onKuryeSec={onKuryeSec}
          />
        )}

        {/* PWA Masaüstü / Mobil Kurulum Butonu */}
        <PWAInstallButton variant="header" />

        {/* Dil Değiştirici: AZ / EN / RU */}
        <DilSecici />

        {/* İctimai Vitrin (Landing Page - tomnap.com) */}
        {onVitrinAc && (
          <button
            type="button"
            id="btn-header-vitrin"
            onClick={onVitrinAc}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs text-slate-200 shadow-2xs transition-all cursor-pointer"
            title="tomnap.com İctimai Vitrin (Landing Page) Aç"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-bold text-[11px] hidden lg:inline">Vitrin</span>
          </button>
        )}

        {/* Super Admin Butik Təsdiq Mərkəzi */}
        {onTenantOnayModalAc && aktifRol === 'SUPER_ADMIN' && (
          <button
            type="button"
            id="btn-header-tenant-onay"
            onClick={onTenantOnayModalAc}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
              bekleyenTenantSayisi > 0
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold animate-pulse'
                : 'bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300'
            }`}
            title="Yeni Butik Müraciətlərini Təsdiqlə"
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold text-[11px] hidden md:inline">Butiklər</span>
            {bekleyenTenantSayisi > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center">
                {bekleyenTenantSayisi}
              </span>
            )}
          </button>
        )}

        {/* Komanda Dəvət Linki Butonu */}
        {onDavetModalAc && (aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON') && (
          <button
            type="button"
            id="btn-header-davet"
            onClick={onDavetModalAc}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1.5 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 shadow-2xs transition-all cursor-pointer"
            title="Komanda Üzvləri (Kurye, Satış) üçün Dəvət Linki Al"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-[11px] hidden md:inline">Dəvət Linki</span>
          </button>
        )}

        {/* Kargo / Aramex Lojistika Mərkəzi Butonu */}
        {(aktifRol !== 'BAKU_KURYE') && (
          <button
            type="button"
            id="btn-header-kargo-merkezi"
            onClick={() => setAktifSekme('kargo-merkezi')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs shadow-2xs transition-all cursor-pointer ${
              aktifSekme === 'kargo-merkezi'
                ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400/40 shadow-sm'
                : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
            }`}
            title="Kargo & Aramex Lojistika Mərkəzi (Canlı İzləmə və Tənzimləmələr)"
          >
            <Plane className={`w-3.5 h-3.5 ${aktifSekme === 'kargo-merkezi' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
            <span className="font-bold text-[11px] hidden md:inline">Kargo Mərkəzi</span>
          </button>
        )}

        {/* Kompakt Sistem Durumu / Veritabanı Butonu */}
        <button
          type="button"
          id="supabase-status-badge"
          onClick={onVeritabaniModalAc}
          className="flex items-center gap-1.5 bg-emerald-50/90 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-xl text-xs text-emerald-900 shadow-2xs transition-all cursor-pointer"
          title="Verilənlər Bazası & Canlı/Demo Rejim İdarəetməsi"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <Database className="w-3.5 h-3.5 text-emerald-700 hidden md:inline" />
          <span className="font-bold text-[11px] hidden sm:inline">
            {dbKaynak === 'supabase' ? 'Supabase' : 'Lokal'}
          </span>
        </button>

        {/* İş Masasını Kilidlə (Lock) */}
        {onKilidle && (
          <button
            type="button"
            id="btn-header-kilidle"
            onClick={onKilidle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 dark:bg-slate-800/80 dark:hover:bg-rose-950/40 dark:text-slate-300 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 transition-all cursor-pointer shadow-2xs"
            title="Lock Workspace / İş masasını kilidlə"
          >
            <Lock className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600" />
            <span className="font-bold text-[11px] hidden xl:inline">Kilidlə</span>
          </button>
        )}
      </div>
    </header>
  );
};
