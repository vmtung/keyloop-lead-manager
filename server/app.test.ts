// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  ApiErrorResponse,
  CreateActivityResponse,
  LeadDetailResponse,
  LeadListResponse,
  ServerEvent,
} from '../src/contract.ts'
import { createApp, type Faults } from './app.ts'
import { parseFaults } from './config.ts'
import { seed } from './seed.ts'
import { openStore } from './store.ts'

const NOW = new Date('2026-10-22T09:00:00.000Z')
const NO_FAULTS: Faults = { latencyMs: { min: 0, max: 0 }, failureRate: 0 }
const AWAITING_LEAD = '00000000-0000-4000-8000-000000000001' // seeded, no activities

let dir: string
let file: string
let logs: Record<string, unknown>[]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lead-api-'))
  file = join(dir, 'db.json')
  logs = []
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function setup(faults: Faults = NO_FAULTS, random = () => 0.5) {
  const store = await openStore(file, () => seed(NOW))
  const app = createApp({
    store,
    faults,
    random,
    log: (entry) => logs.push(entry),
    now: () => NOW,
    keepAliveMs: 10,
  })
  return { app, store }
}

function postActivity(
  app: Awaited<ReturnType<typeof setup>>['app'],
  body: unknown,
  { leadId = AWAITING_LEAD, user = 'anna' }: { leadId?: string; user?: string | null } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (user !== null) headers['x-user-id'] = user
  return app.request(`/api/leads/${leadId}/activities`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('reading leads', () => {
  test('GET /api/leads matches the contract', async () => {
    const { app } = await setup()
    const res = await app.request('/api/leads')
    expect(res.status).toBe(200)
    expect(LeadListResponse.parse(await res.json()).leads.length).toBeGreaterThan(0)
  })

  test('GET /api/leads/:id returns activities oldest first', async () => {
    const { app } = await setup()
    const res = await app.request('/api/leads/00000000-0000-4000-8000-000000000005')
    const { activities } = LeadDetailResponse.parse(await res.json())
    const times = activities.map((a) => Date.parse(a.occurredAt))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(times.length).toBe(3)
  })

  test.each(['00000000-0000-4000-8000-0000000000ff', 'not-a-uuid'])('unknown lead %s → 404', async (id) => {
    const { app } = await setup()
    const res = await app.request(`/api/leads/${id}`)
    expect(res.status).toBe(404)
    expect(ApiErrorResponse.parse(await res.json()).error.code).toBe('not_found')
  })
})

describe('logging an activity', () => {
  test('a call sets firstResponseAt and is authored by x-user-id', async () => {
    const { app } = await setup()
    const id = crypto.randomUUID()
    const res = await postActivity(app, { id, type: 'call', summary: 'Called customer' })

    expect(res.status).toBe(201)
    const body = CreateActivityResponse.parse(await res.json())
    expect(body.activity).toMatchObject({ id, author: { id: 'anna' }, occurredAt: NOW.toISOString() })
    expect(body.lead.firstResponseAt).toBe(NOW.toISOString())
  })

  test('a note does not count as a response (AC-2.5)', async () => {
    const { app } = await setup()
    const res = await postActivity(app, { id: crypto.randomUUID(), type: 'note', summary: 'Prefers email' })
    expect(CreateActivityResponse.parse(await res.json()).lead.firstResponseAt).toBeNull()
  })

  test('AC-4.7: the same ID twice stores one activity and replays it with 200', async () => {
    const { app, store } = await setup()
    const activity = { id: crypto.randomUUID(), type: 'call', summary: 'Called customer' }

    const first = await postActivity(app, activity)
    const second = await postActivity(app, activity)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(await first.json())
    expect(store.read().activities.filter((a) => a.id === activity.id)).toHaveLength(1)
  })

  test('the same ID with different content is a 409', async () => {
    const { app } = await setup()
    const id = crypto.randomUUID()
    await postActivity(app, { id, type: 'call', summary: 'Called customer' })
    const res = await postActivity(app, { id, type: 'call', summary: 'Something else' })
    expect(res.status).toBe(409)
    expect(ApiErrorResponse.parse(await res.json()).error.code).toBe('idempotency_conflict')
  })

  test.each([
    ['empty summary', { type: 'call', summary: '   ' }],
    ['unknown type', { type: 'fax', summary: 'Sent a fax' }],
    ['summary over 2000 characters', { type: 'note', summary: 'x'.repeat(2001) }],
  ])('%s → 400', async (_, fields) => {
    const { app } = await setup()
    const res = await postActivity(app, { id: crypto.randomUUID(), ...fields })
    expect(res.status).toBe(400)
  })

  test('malformed JSON → 400', async () => {
    const { app } = await setup()
    expect((await postActivity(app, '{not json')).status).toBe(400)
  })

  test.each([null, 'nobody'])('x-user-id %s → 401', async (user) => {
    const { app } = await setup()
    const res = await postActivity(app, { id: crypto.randomUUID(), type: 'call', summary: 'x' }, { user })
    expect(res.status).toBe(401)
  })

  test('unknown lead → 404', async () => {
    const { app } = await setup()
    const res = await postActivity(
      app,
      { id: crypto.randomUUID(), type: 'call', summary: 'x' },
      { leadId: '00000000-0000-4000-8000-0000000000ff' },
    )
    expect(res.status).toBe(404)
  })

  test('AC-4.6: activities persist to the data file', async () => {
    const { app } = await setup()
    const id = crypto.randomUUID()
    await postActivity(app, { id, type: 'email', summary: 'Sent brochure' })

    const reopened = await openStore(file, () => {
      throw new Error('should load the file, not re-seed')
    })
    expect(reopened.read().activities.some((a) => a.id === id)).toBe(true)
  })
})

describe('request IDs and logging (AC-7.3)', () => {
  test('echoes the client request ID and logs it', async () => {
    const { app } = await setup()
    const res = await app.request('/api/leads', { headers: { 'x-request-id': 'req-123' } })
    expect(res.headers.get('x-request-id')).toBe('req-123')
    expect(logs).toContainEqual(expect.objectContaining({ requestId: 'req-123', status: 200 }))
  })
})

describe('fault injection', () => {
  test('a failure rate of 1 fails data endpoints but not health', async () => {
    const { app } = await setup({ ...NO_FAULTS, failureRate: 1 })
    expect((await app.request('/api/leads')).status).toBe(500)
    expect((await app.request('/api/health')).status).toBe(200)
  })

  test('failures are random per request', async () => {
    const { app } = await setup({ ...NO_FAULTS, failureRate: 0.3 }, () => 0.31)
    expect((await app.request('/api/leads')).status).toBe(200)
  })

  test.each([
    [{}, { latencyMs: { min: 150, max: 600 }, failureRate: 0 }],
    [{ MOCK_LATENCY_MS: '300', MOCK_FAILURE_RATE: '0.2' }, { latencyMs: { min: 300, max: 300 }, failureRate: 0.2 }],
  ])('parseFaults(%o)', (env, expected) => {
    expect(parseFaults(env)).toEqual(expected)
  })

  test.each([{ MOCK_LATENCY_MS: 'slow' }, { MOCK_LATENCY_MS: '600-100' }, { MOCK_FAILURE_RATE: '2' }])(
    'parseFaults rejects %o',
    (env) => {
      expect(() => parseFaults(env)).toThrow()
    },
  )
})

describe('events', () => {
  test('a new lead is announced on the event stream', async () => {
    const { app } = await setup()
    const stream = await app.request('/api/events')
    const reader = stream.body!.getReader()

    const created = await app.request('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { name: 'Test Lead', email: 'test@example.com', phone: '07700 900999' },
        enquiryType: 'vehicle_enquiry',
        message: 'Hello',
        vehicle: null,
      }),
    })
    expect(created.status).toBe(201)

    const text = new TextDecoder().decode((await reader.read()).value)
    const event = ServerEvent.parse(JSON.parse(text.replace(/^data: /, '').trim()))
    expect(event.type).toBe('lead.created')
    await reader.cancel()
  })
})
