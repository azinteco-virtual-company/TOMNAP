import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { KullaniciRolu } from '../types';

interface RolSeciciProps {
  aktifRol: KullaniciRolu;
  onRolDegistir?: (rol: KullaniciRolu) => void;
  seciliKuryeId?: string;
  onKuryeSec?: (id: string) => void;
}
const labels: Record<KullaniciRolu, string> = {
  SUPER_ADMIN: 'Super Admin',
  PATRON: 'Butik rəhbəri',
  KANADA_SATINALMA: 'Kanada satınalma',
  ABD_SATINALMA: 'ABD satınalma',
  SATIS_SORUMLUSU: 'Satış məsulu',
  BAKU_FINANS: 'Bakı maliyyə',
  BAKU_KURYE: 'Bakı kuryer',
};
export const RolSecici: React.FC<RolSeciciProps> = ({ aktifRol }) => (
  <span
    className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white"
    title="Hesabınıza təyin edilmiş rol"
  >
    <ShieldCheck className="h-4 w-4" />
    {labels[aktifRol] || 'Oturum yoxdur'}
  </span>
);
