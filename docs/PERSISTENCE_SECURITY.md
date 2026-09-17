# TOMNAP — Faz 3: işlem bütünlüğü ve öz kontrol

17 Eylül 2026. Başlangıç: `fbb208d`, çalışma dalı: `codex/persistence-phase3`.

Bu paket ikinci güvenlik paketinin üzerine uygulanır. Canlı Supabase, e-posta veya kargo servisi üzerinde işlem yapılmadı. Çalışma yerel kaynak kod, sentetik veriler ve ayrı PostgreSQL 17 veritabanıyla doğrulandı. Üretime hazır olduğu yönünde yeni bir genel puan verilmedi.

## Öz kontrolde doğrulanan eksikler

| Bulgu                                                                                    | Etki                                                                                | Uygulanan düzeltme                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Yedek yükleme önce tüm siparişleri siliyor, parça ekleme hatalarını yalnızca logluyordu. | Kısmi veri kaybına rağmen başarı yanıtı; seçili tenant dışını silme riski.          | Tek tenant, açık işlem modu/onayı, tek SQL transaction, hata halinde rollback.                                     |
| Tek REST sorgusu tam yedek kabul ediliyordu.                                             | Varsayılan satır sınırından büyük veriler eksik dışa aktarılabilir.                 | Tek snapshot üzerinden JSON aggregate; 1001 kayıt testi; 5000 kayıt/10 MiB üzeri açık hata.                        |
| Sipariş serializer'ı maliyet/fatura/CRM bağı/geçmiş alanlarını düşürüyordu.              | Geri yükleme ve bazı DB yazmalarında sessiz alan kaybı.                             | İzinli 12 iş alanı için `ek_veriler`; içerik bazında gidiş-dönüş testleri; tanınmayan restore alanları reddedilir. |
| Inbox onayı sipariş ekleme ve mesaj durumunu ayrı yazıyordu.                             | Eşzamanlı onay/red çelişkisi; yarım işlem.                                          | Tenant satır kilidi, tek RPC transaction, aynı onayda ilk siparişi döndüren tekrar davranışı.                      |
| Kayıt/aktivasyon/davet kabulü birden fazla bağımsız yazma içeriyordu.                    | Yetim şirket, tüketilmiş ama hesap oluşturmamış token, kota aşımı.                  | Şirket–kullanıcı–davet–kota güncellemeleri birlikte commit edilir. Kota gerçek kullanıcı sayısından hesaplanır.    |
| JSON yazma/okuma hataları bastırılıyor, bellek önce güncelleniyordu.                     | Sahte başarı; bozuk dosyanın varsayılan veriye dönüşmesi.                           | Tek kimlik snapshot'ı; 0600 geçici dosya, flush, atomik rename; sonra bellek yayımı.                               |
| `public/uploads` dışına taşımak geliştirme sunucusunu bütünüyle korumuyordu.             | Vite `/data`, `/@fs` ve `?raw` yollarından özel dosya/sunucu kaynağı sunabiliyordu. | Vite dosya ret kuralları, özel DATA_DIR/UPLOADS_DIR kapsamı; geliştirme sunucusu varsayılan loopback.              |

Önceki paketin “public dizini dışına taşıma” düzeltmesi üretim statik dağıtımı açısından yararlıydı; geliştirme sunucusu için eksikti. Bu ayrım yeniden kontrol sırasında düzeltildi. Sipariş formatter'ının kişi adına göre özel görsel URL'si üretmesi de kaldırıldı. Daha önce doğrulanamayan eski denetim commit'i/PR'ı için yeni bir doğrulama iddiası yok.

## Kayıt, davet ve e-posta

`tomnap_register_boutique`, `tomnap_activate_user`, `tomnap_create_invite`, `tomnap_accept_invite` yalnızca sunucu hizmet rolüne açıktır. İsim/rol/tenant yetkisi istemcinin beyanından türetilmez. Davet kabulünde şirket önce, davet sonra kilitlenir. Birden çok davet oluşturulabilir; son rol kontenjanını aynı anda yalnızca bir kullanıcı alabilir. Başarısız kullanıcı ekleme daveti tüketmez.

Yeni e-postalı davetlerde alıcı adresi DB'de tutulur; farklı adresle kabul reddedilir. Eski davetlerin adresi sonradan tahmin edilmez. Bunlar taşıyıcı token daveti olarak kalır. İlk parola aktivasyonunun bekleyen şirketi etkinleştirmesi mevcut ürün davranışıdır; işlem artık atomiktir. Dondurulmuş/reddedilmiş/eksik veya null durumlu şirketler etkinleştirilemez.

Kayıt ve e-posta işi aynı transaction içinde kaydedilir. Ardından gönderim denenir. Sağlayıcı başarısızsa kayıt korunur ve yanıt `emailDurumu: BEKLIYOR` olur. Kuyruk işi 2 dakikalık lease ile alınır; eski worker'ın onayı yeni claim'i kapatamaz. Başarısız gönderim 5 dakika sonra tekrar denenebilir. Gönderici dahil payload sabittir; sabit Resend idempotency anahtarı kullanılır.

