import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 10001,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:10002',
      '/health': 'http://localhost:10002',
    },
  },
})
