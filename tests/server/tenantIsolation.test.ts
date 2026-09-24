import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { DATA_DIR } from '../../src/server/config';
import {
  setMusterilerVeritabani,
  setSiparislerVeritabani,
  siparislerVeritabani,
} from '../../src/server/services/state';
import { createCourier } from '../../src/server/services/couriers';
import { CARGO_SETTINGS_FILE, saveCargoSettings } from '../../src/server/services/kargo/settings';
import type { MusteriKaydi } from '../../src/server/types';
import { describeTenantIsolation, TENANT_A, TENANT_B } from './helpers/tenantIsolation';

// The five most critical tenant data route groups, checked with the shared helper.

function order(id: string, tenant: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: tenant,
    musteri_adi: 'Synthetic Customer',
    telefon_numarasi: '',
    urun_aciklamasi: 'Synthetic product',
    toplam_tutar: 100,
    alinan_tutar: 0,
    kalan_tutar: 100,
    lojistik_durumu: 'KANADA_DEPO',
    uluslararasi_kargo_kodu: '',
    olusturma_tarihi: '2026-09-01T10:00:00.000Z',
    ...extra,
  };
}
const orderById = (id: string) => siparislerVeritabani.find((row) => row.id === id);

describeTenantIsolation('Siparişler', {
  seed: () =>
    setSiparislerVeritabani([
      order('iso-order-a', TENANT_A, { musteri_adi: 'ORDER-A-MARKER' }),
      order('iso-order-b', TENANT_B, { musteri_adi: 'ORDER-B-MARKER' }),
    ]),
  own: { id: 'iso-order-a', marker: 'ORDER-A-MARKER' },
  foreign: { id: 'iso-order-b', markers: ['ORDER-B-MARKER'] },
  list: (agent) => agent.get('/api/siparisler'),
  write: (agent, id) => agent.patch(`/api/siparisler/${id}`).send({ urun_aciklamasi: 'Changed' }),
  foreignState: () => orderById('iso-order-b'),
});

function customer(id: string, tenant: string, name: string): MusteriKaydi {
  return {
    id,
    ad_soyad: name,
    telefon: '',
    instagram_kullanici_adi: '',
    sehir: '',
    adres: '',
    musteri_tipi: 'TANIMADIK',
    toplam_siparis_sayisi: 0,
    toplam_harcama: 0,
    kalan_toplam_borc: 0,
    notlar: '',
    olusturma_tarihi: '2026-09-01T10:00:00.000Z',
    son_siparis_tarihi: '2026-09-01T10:00:00.000Z',
    tenant_id: tenant,
  } as MusteriKaydi;
}
let customers: MusteriKaydi[] = [];

describeTenantIsolation('Müşteriler', {
  seed: () => {
    customers = [
      customer('iso-customer-a', TENANT_A, 'CUSTOMER-A-MARKER'),
      customer('iso-customer-b', TENANT_B, 'CUSTOMER-B-MARKER'),
    ];
    setMusterilerVeritabani(customers);
    setSiparislerVeritabani([
      order('iso-cust-order-a', TENANT_A, { musteri_id: 'iso-customer-a' }),
      order('iso-cust-order-b', TENANT_B, { musteri_id: 'iso-customer-b' }),
    ]);
  },
  own: { id: 'iso-customer-a', marker: 'CUSTOMER-A-MARKER' },
  foreign: { id: 'iso-customer-b', markers: ['CUSTOMER-B-MARKER', 'iso-cust-order-b'] },
  read: (agent, id) => agent.get(`/api/musteriler/${id}/siparisler`),
  list: (agent) => agent.get('/api/musteriler'),
  write: (agent, id) => agent.post('/api/musteriler').send({ id, ad_soyad: 'Renamed' }),
  foreignState: () => customers.find((row) => row.id === 'iso-customer-b'),
});

