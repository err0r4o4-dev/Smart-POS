import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    ws: process.env.SMARTPOS_HMR_CLIENT_PORT
      ? { clientPort: Number(process.env.SMARTPOS_HMR_CLIENT_PORT) }
      : undefined,
    proxy: {
      '/api': process.env.SMARTPOS_API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
      '/health':
        process.env.SMARTPOS_API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
