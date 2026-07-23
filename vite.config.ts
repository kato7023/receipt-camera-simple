import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

const base = '/receipt-camera-simple/'

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(getCommitHash()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'レシートカメラ',
        short_name: 'レシート',
        description: '領収書を端末内だけで撮影・管理するPWA',
        theme_color: '#0B0D17',
        background_color: '#0B0D17',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 画像・メモを外部へ送信しない。静的アセットのみをPWAへキャッシュする。
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
})
