import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          // Disable connection pooling to prevent connection reuse issues
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'close');
          });
        },
      },
    },
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
