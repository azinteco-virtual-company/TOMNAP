import React from 'react';
import { Building2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';

/**
 * Kargo ayarları ve işlemleri tek bir butiğe aittir. Platform yöneticisi "Bütün
 * Butiklər" modundayken kargo ekranı önce butik seçtirir ve hiçbir istek göndermez
 * (sunucu tenant "all" için 400 "Kargo işlemi için firma seçin." der). Seçim v1'in
 * mekanizmasıyladır: setSeciliFirmaId, yani üstteki butik seçicisiyle aynı.
 */
export function kargoButikGerekli(seciliFirmaId: string | null | undefined): boolean {
  return !seciliFirmaId || seciliFirmaId === 'all';
}

export const KargoButikSecimi: React.FC = () => {
  const firmalar = useAppStore((state) => state.firmalar);
  const setSeciliFirmaId = useAppStore((state) => state.setSeciliFirmaId);
  return (
    <div className="bg-white p-6 rounded-2xl border border-amber-200 shadow-sm space-y-3">
      <div className="flex items-center gap-2 text-slate-900">
        <Building2 className="w-5 h-5 text-amber-500" />
        <h3 className="text-sm font-bold">Kargo əməliyyatları bir butikə aiddir</h3>
      </div>
      <p className="text-xs text-slate-500">
        Davam etmək üçün butik seçin. Seçim yuxarıdakı butik seçicisi ilə eynidir.
      </p>
      <select
        aria-label="Kargo üçün butik"
        defaultValue=""
        onChange={(event) => event.target.value && setSeciliFirmaId(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm"
      >
        <option value="" disabled>
          Butik seçin
        </option>
        {firmalar.map((firma) => (
          <option key={firma.id} value={firma.id}>
            {firma.ad}
          </option>
        ))}
      </select>
    </div>
  );
};
