import { CircleAlert } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { describeFailure } from '../api/describeFailure.ts'
import { useCurrentUser, useNow } from '../app/context.tsx'
import type { Lead, LeadId, UserId } from '../contract.ts'
import { formatWhen } from '../domain/format.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { SLA, speedToLead } from '../domain/speedToLead.ts'
import { Avatar } from './Avatar.tsx'
import { InboxFigures } from './InboxFigures.tsx'
import { useLive } from './live.tsx'
import { useAwaitingLeads, useContactedLeads, useResponseStats, useUnsavedLeadIds } from './queries.ts'
import { SpeedToLeadPill } from './SpeedToLeadStatus.tsx'

/** The page's h1 belongs to the main view: "Leads" here, the customer's name when a lead is open. */
export function LeadInbox({ selectedId }: { selectedId: LeadId | undefined }) {
  const awaiting = useAwaitingLeads()
  const contacted = useContactedLeads()
  const stats = useResponseStats()
  const now = useNow()
  const Title = selectedId ? 'h2' : 'h1'
  const total = contacted.data?.pages[0]?.total
  // The first page's error; a later page's failure shows at the end of the list instead.
  const failed = awaiting.isError ? awaiting.error : contacted.isError && !contacted.data ? contacted.error : null

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <header className="inbox__header">
        <Title id="inbox-title" className="inbox__title">Leads</Title>
        {/* Always rendered, so its space is reserved while loading and the list doesn't jump (AC-1.3). */}
        <InboxFigures awaiting={awaiting.data} stats={stats.data} now={now} />
      </header>

      {failed !== null ? (
        <div className="block-error" role="alert">
          <p>Couldn’t load leads. {describeFailure(failed)}</p>
          <button type="button" className="button button--text"
            onClick={() => void Promise.all([awaiting.refetch(), contacted.refetch()])}>
            Retry
          </button>
        </div>
      ) : !awaiting.data || total === undefined ? (
        <InboxSkeleton />
      ) : awaiting.data.length === 0 && total === 0 ? (
        <p className="empty">No leads yet. New website enquiries will appear here as they arrive.</p>
      ) : (
        <LeadGroups awaiting={awaiting.data} contacted={contacted.data?.pages.flatMap((p) => p.leads) ?? []}
          contactedTotal={total} selectedId={selectedId} now={now}
          more={<LoadMore query={contacted} />} />
      )}
    </section>
  )
}

interface RowState {
  selectedId: LeadId | undefined
  now: number
  /** Read once here and passed down, so a row re-renders only when its own lead changes state. */
  fresh: ReadonlySet<LeadId>
  unsaved: ReadonlySet<LeadId>
  userId: UserId | undefined
}

function LeadGroups(props: {
  awaiting: Lead[]
  contacted: Lead[]
  contactedTotal: number
  selectedId: LeadId | undefined
  now: number
  more: ReactNode
}) {
  const { selectedId, now } = props
  const state: RowState = {
    selectedId,
    now,
    fresh: useLive().fresh,
    unsaved: useUnsavedLeadIds(),
    userId: useCurrentUser().user?.id,
  }
  return (
    <div className="inbox__groups" data-lead-list>
      <LeadGroup title="Awaiting response" leads={props.awaiting} total={props.awaiting.length} state={state}
        empty="Everyone has had a response." />
      <LeadGroup title="Contacted" leads={props.contacted} total={props.contactedTotal} state={state}
        empty="No contacted leads yet." more={props.more} />
    </div>
  )
}

