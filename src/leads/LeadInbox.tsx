import { CircleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { describeFailure } from '../api/describeFailure.ts'
import { useNow } from '../app/context.tsx'
import type { Lead, LeadId } from '../contract.ts'
import { formatDuration, formatWhen } from '../domain/format.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { SLA, sortForInbox, speedToLead } from '../domain/speedToLead.ts'
import { useLive } from './live.tsx'
import { useLeads, useUnsavedLeadIds } from './queries.ts'
import { SpeedToLeadPill } from './SpeedToLeadStatus.tsx'

/** The page's h1 belongs to the main view: "Leads" here, the customer's name when a lead is open. */
export function LeadInbox({ selectedId }: { selectedId: LeadId | undefined }) {
  const leads = useLeads()
  const now = useNow()
  const Title = selectedId ? 'h2' : 'h1'

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <header className="inbox__header">
        <Title id="inbox-title" className="inbox__title">Leads</Title>
        {leads.data && <p className="inbox__finding">{finding(leads.data, now)}</p>}
      </header>

      {leads.isPending && <InboxSkeleton />}

      {leads.isError && (
        <div className="block-error" role="alert">
          <p>Couldn’t load leads. {describeFailure(leads.error)}</p>
          <button type="button" className="button button--text" onClick={() => void leads.refetch()}>
            Retry
          </button>
        </div>
      )}

      {leads.data?.length === 0 && (
        <p className="empty">No leads yet. New website enquiries will appear here as they arrive.</p>
      )}

      {leads.data && leads.data.length > 0 && (
        <LeadGroups leads={sortForInbox(leads.data)} selectedId={selectedId} now={now} />
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
}

function LeadGroups({ leads, selectedId, now }: { leads: Lead[]; selectedId: LeadId | undefined; now: number }) {
  const state: RowState = { selectedId, now, fresh: useLive().fresh, unsaved: useUnsavedLeadIds() }
  const awaiting = leads.filter((l) => l.firstResponseAt === null)
  const contacted = leads.filter((l) => l.firstResponseAt !== null)
  return (
    <div className="inbox__groups" data-lead-list>
      <LeadGroup title="Awaiting response" leads={awaiting} state={state}
        empty="Everyone has had a response." />
      <LeadGroup title="Contacted" leads={contacted} state={state}
        empty="No contacted leads yet." />
    </div>
  )
}

function LeadGroup(props: { title: string; leads: Lead[]; state: RowState; empty: string }) {
  const id = `group-${props.title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="inbox__group">
      <h2 id={id} className="inbox__group-title">
        {props.title} <span className="count num">{props.leads.length}</span>
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
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LeadRow(props: { lead: Lead; now: number; selected: boolean; fresh: boolean; unsaved: boolean }) {
  const { lead, now, selected, fresh, unsaved } = props
  const awaiting = lead.firstResponseAt === null
  const subject = lead.vehicle
    ? `${ENQUIRY_LABEL[lead.enquiryType]} · ${lead.vehicle.make} ${lead.vehicle.model}`
    : ENQUIRY_LABEL[lead.enquiryType]
  return (
    <Link
      to={`/leads/${lead.id}`}
      className={`lead-row${awaiting ? ' lead-row--awaiting' : ''}${fresh ? ' lead-row--new' : ''}`}
      aria-current={selected ? 'page' : undefined}
      data-lead-link
    >
      <span className="lead-row__name">{lead.customer.name}</span>
      <span className="lead-row__when num">{formatWhen(lead.receivedAt, now)}</span>
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
    </Link>
  )
}

/** The line under the title: the fact that most needs attention right now. */
function finding(leads: Lead[], now: number): string {
  const waiting = leads
    .map((l) => speedToLead(l, now))
    .filter((s) => s.status === 'awaiting_response')
  if (waiting.length === 0) return 'Every lead has had a first response.'
  const overdue = waiting.filter((s) => s.sla === 'overdue').length
  const noun = waiting.length === 1 ? 'lead' : 'leads'
  const target = formatDuration(SLA.targetMs)
  return overdue === 0
    ? `${waiting.length} ${noun} awaiting a first response, all within ${target}.`
    : `${waiting.length} ${noun} awaiting a first response, ${overdue} over ${target}.`
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
