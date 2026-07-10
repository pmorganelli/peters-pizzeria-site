import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In production Vercel serves api/ as serverless functions; locally the
    // same handlers run in scripts/dev-api.mjs (npm run dev:api).
    proxy: {
      '/api': 'http://localhost:3010',
    },
  },
});
