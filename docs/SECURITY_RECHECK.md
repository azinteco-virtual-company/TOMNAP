> 17 Eylül 2026 devam paketi: oturum/yetki değişiklikleri ve güncel durum [SESSION_SECURITY.md](SESSION_SECURITY.md) içinde. Aşağıdaki Faz 1 sonuçları tarihsel inceleme kaydıdır.

# TOMNAP — İkinci inceleme ve iyileştirme planı

Tarih: 17 Eylül 2026. İnceleme temeli: `90b8eaed6419b4f982c1e1fdd608e85144553026`.
Çalışma dalı: `codex/security-recheck-phase1`.

**Sonuç:** Önceki değerlendirmedeki üretime hazırlık kaygısı geçerli. Ancak bazı ifadelerin daraltılması, yeni açıkların eklenmesi ve testlerin güvenlik açısından yeniden yorumlanması gerekiyor. Bu çalışmada ilk düzeltme paketi uygulandı; tüm P0 sorunları kapanmadığı için üretime hazır kararı verilmedi.

## 1. Önceki değerlendirmeye öz kontrol

Yerel çalışma alanında proje bulunmadığından GitHub kaynakları karşılaştırıldı. `tural-musab/TOMNAP-new-` ile `azinteco-virtual-company/TOMNAP` aynı başlangıç commit’ine sahip. Çalışma ilk deponun ayrı yerel dalında yapıldı. `tural-musab/TOMNAP` ana dalı ise farklı bir Next.js tanıtım sitesi.

