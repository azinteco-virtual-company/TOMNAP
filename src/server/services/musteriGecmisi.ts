/**
 * Müşteri ↔ sipariş eşleştirmesi (müşteri listesi ve müşteri geçmişi).
 *
 * Kural: aynı tenant'ta ve
 *   sipariş.musteri_id === müşteri.id, VEYA
 *   müşterinin boş olmayan telefonu (boşluksuz) siparişinkiyle aynı, VEYA
 *   adlar küçük harfe çevrilip kırpıldığında aynı.
 *
 * Eski hâli her müşteri için bütün siparişleri, her sipariş için bütün
 * müşterileri tarıyordu (müşteri × sipariş, her sayfa isteğinde). Burada
 * anahtarlar tenant başına tek geçişte indekslenir; sonuç birebir aynıdır
 * (tests/server/services/musteriGecmisi.test.ts eski hesapla karşılaştırır).
 */

export interface TenantliSatir {
  tenant_id?: unknown;
  eksik_bilgiler?: unknown;
}
export interface MusteriSatiri extends TenantliSatir {
  id?: unknown;
  telefon?: unknown;
  ad_soyad?: unknown;
}
export interface SiparisSatiri extends TenantliSatir {
  musteri_id?: unknown;
  telefon_numarasi?: unknown;
  musteri_adi?: unknown;
}

/** Row tenant: tenant_id, else the last legacy META tag, else the original boutique. */
export function satirTenanti(row: TenantliSatir): unknown {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler)
    ? row.eksik_bilgiler
        .filter(
          (item): item is string => typeof item === 'string' && item.startsWith('META:tenant_id=')
        )
        .at(-1)
    : undefined;
  return legacy?.slice('META:tenant_id='.length) || 'kanada_shopper_baku';
}

export const telefonAnahtari = (value: unknown) => String(value || '').replace(/\s+/g, '');
export const adAnahtari = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim();

/** The matching rule itself (one pair). */
export function eslesir(customer: MusteriSatiri, order: SiparisSatiri): boolean {
  if (satirTenanti(customer) !== satirTenanti(order)) return false;
  const telefon = telefonAnahtari(customer.telefon);
  return (
    order.musteri_id === customer.id ||
    (!!telefon && telefon === telefonAnahtari(order.telefon_numarasi)) ||
    adAnahtari(order.musteri_adi) === adAnahtari(customer.ad_soyad)
  );
}

// Map/Set compare with SameValueZero; === differs only for NaN, which never equals itself.
const esitlenebilir = (value: unknown) => value === value;

function grup<K, V>(map: Map<K, V>, key: K, yeni: () => V): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = yeni()));
  return value;
}

/** Customers indexed per tenant: "does any customer match this order?" without a scan. */
export class MusteriIndeksi {
  private readonly tenantlar = new Map<
    unknown,
    { idler: Set<unknown>; telefonlar: Set<string>; adlar: Set<string> }
  >();

  constructor(customers: readonly MusteriSatiri[] = []) {
    for (const customer of customers) this.ekle(customer);
  }

  ekle(customer: MusteriSatiri): void {
    const indeks = grup(this.tenantlar, satirTenanti(customer), () => ({
      idler: new Set<unknown>(),
      telefonlar: new Set<string>(),
      adlar: new Set<string>(),
    }));
    if (esitlenebilir(customer.id)) indeks.idler.add(customer.id);
    const telefon = telefonAnahtari(customer.telefon);
    if (telefon) indeks.telefonlar.add(telefon);
    indeks.adlar.add(adAnahtari(customer.ad_soyad));
  }

  eslesenVar(order: SiparisSatiri): boolean {
    const indeks = this.tenantlar.get(satirTenanti(order));
    if (!indeks) return false;
    return (
      (esitlenebilir(order.musteri_id) && indeks.idler.has(order.musteri_id)) ||
      indeks.telefonlar.has(telefonAnahtari(order.telefon_numarasi)) ||
      indeks.adlar.has(adAnahtari(order.musteri_adi))
    );
  }
}

/**
 * Each customer's matching orders, in the order of `orders` (callers pass them
 * newest first). Equivalent to customers.map((c) => orders.filter((o) => eslesir(c, o))).
 */
export function siparisGecmisleri<S extends SiparisSatiri>(
  customers: readonly MusteriSatiri[],
  orders: readonly S[]
): S[][] {
  const tenantlar = new Map<
    unknown,
    {
      idler: Map<unknown, number[]>;
      telefonlar: Map<string, number[]>;
      adlar: Map<string, number[]>;
    }
  >();
  orders.forEach((order, index) => {
    const indeks = grup(tenantlar, satirTenanti(order), () => ({
      idler: new Map<unknown, number[]>(),
      telefonlar: new Map<string, number[]>(),
      adlar: new Map<string, number[]>(),
    }));
    if (esitlenebilir(order.musteri_id)) grup(indeks.idler, order.musteri_id, () => []).push(index);
    grup(indeks.telefonlar, telefonAnahtari(order.telefon_numarasi), () => []).push(index);
    grup(indeks.adlar, adAnahtari(order.musteri_adi), () => []).push(index);
  });
  return customers.map((customer) => {
    const indeks = tenantlar.get(satirTenanti(customer));
    if (!indeks) return [];
    const bulunan = new Set<number>(
      esitlenebilir(customer.id) ? (indeks.idler.get(customer.id) ?? []) : []
    );
    const telefon = telefonAnahtari(customer.telefon);
    if (telefon) for (const index of indeks.telefonlar.get(telefon) ?? []) bulunan.add(index);
    for (const index of indeks.adlar.get(adAnahtari(customer.ad_soyad)) ?? []) bulunan.add(index);
    return [...bulunan].sort((a, b) => a - b).map((index) => orders[index]);
  });
}
