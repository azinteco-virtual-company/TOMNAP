import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import { rolGrubunda } from '../../shared/roller';
import V2Kurlar from './V2Kurlar';
import V2Ayarlar from './V2Ayarlar';

// Sipariş girişi kendi parçasında: kabuk açılınca değil, sekme seçilince yüklenir.
const SiparisGirisi = lazy(() => import('./SiparisGirisi'));
const V2Kasa = lazy(() => import('./V2Kasa'));

type SunucuDurumu = 'yukleniyor' | 'acik' | 'kapali' | 'hata';
type Sekme = 'siparisler' | 'kasa' | 'kurlar' | 'ayarlar';

/**
 * v2 kabuğu (VITE_FF_V2_FLOW). Ayrı bir parça olarak yüklenir; bayrak kapalıyken
 * derlemeye hiç girmez. Sekmeler sunucudaki allowlist ile aynı gruplardan açılır:
 * siparişler STAFF (form yalnız SALES), kasa FINANCE, kurlar RATES, ayarlar OWNERS.
 */
export default function V2Kabuk() {
  const navigate = useNavigate();
  const aktifRol = useAppStore((state) => state.aktifRol);
  const [durum, setDurum] = useState<SunucuDurumu>('yukleniyor');
  const sekmeler: Array<{ id: Sekme; ad: string }> = [
    ...(rolGrubunda(aktifRol, 'STAFF') ? [{ id: 'siparisler' as const, ad: 'Sifarişlər' }] : []),
    ...(rolGrubunda(aktifRol, 'FINANCE') ? [{ id: 'kasa' as const, ad: 'Kassa' }] : []),
    ...(rolGrubunda(aktifRol, 'RATES') ? [{ id: 'kurlar' as const, ad: 'Kurlar' }] : []),
    ...(rolGrubunda(aktifRol, 'OWNERS') ? [{ id: 'ayarlar' as const, ad: 'Ayarlar' }] : []),
  ];
  const [secili, setSecili] = useState<Sekme | null>(null);
  const aktif = sekmeler.find((sekme) => sekme.id === secili)?.id ?? sekmeler[0]?.id ?? null;

  useEffect(() => {
    let iptal = false;
    apiFetch('/api/v2/durum')
      .then(() => {
        if (!iptal) setDurum('acik');
      })
      .catch((error: unknown) => {
        // apiFetch throws on every non-2xx answer; 404 is the server's closed gate.
        if (!iptal) setDurum(error instanceof ApiError && error.status === 404 ? 'kapali' : 'hata');
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
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {durum !== 'acik' && (
          <p role="status" className="text-sm text-slate-300">
            {durum === 'yukleniyor'
              ? 'Server yoxlanılır…'
              : durum === 'kapali'
                ? 'Serverdə v2 axını aktiv deyil (FF_V2_FLOW).'
                : 'Server v2 vəziyyəti yoxlanıla bilmədi.'}
          </p>
        )}
        {durum === 'acik' && sekmeler.length > 1 && (
          <nav className="flex gap-2" aria-label="v2 bölmələri">
            {sekmeler.map((sekme) => (
              <button
                key={sekme.id}
                type="button"
                aria-current={aktif === sekme.id ? 'page' : undefined}
                onClick={() => setSecili(sekme.id)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  aktif === sekme.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {sekme.ad}
              </button>
            ))}
          </nav>
        )}
        {durum === 'acik' && aktif === 'siparisler' && (
          <Suspense fallback={<p className="text-sm text-slate-400">Yüklənir…</p>}>
            <SiparisGirisi />
          </Suspense>
        )}
        {durum === 'acik' && aktif === 'kasa' && (
          <Suspense fallback={<p className="text-sm text-slate-400">Yüklənir…</p>}>
            <V2Kasa />
          </Suspense>
        )}
        {durum === 'acik' && aktif === 'kurlar' && <V2Kurlar />}
        {durum === 'acik' && aktif === 'ayarlar' && <V2Ayarlar />}
        {durum === 'acik' && aktif === null && (
          <p className="text-sm text-slate-400">Rolunuz üçün hələ v2 bölməsi yoxdur.</p>
        )}
      </main>
    </div>
  );
}
