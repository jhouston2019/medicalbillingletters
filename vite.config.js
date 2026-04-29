import { defineConfig } from 'vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        success: resolve(__dirname, 'success.html'),
        app: resolve(__dirname, 'app.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        cancel: resolve(__dirname, 'cancel.html'),
        payment: resolve(__dirname, 'payment.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        examples: resolve(__dirname, 'examples.html'),
      },
    },
  },
})
