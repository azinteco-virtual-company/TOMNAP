# TOMNAP — Global Cross-Border Commerce & Parcel Logistics Platform

> **TOMNAP**, sınır ötesi e-ticaret (cross-border commerce), çok kanallı sipariş yönetimi, yapay zeka destekli otomasyon ve son kilometre kapıya teslim lojistiğini uçtan uca yöneten kurumsal bir SaaS platformudur.

### 🧭 Marka Manifestosu (TOMNAP)

- **T – Track:** Canlı kargo ve AWB barkod takibi
- **O – Order:** Instagram, WhatsApp ve çok kanallı sipariş yönetimi
- **M – Manage:** Butikler, müşteriler, kuryeler ve kargo entegrasyonu
- **N – Navigate:** Kanada, Japonya, ABD veya dünyanın her yerinden gümrük ve rota planlama
- **A – Automate:** AI destekli görsel/metin okuma ve otomatik durum güncellemeleri
- **P – Parcel:** Son kilometre kapıya teslim ve tahsilat

> Güvenlik durumu ve aşamalı iyileştirme planı: [yeniden inceleme](docs/SECURITY_RECHECK.md). Bu dal üretime hazırlık çalışmalarını içerir; kalan oturum/yetkilendirme engelleri raporda listelenmiştir.

## 🚀 Özellikler

- **AI Destekli Sipariş Ayrıştırma:** Google Gemini 2.5 Flash entegrasyonu ile WhatsApp mesajları, görseller veya bağlantılardan müşteri, ürün, fiyat ve adres bilgilerini otomatik ayrıştırma.
- **Tenant desteği:** Firma bazlı veri alanları mevcut; sunucu oturumu, rol ve tenant yetkilendirmesi henüz tamamlanmadı.
- **Finans & Kâr-Zarar Analitiği:** Toronto alış (CAD) ve Bakü tahsilat (AZN) kurları üzerinden dinamik ciro, net kâr marjı, kargo maliyeti ve alacak takibi.
- **Bakü Son Mil Teslimatı:** Kurye zimmetleme, teslimat durumu güncelleme ve canlı kurye masası.
- **Kargo Manifesto & Çeki Listesi:** Otomatik PDF manifesto ve Excel çeki listesi dışa aktarımı.
- **Veri saklama:** Supabase ve yerel bellek/dosya yolları birlikte kullanılıyor; kesinti ve çoklu sunucu tutarlılığı için ek çalışma gerekiyor.
- **PWA Desteği:** Masaüstü ve mobilde çevrimdışı önbellekleme ve uygulama olarak yüklenebilme.

---

## 🛠️ Teknoloji Yığını

| Katman               | Teknolojiler                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Frontend**         | React 19, TypeScript, React Router v7, Zustand, Tailwind CSS v4, Lucide Icons, Recharts, Motion |
| **Backend**          | Node.js 22, Express, TypeScript, Helmet, Express-Rate-Limit                                     |
| **Yapay Zeka**       | Google Gemini 2.5 Flash (`@google/genai`)                                                       |
| **Veritabanı**       | Supabase (PostgreSQL) + Local In-Memory Fallback                                                |
| **Test & Kalite**    | Vitest, Supertest, Prettier, TypeScript tip kontrolü (strict henüz kapalı)                      |
| **DevOps & Dağıtım** | Docker (Multi-stage build), Docker Compose, GitHub Actions CI/CD                                |

---

## 📁 Proje Dizin Yapısı

