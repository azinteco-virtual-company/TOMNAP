import { apiFetch } from './apiClient';
import type { KullaniciRolu, Siparis } from '../types';

export interface CourierRecord {
  id: string;
  tenant_id: string;
  ad_soyad: string;
  telefon: string | null;
  bolge: string | null;
  aktif: boolean;
  kullanici_id: string | null;
  aktif_paket_sayisi: number;
  toplam_paket_sayisi: number;
  toplam_tahsilat_bekleyen: number;
}
export interface CourierRoster {
  basarili: boolean;
  kuryeler: CourierRecord[];
  atanabilir_kullanicilar?: { id: string; ad_soyad: string; email: string }[];
  eslenmemis_siparisler: { id: string; baku_kurye_id: string | null }[];
}
export interface CourierTask {
  id: string;
  musteri_adi: string;
  telefon_numarasi?: string | null;
  teslimat_sehri?: string | null;
  teslimat_adresi?: string | null;
  urun_aciklamasi: string;
  adet: number;
  lojistik_durumu: 'BAKU_DAGITIM_ARKADAS' | 'TESLIM_EDILDI';
  kalan_tutar: number;
  para_birimi: string;
  kurye_atama_surumu: number;
  teslim_tarihi?: string | null;
  teslim_alan?: string | null;
}
export interface CourierTasks {
  basarili: boolean;
  kurye: { id: string; ad_soyad: string; bolge: string | null } | null;
  gorevler: CourierTask[];
}

export const canManageCouriers = (role: KullaniciRolu | null | undefined) =>
  role === 'PATRON' || role === 'SUPER_ADMIN';
export const canAssignCourier = (role: KullaniciRolu | null | undefined) =>
  canManageCouriers(role) || role === 'KANADA_SATINALMA';
export const assignableCouriers = (couriers: CourierRecord[]) =>
  couriers.filter((courier) => courier.aktif && !!courier.kullanici_id);
export const ordersForCourier = (orders: Siparis[], courierId: string) =>
  orders.filter((order) => order.baku_kurye_id === courierId);

async function post<T>(path: string, body: unknown): Promise<T> {
  return (
    await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  ).json();
}
export async function fetchCourierRoster(signal?: AbortSignal): Promise<CourierRoster> {
  return (await apiFetch('/api/kuryeler', { signal })).json();
}
export async function fetchCourierTasks(signal?: AbortSignal): Promise<CourierTasks> {
  return (await apiFetch('/api/kurye/gorevler', { signal })).json();
}
export function createCourier(details: { ad_soyad: string; telefon: string; bolge: string }) {
  return post<{ basarili: boolean; kurye: CourierRecord }>('/api/kuryeler', details);
}
export function bindCourier(courier: CourierRecord, userId: string | null) {
  return post<{ basarili: boolean; kurye: CourierRecord }>(
    `/api/kuryeler/${encodeURIComponent(courier.id)}/kullanici`,
    {
      kullanici_id: userId,
      beklenen_kullanici_id: courier.kullanici_id ?? null,
    }
  );
}
export function assignCourier(
  order: Pick<Siparis, 'id' | 'kurye_atama_surumu'>,
  courierId: string | null
) {
  return post<{ basarili: boolean; siparis: Siparis; tekrar: boolean }>(
    `/api/siparisler/${encodeURIComponent(order.id)}/kurye`,
    {
      kurye_id: courierId,
      beklenen_atama_surumu: order.kurye_atama_surumu ?? 0,
    }
  );
}
export function completeCourierTask(task: CourierTask, recipient: string) {
  return post<{ basarili: boolean; gorev: CourierTask; tekrar: boolean }>(
    `/api/kurye/gorevler/${encodeURIComponent(task.id)}/teslim`,
    {
      beklenen_atama_surumu: task.kurye_atama_surumu,
      teslim_alan: recipient.trim(),
    }
  );
}
