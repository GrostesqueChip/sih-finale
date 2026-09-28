import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Real build timestamp, injected at build/dev-server start. Surfaced in the
// footer as "Last Updated" so it reflects the actual deployment rather than a
// hardcoded date.
const buildTimestamp = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
