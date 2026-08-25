import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // `@/util/camera` beats `../../util/camera` once files nest a few deep
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: { outDir: 'build/scene' },
  server: { port: 5174, strictPort: true }
});
