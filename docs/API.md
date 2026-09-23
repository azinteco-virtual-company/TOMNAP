> Faz 5: liste API’leri artık sayfalıdır; [tam liste sözleşmesi ve özel depolama](PHASE5_RELIABILITY.md). Güncel istemci ile sunucu birlikte yayımlanmalıdır.

> Faz 4: kurye görev API'leri ve sürümlü kargo ayarları için [güncel sözleşme ve geçiş notları](PHASE4_SECURITY.md).

# TOMNAP API Dokümantasyonu

Kanada ➔ Bakü e-ticaret lojistiği, sipariş ayrıştırma, multi-tenant firma yönetimi ve son mil kurye teslimat platformu REST API referansı.

---

## 1. Genel Bilgiler & Güvenlik

### Temel URL

- **Geliştirme:** `http://localhost:3000/api`
- **Prodüksiyon:** `https://your-domain.com/api`

### Kimlik Doğrulama (Authentication)

Giriş `POST /api/auth/giris` üzerinden kayıtlı e-posta veya tam telefon numarası ve parola ile yapılır.
Sunucu `HttpOnly` oturum çerezini ayarlar ve yanıtta `csrfToken` döndürür.
`GET /api/auth/oturum` mevcut kullanıcıyı ve CSRF tokenini, `POST /api/auth/cikis` çıkışı sağlar.
Değişiklik isteklerinde `x-csrf-token` zorunludur. Çerez dışında API anahtarı, URL kodu veya tarayıcı başlığı kimlik sayılmaz.

Firma kapsamı oturumdan gelir. Sistem yöneticisi firma işlemlerinde `x-tenant-id` ile somut firma seçmelidir.
Normal kullanıcı başka firma veya `all` seçemez. Uyumsuz query/body/header değerleri reddedilir.

Atomik kayıt/davet, e-posta kuyruğu, işlem kimliği gerektiren yedek yükleme ve boyut sınırları: [PERSISTENCE_SECURITY.md](PERSISTENCE_SECURITY.md). Bakım isteğinde `islem_id` UUID olmalı; belirsiz ağ sonucunda aynı kimlik korunmalıdır. Varsayılan restore ekleme modudur; değiştirme/silme somut tenant onayı gerektirir.

Tam rol matrisi, public rota listesi ve geçiş koşulları: [SESSION_SECURITY.md](SESSION_SECURITY.md).

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

Yetkili firma kapsamındaki siparişlerin tek sayfasını döndürür. Tam liste için `pagination.hasMore` bitene kadar aynı kapsamla ilerleyin; tek sayfa finans toplamı değildir.

**Query Parametreleri:**

- `tenant_id` (string): Firma filtresi.
- `page_size` (1–500): Varsayılan 200.
- `cursor` (string): Önceki yanıtın `pagination.nextCursor` değeri. Kayıtlar arada değişirse 409 döner.

**Örnek Yanıt:**

