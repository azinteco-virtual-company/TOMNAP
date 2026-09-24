# TOMNAP v2 — hedef spec

## Kararlar ve varsayımlar — Tural onaylayacak

Spec'teki belirsiz iş kararları için makul bir seçim yapıldı. Aşağıdaki tablo onaylanırsa spec bu haliyle geçerlidir. Bir satır değişirse ilgili bölüm ona göre güncellenir.

| #   | Karar                     | Seçtiğim                                                                                                                                                                        | Alternatif                                       | Neden                                                                                                   |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| K1  | Eski siparişler           | v1'de kalır. Yalnız yeni siparişler v2 modeliyle açılır (`siparisler.model_surumu`); geriye dönük taşıma yapılmaz.                                                              | Her eski siparişe otomatik satır açan backfill   | Veritabanındaki kayıtlara dokunulmaz (ORTAM kuralı). Risk sıfır; eski ekranlar olduğu gibi çalışır.     |
| K2  | Sipariş satırı ve birim   | Satır = müşterinin istediği ürün, `adet` ile. Satın alınan her fiziksel parça bir **birim** kaydıdır; `adet = 3` olan bir satıra 3 birim bağlanır.                              | Satır = birim (her parça ayrı satır)             | Sipariş girişi doğal kalır; birim bazlı takip yine mümkün.                                              |
| K3  | Birim ↔ satır bağı        | `urun_birimleri.siparis_satiri_id` kolonu. Birim tek satıra bağlanır; satır kapasitesi (`adet`) RPC'de kilitle kontrol edilir. Her değişiklik append-only olay kaydına yazılır. | Ayrı eşleştirme tablosu + `UNIQUE(birim_id)`     | Tek kolon, "bir birim tek satıra" kuralını şemanın kendisiyle garanti eder; geçmiş olay kaydında durur. |
| K4  | Kur kaynağı               | Fatura onaylanırken kur elle girilir ve **faturaya sabitlenir**. Öneri, tenant'ın `kurlar` tablosundaki son değerden gelir.                                                     | Otomatik kur servisi (ör. Merkez Bankası API'si) | Dış servise bağımlılık yok, denetlenebilir. Sonradan otomatik öneri eklenebilir.                        |
| K5  | Satış para birimi         | Müşteriye satış satırları **AZN**.                                                                                                                                              | Satır bazında serbest para birimi                | Tahsilat Bakü'de AZN yapılıyor; kâr AZN'de tek para birimiyle hesaplanır.                               |
| K6  | Kargo payının dağıtımı    | Gönderinin kargo maliyeti paketlere **kg oranında**, paket içinde birimlere birim ağırlığı varsa ağırlığa, yoksa **eşit** dağıtılır.                                            | Değer oranında dağıtım                           | İstenen model "kargo payı (kg)"; birimler tek tek tartılmıyor.                                          |
| K7  | Gümrük                    | Paket bazında girilir; paket içindeki birimlere fatura değeri oranında dağıtılır.                                                                                               | Sipariş bazında elle                             | Gümrük paket (alıcı) için ödeniyor.                                                                     |
| K8  | Aylık beyan sınırı        | Tenant ayarı. Varsayılan **300 USD / alıcı / ay** (doğrulanmalı). Beyan değeri USD tutulur.                                                                                     | Koda gömülü sabit                                | Sınır mevzuata bağlı ve değişebilir.                                                                    |
| K9  | Paket alıcısı (consignee) | Bir `musteriler` kaydı. Siparişin müşterisinden farklı olabilir (ör. akraba adına).                                                                                             | Ayrı `alicilar` tablosu                          | Mevcut müşteri tablosu yeniden kullanılır; alıcı da bir kişidir.                                        |
| K10 | Sipariş kârının ayı       | Siparişin **teslim edildiği ay**                                                                                                                                                | Sipariş ayı ya da tahsilatın tamamlandığı ay     | Landed cost teslimde kesinleşir.                                                                        |
| K11 | Primin tabanı             | Siparişin **tahsil edilen satış tutarı (AZN)** üzerinden yüzde                                                                                                                  | Sipariş kârı üzerinden yüzde                     | Tahsilatla birlikte bilinir; landed cost'un gecikmesine bağlı değil.                                    |
| K12 | Primin hak edilmesi       | Sipariş **tamamen tahsil edildiğinde** hak edilir; iade ya da ters kayıtta geri alınır.                                                                                         | Tahsilat oranında kısmi hak ediş                 | Basit ve anlaşmazlığa kapalı.                                                                           |
| K13 | İş başı ücret             | Siparişe aittir (ör. kurye teslim ücreti) ve landed cost'un "yerel teslimat" payına girer.                                                                                      | Aya ait gider                                    | İşin yapıldığı teslimat, siparişe bağlanabiliyor.                                                       |
| K14 | Maaş                      | Aya ait; siparişlere dağıtılmaz. Aylık net kârdan düşülür.                                                                                                                      | Siparişlere dağıtmak                             | İstenen model bu.                                                                                       |
| K15 | Maaş ve prim görünürlüğü  | Yalnız **PATRON**; `SUPER_ADMIN` dahil değil.                                                                                                                                   | SUPER_ADMIN de görür                             | Platform yöneticisinin butik maaşlarını görmesine gerek yok.                                            |
| K16 | Ödeme düzeltme            | Silme yok. Düzeltme **ters kayıtla** (negatif ödeme) yapılır.                                                                                                                   | Soft delete                                      | Defter append-only kalır; denetim izi korunur.                                                          |
| K17 | Kurye nakdi               | Kuryenin tahsilatı önce onun **zimmetine** yazılır; kasaya teslim ayrı bir kayıttır.                                                                                            | Tahsilat doğrudan kasaya                         | "Kuryede bekleyen nakit" kaçağı ancak böyle görülebilir.                                                |
| K18 | ABD sorumlusu rolü        | Yeni rol `ABD_SATINALMA`: ABD'de satın alma ve ABD deposunda kabul. Kanada'daki `KANADA_SATINALMA` rolünün eşi.                                                                 | Ayrı bir `DEPO` rolü                             | Mevcut rol modeline en küçük ekleme.                                                                    |
| K19 | Tablo adları              | Türkçe snake_case (`siparis_satirlari`, `faturalar`…); mevcut `siparisler` ve `musteriler` ile uyumlu.                                                                          | İngilizce (`awb_match_approvals` gibi)           | Alan adları ve arayüz Türkçe; tutarlılık.                                                               |
| K20 | Eski durum kolonları      | v2 siparişlerde `lojistik_durumu`, `finans_durumu`, `alinan_tutar` **yalnız RPC'lerle, türetilerek** yazılır; eski ekranlar okumaya devam eder.                                 | v2 siparişlerde bu kolonları boş bırakmak        | Eski ekranlar ve raporlar kırılmaz; enum değişmez.                                                      |
| K21 | Demo alanı                | v2 akışı `demo_sandbox`'ta kapalı; o alan bellekte ve v2 tabloları yok.                                                                                                         | Demo için veritabanında bir tenant               | Bellek modu transactional RPC'leri taşıyamaz.                                                           |
| K22 | Fatura yükleme boyutu     | Fatura PDF ve fotoğrafı, istemciden **doğrudan** Supabase Storage'a imzalı URL ile yüklenir; sunucu yalnız referansı alır.                                                      | Sunucudan geçirmek                               | Vercel Functions'ın 4,5 MB sınırı (RELEASE_READINESS madde 4).                                          |

