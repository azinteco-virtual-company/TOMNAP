import React, { useState } from 'react';
import { 
  UserCheck, 
  ShieldCheck, 
  Briefcase, 
  ShoppingCart, 
  DollarSign, 
  Truck, 
  Check, 
  ChevronDown,
  Info,
  Crown
} from 'lucide-react';
import { KullaniciRolu } from '../types';

interface RolSeciciProps {
  aktifRol: KullaniciRolu;
  onRolDegistir: (yeniRol: KullaniciRolu) => void;
  seciliKuryeId?: string;
  onKuryeSec?: (kuryeId: string) => void;
}

export const RolSecici: React.FC<RolSeciciProps> = ({
  aktifRol,
  onRolDegistir,
  seciliKuryeId = 'kurye-elvin',
  onKuryeSec
}) => {
  const [acik, setAcik] = useState(false);

  const roller = [
    {
      id: 'SUPER_ADMIN' as KullaniciRolu,
      baslik: 'Süper Admin (Kurucu / Dev)',
      aciklama: 'Bütün sayfalar + Mimari & Kod Devir (Tam Sınırsız Yetki)',
      ikon: Crown,
      renk: 'text-amber-400 bg-amber-950/40 border-amber-500/40',
      rozet: 'Tam Yetki'
    },
    {
      id: 'PATRON' as KullaniciRolu,
      baslik: 'Patron / Baş Yönetici',
      aciklama: 'Tüm sipariş, finans, kurye ve kar/kasa kontrolü. Kod sekmesi gizli.',
      ikon: Briefcase,
      renk: 'text-blue-400 bg-blue-950/40 border-blue-500/40',
      rozet: 'Yönetici'
    },
    {
      id: 'KANADA_SATINALMA' as KullaniciRolu,
      baslik: 'Kanada Satınalma & Kargo',
      aciklama: 'Kanada mağaza fişi/faturası yükleme, kargo çıktısı, kurye atama.',
      ikon: ShoppingCart,
      renk: 'text-rose-400 bg-rose-950/40 border-rose-500/40',
      rozet: 'Kanada Operasyon'
    },
    {
      id: 'SATIS_SORUMLUSU' as KullaniciRolu,
      baslik: 'Satış & Sipariş Giriş',
      aciklama: 'Görsel & WhatsApp sipariş kaydetme, gelen kutusu onaylama.',
      ikon: UserCheck,
      renk: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40',
      rozet: 'Satış / DM'
    },
    {
      id: 'BAKU_FINANS' as KullaniciRolu,
      baslik: 'Bakü Finans & Kasa',
      aciklama: 'Bakü tahsilatları, m10/nakit ödeme onayı, kalan borç takibi.',
      ikon: DollarSign,
      renk: 'text-teal-400 bg-teal-950/40 border-teal-500/40',
      rozet: 'Muhasebe'
    },
    {
      id: 'BAKU_KURYE' as KullaniciRolu,
      baslik: 'Bakü Saha Kuryesi / Təhvilatçı',
      aciklama: 'Sadece kendisine atanan paketleri görür. Arama, tahsilat, teslimat.',
      ikon: Truck,
      renk: 'text-purple-400 bg-purple-950/40 border-purple-500/40',
      rozet: 'Saha Teslimat'
    },
  ];

  const aktifRolBilgisi = roller.find(r => r.id === aktifRol) || roller[0];
  const AktifIkon = aktifRolBilgisi.ikon;

  // Əgər istifadəçi SUPER_ADMIN deyilsə, SUPER_ADMIN seçimi göstərilmir
  const gosterilenRoller = roller.filter((r) => {
    if (r.id === 'SUPER_ADMIN' && aktifRol !== 'SUPER_ADMIN') return false;
    return true;
  });

  return (
    <div className="relative">
      {/* Rol Seçim Butonu */}
      <button
        type="button"
        id="btn-rol-degistir"
        onClick={() => setAcik(!acik)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 shadow-sm transition-all cursor-pointer"
        title="Roller arası geçiş yaparak ekranların nasıl göründüğünü deneyimleyin"
      >
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <AktifIkon className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline font-extrabold">{aktifRolBilgisi.baslik.split('(')[0]}</span>
        <span className="sm:hidden font-extrabold">{aktifRolBilgisi.rozet}</span>
        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 font-mono">
          {aktifRolBilgisi.rozet}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </button>

      {/* Açılır Rol Menüsü */}
      {acik && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setAcik(false)}
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-2 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2 border-b border-slate-800">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>Operasyonel Rol Değiştirici</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Canlı Simülasyon
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Kimin neyi görüp göremediğini test etmek için rol seçin:
              </p>
            </div>

            <div className="py-1 space-y-1 max-h-80 overflow-y-auto">
              {gosterilenRoller.map((rol) => {
                const Ikon = rol.ikon;
                const secili = rol.id === aktifRol;

                return (
                  <button
                    key={rol.id}
                    type="button"
                    onClick={() => {
                      onRolDegistir(rol.id);
                      setAcik(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start gap-3 cursor-pointer ${
                      secili 
                        ? 'bg-slate-800 border border-slate-600 text-white font-semibold' 
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 border ${rol.renk}`}>
                      <Ikon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {rol.baslik}
                        </div>
                        {secili && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {rol.aciklama}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Kurye Rolü Seçildiğinde Hangi Kurye Olduğu Seçimi */}
            {aktifRol === 'BAKU_KURYE' && onKuryeSec && (
              <div className="mt-2 pt-2 border-t border-slate-800 px-3 pb-2 bg-purple-950/30 rounded-xl">
                <div className="text-[11px] font-bold text-purple-300 mb-1 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" />
                  <span>Aktif Kurye Profilini Seçin:</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'kurye-elvin', label: 'Elvin (Nərimanov/Mərkəz)' },
                    { id: 'kurye-resad', label: 'Rəşad (Yasamal/Elmlər)' },
                    { id: 'kurye-vuqar', label: 'Vüqar (Gəncə/Rayonlar)' },
                    { id: 'ofis-tehvil', label: 'Ofis (Evdən Təhvil)' },
                  ].map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => onKuryeSec(k.id)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all text-left truncate cursor-pointer ${
                        seciliKuryeId === k.id
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-800 hover:bg-slate-700 text-purple-200'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
