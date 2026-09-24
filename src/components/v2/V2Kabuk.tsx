import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/apiClient';

type SunucuDurumu = 'yukleniyor' | 'acik' | 'kapali' | 'hata';

/**
 * v2 kabuğu (VITE_FF_V2_FLOW). Ayrı bir parça olarak yüklenir; bayrak kapalıyken
 * derlemeye hiç girmez. Ekranlar (kurlar, ayarlar, sipariş satırları) sonraki
 * PR'larda bu kabuğun içine eklenir.
 */
export default function V2Kabuk() {
  const navigate = useNavigate();
  const [durum, setDurum] = useState<SunucuDurumu>('yukleniyor');

  useEffect(() => {
    let iptal = false;
    apiFetch('/api/v2/durum')
      .then((response) => {
        if (!iptal) setDurum(response.ok ? 'acik' : response.status === 404 ? 'kapali' : 'hata');
      })
      .catch(() => {
        if (!iptal) setDurum('hata');
      });
    return () => {
      iptal = true;
    };
  }, []);

  return (
    <div data-v2-kabuk="tomnap-v2-kabuk" className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold">TOMNAP v2</h1>
          <p className="text-xs text-slate-400">Önizləmə — yeni axın hələ hazırlanır</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Mövcud panelə qayıt
        </button>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p role="status" className="text-sm text-slate-300">
          {durum === 'yukleniyor'
            ? 'Server yoxlanılır…'
            : durum === 'acik'
              ? 'Server v2 axını aktivdir.'
              : durum === 'kapali'
                ? 'Serverdə v2 axını aktiv deyil (FF_V2_FLOW).'
                : 'Server v2 vəziyyəti yoxlanıla bilmədi.'}
        </p>
      </main>
    </div>
  );
}
