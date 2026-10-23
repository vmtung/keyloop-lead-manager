import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { NowProvider, useNow } from '../app/context.tsx'
import type { IsoDateTime, Lead } from '../contract.ts'
import { SpeedToLeadPill } from './SpeedToLeadStatus.tsx'

afterEach(() => {
  vi.useRealTimers()
})

const RECEIVED = Date.parse('2026-10-22T09:00:00.000Z')
const lead = {
  id: '00000000-0000-4000-8000-000000000001',
  customer: { name: 'Olivia Bennett', email: 'olivia@example.com', phone: '07700 900141' },
  enquiryType: 'test_drive',
  message: '',
  vehicle: null,
  receivedAt: new Date(RECEIVED).toISOString() as IsoDateTime,
  firstResponseAt: null,
  claim: null,
} as Lead

// The pill as the inbox renders it: reading the shared clock.
function Row() {
  return <SpeedToLeadPill lead={lead} now={useNow()} />
}

test('AC-2.3: a waiting lead moves from on track to at risk as time passes, with no request', () => {
  vi.useFakeTimers({ now: RECEIVED + 9 * 60_000 + 50_000 }) // 9 min 50 s after it arrived
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  render(
    <NowProvider>
      <Row />
    </NowProvider>,
  )
  expect(screen.getByText('9 min')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(15_000)) // one tick of the shared clock
  expect(screen.getByText(/At risk · 10 min/)).toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})
