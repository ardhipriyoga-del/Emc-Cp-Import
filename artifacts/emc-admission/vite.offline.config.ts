/**
 * Offline single-file build configuration.
 * Output: dist-offline/index.html  →  copy to public/emc-admission-app.html
 *
 * Uses vite-plugin-singlefile to inline ALL JS + CSS into one HTML file
 * so it can be opened directly in Chrome without any server.
 */
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Relative base so asset paths resolve when opened as file://
  base: './',

  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, 'dist-offline'),
    emptyOutDir: true,
    // vite-plugin-singlefile needs these settings
    assetsInlineLimit: 100_000_000, // inline everything
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Put everything in one chunk
        inlineDynamicImports: true,
      },
    },
  },

  // No server config needed — this is build-only
});
