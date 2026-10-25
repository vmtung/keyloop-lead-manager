// The app's only door to the backend: every response is parsed against the contract here, so code
// past this file can trust its types (AC-7.1). Failures become one typed ApiError.
import type { z } from 'zod'
import {
  type ApiErrorCode,
  ApiErrorResponse,
  CreateLeadResponse,
  DevFaults,
  DevTracing,
  DropStreamsResponse,
  CreateActivityResponse,
  LeadDetailResponse,
  type LeadId,
  LeadListResponse,
  LeadPageResponse,
  ResponseStats,
  TeamStatsResponse,
  UnreadResponse,
  LeadResponse,
  type NewActivity,
  NotificationPageResponse,
  type UserId,
  UserListResponse,
} from '../contract.ts'
import { log } from '../observability/log.ts'

export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'http'; status: number; code: ApiErrorCode | null; message: string }
  | { kind: 'invalid_response'; message: string }

export class ApiError extends Error {
  readonly failure: ApiFailure
  readonly requestId: string

  constructor(failure: ApiFailure, requestId: string) {
    super(`API request failed: ${failure.kind}`)
    this.name = 'ApiError'
    this.failure = failure
    this.requestId = requestId
  }
}

interface ApiOptions {
  fetch: typeof fetch
  baseUrl: string
  timeoutMs: number
  /** True once the page is going away: requests it cuts off are not real failures, so not logged. */
  isUnloading?: () => boolean
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  userId?: UserId
  signal?: AbortSignal | undefined
}

export function createApi({ fetch, baseUrl, timeoutMs, isUnloading = () => false }: ApiOptions) {
  async function request<S extends z.ZodType>(
    path: string,
    schema: S,
    { method = 'GET', body, userId, signal }: RequestOptions = {},
  ): Promise<z.output<S>> {
    const requestId = crypto.randomUUID()
    const headers = new Headers({ 'x-request-id': requestId })
    if (body !== undefined) headers.set('content-type', 'application/json')
    if (userId !== undefined) headers.set('x-user-id', userId)

    const timeout = AbortSignal.timeout(timeoutMs)
    const fail = (failure: ApiFailure): never => {
      const entry = { requestId, method, path, ...failure }
      if (failure.kind === 'network') {
        // Leaving the page aborts in-flight requests, and the browser rejects them just before
        // pagehide. Decide one task later, when we know whether the page is going away.
        setTimeout(() => {
          if (!isUnloading()) log.error('api.request_failed', entry)
        }, 0)
      } else {
        log.error('api.request_failed', entry)
      }
      throw new ApiError(failure, requestId)
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      // The caller cancelled (e.g. the user navigated away): not a failure, let it propagate.
      if (signal?.aborted) throw error
      return fail(timeout.aborted ? { kind: 'timeout' } : { kind: 'network' })
    }

    const payload = await readJson(response)

    if (!response.ok) {
      const parsed = ApiErrorResponse.safeParse(payload)
      return fail({
        kind: 'http',
        status: response.status,
        code: parsed.success ? parsed.data.error.code : null,
        message: parsed.success ? parsed.data.error.message : response.statusText,
      })
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      return fail({ kind: 'invalid_response', message: parsed.error.message })
    }
    return parsed.data
  }

  return {
    listUsers: (signal?: AbortSignal) => request('/users', UserListResponse, { signal }),
    /** Every lead awaiting response, longest-waiting first (ADR-006). */
    listAwaiting: (signal?: AbortSignal) => request('/leads?group=awaiting', LeadListResponse, { signal }),
    /** One page of contacted leads, newest first; pass the previous page's `nextCursor`. */
    listContacted: (cursor: string | null, signal?: AbortSignal) =>
      request(
        `/leads?group=contacted${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        LeadPageResponse,
        { signal },
      ),
    getStats: (signal?: AbortSignal) => request('/stats', ResponseStats, { signal }),
    getTeamStats: (signal?: AbortSignal) => request('/stats/team', TeamStatsResponse, { signal }),
    /** The signed-in salesperson's notifications, newest first, 20 at a time (ADR-007). */
    listNotifications: (userId: UserId, cursor: string | null, signal?: AbortSignal) =>
      request(
        `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        NotificationPageResponse,
        { userId, signal },
      ),
    getUnread: (userId: UserId, signal?: AbortSignal) =>
      request('/notifications/unread', UnreadResponse, { userId, signal }),
    markNotificationsRead: (userId: UserId) =>
      request('/notifications/read', UnreadResponse, { method: 'POST', userId }),
    getLead: (id: LeadId, signal?: AbortSignal) =>
      request(`/leads/${id}`, LeadDetailResponse, { signal }),
    createActivity: (leadId: LeadId, activity: NewActivity, userId: UserId) =>
      request(`/leads/${leadId}/activities`, CreateActivityResponse, {
        method: 'POST',
        body: activity,
        userId,
      }),
    claimLead: (leadId: LeadId, userId: UserId) =>
      request(`/leads/${leadId}/claim`, LeadResponse, { method: 'POST', userId }),
    releaseLead: (leadId: LeadId, userId: UserId) =>
      request(`/leads/${leadId}/claim`, LeadResponse, { method: 'DELETE', userId }),
    /**
     * The mock server's dev endpoints, for the demo tools. Development builds only: Vite replaces
     * import.meta.env.DEV with false in production, so none of this ships.
     */
    dev: import.meta.env.DEV
      ? {
          simulateLead: () => request('/dev/leads', CreateLeadResponse, { method: 'POST' }),
          reset: () => request('/dev/reset', LeadListResponse, { method: 'POST' }),
          dropStreams: () => request('/dev/drop-streams', DropStreamsResponse, { method: 'POST' }),
          getFaults: () => request('/dev/faults', DevFaults),
          setFaults: (faults: DevFaults) => request('/dev/faults', DevFaults, { method: 'PUT', body: faults }),
          getTracing: () => request('/dev/tracing', DevTracing),
          setTracing: (tracing: DevTracing) => request('/dev/tracing', DevTracing, { method: 'PUT', body: tracing }),
        }
      : undefined,
  }
}

export type Api = ReturnType<typeof createApi>

/** A body that isn't JSON is `undefined`; schema parsing then reports it. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}
