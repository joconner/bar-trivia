import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served under /tv/ in prod (nginx); root in dev (`vite dev`).
  base: '/tv/',
  plugins: [react()],
  server: {
    port: 5173,
    // Serve index.html for all routes so /ROOMCODE paths work
    historyApiFallback: true,
  },
});
