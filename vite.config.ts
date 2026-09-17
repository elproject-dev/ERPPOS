import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/elproject/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@workspace/api-client-react": path.resolve(import.meta.dirname, "src/mocks/api-client-react.ts"),
      "stream": path.resolve(import.meta.dirname, "src/mocks/stream-mock.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Memisahkan library Excel yang ukurannya sangat besar ke chunk tersendiri
          if (id.includes('xlsx-js-style') || id.includes('exceljs') || id.includes('xlsx')) {
            return 'excel-vendor';
          }
          // Memecah sisa kode dari node_modules menjadi beberapa file terpisah
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'react-vendor';
            if (id.includes('@tauri-apps')) return 'tauri-vendor';
            if (id.includes('lucide-react')) return 'icons-vendor';
            if (id.includes('@supabase')) return 'supabase-vendor';
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    open: true,
    strictPort: true,
    allowedHosts: [
      "directed-zigzagged-haunt.ngrok-free.dev",
      ".ngrok-free.dev",
      ".ngrok.io",
      "localhost",
    ],
  },
});
