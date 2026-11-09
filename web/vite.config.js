import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_PAGES === 'true' ? '/zsl-expenses/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'ZSL-Cestovny-prikaz.xlsx'],
      manifest: {
        id: './',
        name: 'ZSL Expenses',
        short_name: 'ZSL Expenses',
        description: 'Lokální vyúčtování soustředění a závodů',
        lang: 'cs',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        icons: [
          { src: 'icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
          { src: 'icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: base+'index.html',
        globPatterns: ['**/*.{html,css,js,svg,webp,png,xlsx}'],
        cleanupOutdatedCaches: true
      }
    })
  ]
});
