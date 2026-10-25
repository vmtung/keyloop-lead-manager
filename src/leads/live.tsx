// Live updates (ADR-002): events carry IDs only, so the client fetches what changed from the REST API,
// which stays the only way data reaches the cache. A changed lead is placed in the inbox rather than
// refetching every loaded page (ADR-006).
import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { type EventSourceLike, type LiveStatus, subscribeToEvents } from '../api/events.ts'
import { useAnnounce, useApi } from '../app/context.tsx'
import type { LeadDetailResponse, LeadId, LeadListResponse, ServerEvent } from '../contract.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import type { ContactedPages } from './placeLead.ts'
import { playChime, isSoundOn } from '../notifications/chime.ts'
import { notificationKeys } from '../notifications/queries.ts'
import { useShowToast } from '../notifications/toasts.tsx'
import { leadKeys, refreshLead } from './queries.ts'

const FRESH_MS = 8_000

interface Live {
  status: LiveStatus
  /** Leads that arrived over the stream in the last few seconds, for a brief highlight. */
  fresh: ReadonlySet<LeadId>
}

const LiveContext = createContext<Live>({ status: 'connecting', fresh: new Set() })

export const useLive = () => use(LiveContext)

// Module-level so its identity is stable: a new function each render would resubscribe.
const browserEventSource = (url: string): EventSourceLike => new EventSource(url)

export function LiveUpdatesProvider({
  createSource = browserEventSource,
  children,
}: {
  createSource?: (url: string) => EventSourceLike
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const api = useApi()
  const announce = useAnnounce()
  const showToast = useShowToast()
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [fresh, setFresh] = useState<ReadonlySet<LeadId>>(new Set())
  const previous = useRef<LiveStatus>('connecting')

  useEffect(() => {
    const freshTimers = new Set<ReturnType<typeof setTimeout>>()
    function markFresh(id: LeadId) {
      setFresh((s) => new Set(s).add(id))
      const timer = setTimeout(() => {
        freshTimers.delete(timer)
        setFresh((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
      }, FRESH_MS)
      freshTimers.add(timer)
    }

    async function onEvent(event: ServerEvent) {
      // New leads and teammates' activity are what notify (A21): refresh the unread count.
      if (event.type !== 'lead.updated') void queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      switch (event.type) {
        case 'lead.created': {
          // New leads are waiting, and the waiting list is small: refetch it whole.
          await queryClient.invalidateQueries({ queryKey: leadKeys.awaiting() })
          const leads = queryClient.getQueryData<z.output<typeof LeadListResponse>>(leadKeys.awaiting())
          const lead = leads?.leads.find((l) => l.id === event.leadId)
          if (!lead) return // the refetch failed; the inbox shows its own error
          markFresh(lead.id)
          announce(`New lead from ${lead.customer.name}: ${ENQUIRY_LABEL[lead.enquiryType]}.`)
          showToast({
            id: lead.id,
            title: `New lead: ${lead.customer.name}`,
            detail: lead.vehicle
              ? `${ENQUIRY_LABEL[lead.enquiryType]} · ${lead.vehicle.make} ${lead.vehicle.model}`
              : ENQUIRY_LABEL[lead.enquiryType],
            leadId: lead.id,
          })
          if (isSoundOn()) playChime()
          return
        }
        case 'activity.created': {
          const detail = queryClient.getQueryData<z.output<typeof LeadDetailResponse>>(
            leadKeys.detail(event.leadId),
          )
          // Our own activity is already in the cache from the mutation's response.
          if (detail?.activities.some((a) => a.id === event.activityId)) return
          await refreshLead(queryClient, api, event.leadId)
          return
        }
        case 'lead.updated': {
          // A claim or release (AC-8.6). Our own is already cached; one lead's refetch is cheap and correct.
          await refreshLead(queryClient, api, event.leadId)
          return
        }
        default:
          // A new event type in the contract fails the build here until it is handled.
          return event satisfies never
      }
    }

    const unsubscribe = subscribeToEvents('/api/events', {
      create: createSource,
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      onEvent: (event) => void onEvent(event),
      onStatus: (next) => {
        if (next === 'reconnecting' && previous.current === 'live') {
          announce('Live updates paused. Reconnecting.')
        }
        previous.current = next
        setStatus(next)
      },
      onResume: () => {
        // No event replay: refetch everything cached so nothing missed stays missing (AC-5.3). Missed
        // events could have moved any loaded row, so the contacted list restarts from its first page
        // rather than refetching every page loaded (AC-5.4).
        queryClient.setQueryData<ContactedPages>(leadKeys.contacted(), (old) =>
          old && { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) },
        )
        void queryClient.invalidateQueries({ queryKey: leadKeys.all })
        announce('Live updates resumed.')
      },
    })
    return () => {
      unsubscribe()
      freshTimers.forEach(clearTimeout)
    }
  }, [queryClient, api, announce, showToast, createSource])

  return <LiveContext value={{ status, fresh }}>{children}</LiveContext>
}

const STATUS_TEXT: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
}

export function LiveIndicator() {
  const { status } = useLive()
  return (
    <span className={`live live--${status}`} title={status === 'reconnecting' ? 'New leads will appear once the connection is back.' : undefined}>
      <span className="live__dot" aria-hidden /> <span className="live__label">{STATUS_TEXT[status]}</span>
    </span>
  )
}
