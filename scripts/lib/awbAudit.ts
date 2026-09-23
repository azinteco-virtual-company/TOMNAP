import {
  foldName,
  nameSimilarity,
  normalizeAwb,
  normalizeName,
  normalizePhone,
  ZAYIF_ESLESME_ESIGI,
  type ManifestSatiriGirdisi,
} from '../../src/server/services/kargo/manifestMatching';

/**
 * Read-only analysis of AWB codes that the removed automatic manifest matching
 * may have attached to the wrong order. Nothing here performs I/O.
 */

export type BulguTipi =
  | 'AYNI_AWB_BIRDEN_FAZLA_SIPARISTE'
  | 'ESKI_ESLESTIRME_BOS_ISIM'
  | 'ESKI_ESLESTIRME_KISA_ISIM'
  | 'MANIFEST_ALICI_UYUSMUYOR'
  | 'MANIFEST_ALICI_BENZER'
  | 'MANIFEST_TELEFON_UYUSMUYOR'
  | 'BELIRSIZ_ADAS';
export type Onem = 'YUKSEK' | 'ORTA';

export interface AuditOrder {
  id: string;
  tenantId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  /** Normalized AWB; '' when the order has none (then it is only a namesake candidate). */
  awb: string;
  /** AWB exactly as stored. */
  awbHam: string;
  /** olusturma_tarihi as stored; '' when missing. */
  olusturmaTarihi: string;
}

export interface AdasSiparis {
  siparisId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  awb: string;
  olusturmaTarihi: string;
  /** Whole days from the AWB holder's creation (negative: older); null if a date is unknown. */
  gunFarki: number | null;
  /** null when either phone is missing or unreadable. */
  ayniTelefon: boolean | null;
}

export interface Bulgu {
  tip: BulguTipi;
  onem: Onem;
  tenantId: string;
  siparisId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  awb: string;
  olusturmaTarihi: string;
  aciklama: string;
  benzerlik?: number;
  adasSayisi?: number;
  adaslar?: AdasSiparis[];
  manifest?: { dosya: string; satirNo: number; aliciAdi: string; telefon: string };
}

export interface ManifestDenetimi {
  dosya: string;
  satirSayisi: number;
  veritabanindaOlmayanAwb: number;
  kontrolEdilenAwb: number;
  bulgular: Bulgu[];
}

/** The exact normalization of the removed matcher: non-ASCII letters vanish. */
export function eskiAlgoritmaIsmi(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toAuditOrder(row: unknown): AuditOrder | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const id = text(record.id);
  const tenantId = text(record.tenant_id);
  if (!id || !tenantId) return null;
  return {
    id,
    tenantId,
    musteriAdi: text(record.musteri_adi),
    telefon: text(record.telefon_numarasi),
    lojistikDurumu: text(record.lojistik_durumu),
    awb: normalizeAwb(record.uluslararasi_kargo_kodu),
    awbHam: text(record.uluslararasi_kargo_kodu),
    olusturmaTarihi: text(record.olusturma_tarihi),
  };
}

function finding(order: AuditOrder, tip: BulguTipi, onem: Onem, aciklama: string): Bulgu {
  return {
    tip,
    onem,
    tenantId: order.tenantId,
    siparisId: order.id,
    musteriAdi: order.musteriAdi,
    telefon: order.telefon,
    lojistikDurumu: order.lojistikDurumu,
    awb: order.awbHam,
    olusturmaTarihi: order.olusturmaTarihi,
    aciklama,
  };
}

const severityRank: Record<Onem, number> = { YUKSEK: 0, ORTA: 1 };
export function siralaBulgular(findings: Bulgu[]): Bulgu[] {
  return [...findings].sort(
    (a, b) =>
      severityRank[a.onem] - severityRank[b.onem] ||
      a.tenantId.localeCompare(b.tenantId) ||
      a.awb.localeCompare(b.awb) ||
      a.siparisId.localeCompare(b.siparisId)
  );
}

