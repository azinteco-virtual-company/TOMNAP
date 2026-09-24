# Açık sorular — insan onaylı AWB eşleştirmesi (Y-6)

Bu dosya, manifest eşleştirmesi düzeltilirken yapılan varsayımları ve karar
bekleyen noktaları listeler. "Kodda" satırı bugünkü davranışı anlatır. Kod
yazılmamış maddeler **Kod yok** olarak işaretlidir.

## Veritabanı

1. ✅ **Karar verildi (23 Eylül 2026):** Guardrail güncellendi: down dosyalarında
   yalnız aynı migration'ın oluşturduğu nesneler için `DROP ... IF EXISTS` serbest.
   00-A'nın down dosyası artık `tomnap_confirm_awb_matches`'i düşürüyor. Up → down
   → up döngüsü temiz PG17'de ve CI'da `tests/sql/awb-migration-roundtrip.sql` ile
   sınanıyor. Down'lar iki kez çalıştırılabiliyor, sipariş verisi ve önceden var
   olan nesneler korunuyor.

   **Geri alma dosyası DROP kullanmıyor.** Guardrail `DROP` yasakladığı için
   `supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql` yalnızca
   fonksiyonun EXECUTE yetkisini tüm API rollerinden (`service_role` dahil) geri
   alır. Fonksiyon katalogda kalır ve onaylar kapalı hale gelir. Yeniden
   etkinleştirmek için ileri migration tekrar çalıştırılır (`CREATE OR REPLACE`
   + `GRANT`).
   *Soru:* Sadece bu işte oluşturulan yeni nesneler için `DROP FUNCTION`'a izin
   var mı, yoksa REVOKE tabanlı geri alma yeterli mi?
2. ✅ **Karar verildi (23 Eylül 2026):** Yalnız eklemeye açık `awb_match_approvals`
   tablosu eklendi (`20260923164650_awb_match_approvals.sql`). Kayıt, AWB'yi yazan
   `tomnap_approve_awb_matches` ile aynı transaction'da oluşur. Uygulama notları:
   - UPDATE/DELETE için **ikisi birden** seçildi: REVOKE (`service_role` dahil; yalnız
     SELECT/INSERT verildi) ve hata fırlatan BEFORE UPDATE/DELETE ile BEFORE
     TRUNCATE tetikleyicileri. REVOKE `service_role`'ü durdurur. Tetikleyici tablo
     sahibini ve ileride yanlışlıkla verilebilecek bir GRANT'i de durdurur.
   - Eşleşme türü, isim puanı ve manifest referansı istemciden alınmaz: `/onayla`
     manifesti yeniden alır, önerileri sunucuda yeniden hesaplar ve yalnız güncel
     bir aday onaylanabilir (`ONERI_GECERSIZ`). Manifest, dosya adı + SHA-256 +
     satır numarası ile referanslanır; kullanıcı kimliği oturumdan gelir ve RPC'de
     yeniden doğrulanır.
   - Kayıt yalnız gerçekten yazılan AWB için oluşur; idempotent tekrar yeni satır
     üretmez. `service_role` doğrudan INSERT edebilir (uygulama zaten bu rolle
     çalışır); bu anahtara sahip olan her şeyi yazabileceği için ek bir güven
     sınırı değildir.
   - Eski `tomnap_confirm_awb_matches` fonksiyonunun `service_role` yetkisi geri
     alındı; kayıtsız bir yazma yolu kalmadı. Geliştirme/demo bellek modu aynı
     kaydı süreç içinde tutar.

   **Köken kaydı yok. Kod yok.** Kimin hangi manifest satırını hangi siparişe
   onayladığı ayrıca saklanmıyor; yalnız siparişin AWB'si ve `ek_veriler`
   güncelleniyor.
   *Soru:* Yeni bir `awb_eslestirme_kayitlari` tablosu (RLS FORCE, yalnız
   `service_role`) eklensin mi? İleride aynı soruya (bu AWB nasıl yazıldı?)
   kesin cevap verebilmenin tek yolu bu.
