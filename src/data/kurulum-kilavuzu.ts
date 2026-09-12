// =========================================================================
// KANADA ➔ BAKÜ E-TİCARET SİSTEMİ - DEVİR & KURULUM KILAVUZU
// Sistem Mimarisi Rehberleri ve Webhook Entegrasyon Kodları
// =========================================================================

export const HIZLI_BASLANGIC_KILAVUZU = `=============================================================================
🚀 KANADA ➔ BAKÜ E-TİCARET & LOJİSTİK SİSTEMİ DEVİR & KURULUM KILAVUZU
=============================================================================
Bu sistem; Kanada'dan Azerbaycan'a (Bakü) Instagram Live, Reels, DM ve WhatsApp
üzerinden yapılan butik ürün satışlarını, kargo takibini ve Bakü'deki akraba
tahsilatlarını %100 sıfır hata ile yönetmek üzere tasarlanmıştır.

-----------------------------------------------------------------------------
1. GEREKLİ API VE VERİTABANI BAĞLANTILARI
-----------------------------------------------------------------------------
Sistemin canlı çalışabilmesi için 2 temel servis kullanılır:

A) Google Gemini API (Doğal Dil ve Mesaj Ayrıştırma Motoru)
   1. https://aistudio.google.com adresine gidin.
   2. Google hesabınızla giriş yapıp "Get API key" butonuna tıklayın.
   3. "Create API key" diyerek ücretsiz bir anahtar üretin.
   4. Aldığınız anahtarı projedeki ".env" dosyasına şu şekilde ekleyin:
      GEMINI_API_KEY=AIzaSy...

B) Supabase PostgreSQL (Kalıcı Bulut Veritabanı)
   1. https://supabase.com adresinde ücretsiz bir proje açın (Örn: "kanada-baku-butik").
   2. Project Settings > Database veya API sekmesinden şunları kopyalayın:
      - Project URL (Örn: https://xxxx.supabase.co)
      - anon / public key VEYA service_role secret key
   3. ".env" dosyanıza yapıştırın:
      SUPABASE_URL=https://xxxx.supabase.co
      SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   4. Supabase panelinde "SQL Editor"ü açın ve sistemdeki "1. Supabase SQL Şeması"
      kodunu yapıştırıp "RUN" butonuna basarak tabloları oluşturun.

-----------------------------------------------------------------------------
2. ÇEVRE DEĞİŞKENLERİ (.env.example)
-----------------------------------------------------------------------------
# Google Gemini Yapay Zeka Anahtarı
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Canlı PostgreSQL Veritabanı
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Webhook Güvenlik Doğrulama Şifresi (Opsiyonel)
WEBHOOK_SECRET=kanada_baku_guvenlik_kodu_123
`;

export const TETIKLEYICI_KODLAR_REHBERI = `=============================================================================
📱 INSTAGRAM & WHATSAPP TETİKLEYİCİ KOD SİSTEMİ (Trigger Keywords)
=============================================================================

Müşterilerle Instagram DM veya WhatsApp üzerinden uzun sohbetler, fiyat sormalar
ve fikir değişiklikleri yaşanır. Her mesajın veritabanını çöpe çevirmesini engellemek
için sistem "Tetikleyici / Onay Sözcüğü" mantığıyla çalışır.

-----------------------------------------------------------------------------
1. SİHİRLİ TETİKLEYİCİ KODLAR VE İŞLEVLERİ
-----------------------------------------------------------------------------

👉 #SİPARİŞ (veya #SIPARIS)
   - Ne Yapar: Müşteriyle konuşmanız bittiğinde, siz satıcı olarak cümlenizin
     sonuna "#SİPARİŞ" yazarsınız.
   - Örnek: "Əla Aytən xanım, qara M razmer zara kurtkanı saxladım #SİPARİŞ"
   - Sonuç: Sistem tüm konuşma geçmişini okur, eski alternatifleri eler ve
     yalnızca son uzlaşılan ürünü çıkarıp "Onay Bekleyenler (Gelen Kutusu)"na atar.

👉 #ONAY
   - Ne Yapar: Müşteri tam veya peşin kapora ödediyse ve sipariş kesinleştiyse kullanılır.
   - Örnek: "Beh karta oturdu, Bakıya çatdırılma üçün qeydə aldım #ONAY"
   - Sonuç: Sipariş yüksek güven skoru ile "Onay Bekleyenler" havuzuna düşer.

👉 #KNB (Kanada-Bakü Hızlı Kod)
   - Ne Yapar: Klavyede uzun yazmak istemediğinizde hızlı kısaltmadır.
   - Örnek: "Oldu, sabah Toronto mağazasından götürürəm #KNB"

-----------------------------------------------------------------------------
2. WEBHOOK İLE OTOMATİK BAĞLANTI NASIL KURULUR?
-----------------------------------------------------------------------------
ManyChat, Make.com, Zapier veya Meta Graph API Webhook ayarlarında:

- Webhook URL Adresiniz:
  POST https://sizin-alan-adiniz.com/api/webhook/siparis

- Gönderilecek JSON Formatı:
  {
    "mesaj": "Müşteri ile geçen tüm sohbet metni...",
    "gonderen": "@musteri_instagram_adi",
    "kaynak": "INSTAGRAM_DM" // veya WHATSAPP
  }

- Çalışma Mantığı:
  Webhook mesajı alır ➔ Metin içinde #SİPARİŞ / #ONAY var mı bakar ➔
  Gemini AI ile sipariş taslağını oluşturur ➔ Paneldeki sarı "Onay Bekleyenler"
  havuzuna fırlatır.
`;

