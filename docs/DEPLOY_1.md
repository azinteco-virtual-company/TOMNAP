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
| 15  | `20260925140000_para_yazma_yetkisi.sql` (SUPER_ADMIN para yazmaz)         | bu PR     | 3 fonksiyon gövdesi (`para-yazma-yetkisi`) | var          | evet (`OR REPLACE`)        | okunamadı |

Toplam 15 migration. 7–15'in her biri CI'da `up → down → down → up` ile sınanıyor.

⚠️ Dikkat edilecekler:

- **7–15 ne zaman:** faz-a-plan'a göre Deploy 1'den **sonra**, `FF_V2_FLOW` kapalıyken, ayrı yayınlarla. 7 ve 8, Deploy 1'deki kodun `ABD_SATINALMA` davetini açar; yoksa bu davet 409 ile reddedilir, diğer roller etkilenmez. 9–15 yalnız v2 akışı içindir.
- **7–15 arası bağımlılık:** 11, 10'un fonksiyonunu değiştirir; 12, 10'un v2 siparişlerine bağlanır; 13, 12'ye ve 3'teki `kuryeler`'e; 14'ün Q5'i 13'ün bakiye fonksiyonunu çağırır; 15, 12 ve 13'ün üç yazma fonksiyonunu değiştirir (SUPER_ADMIN ödeme kaydı, ters kayıt ve kasa teslimi yazamaz). Sırayı bozmayın.
- **2, 3, 4, 6, 7, 8, 9, 10, 12, 13 ve 14 kısmen uygulanmışsa yeniden çalıştırılamaz:** `CREATE FUNCTION` / `CREATE TABLE` komutları `OR REPLACE` ya da `IF NOT EXISTS` içermiyor. Önce imza kontrolünü yapın; imzası var olan migration'ı yeniden çalıştırmayın.
- **1–4'ün down dosyası yok.** Veritabanında geri dönüş ancak yedekten yapılabilir; uygulamadan önce yedek alın.
- **Beklenmedik migration:** `schema_migrations` tablosunda bu on beş sürümden başka bir kayıt görürseniz durun ve raporlayın. Bu, repoda olmayan bir değişikliğin uzakta uygulandığı anlamına gelir.

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
  (15, '20260925140000_para_yazma_yetkisi.sql', 'govde', 'tomnap_v2_odeme_kaydet:para-yazma-yetkisi')
) as m(sira, dosya, tur, imza)
order by m.sira;

select to_regclass('supabase_migrations.schema_migrations') is not null as gecmis_tablosu_var;
-- Yalnız yukarıdaki true ise:
-- select version, name from supabase_migrations.schema_migrations order by version;
```

`psql` ile bir salt okunur transaction içinde çalıştırmak için sorguyu bir dosyaya kaydedin ve:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "begin transaction read only" -f migration-durumu.sql -c "rollback"
```

Sorgu 25 Eylül'de, CI şemasının kurulu olduğu yerel bir veritabanında denendi: 15 satırın hepsi `true` döndü; 11'in ya da 15'in down dosyası bir transaction içinde uygulanınca yalnız o satır `false` oldu.

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

| Değişken                         | Okunduğu yer                | Deploy 1 için                                                                                                                                                 |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                   | sunucu, çalışma zamanı      | zorunlu                                                                                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`      | sunucu, çalışma zamanı      | zorunlu, sır; asla `VITE_` önekiyle verilmez                                                                                                                  |
| `APP_URL`                        | sunucu, çalışma zamanı      | zorunlu: canlı HTTPS adresi (CORS ve e-posta bağlantıları); boşsa `https://tomnap.com` varsayılır                                                             |
| `UPLOAD_STORAGE_BACKEND`         | sunucu, çalışma zamanı      | zorunlu: `supabase`; Vercel'de `local` reddedilir                                                                                                             |
| `CARGO_ENCRYPTION_KEYS`          | sunucu, çalışma zamanı      | kargo kimlik bilgileri için zorunlu, sır ([PHASE4_SECURITY.md](PHASE4_SECURITY.md))                                                                           |
| `CARGO_ENCRYPTION_ACTIVE_KEY_ID` | sunucu, çalışma zamanı      | yukarıdakiyle birlikte zorunlu                                                                                                                                |
| `RESEND_API_KEY`                 | sunucu, çalışma zamanı      | production'da davet e-postası için zorunlu, sır                                                                                                               |
| `EMAIL_FROM`                     | sunucu, çalışma zamanı      | isteğe bağlı                                                                                                                                                  |
| `GEMINI_API_KEY`                 | sunucu, çalışma zamanı      | yapay zeka özellikleri için, sır                                                                                                                              |
| `CORS_ORIGIN`                    | sunucu, çalışma zamanı      | isteğe bağlı ek origin'ler; `APP_URL` her zaman kabul edilir                                                                                                  |
| `LOG_LEVEL`                      | sunucu, çalışma zamanı      | isteğe bağlı (varsayılan `info`)                                                                                                                              |
| `FF_AWB_REVIEW`                  | sunucu, çalışma zamanı      | ilk deploy'da **boş/false**; açılırsa `VITE_FF_AWB_REVIEW` ile birlikte                                                                                       |
| `VITE_FF_AWB_REVIEW`             | **istemci, derleme zamanı** | ilk deploy'da **boş/false**; `FF_AWB_REVIEW` ile aynı değer                                                                                                   |
| `FF_V2_FLOW`                     | sunucu, çalışma zamanı      | **Karar: önce yalnız Preview'da `true`**; Production'da boş, açma kararı proje sahibinde. Yalnız tam olarak `true` açar; kapalıyken `/api/v2` her istekte 404 |
| `VITE_FF_V2_FLOW`                | **istemci, derleme zamanı** | `FF_V2_FLOW` ile aynı: yalnız Preview; Production'da boş. Açıkken `/v2` kabuğu ve kurye nakdi bölümü ayrı parça olarak derlenir                               |

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

