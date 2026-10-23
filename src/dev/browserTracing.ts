// Keeps browser tracing in step with the mock server's switch (AC-7.7). One page has one tracer, so
// this is module state. The tracing chunk loads the first time tracing is switched on.
import { log } from '../observability/log.ts'

let running: Promise<() => Promise<void>> | null = null

export function syncBrowserTracing(on: boolean) {
  if (on && !running) {
    running = import('../observability/tracing.ts').then((m) => m.startTracing())
    running.catch((error: unknown) => {
      log.error('tracing.start_failed', { error: String(error) })
      running = null
    })
  } else if (!on && running) {
    const stopping = running
    running = null
    stopping
      .then((stop) => stop())
      .catch((error: unknown) => log.error('tracing.stop_failed', { error: String(error) }))
  }
}
