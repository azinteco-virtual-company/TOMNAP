# Faz 4 — Şifreleme, kurye erişimi ve eski görsel geçişi

17 Eylül 2026. Faz 3 (`49ec3cb`) üzerine hazırlanmıştır. Yerel kaynak kod ve sentetik veriler üzerinde doğrulandı; canlı veritabanına, sağlayıcı hesabına veya uzak depoya uygulanmadı. Bu rapor üretime hazır olunduğu anlamına gelmez.

## Yeniden kontrolde doğrulanan ek bulgular

| Bulgu                                                                                                                    | Sonuç ve düzeltme                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kargo şifrelemesinde sabit varsayılan anahtar ve hata halinde düz metin döndürme vardı.                                  | Örtük anahtar kaldırıldı. Geçersiz anahtar/kayıt işlemi durdurur; eski verinin çözülmesi yalnız açık operatör geçişinde yapılır.                                                                                                                                                                 |
| `apiKey` ve `apiSecret`, parola/PIN şifreleme ve maskelemesine dahil değildi.                                            | Bütün kimlik nesnesi şifrelenir; parola, PIN, API key ve API secret yanıtlarda maskelenir.                                                                                                                                                                                                       |
| Kargo ayarları sunucu dosyasında tutuluyor ve sürümsüz üzerine yazılıyordu.                                              | Supabase yapılandırılmışsa yalnız DB kaydı kullanılır; ayar güncellemesi sürüm kontrollü tek transaction olur. Kesintide dosyaya düşülmez.                                                                                                                                                       |
| Kargo/görsel/genel sipariş güncellemeleri eski tam satırı yazarak yeni kurye atamasını veya teslimatı geri alabiliyordu. | Kargo ve görsel yazmaları alanlarıyla sınırlandı. Atama, lojistik durum ve ilgili metadata değişmişse çakışma yanıtı verilir; yerel takip de sağlayıcı yanıtını beklerken alınmış satır kopyasını güncel durum/atama/AWB ile karşılaştırır; kargo metadata'sı güncel DB satırında birleştirilir. |
| Aramex bağlantı testi HTTP hata yanıtını veya eksik kimlik bilgisini başarı sayabiliyordu.                               | HTTP durumuyla sağlayıcı yanıt şeması birlikte doğrulanır. Eksik kimlik bilgisi bağlantı başarısı olarak gösterilmez; hata metnine sağlayıcı gövdesi/stack eklenmez.                                                                                                                             |
| Yeni formun firma değişimi sırasında eski kimlik bilgisini bağlantı testine gönderebilme riski vardı.                    | Firma yüklenirken kimlik alanları temizlenir; kaydetme ve test, yüklenen sürümün mevcut firmaya ait olmasını gerektirir. Sağlayıcı değişimi kimlik alanlarını sıfırlar.                                                                                                                          |
| Kurye hesabıyla eski genel firma yanıtı görülebiliyordu.                                                                 | Kurye yalnız kendi görev API'sini kullanır; firma yönetimi, genel sipariş, CRM, görsel ve kargo ayarı erişimi kapalıdır.                                                                                                                                                                         |

Eski denetimdeki `ef0797d` commit/PR iddiası bu çalışma kopyasında hâlâ doğrulanmış değildir. Önceki fazlardaki düzeltmeler korunmuştur. Başarılı test sayısı, ürünün tüm iş akışlarının veya canlı servislerin doğrulandığı anlamına gelmez.

## Kargo kimlik bilgileri

Yeni kayıt biçimi `enc:v2:<key-id>:<iv>:<tag>:<ciphertext>`; AES-256-GCM, rastgele 12 bayt IV, 16 bayt doğrulama etiketi kullanır. Ek doğrulama verisi sürüm, anahtar kimliği, firma ve sağlayıcıyı içerir. Bir firmanın veya sağlayıcının şifreli kaydı başka kapsamda çözülemez. Anahtar bulunamaması, değiştirilmiş etiket, eski zarf veya düz metin çalışma zamanında hata üretir.

