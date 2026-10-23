// The live event stream (ADR-002). Like client.ts, this is a boundary: every event is parsed against
// the contract before the app sees it, and the connection's ups and downs become a simple status.
import { ServerEvent } from '../contract.ts'
import { log } from '../observability/log.ts'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting'

/** The part of the browser's EventSource we use, so tests can supply their own. */
export interface EventSourceLike {
  onopen: ((event: Event) => unknown) | null
  onmessage: ((event: MessageEvent) => unknown) | null
  onerror: ((event: Event) => unknown) | null
  readonly readyState: number
  close(): void
  addEventListener(type: 'ping', listener: () => void): void
}

interface Options {
  create: (url: string) => EventSourceLike
  schedule: (fn: () => void, ms: number) => unknown
  cancel: (handle: unknown) => void
  onEvent: (event: ServerEvent) => void
  onStatus: (status: LiveStatus) => void
  /** Called when the stream comes back after a drop: events may have been missed (no replay). */
  onResume: () => void
}

const CLOSED = 2
const BACKOFF_MS = [1000, 2000, 5000, 10_000]
/**
 * The server pings every 15 s. A proxy or a mobile network can leave a dead connection looking open
 * with no error event, so silence for this long counts as a drop.
 */
export const STALE_AFTER_MS = 35_000

export function subscribeToEvents(url: string, o: Options): () => void {
  let source: EventSourceLike | null = null
  let retryTimer: unknown = null
  let watchdog: unknown = null
  let failures = 0
  let droppedSinceOpen = false
  let stopped = false

  function connect() {
    const current = o.create(url)
    source = current

    current.onopen = () => {
      if (droppedSinceOpen) o.onResume()
      droppedSinceOpen = false
      failures = 0
      o.onStatus('live')
      heard()
    }

    current.onmessage = (message) => {
      heard()
      const event = parse(message.data)
      if (event) o.onEvent(event)
    }

    current.addEventListener('ping', heard)

    current.onerror = () => {
      o.cancel(watchdog)
      droppedSinceOpen = true
      o.onStatus('reconnecting')
      // While CONNECTING the browser retries by itself. CLOSED means it gave up (e.g. the server
      // answered with an error status), so we retry with backoff.
      if (current.readyState === CLOSED) retry()
    }
  }

  function heard() {
    o.cancel(watchdog)
    watchdog = o.schedule(() => {
      log.warn('events.stale', { silentForMs: STALE_AFTER_MS })
      droppedSinceOpen = true
      o.onStatus('reconnecting')
      retry()
    }, STALE_AFTER_MS)
  }

  function retry() {
    source?.close()
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!
    failures += 1
    retryTimer = o.schedule(() => {
      if (!stopped) connect()
    }, delay)
  }

  o.onStatus('connecting')
  connect()

  return () => {
    stopped = true
    o.cancel(retryTimer)
    o.cancel(watchdog)
    source?.close()
  }
}

function parse(data: unknown): ServerEvent | null {
  let json: unknown
  try {
    json = JSON.parse(String(data))
  } catch {
    log.warn('events.invalid', { reason: 'not JSON', data: String(data).slice(0, 200) })
    return null
  }
  const event = ServerEvent.safeParse(json)
  if (!event.success) {
    log.warn('events.invalid', { reason: event.error.message })
    return null
  }
  return event.data
}
