import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { LEADS, renderApp } from './test/renderApp.tsx'

afterEach(() => {
  vi.restoreAllMocks()
})

// The API client logs failures as structured errors; tests that cause them keep the output quiet.
const quietErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {})

const region = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) })
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
    quietErrors()
    const { network } = await renderApp({
      network: (n) => (n.failing = (url) => url.endsWith('/api/leads')),
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load leads. The server had a problem.')

    network.failing = null
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Hannah Okafor')).toBeInTheDocument()
  })

  test('AC-1.5: with no leads, an empty state says so', async () => {
    await renderApp({ data: (d) => ({ ...d, leads: [], activities: [] }) })
    expect(await screen.findByText(/No leads yet/)).toBeInTheDocument()
  })
})

describe('lead detail', () => {
  test('AC-3.1, AC-3.3: shows details and the log oldest first, starting with the enquiry', async () => {
    await renderApp({ route: `/leads/${LEADS.aishaContacted}` })
    expect(await screen.findByRole('heading', { level: 1, name: 'Aisha Rahman' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '07700 900503' })).toHaveAttribute('href', 'tel:07700900503')
    expect(screen.getByText('£32,990')).toBeInTheDocument()

    const entries = within(screen.getByRole('list', { name: 'Activity log' })).getAllByRole('listitem')
    expect(entries.map((e) => e.querySelector('.log__type')?.textContent)).toEqual([
      'Lead received',
      'Note',
      'Call',
      'Appointment',
    ])
    expect(entries[2]).toHaveTextContent('by Anna Clarke')
  })

  test('AC-3.4: with no follow-ups, the log prompts for the first one', async () => {
    await renderApp({ route: `/leads/${LEADS.oliviaAwaiting3min}` })
    expect(await screen.findByText('No follow-ups yet. Log the first one below.')).toBeInTheDocument()
    expect(screen.getByText(/Could I test drive the Sportage/)).toBeInTheDocument()
  })

  test.each(['00000000-0000-4000-8000-0000000000ff', 'not-a-lead-id'])(
    'AC-3.5: unknown lead %s shows "Lead not found"',
    async (id) => {
      quietErrors()
      await renderApp({ route: `/leads/${id}` })
      expect(await screen.findByRole('heading', { level: 1, name: 'Lead not found' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/leads')
    },
  )

  test('AC-3.6: a failed detail load shows Retry, and the inbox stays usable', async () => {
    quietErrors()
    await renderApp({
      route: `/leads/${LEADS.aishaContacted}`,
      network: (n) => (n.failing = (url) => url.includes(`/leads/${LEADS.aishaContacted}`)),
    })
    expect(await screen.findByText(/Couldn’t load this lead/)).toBeInTheDocument()
    expect(await screen.findByText('Hannah Okafor')).toBeInTheDocument()
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

  test('AC-4.2, AC-4.3, AC-4.5: shows as saving at once, then saved; the lead becomes contacted', async () => {
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

  test('AC-4.4: a failed save removes the entry, restores the text, and Retry reuses the ID', async () => {
    quietErrors()
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
    quietErrors()
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

  test('a failure does not overwrite text typed after submitting', async () => {
    quietErrors()
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

  test('AC-5.1: a new lead appears without a reload, highlighted and announced', async () => {
    const { postLead } = await renderApp()
    await screen.findByText('Hannah Okafor')
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
    expect(entry).toHaveTextContent('by Tom Hughes')
    // The lead was contacted by Tom, so the inbox moves it too.
    await waitFor(() => expect(rowNames(region('Contacted'))).toContain('Olivia Bennett'))
  })

  test('AC-5.3: a dropped connection says so, and on reconnect refetches what was missed', async () => {
    const { live, postLead } = await renderApp()
    await screen.findByText('Hannah Okafor')
    await screen.findByText('Live')

    act(() => live.drop())
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Live updates paused. Reconnecting.')

    await postLead(ELLIE) // emitted while we're disconnected: this event is lost
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Ellie Turner')).not.toBeInTheDocument()

    await act(async () => {
      void live.reconnect()
    })
    expect(await screen.findByText('Ellie Turner')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })
})
