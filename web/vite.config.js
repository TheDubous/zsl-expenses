import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        id: '/',
        name: 'ZSL Expenses',
        short_name: 'ZSL Expenses',
        description: 'Vyúčtování soustředění a závodů',
        lang: 'cs',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{html,css,js,svg,webp,png}'],
        cleanupOutdatedCaches: true
      }
    })
  ]
});
