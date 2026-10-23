import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ActivityId, LeadId, UserId } from '../contract.ts'
import { ApiError, createApi } from './client.ts'

const LEAD_ID = '00000000-0000-4000-8000-000000000001' as LeadId
const lead = {
  id: LEAD_ID,
  customer: { name: 'Olivia Bennett', email: 'olivia@example.com', phone: '07700 900141' },
  enquiryType: 'test_drive',
  message: 'Saturday?',
  vehicle: null,
  receivedAt: '2026-10-22T09:00:00.000Z',
  firstResponseAt: null,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function apiWith(fetchImpl: typeof fetch, timeoutMs = 10_000, isUnloading = () => false) {
  return createApi({ fetch: fetchImpl, timeoutMs, baseUrl: '/api', isUnloading })
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return (error as ApiError).failure
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('successful requests', () => {
  test('parses a valid response', async () => {
    const api = apiWith(async () => json({ leads: [lead] }))
    // A lead without `claim` (data from before claims) parses with `claim: null`.
    expect(await api.listLeads()).toEqual({ leads: [{ ...lead, claim: null }] })
  })

  test('sends a request ID, and the user ID on writes', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      json({
        activity: {
          id: 'a7f3c2d1-0000-4000-8000-000000000001',
          leadId: LEAD_ID,
          type: 'call',
          summary: 'Called',
          author: { id: 'anna', name: 'Anna Clarke' },
          occurredAt: '2026-10-22T09:05:00.000Z',
        },
        lead,
      }, 201),
    )
    const api = apiWith(fetchSpy)
    await api.createActivity(
      LEAD_ID,
      { id: 'a7f3c2d1-0000-4000-8000-000000000001' as ActivityId, type: 'call', summary: 'Called' },
      'anna' as UserId,
    )

    const [url, init] = fetchSpy.mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(url).toBe(`/api/leads/${LEAD_ID}/activities`)
    expect(init?.method).toBe('POST')
    expect(headers.get('x-user-id')).toBe('anna')
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('failures become typed ApiErrors', () => {
  test('AC-7.1: a response that breaks the contract is invalid_response, and logged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = apiWith(async () => json({ leads: [{ ...lead, receivedAt: 'yesterday' }] }))

    expect(await failureOf(api.listLeads())).toMatchObject({ kind: 'invalid_response' })
    expect(logged).toHaveBeenCalledOnce()
  })

  test('a body that is not JSON is invalid_response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = apiWith(async () => new Response('<html>Bad gateway</html>', { status: 200 }))
    expect(await failureOf(api.listLeads())).toMatchObject({ kind: 'invalid_response' })
  })

  test('an error response keeps its status and code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = apiWith(async () => json({ error: { code: 'not_found', message: 'Lead not found' } }, 404))
    expect(await failureOf(api.getLead(LEAD_ID))).toEqual({
      kind: 'http',
      status: 404,
      code: 'not_found',
      message: 'Lead not found',
    })
  })

  test('an error response without a contract body still reports its status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = apiWith(async () => new Response('Service Unavailable', { status: 503 }))
    expect(await failureOf(api.listLeads())).toMatchObject({ kind: 'http', status: 503, code: null })
  })

  test('a fetch that throws (offline) is a network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = apiWith(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await failureOf(api.listLeads())).toEqual({ kind: 'network' })
    await new Promise((r) => setTimeout(r, 10))
    expect(console.error).toHaveBeenCalledOnce() // still logged when the page stays
  })

  test('AC-7.2: a request slower than the timeout is a timeout failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const neverAnswers: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const api = apiWith(neverAnswers, 20)
    expect(await failureOf(api.listLeads())).toEqual({ kind: 'timeout' })
  })

  test('requests cut off by the page unloading are not logged (the abort lands before pagehide)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    let unloading = false
    const api = apiWith(
      async () => {
        throw new TypeError('Failed to fetch')
      },
      10_000,
      () => unloading,
    )
    expect(await failureOf(api.listLeads())).toEqual({ kind: 'network' })
    unloading = true // pagehide fires after the rejection
    await new Promise((r) => setTimeout(r, 10))
    expect(logged).not.toHaveBeenCalled()
  })

  test('a caller cancelling is not reported as a failure', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const neverAnswers: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const controller = new AbortController()
    const pending = apiWith(neverAnswers).listLeads(controller.signal)
    controller.abort()

    await expect(pending).rejects.toHaveProperty('name', 'AbortError')
    expect(logged).not.toHaveBeenCalled()
  })
})
