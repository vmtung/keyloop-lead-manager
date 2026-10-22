import { expect, test } from 'vitest'
import { formatDuration } from './format.ts'

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
