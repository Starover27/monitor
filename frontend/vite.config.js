import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s*crossorigin/g, '');
      }
    }
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://localhost:80',
        changeOrigin: true,
      },
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
        },
      },
    },
  },
})
