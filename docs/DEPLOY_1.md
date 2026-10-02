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

| #   | Dosya (`supabase/migrations/`)                                             | Getiren   | İmza nesnesi                                | Down dosyası | Tekrar çalıştırılabilir mi | Uzakta?   |
| --- | -------------------------------------------------------------------------- | --------- | ------------------------------------------- | ------------ | -------------------------- | --------- |
| 1   | `20260917151255_server_sessions_and_private_tables.sql`                    | `fbb208d` | `public.oturumlar`                          | **yok**      | evet (`IF NOT EXISTS`)     | okunamadı |
| 2   | `20260917160612_transactional_onboarding_inbox_and_order_maintenance.sql`  | `49ec3cb` | `public.onboarding_email_jobs`              | **yok**      | **hayır**                  | okunamadı |
| 3   | `20260917170053_secure_cargo_couriers_and_legacy_uploads.sql`              | `a929b24` | `public.cargo_settings`                     | **yok**      | **hayır**                  | okunamadı |
| 4   | `20260917174218_consistent_lists_and_private_storage.sql`                  | `d7f920f` | `public.list_revisions`                     | **yok**      | **hayır**                  | okunamadı |
| 5   | `20260923023659_awb_match_confirmation.sql`                                | `f04ab76` | `tomnap_confirm_awb_matches()`              | var          | evet (`OR REPLACE`)        | okunamadı |
| 6   | `20260923164650_awb_match_approvals.sql`                                   | `59575d7` | `public.awb_match_approvals`                | var          | **hayır**                  | okunamadı |
| 7   | `20260924120000_rol_katalogu.sql` (A4)                                     | PR #11    | `tomnap_gecerli_rol()`                      | var          | **hayır**                  | okunamadı |
| 8   | `20260924130000_abd_satinalma.sql` (A5)                                    | PR #12    | `tomnap_rol_kota_varsayilani()`             | var          | **hayır**                  | okunamadı |
| 9   | `20260924140000_kurlar_ve_v2_ayarlari.sql` (A7)                            | PR #14    | `public.kurlar`                             | var          | **hayır**                  | okunamadı |
| 10  | `20260924150000_siparis_satirlari.sql` (A8)                                | PR #16    | `public.siparis_satirlari`                  | var          | **hayır**                  | okunamadı |
| 11  | `20260925100000_siparis_sahibi_kurali.sql` (O-24)                          | PR #19    | `tomnap_v2_siparis_olustur()` gövdesi       | var          | evet (`OR REPLACE`)        | okunamadı |
| 12  | `20260925110000_odemeler.sql` (A10)                                        | PR #20    | `public.odemeler`                           | var          | **hayır**                  | okunamadı |
| 13  | `20260925120000_kasa_teslimleri.sql` (A11)                                 | PR #21    | `public.kasa_teslimleri`                    | var          | **hayır**                  | okunamadı |
| 14  | `20260925130000_kacaklar.sql` (A12)                                        | PR #22    | `tomnap_v2_kacak_q4()`                      | var          | **hayır**                  | okunamadı |
| 15  | `20260925140000_para_yazma_yetkisi.sql` (SUPER_ADMIN para yazmaz)          | PR #25    | 3 fonksiyon gövdesi (`para-yazma-yetkisi`)  | var          | evet (`OR REPLACE`)        | okunamadı |
| 16  | `20260925150000_siparis_guncelle.sql` (v1 düzenleme, Codex R3 F1/F2)       | PR #27    | `tomnap_siparis_guncelle()`                 | var          | **hayır**                  | okunamadı |
| 17  | `20260925160000_not_sozlesmesi.sql` (not sözleşmesi, Codex R3 F8)          | PR #29    | `tomnap_v2_siparis_olustur()` gövdesi       | var          | evet (`OR REPLACE`)        | okunamadı |
| 18  | `20260926100000_odeme_islem_anahtari.sql` (işlem anahtarı, Codex R3 F15)   | PR #30    | `tomnap_v2_odeme_kaydet()` gövdesi          | var          | **hayır**                  | okunamadı |
| 19  | `20260927100000_v2_asama_koprusu.sql` (v2 aşama köprüsü, GEÇİCİ, O-38)     | PR #38    | `tomnap_v2_asama_ilerlet()`                 | var          | **hayır**                  | var       |
| 20  | `20261001100000_butik_varsayilan_dili.sql` (butiğin varsayılan dili, i18n) | i18n PR   | `tenant_v2_ayarlari.varsayilan_dil` kolonu  | var          | **hayır**                  | yok       |
| 21  | `20261002100000_yedek_ve_ters_kayit_korumasi.sql` (Codex R5 B01/B03)       | R5 PR-B   | 2 fonksiyon gövdesi (`Codex R5 B01`, `B03`) | var          | evet (`OR REPLACE`)        | yok       |

Toplam 21 migration. 7–21'in her biri CI'da `up → down → down → up` ile sınanıyor.

- **16 Deploy 1 ile gider:** Sipariş düzenleme rotası (`PATCH /api/siparisler/:id`) 16'nın fonksiyonunu çağırıyor. Bu yüzden 16, 1–6 ile birlikte ve yeni koddan **önce** uygulanır. 7–15'e bağlı değil.

⚠️ Dikkat edilecekler:

