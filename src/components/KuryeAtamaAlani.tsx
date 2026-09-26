import React, { useEffect, useRef, useState } from 'react';
import { ApiError, getApiContextVersion } from '../lib/apiClient';
import {
  assignCourier,
  assignableCouriers,
  canAssignCourier,
  fetchCourierRoster,
  type CourierRoster,
} from '../lib/courierApi';
import type { KullaniciRolu, Siparis } from '../types';

interface Props {
  order: Siparis;
  role: KullaniciRolu | null;
  tenantId: string;
  onSaved: (order: Siparis) => void;
  onRefresh: () => Promise<void>;
}
export const KuryeAtamaAlani: React.FC<Props> = ({ order, role, tenantId, onSaved, onRefresh }) => {
  const [roster, setRoster] = useState<CourierRoster | null>(null);
  const [selected, setSelected] = useState(order.baku_kurye_id || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const authorized = canAssignCourier(role);
  const sameTenant = !!tenantId && tenantId !== 'all' && order.tenant_id === tenantId;

  async function load(signal?: AbortSignal) {
    if (!authorized || !sameTenant) return;
    const id = ++requestId.current;
    setLoading(true);
    setRoster(null);
    setError('');
    try {
      const result = await fetchCourierRoster(signal);
      if (mounted.current && id === requestId.current) setRoster(result);
    } catch (failure) {
      if (mounted.current && id === requestId.current && !signal?.aborted)
        setError(failure instanceof Error ? failure.message : 'Kuryerlər yüklənmədi.');
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      requestId.current++;
      controller.abort();
    };
  }, [order.id, tenantId, role]);
  useEffect(() => {
    setSelected(order.baku_kurye_id || '');
  }, [order.id, order.baku_kurye_id, order.kurye_atama_surumu]);

  async function save() {
    if (saving || !roster || !sameTenant) return;
    const context = getApiContextVersion();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await assignCourier(order, selected || null);
      if (!mounted.current || context !== getApiContextVersion()) return;
      onSaved(result.siparis);
      setNotice(
        result.tekrar ? 'Bu təyinat artıq serverdə saxlanılıb.' : 'Kuryer təyinatı saxlanıldı.'
      );
    } catch (failure) {
      if (!mounted.current || context !== getApiContextVersion()) return;
      setError(failure instanceof Error ? failure.message : 'Təyinat saxlanılmadı.');
      if (failure instanceof ApiError && [403, 404, 409].includes(failure.status)) setRoster(null);
    } finally {
      if (mounted.current && context === getApiContextVersion()) setSaving(false);
    }
  }
  async function refresh() {
    const context = getApiContextVersion();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await onRefresh();
      if (!mounted.current || context !== getApiContextVersion()) return;
      await load();
    } catch (failure) {
      if (mounted.current && context === getApiContextVersion()) {
        setRoster(null);
        setLoading(false);
        setError(failure instanceof Error ? failure.message : 'Sifariş yenilənmədi.');
      }
    }
  }

  if (!authorized)
    return (
      <p className="text-sm text-slate-600">
        Kuryer: {order.baku_kurye_adi || (order.baku_kurye_id ? 'Təyin edilib' : 'Təyin edilməyib')}
      </p>
    );
  if (!sameTenant)
    return (
      <p className="text-sm text-amber-900">
        Kuryer təyin etmək üçün sifarişin butikini yuxarıdan seçin.
      </p>
    );
  const options = assignableCouriers(roster?.kuryeler || []);
  const previousUnavailable =
    order.baku_kurye_id && !options.some((courier) => courier.id === order.baku_kurye_id);
  const delivered = order.lojistik_durumu === 'TESLIM_EDILDI';
  return (
    <div className="space-y-2">
      <label htmlFor={`assign-${order.id}`} className="block text-xs font-semibold text-slate-700">
        Təyin edilmiş kuryer
      </label>
      <select
        id={`assign-${order.id}`}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={loading || saving || !roster || delivered}
        className="min-h-11 w-full rounded-lg border border-purple-300 bg-white px-3 text-sm disabled:opacity-60"
      >
        <option value="">Kuryer təyin edilməyib</option>
        {previousUnavailable && (
          <option value={order.baku_kurye_id} disabled>
            Mövcud təyinat aktiv hesaba bağlı deyil
          </option>
        )}
        {options.map((courier) => (
          <option key={courier.id} value={courier.id}>
            {courier.ad_soyad}
            {courier.bolge ? ` · ${courier.bolge}` : ''}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-slate-600">
        {delivered
          ? 'Təhvil verilmiş sifarişin təyinatı dəyişdirilmir.'
          : 'Yalnız aktiv kuryer hesabına bağlanmış qeydlər seçilə bilər. Hesab bağlantıları kuryer idarəetməsində qurulur.'}
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-900">
          {error} Sifarişi yeniləyib son təyinatı yoxlayın.
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-emerald-800">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={
            loading || saving || !roster || delivered || selected === (order.baku_kurye_id || '')
          }
          className="min-h-11 rounded-lg bg-purple-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saxlanılır…' : 'Kuryer təyinatını saxla'}
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || saving}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold disabled:opacity-50"
        >
          {loading ? 'Yüklənir…' : 'Sifarişi yenilə'}
        </button>
      </div>
    </div>
  );
};
