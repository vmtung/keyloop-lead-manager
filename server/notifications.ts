// Who hears about what (A21), and read state as one time per person (ADR-007). Pure: the store calls
// these inside the same write as the change that causes them.
import type { Activity, IsoDateTime, Lead, Notification, UserId } from '../src/contract.ts'
import type { Data } from './store.ts'

/** Everyone hears about a new lead. */
export function newLeadNotification(lead: Lead): Notification {
  return {
    kind: 'new_lead',
    id: `lead:${lead.id}`,
    at: lead.receivedAt,
    for: null,
    leadId: lead.id,
    customerName: lead.customer.name,
    enquiryType: lead.enquiryType,
  }
}

/** The owner hears when someone else works their lead; nobody hears about their own activity. */
export function teammateNotification(claim: Lead['claim'], lead: Lead, activity: Activity): Notification | null {
  if (!claim || claim.by.id === activity.author.id) return null
  return {
    kind: 'teammate_activity',
    id: `activity:${activity.id}`,
    at: activity.occurredAt,
    for: claim.by.id,
    leadId: lead.id,
    customerName: lead.customer.name,
    actor: activity.author,
    activityType: activity.type,
  }
}

/** This person's notifications, newest first. */
export function notificationsFor(data: Data, userId: UserId): Notification[] {
  return data.notifications
    .filter((n) => n.for === null || n.for === userId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0))
}

export function unreadCount(data: Data, userId: UserId): number {
  const read = data.reads[userId]
  const since = read ? Date.parse(read) : -Infinity
  return data.notifications.filter((n) => (n.for === null || n.for === userId) && Date.parse(n.at) > since).length
}

export function markRead(data: Data, userId: UserId, now: IsoDateTime): Data {
  return { ...data, reads: { ...data.reads, [userId]: now } }
}

/**
 * Starting data: every notification its leads and activities would have caused, and everyone read
 * up to 45 minutes ago, so the newest few are unread.
 */
export function withNotifications(data: Data, now: Date): Data {
  const leads = new Map(data.leads.map((l) => [l.id, l]))
  const notifications: Notification[] = data.leads.map(newLeadNotification)
  for (const a of data.activities) {
    const lead = leads.get(a.leadId)
    // Only what happened after the claim: before it, nobody owned the lead.
    if (!lead?.claim || Date.parse(a.occurredAt) <= Date.parse(lead.claim.at)) continue
    const n = teammateNotification(lead.claim, lead, a)
    if (n) notifications.push(n)
  }
  const readAt = new Date(now.getTime() - 45 * 60_000).toISOString() as IsoDateTime
  return { ...data, notifications, reads: Object.fromEntries(data.users.map((u) => [u.id, readAt])) }
}
