# Deploy 1 — canlıya çıkış listesi

Bu doküman canlıya çıkışı planlar; hiçbir şeyi kendisi yapmaz. Bu dalda hiçbir
şey deploy edilmedi ve veritabanına hiçbir migration uygulanmadı. Adımları proje
sahibi uygular (CLAUDE.md → ORTAM).

> **Kapsam uyarısı:** Deploy 1 yalnız AWB işi değildir. Canlıdaki son sürümden bu
> yana `main`'e giren **Faz 1–5 sürümü (PR #2)** de birlikte çıkar. Onun ön
> koşulları [RELEASE_READINESS.md](RELEASE_READINESS.md) içinde listeli ve bu
> listenin parçasıdır.

## a) Canlıya girecek commit'ler

**Son bilinen canlı commit: `90b8eae`** (14 Eylül 2026, _fix(auth): eradicate 3s
insert timeout…_).

- **Dayanak:** GitHub'daki `Production` ortamının son deployment kaydı bu commit'e ait. Aynı commit 21 Eylül 2026'da 17:05 ve 17:20 UTC'de production'a yeniden deploy edilmiş.
- **main neden yayında değil:** `main` o günden beri 9 commit ilerledi, ama `vercel.json` → `git.deploymentEnabled.main: false` (`04df177`) main push'larının deploy edilmesini engelliyor.
- ⚠️ **Doğrulanmadı:** Vercel panosunun kendisi okunmadı. Panodaki Production deployment'ının commit'i `90b8eae` değilse bu liste yeniden çıkarılmalı.

Canlıya girecek aralık: `90b8eae..` bu dalın ucu. Bu dokümanın commit'i ve sonrası da aralığa dahil.

**PR #2 — Faz 1–5 (main'de, canlıda değil), 9 commit:**

| Commit    | Konu                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| `a5fb15a` | fix(security): harden activation and image handling with isolated regression tests |
| `fbb208d` | fix(security): enforce server sessions and tenant authorization                    |
| `49ec3cb` | fix(persistence): make onboarding inbox and order maintenance atomic               |
| `a929b24` | fix(security): protect cargo credentials and bind courier access                   |
| `d7f920f` | fix(reliability): paginate complete lists and persist private images               |
| `849f73a` | fix(release): keep server artifacts out of the public web root                     |
| `204f060` | fix(migrations): provision couriers for legacy database schemas                    |
| `04df177` | chore(release): hold production deployment until data migration is ready           |
| `5a02836` | Merge pull request #2 (codex/release-phases-1-5)                                   |

**PR #3 — AWB manifest eşleştirmesi insan onayına bağlandı (`fix/awb-manifest-review`), 19 commit:**
`76856ec` `f04ab76` `c4eb4c9` `10bea21` `dbacd94` `3d791d9` `6cce39d` `794ec76`
`fc17034` `59575d7` `ea91e65` `28a0794` `d7a6261` `eddf0e3` `24aa600` `c3f36ca`
`0b93d31` `d1d74d6` `c770f92`.

**Bu PR — dağıtım sınırı (`chore/deploy-boundary`, PR #3'ün üstünde):**

| Commit    | Konu                                                                  |
| --------- | --------------------------------------------------------------------- |
| `5d5ebb9` | test(kargo): pin the strong phone rule to exact normalized matches    |
| `7228082` | build: pin Node 22 with .nvmrc and engine-strict; drop stale bun.lock |
| `64d2bf5` | feat(vercel): send security headers for static paths                  |
| `27be29d` | fix(auth): accept HEAD on public read endpoints (O-17)                |
| `b3a4f09` | build(api): rebuild Vercel bundle for public HEAD requests            |
| `4446c27` | fix(server): trust X-Forwarded-For only behind Vercel                 |
| `5b85c1c` | build(api): rebuild Vercel bundle for the trust proxy boundary        |
| `12ba9d5` | fix(client): run the console.error override only in development       |
| `3c1520c` | fix(pwa): brand the web manifest as TOMNAP and emit one manifest link |
| `ce576cd` | fix(vercel): route by req.url, never by X-Forwarded-Uri               |
| `10f51ef` | build(api): rebuild Vercel bundle without X-Forwarded-Uri routing     |
| `6ddcb88` | docs: mark Docker as unsupported and name Vercel as the deploy path   |

**Sonra `main`'e girenler — Faz A (PR #5–#23, 25 Eylül 2026'ya kadar):** `main`'den yapılacak bir
Deploy 1 bunları da taşır. İki gruba ayrılır:

- **Bayraksız çalışanlar (hata düzeltmeleri ve rol kataloğu):**
  - A1: AI'a müşteri rehberi gitmiyor.
  - A2: simüle kargo durumları gerçek siparişe yazılmıyor.
  - A3: tahsilatı yalnız PATRON düşürebiliyor.
  - A4–A5: tek rol kataloğu ve `ABD_SATINALMA` rolü; `ABD_SATINALMA` daveti için 7 ve 8 numaralı migration'lar gerekir.
  - #15: `ABD_SATINALMA` kurye atamaz, prim oranı yalnız PATRON'da, müşteri listesi doğrusal.
  - #19: veritabanı yedeği geri yüklenebiliyor.
  - #18: yalnız test altyapısı.
- **Bayrağın (`FF_V2_FLOW` + `VITE_FF_V2_FLOW`) arkasındakiler:**
  - A6–A12, A9b: `/v2` kabuğu, kurlar, v2 siparişi ve satırları, ödeme defteri, kurye nakdi ve kasa, kaçaklar panosu.
  - Bayrak kapalıyken `/api/v2` her istekte 404 döner ve `/v2` kabuğu pakete girmez.
  - Bu işlerin migration'ları (9–15) yalnız bu akış için gerekir. Bayrak kapalıyken uygulanmaları mevcut akışı değiştirmez (yeni nesneler; 10 numara `siparisler`'e varsayılanlı iki kolon ekler).

## b) Production'a uygulanacak migration'lar

**Uzak migration geçmişi OKUNAMADI; tahmin yapılmadı.** Bu dal hazırlanırken:

