import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { LEADS, renderApp } from '../test/renderApp.tsx'

// Seeded, so a failure replays exactly.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SAVES = 50

test('AC-4.4, AC-4.7: 50 follow-ups through a failing network are all saved, none twice', { timeout: 60_000 }, async () => {
  const { network, store } = await renderApp({ route: `/leads/${LEADS.hannahOverdue38min}` })
  const input = await screen.findByLabelText('Summary')
  const log = screen.getByRole('list', { name: 'Activity log' })
  const roll = random(7)

  // Only saves are hit. Half fail: lost on the way, lost on the way back after the server stored
  // it (the case a careless retry would duplicate), or refused with a 500.
  const outcomes = { request: 0, response: 0, server: 0, saved: 0 }
  let next: keyof typeof outcomes = 'saved'
  const isSave = (url: string, init?: RequestInit) => init?.method === 'POST' && url.endsWith('/activities')
  network.failing = (url, init) => isSave(url, init) && next === 'server'
  network.losing = (url, init) =>
    isSave(url, init) && (next === 'request' || next === 'response') ? next : null
  const decide = () => {
    const r = roll()
    next = r < 0.15 ? 'request' : r < 0.35 ? 'response' : r < 0.5 ? 'server' : 'saved'
    outcomes[next] += 1
  }

  for (let i = 1; i <= SAVES; i++) {
    await userEvent.click(input)
    await userEvent.paste(`Chaos ${i}`)
    decide()
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    while (true) {
      await waitFor(() => expect(within(log).queryByText('Saving…')).not.toBeInTheDocument())
      const alert = screen.queryByRole('alert')
      if (!alert) break
      decide()
      // Both ways a salesperson retries: the Retry button, or logging the restored text again.
      if (roll() < 0.5) await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
      else await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    }
  }

  // Every kind of failure actually happened, so the test proves something.
  expect(outcomes.request).toBeGreaterThan(0)
  expect(outcomes.response).toBeGreaterThan(0)
  expect(outcomes.server).toBeGreaterThan(0)

  const saved = store.read().activities.filter((a) => a.summary.startsWith('Chaos '))
  expect(saved).toHaveLength(SAVES)
  expect(new Set(saved.map((a) => a.summary)).size).toBe(SAVES)
  await waitFor(() => expect(within(log).getAllByText(/^Chaos \d+$/)).toHaveLength(SAVES))
})
