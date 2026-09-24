> Güncel paket: [Faz 5 — eksiksiz listeler, özel depolama ve tarayıcı CI](docs/PHASE5_RELIABILITY.md).

> Güncel güvenlik/kurulum paketi: [Faz 4 — şifreleme, kurye ve eski görsel geçişi](docs/PHASE4_SECURITY.md). Önceki raporlar kendi fazlarının anlık durumudur.

> **Faz 3 güncellemesi:** [İşlem bütünlüğü, güvenli yedek yükleme ve migration](docs/PERSISTENCE_SECURITY.md).

> **Güncel güvenlik kurulumu:** [Oturum, firma yetkileri ve migration](docs/SESSION_SECURITY.md).
> API için gerçek kullanıcı oturumu gerekir. İlk yönetici `npm run admin:bootstrap` ile oluşturulur.
> Eski admin/demo kodları ve anonim API anahtarı erişimi kaldırılmıştır.

# TOMNAP — Global Cross-Border Commerce & Parcel Logistics Platform

> **TOMNAP**, sınır ötesi e-ticaret (cross-border commerce), çok kanallı sipariş yönetimi, yapay zeka destekli otomasyon ve son kilometre kapıya teslim lojistiğini uçtan uca yöneten kurumsal bir SaaS platformudur.

### 🧭 Marka Manifestosu (TOMNAP)

- **T – Track:** Canlı kargo ve AWB barkod takibi
- **O – Order:** Instagram, WhatsApp ve çok kanallı sipariş yönetimi
- **M – Manage:** Butikler, müşteriler, kuryeler ve kargo entegrasyonu
- **N – Navigate:** Kanada, Japonya, ABD veya dünyanın her yerinden gümrük ve rota planlama
- **A – Automate:** AI destekli görsel/metin okuma ve otomatik durum güncellemeleri
- **P – Parcel:** Son kilometre kapıya teslim ve tahsilat

> Güvenlik durumu ve aşamalı iyileştirme planı: [yeniden inceleme](docs/SECURITY_RECHECK.md). Bu dal üretime hazırlık çalışmalarını içerir; üretim geçişi ve kalan işler güncel Faz 5 raporunda listelenmiştir.

## 🚀 Özellikler

- **AI Destekli Sipariş Ayrıştırma:** Google Gemini 2.5 Flash entegrasyonu ile WhatsApp mesajları, görseller veya bağlantılardan müşteri, ürün, fiyat ve adres bilgilerini otomatik ayrıştırma.
- **Tenant erişimi:** Sunucu oturumu, rol ve firma kapsamı API üzerinde doğrulanır. Veritabanı tarayıcı rollerine kapalıdır; üretim için migration gereklidir.
- **Finans & Kâr-Zarar Analitiği:** Toronto alış (CAD) ve Bakü tahsilat (AZN) kurları üzerinden dinamik ciro, net kâr marjı, kargo maliyeti ve alacak takibi.
- **Bakü Son Mil Teslimatı:** Kurye zimmetleme, teslimat durumu güncelleme ve canlı kurye masası.
- **Kargo Manifesto & Çeki Listesi:** Otomatik PDF manifesto ve Excel çeki listesi dışa aktarımı.
- **Veri saklama:** Supabase yapılandırıldığında kalıcı işlemler DB üzerinden yürür; hata halinde yerel veriye geçilmez. Yerel geliştirme siparişleri geçicidir. Özel görseller için Supabase Storage seçeneği vardır.
- **PWA Desteği:** Masaüstü ve mobilde çevrimdışı önbellekleme ve uygulama olarak yüklenebilme.

---

## 🛠️ Teknoloji Yığını

| Katman               | Teknolojiler                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Frontend**         | React 19, TypeScript, React Router v7, Zustand, Tailwind CSS v4, Lucide Icons, Recharts, Motion                 |
| **Backend**          | Node.js 22, Express, TypeScript, Helmet, Express-Rate-Limit                                                     |
| **Yapay Zeka**       | Google Gemini 2.5 Flash (`@google/genai`)                                                                       |
| **Veritabanı**       | Supabase (PostgreSQL/özel Storage); yerel geliştirme belleği/dosyaları                                          |
| **Test & Kalite**    | Vitest, Supertest, Playwright/Chromium, Prettier, TypeScript (strict henüz kapalı)                              |
| **DevOps & Dağıtım** | Vercel (statik istemci + Express serverless), GitHub Actions CI/CD; Docker yalnız yerel deneme (desteklenmiyor) |

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
├── Dockerfile                 # Yalnız yerel deneme konteyneri (desteklenmiyor)
├── docker-compose.yml         # Yalnız yerel deneme (desteklenmiyor, üretim yolu değil)
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
# Kargo için 32 rastgele baytlık anahtarlar; kurulum/geçiş: docs/PHASE4_SECURITY.md
CARGO_ENCRYPTION_KEYS={"cargo_2026":"64_HEX_KARAKTERLIK_RASTGELE_ANAHTAR"}
CARGO_ENCRYPTION_ACTIVE_KEY_ID=cargo_2026

# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Veritabanı
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Geliştirme Sunucusunu Başlatma

```bash
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılacaktır (Hot Module Replacement ve Vite dev server etkindir).

---

## 🧪 Testleri Çalıştırma

Güvenlik, rota, istemci, depolama ve taşıma testleri Vitest; gerçek tarayıcı senaryoları Playwright ile çalışır. Sayısal doğrulama sonuçları Faz 5 paket raporundadır:

```bash
# Testleri çalıştır
npm test

# Kapsam raporu
npm run test:coverage

# İzole Chromium senaryoları (önce build)
npm run build
npm run test:e2e:install
npm run test:e2e

# TypeScript tip kontrolü
npm run lint

# Kodu biçimlendir
npm run format
```

---

## 🚀 Dağıtım

Üretim dağıtım yolu **Vercel**'dir: istemci statik olarak, Express API ise
`api/index.js` serverless paketi olarak yayınlanır. `main` dalına push otomatik
production deploy'u tetiklemez (`vercel.json` → `git.deploymentEnabled.main: false`).
Canlıya çıkış listesi (commit'ler, migration'lar, ortam değişkenleri, smoke test,
geri alma): [docs/DEPLOY_1.md](docs/DEPLOY_1.md).

### Docker (desteklenmiyor)

`Dockerfile` ve `docker-compose.yml` yalnızca yerel deneme içindir; bakımı
yapılmaz ve üretimde kullanılmamalıdır.

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
