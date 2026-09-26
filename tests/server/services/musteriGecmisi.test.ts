import { describe, expect, it } from 'vitest';
import {
  MusteriIndeksi,
  eslesir,
  satirTenanti,
  siparisGecmisleri,
  type MusteriSatiri,
  type SiparisSatiri,
} from '../../../src/server/services/musteriGecmisi';

// Deterministic generator so a failure can be replayed.
function uret(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), (x >>> 0) / 2 ** 32);
}
const sec = <T>(r: () => number, items: readonly T[]) => items[Math.floor(r() * items.length)];

const IDLER = ['c1', 'c2', 'c3', undefined, '', Number.NaN, 7];
const TELEFONLAR = ['', '055 111 22 33', '0551112233', ' 0551112233 ', '050 000', undefined, null];
const ADLAR = ['', '  ', 'Ayla', ' ayla ', 'AYLA', 'Aylа', 'Əli', 'əli', undefined, null];
const TENANTLAR: Array<Partial<SiparisSatiri>> = [
  { tenant_id: 'a' },
  { tenant_id: 'b' },
  { eksik_bilgiler: ['META:tenant_id=a'] },
  { eksik_bilgiler: ['x', 'META:tenant_id=b', 'META:tenant_id=a'] },
  {},
];

function veri(seed: number) {
  const r = uret(seed);
  const customers: MusteriSatiri[] = Array.from({ length: Math.floor(r() * 25) }, () => ({
    id: sec(r, IDLER),
    telefon: sec(r, TELEFONLAR),
    ad_soyad: sec(r, ADLAR),
    ...sec(r, TENANTLAR),
  }));
  const orders: Array<SiparisSatiri & { id: string }> = Array.from(
    { length: Math.floor(r() * 60) },
    (_, i) => ({
      id: `o${i}`,
      musteri_id: sec(r, IDLER),
      telefon_numarasi: sec(r, TELEFONLAR),
      musteri_adi: sec(r, ADLAR),
      ...sec(r, TENANTLAR),
    })
  );
  return { customers, orders };
}

// The previous implementation from routes/musteriler.ts, kept as the reference
// (same expressions; its `any` parameters are typed with the row interfaces here).
type Satir = MusteriSatiri & SiparisSatiri;
const rowTenant = (row: Satir): unknown => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler)
    ? row.eksik_bilgiler
        .filter(
          (item: unknown): item is string =>
            typeof item === 'string' && item.startsWith('META:tenant_id=')
        )
        .at(-1)
    : undefined;
  return legacy?.slice('META:tenant_id='.length) || 'kanada_shopper_baku';
};
const phone = (value: unknown) => String(value || '').replace(/\s+/g, '');
function matches(customer: Satir, order: Satir) {
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
function eskiGecmisler(customers: MusteriSatiri[], orders: SiparisSatiri[]) {
  return customers.map((customer) => orders.filter((order) => matches(customer, order)));
}
function eskiKartlar(customers: MusteriSatiri[], orders: Array<SiparisSatiri & { id: string }>) {
  const all = [...customers];
  for (const order of orders) {
    if (!order.musteri_adi || all.some((c) => matches(c, order))) continue;
    all.push({
      id: order.musteri_id || `order:${order.id}`,
      ad_soyad: order.musteri_adi,
      telefon: order.telefon_numarasi || '',
      tenant_id: satirTenanti(order),
    });
  }
  return all;
}

describe('linear customer matching is identical to the quadratic one', () => {
  it('keeps the single-pair rule identical to the old matches()', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const { customers, orders } = veri(seed);
      for (const customer of customers)
        for (const order of orders)
          expect(eslesir(customer, order)).toBe(Boolean(matches(customer, order)));
    }
  });

  it('returns the same order histories, in the same order, on 2000 random datasets', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const { customers, orders } = veri(seed);
      const expected = eskiGecmisler(customers, orders).map((h) =>
        h.map((o) => orders.indexOf(o as never))
      );
      const actual = siparisGecmisleri(customers, orders).map((h) =>
        h.map((o) => orders.indexOf(o))
      );
      expect([seed, actual]).toEqual([seed, expected]);
    }
  });

  it('builds the same missing customer cards, including cards added along the way', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const { customers, orders } = veri(seed);
      const expected = eskiKartlar(customers, orders);
      const known = new MusteriIndeksi(customers);
      const actual = [...customers];
      for (const order of orders) {
        if (!order.musteri_adi || known.eslesenVar(order)) continue;
        const card = {
          id: order.musteri_id || `order:${order.id}`,
          ad_soyad: order.musteri_adi,
          telefon: order.telefon_numarasi || '',
          tenant_id: satirTenanti(order),
        };
        actual.push(card);
        known.ekle(card);
      }
      expect([seed, actual]).toEqual([seed, expected]);
    }
  });

  it('keeps the edge cases of the rule', () => {
    const [nan] = siparisGecmisleri(
      [{ id: Number.NaN, tenant_id: 'a', ad_soyad: 'x' }],
      [{ musteri_id: Number.NaN, tenant_id: 'a', musteri_adi: 'y' }]
    );
    expect(nan).toEqual([]); // NaN never equals itself, as with ===.
    const [empty] = siparisGecmisleri(
      [{ id: 'c', tenant_id: 'a', ad_soyad: '' }],
      [{ musteri_id: 'd', tenant_id: 'a', musteri_adi: '  ' }]
    );
    expect(empty).toHaveLength(1); // Two blank names match, as before.
    const [phoneless] = siparisGecmisleri(
      [{ id: 'c', tenant_id: 'a', telefon: ' ', ad_soyad: 'p' }],
      [{ musteri_id: 'd', tenant_id: 'a', telefon_numarasi: '', musteri_adi: 'q' }]
    );
    expect(phoneless).toEqual([]); // A blank customer phone matches nothing.
    expect(
      new MusteriIndeksi([{ id: 'c', tenant_id: 'a' }]).eslesenVar({
        musteri_id: 'c',
        tenant_id: 'b',
      })
    ).toBe(false);
  });
});
