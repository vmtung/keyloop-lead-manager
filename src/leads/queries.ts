// Server state for leads. Optimistic logging follows ADR-004: the pending activity is rendered from
// the mutation's own variables, so a failure needs no cache rollback, only the entry disappearing.
import {
  type Mutation,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { z } from 'zod'
import { describeFailure } from '../api/describeFailure.ts'
import { log } from '../observability/log.ts'
import { withSpan } from '../observability/trace.ts'
import { useAnnounce, useApi } from '../app/context.tsx'
import { ApiError } from '../api/client.ts'
import type { Api } from '../api/client.ts'
import type { Lead, LeadDetailResponse, LeadId, LeadListResponse, NewActivity, User } from '../contract.ts'
import { type ContactedPages, placeInAwaiting, placeInContacted } from './placeLead.ts'

export const leadKeys = {
  all: ['leads'] as const,
  awaiting: () => ['leads', 'awaiting'] as const,
  contacted: () => ['leads', 'contacted'] as const,
  stats: () => ['leads', 'stats'] as const,
  detail: (id: LeadId) => ['leads', 'detail', id] as const,
}

const logActivityKey = (leadId: LeadId) => ['logActivity', leadId] as const

/** Every lead awaiting response: few and urgent, so loaded in full (ADR-006). */
export function useAwaitingLeads() {
  const api = useApi()
  return useQuery({
    queryKey: leadKeys.awaiting(),
    queryFn: ({ signal }) => api.listAwaiting(signal),
    select: (data) => data.leads,
  })
}

/** Contacted leads, newest first, 50 at a time (AC-1.8). */
export function useContactedLeads() {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: leadKeys.contacted(),
    queryFn: ({ pageParam, signal }) => api.listContacted(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

/** The 24-hour figures, from the server over every lead (AC-1.6). The window slides, so refresh. */
export function useResponseStats() {
  const api = useApi()
  return useQuery({
    queryKey: leadKeys.stats(),
    queryFn: ({ signal }) => api.getStats(signal),
    refetchInterval: 60_000,
  })
}

export function useLead(id: LeadId) {
  const api = useApi()
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => api.getLead(id, signal),
  })
}

export interface LogActivityInput {
  activity: NewActivity
  author: User
}

export function useLogActivity(leadId: LeadId) {
  const api = useApi()
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  return useMutation({
    mutationKey: logActivityKey(leadId),
    // While tracing is on, this span is the root of the trace: the click, then the request, then the
    // server's handler, write and emit (AC-7.7).
    mutationFn: ({ activity, author }: LogActivityInput) =>
      withSpan('activity.log', { 'lead.id': leadId, 'activity.type': activity.type }, () =>
        api.createActivity(leadId, activity, author.id),
      ),
    // A failed activity stays in the mutation cache until it is retried or replaced, so it survives
    // the composer unmounting (the salesperson moved on) and is offered again on return.
    gcTime: Infinity,
    // ...which would also keep every success, so each new save clears this lead's earlier ones.
    onMutate: () => {
      const cache = queryClient.getMutationCache()
      cache.findAll({ mutationKey: logActivityKey(leadId), status: 'success' }).forEach((m) => cache.remove(m))
    },
    // Mutation-level, so it runs even if the composer that started the save is gone.
    onError: (error) => {
      const detail = queryClient.getQueryData<z.output<typeof LeadDetailResponse>>(leadKeys.detail(leadId))
      const name = detail?.lead.customer.name ?? 'this lead'
      announce(`Activity for ${name} not saved. ${describeFailure(error)}`)
    },
    onSuccess: ({ activity, lead }) => {
      // The server's lead carries firstResponseAt, so status changes in both views (AC-4.5).
      queryClient.setQueryData<z.output<typeof LeadDetailResponse>>(leadKeys.detail(leadId), (old) =>
        old && {
          lead,
          activities: old.activities.some((a) => a.id === activity.id)
            ? old.activities
            : [...old.activities, activity],
          // The old suggestion may be the step just taken ("Call" after a call): drop it, and
          // refetch so the server works out the next one.
          suggestion: null,
        },
      )
      void queryClient.invalidateQueries({ queryKey: leadKeys.detail(leadId) })
      placeLead(queryClient, lead)
    },
  })
}

type QueryClient = ReturnType<typeof useQueryClient>

/** Puts a changed lead where it now belongs in the inbox, without refetching pages (AC-5.4). */
export function placeLead(queryClient: QueryClient, lead: Lead) {
  const awaiting = queryClient.getQueryData<z.output<typeof LeadListResponse>>(leadKeys.awaiting())
  const joined = lead.firstResponseAt !== null && (awaiting?.leads.some((l) => l.id === lead.id) ?? false)
  queryClient.setQueryData<z.output<typeof LeadListResponse>>(leadKeys.awaiting(), (old) =>
    old && { leads: placeInAwaiting(old.leads, lead) },
  )
  queryClient.setQueryData<ContactedPages>(leadKeys.contacted(), (old) => old && placeInContacted(old, lead, joined))
  void queryClient.invalidateQueries({ queryKey: leadKeys.stats() })
}

/**
 * Fetches one lead (a live event named it, or a claim lost a race) and places it. A failed fetch
 * leaves the row as it was: the API client has logged it, and an open lead shows its own error.
 */
export async function refreshLead(queryClient: QueryClient, api: Api, id: LeadId) {
  try {
    const detail = await queryClient.fetchQuery({
      queryKey: leadKeys.detail(id),
      queryFn: ({ signal }) => api.getLead(id, signal),
    })
    placeLead(queryClient, detail.lead)
  } catch (error) {
    log.warn('lead.refresh_failed', { leadId: id, error: String(error) })
  }
}

export interface ClaimInput {
  action: 'claim' | 'release'
  user: User
}

/** Claim or release a lead (ADR-005). On a 409 the lead is refetched, so the UI shows who won. */
export function useClaim(leadId: LeadId) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action, user }: ClaimInput) =>
      action === 'claim' ? api.claimLead(leadId, user.id) : api.releaseLead(leadId, user.id),
    onSuccess: ({ lead }) => {
      queryClient.setQueryData<z.output<typeof LeadDetailResponse>>(leadKeys.detail(leadId), (old) =>
        old && { ...old, lead },
      )
      placeLead(queryClient, lead)
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.failure.kind === 'http' && error.failure.status === 409) {
        await refreshLead(queryClient, api, leadId)
      }
    },
  })
}

