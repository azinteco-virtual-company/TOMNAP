import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import { rolGrubunda } from '../../shared/roller';
import V2Kurlar from './V2Kurlar';
import V2Ayarlar from './V2Ayarlar';
import { v2ButikSecimi } from './butikSecimi';

// Sipariş girişi kendi parçasında: kabuk açılınca değil, sekme seçilince yüklenir.
const SiparisGirisi = lazy(() => import('./SiparisGirisi'));
const V2Kasa = lazy(() => import('./V2Kasa'));
const KacaklarPanosu = lazy(() => import('./KacaklarPanosu'));

type SunucuDurumu = 'yukleniyor' | 'acik' | 'kapali' | 'hata';
type Sekme = 'siparisler' | 'kasa' | 'kacaklar' | 'kurlar' | 'ayarlar';

/**
 * v2 kabuğu (VITE_FF_V2_FLOW). Ayrı bir parça olarak yüklenir; bayrak kapalıyken
 * derlemeye hiç girmez. Sekmeler sunucudaki allowlist ile aynı gruplardan açılır:
 * siparişler STAFF (form yalnız SALES), kasa FINANCE, kaçaklar KASA (Q4, Q5), kurlar RATES,
 * ayarlar OWNERS.
 */
export default function V2Kabuk() {
  const navigate = useNavigate();
  const aktifRol = useAppStore((state) => state.aktifRol);
  const firmalar = useAppStore((state) => state.firmalar);
  const seciliFirmaId = useAppStore((state) => state.seciliFirmaId);
  const setSeciliFirmaId = useAppStore((state) => state.setSeciliFirmaId);
  // Platform admin: the v1 boutique list and mechanism; v2 data needs one boutique.
  const butik = v2ButikSecimi(aktifRol, seciliFirmaId, firmalar);
  const [durum, setDurum] = useState<SunucuDurumu>('yukleniyor');
  const sekmeler: Array<{ id: Sekme; ad: string }> = [
    ...(rolGrubunda(aktifRol, 'STAFF') ? [{ id: 'siparisler' as const, ad: 'Sifarişlər' }] : []),
    ...(rolGrubunda(aktifRol, 'FINANCE') ? [{ id: 'kasa' as const, ad: 'Kassa' }] : []),
    ...(rolGrubunda(aktifRol, 'KASA') ? [{ id: 'kacaklar' as const, ad: 'Qaçaqlar' }] : []),
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
        {butik.secici && (
          <label className="text-xs text-slate-400">
            Butik
            <select
              value={butik.secimGerekli ? '' : seciliFirmaId}
              onChange={(event) => event.target.value && setSeciliFirmaId(event.target.value)}
              className="ml-2 rounded-lg bg-slate-800 px-2 py-1.5 text-sm text-white"
            >
              <option value="" disabled>
                Butik seçin
              </option>
              {butik.secenekler.map((firma) => (
                <option key={firma.id} value={firma.id}>
                  {firma.ad}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => navigate('/app')}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Mövcud panelə qayıt
        </button>
      </header>
      {/* A new boutique remounts every screen, so each one reads its own data again. */}
      <main key={seciliFirmaId} className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {durum !== 'acik' && (
          <p role="status" className="text-sm text-slate-300">
            {durum === 'yukleniyor'
              ? 'Server yoxlanılır…'
              : durum === 'kapali'
                ? 'Serverdə v2 axını aktiv deyil (FF_V2_FLOW).'
                : 'Server v2 vəziyyəti yoxlanıla bilmədi.'}
          </p>
        )}
        {durum === 'acik' && butik.secimGerekli && (
          <p role="status" className="text-sm text-slate-300">
            v2 məlumatı bir butikə aiddir. Davam etmək üçün yuxarıdan butik seçin.
          </p>
        )}
        {durum === 'acik' && !butik.secimGerekli && sekmeler.length > 1 && (
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
        {durum === 'acik' && !butik.secimGerekli && aktif === 'siparisler' && (
          <Suspense fallback={<p className="text-sm text-slate-400">Yüklənir…</p>}>
            <SiparisGirisi />
          </Suspense>
        )}
        {durum === 'acik' && !butik.secimGerekli && aktif === 'kasa' && (
          <Suspense fallback={<p className="text-sm text-slate-400">Yüklənir…</p>}>
            <V2Kasa />
          </Suspense>
        )}
        {durum === 'acik' && !butik.secimGerekli && aktif === 'kacaklar' && (
          <Suspense fallback={<p className="text-sm text-slate-400">Yüklənir…</p>}>
            <KacaklarPanosu />
          </Suspense>
        )}
        {durum === 'acik' && !butik.secimGerekli && aktif === 'kurlar' && <V2Kurlar />}
        {durum === 'acik' && !butik.secimGerekli && aktif === 'ayarlar' && <V2Ayarlar />}
        {durum === 'acik' && !butik.secimGerekli && aktif === null && (
          <p className="text-sm text-slate-400">Rolunuz üçün hələ v2 bölməsi yoxdur.</p>
        )}
      </main>
    </div>
  );
}
