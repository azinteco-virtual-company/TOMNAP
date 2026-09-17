> Faz 3 bu rapordaki işlem bütünlüğü/kalıcılık açıklarını ele alır: [güncel düzeltmeler ve geçiş](PERSISTENCE_SECURITY.md). Aşağıdaki Faz 2 sonuçları tarihsel doğrulama kaydıdır.

# TOMNAP — Oturum ve firma yetkilendirmesi, Faz 2

17 Eylül 2026. Başlangıç: Faz 1 `a5fb15a`; dal: `codex/security-phase2`.
Bu çalışma kaynak kod ve izole test ortamı içindir. Canlı Supabase, Vercel, e-posta veya kargo hesabına değişiklik uygulanmadı.

## Sonuç

P0 oturum/yetki paketi uygulandı: doğrulanmış kullanıcı oturumu, rol ve firma kapsamı olmadan özel API veya yüklenen görsele erişilemiyor. Önceki ortak API anahtarı, origin/fetch-site başlığı, demo/admin kodu, URL ve browser-storage geçişleri kaldırıldı. Bu sonuç **üretime hazır** kararı değildir; aşağıdaki geçiş koşulları ve kalan işler devam ediyor.

Önceki değerlendirmedeki temel auth ve tenant riskleri doğrulandı. İlk incelemenin gözden kaçırdığı ilave yollar da kapatıldı: Express büyük/küçük harf eşleştirmesi, kodlanmış statik dosya yolları, AI eklerinin ayrı upload yolu, AI'nin firma dışı CRM bağlamı, müşteri ayrıntısı ve legacy META tenant alanları, kargo `all` hesabına düşüş ve statik pakete kopyalanan eski görseller. Kargo simülasyonlarının sipariş durumunu değiştirmesi ayrıca engellendi.

## Uygulanan model

- 256 bit rastgele `tomnap_session` çerezi; `HttpOnly`, host-only, `Path=/`, `SameSite=Lax`, üretimde `Secure`; 8 saat süre. Sunucuda yalnız token hash'i saklanır.
- Her istekte aktif kullanıcı, firma durumu ve parola/rol/firma fingerprint'i tekrar doğrulanır. Bunlar değişirse eski oturum kullanılamaz. Çıkış kaydı iptal eder.
- Üretimde Supabase oturum tablosu zorunludur. DB hatası bağımsız bir yerel oturum üretmez. Yerel atomik dosya deposu yalnız tek süreçli geliştirme/test içindir.
- Giriş: kayıtlı e-posta veya tam telefon ve mevcut scrypt parolası. İsim, telefon son yedi hanesi ve sabit kodlar giriş sağlamaz. Aktivasyon sonrası ayrıca giriş gerekir.
- Oturumlu değişikliklerde `x-csrf-token`; public giriş/kayıt/aktivasyon dahil gönderilmiş `Origin` için tam izinli origin denetimi. CORS wildcard erişim vermez. Eksik Origin tek başına yetki sağlamaz.
- API rotaları metot ve tam yol allowlist'iyle açılır. Bilinmeyen rotalar varsayılan olarak kapalıdır. Oturum cevapları ve özel kaynaklar `private, no-store` döner.
- IP başına giriş/aktivasyon/kayıt sınırı: 15 dakikada 20 istek. Dağıtık rate limiting ve gerçek proxy zinciri doğrulaması sonraki üretim işidir.

Mevcut scrypt hesaplarını taşımadan korumak için bu aşamada opaque sunucu oturumu seçildi. Supabase Auth'a göç yapılmadı. Veritabanında `anon` ve `authenticated` rollerinin uygulama tablolarına doğrudan erişimi kapalıdır; API `service_role` kullanır. **Service role RLS'yi aşar; firma izolasyonunu burada API uygular.** Kullanıcı JWT'sine dayanan ikinci, bağımsız bir tenant-RLS katmanı varmış gibi değerlendirilmemelidir.

## Erişim sözleşmesi

| İşlem                                           | Yetki                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sipariş okuma                                   | Yönetici, patron, satış, satınalma, finans; firma kapsamı                                                                          |
| Sipariş oluşturma, AI ve görsel araçları        | Yönetici, patron, satış, satınalma                                                                                                 |
| Sipariş güncelleme                              | Rol alan listesi: finans yalnız ödeme/tahsilat; satınalma ürün/lojistik; satış müşteri/ürün/ilk ödeme; patron/yönetici iş alanları |
| Sipariş silme                                   | Yönetici, patron, satış                                                                                                            |
| CRM okuma                                       | Yönetici, patron, satış, finans                                                                                                    |
| CRM yazma, inbox/webhook                        | Yönetici, patron, satış                                                                                                            |
| Davet oluşturma                                 | Yönetici veya kendi firmasının patronu; SUPER_ADMIN davet edilemez                                                                 |
| Kargo okuma/işlem                               | Yönetici, patron, satınalma; ayar yazma yalnız yönetici/patron                                                                     |
| Firma onaylama/ekleme/silme, sistem/DB yönetimi | Yalnız SUPER_ADMIN                                                                                                                 |
| Kurye oturumu                                   | Giriş mümkün; güvenilir kurye ataması kurulana kadar sipariş/CRM/inbox erişimi kapalı ve arayüz bunu açıklar                       |

