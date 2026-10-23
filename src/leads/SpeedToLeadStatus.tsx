import { Check, Clock, TriangleAlert } from 'lucide-react'
import type { Lead } from '../contract.ts'
import { formatDuration } from '../domain/format.ts'
import { SLA_LABEL } from '../domain/labels.ts'
import { SLA, speedToLead } from '../domain/speedToLead.ts'
import { Duration } from './InboxFigures.tsx'

const TARGET = formatDuration(SLA.targetMs)

/** The one status mark on an inbox row: words and an icon, never colour alone (AC-2.2). */
export function SpeedToLeadPill({ lead, now }: { lead: Lead; now: number }) {
  const s = speedToLead(lead, now)
  if (s.status === 'contacted') {
    // A missed target stays visible after the fact, in the warning colour and in words (AC-1.7).
    return s.metTarget ? (
      <span className="meta">Responded in {formatDuration(s.responseMs)}</span>
    ) : (
      <span className="meta meta--late">Responded in {formatDuration(s.responseMs)} · late</span>
    )
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
 * The lead's headline figure: how long the customer has waited, or how fast they were answered,
 * with a meter of time used against the 15-minute target and the state in words.
 */
export function SpeedToLeadMeter({ lead, now }: { lead: Lead; now: number }) {
  const s = speedToLead(lead, now)
  const elapsed = s.status === 'contacted' ? s.responseMs : s.waitingMs
  const ratio = Math.min(1, elapsed / SLA.targetMs)
  const tone = s.status === 'contacted' ? (s.metTarget ? 'done' : 'late') : s.sla
  const over = formatDuration(elapsed - SLA.targetMs)
  const left = formatDuration(SLA.targetMs - elapsed)

  let text: string
  switch (tone) {
    case 'done':
      text = `Within the ${TARGET} target`
      break
    case 'late':
      text = `Late · ${over} over the ${TARGET} target`
      break
    case 'on_track':
      text = `On track · ${left} left of the ${TARGET} target`
      break
    case 'at_risk':
      text = `At risk · ${left} left of the ${TARGET} target`
      break
    case 'overdue':
      text = `Overdue · ${over} over the ${TARGET} target`
  }

  const Icon = tone === 'done' ? Check : tone === 'overdue' || tone === 'late' ? TriangleAlert : Clock
  return (
    <div className={`sla sla--${tone}`}>
      <p className="sla__label">{s.status === 'contacted' ? 'First response' : 'Waiting'}</p>
      <p className="sla__figure num">
        <Duration ms={elapsed} />
      </p>
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
