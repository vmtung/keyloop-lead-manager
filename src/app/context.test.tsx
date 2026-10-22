import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { NowProvider, useNow } from './context.tsx'

afterEach(() => {
  vi.useRealTimers()
})

function Clock() {
  return <p>{useNow()}</p>
}

test('AC-2.3: the shared clock ticks every 15 seconds, so timers update without a refetch', () => {
  vi.useFakeTimers({ now: 1_000_000 })
  render(
    <NowProvider>
      <Clock />
    </NowProvider>,
  )
  expect(screen.getByText('1000000')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(15_000))
  expect(screen.getByText('1015000')).toBeInTheDocument()
})
