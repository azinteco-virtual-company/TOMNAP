# ==========================================
# TOMNAP Multi-Stage Production Dockerfile
# ==========================================

# Aşama 1: Derleme (Build Stage)
FROM node:22-alpine AS builder

WORKDIR /app

# Paket tanımlarını kopyala
COPY package*.json ./

# Bağımlılıkları kur
RUN npm ci

# Kaynak kodları kopyala
COPY . .

# TypeScript tipi kontrolü ve production derlemesi
RUN npm run build

# ==========================================
# Aşama 2: Çalışma Ortamı (Production Runner)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Sadece prodüksiyon bağımlılıklarını yükle
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Public frontend ve özel sunucu çıktıları ayrı dizinlerde kalır.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build

# Uploads dizini oluştur ve izinleri node kullanıcısına devret
RUN mkdir -p /app/uploads && chown -R node:node /app

# Güvenlik için non-root kullanıcıya geç
USER node

# Port ve Healthcheck tanımları
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Uygulamayı başlat
CMD ["node", "build/server.cjs"]
