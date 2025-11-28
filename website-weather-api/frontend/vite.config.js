import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  //IMPORTANT: MAKE SURE BASE URL MATCHES CADDYFILE BASE URL
  base: '/home/',
  server: {
    host: true
  }
});
