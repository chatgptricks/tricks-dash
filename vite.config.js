import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  // A developer .env.local may point Hooks at a local server. Production
  // builds must never ship that address (it once sent live searches to
  // 127.0.0.1), so builds always blank it; `vite` dev keeps it.
  define: command === 'build' ? { 'import.meta.env.VITE_HOOKS_API_BASE': JSON.stringify('') } : {},
  // Served from the apex of a custom domain (sentientdash.app), so assets
  // live at the root. This was '/tricks-dash/' when the site was hosted at
  // chatgptricks.github.io/tricks-dash/ -- the repo-name path segment that
  // GitHub Pages requires when there's no custom domain.
  base: '/',
  // Lets CI/local validation skip the 61MB static archive; normal production
  // builds retain Vite's default public-directory copy behavior.
  publicDir: process.env.VITE_SKIP_PUBLIC === '1' ? false : 'public',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 4175,
  },
  preview: {
    host: '0.0.0.0',
    port: 4175,
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        queue: resolve(__dirname, 'queue.html'),
        settings: resolve(__dirname, 'settings.html'),
        promos: resolve(__dirname, 'promos.html'),
        news: resolve(__dirname, 'news.html'),
        hooks: resolve(__dirname, 'hooks.html'),
        vault: resolve(__dirname, 'vault.html'),
        mobile: resolve(__dirname, 'mobile/index.html'),
      },
    },
  },
}));
