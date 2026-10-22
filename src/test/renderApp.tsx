// Renders the whole app against the real mock API running in-process: the client's fetch goes
// straight to the Hono app, so integration tests exercise the actual contract, not hand-made stubs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router'
import { createApp } from '../../server/app.ts'
import { seed } from '../../server/seed.ts'
import { type Data, openStore } from '../../server/store.ts'
import { createApi } from '../api/client.ts'
import App from '../App.tsx'
import { AnnouncerProvider, ApiProvider, CurrentUserProvider, NowProvider } from '../app/context.tsx'

export const NOW = new Date()

interface Options {
  route?: string
  data?: (seeded: Data) => Data
  /** Runs before the first render, e.g. to make the first requests fail. */
  network?: (network: Network) => void
}

/** Lets a test hold requests open or make them fail. */
export class Network {
  private gate: Promise<void> | null = null
  private release: (() => void) | null = null
  failing: ((url: string, init?: RequestInit) => boolean) | null = null
  readonly requests: { url: string; init: RequestInit | undefined }[] = []

  hold() {
    this.gate = new Promise((resolve) => (this.release = resolve))
  }
  releaseAll() {
    this.release?.()
    this.gate = null
  }
  async before(url: string, init?: RequestInit) {
    this.requests.push({ url, init })
    if (this.gate) await this.gate
  }
}

export async function renderApp({ route = '/leads', data = (d) => d, network: setup }: Options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'lead-ui-'))
  const store = await openStore(join(dir, 'db.json'), () => data(seed(NOW)))
  const server = createApp({
    store,
    faults: { latencyMs: { min: 0, max: 0 }, failureRate: 0 },
    log: () => {},
  })
  const network = new Network()
  setup?.(network)

  const fetchThroughServer: typeof fetch = async (input, init) => {
    const url = String(input)
    await network.before(url, init)
    if (network.failing?.(url, init)) {
      return new Response(JSON.stringify({ error: { code: 'internal', message: 'Test failure' } }), {
        status: 500,
      })
    }
    return server.fetch(new Request(new URL(url, 'http://test'), init))
  }

  const api = createApi({ fetch: fetchThroughServer, baseUrl: '/api', timeoutMs: 5_000 })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>
        <MemoryRouter initialEntries={[route]}>
          <NowProvider>
            <AnnouncerProvider>
              <CurrentUserProvider>
                <App />
              </CurrentUserProvider>
            </AnnouncerProvider>
          </NowProvider>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  )
  return { ...utils, store, network, queryClient }
}

/** Seeded IDs (server/seed.ts). */
export const LEADS = {
  oliviaAwaiting3min: '00000000-0000-4000-8000-000000000001',
  marcusAtRisk12min: '00000000-0000-4000-8000-000000000002',
  hannahOverdue38min: '00000000-0000-4000-8000-000000000003',
  aishaContacted: '00000000-0000-4000-8000-000000000005',
}
