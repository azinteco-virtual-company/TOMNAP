import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '../config';

// Gemini API İstemcisi
export function getGeminiClient(): GoogleGenAI {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY sistemde tanımlı değil. Lütfen .env dosyasından ekleyin.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Model kota ve meşguliyet durumu takibi (Kısa süreli Cooldown)
export const modelCooldownMap = new Map<string, number>();

export function getPrioritizedModels(preferredModels?: string[]): string[] {
  // En kararlı ve ücretsiz kota desteği olan çalışan modeller
  const baseList = preferredModels || [
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  const now = Date.now();
  const ready: string[] = [];
  const inCooldown: string[] = [];

  for (const m of baseList) {
    const expireTime = modelCooldownMap.get(m) || 0;
    if (now > expireTime) {
      ready.push(m);
    } else {
      inCooldown.push(m);
    }
  }

  // Daima en azından hazır modelleri öncelikli kıl
  return ready.length > 0 ? [...ready, ...inCooldown] : baseList;
}

// Gemini API Çağrıları için Dayanıklı Model Fallback & Retry Mekanizması (503 / 429 / Tool Quota Koruması)
export async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    models?: string[];
  }
) {
  const modelsToTry = getPrioritizedModels(params.models);
  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    
    // 1. Adım: İlk olarak kullanıcının istediği yapılandırma ile çağrı yap (ör. googleSearch aracı)
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      // Başarılı çağrıda bu modelin cooldown kaydını kaldır
      modelCooldownMap.delete(model);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded');

      console.warn(`[Gemini Deneme] Model '${model}' ilk çağrıda yanıt veremedi (${err?.status || (is429 ? 'Kota 429' : '503 Yoğunluk')})`);

      // 2. Adım: Eğer 'googleSearch' aracı nedeniyle 429 kota hatası veya araç uyumsuzluğu oluştuysa,
      // aynı modeli araçsız (salt Vision veya salt Metin) olarak anında tekrar dene!
      if (params.config?.tools && (is429 || is503)) {
        try {
          console.log(`[Gemini Kurtarma] '${model}' arama aracı kotası aşıldı, araçsız salt analiz modunda deneniyor...`);
          const fallbackConfig = { ...params.config };
          delete fallbackConfig.tools;

          const recoveryResponse = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: Object.keys(fallbackConfig).length > 0 ? fallbackConfig : undefined,
          });
          modelCooldownMap.delete(model);
          return recoveryResponse;
        } catch (recoveryErr: any) {
          console.warn(`[Gemini Kurtarma] '${model}' araçsız modda da yanıt veremedi:`, recoveryErr?.message || recoveryErr);
          lastError = recoveryErr;
        }
      }

      // Sadece 5 saniyelik geçici cooldown ata (uzun süre modeli kilitleme)
      if (is429 || is503) {
        modelCooldownMap.set(model, Date.now() + 5_000);
      }

      // Bir sonraki modele geçmeden önce kısa bir bekleme (500ms)
      if (i < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // 3. Adım: Tüm modeller denendikten sonra hala yanıt alınamadıysa:
  // Son bir kez 'gemini-2.5-flash' ile araçsız temel modda kurtarmayı dene
  try {
    console.log('[Gemini Son Kurtarma] gemini-2.5-flash ile araçsız acil durum çağrısı yapılıyor...');
    const emergencyConfig = params.config ? { ...params.config } : undefined;
    if (emergencyConfig?.tools) delete emergencyConfig.tools;

    const emergencyResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: params.contents,
      config: emergencyConfig,
    });
    return emergencyResponse;
  } catch (finalEmergencyErr) {
    console.error('[Gemini Son Kurtarma Başarısız]:', finalEmergencyErr);
  }

  const errStr = lastError?.message || '';
  if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE')) {
    throw new Error('Google Yapay Zeka modeli şu anda yoğun talep görüyor (503). Lütfen birkaç saniye sonra tekrar deneyin.');
  }
  if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
    throw new Error('Google Yapay Zeka sorgu kotası şu an için doldu (429). Lütfen kısa bir süre sonra tekrar deneyin.');
  }
  throw lastError || new Error('Yapay zeka yanıt üretemedi.');
}
