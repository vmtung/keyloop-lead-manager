import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { claimLead } from '../server/store.ts'
import type { IsoDateTime, LeadId, UserId } from './contract.ts'
import { scale } from '../server/scale.ts'
import { LEADS, renderApp } from './test/renderApp.tsx'



const region = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) })
/** A lead's row in the inbox (its name also appears in the Next up card). */
const inboxRow = async (name: string) =>
  within(await screen.findByRole('region', { name: 'Leads' })).findByText(name)
const rowNames = (container: HTMLElement) =>
  within(container)
    .getAllByRole('link')
    .map((l) => l.querySelector('.lead-row__name')?.textContent)
const isPost = (init?: RequestInit) => init?.method === 'POST'
const postBodies = (requests: { init: RequestInit | undefined }[]) =>
  requests.filter((r) => isPost(r.init)).map((r) => JSON.parse(String(r.init?.body)) as { id: string })

describe('inbox', () => {
  test('AC-1.1, AC-1.2: groups leads, awaiting first and longest-waiting first', async () => {
    await renderApp()
    const awaiting = await screen.findByRole('region', { name: /^Awaiting response/ })

    expect(rowNames(awaiting)).toEqual(['Hannah Okafor', 'Marcus Reid', 'Olivia Bennett'])
    expect(within(awaiting).getByText('Vehicle enquiry · Ford Puma')).toBeInTheDocument()
    expect(rowNames(region('Contacted'))).toHaveLength(5)
  })

  test('AC-2.2: SLA state is words and an icon, not colour alone', async () => {
    await renderApp()
    const awaiting = await screen.findByRole('region', { name: /^Awaiting response/ })
    expect(within(awaiting).getByText(/Overdue · 38 min/)).toBeInTheDocument()
    expect(within(awaiting).getByText(/At risk · 12 min/)).toBeInTheDocument()
  })

  test('AC-1.3: a skeleton shows while loading', async () => {
    await renderApp({ network: (n) => n.hold() })
    expect(screen.getByLabelText('Loading leads')).toHaveAttribute('aria-busy', 'true')
  })

  test('AC-1.4: a failed load shows an error, and Retry refetches', async () => {
    const { network } = await renderApp({
      network: (n) => (n.failing = (url) => url.includes('/api/leads?group=awaiting')),
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load leads. The server had a problem.')

    network.failing = null
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await inboxRow('Hannah Okafor')).toBeInTheDocument()
  })

  test('AC-1.5: with no leads, an empty state says so', async () => {
    await renderApp({ data: (d) => ({ ...d, leads: [], activities: [] }) })
    expect(await screen.findByText(/No leads yet/)).toBeInTheDocument()
  })
})

describe('lead detail', () => {
  test('AC-3.1, AC-3.3, AC-3.8: shows details, a Call action, and the log oldest first', async () => {
    await renderApp({ route: `/leads/${LEADS.aishaContacted}` })
    expect(await screen.findByRole('heading', { level: 1, name: 'Aisha Rahman' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call 07700 900503' })).toHaveAttribute('href', 'tel:07700900503')
    expect(screen.getByText('£32,990')).toBeInTheDocument()

    const entries = within(screen.getByRole('list', { name: 'Activity log' })).getAllByRole('listitem')
    expect(entries.map((e) => e.querySelector('.log__type')?.textContent)).toEqual([
      'Lead received',
      'Note',
      'Call',
      'Appointment',
    ])
    expect(entries[2]).toHaveTextContent(/Anna Clarke/) // beside her initials, which are aria-hidden
  })

  test('AC-3.4: with no follow-ups, the log prompts for the first one', async () => {
    await renderApp({ route: `/leads/${LEADS.oliviaAwaiting3min}` })
    expect(await screen.findByText('No follow-ups yet. Log the first one below.')).toBeInTheDocument()
    expect(screen.getByText(/Could I test drive the Sportage/)).toBeInTheDocument()
  })

  test.each(['00000000-0000-4000-8000-0000000000ff', 'not-a-lead-id'])(
    'AC-3.5: unknown lead %s shows "Lead not found"',
    async (id) => {
      await renderApp({ route: `/leads/${id}` })
      expect(await screen.findByRole('heading', { level: 1, name: 'Lead not found' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/leads')
    },
  )

  test('AC-3.6: a failed detail load shows Retry, and the inbox stays usable', async () => {
    await renderApp({
      route: `/leads/${LEADS.aishaContacted}`,
      network: (n) => (n.failing = (url) => url.includes(`/leads/${LEADS.aishaContacted}`)),
    })
    expect(await screen.findByText(/Couldn’t load this lead/)).toBeInTheDocument()
    expect(await inboxRow('Hannah Okafor')).toBeInTheDocument()
  })
})

describe('logging an activity', () => {
  async function openComposer(leadId = LEADS.hannahOverdue38min) {
    const utils = await renderApp({ route: `/leads/${leadId}` })
    const input = await screen.findByLabelText('Summary')
    return { ...utils, input, submit: screen.getByRole('button', { name: 'Log activity' }) }
  }

  test('AC-4.1: submit is disabled until the summary has non-space text', async () => {
    const { input, submit } = await openComposer()
    expect(submit).toBeDisabled()
    await userEvent.type(input, '   ')
    expect(submit).toBeDisabled()
    await userEvent.type(input, 'Called')
    expect(submit).toBeEnabled()
  })

  test('AC-4.2, AC-4.3, AC-4.5, AC-6.4: shows as saving at once, then saved; the lead becomes contacted', async () => {
    const { input, network } = await openComposer()
    await userEvent.click(screen.getByRole('radio', { name: 'Call' }))
    await userEvent.type(input, 'Called, left voicemail')

    network.hold()
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))

    const log = screen.getByRole('list', { name: 'Activity log' })
    expect(within(log).getByText('Called, left voicemail').closest('li')).toHaveTextContent('Saving…')
    expect(input).toHaveValue('')

    act(() => network.releaseAll())
    await waitFor(() => expect(within(log).queryByText('Saving…')).not.toBeInTheDocument())
    expect(within(log).getByText('Called, left voicemail').closest('li')).toHaveTextContent('Today')

    // The inbox moves the lead without a reload.
    await waitFor(() => expect(rowNames(region('Contacted'))).toContain('Hannah Okafor'))
    expect(rowNames(region('Awaiting response'))).not.toContain('Hannah Okafor')
    expect(screen.getByRole('status')).toHaveTextContent('Call logged.')
  })

  test('AC-4.4, AC-6.4: a failed save removes the entry, restores the text, and Retry reuses the ID', async () => {
    const { input, network, store } = await openComposer()
    await userEvent.click(screen.getByRole('radio', { name: 'Email' }))
    await userEvent.type(input, 'Emailed brochure')

    network.failing = (_, init) => isPost(init)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not saved. The server had a problem.')
    expect(input).toHaveValue('Emailed brochure')
    expect(screen.queryByText('Saving…')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Activity for Hannah Okafor not saved.')

    network.failing = null
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Email logged.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const [first, retry] = postBodies(network.requests)
    expect(retry?.id).toBe(first?.id)
    expect(store.read().activities.filter((a) => a.summary === 'Emailed brochure')).toHaveLength(1)
    expect(input).toHaveValue('')
  })

  test('AC-4.8: a save that fails after moving to another lead is not lost', async () => {
    const { input, network } = await openComposer(LEADS.hannahOverdue38min)
    await userEvent.type(input, 'Called from the forecourt')
    network.hold((_, init) => isPost(init))
    network.failing = (_, init) => isPost(init)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))

    // Move on to the next lead while the save is still in flight.
    await userEvent.click(within(region('Awaiting response')).getByText('Marcus Reid'))
    await screen.findByRole('heading', { level: 1, name: 'Marcus Reid' })
    act(() => network.releaseAll())

    // The failure is announced and marked on the lead in the inbox...
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Activity for Hannah Okafor not saved.'),
    )
    const hannahRow = within(region('Awaiting response')).getByText('Hannah Okafor').closest('a')!
    expect(hannahRow).toHaveTextContent('Not saved')

    // ...and going back restores the text with Retry, which saves it.
    network.failing = null
    await userEvent.click(hannahRow)
    const restored = await screen.findByLabelText('Summary')
    expect(restored).toHaveValue('Called from the forecourt')
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }))
    // The pending entry is replaced by the saved one, so wait for the saved one specifically.
    await waitFor(() =>
      expect(screen.getByText('Called from the forecourt').closest('li')).not.toHaveTextContent('Saving…'),
    )
    // The call made Hannah contacted, so her row is now in the other group, without the mark.
    await waitFor(() => expect(rowNames(region('Contacted'))).toContain('Hannah Okafor'))
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument()
  })

  test('AC-4.4: resubmitting the restored text with Log activity also reuses the failed ID', async () => {
    const { input, network, store } = await openComposer()
    await userEvent.type(input, 'Texted the brochure link')

    network.failing = (_, init) => isPost(init)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    await screen.findByRole('alert')
    expect(input).toHaveValue('Texted the brochure link')

    // Not Retry: the salesperson just presses Log activity again on the restored text.
    network.failing = null
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Call logged.'))

    const [first, second] = postBodies(network.requests)
    expect(second?.id).toBe(first?.id)
    expect(store.read().activities.filter((a) => a.summary === 'Texted the brochure link')).toHaveLength(1)
  })

  test('a failure does not overwrite text typed after submitting', async () => {
    const { input, network } = await openComposer()
    await userEvent.type(input, 'First')
    network.hold()
    network.failing = (_, init) => isPost(init)
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    await userEvent.type(input, 'Second draft')

    act(() => network.releaseAll())
    await screen.findByRole('alert')
    expect(input).toHaveValue('Second draft')
  })
})

