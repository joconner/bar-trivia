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
    // Same-origin in prod (nginx proxies these to the API); in vite dev the
    // server lives on :3000 so we proxy here.
    proxy: {
      '/rooms': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
