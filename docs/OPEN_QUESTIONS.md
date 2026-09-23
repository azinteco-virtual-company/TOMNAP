# Açık sorular — insan onaylı AWB eşleştirmesi (Y-6)

Bu dosya, manifest eşleştirmesi düzeltilirken yapılan varsayımları ve karar
bekleyen noktaları listeler. "Kodda" satırı bugünkü davranışı anlatır. Kod
yazılmamış maddeler **Kod yok** olarak işaretlidir.

## Veritabanı

1. **Geri alma dosyası DROP kullanmıyor.** Guardrail `DROP` yasakladığı için
   `supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql` yalnızca
   fonksiyonun EXECUTE yetkisini tüm API rollerinden (`service_role` dahil) geri
   alır. Fonksiyon katalogda kalır ve onaylar kapalı hale gelir. Yeniden
   etkinleştirmek için ileri migration tekrar çalıştırılır (`CREATE OR REPLACE`
   + `GRANT`).
   *Soru:* Sadece bu işte oluşturulan yeni nesneler için `DROP FUNCTION`'a izin
   var mı, yoksa REVOKE tabanlı geri alma yeterli mi?
2. **Köken kaydı yok. Kod yok.** Kimin hangi manifest satırını hangi siparişe
   onayladığı ayrıca saklanmıyor; yalnız siparişin AWB'si ve `ek_veriler`
   güncelleniyor.
   *Soru:* Yeni bir `awb_eslestirme_kayitlari` tablosu (RLS FORCE, yalnız
   `service_role`) eklensin mi? İleride aynı soruya (bu AWB nasıl yazıldı?)
   kesin cevap verebilmenin tek yolu bu.
3. **AWB tekilliği tenant içinde.** Aynı AWB başka bir butikte kayıtlıysa bu
   onayı engellemiyor. Engellemek, bir butiğe başka butiğin verisini sızdırırdı.
   *Soru:* Bu sınır doğru mu?

## Eşleştirme kuralları

4. **Transliterasyon.** İsimler harfleri koruyarak normalize ediliyor (ə, ş, ç, ğ,
   ı, ö, ü, Kiril). Bu yüzden ASCII yazılmış bir manifest adı düşük puan alıyor:
   `Konul Isag` ~ `Könül İsaq` = 0,455, eşiğin (0,5) altında, yani aday
   gösterilmiyor. Güçlü eşleşme (telefon/kod) bundan etkilenmiyor.
   *Soru:* Manifestlerde adlar ASCII mi geliyor? Öyleyse, normalizasyonu
   değiştirmeden yalnız zayıf aday puanı için ayrı bir transliterasyon
   karşılaştırması eklensin mi?
5. **Zayıf aday eşiği 0,5 ve satır başına 5 aday.** Aynı ad farklı soyadı
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

14. **Veritabanı eski manifestlerdeki alıcı adını saklamıyor.** Bu yüzden
    `scripts/audit-awb-matches.ts` iki katmanlı çalışıyor:
    - veritabanından kesin sinyal: aynı AWB'nin birden fazla siparişte olması,
    - sezgisel sinyal: eski normalizasyonda boş ya da 1–3 karaktere inen müşteri
      adları.

    Kesin karşılaştırma için orijinal manifest dosyaları `--manifest` ile
    verilmeli.
    *Soru:* Geçmiş manifest dosyaları elinizde mi?
