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
12. ✅ **Karar verildi (24 Eylül 2026):** Ortam izolasyonu testi
    `tests/server/environmentIsolation.test.ts` adını aldı; içeriği değişmedi.
    Tenant izolasyonu ortak yardımcı `tests/server/helpers/tenantIsolation.ts` ile
    test ediliyor: iki tenant kurulur; A'nın oturumu B'nin kaydını okumayı,
    listelemeyi ve yazmayı dener. Her deneme bir pozitif kontrolle eşleşir.
    Kritik beş rota grubu `tests/server/tenantIsolation.test.ts` dosyasında;
    `awbMatchIsolation.test.ts` de aynı yardımcıyı kullanıyor. Faz A–D'deki
    izolasyon testleri bu yardımcıyı kullanacak.
13. **`@types/react` projede yok.** React 19 kendi tiplerini taşımadığı için JSX
    strict modda denetlenemiyor. Yeni bileşenler strict kontrolden yalnız bu
    ortam uyarılarıyla (TS7026/TS7016) geçiyor; mevcut bileşenlerde de aynı durum
    var.
    *Soru:* `@types/react` ve `@types/react-dom` devDependency olarak eklensin
    mi? (Mevcut bileşenlerde yeni tip hataları ortaya çıkabilir.)

    **Ölçüm (24 Eylül 2026):** Kurulu React 19.3.0 için `@types/react` ve
    `@types/react-dom` 19.3.0 eklenince tsc **39 hata** verdi. Sınır 30 olduğu
    için paketler eklenmedi; ayrı bir PR'da ele alınacak.

    Dosya bazında:

    | Dosya | Hata |
    | --- | --- |
    | `src/components/OnayBekleyenlerSayfasi.tsx` | 14 |
    | `src/components/SiparisTablosu.tsx` | 7 |
    | `src/components/KargoManifestoSayfasi.tsx` | 6 |
    | `src/components/UrunGorselleriGalerisi.tsx` | 5 |
    | `src/components/SiparisDetayModal.tsx` | 5 |
    | `src/components/UstBaslik.tsx` | 1 |
    | `src/components/GorselAramaLensModal.tsx` | 1 |

    Türler: TS2339 32, TS2551 3, TS2353 2, TS2367 1, TS2322 1.

    Hataların çoğu React'tan değil, istemci tiplerinin koddan geri kalmasından
    geliyor. Bileşenler, tanımda olmayan alanları kullanıyor:
    - `Siparis` tipinde: `gumruk_fin_kodu`, `gorsel_url`, `toplam_tutar_cad`,
      `gumruk_pasaport_no`, `baku_tahsilat_azn` …
    - `OnayBekleyenMesaj` tipinde: `mesaj_icerigi`, `gonderen`, `tarih`,
      `tenant_id`.

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

17. ✅ **Onaylandı (24 Eylül 2026):** **CLAUDE.md'deki dosya yolu güncellendi.**
    `tests/server/isolation.test.ts`, `environmentIsolation.test.ts` olarak yeniden
    adlandırıldı. CLAUDE.md'deki kural bu dosyayı adıyla anıyordu. Yol eskimesin
    diye kural metninde yalnız dosya adı değişti; kuralın anlamı aynı.

18. ✅ **Onaylandı (24 Eylül 2026):** **"Kasa/bakiyeler" izolasyon testinin kapsamı.** Ayrı bir kasa
    tablosu ya da uç noktası yok. Bakiyeler sipariş kayıtlarından türetiliyor:
    - kuryelerin bekleyen tahsilatı `GET /api/kuryeler` ile okunuyor,
    - finans rolü tahsilatı `PATCH /api/siparisler/:id` ile yazıyor
      (`alinan_tutar`).

    Test bu iki yolu `BAKU_FINANS` rolüyle sınıyor. Müşteri borcu
    (`kalan_toplam_borc`) müşteri listesinin parçası ve müşteriler testinde
    kapsanıyor.

