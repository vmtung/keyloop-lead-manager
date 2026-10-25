// Figures for the inbox header (AC-1.6) and the lead to call next (AC-3.7). Pure: the caller passes `now`.
import type { Lead, ResponseStats } from '../contract.ts'
import { SLA, speedToLead } from './speedToLead.ts'

const WINDOW_MS = 24 * 60 * 60_000

/** Who is waiting now, from the awaiting leads the browser holds, so it ticks without refetching. */
export function waitingStats(leads: readonly Lead[], now: number): { waiting: number; overdue: number } {
  let waiting = 0
  let overdue = 0
  for (const lead of leads) {
    const s = speedToLead(lead, now)
    if (s.status !== 'awaiting_response') continue
    waiting += 1
    if (s.sla === 'overdue') overdue += 1
  }
  return { waiting, overdue }
}

/** How fast leads were answered over the last 24 hours. The server runs it over every lead (ADR-006). */
export function responseStats(leads: readonly Lead[], now: number): ResponseStats {
  const responses: number[] = []
  for (const lead of leads) {
    const s = speedToLead(lead, now)
    if (s.status === 'contacted' && now - Date.parse(lead.firstResponseAt!) <= WINDOW_MS) {
      responses.push(s.responseMs)
    }
  }
  return {
    answered: responses.length,
    withinTargetShare:
      responses.length === 0 ? null : responses.filter((ms) => ms <= SLA.targetMs).length / responses.length,
    medianResponseMs: median(responses),
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** The longest-waiting unclaimed lead, or the longest-waiting one if all are claimed. */
export function nextUp(leads: readonly Lead[], now: number): Lead | null {
  const waiting = leads
    .filter((l) => speedToLead(l, now).status === 'awaiting_response')
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
  return waiting.find((l) => l.claim === null) ?? waiting[0] ?? null
}