describe('keyboard', () => {
  test('AC-6.1: j and k move through leads, c focuses the composer, typing is left alone', async () => {
    await renderApp({ route: `/leads/${LEADS.marcusAtRisk12min}` })
    const input = await screen.findByLabelText('Summary')
    const links = () => screen.getAllByRole('link').filter((l) => l.hasAttribute('data-lead-link'))

    await userEvent.keyboard('j') // from the selected lead (Marcus, second) to the third
    expect(links()[2]).toHaveFocus()
    await userEvent.keyboard('kk')
    expect(links()[0]).toHaveFocus()

    await userEvent.keyboard('c')
    expect(input).toHaveFocus()
    expect(input).toHaveValue('')

    await userEvent.keyboard('jkc')
    expect(input).toHaveValue('jkc')
  })
})

describe('live updates', () => {
  const ELLIE = {
    customer: { name: 'Ellie Turner', email: 'ellie.turner@example.com', phone: '07700 900905' },
    enquiryType: 'test_drive',
    message: 'Can I book a test drive this week?',
    vehicle: null,
  }

  test('AC-5.1, AC-6.4: a new lead appears without a reload, highlighted and announced', async () => {
    const { postLead } = await renderApp()
    await inboxRow('Hannah Okafor')
    expect(await screen.findByText('Live')).toBeInTheDocument()

    expect((await postLead(ELLIE)).status).toBe(201)

    const row = (await within(region('Awaiting response')).findByText('Ellie Turner')).closest('a')
    expect(row).toHaveClass('lead-row--new')
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('New lead from Ellie Turner: Test drive.'),
    )
  })

  test('AC-5.2: an activity another salesperson logs shows up in the open lead', async () => {
    const { server } = await renderApp({ route: `/leads/${LEADS.oliviaAwaiting3min}` })
    await screen.findByText('No follow-ups yet. Log the first one below.')
    await screen.findByText('Live')

    await server.fetch(
      new Request(`http://test/api/leads/${LEADS.oliviaAwaiting3min}/activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'tom' },
        body: JSON.stringify({ id: crypto.randomUUID(), type: 'call', summary: 'Booked Saturday 10:00' }),
      }),
    )

    const entry = (await screen.findByText('Booked Saturday 10:00')).closest('li')
    expect(entry).toHaveTextContent(/Tom Hughes/)
    // The lead was contacted by Tom, so the inbox moves it too.
    await waitFor(() => expect(rowNames(region('Contacted'))).toContain('Olivia Bennett'))
  })

  test('AC-5.3, AC-6.4: a dropped connection says so, and on reconnect refetches what was missed', async () => {
    const { live, postLead, network } = await renderApp()
    await inboxRow('Hannah Okafor')
    await screen.findByText('Live')

    act(() => live.drop())
    const requestsAtDrop = network.requests.length
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Live updates paused. Reconnecting.')

    // Created while we're disconnected: its event is lost, so nothing refetches and it can't appear.
    expect((await postLead(ELLIE)).status).toBe(201)
    expect(network.requests.slice(requestsAtDrop).filter((r) => r.url.includes('/api/leads?'))).toEqual([])
    expect(screen.queryByText('Ellie Turner')).not.toBeInTheDocument()

    await act(async () => {
      void live.reconnect()
    })
    expect(await inboxRow('Ellie Turner')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })
})

describe('claiming a lead', () => {
  const OLIVIA = LEADS.oliviaAwaiting3min
  const oliviaRow = () => within(region('Awaiting response')).getByText('Olivia Bennett').closest('a')!

  test('AC-8.1: claiming shows "You claimed this" with Release, and the owner in the inbox', async () => {
    await renderApp({ route: `/leads/${OLIVIA}` })
    await screen.findByText('Unclaimed')
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))

    expect(await screen.findByText('You claimed this')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument()
    expect(oliviaRow()).toHaveTextContent('You ·')
    expect(screen.getByRole('status')).toHaveTextContent('You claimed Olivia Bennett.')

    await userEvent.click(screen.getByRole('button', { name: 'Release' }))
    expect(await screen.findByText('Unclaimed')).toBeInTheDocument()
  })

  test('AC-8.2: losing the race shows who won, without a reload', async () => {
    const { store } = await renderApp({ route: `/leads/${OLIVIA}` })
    await screen.findByText('Unclaimed')

    // Tom claims first, and his claim's event hasn't reached this screen yet.
    const tom = store.findUser('tom' as UserId)!
    await store.update((data) => {
      const next = claimLead(data, OLIVIA as LeadId, tom, new Date().toISOString() as IsoDateTime)
      return { data: next.data, value: next.result }
    })
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))

    expect(await screen.findByText('Tom Hughes claimed this lead first.', { selector: '.claim__message' })).toBeInTheDocument()
    expect(screen.getByText('Claimed by Tom Hughes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Tom Hughes claimed this lead first.')
  })

  test('AC-8.5: logging the first call claims the lead', async () => {
    await renderApp({ route: `/leads/${OLIVIA}` })
    await screen.findByText('Unclaimed')
    await userEvent.type(screen.getByLabelText('Summary'), 'Called Olivia')
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(await screen.findByText('You claimed this')).toBeInTheDocument()
  })

  test('AC-8.6: a claim made elsewhere shows up live', async () => {
    const { server } = await renderApp({ route: `/leads/${OLIVIA}` })
    await screen.findByText('Unclaimed')
    await screen.findByText('Live')

    await server.fetch(
      new Request(`http://test/api/leads/${OLIVIA}/claim`, { method: 'POST', headers: { 'x-user-id': 'priya' } }),
    )
    expect(await screen.findByText('Claimed by Priya Shah')).toBeInTheDocument()
    await waitFor(() => expect(oliviaRow()).toHaveTextContent('Priya ·'))
  })
})

