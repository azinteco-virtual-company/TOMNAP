import { fetchWithRetry } from '../../lib/apiClient';

// Client-side copy of the server contract (src/server/services/kargo/manifestMatching.ts).
// Kept separate on purpose: browser code never imports server modules.
export type SatirDurumu =
  | 'ONERILDI'
  | 'BELIRSIZ'
  | 'ZAYIF_ADAY'
  | 'ZATEN_BAGLI'
  | 'CAKISMA'
  | 'ESLESME_YOK'
  | 'GECERSIZ_AWB';
export type EslesmeTipi = 'TELEFON' | 'SIPARIS_KODU' | 'ISIM';

export interface EslesmeAdayi {
  siparisId: string;
  musteriAdi: string;
  telefon: string;
  lojistikDurumu: string;
  eslesmeTipi: EslesmeTipi;
  guc: 'GUCLU' | 'ZAYIF';
  skor: number;
}

export interface ManifestSatirOnerisi {
  satirNo: number;
  takipNo: string;
  aliciAdi: string;
  telefon: string;
  agirlikKg: number | null;
  referansNo: string;
  durum: SatirDurumu;
  belirsizlikSebebi: string | null;
  onerilenSiparisId: string | null;
  bagliSiparisId: string | null;
  adaylar: EslesmeAdayi[];
}

export interface Cakisma {
  satirNo: number;
  takipNo: string;
  siparisId: string;
  musteriAdi: string;
  sebep: string;
  mevcutAwb: string;
  eslesmeTipi: EslesmeTipi | null;
}

export interface EslesmeRaporu {
  satirlar: ManifestSatirOnerisi[];
  cakismalar: Cakisma[];
  ozet: Partial<Record<SatirDurumu, number>>;
}

export interface EslesmeSecimi {
  siparisId: string;
  takipNo: string;
  agirlikKg: number | null;
}

export interface OnaySonucu {
  basarili: boolean;
  mesaj: string;
  uygulananlar: Array<{ siparisId: string; takipNo: string; tekrar: boolean }>;
  reddedilenler: Array<{ siparisId: string; takipNo: string; sebep: string; mevcutAwb?: string }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Suggestions only; the server writes nothing for this request. */
export async function onerileriGetir(
  dosyaBase64: string,
  dosyaAdi: string,
  signal?: AbortSignal
): Promise<EslesmeRaporu> {
  const response = await fetchWithRetry('/api/kargo/manifesto-eslestirme/oneriler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dosya_base64: dosyaBase64, dosya_adi: dosyaAdi }),
    timeoutMs: 30_000,
    signal,
  });
  const data: unknown = await response.json();
  if (!isObject(data) || !Array.isArray(data.satirlar) || !Array.isArray(data.cakismalar))
    throw new Error('Eşləşdirmə təklifləri oxuna bilmədi.');
  return {
    satirlar: data.satirlar as ManifestSatirOnerisi[],
    cakismalar: data.cakismalar as Cakisma[],
    ozet: isObject(data.ozet) ? (data.ozet as Partial<Record<SatirDurumu, number>>) : {},
  };
}

/** Writes only the pairs the user selected; any rejection writes nothing. */
export async function eslesmeleriOnayla(secimler: EslesmeSecimi[]): Promise<OnaySonucu> {
  const response = await fetchWithRetry('/api/kargo/manifesto-eslestirme/onayla', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eslesmeler: secimler }),
    timeoutMs: 30_000,
  });
  const data: unknown = await response.json();
  if (
    !isObject(data) ||
    typeof data.basarili !== 'boolean' ||
    !Array.isArray(data.uygulananlar) ||
    !Array.isArray(data.reddedilenler)
  )
    throw new Error('Təsdiq nəticəsi oxuna bilmədi.');
  return {
    basarili: data.basarili,
    mesaj: typeof data.mesaj === 'string' ? data.mesaj : '',
    uygulananlar: data.uygulananlar as OnaySonucu['uygulananlar'],
    reddedilenler: data.reddedilenler as OnaySonucu['reddedilenler'],
  };
}
