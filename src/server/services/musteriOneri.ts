import {
  nameSimilarity,
  normalizeName,
  normalizePhone,
  ZAYIF_ESLESME_ESIGI,
} from './kargo/manifestMatching';

/**
 * Server-side customer matching for parsed orders. The AI never sees the
 * customer directory (CLAUDE.md); it only extracts fields from the message.
 * A customer is linked only when exactly one of the tenant's customers has the
 * same normalized phone. Name similarity is returned as a suggestion and is
 * never written without a person choosing it.
 */
export interface MusteriKarti {
  id: string;
  ad_soyad: string;
  telefon?: string;
}

export interface MusteriAdayi {
  musteri_id: string;
  ad_soyad: string;
  /** 1 for a shared phone, otherwise the name similarity (0.5-1). */
  skor: number;
}

export interface MusteriOnerisi<T extends MusteriKarti> {
  eslesen: T | null;
  adaylar: MusteriAdayi[];
}

export const MUSTERI_ADAY_SINIRI = 5;

const aday = (customer: MusteriKarti, skor: number): MusteriAdayi => ({
  musteri_id: customer.id,
  ad_soyad: customer.ad_soyad,
  skor: Math.round(skor * 100) / 100,
});

/** Callers must pass only the requesting tenant's customers. */
export function musteriOner<T extends MusteriKarti>(
  customers: readonly T[],
  ipucu: { telefon?: unknown; ad?: unknown }
): MusteriOnerisi<T> {
  const phone = normalizePhone(ipucu.telefon);
  const samePhone = phone
    ? customers.filter((customer) => normalizePhone(customer.telefon) === phone)
    : [];
  const eslesen = samePhone.length === 1 ? samePhone[0] : null;
  const phoneCandidates = eslesen ? [] : samePhone.map((customer) => aday(customer, 1));
  const taken = new Set(samePhone.map((customer) => customer.id));
  const nameCandidates = normalizeName(ipucu.ad)
    ? customers
        .filter((customer) => !taken.has(customer.id) && normalizeName(customer.ad_soyad))
        .map((customer) => aday(customer, nameSimilarity(ipucu.ad, customer.ad_soyad)))
        .filter((candidate) => candidate.skor >= ZAYIF_ESLESME_ESIGI)
    : [];
  const adaylar = [...phoneCandidates, ...nameCandidates]
    .sort((a, b) => b.skor - a.skor || a.musteri_id.localeCompare(b.musteri_id))
    .slice(0, MUSTERI_ADAY_SINIRI);
  return { eslesen, adaylar };
}
