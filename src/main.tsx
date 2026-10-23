import '@fontsource-variable/geist'
import './styles/tokens.css'
import './styles/app.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { browserFetch } from './api/browserFetch.ts'
import { createApi } from './api/client.ts'
import { isRetryable } from './api/describeFailure.ts'
import App from './App.tsx'
import { AnnouncerProvider, ApiProvider, CurrentUserProvider, NowProvider } from './app/context.tsx'
import { ErrorBoundary } from './app/ErrorBoundary.tsx'
import { LiveUpdatesProvider } from './leads/live.tsx'
import { isPageUnloading, startObservability } from './observability/setup.ts'

startObservability()

// Traced mode only. Vite replaces the env value at build time, so a normal build drops this branch
// and the tracing chunk with it.
if (import.meta.env.VITE_TRACING === 'true') {
  void import('./observability/tracing.ts').then((m) => m.startTracing())
}

const api = createApi({
  fetch: browserFetch,
  baseUrl: '/api',
  timeoutMs: 10_000,
  isUnloading: isPageUnloading,
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => count < 2 && isRetryable(error) },
    mutations: { retry: false }, // the user decides, via Retry (ADR-004)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="page">
      <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <BrowserRouter>
          <NowProvider>
            <AnnouncerProvider>
              <CurrentUserProvider>
                <LiveUpdatesProvider>
                  <App />
                </LiveUpdatesProvider>
              </CurrentUserProvider>
            </AnnouncerProvider>
          </NowProvider>
        </BrowserRouter>
      </ApiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
