import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Package, Plus, RefreshCw, Truck } from 'lucide-react';
import type { KullaniciRolu, Siparis } from '../types';
import { ApiError, getApiContextVersion } from '../lib/apiClient';
import {
  bindCourier,
  canManageCouriers,
  createCourier,
  fetchCourierRoster,
  ordersForCourier,
  type CourierRecord,
  type CourierRoster,
} from '../lib/courierApi';

interface Props {
  siparisler: Siparis[];
  seciliKuryeId: string;
  onKuryeDegistir: (id: string) => void;
  onSiparisDetayAc?: (siparis: Siparis) => void;
  kullaniciRolu?: KullaniciRolu;
  seciliFirmaId?: string;
  seciliFirmaAd?: string;
  onSiparisleriYukle?: (tenant?: string) => Promise<void> | void;
}

function BindingRow({
  courier,
  roster,
  disabled,
  onBind,
}: {
  courier: CourierRecord;
  roster: CourierRoster;
  disabled: boolean;
  onBind: (courier: CourierRecord, userId: string | null) => void;
}) {
  const [selected, setSelected] = useState(courier.kullanici_id || '');
  useEffect(() => setSelected(courier.kullanici_id || ''), [courier.kullanici_id]);
  const users = roster.atanabilir_kullanicilar || [];
  const currentMissing =
    courier.kullanici_id && !users.some((user) => user.id === courier.kullanici_id);
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <label
        htmlFor={`binding-${courier.id}`}
        className="block text-xs font-semibold text-slate-700"
      >
        Giriş edə bilən kuryer hesabı
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          id={`binding-${courier.id}`}
          value={selected}
          disabled={disabled}
          onChange={(event) => setSelected(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">Hesaba bağlanmayıb</option>
          {currentMissing && (
            <option value={courier.kullanici_id!}>
              Mövcud hesab aktiv kuryer siyahısında deyil
            </option>
          )}
          {users.map((user) => {
            const otherBinding = roster.kuryeler.find(
              (item) => item.id !== courier.id && item.kullanici_id === user.id
            );
            return (
              <option key={user.id} value={user.id} disabled={!!otherBinding || !courier.aktif}>
                {user.ad_soyad} · {user.email}
                {otherBinding ? ` (${otherBinding.ad_soyad} qeydinə bağlıdır)` : ''}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          disabled={
            disabled || (!!selected && !courier.aktif) || selected === (courier.kullanici_id || '')
          }
          onClick={() => onBind(courier, selected || null)}
          className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Bağı saxla
        </button>
      </div>
    </div>
  );
}

export const KuryeTeslimatMasasi: React.FC<Props> = ({
  siparisler,
  seciliKuryeId,
  onKuryeDegistir,
  onSiparisDetayAc,
  kullaniciRolu,
  seciliFirmaId,
  seciliFirmaAd,
  onSiparisleriYukle,
}) => {
  const [roster, setRoster] = useState<CourierRoster | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [query, setQuery] = useState('');
  const mounted = useRef(false);
  const generation = useRef(0);
  const concreteTenant = !!seciliFirmaId && seciliFirmaId !== 'all';
  const canManage = canManageCouriers(kullaniciRolu);

  async function load(signal?: AbortSignal) {
    if (!concreteTenant) return;
    const requestId = ++generation.current;
    setRoster(null);
    setLoading(true);
    setError('');
    try {
      const result = await fetchCourierRoster(signal);
      if (!mounted.current || requestId !== generation.current) return;
      setRoster(result);
      if (
        seciliKuryeId &&
        seciliKuryeId !== 'unassigned' &&
        !result.kuryeler.some((courier) => courier.id === seciliKuryeId)
      )
        onKuryeDegistir('');
    } catch (failure) {
      if (mounted.current && requestId === generation.current && !signal?.aborted)
        setError(failure instanceof Error ? failure.message : 'Kuryer siyahısı yüklənmədi.');
    } finally {
      if (mounted.current && requestId === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    setRoster(null);
    setError('');
    setNotice('');
    setName('');
    setPhone('');
    setRegion('');
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [seciliFirmaId]);
  useEffect(() => {
    const controller = new AbortController();
    // Assignment/delivery responses update the orders prop. Re-read counters
    // from the server at that point so roster totals match the saved assignment.
    void load(controller.signal);
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [seciliFirmaId, siparisler]);

  async function mutate(operation: () => Promise<unknown>, message: string) {
    if (saving) return;
    const context = getApiContextVersion();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await operation();
      if (!mounted.current || context !== getApiContextVersion()) return;
      await load();
      if (!mounted.current || context !== getApiContextVersion()) return;
      setNotice(message);
      setName('');
      setPhone('');
      setRegion('');
    } catch (failure) {
      if (!mounted.current || context !== getApiContextVersion()) return;
      setError(failure instanceof Error ? failure.message : 'Dəyişiklik saxlanılmadı.');
      if (failure instanceof ApiError && [403, 404, 409].includes(failure.status)) setRoster(null);
    } finally {
      if (mounted.current && context === getApiContextVersion()) setSaving(false);
    }
  }
  const orders = useMemo(() => {
    const tenantOrders = siparisler.filter((order) => order.tenant_id === seciliFirmaId);
    const assigned =
      seciliKuryeId && seciliKuryeId !== 'unassigned'
        ? ordersForCourier(tenantOrders, seciliKuryeId)
        : tenantOrders;
    return assigned.filter((order) => {
      const known = roster?.kuryeler.some((courier) => courier.id === order.baku_kurye_id);
      if (seciliKuryeId === 'unassigned' && known) return false;
      return `${order.musteri_adi} ${order.urun_aciklamasi}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    });
  }, [siparisler, seciliFirmaId, roster, seciliKuryeId, query]);

  if (!concreteTenant)
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold">Kuryer idarəetməsi</h2>
        <p className="mt-2 text-sm text-slate-600">
          Kuryer hesablarını və sifariş təyinatlarını idarə etmək üçün yuxarıdan bir butik seçin.
        </p>
      </section>
    );
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <Truck className="h-8 w-8 text-indigo-600" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">Kuryerlər və sifariş təyinatları</h2>
            <p className="mt-1 text-sm text-slate-600">{seciliFirmaAd || seciliFirmaId}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => {
            setNotice('');
            void load();
            void onSiparisleriYukle?.(seciliFirmaId);
          }}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Yenilə
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          {error} Siyahını yeniləyib yenidən yoxlayın.
        </p>
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
        <p role="status" className="p-4 text-sm text-slate-600">
          Kuryer qeydləri yüklənir…
        </p>
      )}
      {roster && (
        <>
          {canManage && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold">Yeni kuryer qeydi</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Əvvəl kuryer qeydini yaradın, sonra bu butikdə aktiv olan kuryer hesabına bağlayın.
                Hesab yoxdursa, komanda dəvəti ilə yaradın.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    () =>
                      createCourier({
                        ad_soyad: name.trim(),
                        telefon: phone.trim(),
                        bolge: region.trim(),
                      }),
                    'Kuryer qeydi yaradıldı. İndi giriş hesabını seçin.'
                  );
                }}
                className="mt-4 grid gap-3 sm:grid-cols-3"
              >
                <label className="text-sm font-semibold">
                  Ad və soyad
                  <input
                    required
                    maxLength={150}
                    value={name}
                    disabled={saving}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Telefon
                  <input
                    maxLength={50}
                    value={phone}
                    disabled={saving}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Bölgə
                  <input
                    maxLength={150}
                    value={region}
                    disabled={saving}
                    onChange={(event) => setRegion(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                </label>
                <button
                  disabled={saving || !name.trim()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Kuryer qeydi yarat
                </button>
              </form>
            </div>
          )}
          {roster.kuryeler.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              Bu butik üçün kuryer qeydi yoxdur.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {roster.kuryeler.map((courier) => (
                <article
                  key={courier.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{courier.ad_soyad}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {[courier.bolge, courier.telefon].filter(Boolean).join(' · ') ||
                          'Əlavə məlumat yoxdur'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${courier.aktif && courier.kullanici_id ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
                    >
                      {!courier.aktif
                        ? 'Passiv'
                        : courier.kullanici_id
                          ? 'Hesaba bağlıdır'
                          : 'Hesab bağlanmayıb'}
                    </span>
                  </div>
                  <p className="my-3 flex items-center gap-2 text-sm text-slate-600">
                    <Package className="h-4 w-4" aria-hidden="true" />
                    {courier.aktif_paket_sayisi} gözləyən · {courier.toplam_paket_sayisi} təyin
                    edilmiş sifariş
                  </p>
                  {canManage && (
                    <BindingRow
                      courier={courier}
                      roster={roster}
                      disabled={saving || loading}
                      onBind={(item, userId) =>
                        void mutate(
                          () => bindCourier(item, userId),
                          userId ? 'Kuryer hesabı bağlandı.' : 'Kuryer hesabının bağı silindi.'
                        )
                      }
                    />
                  )}
                </article>
              ))}
            </div>
          )}
          {(roster.eslenmemis_siparisler?.length || 0) > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <Link2 className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {roster.eslenmemis_siparisler.length} köhnə təyinat mövcud kuryer qeydi ilə
              uyğunlaşmır. Sifariş detalından kuryeri açıq şəkildə təyin edin.
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 font-bold">Sifariş təyinatları</h3>
            <div className="mb-4 flex flex-wrap gap-3">
              <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">
                Kuryer filtri
                <select
                  value={seciliKuryeId}
                  onChange={(event) => onKuryeDegistir(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="">Bütün təyinatlar</option>
                  <option value="unassigned">Təyin edilməyən / köhnə qeyd</option>
                  {roster.kuryeler.map((courier) => (
                    <option key={courier.id} value={courier.id}>
                      {courier.ad_soyad}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">
                Sifariş axtar
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Müştəri və ya məhsul"
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
                />
              </label>
            </div>
            {orders.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-600">Bu filtrdə sifariş yoxdur.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const courier = roster.kuryeler.find((item) => item.id === order.baku_kurye_id);
                  return (
                    <li key={order.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{order.musteri_adi}</p>
                        <p className="truncate text-sm text-slate-600">{order.urun_aciklamasi}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {courier?.ad_soyad ||
                            (order.baku_kurye_id
                              ? 'Uyğunlaşmayan köhnə təyinat'
                              : 'Kuryer təyin edilməyib')}{' '}
                          ·{' '}
                          {order.lojistik_durumu === 'TESLIM_EDILDI'
                            ? 'Təhvil verilib'
                            : 'Təhvil gözləyir'}
                        </p>
                      </div>
                      {onSiparisDetayAc && (
                        <button
                          type="button"
                          onClick={() => onSiparisDetayAc(order)}
                          className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                        >
                          Sifariş detalı
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
};
