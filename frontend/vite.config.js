import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Проксируем запросы к бэкенду FastAPI, чтобы избежать CORS в dev
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
    // Разделяем чанки: vendor обновляется редко — браузер кэширует его
    // между релизами портала, а код приложения грузится быстро.
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