describe('suggested next action (AIME stand-in)', () => {
  test('AC-9.1, AC-9.2: a suggestion fills the composer, and nothing is logged until submitted', async () => {
    const { store, live } = await renderApp({ route: `/leads/${LEADS.oliviaAwaiting3min}` })
    const suggestion = (await screen.findByText('Suggested: Call.')).closest('.suggestion') as HTMLElement
    await screen.findByText('Live')
    expect(suggestion).toHaveTextContent('Wants a test drive.')
    expect(suggestion).toHaveTextContent('Rules-based stand-in for AIME.')

    const before = store.read().activities.length
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Use' }))
    expect(screen.getByLabelText('Summary')).toHaveValue('Called to book a test drive.')
    expect(screen.getByLabelText('Summary')).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Call' })).toBeChecked()
    expect(store.read().activities).toHaveLength(before)

    // Logging it moves the lead on, so "call" is no longer suggested. With the live stream down,
    // only the mutation itself can clear it (the server's event can arrive before or after).
    act(() => live.drop())
    await userEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    await waitFor(() => expect(screen.queryByText('Suggested: Call.')).not.toBeInTheDocument())
    await screen.findByText('You claimed this')
    expect(screen.queryByText('Suggested: Call.')).not.toBeInTheDocument()
  })

  test('AC-9.3: no suggestion once an appointment is booked', async () => {
    await renderApp({ route: `/leads/${LEADS.aishaContacted}` })
    await screen.findByText('Test drive booked for Thursday 18:00.')
    expect(screen.queryByText(/^Suggested:/)).not.toBeInTheDocument()
  })
})