```
TOMNAP/
├── .github/workflows/ci.yml   # Otomatik test & derleme CI pipeline'ı
├── docs/
│   └── API.md                 # REST API referans dokümantasyonu
├── src/
│   ├── components/            # React UI bileşenleri
│   │   ├── finans/            # Finans ve trend analitik modülleri
│   │   ├── UstBaslik.tsx      # Üst navigasyon barı
│   │   ├── YanMenu.tsx        # Ana menü navigasyonu
│   │   └── ...
│   ├── context/               # Dil (i18n) konteksti (AZ, TR, EN, RU)
│   ├── store/                 # Zustand küresel durum yönetimi
│   ├── server/                # Modüler Express backend
│   │   ├── config.ts          # Ortam değişkenleri ve konfigürasyon
│   │   ├── logger.ts          # Yapılandırılmış JSON logger
│   │   ├── middleware/        # Güvenlik, rate limiter, auth, error handler
│   │   ├── routes/            # Sipariş, müşteri, inbox, firma, kurye rotaları
│   │   ├── services/          # Gemini, Supabase, sipariş formatlama
│   │   └── index.ts           # Express uygulama fabrikası
│   ├── types/                 # TypeScript veri modelleri
│   ├── App.tsx                # Ana uygulama ve sayfa yönlendirici
│   └── main.tsx               # React giriş noktası (BrowserRouter ile)
├── tests/                     # Vitest birim ve entegrasyon testleri
│   ├── client/                # Frontend Zustand testleri
│   └── server/                # Middleware, servis, rota ve logger testleri
├── Dockerfile                 # Multi-stage production container
├── docker-compose.yml         # Konteyner orkestrasyonu
├── server.ts                  # Geriye uyumlu sunucu başlatıcı
└── package.json
```

---

## ⚡ Hızlı Başlangıç

### 1. Gereksinimler

- **Node.js:** v22.x (package.json gereksinimi)
- **npm:** v10+

### 2. Kurulum

```bash
# Depoyu klonlayın
git clone https://github.com/your-org/tomnap.git
cd tomnap

# Bağımlılıkları yükleyin
npm install
```

### 3. Ortam Değişkenleri (.env)

Kök dizinde `.env` dosyasını oluşturun:

```bash
cp .env.example .env
```

Gerekli anahtarları yapılandırın:

```env
PORT=3000
NODE_ENV=development

# Güvenlik & Kimlik Doğrulama
API_SECRET_KEY=gelistirme_anahtari_veya_guclu_prod_key

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Veritabanı
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Geliştirme Sunucusunu Başlatma

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılacaktır (Hot Module Replacement ve Vite dev server etkindir).

---

## 🧪 Testleri Çalıştırma

Platformda 44 adet otomatik test bulunmaktadır (güvenlik, sanitizasyon, SSRF, rota entegrasyonu, Gemini AI mockları, Zustand store ve logger testleri):

```bash
# Testleri çalıştır
npm test

# TypeScript tip kontrolü
npm run lint

# Kodu biçimlendir
npm run format
```

---

## 🐳 Docker ile Dağıtım

### Docker Compose ile Tek Komutta Çalıştırma:

```bash
docker-compose up -d --build
```

Konteyner otomatik olarak:

1. Multi-stage build ile frontend ve backend'i derler.
2. Sağlık kontrolünü (`/api/sistem-durum`) 30 saniyede bir icra eder.
3. Güvenlik gereği izole `node` kullanıcısı ile çalışır.
4. `3000` portundan servise açılır.

Logları izlemek için:

```bash
docker-compose logs -f
```

---

## 🔒 Güvenlik Mimarisi

- **Helmet Güvenlik Başlıkları:** XSS, clickjacking ve MIME sniffing saldırılarına karşı aktif başlıklar.
- **Hız Sınırlandırma (Rate Limiting):** Genel API için 150 istek/15dk, AI işlemleri için 10 istek/1dk sınırlandırması.
- **SSRF Koruması:** `urlGuvenlimi` filtresi ile yerel ağ (localhost, 127.0.0.1, 10.x, 192.168.x, 169.254.x) IP'lerine proxy ve görsel çağrıları engellenmiştir.
- **Path Traversal Önleme:** `sanitizeDosyaAdi` ve `yolGuvenlimi` ile dosya yükleme ve erişimlerinde dizin atlama (`../`) engellenmiştir.
- **API Key Kimlik Doğrulama:** Prodüksiyon modunda tüm `/api/*` uç noktaları `X-API-Key` zorunluluğuna tabidir.

---

## 📖 API Dokümantasyonu

Tüm API uç noktaları, istek gövdeleri ve örnek yanıtlar için [docs/API.md](docs/API.md) dosyasına başvurun.

---

## 📄 Lisans

Bu proje tescilli ve özel bir yazılımdır. İzinsiz kopyalanamaz veya dağıtılamaz.
