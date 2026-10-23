import { defineConfig } from '@playwright/test'

// One end-to-end path through the real stack: browser, Vite's proxy, the mock API and its SSE
// stream. The in-process integration tests skip the proxy, which is where two Stage 3 bugs lived.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5183',
    channel: 'chrome', // the installed Chrome (also on GitHub's Ubuntu runners): no browser download
    trace: 'retain-on-failure',
  },
  // Its own ports and a fresh data file, never the dev server: a reused dev server leaked test
  // leads into dev data and ran with different latency than CI.
  webServer: {
    command: 'rm -f server/data/e2e.json && pnpm dev',
    url: 'http://localhost:5183/api/health',
    reuseExistingServer: false,
    env: {
      WEB_PORT: '5183',
      MOCK_API_PORT: '8797',
      MOCK_DATA_FILE: 'server/data/e2e.json',
      MOCK_LATENCY_MS: '0',
    },
  },
})
