import { PublicResourceError } from '../publicFetch';

/** Scope fields the session middleware itself writes into every write body. */
const OTURUM_ALANLARI = new Set(['tenant_id', 'tenantId']);

/** v2 data always belongs to exactly one tenant: 'all' and missing scopes are refused. */
export function v2Tenant(tenant: unknown): string {
  if (typeof tenant !== 'string' || tenant === 'all' || !/^[a-zA-Z0-9_-]{1,100}$/.test(tenant))
    throw new PublicResourceError('Bir butik seçilmelidir.', 400);
  return tenant;
}

/**
 * Returns only the allowed fields of a JSON body. Unknown fields are refused
 * instead of being silently ignored; the session's scope fields are skipped.
 */
export function v2GovdesiniAyikla<K extends string>(
  body: unknown,
  alanlar: readonly K[]
): Partial<Record<K, unknown>> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new PublicResourceError('Geçersiz istek gövdesi.', 400);
  const izinli = new Set<string>(alanlar);
  const sonuc: Partial<Record<K, unknown>> = {};
  for (const [key, value] of Object.entries(body)) {
    if (OTURUM_ALANLARI.has(key)) continue;
    if (!izinli.has(key))
      throw new PublicResourceError(`Bilinmeyen alan: ${key.slice(0, 50)}`, 400);
    sonuc[key as K] = value;
  }
  return sonuc;
}
