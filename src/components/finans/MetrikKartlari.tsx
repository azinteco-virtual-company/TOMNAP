import React from 'react';
import { Wallet, Plane, Package, TrendingUp } from 'lucide-react';
import { MetrikKartlariProps } from './types';

export const MetrikKartlari: React.FC<MetrikKartlariProps> = ({
  toplananTutar,
  toplamCiro,
  kalanAlacak,
  toplamKargoAgirligi,
  aktifYoldakiKargo,
  genelTeslimOrani,
  toplamSiparisSayisi,
  odenenSiparisSayisi,
  odemeYuzdesi,
  tahminiNetKar,
  toplamKanadaAlisMaliyetiAzn,
  toplamKargoMaliyetiAzn,
  t,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Toplam Tahsilat & Kasa */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-indigo-600" />
              {t.bakuTehsilatKarti}
            </p>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {t.canli}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {toplananTutar.toFixed(2)} <span className="text-base font-semibold text-slate-700">₼</span>
          </p>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            Dövriyyə: <strong className="text-slate-800">{toplamCiro.toFixed(0)} ₼</strong>
          </span>
          <span className="text-amber-600 font-bold">Qalıq: {kalanAlacak.toFixed(2)} ₼</span>
        </div>
      </div>

      {/* 2. Lojistik Həcmi & Hava Karqosu */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-sky-600" />
              Lojistik & Karqo
            </p>
            <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
              YYZ ➔ GYD
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline gap-2">
            <span>{toplamKargoAgirligi.toFixed(1)}</span>
            <span className="text-sm font-semibold text-slate-600">kq daşınma</span>
          </p>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-sky-700 font-medium">
          <span>{aktifYoldakiKargo} ədəd yolda</span>
          <span className="text-emerald-700 font-bold">%{genelTeslimOrani} Təhvil</span>
        </div>
      </div>

      {/* 3. Sifariş Sayı & Təhsilat Faizi */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              Sifarişlər
            </p>
            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
              %{odemeYuzdesi} {t.odendi}
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline gap-1.5">
            <span>{toplamSiparisSayisi}</span>
            <span className="text-sm font-semibold text-slate-600">paket</span>
          </p>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-emerald-700 font-semibold">{odenenSiparisSayisi} tam ödənilib</span>
          <span className="text-slate-500">{toplamSiparisSayisi - odenenSiparisSayisi} qalıq borclu</span>
        </div>
      </div>

      {/* 4. Təxmini Xalis Mənfəət & Marja */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-xs">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              Təxmini Xalis Mənfəət
            </p>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              %{toplamCiro > 0 ? Math.round((tahminiNetKar / toplamCiro) * 100) : 0} Marja
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-1">
            {tahminiNetKar.toFixed(0)} <span className="text-base font-semibold text-emerald-800">₼</span>
          </p>
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>Alış: {toplamKanadaAlisMaliyetiAzn.toFixed(0)} ₼</span>
          <span>Karqo: {toplamKargoMaliyetiAzn.toFixed(0)} ₼</span>
        </div>
      </div>
    </div>
  );
};