## 1. İlkeler ve kapsam

- **Mimari aynı kalır:** Vite + React (istemci), Express (Vercel serverless), Supabase'e yalnız sunucudan `service_role` ile erişim. Çok adımlı her yazma transactional RPC ile yapılır.
- **Mevcut tablolar değişmez:** Yalnız yeni tablo ve kolon eklenir. Mevcut enum değerleri değişmez; yeni model onları bir eşlemeyle karşılar (§5).
- **Yeni tabloların güvenlik deseni:** `ENABLE` + `FORCE ROW LEVEL SECURITY`, `anon`/`authenticated` için tablo ve kolon düzeyinde `REVOKE`. Tenant filtresi uygulama katmanında zorunlu. Her rotaya `tests/server/helpers/tenantIsolation.ts` ile izolasyon testi yazılır ve testler mutasyonla doğrulanır.
- **Bayraklar:** Yeni ekranlar `FF_V2_FLOW` / `VITE_FF_V2_FLOW` arkasında. Bayrak kapalıyken v2 rotaları 404 döner.
- **AI kuralı:** Yalnız verilen belgeden alan çıkarır. Müşteri ya da sipariş listesi Gemini'ye gönderilmez; eşleştirme sunucuda, öneri + insan onayı olarak yapılır (PR #3 deseni).
- **PR #2–#5'te yapılanlar yeniden tasarlanmaz, üstüne kurulur:**
  - sunucu oturumu ve rol allowlist'i,
  - tenant izolasyon yardımcısı,
  - kurye kaydı, atama ve teslim RPC'leri,
  - şifreli kargo ayarları,
  - özel Storage bucket'ı,
  - revizyonlu sayfalama (`list_revisions`),
  - onboarding RPC'leri,
  - insan onaylı AWB eşleştirme ve append-only onay kaydı,
  - sipariş dışa ve içe aktarma RPC'leri.

