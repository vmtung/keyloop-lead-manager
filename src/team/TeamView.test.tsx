import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { LEADS, renderApp } from '../test/renderApp.tsx'

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
// Names without the decorative initials beside them.
const rowNames = () => screen.getAllByRole('rowheader').map((h) => h.textContent?.replace(/^[A-Z]{2}\s*/, '').trim())
const cells = (name: string) => within(row(name)).getAllByRole('cell').map((c) => c.textContent)

describe('team view', () => {
  test('AC-10.1: one row per salesperson with their 24-hour figures and claimed waiting leads', async () => {
    await renderApp({ route: '/team' })
    expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toBeInTheDocument()
    await screen.findByRole('row', { name: /Anna Clarke/ })
    // Sample data, last 24 hours: Anna answered Aisha in 24 min (late), Tom answered Daniel in 6 min,
    // Priya's only answer was 26 hours ago. Ties go by name.
    expect(rowNames()).toEqual(['Anna Clarke', 'Tom Hughes', 'Priya Shah'])
    expect(cells('Anna Clarke')).toEqual(['1', '0%', '24 min', '0'])
    expect(cells('Tom Hughes')).toEqual(['1', '100%', '6 min', '0'])
    expect(cells('Priya Shah')[0]).toBe('0')
    expect(within(row('Priya Shah')).getAllByLabelText('None')).toHaveLength(2)
  })

  test('AC-10.2: the top bar links to Leads and Team and marks the current one', async () => {
    await renderApp({ route: '/team' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Team' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(nav).getByRole('link', { name: 'Leads' }))
    expect(within(nav).getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { name: 'Leads' })).toBeInTheDocument()
  })

  test('AC-10.3: a first contact made elsewhere shows up without a reload', async () => {
    const { server } = await renderApp({ route: '/team' })
    await screen.findByRole('row', { name: /Priya Shah/ })
    await screen.findByText('Live')
    // Priya claims Hannah, then calls her: the claim shows first, then the answer.
    await server.fetch(new Request(`http://test/api/leads/${LEADS.hannahOverdue38min}/claim`, { method: 'POST', headers: { 'x-user-id': 'priya' } }))
    await waitFor(() => expect(cells('Priya Shah')[3]).toBe('1 · 1 overdue'))
    await server.fetch(
      new Request(`http://test/api/leads/${LEADS.hannahOverdue38min}/activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'priya' },
        body: JSON.stringify({ id: crypto.randomUUID(), type: 'call', summary: 'Called' }),
      }),
    )
    await waitFor(() => expect(cells('Priya Shah')).toEqual(['1', '0%', '38 min', '0']))
    expect(rowNames()).toEqual(['Anna Clarke', 'Priya Shah', 'Tom Hughes'])
  })

  test('AC-10.3: a failed load shows an error, and Retry loads it', async () => {
    const { network } = await renderApp({ route: '/team', network: (n) => (n.failing = (url) => url.endsWith('/stats/team')) })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load the team’s figures.')
    network.failing = null
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('row', { name: /Tom Hughes/ })).toBeInTheDocument()
  })
})
