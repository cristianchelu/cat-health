import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
//
// `base: './'` + PWA: both are intentional. Relative `base` keeps built `/assets/...`
// from being emitted as origin-root paths (which ignore `<base href>` and break Home
// Assistant ingress). The PWA (manifest + Workbox) still runs on `vite build`; scope
// and `start_url` stay relative so installability works from a subpath without claiming
// the whole host. (Regression note: `base` was `./` until d8312f4 briefly set `/` for PWA.)
//
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      manifestFilename: 'manifest.json',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Pet Assistant - Cat Health Monitor',
        short_name: 'Pet Assistant',
        description:
          "Monitor your cat's health through smart litterbox and water fountain analysis",
        display: 'standalone',
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['health', 'lifestyle', 'utilities'],
        shortcuts: [
          {
            name: 'Overview',
            short_name: 'Overview',
            description: 'View pet health overview',
            url: './',
            icons: [{ src: 'icons/icon-96x96.png', sizes: '96x96' }],
          },
          {
            name: 'Health',
            short_name: 'Health',
            description: 'View detailed health metrics',
            url: './health',
            icons: [{ src: 'icons/icon-96x96.png', sizes: '96x96' }],
          },
          {
            name: 'Devices',
            short_name: 'Devices',
            description: 'Manage connected devices',
            url: './devices',
            icons: [{ src: 'icons/icon-96x96.png', sizes: '96x96' }],
          },
        ],
      },
      workbox: {
        // Precache built assets; png covers `public/` icons copied into dist (no separate icons/*.png glob).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
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
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      // Service worker + precache apply to production builds. Enable here to debug SW in dev.
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  server: {
    allowedHosts: ['dev-pets.chelu.dev'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,

        configure: (proxy) => {
          // Disable connection pooling to prevent connection reuse issues
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'close');
          });
        },
      },
    },
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
