import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Loop Me In',
        short_name: 'Loop Me In',
        description: 'A shared calendar and lists, just for the two of you.',
        theme_color: '#33502e',
        background_color: '#f6f8f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Same-origin app shell + API proxy; the API's own responses are
        // never cached, so a stale event list is never served offline.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    // Proxying keeps the browser on one origin in dev, so the app never
    // depends on CORS. The API still enables CORS for the future mobile app.
    // Target is configurable so the web app can be pointed at an API on
    // another port or machine without editing this file.
    proxy: {
      '/api': process.env['API_URL'] ?? 'http://localhost:3031',
    },
  },
  // @date-calendar/core is a workspace package shipped as TypeScript source.
  // Excluding it from pre-bundling lets Vite transpile it and hot-reload edits.
  optimizeDeps: {
    exclude: ['@date-calendar/core'],
  },
});