## 2. İş akışı — 7 durak

| Durak                     | Ne olur                                                                                                                                                                                                      | Kim                             | Ana varlıklar                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------ |
| 0. Sipariş kaydı          | Instagram/WhatsApp mesajı ya da ekran görüntüsü AI ile **sipariş + satırlara** çevrilir, insan onaylar. Her siparişin bir **sahibi** (satış sorumlusu) vardır.                                               | SATIS_SORUMLUSU, PATRON         | `siparisler` (v2 başlık), `siparis_satirlari`          |
| 1. Satın alma             | Fatura (PDF/foto) yüklenir; AI satırlara çevirir; insan onaylar. Fatura kendi para biriminde (CAD/USD) tutulur; **o günün kuru faturaya sabitlenir**. Onayla birlikte satın alınan her parça bir birim olur. | KANADA_SATINALMA, ABD_SATINALMA | `faturalar`, `fatura_satirlari`, `urun_birimleri`      |
| 2. Eşleştirme             | Her birim **bir** sipariş satırına bağlanır; sistem öneri üretir, insan onaylar.                                                                                                                             | Satın almacı                    | `urun_birimleri.siparis_satiri_id`, `birim_olaylari`   |
| 3. Depo kabul             | Kanada ve ABD depolarında birim bazında: geldi / eksik / hasarlı / yanlış.                                                                                                                                   | Satın almacı (ülkesine göre)    | `urun_birimleri.durum`, `birim_olaylari`               |
| 4. Paketleme ve gönderi   | Birimler **alıcı (consignee) bazında** paketlenir. Paket bir **gönderinin** parçasıdır. Alıcı başına aylık beyan toplamı izlenir. Kanada ve ABD gönderileri ayrıdır.                                         | Satın almacı                    | `paketler`, `gonderiler`, `alici_aylik_beyan` görünümü |
| 5. Bakü varış ve teslimat | Varış kontrolü yapılır. Aynı müşterinin farklı ülkelerden gelen birimleri **tek teslimatta birleştirilir**. Teslimat bir kuryeye atanır; teslimle birlikte tahsilat kaydedilir.                              | BAKU_FINANS, BAKU_KURYE         | `teslimatlar`, `odemeler`                              |
| 6. Para                   | Ödeme defteri (tutar, yöntem, kim aldı, ne zaman), kurye→kasa nakit teslimi, sipariş bazında landed cost ve kâr.                                                                                             | BAKU_FINANS, PATRON             | `odemeler`, `kasa_teslimleri`, `maliyet_kalemleri`     |
| EK. Ekip ve kazanç        | Maaşlı, yüzdeli ve iş başı çalışanlar; aylık net kâr.                                                                                                                                                        | PATRON                          | `kazanc_kurallari`, `primler`, `maaslar`, `giderler`   |

## 3. Varlıklar ve ilişkiler

Bütün yeni tablolarda şunlar ortak:

- `tenant_id text NOT NULL REFERENCES firmalar(id) ON DELETE RESTRICT`. `CASCADE` kullanılmaz; firma silinirse iş verisi sessizce gitmesin.
- Oluşturma ve güncelleme zamanı, oluşturan kullanıcı.
- RLS ve REVOKE deseni.