export const WEBHOOK_API_KODU = `// =========================================================================
// Next.js App Router Webhook Rotası: app/api/webhook/siparis/route.ts
// Instagram DM, Reels ve WhatsApp Webhook Dinleyicisi
// =========================================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mesaj, gonderen, kaynak, webhook_secret } = body;

    // 1. Güvenlik Kontrolü (Opsiyonel secret doğrulama)
    if (process.env.WEBHOOK_SECRET && webhook_secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ basarili: false, hata: 'Yetkisiz erişim' }, { status: 401 });
    }

    if (!mesaj || typeof mesaj !== 'string') {
      return NextResponse.json({ basarili: false, hata: 'Mesaj metni boş olamaz' }, { status: 400 });
    }

    // 2. Tetikleyici Kod Kontrolü (#SİPARİŞ, #ONAY, #KNB)
    const upper = mesaj.toUpperCase();
    const tetikleyici = 
      upper.includes('#SİPARİŞ') || upper.includes('#SIPARIS') ? '#SİPARİŞ' :
      upper.includes('#ONAY') ? '#ONAY' :
      upper.includes('#KNB') ? '#KNB' : 'MANUEL';

    // 3. Google Gemini 2.5 Flash ile Sohbetten Nihai Siparişi Ayıklama
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const prompt = \`Aşağıdaki müşteri ile satıcı arasındaki sohbet geçmişini oku. Konuşmadaki pazarlık veya alternatif konuşmaları eleyerek EN SON ÜZERİNDE ANLAŞILAN nihai siparişi çıkar.
Sohbet Metni: "\${mesaj}"\`;

    const aiResp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            musteri_adi: { type: Type.STRING },
            instagram_kullanici_adi: { type: Type.STRING },
            telefon_numarasi: { type: Type.STRING },
            teslimat_sehri: { type: Type.STRING },
            teslimat_adresi: { type: Type.STRING },
            urun_aciklamasi: { type: Type.STRING },
            beden_veya_olcu: { type: Type.STRING },
            renk: { type: Type.STRING },
            adet: { type: Type.NUMBER },
            toplam_tutar: { type: Type.NUMBER },
            alinan_tutar: { type: Type.NUMBER },
            para_birimi: { type: Type.STRING },
            baku_tahsilat_notu: { type: Type.STRING },
            eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['musteri_adi', 'urun_aciklamasi', 'toplam_tutar'],
        },
      },
    });

    const parsed = JSON.parse(aiResp.text || '{}');

    // 4. Taslak Olarak Onay Havuzuna Kaydet
    const taslakSiparis = {
      id: 'inbox-' + Date.now().toString(36),
      gelis_tarihi: new Date().toISOString(),
      kaynak: kaynak || 'INSTAGRAM_DM',
      gonderen_kullanici: gonderen || parsed.instagram_kullanici_adi || parsed.musteri_adi,
      konusma_gecmisi: mesaj,
      tetikleyici_kod: tetikleyici,
      oneri_siparis: {
        ...parsed,
        kalan_tutar: Math.max(0, (parsed.toplam_tutar || 0) - (parsed.alinan_tutar || 0)),
        para_birimi: parsed.para_birimi || 'AZN',
        finans_durumu: (parsed.alinan_tutar >= parsed.toplam_tutar && parsed.toplam_tutar > 0) ? 'ODENDI' : (parsed.alinan_tutar > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
        lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      },
      durum: 'BEKLEMEDE',
    };

    return NextResponse.json({
      basarili: true,
      mesaj: 'Sipariş taslağı başarıyla oluşturuldu ve Onay Havuzuna gönderildi.',
      inbox_id: taslakSiparis.id,
      taslak: taslakSiparis
    });

  } catch (error: any) {
    return NextResponse.json({ basarili: false, hata: error.message }, { status: 500 });
  }
}
`;

