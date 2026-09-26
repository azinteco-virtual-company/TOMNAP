# Faz A planı — temel

**Kaynaklar:**

- Mevcut durum: [Belge 1](../audit/2026-09-mevcut-durum.md).
- Hedef: [Belge 2](tomnap-v2.md). Kararlar K1–K22 onaylandı (24 Eylül 2026): K11 değişti, K15'e ek, K8'e not.

**Faz A'nın amacı:** v2'nin üzerine kurulacağı zemin. İçeriği:

- Belge 1'deki KRİTİK düzeltmeler,
- rol kataloğu ve `ABD_SATINALMA`,
- v2 bayrağı,
- kur tablosu,
- sipariş satırları ve sipariş sahibi (durak 0),
- ödeme defteri, kurye nakdi ve kasa teslimi (durak 6'nın çekirdeği).

**Faz A'da olmayanlar:** Satın alma, eşleştirme, depo, paket, gönderi, teslimat birleştirme ve kazanç modeli. Bunlar Faz B–D'de.

**PR #2–#5'te hazır olan ve yeniden planlanmayanlar:**

- sunucu oturumu ve allowlist,
- tenant izolasyon yardımcısı,
- kurye kaydı, atama ve teslim RPC'leri,
- şifreli kargo ayarları,
- özel Storage,
- revizyonlu sayfalama,
- onboarding,
- AWB öneri + onay deseni ve `awb_match_approvals`.

Bu planda "bu deseni izle" diye atıf yapılır, yeniden yazılmaz.

**Her PR için ortak kabul ölçütleri** (CLAUDE.md):

- main'den yeni dal; her madde ayrı commit; TypeScript strict; bileşen ≤ 400 satır ve `React.lazy`.
- Her yeni rota allowlist'te ve ortak yardımcıyla tenant izolasyon testi var; test bir kez mutasyonla doğrulanmış.
- Her migration için `DROP ... IF EXISTS` içeren bir down dosyası ve `tests/sql` altında SQL testi. Up → down → up testi yapılmış.
- Sunucu kodu değiştiyse `api/` paketi ayrı commit'te yeniden derlenmiş.
- Node 22 ile `tsc` ve `npm test` yeşil; CI'daki SQL adımları yeşil.
- Migration'ları proje sahibi uygular.

## PR listesi (sırayla)

| Sıra | PR                                            | Süre    | Bağımlılık |
| ---- | --------------------------------------------- | ------- | ---------- |
| A1   | AI isteminden müşteri rehberini çıkar         | 1–2 gün | —          |
| A2   | Simülasyon korumasını testle sabitle          | 1 gün   | —          |
| A3   | v1'de tahsilatın silinmesini kapat            | 1 gün   | —          |
| A4   | Rol kataloğu: tek kaynak                      | 2 gün   | —          |
| A5   | `ABD_SATINALMA` rolü                          | 1–2 gün | A4         |
| A6   | v2 bayrağı ve iskelet                         | 1 gün   | —          |
| A7   | Kur tablosu ve v2 tenant ayarları             | 1–2 gün | A6         |
| A8   | Sipariş satırları ve sahibi: veritabanı + API | 2–3 gün | A6         |
| A9   | Sipariş satırları: arayüz ve AI               | 2 gün   | A1, A8     |
| A10  | Ödeme defteri                                 | 2–3 gün | A8         |
| A11  | Kurye nakdi ve kasa teslimi                   | 2 gün   | A10        |
| A12  | Kaçaklar panosu v0 (Q4, Q5)                   | 1 gün   | A10, A11   |

A1–A3 birbirinden ve v2'den bağımsızdır; önce yapılmaları önerilir (bkz. son bölüm).

### A1 — AI isteminden müşteri rehberini çıkar (Belge 1 KRİTİK 1)

- **Kapsam:**
  - `POST /api/ayristir-siparis` ve inbox ayrıştırması Gemini'ye yalnız mesajı ya da görseli gönderir.
  - Müşteri eşleştirme ayrıştırmadan **sonra** sunucuda yapılır: normalize telefonda tam eşleşme, adda puanlı öneri. PR #3'ün `normalizePhone` ve `nameSimilarity` fonksiyonları yeniden kullanılır.
  - Yanıttaki `eslesen_musteri_id` artık bir öneridir; insan onaylar.
- **Dosyalar:**
  - değişen: `src/server/routes/siparisler.ts` (132–160 ve yanıt işleme), `src/server/routes/inbox.ts` (istem),
  - yeni: `src/server/services/musteriOneri.ts`,
  - testler.
- **Migration:** yok.
- **Kabul ölçütleri:**
  - Gemini'ye giden istem gövdesinde (testte yakalanır) başka hiçbir müşterinin adı ya da telefonu yok.
  - Telefonla eşleşen müşteri yine öneriliyor; eşleşme yoksa "yeni müşteri".
  - Rotanın izolasyon testi var.

### A2 — Simülasyon korumasını testle sabitle (Belge 1 KRİTİK 4)

Belge 1'in düzeltmesine göre simüle sonuçların siparişe yazılması yalnız canlı kodda var. Main'de PR #2'nin koruması bunu engelliyor, ama tek rota testi sorgulanacak sipariş kurmadığı için korumaya hiç ulaşmıyor.

- **Kapsam:**
  - Koruma değişmeden testle sabitlenir: simüle sonuç (kimliksiz Aramex, DHL, UPS) hiçbir siparişi değiştirmez; `LIVE` sonuç değiştirir.
  - Koruma şu an düz bir `Error` atıyor ve rota 500 döndürüyor. Bunun yerine anlaşılır bir 409 dönmeli.
  - Takip sonucunda simülasyon açıkça etiketlenir.
- **Dosyalar:** `src/server/services/kargo/kargoMerkezi.ts` (84–160), `src/server/services/kargo/providers/aramex.ts` (118–133, 439+), `src/server/routes/kargoEntegrasyon.ts` (183), `src/components/KargoMerkeziSayfasi.tsx`, testler.
- **Migration:** yok.
- **Kabul ölçütleri:**
  - Kimlik bilgisi yokken senkronizasyon hiçbir siparişin `lojistik_durumu`'nu değiştirmez (test).
  - Sahte `fetch` ile gerçek yanıt geldiğinde durum yazılır.

### A3 — v1'de tahsilatın silinmesini kapat (Belge 1 KRİTİK 6)

- **Kapsam:**
  - Sunucu PATCH'te `alinan_tutar`'ın azaltılmasını reddeder.
  - Tek istisna `PATRON`: gerekçe zorunlu ve değişiklik `islem_gecmisi`'ne yazılır.
  - Tablodaki "BEKLIYOR" seçimi `alinan_tutar > 0` iken kapalı; artık tutarı 0'lamaz.
- **Dosyalar:** `src/server/routes/siparisler.ts` (PATCH 746–830), `src/components/SiparisTablosu.tsx` (83–95), testler.
- **Migration:** yok.
- **Kabul ölçütleri:**
  - PATRON dışındaki bir rol tutarı düşürmeye çalışınca 400/403 alır ve kayıt değişmez (test).
  - PATRON gerekçeyle düşürebilir; işlem geçmişinde görünür.

### A4 — Rol kataloğu: tek kaynak

- **Kapsam:**
  - Rol listesi, kotaların varsayılanları ve rol grupları (STAFF, SALES…) tek bir modülde toplanır: `src/shared/roller.ts`, sunucu ve istemci ortak.
  - Belge 1 §6'daki 15+ yer bu modülden türetilir.
  - SQL tarafında `tomnap_gecerli_rol(text)` fonksiyonu eklenir. Davet ve kabul RPC'leri yeni bir migration'da bu fonksiyonu kullanacak şekilde `CREATE OR REPLACE` edilir.
- **Dosyalar:** Belge 1 §6'daki listenin tamamı; yeni migration `…_rol_katalogu.sql`, down dosyası ve `tests/sql/rol-katalogu.sql`.
- **Migration:** yeni fonksiyon + iki RPC'nin yeniden tanımı. Down dosyası:
  - yeni fonksiyonu `DROP ... IF EXISTS` ile düşürür,
  - RPC'leri **önceki tanımlarına** geri yazar.
  - Yalnız bu migration'ın oluşturduğu nesneler düşürülür.
- **Kabul ölçütleri:**
  - Davranış değişmez (mevcut testler yeşil).
  - Rol dizisi başka bir dosyada elle yazılmışsa testler düşer (tarama testi).
  - SQL testi: geçersiz rol davetle reddedilir.

### A5 — `ABD_SATINALMA` rolü (K18)

- **Kapsam:**
  - Katalogda yeni rol; `PURCHASING` ve `SHIPPING` gruplarına eklenir; davet ekranında seçilebilir.
  - Kota: `firmalar.rol_limitleri`'nde anahtar yoksa RPC varsayılana düşer. Mevcut tablonun varsayılanı değiştirilmez.
  - Depo ülkesine göre kısıt (US) Faz B–C'de gelir.
- **Dosyalar:** `src/shared/roller.ts`, `src/server/middleware/auth.ts`, `src/components/DavetOlusturModal.tsx`, `src/components/YanMenu.tsx`; migration (katalog fonksiyonu + kota varsayılanı), testler.
- **Kabul ölçütleri:**
  - ABD rolüyle davet, kabul ve giriş çalışıyor; kota uygulanıyor (SQL testi).
  - Allowlist testleri yeni rolü kapsıyor; maaş ve prim rotaları (henüz yok) planda: patron herkesi, ekip üyesi yalnız kendini görür; SUPER_ADMIN hiç görmez (K15).

### A6 — v2 bayrağı ve iskelet

- **Kapsam:**
  - `isV2FlowEnabled()` (config), `FF_V2_FLOW` ve `VITE_FF_V2_FLOW` (`.env.example`).
  - `/api/v2` yönlendiricisi; bayrak kapalıyken 404.
  - İstemcide `React.lazy` ile yüklenen `/v2` kabuğu.
- **Dosyalar:** `src/server/config.ts`, `src/server/index.ts`, yeni `src/server/routes/v2/index.ts`, `src/App.tsx`, yeni `src/components/v2/V2Kabuk.tsx`, `.env.example`, testler.
- **Migration:** yok.
- **Kabul ölçütleri:**
  - Bayrak kapalıyken `/api/v2/*` 404 döner ve ilk yük paketinde v2 kodu yoktur (derleme kontrolü).
  - Bayrak açıkken kabuk yüklenir.

### A7 — Kur tablosu ve v2 tenant ayarları (K4, K8)

- **Kapsam:**
  - `kurlar` (append-only) ve `tenant_v2_ayarlari` tabloları.
  - Rotalar: `GET/POST /api/v2/kurlar`, `GET/PATCH /api/v2/ayarlar`.
  - Arayüzde kur girişi. `localStorage` kuru **henüz** kaldırılmaz; kâr Faz D'de sunucuya taşınınca kalkar.
- **Migration:**
  - `…_kurlar_ve_v2_ayarlari.sql`.
  - `kurlar`'da UPDATE, DELETE ve TRUNCATE hem REVOKE hem tetikleyiciyle engellenir (`awb_match_approvals` deseni).
  - Down dosyası ve SQL testi.
- **Kabul ölçütleri:**
  - Kur değiştirilemiyor, yalnız yenisi ekleniyor (SQL testi).
  - Rol matrisine uygun (kur girişi: PATRON, satın almacılar, BAKU_FINANS).
  - İzolasyon testi.

### A8 — Sipariş satırları ve sahibi: veritabanı + API (durak 0, K1, K2, K20)

- **Kapsam:**
  - `siparis_satirlari` tablosu; `siparisler`'e yeni kolonlar: `model_surumu`, `sahip_kullanici_id`, `musteri_id`.
  - `tomnap_v2_siparis_olustur` RPC'si başlığı ve satırları tek transaction'da yazar. Eski kolonları türetir: `toplam_tutar` = Σ satır, `lojistik_durumu = KANADA_SATINALIM_BEKLIYOR`, `finans_durumu = BEKLIYOR`.
  - Rotalar: `POST /api/v2/siparisler`, `GET /api/v2/siparisler`, `GET /api/v2/siparisler/:id`.
  - v2 siparişlerde genel `PATCH /api/siparisler/:id` ile eski türetilmiş kolonlar değiştirilemez.
- **Dosyalar:** yeni `src/server/routes/v2/siparisler.ts` ve `src/server/services/v2/siparisStore.ts`, `src/server/routes/siparisler.ts` (PATCH koruması), allowlist; migration `…_siparis_satirlari.sql`, down dosyası, SQL testi ve yarış testi.
- **Kabul ölçütleri:**
  - RPC yarıda hata verirse hiçbir satır yazılmaz (SQL testi).
  - Sahip belirtilmezse oluşturan kullanıcı olur.
  - v1 siparişler ve ekranları değişmez (mevcut testler yeşil).
  - İzolasyon testi ortak yardımcıyla ve mutasyonla doğrulanmış.

### A9 — Sipariş satırları: arayüz ve AI

- **Kapsam:**
  - v2 sipariş giriş ekranı: satırlar, sahip, müşteri önerisi.
  - AI ayrıştırması satır listesi döndürür (A1'in müşteri rehbersiz istemiyle); insan onaylar.
  - Mevcut sipariş listesinde v2 siparişler rozetle ayrılır.
- **Dosyalar:** yeni `src/components/v2/SiparisGirisi.tsx`, `src/components/v2/SatirTablosu.tsx`; `src/server/routes/siparisler.ts` (AI şeması: satırlar); testler.
- **Migration:** yok.
- **Kabul ölçütleri:**
  - Bayrak kapalıyken ekran görünmez.
  - Çok ürünlü bir mesaj birden çok satır üretir.
  - Hiçbir durumda AI'a müşteri listesi gitmez (A1 testi sürüyor).

### A10 — Ödeme defteri (durak 6, K16, K20)

- **Kapsam:**
  - `odemeler` tablosu (append-only; `kasa_teslim_id` kolonu dahil).
  - `tomnap_v2_odeme_kaydet` ve `tomnap_v2_odeme_ters_kayit` RPC'leri. İkisi de eski `alinan_tutar` ve `finans_durumu`'nu defter toplamından aynı transaction'da yazar.
  - Rotalar: `POST /api/v2/odemeler`, `POST /api/v2/odemeler/:id/ters-kayit`, `GET /api/v2/siparisler/:id/odemeler`.
  - Kasa ekranında v2 siparişler için defter görünümü.
- **Dosyalar:** yeni `src/server/routes/v2/odemeler.ts`, `src/server/services/v2/odemeStore.ts`, `src/components/v2/OdemeDefteri.tsx`; migration `…_odemeler.sql`, down dosyası, SQL testi ve yarış testi.
- **Kabul ölçütleri:**
  - UPDATE ve DELETE service_role için de engelli (SQL testi).
  - Eşzamanlı iki ödeme doğru toplanıyor (yarış testi).
  - Ters kayıt yalnız bir kez yapılabiliyor.
  - v1 siparişlere defter yazılamıyor.
  - Rol matrisi ve izolasyon testleri var.

### A11 — Kurye nakdi ve kasa teslimi (K17)

- **Kapsam:**
  - `BAKU_KURYE`, **kendisine atanmış** bir v2 sipariş için nakit tahsilatı kaydedebilir (`kaynak = TESLIMAT`, `alan_kullanici_id` = kurye). Kurye atama modeli PR #2'dendir.
  - `kasa_teslimleri` tablosu ve `tomnap_v2_kasa_teslimi` RPC'si: BAKU_FINANS ya da PATRON teslim alır; ilgili ödemeler `kasa_teslim_id` ile kapatılır.
  - Arayüzde kurye bakiyeleri.
- **Dosyalar:** `src/server/routes/v2/kasa.ts`, `src/server/services/v2/kasaStore.ts`, `src/components/v2/KuryeBakiyeleri.tsx`, `src/components/KuryeCalismaAlani.tsx` (tahsilat düğmesi); migration `…_kasa_teslimleri.sql`, down dosyası, SQL testi.
- **Kabul ölçütleri:**
  - Kasa teslimi kurye bakiyesini aşamaz.
  - Kurye başka bir kuryenin siparişine tahsilat yazamaz (test).
  - Kurye bakiyesi = Σ nakit tahsilat − Σ teslim (SQL testi).
  - İzolasyon testi.

### A12 — Kaçaklar panosu v0: Q4 ve Q5

- **Kapsam:**
  - Belge 2 §9'daki sorgulardan Faz A verisiyle hesaplanabilenler: **Q4** (teslim edildi, ödenmedi; v1 ve v2) ve **Q5** (kuryede bekleyen nakit).
  - Salt okunur SQL görünümleri ya da RPC'ler; pano iskeleti. Diğer sorgular Faz B–D'de eklenir.
- **Dosyalar:** `src/server/routes/v2/kacaklar.ts`, `src/components/v2/KacaklarPanosu.tsx`; migration (görünümler), down dosyası, SQL testi.
- **Kabul ölçütleri:**
  - Her sorgu tenant filtreli ve salt okunur.
  - Q4 teslim edilmemiş siparişi, Q5 kasaya teslim edilmiş nakdi göstermiyor (SQL testleri).
  - Rol matrisine uygun (Q4, Q5: PATRON ve BAKU_FINANS).

## 7 durak canlıya çıkmadan önce yayında ne değişmeli

- **Önce Deploy 1:** Canlıdaki kod (`90b8eae`) görselleri, kargo ayarlarını ve kullanıcı/firma değişikliklerini Vercel'in kalıcı olmayan dosya sisteminde tutuyor. Veritabanı hatasında siparişi belleğe alıp "başarılı" diyor (Belge 1 KRİTİK 2–3). Hiçbir v2 durağı bu zeminin üstüne kurulamaz. [DEPLOY_1.md](../DEPLOY_1.md) olduğu gibi uygulanmalı:
  - yedek,
  - salt okunur migration kontrolü,
  - 1–6 numaralı migration'lar,
  - `UPLOAD_STORAGE_BACKEND=supabase` ve özel bucket,
  - Production ortam değişkenleri,
  - `"main": false`'un ayrı bir commit ile kaldırılması.
- **A1 Deploy 1 ile ya da hemen ardından:** Gerçek müşteri verisi girmeden önce yayına alınmalı; müşteri rehberinin Gemini'ye gitmesi gerçek veride geri alınamaz. Simüle kargo durumlarının gerçek siparişe yazılması yalnız canlı kodda var; Deploy 1 bunu kendiliğinden kapatır, A2 de korumayı testle sabitler.
- **4,5 MB sınırı:** RELEASE_READINESS'in 4. maddesi, fatura yüklemesi (Faz B) başlamadan önce kapanmalı. Faturalar doğrudan Storage'a yüklenmeli (K22).
- **v2 migration'ları ayrı yayınlarda:** A4, A5 ve A7–A12, Deploy 1'den **sonra** ayrı yayınlarla, `FF_V2_FLOW` kapalıyken uygulanmalı. Bayrak ancak önizlemede kabul testlerinden sonra açılmalı. Her yayın DEPLOY_1'deki biçimi izlemeli: migration listesi, salt okunur kontrol, ortam değişkenleri, smoke test, geri alma.