```json
{
  "basarili": true,
  "kaynak": "supabase",
  "pagination": {
    "version": 1,
    "total": 1,
    "hasMore": false,
    "nextCursor": null,
    "revision": "ORNEK_SURUM",
    "pageSize": 200
  },
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

Müşteri rehberinin tek sayfasını, tüm kaynak snapshot üzerinden hesaplanan sipariş/borç bilgileriyle döndürür. `page_size`, `cursor` ve `pagination` sipariş listesiyle aynı sözleşmededir. `GET /api/musteriler/:id/siparisler` geçmişi de sayfalıdır.

### `POST /api/musteriler`

Yeni müşteri profili ekler veya mevcut profili günceller.

---

## 6. Onay Bekleyenler (Inbox & Webhooks)

### `GET /api/inbox`

Mesajların tek sayfasını döndürür. `pagination.total` tüm mesajların sayısı; `toplam` bekleyenlerin sayısıdır. `page_size` ve `cursor` sipariş listesiyle aynı sözleşmededir.

### `POST /api/inbox/:id/onayla`

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
_SSRF koruması ve private IP engellemesi mevcuttur._

## 17 Eylül 2026 güvenlik güncellemesi

- `POST /firmalar/giris`, `/auth/giris` ile aynı parola kontrolünü kullanır; parolasız eski firma erişimi kaldırıldı.
- `/firmalar/davet/:token` ve `/auth/token-kontrol/:token` tam token/süre/kullanım doğrulamasını paylaşır. GET hesap oluşturmaz.
- `/firmalar/davet/katil` ve `/auth/sifre-belirle` tek kullanımlık token + en az altı karakter parola ister. Davetle katılan kişinin e-posta veya telefon bilgisi gerekir.
- Kayıt cevabı `aktivasyonLinki` içermez; `emailGonderildi` teslimat servisinin kabul durumunu bildirir. E-posta sağlayıcısının isteği kabul etmesi son alıcıya teslim edildiğini garanti etmez. Üretimde e-posta anahtarı yoksa kayıt 503 döner.
- Token veya davet kaydı kalıcı depoda okunamaz/yazılamazsa 503; eşzamanlı tüketim nedeniyle sıfır satır güncellenirse 409 döner.
- Kök `/upload-gorsel` benzeri işlem rotaları kaldırıldı; `/api/` yolları kullanılmalıdır. `/uploads/:dosyaAdi` yalnız istenen dosyayı sunar; bulunamadığında 404 verir.
- Görsel yükleme PNG/JPEG/WebP imzası ve 10 MiB çözülmüş gövde sınırı uygular. Uzak indirmeler her yönlendirmede genel IP doğrulaması ve DNS sabitlemesi yapar.

## 23 Eylül 2026 — insan onaylı AWB eşleştirmesi (`FF_AWB_REVIEW`)

Eski otomatik manifest eşleştirmesi, isim benzerliğiyle yanlış siparişlere AWB
yazıyordu (ör. "Natalia Petrova" → "Əli", "John Smith" → Kiril isimli sipariş).
Artık hiçbir manifest yüklemesi AWB yazmaz. Eşleştirme yalnız öneri üretir,
yazma işlemi ayrı ve açık bir onayla yapılır.

Bayrak: sunucuda `FF_AWB_REVIEW=true`, istemci derlemesinde `VITE_FF_AWB_REVIEW=true`
(`FF_V2_FLOW`'dan bağımsız; production'da açık). Kapalıyken iki uç nokta 404 döner
ve manifestten AWB atanamaz; `manifesto-yukle` yalnız ayrıştırır.

Roller: `SUPER_ADMIN` (somut bir butik seçiliyken), `PATRON`, `KANADA_SATINALMA`.
Bunlar bir siparişin AWB'sini düzenleyebilen rollerin aynısıdır.

### `POST /api/kargo/manifesto-yukle` (davranış değişti)

Manifesti yalnızca ayrıştırır. `otomatik_esle` uyumluluk için kabul edilir ama
hiçbir şey yazmaz. Yanıt: `ayristirma`, `eslesenSayisi: 0`, `eslesmeler: []`,
`eslesmeOnayiGerekli: true`.

### `POST /api/kargo/manifesto-eslestirme/oneriler` (yalnız `FF_AWB_REVIEW=true`)

Gövde: `{ dosya_base64, dosya_adi }` (en fazla 10 MB ve 2000 satır). Hiçbir kayıt
değiştirilmez. Yanıt `satirlar[]`, `cakismalar[]` ve `ozet` alanlarını içerir.

- **Güçlü eşleşme:** normalize telefonun tam eşleşmesi (`+994 55…`, `055…` ve `55…`
  aynı sayılır, kısmi numara eşleşmez) ya da manifestteki referansın sipariş
  kimliği veya `kanada_takip_kodu` ile tam eşleşmesi.
- **Zayıf aday:** yalnız isim benzerliği (Unicode-duyarlı; ə, ş, ç, ğ, ı, ö, ü ve
  Kiril korunur). Sørensen–Dice puanı en az 0,5 olmalı, satır başına en çok 5 aday
  gösterilir. Zayıf adaylar asla önceden seçilmez. Normalize edilince boş kalan
  (veya "Müştəri" gibi yer tutucu) isimler hiçbir şeyle eşleşmez. Puan, harfleri
  koruyan biçim ile iki ASCII katlama şemasının en yükseğidir: Pasaport (Ə→A, Q→G,
  X→KH, C→J, Ş→SH, Ç→CH, Ğ→GH, Ö→O, Ü→U, I/ı/İ→I) ve Basit (aksanlar atılır;
  Ə→E, ı/İ→I; Q, X, C aynı kalır). Kiril adlar Latin'e çevrilir. Katlama yalnız
  zayıf aday listesini genişletir; normalizasyonu, güçlü eşleşmeyi ve yazmayı
  etkilemez.
- `onerilenSiparisId` yalnız tek bir güçlü ve engelsiz aday varsa dolar. Bir satır
  birden fazla siparişe eşleşiyorsa, aynı sipariş birden fazla satırda öneriliyorsa
  ya da AWB manifestte tekrarlanıyorsa durum `BELIRSIZ` olur ve hiçbir aday seçilmez.
- Satır durumları: `ONERILDI`, `BELIRSIZ`, `ZAYIF_ADAY`, `ZATEN_BAGLI`, `CAKISMA`,
  `ESLESME_YOK`, `GECERSIZ_AWB`.
- `cakismalar`: güçlü eşleşen ama teslim edilmiş (`TESLIM_EDILDI`) ya da zaten
  AWB'si olan (`MEVCUT_AWB`) siparişler ile AWB'si başka siparişte duranlar
  (`AWB_BASKA_SIPARISTE`). Bu siparişlere yazılmaz.

### `POST /api/kargo/manifesto-eslestirme/onayla` (yalnız `FF_AWB_REVIEW=true`)

Gövde: `{ dosya_base64, dosya_adi, secimler: [{ satirNo, siparisId }] }` (1–500
seçim). Öneri ekranında kullanılan manifest dosyası tekrar gönderilir; sunucu
önerileri yeniden hesaplar ve yalnız o satırın **güncel adaylarından** biri
onaylanabilir. Aday olmayan seçim `ONERI_GECERSIZ` ile reddedilir. AWB, ağırlık,
eşleşme türü ve isim puanı istemciden alınmaz; sunucu üretir. Aynı satır, aynı
sipariş ya da aynı AWB iki kez seçilirse istek 400 döner. Yazma işlemi tek bir
transactional RPC ile yapılır (`tomnap_approve_awb_matches`, tenant başına
kilitli). Kurallar:

- teslim edilmiş siparişe yazılmaz,
- var olan bir AWB'nin üzerine yazılmaz,
- tenant içinde başka bir siparişte duran AWB yazılmaz,
- tek bir ret varsa **hiçbir** sipariş değişmez; yanıt `basarili: false` ve
  `reddedilenler[].sebep` (`ONERI_GECERSIZ`, `SIPARIS_BULUNAMADI`, `TESLIM_EDILDI`,
  `MEVCUT_AWB`, `AWB_BASKA_SIPARISTE`) olur,
- aynı çiftin yeniden gönderilmesi idempotenttir (`tekrar: true`) ve yeni kayıt üretmez.

Onaylanan siparişe AWB, varsa ağırlık (`ek_veriler.kargo_agirligi_kg`) yazılır.
`KANADA_SATINALIM_BEKLIYOR`/`KANADA_DEPO` durumundaki sipariş `ULUSLARARASI_KARGO`
durumuna geçer; diğer durumlar değişmez.

**Onay kaydı:** yazılan her AWB için, siparişi güncelleyen RPC ile **aynı
transaction'da** `awb_match_approvals` tablosuna bir satır eklenir: `tenant_id`,
`siparis_id`, `awb`, `manifest_dosya_adi`, `manifest_sha256` (yüklenen dosyanın
özeti), `manifest_satir_no`, `eslesme_turu` (`TELEFON`/`SIPARIS_KODU`/`ISIM`),
`isim_puani`, `onaylayan_kullanici_id` (oturumdan) ve `onay_zamani`. RPC başarısız
olursa satır da oluşmaz. Tablo yalnız eklemeye açıktır: UPDATE/DELETE/TRUNCATE
`service_role` dahil tüm API rollerinden geri alınmıştır ve tablo sahibini de
durduran tetikleyicilerle engellenir. RPC, onaylayan kullanıcının o butikte aktif
ve AWB düzenleme yetkili olduğunu ayrıca doğrular (`PT403` → 403).

Migration'lar: `supabase/migrations/20260923023659_awb_match_confirmation.sql` ve
`supabase/migrations/20260923164650_awb_match_approvals.sql` (ilk RPC'nin yetkisini
geri alır; kayıtsız yazma yolu kalmaz). Geri alma dosyaları `supabase/rollbacks/`
altında, yeniden eskiye doğru uygulanır. Geçmişte
yanlış yazılmış olabilecek AWB'ler için salt okunur denetim:
`npx tsx scripts/audit-awb-matches.ts --help`. Açık sorular:
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
