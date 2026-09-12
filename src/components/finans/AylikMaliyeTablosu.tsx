import React from 'react';
import { Calendar } from 'lucide-react';
import { AylikMaliyeSatiri } from './types';

export interface AylikMaliyeTablosuProps {
  aylikMaliyeTablosu: AylikMaliyeSatiri[];
  toplamSiparis: number;
  toplamCiro: number;
  toplananTutar: number;
  kalanAlacak: number;
  toplamKanadaAlisAzn: number;
  toplamKargoMaliyetiAzn: number;
  toplamNetKar: number;
  ortalamaKarMarji: number;
  toplamKargoAgirligi: number;
  genelTeslimOrani: number;
}

export const AylikMaliyeTablosu: React.FC<AylikMaliyeTablosuProps> = ({
  aylikMaliyeTablosu,
  toplamSiparis,
  toplamCiro,
  toplananTutar,
  kalanAlacak,
  toplamKanadaAlisAzn,
  toplamKargoMaliyetiAzn,
  toplamNetKar,
  ortalamaKarMarji,
  toplamKargoAgirligi,
  genelTeslimOrani,
}) => {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
            <th className="py-2.5 px-3">Dövr / Ay</th>
            <th className="py-2.5 px-2 text-center">Sifariş</th>
            <th className="py-2.5 px-3 text-right">Dövriyyə (Ciro)</th>
            <th className="py-2.5 px-3 text-right">Tahsilat</th>
            <th className="py-2.5 px-3 text-right">Qalıq</th>
            <th className="py-2.5 px-3 text-right">Kanada Alış</th>
            <th className="py-2.5 px-3 text-right">Karqo Xərci</th>
            <th className="py-2.5 px-3 text-right text-emerald-700">Xalis Qazanc</th>
            <th className="py-2.5 px-2 text-center">Marja</th>
            <th className="py-2.5 px-2 text-center">Çəki</th>
            <th className="py-2.5 px-2 text-center">Təhvil</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {aylikMaliyeTablosu.map((satir) => (
            <tr key={satir.yilAy} className="hover:bg-slate-50 transition-colors">
              <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-indigo-500" />
                {satir.ayAdi}
              </td>
              <td className="py-2.5 px-2 text-center font-semibold">
                {satir.siparisSayisi}
              </td>
              <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                {satir.ciro.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">
                {satir.tahsilat.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-3 text-right font-semibold text-amber-600">
                {satir.kalan.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                {satir.kanadaAlisAzn.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                {satir.kargoMaliyetAzn.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                {satir.netKar.toFixed(0)} ₼
              </td>
              <td className="py-2.5 px-2 text-center">
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                  %{satir.karMarji}
                </span>
              </td>
              <td className="py-2.5 px-2 text-center font-mono text-[11px]">
                {satir.toplamKilo.toFixed(1)} kq
              </td>
              <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                %{satir.teslimOrani}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
            <td className="py-3 px-3">CƏMİ ÜMUMİ</td>
            <td className="py-3 px-2 text-center">{toplamSiparis}</td>
            <td className="py-3 px-3 text-right">{toplamCiro.toFixed(0)} ₼</td>
            <td className="py-3 px-3 text-right text-emerald-700">{toplananTutar.toFixed(0)} ₼</td>
            <td className="py-3 px-3 text-right text-amber-700">{kalanAlacak.toFixed(0)} ₼</td>
            <td className="py-3 px-3 text-right font-mono">{toplamKanadaAlisAzn.toFixed(0)} ₼</td>
            <td className="py-3 px-3 text-right font-mono">{toplamKargoMaliyetiAzn.toFixed(0)} ₼</td>
            <td className="py-3 px-3 text-right text-emerald-700 font-black">{toplamNetKar.toFixed(0)} ₼</td>
            <td className="py-3 px-2 text-center">%{ortalamaKarMarji}</td>
            <td className="py-3 px-2 text-center font-mono">{toplamKargoAgirligi.toFixed(1)} kq</td>
            <td className="py-3 px-2 text-center">%{genelTeslimOrani}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