/** Signals that need no manifest file: duplicates and the old matcher's risk profile. */
export function veritabaniBulgulari(orders: readonly AuditOrder[]): Bulgu[] {
  const findings: Bulgu[] = [];
  const holders = orders.filter((order) => order.awb);
  const byAwb = new Map<string, AuditOrder[]>();
  for (const order of holders) {
    const key = `${order.tenantId}\u0000${order.awb}`;
    const list = byAwb.get(key);
    if (list) list.push(order);
    else byAwb.set(key, [order]);
  }
  for (const group of byAwb.values())
    if (group.length > 1)
      for (const order of group)
        findings.push(
          finding(
            order,
            'AYNI_AWB_BIRDEN_FAZLA_SIPARISTE',
            'YUKSEK',
            `Aynı AWB bu butikte ${group.length} siparişte kayıtlı; en az biri yanlış olabilir.`
          )
        );
  for (const order of holders) {
    const legacy = eskiAlgoritmaIsmi(order.musteriAdi);
    if (!legacy)
      findings.push(
        finding(
          order,
          'ESKI_ESLESTIRME_BOS_ISIM',
          'YUKSEK',
          'Eski eşleştirme bu adı boş sayıyordu; bu sipariş herhangi bir manifest satırıyla eşleşebiliyordu.'
        )
      );
    else if (legacy.length < 4)
      findings.push(
        finding(
          order,
          'ESKI_ESLESTIRME_KISA_ISIM',
          'ORTA',
          `Eski eşleştirme bu adı "${legacy}" parçasına indiriyordu; bu parçayı içeren başka alıcılarla eşleşebiliyordu.`
        )
      );
  }
  return siralaBulgular(findings);
}

/** Compares a manifest's recipient with the order that holds each of its AWB codes. */
export function manifestBulgulari(
  orders: readonly AuditOrder[],
  rows: readonly ManifestSatiriGirdisi[],
  dosya: string
): ManifestDenetimi {
  const byAwb = new Map<string, AuditOrder[]>();
  for (const order of orders) {
    if (!order.awb) continue;
    const list = byAwb.get(order.awb);
    if (list) list.push(order);
    else byAwb.set(order.awb, [order]);
  }
  const findings: Bulgu[] = [];
  let missing = 0;
  let checked = 0;
  rows.forEach((row, index) => {
    const awb = normalizeAwb(row.takipNo);
    const holders = awb ? (byAwb.get(awb) ?? []) : [];
    if (holders.length === 0) {
      missing++;
      return;
    }
    checked++;
    const rowPhone = normalizePhone(row.telefon);
    const rowName = normalizeName(row.aliciAdi);
    for (const order of holders) {
      const orderPhone = normalizePhone(order.telefon);
      if (rowPhone && rowPhone === orderPhone) continue;
      // Both phones parsed and differ: a namesake or the old last-7-digit match.
      const phonesDiffer = rowPhone !== '' && orderPhone !== '';
      const similarity =
        rowName && rowName === normalizeName(order.musteriAdi)
          ? 1
          : nameSimilarity(row.aliciAdi, order.musteriAdi);
      // Identical under a transliteration scheme (e.g. "Gamar Asadova" / "Qəmər Əsədova").
      if (similarity === 1 && !phonesDiffer) continue;
      const nameAgrees = similarity >= ZAYIF_ESLESME_ESIGI;
      const phoneNote = phonesDiffer ? ' Telefonlar da farklı.' : ' Telefonla doğrulanamadı.';
      const base =
        phonesDiffer && nameAgrees
          ? finding(
              order,
              'MANIFEST_TELEFON_UYUSMUYOR',
              'YUKSEK',
              `Manifest alıcısının adı siparişle ${similarity === 1 ? 'aynı' : 'benzer'} (benzerlik ${similarity}) ama telefonu farklı; AWB aynı ya da benzer adlı başka birine ait olabilir.`
            )
          : nameAgrees
            ? finding(
                order,
                'MANIFEST_ALICI_BENZER',
                'ORTA',
                `Manifest alıcısı sipariş müşterisine benziyor ama aynı değil (benzerlik ${similarity}).${phoneNote}`
              )
            : finding(
                order,
                'MANIFEST_ALICI_UYUSMUYOR',
                'YUKSEK',
                `Manifest alıcısı sipariş müşterisiyle uyuşmuyor (benzerlik ${similarity}).${phoneNote}`
              );
      findings.push({
        ...base,
        benzerlik: similarity,
        manifest: {
          dosya,
          satirNo: index + 1,
          aliciAdi: text(row.aliciAdi),
          telefon: text(row.telefon),
        },
      });
    }
  });
  return {
    dosya,
    satirSayisi: rows.length,
    veritabanindaOlmayanAwb: missing,
    kontrolEdilenAwb: checked,
    bulgular: siralaBulgular(findings),
  };
}

