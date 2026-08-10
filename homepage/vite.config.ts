import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // Die Seite ist unter / und unter /start/ erreichbar; alle Assets liegen
  // immer unter /start/, damit sie sich nicht mit Nextcloud unter / kreuzen.
  base: '/start/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/start/api': {
        target: 'http://localhost:2607',
        rewrite: (path) => path.replace(/^\/start/, ''),
      },
    },
  },
})
