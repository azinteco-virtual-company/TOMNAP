# TOMNAP — çalışma kuralları

GUARDRAIL — bu projedeki her görev için geçerli:
- DEMO VERİ: data/kullanicilar.json ve içindeki demo hesaplar, parolalar, aktivasyon
  token'ları tanıtım amacıyla BİLEREK oluşturulmuş ve bilerek git'te tutuluyor. Bunlar
  güvenlik bulgusu DEĞİLDİR. Bu dosyayı ve demo hesapları silme, git'ten çıkarma,
  .gitignore'a ekleme, token'larını geçersiz kılma, parolalarını değiştirme ya da
  "sızıntı" olarak raporlama. Demo hesaplarla giriş her değişiklikten sonra çalışmaya
  devam etmeli.
- ORTAM: Tek bir Supabase projesi var; ayrı staging ya da production yok. İçindeki
  verilerin TAMAMI da sunum için bilerek oluşturulmuş demo verisi; gerçek müşteri verisi
  yok. Veritabanındaki hiçbir kaydı silme, değiştirme ya da "temizleme". Migration'ları
  ve veri değiştiren komutları veritabanına ben uygularım.
- Stack: Vite + React (istemci), src/server altında Express (Vercel serverless), Supabase
  Postgres'e yalnızca sunucu service_role ile erişim. Bu mimariyi DEĞİŞTİRME.
- Testleri Node 22 ile çalıştır. Yalnızca Node 20'de ya da makine yükü altında zaman
  aşımıyla düşen bir testi "düzeltmek" için kod veya test DEĞİŞTİRME; önce testi tek başına
  Node 22'de çalıştır ve raporla.
- İsimle eşleştirme hiçbir zaman veritabanına OTOMATİK yazmaz. Eşleştirme yalnızca öneri
  üretir, kayıt insan onayıyla olur. İsim normalizasyonu Unicode-duyarlı olsun (ə, ş, ç,
  ğ, ı, ö, ü ve Kiril harfleri korunur); normalize edilince boş kalan değer hiçbir şeyle
  eşleşmez.
- Yapay zekaya (Gemini) asla toplu müşteri rehberi veya başka müşterilerin kişisel verisi
  gönderme. AI yalnızca verilen belgeden alan çıkarır; müşteri eşleştirme sunucuda yapılır.
- Var olan bir takip kodunun (AWB) üzerine yazma; teslim edilmiş siparişi değiştirme.
- Mevcut tabloları DEĞİŞTİRME, SİLME, YENİDEN ADLANDIRMA. Yalnızca yeni tablo/kolon ekle.
- Mevcut enum değerlerini (KANADA_SATINALIM_BEKLIYOR, KANADA_DEPO, ULUSLARARASI_KARGO,
  BAKU_DAGITIM_ARKADAS, TESLIM_EDILDI, ODENDI, KISMI_ODEME, BEKLIYOR) değiştirme.
  Yeni model bunları bir mapping ile karşılasın.
- Destructive SQL yazma: up migration'larda DROP, TRUNCATE, DELETE FROM ... (WHERE'siz)
  yasak. Down dosyalarında YALNIZCA aynı migration'ın oluşturduğu nesneler için
  DROP ... IF EXISTS serbest; önceden var olan hiçbir nesne düşürülmez.
- Yeni tablolar mevcut deseni izlesin: ENABLE + FORCE ROW LEVEL SECURITY, anon/authenticated
  rollerinden tablo ve kolon seviyesinde REVOKE, erişim yalnız service_role.
- Service_role RLS'yi aştığı için tenant izolasyonu UYGULAMA katmanında: her sorguda tenant
  filtresi zorunlu. Her yeni rota için 00-A'da yazılan awbMatchIsolation.test.ts desenine
  (00-E sonrası: ortak tenant izolasyon yardımcısına) uygun test yaz: başka tenant'ın verisi
  okunamamalı, listelenmemeli, yazılamamalı. Testi bir kez mutasyonla doğrula: tenant
  filtresini geçici kaldır, test düşmeli, geri al. DİKKAT: tests/server/isolation.test.ts
  ORTAM izolasyonunu test eder, tenant izolasyonunu değil; onu desen olarak kullanma.
- Her yeni API rotasını src/server/middleware/auth.ts allowlist'ine metod+yol+rol ile ekle.
  Listede olmayan rota zaten reddedilir; bunu bilerek yaz.
- Çok adımlı yazma işlemleri (eşleştirme, ödeme, teslim) transactional RPC fonksiyonu olsun.
- Her migration için geri alma (down) dosyası ve tests/sql altında SQL testi yaz.
- Yeni ekranları feature flag arkasına al: istemcide VITE_FF_V2_FLOW, sunucuda FF_V2_FLOW.
  Mevcut bir özelliği değiştiren HATA DÜZELTMELERİ bu genel bayrağa bağlanmaz; gerekiyorsa
  kendi bayrağı olsun. Bayrak kapalıyken mevcut bir özellik ortadan kalkıyorsa bunu
  raporda açıkça yaz.
- api/index.js ve api/[...all].js derlenmiş paketler ve git'te izleniyor. Sunucu kodu
  değiştiyse paketi yeniden derle ve AYRI bir commit olarak ekle. Bu dosyalarda merge ya da
  rebase çakışması çıkarsa elle çözme: kaynakları birleştir, paketi yeniden derle.
- main'e doğrudan commit atma; her prompt main'den açılan yeni bir dalda çalışsın.
- Her maddeyi ayrı commit olarak at. Push'u yalnız ben açıkça istediğimde yap; main'i asla
  push etme. git çalışmıyorsa dur ve bana söyle.
- Yeni kod TypeScript strict kurallarına uygun yazılsın (any ve ts-ignore yok).
- Yeni istemci bileşenleri 400 satırı geçmesin; geçiyorsa böl. Yeni v2 ekranları
  React.lazy ile yüklensin; ilk yük paketine girmesin.
- Emin olmadığın yerde kod yazma; varsayımını docs/OPEN_QUESTIONS.md dosyasına yaz ve sor.
- Bitirince: değiştirdiğin dosyaların listesi + neyi neden yaptığın + tsc, npm test ve SQL
  test sonuçları.
