import { supabase } from '../supabase';
import { siparislerVeritabani } from '../state';
import { CargoSettingsError } from './settings';
/** Only cargo fields are sent; DB merges extras and notes under the order row lock. */
export async function updateCargoOrder(order: any, changes: Record<string, unknown>) {
  if (!supabase) {
    const current = siparislerVeritabani.find(
      (row) => row.id === order.id && row.tenant_id === order.tenant_id
    );
    if (
      !current ||
      current.lojistik_durumu !== order.lojistik_durumu ||
      (current.kurye_atama_surumu ?? 0) !== (order.kurye_atama_surumu ?? 0) ||
      (current.uluslararasi_kargo_kodu || '') !== (order.uluslararasi_kargo_kodu || '')
    )
      throw new CargoSettingsError('Sipariş değişti; yeniden yükleyip tekrar deneyin.', 409);
    for (const field of ['lojistik_durumu', 'uluslararasi_kargo_kodu', 'kargo_agirligi_kg'])
      if (Object.hasOwn(changes, field)) current[field] = changes[field];
    if (Object.hasOwn(changes, 'kargo_notu'))
      current.baku_tahsilat_notu = [current.baku_tahsilat_notu, changes.kargo_notu]
        .filter(Boolean)
        .join(' ');
    current.guncellenme_tarihi = new Date().toISOString();
    return;
  }
  try {
    const { data, error } = await supabase.rpc('tomnap_update_cargo_order', {
      p_tenant_id: order.tenant_id,
      p_order_id: order.id,
      p_expected_status: order.lojistik_durumu,
      p_expected_assignment: order.kurye_atama_surumu ?? 0,
      p_expected_awb: order.uluslararasi_kargo_kodu || '',
      p_changes: changes,
    });
    if (error?.code === '40001' || error?.code === 'P0002')
      throw new CargoSettingsError('Sipariş değişti; yeniden yükleyip tekrar deneyin.', 409);
    if (error || data?.id !== order.id)
      throw new CargoSettingsError('Kargo güncellemesi kaydedilemedi.');
  } catch (error) {
    if (error instanceof CargoSettingsError) throw error;
    throw new CargoSettingsError('Kargo güncellemesi kaydedilemedi.');
  }
}