3. **AWB tekilliği tenant içinde.** Aynı AWB başka bir butikte kayıtlıysa bu
   onayı engellemiyor. Engellemek, bir butiğe başka butiğin verisini sızdırırdı.
   *Soru:* Bu sınır doğru mu?

## Eşleştirme kuralları

4. ✅ **Karar verildi (23 Eylül 2026):** Kargo manifestleri çoğu zaman pasaport
   yazımıyla geldiği için yalnız zayıf aday puanına ASCII katlama eklendi. İki sabit
   şema var: Pasaport (Ə→A, Q→G, X→KH, C→J, Ş→SH, Ç→CH, Ğ→GH, Ö→O, Ü→U, I/ı/İ→I) ve
   Basit (aksanlar atılır). Kiril adlar ayrıca Latin'e çevrilir. Puan, bu
   biçimlerin en yükseği; önce NFKD ve birleşik işaret temizliği yapılır (JS'in
   `İ` → `i̇` davranışı testli). Sonuç: `Konul Isag`, `Gamar Asadova` ve
   `Jafar Khalilov` artık aday (puan 1,0). Y-6'daki iki hatalı eşleşme hâlâ
   eşleşmiyor (0,20 / 0,00). `normalizeName`, güçlü kurallar ve yazma
   değişmedi. Denetim scripti de katlanmış biçimde birebir aynı adları tutarlı
   sayar.

   **Transliterasyon.** İsimler harfleri koruyarak normalize ediliyor (ə, ş, ç, ğ,
   ı, ö, ü, Kiril). Bu yüzden ASCII yazılmış bir manifest adı düşük puan alıyor:
   `Konul Isag` ~ `Könül İsaq` = 0,455, eşiğin (0,5) altında, yani aday
   gösterilmiyor. Güçlü eşleşme (telefon/kod) bundan etkilenmiyor.
   *Soru:* Manifestlerde adlar ASCII mi geliyor? Öyleyse, normalizasyonu
   değiştirmeden yalnız zayıf aday puanı için ayrı bir transliterasyon
   karşılaştırması eklensin mi?
5. ✅ **Karar verildi (23 Eylül 2026):** Eşik 0,5 olarak kalıyor.

   **Zayıf aday eşiği 0,5 ve satır başına 5 aday.** Aynı ad farklı soyadı
   (`Aynur Mammadova` ~ `Aynur Həsənova` = 0,58) zayıf aday olarak görünür ama
   asla önceden seçilmez.
   *Soru:* Eşik uygun mu?
6. **Telefon normalizasyonu Azerbaycan numaralarını varsayıyor.** `0XX…`
   (10 hane) ve 9 haneli numaralar `994…` biçimine tamamlanır. Diğer ülkeler tam
   hane dizisiyle karşılaştırılır. İçinde metin olan değerler (ör. `Tel: 055…`)
   güçlü kanıt sayılmaz.
   *Soru:* Başka ülke formatları gerekiyor mu?
7. **"Mevcut sipariş kodu"** şöyle yorumlandı: manifestin Reference/Ref/Order No
   sütununun sipariş kimliği veya `kanada_takip_kodu` ile büyük/küçük harf
   duyarsız tam eşleşmesi (en az 4 karakter). `kanada_takip_kodu` rastgele 4
   haneli olduğu için çakışabilir; çakışırsa satır `BELIRSIZ` olur.
   *Soru:* Kullanılması gereken başka bir kod (fatura no vb.) var mı?
8. **Çakışma listesi yalnız güçlü kanıtla dolar.** Teslim edilmiş ya da AWB'si olan
   bir sipariş sadece isim benzerliğiyle eşleşiyorsa gürültü yaratmamak için hiç
   gösterilmez.
   *Soru:* Bu siparişler de görünsün mü?
9. **Onay hep-ya-hiç.** Seçilen çiftlerden biri reddedilirse hiçbiri yazılmaz;
   yanıt 200 döner, `basarili: false` ve ret sebepleri listelenir.
   *Soru:* Geçerli olanların uygulanıp yalnız reddedilenlerin bildirildiği kısmi
   onay mı tercih edilir?

## Yayın ve arayüz

