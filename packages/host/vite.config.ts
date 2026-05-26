import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Served under /host/ in prod (nginx); root in dev (`vite dev`).
  base: '/host/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      // PWA scope/start_url must match the deployed base so home-screen
      // installs land at /host/ and icons resolve.
      scope: '/host/',
      manifest: {
        name: 'Bar Trivia Host',
        short_name: 'Trivia Host',
        description: 'Run bar trivia nights from your phone',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/host/',
        icons: [
          {
            src: '/host/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/host/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  server: {
    port: 5175,
  },
})
