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
import type { EventSourceLike } from '../api/events.ts'
import { AnnouncerProvider, ApiProvider, CurrentUserProvider, NowProvider } from '../app/context.tsx'
import { LiveUpdatesProvider } from '../leads/live.tsx'

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

  const live = new LiveStream(async (url) => server.fetch(new Request(new URL(url, 'http://test'))))

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
                <LiveUpdatesProvider createSource={live.create}>
                  <App />
                </LiveUpdatesProvider>
              </CurrentUserProvider>
            </AnnouncerProvider>
          </NowProvider>
        </MemoryRouter>
      </ApiProvider>
    </QueryClientProvider>,
  )
  /** Posts a website enquiry to the server, as the website would (specs A17). */
  const postLead = (body: unknown) =>
    server.fetch(
      new Request('http://test/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )

  return { ...utils, store, network, queryClient, live, server, postLead }
}

/** Seeded IDs (server/seed.ts). */
export const LEADS = {
  oliviaAwaiting3min: '00000000-0000-4000-8000-000000000001',
  marcusAtRisk12min: '00000000-0000-4000-8000-000000000002',
  hannahOverdue38min: '00000000-0000-4000-8000-000000000003',
  aishaContacted: '00000000-0000-4000-8000-000000000005',
}

/**
 * An EventSource that reads the in-process server's real /api/events stream and parses the SSE
 * wire format, so live-update tests cover the server's emit, the format and the client together.
 * `drop()` simulates a lost connection; `reconnect()` is the browser retrying.
 */
type Source = EventSourceLike & { readyState: number; dispatch: (type: string) => void }

export class LiveStream {
  private source: Source | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private readonly open: (url: string) => Promise<Response>
  private url = ''

  constructor(open: (url: string) => Promise<Response>) {
    this.open = open
  }

  readonly create = (url: string): EventSourceLike => {
    this.url = url
    const listeners = new Map<string, (() => void)[]>()
    const source = {
      onopen: null,
      onmessage: null,
      onerror: null,
      readyState: 0,
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
      },
      dispatch: (type: string) => listeners.get(type)?.forEach((l) => l()),
      close: () => {
        source.readyState = 2
        void this.reader?.cancel()
      },
    } as unknown as Source
    this.source = source
    void this.connect()
    return source
  }

  drop() {
    const source = this.source!
    void this.reader?.cancel()
    source.readyState = 0 // CONNECTING: the browser would retry by itself
    source.onerror?.(new Event('error'))
  }

  reconnect() {
    return this.connect()
  }

  private async connect() {
    const source = this.source!
    const response = await this.open(this.url)
    const reader = response.body!.getReader()
    this.reader = reader
    source.readyState = 1
    source.onopen?.(new Event('open'))

    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const name = frame.match(/^event: (.+)$/m)?.[1]
        if (name) {
          source.dispatch(name)
          continue
        }
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) source.onmessage?.(new MessageEvent('message', { data }))
      }
    }
  }
}
