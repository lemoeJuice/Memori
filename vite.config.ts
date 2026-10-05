import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/memori/',
  plugins: [vue({ include: [/\.vue$/] })],
})
