import { describe, expect, test } from 'vitest'
import type { Activity, ActivityType, EnquiryType, IsoDateTime, Lead } from '../contract.ts'
import { suggestNextAction } from './suggest.ts'

const RECEIVED = Date.parse('2026-10-22T09:00:00.000Z')
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString() as IsoDateTime

const lead = (enquiryType: EnquiryType = 'vehicle_enquiry'): Lead =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    customer: { name: 'Olivia Bennett', email: 'olivia@example.com', phone: '07700 900141' },
    enquiryType,
    message: '',
    vehicle: null,
    receivedAt: iso(RECEIVED),
    firstResponseAt: null,
    claim: null,
  }) as Lead

const activity = (type: ActivityType, hoursAfterReceived: number): Activity =>
  ({
    id: crypto.randomUUID(),
    leadId: '00000000-0000-4000-8000-000000000001',
    type,
    summary: 'x',
    author: { id: 'anna', name: 'Anna Clarke' },
    occurredAt: iso(RECEIVED + hoursAfterReceived * HOUR),
  }) as Activity

describe('AC-9.1: no contact yet, so call, with a reason for the enquiry type', () => {
  test.each([
    ['finance', /finance/i],
    ['test_drive', /test drive/i],
    ['part_exchange', /part exchange/i],
    ['vehicle_enquiry', /enquiry/i],
  ] as const)('%s', (type, reason) => {
    const s = suggestNextAction(lead(type), [], RECEIVED + HOUR)
    expect(s?.type).toBe('call')
    expect(s?.reason).toMatch(reason)
    expect(s?.draft.length).toBeGreaterThan(0)
  })

  test('a note alone is not contact, so it still suggests a call', () => {
    expect(suggestNextAction(lead(), [activity('note', 0.1)], RECEIVED + HOUR)?.type).toBe('call')
  })
})

describe('after contact', () => {
  test('AC-9.3: recent contact, nothing to suggest yet', () => {
    expect(suggestNextAction(lead(), [activity('call', 1)], RECEIVED + 20 * HOUR)).toBeNull()
  })

  test('AC-9.1: the last contact attempt is over 24 hours old, so follow up by SMS', () => {
    const s = suggestNextAction(lead(), [activity('call', 1)], RECEIVED + 26 * HOUR)
    expect(s?.type).toBe('sms')
    expect(s?.reason).toMatch(/day/i)
  })

  test('the 24 hours run from the latest contact attempt, not the first', () => {
    const activities = [activity('call', 1), activity('email', 20)]
    expect(suggestNextAction(lead(), activities, RECEIVED + 26 * HOUR)).toBeNull()
  })

  test('AC-9.3: an appointment is booked, so nothing to suggest, however long ago', () => {
    const activities = [activity('call', 1), activity('appointment', 2)]
    expect(suggestNextAction(lead(), activities, RECEIVED + 100 * HOUR)).toBeNull()
  })
})