- veritabanı parolası ya da erişim token'ı yoktu,
- Supabase CLI projeye bağlı değildi (`supabase/.temp` altında proje ref'i yok),
- oturumun güvenlik kuralları production okumasına izin vermedi.

Aşağıdaki "uzakta?" sütunu, uygulamadan önce aşağıdaki salt okunur sorguyla doldurulmalı. Yalnız bir tarihî not olarak: [RELEASE_READINESS.md](RELEASE_READINESS.md) 21 Eylül itibarıyla faz migration'larının canlıya uygulanmadığını yazıyor. Bu bir kontrol sonucu değildir.

Repodaki migration'ların **hepsi** `90b8eae`'den sonra geldi; canlı kodda hiçbiri yok. Uygulama sırası dosya adındaki zaman damgasıdır:

| #   | Dosya (`supabase/migrations/`)                                            | Getiren   | İmza nesnesi                               | Down dosyası | Tekrar çalıştırılabilir mi | Uzakta?   |
| --- | ------------------------------------------------------------------------- | --------- | ------------------------------------------ | ------------ | -------------------------- | --------- |
| 1   | `20260917151255_server_sessions_and_private_tables.sql`                   | `fbb208d` | `public.oturumlar`                         | **yok**      | evet (`IF NOT EXISTS`)     | okunamadı |
| 2   | `20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql` | `49ec3cb` | `public.onboarding_email_jobs`             | **yok**      | **hayır**                  | okunamadı |
| 3   | `20260917170053_secure_cargo_couriers_and_legacy_uploads.sql`             | `a929b24` | `public.cargo_settings`                    | **yok**      | **hayır**                  | okunamadı |
| 4   | `20260917174218_consistent_lists_and_private_storage.sql`                 | `d7f920f` | `public.list_revisions`                    | **yok**      | **hayır**                  | okunamadı |
| 5   | `20260923023659_awb_match_confirmation.sql`                               | `f04ab76` | `tomnap_confirm_awb_matches()`             | var          | evet (`OR REPLACE`)        | okunamadı |
| 6   | `20260923164650_awb_match_approvals.sql`                                  | `59575d7` | `public.awb_match_approvals`               | var          | **hayır**                  | okunamadı |
| 7   | `20260924120000_rol_katalogu.sql` (A4)                                    | PR #11    | `tomnap_gecerli_rol()`                     | var          | **hayır**                  | okunamadı |
| 8   | `20260924130000_abd_satinalma.sql` (A5)                                   | PR #12    | `tomnap_rol_kota_varsayilani()`            | var          | **hayır**                  | okunamadı |
| 9   | `20260924140000_kurlar_ve_v2_ayarlari.sql` (A7)                           | PR #14    | `public.kurlar`                            | var          | **hayır**                  | okunamadı |
| 10  | `20260924150000_siparis_satirlari.sql` (A8)                               | PR #16    | `public.siparis_satirlari`                 | var          | **hayır**                  | okunamadı |
| 11  | `20260925100000_siparis_sahibi_kurali.sql` (O-24)                         | PR #19    | `tomnap_v2_siparis_olustur()` gövdesi      | var          | evet (`OR REPLACE`)        | okunamadı |
| 12  | `20260925110000_odemeler.sql` (A10)                                       | PR #20    | `public.odemeler`                          | var          | **hayır**                  | okunamadı |
| 13  | `20260925120000_kasa_teslimleri.sql` (A11)                                | PR #21    | `public.kasa_teslimleri`                   | var          | **hayır**                  | okunamadı |
| 14  | `20260925130000_kacaklar.sql` (A12)                                       | PR #22    | `tomnap_v2_kacak_q4()`                     | var          | **hayır**                  | okunamadı |
| 15  | `20260925140000_para_yazma_yetkisi.sql` (SUPER_ADMIN para yazmaz)         | PR #25    | 3 fonksiyon gövdesi (`para-yazma-yetkisi`) | var          | evet (`OR REPLACE`)        | okunamadı |
| 16  | `20260925150000_siparis_guncelle.sql` (v1 düzenleme, Codex R3 F1/F2)      | PR #27    | `tomnap_siparis_guncelle()`                | var          | **hayır**                  | okunamadı |
| 17  | `20260925160000_not_sozlesmesi.sql` (not sözleşmesi, Codex R3 F8)         | PR #29    | `tomnap_v2_siparis_olustur()` gövdesi      | var          | evet (`OR REPLACE`)        | okunamadı |
| 18  | `20260926100000_odeme_islem_anahtari.sql` (işlem anahtarı, Codex R3 F15)  | PR #30    | `tomnap_v2_odeme_kaydet()` gövdesi         | var          | **hayır**                  | okunamadı |

Toplam 18 migration. 7–18'in her biri CI'da `up → down → down → up` ile sınanıyor.

- **16 Deploy 1 ile gider:** Sipariş düzenleme rotası (`PATCH /api/siparisler/:id`) 16'nın fonksiyonunu çağırıyor. Bu yüzden 16, 1–6 ile birlikte ve yeni koddan **önce** uygulanır. 7–15'e bağlı değil.

⚠️ Dikkat edilecekler:

- **7–15, 17 ve 18 ne zaman:** faz-a-plan'a göre Deploy 1'den **sonra**, `FF_V2_FLOW` kapalıyken, ayrı yayınlarla. 7 ve 8, Deploy 1'deki kodun `ABD_SATINALMA` davetini açar; yoksa bu davet 409 ile reddedilir, diğer roller etkilenmez. 9–15 yalnız v2 akışı içindir.
- **17 v2 ile gider:** 7–15 ile birlikte, 11'den sonra. 11'in fonksiyonunu değiştirir: v2 sipariş notu artık fiziksel bir `ozel_not` kolonuna değil, v1 gibi `baku_tahsilat_notu`'daki `[TƏLİMAT: …]` etiketine yazılır (hiçbir migration `ozel_not` kolonu oluşturmuyor; kolonsuz şemada v2 siparişi hiç oluşturulamıyordu). 11 herhangi bir nedenle yeniden uygulanırsa 17 de ardından yeniden uygulanır.
- **18 v2 ile gider:** 12, 13 ve 15'ten sonra, en son. `odemeler`'e yeni bir kolon (`islem_anahtari`, var olan satırlarda boş) ve kiracı başına benzersiz bir indeks ekler; ödeme kaydı ve yeni beş argümanlı kurye tahsilatı aynı anahtarla gelen tekrarı yeni kayıt yazmadan ilk ödemeyle yanıtlar. v2 ödeme ve kurye ekranları her zaman anahtar gönderir: 18 olmadan kurye tahsilatı çalışmaz. 15 yeniden uygulanırsa 18 de ardından yeniden uygulanır.
- **7–15 arası bağımlılık:** 11, 10'un fonksiyonunu değiştirir; 12, 10'un v2 siparişlerine bağlanır; 13, 12'ye ve 3'teki `kuryeler`'e; 14'ün Q5'i 13'ün bakiye fonksiyonunu çağırır; 15, 12 ve 13'ün üç yazma fonksiyonunu değiştirir (SUPER_ADMIN ödeme kaydı, ters kayıt ve kasa teslimi yazamaz). Sırayı bozmayın.
- **2, 3, 4, 6, 7, 8, 9, 10, 12, 13 ve 14 kısmen uygulanmışsa yeniden çalıştırılamaz:** `CREATE FUNCTION` / `CREATE TABLE` komutları `OR REPLACE` ya da `IF NOT EXISTS` içermiyor. Önce imza kontrolünü yapın; imzası var olan migration'ı yeniden çalıştırmayın.
- **1–4'ün down dosyası yok.** Veritabanında geri dönüş ancak yedekten yapılabilir; uygulamadan önce yedek alın.
- **Beklenmedik migration:** `schema_migrations` tablosunda bu on sekiz sürümden başka bir kayıt görürseniz durun ve raporlayın. Bu, repoda olmayan bir değişikliğin uzakta uygulandığı anlamına gelir.

### Salt okunur kontrol (Supabase SQL Editor ya da `psql`)

```sql
-- Salt okunur: yalnız sistem kataloğu okunur, hiçbir şey değiştirilmez.
select m.sira, m.dosya, m.imza,
  case m.tur
    when 'tablo' then to_regclass(m.imza) is not null
    when 'fonksiyon' then exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = m.imza)
    -- 'govde': yalnız fonksiyon gövdesini değiştiren migration; imza "fonksiyon:metin".
    when 'govde' then exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = split_part(m.imza, ':', 1)
        and p.prosrc like '%' || split_part(m.imza, ':', 2) || '%')
  end as nesne_var
from (values
  (1, '20260917151255_server_sessions_and_private_tables.sql', 'tablo', 'public.oturumlar'),
  (2, '20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql', 'tablo', 'public.onboarding_email_jobs'),
  (3, '20260917170053_secure_cargo_couriers_and_legacy_uploads.sql', 'tablo', 'public.cargo_settings'),
  (4, '20260917174218_consistent_lists_and_private_storage.sql', 'tablo', 'public.list_revisions'),
  (5, '20260923023659_awb_match_confirmation.sql', 'fonksiyon', 'tomnap_confirm_awb_matches'),
  (6, '20260923164650_awb_match_approvals.sql', 'tablo', 'public.awb_match_approvals'),
  (7, '20260924120000_rol_katalogu.sql', 'fonksiyon', 'tomnap_gecerli_rol'),
  (8, '20260924130000_abd_satinalma.sql', 'fonksiyon', 'tomnap_rol_kota_varsayilani'),
  (9, '20260924140000_kurlar_ve_v2_ayarlari.sql', 'tablo', 'public.kurlar'),
  (10, '20260924150000_siparis_satirlari.sql', 'tablo', 'public.siparis_satirlari'),
  (11, '20260925100000_siparis_sahibi_kurali.sql', 'govde', 'tomnap_v2_siparis_olustur:must name the order owner'),
  (12, '20260925110000_odemeler.sql', 'tablo', 'public.odemeler'),
  (13, '20260925120000_kasa_teslimleri.sql', 'tablo', 'public.kasa_teslimleri'),
  (14, '20260925130000_kacaklar.sql', 'fonksiyon', 'tomnap_v2_kacak_q4'),
  (15, '20260925140000_para_yazma_yetkisi.sql', 'govde', 'tomnap_v2_odeme_kaydet:para-yazma-yetkisi'),
  (16, '20260925150000_siparis_guncelle.sql', 'fonksiyon', 'tomnap_siparis_guncelle'),
  (17, '20260925160000_not_sozlesmesi.sql', 'govde', 'tomnap_v2_siparis_olustur:Codex R3 F8'),
  (18, '20260926100000_odeme_islem_anahtari.sql', 'govde', 'tomnap_v2_odeme_kaydet:Codex R3 F15')
) as m(sira, dosya, tur, imza)
order by m.sira;

-- Ön koşul kolonları: hiçbir migration'ın oluşturmadığı (eski temel şemadan gelen), kodun
-- okuyup yazdığı siparisler kolonları. 'gerekli' ya da 'v2 için gerekli' satırlarından biri
-- false ise durun: sipariş yazma o kolonda hata verir. Sipariş notu baku_tahsilat_notu'ndadır
-- (Codex R3 F8).
select k.kolon, k.gerekli,
  exists (select 1 from pg_catalog.pg_attribute a
          where a.attrelid = to_regclass('public.siparisler') and a.attname = k.kolon
            and a.attnum > 0 and not a.attisdropped) as var
from (values
  ('id', 'gerekli'), ('tenant_id', 'gerekli'), ('olusturma_tarihi', 'gerekli'),
  ('ham_mesaj', 'gerekli'), ('siparis_kaynagi', 'gerekli'), ('musteri_adi', 'gerekli'),
  ('instagram_kullanici_adi', 'gerekli'), ('telefon_numarasi', 'gerekli'),
  ('teslimat_sehri', 'gerekli'), ('teslimat_adresi', 'gerekli'), ('urun_aciklamasi', 'gerekli'),
  ('beden_veya_olcu', 'gerekli'), ('renk', 'gerekli'), ('adet', 'gerekli'),
  ('toplam_tutar', 'gerekli'), ('alinan_tutar', 'gerekli'), ('kalan_tutar', 'gerekli'),
  ('para_birimi', 'gerekli'), ('finans_durumu', 'gerekli'), ('lojistik_durumu', 'gerekli'),
  ('baku_kurye_id', 'gerekli'), ('baku_kurye_adi', 'gerekli'), ('baku_kurye_bolgesi', 'gerekli'),
  ('teslim_tarihi', 'gerekli'), ('teslim_eden_kisi', 'gerekli'), ('baku_tahsilat_notu', 'gerekli'),
  ('kanada_takip_kodu', 'gerekli'), ('uluslararasi_kargo_kodu', 'gerekli'),
  ('eksik_bilgiler', 'gerekli'), ('ai_guven_skoru', 'gerekli'), ('is_demo', 'gerekli'),
  -- v2 ödeme tetikleyicisi (12), kaçaklar Q4 (14) ve v2 defter okuması (Codex R4 F21) bu
  -- kolonu şart koşar; hepsi plpgsql, eksikliği ancak çalışırken görülür. 26 Eylül: canlıda var.
  ('guncellenme_tarihi', 'v2 için gerekli'),
  -- Yoksa da çalışır (canlıda yok): fiziksel not yalnız etiket yokken okunur.
  ('ozel_not', 'isteğe bağlı')
) as k(kolon, gerekli)
order by k.gerekli, k.kolon;

select to_regclass('supabase_migrations.schema_migrations') is not null as gecmis_tablosu_var;
-- Yalnız yukarıdaki true ise:
-- select version, name from supabase_migrations.schema_migrations order by version;
```

`psql` ile bir salt okunur transaction içinde çalıştırmak için sorguyu bir dosyaya kaydedin ve:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "begin transaction read only" -f migration-durumu.sql -c "rollback"
```

Sorgu 25 Eylül'de, CI şemasının kurulu olduğu yerel bir veritabanında denendi: 15 satırın hepsi `true` döndü; 11'in ya da 15'in down dosyası bir transaction içinde uygulanınca yalnız o satır `false` oldu. 26 Eylül'de 17 satırla yeniden denendi: hepsi `true`; 17'nin down dosyası uygulanınca yalnız 17 `false` oldu. 18 satırla da denendi: hepsi `true`; 18'in down dosyası uygulanınca yalnız 18 `false` oldu. Ön koşul sorgusu aynı veritabanında 33 kolonun hepsi için `true` döndü. Canlıda (26 Eylül) `guncellenme_tarihi` var, `ozel_not` yok. CI bu sorguyu `ozel_not` kolonu olmayan ikinci bir veritabanında da çalıştırır; orada yalnız `ozel_not` satırı `false` olabilir.

SQL Editor'da elle uygulanan migration'lar `schema_migrations` tablosuna yazılmaz. Bu yüzden asıl ölçü imza nesnesinin varlığıdır.

### Uygulama

Eksik olanlar sırayla, her dosya tek transaction olarak uygulanır (CI ile aynı biçim):

```bash
psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/<dosya>.sql
```

- **Sıra:** CI zinciri yalnız 1→6 sırasını sınıyor. 5 ve 6, 1–4'ün nesnelerine adıyla başvurmuyor; ama 1–4 olmadan uygulanmaları hiç sınanmadı. Sırayı bozmayın.
- **Eski canlı sürümle uyumluluk:** Migration 1, mevcut tabloların tümünde `anon` ve `authenticated` yetkilerini kaldırır. Eski canlı sürüm (`90b8eae`) sunucuda `SUPABASE_SERVICE_ROLE_KEY` yoksa `SUPABASE_ANON_KEY` ile bağlanır (`src/server/config.ts`). Production'da yalnız anon anahtar tanımlıysa, migration'lar uygulandığı anda eski sürüm veriye erişemez ([RELEASE_READINESS.md](RELEASE_READINESS.md) madde 2 de eski sürümün anonim erişime dayandığını yazıyor). Vercel Production ortamında hangi anahtarın tanımlı olduğuna bakın. Migration'lar ile kod deploy'u arasındaki süreyi kısa tutun.

## c) Vercel ortam değişkenleri

Vercel'de değişkenler yalnız **yeni bir deployment** ile etkili olur. `VITE_` ile başlayanlar ayrıca **derleme zamanında** istemci paketine gömülür: değiştirildiklerinde yeniden derleme gerekir ve tarayıcıya açıktırlar, sır içeremezler.

| Değişken                         | Okunduğu yer                | Deploy 1 için                                                                                                                                                                               |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                   | sunucu, çalışma zamanı      | zorunlu                                                                                                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`      | sunucu, çalışma zamanı      | zorunlu, sır; asla `VITE_` önekiyle verilmez                                                                                                                                                |
| `APP_URL`                        | sunucu, çalışma zamanı      | zorunlu: canlı HTTPS adresi (CORS ve e-posta bağlantıları); boşsa `https://tomnap.com` varsayılır                                                                                           |
| `UPLOAD_STORAGE_BACKEND`         | sunucu, çalışma zamanı      | zorunlu: `supabase`; Vercel'de `local` reddedilir                                                                                                                                           |
| `CARGO_ENCRYPTION_KEYS`          | sunucu, çalışma zamanı      | kargo kimlik bilgileri için zorunlu, sır ([PHASE4_SECURITY.md](PHASE4_SECURITY.md))                                                                                                         |
| `CARGO_ENCRYPTION_ACTIVE_KEY_ID` | sunucu, çalışma zamanı      | yukarıdakiyle birlikte zorunlu                                                                                                                                                              |
| `RESEND_API_KEY`                 | sunucu, çalışma zamanı      | production'da davet e-postası için zorunlu, sır                                                                                                                                             |
| `EMAIL_FROM`                     | sunucu, çalışma zamanı      | isteğe bağlı                                                                                                                                                                                |
| `GEMINI_API_KEY`                 | sunucu, çalışma zamanı      | yapay zeka özellikleri için, sır                                                                                                                                                            |
| `CORS_ORIGIN`                    | sunucu, çalışma zamanı      | isteğe bağlı ek origin'ler; `APP_URL` her zaman kabul edilir                                                                                                                                |
| `LOG_LEVEL`                      | sunucu, çalışma zamanı      | isteğe bağlı (varsayılan `info`)                                                                                                                                                            |
| `FF_AWB_REVIEW`                  | sunucu, çalışma zamanı      | **Bu yayında KAPALI** (karar 26 Eylül 2026). v1 siparişleri açılışta yapay AWB aldığı için (Codex R3 F3) inceleme gerçek eşleşmeleri zaten engelliyor. F3, F4, F5 ve F7 durak 4 işine kaldı |
| `VITE_FF_AWB_REVIEW`             | **istemci, derleme zamanı** | **Bu yayında KAPALI**; `FF_AWB_REVIEW` ile aynı değer                                                                                                                                       |
| `FF_V2_FLOW`                     | sunucu, çalışma zamanı      | **Karar: önce yalnız Preview'da `true`**; Production'da boş, açma kararı proje sahibinde. Yalnız tam olarak `true` açar; kapalıyken `/api/v2` her istekte 404                               |
| `VITE_FF_V2_FLOW`                | **istemci, derleme zamanı** | `FF_V2_FLOW` ile aynı: yalnız Preview; Production'da boş. Açıkken `/v2` kabuğu ve kurye nakdi bölümü ayrı parça olarak derlenir                                                             |

**Yeni kodun kullanmadığı değişkenler:**

- `SUPABASE_ANON_KEY`: Yeni kod hiç okumuyor. Ancak eski sürüme dönüş ihtimali için Deploy 1 kararlı hale gelene kadar silmeyin.
- `API_SECRET_KEY`: HTTP kimlik doğrulamasında kullanılmıyor; yalnız eski kargo anahtarı geçiş CLI'ı içindir.
- `TOMNAP_ADMIN_*`: yalnız yerel `npm run admin:bootstrap` içindir.
- `DATA_DIR`, `UPLOADS_DIR`: yalnız yerel geliştirme içindir.

Vercel'in kendi değişkenleri: `NODE_ENV=production` ve `VERCEL` Vercel tarafından verilir. `VERCEL`'in çalışma zamanında görünmesi için "Automatically expose System Environment Variables" ayarı açık kalmalı. Node sürümü `package.json` → `engines.node: 22.x` ile belirlenir.

## d) Deploy sonrası 10 dakikalık smoke test

`<canli>` yerine canlı adresi koyun. Adımlar veritabanına yazmaz; yalnız 4. adımdaki giriş bir oturum kaydı oluşturur.

1. **Statik güvenlik başlıkları (0–1. dk):**
   ```bash
   curl -sI https://<canli>/
   ```
   200 dönmeli ve şu başlıklar bulunmalı: `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()`, ayrıca Vercel'in `strict-transport-security` başlığı.
2. **Sağlık uç noktası, GET ve HEAD (1–2. dk):**
   ```bash
   curl -s https://<canli>/api/health
   ```
   ```bash
   curl -sI https://<canli>/api/health
   ```
   İlki `{"basarili":true}` dönmeli; ikisi de 200 olmalı.
3. **Tek manifest bağlantısı ve TOMNAP markası (2–3. dk):**
   ```bash
   curl -s https://<canli>/ | grep -c 'rel="manifest"'
   ```
   ```bash
   curl -s https://<canli>/manifest.webmanifest
   ```
   İlki `1` yazmalı; ikincisinde `"short_name":"TOMNAP"` görünmeli.
4. **Tarayıcıda giriş (3–6. dk):** Demo hesapla giriş yapın; sipariş listesi ve müşteri listesi açılmalı. Tarayıcı konsolunda hata olmamalı. Sonra çıkış yapın.
5. **Oturumsuz API reddi (6–7. dk):**
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<canli>/api/siparisler
   ```
   `401` dönmeli.
6. **X-Forwarded-Uri yok sayılıyor (7–8. dk):**
   ```bash
   curl -s -H 'X-Forwarded-Uri: /api/sistem-durum' https://<canli>/api/health
   ```
   `{"basarili":true}` dönmeli, 401 değil.
7. **AWB bayrağı kapalı (8–9. dk):** Kargo ekranında manifest yüklemek yalnız ayrıştırma sonucunu göstermeli. AWB atama ya da inceleme paneli görünmemeli.
   v2 bayrağı da kapalı olmalı:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<canli>/api/v2/durum
   ```
   `404` dönmeli (oturumsuz da, oturumlu da).
8. **Hata kaydı (9–10. dk):** Vercel → Logs, son 10 dakika: 5xx ya da yakalanmamış hata olmamalı.

Production'da **denenmeyecekler:**

- **Giriş limiti:** Denerseniz o IP'den girişi 15 dakika kilitler.
- **AWB onayı:** Demo verisine kalıcı AWB yazar; bayrak açılırsa ayrı bir karar olarak yapılır.

## d2) v2'yi önce Preview'da açma

Ayrı bir staging yok. Preview'a verilen veritabanı değişkenleri **aynı Supabase projesini** gösterir. İçindeki verinin tamamı demo verisidir (CLAUDE.md → ORTAM). Preview'da yapılan her v2 işlemi bu veritabanına yazar. Defterler (ödeme, kasa teslimi) append-only olduğu için yazılanlar silinemez.

1. **Migration'lar (bayrak her yerde kapalı):**
   - Yedek alın.
   - (b)'deki salt okunur kontrolü çalıştırın.
   - Eksik olanları 7–15, 17 ve 18 sırasıyla (dosya adı sırası) uygulayın.
   - Kontrolü yeniden çalıştırın; 18 migration satırının hepsi `true` olmalı.
2. **Değişkenleri yalnız tek bir dalın Preview'ına verin (26 Eylül'de düzeltildi):** Vercel'deki değişkenlerin hepsi yalnız Production'da; Preview'da hiç değişken yok, yani bir Preview veritabanına bağlanamaz. Tüm Preview'a vermek her PR önizlemesine veritabanı anahtarı verir. Bu yüzden Vercel → Settings → Environment Variables → **Preview → belirli dal: `v2-deneme`**:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPLOAD_STORAGE_BACKEND`, `CARGO_ENCRYPTION_KEYS`, `CARGO_ENCRYPTION_ACTIVE_KEY_ID`, `GEMINI_API_KEY`: Production'dakiyle aynı değer. Kilitli (sensitive) değerler Vercel'de okunamaz; kaynağından (Supabase → API ayarları vb.) girilir.
   - `APP_URL`: dalın sabit Preview adresi (`https://<proje>-git-v2-deneme-<ekip>.vercel.app`). Sunucu, izin verilen origin'den gelmeyen her yazma isteğini (giriş dahil) 403 ile reddeder (`src/server/middleware/auth.ts`); Production'daki `APP_URL` Preview adresini kapsamaz.
   - `FF_V2_FLOW=true`, `VITE_FF_V2_FLOW=true`.
   - Production'da iki bayrak boş kalır.
