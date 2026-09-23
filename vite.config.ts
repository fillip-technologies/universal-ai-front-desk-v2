import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // CHOKIDAR_USEPOLLING=true (set by docker-compose.dev.yml) polls instead,
      // since host bind mounts don't deliver file-change events into containers.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
      // Proxy API calls to the FastAPI backend (run separately: uvicorn app.main:app --reload
      // from the backend/ directory, or set VITE_API_PROXY_TARGET to point elsewhere).
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
