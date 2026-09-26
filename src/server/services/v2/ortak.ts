import { PublicResourceError } from '../publicFetch';

/** Scope fields the session middleware itself writes into every write body. */
const OTURUM_ALANLARI = new Set(['tenant_id', 'tenantId']);

/** Rows per request; the server may answer fewer (its "max rows"). */
const SAYFA = 1000;
/** Upper bound of one complete read, against an endless loop on a broken answer. */
const SAYFA_SINIRI = 200_000;

/**
 * Reads every row of one query (Codex R3 F10). PostgREST answers at most its "max rows"
 * per request (1000 on Supabase) and does not say when it cuts, so one request is not a
 * complete list. The query must have a stable total order; it is read page by page
 * until the exact count from the first page is reached. A page that brings nothing
 * before that is a failure, never a shorter list.
 */
export async function tumSatirlar(
  sorgu: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>,
  mesaj: string
): Promise<unknown[]> {
  const satirlar: unknown[] = [];
  let hedef: number | null = null;
  for (;;) {
    const { data, error, count } = await sorgu(satirlar.length, satirlar.length + SAYFA - 1);
    if (error || !Array.isArray(data)) throw new PublicResourceError(mesaj, 503);
    if (hedef === null) hedef = typeof count === 'number' ? count : null;
    satirlar.push(...data);
    // Without a count (an answer that does not support it) a short page ends the list.
    if (hedef === null ? data.length < SAYFA : satirlar.length >= hedef) return satirlar;
    if (data.length === 0 || satirlar.length > SAYFA_SINIRI)
      throw new PublicResourceError(mesaj, 503);
  }
}

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
