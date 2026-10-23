// HTTP layer for the mock API (specs/api-contract.md). Built as a factory so tests can drive it with
// app.request() and inject the store, clock, randomness and logger.
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { Hono, type MiddlewareHandler } from 'hono'
import { type SSEStreamingApi, streamSSE } from 'hono/streaming'
import type { z } from 'zod'
import {
  type ApiErrorCode,
  ApiErrorResponse,
  ClientLogBatch,
  CreateActivityResponse,
  CreateLeadResponse,
  DevFaults,
  DropStreamsResponse,
  type IsoDateTime,
  LeadDetailResponse,
  LeadId,
  LeadListResponse,
  LeadResponse,
  NewActivity,
  NewLead,
  type ServerEvent,
  UserId,
  UserListResponse,
} from '../src/contract.ts'
import { suggestNextAction } from '../src/domain/suggest.ts'
import { LEAD_SAMPLES } from './samples.ts'
import { seed } from './seed.ts'
import { appendActivity, claimLead, createLead, releaseLead, type Store } from './store.ts'

export type Faults = DevFaults

export type Log = (entry: Record<string, unknown>) => void

export interface AppDeps {
  store: Store
  faults: Faults
  log: Log
  now?: () => Date
  random?: () => number
  newId?: () => string
  keepAliveMs?: number
}

