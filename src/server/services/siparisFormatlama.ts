// Otomatik Takip Kodu Üreticileri
export function uretKanadaTakipKodu(urunTanimi?: string): string {
  let storeCode = 'CA';
  if (urunTanimi) {
    const clean = urunTanimi.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.includes('ZARA')) storeCode = 'ZARA';
    else if (clean.includes('SEPHORA')) storeCode = 'SEPH';
    else if (clean.includes('KORS') || clean.includes('MICHAEL')) storeCode = 'MK';
    else if (clean.includes('TOMMY')) storeCode = 'TH';
    else if (clean.includes('NIKE')) storeCode = 'NIKE';
    else if (clean.includes('MASSIMO')) storeCode = 'MD';
    else if (clean.length >= 2) storeCode = clean.slice(0, 4);
  }
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `TOR-${storeCode}-${randomNum}`;
}

export function uretUluslararasiKargoKodu(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const prefixes = ['AZ-CARGO', 'KNB-AIR', 'GYD-EXP'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${p}-${randomNum}-YYZ`;
}

// Business fields without dedicated physical columns. Identity, tenant and
// access-control fields must never be hydrated from this JSON object.
export const SIPARIS_EK_ALANLAR = [
  'guncellenme_tarihi',
  'musteri_id',
  'musteri_tipi',
  'kanada_magaza_adi',
  'kanada_alis_fiyati_cad',
  'kanada_alis_fiyati_azn',
  'kargo_agirligi_kg',
  'kargo_ucreti_azn',
  'kanada_fatura_no',
  'kanada_fatura_gorseli',
  'kanada_gumruk_fin_kodu',
  'kanada_gumruk_pasaport_no',
  'islem_gecmisi',
] as const;

/** Preserve unedited extras while explicit top-level edits (including null)
 * take precedence. Unknown nested fields never become order properties. */
export function siparisEkVerileriniAl(input: any): Record<string, unknown> {
  const stored =
    input.ek_veriler && typeof input.ek_veriler === 'object' && !Array.isArray(input.ek_veriler)
      ? input.ek_veriler
      : {};
  const result: Record<string, unknown> = {};
  for (const field of SIPARIS_EK_ALANLAR) {
    if (Object.hasOwn(stored, field) && stored[field] !== undefined) result[field] = stored[field];
    if (Object.hasOwn(input, field) && input[field] !== undefined) result[field] = input[field];
  }
  return result;
}

// Supabase tablosunda tanımlı fiziksel ve yazılabilir kolonlar (Tenant İzolasyonlu)
export const SUPABASE_GECERLI_KOLONLAR = new Set([
  'tenant_id',
  'ham_mesaj',
  'siparis_kaynagi',
  'musteri_adi',
  'instagram_kullanici_adi',
  'telefon_numarasi',
  'teslimat_sehri',
  'teslimat_adresi',
  'urun_aciklamasi',
  'beden_veya_olcu',
  'renk',
  'adet',
  'toplam_tutar',
  'alinan_tutar',
  'para_birimi',
  'finans_durumu',
  'lojistik_durumu',
  'baku_kurye_id',
  'baku_kurye_adi',
  'baku_kurye_bolgesi',
  'teslim_tarihi',
  'teslim_eden_kisi',
  'baku_tahsilat_notu',
  'kanada_takip_kodu',
  'uluslararasi_kargo_kodu',
  'eksik_bilgiler',
  'ai_guven_skoru',
  'is_demo',
  'ek_veriler',
]);

/**
 * Sipariş notu sözleşmesi (Codex R3 F8): teslimat notu (ozel_not) veritabanında
 * baku_tahsilat_notu'nun başında "[TƏLİMAT: …]" etiketi olarak durur; v1 ve v2 aynı
 * yeri okur ve yazar. Hiçbir migration fiziksel bir ozel_not kolonu oluşturmaz; eski bir
 * şemada varsa yalnız etiket yokken okunur (ve v1 düzenlemesi onu da eşitler).
 * Köşeli parantez etiketi bölmesin diye nottaki [ ] yuvarlak paranteze çevrilir;
 * tomnap_v2_siparis_olustur (20260925160000) aynısını yapar.
 */
const TALIMAT_ETIKETI = /\[(?:TƏLİMAT|TALİMAT):\s*([\s\S]*?)\]/i;
const TALIMAT_ETIKETLERI = /\[(?:TƏLİMAT|TALİMAT):\s*[\s\S]*?\]/gi;

/** baku_tahsilat_notu'ndan teslimat notunu ayırır; etiket yoksa ozelNot null. */
export function talimatiAyir(bakuTahsilatNotu: unknown): {
  ozelNot: string | null;
  tahsilatNotu: string;
} {
  const metin = typeof bakuTahsilatNotu === 'string' ? bakuTahsilatNotu.trim() : '';
  const eslesme = metin.match(TALIMAT_ETIKETI);
  if (!eslesme) return { ozelNot: null, tahsilatNotu: metin };
  return {
    ozelNot: eslesme[1].trim(),
    tahsilatNotu: metin.replace(TALIMAT_ETIKETLERI, '').trim(),
  };
}

/** Teslimat notunu tahsilat notunun başına etiket olarak ekler (boş not: etiket yok). */
export function talimatiKatla(tahsilatNotu: string, ozelNot: unknown): string {
  const not = typeof ozelNot === 'string' ? ozelNot.trim() : '';
  if (!not) return tahsilatNotu;
  const guvenli = not.replace(/\[/g, '(').replace(/\]/g, ')');
  return `[TƏLİMAT: ${guvenli}] ${tahsilatNotu}`.trim();
}

// Supabase'e yazarken payload'ı filtreleyen, özel teslimat notunu ve metadata'yı koruyan yardımcı
export function hazirlaSupabasePayload(input: any): Record<string, any> {
  const ayrik = talimatiAyir(input.baku_tahsilat_notu);
  // An input that still carries its tag (a raw database row) keeps it.
  const tahsilatNotu =
    ayrik.ozelNot === null
      ? talimatiKatla(ayrik.tahsilatNotu, input.ozel_not)
      : (input.baku_tahsilat_notu || '').trim();

  // Eksik bilgiler ve çoklu ürün/görsel metadata'sı
  let eksikBilgiler: any[] = Array.isArray(input.eksik_bilgiler) ? [...input.eksik_bilgiler] : [];
  eksikBilgiler = eksikBilgiler.filter((b) => typeof b !== 'string' || !b.startsWith('META:'));
  if (Array.isArray(input.urunler) && input.urunler.length > 0) {
    eksikBilgiler.push('META:urunler=' + JSON.stringify(input.urunler));
  }
  if (Array.isArray(input.gorsel_urlleri) && input.gorsel_urlleri.length > 0) {
    eksikBilgiler.push('META:gorseller=' + JSON.stringify(input.gorsel_urlleri));
  }
  if (input.tenant_id) {
    eksikBilgiler.push('META:tenant_id=' + input.tenant_id);
  }
  if (input.is_demo !== undefined) {
    eksikBilgiler.push('META:is_demo=' + (input.is_demo ? '1' : '0'));
  }

  const raw: Record<string, any> = {
    ...input,
    ek_veriler: siparisEkVerileriniAl(input),
    tenant_id: input.tenant_id || 'kanada_shopper_baku',
    baku_tahsilat_notu: tahsilatNotu,
    eksik_bilgiler: eksikBilgiler,
    ham_mesaj:
      input.ham_mesaj ||
      (input.ozel_not ? `Talimat: ${input.ozel_not}` : input.urun_aciklamasi || ''),
    adet: Number(input.adet || 1),
    toplam_tutar: Number(input.toplam_tutar || 0),
    alinan_tutar: Number(input.alinan_tutar || 0),
    ai_guven_skoru: Number(input.ai_guven_skoru || 0.95),
  };

  // Sadece Supabase tablosundaki fiziksel kolonları al (kalan_tutar ve id hariç tutulur çünkü postgres generated/default'tur)
  const payload: Record<string, any> = {};
  for (const key of Object.keys(raw)) {
    if (SUPABASE_GECERLI_KOLONLAR.has(key)) {
      payload[key] = raw[key];
    }
  }

  return payload;
}

// Supabase'den veya bellekten gelen veriyi normalize eden yardımcı
export function formatlaSiparis(s: any): any {
  const extra = siparisEkVerileriniAl(s);
  s = { ...extra, ...s, ek_veriler: extra };
  // The tag is the note; a physical ozel_not (older schemas, memory rows) only without it.
  const ayrik = talimatiAyir(s.baku_tahsilat_notu);
  const bakuTahsilatNotu = ayrik.tahsilatNotu;
  const ozelNot = ayrik.ozelNot ?? (typeof s.ozel_not === 'string' ? s.ozel_not.trim() : '');

  // eksik_bilgiler içindeki META: verilerini ayıkla
  let urunler = Array.isArray(s.urunler) ? s.urunler : [];
  let gorselUrlleri = Array.isArray(s.gorsel_urlleri) ? s.gorsel_urlleri : [];
  let temizEksikBilgiler: string[] = [];
  let tenantId = 'kanada_shopper_baku';
  let isDemo = true;

  if (Array.isArray(s.eksik_bilgiler)) {
    for (const item of s.eksik_bilgiler) {
      if (typeof item === 'string' && item.startsWith('META:urunler=')) {
        try {
          urunler = JSON.parse(item.substring('META:urunler='.length));
        } catch {}
      } else if (typeof item === 'string' && item.startsWith('META:gorseller=')) {
        try {
          gorselUrlleri = JSON.parse(item.substring('META:gorseller='.length));
        } catch {}
      } else if (typeof item === 'string' && item.startsWith('META:tenant_id=')) {
        tenantId = item.substring('META:tenant_id='.length);
      } else if (typeof item === 'string' && item.startsWith('META:is_demo=')) {
        isDemo = item.substring('META:is_demo='.length) === '1';
      } else {
        temizEksikBilgiler.push(String(item));
      }
    }
  }

  if (s.tenant_id) tenantId = s.tenant_id;
  if (s.is_demo !== undefined) isDemo = s.is_demo;

  // Eğer urunler dizisi henüz yoksa ve urun_aciklamasi içinde '+' varsa otomatik ayrıştır
  if (urunler.length === 0 && s.urun_aciklamasi && s.urun_aciklamasi.includes('+')) {
    const parcalar = s.urun_aciklamasi.split('+');
    urunler = parcalar.map((p: string) => {
      const match = p.match(/(?:(\d+)x\s*)?(.*?)(?:\((\d+(?:\.\d+)?)\s*AZN\))?$/i);
      return {
        urun_adi: (match && match[2] ? match[2].trim() : p.trim()) || p.trim(),
        adet: match && match[1] ? Number(match[1]) : 1,
        tutar: match && match[3] ? Number(match[3]) : undefined,
      };
    });
  }

  // Urunler dizisini normalize et ve alanları eşitle
  urunler = urunler.map((u: any, idx: number) => {
    const adi = u.urun_adi || u.urun_aciklamasi || `Ürün #${idx + 1}`;
    const fiyati =
      u.tutar !== undefined
        ? Number(u.tutar)
        : u.birim_fiyat !== undefined
          ? Number(u.birim_fiyat)
          : undefined;

    const gorsel = u.urun_gorseli || u.gorsel_url || undefined;

    return {
      ...u,
      urun_adi: adi,
      urun_aciklamasi: adi,
      adet: Number(u.adet || 1),
      tutar: fiyati,
      birim_fiyat: fiyati,
      urun_gorseli: gorsel,
    };
  });

  const toplam = Number(s.toplam_tutar || 0);
  const alinan = Number(s.alinan_tutar || 0);
  const kalan =
    s.kalan_tutar !== undefined && s.kalan_tutar !== null
      ? Number(s.kalan_tutar)
      : Math.max(0, toplam - alinan);

  return {
    ...s,
    toplam_tutar: toplam,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    adet: Number(s.adet || 1),
    baku_tahsilat_notu: bakuTahsilatNotu,
    ozel_not: ozelNot,
    urunler: urunler,
    birden_fazla_urun: urunler.length > 1,
    gorsel_urlleri: gorselUrlleri,
    eksik_bilgiler: temizEksikBilgiler,
    tenant_id: tenantId,
    is_demo: isDemo,
  };
}
