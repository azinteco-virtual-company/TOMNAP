import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR, IS_PRODUCTION, SUPABASE_URL } from '../config';
import { supabase } from './supabase';
import { readJsonFile, writeJsonAtomic } from './atomicJson';
import { PublicResourceError } from './publicFetch';
import {
  kullanicilarVeritabani,
  firmalarVeritabani,
  siparislerVeritabani,
  demoSiparislerVeritabani,
} from './state';
import { formatlaSiparis } from './siparisFormatlama';

export interface CourierRecord {
  id: string;
  tenant_id: string;
  ad_soyad: string;
  telefon: string;
  bolge: string;
  aktif: boolean;
  kullanici_id: string | null;
  olusturma_tarihi: string;
}
const localFile = path.join(DATA_DIR, 'couriers.json');
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function validRecords(value: unknown): value is CourierRecord[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  const users = new Set<string>();
  return value.every((row) => {
    if (
      !object(row) ||
      !['id', 'tenant_id', 'ad_soyad', 'telefon', 'bolge', 'olusturma_tarihi'].every(
        (key) => typeof row[key] === 'string'
      ) ||
      !row.id ||
      !row.tenant_id ||
      row.tenant_id === 'all' ||
      typeof row.aktif !== 'boolean' ||
      (row.kullanici_id !== null && (typeof row.kullanici_id !== 'string' || !row.kullanici_id)) ||
      ids.has(row.id as string) ||
      (row.kullanici_id && users.has(row.kullanici_id as string))
    )
      return false;
    ids.add(row.id as string);
    if (row.kullanici_id) users.add(row.kullanici_id as string);
    return true;
  });
}
function localRecords() {
  if (IS_PRODUCTION || SUPABASE_URL)
    throw new PublicResourceError('Kurye veritabanı kullanılamıyor.', 503);
  return readJsonFile(localFile, validRecords) || [];
}
function scope(tenant: string) {
  if (!tenant || tenant === 'all') throw new PublicResourceError('Bir butik seçilmelidir.', 400);
}
function localOrders(tenant: string) {
  return tenant === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
}
function activeLocalUser(tenant: string, id: string) {
  const user = kullanicilarVeritabani.find(
    (u) => u.id === id && u.tenant_id === tenant && u.rol === 'BAKU_KURYE' && u.durum === 'AKTIF'
  );
  const company = firmalarVeritabani.find((f) => f.id === tenant && f.onayDurumu === 'AKTIF');
  if (!user || !company) throw new PublicResourceError('Aktif kurye kullanıcısı bulunamadı.', 404);
  return user;
}
function rpcError(error: any): never {
  const status =
    error?.code === 'PT404'
      ? 404
      : ['PT409', '23505'].includes(error?.code)
        ? 409
        : ['PT400', '22023', '22P02'].includes(error?.code)
          ? 400
          : error?.code === 'PT403'
            ? 403
            : 503;
  throw new PublicResourceError(
    status === 409
      ? 'Kayıt değişti veya bu kullanıcı zaten başka kuryeye bağlı. Listeyi yenileyin.'
      : status === 404
        ? 'Kurye veya görev bulunamadı.'
        : status === 400
          ? 'Geçersiz kurye işlemi.'
          : 'Kurye işlemi tamamlanamadı.',
    status
  );
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) rpcError(error);
  if (!data || typeof data !== 'object')
    throw new PublicResourceError('Kurye işlemi doğrulanamadı.', 503);
  return data;
}
export function deliveryTask(order: any) {
  // Do not spread an order here: this is the courier's complete PII contract.
  return {
    id: order.id,
    musteri_adi: order.musteri_adi,
    telefon_numarasi: order.telefon_numarasi || '',
    teslimat_sehri: order.teslimat_sehri || '',
    teslimat_adresi: order.teslimat_adresi || '',
    urun_aciklamasi: order.urun_aciklamasi,
    adet: Number(order.adet || 1),
    lojistik_durumu: order.lojistik_durumu,
    kalan_tutar: Number(
      order.kalan_tutar ??
        Math.max(0, Number(order.toplam_tutar || 0) - Number(order.alinan_tutar || 0))
    ),
    para_birimi: order.para_birimi || 'AZN',
    kurye_atama_surumu: Number(order.kurye_atama_surumu || 0),
    teslim_tarihi: order.teslim_tarihi || null,
    teslim_alan: order.kurye_teslim_alan || order.teslim_alan || null,
  };
}
function completeRows(result: { data: any[] | null; error: any; count?: number | null }) {
  if (result.error) rpcError(result.error);
  if (typeof result.count !== 'number' || !Array.isArray(result.data)) rpcError(null);
  // PostgREST may cap results. A partial roster would underreport assignments
  // and unknown legacy IDs, so never present truncated aggregates as complete.
  if (result.count !== result.data.length)
    throw new PublicResourceError('Kurye yönetimi listesi veritabanı yanıt sınırını aşıyor.', 409);
  return result.data;
}
export async function listCouriers(tenant: string, withUsers: boolean) {
  scope(tenant);
  let rows: CourierRecord[];
  let orders: any[];
  let users: any[] = [];
  if (supabase) {
    const result = await supabase
      .from('kuryeler')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant);
    rows = completeRows(result);
    const orderResult = await supabase
      .from('siparisler')
      .select('id,tenant_id,baku_kurye_id,lojistik_durumu,kalan_tutar', { count: 'exact' })
      .eq('tenant_id', tenant);
    orders = completeRows(orderResult);
    if (withUsers) {
      const userResult = await supabase
        .from('kullanicilar')
        .select('id,ad_soyad,email', { count: 'exact' })
        .eq('tenant_id', tenant)
        .eq('rol', 'BAKU_KURYE')
        .eq('durum', 'AKTIF');
      users = completeRows(userResult);
    }
  } else {
    rows = localRecords().filter((r) => r.tenant_id === tenant);
    orders = localOrders(tenant)
      .filter((r) => r.tenant_id === tenant)
      .map(formatlaSiparis);
    if (withUsers)
      users = kullanicilarVeritabani
        .filter((u) => u.tenant_id === tenant && u.rol === 'BAKU_KURYE' && u.durum === 'AKTIF')
        .map(({ id, ad_soyad, email }) => ({ id, ad_soyad, email }));
  }
  rows = rows.filter((r) => r.tenant_id === tenant);
  const ids = new Set(rows.map((r) => r.id));
  return {
    kuryeler: rows.map((r) => {
      const assigned = orders.filter((s) => s.tenant_id === tenant && s.baku_kurye_id === r.id);
      const pending = assigned.filter((s) => s.lojistik_durumu !== 'TESLIM_EDILDI');
      return {
        ...r,
        kullanici_id: r.kullanici_id || null,
        aktif_paket_sayisi: pending.length,
        toplam_paket_sayisi: assigned.length,
        toplam_tahsilat_bekleyen: pending.reduce((sum, s) => sum + Number(s.kalan_tutar || 0), 0),
      };
    }),
    atanabilir_kullanicilar: users,
    eslenmemis_siparisler: orders
      .filter((s) => s.tenant_id === tenant && s.baku_kurye_id && !ids.has(s.baku_kurye_id))
      .map(({ id, baku_kurye_id }) => ({ id, baku_kurye_id })),
  };
}
export async function createCourier(
  tenant: string,
  input: { ad_soyad: string; telefon: string; bolge: string }
) {
  scope(tenant);
  const row: CourierRecord = {
    ...input,
    id: 'kurye-' + randomUUID(),
    tenant_id: tenant,
    aktif: true,
    kullanici_id: null,
    olusturma_tarihi: new Date().toISOString(),
  };
  if (supabase) {
    const { data, error } = await supabase.from('kuryeler').insert(row).select('*').single();
    if (error) rpcError(error);
    if (!data || data.id !== row.id || data.tenant_id !== tenant)
      throw new PublicResourceError('Kurye kaydı doğrulanamadı.', 503);
    return data;
  }
  const rows = localRecords();
  rows.push(row);
  writeJsonAtomic(localFile, rows);
  return row;
}
export async function bindCourier(
  tenant: string,
  id: string,
  userId: string | null,
  expected: string | null
) {
  scope(tenant);
  if (supabase)
    return rpc('tomnap_bind_courier', {
      p_tenant_id: tenant,
      p_courier_id: id,
      p_user_id: userId,
      p_expected_user_id: expected,
    });
  const rows = localRecords();
  const row = rows.find(
    (r) => r.id === id && r.tenant_id === tenant && (r.aktif || userId === null)
  );
  if (!row) throw new PublicResourceError('Kurye bulunamadı.', 404);
  if (userId) activeLocalUser(tenant, userId);
  if (row.kullanici_id === userId) return { kurye: row, tekrar: true };
  if (
    row.kullanici_id !== expected ||
    (userId && rows.some((r) => r.id !== id && r.kullanici_id === userId))
  )
    rpcError({ code: 'PT409' });
  row.kullanici_id = userId;
  writeJsonAtomic(localFile, rows);
  return { kurye: row, tekrar: false };
}
export async function assignCourier(
  tenant: string,
  orderId: string,
  courierId: string | null,
  version: number
) {
  scope(tenant);
  if (supabase) {
    const result = await rpc('tomnap_assign_courier', {
      p_tenant_id: tenant,
      p_order_id: orderId,
      p_courier_id: courierId,
      p_expected_version: version,
    });
    if (result.siparis?.tenant_id !== tenant) rpcError(null);
    return { ...result, siparis: formatlaSiparis(result.siparis) };
  }
  const rows = localRecords();
  const courier = courierId
    ? rows.find((r) => r.id === courierId && r.tenant_id === tenant && r.aktif)
    : null;
  if (courierId && !courier) throw new PublicResourceError('Kurye bulunamadı.', 404);
  const order = localOrders(tenant).find((s) => s.id === orderId && s.tenant_id === tenant);
  if (!order) throw new PublicResourceError('Sipariş bulunamadı.', 404);
  const currentVersion = Number(order.kurye_atama_surumu || 0);
  if (
    (order.baku_kurye_id || null) === courierId &&
    [version, version + 1].includes(currentVersion)
  )
    return { siparis: formatlaSiparis(order), tekrar: true };
  if (currentVersion !== version) rpcError({ code: 'PT409' });
  if (order.lojistik_durumu === 'TESLIM_EDILDI') rpcError({ code: 'PT409' });
  Object.assign(order, {
    baku_kurye_id: courierId,
    baku_kurye_adi: courier?.ad_soyad || null,
    baku_kurye_bolgesi: courier?.bolge || null,
    kurye_atama_surumu: version + 1,
    guncellenme_tarihi: new Date().toISOString(),
  });
  return { siparis: formatlaSiparis(order), tekrar: false };
}
export async function courierTasks(tenant: string, userId: string) {
  scope(tenant);
  if (supabase) {
    const result = await rpc('tomnap_courier_tasks', { p_tenant_id: tenant, p_user_id: userId });
    if (!Array.isArray(result.gorevler)) rpcError(null);
    return {
      kurye: result.kurye
        ? { id: result.kurye.id, ad_soyad: result.kurye.ad_soyad, bolge: result.kurye.bolge }
        : null,
      gorevler: result.gorevler.map(deliveryTask),
    };
  }
  activeLocalUser(tenant, userId);
  const courier = localRecords().find(
    (r) => r.tenant_id === tenant && r.kullanici_id === userId && r.aktif
  );
  if (!courier) return { kurye: null, gorevler: [] };
  return {
    kurye: { id: courier.id, ad_soyad: courier.ad_soyad, bolge: courier.bolge },
    gorevler: localOrders(tenant)
      .filter(
        (s) =>
          s.tenant_id === tenant &&
          s.baku_kurye_id === courier.id &&
          (s.lojistik_durumu === 'BAKU_DAGITIM_ARKADAS' ||
            (s.lojistik_durumu === 'TESLIM_EDILDI' && s.kurye_teslim_kullanici_id === userId))
      )
      .map(deliveryTask),
  };
}
export async function deliverCourierTask(
  tenant: string,
  userId: string,
  orderId: string,
  version: number,
  recipient: string
) {
  scope(tenant);
  if (supabase) {
    const result = await rpc('tomnap_deliver_courier_order', {
      p_tenant_id: tenant,
      p_user_id: userId,
      p_order_id: orderId,
      p_expected_version: version,
      p_recipient: recipient,
    });
    if (!result.gorev || typeof result.tekrar !== 'boolean') rpcError(null);
    return { gorev: deliveryTask(result.gorev), tekrar: result.tekrar };
  }
  activeLocalUser(tenant, userId);
  const courier = localRecords().find(
    (r) => r.tenant_id === tenant && r.kullanici_id === userId && r.aktif
  );
  const order =
    courier &&
    localOrders(tenant).find(
      (s) => s.tenant_id === tenant && s.id === orderId && s.baku_kurye_id === courier.id
    );
  if (!order || !courier) throw new PublicResourceError('Görev bulunamadı.', 404);
  if (Number(order.kurye_atama_surumu || 0) !== version) rpcError({ code: 'PT409' });
  if (order.lojistik_durumu === 'TESLIM_EDILDI' && order.kurye_teslim_kullanici_id === userId)
    return { gorev: deliveryTask(order), tekrar: true };
  if (order.lojistik_durumu !== 'BAKU_DAGITIM_ARKADAS') rpcError({ code: 'PT409' });
  Object.assign(order, {
    lojistik_durumu: 'TESLIM_EDILDI',
    teslim_tarihi: new Date().toISOString(),
    teslim_eden_kisi: courier.ad_soyad,
    kurye_teslim_alan: recipient,
    kurye_teslim_kullanici_id: userId,
  });
  return { gorev: deliveryTask(order), tekrar: false };
}
