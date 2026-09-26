# Faz 5 — Eksiksiz listeler, özel depolama ve tarayıcı doğrulaması

17–21 Eylül 2026. Faz 4 (`a929b24`) üzerine hazırlanmıştır. Kaynak kod, izole PostgreSQL ve sentetik tarayıcı verileri üzerinde çalışıldı. Canlı Supabase, sağlayıcı hesapları ve üretim dağıtımı bu doğrulamanın kapsamında değildir. Önceki raporlar kendi fazlarının anlık durumudur; bu belge onların kalan işler listesindeki tamamlanan maddeleri günceller.

## Yeniden kontrolde bulunanlar

- Sipariş, müşteri ve inbox sorguları PostgREST satır sınırında kesilebiliyor; arayüz eksik kayıtlarla toplam hesaplayabiliyordu. API ve bütün çalışan liste tüketicileri sürümlü sayfalamaya geçirildi.
- Doküman bileşenlerini ayrı yüklemek tek başına yeterli değildi: PWA başlangıçta bütün JavaScript dosyalarını önbelleğe alıyordu. İsteğe bağlı doküman paketleri hem statik import zincirinden hem zorunlu precache listesinden çıkarıldı.
- İlk optimize derleme başarılı olmasına rağmen gerçek tarayıcıda React/CommonJS yükleme döngüsü nedeniyle açılış hatası oluştu. Tarayıcı testi bunu yakaladı; ortak React yardımcılarının aynı pakete alınmasıyla düzeltildi. Sadece build başarısına dayanılarak kabul verilmedi.
- Kargo ekranında gerçek bağlantı testi yapılmadan “Canlı Bağlantı” ifadesi gösteriliyordu. Etiketler yapılandırma/test durumunu ifade edecek şekilde değiştirildi.
- Başarısız sipariş yenilemesi detay penceresinde eski kaydı yenilenmiş gibi gösterebiliyordu. Yenileme artık hata durumunu korur; 409 sonrası hata ve başarılı yeniden deneme tarayıcıda doğrulandı.
- Gerçek HTTP denemesinde Storage yanıt gövdesi takılınca yalnız iptal sinyalinin yeterli olmadığı görüldü. Başlık ve gövde okumaları artık açık zaman sınırıyla yarışır; tamamlanmayan iptal işlemi beklenmez.
- Yerel kurye iletişim dosyasının Git ignore kapsamı eksikti; `data/couriers.json` ve türevleri eklendi.

Önceki denetimin `ef0797d` commit/PR iddiası bu çalışma kopyasında doğrulanmış değildir. Koddan doğrulanabilen bulgular ve yeni regresyonlar esas alındı.

## Tam liste sözleşmesi

`GET /api/siparisler`, `/api/inbox`, `/api/musteriler` ve `/api/musteriler/:id/siparisler` en fazla 500, varsayılan 200 kayıtlık sayfalar döndürür. Sonraki çağrı aynı firma, endpoint ve `page_size` ile `pagination.nextCursor` değerini `cursor` parametresine verir. İmleç yetki sağlamaz; oturum/rol/firma kontrolü her çağrıda yeniden uygulanır.

```json
{
  "pagination": {
    "version": 1,
    "total": 1201,
    "hasMore": true,
    "nextCursor": "SUNUCUNUN_DONDURDUGU_IMLEC",
    "revision": "VERI_KUMESI_SURUMU",
    "pageSize": 200
  }
}
```

Eski `siparisler`, `musteriler` ve `mesajlar` alanları korunur; artık tek sayfa içerirler. Inbox `toplam` alanı bekleyen mesaj sayısıdır; tüm durumların sayısı `pagination.total` içindedir. Kimlik sırası deterministiktir; arayüz tam yükleme sonrası tarih sırasına getirir. Sayfalar arasında veri değişirse 409 döner ve baştan yüklemek gerekir. Bozuk veya başka kapsama ait imleç 400, sınır aşımı 413, depolama hatası 503 verir.