| Varlık                           | Önemli alanlar                                                                                                                                                                                                                     | İlişki                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `siparisler` (mevcut, v2 başlık) | Yeni kolonlar: `model_surumu smallint DEFAULT 1`, `sahip_kullanici_id text`                                                                                                                                                        | 1–N `siparis_satirlari`; N–1 `musteriler` (`ek_veriler.musteri_id` yerine yeni kolon `musteri_id`) |
| `siparis_satirlari`              | `siparis_id`, `sira`, `urun_aciklamasi`, `beden`, `renk`, `adet`, `birim_satis_fiyati_azn`, `kaynak_ulke` (`CA`/`US`), `iptal`                                                                                                     | 1–N `urun_birimleri` (en çok `adet` kadar)                                                         |
| `kurlar`                         | `para_birimi`, `tarih`, `azn_karsiligi`, `kaynak`, `giren_kullanici_id`; append-only                                                                                                                                               | Faturaya öneri kaynağı                                                                             |
| `faturalar`                      | `depo_ulkesi`, `magaza`, `fatura_no`, `fatura_tarihi`, `para_birimi` (`CAD`/`USD`), **`kur_azn` (sabit)**, `kur_usd` (beyan için), `belge_yolu` (özel Storage), `durum` (`TASLAK`/`ONAYLANDI`/`IPTAL`), `onaylayan`, `onay_zamani` | 1–N `fatura_satirlari`                                                                             |
| `fatura_satirlari`               | `aciklama`, `adet`, `birim_fiyat` (fatura para biriminde), `indirim`, `vergi`                                                                                                                                                      | Onayda `adet` kadar `urun_birimleri` üretir                                                        |
| `urun_birimleri`                 | `fatura_satiri_id`, `siparis_satiri_id` (tek satır), `depo_ulkesi`, **`durum`** (birim ekseni), `agirlik_kg`, `paket_id`, `teslimat_id`, `maliyet_azn` (fatura birim fiyatı × `kur_azn`)                                           | Merkez varlık                                                                                      |
| `birim_olaylari`                 | `birim_id`, `olay` (`ESLESTI`, `ESLESME_KALDIRILDI`, `DEPODA`, `EKSIK`, `HASARLI`, `YANLIS`, `PAKETLENDI`, `YOLA_CIKTI`, `BAKUYE_VARDI`, `TESLIM_EDILDI`, `IADE`), `kullanici`, `zaman`, `not`; append-only                        | Denetim izi                                                                                        |
| `gonderiler`                     | `cikis_ulkesi` (`CA`/`US`), `tasiyici`, `ana_awb`, `durum` (`HAZIRLANIYOR`/`YOLDA`/`VARDI`/`KAPANDI`), `kargo_maliyeti`, `para_birimi`, `kur_azn`                                                                                  | 1–N `paketler`                                                                                     |
| `paketler`                       | `gonderi_id`, `alici_musteri_id`, `awb`, `agirlik_kg`, `beyan_usd`, `gumruk_azn`, `durum`, `varis_kontrolu` (`TAM`/`EKSIK`/`HASARLI`)                                                                                              | 1–N `urun_birimleri`                                                                               |
| `alici_aylik_beyan` (görünüm)    | `alici_musteri_id`, `ay`, `toplam_beyan_usd`, `sinir_usd`                                                                                                                                                                          | `paketler` üzerinden hesaplanır                                                                    |
| `teslimatlar`                    | `musteri_id`, `kurye_id` (mevcut `kuryeler`), `durum` (teslimat ekseni), `teslim_zamani`, `teslim_alan`, `yerel_teslimat_ucreti_azn`                                                                                               | 1–N `urun_birimleri` (birden çok paket ve ülkeden)                                                 |
| `odemeler`                       | `siparis_id`, `tutar_azn` (ters kayıt için negatif), `yontem` (`NAKIT`/`KART`/`HAVALE`/`DIGER`), `alan_kullanici_id`, `alma_zamani`, `kaynak` (`TESLIMAT`/`BUTIK`/`ONLINE`), `ters_kayit_odeme_id`, `kasa_teslim_id`; append-only  | N–1 sipariş                                                                                        |
| `kasa_teslimleri`                | `kurye_id`, `teslim_alan_kullanici_id`, `tutar_azn`, `zaman`; append-only                                                                                                                                                          | 1–N `odemeler` (nakit)                                                                             |
| `maliyet_kalemleri`              | `birim_id` ya da `paket_id`, `tur` (`ALIS`/`KARGO`/`YEREL_TESLIMAT`/`GUMRUK`/`IS_BASI`), `tutar_azn`, `kaynak_kayit`; RPC'lerin ürettiği türetilmiş kayıt                                                                          | Landed cost toplamı                                                                                |
| `kazanc_kurallari`               | `kullanici_id`, `tur` (`MAAS`/`YUZDE`/`IS_BASI`), `oran`/`tutar`, `gecerlilik_baslangic/bitis`                                                                                                                                     | Yalnız PATRON                                                                                      |
| `primler`                        | `siparis_id`, `kullanici_id`, `tutar_azn`, `durum` (`BEKLIYOR`/`HAK_EDILDI`/`GERI_ALINDI`/`ODENDI`)                                                                                                                                | Siparişe ait; yalnız PATRON                                                                        |
| `maaslar`                        | `kullanici_id`, `ay`, `tutar_azn`, `odeme_tarihi`                                                                                                                                                                                  | Aya ait; yalnız PATRON                                                                             |
| `giderler`                       | `ay`, `tur` (kira, reklam…), `tutar_azn`, `not`                                                                                                                                                                                    | Aya ait; yalnız PATRON                                                                             |
| `tenant_v2_ayarlari`             | `aylik_beyan_sinir_usd`, `varsayilan_kg_fiyati_azn`, `prim_orani_varsayilan`                                                                                                                                                       | Tenant başına bir satır                                                                            |

## 4. Birbirinden bağımsız üç durum ekseni

Üç eksen ayrı tutulur. Biri diğerini değiştirmez; sipariş düzeyindeki özet bunlardan türetilir.

