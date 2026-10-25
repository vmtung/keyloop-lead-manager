// @vitest-environment node
import { describe, expect, test } from 'vitest'
import type { Activity, ActivityId, IsoDateTime, Lead, LeadId, NewActivity, User, UserId } from '../src/contract.ts'
import { notificationsFor, unreadCount, withNotifications } from './notifications.ts'
import { seed } from './seed.ts'
import { appendActivity, createLead, type Data } from './store.ts'

const NOW = new Date('2026-10-25T12:00:00.000Z')
const iso = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() as IsoDateTime
const user = (id: string) => ({ id: id as UserId, name: id }) as User
const [anna, tom] = [user('anna'), user('tom')]
const activity = (id: string): NewActivity => ({ id: id as ActivityId, type: 'call', summary: 'Called' })
const ENQUIRY = { customer: { name: 'Ellie Turner', email: 'e@example.com', phone: '07700 900905' }, enquiryType: 'test_drive', message: '', vehicle: null } as const

function empty(): Data {
  return { users: [anna, tom], leads: [], activities: [], notifications: [], reads: {} }
}

describe('A21: what notifies whom', () => {
  test('a new lead notifies everyone, in the same write', () => {
    const { data, lead } = createLead(empty(), ENQUIRY, '00000000-0000-4000-8000-000000000001' as LeadId, iso(0))
    expect(data.notifications).toEqual([
      { kind: 'new_lead', id: `lead:${lead.id}`, at: iso(0), for: null, leadId: lead.id, customerName: 'Ellie Turner', enquiryType: 'test_drive' },
    ])
    expect(unreadCount(data, anna.id)).toBe(1)
    expect(unreadCount(data, tom.id)).toBe(1)
  })

  test("a teammate's activity on a claimed lead notifies the owner only; the owner's own does not", () => {
    let { data } = createLead(empty(), ENQUIRY, '00000000-0000-4000-8000-000000000001' as LeadId, iso(10))
    const leadId = data.leads[0]!.id
    data = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a1'), anna, iso(9)).data // claims it
    data = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a2'), anna, iso(8)).data
    data = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a3'), tom, iso(7)).data
    const teammate = data.notifications.filter((n) => n.kind === 'teammate_activity')
    expect(teammate).toEqual([
      expect.objectContaining({ id: 'activity:00000000-0000-4000-8000-0000000000a3', for: anna.id, actor: tom, activityType: 'call' }),
    ])
    expect(notificationsFor(data, anna.id).map((n) => n.kind)).toEqual(['teammate_activity', 'new_lead'])
    expect(notificationsFor(data, tom.id).map((n) => n.kind)).toEqual(['new_lead'])
  })

  test('a replayed activity (same ID) notifies nobody twice', () => {
    let { data } = createLead(empty(), ENQUIRY, '00000000-0000-4000-8000-000000000001' as LeadId, iso(10))
    const leadId = data.leads[0]!.id
    data = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a1'), anna, iso(9)).data
    data = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a2'), tom, iso(8)).data
    const again = appendActivity(data, leadId, activity('00000000-0000-4000-8000-0000000000a2'), tom, iso(7)).data
    expect(again.notifications).toHaveLength(data.notifications.length)
  })
})

describe('ADR-007: read up to a time', () => {
  test('only notifications newer than the last read time are unread', () => {
    let data = createLead(empty(), ENQUIRY, '00000000-0000-4000-8000-000000000001' as LeadId, iso(30)).data
    data = createLead(data, ENQUIRY, '00000000-0000-4000-8000-000000000002' as LeadId, iso(5)).data
    expect(unreadCount({ ...data, reads: { anna: iso(10) } }, anna.id)).toBe(1)
    expect(unreadCount({ ...data, reads: { anna: iso(0) } }, anna.id)).toBe(0)
  })

  test('AC-11.5: the sample data has a notification per lead and three unread for each salesperson', () => {
    const data = seed(NOW)
    expect(data.notifications.filter((n) => n.kind === 'new_lead')).toHaveLength(data.leads.length)
    for (const u of data.users) expect(unreadCount(data, u.id)).toBe(3)
  })

  test('withNotifications rebuilds from leads and activities, crediting teammates after the claim only', () => {
    const lead: Lead = {
      id: '00000000-0000-4000-8000-000000000001' as LeadId,
      ...ENQUIRY,
      receivedAt: iso(60),
      firstResponseAt: iso(50),
      claim: { by: anna, at: iso(50) },
    }
    const acts: Activity[] = [
      { id: 'a' as ActivityId, leadId: lead.id, type: 'call', summary: 'x', author: anna, occurredAt: iso(50) },
      { id: 'b' as ActivityId, leadId: lead.id, type: 'note', summary: 'x', author: tom, occurredAt: iso(40) },
    ]
    const data = withNotifications({ ...empty(), leads: [lead], activities: acts }, NOW)
    expect(data.notifications.map((n) => n.id).sort()).toEqual(['activity:b', `lead:${lead.id}`])
    expect(Object.keys(data.reads).sort()).toEqual(['anna', 'tom'])
  })
})
