/**
 * Kanada-Bakü E-Ticaret & Lojistik Yönetim Platformu
 * Robust API İstemcisi: AbortController Zaman Aşımı & Retry (Yeniden Deneme) Mekanizması
 * Ağ dalgalanmalarında ve geçici 5xx/429 durumlarında kotayı korur ve takılmaları önler.
 */

export interface FetchRetryOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 9000,
    retries = 2,
    backoffMs = 700,
    ...fetchOptions
  } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`İstek zaman aşımına uğradı (${timeoutMs}ms)`));
    }, timeoutMs);

    // Dışarıdan bir signal verilmişse onu da dinle
    const userSignal = fetchOptions.signal;
    if (userSignal) {
      if (userSignal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('İstek kullanıcı tarafından iptal edildi.');
      }
      userSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Başarılı veya müşteri hataları (400, 404 vs. tekrar denenmemeli)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }

      // 429 (Kota aşımı) veya 5xx geçici sunucu hatalarında backoff ile bekle
      if (attempt < retries) {
        const delay = backoffMs * Math.pow(1.8, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      if (userSignal?.aborted) {
        throw err;
      }

      if (attempt < retries) {
        const delay = backoffMs * Math.pow(1.8, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`İstek ${retries + 1} deneme sonrasında başarısız oldu: ${url}`);
}

export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: FetchRetryOptions = {}
): Promise<T> {
  const res = await fetchWithRetry(url, options);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let parsedJson: any = null;
    try {
      parsedJson = JSON.parse(errText);
    } catch {}
    throw new Error(parsedJson?.hata || parsedJson?.mesaj || `Sunucu hatası (${res.status})`);
  }
  return res.json();
}
