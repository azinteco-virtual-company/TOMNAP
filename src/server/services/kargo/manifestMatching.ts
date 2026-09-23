/**
 * Manifest → order matching. This module is pure: it never reads or writes
 * storage and produces SUGGESTIONS only. AWB codes are written solely after an
 * explicit human confirmation (see awbMatchStore.ts).
 *
 * Strong evidence: an exact normalized phone number or an exact order code.
 * Weak evidence: name similarity, returned only as a scored candidate.
 */

export type EslesmeTipi = 'TELEFON' | 'SIPARIS_KODU' | 'ISIM';
export type EslesmeGucu = 'GUCLU' | 'ZAYIF';
export type SatirDurumu =
  | 'ONERILDI'
  | 'BELIRSIZ'
  | 'ZAYIF_ADAY'
  | 'ZATEN_BAGLI'
  | 'CAKISMA'
  | 'ESLESME_YOK'
  | 'GECERSIZ_AWB';
export type BelirsizlikSebebi =
  | 'COKLU_SIPARIS'
  | 'MANIFESTTE_TEKRAR_AWB'
  | 'SIPARIS_BIRDEN_FAZLA_SATIRDA';
export type CakismaSebebi = 'MEVCUT_AWB' | 'AWB_BASKA_SIPARISTE' | 'TESLIM_EDILDI';

export const TESLIM_EDILDI = 'TESLIM_EDILDI';
/** Name-only candidates below this Sørensen–Dice score are not shown. */
export const ZAYIF_ESLESME_ESIGI = 0.5;
/** At most this many weak candidates are listed for one manifest row. */
export const ZAYIF_ADAY_SINIRI = 5;
/** New AWB codes: 4–40 characters, uppercase letters, digits and hyphens. */
export const AWB_DESENI = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

export interface ManifestSatiriGirdisi {
  takipNo: string;
  aliciAdi: string;
  telefon?: string;
  agirlikKg?: number;
  referansNo?: string;
}

/** Minimal order snapshot used for matching; never contains private extras. */
export interface SiparisAdayi {
  id: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  /** Normalized AWB; empty string means the order has no AWB. */
  awb: string;
  /** AWB exactly as stored, for display in conflict lists. */
  awbGosterim: string;
  /** Normalized Canadian order/tracking code. */
  kanadaTakipKodu: string;
}

export interface EslesmeAdayi {
  siparisId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  eslesmeTipi: EslesmeTipi;
  guc: EslesmeGucu;
  skor: number;
}

export interface Cakisma {
  satirNo: number;
  takipNo: string;
  siparisId: string;
  musteriAdi: string;
  sebep: CakismaSebebi;
  mevcutAwb: string;
  eslesmeTipi: EslesmeTipi | null;
}

export interface ManifestSatirOnerisi {
  satirNo: number;
  takipNo: string;
  aliciAdi: string;
  telefon: string;
  agirlikKg: number | null;
  referansNo: string;
  durum: SatirDurumu;
  belirsizlikSebebi: BelirsizlikSebebi | null;
  /** Pre-selected only for exactly one strong, unblocked, unambiguous order. */
  onerilenSiparisId: string | null;
  /** Set when this AWB is already attached to exactly one order. */
  bagliSiparisId: string | null;
  adaylar: EslesmeAdayi[];
}

export interface EslesmeRaporu {
  satirlar: ManifestSatirOnerisi[];
  cakismalar: Cakisma[];
  ozet: Record<SatirDurumu, number> & { toplamSatir: number; cakismaSayisi: number };
}

// Parser/AI defaults are placeholders, not identities: they behave as empty.
const YER_TUTUCU_ISIMLER = new Set([
  'müştəri',
  'müşteri',
  'musteri',
  'bilinmeyen müşteri',
  'naməlum',
  'customer',
  'consignee',
  'unknown',
  'n a',
]);

/**
 * Unicode-aware name normalization. Letters such as ə, ş, ç, ğ, ı, ö, ü and
 * Cyrillic are preserved (no ASCII folding). Only case, compatibility forms,
 * punctuation and whitespace are normalized. An empty result matches nothing.
 */
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    // "İ".toLowerCase() yields "i" + U+0307; keep the plain letter i.
    .replace(/i̇/g, 'i')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return YER_TUTUCU_ISIMLER.has(normalized) ? '' : normalized;
}

/**
 * Phone numbers are compared as full digit strings. Azerbaijani local forms
 * (0XX XXX XX XX, XX XXX XX XX) and the 00 prefix are expanded to 994… so the
 * same number written differently compares equal. Partial numbers never match.
 */
