import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../api/client.ts'
import { describeFailure } from '../api/describeFailure.ts'
import { useNow } from '../app/context.tsx'
import type { Lead, LeadId } from '../contract.ts'
import { formatPrice, formatWhen } from '../domain/format.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { ActivityComposer } from './ActivityComposer.tsx'
import { ActivityLog } from './ActivityLog.tsx'
import { useLead, usePendingActivities } from './queries.ts'
import { SpeedToLeadMeter } from './SpeedToLeadStatus.tsx'

export function LeadDetail({ leadId }: { leadId: LeadId }) {
  const query = useLead(leadId)
  const pending = usePendingActivities(leadId)
  const now = useNow()
  const name = query.data?.lead.customer.name

  useEffect(() => {
    if (!name) return
    document.title = `${name} · Lead Manager`
    return () => {
      document.title = 'Lead Manager'
    }
  }, [name])

  if (query.isPending) return <DetailSkeleton />

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.failure.kind === 'http' && query.error.failure.status === 404
    return notFound ? (
      <LeadNotFound />
    ) : (
      <section className="detail">
        <BackLink />
        <div className="block-error" role="alert">
          <p>Couldn’t load this lead. {describeFailure(query.error)}</p>
          <button type="button" className="button button--text" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      </section>
    )
  }

  const { lead, activities } = query.data
  return (
    <article className="detail" aria-labelledby="lead-name">
      <BackLink />
      <header className="detail__header">
        <h1 id="lead-name">{lead.customer.name}</h1>
        <p className="contact">
          <a href={`tel:${lead.customer.phone.replace(/\s/g, '')}`} className="num">
            <Phone aria-hidden size={14} /> {lead.customer.phone}
          </a>
          <a href={`mailto:${lead.customer.email}`}>
            <Mail aria-hidden size={14} /> {lead.customer.email}
          </a>
        </p>
        <SpeedToLeadMeter lead={lead} now={now} />
      </header>
      <div className="detail__body">
        <section className="detail__log" aria-label="Follow-ups">
          <ActivityLog lead={lead} activities={activities} pending={pending} now={now} />
          <ActivityComposer key={leadId} leadId={leadId} />
        </section>
        <LeadFacts lead={lead} now={now} />
      </div>
    </article>
  )
}

function LeadFacts({ lead, now }: { lead: Lead; now: number }) {
  const { vehicle } = lead
  return (
    <aside className="facts" aria-label="Lead details">
      <dl>
        <dt>Enquiry</dt>
        <dd>{ENQUIRY_LABEL[lead.enquiryType]}</dd>
        <dt>Received</dt>
        <dd className="num">{formatWhen(lead.receivedAt, now)}</dd>
      </dl>
      <h3 className="facts__title">Vehicle of interest</h3>
      {vehicle ? (
        <dl>
          <dt>Vehicle</dt>
          <dd>{vehicle.make} {vehicle.model}</dd>
          <dt>Variant</dt>
          <dd>{vehicle.variant ?? <Missing />}</dd>
          <dt>Registration</dt>
          <dd className="num">{vehicle.registration ?? <Missing />}</dd>
          <dt>Price</dt>
          <dd className="num">{vehicle.pricePence === null ? <Missing /> : formatPrice(vehicle.pricePence)}</dd>
        </dl>
      ) : (
        <p className="meta">No specific vehicle. General enquiry.</p>
      )}
    </aside>
  )
}

const Missing = () => <span className="meta" aria-label="Not given">—</span>

function BackLink() {
  return (
    <Link to="/leads" className="back-link">
      <ArrowLeft aria-hidden size={16} /> All leads
    </Link>
  )
}

export function LeadNotFound() {
  return (
    <section className="detail detail--empty">
      <h1>Lead not found</h1>
      <p className="meta">It may have been removed, or the link is wrong.</p>
      <Link to="/leads" className="button button--secondary">Back to the inbox</Link>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <section className="detail" aria-busy="true" aria-label="Loading lead">
      <div className="detail__header" aria-hidden>
        <span className="bar" style={{ width: 220, height: 24 }} />
        <span className="bar" style={{ width: 320, height: 14 }} />
      </div>
    </section>
  )
}
