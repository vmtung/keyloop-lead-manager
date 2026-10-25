// Speed-to-lead rules (specs/assumptions.md A6, A8–A10). Pure functions: the caller passes `now`.
// The mock server reuses isContactAttempt and firstResponseAt, so the rule lives in one place.
import type { Activity, ActivityType, IsoDateTime, Lead } from '../contract.ts'

const MINUTE = 60_000

export const SLA = {
  atRiskAfterMs: 10 * MINUTE,
  targetMs: 15 * MINUTE,
} as const

export type SlaState = 'on_track' | 'at_risk' | 'overdue'

export type SpeedToLead =
  | { status: 'awaiting_response'; waitingMs: number; sla: SlaState }
  | { status: 'contacted'; responseMs: number; metTarget: boolean }

export function isContactAttempt(type: ActivityType): boolean {
  switch (type) {
    case 'call':
    case 'email':
    case 'sms':
    case 'appointment':
      return true
    case 'note':
      return false
  }
}

export function firstResponseAt(activities: readonly Activity[]): IsoDateTime | null {
  let earliest: IsoDateTime | null = null
  for (const activity of activities) {
    if (!isContactAttempt(activity.type)) continue
    if (earliest === null || Date.parse(activity.occurredAt) < Date.parse(earliest)) {
      earliest = activity.occurredAt
    }
  }
  return earliest
}

function slaState(waitingMs: number): SlaState {
  if (waitingMs > SLA.targetMs) return 'overdue'
  if (waitingMs >= SLA.atRiskAfterMs) return 'at_risk'
  return 'on_track'
}

export function speedToLead(lead: Lead, now: number): SpeedToLead {
  const received = Date.parse(lead.receivedAt)
  if (lead.firstResponseAt === null) {
    const waitingMs = Math.max(0, now - received)
    return { status: 'awaiting_response', waitingMs, sla: slaState(waitingMs) }
  }
  const responseMs = Math.max(0, Date.parse(lead.firstResponseAt) - received)
  return { status: 'contacted', responseMs, metTarget: responseMs <= SLA.targetMs }
}

/** Awaiting response first, longest-waiting first; then contacted, newest first (AC-1.2). */
export function sortForInbox(leads: readonly Lead[]): Lead[] {
  const awaiting = leads.filter((l) => l.firstResponseAt === null)
  const contacted = leads.filter((l) => l.firstResponseAt !== null)
  return [...awaiting.sort((a, b) => newestFirst(b, a)), ...contacted.sort(newestFirst)]
}

/**
 * Newest received first, ties broken by ID, so the order is total. The contacted pages' cursor is
 * this key (ADR-006): without the tie-break, two leads received in the same millisecond could be
 * split across pages and one skipped.
 */
export function newestFirst(a: Pick<Lead, 'receivedAt' | 'id'>, b: Pick<Lead, 'receivedAt' | 'id'>): number {
  return Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
}
