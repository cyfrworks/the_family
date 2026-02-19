import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: '../',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/cyfr': {
        target: 'http://localhost:4000',
        rewrite: (path) => path.replace(/^\/cyfr/, '/mcp'),
        changeOrigin: true,
      },
    },
  },
})