// Cash and balances: couriers' pending collections and the finance role's
// payment updates (there is no separate cash table or endpoint).
describeTenantIsolation('Kasa / bakiyeler', {
  role: 'BAKU_FINANS',
  seed: async () => {
    fs.rmSync(path.join(DATA_DIR, 'couriers.json'), { force: true });
    const courierA = await createCourier(TENANT_A, {
      ad_soyad: 'CASH-A-COURIER',
      telefon: '',
      bolge: '',
    });
    const courierB = await createCourier(TENANT_B, {
      ad_soyad: 'CASH-B-COURIER',
      telefon: '',
      bolge: '',
    });
    setSiparislerVeritabani([
      order('iso-cash-a', TENANT_A, { baku_kurye_id: courierA.id, kalan_tutar: 1234.5 }),
      order('iso-cash-b', TENANT_B, { baku_kurye_id: courierB.id, kalan_tutar: 4321.5 }),
    ]);
  },
  own: { id: 'iso-cash-a', marker: 'CASH-A-COURIER' },
  foreign: { id: 'iso-cash-b', markers: ['CASH-B-COURIER', '4321.5'] },
  list: (agent) => agent.get('/api/kuryeler'),
  write: (agent, id) => agent.patch(`/api/siparisler/${id}`).send({ alinan_tutar: 50 }),
  foreignState: () => orderById('iso-cash-b'),
});

function storedCargoSettings(tenant: string): unknown {
  if (!fs.existsSync(CARGO_SETTINGS_FILE)) return undefined;
  const snapshot = JSON.parse(fs.readFileSync(CARGO_SETTINGS_FILE, 'utf8')) as {
    records?: Array<{ tenant_id: string }>;
  };
  return snapshot.records?.find((record) => record.tenant_id === tenant);
}

describeTenantIsolation('Kargo ayarları', {
  seed: async () => {
    fs.rmSync(CARGO_SETTINGS_FILE, { force: true });
    // Tenant B is stored first, so a lookup that ignores the tenant returns it.
    await saveCargoSettings({ tenantId: TENANT_B, revision: 0, cikisSehri: 'CARGO-B-CITY' });
    await saveCargoSettings({ tenantId: TENANT_A, revision: 0, cikisSehri: 'CARGO-A-CITY' });
  },
  own: { id: TENANT_A, marker: 'CARGO-A-CITY' },
  foreign: { id: TENANT_B, markers: ['CARGO-B-CITY'] },
  read: (agent, tenant) => agent.get('/api/kargo/ayarlar').query({ tenant_id: tenant }),
  write: (agent, tenant) =>
    agent.post('/api/kargo/ayarlar').send({ tenantId: tenant, revision: 1, cikisSehri: 'Changed' }),
  foreignState: () => storedCargoSettings(TENANT_B),
});

function manifest(): string {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Waybill Number', 'Consignee Name', 'Telephone'],
      ['37349392426', 'Aytən Məmmədova', '+994552843911'],
    ]),
    'DailyDispatch'
  );
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

describeTenantIsolation('AWB eşleştirme', {
  env: { FF_AWB_REVIEW: 'true' },
  // Both orders match the manifest row by phone; B's name never appears in a request,
  // so it can only reach tenant A through a leak (a rejected write echoes the sent id).
  seed: () =>
    setSiparislerVeritabani([
      order('iso-awb-a', TENANT_A, {
        musteri_adi: 'AWB-A-MARKER',
        telefon_numarasi: '055 284 39 11',
      }),
      order('iso-awb-b', TENANT_B, {
        musteri_adi: 'AWB-B-MARKER',
        telefon_numarasi: '055 284 39 11',
      }),
    ]),
  own: { id: 'iso-awb-a', marker: 'AWB-A-MARKER' },
  foreign: { id: 'iso-awb-b', markers: ['AWB-B-MARKER'] },
  list: (agent) =>
    agent.post('/api/kargo/manifesto-eslestirme/oneriler').send({ dosya_base64: manifest() }),
  write: (agent, id) =>
    agent.post('/api/kargo/manifesto-eslestirme/onayla').send({
      dosya_base64: manifest(),
      dosya_adi: 'isolation.xlsx',
      secimler: [{ satirNo: 1, siparisId: id }],
    }),
  foreignState: () => orderById('iso-awb-b'),
});
