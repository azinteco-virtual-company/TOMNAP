import { Type } from '@google/genai';
import { supabase } from '../supabase';
import { PublicResourceError } from '../publicFetch';
import { generateContentWithRetryAndFallback, getGeminiClient } from '../gemini';
import { completeCustomerDirectory } from '../listPagination';
import { musteriOner, type MusteriAdayi } from '../musteriOneri';
import { satirTenanti } from '../musteriGecmisi';
import { kullanicilarVeritabani, musterilerVeritabani } from '../state';
import { ROL_GRUPLARI, rolGrubunda } from '../../../shared/roller';
import { v2GovdesiniAyikla, v2Tenant } from './ortak';

/**
 * v2 sipariş önerisi (A9): AI mesajdan müşteri alanlarını ve SATIRLARI çıkarır,
 * sunucu müşteriyi eşleştirir; hiçbir şey yazılmaz, insan onaylar.
 * A1 kuralı: AI'a hiçbir müşteri listesi ya da başka müşterinin verisi gitmez;
 * istem yalnız gönderilen mesajı içerir.
 */

export const HAM_MESAJ_SINIRI = 20_000;

export interface V2SatirOnerisi {
  urun_aciklamasi: string;
  beden: string | null;
  renk: string | null;
  adet: number;
  birim_satis_fiyati_azn: number;
  kaynak_ulke: 'CA' | 'US';
}
export interface V2SiparisOnerisi {
  musteri_adi: string;
  telefon_numarasi: string | null;
  instagram_kullanici_adi: string | null;
  teslimat_sehri: string | null;
  teslimat_adresi: string | null;
  ozel_not: string | null;
  satirlar: V2SatirOnerisi[];
}
export interface V2AyristirmaSonucu {
  oneri: V2SiparisOnerisi;
  eksikBilgiler: string[];
  /** Unique exact phone match; the form may link it (the person still confirms). */
  musteriEslesen: { musteri_id: string; ad_soyad: string } | null;
  musteriAdaylari: MusteriAdayi[];
}

const SISTEM_TALIMATI = `Sen Instagram ve WhatsApp üzerinden satış yapan bir butiğin sipariş ayrıştırma asistanısın.
Görevin yalnızca SANA VERİLEN MESAJDAN alan çıkarmak.

KURALLAR:
1. Müşteri bilgilerini (ad, telefon, Instagram kullanıcı adı, şehir, adres) yalnızca mesajda yazdığı gibi çıkar.
   Sana hiçbir müşteri listesi verilmez; müşteriyi tanımaya, eşleştirmeye veya adını düzeltmeye çalışma. Eşleştirmeyi sunucu yapar.
2. Mesajdaki HER FARKLI ÜRÜN ayrı bir satırdır ("satirlar"). Aynı üründen birden fazla isteniyorsa tek satırda "adet" ile yaz.
   Her satır için: urun_aciklamasi, beden, renk, adet, birim_fiyat (AZN, bir adedin fiyatı).
   Fiyat mesajda yoksa birim_fiyat alanını boş bırak.
3. Teslimat, paketleme veya kurye ile ilgili özel istek varsa ozel_not alanına yaz.
4. Eksik ya da belirsiz her bilgiyi kısa Türkçe cümlelerle eksik_bilgiler listesine ekle.`;

const SEMA = {
  type: Type.OBJECT,
  properties: {
    musteri_adi: { type: Type.STRING },
    telefon_numarasi: { type: Type.STRING },
    instagram_kullanici_adi: { type: Type.STRING },
    teslimat_sehri: { type: Type.STRING },
    teslimat_adresi: { type: Type.STRING },
    ozel_not: { type: Type.STRING },
    satirlar: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          urun_aciklamasi: { type: Type.STRING },
          beden: { type: Type.STRING },
          renk: { type: Type.STRING },
          adet: { type: Type.INTEGER },
          birim_fiyat: { type: Type.NUMBER },
        },
        required: ['urun_aciklamasi', 'adet'],
      },
    },
    eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['musteri_adi', 'satirlar', 'eksik_bilgiler'],
};

