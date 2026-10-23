// Server state for leads. Optimistic logging follows ADR-004: the pending activity is rendered from
// the mutation's own variables, so a failure needs no cache rollback, only the entry disappearing.
import { type Mutation, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { describeFailure } from '../api/describeFailure.ts'
import { useAnnounce, useApi } from '../app/context.tsx'
import { ApiError } from '../api/client.ts'
import type { Lead, LeadDetailResponse, LeadId, LeadListResponse, NewActivity, User } from '../contract.ts'

export const leadKeys = {
  all: ['leads'] as const,
  list: () => ['leads', 'list'] as const,
  detail: (id: LeadId) => ['leads', 'detail', id] as const,
}

const logActivityKey = (leadId: LeadId) => ['logActivity', leadId] as const

export function useLeads() {
  const api = useApi()
  return useQuery({
    queryKey: leadKeys.list(),
    queryFn: ({ signal }) => api.listLeads(signal),
    select: (data) => data.leads,
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
    mutationFn: ({ activity, author }: LogActivityInput) =>
      api.createActivity(leadId, activity, author.id),
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
        },
      )
      setListLead(queryClient, lead)
    },
  })
}

type QueryClient = ReturnType<typeof useQueryClient>

function setListLead(queryClient: QueryClient, lead: Lead) {
  queryClient.setQueryData<z.output<typeof LeadListResponse>>(leadKeys.list(), (old) =>
    old && { leads: old.leads.map((l) => (l.id === lead.id ? lead : l)) },
  )
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
      setListLead(queryClient, lead)
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.failure.kind === 'http' && error.failure.status === 409) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: leadKeys.detail(leadId) }),
          queryClient.invalidateQueries({ queryKey: leadKeys.list() }),
        ])
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
