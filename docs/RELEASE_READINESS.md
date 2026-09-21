# Faz 1–5 yayın hazırlığı

Beş faz birbirini izleyen commit ve SQL migration'larıdır. Tek bir inceleme dalı
üzerinden birlikte doğrulanır; yalnız bir fazı bağımsız olarak yayına almak
uygulama ile veritabanı sözleşmesini bozabilir.

## Sunucu çıktısı ve istemci dosyaları

Node sunucusu `build/server.cjs` altında derlenir. `dist/` yalnız tarayıcı
uygulamasını içerir. Üretim sunucusu eski `server.cjs`, kaynak haritası ve özel
dizin yollarını reddeder. `npm run check:client-artifacts` ayrıca statik dağıtım
klasöründe sunucu dosyası, kaynak haritası veya sembolik bağlantı bulunursa
derlemeyi durdurur. Bu kontrol Vercel'in doğrudan statik dosya sunmasını da
kapsamak için uygulama middleware'inden bağımsızdır.

Docker aynı dizin ayrımını kullanır ve sağlık kontrolünü oturum gerektirmeyen
`/api/health` üzerinden yapar. Tarayıcı test sunucusu üretimle aynı statik dosya
korumasını kullanır.

## İnceleme dalının yayın koşulu

`codex/release-phases-1-5` dalı için otomatik Vercel dağıtımı geçici olarak
kapalıdır. GitHub testleri çalışmaya devam eder. Önizleme ortamının üretim
veritabanı anahtarlarını miras almaması, migration zinciri ve özel Storage
kurulumu doğrulandıktan sonra bu dal kısıtı ayrı commit ile kaldırılır.
Diğer dalların dağıtım davranışı bu ayardan etkilenmez.

## Canlı geçişten önce tamamlanacak kontroller

1. Gerçek Supabase projesinde mevcut tablo/kolonlar, migration geçmişi, rol
   yetkileri ve kayıt sayıları salt okunur karşılaştırılır. Eski temel SQL
   dosyaları demo verisi ekleyebildiğinden canlıda tekrar çalıştırılmaz;
   eksik kolonlar varsa mevcut veriye uygun ek migration hazırlanır.
2. Yedek ve geri dönüş yolu doğrulanır. Eski istemcinin anonim erişimine dayanan
   canlı sürüm ile yeni sunucu/RLS geçişi birlikte planlanır. Yeni yetkilendirme
   altında ilk yönetici ve mevcut kullanıcıların giriş yapabildiği doğrulanır.
3. Sunucuya özel Supabase anahtarı, HTTPS `APP_URL`, kargo şifreleme anahtarları,
   e-posta sağlayıcısı ve `UPLOAD_STORAGE_BACKEND=supabase` doğru ortama atanır.
   `tomnap-private-images` bucket'ı API ile hazırlanır; varsa eski dosyaların
   sahipliği ve taşıma planı doğrulanır. Kaynak dosyalar otomatik silinmez.
4. Vercel Functions'ın 4,5 MB istek/yanıt sınırıyla görsel yükleme/indirme,
   yedekleme ve büyük liste cevapları uyumlu hale getirilir. Uygulamanın mevcut
   10 MiB görsel ve 32 MiB veri sınırları bu platform garantisi değildir.
   Storage'a yazmak, sunucudan geçen HTTP gövdesinin platform sınırını kaldırmaz.
5. Gerçek önizleme ortamında giriş/çıkış, iki firma izolasyonu, eşzamanlı
   değişiklikler, e-posta, Storage, yeniden başlatma ve hata koşulları denenir.
   Kabul sonuçları tamamlandıktan sonra ana dal ve canlı dağıtım güncellenir.

## Doğrulama — 21 Eylül 2026

- 52 test dosyasında 693 test geçti.
- Altı Chromium kabul senaryosu geçti.
- TypeScript kontrolü, üretim derlemesi ve statik paket denetimi geçti.
- Testler depo verisini değiştirmedi.
- SQL değişikliği yapılmadı; önceki 9 SQL paketi ve 18 eşzamanlı bağlantı
  senaryosu yerel doğrulamadır, canlı migration uygulanmış olduğu anlamına gelmez.

Kaynaklar: [Vercel Git dal ayarları](https://vercel.com/docs/project-configuration/git-configuration),
[Functions sınırları](https://vercel.com/docs/functions/limitations),
[Supabase migration iş akışı](https://supabase.com/docs/guides/deployment/database-migrations).