1. **Ürün birimi** (`urun_birimleri.durum`), her fiziksel parça için:
   - akış: `SATIN_ALINDI` → `DEPODA` → `PAKETLENDI` → `YOLDA` → `BAKUDE` → `TESLIM_EDILDI`;
   - yan durumlar: `EKSIK`, `HASARLI`, `YANLIS`, `IADE`.

   Geçişler yalnız RPC'lerle yapılır ve her biri `birim_olaylari`'na yazılır. Geri gitme yalnız açık bir "düzeltme" RPC'si ile mümkün.

2. **Ödeme** (sipariş başına, defterden türetilir): `ODENMEDI` (Σ = 0), `KISMI` (0 < Σ < toplam), `TAM` (Σ = toplam), `FAZLA` (Σ > toplam). Toplam, satırların satış tutarlarının toplamıdır. Durum saklanmaz, hesaplanır; eski `finans_durumu` bu değerden yazılır (K20).
3. **Teslimat** (`teslimatlar.durum`, müşteri paketi başına): `HAZIRLANIYOR` → `KURYEDE` → `TESLIM_EDILDI` | `IADE`. Teslim, ödemeyi **otomatik değiştirmez**; kurye tahsilat aldıysa aynı RPC ayrı bir ödeme kaydı yazar.

**Siparişin lojistik özeti:** Satırlarına bağlı birimlerin en geride olanı (§5). "Teslim edildi ama ödenmedi" gibi durumlar bu ayrım sayesinde görünür (kaçak sorgusu Q4).

## 5. Eski enum → yeni model eşlemesi

Mevcut enum değerleri değişmez (CLAUDE.md). v2 siparişlerde eski kolonlar, yeni modelden aşağıdaki eşlemeyle türetilir.

**Lojistik** (siparişin en geride olan birimine göre):

| Eski `lojistik_durumu`      | v2 karşılığı                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `KANADA_SATINALIM_BEKLIYOR` | Satırlar var; bağlı birim sayısı < `adet` ya da hiç birim yok                                              |
| `KANADA_DEPO`               | En geride birim `SATIN_ALINDI`/`DEPODA`/`PAKETLENDI`. ABD birimleri de buraya düşer; ülke bilgisi birimde. |
| `ULUSLARARASI_KARGO`        | En geride birim `YOLDA`                                                                                    |
| `BAKU_DAGITIM_ARKADAS`      | En geride birim `BAKUDE` ve teslimat `HAZIRLANIYOR`/`KURYEDE`                                              |
| `TESLIM_EDILDI`             | Bütün iptal edilmemiş birimler `TESLIM_EDILDI`                                                             |

**Ödeme:**

| Eski `finans_durumu` | v2 karşılığı              |
| -------------------- | ------------------------- |
| `BEKLIYOR`           | Ödeme `ODENMEDI`          |
| `KISMI_ODEME`        | Ödeme `KISMI`             |
| `ODENDI`             | Ödeme `TAM` ya da `FAZLA` |

Eski `alinan_tutar` = defterin toplamı (Σ `odemeler.tutar_azn`); eski `toplam_tutar` = satırların satış toplamı. Bu kolonları yalnız v2 RPC'leri yazar. v2 siparişlerde genel PATCH ile değiştirilemezler.

**Tersine yol:** v1 siparişler v2 modeline taşınmaz (K1); v2 ekranları yalnız `model_surumu = 2` olan siparişleri gösterir.

## 6. Para modeli

- **Satır para birimi:** Satış satırları AZN (K5). Fatura satırları faturanın para biriminde (CAD/USD).
- **Kur faturaya sabitlenir:** Fatura onaylanırken `kur_azn` girilir ve bir daha değişmez. Birimin alış maliyeti = `birim_fiyat × kur_azn`; bu değer onayda `urun_birimleri.maliyet_azn`'e yazılır. Tenant kuru sonradan değişse de geçmiş maliyet ve kâr **değişmez**. Bu, Belge 1 §5'teki sorunu kapatır.
- **Landed cost** (birim bazında, AZN, `maliyet_kalemleri` üzerinden):

  ```
  landed_cost(birim) = alış (birim_fiyat × kur_azn)
                     + kargo payı   (gönderi kargo maliyeti × kur → paketlere kg oranında
                                      → pakette birim ağırlığına ya da eşit, K6)
                     + yerel teslimat (teslimatın yerel ücreti + iş başı ücretler
                                      → teslimattaki birimlere eşit, K13)
                     + gümrük       (varsa; paket gümrüğü → paketteki birimlere değer oranında, K7)
  ```

