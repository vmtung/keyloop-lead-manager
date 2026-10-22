import { expect, test } from 'vitest'
import { formatDuration, formatPrice, formatWhen } from './format.ts'

test('formatPrice rounds pence to whole pounds with separators', () => {
  expect(formatPrice(3149500)).toBe('£31,495')
  expect(formatPrice(0)).toBe('£0')
})

test.each([
  ['2026-10-22T09:15:00', 'Today 09:15'],
  ['2026-10-21T17:40:00', 'Yesterday 17:40'],
  ['2026-10-20T11:02:00', '20 Oct 11:02'],
])('formatWhen(%s) → %s', (when, expected) => {
  const now = new Date('2026-10-22T14:00:00').getTime()
  expect(formatWhen(new Date(when).toISOString(), now)).toBe(expected)
})

const s = 1000
const min = 60 * s
const h = 60 * min

test.each([
  [0, 'under 1 min'],
  [59 * s, 'under 1 min'],
  [1 * min, '1 min'],
  [14 * min + 59 * s, '14 min'],
  [59 * min, '59 min'],
  [1 * h, '1 h'],
  [1 * h + 12 * min, '1 h 12 min'],
  [23 * h + 59 * min, '23 h 59 min'],
  [24 * h, '1 d'],
  [2 * 24 * h + 3 * h + 40 * min, '2 d 3 h'],
])('formatDuration(%i) → %s', (ms, expected) => {
  expect(formatDuration(ms)).toBe(expected)
})