`CARGO_ENCRYPTION_KEYS` bir JSON nesnesidir; değerler 32 rastgele baytın 64 hex karakteridir. `CARGO_ENCRYPTION_ACTIVE_KEY_ID` yeni yazılacak kayıtların anahtarını seçer. Anahtar üretim örneği: `openssl rand -hex 32`. Üretilen değeri secret manager'a koyun; kaynak depoya veya rapora yazmayın. Bu anahtarlar kullanıcıların scrypt parola hash'lerinden ve oturumlarından bağımsızdır.

Örnek yapı (placeholder gerçek anahtar değildir):

```env
CARGO_ENCRYPTION_KEYS={"cargo_2026":"64_HEX_KARAKTERLIK_RASTGELE_ANAHTAR"}
CARGO_ENCRYPTION_ACTIVE_KEY_ID=cargo_2026
```

Kayıt olmayan firma boş, test modunda ayar alır. Kayıt kaydetmek için anahtar gerekir. Supabase'de `cargo_settings` tablosu ve `save_cargo_settings` RPC'si kullanılır. İlk kaydetme `revision: 0`, sonraki kaydetme son okunan sürümü gerektirir. Eski sürüm 409, eksik sürüm 400, depolama/anahtar sorunu 503 döner. İki ayar arayüzü sunucunun döndürdüğü sürümü kullanır. Sağlayıcı değiştirilirken eski gizli bilgiler otomatik taşınmaz.

Yerel geliştirme dosyası `{version:2,records:[...]}` biçimindedir; 0600 izinle atomik değiştirilir. Yerel okuma/sürüm kontrolü/yazma tek sunucu süreci içindir. Çok süreçli veya serverless kullanım için DB gerekir.

## Eski kargo verisini taşıma ve anahtar döndürme

Komut varsayılan olarak prova yapar. Kaynak dosyayı değiştirmez; yeni çıktı yolu gerekir. JSON bozuksa hata mesajına içerik eklemez. Anahtarları komut satırı argümanına koymayın; ortam değişkeni adını verin.

```bash
# Eski API_SECRET_KEY ile şifrelenmiş kayıtlar için; ortam değişkeni önceden verilmiş olmalı.
npx tsx scripts/migrate-cargo-settings.ts --input /secure/kargo-eski.json --legacy-secret-env API_SECRET_KEY --allow-plaintext

# Provanın döndürdüğü SHA256 ile yeni, henüz mevcut olmayan dosya oluşturur.
npx tsx scripts/migrate-cargo-settings.ts --input /secure/kargo-eski.json --output /secure/kargo-v2.json --legacy-secret-env API_SECRET_KEY --allow-plaintext --expected-sha SHA256 --apply
```

`--allow-plaintext`, eski kayıtta düz metin parola/PIN/API key/API secret varsa gerekir. Yalnız bilinen eski varsayılan anahtarla şifrelenmiş veri için `--allow-legacy-default` açıkça seçilebilir; bu anahtar uygulama çalışma zamanında kullanılmaz. Yanlış anahtar, yinelenen firma, bozuk kayıt veya SHA uyuşmazlığında sonuç uygulanmaz. Kaynağı özel, erişimi sınırlı yedek olarak saklayın; düz metin içerebilir.

DB'ye taşıma için `--output` yerine `--database` kullanılır. Aynı prova/SHA kontrolü geçerlidir. `import_cargo_settings` bütün verilen firmaları tek transaction içinde taşır; firmalar aktif olmalı ve beklenen sürümler eşleşmelidir. İlk eski kayıt sürüm 0→1, mevcut v2 kayıt rotasyonu N→N+1 olur. Başka ayar değişmişse tüm batch geri alınır. Ağ yanıtı kaybolursa tekrar uygulamadan önce DB sürümlerini kontrol edin; komut belirsiz sonucu başarı olarak bildirmez.

Rotasyonda eski ve yeni anahtarları birlikte tanımlayın, aktif ID'yi yeniye çevirin, özel DB dışa aktarımını veya çevrimdışı yerel v2 dosyasını aynı komutla dönüştürün. DB dışa aktarımının biçimi `{version:2,records:[{tenant_id,revision,settings,encrypted_credentials}]}` olmalıdır. Tüm kayıtların yeni anahtarla çözülebildiğini ve yedeklerin kurtarma gereksinimini doğrulamadan eski anahtarı kaldırmayın. Yerel dosyayı uygulamanın `DATA_DIR/kargo_ayarlari.json` konumuna geçirmek, yazıcılar durdurulmuşken ayrı kontrollü adımdır; araç canlı dosyanın üzerine otomatik yazmaz.

