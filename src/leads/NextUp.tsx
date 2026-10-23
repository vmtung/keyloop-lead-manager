import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useNow } from '../app/context.tsx'
import type { Lead } from '../contract.ts'
import { nextUp } from '../domain/inbox.ts'
import { sortForInbox } from '../domain/speedToLead.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { Avatar } from './Avatar.tsx'
import { useLeads } from './queries.ts'
import { SpeedToLeadMeter, SpeedToLeadPill } from './SpeedToLeadStatus.tsx'

/**
 * With no lead open, the main pane offers the lead to call next instead of empty space (AC-3.7):
 * the longest-waiting unclaimed one, so the most urgent job is one click away.
 */
export function NextUp() {
  const leads = useLeads()
  const now = useNow()
  if (!leads.data) return <section className="detail detail--empty" aria-label="Next up" />

  const lead = nextUp(leads.data, now)
  return (
    <section className="detail detail--next" aria-labelledby="next-up-title">
      <h2 id="next-up-title" className="next__title">Next up</h2>
      {lead ? (
        <div className="next__card">
          <div className="next__identity">
            <p className="next__name">{lead.customer.name}</p>
            <p className="detail__subject">
              {ENQUIRY_LABEL[lead.enquiryType]}
              {lead.vehicle && ` · ${lead.vehicle.make} ${lead.vehicle.model}`}
            </p>
            {lead.message && <blockquote className="log__message next__message">{lead.message}</blockquote>}
            {lead.claim && (
              <p className="meta next__claim">
                <Avatar user={lead.claim.by} /> Claimed by {lead.claim.by.name}
              </p>
            )}
            <Link to={`/leads/${lead.id}`} className="button button--primary next__open">
              Open lead <ArrowRight aria-hidden size={16} />
            </Link>
          </div>
          <SpeedToLeadMeter lead={lead} now={now} />
        </div>
      ) : (
        <p className="next__none">No one is waiting for a first response.</p>
      )}
      {lead && <AfterThat leads={leads.data} skip={lead} now={now} />}
      <p className="meta next__keys">
        <kbd>j</kbd> <kbd>k</kbd> move through leads · <kbd>Enter</kbd> opens · <kbd>c</kbd> logs a follow-up
      </p>
    </section>
  )
}

/** The rest of the queue, longest wait first: what comes after the lead above. */
function AfterThat({ leads, skip, now }: { leads: Lead[]; skip: Lead; now: number }) {
  const rest = sortForInbox(leads).filter((l) => l.firstResponseAt === null && l.id !== skip.id)
  if (rest.length === 0) return null
  return (
    <section className="next__queue" aria-labelledby="after-that-title">
      <h3 id="after-that-title">After that</h3>
      <ul>
        {rest.map((l) => (
          <li key={l.id}>
            <Link to={`/leads/${l.id}`}>
              <span>{l.customer.name}</span>
              <SpeedToLeadPill lead={l} now={now} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
