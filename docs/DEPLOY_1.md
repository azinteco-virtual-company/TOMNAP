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

## b) Production'a uygulanacak migration'lar

**Uzak migration geçmişi OKUNAMADI; tahmin yapılmadı.** Bu dal hazırlanırken:

- veritabanı parolası ya da erişim token'ı yoktu,
- Supabase CLI projeye bağlı değildi (`supabase/.temp` altında proje ref'i yok),
- oturumun güvenlik kuralları production okumasına izin vermedi.

Aşağıdaki "uzakta?" sütunu, uygulamadan önce aşağıdaki salt okunur sorguyla doldurulmalı. Yalnız bir tarihî not olarak: [RELEASE_READINESS.md](RELEASE_READINESS.md) 21 Eylül itibarıyla faz migration'larının canlıya uygulanmadığını yazıyor. Bu bir kontrol sonucu değildir.

Repodaki migration'ların **hepsi** `90b8eae`'den sonra geldi; canlı kodda hiçbiri yok. Uygulama sırası dosya adındaki zaman damgasıdır:

| #   | Dosya (`supabase/migrations/`)                                            | Getiren   | İmza nesnesi                   | Down dosyası | Tekrar çalıştırılabilir mi | Uzakta?   |
| --- | ------------------------------------------------------------------------- | --------- | ------------------------------ | ------------ | -------------------------- | --------- |
| 1   | `20260917151255_server_sessions_and_private_tables.sql`                   | `fbb208d` | `public.oturumlar`             | **yok**      | evet (`IF NOT EXISTS`)     | okunamadı |
| 2   | `20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql` | `49ec3cb` | `public.onboarding_email_jobs` | **yok**      | **hayır**                  | okunamadı |
| 3   | `20260917170053_secure_cargo_couriers_and_legacy_uploads.sql`             | `a929b24` | `public.cargo_settings`        | **yok**      | **hayır**                  | okunamadı |
| 4   | `20260917174218_consistent_lists_and_private_storage.sql`                 | `d7f920f` | `public.list_revisions`        | **yok**      | **hayır**                  | okunamadı |
| 5   | `20260923023659_awb_match_confirmation.sql`                               | `f04ab76` | `tomnap_confirm_awb_matches()` | var          | evet (`OR REPLACE`)        | okunamadı |
| 6   | `20260923164650_awb_match_approvals.sql`                                  | `59575d7` | `public.awb_match_approvals`   | var          | **hayır**                  | okunamadı |

⚠️ Dikkat edilecekler:

- **2, 3, 4 ve 6 kısmen uygulanmışsa yeniden çalıştırılamaz:** `CREATE FUNCTION` / `CREATE TABLE` komutları `OR REPLACE` ya da `IF NOT EXISTS` içermiyor. Önce imza kontrolünü yapın; imzası var olan migration'ı yeniden çalıştırmayın.
- **1–4'ün down dosyası yok.** Veritabanında geri dönüş ancak yedekten yapılabilir; uygulamadan önce yedek alın.
- **Beklenmedik migration:** `schema_migrations` tablosunda bu altı sürümden başka bir kayıt görürseniz durun ve raporlayın. Bu, repoda olmayan bir değişikliğin uzakta uygulandığı anlamına gelir.

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
  end as nesne_var
from (values
  (1, '20260917151255_server_sessions_and_private_tables.sql', 'tablo', 'public.oturumlar'),
  (2, '20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql', 'tablo', 'public.onboarding_email_jobs'),
  (3, '20260917170053_secure_cargo_couriers_and_legacy_uploads.sql', 'tablo', 'public.cargo_settings'),
  (4, '20260917174218_consistent_lists_and_private_storage.sql', 'tablo', 'public.list_revisions'),
  (5, '20260923023659_awb_match_confirmation.sql', 'fonksiyon', 'tomnap_confirm_awb_matches'),
  (6, '20260923164650_awb_match_approvals.sql', 'tablo', 'public.awb_match_approvals')
) as m(sira, dosya, tur, imza)
order by m.sira;

select to_regclass('supabase_migrations.schema_migrations') is not null as gecmis_tablosu_var;
-- Yalnız yukarıdaki true ise:
-- select version, name from supabase_migrations.schema_migrations order by version;
```

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

| Değişken                         | Okunduğu yer                | Deploy 1 için                                                                                     |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                   | sunucu, çalışma zamanı      | zorunlu                                                                                           |
| `SUPABASE_SERVICE_ROLE_KEY`      | sunucu, çalışma zamanı      | zorunlu, sır; asla `VITE_` önekiyle verilmez                                                      |
| `APP_URL`                        | sunucu, çalışma zamanı      | zorunlu: canlı HTTPS adresi (CORS ve e-posta bağlantıları); boşsa `https://tomnap.com` varsayılır |
| `UPLOAD_STORAGE_BACKEND`         | sunucu, çalışma zamanı      | zorunlu: `supabase`; Vercel'de `local` reddedilir                                                 |
| `CARGO_ENCRYPTION_KEYS`          | sunucu, çalışma zamanı      | kargo kimlik bilgileri için zorunlu, sır ([PHASE4_SECURITY.md](PHASE4_SECURITY.md))               |
| `CARGO_ENCRYPTION_ACTIVE_KEY_ID` | sunucu, çalışma zamanı      | yukarıdakiyle birlikte zorunlu                                                                    |
| `RESEND_API_KEY`                 | sunucu, çalışma zamanı      | production'da davet e-postası için zorunlu, sır                                                   |
| `EMAIL_FROM`                     | sunucu, çalışma zamanı      | isteğe bağlı                                                                                      |
| `GEMINI_API_KEY`                 | sunucu, çalışma zamanı      | yapay zeka özellikleri için, sır                                                                  |
| `CORS_ORIGIN`                    | sunucu, çalışma zamanı      | isteğe bağlı ek origin'ler; `APP_URL` her zaman kabul edilir                                      |
| `LOG_LEVEL`                      | sunucu, çalışma zamanı      | isteğe bağlı (varsayılan `info`)                                                                  |
| `FF_AWB_REVIEW`                  | sunucu, çalışma zamanı      | ilk deploy'da **boş/false**; açılırsa `VITE_FF_AWB_REVIEW` ile birlikte                           |
| `VITE_FF_AWB_REVIEW`             | **istemci, derleme zamanı** | ilk deploy'da **boş/false**; `FF_AWB_REVIEW` ile aynı değer                                       |

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
8. **Hata kaydı (9–10. dk):** Vercel → Logs, son 10 dakika: 5xx ya da yakalanmamış hata olmamalı.

Production'da **denenmeyecekler:**

- **Giriş limiti:** Denerseniz o IP'den girişi 15 dakika kilitler.
- **AWB onayı:** Demo verisine kalıcı AWB yazar; bayrak açılırsa ayrı bir karar olarak yapılır.

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
