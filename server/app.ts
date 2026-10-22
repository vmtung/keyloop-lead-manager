// HTTP layer for the mock API (specs/api-contract.md). Built as a factory so tests can drive it with
// app.request() and inject the store, clock, randomness and logger.
import { Hono, type MiddlewareHandler } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { z } from 'zod'
import {
  type ApiErrorCode,
  ApiErrorResponse,
  CreateActivityResponse,
  CreateLeadResponse,
  type IsoDateTime,
  LeadDetailResponse,
  LeadId,
  LeadListResponse,
  NewActivity,
  NewLead,
  type ServerEvent,
  UserId,
  UserListResponse,
} from '../src/contract.ts'
import { appendActivity, createLead, type Store } from './store.ts'

export interface Faults {
  latencyMs: { min: number; max: number }
  failureRate: number
}

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
  const emit = (event: ServerEvent) => listeners.forEach((l) => l(event))

  const app = new Hono<{ Variables: { requestId: string } }>().basePath('/api')

  // Echo the client's request ID (or make one) and log every request as one JSON line (AC-7.3).
  app.use(async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? newId()
    c.set('requestId', requestId)
    c.header('x-request-id', requestId)
    const started = performance.now()
    await next()
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
    if (c.req.path === '/api/health' || c.req.path === '/api/events') return next()
    const { min, max } = deps.faults.latencyMs
    const delay = min + random() * (max - min)
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    if (random() < deps.faults.failureRate) {
      return c.json(error('internal', 'Injected failure (MOCK_FAILURE_RATE)'), 500)
    }
    await next()
  }

  // Bodies are typed by their schema so a response can't drift from the contract.
  const send = <S extends z.ZodType>(_schema: S, body: z.input<S>) => body

  app.get('/health', (c) => c.json({ ok: true }))

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const listener: Listener = (event) => {
        void stream.writeSSE({ data: JSON.stringify(event) })
      }
      listeners.add(listener)
      stream.onAbort(() => {
        listeners.delete(listener)
      })
      while (!stream.aborted) {
        await stream.sleep(deps.keepAliveMs ?? 15_000)
        if (!stream.aborted) await stream.write(': keep-alive\n\n')
      }
    }),
  )

  app.use(injectFaults)

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
    return c.json(send(LeadDetailResponse, { lead, activities }))
  })

  app.post('/leads/:leadId/activities', async (c) => {
    const userId = UserId.safeParse(c.req.header('x-user-id'))
    const author = userId.success ? deps.store.findUser(userId.data) : undefined
    if (!author) return c.json(error('unauthenticated', 'Unknown or missing x-user-id'), 401)

    const leadId = LeadId.safeParse(c.req.param('leadId'))
    if (!leadId.success) return c.json(error('not_found', 'Lead not found'), 404)

    const body = NewActivity.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json(error('validation_failed', body.error.message), 400)

    const result = await deps.store.update((data) => {
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
    const lead = await deps.store.update((data) => {
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
