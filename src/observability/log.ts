// Structured client logging. Each event is one JSON line in the console and, once shipping is
// started, an entry batched to POST /api/logs (AC-7.6). In production that endpoint would be an
// OpenTelemetry collector or a vendor intake; nothing here would change shape.
import type { ClientLogBatch, ClientLogEntry, IsoDateTime } from '../contract.ts'

type Level = ClientLogEntry['level']
type Fields = Record<string, unknown>

/** One per page load, so every entry from this visit can be found together. */
export const sessionId = crypto.randomUUID()

let context: Fields = {}
let shipper: Shipper | null = null

function write(level: Level, event: string, fields: Fields) {
  const ts = new Date().toISOString() as IsoDateTime
  const all = { ...context, ...fields }
  console[level](JSON.stringify({ ts, level, event, sessionId, ...all }))
  shipper?.add({ ts, level, event, sessionId, fields: all })
}

export const log = {
  info: (event: string, fields: Fields = {}) => write('info', event, fields),
  warn: (event: string, fields: Fields = {}) => write('warn', event, fields),
  error: (event: string, fields: Fields = {}) => write('error', event, fields),
  /** Fields added to every later entry, e.g. the signed-in user. */
  setContext: (fields: Fields) => {
    context = { ...context, ...fields }
  },
}

// Shipping -------------------------------------------------------------------------------------

interface ShipperOptions {
  /** Returns whether the batch was accepted. Must not use `log`, or a failure would loop. */
  send: (body: string, how: { beacon: boolean }) => boolean | Promise<boolean>
  schedule: (fn: () => void, ms: number) => unknown
  cancel: (handle: unknown) => void
  onSendFailed: (reason: unknown) => void
  maxBatch?: number
  intervalMs?: number
}

interface Shipper {
  add(entry: ClientLogEntry): void
  flush(how: { beacon: boolean }): void
}

export function createShipper({
  send,
  schedule,
  cancel,
  onSendFailed,
  maxBatch = 20,
  intervalMs = 5_000,
}: ShipperOptions): Shipper {
  let buffer: ClientLogEntry[] = []
  let timer: unknown = null

  function flush(how: { beacon: boolean }) {
    cancel(timer)
    timer = null
    if (buffer.length === 0) return
    const batch: ClientLogBatch = { entries: buffer }
    buffer = []
    // A failed batch is dropped, not retried: logs must never pile up or slow the app down.
    try {
      void Promise.resolve(send(JSON.stringify(batch), how)).then(
        (accepted) => {
          if (!accepted) onSendFailed('rejected')
        },
        onSendFailed,
      )
    } catch (error) {
      onSendFailed(error)
    }
  }

  return {
    add(entry) {
      buffer.push(entry)
      if (buffer.length >= maxBatch) flush({ beacon: false })
      else if (timer === null) timer = schedule(() => flush({ beacon: false }), intervalMs)
    },
    flush,
  }
}

/** Starts shipping every later entry. Returns a function that stops it. */
export function shipLogs(options: ShipperOptions): () => void {
  const current = createShipper(options)
  shipper = current
  return () => {
    current.flush({ beacon: false })
    if (shipper === current) shipper = null
  }
}

/** Sends whatever is buffered now, e.g. with a beacon as the page is hidden. */
export function flushLogs(how: { beacon: boolean }) {
  shipper?.flush(how)
}
