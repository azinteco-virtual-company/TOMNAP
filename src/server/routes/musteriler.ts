import { Router, Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  listRequest,
  customerSnapshot,
  memoryPage,
  customerKey,
  compareKeys,
} from '../services/listPagination';
import { supabase } from '../services/supabase';
import { formatlaSiparis } from '../services/siparisFormatlama';
import {
  musterilerVeritabani,
  siparislerVeritabani,
  demoSiparislerVeritabani,
} from '../services/state';
import { MusteriKaydi } from '../types';

const router = Router();
const rowTenant = (row: any): string => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler)
    ? row.eksik_bilgiler
        .filter((item: any) => typeof item === 'string' && item.startsWith('META:tenant_id='))
        .at(-1)
    : undefined;
  return legacy?.slice('META:tenant_id='.length) || 'kanada_shopper_baku';
};
const belongs = (row: any, tenant: string) => tenant === 'all' || rowTenant(row) === tenant;
function tenantFor(req: Request, mutation = false): string {
  const tenant = (req as any).tenantId;
  if (!tenant || (mutation && tenant === 'all'))
    throw Object.assign(new Error('Bir butik seçilmelidir.'), { status: 400 });
  return tenant;
}
async function ownedCustomer(tenant: string, id: unknown) {
  if (typeof id !== 'string') return undefined;
  if (supabase && tenant !== 'demo_sandbox') {
    const { data, error } = await supabase
      .from('musteriler')
      .select('*')
      .eq('tenant_id', tenant)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data && belongs(data, tenant) ? data : undefined;
  }
  return musterilerVeritabani.find((customer) => customer.id === id && belongs(customer, tenant));
}
function localSnapshot(tenant: string) {
  return {
    customers: musterilerVeritabani.filter((r) => belongs(r, tenant)),
    orders: (tenant === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani).filter(
      (r) => belongs(r, tenant)
    ),
  };
}
const newestFirst = (a: any, b: any) =>
  (Date.parse(b.olusturma_tarihi) || 0) - (Date.parse(a.olusturma_tarihi) || 0) ||
  compareKeys(String(a.id), String(b.id));
const phone = (value: any) => String(value || '').replace(/\s+/g, '');
function matches(customer: any, order: any) {
  if (rowTenant(customer) !== rowTenant(order)) return false;
  return (
    order.musteri_id === customer.id ||
    (phone(customer.telefon) && phone(customer.telefon) === phone(order.telefon_numarasi)) ||
    String(order.musteri_adi || '')
      .toLowerCase()
      .trim() ===
      String(customer.ad_soyad || '')
        .toLowerCase()
        .trim()
  );
}
const fail = (res: any, error: any) =>
  res.status(error.status || 503).json({
    basarili: false,
    hata: error.status ? error.message : 'Müşteri verilerine erişilemedi.',
  });

