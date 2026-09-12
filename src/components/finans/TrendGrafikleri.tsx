import React from 'react';
import { Calendar, Package, CheckCircle2, Truck } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TrendNoktasiVerisi, GorunumSekmesi } from './types';

export interface TrendGrafikleriProps {
  gorunumSekmesi: GorunumSekmesi;
  seciliAralikTrendi: TrendNoktasiVerisi[];
}

export const TrendGrafikleri: React.FC<TrendGrafikleriProps> = ({
  gorunumSekmesi,
  seciliAralikTrendi,
}) => {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: TrendNoktasiVerisi = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs space-y-2.5 min-w-[230px]">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {data.formatliTarih}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">({data.tarihKey})</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-indigo-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Package className="w-3 h-3 text-indigo-400" />
                Sifariş Həcmi:
              </span>
              <strong className="text-white font-bold">{data.siparisSayisi} ədəd</strong>
            </div>

            <div className="flex items-center justify-between text-emerald-300 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Təhvil Verildi:
              </span>
              <strong className="text-white font-bold">{data.teslimEdilen} ədəd</strong>
            </div>

            <div className="flex items-center justify-between text-sky-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3 h-3 text-sky-400" />
                Yolda / Karqoda:
              </span>
              <strong className="text-white font-bold">{data.yoldakiKargo} ədəd</strong>
            </div>

            <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-slate-300 text-[11px]">
              <span>Dövriyyə (Ciro):</span>
              <strong className="text-indigo-300 font-bold">{data.ciro.toFixed(0)} ₼</strong>
            </div>

            <div className="flex items-center justify-between text-slate-300 text-[11px]">
              <span>Xalis Mənfəət:</span>
              <strong className="text-emerald-400 font-bold">{data.netKar.toFixed(0)} ₼</strong>
            </div>

            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Karqo Çəkisi:</span>
              <span className="text-slate-200">{data.toplamKilo.toFixed(1)} kq</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* SEKME 1: Sifariş Həcmi & Lojistik İcra Dinamikası (Area Chart) */}
      {gorunumSekmesi === 'trend' && (
        <div className="w-full h-[250px] sm:h-[280px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={seciliAralikTrendi}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="renkSiparis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="renkTeslim" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="renkYol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="kisaTarih"
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                yAxisId="sol"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
              />

              <Area
                yAxisId="sol"
                type="monotone"
                name="Sifariş Həcmi (ədəd)"
                dataKey="siparisSayisi"
                stroke="#6366f1"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#renkSiparis)"
                dot={{ r: 2, fill: '#6366f1' }}
                activeDot={{ r: 5, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
              />

              <Area
                yAxisId="sol"
                type="monotone"
                name="Təhvil Verildi"
                dataKey="teslimEdilen"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#renkTeslim)"
                dot={false}
                activeDot={{ r: 4, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
              />

              <Area
                yAxisId="sol"
                type="monotone"
                name="Yoldakı Karqo"
                dataKey="yoldakiKargo"
                stroke="#0ea5e9"
                strokeWidth={1.8}
                fillOpacity={1}
                fill="url(#renkYol)"
                dot={false}
                activeDot={{ r: 4, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SEKME 2: Mənfəət, Dövriyyə və Xərclər (Bar Chart) */}
      {gorunumSekmesi === 'maliye' && (
        <div className="w-full h-[250px] sm:h-[280px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={seciliAralikTrendi}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="kisaTarih"
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(val) => `${val}₼`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
              />
              <Bar name="Dövriyyə (Ciro)" dataKey="ciro" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar name="Kanada Alış Maya" dataKey="kanadaMaliyetAzn" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar name="Karqo Xərci" dataKey="kargoMaliyetAzn" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar name="Xalis Mənfəət" dataKey="netKar" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SEKME 3: Lojistik İcra & Çəki Dinamikası (Composed Chart) */}
      {gorunumSekmesi === 'lojistik' && (
        <div className="w-full h-[250px] sm:h-[280px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={seciliAralikTrendi}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="kisaTarih"
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                yAxisId="sol"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="sag"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#0ea5e9' }}
                tickFormatter={(val) => `${val}kq`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
              />
              <Bar yAxisId="sol" name="Təhvil Verildi (ədəd)" dataKey="teslimEdilen" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="sol" name="Yolda (ədəd)" dataKey="yoldakiKargo" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="sag"
                type="monotone"
                name="Karqo Çəkisi (kq)"
                dataKey="toplamKilo"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0284c7' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
};
