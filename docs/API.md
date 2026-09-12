# TOMNAP API Dokümantasyonu

Kanada ➔ Bakü e-ticaret lojistiği, sipariş ayrıştırma, multi-tenant firma yönetimi ve son mil kurye teslimat platformu REST API referansı.

---

## 1. Genel Bilgiler & Güvenlik

### Temel URL
- **Geliştirme:** `http://localhost:3000/api`
- **Prodüksiyon:** `https://your-domain.com/api`

### Kimlik Doğrulama (Authentication)
Prodüksiyon ortamında tüm `/api/*` endpoint'leri API anahtarı ile korunur. İstek başlıklarında aşağıdaki iki yöntemden biri kullanılmalıdır:

```http
X-API-Key: your_api_secret_key
```
veya
```http
Authorization: Bearer your_api_secret_key
```

> **Not:** Geliştirme (`NODE_ENV !== 'production'`) ortamında `API_SECRET_KEY` tanımlanmamışsa geliştirici kolaylığı için istekler otomatik geçirilir ve loglara uyarı basılır.

### Multi-Tenancy (Çok Kiracılı Mimari)
Sistem tenant seviyesinde tam veri izolasyonunu destekler. İsteklerde kiracı belirtmek için:
- Query Parametresi: `?tenant_id=kanada_shopper_baku`
- Header: `X-Tenant-ID: kanada_shopper_baku`

`tenant_id` belirtilmediğinde veya `all` gönderildiğinde kullanıcı rolüne (örn. `SUPER_ADMIN`) bağlı olarak tüm veri havuzu taranır.

### İstek Hız Sınırları (Rate Limiting)
| Kategori | Limit | Kapsam |
|---|---|---|
| **Genel API** | 150 istek / 15 dakika | Tüm `/api/*` rotaları |
| **AI İşlemleri** | 10 istek / 1 dakika | `/api/ayristir-siparis`, `/api/urun-katalog-gorseli-ara`, `/api/gorselden-urun-ara` |
| **Veritabanı Yönetim** | 3 istek / 1 dakika | `/api/veritabani/temizle`, `/api/veritabani/demo-yukle`, vb. |

### Standart Yanıt Formatı
Başarılı Yanıt:
```json
{
  "basarili": true,
  "mesaj": "İşlem başarılı",
  "data": { ... }
}
```

Hata Yanıtı:
```json
{
  "basarili": false,
  "hata": "Hata başlığı veya açıklaması",
  "detay": "Varsa ayrıntılı hata mesajı"
}
```

---

## 2. Sistem & Durum Endpoint'leri

### `GET /api/sistem-durum`
Sunucunun genel sağlık durumunu, veritabanı rejimini ve ortam değişkeni yapılandırmasını döndürür.

**Yanıt:**
```json
{
  "basarili": true,
  "durum": "aktif",
  "veritabani_tipi": "supabase",
  "gemini_api_hazir": true,
  "supabase_bagli": true,
  "zaman": "2026-09-12T11:30:00.000Z"
}
```

### `GET /api/tenant/izolasyon-testi`
Kiracılar arası veri sızıntısı olup olmadığını doğrular.

**Parametreler:**
- `tenant_id` (zorunlu): Test edilecek firma kimliği.

---

## 3. Sipariş Yönetimi (Orders)

### `GET /api/siparisler`
Filtrelenmiş sipariş listesini döndürür.

**Query Parametreleri:**
- `tenant_id` (string): Firma filtresi.
- `durum` (string): Lojistik durumu filtresi (`KANADA_SATINALIM_BEKLIYOR`, `KANADA_DEPO`, `ULUSLARARASI_KARGO`, `BAKU_DAGITIM_ARKADAS`, `TESLIM_EDILDI`).

**Örnek Yanıt:**
```json
{
  "basarili": true,
  "kaynak": "supabase",
  "siparisler": [
    {
      "id": "sip-abc123",
      "takip_no": "TRK-CA-9921",
      "musteri_adi": "Rəşad Quliyev",
      "musteri_telefon": "+994501234567",
      "urun_adi": "Nike Air Max 90",
      "toplam_tutar": 185,
      "alinan_tutar": 50,
      "kalan_tutar": 135,
      "para_birimi": "AZN",
      "lojistik_durumu": "KANADA_DEPO",
      "finans_durumu": "KISMI_ODEME",
      "tenant_id": "kanada_shopper_baku"
    }
  ]
}
```

