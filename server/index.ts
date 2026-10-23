// Entry point: reads config from env (the boundary), opens the store, starts listening.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { parseFaults } from './config.ts'
import { seed } from './seed.ts'
import { openStore } from './store.ts'
import { createTracingSwitch } from './tracing.ts'

const port = Number(process.env.MOCK_API_PORT ?? '8787')
const file = process.env.MOCK_DATA_FILE ?? 'server/data/db.json'
const faults = parseFaults(process.env)
const log = (entry: Record<string, unknown>) => {
  const ts = new Date().toISOString()
  // `ts` first for readability, and last in the assign so a client log field can't overwrite it.
  console.log(JSON.stringify(Object.assign({ ts }, entry, { ts })))
}

// Off until the demo tools switch it on (AC-7.7).
const tracing = createTracingSwitch(process.env.OTEL_EXPORTER_URL ?? 'http://localhost:4318/v1/traces')

const store = await openStore(file, () => seed())
const app = createApp({ store, faults, log, tracing })

serve({ fetch: app.fetch, port }, () => {
  log({ level: 'info', message: `Mock API on http://localhost:${port}/api`, file, faults })
})
