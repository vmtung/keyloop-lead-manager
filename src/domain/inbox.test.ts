import { describe, expect, test } from 'vitest'
import type { IsoDateTime, Lead, User } from '../contract.ts'
import { inboxStats, nextUp } from './inbox.ts'

const NOW = Date.parse('2026-10-23T12:00:00.000Z')
const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString() as IsoDateTime
const tom = { id: 'tom', name: 'Tom Hughes' } as User

/** A lead received `ago` minutes before NOW, answered `answeredAfter` minutes after it arrived. */
function lead(ago: number, answeredAfter: number | null = null, claimed = false): Lead {
  const received = NOW - ago * MIN
  return {
    id: crypto.randomUUID(),
    customer: { name: `Lead ${ago}`, email: 'x@example.com', phone: '07700 900000' },
    enquiryType: 'vehicle_enquiry',
    message: '',
    vehicle: null,
    receivedAt: iso(received),
    firstResponseAt: answeredAfter === null ? null : iso(received + answeredAfter * MIN),
    claim: claimed ? { by: tom, at: iso(received) } : null,
  } as Lead
}

describe('AC-1.6: inboxStats', () => {
  test('counts who is waiting and how many are overdue', () => {
    const stats = inboxStats([lead(3), lead(12), lead(38), lead(60, 5)], NOW)
    expect(stats.waiting).toBe(3)
    expect(stats.overdue).toBe(1)
  })

  test('share within target and median response, over leads answered in the last 24 hours', () => {
    const stats = inboxStats(
      [
        lead(90, 6), // within target
        lead(300, 24), // late
        lead(400, 10), // within target
        lead(26 * 60, 3), // answered over 24 h ago: not counted
      ],
      NOW,
    )
    expect(stats.answered).toBe(3)
    expect(stats.withinTargetShare).toBeCloseTo(2 / 3)
    expect(stats.medianResponseMs).toBe(10 * MIN)
  })

  test('the median of an even count is the mean of the middle two', () => {
    expect(inboxStats([lead(90, 6), lead(300, 24)], NOW).medianResponseMs).toBe(15 * MIN)
  })

  test('with nothing answered in the last 24 hours, the share and median are null (shown as a dash)', () => {
    const stats = inboxStats([lead(3), lead(26 * 60, 3)], NOW)
    expect(stats.answered).toBe(0)
    expect(stats.withinTargetShare).toBeNull()
    expect(stats.medianResponseMs).toBeNull()
  })
})

describe('AC-3.7: nextUp', () => {
  test('the longest-waiting unclaimed lead comes first, even if a claimed one waited longer', () => {
    const longestClaimed = lead(50, null, true)
    const longestUnclaimed = lead(38)
    expect(nextUp([lead(3), longestClaimed, longestUnclaimed], NOW)).toBe(longestUnclaimed)
  })

  test('if every waiting lead is claimed, the longest-waiting one', () => {
    const longest = lead(50, null, true)
    expect(nextUp([lead(3, null, true), longest], NOW)).toBe(longest)
  })

  test('nobody waiting: null', () => {
    expect(nextUp([lead(60, 5)], NOW)).toBeNull()
    expect(nextUp([], NOW)).toBeNull()
  })
})
