// Entry point: reads config from env (the boundary), opens the store, starts listening.
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { parseFaults } from './config.ts'
import { seed } from './seed.ts'
import { openStore } from './store.ts'

const port = Number(process.env.MOCK_API_PORT ?? '8787')
const file = process.env.MOCK_DATA_FILE ?? 'server/data/db.json'
const faults = parseFaults(process.env)
const log = (entry: Record<string, unknown>) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }))

const store = await openStore(file, () => seed())
const app = createApp({ store, faults, log })

serve({ fetch: app.fetch, port }, () => {
  log({ level: 'info', message: `Mock API on http://localhost:${port}/api`, file, faults })
})
