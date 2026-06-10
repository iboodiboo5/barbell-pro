import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from /barbell-pro/; dev stays at root
  base: command === 'build' ? '/barbell-pro/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Barbell Pro',
        short_name: 'Barbell',
        description: 'Workout companion',
        display: 'standalone',
        background_color: '#0a0a0f',
        theme_color: '#0a0a0f',
        icons: [
          // relative: resolved against the manifest URL, so they follow `base`
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  test: { environment: 'node' }
}))