- **7–15, 17 ve 18 ne zaman:** faz-a-plan'a göre Deploy 1'den **sonra**, `FF_V2_FLOW` kapalıyken, ayrı yayınlarla. 7 ve 8, Deploy 1'deki kodun `ABD_SATINALMA` davetini açar; yoksa bu davet 409 ile reddedilir, diğer roller etkilenmez. 9–15 yalnız v2 akışı içindir.
- **17 v2 ile gider:** 7–15 ile birlikte, 11'den sonra. 11'in fonksiyonunu değiştirir: v2 sipariş notu artık fiziksel bir `ozel_not` kolonuna değil, v1 gibi `baku_tahsilat_notu`'daki `[TƏLİMAT: …]` etiketine yazılır (hiçbir migration `ozel_not` kolonu oluşturmuyor; kolonsuz şemada v2 siparişi hiç oluşturulamıyordu). 11 herhangi bir nedenle yeniden uygulanırsa 17 de ardından yeniden uygulanır.
- **19 v2 ile gider, Deploy 3'te:** 1–18'den sonra; yalnız yeni bir fonksiyon, hiçbir tabloya dokunmaz. v2 siparişini bir sonraki lojistik aşamaya taşır (K20 birim ekseni gelene kadar GEÇİCİ köprü, OPEN_QUESTIONS 38). 19 olmadan v2 ekranındaki "Sonraki aşama" düğmesi 503 alır; kurye nakdi ve kasa teslimi için v2 siparişi Bakü dağıtımına geçemez.
- **20 Deploy 4 ile gider (dil):** 9'dan sonra; yalnız `tenant_v2_ayarlari`'na bir kolon ekler (`varsayilan_dil`, `NOT NULL DEFAULT 'az'`, biçim CHECK'i). Var olan satırlar `'az'` alır. Yeni kod oturumda butiğin dilini bu kolondan okur; kolon yoksa okuma `'az'`'a düşer ve giriş çalışır, ama v2 ayarları (`/api/v2/ayarlar`) 503 alır. Bu yüzden 20, kod deploy'undan **önce** uygulanır. 9 yeniden uygulanırsa 20 de ardından yeniden uygulanır. Eski sürüm kolonu kullanmaz; geri dönüşte 20 geri alınmaz.
- **21 Deploy 4 ile gider (Codex R5):** 20'den sonra, kod deploy'undan **önce**. Yalnız iki fonksiyonun gövdesi değişir; imzalar ve yetkiler aynı, tablo ve veri değişmez.
  - **B01, `tomnap_restore_orders`:** v1 bakım işlemleri, yani yedek yükleme (merge), temizle-yükle (replace) ve temizleme (clear, OPEN_QUESTIONS 42 kararı), butikte bir v2 siparişi varsa tamamen reddedilir (PT409). Rota ve bellek yolu aynı kuralı ayrıca uygular; yanıt HTTP 409, `kod: YEDEK_V2_SIPARIS_VAR`. v2'siz butikte davranış aynı.
  - **B03, `tomnap_odeme_kontrol`:** Ters kayıt, asıl ödemenin alan kullanıcısını, kaynağını ve yöntemini aynen taşır; farklıysa reddedilir. Normal ters kayıt RPC'si bu alanları zaten kopyalar.
  - Canlı kod (`57c5b95`) aynı imzaları çağırır. v2'li butikte v1 yüklemesi ve temizleme o sürümde 503 ile reddedilir, veri değişmez.
  - 2, 10, 12 ya da 13 yeniden uygulanırsa 21 de ardından yeniden uygulanır.
- **18 v2 ile gider:** 12, 13 ve 15'ten sonra. `odemeler`'e yeni bir kolon (`islem_anahtari`, var olan satırlarda boş) ve kiracı başına benzersiz bir indeks ekler; ödeme kaydı ve yeni beş argümanlı kurye tahsilatı aynı anahtarla gelen tekrarı yeni kayıt yazmadan ilk ödemeyle yanıtlar. v2 ödeme ve kurye ekranları her zaman anahtar gönderir: 18 olmadan kurye tahsilatı çalışmaz. 15 yeniden uygulanırsa 18 de ardından yeniden uygulanır.
- **7–15 arası bağımlılık:** 11, 10'un fonksiyonunu değiştirir; 12, 10'un v2 siparişlerine bağlanır; 13, 12'ye ve 3'teki `kuryeler`'e; 14'ün Q5'i 13'ün bakiye fonksiyonunu çağırır; 15, 12 ve 13'ün üç yazma fonksiyonunu değiştirir (SUPER_ADMIN ödeme kaydı, ters kayıt ve kasa teslimi yazamaz). Sırayı bozmayın.
- **2, 3, 4, 6, 7, 8, 9, 10, 12, 13 ve 14 kısmen uygulanmışsa yeniden çalıştırılamaz:** `CREATE FUNCTION` / `CREATE TABLE` komutları `OR REPLACE` ya da `IF NOT EXISTS` içermiyor. Önce imza kontrolünü yapın; imzası var olan migration'ı yeniden çalıştırmayın.
- **1–4'ün down dosyası yok.** Veritabanında geri dönüş ancak yedekten yapılabilir; uygulamadan önce yedek alın.
- **Beklenmedik migration:** `schema_migrations` tablosunda bu yirmi bir sürümden başka bir kayıt görürseniz durun ve raporlayın. Bu, repoda olmayan bir değişikliğin uzakta uygulandığı anlamına gelir.

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
    -- 'govde': yalnız fonksiyon gövdesini değiştiren migration; imza "fonksiyon:metin",
    -- birden çok gövde ';' ile ayrılır ve hepsi aranır.
    when 'govde' then not exists (
      select 1 from unnest(string_to_array(m.imza, ';')) as g(parca)
      where not exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = split_part(g.parca, ':', 1)
          and p.prosrc like '%' || split_part(g.parca, ':', 2) || '%'))
    -- 'kolon': yalnız kolon ekleyen migration; imza "tablo:kolon".
    when 'kolon' then exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass(split_part(m.imza, ':', 1))
        and a.attname = split_part(m.imza, ':', 2) and a.attnum > 0 and not a.attisdropped)
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
  (18, '20260926100000_odeme_islem_anahtari.sql', 'govde', 'tomnap_v2_odeme_kaydet:Codex R3 F15'),
  (19, '20260927100000_v2_asama_koprusu.sql', 'fonksiyon', 'tomnap_v2_asama_ilerlet'),
  (20, '20261001100000_butik_varsayilan_dili.sql', 'kolon', 'public.tenant_v2_ayarlari:varsayilan_dil'),
  (21, '20261002100000_yedek_ve_ters_kayit_korumasi.sql', 'govde', 'tomnap_restore_orders:Codex R5 B01;tomnap_odeme_kontrol:Codex R5 B03')
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

-- Kodlama kalkanı (26 Eylül olayı): SQL panoya UTF-8 dışında konunca ASCII dışı harfler
-- bozulur. tomnap_* gövdelerinde Mac Roman (√ ∆ º ƒ ≈) ya da Latin-1 (Ã Ä Å Æ) izi olmamalı;
-- v2 sipariş fonksiyonu 'Bakü' ve '[TƏLİMAT: ' metnini birebir içermeli (10, 11 ve 17
-- uygulanmadan ikinci satır false olur). Aranan harfler U& kaçışıyla yazıldı: çalışan kısım
-- ASCII, bozuk bir pano aranan metni de bozup kontrolü yanlışlıkla geçiremez.
select 'kodlama: tomnap_* gövdelerinde bozuk harf izi yok' as kontrol,
  not exists (select 1 from pg_catalog.pg_proc p
              join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'tomnap\_%'
                and p.prosrc ~ U&'[\221A\2206\00BA\0192\2248\00C3\00C4\00C5\00C6]') as dogru
