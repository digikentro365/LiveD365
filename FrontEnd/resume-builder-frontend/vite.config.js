import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/', // 👈 This line ensures proper routing support on Vercel
  plugins: [react()],
  // Remove the server.proxy since Vercel doesn't use it in production
  // (Proxy is only for local dev; API calls in prod use VITE_API_BASE_URL)
  server: {
    port: 5173, // Explicitly set dev server port (optional)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Optional: Optimize build for Vercel
  build: {
    outDir: 'dist', // Explicitly set output directory (Vercel expects this)
    emptyOutDir: true, // Clear old files on build
  }
})