İstemci; sürüm, toplam, yinelenen kimlik ve ilerlemeyen imleci denetler. Son sayfa ve toplam eşleşmeden veri kümesini ekrana yayımlamaz. Oturum veya firma değişince gecikmiş yanıtlar atılır. Ana sipariş yüklemesi başarısızsa raporlar yerine hata ve tekrar deneme gösterilir; eksik sayfa finans toplamı gibi sunulmaz.

Seçilecek sayfanın boyutu, veritabanında JSON toplama işleminden önce kontrol edilir; 32 MiB aşımı büyük bir yanıt oluşturmadan reddedilir.

Sunucu RPC'sinin `STABLE` sorgusu, sürümü ve verileri aynı PostgreSQL statement snapshot'ından okur. Sipariş/müşteri/inbox değişiklik tetikleri firma ve tüm firmalar görünümünün sürümünü günceller; rollback sürümü de geri alır. RPC ve sayaç tablosu tarayıcı rollerine kapalıdır.

**Sınır:** Bu aşama sınırsız veri analitiği değildir. Tam istemci veri kümesi 10.000 kayıt / 32 MiB ile sınırlıdır. CRM, mevcut sanal müşteri eşleştirmesi nedeniyle müşteri ve sipariş kaynaklarını birlikte alır; 10.000 sınırı kaynakların toplamıdır. Borç hesaplaması bütün bu snapshot üzerinde yapılır; sayfalar arasında tekrar hesaplandığı için büyük firmalarda pahalıdır. Bir sonraki adım normalize müşteri ilişkileri, SQL toplulaştırma, filtrelenmiş sunucu raporları ve yük testidir. Firma sayacı ve kurye roster/görev yollarının ayrı sınırları bu yeni sözleşmeye dönüşmedi; Faz 4'ün açık hata sınırları korunur.

## Kalıcı özel görsel depolaması

`UPLOAD_STORAGE_BACKEND=local` mevcut özel disk yolunu kullanır. Bu mod yalnız kalıcı ve sunucularca paylaşılan diskle işletilebilir; Vercel ortamında görsel işlemleri reddedilir. `UPLOAD_STORAGE_BACKEND=supabase` sabit `tomnap-private-images` bucket'ını kullanır. Bulut hatasında yerel diske sessiz geçiş yoktur.

Bucket private olmalı, dosya sınırı en fazla 10 MiB olmalı ve yalnız PNG/JPEG/WebP türlerine izin vermelidir. Her işlem bu ayarları yeniden doğrular. Sunucu, dosya adını ve gerçek dosya imzasını denetler; üzerine yazma kapalıdır. Storage HTTP isteklerinde 15 saniye sınırı, 10 MiB yanıt sınırı ve redirect yasağı vardır. Referans doğrulaması firma yetkilerini önce kontrol eder, tekrarları birleştirir, en fazla dört depolama sorgusunu eşzamanlı yürütür ve 30 saniyeden sonra yeni sorgu başlatmaz; başlamış istekler kendi zaman sınırına tabidir.

Tarayıcıya Storage anahtarı veya public/signed URL verilmez. Mevcut `/uploads/<firma-ozel-dosya-adi>` adresleri uygulama oturumu ve firma yetkisiyle sunulur; `Cache-Control: private, no-store` kullanılır. Çıkıştan sonra aynı uygulama adresi açılamaz. Dosyanın daha önce indirilmiş kopyası geri alınamaz.

Yeni Storage politikaları **restrictive** olduğundan eski geniş izin politikaları bu bucket'ı tarayıcı rollerine açamaz. Diğer bucket'ların mevcut politikaları korunur. Storage yöneticisinin bucket'ı sonradan public yapması veya service-role anahtarının kötüye kullanılması RLS'nin çözebileceği bir durum değildir; bucket ayarı/operatör erişimi staging kabulünde ayrıca doğrulanmalıdır.

### Kurulum sırası