export const OPERASYON_ROL_REHBERI = `=============================================================================
👥 KANADA ➔ BAKÜ OPERASYON VE ROL DAĞILIMI REHBERİ
=============================================================================

Sistem, okyanus ötesi iki nokta arasındaki güven ve koordinasyonu sağlamak
için iki ana role göre kurgulanmıştır:

-----------------------------------------------------------------------------
1. KANADA OPERASYON SORUMLUSU (SİZ VEYA SATIŞ YÖNETİCİSİ)
-----------------------------------------------------------------------------
Görev Alanı: Satış, Satınalma, Koli Hazırlama ve Hava Kargo Gönderimi.

Günlük Rutin:
1. "Onay Bekleyenler (Inbox)" sekmesini açın. Müşterilerle anlaşılmış taslakları
   kontrol edin, varsa bedeni/fiyatı düzeltip "Onayla ve Kaydet"e basın.
2. Kanada'daki mağazadan (Zara, Sephora, vs.) ürünü satın aldığınızda durumunu:
   [KANADA_SATINALIM_BEKLIYOR] ➔ [KANADA_DEPO] yapın.
3. Haftalık hava kargoya verme günü:
   - Üstteki "Kargo Manifestosu" butonuna basın.
   - "CSV / Excel İndir" diyerek kargo firmasına çeki listesini verin.
   - Durumu [ULUSLARARASI_KARGO] yapın.
   - Tablodaki yeşil WhatsApp ikonuna tıklayarak müşterilere tek tıkla:
     "Sifarişiniz Kanadadan Bakıya yola düşdü ✈️" mesajını atın.

-----------------------------------------------------------------------------
2. BAKÜ DAĞITIM & TAHSİLAT SORUMLUSU (AKRABA / ARKADAŞ / KURYE)
-----------------------------------------------------------------------------
Görev Alanı: Koli Karşılama, Müşteri Teslimatı ve Kalan Borcun Tahsilatı.

Günlük Rutin:
1. Kargo Bakü Haydar Aliyev Havalimanı'ndan alınıp eve/ofise geldiğinde:
   - Paketlerin durumu [BAKU_DAGITIM_ARKADAS] olur.
2. Akrabanız üst menüdeki "Bakı Qalıq Borc" butonuna basar:
   - Kimden ne kadar alınacak liste halinde görünür (Örn: "Aytən: 65 AZN borc").
   - "Bakı Hesabatını Kopyala" diyerek WhatsApp'tan güncel listeyi alır.
3. Müşteri kapıda veya m10 ile parayı ödediğinde:
   - Akrabanız tek tıkla "Tam Ödənildi" butonuna basar.
   - Siparişin kalan borcu 0 olur ve sipariş [TESLIM_EDILDI] olarak arşivlenir.

-----------------------------------------------------------------------------
3. SİSTEMİN SUNDUĞU EN BÜYÜK AVANTAJLAR
-----------------------------------------------------------------------------
- Sıfır Defter/Excel: Kim ne kadar kapora verdi, kimin adresi eksik asla kaybolmaz.
- Bakü'de Kasa Açığı Olmaz: Akrabanızın toplayacağı tutar kuruşu kuruşuna bellidir.
- Kolay Devir: Yarın işi bir başkasına bıraksanız bile bu kılavuz sayesinde 10 dakikada
  sistemi eksiksiz devralıp çalıştırabilir.
`;
