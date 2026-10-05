import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative paths work both on GitHub Pages project sites and custom domains.
  base: './',
  plugins: [vue({ include: [/\.vue$/] })],
})
