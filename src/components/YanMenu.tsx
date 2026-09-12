import React from 'react';
import { 
  Package, 
  DollarSign, 
  Database, 
  Sparkles, 
  Server, 
  ShieldCheck, 
  X,
  Layers,
  KeyRound,
  MessageSquareCode,
  Users,
  BookOpen,
  Camera,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Plane,
  Truck,
  Crown,
  Briefcase
} from 'lucide-react';
import { KullaniciRolu } from '../types';
import { useDil } from '../context/DilKonteksti';
import { PWAInstallButton } from './PWAInstallButton';

interface YanMenuProps {
  aktifSekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi';
  setAktifSekme: (sekme: 'panel' | 'kanban' | 'gorsel-giris' | 'musteriler' | 'kargo-manifest' | 'baku-tahsilat' | 'inbox' | 'kodlar' | 'kurye-masasi') => void;
  seciliKodSekmesi: string;
  setSeciliKodSekmesi: (sekme: any) => void;
  toplamSiparis: number;
  mobilAcik: boolean;
  setMobilAcik: (acik: boolean) => void;
  dar?: boolean;
  onDarDegistir?: (dar: boolean) => void;
  onKargoManifestAc?: () => void;
  onBakuTahsilatAc?: () => void;
  onInboxAc?: () => void;
  inboxSayisi?: number;
  aktifRol?: KullaniciRolu;
  onVeritabaniModalAc?: () => void;
}