export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const raw = String(value).trim();
  if (!raw || !/^[+\d\s().\-/]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) digits = `994${digits.slice(1)}`;
  else if (digits.length === 9 && !digits.startsWith('0')) digits = `994${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

/** Tracking/order codes: compatibility-normalized, whitespace-free, uppercase. */
export function normalizeAwb(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

/** Order references need at least four characters to count as evidence. */
export function normalizeCode(value: unknown): string {
  const code = normalizeAwb(value);
  return code.length >= 4 && code.length <= 100 ? code : '';
}

function sortedTokens(name: string): string {
  return name.split(' ').filter(Boolean).sort().join(' ');
}

function bigrams(value: string): Map<string, number> {
  const characters = Array.from(` ${value} `);
  const result = new Map<string, number>();
  for (let index = 0; index < characters.length - 1; index++) {
    const gram = characters[index] + characters[index + 1];
    result.set(gram, (result.get(gram) ?? 0) + 1);
  }
  return result;
}

function total(grams: Map<string, number>): number {
  let sum = 0;
  for (const count of grams.values()) sum += count;
  return sum;
}

function dice(left: Map<string, number>, right: Map<string, number>): number {
  let shared = 0;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) ?? 0);
  const size = total(left) + total(right);
  return size === 0 ? 0 : Math.round(((2 * shared) / size) * 1000) / 1000;
}

/**
 * Order-insensitive Sørensen–Dice similarity of character bigrams (0…1).
 * There is no substring shortcut: a short or empty name cannot "contain" others.
 */
export function nameSimilarity(left: unknown, right: unknown): number {
  const a = sortedTokens(normalizeName(left));
  const b = sortedTokens(normalizeName(right));
  if (!a || !b) return 0;
  if (a === b) return 1;
  return dice(bigrams(a), bigrams(b));
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** Runtime-checked conversion of a database or memory order row. */
export function toSiparisAdayi(row: unknown): SiparisAdayi | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  // Only string ids: confirmation compares ids as strings, so a numeric id
  // could be suggested but never confirmed.
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  return {
    id,
    musteriAdi: text(record.musteri_adi),
    telefon: text(record.telefon_numarasi),
    lojistikDurumu: text(record.lojistik_durumu),
    awb: normalizeAwb(record.uluslararasi_kargo_kodu),
    awbGosterim: text(record.uluslararasi_kargo_kodu),
    kanadaTakipKodu: normalizeCode(record.kanada_takip_kodu),
  };
}

function validWeight(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000
    ? value
    : null;
}

function candidate(
  order: SiparisAdayi,
  eslesmeTipi: EslesmeTipi,
  guc: EslesmeGucu,
  skor: number
): EslesmeAdayi {
  return {
    siparisId: order.id,
    musteriAdi: order.musteriAdi,
    telefon: order.telefon,
    lojistikDurumu: order.lojistikDurumu,
    eslesmeTipi,
    guc,
    skor,
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

interface PreparedOrder {
  order: SiparisAdayi;
  grams: Map<string, number> | null;
  blocked: boolean;
}

/**
 * Builds suggestions for parsed manifest rows against one tenant's orders.
 * Callers must pass only orders that belong to the requesting tenant.
 */
export function eslesmeOnerileriOlustur(
  rows: readonly ManifestSatiriGirdisi[],
  orders: readonly SiparisAdayi[]
): EslesmeRaporu {
  const byPhone = new Map<string, SiparisAdayi[]>();
  const byCode = new Map<string, SiparisAdayi[]>();
  const byAwb = new Map<string, SiparisAdayi[]>();
  const prepared: PreparedOrder[] = [];
  for (const order of orders) {
    const phone = normalizePhone(order.telefon);
    if (phone) push(byPhone, phone, order);
    const idCode = normalizeCode(order.id);
    if (idCode) push(byCode, idCode, order);
    if (order.kanadaTakipKodu && order.kanadaTakipKodu !== idCode)
      push(byCode, order.kanadaTakipKodu, order);
    if (order.awb) push(byAwb, order.awb, order);
    const name = sortedTokens(normalizeName(order.musteriAdi));
    prepared.push({
      order,
      grams: name ? bigrams(name) : null,
      blocked: order.lojistikDurumu === TESLIM_EDILDI || order.awb !== '',
    });
  }

  const awbCounts = new Map<string, number>();
  for (const row of rows) {
    const awb = normalizeAwb(row.takipNo);
    if (awb) awbCounts.set(awb, (awbCounts.get(awb) ?? 0) + 1);
  }

  const conflicts: Cakisma[] = [];
  const suggestions = rows.map((row, index): ManifestSatirOnerisi => {
    const satirNo = index + 1;
    const takipNo = normalizeAwb(row.takipNo);
    const base: ManifestSatirOnerisi = {
      satirNo,
      takipNo,
      aliciAdi: text(row.aliciAdi),
      telefon: text(row.telefon),
      agirlikKg: validWeight(row.agirlikKg),
      referansNo: text(row.referansNo),
      durum: 'ESLESME_YOK',
      belirsizlikSebebi: null,
      onerilenSiparisId: null,
      bagliSiparisId: null,
      adaylar: [],
    };
    if (!AWB_DESENI.test(takipNo)) return { ...base, durum: 'GECERSIZ_AWB' };

    const holders = byAwb.get(takipNo) ?? [];
    if (holders.length === 1) return { ...base, durum: 'ZATEN_BAGLI', bagliSiparisId: holders[0].id };
    if (holders.length > 1) {
      for (const holder of holders)
        conflicts.push({
          satirNo,
          takipNo,
          siparisId: holder.id,
          musteriAdi: holder.musteriAdi,
          sebep: 'AWB_BASKA_SIPARISTE',
          mevcutAwb: holder.awbGosterim,
          eslesmeTipi: null,
        });
      return { ...base, durum: 'CAKISMA' };
    }

    const strongTypes = new Map<string, EslesmeTipi>();
    const phone = normalizePhone(row.telefon);
    for (const order of phone ? (byPhone.get(phone) ?? []) : []) strongTypes.set(order.id, 'TELEFON');
    const reference = normalizeCode(row.referansNo);
    for (const order of reference ? (byCode.get(reference) ?? []) : [])
      if (!strongTypes.has(order.id)) strongTypes.set(order.id, 'SIPARIS_KODU');

    const strong: EslesmeAdayi[] = [];
    let rowHasConflict = false;
    for (const { order } of prepared) {
      const type = strongTypes.get(order.id);
      if (!type) continue;
      const reason: CakismaSebebi | null =
        order.lojistikDurumu === TESLIM_EDILDI ? 'TESLIM_EDILDI' : order.awb ? 'MEVCUT_AWB' : null;
      if (reason) {
        rowHasConflict = true;
        conflicts.push({
          satirNo,
          takipNo,
          siparisId: order.id,
          musteriAdi: order.musteriAdi,
          sebep: reason,
          mevcutAwb: order.awbGosterim,
          eslesmeTipi: type,
        });
      } else strong.push(candidate(order, type, 'GUCLU', 1));
    }

    // Weak evidence never surfaces delivered orders or orders that already have an AWB.
    const weak: EslesmeAdayi[] = [];
    const rowName = sortedTokens(normalizeName(row.aliciAdi));
    if (rowName) {
      const rowGrams = bigrams(rowName);
      for (const { order, grams, blocked } of prepared) {
        if (blocked || !grams || strongTypes.has(order.id)) continue;
        const score = dice(rowGrams, grams);
        if (score >= ZAYIF_ESLESME_ESIGI) weak.push(candidate(order, 'ISIM', 'ZAYIF', score));
      }
      weak.sort((a, b) => b.skor - a.skor || a.siparisId.localeCompare(b.siparisId));
    }
    const adaylar = [...strong, ...weak.slice(0, ZAYIF_ADAY_SINIRI)];

    if (strong.length === 1) {
      if ((awbCounts.get(takipNo) ?? 0) > 1)
        return { ...base, adaylar, durum: 'BELIRSIZ', belirsizlikSebebi: 'MANIFESTTE_TEKRAR_AWB' };
      return { ...base, adaylar, durum: 'ONERILDI', onerilenSiparisId: strong[0].siparisId };
    }
    if (strong.length > 1)
      return { ...base, adaylar, durum: 'BELIRSIZ', belirsizlikSebebi: 'COKLU_SIPARIS' };
    if (weak.length > 0) return { ...base, adaylar, durum: 'ZAYIF_ADAY' };
    return { ...base, adaylar, durum: rowHasConflict ? 'CAKISMA' : 'ESLESME_YOK' };
  });

  // An order proposed for several rows is ambiguous for every one of them.
  const proposals = new Map<string, number>();
  for (const row of suggestions)
    if (row.onerilenSiparisId)
      proposals.set(row.onerilenSiparisId, (proposals.get(row.onerilenSiparisId) ?? 0) + 1);
  for (const row of suggestions) {
    if (row.onerilenSiparisId && (proposals.get(row.onerilenSiparisId) ?? 0) > 1) {
      row.onerilenSiparisId = null;
      row.durum = 'BELIRSIZ';
      row.belirsizlikSebebi = 'SIPARIS_BIRDEN_FAZLA_SATIRDA';
    }
  }

  const ozet: EslesmeRaporu['ozet'] = {
    toplamSatir: suggestions.length,
    cakismaSayisi: conflicts.length,
    ONERILDI: 0,
    BELIRSIZ: 0,
    ZAYIF_ADAY: 0,
    ZATEN_BAGLI: 0,
    CAKISMA: 0,
    ESLESME_YOK: 0,
    GECERSIZ_AWB: 0,
  };
  for (const row of suggestions) ozet[row.durum]++;
  return { satirlar: suggestions, cakismalar: conflicts, ozet };
}