`tenant_id`, `tenantId`, `x-tenant-id` ve desteklenen iç içe alanlar karşılaştırılır. Çelişkili, dizi/nesne, yabancı firma veya normal kullanıcı için `all` reddedilir. Sistem yöneticisi şirket verisini değiştirmeden önce somut firma seçer. Firma yönetimi ve açıkça yöneticiye ayrılmış DB işlemleri global olabilir. ID ile erişimde hem firma hem ID koşulu gerekir; DB'de bulunan fakat bellekte olmayan kayıtlar da bu denetime tabidir.

Public rotalar yalnız şunlardır:

- `GET /health`, `GET /api/health`: minimal sağlık cevabı.
- `POST /api/auth/giris`, eski `/api/firmalar/giris` alias'ı.
- `POST /api/firmalar/kayit`.
- `GET /api/auth/token-kontrol/:token`, `GET /api/firmalar/davet/:token`.
- `POST /api/auth/sifre-belirle`, `POST /api/firmalar/davet/katil`.

`GET /api/auth/oturum` kullanıcı/rol/firma, CSRF tokeni ve bitiş süresini döndürür; oturum yoksa 401. `POST /api/auth/cikis` oturum ve CSRF gerektirir. Harici webhook istemcileri için eski genel API anahtarı artık çalışmaz; bağımsız servis kimliği tasarlanmalıdır.

## Veri ve görseller

Sipariş, CRM ve inbox yollarında yapılandırılmış DB hata verdiğinde veya kayıt bulunamadığında bellekten sonuç üretilmez. AI yalnız seçili firmanın müşteri bağlamını kullanır. Önizleme CRM'yi değiştirmez. Inbox yeniden denemesi aynı sipariş için sabit ID kullanır; ancak tüm onay süreci henüz tek DB transaction değildir.

Yeni görseller PNG/JPEG/WebP içerik ve MIME denetiminden geçer; 10 MiB sınırı korunur. Dosya adı sunucunun ürettiği firma hash'i ve rastgele bileşen içerir. Servis, AI okuması ve siparişe görsel bağlama aynı sahiplik denetimini kullanır. Yabancı dosya 404, oturumsuz istek 401 alır.

Varsayılan upload dizini artık `DATA_DIR/uploads`. Depodaki 8 eski dosya içerikleri değişmeden `data/legacy-uploads` içine taşındı. Eski adlar sahiplik kanıtı olmadığından sunulmaz. Bunları otomatik olarak ilk firmaya bağlamak yerine, gerçek sipariş bağlantıları incelenerek sahiplik geçişi yapılmalıdır. SVG'ler ayrıca izinli resim formatına dönüştürülmelidir. `public/uploads` içinde dosya varsa derleme durur; PWA precache de uploads dizinini dışlar.

Kargo ayarları başka firmanın veya `all` hesabının kimlik bilgilerini devralmaz. Senkronizasyon yalnız `LIVE` olarak işaretlenmiş sonuçları kaydeder; simülasyon ve canlı servis hatası gerçek sipariş durumuna dönüşmez. Bazı sağlayıcı ekranları/bağlantı testleri hâlâ taslak veya simülasyon özellikleri içerir; gerçek sağlayıcı entegrasyon kabulü yapılmış sayılmaz.

## Üretime geçiş sırası

