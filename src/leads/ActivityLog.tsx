import { CalendarCheck, Globe, Mail, MessageSquare, Phone, StickyNote, type LucideIcon } from 'lucide-react'
import type { Activity, ActivityType, Lead } from '../contract.ts'
import { formatWhen } from '../domain/format.ts'
import { ACTIVITY_LABEL } from '../domain/labels.ts'
import type { LogActivityInput } from './queries.ts'

const ICON: Record<ActivityType, LucideIcon> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
  appointment: CalendarCheck,
  note: StickyNote,
}

/** Oldest first, opening with the enquiry itself (AC-3.3, specs A15). */
export function ActivityLog({
  lead,
  activities,
  pending,
  now,
}: {
  lead: Lead
  activities: Activity[]
  pending: LogActivityInput[]
  now: number
}) {
  // A pending entry stops rendering the moment its saved copy is in the list.
  const saved = new Set(activities.map((a) => a.id))
  const unsaved = pending.filter((p) => !saved.has(p.activity.id))

  return (
    <ol className="log" aria-label="Activity log">
      <li className="log__entry">
        <span className="log__icon" aria-hidden>
          <Globe size={16} />
        </span>
        <p className="log__meta">
          <span className="log__type">Lead received</span> from the website ·{' '}
          <time dateTime={lead.receivedAt}>{formatWhen(lead.receivedAt, now)}</time>
        </p>
        {lead.message && <blockquote className="log__message">{lead.message}</blockquote>}
      </li>

      {activities.map((a) => (
        <Entry key={a.id} type={a.type} summary={a.summary} author={a.author.name}>
          <time dateTime={a.occurredAt}>{formatWhen(a.occurredAt, now)}</time>
        </Entry>
      ))}

      {unsaved.map(({ activity, author }) => (
        <Entry key={activity.id} type={activity.type} summary={activity.summary} author={author.name} pending>
          <span>Saving…</span>
        </Entry>
      ))}

      {activities.length === 0 && unsaved.length === 0 && (
        <li className="log__prompt">No follow-ups yet. Log the first one below.</li>
      )}
    </ol>
  )
}

function Entry(props: {
  type: ActivityType
  summary: string
  author: string
  pending?: boolean
  children: React.ReactNode
}) {
  const Icon = ICON[props.type]
  return (
    <li className={`log__entry${props.pending ? ' log__entry--pending' : ''}`} aria-busy={props.pending}>
      <span className="log__icon" aria-hidden>
        <Icon size={16} />
      </span>
      <p className="log__meta">
        <span className="log__type">{ACTIVITY_LABEL[props.type]}</span> by {props.author} · {props.children}
      </p>
      <p className="log__summary">{props.summary}</p>
    </li>
  )
}
