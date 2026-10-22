import { describe, expect, test } from 'vitest'
import type { Activity, ActivityType, IsoDateTime, Lead } from '../contract'
import { firstResponseAt, isContactAttempt, sortForInbox, speedToLead } from './speedToLead'

const RECEIVED = '2026-10-22T09:00:00.000Z'
const minutes = (n: number) => n * 60_000
const at = (offsetMinutes: number) => Date.parse(RECEIVED) + minutes(offsetMinutes)
const iso = (offsetMinutes: number) => new Date(at(offsetMinutes)).toISOString() as IsoDateTime

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: crypto.randomUUID(),
    customer: { name: 'Sam Patel', email: 'sam@example.com', phone: '07700 900123' },
    enquiryType: 'vehicle_enquiry',
    message: '',
    vehicle: null,
    receivedAt: RECEIVED,
    firstResponseAt: null,
    ...overrides,
  } as Lead
}

function activity(type: ActivityType, offsetMinutes: number): Activity {
  return {
    id: crypto.randomUUID(),
    leadId: crypto.randomUUID(),
    type,
    summary: 'x',
    author: { id: 'anna', name: 'Anna Clarke' },
    occurredAt: iso(offsetMinutes),
  } as Activity
}

describe('AC-2.5: what counts as a response', () => {
  test.each([
    ['call', true],
    ['email', true],
    ['sms', true],
    ['appointment', true],
    ['note', false],
  ] as const)('%s → %s', (type, expected) => {
    expect(isContactAttempt(type)).toBe(expected)
  })

  test('firstResponseAt is the earliest contact attempt, ignoring notes', () => {
    const activities = [activity('note', 1), activity('email', 9), activity('call', 4)]
    expect(firstResponseAt(activities)).toBe(iso(4))
  })

  test('firstResponseAt is null when there are only notes', () => {
    expect(firstResponseAt([activity('note', 2)])).toBeNull()
    expect(firstResponseAt([])).toBeNull()
  })
})

describe('AC-2.1: SLA state while awaiting response', () => {
  test.each([
    [0, 'on_track'],
    [9.99, 'on_track'],
    [10, 'at_risk'],
    [15, 'at_risk'],
    [15.01, 'overdue'],
    [600, 'overdue'],
  ] as const)('after %s min → %s', (waited, sla) => {
    expect(speedToLead(lead(), at(waited))).toEqual({
      status: 'awaiting_response',
      waitingMs: minutes(waited),
      sla,
    })
  })

  test('a receivedAt in the future (clock skew) counts as zero wait', () => {
    expect(speedToLead(lead(), at(-2))).toEqual({
      status: 'awaiting_response',
      waitingMs: 0,
      sla: 'on_track',
    })
  })
})

describe('AC-2.4: response time once contacted', () => {
  test('met the 15-minute target', () => {
    expect(speedToLead(lead({ firstResponseAt: iso(7) }), at(120))).toEqual({
      status: 'contacted',
      responseMs: minutes(7),
      metTarget: true,
    })
  })

  test('exactly 15 minutes still meets the target', () => {
    expect(speedToLead(lead({ firstResponseAt: iso(15) }), at(120))).toMatchObject({
      metTarget: true,
    })
  })

  test('missed the target', () => {
    expect(speedToLead(lead({ firstResponseAt: iso(42) }), at(120))).toEqual({
      status: 'contacted',
      responseMs: minutes(42),
      metTarget: false,
    })
  })
})

describe('AC-1.2: inbox order', () => {
  test('awaiting response first, longest-waiting first; then contacted, newest first', () => {
    const oldWaiting = lead({ receivedAt: iso(0) })
    const newWaiting = lead({ receivedAt: iso(30) })
    const oldContacted = lead({ receivedAt: iso(-60), firstResponseAt: iso(-50) })
    const newContacted = lead({ receivedAt: iso(20), firstResponseAt: iso(25) })

    const sorted = sortForInbox([newContacted, newWaiting, oldContacted, oldWaiting])

    expect(sorted).toEqual([oldWaiting, newWaiting, newContacted, oldContacted])
  })

  test('does not mutate its input', () => {
    const input = [lead({ receivedAt: iso(5) }), lead({ receivedAt: iso(0) })]
    const copy = [...input]
    sortForInbox(input)
    expect(input).toEqual(copy)
  })
})