3. **Preview deployment'ı:** `main`, `v2-deneme` dalına push edilir; o dalın Preview deployment'ı (dal adresi) kullanılır. `--prod` yok. `VITE_` bayrağı derleme zamanında okunduğu için değişkenler girildikten sonraki bir derleme gerekir. Vercel'in önizleme koruması (Deployment Protection) açıksa adres Vercel girişi ister; API denemeleri tarayıcıdan yapılır.
4. **Production kapalı mı:**
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<canli>/api/v2/durum
   ```
   `404` dönmeli.
5. **Preview'da deneme** (demo hesaplarla; `/v2` adresi elle açılır, menüde bağlantı yok):
   - **Kabuk:** PATRON ile `/v2`: sekmeler "Sifarişlər", "Kassa", "Qaçaqlar", "Kurlar", "Ayarlar". SATIS_SORUMLUSU: "Sifarişlər" ve "Kassa". KANADA_SATINALMA: "Sifarişlər" ve "Kurlar".
   - **Sipariş:** Mesajdan ve bir ekran görüntüsünden öneri alın. Satırları düzeltip kaydedin. SUPER_ADMIN sahip seçmeden kaydedemez. Mevcut sipariş tablosunda sipariş "v2" rozetiyle görünür.
   - **Kassa:** Siparişe butik ödemesi yazın, sonra gerekçeyle ters kayıt yapın. Mevcut listede `alinan_tutar` ve ödeme durumu aynı anda değişmeli.
   - **Kurye nakdi:** Kurye kaydına bağlı bir kuryeye v2 sipariş atayın. Sipariş kargo takibinde `BAKU_DAGITIM_ARKADAS` durumuna geçmiş olmalı. Kurye ekranındaki "Üzərimdə olan nağd pul" bölümünden nakit yazın. "Kassa"da kurye bakiyesini görüp teslim alın; bakiye 0 olmalı.
   - **Qaçaqlar:** Q4'te teslim edilmiş ama ödenmemiş siparişler, Q5'te kuryede 24 saatten uzun bekleyen nakit görünür.
   - **Ret:** SATIS_SORUMLUSU `GET /api/v2/kasa/kurye-bakiyeleri` → 403; kurye başka bir kuryenin siparişine nakit yazamaz.
   - **SUPER_ADMIN yalnız okur:** Defteri, kurye bakiyelerini ve kaçakları görür. Ödeme formu ve "Təhvil al" düğmesi görünmez; `POST /api/v2/odemeler` ve `POST /api/v2/kasa/teslimler` → 403.
   - **Kayıtlar:** Vercel → Logs, Preview: 5xx olmamalı.
6. **Bayrağı kapatarak geri çekme:** Preview'da `FF_V2_FLOW` boşaltılıp yeniden deploy edilince `/api/v2` 404 döner ve `/v2` "aktiv deyil" gösterir. `VITE_FF_V2_FLOW` yeniden derlemeyle kalkar. Yazılmış v2 verisi yerinde kalır; mevcut ekranlar v2 siparişini rozetle göstermeye devam eder.
7. **Production'a açma (karar 25 Eylül 2026):** v2 yayında önce **yalnız Preview**'da açılır. Production'da açma kararını proje sahibi sonra verir; o zamana kadar iki değişken Production'da boş kalır. Açılacağı zaman aynı iki değişken Production'a girilir ve `main` yeniden deploy edilir.

## e) Geri alma

**Hedef (Codex R3 F16): yeni kodun bayrakları kapalı sürümü.** Bir sorun çıkarsa önce bayraklar kapatılır ve yeni kod bayraksız yeniden deploy edilir. Eski bir sürüme (`90b8eae` ya da `5a02836`, bkz. f) dönmek **yalnız** aşağıdaki kontrol v2 verisi olmadığını gösterirse yapılır.

- **Eski sürümde v2 verisinin sorunu:** Eski kod v2 siparişini (`model_surumu = 2`) tanımaz. Siparişi okuyup tamamını geri yazar (F1/F2'deki eski davranış). Bu yazma, satırlardan türetilen toplamları ve defterin tuttuğu `alinan_tutar`'ı ezer.
- **Paylaşılan veritabanı:** Preview de aynı veritabanını kullanır. Bu yüzden v2 yalnız Preview'da açılmış olsa bile veri oluşur.
- **Sıra (Codex R4):** önce yazanlar durdurulur (1), sonra v2 verisi sayılır (2), eski koda en son dönülür (3). Sayım yazanlar açıkken yapılırsa, sayım ile dönüş arasında yazılan bir v2 kaydı eski kodun eline geçer.

**1. Yazanları durdur:**

1. Vercel → Settings → Environment Variables: `FF_V2_FLOW`, `VITE_FF_V2_FLOW`, `FF_AWB_REVIEW`, `VITE_FF_AWB_REVIEW` Production'da ve Preview'da boşaltılır.
2. (d2)'de `v2-deneme` dalına verilen Preview değişkenlerinin **hepsi** silinir (veritabanı anahtarları dahil): o dalın yeni bir derlemesi veritabanına hiç bağlanamaz.
3. Yeni kodun son Production deployment'ı yeniden deploy edilir. `VITE_` bayrakları derlemede okunduğu için derleme önbelleği kullanılmaz.
4. **Eski Preview deployment'ları:** Bir deployment'ın değişkenleri derlendiği anda sabitlenir; değişken silmek çalışan eski deployment'ları kapatmaz. Vercel → Deployments'ta `v2-deneme` dalının (ve v2 bayrağıyla derlenmiş her Preview'ın) deployment'ları silinir. Silinen adres 404 vermeli: `curl -s -o /dev/null -w '%{http_code}\n' <preview-adresi>/api/health`.
5. Production'da `/api/v2/durum` 404 dönmeli. Sürmekte olan istekler için 5 dakika beklenir (fonksiyonların en uzun süresi).

**2. v2 verisi var mı (salt okunur; 1'den sonra, 3'ten hemen önce):**

```sql
-- Salt okunur: v2 verisi var mı? Tablo yoksa 0; sorgu yalnız okur.
select t.tablo,
  case when to_regclass(t.tablo) is null then 0
       else (xpath('/row/n/text()', query_to_xml(
              'select count(*) as n from ' || t.tablo || coalesce(' where ' || t.kosul, ''),
              false, true, '')))[1]::text::bigint
  end as satir