Ayrı bir staging yok: Preview deployment'ları da **aynı Supabase projesine** bağlanır. İçindeki verinin tamamı demo verisidir (CLAUDE.md → ORTAM). Preview'da yapılan her v2 işlemi bu veritabanına yazar. Defterler (ödeme, kasa teslimi) append-only olduğu için yazılanlar silinemez.

1. **Migration'lar (bayrak her yerde kapalı):**
   - Yedek alın.
   - (b)'deki salt okunur kontrolü çalıştırın.
   - Eksik olanları 7'den 15'e sırayla uygulayın.
   - Kontrolü yeniden çalıştırın; 15 satır `true` olmalı.
2. **Bayrakları yalnız Preview'a verin:** Vercel → Settings → Environment Variables. `FF_V2_FLOW=true` ve `VITE_FF_V2_FLOW=true` yalnız **Preview** ortamına girilir; Production'da boş kalır.
3. **Preview deployment'ı:** `main`'den ya da bir daldan push ya da `vercel deploy` (`--prod` olmadan). `VITE_` bayrağı derleme zamanında okunduğu için yeni bir derleme gerekir.
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

**Kod:** Vercel → Deployments → önceki production deployment'ı (`90b8eae`) → **Instant Rollback**. CLI karşılığı:

```bash
vercel rollback <önceki-deployment-url>
```

- **Faz migration'ları uygulandıysa:** Eski sürüm production'da anon anahtarıyla çalışıyorsa (bkz. b), kodu `90b8eae`'ye döndürmek tek başına yetmez. Veritabanı da yedekten geri alınmalıdır.
- **Uygulanmadılarsa:** Kod geri alma tek başına yeterlidir.

**Veritabanı:** Önce kod geri alınır; böylece yeni RPC'leri çağıran bir sürüm kalmaz. Sonra down dosyaları ters sırayla, her biri tek transaction olarak uygulanır:

1. AWB onay kaydını dışa aktarın; down dosyası bu tabloyu siler:
   ```bash
   psql "$DATABASE_URL" -c "\copy (select * from public.awb_match_approvals) to 'awb_match_approvals.csv' csv header"
   ```
2. Onay tablosunu kaldırın:
   ```bash
   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/rollbacks/20260923164650_awb_match_approvals.down.sql
   ```
3. Onay RPC'sini kaldırın:
   ```bash
   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
   ```

**v2 migration'ları (15 → 7):** Önce `FF_V2_FLOW` kapatılıp yeniden deploy edilir. Sonra down dosyaları yeniden eskiye, her biri tek transaction olarak uygulanır:

```bash
psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/rollbacks/<sürüm>_<ad>.down.sql
```

| #   | Down dosyası                                    | Reddettiği durum / kaybolan veri                                   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------ |
| 15  | `20260925140000_para_yazma_yetkisi.down.sql`    | yok; A10/A11 gövdelerine döner (SUPER_ADMIN yeniden yazabilir)     |
| 14  | `20260925130000_kacaklar.down.sql`              | yok; yalnız iki salt okunur fonksiyon                              |
| 13  | `20260925120000_kasa_teslimleri.down.sql`       | kasa teslimi varsa **reddeder**; kurye tahsilatları defterde kalır |
| 12  | `20260925110000_odemeler.down.sql`              | ödeme varsa **reddeder**                                           |
| 11  | `20260925100000_siparis_sahibi_kurali.down.sql` | yok; A8 gövdesine döner                                            |
| 10  | `20260924150000_siparis_satirlari.down.sql`     | v2 siparişi varsa **reddeder**                                     |
| 9   | `20260924140000_kurlar_ve_v2_ayarlari.down.sql` | kur ve v2 ayarı satırları tablolarla silinir: önce dışa aktarın    |
| 8   | `20260924130000_abd_satinalma.down.sql`         | yok; `ABD_SATINALMA` kullanıcıları ve davetleri olduğu gibi kalır  |
| 7   | `20260924120000_rol_katalogu.down.sql`          | yok                                                                |

- **Reddetme bilerek:** Defterler ve v2 siparişleri sessizce silinmesin diye down dosyası çalışmaz. Önce veriyi dışa aktarıp çözün.
- **Veri geri alınmaz:** Down dosyaları yalnız kendi migration'larının oluşturduğu nesneleri siler. Onaylanarak siparişlere yazılmış AWB değerleri siparişlerde kalır.
- **1–4 için down dosyası yok:** Bu migration'lar yalnız uygulama öncesi alınan yedekten geri döndürülebilir.

## Çıkış sırası

1. PR #3 ve bu PR incelenip `main`'e alınır.
2. [RELEASE_READINESS.md](RELEASE_READINESS.md) ön koşulları kapatılır: Storage bucket, e-posta, 4,5 MB Functions sınırı, önizleme kabulü.
3. Veritabanı yedeği alınır. (b)'deki salt okunur kontrol çalıştırılır; beklenmedik bir şey varsa durulur.
4. Eksik migration'lar sırayla uygulanır.
5. (c)'deki değişkenler Production ortamına girilir; AWB bayrakları kapalı kalır.
6. `vercel.json`'daki `"main": false` ayrı bir commit ile kaldırılır ve production, `main`'den Vercel'in production değişkenleriyle derlenir.
7. (d)'deki smoke test yapılır. Sorun varsa (e)'ye geçilir.
8. Deploy 1 oturduktan sonra, ayrı yayınlarla ve `FF_V2_FLOW` kapalıyken 7–15 uygulanır. Ardından (d2)'deki Preview denemesi yapılır; bayraklar yalnız Preview'da açılır.
