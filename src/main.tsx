import '@fontsource-variable/geist'
import './styles/tokens.css'
import './styles/app.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { browserFetch } from './api/browserFetch.ts'
import { createApi } from './api/client.ts'
import { isRetryable } from './api/describeFailure.ts'
import App from './App.tsx'
import { AnnouncerProvider, ApiProvider, CurrentUserProvider, NowProvider } from './app/context.tsx'
import { ErrorBoundary } from './app/ErrorBoundary.tsx'
import { LiveUpdatesProvider } from './leads/live.tsx'
import { ToastProvider } from './notifications/toasts.tsx'
import { isPageUnloading, startObservability } from './observability/setup.ts'

startObservability()

const api = createApi({
  fetch: browserFetch,
  baseUrl: '/api',
  timeoutMs: 10_000,
  isUnloading: isPageUnloading,
})

// Development builds only: Vite replaces import.meta.env.DEV with false in production, so this
// branch and the demo tools chunk are dropped from the production build.
const DemoTools = import.meta.env.DEV ? lazy(() => import('./dev/DemoTools.tsx')) : null

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
                <ToastProvider>
                <LiveUpdatesProvider>
                  <App />
                  {DemoTools && (
                    <Suspense fallback={null}>
                      <DemoTools />
                    </Suspense>
                  )}
                </LiveUpdatesProvider>
                </ToastProvider>
              </CurrentUserProvider>
            </AnnouncerProvider>
          </NowProvider>
        </BrowserRouter>
      </ApiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