## Kurye hesabı ve görev akışı

1. Firma sahibi veya süper yönetici kurye masasından açık kurye kaydı oluşturur.
2. Kaydı aynı firmanın aktif `BAKU_KURYE` kullanıcısına bağlar. Hesap yoksa mevcut davet akışı kullanılır. Tek kullanıcı iki kurye kaydına bağlanamaz.
3. Yetkili personel sipariş detayından kurye atar; atama sürümü eşleşmelidir. İsim, telefon son hanesi veya bölge benzerliği erişim kararı vermez.
4. Kurye giriş yapınca yalnız kendisine atanan teslim görevlerini görür. Görev yanıtı müşteri iletişimi/adres, ürün/adet, kalan tahsilat tutarı ve teslim durumuyla sınırlıdır; alış maliyeti, fatura, gümrük kimliği, ham mesaj, işlem geçmişi ve görseller aktarılmaz.
5. Kurye yalnız dağıtım aşamasındaki kendi görevini, teslim alan kişiyi belirterek tamamlar. Bu işlem ödeme/tahsilat tutarını değiştirmez. Tekrarlanan teslim aynı kaydı ikinci kez değiştirmez.

Tamamlanmış görevler yalnız teslimi yapan kullanıcıya döner. Kurye kaydını başka hesaba bağlamak geçmiş müşteri teslimatlarını yeni kullanıcıya açmaz. Hazır görevlerin erişimi yeni açık bağlantıya göre değişir. Atama/binding değişikliğiyle yarışan teslim güncel DB kilitleri altında doğrulanır.

Temel API'ler: `GET/POST /api/kuryeler`, `POST /api/kuryeler/:id/kullanici`, `POST /api/siparisler/:id/kurye`, `GET /api/kurye/gorevler`, `POST /api/kurye/gorevler/:id/teslim`. Oturum, CSRF, rol ve firma kontrolleri sunucudadır. Yerel kurye profilleri `couriers.json` atomik dosyasında; yerel siparişler önceki fazdaki gibi geçicidir.

Eski kurye kimlikleri otomatik eşlenmez. Eşlenmemiş siparişler yöneticiye raporlanır. Roster ve sipariş listelemesi REST sınırında kesilmişse eksik listeyi tam göstermeden hata verir. Çok büyük listeler için sayfalama ayrı iştir; kurye görev RPC'si 5000 üzerini açıkça reddeder.

## Eski özel görseller

Depodaki 8 eski görsel bu paketle otomatik taşınmadı veya erişime açılmadı. Yeni araç envanter, sahiplik incelemesi ve güvenli uygulama içindir; sahiplik tahmin etmez.

```bash
npx tsx scripts/plan-legacy-uploads.ts --help
npx tsx scripts/plan-legacy-uploads.ts plan --source-dir /secure/legacy-uploads --database --out /secure/manifest.json
npx tsx scripts/plan-legacy-uploads.ts apply --manifest /secure/manifest.json --source-dir /secure/legacy-uploads --database --destination-dir /persistent/uploads
# Aynı komuta yalnız incelenmiş eşleme için --apply eklenir.
```

Manifest SHA256, gerçek dosya türü ve sipariş/inbox içindeki tam referansları kaydeder; `mappings` başlangıçta boştur. Her eşleme kaynak adı + kaynak SHA256 + açık firma kimliği gerektirir. Bir görsel birden çok firmaya aitse her firma için ayrı eşleme ve özel kopya gerekir. JPEG/PNG/WebP desteklenir; SVG, güvensiz yol/symlink, bozuk/aşırı büyük dosya otomatik uygulanmaz. Orijinaller silinmez veya dönüştürülmez.

