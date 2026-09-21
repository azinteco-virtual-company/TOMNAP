import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiSession, setApiTenant, ApiError } from '../../src/lib/apiClient';
import {
  assignCourier,
  assignableCouriers,
  bindCourier,
  canAssignCourier,
  canManageCouriers,
  completeCourierTask,
  fetchCourierTasks,
  ordersForCourier,
  type CourierRecord,
  type CourierTask,
} from '../../src/lib/courierApi';
import { useAppStore } from '../../src/store/appStore';
import { KuryeCalismaAlani } from '../../src/components/KuryeCalismaAlani';
import { KuryeTeslimatMasasi } from '../../src/components/KuryeTeslimatMasasi';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const courier = (extra = {}): CourierRecord => ({
  id: 'courier-1',
  tenant_id: 'tenant-1',
  ad_soyad: 'Courier',
  telefon: null,
  bolge: 'Nərimanov',
  aktif: true,
  kullanici_id: 'user-1',
  aktif_paket_sayisi: 0,
  toplam_paket_sayisi: 0,
  toplam_tahsilat_bekleyen: 0,
  ...extra,
});
const task = (extra = {}): CourierTask => ({
  id: 'order-1',
  musteri_adi: 'Recipient',
  urun_aciklamasi: 'Parcel',
  adet: 1,
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
  kalan_tutar: 20,
  para_birimi: 'AZN',
  kurye_atama_surumu: 4,
  ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  useAppStore.getState().clearSession();
  setApiSession('csrf-courier', 'tenant-1');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  useAppStore.getState().clearSession();
  vi.unstubAllGlobals();
});

describe('Courier task API boundary', () => {
  it('does not load staff orders, firms or inbox for a restored courier session', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        basarili: true,
        kullanici: {
          id: 'user-1',
          adSoyad: 'Courier',
          email: 'courier@example.test',
          rol: 'BAKU_KURYE',
          tenantId: 'tenant-1',
        },
        csrfToken: 'csrf-courier',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
    );
    await useAppStore.getState().restoreSession();
    fetchMock.mockClear();
    await Promise.all([
      useAppStore.getState().siparisleriYukle(),
      useAppStore.getState().firmalariYukle(),
      useAppStore.getState().inboxSayisiGuncelle(),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json({ basarili: true, kurye: null, gorevler: [] }));
    await expect(fetchCourierTasks()).resolves.toMatchObject({ kurye: null, gorevler: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/kurye/gorevler');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin');
  });

  it('sends only assignment version and actual recipient, never financial or identity overrides', async () => {
    const original = task({
      toplam_tutar: 300,
      alinan_tutar: 0,
      finans_durumu: 'BEKLIYOR',
      tenant_id: 'forged',
      baku_kurye_id: 'other-courier',
    });
    fetchMock.mockResolvedValueOnce(
      json({
        basarili: true,
        gorev: { ...original, lojistik_durumu: 'TESLIM_EDILDI' },
        tekrar: false,
      })
    );
    await completeCourierTask(original, '  Receiver  ');
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/kurye/gorevler/order-1/teslim');
    expect(JSON.parse(request.body)).toEqual({ beklenen_atama_surumu: 4, teslim_alan: 'Receiver' });
    expect(request.headers.get('x-csrf-token')).toBe('csrf-courier');
    expect(request.headers.get('x-tenant-id')).toBe('tenant-1');
    expect(original.lojistik_durumu).toBe('BAKU_DAGITIM_ARKADAS');
    expect(original.kalan_tutar).toBe(20);
  });

  it('surfaces a reassignment conflict and never retries the delivery automatically', async () => {
    fetchMock.mockResolvedValueOnce(json({ hata: 'Sifariş başqa kuryeyə təyin edilib.' }, 409));
    const original = Object.freeze(task());
    await expect(completeCourierTask(original, 'Receiver')).rejects.toMatchObject({
      status: 409,
      message: 'Sifariş başqa kuryeyə təyin edilib.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(original.lojistik_durumu).toBe('BAKU_DAGITIM_ARKADAS');
  });

  it('discards a courier response after the session or selected tenant changes', async () => {
    let finish: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = fetchCourierTasks();
    setApiTenant('other-tenant');
    finish!(json({ basarili: true, kurye: courier(), gorevler: [task()] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Explicit staff courier assignment', () => {
  it('never treats address or region similarity as order ownership', () => {
    const orders = [
      { id: 'assigned', baku_kurye_id: 'courier-1', teslimat_adresi: 'Elsewhere' },
      { id: 'legacy-region-match', teslimat_adresi: 'Nərimanov Gənclik' },
      { id: 'other-courier', baku_kurye_id: 'courier-2', teslimat_adresi: 'Nərimanov' },
    ] as any;
    expect(ordersForCourier(orders, 'courier-1').map((order) => order.id)).toEqual(['assigned']);
    expect(
      assignableCouriers([
        courier(),
        courier({ id: 'unbound', kullanici_id: null }),
        courier({ id: 'disabled', aktif: false }),
      ]).map((item) => item.id)
    ).toEqual(['courier-1']);
  });

  it('uses the dedicated assignment endpoint with the server version including legacy zero', async () => {
    fetchMock.mockImplementation(async () => json({ basarili: true, siparis: {}, tekrar: false }));
    await assignCourier({ id: 'order-1' }, 'courier-1');
    await assignCourier({ id: 'order-1', kurye_atama_surumu: 5 }, null);
    expect(fetchMock.mock.calls.map(([url, request]) => [url, JSON.parse(request.body)])).toEqual([
      ['/api/siparisler/order-1/kurye', { kurye_id: 'courier-1', beklenen_atama_surumu: 0 }],
      ['/api/siparisler/order-1/kurye', { kurye_id: null, beklenen_atama_surumu: 5 }],
    ]);
  });

  it('binds an explicit user id and supplies the previous binding to prevent lost updates', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ basarili: true, kurye: courier({ kullanici_id: 'user-2' }) })
    );
    await bindCourier(courier(), 'user-2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/kuryeler/courier-1/kullanici');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      kullanici_id: 'user-2',
      beklenen_kullanici_id: 'user-1',
    });
    expect(canManageCouriers('BAKU_KURYE')).toBe(false);
    expect(canManageCouriers('KANADA_SATINALMA')).toBe(false);
    expect(canAssignCourier('KANADA_SATINALMA')).toBe(true);
    expect(canAssignCourier('SATIS_SORUMLUSU')).toBe(false);
  });

  it('keeps courier navigation minimal and requires one selected company for management', () => {
    const html = renderToString(
      React.createElement(KuryeCalismaAlani, { userName: 'Courier', onLogout: vi.fn() })
    );
    expect(html).toContain('Çatdırılma tapşırıqlarım');
    expect(html).not.toContain('Müştəri idarəetməsi');
    expect(html).not.toContain('PDF');
    expect(html).not.toContain('Tahsil Et');
    const staff = renderToString(
      React.createElement(KuryeTeslimatMasasi, {
        siparisler: [],
        seciliKuryeId: '',
        onKuryeDegistir: vi.fn(),
        kullaniciRolu: 'SUPER_ADMIN',
        seciliFirmaId: 'all',
      })
    );
    expect(staff).toContain('bir butik seçin');
    expect(staff).not.toContain('Elvin');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