### `POST /api/siparisler`
Yeni sipariş kaydı oluşturur.

**İstek Gövdesi:**
```json
{
  "musteri_adi": "Leyla Məmmədova",
  "musteri_telefon": "+994551234567",
  "teslimat_adresi": "Nizami küç. 12, Bakı",
  "urun_adi": "Lululemon Leggings",
  "toplam_tutar": 120,
  "alinan_tutar": 120,
  "para_birimi": "AZN",
  "lojistik_durumu": "KANADA_SATINALIM_BEKLIYOR",
  "finans_durumu": "ODENDI",
  "tenant_id": "kanada_shopper_baku"
}
```

### `PATCH /api/siparisler/:id`
Var olan siparişin durumunu veya tutarlarını günceller.

### `DELETE /api/siparisler/:id`
Siparişi sistemden kaldırır.

---

## 4. AI Destekli Sipariş Ayrıştırma

### `POST /api/ayristir-siparis`
WhatsApp mesajları, faturalar veya ürün bağlantılarını Google Gemini AI kullanarak yapılandırılmış sipariş verisine dönüştürür.

**İstek Gövdesi:**
```json
{
  "metin": "Salam, Rəşad Quliyev +994501234567, Amazon Canadadan aldığım bu ayaqqabı: Nike Air Max 90, 185 AZN. Behs olaraq 50 AZN ödədim. Yasamal, Bakı.",
  "gorselBase64": "data:image/jpeg;base64,...",
  "tenant_id": "kanada_shopper_baku"
}
```

**Yanıt:**
```json
{
  "basarili": true,
  "veri": {
    "musteri_adi": "Rəşad Quliyev",
    "musteri_telefon": "+994501234567",
    "urun_adi": "Nike Air Max 90",
    "toplam_tutar": 185,
    "alinan_tutar": 50,
    "kalan_tutar": 135,
    "eksik_bilgiler": []
  }
}
```

---

## 5. Müşteri Yönetimi (CRM)

### `GET /api/musteriler`
Müşteri rehberini, toplam sipariş sayılarını ve borç bakiyelerini listeler.

### `POST /api/musteriler`
Yeni müşteri profili ekler veya mevcut profili günceller.

---

## 6. Onay Bekleyenler (Inbox & Webhooks)

### `GET /api/inbox`
Otomatik webhook veya mesaj kanallarından gelen, insan operatör onayı bekleyen sipariş taslaklarını listeler.

### `POST /api/inbox/onayla`
Taslak siparişi onaylayarak aktif sipariş havuzuna aktarır.

### `POST /api/webhook/siparis`
Harici e-ticaret siteleri, Telegram/WhatsApp botları için gelen sipariş webhook alıcısı.

---

## 7. Multi-Tenant Firma Yönetimi

### `GET /api/firmalar`
Kayıtlı lojistik ve kargo şirketlerini listeler.

### `POST /api/firmalar`
Sisteme yeni bir kiracı (tenant) firma kaydeder.

---

## 8. Bakü Kurye Dağıtım Masası

### `GET /api/kuryeler`
Bakü içi kuryelerin güncel dağıtım listesini ve teslimat durumlarını döndürür.

### `PUT /api/kuryeler/:id`
Kuryeye paket ataması yapar veya teslimat durumunu günceller.

---

## 9. Görsel Servisleri & Proxy

### `POST /api/upload-gorsel`
Ürün dekontu, koli etiketi veya fotoğrafı yükler (Maksimum 25MB).

### `GET /api/proxy-image?url=...`
Harici e-ticaret platformlarındaki (Amazon, BestBuy vb.) görselleri CORS engeline takılmadan tarayıcıda göstermek için güvenli proxy.
*SSRF koruması ve private IP engellemesi mevcuttur.*
