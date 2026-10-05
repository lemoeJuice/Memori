import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative paths work both on GitHub Pages project sites and custom domains.
  base: './',
  plugins: [
    vue({ include: [/\.vue$/] }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2,webmanifest}'],
      },
    }),
  ],
})
