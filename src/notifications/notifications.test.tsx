import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { withHistory } from '../../server/history.ts'
import { LEADS, renderApp } from '../test/renderApp.tsx'
import { playChime } from './chime.ts'
import { TOAST_MS } from './toasts.tsx'

vi.mock('./chime.ts', async (original) => ({ ...(await original<typeof import('./chime.ts')>()), playChime: vi.fn() }))

const ELLIE = {
  customer: { name: 'Ellie Turner', email: 'ellie.turner@example.com', phone: '07700 900905' },
  enquiryType: 'test_drive',
  message: 'Can I book a test drive this week?',
  vehicle: null,
}
const bell = () => screen.getByRole('button', { name: /^Notifications/ })
const panel = () => screen.getByRole('dialog', { name: 'Notifications' })

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

describe('notifications', () => {
  test('AC-11.1: the bell says how many are unread, and a new lead adds one live', async () => {
    const { postLead } = await renderApp()
    await screen.findByText('Live')
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 3 unread'))
    await postLead(ELLIE)
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 4 unread'))
  })

  test('AC-11.2: opening loads the list only then, newest first with unread marked, and marks it read', async () => {
    const { network } = await renderApp()
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 3 unread'))
    expect(network.requests.some((r) => r.url.endsWith('/notifications'))).toBe(false)

    await userEvent.click(bell())
    const items = await within(panel()).findAllByRole('link')
    expect(items[0]).toHaveTextContent('Unread: New lead: Olivia Bennett, test drive')
    expect(items[0]).toHaveAttribute('href', `/leads/${LEADS.oliviaAwaiting3min}`)
    expect(items.filter((i) => i.textContent?.startsWith('Unread:'))).toHaveLength(3)
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications'))
    expect(panel()).toHaveFocus()
  })

  test('AC-11.2: Escape and a click outside close it, Escape returning focus to the bell', async () => {
    await renderApp()
    await userEvent.click(bell())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(bell()).toHaveFocus()

    await userEvent.click(bell())
    await userEvent.click(screen.getByRole('heading', { name: 'Leads' }))
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  test('AC-11.2, AC-11.5: thousands of notifications load 20 at a time', async () => {
    await renderApp({ data: (d) => withHistory(d, new Date()) })
    await userEvent.click(bell())
    await waitFor(() => expect(within(panel()).getAllByRole('link')).toHaveLength(20))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(within(panel()).getAllByRole('link')).toHaveLength(40))
  })

  test('AC-11.2: a failed load says so, and Retry loads it', async () => {
    const { network } = await renderApp()
    network.failing = (url) => url.endsWith('/notifications')
    await userEvent.click(bell())
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Couldn’t load notifications.')
    network.failing = null
    await userEvent.click(within(panel()).getByRole('button', { name: 'Retry' }))
    expect(await within(panel()).findAllByRole('link')).not.toHaveLength(0)
  })

  test('AC-11.5: a teammate working your lead notifies you, and switching salesperson shows theirs', async () => {
    const { server } = await renderApp()
    await screen.findByText('Live')
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 3 unread'))
    const post = (user: string, type: string) =>
      server.fetch(new Request(`http://test/api/leads/${LEADS.hannahOverdue38min}/activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': user },
        body: JSON.stringify({ id: crypto.randomUUID(), type, summary: 'x' }),
      }))
    // Signed in as Anna (the first user). Tom's call claims Hannah; Anna's note then notifies Tom.
    await post('tom', 'call')
    await post('anna', 'note')
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 3 unread'))

    await userEvent.selectOptions(screen.getByRole('combobox'), 'tom')
    await waitFor(() => expect(bell()).toHaveAccessibleName('Notifications, 4 unread'))
    await userEvent.click(bell())
    expect((await within(panel()).findAllByRole('link'))[0]).toHaveTextContent('Anna Clarke added a note on Hannah Okafor, your lead')
  })

  test('AC-11.3: a new lead pops up with Open, without taking focus or being announced twice, and goes after 8 seconds', async () => {
    const { postLead } = await renderApp()
    await screen.findByText('Live')
    const focused = document.activeElement
    // Before the lead arrives, so the toast's own timer is a fake one.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await postLead(ELLIE)
    const toast = await screen.findByRole('group', { name: 'New lead: Ellie Turner' })
    expect(within(toast).getByRole('link', { name: 'Open' })).toHaveAttribute('href', expect.stringMatching(/^\/leads\//))
    expect(document.activeElement).toBe(focused)
    expect(toast.closest('[aria-live]')).toBeNull()

    act(() => vi.advanceTimersByTime(TOAST_MS - 100))
    expect(toast).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('group', { name: 'New lead: Ellie Turner' })).not.toBeInTheDocument()
  })

  test('AC-11.3: the close button dismisses it', async () => {
    const { postLead } = await renderApp()
    await screen.findByText('Live')
    await postLead(ELLIE)
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss New lead: Ellie Turner' }))
    expect(screen.queryByRole('group', { name: 'New lead: Ellie Turner' })).not.toBeInTheDocument()
  })

  test('AC-11.4: sound is off by default; the switch turns on a chime for new leads, remembered here', async () => {
    vi.mocked(playChime).mockClear()
    const { postLead } = await renderApp()
    await screen.findByText('Live')
    await postLead(ELLIE)
    await screen.findByRole('group', { name: 'New lead: Ellie Turner' })
    expect(playChime).not.toHaveBeenCalled()

    await userEvent.click(bell())
    const sound = within(panel()).getByRole('switch', { name: 'Sound for new leads' })
    expect(sound).not.toBeChecked()
    await userEvent.click(sound)
    expect(localStorage.getItem('lead-manager.sound')).toBe('on')

    await postLead({ ...ELLIE, customer: { ...ELLIE.customer, name: 'Sam Adeyemi' } })
    await waitFor(() => expect(playChime).toHaveBeenCalledTimes(1))
  })
})
