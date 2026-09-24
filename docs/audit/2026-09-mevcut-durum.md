# Mevcut durum denetimi — Eylül 2026

**Kapsam:** `main` @ `bfa84b9` (PR #2–#5 dahil) ve canlıdaki kod.

**Canlıdaki kod:** `90b8eae`. Kaynak: GitHub `Production` deployment kaydı, bkz. [DEPLOY_1.md](../DEPLOY_1.md).

**Yöntem:** Bu belge yalnız kod okunarak hazırlandı: kod çalıştırılmadı, veritabanı ya da Vercel ayarları okunmadı.

**Referans biçimi:**

- `dosya:satır` referansı main'e aittir.
- `90b8eae:dosya:satır` referansı canlı koda aittir.
- Kanıtlanamayan her şey **DOĞRULANAMADI** olarak işaretlidir.

## Özet — 7 durak: var / kısmen var / yok

| #   | Durak                                                                               | Durum          | Bugün ne var                                                                                                                              | Eksik olan                                                                                                                                                                                                                       | Kanıt                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Sipariş kaydı (mesaj → sipariş + satırlar, sahibi)                                  | **kısmen var** | Mesaj ya da ekran görüntüsü AI ile tek bir siparişe çevriliyor. Inbox onay akışı var.                                                     | Satır (kalem) tablosu yok; çoklu ürün `eksik_bilgiler` içinde `META:urunler=` JSON'u. Siparişin **sahibi** (satış sorumlusu) alanı yok. Instagram/WhatsApp'tan otomatik alım yok; "webhook" oturum istiyor, elle yapıştırılıyor. | `src/server/routes/siparisler.ts:99`, `src/server/routes/inbox.ts:92`, `src/server/services/siparisFormatlama.ts:103`, `src/server/middleware/auth.ts:48` |
| 1   | Satın alma (fatura → AI → onay, fatura para birimi, sabit kur)                      | **kısmen var** | Sipariş başına elle girilen alanlar: `kanada_alis_fiyati_cad`, `kanada_fatura_no`, `kanada_fatura_gorseli`.                               | Fatura varlığı yok. Faturadan AI ile satır çıkarma yok. Fatura para birimi ve faturaya sabitlenmiş kur yok; kur tarayıcıda tutuluyor (bkz. §5).                                                                                  | `src/server/services/siparisFormatlama.ts:27-40`, `src/components/SiparisDetayModal.tsx:118`                                                              |
| 2   | Eşleştirme (ürün birimi → sipariş satırı, DB'de unique)                             | **yok**        | —                                                                                                                                         | Birim ve satır kavramı yok; fatura ile sipariş arasında bağ yok.                                                                                                                                                                 | —                                                                                                                                                         |
| 3   | Depoda teslim alma (Kanada + ABD, birim bazında geldi/eksik/hasarlı/yanlış)         | **kısmen var** | Yalnız sipariş düzeyinde `KANADA_DEPO` durumu.                                                                                            | Birim bazında kontrol yok. ABD deposu yok; `US` yalnız kargo çıkış ülkesi seçeneği.                                                                                                                                              | `tests/sql/base-fixture.sql:17-24`, `src/server/routes/kargoEntegrasyon.ts:71`                                                                            |
| 4   | Paketleme ve gönderi (alıcı bazında paket, gönderi, aylık beyan sayacı, CA/US ayrı) | **kısmen var** | Sipariş başına AWB (`uluslararasi_kargo_kodu`) ve ağırlık. Aramex manifest ayrıştırma, insan onaylı AWB eşleştirme (PR #3) ve onay kaydı. | Paket ve gönderi varlıkları yok. Alıcı bazında aylık beyan sayacı yok. CA/US ayrımı yok.                                                                                                                                         | `src/server/routes/kargoEntegrasyon.ts:287-319`, `supabase/migrations/20260923164650_awb_match_approvals.sql`                                             |
| 5   | Bakü varış ve teslimat (varış kontrolü, birleştirme, kurye, teslim + tahsilat)      | **kısmen var** | Kurye kaydı, atama ve teslim transactional RPC'lerle yapılıyor; teslim alan kişi kaydediliyor (PR #2).                                    | Varış kontrolü yok. Farklı ülkelerden gelen ürünleri birleştirme yok. **Teslimde tahsilat kaydı yok**; ödeme ayrı bir "Ödendi işaretle" düğmesiyle giriliyor.                                                                    | `supabase/migrations/20260917170053_secure_cargo_couriers_and_legacy_uploads.sql:90-107`, `src/server/services/couriers.ts:326-352`                       |
| 6   | Para (ödeme defteri, kurye→kasa nakit, landed cost, kâr)                            | **kısmen var** | Sipariş başına tek sayı: `alinan_tutar`. İstemcide tahmini "net kâr" panosu.                                                              | Ödeme defteri yok (tutar, yöntem, kim aldı, ne zaman). Kurye→kasa teslimi yok. Landed cost yok; kâr istemcide, tarayıcıdaki kurla hesaplanıyor.                                                                                  | `tests/sql/base-fixture.sql:53-56`, `src/components/FinansLojistikOzet.tsx:100`                                                                           |
| EK  | Ekip ve kazanç (maaş/yüzde/iş başı, aylık net kâr)                                  | **yok**        | `firmalar.varsayilan_komisyon_yuzdesi` alanı var ama **hiç kullanılmıyor**. Aylık "net kâr" yalnız istemci panosunda.                     | Çalışan kazanç modeli, prim ve maaş yok.                                                                                                                                                                                         | `supabase_saas_schema.sql:12`, `src/components/FinansLojistikOzet.tsx:404-415`                                                                            |

## KRİTİK bulgular

Bunlar veri kaybı, yanlış veri ya da kişisel verinin dışarı çıkması riski taşıyor.

1. **KRİTİK — Gemini'ye toplu müşteri rehberi gönderiliyor.**
   - `POST /api/ayristir-siparis`, tenant'ın bütün müşterilerini (`id`, `ad_soyad`, `telefon`, `sehir`, `adres`, `musteri_tipi`) her ayrıştırma isteminde gönderiyor: `src/server/routes/siparisler.ts:132-149`.
   - Bu, CLAUDE.md'deki "Gemini'ye asla toplu müşteri rehberi gönderme" kuralını ihlal ediyor. Şu an yalnız demo verisi olduğu için gerçek bir sızıntı yok; gerçek veriden önce kapanmalı.
2. **KRİTİK (canlı `90b8eae`) — Dosyada tutulan veri Vercel'de kalıcı değil.**
   - **Kargo ayarları (API kimlik bilgileri dahil):** Yalnız `data/kargo_ayarlari.json`'da (`90b8eae:src/server/services/kargo/kargoMerkezi.ts:18,281`).
   - **Kullanıcı ve firma değişiklikleri:** `data/*.json`'a yazılıyor ve yazma hatası yutuluyor (`90b8eae:src/server/services/state.ts:159-170,193-200`).
   - **Yüklenen görseller:** `process.cwd()/uploads`'a yazılıyor (`90b8eae:src/server/config.ts:17-21`).

   Vercel'in dosya sistemi kalıcı değil. Bu veriler örnek (instance) değişince kaybolur ya da hiç yazılamaz. `main` bunları Supabase'e taşıdı (§2); risk, Deploy 1'e kadar canlıda sürüyor.

3. **KRİTİK (canlı `90b8eae`) — Veritabanı hatasında sessiz başarı.** Supabase'e sipariş yazılamazsa sipariş yalnız belleğe alınıyor ve istemciye `basarili: true` dönüyor (`90b8eae:src/server/routes/siparisler.ts:396-405, 540-558`). Serverless'ta bu sipariş kaybolur. `main` bu durumda 503 döndürüyor (`src/server/routes/siparisler.ts:67-71, 437, 627`).
4. **KRİTİK (canlı `90b8eae`) — Kargo senkronizasyonu simüle sonuçları gerçek siparişlere yazıyor.**
   - Aramex kimlik bilgileri yoksa ya da test modu açıksa takip sonucu, AWB'nin son hanesine göre simüle ediliyor (`src/server/services/kargo/providers/aramex.ts:131,439-456`).
   - Canlı kodda `POST /api/kargo/senkronize-et` bu sonucu siparişin `lojistik_durumu`'na **uyguluyor**; `TESLIM_EDILDI` dahil. Nota da "Canlı" yazılıyor (`90b8eae:src/server/services/kargo/kargoMerkezi.ts`).
   - **Düzeltme (24 Eylül 2026):** `main`'de bu yol kapalı. PR #2 (`fbb208d`), sonuçlardan biri `LIVE` değilse senkronizasyonu hiçbir şey yazmadan durduruyor (`src/server/services/kargo/kargoMerkezi.ts:130-133`); DHL ve UPS taslakları da `SIMULATION` döndürüyor. Bu korumanın testi yok. Belgenin ilk sürümünde bulgu yanlışlıkla main'e de atfedilmişti.
5. **KRİTİK — Kur ve kg fiyatı tarayıcıda tutuluyor; kâr geriye dönük değişiyor.**
   - CAD→AZN kuru ve kg başı kargo fiyatı `localStorage`'da (`src/components/FinansLojistikOzet.tsx:40-56`). Her kullanıcı ve cihaz farklı kâr görüyor; kur değişince geçmiş siparişlerin kârı da değişiyor (§5).
6. **KRİTİK — Tahsilat kaydı tek bir sayı ve silinebiliyor.** Ödeme defteri yok (`alinan_tutar` tek sayı). Sipariş tablosunda ödeme durumu "BEKLIYOR" seçilince `alinan_tutar` 0'a çekiliyor (`src/components/SiparisTablosu.tsx:87-95`). Kayıtlı tahsilat geri dönüşsüz siliniyor.

## 1. PR #2 "Faz 1–5" ne ekledi

PR #2 (`5a02836`, 21 Eylül) bir iş akışı özelliği değil. Mevcut akışın **güvenlik, kalıcılık ve tutarlılık** sertleştirmesi. Main'de var, canlıda yok.

**Tablolar ve veritabanı nesneleri** (migration'lar):

| Migration                                                                 | Eklenen                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260917151255_server_sessions_and_private_tables.sql`                   | `oturumlar` (sunucu oturumu); mevcut tablolarda `anon`/`authenticated` yetkileri kaldırılıyor.                                                                                                                  |
| `20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql` | Tablolar: `onboarding_email_jobs`, `order_maintenance_operations`. `siparisler.ek_veriler` (JSONB) ve `davetler.email` kolonları. RPC'ler: kayıt/davet/aktivasyon, inbox onay/ret, sipariş dışa ve içe aktarma. |
| `20260917170053_secure_cargo_couriers_and_legacy_uploads.sql`             | `kuryeler` (yoksa), `kuryeler.kullanici_id`, `cargo_settings` (şifreli kimlik), `legacy_upload_migrations`. Kurye atama ve teslim RPC'leri.                                                                     |
| `20260917174218_consistent_lists_and_private_storage.sql`                 | `list_revisions` ve tetikleyiciler (tutarlı sayfalama); `tomnap-private-images` bucket politikaları.                                                                                                            |

**Rotalar** (canlıya göre yeni; tam liste `src/server/middleware/auth.ts:26-67`):

- oturum: `GET /api/auth/oturum`, `POST /api/auth/cikis`,
- kurye yönetimi: `POST /api/kuryeler`, `POST /api/kuryeler/:id/kullanici`, `POST /api/siparisler/:id/kurye`,
- kurye görevleri: `GET /api/kurye/gorevler`, `POST /api/kurye/gorevler/:id/teslim`.

Giriş, davet ve aktivasyon rotaları yeniden yazıldı.

**Ekranlar:** Yeni olarak `KuryeAtamaAlani.tsx` ve `KuryeCalismaAlani.tsx` geldi. Değişen ekranlar arasında `SiparisTablosu`, `YanMenu`, `BakuTahsilatSayfasi`, `KargoManifesto*`, `MusteriRehberi`, `OnayBekleyenler*` ve `LandingPage` var. Uygulamanın ekran listesi (`src/App.tsx:40-60`) şunlar:

- `/app` (panel),
- `/kanban`,
- `/gorsel-giris`,
- `/musteriler`,
- `/kargo-manifest`,
- `/kargo-merkezi`,
- `/baku-tahsilat`,
- `/inbox`,
- `/kurye-masasi`,
- `/kodlar`.

**RELEASE_READINESS.md'deki 5 koşul** (`docs/RELEASE_READINESS.md:31-49`):

| #   | Koşul                                                                                                                  | Durum             | Kanıt / not                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Canlı şema, migration geçmişi, roller ve kayıt sayıları salt okunur karşılaştırılır                                    | **DOĞRULANAMADI** | Bu çalışmada canlı veritabanı okunmadı. DEPLOY_1'deki imza sorgusu yayın gününe bırakıldı.                               |
| 2   | Yedek ve geri dönüş yolu; eski istemcinin anonim erişimiyle yeni RLS geçişinin birlikte planlanması                    | **kısmen**        | [DEPLOY_1.md](../DEPLOY_1.md) (e) yazıldı. Migration 1–4'ün down dosyası yok; yedek alınmadı (DOĞRULANAMADI).            |
| 3   | Sunucu anahtarı, HTTPS `APP_URL`, kargo şifreleme anahtarları, e-posta, `UPLOAD_STORAGE_BACKEND=supabase`, özel bucket | **DOĞRULANAMADI** | Vercel ortam değişkenleri okunmadı. Kodun beklentisi: `src/server/services/privateImageStorage.ts:17`.                   |
| 4   | Vercel Functions'ın 4,5 MB sınırı ile görsel, yedek ve büyük liste uyumu                                               | **yok**           | Kod hâlâ 25 MB gövde kabul ediyor (`src/server/index.ts:64`); görsel ve yedek yolları bu sınıra göre değiştirilmedi.     |
| 5   | Gerçek önizlemede kabul testleri (giriş, iki firma, eşzamanlılık, e-posta, Storage)                                    | **kısmen**        | CI'daki Chromium ve SQL testleri geçiyor. Gerçek önizlemede elle kabul testi yapıldığına dair kayıt yok (DOĞRULANAMADI). |

## 2. Depolama

| Veri                    | `main` (Deploy 1 sonrası)                                                                                                                                                                  | Canlı `90b8eae`                                   | Not                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Siparişler              | Supabase `siparisler` (`src/server/routes/siparisler.ts:45`)                                                                                                                               | Supabase; hata olursa bellek ve "başarılı" yanıtı | Canlıda **KRİTİK** (yukarıda 3)                                                         |
| Müşteriler              | Supabase `musteriler` (`src/server/routes/musteriler.ts:38`)                                                                                                                               | Supabase + bellek                                 | —                                                                                       |
| Inbox                   | Supabase `inbox_mesajlar`                                                                                                                                                                  | Supabase + bellek                                 | —                                                                                       |
| Kullanıcı, firma, davet | Supabase. Production ya da `SUPABASE_URL` tanımlıyken dosya okunmuyor (`src/server/services/state.ts:266-270`); dosyaya yazma yalnız Supabase yokken (`src/server/routes/firmalar.ts:484`) | Supabase + `data/*.json` (hata yutuluyor)         | Canlıda **KRİTİK**                                                                      |
| Oturumlar               | Supabase `oturumlar`; production'da Supabase yoksa hata (`src/server/services/sessions.ts:74`)                                                                                             | — (sunucu oturumu yoktu)                          | —                                                                                       |
| Kuryeler                | Supabase `kuryeler`; dosya yolu production'da hata veriyor (`src/server/services/couriers.ts:52-56`)                                                                                       | —                                                 | —                                                                                       |
| Kargo ayarları          | Supabase `cargo_settings`, şifreli (`src/server/services/kargo/settings.ts:191-201`)                                                                                                       | **Yalnız dosya** `data/kargo_ayarlari.json`       | Canlıda **KRİTİK**                                                                      |
| Görseller               | Supabase Storage `tomnap-private-images` (Vercel'de `local` reddediliyor: `src/server/services/privateImageStorage.ts:17-18`)                                                              | Disk `uploads/`                                   | Canlıda **KRİTİK**                                                                      |
| AWB onay kaydı          | Supabase `awb_match_approvals`                                                                                                                                                             | —                                                 | —                                                                                       |
| `demo_sandbox` tenant'ı | **Bilerek bellekte** (`src/server/routes/siparisler.ts:45-47`)                                                                                                                             | Bellekte                                          | Kalıcı değil ve örnekler arasında tutarsız görünebilir. Tanıtım alanı olduğu için ORTA. |
| Kur ve kg fiyatı        | Tarayıcı `localStorage`                                                                                                                                                                    | Aynı                                              | **KRİTİK** (§5)                                                                         |

**Production modu:**

- **Canlı:** `90b8eae` Vercel'de çalışıyor. `NODE_ENV=production` Vercel'in varsayılanı, ama ortam değişkenleri okunmadı (**DOĞRULANAMADI**).
- **Veritabanı:** 23 Eylül'deki salt okunur denetim `siparisler` tablosunu Supabase'den okudu (24 sipariş). Yani canlıda Supabase bağlı.
- **Deploy 1 sonrası:** `main` Supabase'i tek otorite yapıyor; dosyaya düşen hiçbir yol kalmıyor. Tek istisna bilerek bellekte tutulan `demo_sandbox`.

## 3. Veri modeli

**Tablolar:**

- temel şema: `firmalar`, `davetler`, `kullanicilar`, `musteriler`, `inbox_mesajlar`, `oturumlar` (`supabase_saas_schema.sql:7,36,51,110,128,157`),
- migration'larla gelenler: `kuryeler`, `cargo_settings`, `onboarding_email_jobs`, `order_maintenance_operations`, `legacy_upload_migrations`, `list_revisions`, `awb_match_approvals`,
- sipariş tablosu: `siparisler`.

`siparisler`'in `CREATE` ifadesi repoda **yok**. Yalnız canlının kopyası sayılan test fikstüründe (`tests/sql/base-fixture.sql:29-79`) ve UI kod şablonunda (`src/data/kod-sablonlari.ts:52`) tanımlı. Canlıdaki kolonların birebir aynı olduğu **DOĞRULANAMADI**.

**Enum'lar:**

- `finans_durumu_enum`: `ODENDI`, `KISMI_ODEME`, `BEKLIYOR`.
- `lojistik_durumu_enum`: `KANADA_SATINALIM_BEKLIYOR`, `KANADA_DEPO`, `ULUSLARARASI_KARGO`, `BAKU_DAGITIM_ARKADAS`, `TESLIM_EDILDI` (`tests/sql/base-fixture.sql:6-27`).
- Diğer durumlar serbest metin, örneğin `musteri_tipi`, `firmalar.onay_durumu`, `inbox_mesajlar.durum`.

**Sipariş tek satır.**

- Bir sipariş tek bir ürün tanımı taşıyor: `urun_aciklamasi`, `beden_veya_olcu`, `renk`, `adet`.
- Çoklu ürün `eksik_bilgiler` içinde `META:urunler=<JSON>` olarak saklanıyor ya da `urun_aciklamasi`'ndaki `+` işaretinden bölünüyor (`src/server/services/siparisFormatlama.ts:103-104, 159-191`).
- Satır (kalem) tablosu yok.

**Müşteri ayrı tablo** (`musteriler`), ama sipariş müşteriye zayıf bağlı:

- Bağ `ek_veriler.musteri_id` ile ya da telefon ve ad eşleşmesiyle kuruluyor (`src/server/routes/musteriler.ts:62-70`).
- Liste her istekte siparişlerden yeniden kuruluyor; karesel (`src/server/routes/musteriler.ts:89-120`).

**Satın alma, fatura, paket, ödeme için tablo yok.** Satın alma bilgileri sipariş satırındaki `ek_veriler` JSONB'de tutuluyor: `kanada_alis_fiyati_cad/azn`, `kargo_agirligi_kg`, `kargo_ucreti_azn`, `kanada_fatura_no/gorseli`, `kanada_gumruk_fin_kodu`, `islem_gecmisi` (`src/server/services/siparisFormatlama.ts:27-40`). Ödeme `alinan_tutar` tek sayısı; `kalan_tutar` üretilmiş kolon.

## 4. Durum makinesi

- **Nerede tutuluyor:** Siparişin `lojistik_durumu` ve `finans_durumu` kolonlarında. Geçiş tablosu ya da kuralı yok; herhangi bir değer herhangi bir değere yazılabiliyor. Tek istisnalar kurye teslimi ve AWB onayındaki ön koşullar.
- **`finans_durumu` her zaman tutardan türetiliyor:** `alinan >= toplam` ise `ODENDI`, `alinan > 0` ise `KISMI_ODEME`, değilse `BEKLIYOR`. Sunucu PATCH'te istemcinin gönderdiği değeri yok sayıp yeniden hesaplıyor (`src/server/routes/siparisler.ts:807-812`). Sipariş oluşturma ve inbox onayında da aynı kural geçerli (`src/server/routes/siparisler.ts:348-350, 585-587`, `src/server/routes/inbox.ts:381-383`).
- **Lojistik geçişlerinin kod yolları:**
  - Genel PATCH; rol alan listeleri `src/server/routes/siparisler.ts:664-731`.
  - Tablo ve Kanban seçimleri (`src/components/SiparisTablosu.tsx:98,534`, `src/components/KanbanGorunumu.tsx:229`).
  - Toplu "hepsini uluslararası kargo yap" (`src/server/routes/siparisler.ts:899-915`).
  - Kurye teslimi: `BAKU_DAGITIM_ARKADAS` → `TESLIM_EDILDI` (`supabase/migrations/20260917170053_secure_cargo_couriers_and_legacy_uploads.sql:90-107`).
  - Kargo senkronizasyonu (`src/server/services/kargo/kargoMerkezi.ts:151`).
  - AWB onayı: `KANADA_*` → `ULUSLARARASI_KARGO`.
  - Inbox onayı: yeni sipariş `KANADA_SATINALIM_BEKLIYOR` olarak açılıyor (`src/server/routes/inbox.ts:384`).
- **"Ödendi işaretle" lojistik durumu değiştirmiyor.** `alinan_tutar = toplam_tutar` yapıp nota tarih ekliyor (`src/components/BakuTahsilatSayfasi.tsx:116-125`, `src/components/BakuTahsilatModal.tsx:49-56`).
- **Ödeme ve teslimat birbirinden habersiz:**
  - Teslim edilmiş ama ödenmemiş sipariş için bir kural ya da uyarı yok.
  - Kurye teslimi tahsilatı kaydetmiyor.

## 5. Para

**Kur ve kg fiyatı:**

- Saklandıkları yer: yalnız tarayıcının `localStorage`'ı, `tomnap_cad_kur` ve `tomnap_kargo_kg_azn` anahtarları.
- Varsayılanlar: kur **1,25**, kg fiyatı **6,5 AZN** (`src/components/FinansLojistikOzet.tsx:40-56`).
- Sunucuda ya da veritabanında kur yok.

**Kâr formülü** (istemcide, sipariş başına; `src/components/FinansLojistikOzet.tsx:215-227` günlük, `406-415` aylık, `100` toplam):

```
alisAzn  = kanada_alis_fiyati_azn
           || kanada_alis_fiyati_cad × cadKur
           || toplam_tutar × 0.55                 // tahmini %55 maliyet
kargoAzn = kargo_ucreti_azn
           || (kargo_agirligi_kg || 0.8) × kargoBirimFiyatAzn
netKar   = max(0, toplam_tutar − alisAzn − kargoAzn)
```

**Kur değişince geçmiş siparişlerin kârı değişiyor mu?** Evet. `kanada_alis_fiyati_azn` dolu olmayan her sipariş için kâr, o anki `localStorage` kuruyla yeniden hesaplanıyor. Arayüz yalnız `kanada_alis_fiyati_cad`'ı yazıyor (`src/components/SiparisDetayModal.tsx:118`); `_azn` alanını yazan bir akış bulunamadı. Buna ek olarak:

- `max(0, …)` zararı sıfır gösteriyor.
- `toplam_tutar`, `para_birimi` CAD ya da USD olsa bile AZN gibi toplanıyor.
- Tahmini değerler (%55 maliyet, 0,8 kg) "net kâr"a gerçekmiş gibi karışıyor.

## 6. Roller

**Rol listesi:** `SUPER_ADMIN`, `PATRON`, `KANADA_SATINALMA`, `SATIS_SORUMLUSU`, `BAKU_FINANS`, `BAKU_KURYE` (`src/server/types/index.ts:116`, `src/types.ts:122`).

**Kotalar:** `firmalar.rol_limitleri` JSONB alanında (`supabase_saas_schema.sql:21-22`). Varsayılanlar kodda da tekrar ediyor (`src/server/routes/firmalar.ts:59,66,169,178,186,211,449,456`). Davet ve kabul RPC'leri kotayı uyguluyor ("Role quota exceeded": `supabase/migrations/20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql:92-117`).

**Yeni bir rol (ör. ABD sorumlusu) için değişecek yerler:**

- **Tipler:** `src/server/types/index.ts:116`, `src/types.ts:122`.
- **Yetki grupları ve kurallar:** `src/server/middleware/auth.ts:16-22` (STAFF, SALES, PURCHASING, FINANCE, SHIPPING, ALL) ve kural tablosu `:26-67`.
- **Doğrulayıcılar:** `src/server/services/sessions.ts:13-20`, `src/server/services/state.ts:137-144`, `src/server/services/onboarding.ts:47`, `src/server/routes/auth.ts:28`, `src/server/routes/firmalar.ts:329`.
- **Alan yetkileri:** `src/server/routes/siparisler.ts:715-731`, `src/server/routes/kuryeler.ts:14`.
- **Kota varsayılanları:** `src/server/routes/firmalar.ts` (8 yer), `supabase_saas_schema.sql:21-22`.
- **SQL'deki rol listeleri:** Davet ve kabul RPC'lerinin `IN (...)` kontrolleri (`…_transactional_onboarding_inbox_and_order_maintenance.sql:92,112`). Bunlar için **yeni bir migration** gerekir.
- **Arayüz:** `src/components/DavetOlusturModal.tsx:46-54,180-184`, `src/components/YanMenu.tsx:156-171,1042-1069`, `src/store/appStore.ts:88`, `src/lib/courierApi.ts:46`, `src/components/TenantOnayMerkeziModal.tsx:290`.

Rol listesi **15'ten fazla yerde** tekrar ediyor; tek bir kaynaktan türetilmiyor.

## 7. Entegrasyon

- **Aramex takip:** Gerçek HTTP çağrısı (`https://ws.aramex.net/...TrackShipments`, `src/server/services/kargo/providers/aramex.ts:19-21,156`). Ancak yalnız kullanıcı adı, şifre ve hesap no girilmiş ve `testModu` kapalıysa çalışıyor. Aksi halde **simülasyon** dönüyor (`:128-133, 439+`). Main simüle sonucu siparişe yazmıyor (`src/server/services/kargo/kargoMerkezi.ts:130-133`); canlıda yazıyor (KRİTİK bulgu 4).
- **Aramex manifest:** Yüklenen Daily Dispatch Excel dosyası yerelde ayrıştırılıyor, API çağrısı yok. Eşleştirme yalnız öneri üretiyor, yazma insan onayıyla yapılıyor (PR #3).
- **DHL ve UPS:** Taslak; her numara için sabit `ULUSLARARASI_KARGO` dönüyor (`src/server/services/kargo/providers/dhl.ts:24-35`, `…/ups.ts`).
- **Gemini:** Sipariş ve inbox ayrıştırma (`src/server/routes/siparisler.ts:315`, `src/server/routes/inbox.ts:121`); KRİTİK bulgu 1'e bakın.
- **Resend:** Davet ve aktivasyon e-postaları.
- **Instagram/WhatsApp:** Doğrudan entegrasyon yok.

## 8. Veri kaybı riski olan düğme ve uç noktalar

| Uç nokta / düğme                                                                              | Kim                                   | Ne yapar                                                                                                                         | Geri dönüş                                                                 | Kanıt                                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "Seçili Butikin Sifarişlərini Sil" → `POST /api/veritabani/temizle`                           | SUPER_ADMIN; `SIL:<tenant>` onay kodu | Tenant'ın **bütün** siparişlerini siler                                                                                          | **Yok.** İşlem tablosu yalnız sonucu tutuyor, silinen satırları saklamıyor | `src/server/routes/veritabani.ts:264`, migration `…160612…sql:351`, `src/components/VeritabaniYonetimModal.tsx:105` |
| JSON geri yükleme, değiştir modu → `POST /api/veritabani/yedek-yukle` (`temizleVeYukle=true`) | SUPER_ADMIN; `DEGISTIR:<tenant>`      | Mevcut siparişleri dosyadakilerle **değiştirir**                                                                                 | Yalnız önceden alınmış bir yedekle                                         | `src/server/routes/veritabani.ts:319-346`, `src/components/VeritabaniYonetimModal.tsx:178-208`                      |
| `POST /api/veritabani/demo-yukle`, `POST /api/demo/sifirla`                                   | SUPER_ADMIN / demo                    | `demo_sandbox`'ı sıfırlar                                                                                                        | Yalnız demo alanında                                                       | `src/server/routes/veritabani.ts:275`, `src/server/routes/siparisler.ts:883`                                        |
| `DELETE /api/firmalar/:id`                                                                    | SUPER_ADMIN                           | Firmayı siler; kullanıcı, davet, müşteri ve inbox **CASCADE** ile gider. Siparişlerde FK olmadığı için siparişler sahipsiz kalır | Yok                                                                        | `src/server/routes/firmalar.ts:505`, `supabase_saas_schema.sql:39,53,112,130`                                       |
| `DELETE /api/siparisler/:id`                                                                  | PATRON, SATIS_SORUMLUSU               | Kalıcı siler (soft delete yok)                                                                                                   | Yok                                                                        | `src/server/routes/siparisler.ts:858`                                                                               |
| `POST /api/siparisler/tumunu-uluslararasi-kargo-yap`                                          | PATRON, KANADA_SATINALMA              | Teslim edilmemiş bütün siparişleri `ULUSLARARASI_KARGO` yapar                                                                    | Yok; önceki durum kaydedilmiyor                                            | `src/server/routes/siparisler.ts:899-915`                                                                           |
| Ödeme durumu "BEKLIYOR" seçimi                                                                | Tablo ekranı                          | `alinan_tutar`'ı 0 yapar                                                                                                         | Yok                                                                        | `src/components/SiparisTablosu.tsx:87-95`                                                                           |
| `POST /api/kargo/senkronize-et` (simülasyonda; **yalnız canlı `90b8eae`**)                    | PATRON, KANADA_SATINALMA              | Siparişlerin lojistik durumunu simüle sonuçla değiştirir. Main'de engelli (`src/server/services/kargo/kargoMerkezi.ts:130-133`). | Yok                                                                        | KRİTİK bulgu 4                                                                                                      |