DB uygulaması tam kaynak satırına karşı değişiklik kontrolü, tek transaction ve işlem makbuzu kullanır. Aynı manifest/işlem ID'siyle tekrar, güncel siparişi eski veriye döndürmez. DB yazımı başarısız/yanıtı belirsizse özel alanda kullanılmayan kopyalar kalabilir; araç bunları doğrulayarak tekrar kullanır. İşlem sonrasında DB ile dosya sisteminin tek ortak transaction olduğu iddia edilmez.

`--snapshot FILE` modu yalnız açık çevrimdışı `{schemaVersion:1,companies,orders,inbox}` dışa aktarımını tek atomik yazmayla değiştirir. Çalışan sunucunun belleğini kalıcılaştırmaz; sonraki içe aktarım ayrı işlemdir. Başka yazıcıların durdurulması gerekir. Manifest tam kaynak satırları içerebilir; 0600 oluşturulur ve özel tutulmalıdır.

Hedef dizin sunucunun `UPLOADS_DIR` değeriyle aynı, özel, kalıcı ve paylaşılan disk olmalıdır. Araç Vercel'de `--apply` işlemini reddeder. Kalıcı özel nesne depolaması bu pakette kurulmamıştır.

## Migration ve doğrulama

Sıra: gerçek temel sipariş/kurye şeması → `supabase_saas_schema.sql` → Faz 2 oturum migrationı → Faz 3 transaction migrationı → `20260917170053_secure_cargo_couriers_and_legacy_uploads.sql` → yeni sunucu. `tests/sql/base-fixture.sql` yalnız sentetik test içindir, üretim şeması yerine uygulanmaz.

Yeni tablolar RLS + FORCE RLS kullanır. Tarayıcı rolleri `anon`/`authenticated` için tablo ve RPC izinleri kapalıdır; sunucu `service_role` ile çalışır. RPC'ler SECURITY INVOKER ve boş search_path kullanır. Supabase CLI 2.75.0'da advisors komutu bulunmadığından katalog/izin sorguları ve gerçek rol testleri kullanıldı; canlı Supabase Advisor çalıştırılmış değildir.

Doğrulama sonuçlarının sayısal özeti paketle birlikte `TOMNAP-Faz-4-dogrulama.json` içinde bulunur. TypeScript, üretim derlemesi, Vitest/kapsam, temiz PostgreSQL 17 migration zinciri, rol/transaction testleri, 6 önceki + 8 yeni gerçek eşzamanlı bağlantı senaryosu ve gerçek tarayıcı akışı kapsanır. Dış sağlayıcı çağrıları sentetik yanıtlarla test edildi; gerçek hesapla kabul testi yapılmadı.

## Kalan işler ve yayın kapıları

- Canlı veri envanteriyle staging göç provası, geri yükleme provası, doğru anahtarların secret manager'da kurulması.
- Eski görsellerin gerçek firma sahiplerinin ve kullanıcı–kurye eşlemelerinin işletme tarafından doğrulanması. Bu bilgi koddan güvenilir biçimde üretilemez.
- Serverless dağıtım için kalıcı özel nesne depolaması; depolama ve DB yaşam döngüsünün birlikte tasarlanması.
- Büyük listeler için sayfalama; güncel test kapsamının düşük kalan ürün alanlarına genişletilmesi; CI'da tarayıcı E2E.
- Vite doküman paketi hâlâ 1 MiB üzerindedir. Strict TypeScript ve büyük bileşenlerin ayrıştırılması sonraki teknik borç işleridir.
- Aramex/DHL/UPS hesaplarıyla gerçek servis kabulü, PWA güncellemesi ve kullanım akışlarının staging doğrulaması.

Kaynaklar: [Node.js 22 AES-GCM ek doğrulama verisi](https://nodejs.org/docs/latest-v22.x/api/crypto.html#ciphersetaadbuffer-options), [OWASP kriptografik depolama](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), [Supabase DB fonksiyonları ve güvenlik](https://supabase.com/docs/guides/database/functions), [Aramex takip API sözleşmesi](https://www.aramex.com/docs/default-source/resourses/resourcesdata/shipments-tracking-api-manual.pdf). Güncel Supabase changelog incelendi; yeni Data API tablo izinleri açıkça ele alındı.