export const YanMenu: React.FC<YanMenuProps> = ({
  aktifSekme,
  setAktifSekme,
  seciliKodSekmesi,
  setSeciliKodSekmesi,
  toplamSiparis,
  mobilAcik,
  setMobilAcik,
  dar = false,
  onDarDegistir,
  onKargoManifestAc,
  onBakuTahsilatAc,
  onInboxAc,
  inboxSayisi = 2,
  aktifRol = 'SUPER_ADMIN',
  onVeritabaniModalAc,
}) => {
  const { t } = useDil();

  const panelGit = () => {
    setAktifSekme('panel');
    setMobilAcik(false);
  };

  const gorselGirisGit = () => {
    setAktifSekme('gorsel-giris');
    setMobilAcik(false);
  };

  const musterilerGit = () => {
    setAktifSekme('musteriler');
    setMobilAcik(false);
  };

  const kargoManifestGit = () => {
    setAktifSekme('kargo-manifest');
    setMobilAcik(false);
  };

  const bakuTahsilatGit = () => {
    setAktifSekme('baku-tahsilat');
    setMobilAcik(false);
  };

  const inboxGit = () => {
    setAktifSekme('inbox');
    setMobilAcik(false);
  };

  const kuryeMasasiGit = () => {
    setAktifSekme('kurye-masasi');
    setMobilAcik(false);
  };

  const kodSekmesineGit = (sekme: string) => {
    setAktifSekme('kodlar');
    setSeciliKodSekmesi(sekme);
    setMobilAcik(false);
  };

  // ROL BAZLI YETKİ KONTROLLERİ:
  // Süper Admin: Her şeyi görür
  // Patron: Sistem ve kod devri hariç her işletme ekranını görür
  // Satış: Sipariş tablosu, görsel giriş, inbox görür
  // Kanada Satınalma: Siparişler, Kargo manifestosu, Görsel giriş görür
  // Bakü Finans: Siparişler, Bakü tahsilat, Müşteriler görür
  // Bakü Kurye: Öncelikle sadece Kurye Teslimat Masası'nı görür
  const canSeePanel = aktifRol !== 'BAKU_KURYE';
  const canSeeGorselGiris = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'SATIS_SORUMLUSU' || aktifRol === 'KANADA_SATINALMA';
  const canSeeMusteriler = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'BAKU_FINANS' || aktifRol === 'SATIS_SORUMLUSU';
  const canSeeKargoManifest = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'KANADA_SATINALMA';
  const canSeeBakuTahsilat = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'BAKU_FINANS';
  const canSeeInbox = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'SATIS_SORUMLUSU';
  const canSeeKuryeMasasi = aktifRol === 'SUPER_ADMIN' || aktifRol === 'PATRON' || aktifRol === 'BAKU_KURYE';
  // Patron kesinlikle Sistem & Devir kodlarını GÖREMEZ!
  const canSeeSistemKodlar = aktifRol === 'SUPER_ADMIN';

  return (
    <>
      {/* Mobil Karartma Perdesi */}
      {mobilAcik && (
        <div
          onClick={() => setMobilAcik(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Yan Panel Asıl Konteyner (Dar modda lg:w-20, Normalde w-64) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 shrink-0 ${
          dar ? 'lg:w-20 w-64' : 'w-64'
        } ${mobilAcik ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div
          className={`border-b border-slate-800 flex items-center transition-all ${
            dar
              ? 'p-3.5 flex-col justify-center gap-2'
              : 'p-5 justify-between'
          }`}
        >
          {!dar ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shrink-0">
                🍁
              </div>
              <div className="min-w-0">
                <h1 className="text-white font-extrabold text-base tracking-tight uppercase leading-tight truncate">
                  KNB
                </h1>
                <p className="text-[11px] text-slate-400 leading-none mt-0.5 truncate">
                  {t.platformAltBaslik}
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onDarDegistir && onDarDegistir(false)}
              className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600 flex items-center justify-center text-white font-extrabold text-base shadow-md cursor-pointer hover:scale-105 transition-transform"
              title="KNB Lojistik"
            >
              🍁
            </button>
          )}

          <div className="flex items-center gap-1">
            {/* Masaüstü Menü Daralt / Genişlet Butonu */}
            {onDarDegistir && (
              <button
                type="button"
                id="btn-yan-menu-daralt-genislet"
                onClick={() => onDarDegistir(!dar)}
                className={`hidden lg:flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ${
                  dar ? 'w-10 h-8 mt-1' : ''
                }`}
                title={dar ? 'Menüyü Genişlet' : 'Menüyü Daralt'}
              >
                {dar ? (
                  <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
                ) : (
                  <PanelLeftClose className="w-4 h-4 hover:text-emerald-400" />
                )}
              </button>
            )}

            {/* Mobil Kapatma Butonu */}
            <button
              onClick={() => setMobilAcik(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className={`flex-1 overflow-y-auto ${dar ? 'p-2 space-y-2' : 'p-4 space-y-1'}`}>
          {/* Bölüm Başlığı: Yönetim */}
          {!dar ? (
            <div className="px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {t.yonetim}
            </div>
          ) : (
            <div className="w-6 h-px bg-slate-800 mx-auto my-1.5" />
          )}

          {/* 1. Siparişler & Tablo */}
          {canSeePanel && (
            <div className="relative group flex justify-center w-full">
              <button
                id="nav-btn-panel"
                onClick={panelGit}
                className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  dar
                    ? `w-11 h-11 justify-center relative ${
                        aktifSekme === 'panel'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`
                    : `w-full justify-between px-3 py-2.5 ${
                        aktifSekme === 'panel'
                          ? 'bg-blue-600 text-white shadow-sm font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`
                }`}
              >
                <div className="flex items-center min-w-0">
                  <Package className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-current`} />
                  {!dar && <span className="truncate">{t.siparislerTablo}</span>}
                </div>
                {!dar ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                    {toplamSiparis}
                  </span>
                ) : (
                  toplamSiparis > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white font-bold text-[9px] flex items-center justify-center shadow-xs">
                      {toplamSiparis}
                    </span>
                  )
                )}
              </button>
              {dar && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                  <span>{t.siparislerTablo}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-blue-300 text-[10px]">
                    {toplamSiparis}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Kanban Boru Xətti (5 Mərhələ) */}
          {canSeePanel && (
            <div className="relative group flex justify-center w-full">
              <button
                id="nav-btn-kanban"
                onClick={() => {
                  setAktifSekme('kanban');
                  setMobilAcik(false);
                }}
                className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  dar
                    ? `w-11 h-11 justify-center relative ${
                        aktifSekme === 'kanban'
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'hover:bg-slate-800/80 text-slate-400 hover:text-white'
                      }`
                    : `w-full justify-between px-3 py-2.5 mt-1 ${
                        aktifSekme === 'kanban'
                          ? 'bg-indigo-600 text-white font-bold shadow-sm'
                          : 'hover:bg-slate-800/60 text-slate-400 hover:text-white'
                      }`
                }`}
              >
                <div className="flex items-center min-w-0">
                  <Layers className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-indigo-400`} />
                  {!dar && <span className="truncate">Kanban Boru Xətti</span>}
                </div>
                {!dar ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    5 Mərhələ
                  </span>
                ) : (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-white font-bold text-[9px] flex items-center justify-center shadow-xs">
                    5
                  </span>
                )}
              </button>
              {dar && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                  <span>Kanban Boru Xətti</span>
                </div>
              )}
            </div>
          )}

          {/* Kurye Saha Masası (Kuryeler, Patron ve Admin için) */}
          {canSeeKuryeMasasi && (
            <div className="relative group flex justify-center w-full">
              <button
                id="nav-btn-kurye-masasi"
                onClick={kuryeMasasiGit}
                className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  dar
                    ? `w-11 h-11 justify-center relative ${
                        aktifSekme === 'kurye-masasi'
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/40 text-purple-300'
                      }`
                    : `w-full justify-between px-3 py-2.5 mt-1 ${
                        aktifSekme === 'kurye-masasi'
                          ? 'bg-purple-600 text-white font-bold shadow-sm'
                          : 'bg-purple-950/30 hover:bg-purple-900/40 border border-purple-800/40 text-purple-300'
                      }`
                }`}
              >
                <div className="flex items-center min-w-0">
                  <Truck className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-purple-400`} />
                  {!dar && <span className="truncate">{t.kuryeMasasi}</span>}
                </div>
                {!dar ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                    Saha
                  </span>
                ) : (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-purple-500 text-white font-black text-[9px] flex items-center justify-center shadow-xs">
                    🛵
                  </span>
                )}
              </button>
              {dar && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                  <span>{t.kuryeMasasi}</span>
                </div>
              )}
            </div>
          )}

          {/* 2. Görsel & WhatsApp Giriş Masası */}
          {canSeeGorselGiris && (
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-gorsel-giris"
              onClick={gorselGirisGit}
              className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center relative ${
                      aktifSekme === 'gorsel-giris'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/40 text-emerald-300'
                    }`
                  : `w-full justify-between px-3 py-2.5 mt-1 ${
                      aktifSekme === 'gorsel-giris'
                        ? 'bg-emerald-600 text-white font-bold shadow-sm'
                        : 'bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-800/40 text-emerald-300'
                    }`
              }`}
            >
              <div className="flex items-center min-w-0">
                <Camera className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-emerald-400`} />
                {!dar && <span className="truncate">{t.gorselGiris}</span>}
              </div>
              {!dar ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  AI
                </span>
              ) : (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-slate-950 font-black text-[9px] flex items-center justify-center shadow-xs">
                  AI
                </span>
              )}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span>{t.gorselGiris}</span>
              </div>
            )}
          </div>
          )}

          {/* 3. Müşteri Rehberi & CRM */}
          {canSeeMusteriler && (
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-musteriler"
              onClick={musterilerGit}
              className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center relative ${
                      aktifSekme === 'musteriler'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full justify-between px-3 py-2.5 mt-1 ${
                      aktifSekme === 'musteriler'
                        ? 'bg-purple-600 text-white font-bold shadow-sm'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <div className="flex items-center min-w-0">
                <Users className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-purple-400`} />
                {!dar && <span className="truncate">{t.musteriRehberi}</span>}
              </div>
              {!dar ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  CRM
                </span>
              ) : (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-purple-500 text-white font-bold text-[8px] flex items-center justify-center shadow-xs">
                  CRM
                </span>
              )}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span>{t.musteriRehberi}</span>
              </div>
            )}
          </div>
          )}

          {/* 4. Kargo Manifestosu & Çeki Listesi (Tam Sayfa) */}
          {canSeeKargoManifest && (
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-kargo-manifest-tab"
              onClick={kargoManifestGit}
              className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center relative ${
                      aktifSekme === 'kargo-manifest'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-sky-950/40 hover:bg-sky-900/50 border border-sky-800/40 text-sky-300'
                    }`
                  : `w-full justify-between px-3 py-2.5 mt-1 ${
                      aktifSekme === 'kargo-manifest'
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-sky-950/30 hover:bg-sky-900/40 border border-sky-800/40 text-sky-300'
                    }`
              }`}
            >
              <div className="flex items-center min-w-0">
                <Plane className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-sky-400`} />
                {!dar && <span className="truncate">{t.kargoManifest}</span>}
              </div>
              {!dar ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  Uçuş
                </span>
              ) : (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-sky-500 text-white font-bold text-[8px] flex items-center justify-center shadow-xs">
                  ✈️
                </span>
              )}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span>{t.kargoManifest}</span>
              </div>
            )}
          </div>
          )}

          {/* 5. Bakı Qalıq Borc & Təhsilat Masası (Tam Sayfa) */}
          {canSeeBakuTahsilat && (
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-baku-tahsilat-tab"
              onClick={bakuTahsilatGit}
              className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center relative ${
                      aktifSekme === 'baku-tahsilat'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40 text-amber-300'
                    }`
                  : `w-full justify-between px-3 py-2.5 mt-1 ${
                      aktifSekme === 'baku-tahsilat'
                        ? 'bg-amber-600 text-white font-bold shadow-sm'
                        : 'bg-amber-950/30 hover:bg-amber-900/40 border border-amber-800/40 text-amber-300'
                    }`
              }`}
            >
              <div className="flex items-center min-w-0">
                <DollarSign className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-amber-400`} />
                {!dar && <span className="truncate">{t.bakuTahsilat}</span>}
              </div>
              {!dar ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 font-bold">
                  Kassa
                </span>
              ) : (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 font-bold text-[8px] flex items-center justify-center shadow-xs">
                  ₼
                </span>
              )}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span>{t.bakuTahsilat}</span>
              </div>
            )}
          </div>
          )}

          {/* 6. Onay Bekleyenler (Gelen Kutusu / Inbox - Tam Sayfa) */}
          {canSeeInbox && (
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-inbox-tab"
              onClick={inboxGit}
              className={`flex items-center rounded-xl text-sm font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center relative ${
                      aktifSekme === 'inbox'
                        ? 'bg-violet-600 text-white shadow-md'
                        : 'bg-violet-950/40 hover:bg-violet-900/50 border border-violet-800/40 text-violet-200'
                    }`
                  : `w-full justify-between px-3 py-2.5 mt-1 ${
                      aktifSekme === 'inbox'
                        ? 'bg-violet-600 text-white font-bold shadow-sm'
                        : 'bg-violet-950/30 hover:bg-violet-900/40 border border-violet-800/40 text-violet-200'
                    }`
              }`}
            >
              <div className="flex items-center min-w-0">
                <Sparkles className={`w-4 h-4 shrink-0 ${!dar ? 'mr-3' : ''} text-violet-400`} />
                {!dar && <span className="truncate">{t.inboxGelen}</span>}
              </div>
              {!dar ? (
                inboxSayisi > 0 ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold">
                    {inboxSayisi}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold">
                    AI
                  </span>
                )
              ) : (
                inboxSayisi > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-violet-500 text-white font-bold text-[9px] flex items-center justify-center shadow-xs">
                    {inboxSayisi}
                  </span>
                )
              )}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span>{t.inboxGelen} ({inboxSayisi})</span>
              </div>
            )}
          </div>
          )}

          {/* Bölüm: Sistem & Devir (SADECE SUPER ADMIN GÖREBİLİR - PATRON DAHİL DİĞERLERİNE KESİNLİKLE GİZLİ) */}
          {canSeeSistemKodlar && (
          <>
          {!dar ? (
            <div className="mt-5 px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.sistemDevir}</span>
            </div>
          ) : (
            <div className="w-6 h-px bg-slate-800 mx-auto my-2" />
          )}

          {/* 0. Baza & Canlı/Demo Mərkəzi (Super Admin SaaS) */}
          {onVeritabaniModalAc && (
          <div className="relative group flex justify-center w-full mb-1">
            <button
              id="nav-btn-veritabani-yonetim"
              onClick={onVeritabaniModalAc}
              className={`flex items-center rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                dar
                  ? 'w-11 h-11 justify-center bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 shadow-xs'
                  : 'w-full px-3 py-2 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 shadow-2xs'
              }`}
            >
              <Database className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-emerald-400`} />
              {!dar && <span className="truncate">Baza & Canlı/Demo Rejimi</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                Baza & Canlı/Demo Rejimi
              </div>
            )}
          </div>
          )}

          {/* 1. Hızlı Kurulum & API */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-kurulum"
              onClick={() => kodSekmesineGit('kurulum')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'kurulum'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'kurulum'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <KeyRound className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-amber-400`} />
              {!dar && <span className="truncate">1. Hızlı Kurulum & API</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                1. Hızlı Kurulum & API
              </div>
            )}
          </div>

          {/* 2. Tetikleyici & Webhook */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-tetikleyici"
              onClick={() => kodSekmesineGit('tetikleyici')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'tetikleyici'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'tetikleyici'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <MessageSquareCode className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-amber-400`} />
              {!dar && <span className="truncate">2. Tetikleyici & Webhook</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                2. Tetikleyici & Webhook
              </div>
            )}
          </div>

          {/* 3. SQL Şema (Supabase) */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-sql"
              onClick={() => kodSekmesineGit('supabase')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'supabase'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'supabase'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <Database className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-current`} />
              {!dar && <span className="truncate">3. SQL Şema (Supabase)</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                3. SQL Şema (Supabase PostgreSQL)
              </div>
            )}
          </div>

          {/* 4. Gemini Prompt & Şema */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-gemini"
              onClick={() => kodSekmesineGit('gemini')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'gemini'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'gemini'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-current`} />
              {!dar && <span className="truncate">4. Gemini Prompt & Şema</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                4. Gemini AI Prompt & Şema
              </div>
            )}
          </div>

          {/* 5. Next.js API & Webhook */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-nextapi"
              onClick={() => kodSekmesineGit('nextjs-api')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'nextjs-api'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'nextjs-api'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <Server className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-current`} />
              {!dar && <span className="truncate">5. Next.js API & Webhook</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                5. Next.js API & Webhook
              </div>
            )}
          </div>

          {/* 6. Kanada ➔ Bakü Roller */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-operasyon"
              onClick={() => kodSekmesineGit('operasyon')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'operasyon'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'operasyon'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <Users className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-emerald-400`} />
              {!dar && <span className="truncate">6. Kanada ➔ Bakü Roller</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                6. Kanada ➔ Bakü Ekip Rolleri
              </div>
            )}
          </div>

          {/* 7. İş Akışı & Dağıtım */}
          <div className="relative group flex justify-center w-full">
            <button
              id="nav-btn-mimari"
              onClick={() => kodSekmesineGit('mimari')}
              className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                dar
                  ? `w-11 h-11 justify-center ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'mimari'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
                  : `w-full px-3 py-2 ${
                      aktifSekme === 'kodlar' && seciliKodSekmesi === 'mimari'
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`
              }`}
            >
              <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${!dar ? 'mr-2.5' : ''} text-current`} />
              {!dar && <span className="truncate">İş Akışı & Dağıtım</span>}
            </button>
            {dar && (
              <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-semibold rounded-lg whitespace-nowrap shadow-xl border border-slate-700 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
                İş Akışı & Dağıtım
              </div>
            )}
          </div>
          </>
          )}
        </nav>

        {/* PWA Yükleme Alanı (Geniş mod veya Mobil açıkken) */}
        {!dar && (
          <div className="px-3 pb-2 pt-1">
            <PWAInstallButton variant="menu" />
          </div>
        )}

        {/* Alt Bilgi Footer (Dar modda kompakt avatar & genişlet butonu) */}
        <div className="p-3 border-t border-slate-800 mt-auto">
          {!dar ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold shadow-xs">
                  {aktifRol === 'SUPER_ADMIN' ? 'SA' : aktifRol === 'PATRON' ? 'PT' : aktifRol === 'BAKU_KURYE' ? 'KY' : 'US'}
                </div>
                <div>
                  <p className="text-xs text-white font-bold truncate">
                    {aktifRol === 'SUPER_ADMIN' ? 'Süper Admin (Dev)' : aktifRol === 'PATRON' ? 'Patron / Yönetici' : aktifRol === 'BAKU_KURYE' ? 'Bakü Kuryesi' : aktifRol}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {aktifRol === 'SUPER_ADMIN' ? 'Full-Stack Modu' : 'İşletme Modu'}
                  </p>
                </div>
              </div>
              {onDarDegistir && (
                <button
                  type="button"
                  onClick={() => onDarDegistir(true)}
                  className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Menüyü Daralt (Geniş Tablo Modu)"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div 
                className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold shadow-xs cursor-pointer"
                title="Sistem Mimarı (Full-Stack Modu)"
              >
                SA
              </div>
              {onDarDegistir && (
                <button
                  type="button"
                  onClick={() => onDarDegistir(false)}
                  className="hidden lg:flex items-center justify-center w-full py-1 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 text-[10px] transition-colors cursor-pointer"
                  title="Menüyü Aç"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
