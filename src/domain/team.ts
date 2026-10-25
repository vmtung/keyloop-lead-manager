// The team view's figures (AC-10.1). Pure: the server passes every lead and activity, and `now`.
import type { Activity, Lead, LeadId, TeamMemberStats, User } from '../contract.ts'
import { summariseResponses } from './inbox.ts'
import { isContactAttempt, speedToLead } from './speedToLead.ts'

const WINDOW_MS = 24 * 60 * 60_000

export function teamStats(
  leads: readonly Lead[],
  activities: readonly Activity[],
  users: readonly User[],
  now: number,
): TeamMemberStats[] {
  // Who made each lead's first contact attempt: they get the credit, whoever claimed it (A20).
  const firstContact = new Map<LeadId, Activity>()
  for (const a of activities) {
    if (!isContactAttempt(a.type)) continue
    const seen = firstContact.get(a.leadId)
    if (!seen || Date.parse(a.occurredAt) < Date.parse(seen.occurredAt)) firstContact.set(a.leadId, a)
  }

  const responses = new Map<string, number[]>(users.map((u) => [u.id, []]))
  const waiting = new Map<string, { claimed: number; overdue: number }>(users.map((u) => [u.id, { claimed: 0, overdue: 0 }]))
  for (const lead of leads) {
    const s = speedToLead(lead, now)
    if (s.status === 'contacted') {
      const by = firstContact.get(lead.id)?.author.id
      if (by && now - Date.parse(lead.firstResponseAt!) <= WINDOW_MS) responses.get(by)?.push(s.responseMs)
    } else if (lead.claim) {
      const load = waiting.get(lead.claim.by.id)
      if (load) {
        load.claimed += 1
        if (s.sla === 'overdue') load.overdue += 1
      }
    }
  }

  return users
    .map((user) => ({
      user,
      ...summariseResponses(responses.get(user.id) ?? []),
      claimedWaiting: waiting.get(user.id)?.claimed ?? 0,
      claimedOverdue: waiting.get(user.id)?.overdue ?? 0,
    }))
    .sort((a, b) => b.answered - a.answered || a.user.name.localeCompare(b.user.name))
}