26. ✅ **Onaylandı (25 Eylül 2026):** **Yerelde ara sıra düşen testlerin kök nedeni: port çakışması.**
    - **Belirti:** macOS'ta tam koşuda ara sıra bir istek boş gövdeli `404 text/html`
      alıyordu (AWB onayı, `listPagination`, v2 kapısı). Tek başına koşunca geçiyordu.
    - **Kök neden:** Supertest sunucusu `listen(0)` ile her adrese bağlanıyor. macOS bu
      portu seçerken başka bir sürecin yalnız 127.0.0.1'de tuttuğu portu hesaba katmıyor.
      Test 127.0.0.1:P'ye bağlanınca istek o sürece gidiyor. Olay anında `lsof`, portları
      yerel bir IDE sürecinin tuttuğunu gösterdi. İzlenen 24.373 yanıttan 2'si testin
      kendi sürecinden gelmedi. 20.000 `listen(0)`'dan 5'i böyle bir porta düştü; düzeltmeyle 0.
    - **Düzeltme (yalnız testler, yalnız macOS):** `tests/setup.ts` porta bakmadan dinleyen
      sunucuları `tests/helpers/loopbackPort.ts`'ten geçiriyor. Port 127.0.0.1'de başka bir
      soket tarafından tutuluyorsa sunucu aynı anda başka porta taşınıyor. Zaman aşımı
      değişmedi, uygulama kodu değişmedi. Linux bu çakışan bağlanmayı zaten reddediyor
      (testi var); CI etkilenmiyordu.
    - **Bilinen risk:** Yardımcı Node'un iç `_listen2` ve `_handle` alanlarını kullanıyor
      (Node 22'de doğrulandı). Node bunları değiştirirse regresyon testi macOS'ta düşer.

## Faz A

19. **AI ayrıştırmada müşteri eşleştirme (A1, varsayım).** Gemini'ye müşteri listesi
    gitmiyor; eşleştirme ayrıştırmadan sonra sunucuda yapılıyor:
    - **Telefon:** Tenant'ta normalize telefonu **tek** bir müşteriyle tam eşleşirse sipariş o
      müşteriye bağlanır. Ad kayıtlı ada düzeltilir ve eksik adres ile şehir karttan dolar;
      bu, eski AI davranışının sunucu karşılığı.
    - **Ad:** Benzerlik yalnız `musteri_adaylari` olarak döner, hiçbir zaman otomatik
      bağlanmaz. Ad adayı varsa yeni müşteri kartı da açılmaz; sipariş bağsız kalır.
    - **Arayüz:** Adaylar arasından seçim yapılan arayüz henüz yok; A9'da eklenecek.
    *Soru:* Ad adayı varken de yeni kart açılması mı tercih edilir?

20. **Tahsilatın azaltılması (A3, varsayım).** Kaydedilmiş `alinan_tutar` yalnız
    **PATRON** tarafından azaltılabilir. `SUPER_ADMIN` dahil diğer roller 403 alır.
    - **Gerekçe:** Patron 5-500 karakterlik bir gerekçe vermek zorunda. Değişiklik
      siparişin `islem_gecmisi`'ne `TAHSILAT_AZALTILDI` olarak yazılır.
    - **Arayüz:** Tablodaki "BEKLIYOR" seçimi diğer rollere kapalı; patronda gerekçe
      tarayıcı istemiyle soruluyor. Ödeme defteri (A10) gelince düzeltme ters kayıtla
      yapılacak (K16).
    *Soru:* SUPER_ADMIN'in de düzeltebilmesi gerekir mi?

21. ✅ **Onaylandı (24 Eylül 2026):** **Rol kataloğunun SQL karşılığı (A4).** `tomnap_gecerli_rol(text)` yalnız
    davetle verilebilen ekip rolleri için `true` döner; `SUPER_ADMIN` platform rolü
    olduğundan `false`. Bu, davet ve kabul RPC'lerindeki eski `IN (...)` listesinin
    birebir karşılığı. TypeScript'te aynı liste `EKIP_ROLLERI`; `ROLLER` buna
    `SUPER_ADMIN`'i ekler.

22. ✅ **Karar (24 Eylül 2026):** **`ABD_SATINALMA`'nın v1 yetkileri ve kotası (A5).**
    **Karar:** ABD satın almacısı Bakü kurye ataması yapmaz (Bakü dağıtımı Bakü ofisinin
    işi); `KANADA_SATINALMA`'nın yetkisi değişmez. Uygulama: yeni `COURIER_ASSIGN` grubu
    (sahipler + Kanada) kurye atamasını, kurye listesini (`GET /api/kuryeler`, Bakü finans
    ayrıca okur) ve kurye masasını belirler. **Varsayım:** kurye listesi yalnız atama ve
    tahsilat içindir, bu yüzden ABD onu da görmez. ABD'nin AWB ve uluslararası kargo
    yetkisi (SHIPPING) sürüyor.
    - **Yetkiler:** v1'de STAFF, PURCHASING ve SHIPPING gruplarında; AWB onayı dahil
      (SQL'deki AWB onay RPC'si de ABD'yi kabul ediyor), Bakü kurye ataması hariç.
      Depo ülkesine göre kısıt (yalnız US) Faz B–C'de gelir.
    - **Kota:** Kaydında `ABD_SATINALMA` anahtarı olmayan firmada kota 2
      (`tomnap_rol_kota_varsayilani`). Diğer rollerde eksik anahtar bugünkü gibi 0.
      Mevcut `rol_limitleri` kayıtlarına ve tablo varsayılanına dokunulmadı. Yeni
      firmalarda paket sınırları Kanada'yla aynı: Başlangıç 1, Pro 2, Enterprise 5.
    - **Arayüz:** Davet penceresi kalan kotayı sunucuyla aynı kuralla (`rolKotasi`)
      gösteriyor. Eskiden anahtar eksikse 5 gösteriyordu; sunucu ise 0 uyguluyordu.

23. ✅ **Karar (24 Eylül 2026):** **Kurlar ve v2 ayarları (A7).**
    **Karar:** SUPER_ADMIN ayarları görür ama varsayılan prim oranını göremez ve
    değiştiremez; prim oranı yalnız patronda (K15'in ruhu). Uygulama: yeni `PAYROLL`
    grubu (yalnız PATRON); diğer sahiplerin yanıtında `primOraniVarsayilan` yok, prim
    alanlı PATCH 403.
    - **Kur:** "1 birim CAD/USD = X AZN" biçiminde tutuluyor; 0 ile 100 arasında, en çok
      6 ondalık. Tarih 2000'den eski ya da yarından ileri olamaz.
    - **`kaynak`:** en çok 100 karakterlik isteğe bağlı serbest metin (ör. "CBAR"). K4'e
      göre kur her zaman elle giriliyor.
    - **Düzeltme ve güncel kur:** Düzeltme yeni bir satırdır; güncel kur, o para birimi
      için en son girilen satırdır (tarihe göre değil, giriş zamanına göre).
    - **Kurları okuma:** Girebilen rollerle aynı: PATRON, SUPER_ADMIN, satın almacılar,
      BAKU_FINANS. Satış rolü kurları görmüyor.
    - **Ayarlar:** PATRON ve SUPER_ADMIN okuyup değiştirebiliyor; prim oranı yalnız
      PATRON'da (yukarıdaki karar).
    - **Yabancı anahtar:** İki tabloda da yok. Böylece `firmalar`'a dokunulmuyor ve firma
      silme davranışı değişmiyor.
    - **Arayüz:** Bu bölümler yalnız `/v2` kabuğunda. `localStorage` kuru henüz yerinde.

24. ✅ **Karar (25 Eylül 2026):** **v2 sipariş satırları ve sahibi (A8).**
    - **Müşteri bağı:** `siparisler`'e spec'teki gibi fiziksel bir `musteri_id` kolonu
      eklenmedi. Bu adda bir kolon v1 satırlarında `null` olurdu. v1 okuma yolu üst
      düzeydeki alanı `ek_veriler.musteri_id`'den öncelikli sayıyor; bu yüzden her
      okumada bağ `null` ile ezilir, ilk v1 düzenlemesinde de `ek_veriler`'e `null`
      yazılırdı. v2 siparişi müşteri bağını v1'le aynı yerde (`ek_veriler.musteri_id`)
      tutuyor. Yeni kolonlar yalnız `model_surumu` ve `sahip_kullanici_id`.
    - **Sahip:** Belirtilmezse oluşturan kişi olur. PATRON ya da SUPER_ADMIN, tenant'ın
      aktif bir PATRON ya da SATIS_SORUMLUSU'sunu sahip seçebilir. **Karar:** SUPER_ADMIN
      ekip üyesi değil, prim alamaz; sipariş açarsa sahibi seçmek zorunda ve hiçbir zaman
      sahip olamaz (migration `20260925100000_siparis_sahibi_kurali`, sunucu ve form). Satış sorumlusu yalnız kendi siparişinin
      sahibi olabilir. RPC sahibin satırını `FOR SHARE` ile kilitliyor: eşzamanlı
      pasifleştirme ya siparişi bekler ya da siparişi durdurur.
    - **v1 ile birlikte yaşama:**
      - Genel `PATCH /api/siparisler/:id`, v2 siparişte satırlardan türetilen ya da
        yalnız RPC'lerle yazılan alanları (tutar, alınan, finans, lojistik, ürün
        açıklaması, adet, beden, renk, ürünler) 409 ile reddediyor. Not ve adres gibi
        alanlar değişebiliyor.
      - AWB, kurye ve toplu kargo RPC'leri v2 siparişin lojistik durumunu değiştirmeye
        devam ediyor (K20: RPC'lerle).
      - v1 yedek geri yüklemesi v2 siparişini reddediyor; satırlar v1 yedeğine girmiyor.
    - **Kapsam dışı:** Satır düzeltme ve iptal henüz yok; API rolünün satırlar üzerinde
      UPDATE yetkisi de yok. v2 listesi en yeni 200 siparişi döndürüyor; sayfalama sonra.
      Satış fiyatı AZN, `kaynak_ulke` (CA/US) zorunlu.
    - **Geri alma:** v2 siparişi varken down dosyası çalışmayı reddediyor; aksi hâlde
      satırlar sessizce silinirdi.

25. ✅ **Onaylandı (25 Eylül 2026):** **v2 sipariş girişi ve AI satır önerisi (A9).**
    - **Ayrı uç:** Spec AI şemasını `src/server/routes/siparisler.ts`'e koyuyordu. v1
      `/api/ayristir-siparis` ayrıştırıp hemen kaydettiği için ona dokunulmadı. Yeni
      `POST /api/v2/siparisler/ayristir` (SALES, AI hız sınırı) yalnız öneri döndürür,
      hiçbir şey yazmaz; kayıt, insan formu onaylayınca `POST /api/v2/siparisler` ile olur.
    - **AI'a giden:** Yalnız mesaj metni (en çok 20.000 karakter). Müşteri önerisi AI
      yanıtındaki ad ve telefonla sunucuda, oturum tenant'ının müşterileri üzerinde yapılır
      (A1). Gövdede `ham_mesaj` dışında alan gelirse istek reddedilir. Görsel/ekran
      görüntüsü ayrıştırması henüz yok.
    - **Eksik bilgi:** Mesajda ülke yoksa satır `CA` önerilir, kişi seçer. Fiyat yoksa
      alan boş gelir ve "N. satırın fiyatı yok" notu çıkar; form fiyat girilmeden
      gönderilmez (0 AZN bilerek yazılabilir).
    - **Sahip seçimi:** Yalnız OWNERS (PATRON, SUPER_ADMIN) görür; aday listesi
      `GET /api/v2/siparis-sahipleri`, tenant'ın aktif PATRON ve SATIS_SORUMLUSU'ları.
      Seçilmezse sahip oluşturan kişidir; SUPER_ADMIN'in seçmesi zorunlu (24).
    - **Ekran:** `/v2` kabuğunda "Sifarişlər" sekmesi STAFF'a açık; form yalnız SALES'e,
      diğerleri son 200 v2 siparişin listesini görür. Ekran kendi parçasında (`React.lazy`).
      Mevcut sipariş tablosunda v2 siparişler "v2" rozetiyle ayrılır; rozet bayraktan
      bağımsızdır, çünkü v2 sipariş ancak bayrak açıkken oluşabilir.

27. **Yedek geri yüklemede sonradan eklenen sunucu kolonları (varsayım).**
    - **Hata:** Veritabanı modunda dışa aktarılan yedek kurye kolonlarını
      (`kurye_atama_surumu`, `kurye_teslim_kullanici_id`, `kurye_teslim_alan`) da
      taşıyordu; geri yükleme bunları "desteklenmeyen alan" sayıp reddediyordu. Bellek
      modunda da teslim edilmiş siparişler için aynısı oluyordu.
    - **Düzeltme:** Teslim eden kullanıcı ve teslim alan kişi geri yazılıyor. Teslim eden
      kullanıcı hedef firmanın kullanıcısı olmalı (veritabanında tenant filtreli sorgu);
      değilse yükleme hiçbir şey yazmadan 404 ile duruyor.
    - **Varsayım:** `kurye_atama_surumu` bir sürüm sayacı, geri yazılmıyor: var olan
      sipariş kendi sürümünü korur, yeni sipariş varsayılanı (0) alır. Geri yükleme sayacı
      artırmıyor; geri yüklemeden önce açılmış bir kurye atama ekranı bir kez daha yazabilir.
    - **Koruma:** `tests/fixtures/siparisler-kolonlari.json` gerçek kolon listesini tutuyor.
      Bir migration `siparisler`'e kolon eklerse SQL testi düşüyor; liste güncellenince
      gidiş-dönüş testi yeni kolonun geri yazılmasını ya da gerekçeyle dışarıda
      bırakılmasını istiyor.

28. **Ödeme defteri (A10, varsayım).**
    - **Kim yazar:** PATRON, SUPER_ADMIN (tenant iş verisinde PATRON gibi) ve BAKU_FINANS
      (`FINANCE` grubu). SATIS_SORUMLUSU yalnız kaynağı `BUTIK` olan tahsilatı yazar ve
      yalnız kendi yazdığı butik tahsilatını ters kayıtla düzeltir. Parayı alan
      (`alan_kullanici_id`) her zaman kaydı yapan kişidir; başkası adına kayıt yok.
    - **Kaynak:** Bu uç yalnız `BUTIK` ve `ONLINE` yazar. `TESLIMAT` kurye akışından gelir
      (A11). `kasa_teslim_id` A11'e ayrıldı; A10'da her satırda boş.
    - **Tutar ve zaman:** 0'dan büyük, 1.000.000 AZN'den küçük, en çok 2 ondalık. Fazla
      ödeme kabul ediliyor (durum `FAZLA`, eski `finans_durumu` `ODENDI`). Ödeme zamanı
      girilmezse şimdi; gelecekte (5 dk pay) ya da 366 günden eski olamaz.
    - **Ters kayıt (K16):** Gerekçe zorunlu; tutarın eksisi, aynı yöntem, kaynak ve alan
      kişiyle; her ödeme bir kez; ters kaydın ters kaydı yok.
    - **Eski kolonlar (K20):** `alinan_tutar` ve `finans_durumu`'nu her yeni defter
      satırından sonra aynı transaction'da bir tetikleyici yazıyor; RPC dışından eklenen
      bir satır da özeti bozamaz. Eşzamanlı ödemeler sipariş satırını kilitleyip sırayla
      toplanıyor (yarış testi).
    - **Silme:** Ödemesi olan bir v2 siparişi silinemez: v1 `DELETE`, veritabanı
      temizleme ve "değiştirerek geri yükleme" 409 veriyor, kayıtlar değişmiyor. Bayrak
      kapalıyken ödeme yazılamadığı için mevcut akışlarda bir şey değişmiyor. Down dosyası
      ödeme varken çalışmayı reddediyor.
    - **Okuma ve ekran:** Defteri STAFF okuyabilir (sipariş listesindeki `alinan_tutar` ile
      aynı görünürlük). "Kassa" sekmesi yalnız `FINANCE` rollerine açık.

29. **Kurye nakdi ve kasa teslimi (A11, varsayım).**
    - **Kurye tahsilatı:** Yalnız `BAKU_KURYE`, yalnız aktif kurye kaydına bağlı olduğu ve
      kendisine atanmış bir v2 siparişte, sipariş teslimattayken (`BAKU_DAGITIM_ARKADAS`)
      ya da kendisi teslim ettiyse (`TESLIM_EDILDI`) yazar. Yöntem yalnız `NAKIT`, tutar en
      çok kalan tutar (kurye fazla tahsilat yazamaz). Parayı alan ve kaydı yapan kuryedir.
    - **Kasa teslimi:** Kasa (PATRON, BAKU_FINANS; SUPER_ADMIN PATRON gibi, yeni `KASA`
      grubu) bir kuryenin açık nakit tahsilatlarından seçtiklerini teslim alır. Tutar,
      seçilenlerin toplamına eşit olmalı; böylece teslim hiçbir zaman bakiyeyi aşmaz. Kısmi
      tutar (ör. eksik para) desteklenmiyor; eksik için PATRON ters kayıt yazar.
    - **Tablo adı:** Spec `kurye_id` diyordu. Zimmet kullanıcıya yazıldığı için kolon
      `kurye_kullanici_id` (kullanıcı kimliği) oldu.
    - **Defterde tek değişiklik:** `odemeler` append-only kalıyor. Tek istisna: açık bir
      kurye nakdinin `kasa_teslim_id`'si bir kez, aynı kuryenin aynı tenant'taki teslimine
      yazılabiliyor (service_role'a yalnız bu kolon için UPDATE; gerisini tetikleyici
      reddediyor). Teslim edilmiş nakit ters kayıtla düzeltilemez. Teslim ile ters kayıt
      aynı anda gelirse yalnız biri geçiyor (yarış testi).
    - **Kurye ekranı:** `VITE_FF_V2_FLOW` açıkken kurye ekranında "Üzərimdə olan nağd pul"
      bölümü ayrı bir parça olarak yükleniyor. Sunucu bayrağı kapalıysa (404) görünmüyor.
      v1 kurye görev listesi ve teslim akışı değişmedi.
    - **Demo alanı:** `demo_sandbox` Supabase'e bağlıyken kurye kayıtları veritabanında,
      siparişleri bellekte olduğu için kurye nakdi orada çalışmıyor (503).

30. **Kaçaklar panosu v0: Q4 ve Q5 (A12, varsayım).**
    - **Q4:** Faz A'da ürün birimi olmadığı için "bütün birimler teslim edildi" yerine
      siparişin `lojistik_durumu = TESLIM_EDILDI` kullanılıyor; "ödenmedi" = `kalan_tutar > 0`
      (v2'de defterden türetilir). Yaş teslim tarihinden sayılıyor; tarih yoksa son
      güncelleme. En eski 500 kayıt.
    - **Q5:** A11'in bakiye tanımı kullanılıyor (Σ nakit − Σ kasa teslimi); bekleme süresi en
      eski açık tahsilattan. Kasaya teslim edilmiş ya da ters kaydı olan nakit görünmüyor.
    - **Eşikler:** Spec eşikleri `tenant_v2_ayarlari`'ndan okuyordu. O tabloya kolon eklemek
      yerine v0'da sorgu parametresi (`?q4_gun=`, `?q5_saat=`) ve spec varsayılanları (0 gün,
      24 saat) kullanılıyor. Tenant bazında saklamak Faz D'ye kaldı.
    - **Kim görür:** PATRON, SUPER_ADMIN, BAKU_FINANS (`KASA` grubu; rol matrisinde Q4 ve
      Q5'i görenler). Diğer sorgular (Q1–Q3, Q6–Q8) Faz B–D'de.

31. **v2 sipariş girişinde ekran görüntüsünden öneri (A9b, seçim).**
    - **Seçim: istemcide küçültme, imzalı URL değil.** Görsel tarayıcıda en çok 1600 px uzun
      kenara ve ~0,8 MB JPEG'e küçültülüyor; en çok 3 görsel, base64 ile toplam ~3,2 MB. Bu,
      Vercel'in 4,5 MB gövde sınırının altında kalıyor. Sunucu her görseli ayrıca sınırlıyor
      (en çok 3 adet, 1 MB) ve türünü ilk baytlarından doğruluyor.
    - **Neden imzalı URL değil:** K22'deki imzalı URL deseni saklanması gereken faturalar
      için. Burada görsel yalnız bir öneri için bir kez kullanılıyor. Doğrudan Storage'a
      yüklemek, başka müşterilerin yazışmalarını da içerebilecek ekran görüntülerini
      saklamak ve silmek anlamına gelirdi. Görsel hiçbir yerde saklanmıyor (v1'in
      "Görsel & WhatsApp" akışından farklı olarak); test bunu yükleme klasörüyle doğruluyor.
    - **A1 kuralı:** AI'a yalnız mesaj ve görseller gidiyor; müşteri eşleştirmesi yine
      sunucuda. Öneri hiçbir şey yazmıyor; kayıt formun onayıyla oluyor.
