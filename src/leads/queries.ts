// Server state for leads. Optimistic logging follows ADR-004: the pending activity is rendered from
// the mutation's own variables, so a failure needs no cache rollback, only the entry disappearing.
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { useApi } from '../app/context.tsx'
import type { LeadDetailResponse, LeadId, LeadListResponse, NewActivity, User } from '../contract.ts'

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
  return useMutation({
    mutationKey: logActivityKey(leadId),
    mutationFn: ({ activity, author }: LogActivityInput) =>
      api.createActivity(leadId, activity, author.id),
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
      queryClient.setQueryData<z.output<typeof LeadListResponse>>(leadKeys.list(), (old) =>
        old && { leads: old.leads.map((l) => (l.id === lead.id ? lead : l)) },
      )
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
