import { Check, Clock, TriangleAlert } from 'lucide-react'
import type { Lead } from '../contract.ts'
import { formatDuration } from '../domain/format.ts'
import { SLA_LABEL } from '../domain/labels.ts'
import { SLA, speedToLead } from '../domain/speedToLead.ts'

const TARGET = formatDuration(SLA.targetMs)

/** The one status mark on an inbox row: words and an icon, never colour alone (AC-2.2). */
export function SpeedToLeadPill({ lead, now }: { lead: Lead; now: number }) {
  const s = speedToLead(lead, now)
  if (s.status === 'contacted') {
    return <span className="meta">Responded in {formatDuration(s.responseMs)}</span>
  }
  const waited = formatDuration(s.waitingMs)
  switch (s.sla) {
    case 'on_track':
      return (
        <span className="pill pill--neutral">
          <Clock aria-hidden size={12} /> {waited}
        </span>
      )
    case 'at_risk':
      return (
        <span className="pill pill--warning">
          <Clock aria-hidden size={12} /> {SLA_LABEL.at_risk} · {waited}
        </span>
      )
    case 'overdue':
      return (
        <span className="pill pill--negative">
          <TriangleAlert aria-hidden size={12} /> {SLA_LABEL.overdue} · {waited}
        </span>
      )
  }
}

/**
 * The detail header's speed-to-lead line, with a meter of time used against the 15-minute target.
 * Overdue fills the track and says by how much.
 */
export function SpeedToLeadMeter({ lead, now }: { lead: Lead; now: number }) {
  const s = speedToLead(lead, now)
  const elapsed = s.status === 'contacted' ? s.responseMs : s.waitingMs
  const ratio = Math.min(1, elapsed / SLA.targetMs)
  const tone =
    s.status === 'contacted' ? (s.metTarget ? 'done' : 'late') : s.sla

  let text: string
  switch (s.status) {
    case 'contacted':
      text = s.metTarget
        ? `Responded in ${formatDuration(s.responseMs)}, within the ${TARGET} target`
        : `Responded in ${formatDuration(s.responseMs)}, ${formatDuration(s.responseMs - SLA.targetMs)} over the ${TARGET} target`
      break
    case 'awaiting_response':
      text =
        s.sla === 'overdue'
          ? `Awaiting response for ${formatDuration(s.waitingMs)}, ${formatDuration(s.waitingMs - SLA.targetMs)} over the ${TARGET} target`
          : `Awaiting response for ${formatDuration(s.waitingMs)} of the ${TARGET} target`
  }

  const Icon = tone === 'done' ? Check : tone === 'overdue' ? TriangleAlert : Clock
  return (
    <div className={`sla sla--${tone}`}>
      <p className="sla__text">
        <Icon aria-hidden size={14} /> {text}
      </p>
      <div className="sla__track" aria-hidden>
        <div className="sla__fill" style={{ width: `${ratio * 100}%` }} />
        <div className="sla__tick" style={{ left: `${(SLA.atRiskAfterMs / SLA.targetMs) * 100}%` }} />
      </div>
    </div>
  )
}
