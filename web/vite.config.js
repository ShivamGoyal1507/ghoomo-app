/* Vite configuration for React admin dashboard */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  base: './',
  envDir: '.',
  envPrefix: ['VITE_', 'SUPABASE_', 'EXPO_PUBLIC_'],
  server: {
    port: 5173,
    proxy: devProxyTarget
      ? {
          '/api': {
            target: devProxyTarget,
            changeOrigin: true,
          },
        }
      : undefined,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