router.get('/musteriler', async (req, res) => {
  try {
    const tenant = tenantFor(req);
    const request = listRequest(req, tenant, 'musteriler');
    const snapshot = await customerSnapshot(request, () => localSnapshot(tenant));
    const customers = snapshot.customers;
    const orders = snapshot.orders.map(formatlaSiparis).sort(newestFirst);
    // Build missing customer cards only from orders already inside this authority scope.
    for (const order of orders) {
      if (!order.musteri_adi || customers.some((c) => matches(c, order))) continue;
      customers.push({
        id: order.musteri_id || `order:${order.id}`,
        ad_soyad: order.musteri_adi,
        telefon: order.telefon_numarasi || '',
        instagram_kullanici_adi: order.instagram_kullanici_adi || '',
        sehir: order.teslimat_sehri || '',
        adres: order.teslimat_adresi || '',
        musteri_tipi: order.musteri_tipi || 'TANIMADIK',
        tenant_id: rowTenant(order),
        olusturma_tarihi: order.olusturma_tarihi,
      });
    }
    const enriched = customers
      .map((customer) => {
        const history = orders.filter((order) => matches(customer, order)).sort(newestFirst);
        const latest = history[0];
        return {
          ...customer,
          toplam_siparis_sayisi: history.length,
          toplam_harcama: history.reduce((sum, order) => sum + Number(order.toplam_tutar || 0), 0),
          kalan_toplam_borc: history.reduce(
            (sum, order) => sum + Number(order.kalan_tutar || 0),
            0
          ),
          son_siparis_tarihi: latest?.olusturma_tarihi || customer.olusturma_tarihi,
          son_urun_aciklamasi: latest?.urun_aciklamasi || 'Sipariş yoxdur',
          son_siparis_tutari: latest?.toplam_tutar || 0,
        };
      })
      .sort((a, b) => Date.parse(b.son_siparis_tarihi) - Date.parse(a.son_siparis_tarihi));
    const page = memoryPage(request, enriched, snapshot.revision, customerKey);
    res.json({
      basarili: true,
      toplam: page.pagination.total,
      musteriler: page.items,
      pagination: page.pagination,
    });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/musteriler/:id/siparisler', async (req, res) => {
  try {
    const tenant = tenantFor(req);
    const request = listRequest(req, tenant, `musteri-siparisler:${req.params.id}`);
    const snapshot = await customerSnapshot(request, () => localSnapshot(tenant));
    const customers = snapshot.customers;
    const orders = snapshot.orders.map(formatlaSiparis).sort(newestFirst);
    let customer = customers.find((c) => c.id === req.params.id);
    if (!customer) {
      const order = orders.find(
        (o) => o.musteri_id === req.params.id || `order:${o.id}` === req.params.id
      );
      if (order)
        customer = {
          id: req.params.id,
          ad_soyad: order.musteri_adi,
          telefon: order.telefon_numarasi,
          tenant_id: rowTenant(order),
        };
    }
    if (!customer) return res.status(404).json({ basarili: false, hata: 'Müşteri bulunamadı.' });
    const page = memoryPage(
      request,
      orders.filter((o) => matches(customer, o)),
      snapshot.revision
    );
    res.json({
      basarili: true,
      musteri: customer,
      siparisler: page.items,
      toplam: page.pagination.total,
      pagination: page.pagination,
    });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/musteriler', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const { id, ad_soyad, telefon, instagram_kullanici_adi, sehir, adres, musteri_tipi, notlar } =
      req.body;
    if (typeof ad_soyad !== 'string' || !ad_soyad.trim())
      return res.status(400).json({ basarili: false, hata: 'Müşteri adı zorunludur.' });
    const existing = id ? await ownedCustomer(tenant, id) : undefined;
    if (id && !existing)
      return res.status(404).json({ basarili: false, hata: 'Müşteri bulunamadı.' });
    const customer: MusteriKaydi = {
      ...(existing || {
        id: 'mus-' + randomUUID(),
        toplam_siparis_sayisi: 0,
        toplam_harcama: 0,
        kalan_toplam_borc: 0,
        olusturma_tarihi: new Date().toISOString(),
        son_siparis_tarihi: new Date().toISOString(),
      }),
      ad_soyad: ad_soyad.trim(),
      tenant_id: tenant,
      musteri_tipi: musteri_tipi || existing?.musteri_tipi || 'TANIMADIK',
    };
    for (const [key, value] of Object.entries({
      telefon,
      instagram_kullanici_adi,
      sehir,
      adres,
      notlar,
    }))
      if (value !== undefined) (customer as any)[key] = value;
    if (supabase && tenant !== 'demo_sandbox') {
      const query = existing
        ? supabase.from('musteriler').update(customer).eq('id', existing.id).eq('tenant_id', tenant)
        : supabase.from('musteriler').insert(customer);
      const { data, error } = await query.select('*').single();
      if (error || !data) throw error || new Error('Müşteri kaydedilmedi.');
      return res.json({ basarili: true, musteri: data });
    }
    const index = musterilerVeritabani.findIndex((c) => c.id === customer.id && belongs(c, tenant));
    if (index >= 0) musterilerVeritabani[index] = customer;
    else musterilerVeritabani.unshift(customer);
    res.json({ basarili: true, musteri: customer });
  } catch (error) {
    fail(res, error);
  }
});
export default router;