Operatör komutu (Supabase bağlantısı gerekir):

```sh
npx tsx scripts/retry-onboarding-emails.ts 20
```

Komut zamanlanmış değildir ve otomatik devreye alınmadı. Sadece toplu sonuç sayısı loglar. Bağımsız CLI, yerel kimlik dosyasını çalışan sunucunun eski bellek kopyasıyla ezmemek için yerel modda çalışmayı reddeder. Yerel HTTP sürecinin ilk gönderim denemesi desteklenir.

Sağlayıcı çağrısı ile DB commit'i aynı transaction olamaz. Resend idempotency saklama süresi 24 saattir; belirsiz bir gönderimin bu süreden sonra tekrar denenmesi e-postayı tekrarlayabilir. Süresi geçmiş tokenların e-postası gönderilmez; token yenileme/parola sıfırlama ayrı iş olarak duruyor. [Resend idempotency belgesi](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Sipariş bakımı ve yedek kapsamı

Yalnız SUPER_ADMIN yetkisi korunur. `all` kapsamı salt okunur durum/yedek için kullanılabilir; silme, demo yükleme ve geri yükleme tek firma gerektirir. Demo yükleme yalnız `demo_sandbox` alanına açıktır ve bu alan mevcut uygulama mimarisinde geçici bellektir.

- `GET /api/veritabani/yedek-al`: yalnız siparişlerin JSON dışa aktarımıdır. Kullanıcılar, bağımsız CRM kayıtları, davetler, oturumlar, kargo ayarları ve görsel dosyaları dahil değildir. Tam veritabanı/medya yedeğinin yerine geçmez.
- `POST /api/veritabani/yedek-yukle`: varsayılan ekleme modudur. Var olan kimlikle çakışma 409 döner. Değiştirme için `temizleVeYukle: true` ve `onay_kodu: DEGISTIR:<tenant>` gerekir. Arayüz değiştirme etkisini açıkça gösterir.
- `POST /api/veritabani/temizle`: `onay_kodu: SIL:<tenant>` gerekir. Sabit genel onay kodu ve `ALLOW_GLOBAL_RESET` atlaması kaldırıldı.
- Her bakım isteği UUID biçiminde `islem_id` taşır. Aynı kimlik/aynı içerik tekrarında önceki sonuç döner; arada oluşturulan siparişler tekrar silinmez. Aynı kimliğin farklı içerikle kullanımı 409'dur.

Arayüz yanıtı kesinleşene kadar işlem kimliğini sekme depolamasında tutar; yalnız payload özeti ve rastgele kimlik kaydedilir. Ağ hatası/yenileme sonrası aynı sekmedeki aynı işlem tekrarında kimlik korunur. Sekme depolaması silinirse veya başka sekmeden yeni işlem başlatılırsa yeni bir istek olur; bu nedenle belirsiz sonucun ardından yeni işlem oluşturmak yerine mevcut kimliği kullanmak gerekir.

DB işlem kaydı transaction ile birlikte commit edilir; otomatik süre aşımıyla silinmez. Firma silinirse kendi işlem kayıtları da silinir. Yerel siparişler ve işlem kayıtları yalnız süreç belleğindedir; üretim dayanıklılığı iddiası taşımaz.

Restore satır kimliklerini/tarihlerini ve desteklenen iş verilerini korur. Aynı kimlikte kalan siparişler güncellenir; gereksiz delete/insert yapılarak inbox bağlantısı koparılmaz. Tenant dışı UUID, müşteri bağı veya yerel görsel referansı kabul edilmez. Mevcut özel görsellerin dosyaları önceden taşınmış ve sahiplikleri doğrulanmış olmalıdır. DB restore UUID gerektirir; eski yerel metin kimlikleri otomatik tahmin edilmez. Karışık tenant yedeği tek tenant'a yüklenemez; önceden doğru kapsamda ayrılmalıdır.

Bakım RPC'si kısa süreli tablo kilitleriyle eşzamanlı sipariş yazmalarını bekletir. Inbox tablosu önce kilitlenir; onay akışıyla ters kilit sırası önlenir. Büyük bakım üretimde planlı bir zaman aralığında yapılmalıdır. [PostgreSQL kilit davranışı](https://www.postgresql.org/docs/17/explicit-locking.html).

## Yerel dosyalar

`DATA_DIR/identity.json` şirket, kullanıcı, davet ve e-posta işlerini tek snapshot'ta tutar. İlk kayıt öncesinde eski `firmalar.json` / `kullanicilar.json` okunur; snapshot oluştuktan sonra eski dosyalar otorite değildir. Eski dosyalar otomatik silinmez. Boş `[]` geçerli kalır; bozuk JSON, yanlış şekil veya okuma/yazma hatası sessizce varsayılan kullanıcı/şirket üretmez.