1. Mevcut şema, kullanıcı/firma verileri ve özel dosyalar için yedek ve staging kopyası hazırlayın. Eksik/yanlış tenant, tekrar eden e-posta ve kurye atamalarını inceleyin.
2. Node 22 ve sunucuya özel `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, HTTPS `APP_URL` yapılandırın. Anon anahtar fallback'i kaldırıldı. Service role tarayıcıya verilmez.
3. Mevcut SaaS şeması üzerinde `supabase/migrations/20260917151255_server_sessions_and_private_tables.sql` uygulayın. `oturumlar` tablosunu oluşturur, eski permissive politikaları ve kolon bazlı eski grant'leri kaldırır. Yeni kurulum SQL'leri de bu modelle güncellendi. Migration bilinen uygulama tablolarını kapsar; canlı ortamdaki ek view/RPC/Storage politikaları ayrıca incelenmelidir.
4. Mevcut aktif scrypt hesapları kullanılabilir. İlk SUPER_ADMIN yoksa `TOMNAP_ADMIN_EMAIL`, `TOMNAP_ADMIN_PASSWORD` (en az 12 karakter), mevcut `TOMNAP_ADMIN_TENANT_ID` ve isteğe bağlı `TOMNAP_ADMIN_NAME` ile `npm run admin:bootstrap` çalıştırın. Komut mevcut admin/e-posta üzerine yazmaz. Parolayı komut geçmişine veya repoya koymayın; işlem sonrası bootstrap ortam değişkenlerini kaldırın.
5. Eski görsellerin sahiplik geçişini ve kalıcı özel dosya saklamayı tamamlayın. Vercel gibi geçici dosya sistemlerinde mevcut yerel upload/kargo ayarı modeli üretim için yeterli değildir.
6. Kod ve migration birlikte staging'de doğrulandıktan sonra dağıtın. Eski PWA istemcisinin güncellenmesini de test edin. Kullanıcının önceden indirdiği içerik bu değişiklikle geri alınamaz.

Bu çalışma bu adımları canlı ortamda yürütmedi. Migration uygulanmadan yeni üretim oturum açılışı başarılı sayılmaz.

## Doğrulama

- `npm run lint`: başarılı.
- `npm run build`: Vite/PWA, Node ve iki Vercel serverless paketi üretildi; statik dağıtımda özel upload kalmadı.
- `npm run test:coverage -- --reporter=dot --maxWorkers=2`: **27 dosya, 374/374 test**. Satır kapsamı **%29,58**; branch **%22,60**, statements **%29,73**, functions **%21,13**. Genel kapsam hâlâ düşüktür.
- Oturum servisi satır kapsamı **%98,91**, auth middleware **%95,45**, auth rotası **%92**.
- Gerçek `createApp` + beş kullanıcı rolü + iki firma + gerçek çerez/CSRF ile **12 entegrasyon senaryosu**; middleware mock edilmedi. Ek **22 çekirdek tenant regresyonu**, **35 middleware oturum senaryosu**, **55 oturum/bootstrap testi**.
- İzole PostgreSQL 17: eski allow-all politikaları ve tablo/kolon grant'leri eklenerek migration denendi. Anon/authenticated doğrudan okuma reddi; geçici SELECT grant'i altında RLS sıfır kayıt; service_role oturum ekleme ve kullanıcı silindiğinde session cascade başarılı. Testler transaction rollback kullanır. CI'ya aynı SQL regresyon işi eklendi.
- Gerçek tarayıcı: owner giriş/yenileme; HttpOnly; yalnız firma A verisi; firma B isteğine 403; arayüzden lojistik güncellemesi; çıkış sonrası 401/veri temizliği; sahte storage+URL koduyla giriş reddi; gerçek admin girişi ve firma B seçimiyle A verisinin kalkması doğrulandı. Eski PWA cache'i test sırasında temizlenerek son build kontrol edildi; bu staging güncelleme kabul testi yerine geçmez.
- `npm audit --omit=dev --json`: **0 bilinen üretim bağımlılığı açığı**. Bu sonuç uygulama güvenlik garantisi değildir.
- Testler geçici veri/upload dizinleri kullanır, dış ağ çağrılarını engeller. Browser fixture ve PostgreSQL de ayrıdır; gerçek müşteri/sunucu verisi kullanılmaz.

Build'de doküman vendor paketi yaklaşık 1,12 MB kaldı. Performans bütçesi ve parça bazlı yükleme sonraki P2 işidir.

## Sonraki sistematik paket

1. **P1 — Kalıcılık ve işlem bütünlüğü:** kayıt/aktivasyon/davet/inbox onayı ve yedek geri yüklemeyi transaction/idempotency ile tamamlamak; sessiz dosya yazma hatalarını kaldırmak; kargo ayarı ve upload için kalıcı sunucu deposu. Firma/rol kota sayımlarını güvenilir DB işlemleriyle uygulamak.
2. **P1 — Kimlik ve veri geçişi:** kurye-kullanıcı ataması, legacy görsel sahipliği; tekrar eden e-posta/telefon ve mevcut tenant alanlarının kontrollü düzeltilmesi; kriptografik sabit fallback'in kaldırılması ve mevcut şifreli veriye anahtar geçişi; servis/webhook kimliği.
3. **P1 — Üretim kabulü:** gerçek Supabase/RPC/Storage erişim denetimi, session migration provası, çok süreçli rate limiting, parola sıfırlama/MFA stratejisi ve PWA güncelleme testi.
4. **P2 — Kalite:** strict TypeScript, rol bazlı uçtan uca CI, veri modeli doğrulaması, modül küçültme ve bundle optimizasyonu. Tanılama/landing metnindeki doğrulanmamış yüzde güvenlik garantileri kaldırıldı; tüm ürün iddiaları için ayrı işlev kabulü hâlâ gereklidir.

Öncelik bir sonraki adımda veri kalıcılığı ve transaction bütünlüğüdür. Auth kaynak açıklarının kapanması, bu kalan işlerin tamamlandığı anlamına gelmez.

## Teknik dayanaklar

- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): cookie, token ve oturum yaşam döngüsü.
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): token ve origin denetimi.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): policy/grant ilişkisi ve service role bypass davranışı.
