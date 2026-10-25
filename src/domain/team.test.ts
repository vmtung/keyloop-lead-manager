import { describe, expect, test } from 'vitest'
import type { Activity, ActivityId, ActivityType, IsoDateTime, Lead, LeadId, User, UserId } from '../contract.ts'
import { teamStats } from './team.ts'

const NOW = Date.parse('2026-10-25T12:00:00.000Z')
const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString() as IsoDateTime
const user = (id: string, name: string) => ({ id: id as UserId, name }) as User
const anna = user('anna', 'Anna Clarke')
const tom = user('tom', 'Tom Hughes')
const priya = user('priya', 'Priya Shah')

let n = 0
/** A lead received `ago` minutes before NOW, with activities `[type, author, minutes after receipt]`. */
function lead(ago: number, steps: [ActivityType, User, number][] = [], claim: User | null = null) {
  n += 1
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as LeadId
  const received = NOW - ago * MIN
  const activities: Activity[] = steps.map(([type, author, after], i) => ({
    id: `00000000-0000-4000-9000-${String(n * 10 + i).padStart(12, '0')}` as ActivityId,
    leadId: id,
    type,
    summary: type,
    author,
    occurredAt: iso(received + after * MIN),
  }))
  const firstContact = activities.find((a) => a.type !== 'note')
  const l: Lead = {
    id,
    customer: { name: `Lead ${n}`, email: 'x@example.com', phone: '07700 900000' },
    enquiryType: 'vehicle_enquiry',
    message: '',
    vehicle: null,
    receivedAt: iso(received),
    firstResponseAt: firstContact?.occurredAt ?? null,
    claim: claim ? { by: claim, at: iso(received) } : null,
  }
  return { lead: l, activities }
}

function stats(items: ReturnType<typeof lead>[]) {
  return teamStats(
    items.map((i) => i.lead),
    items.flatMap((i) => i.activities),
    [anna, tom, priya],
    NOW,
  )
}

describe('AC-10.1: teamStats', () => {
  test('credits each lead to whoever made the first contact, even on a lead someone else claimed', () => {
    const people = stats([
      lead(60, [['call', anna, 5]]),
      lead(90, [['email', anna, 25]]),
      // Tom claimed it, Priya answered: Priya gets the credit (A20).
      lead(120, [['note', tom, 1], ['sms', priya, 8], ['call', tom, 30]], tom),
    ])
    const anna_ = people.find((p) => p.user.id === 'anna')!
    expect(anna_).toMatchObject({ answered: 2, withinTargetShare: 0.5, medianResponseMs: 15 * MIN })
    expect(people.find((p) => p.user.id === 'priya')).toMatchObject({ answered: 1, withinTargetShare: 1, medianResponseMs: 8 * MIN })
    expect(people.find((p) => p.user.id === 'tom')).toMatchObject({ answered: 0, withinTargetShare: null, medianResponseMs: null })
  })

  test('only first responses in the last 24 hours count', () => {
    const people = stats([lead(26 * 60, [['call', anna, 5]]), lead(60, [['call', anna, 10]])])
    expect(people.find((p) => p.user.id === 'anna')).toMatchObject({ answered: 1, medianResponseMs: 10 * MIN })
  })

  test('counts the waiting leads each person has claimed, and how many are overdue', () => {
    const people = stats([lead(5, [], tom), lead(40, [], tom), lead(3, []), lead(20, [['note', priya, 1]], priya)])
    expect(people.find((p) => p.user.id === 'tom')).toMatchObject({ claimedWaiting: 2, claimedOverdue: 1 })
    expect(people.find((p) => p.user.id === 'priya')).toMatchObject({ claimedWaiting: 1, claimedOverdue: 1 })
    expect(people.find((p) => p.user.id === 'anna')).toMatchObject({ claimedWaiting: 0, claimedOverdue: 0 })
  })

  test('busiest first, then by name; everyone is listed', () => {
    const people = stats([lead(60, [['call', tom, 5]]), lead(70, [['call', tom, 5]]), lead(80, [['call', priya, 5]])])
    expect(people.map((p) => p.user.name)).toEqual(['Tom Hughes', 'Priya Shah', 'Anna Clarke'])
  })
})
