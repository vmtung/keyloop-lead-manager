// @vitest-environment node
import { context, propagation, trace } from '@opentelemetry/api'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createApp } from './app.ts'
import { seed } from './seed.ts'
import { openStore } from './store.ts'

// Switching tracing on registers a real provider; here it exports to memory instead of Jaeger.
const exporter = new InMemorySpanExporter()
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
let dir: string

beforeAll(async () => {
  provider.register()
  dir = await mkdtemp(join(tmpdir(), 'lead-trace-'))
})
afterAll(async () => {
  await provider.shutdown()
  trace.disable()
  context.disable()
  propagation.disable()
  await rm(dir, { recursive: true, force: true })
})

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const BROWSER_SPAN = '00f067aa0ba902b7'

test('AC-7.7: a request with traceparent continues the browser trace, with the write and emit as children', async () => {
  const store = await openStore(join(dir, 'db.json'), () => seed())
  const app = createApp({
    store,
    faults: { latencyMs: { min: 0, max: 0 }, failureRate: 0 },
    log: () => {},
  })
  exporter.reset()

  const res = await app.request('/api/leads/00000000-0000-4000-8000-000000000001/activities', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'anna',
      'x-request-id': 'req-traced',
      traceparent: `00-${TRACE_ID}-${BROWSER_SPAN}-01`,
    },
    body: JSON.stringify({ id: crypto.randomUUID(), type: 'call', summary: 'Called' }),
  })
  expect(res.status).toBe(201)

  const spans = exporter.getFinishedSpans()
  const server = spans.find((s) => s.name === 'POST /api/leads/:id/activities')
  expect(server).toBeDefined()
  expect(server!.spanContext().traceId).toBe(TRACE_ID)
  expect(server!.parentSpanContext?.spanId).toBe(BROWSER_SPAN)
  expect(server!.attributes).toMatchObject({ 'http.response.status_code': 201, 'request.id': 'req-traced' })

  for (const name of ['store.write', 'events.emit']) {
    const child = spans.find((s) => s.name === name)
    expect(child, name).toBeDefined()
    expect(child!.spanContext().traceId).toBe(TRACE_ID)
    expect(child!.parentSpanContext?.spanId).toBe(server!.spanContext().spanId)
  }
})