describe('inbox figures and next up', () => {
  test('AC-1.6: the header shows who is waiting and how fast the last 24 hours were answered', async () => {
    await renderApp()
    await inboxRow('Hannah Okafor')
    const inbox = screen.getByRole('region', { name: 'Leads' })
    const figure = (label: string) => within(inbox).getByText(label).closest('.figure') as HTMLElement

    expect(figure('Waiting')).toHaveTextContent('3')
    expect(figure('Waiting')).toHaveTextContent('1 overdue')
    // Daniel answered in 6 min, Aisha in 24; George was answered more than a day ago.
    expect(figure('In 15 min')).toHaveTextContent('50%')
    expect(figure('In 15 min')).toHaveTextContent('of 2, last 24 h')
    expect(figure('Median')).toHaveTextContent('15 min')
  })

  test('AC-1.7: waiting rows carry a clock bar, and a late response says so', async () => {
    await renderApp()
    await inboxRow('Hannah Okafor')
    const awaiting = within(region('Awaiting response')).getAllByRole('link')
    expect(awaiting.every((row) => row.querySelector('.row-clock--overdue, .row-clock--at_risk, .row-clock--on_track'))).toBe(true)
    expect(within(region('Contacted')).getAllByRole('link').some((row) => row.querySelector('.row-clock'))).toBe(false)

    const aisha = within(region('Contacted')).getByText('Aisha Rahman').closest('a')!
    expect(aisha).toHaveTextContent('Responded in 24 min · late')
  })

  test('AC-3.7: with no lead open, the longest-waiting unclaimed lead is offered next', async () => {
    await renderApp()
    const next = await screen.findByRole('region', { name: 'Next up' })
    expect(await within(next).findByText('Hannah Okafor')).toBeInTheDocument()
    expect(within(next).getByText('Waiting')).toBeInTheDocument()

    await userEvent.click(within(next).getByRole('link', { name: /Open lead/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hannah Okafor' })).toBeInTheDocument()
  })
})

describe('a dealership-sized inbox (ADR-006)', () => {
  const contactedRows = () => within(region('Contacted')).getAllByRole('link')
  const isPage = (url: string) => url.includes('group=contacted') && url.includes('cursor=')

  async function renderScaled() {
    const utils = await renderApp({ data: (d) => scale(d, new Date()) })
    await waitFor(() => expect(contactedRows()).toHaveLength(50))
    return utils
  }

  test('AC-1.8: contacted leads load 50 at a time, the heading shows the total, and Load more brings the next page', async () => {
    await renderScaled()
    expect(within(region('Contacted')).getByRole('heading')).toHaveTextContent('Contacted 5,005')
    expect(within(region('Awaiting response')).getAllByRole('link')).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(contactedRows()).toHaveLength(100))
    // Focus goes to the first new lead, so a keyboard user carries on from where they were.
    expect(contactedRows()[50]).toHaveFocus()
  })

  test('AC-1.8: j reaches Load more after the last loaded lead', async () => {
    await renderScaled()
    contactedRows().at(-1)!.focus()
    await userEvent.keyboard('j')
    expect(screen.getByRole('button', { name: 'Load more' })).toHaveFocus()
  })

  test('AC-1.8: a page that fails to load says so in place and keeps the leads loaded; Retry loads it', async () => {
    const { network } = await renderScaled()
    network.failing = (url) => isPage(url)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await within(region('Contacted')).findByRole('alert')).toHaveTextContent('Couldn’t load more leads.')
    expect(contactedRows()).toHaveLength(50)

    network.failing = null
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(contactedRows()).toHaveLength(100))
    expect(within(region('Contacted')).queryByRole('alert')).not.toBeInTheDocument()
  })

  test('AC-5.4: a lead a teammate contacts moves into place without refetching the pages loaded', async () => {
    const { network, server } = await renderScaled()
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(contactedRows()).toHaveLength(100))
    const pagesBefore = network.requests.filter((r) => isPage(r.url)).length

    const res = await server.fetch(
      new Request(`http://test/api/leads/${LEADS.hannahOverdue38min}/activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'tom' },
        body: JSON.stringify({ id: crypto.randomUUID(), type: 'call', summary: 'Called' }),
      }),
    )
    expect(res.status).toBe(201)

    // Hannah is newer than every contacted lead, so she goes to the top of the list.
    await waitFor(() => expect(rowNames(region('Contacted'))[0]).toBe('Hannah Okafor'))
    expect(rowNames(region('Awaiting response'))).not.toContain('Hannah Okafor')
    expect(within(region('Contacted')).getByRole('heading')).toHaveTextContent('Contacted 5,006')
    expect(contactedRows()).toHaveLength(101)
    expect(network.requests.filter((r) => isPage(r.url))).toHaveLength(pagesBefore)
  })

  test('AC-5.4: after a reconnect the contacted list restarts from its first page', async () => {
    const { live } = await renderScaled()
    await screen.findByText('Live')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(contactedRows()).toHaveLength(100))

    act(() => live.drop())
    await act(async () => {
      void live.reconnect()
    })
    await waitFor(() => expect(contactedRows()).toHaveLength(50))
  })
})
