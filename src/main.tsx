import '@fontsource-variable/geist'
import './styles/tokens.css'
import './styles/app.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { createApi } from './api/client.ts'
import { isRetryable } from './api/describeFailure.ts'
import App from './App.tsx'
import { AnnouncerProvider, ApiProvider, CurrentUserProvider, NowProvider } from './app/context.tsx'
import { LiveUpdatesProvider } from './leads/live.tsx'

const api = createApi({ fetch: window.fetch.bind(window), baseUrl: '/api', timeoutMs: 10_000 })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => count < 2 && isRetryable(error) },
    mutations: { retry: false }, // the user decides, via Retry (ADR-004)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>,
)
