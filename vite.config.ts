import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev:ui` (Vite + hot reload) talks to the Worker run by `npm run dev`.
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
