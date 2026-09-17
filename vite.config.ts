import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    {
      name: 'reject-public-private-uploads',
      configResolved(config) {
        const legacyUploads = path.join(config.root, 'public', 'uploads');
        if (
          fs.existsSync(legacyUploads) &&
          fs.readdirSync(legacyUploads).some((name) => name !== '.gitkeep')
        )
          throw new Error(
            'Move private files out of public/uploads before building. See docs/SESSION_SECURITY.md.'
          );
      },
    },
  ];

  // Only load VitePWA during production build to avoid createRequire('.') incompatibility in tsx dev server
  if (command === 'build') {
    const { VitePWA } = await import('vite-plugin-pwa');
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Kanada-Bakü Lojistik & Sipariş Yönetimi',
          short_name: 'KanadaBaku',
          description:
            'Kanada-Bakü e-ticaret sipariş, kargo manifestosu, kurye ve tahsilat yönetim sistemi.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          categories: ['business', 'logistics', 'productivity'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/uploads/**'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (
                id.includes('xlsx') ||
                id.includes('jspdf') ||
                id.includes('html2canvas') ||
                id.includes('canvg')
              ) {
                return 'vendor-documents';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (
                id.includes('react') ||
                id.includes('react-dom') ||
                id.includes('react-router-dom') ||
                id.includes('zustand')
              ) {
                return 'vendor-framework';
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      host: '127.0.0.1',
      fs: {
        strict: true,
        deny: [
          '**/.env',
          '**/.env.*',
          '**/*.{crt,pem}',
          '**/.git/**',
          ...['data', 'src/server', 'api', 'scripts', 'tests', 'work'].map(
            (name) => path.resolve(process.cwd(), name) + '/**'
          ),
          ...[process.env.DATA_DIR, process.env.UPLOADS_DIR]
            .filter(Boolean)
            .map((name) => path.resolve(name!) + '/**'),
        ],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