- **Sipariş kârı:**

  ```
  sipariş kârı = Σ satır satış tutarı (AZN)
               − Σ bağlı birimlerin landed cost'u
               − siparişin primleri
  ```

  - Zarar sıfırlanmaz; `max(0, …)` yok.
  - Eksik veri (kur, ağırlık, gönderi maliyeti) varsa kâr tahmin edilmez; "**eksik veri**" olarak gösterilir. Belge 1'deki %55 ve 0,8 kg tahminleri kalkar.

- **Aylık net kâr** (sipariş kârından ayrı):

  ```
  aylık net kâr = Σ o ay teslim edilen siparişlerin kârı (K10)
                − o ayın maaşları
                − o ayın giderleri
  ```

  Maaş siparişlere dağıtılmaz (K14).

- **Hesabın yeri:** Kâr sunucuda hesaplanır (SQL görünümü ya da RPC). İstemci yalnız gösterir; `localStorage`'daki kur ve kg fiyatı kalkar.

## 7. Kazanç modeli

- **Kuralın kaynağı:** Her çalışanın kuralı `kazanc_kurallari`'ndadır: maaşlı, yüzdeli ya da iş başı. Birden fazla kural aynı anda olabilir (ör. maaş + prim). Kuralların geçerlilik aralığı var; eski aylar kendi dönemindeki kuralla hesaplanır.
- **Prim siparişe aittir:** Sipariş sahibinin (`sahip_kullanici_id`) primi, sipariş **tamamen tahsil edildiğinde** hak edilir (K12). Taban, tahsil edilen satış tutarıdır (K11). Ters kayıt ya da iade ödemeyi `TAM`'ın altına düşürürse prim `GERI_ALINDI` olur. Prim, sipariş kârından düşülür.
- **İş başı ücret siparişe aittir:** Ör. kurye başına teslim ücreti. Teslimat tamamlandığında RPC tarafından `maliyet_kalemleri`'ne (`IS_BASI`) yazılır ve landed cost'a girer (K13).
- **Maaş aya aittir:** Aylık net kârdan düşülür, siparişe dağıtılmaz.
- **Görünürlük (K15):**
  - `kazanc_kurallari`, `primler`, `maaslar`, `giderler` ve kâr raporları yalnız `PATRON` rolüne açık.
  - Bu, **API katmanında** uygulanır: allowlist kuralları yalnız `PATRON` içerir. Diğer rollerin gördüğü yanıtlara (sipariş detayı, liste) bu alanlar hiç eklenmez.
  - Kanıt olarak her rota için testler yazılır: diğer her rol 403 alır; sipariş ve teslimat yanıtlarında prim/maaş alanı bulunmaz; iki tenant arasında izolasyon ortak yardımcıyla sınanır.

## 8. Rol matrisi

Sembollerin anlamı:

- **Y**: yazar,
- **O**: okur,
- **—**: erişemez,
- **(kendi)**: yalnız kendisine atanmış kayıtlar.

`ABD_SATINALMA` yeni rol (K18). `SUPER_ADMIN` platform yöneticisidir; tenant iş verisinde PATRON gibi davranır, ancak maaş ve prim verisini göremez (K15).

| İşlem                             | PATRON    | SATIS_SORUMLUSU    | KANADA_SATINALMA | ABD_SATINALMA | BAKU_FINANS    | BAKU_KURYE |
| --------------------------------- | --------- | ------------------ | ---------------- | ------------- | -------------- | ---------- |
| Sipariş + satır oluşturma         | Y         | Y (sahibi kendisi) | —                | —             | —              | —          |
| Sipariş okuma                     | O         | O                  | O                | O             | O              | —          |
| Fatura yükleme ve onay            | Y         | —                  | Y (CA)           | Y (US)        | —              | —          |
| Birim ↔ satır eşleştirme          | Y         | O                  | Y (CA)           | Y (US)        | —              | —          |
| Depo kabul                        | Y         | —                  | Y (CA)           | Y (US)        | —              | —          |
| Paket ve gönderi                  | Y         | —                  | Y (CA)           | Y (US)        | —              | —          |
| Bakü varış kontrolü               | Y         | —                  | —                | —             | Y              | —          |
| Teslimat oluşturma ve kurye atama | Y         | —                  | —                | —             | Y              | —          |
| Teslim + tahsilat                 | —         | —                  | —                | —             | —              | Y (kendi)  |
| Ödeme kaydı ve ters kayıt         | Y         | Y (butikte)        | —                | —             | Y              | —          |
| Kasa teslimi alma                 | Y         | —                  | —                | —             | Y              | —          |
| Kur girme                         | Y         | —                  | Y                | Y             | Y              | —          |
| Landed cost / sipariş kârı        | O         | —                  | —                | —             | —              | —          |
| Maaş, prim, gider, aylık net kâr  | Y/O       | —                  | —                | —             | —              | —          |
| Kaçaklar panosu                   | O (hepsi) | —                  | O (Q1–Q3, Q7)    | O (Q1–Q3, Q7) | O (Q4, Q5, Q8) | —          |

