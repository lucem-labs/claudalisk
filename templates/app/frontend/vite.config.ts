import { defineConfig } from 'vite'

const apiUrl = process.env.E2E_API_URL

export default defineConfig({
  server: apiUrl ? { proxy: { '/api': apiUrl, '/openapi': apiUrl } } : {},
})