1. Önceki Faz 2–4 migration zinciri ve `20260917174218_consistent_lists_and_private_storage.sql` uygulanır. Storage şemasında RLS açık olmalıdır; aksi durumda migration durur. `tests/sql/*fixture.sql` dosyaları yalnız test ortamı içindir; canlı projede çalıştırılmaz.
2. Sunucu ortamına `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ve bakım komutu için `UPLOAD_STORAGE_BACKEND=supabase` verilir. Anahtarlar tarayıcı değişkenlerine veya Git'e yazılmaz.
3. Bucket resmi Storage API ile oluşturulur. Komut aynı adlı mevcut bucket'ın ayarını değiştirmez; uygun değilse hata verir:

```bash
UPLOAD_STORAGE_BACKEND=supabase npx tsx scripts/prepare-private-storage.ts --create
```

4. Mevcut özel disk dosyaları varsa aşağıdaki kontrollü taşıma tamamlanır. Yeni dosya yoksa bu adım gerekmez.
5. Uygulama `UPLOAD_STORAGE_BACKEND=supabase` ile yayımlanır; iki firma, çıkış, kesinti, yeniden başlatma ve gerçek Storage erişimi staging'de doğrulanır. SQL ile nesne metadata'sı taşınmaz veya silinmez.

### Mevcut dosyaları taşıma

Araç yalnız firma sahipliği daha önce belirlenmiş `t_<firma-hash>_<rastgele-ad>.(png|jpg|webp)` dosyalarını taşır. Faz 4'teki 8 eski görselin gerçek sahipliği hâlâ otomatik belirlenmez; onlar için önce ayrı legacy manifest/sahiplik süreci gerekir.

Yükleme yapan süreçleri bakım sırasında durdurun. Kaynak dizindeki tüm dosyaların envanterini çıkarın; manifesti kaynak dizinin dışında tutun. Komut varsayılan olarak yazmaz:

```bash
npx tsx scripts/migrate-private-uploads.ts plan --source-dir /secure/uploads --out /secure/images-manifest.json
npx tsx scripts/migrate-private-uploads.ts apply --manifest /secure/images-manifest.json --sha256 ONAYLANAN_MANIFEST_SHA256
UPLOAD_STORAGE_BACKEND=supabase npx tsx scripts/migrate-private-uploads.ts apply --manifest /secure/images-manifest.json --sha256 ONAYLANAN_MANIFEST_SHA256 --apply
```

Kaynak dosyalar, symlink, isim, boyut, imza ve SHA256 ile kontrol edilir. Envantere yeni dosya eklenmesi, silinmesi veya değişmesi yeni inceleme gerektirir. Aynı hedef isimde farklı içerik varsa üzerine yazılmaz. Her yeni kopya tekrar indirilerek doğrulanır; yarıda kesilen işlem aynı manifestle güvenli biçimde denenebilir. Sonuç tüm dosyalar için başarılı olmadan uygulamanın backend'ini değiştirmeyin. Araç kaynakları silmez, URL/DB sahipliğini değiştirmez; çoklu süreçleri kendisi kilitlemez. DB ve nesne deposu arasında ortak transaction yoktur. İşletme yedekleme/geri yükleme ve yetim nesne temizleme politikası ayrıca gerekir.

## Doküman yükleme ve tarayıcı CI

Excel ve PDF kütüphaneleri yalnız dışa aktarma başlatıldığında yüklenir. Yükleme sırasında buton devre dışıdır; hata görünür ve tekrar denenebilir. Firma/oturum değişmişse gecikmiş dışa aktarma tamamlanmaz. `optional-doc-*` paketleri PWA'nın zorunlu önbelleğine alınmaz; ilk kez çevrimdışıyken bu araçların kullanılacağı garanti edilmez. Arayüz yeniden çevrimiçi olma mesajı verir.

Ölçülen başlangıç JavaScript yükü 2.548.944 → 1.435.402 bayt (%43,7 azalma), aynı dosyaların gzip toplamı 721.028 → 373.726 bayt (%48,2 azalma) oldu. PWA precache 2.696,24 → 1.704,23 KiB (%36,8 azalma). Bunlar ağ aktarımı/CWV veya gerçek cihaz süre ölçümü değildir. Dokümanlara ait iki küçük yardımcı paket (126.259 bayt) hâlâ precache içindedir; bütün yardımcı bağımlılıkların çevrimdışı başlangıçtan çıkarıldığı iddia edilmez.

`@playwright/test` sürümü ve Chromium kurulumu package-lock ile sabitlenir. CI'da ayrı Chromium işi; gerçek giriş, CSRF/rol/firma sınırları, kurye kaydı/bağlama/atama/teslim, değişmeyen tahsilat tutarı, maskeli kargo ayarlarında iki sürümlü kaydetme, özel görsel/çıkış, gerçek Excel/PDF indirmesi, belge paketi ağ hatasından kurtarma ve başarısız detay yenilemesini doğrular. Sunucu geçici dizin ve rastgele port kullanır; yerel `.env`, gerçek veriler ve dış ağ erişimi testten ayrılır.

```bash
npm ci
npm run build
npm run test:e2e:install
npm run test:e2e
```

Birim/entegrasyon testleri: `npm run test:coverage`; tip kontrolü: `npm run lint`. CI ayrıca temiz PostgreSQL şema/migration zincirini, RLS/transaction sınırlarını ve eşzamanlı işlem testlerini çalıştıracak şekilde yapılandırıldı. Bu çalışmada yerel eşdeğerler çalıştırıldı; uzak GitHub Actions koşusu başlatıldığı iddia edilmez.

## Doğrulama özeti

21 Eylül kapanış kontrolü: **51 dosyada 663/663 Vitest testi**, **6/6 Chromium senaryosu**, TypeScript ve değişen kaynakların biçim kontrolü başarılı. Satır kapsamı **%39,82**; tüm ürün akışlarının kapsandığı anlamına gelmez. Son üretim derlemesiyle test edilen giriş paketi `index-C9Nb-RdM.js` ve başlangıç dosyaları eşleştirildi. Aynı gün `npm audit --omit=dev --audit-level=moderate` bilinen üretim bağımlılığı açığı bildirmedi.

17 Eylül'de son SQL içeriğiyle temiz PostgreSQL 17.5 üzerinde migration zinciri, **9 SQL test dosyası** ve **18 ayrı bağlantı senaryosu** geçti. Sonraki değişiklikler uygulama biçimi ve belge güncellemeleridir; SQL aynı içeriktedir. Büyük sayfa için 413, yabancı firmanın etkilenmemesi, Storage tarayıcı rolü engelleri, commit/rollback ve eski imleç denetimleri dahildir.

Testler sentetik geçici veri kullanır. Testlerin dış servis erişim engelleri korundu. Canlıya yazılmadı ve uzak CI koşusu başlatılmadı.

## Kalan yayın kapıları

- Canlı verilerin staging kopyasıyla migration, anahtar kurulumu, özel Storage ve geri yükleme provası.
- Gerçek kullanıcı–kurye ve eski görsel–firma eşlemelerinin işletme tarafından doğrulanması.
- Gerçek Supabase Auth/Storage altyapısı değil, uygulamanın DB oturum sistemi kullanılıyor; gerçek HTTPS cookie, çok süreç, Storage API/RLS ve bağlantı havuzu staging kabulü hâlâ gerekli.
- Büyük veri için normalize CRM ilişkileri, sunucu raporları, revision sayaçlarının yük testi; 10.000/32 MiB üzeri veri için açık ürün çözümü.
- PWA sürüm geçişi ve çevrimdışı kullanım; Chromium dışında hedef tarayıcı/mobil doğrulaması; henüz düşük kalan genel test kapsamı ve TypeScript strict dönüşümü.
- Gerçek kargo/e-posta/AI sağlayıcı hesaplarıyla kabul, işletim gözlemi ve yedekleme/nesne yaşam döngüsü.

Kaynaklar: özel bucket kuralları [Supabase bucket oluşturma](https://supabase.com/docs/guides/storage/buckets/creating-buckets), Storage işlemlerinin API üzerinden yapılması [Storage şeması](https://supabase.com/docs/guides/storage/schema/design), kısıtlayıcı politikaların birleşimi [PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html). Bunlar tasarım dayanaklarıdır; canlı proje doğrulaması değildir.
