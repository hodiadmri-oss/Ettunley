import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // pdf.js is loaded on demand; bundling it up front stops the dev server from reloading the page
  // the first time a PDF is opened.
  optimizeDeps: { include: ['pdfjs-dist'] },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
