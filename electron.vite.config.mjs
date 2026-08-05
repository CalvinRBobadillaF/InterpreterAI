import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.js') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.js') }
      }
    }
  },
  renderer: {
    base: './',
    resolve: {
      alias: { '@renderer': resolve('src/renderer/src') }
    },
    plugins: [react()],
    server: {
      proxy: {
        '/deepl-api': {
          target: 'https://api-free.deepl.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/deepl-api/, '')
        }
      }
    }
  }
})