Dosya kaydı başarılı olmadan bellek değişmez. Kargo ayarları aynı atomik yazma ilkesini kullanır. Supabase/üretim modunda eski yerel kimlik dosyasının bozukluğu DB kimliğine geri dönüş veya gereksiz başlangıç bağımlılığı oluşturmaz.

Yerel snapshot tek süreç içindir. Rename kısmi dosyayı önler; çok süreçli eşzamanlı yazma veya elektrik kesintisinde dizin dayanıklılığı garantisi vermez. Yerel bootstrap çalıştırırken geliştirme sunucusunu durdurun, sonra yeniden başlatın. Sipariş/CRM/inbox için genel yerel kalıcı depo bu pakette eklenmedi. Üretimde oturum ve kimlik otoritesi Supabase olmaya devam eder.

## Migration ve geçiş

CLI ile oluşturulmuş migration:

`supabase/migrations/20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql`

Bu migration Faz 2 oturum migration'ından sonra, güncel sunucu kodu devreye alınmadan önce uygulanmalıdır. Faz 2'deki gerçek sipariş şeması önkoşulu devam eder. Mevcut baz kurulum SQL dosyaları tek başına Faz 3 RPC'lerini kurmaz; migration zinciri gereklidir. Kod, eksik RPC durumunda yerel başarıya düşmez.

Migration tek transaction'dır. Normalize e-posta, tam telefon veya aktivasyon tokeni çakışması varsa durur; kayıt silmez, birleştirmez veya kullanıcı sahipliği tahmin etmez. Canlı geçişten önce bu kimlikler operatörce gözden geçirilmelidir. Yeni `onboarding_email_jobs` ve `order_maintenance_operations` tabloları RLS/FORCE RLS ile korunur; PUBLIC/anon/authenticated yetkileri kaldırılmıştır. RPC'ler `SECURITY INVOKER`, boş `search_path` ve yalnız `service_role` çalıştırma yetkisiyle tanımlıdır. [Supabase fonksiyon güvenliği](https://supabase.com/docs/guides/database/functions).

Faz 2 mimari sınırı değişmedi: `service_role` RLS'yi aşar; tenant yetkilendirmesi HTTP API'dedir. Burada bağımsız bir Supabase Auth/JWT tenant RLS katmanı kurulmuş olduğu iddia edilmiyor.

Canlı uygulama sırası: tam DB/medya yedeği, kimlik çakışması kontrolü, staging migration, staging kabul testleri, canlı migration ve kod geçişi. Bu adımlar uygulanmadı; hedef ortam bilgisi gerektiğinde ayrıca ele alınmalı.

## Doğrulama

**476/476 test, 36 dosya** başarılı. TypeScript kontrolü, Vite/PWA + Node + iki Vercel derlemesi ve üretim bağımlılık denetimi geçti; bilinen üretim bağımlılığı açığı 0. Toplam coverage: satır %32,82; statement %32,98; branch %26,32; fonksiyon %24,98. Bu oran tüm uygulama için hâlâ düşüktür.

PostgreSQL grant/RLS, transaction rollback ve müşteri/tenant bağı testleri geçti. **6/6 gerçek iki bağlantılı yarış** geçti. Gerçek tarayıcıda yönetici girişi, firma seçimi, sipariş yedeği indirme/geri yükleme, maliyet/fatura alanlarının ve diğer firmanın korunması doğrulandı. Geliştirme sunucusunun özel dosya yolları 403 döndü; ana uygulama ve Vite istemcisi çalışmaya devam etti.

Testler geçici veri dizinleri kullanır ve dış ağ bağlantıları engellenir. Derleme hem Node hem iki Vercel bundle'ını üretir. Büyük doküman paketi boyut uyarısı devam eder; bu pakette performans refaktörü yapılmadı. SQL testleri gerçek UUID/enum/generated bakiye kolonları içeren sentetik şemada çalışır; önce güvensiz eski grant/policy'ler eklenir, sonra migration zinciri ve yetki/rollback testleri uygulanır.

Gerçek iki bağlantılı yarış testleri yalnız sentetik yerel DB veya açıkça işaretli yerel CI veritabanında çalışır. CI, transaction testlerini ve yarış harness'ını artık içerir. GitHub üzerinde uzak CI henüz çalıştırılmadı.

## Sonraki paketler

1. Sabit kripto fallback anahtarını kontrollü veri geçişiyle kaldırmak; kargo ayarı gizli bilgilerinin merkezi ve tenant kapsamlı kalıcılığı.
2. Eski görsellerin doğrulanmış sahiplik geçişi; kurye–kullanıcı ataması; büyük/veritabanı dışı dosyaların kalıcı depolanması.
3. Kimlik yenileme/parola sıfırlama, veri saklama/temizlik politikası, dağıtık rate limit ve gerçek webhook hizmet kimliği.
4. Staging'de mevcut veriyle göç ve PWA güncelleme kabulü; kargo sağlayıcılarının gerçek servis kabul testleri.
5. Düşük toplam coverage, büyük frontend paketleri, modül boyutu, TypeScript strict geçişi ve kalan ürün metni/UI tutarsızlıkları.
