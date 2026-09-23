import {
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
  | 'MANIFEST_ALICI_BENZER';
export type Onem = 'YUKSEK' | 'ORTA';

export interface AuditOrder {
  id: string;
  tenantId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  /** Normalized AWB; orders without an AWB are not audited. */
  awb: string;
  /** AWB exactly as stored. */
  awbHam: string;
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
  aciklama: string;
  benzerlik?: number;
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
  const awb = normalizeAwb(record.uluslararasi_kargo_kodu);
  if (!id || !tenantId || !awb) return null;
  return {
    id,
    tenantId,
    musteriAdi: text(record.musteri_adi),
    telefon: text(record.telefon_numarasi),
    lojistikDurumu: text(record.lojistik_durumu),
    awb,
    awbHam: text(record.uluslararasi_kargo_kodu),
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
  const byAwb = new Map<string, AuditOrder[]>();
  for (const order of orders) {
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
  for (const order of orders) {
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
      if (rowName && rowName === normalizeName(order.musteriAdi)) continue;
      const similarity = nameSimilarity(row.aliciAdi, order.musteriAdi);
      const phoneNote =
        rowPhone && orderPhone ? ' Telefonlar da farklı.' : ' Telefonla doğrulanamadı.';
      const base = finding(
        order,
        similarity >= ZAYIF_ESLESME_ESIGI ? 'MANIFEST_ALICI_BENZER' : 'MANIFEST_ALICI_UYUSMUYOR',
        similarity >= ZAYIF_ESLESME_ESIGI ? 'ORTA' : 'YUKSEK',
        similarity >= ZAYIF_ESLESME_ESIGI
          ? `Manifest alıcısı sipariş müşterisine benziyor ama aynı değil (benzerlik ${similarity}).${phoneNote}`
          : `Manifest alıcısı sipariş müşterisiyle uyuşmuyor (benzerlik ${similarity}).${phoneNote}`
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
