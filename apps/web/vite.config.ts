import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { APP_NAME } from '../../packages/shared/src/constants/app';

/**
 * Inject a small constant (app name / any future tokens) into index.html
 * so the HTML stays in sync with the shared constants without duplication.
 *
 * This mirrors the theme-injection plugin pattern from ShiroAni.
 */
function appTokensPlugin(): Plugin {
  return {
    name: 'kireimanga-app-tokens',
    transformIndexHtml(html) {
      return html.replace('__APP_NAME__', APP_NAME);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), appTokensPlugin()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@kireimanga/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 15175,
    strictPort: true,
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (/\/(react|react-dom|react-router-dom|zustand)\//.test(id)) return 'vendor-react';
          if (id.includes('/@radix-ui/')) return 'vendor-radix';
          if (id.includes('/socket.io')) return 'vendor-socket';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
});
