import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Hand-tuned vendor splits. The single-bundle build was 3.6 MB raw /
        // 1.05 MB gzip and exceeded Vite's 500 kB warning — most of that is
        // heavy file-format libraries that aren't on the initial-render path.
        // Splitting lets the browser parallelise the downloads (HTTP/2) and
        // — more importantly — invalidates each vendor independently when
        // Vue components churn.
        manualChunks: {
          // The Vue core runtime + state + router stays in the critical path.
          // It's small (~150 kB) and every page needs it.
          'vendor-vue': [
            'vue',
            'vue-router',
            'pinia',
            '@tanstack/vue-query',
            '@vueuse/core',
            'vue-sonner',
            'vuedraggable',
          ],
          // Canvas-mode dependency tree. Loaded only when the user picks the
          // Canvas view — but Vite ships it eagerly today, so put it in its
          // own chunk so it can be cached separately from app code.
          'vendor-flow': [
            '@vue-flow/core',
            '@vue-flow/background',
            '@vue-flow/controls',
            '@vue-flow/minimap',
            '@vue-flow/node-resizer',
          ],
          // The big one: PDF-handling libraries. Together these are >1 MB.
          // Only used when a user uploads / exports a PDF.
          'vendor-pdf': ['pdfjs-dist', 'jspdf'],
          // Office document handling — DOCX in / out.
          'vendor-docx': ['docx', 'mammoth'],
          // Spreadsheets.
          'vendor-excel': ['exceljs'],
          // Archive handling.
          'vendor-archive': ['jszip'],
          // Icon set (~5800 icons, but tree-shaken at import). Pinning gives
          // a stable cache slot for the icons that survive tree-shaking.
          'vendor-icons': ['@lucide/vue'],
        },
      },
    },
    // Raise the per-chunk warning threshold to 1 MB now that the splits
    // bring main chunk well below it. Anything heavier than 1 MB after
    // splitting is genuinely worth investigating.
    chunkSizeWarningLimit: 1024,
  },
});
