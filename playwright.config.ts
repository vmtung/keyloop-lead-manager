import { defineConfig } from '@playwright/test'

// One end-to-end path through the real stack: browser, Vite's proxy, the mock API and its SSE
// stream. The in-process integration tests skip the proxy, which is where two Stage 3 bugs lived.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome', // the installed Chrome (also on GitHub's Ubuntu runners): no browser download
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !process.env.CI,
    env: { MOCK_DATA_FILE: 'server/data/e2e.json', MOCK_LATENCY_MS: '0' },
  },
})