10. ✅ **Karar verildi (23 Eylül 2026):** İnceleme/onay `FF_V2_FLOW`'dan ayrıldı ve kendi
    bayrağını aldı: sunucuda `FF_AWB_REVIEW`, istemcide `VITE_FF_AWB_REVIEW`. Bu yeni bir v2
    ekranı değil, mevcut manifest özelliğinin düzeltilmiş hâli. Production'da açık olacak;
    kapalıyken 404 davranışı korunur.

    **Flag kapalıyken** manifest yükleme yalnız ayrıştırır. Manifestten AWB
    bağlamak flag açılana kadar mümkün değil; tek tek sipariş düzenleme hâlâ
    çalışıyor.
    *Soru:* Deploy sonrası `FF_V2_FLOW` ve `VITE_FF_V2_FLOW` hemen açılacak mı?
11. **Manifest ayrıştırıcısında gözlenen iki hata. Kod yok, kapsam dışı.**
    - Başlık tespiti `includes` kullanıyor; `ad` anahtar kelimesi `address`
      başlığıyla da eşleşir. `Address` sütunu `Consignee`'den önce gelirse alıcı
      adı yerine adres okunabilir.
    - AWB sütunu bulunamazsa satırdaki herhangi bir 8–14 haneli hücre AWB
      sayılıyor; baştaki `+` olmadan yazılmış bir telefon numarası AWB olarak
      okunabilir.

    İnsan onayı sayesinde bu hatalar artık otomatik yazmaya dönüşmüyor ama
    öneri kalitesini düşürüyorlar.
    *Soru:* Ayrı bir görev olarak düzeltilsin mi?
12. **İzolasyon testinin yeri.** `tests/server/isolation.test.ts` ortam izolasyonunu
    (geçici dizin, ağ engeli) test ediyor. Yeni rotaların tenant izolasyonu
    `tests/server/awbMatchIsolation.test.ts` dosyasında; ortam izolasyonu
    kontrollerini de içeriyor.
    *Soru:* Bu ayrım uygun mu?
13. **`@types/react` projede yok.** React 19 kendi tiplerini taşımadığı için JSX
    strict modda denetlenemiyor. Yeni bileşenler strict kontrolden yalnız bu
    ortam uyarılarıyla (TS7026/TS7016) geçiyor; mevcut bileşenlerde de aynı durum
    var.
    *Soru:* `@types/react` ve `@types/react-dom` devDependency olarak eklensin
    mi? (Mevcut bileşenlerde yeni tip hataları ortaya çıkabilir.)

## Denetim scripti

14. ✅ **Karar verildi (23 Eylül 2026):** Script production veritabanına karşı salt
    okunur çalıştırılacak; orijinal manifest dosyaları `--manifest` ile verilecek.
    Salt okunurluk iki yoldan kanıtlandı:
    - Statik: scriptin yüklediği modüllerin hiçbirinde insert/update/upsert/delete/rpc
      ya da storage çağrısı yok.
    - Çalışma zamanı: `tests/server/services/awbAuditReadOnly.test.ts`, gerçek
      supabase-js istemcisinin yalnız `GET /rest/v1/siparisler` gönderdiğini doğruluyor.

    Not: servis anahtarı veritabanında yazma yetkisine sahiptir; script bu yetkiyi
    kullanmaz, ama anahtar yine de gizli tutulmalı.

    **Veritabanı eski manifestlerdeki alıcı adını saklamıyor.** Bu yüzden
    `scripts/audit-awb-matches.ts` iki katmanlı çalışıyor:
    - veritabanından kesin sinyal: aynı AWB'nin birden fazla siparişte olması,
    - sezgisel sinyal: eski normalizasyonda boş ya da 1–3 karaktere inen müşteri
      adları.

    Kesin karşılaştırma için orijinal manifest dosyaları `--manifest` ile
    verilmeli.
    *Soru:* Geçmiş manifest dosyaları elinizde mi?

