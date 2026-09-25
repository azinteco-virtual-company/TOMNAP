import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, LogOut, Package, Phone, RefreshCw, Truck } from 'lucide-react';
import { ApiError, getApiContextVersion } from '../lib/apiClient';
import { V2_FLOW_ENABLED } from '../lib/featureFlags';
import {
  completeCourierTask,
  fetchCourierTasks,
  type CourierTask,
  type CourierTasks,
} from '../lib/courierApi';

// A11 (VITE_FF_V2_FLOW): the courier's own cash for v2 orders, in its own chunk.
// With the flag off the import is dropped from the build.
const KuryeNakitBolumu = V2_FLOW_ENABLED ? lazy(() => import('./v2/KuryeNakitBolumu')) : null;

interface Props {
  userName: string;
  onLogout: () => Promise<void> | void;
}

export const KuryeCalismaAlani: React.FC<Props> = ({ userName, onLogout }) => {
  const [data, setData] = useState<CourierTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'pending' | 'completed'>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);

  async function load(signal?: AbortSignal) {
    const requestId = ++generation.current;
    setLoading(true);
    setError('');
    setNotice('');
    setSelected(null);
    setRecipient('');
    setData(null);
    try {
      const result = await fetchCourierTasks(signal);
      if (mounted.current && requestId === generation.current) setData(result);
    } catch (failure) {
      if (mounted.current && requestId === generation.current && !signal?.aborted) {
        setError(failure instanceof Error ? failure.message : 'Tapşırıqlar yüklənmədi.');
      }
    } finally {
      if (mounted.current && requestId === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      generation.current++;
      controller.abort();
    };
  }, []);

  async function complete(task: CourierTask) {
    if (!recipient.trim() || saving) return;
    const context = getApiContextVersion();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await completeCourierTask(task, recipient);
      if (!mounted.current || context !== getApiContextVersion()) return;
      setData((current) =>
        current
          ? {
              ...current,
              gorevler: current.gorevler.map((item) => (item.id === task.id ? result.gorev : item)),
            }
          : current
      );
      setSelected(null);
      setRecipient('');
      setNotice(
        result.tekrar ? 'Bu təhvil artıq serverdə qeydə alınıb.' : 'Təhvil serverdə qeydə alındı.'
      );
    } catch (failure) {
      if (!mounted.current || context !== getApiContextVersion()) return;
      setError(
        failure instanceof Error ? failure.message : 'Təhvil qeydə alınmadı. Siyahını yeniləyin.'
      );
      // A reassignment or permission conflict invalidates the displayed work list.
      if (failure instanceof ApiError && [403, 404, 409].includes(failure.status)) setData(null);
      setSelected(null);
    } finally {
      if (mounted.current && context === getApiContextVersion()) setSaving(false);
    }
  }

  const tasks = useMemo(
    () =>
      (data?.gorevler || []).filter((task) =>
        filter === 'completed'
          ? task.lojistik_durumu === 'TESLIM_EDILDI'
          : task.lojistik_durumu !== 'TESLIM_EDILDI'
      ),
    [data, filter]
  );
  const pending =
    data?.gorevler.filter((task) => task.lojistik_durumu !== 'TESLIM_EDILDI').length || 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Truck className="h-8 w-8 text-indigo-600" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-500">TOMNAP</p>
              <h1 className="text-xl font-bold">Çatdırılma tapşırıqlarım</h1>
              <p className="text-sm text-slate-600">{userName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Çıxış
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{data?.kurye?.ad_soyad || 'Kuryer hesabı'}</h2>
            {data?.kurye?.bolge && <p className="text-sm text-slate-600">{data.kurye.bolge}</p>}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Yenilə
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          >
            {error} Siyahını yeniləyərək serverdəki son vəziyyəti yoxlayın.
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            {notice}
          </p>
        )}
        {loading && (
          <p role="status" className="py-12 text-center text-slate-600">
            Tapşırıqlar yüklənir…
          </p>
        )}
        {!loading && data && !data.kurye && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Hesabınız hələ kuryer qeydinə bağlanmayıb</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Butik rəhbəri hesabınızı kuryer qeydinə bağlayıb sifarişləri təyin etdikdən sonra
              tapşırıqlar burada görünəcək.
            </p>
          </div>
        )}
        {!loading && data?.kurye && KuryeNakitBolumu && (
          <Suspense fallback={null}>
            <KuryeNakitBolumu />
          </Suspense>
        )}
        {!loading && data?.kurye && (
          <>
            <div className="flex gap-2" aria-label="Tapşırıq filtri">
              <button
                type="button"
                aria-pressed={filter === 'pending'}
                onClick={() => setFilter('pending')}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${filter === 'pending' ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'}`}
              >
                Gözləyən ({pending})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'completed'}
                onClick={() => setFilter('completed')}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${filter === 'completed' ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'}`}
              >
                Təhvil verilən
              </button>
            </div>
            {tasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Package className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" />
                <p>Bu siyahıda sizə təyin edilmiş tapşırıq yoxdur.</p>
              </div>
            )}
            {tasks.map((task) => (
              <article
                key={task.id}
                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{task.musteri_adi}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {task.urun_aciklamasi} · {task.adet} ədəd
                    </p>
                  </div>
                  {task.lojistik_durumu === 'TESLIM_EDILDI' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Təhvil verilib
                    </span>
                  )}
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-medium">
                    {[task.teslimat_sehri, task.teslimat_adresi].filter(Boolean).join(', ') ||
                      'Ünvan göstərilməyib'}
                  </p>
                  {task.telefon_numarasi && (
                    <a
                      href={`tel:${task.telefon_numarasi.replace(/[^+0-9]/g, '')}`}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-indigo-700"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {task.telefon_numarasi}
                    </a>
                  )}
                </div>
                <p className="text-sm text-slate-600">
                  Qalıq məbləğ:{' '}
                  <strong className="text-slate-900">
                    {Number(task.kalan_tutar).toFixed(2)} {task.para_birimi}
                  </strong>
                  . Təhvil təsdiqi ödəniş məbləğini dəyişmir.
                </p>
                {task.lojistik_durumu === 'TESLIM_EDILDI' ? (
                  <p className="text-sm text-emerald-800">
                    Təhvil alan: {task.teslim_alan || 'Qeydə alınıb'}
                    {task.teslim_tarihi
                      ? ` · ${new Date(task.teslim_tarihi).toLocaleString('az-AZ')}`
                      : ''}
                  </p>
                ) : selected === task.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void complete(task);
                    }}
                    className="space-y-3 border-t border-slate-100 pt-4"
                  >
                    <label htmlFor={`recipient-${task.id}`} className="block text-sm font-semibold">
                      Bağlamanı təhvil alanın adı
                    </label>
                    <input
                      id={`recipient-${task.id}`}
                      required
                      maxLength={150}
                      autoComplete="off"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      disabled={saving}
                      className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={saving || !recipient.trim()}
                        className="min-h-11 rounded-lg bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50"
                      >
                        {saving ? 'Saxlanılır…' : 'Təhvil verildiyini təsdiqlə'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setSelected(null)}
                        className="min-h-11 rounded-lg border border-slate-300 px-4"
                      >
                        Vaz keç
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSelected(task.id);
                      setRecipient('');
                    }}
                    className="min-h-11 rounded-lg bg-indigo-600 px-4 font-semibold text-white disabled:opacity-50"
                  >
                    Təhvil verildi
                  </button>
                )}
              </article>
            ))}
          </>
        )}
      </div>
    </main>
  );
};
