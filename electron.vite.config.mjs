import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // ⬇️ AQUÍ AGREGAMOS LA CONFIGURACIÓN DEL PROXY ⬇️
    server: {
      proxy: {
        '/deepl-api': {
          target: 'https://api-free.deepl.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/deepl-api/, '')
        }
      }
    }
  }
})