function LeadGroup(props: { title: string; leads: Lead[]; total: number; state: RowState; empty: string; more?: ReactNode }) {
  const id = `group-${props.title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="inbox__group">
      <h2 id={id} className="inbox__group-title">
        {props.title} <span className="count num">{props.total.toLocaleString('en-GB')}</span>
      </h2>
      {props.leads.length === 0 ? (
        <p className="empty empty--inline">{props.empty}</p>
      ) : (
        <ul className="lead-list">
          {props.leads.map((lead) => (
            <li key={lead.id}>
              <LeadRow
                lead={lead}
                now={props.state.now}
                selected={lead.id === props.state.selectedId}
                fresh={props.state.fresh.has(lead.id)}
                unsaved={props.state.unsaved.has(lead.id)}
                ownerLabel={ownerLabel(lead, props.state.userId)}
              />
            </li>
          ))}
        </ul>
      )}
      {props.more}
    </section>
  )
}

/**
 * The end of the contacted list (AC-1.8). Scrolling near it loads the next page; by keyboard it is
 * a button (`j` reaches it), and after loading, focus moves to the first new lead.
 */
function LoadMore({ query }: { query: ReturnType<typeof useContactedLeads> }) {
  const button = useRef<HTMLButtonElement>(null)
  // The row to focus once a page loaded by hand has rendered.
  const focusRow = useRef<number | null>(null)
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query
  const pages = query.data?.pages.length

  useEffect(() => {
    if (isFetchNextPageError) focusRow.current = null
  }, [isFetchNextPageError])

  useEffect(() => {
    if (focusRow.current === null) return
    const rows = document.getElementById('group-contacted')?.closest('section')?.querySelectorAll<HTMLElement>('[data-lead-link]')
    rows?.[focusRow.current]?.focus()
    focusRow.current = null
  }, [pages])

  useEffect(() => {
    const el = button.current
    // jsdom has no IntersectionObserver; there the button is the way in.
    if (!el || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage()
      },
      // The inbox pane scrolls, not the page; start loading well before the end is in view.
      { root: el.closest('.inbox'), rootMargin: '0px 0px 600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // Re-observed after each page, so a button still in view keeps loading.
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  if (!hasNextPage) return null

  function loadByHand() {
    focusRow.current = button.current?.closest('section')?.querySelectorAll('[data-lead-link]').length ?? null
    void fetchNextPage()
  }

  return (
    <div className="load-more">
      {isFetchNextPageError && (
        <p className="load-more__error" role="alert">Couldn’t load more leads. {describeFailure(query.error)}</p>
      )}
      <button ref={button} type="button" className="button button--secondary load-more__button" data-load-more
        aria-disabled={isFetchingNextPage} onClick={() => isFetchingNextPage || loadByHand()}>
        {isFetchingNextPage ? 'Loading more…' : isFetchNextPageError ? 'Retry' : 'Load more'}
      </button>
    </div>
  )
}

/** "You", or the owner's first name: short enough for the row, and the detail has the full name. */
function ownerLabel(lead: Lead, userId: UserId | undefined): string | null {
  if (!lead.claim) return null
  return lead.claim.by.id === userId ? 'You' : (lead.claim.by.name.split(' ')[0] ?? lead.claim.by.name)
}

function LeadRow(props: {
  lead: Lead
  now: number
  selected: boolean
  fresh: boolean
  unsaved: boolean
  ownerLabel: string | null
}) {
  const { lead, now, selected, fresh, unsaved, ownerLabel } = props
  const sla = speedToLead(lead, now)
  const subject = lead.vehicle
    ? `${ENQUIRY_LABEL[lead.enquiryType]} · ${lead.vehicle.make} ${lead.vehicle.model}`
    : ENQUIRY_LABEL[lead.enquiryType]
  return (
    <Link
      to={`/leads/${lead.id}`}
      className={`lead-row${sla.status === 'awaiting_response' ? ' lead-row--awaiting' : ''}${fresh ? ' lead-row--new' : ''}`}
      aria-current={selected ? 'page' : undefined}
      data-lead-link
    >
      <span className="lead-row__name">{lead.customer.name}</span>
      <span className="lead-row__when num">
        {lead.claim && ownerLabel && (
          <>
            <span className="lead-row__owner">
              <Avatar user={lead.claim.by} /> {ownerLabel}
            </span>{' · '}
          </>
        )}
        {formatWhen(lead.receivedAt, now)}
      </span>
      <span className="lead-row__subject">{subject}</span>
      <span className="lead-row__status">
        {/* One status mark per row: an unsaved activity outranks the SLA, it needs action now. */}
        {unsaved ? (
          <span className="pill pill--negative">
            <CircleAlert aria-hidden size={12} /> Not saved
          </span>
        ) : (
          <SpeedToLeadPill lead={lead} now={now} />
        )}
      </span>
      {sla.status === 'awaiting_response' && (
        // The row's clock: time used of the target, coloured by state (AC-1.7). The pill says it in words.
        <span className={`row-clock row-clock--${sla.sla}`} aria-hidden>
          <span style={{ width: `${Math.min(1, sla.waitingMs / SLA.targetMs) * 100}%` }} />
        </span>
      )}
    </Link>
  )
}

function InboxSkeleton() {
  return (
    <div className="inbox__groups" aria-busy="true" aria-label="Loading leads">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="lead-row lead-row--skeleton" aria-hidden>
          <span className="bar" style={{ width: '45%' }} />
          <span className="bar" style={{ width: '20%' }} />
          <span className="bar" style={{ width: '60%' }} />
          <span className="bar" style={{ width: '25%' }} />
        </div>
      ))}
    </div>
  )
}