const DAY_MS = 86_400_000;
/** Longest namesake list per finding; adasSayisi still counts all of them. */
export const ADAS_LISTE_SINIRI = 20;

/** Word-order-insensitive keys: letter-preserving, passport and plain folds. */
function adasAnahtarlari(name: string): string[] {
  const forms: Array<[string, string]> = [
    ['H', normalizeName(name)],
    ['P', foldName(name, 'PASAPORT')],
    ['B', foldName(name, 'BASIT')],
  ];
  // A placeholder or empty name folds to '' and has no namesakes.
  return forms
    .filter(([, form]) => form)
    .map(([scheme, form]) => `${scheme}:${form.split(' ').sort().join(' ')}`);
}

function tarihMs(value: string): number | null {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The removed matcher searched every order of the tenant and kept the first
 * name match, so an AWB may sit on a namesake's order while the name still
 * looks right. Flags each AWB holder whose folded name is shared by another
 * order of the same tenant, within `pencereGun` days of creation when given.
 * An order with an unknown date is always kept as a namesake.
 */
export function adasBulgulari(orders: readonly AuditOrder[], pencereGun: number | null): Bulgu[] {
  const byKey = new Map<string, AuditOrder[]>();
  for (const order of orders)
    for (const key of adasAnahtarlari(order.musteriAdi)) {
      const scoped = `${order.tenantId}\u0000${key}`;
      const list = byKey.get(scoped);
      if (list) list.push(order);
      else byKey.set(scoped, [order]);
    }
  const findings: Bulgu[] = [];
  for (const holder of orders) {
    if (!holder.awb) continue;
    const holderMs = tarihMs(holder.olusturmaTarihi);
    const holderPhone = normalizePhone(holder.telefon);
    const namesakes = new Map<string, AdasSiparis>();
    for (const key of adasAnahtarlari(holder.musteriAdi))
      for (const other of byKey.get(`${holder.tenantId}\u0000${key}`) ?? []) {
        if (other.id === holder.id || namesakes.has(other.id)) continue;
        const otherMs = tarihMs(other.olusturmaTarihi);
        const delta = holderMs === null || otherMs === null ? null : otherMs - holderMs;
        if (pencereGun !== null && delta !== null && Math.abs(delta) > pencereGun * DAY_MS)
          continue;
        const otherPhone = normalizePhone(other.telefon);
        namesakes.set(other.id, {
          siparisId: other.id,
          musteriAdi: other.musteriAdi,
          telefon: other.telefon,
          lojistikDurumu: other.lojistikDurumu,
          awb: other.awbHam,
          olusturmaTarihi: other.olusturmaTarihi,
          gunFarki: delta === null ? null : Math.round(delta / DAY_MS),
          ayniTelefon: holderPhone && otherPhone ? holderPhone === otherPhone : null,
        });
      }
    if (namesakes.size === 0) continue;
    const list = [...namesakes.values()].sort(
      (a, b) =>
        Math.abs(a.gunFarki ?? Number.POSITIVE_INFINITY) -
          Math.abs(b.gunFarki ?? Number.POSITIVE_INFINITY) || a.siparisId.localeCompare(b.siparisId)
    );
    const withoutAwb = list.filter((item) => !item.awb).length;
    const otherPhone = list.filter((item) => item.ayniTelefon === false).length;
    const window = pencereGun === null ? '' : ` (±${pencereGun} gün)`;
    findings.push({
      ...finding(
        holder,
        'BELIRSIZ_ADAS',
        'ORTA',
        `Belirsiz: adaş. Bu butikte katlanmış adı aynı ${list.length} sipariş daha var${window}; ` +
          `eski eşleştirme ilk bulduğu siparişi seçtiği için AWB bunlardan birine ait olabilir. ` +
          `AWB'siz: ${withoutAwb}, telefonu farklı: ${otherPhone}.`
      ),
      adasSayisi: list.length,
      adaslar: list.slice(0, ADAS_LISTE_SINIRI),
    });
  }
  return siralaBulgular(findings);
}