from (values
  ('public.siparisler', 'to_jsonb(siparisler) ->> ''model_surumu'' = ''2'''),
  ('public.siparis_satirlari', null),
  ('public.odemeler', null),
  ('public.kasa_teslimleri', null),
  ('public.kurlar', null),
  ('public.tenant_v2_ayarlari', null)
) as t(tablo, kosul);
```

Tüm satırlar `0` ise eski sürüme dönülebilir; değilse dönülmez, düzeltme yeni kod üzerinde yapılır. Sorgu 26 Eylül'de yerel CI şemasında denendi: v2 siparişi, satırı ve ödemesi olan veritabanında o üç satır `1` döndü; tablo yoksa `0` döner.

**3. Eski koda dönüş (en son):** Sorun bayrak arkasında değilse, yani yeni kodun kendisindeyse, ve 2'deki kontrol tümüyle `0` ise: Vercel → Deployments → eski production deployment'ı → **Instant Rollback** (`vercel rollback <url>`). 2 ile 3 arasında 1'deki hiçbir adım geri alınmaz. (a) durumunda buna ek olarak Production'da `SUPABASE_SERVICE_ROLE_KEY` tanımlı olmalıdır: eski sürüm bu anahtar yoksa anon anahtara düşer, migration 1 de anon erişimini kapatır.

**4. Veritabanı — tek sıra (Codex R3 F17):** Önce 1–3. Sonra down dosyaları **yalnız bu sırayla**, yeniden eskiye, her biri tek transaction olarak uygulanır:

```bash
psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/rollbacks/<sürüm>_<ad>.down.sql
```

| #   | Down dosyası                                     | Ne zaman                                                                               | Reddettiği durum / kaybolan veri                                   |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 18  | `20260926100000_odeme_islem_anahtari.down.sql`   | v2 geri alınırken                                                                      | yok; ödemeler kalır, yalnız işlem anahtarları silinir              |
| 17  | `20260925160000_not_sozlesmesi.down.sql`         | v2 geri alınırken                                                                      | yok; v2 notu yeniden fiziksel `ozel_not`'a yazılır (kolon gerekir) |
| 16  | `20260925150000_siparis_guncelle.down.sql`       | **yalnız kod 16'dan önceki bir sürüme döndüyse**; yeni kodun düzenlemesi 16'yı çağırır | yok; yalnız bir fonksiyon                                          |
| 15  | `20260925140000_para_yazma_yetkisi.down.sql`     | v2 geri alınırken                                                                      | yok; A10/A11 gövdelerine döner (SUPER_ADMIN yeniden yazabilir)     |
| 14  | `20260925130000_kacaklar.down.sql`               | v2 geri alınırken                                                                      | yok; yalnız iki salt okunur fonksiyon                              |
| 13  | `20260925120000_kasa_teslimleri.down.sql`        | v2 geri alınırken                                                                      | kasa teslimi varsa **reddeder**; kurye tahsilatları defterde kalır |
| 12  | `20260925110000_odemeler.down.sql`               | v2 geri alınırken                                                                      | ödeme varsa **reddeder**                                           |
| 11  | `20260925100000_siparis_sahibi_kurali.down.sql`  | v2 geri alınırken                                                                      | yok; A8 gövdesine döner                                            |
| 10  | `20260924150000_siparis_satirlari.down.sql`      | v2 geri alınırken                                                                      | v2 siparişi varsa **reddeder**                                     |
| 9   | `20260924140000_kurlar_ve_v2_ayarlari.down.sql`  | v2 geri alınırken                                                                      | kur ve v2 ayarı satırları tablolarla silinir: önce dışa aktarın    |
| 8   | `20260924130000_abd_satinalma.down.sql`          | rol kataloğu geri alınırken                                                            | yok; `ABD_SATINALMA` kullanıcıları ve davetleri olduğu gibi kalır  |
| 7   | `20260924120000_rol_katalogu.down.sql`           | rol kataloğu geri alınırken                                                            | yok                                                                |
| 6   | `20260923164650_awb_match_approvals.down.sql`    | AWB onayı geri alınırken; önce onay kaydını dışa aktarın (aşağıda)                     | onay tablosu ve kayıtları silinir                                  |
| 5   | `20260923023659_awb_match_confirmation.down.sql` | 6'dan sonra                                                                            | yok; yalnız bir fonksiyon                                          |

- **Neden tek sıra:** 8'in down dosyası `tomnap_approve_awb_matches`'i 6'nın sürümüne geri yazar. 6 önce geri alınırsa bu fonksiyon, tablosu olmadan yeniden oluşur. Eski belgedeki "önce 6 → 5, sonra 15 → 7" sırası tam da bunu yapıyordu.
- **Kısmi geri alma:** Yalnız bir kısım geri alınacaksa da aynı sıranın başından başlanır ve istenen satırda durulur. Örneğin yalnız v2 için 18'den 7'ye inilir; kod yeni kalıyorsa 16 atlanır.
- **CI:** Bu tabloyu `tests/sql/tum-zincir-gidis-donus.mjs` okur. Her PR'da bütün down dosyalarını bu sırayla tek transaction'da uygular, geride nesne kalmadığını denetler, migration'ları yeniden uygular, şemanın başlangıçtakiyle aynı olduğunu ve durum sorgusunun tümüyle `true` döndüğünü doğrular.
- **Reddetme bilerek:** Defterler ve v2 siparişleri sessizce silinmesin diye down dosyası çalışmaz. Önce veriyi dışa aktarıp çözün.
- **Veri geri alınmaz:** Down dosyaları yalnız kendi migration'larının oluşturduğu nesneleri siler. Onaylanarak siparişlere yazılmış AWB değerleri siparişlerde kalır.
- **1–4 için down dosyası yok:** Bu migration'lar yalnız uygulama öncesi alınan yedekten geri döndürülebilir.

AWB onay kaydını 6'dan önce dışa aktarma:

```bash
psql "$DATABASE_URL" -c "\copy (select * from public.awb_match_approvals) to 'awb_match_approvals.csv' csv header"
```

## f) Canlı durumuna göre plan

Canlının hangi sürüm olduğu kesin değil. Codex'in kaydına göre 21 Eylül'de PR #2'nin merge'ü (`5a02836`) yayınlanmış ve 1–4 uygulanmış olabilir; bu belge ise canlıyı `90b8eae` varsayıyordu. Hangisi olduğunu iki şey söyler:

- Vercel → Deployments: Production'daki deployment'ın commit'i.
- (b)'deki salt okunur durum sorgusu: 1–4 satırları.

İkisi aşağıdaki durumlardan birine uymuyorsa (başka bir commit, ya da 1–4'ün yalnız bir kısmı uygulanmış) **durun ve raporlayın**.

**(a) Canlı `90b8eae`, 1–4 uygulanmamış:**

1. Yedek alın. Durum sorgusunda 1–18 `false`, ön koşul kolonları `true` olmalı.
2. Production'da `SUPABASE_SERVICE_ROLE_KEY` tanımlı mı bakın; yoksa ekleyin. Eski sürüm de bu anahtarla çalışır. Migration 1, anon erişimini kapatır.
3. Deploy 1 migration'ları sırayla: **1, 2, 3, 4, 5, 6, 16**. Yeni kodun deploy'undan hemen önce uygulanır; aradaki süreyi kısa tutun.
4. Yeni kod bayraklar kapalı deploy edilir; (d)'deki smoke test yapılır.
5. Geri dönüş: (e). Hedef yeni kodun bayrakları kapalı sürümü. `90b8eae`'ye dönüş yalnız v2 verisi yoksa ve 2 yapıldıysa mümkündür. 1–4'ün down dosyası yok: veritabanının 1–4 öncesine dönmesi gerekirse yedekten.

**(b) Canlı `5a02836`, 1–4 uygulanmış:**

1. Yedek alın. Durum sorgusunda 1–4 `true`, 5–18 `false`, ön koşul kolonları `true` olmalı.
2. Deploy 1 migration'ları sırayla: **5, 6, 16**, yeni koddan önce. `5a02836` bu nesneleri kullanmaz; eklenmeleri canlıyı bozmaz.
3. Yeni kod bayraklar kapalı deploy edilir; (d)'deki smoke test yapılır.
4. Geri dönüş: (e). Hedef yeni kodun bayrakları kapalı sürümü. `5a02836`'ya dönüş yalnız v2 verisi yoksa mümkündür. 5, 6 ve 16'nın geri alınması gerekmez; eski sürüm bunları kullanmaz.

**İki durumda da:** v2 migration'ları (7–15, 17, 18; dosya adı sırasıyla) Deploy 1 oturduktan sonra ayrı bir yayında uygulanır. Bu sırada bayraklar kapalı kalır. Ardından (d2) yapılır.

## Çıkış sırası

1. Yayına girecek PR'lar `main`'dedir (son: #31, `b85f297`).
2. [RELEASE_READINESS.md](RELEASE_READINESS.md) ön koşulları kapatılır: Storage bucket, e-posta, 4,5 MB Functions sınırı, önizleme kabulü.
3. Veritabanı yedeği alınır. (b)'deki salt okunur kontrol çalıştırılır; beklenmedik bir şey varsa durulur.
4. Eksik migration'lar (f)'deki duruma göre sırayla uygulanır: (a) 1–6 ve 16, (b) 5, 6 ve 16.
5. (c)'deki değişkenler Production ortamına girilir; AWB bayrakları kapalı kalır.
6. **Yayın yöntemi (karar 26 Eylül 2026, DEPLOY_1'den tek sapma):** `vercel.json`'daki `"main": false` **kalır**. "Merge ≠ yayın" kuralı korunur; `main`'e merge yetkisi buna dayanır. Production, `main`'in temiz bir worktree'sinden (`b85f297` ya da sonrası; içinde `.env` dosyası yok) Vercel CLI ile alınır: `vercel deploy --prod`. Bu yalnız proje sahibi "yayınla" dedikten sonra yapılır. CLI girişini proje sahibi kendisi yapar. Derleme, Vercel'in Production değişkenleriyle Vercel'de olur.
7. (d)'deki smoke test yapılır. Sorun varsa (e)'ye geçilir.
8. Deploy 1 oturduktan sonra, ayrı yayınlarla ve `FF_V2_FLOW` kapalıyken 7–15, 17 ve 18 uygulanır. Ardından (d2)'deki Preview denemesi yapılır; bayraklar yalnız Preview'da açılır.

## Uygulama kaydı — 26 Eylül 2026

Deploy 1 ve v2 veritabanı hazırlığı. Veritabanı ve Vercel panelindeki işlemleri proje sahibi yaptı; sıra, komutlar ve doğrulama bu oturumda hazırlandı. Plan: (f)(b).

**Önce:** Canlı `5a02836` (deployment `tomnap-kjtp0qqnx`, 21 Eylül). Durum sorgusu: 1–4 var, 5–18 yok, gerekli kolonların hepsi var, `ozel_not` yok.

**Yedek:** Supabase Free planında panel yedeği yok. Session pooler üzerinden `pg_dump` 17.5 ile elle döküm alındı: roller, şema ve veri (public şeması). Dosyalar repo dışında duruyor, SHA256 doğrulandı. Şemada 13 tablo ve 28 fonksiyon var; `siparisler` 24, `kullanicilar` 6 satır. Döküm için veritabanı parolası sıfırlandı; uygulama bu parolayı kullanmıyor (kod yalnız `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` okur).

**Aşama 1 — Deploy 1:**

1. Migration 5, 6 ve 16 SQL Editor'da çalıştırıldı. Durum: 1–6 ve 16 var.
2. Production değişkenleri: zorunluların hepsi var, dört bayrak tanımlı değil. Yalnız adlar kontrol edildi.
3. Yayın: `main` `4abd002`'nin temiz worktree'sinden `vercel deploy --prod`. Deployment `tomnap-n8n79hcpm`, 26 Eylül 11:20 (+04). Derleme günlüğü: v2 kabuğu ve AWB paneli pakette yok.
4. Smoke test:

| Adım                               | Sonuç                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| 1. Güvenlik başlıkları             | ✅ 200; `DENY`, `nosniff`, referrer ve permissions policy, HSTS |
| 2. `/api/health` GET ve HEAD       | ✅ `{"basarili":true}`, 200                                     |
| 3. Manifest                        | ✅ bir `rel="manifest"`, `short_name` TOMNAP                    |
| 4. Tarayıcıda giriş (proje sahibi) | ✅ sipariş ve müşteri listesi açıldı                            |
| 5. Oturumsuz API                   | ✅ 401                                                          |
| 6. `X-Forwarded-Uri`               | ✅ yok sayıldı                                                  |
| 7. Bayraklar kapalı                | ✅ `/api/v2/durum` 404; AWB paneli yok                          |
| 8. Vercel Logs (proje sahibi)      | ✅ 90 istek, 5xx yok, error seviyesi kayıt yok                  |

`GET /api/kargo/ayarlar` iki kez 400 döndü: firma seçimi "Tüm firmalar" iken bu uç "Kargo işlemi için firma seçin." der. PR #2'den beri böyle; yeni bir hata değil.

**Aşama 2 — v2 veritabanı (bayraklar kapalı):**

- Migration 7–15, 17 ve 18 dosya adı sırasıyla uygulandı. Durum: **18/18 var**. Production'da `/api/v2/durum`, `/api/v2/kurlar` ve `/api/v2/siparisler` 404; health 200.
- **Kodlama olayı:** SQL'ler panoya `pbcopy` ile konuyordu. Ortamda dil ayarı boş olduğu için pano metni Mac Roman oldu; SQL Editor'a Türkçe ve Azerbaycan harfleri bozuk gitti.
  - Yorumlar dışında ASCII olmayan metin yalnız `tomnap_v2_siparis_olustur`'da vardı: varsayılan şehir `'Bakü'` (10, 11, 17) ve not etiketi `'[TƏLİMAT: '` (17).
  - Bayraklar kapalı olduğundan fonksiyon hiç çağrılmadı; bozuk veri yazılmadı.
  - 17 (`CREATE OR REPLACE`) UTF-8 ile yeniden çalıştırıldı. Durum sorgusuna eklenen iki kontrol (`prosrc` içinde `'Bakü'` ve `'[TƏLİMAT: '`) `true` döndü.
  - Sonraki yayınlarda pano için `LANG=en_US.UTF-8 pbcopy` kullanılır ve panodaki metin bayt sayısıyla dosyaya karşı doğrulanır.

**Ertelenen:** (d2)'deki `v2-deneme` Preview değişkenleri ve Preview denemesi. Codex R4 düzeltmelerinden sonra Deploy 2 ile yapılacak. v2 bayrakları her ortamda kapalı.

**Açık kalanlar:**

- Vercel'deki Supabase entegrasyonu değişkenleri (`POSTGRES_*`) parola sıfırlandığı için eski. Kod bunları okumuyor.
- Free planda otomatik yedek yok. Deploy 2 öncesinde aynı yolla yeni bir döküm alınır.
- Vercel CLI 48.10.2 eski (güncel 60.x); yayın için sorun çıkarmadı.
