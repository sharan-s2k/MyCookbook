import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    hmr: {
      clientPort: 3000,
    },
    watch: {
      usePolling: false,
    },
    // ✅ Allow access when the site is opened via your ngrok URL
    // {
    allowedHosts: [
      'somatic-joleen-perorative.ngrok-free.dev',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
    // }
    // frontend/.env.local is made only for ngrok
  },
})
