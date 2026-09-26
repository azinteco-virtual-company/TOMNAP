# Codex R3 bulguları — kararlar (26 Eylül 2026)

Codex, canlı → `main` farkını (`0844d9c`) bağımsız inceledi. Proje sahibi bulguları koda
karşı kontrol etti. Her bulgu burada ayrıca yeniden doğrulandı; doğrulanmayanlar
belirtildi. Bu dosya kod içermez.

## Düzeltilenler

| Bulgu       | Karar                                                                                                             | PR  | Not                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1/F2       | v1 düzenleme yalnız değişen kolonları yazar; para, AWB ve `ek_veriler` iyimser kilitle; çakışmada 409             | #27 | Doğrulandı. AWB yarışı yalnız Kanada'yı geçmiş ve AWB'siz siparişte var. v2 defterinin K20 kolonları da eziliyordu. OQ 33                   |
| F9          | v2 siparişin `para_birimi`'si kilitli                                                                             | #27 | Doğrulandı                                                                                                                                  |
| OQ 32       | SUPER_ADMIN v1'de de tahsilatı değiştiremez                                                                       | #27 | Kapandı                                                                                                                                     |
| F14         | Detay formu alanları rol matrisinde; yalnız değişenler gider; "kaydedildi" sunucu yanıtından sonra                | #28 | Doğrulandı, bildirilenden kötü: gümrük alanları yanlış adla gidiyordu, hiç saklanamıyordu. Gümrük kimliği: PATRON + satın almacılar (OQ 34) |
| F8          | Tek not sözleşmesi: `baku_tahsilat_notu`'daki `[TƏLİMAT: …]` etiketi; v2 RPC'si etiketi yazar (migration 17)      | #29 | Doğrulandı. Yeni kolon eklenmedi, veri değişmedi. DEPLOY_1'e ön koşul kolon kontrolü eklendi (OQ 35)                                        |
| F15         | Ödeme yanıtı RPC'nin SQL toplamlarından; her ödeme niyetine veritabanında benzersiz işlem anahtarı (migration 18) | #30 | Doğrulandı; kurye tahsilatı da aynı durumdaydı. Gerçek PostgreSQL yarış testi (OQ 36)                                                       |
| F10         | v2 satırları ve defter kesin sayımla eksiksiz okunur; ödenen toplam SQL'den                                       | #30 | Doğrulandı: 200 × 6 satırda her sipariş bir satır kaybediyordu                                                                              |
| F11         | Boş kq qiyməti = silme; geçersiz metin = hata                                                                     | #30 | Doğrulandı                                                                                                                                  |
| F12 (K21)   | `demo_sandbox`'ta bütün `/api/v2` kapalı (404)                                                                    | #30 | Bildirilenden geniş: kurlar ve ayarlar dışında sipariş, ödeme, kasa, kaçaklar da açıktı                                                     |
| F13         | Kur ekranında ve sunucuda "bugün" Bakü tarihi                                                                     | #30 | Doğrulandı; sunucunun bir günlük payı da kaldırıldı                                                                                         |
| F18         | AWB paneli yalnız `VITE_FF_AWB_REVIEW` açıkken derlenir; derleme denetimi kapsıyor                                | #30 | Doğrulandı: panel yüklenmiyordu ama parçası derleniyordu                                                                                    |
| F16         | Geri dönüş hedefi: yeni kodun bayrakları kapalı sürümü; eski sürüm yalnız v2 verisi yoksa                         | #31 | DEPLOY_1 (e), (f); salt okunur v2 verisi sorgusu                                                                                            |
| F17         | Tek geri alma sırası 18 → 7 (16 koşullu), sonra 6 → 5; CI bu sırayı belgeden okuyup uygular                       | #31 | Doğrulandı: eski sırada 8'in down'ı `tomnap_approve_awb_matches`'i tablosuz geri yaratıyordu                                                |
| Canlı durum | Plan iki duruma göre yazıldı: (a) `90b8eae`, 1–4 yok; (b) `5a02836`, 1–4 var                                      | #31 | Hangisi olduğunu Vercel ve durum sorgusu söyler; ikisine de uymuyorsa durulur                                                               |

## Ertelenenler

| Bulgu | Karar          | Gerekçe                                                                                                                                                                                                                                                           |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3    | Durak 4 paketi | Doğrulandı: v1 siparişi açılışta yapay bir AWB alıyor (`POST /api/siparisler`, `uretUluslararasiKargoKodu()`). AWB incelemesi var olan AWB'nin üzerine yazmadığı için gerçek eşleşmeler zaten kaydedilemiyor. `FF_AWB_REVIEW` bu yayında kapalı (karar 26 Eylül). |
| F4    | Durak 4 paketi | AWB inceleme akışına ait; bayrak kapalıyken canlıda erişilemez. Bu turda ayrıntısı verilmedi, yeniden doğrulanmadı.                                                                                                                                               |
| F5    | Durak 4 paketi | Aynı gerekçe (AWB incelemesi, bayrak kapalı). Bu turda yeniden doğrulanmadı.                                                                                                                                                                                      |
| F6-v1 | Durak 4 paketi | Bulgunun v1 kısmı durak 4 işiyle birlikte ele alınacak (proje sahibinin kararı). Bu turda ayrıntısı verilmedi, yeniden doğrulanmadı.                                                                                                                              |
| F7    | Durak 4 paketi | AWB incelemesi, bayrak kapalı. Bu turda yeniden doğrulanmadı.                                                                                                                                                                                                     |
| T1    | Arayüz turu    | Kart ve tablo görünümlerinde ödeme gösterimi. Görünüm tutarlılığı; veri bütünlüğü riski yok.                                                                                                                                                                      |
| T2    | Arayüz turu    | Kanban filtresi. Yalnız gösterim.                                                                                                                                                                                                                                 |
| T3    | Arayüz turu    | Mobilde çift liste. Yalnız gösterim.                                                                                                                                                                                                                              |
| T4    | Arayüz turu    | Eski kâr raporu. v2 kâr hesabı sunucuya geçtiğinde (Faz D) ele alınacak; o zamana kadar rapor istemcideki kurla hesaplıyor.                                                                                                                                       |

**Doğrulanamayanlar:** F4, F5, F6-v1, F7 ve T1–T4 için Codex R3 raporu repoda yok ve bu turda
yalnız kimlikleri verildi. Kararlar proje sahibinin erteleme kararıdır; kodda yeniden
doğrulanmadılar.