Rol listesi bugün 15'ten fazla yerde tekrar ediyor (Belge 1 §6). ABD rolünden **önce** tek kaynağa toplanır (Faz A).

## 9. Kaçaklar panosu — 8 sorgu

Hepsi tenant filtreli, salt okunur SQL görünümleri ya da RPC'lerdir. Eşikler `tenant_v2_ayarlari`'ndan gelir.

| #   | Kaçak                          | Tanım                                                                                                           | Varsayılan eşik |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------- |
| Q1  | Sahipsiz stok                  | `durum ∉ {IADE}` ve `siparis_satiri_id IS NULL`, fatura onayından bu yana N gün geçmiş birimler                 | 7 gün           |
| Q2  | Eksik satın alma               | `adet − bağlı birim sayısı > 0` olan, iptal edilmemiş, sipariş tarihinden N gün geçmiş satırlar                 | 5 gün           |
| Q3  | Çözülmemiş depo sorunu         | `durum ∈ {EKSIK, HASARLI, YANLIS}` olup sonrasında `IADE` ya da düzeltme olayı olmayan birimler                 | 3 gün           |
| Q4  | Teslim edildi, ödenmedi        | Bütün birimleri `TESLIM_EDILDI`, ödeme durumu `ODENMEDI`/`KISMI` olan siparişler; kalan tutar ve yaşla birlikte | 0 gün           |
| Q5  | Kuryede bekleyen nakit         | Kurye başına Σ nakit tahsilat − Σ kasa teslimi > 0 ve en eski teslim edilmemiş tahsilat N saatten eski          | 24 saat         |
| Q6  | Zararlı / düşük marjlı sipariş | Landed cost'u tam olan siparişlerde kâr < 0 ya da marj < %M                                                     | M = %10         |
| Q7  | Beyan sınırı                   | Alıcının o ayki `toplam_beyan_usd`'si sınırı aşan ya da %X'ine yaklaşan paketler                                | %90             |
| Q8  | Varışı kontrol edilmemiş       | `YOLDA` durumunda N günden eski paketler, ya da `VARDI` olup `varis_kontrolu` boş kalan paketler                | 10 gün          |

## 10. API ve ekranlar

- **Rotalar:** Hepsi `/api/v2/...` altında ve `FF_V2_FLOW` arkasında. Her biri `src/server/middleware/auth.ts` allowlist'ine metod + yol + rol ile eklenir.
- **Çok adımlı yazmalar transactional RPC:**
  - `tomnap_v2_siparis_olustur` (başlık + satırlar),
  - `tomnap_v2_fatura_onayla` (satırlar + birimler + sabit kur),
  - `tomnap_v2_birim_eslestir` (kapasite kilidi),
  - `tomnap_v2_depo_kabul`,
  - `tomnap_v2_paketle`,
  - `tomnap_v2_gonderi_durumu`,
  - `tomnap_v2_varis_kontrolu`,
  - `tomnap_v2_teslimat_olustur`,
  - `tomnap_v2_teslim_ve_tahsilat`,
  - `tomnap_v2_odeme_kaydet`, `tomnap_v2_odeme_ters_kayit`,
  - `tomnap_v2_kasa_teslimi`.
- **Eski kolonların senkronu:** Her RPC sonunda eski kolonları (§5) aynı transaction içinde günceller.
- **AI:** Fatura ayrıştırma belgeden yalnız satır alanlarını çıkarır. Birim ↔ satır önerisi sunucuda, tenant'ın açık satırları üzerinden yapılır; AI'a gönderilmez.
- **Ekranlar:** `React.lazy` ile yüklenir, her biri ≤ 400 satır:
  - v2 sipariş girişi,
  - satın alma ve fatura,
  - eşleştirme,
  - depo kabul (CA/US),
  - paketleme ve gönderi,
  - Bakü varış,
  - teslimat hazırlığı,
  - kasa (defter + kurye nakdi),
  - kâr ve kazanç (PATRON),
  - kaçaklar.
- **Mevcut ekranlar:** Kurye ekranı (`KuryeCalismaAlani`) v2 teslimatlarını da gösterecek şekilde genişletilir.

## 11. Fazlar

- **Faz A: Temel** (bkz. [faz-a-plan.md](faz-a-plan.md)). İçeriği:
  - Belge 1'deki KRİTİK düzeltmeler,
  - rol tek kaynağı ve `ABD_SATINALMA`,
  - v2 bayrağı,
  - kur tablosu,
  - sipariş satırları ve sahibi,
  - ödeme defteri,
  - kurye nakdi ve kasa teslimi.