Önceki yanıtta belirtilen `ef0797d`, “docs: add comprehensive TOMNAP technical audit” PR’ı ve `docs/TECHNICAL_AUDIT.md` erişilebilir aramalarda bulunamadı. Bu, bu eserlerin hiç var olmadığını kanıtlamaz; önceki commit/PR iddiası doğrulanamadı. İlgili erişilebilir eski çalışma [güvenlik PR #1](https://github.com/azinteco-virtual-company/TOMNAP/pull/1).

| Önceki iddia                                    | Yeniden değerlendirme                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 87 test başarılı                                | İzole başlangıç kopyasında 11 dosya, **87/87** yeniden üretildi. Fakat bazı testler parolasız girişi başarı sayıyordu. Test sayısı güvenlik kanıtı değildir. |
| Sunucu oturumu/rol/tenant doğrulaması yok       | Doğrulandı; hâlâ açık. İstemcinin seçtiği tenant veya localStorage rolü güvenilir kimlik değildir.                                                           |
| Sabit admin/demo kodları ve URL erişimi         | Kaynakta doğrulandı; bu pakette merkezi oturum geçişi tamamlanmadığından açık olarak tutuldu.                                                                |
| RLS `USING (true)` tenant izolasyonu sağlamıyor | Kaynak SQL için doğru. Canlı policy, GRANT ve Data API ayarları incelenmedi; canlı veritabanının herkese açık olduğu kesinleştirilmedi.                      |
| Geniş public API istisnaları                    | Doğrulandı. Ayrıca origin/fetch başlıklarıyla kimlik doğrulama atlanabiliyor; aşağıdaki yerel negatif test bunu gösteriyor.                                  |
| Upload sınırı yok                               | Fazla geniş ifade: Express’te 25 MB istek sınırı zaten vardı. Dosya imzası, çözülmüş görsel ve uzak yanıt sınırları eksikti; bu pakette eklendi.             |
| SSRF/DNS rebinding                              | Doğrulandı. IPv6 loopback, denetimsiz indirme ve redirect/DNS boşlukları bulundu; indirme yolları yeniden düzenlendi.                                        |
| Hibrit kalıcılık tutarsız                       | Doğru. “Hiç Supabase yazımı yok” sonucu yanlış olur: yazım var, bazı rotalarda `{error}` görmezden geliniyor veya bellek/DB farklı kaynaklar kullanıyor.     |
| Kişisel veri ifşası                             | Public firma yanıtında ad/e-posta/telefon alanları mevcut. Örnek kişilerin gerçekten var olduğu veya verilerin izinsiz toplandığı kanıtlanmadı.              |
| Testler proje dosyalarına yazıyor               | Doğrulandı; veri, kargo ayarları ve uploads için test dosyası başına geçici dizin getirildi. Harici ağ/anahtar kullanımı testte engellendi.                  |
| Strict mode / coverage / E2E eksik              | Strict kapalı. Bu çalışmada kapsam raporu eklendi ve 3 tarayıcı senaryosu çalıştırıldı. Tam uçtan uca gerçek DB ve oturum testleri hâlâ yok.                 |
| Registry 403 nedeniyle audit yapılamadı         | Bu ortamda yeniden denendi ve çalıştı. Başlangıçta 2 orta, 1 yüksek bağımlılık uyarısı bulundu; güncellemeler sonrası sıfır.                                 |
| Genel puan 5/10                                 | Ölçüt/ağırlık verilmediği için nesnel bir ölçüm sayılmıyor. Bu raporda puan yerine açık riskler ve yayına çıkış koşulları kullanıldı.                        |

“Bütün router’lar kökten de açık” şeklinde bir genelleme de yapılmamalı: başlangıç kodunda çift mount yalnız görsel router’ında kaldı. Node/Docker ile Vercel yönlendirme davranışları aynı varsayılmadı.

## 2. Yeni veya daha belirgin bulgular

Aşağıdaki kaynak referansları başlangıç commit’ine aittir; düzeltmelerden sonraki satırlar farklıdır.

- **Hesap aktivasyonu atlatma:** `src/server/routes/auth.ts`, tam token bulunamazsa e-posta/prefix arıyor; bazı durumlarda gelen geçersiz token için sahipsiz firma üzerinde kullanıcı oluşturuyordu. GET token kontrolü bile yazım yapabiliyordu. Parola belirlemede süre ve durum kontrolleri eksikti. Önceki özetin ayrıca belirtmediği bu yollar kaldırıldı.
- **Davet tekrar kullanımı ve şema uyumsuzluğu:** İki kabul handler’ı farklı doğrulamalar yapıyordu. Auth kodu, SQL’de bulunmayan davet sütun adları kullanıyordu. Koşullu, tek kullanımlık tüketim ve ortak handler getirildi.
- **Aktivasyon token’ı sızıntısı / Host etkisi:** Kayıt cevabı doğrudan aktivasyon linki döndürüyor, e-posta linkleri istek Host başlığından üretiliyor ve token’lar loglanıyordu. Böylece e-posta sahipliği kontrolü anlamını kaybediyordu. Yanıttan token kaldırıldı; güvenilir `APP_URL` kullanılıyor; ilgili loglar temizlendi.
- **Kayıt yapılmadan başarı:** `ButikQeydiyyatModal.tsx` ağ/API hatasında tarayıcıda aktif firma uyduruyordu. Artık hata gösteriyor; kayıt cevabı çalışma alanı erişimi açmıyor.
- **Yerel dosya okuma:** Başlangıç `gorsel.ts:307–313`, `/uploads/../package.json` benzeri bir yolu upload dizini dışına çıkarıp Gemini’ye aktarabiliyordu. AI anahtarı gerekli; istemciye doğrudan dosya içeriği döndüğü iddia edilmedi. Gerçek yol ve symlink sınırı eklendi.
- **Başka görselin döndürülmesi:** Bulunamayan dosya için en yeni upload dosyası dönüyordu. Artık 404.
- **SVG’nin aynı origin’den sunulması:** Proxy, `image/*` cevabını kabul ederek SVG’yi de uygulama origin’inden sunabiliyordu. PNG/JPEG/WebP içerik doğrulaması proxy ve ilgili indirme yollarına uygulandı.
- **Başlıkla auth geçişi:** Üretim modunda yalnız sentetik bir özel route üzerinde normal anonim istek **401**, aynı isteğin `sec-fetch-site: same-origin` başlığıyla gönderilmesi **200** verdi. Gerçek veri kullanılmadı. Bu P0, sunucu oturumu geçişiyle birlikte kapatılacak; bu paket kapattığını iddia etmiyor.
- **Inbox cold start:** DB’den listeye alınan mesajlar yerel çalışma kopyasına eklenirken onay/reddet global bellek dizisinde aranıyor (`inbox.ts:15–43,198,275`). Yalnız DB’deki kayıt listede görünüp işlemde 404 verebilir. Kaynak bulgusu; bu pakette düzeltilmedi.

## 3. Uygulanan ilk paket

1. Testlerin `.env`, miras alınan servis anahtarları, harici ağ ve gerçek dosyalardan ayrılması; geçici dizin temizliği; CI’de veri dosyası değişimi kontrolü.
2. Tam, süresi geçmemiş, bekleyen aktivasyon token’ı şartı; e-posta/prefix/otomatik hesap onarımı ve rastgele ilk parolayla firma sahipliği kaldırılması.
3. Supabase yapılandırılmışsa normal kullanıcı girişi ve token doğrulamasında tek yetkili kaynak olması; pasif hesapların reddi; parolanın baş/son boşluklarının korunması.
4. Eski giriş, davet GET ve kabul endpoint’lerinin ortak doğrulama kullanması; SQL sütunlarıyla uyum; davet rolünün allowlist ile sınırlandırılması; rastgele 256 bit davet token’ı.
5. Koşullu token tüketimi: DB hatası 503, etkilenen satır yoksa 409; eşzamanlı tekrar kullanım testleri. Supabase modunda yeni davet döndürülmeden önce kalıcı yazım doğrulanır.
6. Aktivasyon linkinin public kayıt cevabından ve loglardan çıkarılması; Host başlığının e-postadaki bağlantı adresine etki etmemesi; kullanıcı metninin HTML e-postada kaçışlanması; gönderilmeyen e-postanın başarı sayılmaması.
7. Başarısız kayıtta sahte yerel firma/başarı kaldırılması. Eksik davet e-postası için parola ekranında iletişim alanı eklendi.
8. Görsel router’ının kök işlem yollarının kaldırılması; tam dosya eşleşmesi ve dizin sınırı; görsel imzası/MIME ve 10 MiB sınırı; uzak cevap boyutu/süresi, her redirect için adres doğrulaması ve bağlantının doğrulanan IP’ye sabitlenmesi.
9. Express **4.22.3**, `qs` **6.16.0**, SheetJS **0.20.3**; kilit dosyası güncellendi. SheetJS üreticinin sabit sürümlü dağıtım URL’sinden kuruluyor; SHA-512 bütünlüğü lockfile’da mevcut.
10. Coverage komutu ve CI kontrolü; README/API’de desteklenmeyen güvenlik iddialarının düzeltilmesi. Vercel’in izlenen iki serverless çıktısı kaynak koddan yeniden üretildi.

Bu liste tam güvenlik kapanışı değildir: örneğin davet kabulü sertleştirilmiş olsa bile **davet oluşturma yetkilendirmesi henüz yoktur**. Açık public route üzerinden başka firma için davet üretme riski devam eder.

## 4. Doğrulama

| Kontrol                                   | Sonuç                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Node / npm                                | 22.23.1 / 10.9.8                                                            |
| İzole başlangıç                           | 11 dosya, 87/87 test                                                        |
| `npm run lint`                            | Başarılı — TypeScript tip kontrolü                                          |
| `npm run build`                           | Başarılı — Vite/PWA, Node ve iki Vercel çıktısı                             |
| `npm run test:coverage -- --maxWorkers=2` | **20 dosya, 227/227 test başarılı**                                         |
| Tüm `src` satır kapsamı                   | **%20,57 (1232/5989)**; ifadeler %20,33, dallar %13,81, fonksiyonlar %13,03 |
| Auth route / publicFetch satır kapsamı    | %88,95 / %94,44; bunlar tüm uygulama kapsamı değildir                       |
| Browser kayıt senaryoları                 | 3/3 başarılı; mock API, service worker kapalı                               |
| `npm audit` / production audit            | İkisinde de 0 bildirilen açık                                               |
| `npm ci --ignore-scripts --dry-run`       | Kilit dosyası kontrolü başarılı                                             |
| `git diff --check`                        | Başarılı                                                                    |
| Veri dosyaları ve uploads                 | Git durumunda değişiklik yok                                                |
| İki izlenen Vercel çıktısı                | Yeniden üretildi; birbirleriyle birebir aynı                                |

Derleme uyarısı sürüyor: `vendor-documents` yaklaşık **1.121 kB**, ana uygulama paketi yaklaşık **827 kB** (minify edilmiş, gzip öncesi). Paket bölme çalışması P2 planında. Kapsam düşük olduğu için yeşil testler tam uygulama güvenliği veya işlev güvencesi olarak sunulmuyor.

Tarayıcıda kayıt için 503 hata, 200/e-posta kabul edildi ve 200/e-posta gönderilemedi senaryoları doğrulandı. Üçünde de sahte firma, erişim bayrağı veya doğrulamasız çalışma alanı geçişi oluşmadı. API cevapları testte karşılandı; gerçek e-posta/DB çalıştırılmadı. Bu testte service worker engellendi. Mevcut geliştirme worker’ı ağ isteğini geçiriyor; buradan API önbellek sızıntısı sonucu çıkarılmadı.

Supabase davranışı mock sorgularla test edildi. Gerçek PostgreSQL transaction, RLS, GRANT veya bulut dağıtımı bu doğrulamaya dahil değildir. `npm audit` sonucu da kaynak kodun güvenli olduğunu veya henüz bilinmeyen bağımlılık açıklarının bulunmadığını kanıtlamaz.

## 5. Kalan riskler ve sistematik sıra

| Sıra                            | İş paketi                                                                                                                                                                                                                                                                                                                    | Tamamlanma koşulu                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — P0**                      | Sunucuda doğrulanan oturum ve rol: yönetilen Supabase Auth geçişi tasarımı, mevcut kullanıcı/parola geçişi, sunucuda üyelik kontrolü, cookie/CSRF veya doğrulanan token akışı. Sabit admin/demo ve URL/localStorage yetki yollarını kaldır; origin başlıklarını kimlik sayma; public rotaları yöntem + tam path ile tanımla. | Anonim/sahte header/sahte rol/sona ermiş oturum istekleri reddedilir. Login/logout/iptal uçtan uca geçer. API anahtarı kullanıcı oturumu yerine kullanılmaz.                                                                                                |
| **2 — P0**                      | Tenant ve nesne sahipliği: sipariş, müşteri, inbox, firma, davet, kargo, görsel ve DB yönetim rotalarını kapsayan rol matrisi. İstemciden `all`/tenant değiştirerek erişimi kapat; demo verisini ve dosyalarını ayır.                                                                                                        | Tenant A, B’nin nesnesini okuyamaz/değiştiremez; kurye firma onayı/restore/davet yapamaz; demo gerçek veri veya ücretli servise erişemez. Negatif testler her yöntem için vardır.                                                                           |
| **3 — P0, canlı durum koşullu** | Gerçek şema/policy/GRANT envanteri; eski `USING(true)` politikalarını kaldıran sürümlü RLS geçişi; service-role kullanımını açıkça sınırla.                                                                                                                                                                                  | Geçici PostgreSQL’de anon, authenticated, A/B ve service-role matrisi geçer. Policy eklemek tek başına yeterli değildir; eski permissive politikalar OR birleşimiyle erişimi açık bırakmamalı. Canlı geçiş öncesi staging sonucu ve geri alma planı vardır. |
| **4 — P1**                      | Transaction ve kalıcılık: firma+kullanıcı kaydı, davet tüketimi+kullanıcı oluşturma, aktivasyon+firma güncellemesi, güvenilir e-posta kuyruğu/yeniden gönderim, duplicate/unique kuralları; inbox cold start; CRM/kargo/restore hata yönetimi.                                                                               | Hata/timeout/yeniden başlama/çift istek testlerinde sahte başarı, kısmi sahiplik veya kaybolan kayıt yoktur. Restore atomik ve yönetici yetkisine bağlıdır.                                                                                                 |
| **5 — P1**                      | Şifreleme anahtarı yönetimi ve rotasyonu; sabit AES fallback ve hata halinde düz metin dönüşünü kaldır. Public kişi alanlarını azalt; örnek verinin sentetikliğini doğrula; AI’ye gönderilen rehberi tenant ile sınırla. Upload kota/çözünürlük/özel erişim ve veri saklama politikası.                                      | Eksik anahtar güvenli hata verir; eski şifreli kayıtlar kontrollü taşınır; A/B dosya izolasyonu geçer; AI payload’ında başka tenant bilgisi yoktur.                                                                                                         |
| **6 — P2**                      | Strict TypeScript’e aşamalı geçiş, büyük modülleri bölme, rota bazlı lazy loading, kapsamı kritik akışlara göre büyütme, üretim CSP/CORS, gerçek backend ile Playwright akışları.                                                                                                                                            | İş kuralları ve negatif yetki matrisi korunur; bundle bütçesi ölçülür; coverage ve E2E CI’de düzenli çalışır.                                                                                                                                               |

**İlk paketin bilinen sınırlamaları:** Birden fazla DB yazımı henüz transaction değildir. Örneğin kullanıcı yazımı başarısızsa firma kaydı yetim kalabilir; davet tüketildikten sonra kullanıcı insert’i başarısızsa yeni davet gerekebilir; aktivasyon sonrası firma güncellemesi başarısızsa kısmi sonuç oluşabilir. Artık hata döner, fakat atomiklik sağlandığı iddia edilmez. Davet sırasında girilen e-posta ayrıca doğrulanmaz; telefon eşleşmesi hâlâ son hanelere dayanır. Supabase kullanılmayan modda davetler hâlâ yalnız bellekte tutulur ve yeniden başlatmada kaybolur. Yerel dosya yazma servislerinin bütün hata yolları bu pakette düzeltilmedi.

Yayına çıkış için 1–3 numaralı paketlerin tamamlanması, kritik veri yazımlarının staging’de doğrulanması ve kalan yüksek risklerin açıkça kapatılması gerekir. Bu çalışma canlı veritabanını değiştirmedi, ana dalı birleştirmedi veya uygulamayı dağıtmadı.

## 6. Yeniden çalıştırma ve kaynaklar

Node 22 ile:

```sh
npm ci
npm run lint
npm run build
npm run test:coverage -- --maxWorkers=2
npm audit --omit=dev --audit-level=moderate
git diff --check
```

`npm run build`, `api/index.js` ve `api/[...all].js` dosyalarını yeniden üretir. `coverage/coverage-summary.json` ve `coverage/lcov.info` ölçüm çıktılarıdır. Testler test dosyası başına geçici veri dizini kullanır; canlı servis anahtarı gerektirmez.

Teknik doğrulama kaynakları: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase UPDATE](https://supabase.com/docs/reference/javascript/update), [PostgreSQL policy davranışı](https://www.postgresql.org/docs/current/sql-createpolicy.html), [qs üretici güvenlik duyurusu](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g), [SheetJS resmi kurulum kaynağı](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Kaynaklar kod incelemesini destekler; canlı yapılandırma kanıtı yerine geçmez.
