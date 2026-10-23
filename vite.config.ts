import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // WEB_PORT, not PORT: tools set PORT for their own use (the preview tool did, Stage 2).
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${process.env.MOCK_API_PORT ?? 8787}`,
      // Tracing: browser spans go to Jaeger's OTLP endpoint through the same origin (no CORS).
      '/otlp': { target: 'http://localhost:4318', rewrite: (path) => path.replace(/^\/otlp/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