type Listener = (event: ServerEvent) => void

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date())
  const random = deps.random ?? Math.random
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const nowIso = () => now().toISOString() as IsoDateTime

  const listeners = new Set<Listener>()
  // Open event streams, so the demo tools can drop them to show a reconnect.
  const streams = new Set<SSEStreamingApi>()
  // Starts from env (server/config.ts); the demo tools can change it at runtime.
  let faults: Faults = deps.faults
  // Tracing goes through the OpenTelemetry API, which does nothing until traced mode registers an
  // SDK (server/tracing.ts). So tests and `pnpm dev` run the same code and record nothing.
  const tracer = trace.getTracer('lead-manager-api')
  const traced = async <T,>(name: string, fn: () => Promise<T>): Promise<T> =>
    tracer.startActiveSpan(name, async (span) => {
      try {
        return await fn()
      } catch (err) {
        span.recordException(err as Error)
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw err
      } finally {
        span.end()
      }
    })

  // Every write and every emit goes through these two, so each shows up as a span.
  const update: Store['update'] = (change) => traced('store.write', () => deps.store.update(change))
  const emit = (event: ServerEvent) =>
    tracer.startActiveSpan('events.emit', (span) => {
      span.setAttributes({ 'event.type': event.type, 'events.listeners': listeners.size })
      listeners.forEach((l) => l(event))
      span.end()
    })

  const app = new Hono<{ Variables: { requestId: string } }>().basePath('/api')

  // First, so the server span wraps the whole request, continuing the browser's trace if it sent a
  // `traceparent` header (traced mode, AC-7.7).
  app.use(async (c, next) => {
    // The event stream is one request open for a whole session, and log uploads are about the
    // telemetry itself: neither belongs in a trace view.
    if (c.req.path === '/api/events' || c.req.path === '/api/logs') return next()
    const parent = propagation.extract(context.active(), Object.fromEntries(c.req.raw.headers))
    const route = c.req.path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':id')
    await tracer.startActiveSpan(
      `${c.req.method} ${route}`,
      { kind: SpanKind.SERVER, attributes: { 'http.request.method': c.req.method, 'url.path': c.req.path } },
      parent,
      async (span) => {
        try {
          await next()
          span.setAttribute('http.response.status_code', c.res.status)
          if (c.res.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR })
        } finally {
          span.setAttribute('request.id', c.get('requestId') ?? '')
          span.end()
        }
      },
    )
  })

  // Echo the client's request ID (or make one) and log every request as one JSON line (AC-7.3).
  app.use(async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? newId()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    const started = performance.now()
    await next()
    if (c.req.path === '/api/logs') return // a line per log batch would only be noise
    deps.log({
      level: c.res.status >= 500 ? 'error' : 'info',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    })
  })

  // Latency and failures on every data endpoint; never on /health or the event stream.
  const injectFaults: MiddlewareHandler = async (c, next) => {
    // Dev endpoints too, so a flaky API can always be switched back to normal.
    if (['/api/health', '/api/events', '/api/logs'].includes(c.req.path) || c.req.path.startsWith('/api/dev/')) {
      return next()
    }
    const { min, max } = faults.latencyMs
    const delay = min + random() * (max - min)
    // Its own span, so a trace shows the wait as the mock's doing, not the handler's.
    if (delay > 0) await traced('mock.injected_latency', () => new Promise((r) => setTimeout(r, delay)))
    if (random() < faults.failureRate) {
      return c.json(error('internal', 'Injected failure (MOCK_FAILURE_RATE)'), 500)
    }
    await next()
  }

  // Bodies are typed by their schema so a response can't drift from the contract.
  const send = <S extends z.ZodType>(_schema: S, body: z.input<S>) => body

  app.get('/health', (c) => c.json({ ok: true }))

  // Client log intake (AC-7.6): one line per entry, beside the server's own request lines.
  app.post('/logs', async (c) => {
    const body = ClientLogBatch.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json(error('validation_failed', body.error.message), 400)
    for (const { ts, level, event, sessionId, fields } of body.data.entries) {
      deps.log({ ...fields, source: 'client', clientTs: ts, level, event, sessionId })
    }
    return c.body(null, 204)
  })

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const listener: Listener = (event) => {
        void stream.writeSSE({ data: JSON.stringify(event) })
      }
      listeners.add(listener)
      streams.add(stream)
      // Registered before the first await: a client that drops during it must still be removed.
      stream.onAbort(() => {
        listeners.delete(listener)
        streams.delete(stream)
      })
      // Send bytes at once: proxies (Vite's in dev, nginx in production) hold the response, and
      // with it the browser's `open` event, until the first body chunk arrives.
      await stream.write(': connected\n\n')
      while (!stream.aborted) {
        await stream.sleep(deps.keepAliveMs ?? 15_000)
        // A named event, not a comment: browsers hide comments from scripts, and the client's
        // watchdog needs to hear something to know a quiet connection is still alive.
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: nowIso() })
      }
    }),
  )

  app.use(injectFaults)

  // Dev endpoints for the demo tools (specs/api-contract.md). The mock server only.
  app.get('/dev/faults', (c) => c.json(send(DevFaults, faults)))

  app.put('/dev/faults', async (c) => {
    const body = DevFaults.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json(error('validation_failed', body.error.message), 400)
    faults = body.data
    deps.log({ level: 'info', message: 'Faults changed by demo tools', faults })
    return c.json(send(DevFaults, faults))
  })

  app.post('/dev/leads', async (c) => {
    const sample = LEAD_SAMPLES[Math.floor(random() * LEAD_SAMPLES.length)]!
    const lead = await update((data) => {
      const next = createLead(data, sample, newId() as LeadId, nowIso())
      return { data: next.data, value: next.lead }
    })
    emit({ type: 'lead.created', leadId: lead.id })
    return c.json(send(CreateLeadResponse, { lead }), 201)
  })

  app.post('/dev/reset', async (c) => {
    const data = await update(() => {
      const fresh = seed(now())
      return { data: fresh, value: fresh }
    })
    return c.json(send(LeadListResponse, { leads: data.leads }))
  })

  app.post('/dev/drop-streams', (c) => {
    const open = [...streams]
    for (const stream of open) {
      stream.abort() // runs onAbort: the listener goes
      void stream.close() // ends the response, so the browser sees the drop at once
    }
    return c.json(send(DropStreamsResponse, { dropped: open.length }))
  })

  app.get('/users', (c) =>
    c.json(send(UserListResponse, { users: deps.store.read().users })),
  )

  app.get('/leads', (c) =>
    c.json(send(LeadListResponse, { leads: deps.store.read().leads })),
  )

  app.get('/leads/:leadId', (c) => {
    const leadId = LeadId.safeParse(c.req.param('leadId'))
    const data = deps.store.read()
    const lead = leadId.success ? data.leads.find((l) => l.id === leadId.data) : undefined
    if (!lead) return c.json(error('not_found', 'Lead not found'), 404)
    const activities = data.activities
      .filter((a) => a.leadId === lead.id)
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    const suggestion = suggestNextAction(lead, activities, now().getTime())
    return c.json(send(LeadDetailResponse, { lead, activities, suggestion }))
  })

  const currentUser = (header: string | undefined) => {
    const userId = UserId.safeParse(header)
    return userId.success ? deps.store.findUser(userId.data) : undefined
  }

  app.post('/leads/:leadId/claim', async (c) => {
    const user = currentUser(c.req.header('x-user-id'))
    if (!user) return c.json(error('unauthenticated', 'Unknown or missing x-user-id'), 401)
    const leadId = LeadId.safeParse(c.req.param('leadId'))
    if (!leadId.success) return c.json(error('not_found', 'Lead not found'), 404)

    const result = await update((data) => {
      const next = claimLead(data, leadId.data, user, nowIso())
      return { data: next.data, value: next.result }
    })
    switch (result.kind) {
      case 'lead_not_found':
        return c.json(error('not_found', 'Lead not found'), 404)
      case 'conflict':
        return c.json(error('claim_conflict', 'Lead already claimed by someone else'), 409)
      case 'already_yours':
        return c.json(send(LeadResponse, { lead: result.lead }))
      case 'claimed':
        emit({ type: 'lead.updated', leadId: result.lead.id })
        return c.json(send(LeadResponse, { lead: result.lead }))
    }
  })

  app.delete('/leads/:leadId/claim', async (c) => {
    const user = currentUser(c.req.header('x-user-id'))
    if (!user) return c.json(error('unauthenticated', 'Unknown or missing x-user-id'), 401)
    const leadId = LeadId.safeParse(c.req.param('leadId'))
    if (!leadId.success) return c.json(error('not_found', 'Lead not found'), 404)

    const result = await update((data) => {
      const next = releaseLead(data, leadId.data, user)
      return { data: next.data, value: next.result }
    })
    switch (result.kind) {
      case 'lead_not_found':
        return c.json(error('not_found', 'Lead not found'), 404)
      case 'forbidden':
        return c.json(error('forbidden', 'Only the owner can release a claim'), 403)
      case 'not_claimed':
        return c.json(send(LeadResponse, { lead: result.lead }))
      case 'released':
        emit({ type: 'lead.updated', leadId: result.lead.id })
        return c.json(send(LeadResponse, { lead: result.lead }))
    }
  })

  app.post('/leads/:leadId/activities', async (c) => {
    const author = currentUser(c.req.header('x-user-id'))
    if (!author) return c.json(error('unauthenticated', 'Unknown or missing x-user-id'), 401)

    const leadId = LeadId.safeParse(c.req.param('leadId'))
    if (!leadId.success) return c.json(error('not_found', 'Lead not found'), 404)

    const body = NewActivity.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json(error('validation_failed', body.error.message), 400)

    const result = await update((data) => {
      const next = appendActivity(data, leadId.data, body.data, author, nowIso())
      return { data: next.data, value: next.result }
    })

    switch (result.kind) {
      case 'lead_not_found':
        return c.json(error('not_found', 'Lead not found'), 404)
      case 'conflict':
        return c.json(
          error('idempotency_conflict', 'Activity ID already used with different content'),
          409,
        )
      case 'replayed':
        return c.json(send(CreateActivityResponse, { activity: result.activity, lead: result.lead }), 200)
      case 'created':
        emit({ type: 'activity.created', leadId: result.lead.id, activityId: result.activity.id })
        return c.json(send(CreateActivityResponse, { activity: result.activity, lead: result.lead }), 201)
    }
  })

  app.post('/leads', async (c) => {
    const body = NewLead.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json(error('validation_failed', body.error.message), 400)
    const lead = await update((data) => {
      const next = createLead(data, body.data, newId() as LeadId, nowIso())
      return { data: next.data, value: next.lead }
    })
    emit({ type: 'lead.created', leadId: lead.id })
    return c.json(send(CreateLeadResponse, { lead }), 201)
  })

  app.notFound((c) => c.json(error('not_found', 'No such endpoint'), 404))

  app.onError((err, c) => {
    deps.log({ level: 'error', requestId: c.get('requestId'), message: err.message, stack: err.stack })
    return c.json(error('internal', 'Internal error'), 500)
  })

  return app
}

function error(code: ApiErrorCode, message: string): z.input<typeof ApiErrorResponse> {
  return { error: { code, message } }
}

/** Malformed JSON becomes `undefined`, which then fails schema validation as a 400. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