union all
select 'kodlama: tomnap_v2_siparis_olustur metinleri birebir',
  exists (select 1 from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'tomnap_v2_siparis_olustur'
            and strpos(p.prosrc, U&'''Bak\00FC''') > 0
            and strpos(p.prosrc, U&'''[T\018FL\0130MAT: ') > 0);

select to_regclass('supabase_migrations.schema_migrations') is not null as gecmis_tablosu_var;
-- Yalnız yukarıdaki true ise:
-- select version, name from supabase_migrations.schema_migrations order by version;
```

`psql` ile bir salt okunur transaction içinde çalıştırmak için sorguyu bir dosyaya kaydedin ve:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "begin transaction read only" -f migration-durumu.sql -c "rollback"
```

Sorgu 25 Eylül'de, CI şemasının kurulu olduğu yerel bir veritabanında denendi: 15 satırın hepsi `true` döndü; 11'in ya da 15'in down dosyası bir transaction içinde uygulanınca yalnız o satır `false` oldu. 26 Eylül'de 17 satırla yeniden denendi: hepsi `true`; 17'nin down dosyası uygulanınca yalnız 17 `false` oldu. 18 satırla da denendi: hepsi `true`; 18'in down dosyası uygulanınca yalnız 18 `false` oldu. 1 Ekim'de 20 satırla: hepsi `true`; 20'nin down dosyası bir transaction içinde uygulanınca 20 `false` oldu (yeni `kolon` türü). 2 Ekim'de 21 satırla: hepsi `true`. 21'in down dosyası bir transaction içinde uygulanınca yalnız 21 `false` oldu. Yalnız `tomnap_odeme_kontrol` 13'ün gövdesine döndürülünce de yalnız 21 `false` oldu: satır iki gövdeyi birlikte arar. Ön koşul sorgusu aynı veritabanında 33 kolonun hepsi için `true` döndü. Canlıda (26 Eylül) `guncellenme_tarihi` var, `ozel_not` yok. CI bu sorguyu `ozel_not` kolonu olmayan ikinci bir veritabanında da çalıştırır; orada yalnız `ozel_not` satırı `false` olabilir.

Kodlama kalkanının iki satırı CI'da her PR'da `true` döner. Yerelde 17'nin gövdesindeki `'Bakü'` Mac Roman'a çevrilip (`'Bak√º'`) yeniden oluşturulunca ikisi de `false` oldu.

SQL Editor'da elle uygulanan migration'lar `schema_migrations` tablosuna yazılmaz. Bu yüzden asıl ölçü imza nesnesinin varlığıdır.

### Uygulama

Eksik olanlar sırayla, her dosya tek transaction olarak uygulanır (CI ile aynı biçim):

- **Pano (26 Eylül olayından sonra):** SQL Editor'a kopyalanacak dosya panoya yalnız `LANG=en_US.UTF-8 pbcopy < <dosya>.sql` ile konur; dil ayarı boş bir kabukta düz `pbcopy` metni Mac Roman yapar. Ardından `LANG=en_US.UTF-8 osascript -e 'the clipboard as text' | wc -c` dosyanın `wc -c` değeriyle karşılaştırılır (sonda en çok bir satır sonu fark eder). Her uygulamadan sonra durum sorgusundaki kodlama kalkanı satırları `true` olmalı.

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
| `FF_V2_FLOW`                     | sunucu, çalışma zamanı      | **Karar: önce yalnız Preview'da `true`**; Production'da Deploy 4 ile `true` (d3). Yalnız tam olarak `true` açar; kapalıyken `/api/v2` her istekte 404                                       |
| `VITE_FF_V2_FLOW`                | **istemci, derleme zamanı** | `FF_V2_FLOW` ile aynı: Preview, Deploy 4'ten sonra Production. Açıkken `/v2` kabuğu ve kurye nakdi bölümü ayrı parça olarak derlenir                                                        |

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
   - **Önce dal:** Vercel, GitHub'da olmayan bir dal adını kabul etmez ("Branch not found"). `v2-deneme` önce `main`'den oluşturulur; mevcut bir commit'e açılan dal derleme başlatmaz (27 Eylül'de görüldü), yani değişkenler girilmeden derleme olmaz.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `UPLOAD_STORAGE_BACKEND`, `GEMINI_API_KEY`: Production'dakiyle aynı değer. Kilitli (sensitive) değerler Vercel'de okunamaz; kaynağından (Supabase → API ayarları vb.) girilir.
   - `CARGO_ENCRYPTION_*` **girilmez, yeni anahtar da üretilmez:** Preview aynı veritabanına yazar; başka anahtarla şifrelenen kargo bilgisini Production çözemez. Anahtar yalnız kargo entegrasyonu rotalarında kullanılır (`src/server/services/crypto.ts`); anahtarsız Preview'da kargo ayarı yazılmadan reddedilir. `FF_AWB_REVIEW` de girilmez.
   - Her değişkende hedef yalnız **Preview + Git branch `v2-deneme`**; "All Preview" seçilirse her PR önizlemesi veritabanı anahtarını alır. `VITE_FF_V2_FLOW` sensitive olamaz (pakete giren bir bayrak); normal değişken olarak girilir. Kontrol: `vercel env ls preview` yalnız adları ve hedefleri gösterir; 7 satırın hepsi `Preview (v2-deneme)` olmalı.
   - `APP_URL`: dalın sabit Preview adresi (`https://<proje>-git-v2-deneme-<ekip>.vercel.app`). Sunucu, izin verilen origin'den gelmeyen her yazma isteğini (giriş dahil) 403 ile reddeder (`src/server/middleware/auth.ts`); Production'daki `APP_URL` Preview adresini kapsamaz.
   - `FF_V2_FLOW=true`, `VITE_FF_V2_FLOW=true`.
   - Production'da iki bayrak boş kalır.
3. **Preview deployment'ı:** Değişkenler girildikten sonra `v2-deneme`'ye yeni bir commit (boş olabilir) push edilir; o dalın Preview deployment'ı (dal adresi) kullanılır. `--prod` yok. Panelde Production deployment'ını "Redeploy" etmeyin: o deployment bir dala bağlı değil, dal değişkenleri ona uygulanmaz. `VITE_` bayrağı derleme zamanında okunur. Derleme günlüğünde "v2 kabuğu ayrı parçada" görünmeli. Vercel'in önizleme koruması (Deployment Protection) açıksa adres Vercel girişi ister; açık kalması önerilir (Preview canlı veritabanına yazıyor).
4. **Production kapalı mı:**
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<canli>/api/v2/durum
   ```
   `404` dönmeli.
5. **Preview'da deneme** (demo hesaplarla; `/v2`'ye v1 yan menüsündeki "TOMNAP v2 · Önizləmə" bağlantısıyla ya da adresle girilir, #39):
   - **Kabuk:** PATRON ile `/v2`: sekmeler "Sifarişlər", "Kassa", "Qaçaqlar", "Kurlar", "Ayarlar". SATIS_SORUMLUSU: "Sifarişlər" ve "Kassa". KANADA_SATINALMA: "Sifarişlər" ve "Kurlar". BAKU_FINANS: "Sifarişlər", "Kassa", "Qaçaqlar", "Kurlar"; Kassa'da ödeme formu görünür, kurye nakdini o teslim alır. BAKU_KURYE `/v2`'de kendi teslimat ekranına düşer.
   - **API adresleri:** #40'tan beri service worker `/api/` ve `/uploads/` adreslerini ağa bırakır; adres çubuğundan açılabilir. Eski service worker'ı olan tarayıcıda ilk açılış hâlâ uygulama sayfasını gösterebilir; bir yenileme yeter. Konsoldan da olur: `fetch('/api/v2/durum').then(r => r.status)`.
   - **Sipariş:** Mesajdan ve bir ekran görüntüsünden öneri alın. Satırları düzeltip kaydedin. SUPER_ADMIN sahip seçmeden kaydedemez. Mevcut sipariş tablosunda sipariş "v2" rozetiyle görünür.
   - **Kassa:** Siparişe butik ödemesi yazın, sonra gerekçeyle ters kayıt yapın. Mevcut listede `alinan_tutar` ve ödeme durumu aynı anda değişmeli.
   - **Aşama:** v2 listesindeki "Növbəti mərhələ →" siparişi bir adım ilerletir (migration 19, GEÇİCİ köprü, OQ 38). Kanada ve kargo adımları PATRON ve satın almacılar; Bakü dağıtımına geçiş PATRON ya da KANADA_SATINALMA. Son aşamada düğme yok; teslimi kurye yazar.
   - **Kurye nakdi:** Kurye kaydına bağlı bir kuryeye, `BAKU_DAGITIM_ARKADAS` aşamasındaki v2 siparişini v1 sipariş detayından atayın. Kurye ekranındaki "Üzərimdə olan nağd pul" bölümünde önce tutarı yazın, sonra "Nağd aldım"; kutu boşsa kalanın tamamı yazılır. "Kassa"da kurye bakiyesini görüp teslim alın; bakiye 0 olmalı. (27 Eylül'e kadar v2 siparişini bu aşamaya taşıyan yol yoktu; Deploy 3'te uçtan uca denendi.)
   - **Qaçaqlar:** Q4'te teslim edilmiş ama ödenmemiş siparişler, Q5'te kuryede 24 saatten uzun bekleyen nakit görünür. Denemede Q5'in "Həddi (saat)" alanına 0 yazılınca yeni nakit hemen görünür.
   - **Ret:** SATIS_SORUMLUSU `GET /api/v2/kasa/kurye-bakiyeleri` → 403; kurye başka bir kuryenin siparişine nakit yazamaz.
   - **SUPER_ADMIN parayı ve aşamayı yazmaz:** Üstteki "Butik" seçicisinden bir butik seçer (#39). Defteri, kurye bakiyelerini ve kaçakları görür. Ödeme formu, "Geri qaytar", "Təhvil al" ve "Növbəti mərhələ" görünmez; `POST /api/v2/odemeler` ve `POST /api/v2/kasa/teslimler` → 403. Sipariş açabilir ama sahibi seçmek zorunda (OQ 24).
   - **Kayıtlar:** Vercel → Logs, Preview: 5xx olmamalı.
6. **Bayrağı kapatarak geri çekme:** Preview'da `FF_V2_FLOW` boşaltılıp yeniden deploy edilince `/api/v2` 404 döner ve `/v2` "aktiv deyil" gösterir. `VITE_FF_V2_FLOW` yeniden derlemeyle kalkar. Yazılmış v2 verisi yerinde kalır; mevcut ekranlar v2 siparişini rozetle göstermeye devam eder.
7. **Production'a açma (karar 25 Eylül 2026):** v2 yayında önce **yalnız Preview**'da açılır. Production'da açma kararını proje sahibi sonra verir; o zamana kadar iki değişken Production'da boş kalır. Açılacağı zaman aynı iki değişken Production'a girilir ve `main` yeniden deploy edilir. Plan: (d3).

## d3) Deploy 4 — v2'yi Production'da açma

Karar 1 Ekim 2026: v2 Production'da açılır. Aynı yayında çok dillilik (#45, migration 20), v2 ekranlarının çevirisi (#46) ve Codex R5 düzeltmeleri (R5 PR-B, migration 21) gider. Ayrı staging yok; Production'daki her deneme canlı demo verisine yazar (CLAUDE.md → ORTAM). Veritabanı ve Vercel panelindeki işlemleri proje sahibi yapar. **DUR** yazan her noktada durulur, sonuç bildirilir, onaydan sonra devam edilir (Deploy 3'teki gibi).

**Ön koşullar:**

- `main`'de #45, #46 ve R5 PR-B var, CI yeşil. **PR-B ([İKİNCİ DENETİM]) merge edilmeden başlanmaz.**
- Vercel CLI 62.1.0 (1 Ekim'de güncellendi); `vercel whoami` doğru hesabı gösteriyor. CLI girişini proje sahibi yapar.
- Canlı: `tomnap-7ia325m4u` (`57c5b95`). Birincil geri dönüş hedefi budur (aşağıda).

**Adımlar:**

1. **Yedek:** Deploy 2'deki yolla; SHA256 doğrulanır. **DUR.**
2. **Durum sorgusu (önce):** (b)'deki salt okunur sorgu, 21 migration satırıyla. Pano `LANG=en_US.UTF-8 pbcopy` ile, bayt karşılaştırmasıyla doğrulanır. Beklenen: migration **19/21** (20 ve 21 `false`), gerekli kolonlar ve kodlama kalkanı satırları `true`. Başka bir sonuç çıkarsa **DUR** ve raporla.
3. **Migration 20** (`20261001100000_butik_varsayilan_dili.sql`): SQL Editor'da tek transaction, kod deploy'undan **önce**. Canlı kod (`57c5b95`) bu kolonu kullanmaz. Durum sorgusu yeniden çalıştırılır: **20/21** (yalnız 21 `false`), diğer satırlar aynı. **DUR.**
4. **Migration 21** (`20261002100000_yedek_ve_ters_kayit_korumasi.sql`): SQL Editor'da tek transaction, 20'den sonra ve kod deploy'undan **önce**. Yalnız iki fonksiyon gövdesi değişir; canlı kod (`57c5b95`) aynı imzaları çağırır.
   - Durum sorgusu yeniden çalıştırılır: **21/21**, kodlama kalkanının iki satırı `true`. 21'in satırı iki gövdeyi birlikte arar (`Codex R5 B01` ve `B03`).
   - 21'in doğrulaması yalnız bu sorguyla yapılır. Yedek yükleme rotası canlıda çağrılmaz, çünkü veriye yazar.
   - **DUR.**
5. **Değişkenler, yalnız Production:** Vercel → Settings → Environment Variables → Production: `FF_V2_FLOW=true`, `VITE_FF_V2_FLOW=true`. `VITE_` olan sensitive olamaz.
   - **Preview değişkenlerine dokunulmaz:** `v2-deneme` dalının 7 değişkeni yerinde kalır.
   - Kontrol: `vercel env ls production` iki adı Production hedefiyle gösterir; `vercel env ls preview` öncekiyle aynıdır.
   - **DUR.**
6. **Yayın:** `main`'in temiz bir worktree'sinden (içinde `.env` yok) `vercel deploy --prod`. Değişkenler yalnız yeni bir deployment ile etkili olur; `VITE_FF_V2_FLOW` derlemede okunur.
   - Derleme günlüğünde iki satır görünmeli: "v2 kabuğu ayrı parçada; ilk yük paketinde değil." ve "Çeviri dosyaları ve PDF fontu ayrı parçalarda; ilk yük paketinde değil."
   - `tomnap.com` ve `www.tomnap.com` yeni deployment'a bağlı olmalı.
   - **DUR.**
7. **Smoke test:** (d)'deki 1–6 ve 8. adım. 7. adımda AWB paneli yine görünmez; değişen kısım `/api/v2/durum`: oturumsuz `401` döner (bayrak kapalıyken 404'tü), oturumlu tarayıcıda `200`. Yedek yükleme rotası (`POST /api/veritabani/yedek-yukle`) smoke'ta çağrılmaz.
8. **Production'da kısa denemeler** (demo hesaplarla):
   - **v2 girişi ve sekmeler:** PATRON ile v1 menüsündeki "TOMNAP v2" → `/v2`: "Sifarişlər", "Kassa", "Qaçaqlar", "Kurlar", "Ayarlar". BAKU_FINANS: "Sifarişlər", "Kassa", "Qaçaqlar", "Kurlar". "Ayarlar"da butiğin dili Azərbaycan.
   - **Bir aşama adımı:** Son aşamada olmayan bir DENEME v2 siparişinde "Növbəti mərhələ →" düğmesi. Onay penceresi açılır, sonra liste yenilenir. Yazılanlar: bir aşama geçişi ve bir geçmiş kaydı. Uygun DENEME siparişi yoksa **DUR**; yeni sipariş açmak ayrı bir karardır.
   - **SUPER_ADMIN salt okuma:** Butik seçiciden bir butik seçilir. Defter, kurye bakiyesi ve Q4 okunur. Ödeme formu, "Geri qaytar", "Təhvil al" ve "Növbəti mərhələ" görünmez. Sipariş formu görünür (OQ 24); kaydetme denenmez.
   - **Dil:**
     - İngilizce cihazda (ya da tarayıcı dili İngilizce olan gizli pencerede) giriş sayfası İngilizce açılır.
     - Rusça cihazda (ya da tarayıcı dili Rusça olan gizli pencerede) giriş sayfası Rusça açılır (ru, R5 PR-D ile).
     - Elle seçim yapmadan giriş yapılınca arayüz butiğin dilindedir (Azərbaycan).
     - Dil seçiciden (menüde ya da v2 başlığında) English seçilince v2 ekranları İngilizce olur. Sonra Azərbaycan'a dönülür; seçim yalnız o cihazda saklanır.
     - **PDF:** Kargo manifestosunda "PDF yüklə". PDF'te "Bakı" ve "Ə" doğru görünür; başlık arayüz İngilizceyken de butiğin dilindedir. Bu adım veriye yazmaz.
     - Bilinen durum (OQ 41): İngilizce seçiliyken taşınmamış v1 ekranları eski dilinde kalır.
   - **Kayıtlar:** Vercel → Logs, deneme süresince: 5xx ve error olmamalı.
   - **Denenmeyecekler:** (d)'dekiler. Butiğin dili de değiştirilmez: o butiğin bütün kullanıcılarının arayüzünü ve belgelerini değiştirir.

**Geri dönüş (karar 2 Ekim 2026; 1 Ekim'deki "eski koda dönüş yok" kararının yerine):**

- **Birincil: Instant Rollback ile `57c5b95`'e.** Vercel → Deployments → `tomnap-7ia325m4u` → Instant Rollback (`vercel rollback <url>`).
  - 20 ve 21 eklemelidir ve `57c5b95` ile uyumludur; geri alınmaz. `57c5b95` 20'nin kolonunu kullanmaz, 21'in RPC imzaları aynıdır.
  - Dönüşte v2 Production'da kapanır (o deployment bayraksız derlendi), dil seçimi ve çeviriler gider. v2 verisi yerinde kalır; `57c5b95` v2 siparişini tanır.
  - v2'li butikte v1 yedek yüklemesi ve temizleme 21 sayesinde yine reddedilir. Bu sürümde yanıt 503'tür, veri değişmez.
  - **Doğrulama (2 Ekim, yerel PostgreSQL 17):** `57c5b95`'in `ci.yml`'deki PostgreSQL paketinin tamamı 1–21 uygulanmış şemada geçti. Zincir testi o commit'in kendi geri alma listesine bağlı olduğu için hariç tutuldu. Paket 13'ü 21 olmadan yeniden kurduğundan, ödeme ve kasa testleri ayrıca her biri taze bir 1–21 veritabanında çalıştırıldı:
    - Bakım, ayarlar (20'nin kolonuyla eski upsert), sipariş satırları, kasa, kaçaklar, para yetkisi, işlem anahtarı, aşama köprüsü ve üç eşzamanlılık testi geçti.
    - `odemeler.sql` yalnız sahte alıcılı (`'x'`) bir doğrudan ters kayıt yoklamasında 21'e takıldı. Bu, B03'ün bilerek reddettiği şeydir; uygulama kodu ters kaydı RPC ile yazar ve alanları kopyalar. O değer gerçek ödeyenle değiştirilince dosya geçti.
- **İkincil: bayrakları kapat.**
  - Production'da `FF_V2_FLOW` ve `VITE_FF_V2_FLOW` silinir.
  - Aynı temiz `main`'den, derleme önbelleği olmadan yeniden deploy edilir: `vercel deploy --prod --force`.
  - `/api/v2/durum` 404 dönmeli, `/v2` "aktiv deyil" göstermeli. Yazılmış v2 verisi yerinde kalır. Çok dillilik bayrak arkasında değildir; bu yol onu geri almaz.
- Migration 20 ve 21 iki yolda da geri alınmaz. Down dosyaları yalnız dilin ya da bu korumaların kendisi geri alınırken kullanılır.
- Preview değişkenleri her durumda olduğu gibi kalır.

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

| #   | Down dosyası                                           | Ne zaman                                                                               | Reddettiği durum / kaybolan veri                                    |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 21  | `20261002100000_yedek_ve_ters_kayit_korumasi.down.sql` | yalnız bu korumalar geri alınırken; kod dönüşünde gerekmez (57c5b95 ile uyumlu)        | yok; B01 ve B03 korumaları kalkar, gövdeler 2 ve 13'ün hâline döner |
| 20  | `20261001100000_butik_varsayilan_dili.down.sql`        | dil geri alınırken; eski sürüm kolonu kullanmaz, kod dönüşünde gerekmez                | butiklerin seçtiği diller silinir (uygulama `'az'`'a döner)         |
| 19  | `20260927100000_v2_asama_koprusu.down.sql`             | v2 geri alınırken                                                                      | yok; ilerletilmiş aşamalar ve geçmiş kayıtları kalır                |
| 18  | `20260926100000_odeme_islem_anahtari.down.sql`         | v2 geri alınırken                                                                      | yok; ödemeler kalır, yalnız işlem anahtarları silinir               |
| 17  | `20260925160000_not_sozlesmesi.down.sql`               | v2 geri alınırken                                                                      | yok; v2 notu yeniden fiziksel `ozel_not`'a yazılır (kolon gerekir)  |
| 16  | `20260925150000_siparis_guncelle.down.sql`             | **yalnız kod 16'dan önceki bir sürüme döndüyse**; yeni kodun düzenlemesi 16'yı çağırır | yok; yalnız bir fonksiyon                                           |
| 15  | `20260925140000_para_yazma_yetkisi.down.sql`           | v2 geri alınırken                                                                      | yok; A10/A11 gövdelerine döner (SUPER_ADMIN yeniden yazabilir)      |
| 14  | `20260925130000_kacaklar.down.sql`                     | v2 geri alınırken                                                                      | yok; yalnız iki salt okunur fonksiyon                               |
| 13  | `20260925120000_kasa_teslimleri.down.sql`              | v2 geri alınırken                                                                      | kasa teslimi varsa **reddeder**; kurye tahsilatları defterde kalır  |
| 12  | `20260925110000_odemeler.down.sql`                     | v2 geri alınırken                                                                      | ödeme varsa **reddeder**                                            |
| 11  | `20260925100000_siparis_sahibi_kurali.down.sql`        | v2 geri alınırken                                                                      | yok; A8 gövdesine döner                                             |
| 10  | `20260924150000_siparis_satirlari.down.sql`            | v2 geri alınırken                                                                      | v2 siparişi varsa **reddeder**                                      |
| 9   | `20260924140000_kurlar_ve_v2_ayarlari.down.sql`        | v2 geri alınırken                                                                      | kur ve v2 ayarı satırları tablolarla silinir: önce dışa aktarın     |
| 8   | `20260924130000_abd_satinalma.down.sql`                | rol kataloğu geri alınırken                                                            | yok; `ABD_SATINALMA` kullanıcıları ve davetleri olduğu gibi kalır   |
| 7   | `20260924120000_rol_katalogu.down.sql`                 | rol kataloğu geri alınırken                                                            | yok                                                                 |
| 6   | `20260923164650_awb_match_approvals.down.sql`          | AWB onayı geri alınırken; önce onay kaydını dışa aktarın (aşağıda)                     | onay tablosu ve kayıtları silinir                                   |
| 5   | `20260923023659_awb_match_confirmation.down.sql`       | 6'dan sonra                                                                            | yok; yalnız bir fonksiyon                                           |

- **Neden tek sıra:** 8'in down dosyası `tomnap_approve_awb_matches`'i 6'nın sürümüne geri yazar. 6 önce geri alınırsa bu fonksiyon, tablosu olmadan yeniden oluşur. Eski belgedeki "önce 6 → 5, sonra 15 → 7" sırası tam da bunu yapıyordu.
- **Kısmi geri alma:** Yalnız bir kısım geri alınacaksa da aynı sıranın başından başlanır ve istenen satırda durulur. Örneğin yalnız v2 için 21'den 7'ye inilir; kod yeni kalıyorsa 16 atlanır.
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

## Uygulama kaydı — Deploy 2 (26–27 Eylül 2026)

Codex R4 düzeltmeleri (#34, #35, #36) ve v2'nin Preview denemesi. Veritabanı ve Vercel panelindeki işlemleri proje sahibi yaptı; sıra, komutlar ve doğrulama bu oturumda hazırlandı. Yeni migration yok; veriye yazan SQL çalıştırılmadı.

**Önce:** Canlı `4abd002` (`tomnap-n8n79hcpm`).

**Yedek:** `yedek-al.sh` artık her çalıştırmada tarih-saatli yeni bir klasöre yazar. Session pooler üzerinden roller, şema ve veri; SHA256 doğrulandı. `siparisler` 24, `kullanicilar` 6, defterler boş. `odemeler` kendine başvurduğu (ters kayıt) için veri dökümü geri yüklenirken `--disable-triggers` gerekir.

**Durum sorgusu:** Tek satırlık özet, panoya `LANG=en_US.UTF-8 pbcopy` ile ve bayt karşılaştırmasıyla. Sonuç: migration 18/18, gerekli kolonlar 32/32 (`guncellenme_tarihi` dahil), `ozel_not` yok (beklenen), kodlama kalkanının iki satırı `true`.

**Aşama 1 — Production:**

1. `main` `a8e6c88`'in temiz worktree'sinden `vercel deploy --prod`: deployment `tomnap-or0ji7srt`, `tomnap.com` ve `www.tomnap.com` ona bağlı. Derleme günlüğü: v2 kabuğu ve AWB paneli pakette yok. Sunulan pakette baskı CSP'si, iframe sandbox'ı ve ödeme uyarısı var.
2. Smoke test:

| Adım                           | Sonuç                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1–3, 5–7 (curl)                | ✅ başlıklar, health GET/HEAD, manifest, oturumsuz 401, `X-Forwarded-Uri` yok sayıldı, `/api/v2/durum` 404                 |
| 4. Giriş (proje sahibi)        | ✅ PATRON; sipariş, müşteri, firma, kurye ve inbox listeleri 200                                                           |
| 8. Kayıtlar                    | ✅ 5xx ve error yok; `kargo/senkronize-et` 409 bilerek (canlı kargo hesabı yokken simülasyon siparişe yazılmaz)            |
| Bakü tahsilat yazdırma (F20)   | ✅ Brave (Chromium 154): yazdırma penceresi açıldı, 13 satır ve toplam doğru, Azerbaycan harfleri düzgün. Safari denenmedi |
| AI ödemeli mesaj, PATRON (#36) | ✅ Görsel masada otomatik kayıt: alınan 50, kalan 70, uyarı yok                                                            |

**Aşama 2 — v2 Preview:**

- `v2-deneme` dalı `main`'den açıldı; yedi değişken yalnız Preview + `v2-deneme` hedefiyle girildi (ilk denemede altısı yanlışlıkla bütün Preview'lara açıldı, derleme olmadan daraltıldı). Boş bir commit ile derlendi: `tomnap-d1sz4efwm`, adres `tomnap-git-v2-deneme-azinteco.vercel.app`, Deployment Protection açık.
- Denemede canlı demo verisine yazılanlar: bir v2 siparişi ("DENEME Müştəri", 10 AZN), 1 AZN butik ödemesi ve ters kaydı (defterde iki satır), bir not düzenlemesi, bir kurye ataması.

| Adım                                   | Sonuç                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Erişim, `APP_URL`                      | ✅ Vercel girişi, sonra PATRON girişi 200; `/api/v2/durum` 200 (Production 404)                           |
| Kabuk, rol sekmeleri                   | ✅ PATRON, SATIS_SORUMLUSU, KANADA_SATINALMA, BAKU_FINANS beklenen sekmeler; kurye kendi ekranına düşüyor |
| v2 siparişi                            | ✅ 201; eski tabloda "v2" rozetiyle, not `[TƏLİMAT]` etiketinde                                           |
| AI satır önerisi                       | ✅ 200; belirsiz fiyatı tahmin etmeyip "fiyatı yok" uyarısı verdi (tasarım)                               |
| Ödeme ve ters kayıt                    | ✅ 201/201; v2 ve eski tabloda ödenen 1 → 0, KISMI_ODEME → BEKLIYOR                                       |
| v1'den v2 siparişinin notunu düzenleme | ✅ 200                                                                                                    |
| Satış: `kurye-bakiyeleri`              | ✅ 403 (konsoldan)                                                                                        |
| Kurye nakdi, kasa teslimi, Q4          | ⛔ yapılamıyor: v2 siparişi Bakü dağıtımı aşamasına geçemiyor                                             |
| SUPER_ADMIN salt okuma                 | ⛔ ekrandan denenemedi: v2'de butik seçici yok                                                            |
| Kayıtlar                               | ✅ 5xx ve error yok                                                                                       |

**Bulunan hatalar (Deploy 2'den gelmiyor):**

1. v2 siparişinin lojistik aşamasını ilerleten bir yol yok; kurye nakdi, kasa teslimi ve Q4 uçtan uca çalışamaz. Karar gerekiyor.
2. SUPER_ADMIN için v2'de butik seçici yok.
3. Service worker adres çubuğundan açılan `/api/` ve `/uploads/` adreslerini uygulama sayfasıyla yanıtlıyor (Production'da da; yeni sekmede açılan bir dosya bağlantısı dosya yerine uygulamayı gösterir).
4. Gelen kutusu yetkisi olmayan roller (satın alma, finans) açılışta 403 alıp "Gələn qutunun tam sayı yüklənmədi" uyarısı görüyor.
5. v2 listesinde sahip seçemeyen rollerde "Sahib" sütunu kullanıcı kodunu gösteriyor.
6. Görsel masada otomatik kayıttan sonra taslak ve "Bu Taslağı Onayla" açık kalıyor; basılınca aynı sipariş ikinci kez yazılıyor (Aşama 1'de oldu: "Aytən xanım" iki kez).

**Açık kalanlar:**

- `v2-deneme` değişkenleri yerinde; Production'da bayrak yok, `/api/v2/durum` 404. v2'yi Production'da açma kararı proje sahibinin.
- Çift "Aytən xanım" siparişi ve DENEME kayıtları demo verisinde duruyor; silinmedi.
- Vercel CLI 48.10.2 eski.

## Uygulama kaydı — Deploy 3 (27 Eylül – 1 Ekim 2026)

#37–#42 (R4 T1–T3, service worker, gelen kutusu, kargo butik seçici, v2 aşama köprüsü ve butik seçici, silme kuralı) ve v2'nin Preview'da uçtan uca denemesi. Veritabanı ve Vercel panelindeki işlemleri proje sahibi yaptı; sıra, komutlar ve doğrulama bu oturumda hazırlandı. Veriye yazan SQL çalıştırılmadı; migration 19 yalnız yeni bir fonksiyon ekler.

**Önce:** Canlı `a8e6c88` (`tomnap-or0ji7srt`).

**Yedek:** 27 Eylül 17:48 (+04), Deploy 2'deki yolla. `siparisler` 27 (24, çift "Aytən xanım" ve Deploy 2'nin DENEME siparişi), `odemeler` 2, `siparis_satirlari` 1; SHA256 doğrulandı. Şema dökümünün SHA256'sı Deploy 2'dekiyle aynı.

**Durum sorgusu:** 19 satıra genişletildi; pano `LANG=en_US.UTF-8 pbcopy` ve bayt karşılaştırmasıyla. Önce: migration 18/19 (yalnız 19 yok), gerekli kolonlar 32/32, `guncellenme_tarihi` var, `ozel_not` yok, kodlama kalkanının iki satırı `true`.

**Aşama 1 — Production:**

1. Migration 19 (`20260927100000_v2_asama_koprusu`) SQL Editor'da: "Success. No rows returned". Durum: **19/19**, diğer satırlar aynı.
2. `main` `57c5b95`'in temiz worktree'sinden `vercel deploy --prod`: deployment `tomnap-7ia325m4u` (27 Eylül), `tomnap.com` ve `www.tomnap.com` ona bağlı. Derleme günlüğü: v2 kabuğu ve AWB paneli pakette yok; service worker kontrolü geçti. Geri dönüş hedefi `tomnap-or0ji7srt`; migration 19 geri alınmaz, eski sürüm onu kullanmıyor.
3. Smoke test:

| Adım                                   | Sonuç                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–3, 5–7 (curl)                        | ✅ başlıklar, health GET/HEAD, manifest, oturumsuz 401, `X-Forwarded-Uri` yok sayıldı, `/api/v2/durum` 404                                       |
| Service worker                         | ✅ sunulan `sw.js`'te `/api/` ve `/uploads/` hariç; Safari'de adres çubuğundan `/api/health` sunucuya ulaştı                                     |
| 4. Giriş (proje sahibi)                | ✅ PATRON; kargo manifestosu 27 siparişle açıldı                                                                                                 |
| Yazdırma                               | ✅ Brave: manifesto 2 sayfa, paket etiketleri 3 sayfa. Safari: manifesto yazdırma penceresi. Bakü tahsilat Safari'de ayrıca denenmedi (aynı yol) |
| Telefon                                | ✅ tek liste (kartlar); borçlu kartlarda "Qalıq", "Tam Ödənildi" yok                                                                             |
| 8. Kayıtlar (30 Eylül 08:29–08:44 UTC) | ✅ 5xx ve error yok; 401'ler yalnız giriş öncesi oturum kontrolleri                                                                              |

**Aşama 2 — v2 Preview, uçtan uca (30 Eylül – 1 Ekim):**

- `v2-deneme` `main` ile birleştirildi (`a414d6e`, `main`'den farksız) ve normal push edildi; Preview `tomnap-8vf1sa32q`. `/api/v2/durum`: Production 404, Preview 200.
- Denemede canlı demo verisine yazılanlar: bir v2 siparişi ("DENEME Uçdan uca", 1 satır, 5 AZN, not "DENEME"), üç aşama geçişi (geçmişte üç kayıt), bir kurye ataması, 2 AZN kurye tahsilatı, teslim (teslim alan "DENEME") ve 2 AZN kasa teslimi. Sipariş teslim edildi; müşterinin 3 AZN borcu kalıyor (Q4'te görünüyor).

| Adım                              | Sonuç                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2 siparişi (PATRON)              | ✅ 5.00 AZN, "Sifariş yadda saxlanıldı"                                                                                                                         |
| İki aşama (PATRON)                | ✅ `KANADA_DEPO`, sonra `ULUSLARARASI_KARGO`; her adımda onay penceresi                                                                                         |
| Bakü adımı (KANADA_SATINALMA)     | ✅ `BAKU_DAGITIM_ARKADAS`; son aşamada düğme yok. Menüsü yalnız "Sifarişlər" ve "Kurlar"                                                                        |
| Kurye ataması (PATRON, v1 detay)  | ✅ "Kuryer təyinatı saxlanıldı"                                                                                                                                 |
| Kurye nakdi, 2 AZN                | ✅ 201; kuryenin üzerinde 2.00, sipariş kalanı 3.00                                                                                                             |
| Teslim                            | ✅ 200; sipariş "Təhvil verilən"de, kalan 3.00                                                                                                                  |
| Q4 ve Q5 (BAKU_FINANS)            | ✅ Q4: DENEME 3.00, 0 gün. Q5: 24 saat eşiğinde boş, 0 saatte kurye 2.00                                                                                        |
| Kasa teslimi (BAKU_FINANS)        | ✅ 201; kurye toplanan 2.00, teslim 2.00, kalan 0.00                                                                                                            |
| SUPER_ADMIN, butik seçiciyle      | ✅ sipariş, defter (2.00 nağd, kaynak kurye), kurye bakiyesi ve Q4 okunuyor; "Növbəti mərhələ", ödeme formu, "Geri qaytar" ve "Təhvil al" yok; yazma isteği yok |
| v1 menüsünde "TOMNAP v2"          | ✅ görünüyor; v2'den dönüşte butik seçimi korunuyor                                                                                                             |
| Kayıtlar (1 Ekim 04:49–05:17 UTC) | ✅ 5xx ve error yok; yazmalar yalnız tahsilat 201, teslim 200, kasa teslimi 201. Tek uyarı süresi dolmuş bir oturumun çıkışı (401)                              |

30 Eylül'deki sipariş ve aşama adımları kayıt dışa aktarımında yok; ekranda sunucu yanıtı ve yeniden yüklenen listeyle doğrulandı.

**Bulunan hatalar (hepsi ekran düzeyinde; para ve yetki doğru):**

1. Kargo manifestosunun üst bölümü (768 px ve üstü): düğme grubu küçülmüyor (`shrink-0`), başlık dar bir sütuna sıkışıyor, Safari'de "Package Labels (Barcode)" kesiliyor. Etiketlerde İngilizce ve Azerbaycan dili karışık.
2. v1 sipariş detay penceresinde Türkçe, Azerbaycan dili ve İngilizce karışık ("Close", "Save Details").
3. Kurye ekranı: "Nağd aldım"dan sonra sipariş kartındaki "Qalıq məbləğ" yenilenmiyor (5.00 kalıyor, nakit bölümü 3.00 gösteriyor). Teslimden ya da "Yenilə"den sonra doğru.
4. Kurye ekranı: "Gözləyən (n)" sayıyı gösteriyor, "Təhvil verilən" göstermiyor.
5. v2 Kassa tablosu: sağa yaslı "Qalıq" ile sola yaslı "Vəziyyət" arasında boşluk yok ("3.00 AZNQismən").
6. v2 Kassa: kasaya teslimden sonra kuryenin paneli boş açık kalıyor, altında pasif "0.00 AZN kassaya təhvil al".

**Not:** SUPER_ADMIN v2'de sipariş formunu görüyor ve sahibi seçmeden kaydedemiyor. Bu OQ 24 kararı, hata değil.

**Sonra:** `canli-57c5b95` dalı açıldı; Codex'in sonraki incelemesi buradan karşılaştırır. Taslak #26 (`canli-90b8eae` → `main`) yorumla kapatıldı, merge edilmedi.

**Açık kalanlar:**

- 1–6 ayrı, küçük bir PR'da.
- DENEME kayıtları (iki v2 siparişi, defter satırları, kasa teslimi) ve çift "Aytən xanım" demo verisinde duruyor; silinmedi. Defterler append-only.
- v2 Production'da kapalı, `v2-deneme` değişkenleri yerinde. Production'da açma kararı proje sahibinin.
- Migration 19 GEÇİCİ (OQ 38): Faz C'de birim ekseni gelince kaldırılacak.
- Vercel CLI 48.10.2 eski (güncel 61.x).