function kayit(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function metin(value: unknown, enCok: number): string | null {
  if (typeof value !== 'string') return null;
  const temiz = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
  return temiz ? temiz.slice(0, enCok) : null;
}

/** Normalises the AI answer into editable suggestions; nothing here is trusted as final. */
export function aiYanitiniOneriyeCevir(raw: unknown): {
  oneri: V2SiparisOnerisi;
  eksikBilgiler: string[];
} {
  const r = kayit(raw);
  const eksik = Array.isArray(r.eksik_bilgiler)
    ? r.eksik_bilgiler
        .map((x) => metin(x, 200))
        .filter((x): x is string => !!x)
        .slice(0, 20)
    : [];
  const satirlar = (Array.isArray(r.satirlar) ? r.satirlar : [])
    .slice(0, 100)
    .flatMap((value, index) => {
      const s = kayit(value);
      const aciklama = metin(s.urun_aciklamasi, 500);
      if (!aciklama) return [];
      const adet = Number(s.adet);
      const fiyat = Number(s.birim_fiyat);
      const fiyatVar =
        s.birim_fiyat !== undefined &&
        s.birim_fiyat !== null &&
        Number.isFinite(fiyat) &&
        fiyat >= 0 &&
        fiyat < 1_000_000;
      if (!fiyatVar) eksik.push(`${index + 1}. satırın fiyatı yok.`);
      return [
        {
          urun_aciklamasi: aciklama,
          beden: metin(s.beden, 50),
          renk: metin(s.renk, 50),
          adet: Number.isInteger(adet) && adet >= 1 && adet <= 1000 ? adet : 1,
          birim_satis_fiyati_azn: fiyatVar ? Math.round(fiyat * 100) / 100 : 0,
          // The country of purchase is not in a customer message; the person chooses it.
          kaynak_ulke: 'CA' as const,
        },
      ];
    });
  if (satirlar.length === 0) eksik.push('Mesajda ürün bulunamadı.');
  return {
    oneri: {
      musteri_adi: metin(r.musteri_adi, 150) ?? '',
      telefon_numarasi: metin(r.telefon_numarasi, 50),
      instagram_kullanici_adi: metin(r.instagram_kullanici_adi, 100),
      teslimat_sehri: metin(r.teslimat_sehri, 100),
      teslimat_adresi: metin(r.teslimat_adresi, 500),
      ozel_not: metin(r.ozel_not, 1000),
      satirlar,
    },
    eksikBilgiler: eksik,
  };
}

async function tenantMusterileri(tenantId: string) {
  const rows: unknown[] =
    !supabase || tenantId === 'demo_sandbox'
      ? musterilerVeritabani.filter((m) => satirTenanti(m) === tenantId)
      : await completeCustomerDirectory(tenantId);
  return rows
    .map(kayit)
    .filter(
      (m) =>
        typeof m.id === 'string' && typeof m.ad_soyad === 'string' && satirTenanti(m) === tenantId
    )
    .map((m) => ({
      id: m.id as string,
      ad_soyad: m.ad_soyad as string,
      telefon: typeof m.telefon === 'string' ? m.telefon : undefined,
    }));
}

/** Parses one message into an order suggestion for the session tenant. Writes nothing. */
export async function v2SiparisAyristir(
  tenant: unknown,
  body: unknown
): Promise<V2AyristirmaSonucu> {
  const tenantId = v2Tenant(tenant);
  const alanlar = v2GovdesiniAyikla(body, ['ham_mesaj'] as const);
  const hamMesaj = typeof alanlar.ham_mesaj === 'string' ? alanlar.ham_mesaj.trim() : '';
  if (!hamMesaj) throw new PublicResourceError('Ayrıştırılacak mesaj gereklidir.', 400);
  if (hamMesaj.length > HAM_MESAJ_SINIRI)
    throw new PublicResourceError(`Mesaj en fazla ${HAM_MESAJ_SINIRI} karakter olabilir.`, 413);
  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    throw new PublicResourceError('AI hizmeti yapılandırılmamış.', 503);
  }
  const yanit = await generateContentWithRetryAndFallback(ai, {
    // Only the message itself: no customer directory, no other order (A1, CLAUDE.md).
    contents: `Mesaj:\n"""\n${hamMesaj}\n"""`,
    config: {
      systemInstruction: SISTEM_TALIMATI,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: SEMA,
    },
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(yanit?.text || '{}');
  } catch {
    throw new PublicResourceError('AI yanıtı okunamadı.', 503);
  }
  const { oneri, eksikBilgiler } = aiYanitiniOneriyeCevir(parsed);
  const { eslesen, adaylar } = musteriOner(await tenantMusterileri(tenantId), {
    telefon: oneri.telefon_numarasi,
    ad: oneri.musteri_adi,
  });
  return {
    oneri,
    eksikBilgiler,
    musteriEslesen: eslesen ? { musteri_id: eslesen.id, ad_soyad: eslesen.ad_soyad } : null,
    musteriAdaylari: adaylar,
  };
}

/** Active users of the tenant who may own an order (for the owner picker). */
export async function siparisSahipAdaylari(
  tenant: unknown
): Promise<Array<{ id: string; adSoyad: string; rol: string }>> {
  const tenantId = v2Tenant(tenant);
  if (!supabase || tenantId === 'demo_sandbox')
    return kullanicilarVeritabani
      .filter(
        (u) => u.tenant_id === tenantId && u.durum === 'AKTIF' && rolGrubunda(u.rol, 'ORDER_OWNERS')
      )
      .map((u) => ({ id: u.id, adSoyad: u.ad_soyad, rol: u.rol }));
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('id,tenant_id,ad_soyad,rol,durum')
    .eq('tenant_id', tenantId)
    .eq('durum', 'AKTIF')
    .in('rol', [...ROL_GRUPLARI.ORDER_OWNERS]);
  if (error || !Array.isArray(data)) throw new PublicResourceError('Ekip okunamadı.', 503);
  const rows: unknown[] = data;
  return rows
    .map(kayit)
    .flatMap((u) =>
      u.tenant_id === tenantId && typeof u.id === 'string' && rolGrubunda(u.rol, 'ORDER_OWNERS')
        ? [{ id: u.id, adSoyad: String(u.ad_soyad ?? ''), rol: String(u.rol) }]
        : []
    );
}
