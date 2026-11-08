import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiUrl = process.env.E2E_API_URL

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  server: apiUrl ? { proxy: { '/api': apiUrl, '/openapi': apiUrl } } : {},
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
