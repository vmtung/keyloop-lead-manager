// Live updates (ADR-002): events carry IDs only, so each one invalidates the queries it affects and
// TanStack Query refetches them. The REST API stays the only way data reaches the cache.
import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { type EventSourceLike, type LiveStatus, subscribeToEvents } from '../api/events.ts'
import { useAnnounce } from '../app/context.tsx'
import type { LeadDetailResponse, LeadId, LeadListResponse, ServerEvent } from '../contract.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { leadKeys } from './queries.ts'

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
  const announce = useAnnounce()
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [fresh, setFresh] = useState<ReadonlySet<LeadId>>(new Set())
  const previous = useRef<LiveStatus>('connecting')

  useEffect(() => {
    function markFresh(id: LeadId) {
      setFresh((s) => new Set(s).add(id))
      setTimeout(() => {
        setFresh((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
      }, FRESH_MS)
    }

    async function onEvent(event: ServerEvent) {
      switch (event.type) {
        case 'lead.created': {
          await queryClient.invalidateQueries({ queryKey: leadKeys.list() })
          const leads = queryClient.getQueryData<z.output<typeof LeadListResponse>>(leadKeys.list())
          const lead = leads?.leads.find((l) => l.id === event.leadId)
          if (!lead) return // the refetch failed; the inbox shows its own error
          markFresh(lead.id)
          announce(`New lead from ${lead.customer.name}: ${ENQUIRY_LABEL[lead.enquiryType]}.`)
          return
        }
        case 'activity.created': {
          const detail = queryClient.getQueryData<z.output<typeof LeadDetailResponse>>(
            leadKeys.detail(event.leadId),
          )
          // Our own activity is already in the cache from the mutation's response.
          if (detail?.activities.some((a) => a.id === event.activityId)) return
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: leadKeys.detail(event.leadId) }),
            queryClient.invalidateQueries({ queryKey: leadKeys.list() }),
          ])
          return
        }
      }
    }

    return subscribeToEvents('/api/events', {
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
        // No event replay: refetch everything cached so nothing missed stays missing (AC-5.3).
        void queryClient.invalidateQueries({ queryKey: leadKeys.all })
        announce('Live updates resumed.')
      },
    })
  }, [queryClient, announce, createSource])

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
      <span className="live__dot" aria-hidden /> {STATUS_TEXT[status]}
    </span>
  )
}