15. **İlk gerçek butik manifest özelliğini kullanmadan önce cevaplanacak.**
    ✅ **Karar verildi (23 Eylül 2026):** Denetimde telefon isimden önce gelir.
    Manifest satırında ve siparişte okunabilir telefon varsa ikisi de normalize
    edilip karşılaştırılır. Numaralar farklıysa, ad aynı ya da katlanmış yazımı
    aynı olsa bile `MANIFEST_TELEFON_UYUSMUYOR` (YÜKSEK) bulgusu çıkar. Eski
    eşleştirmenin "son 7 hane içeriyor" kuralı farklı operatör koduyla aynı
    7 haneyi kabul ediyordu; bu hatalar da bu bulguyla görünür olur. Bir tarafta
    telefon yoksa ya da telefon metin içeriyorsa ("yoxdur") karşılaştırma yapılmaz.
    Yabancı numaralar ülke koduyla olduğu gibi karşılaştırılır (bkz. 6).
    *Varsayım:* Aramex manifestindeki telefon alıcının kendi telefonudur.
    *Soru:* Manifestlerde butiğin ya da aracının ortak telefonu yazıyorsa her
    satır YÜKSEK çıkar. İlk çalıştırmada aynı telefonun çok sayıda farklı alıcıda
    tekrar edip etmediğine bakılmalı. Böyle bir durum var mı?

16. **Karar: ertelendi (23 Eylül 2026).** Veritabanında yalnız demo veri var; tekrar eden
    müşteri ayrımı gerçek veri gelirse yeniden değerlendirilecek.

    **Adaş (`BELIRSIZ_ADAS`) kuralı ve "aynı dönem".** Varsayımlar:
    - **Adaş tanımı:** Aynı butikte başka bir siparişin müşteri adı, harf koruyan,
      pasaport ya da basit yazımlardan en az birinde aynı olmalı. Kelime sırası
      önemsiz. Karışık yazım adaş sayılmaz ("Ayten Mammadova" ile "Aytən
      Məmmədova" hiçbir katlamada aynı olmaz); bu fark manifest
      karşılaştırmasında benzerlik puanıyla görünür. Yer tutucu adlar
      ("Müştəri") adaş oluşturmaz.
    - **Aday havuzu:** AWB'siz ve teslim edilmiş siparişler dahil butiğin bütün
      siparişleri. Gerekçe: eski kod
      (`c4eb4c9^:src/server/routes/kargoEntegrasyon.ts`, satır 225–256) butiğin
      bütün siparişlerini `select('*')` ile çekip `find` ile ilk eşleşeni
      seçiyordu. Durum, AWB ya da tarih filtresi yoktu.
    - **Pencere:** Bu yüzden "aynı dönem" varsayılanı **sınırsız**.
      `--namesake-window-days <gün>` ile oluşturma tarihine göre ±gün penceresine
      daraltılabilir. Tarihi bilinmeyen sipariş her zaman listelenir.
    - **Rapor alanları:** Her adaş için `gunFarki` ve `ayniTelefon` verilir.
      - Aynı telefon büyük olasılıkla aynı müşterinin başka siparişi demektir;
        AWB yine yanlış siparişte olabilir.
      - Farklı telefon gerçek bir adaş demektir.
    - **Önem ve liste sınırı:** Önem ORTA; bu bir belirsizlik, kanıt değil. Bulgu
      başına en çok 20 adaş listelenir; `adasSayisi` hepsini sayar.

    *Soru:* Varsayılan pencere sınırsız mı kalsın, yoksa bir gün sayısı mı
    olsun (ör. 60)? Aynı telefonlu adaşlar, yani tekrar eden müşteriler, ayrı
    bir türe ya da daha düşük öneme ayrılsın mı?

## Test altyapısı

17. **CLAUDE.md'deki dosya yolu güncellendi (varsayım).**
    `tests/server/isolation.test.ts`, `environmentIsolation.test.ts` olarak yeniden
    adlandırıldı. CLAUDE.md'deki kural bu dosyayı adıyla anıyordu. Yol eskimesin
    diye kural metninde yalnız dosya adı değişti; kuralın anlamı aynı.
    *Soru:* CLAUDE.md'ye yalnız sizin dokunmanızı mı tercih edersiniz?