/** Activities submitted for this lead and not yet confirmed by the server (AC-4.2). */
export function usePendingActivities(leadId: LeadId): LogActivityInput[] {
  return useMutationState({
    filters: { mutationKey: logActivityKey(leadId), status: 'pending' },
    select: (mutation) => mutation.state.variables as LogActivityInput,
  })
}

export interface FailedActivity {
  input: LogActivityInput
  error: unknown
  /** Forget the failure, e.g. because it is being retried or replaced. */
  dismiss: () => void
}

type LogMutation = Mutation<unknown, unknown, LogActivityInput>

/** The most recent unsaved activity for this lead, if any (AC-4.4). */
export function useFailedActivity(leadId: LeadId): FailedActivity | undefined {
  const queryClient = useQueryClient()
  const failed = useMutationState({
    filters: { mutationKey: logActivityKey(leadId), status: 'error' },
    select: (mutation) => mutation as LogMutation,
  })
  const latest = failed.at(-1)
  if (!latest) return undefined
  return {
    input: latest.state.variables!,
    error: latest.state.error,
    dismiss: () => failed.forEach((m) => queryClient.getMutationCache().remove(m)),
  }
}

/** Leads with an activity that failed to save, so the inbox can flag them. */
export function useUnsavedLeadIds(): ReadonlySet<LeadId> {
  const ids = useMutationState({
    filters: { mutationKey: ['logActivity'], status: 'error' },
    select: (mutation) => mutation.options.mutationKey?.[1] as LeadId,
  })
  return new Set(ids)
}