- **Faz B: Satın alma ve eşleştirme.** Fatura, AI ayrıştırma, birimler, eşleştirme; Q1 ve Q2.
- **Faz C: Depo, paket ve gönderi.** Depo kabul, paketler, gönderiler, aylık beyan; Q3, Q7, Q8.
- **Faz D: Bakü, maliyet ve kazanç.** Varış, birleştirme ve teslimat; landed cost, sipariş kârı, kazanç modeli, aylık net kâr; Q4–Q6 tam hali.

## 12. ÇAKIŞMA

Belge 1'deki mevcut durumla bu spec'in çeliştiği noktalar ve çözüm:

1. **Sipariş tek satır** (Belge 1 §3). `META:urunler` JSON'u `eksik_bilgiler`'in içinde. v2'de `siparis_satirlari` tablosu var; v1 siparişler taşınmaz (K1). `META:urunler` yalnız v1'de okunur.
2. **Ödeme tek sayı, silinebilir** (Belge 1 KRİTİK 6). v2'de append-only defter var. Ödeme durumunu "BEKLIYOR" seçip tahsilatı 0'layan yol, v2 siparişlerde kapalıdır; v1 için Faz A'da sunucu tarafında kapatılır.
3. **Kur ve kg fiyatı tarayıcıda; kâr istemcide ve geriye dönük değişiyor** (Belge 1 §5). v2'de kur faturaya sabit, kâr sunucuda hesaplanıyor. `FinansLojistikOzet` v2 siparişler için sunucudan gelen kârı gösterir.
4. **AWB sipariş başına** (PR #3). v2'de AWB paket başına. PR #3'ün öneri + onay deseni ve `awb_match_approvals` kaydı korunur; v2'de manifest satırı pakete eşlenir. v1 siparişlerde sipariş başına AWB aynen sürer.
5. **Kurye ataması sipariş başına** (PR #2 RPC'leri). v2'de teslimat (müşteri paketi) başına. PR #2'nin kurye kaydı ve atama deseni yeniden kullanılır; v2 için yeni RPC'ler eklenir, eski RPC'ler değişmez.
6. **Kurye teslimi tahsilatı kaydetmiyor** (Belge 1 §4). v2'de `tomnap_v2_teslim_ve_tahsilat` teslim ve ödemeyi aynı transaction'da yazıyor.
7. **Simüle kargo durumu gerçek siparişe yazılıyor** (Belge 1 KRİTİK 4). v2 durumları yalnız paket ve gönderi olaylarından gelir; senkronizasyon simülasyon sonucunu hiçbir siparişe yazmaz (Faz A'da düzeltilir).
8. **Gemini'ye müşteri rehberi gidiyor** (Belge 1 KRİTİK 1). v2 AI yalnız belgeden alan çıkarır. Mevcut yol, v2'ye geçmeden Faz A'nın ilk PR'ında kapatılır.
9. **Rol listesi dağınık; SQL'de `IN (...)` listeleri** (Belge 1 §6). `ABD_SATINALMA` eklenmeden önce tek kaynağa toplanır. SQL listeleri yeni bir migration'daki fonksiyonla değiştirilir. `firmalar.rol_limitleri` varsayılanı değiştirilmez (mevcut tablo); eksik rol anahtarı RPC'de varsayılana düşer.
10. **Sunucudan geçen yükleme ile 4,5 MB sınırı** (RELEASE_READINESS madde 4). Fatura belgeleri imzalı URL ile doğrudan Storage'a yüklenir (K22).
11. **`siparisler.tenant_id`'de firmaya FK yok; firma silinince siparişler sahipsiz kalıyor** (Belge 1 §8). Yeni tablolar `ON DELETE RESTRICT` kullanır. Mevcut tabloya dokunulmaz.
12. **`demo_sandbox` bellekte** (Belge 1 §2). v2 orada kapalı (K21).
13. **`varsayilan_komisyon_yuzdesi` kullanılmıyor** (Belge 1 7 durak, EK). v2 primleri `kazanc_kurallari`'ndan gelir. Eski kolona dokunulmaz ve kullanılmaz.
14. **Lojistik enum'unda ABD aşaması yok.** Enum değişmez; ülke bilgisi birim ve gönderide (§5).
15. **Müşteri listesi her istekte siparişlerden karesel olarak yeniden kuruluyor** (Belge 1 §3). v2 siparişlerde yeni `musteri_id` kolonu doğrudan bağ kurar. Liste performansı ayrı bir iş olarak kalır.
