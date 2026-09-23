import type { Cakisma } from './manifestEslestirmeApi';

const SEBEP: Record<string, string> = {
  MEVCUT_AWB: 'Sifarişin artıq AWB-si var (üzərinə yazılmır)',
  AWB_BASKA_SIPARISTE: 'Bu AWB başqa sifarişdədir',
  TESLIM_EDILDI: 'Sifariş təhvil verilib (dəyişdirilmir)',
};

export default function CakismaListesi({ cakismalar }: { cakismalar: Cakisma[] }) {
  if (cakismalar.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-extrabold text-rose-700 dark:text-rose-300">
        Konfliktlər ({cakismalar.length}) — bu sifarişlərə AWB yazılmayacaq
      </h4>
      <div className="overflow-x-auto border border-rose-200 dark:border-rose-900 rounded-xl">
        <table className="w-full text-xs text-left">
          <thead className="bg-rose-50 dark:bg-rose-950/40 font-bold uppercase text-2xs text-rose-700 dark:text-rose-300">
            <tr>
              <th className="p-2.5">Sətir</th>
              <th className="p-2.5">Manifest AWB</th>
              <th className="p-2.5">Sifariş</th>
              <th className="p-2.5">Səbəb</th>
              <th className="p-2.5">Mövcud AWB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-100 dark:divide-rose-900/60">
            {cakismalar.map((cakisma) => (
              <tr key={`${cakisma.satirNo}-${cakisma.siparisId}-${cakisma.sebep}`}>
                <td className="p-2.5 font-mono text-slate-500">{cakisma.satirNo}</td>
                <td className="p-2.5 font-mono font-bold">{cakisma.takipNo}</td>
                <td className="p-2.5 font-bold">{cakisma.musteriAdi || cakisma.siparisId}</td>
                <td className="p-2.5">{SEBEP[cakisma.sebep] ?? cakisma.sebep}</td>
                <td className="p-2.5 font-mono">{cakisma.mevcutAwb || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
