import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { renderApp } from '../test/renderApp.tsx'
import DemoTools from './DemoTools.tsx'

async function openTools() {
  const utils = await renderApp({ extra: <DemoTools /> })
  await within(await screen.findByRole('region', { name: 'Leads' })).findByText('Hannah Okafor')
  await screen.findByText('Live')
  await userEvent.click(screen.getByRole('button', { name: 'Demo tools' }))
  return { ...utils, panel: screen.getByRole('dialog', { name: 'Demo tools' }) }
}

const result = () => screen.getByText((_, el) => el?.classList.contains('demo__result') ?? false)

describe('demo tools', () => {
  test('opens from the cog, focuses the first action, and Escape closes it back to the cog', async () => {
    const { panel } = await openTools()
    expect(within(panel).getByRole('button', { name: /New website lead/ })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Demo tools' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demo tools' })).toHaveFocus()
  })

  test('a simulated website lead arrives in the inbox', async () => {
    const { panel, store } = await openTools()
    await userEvent.click(within(panel).getByRole('button', { name: /New website lead/ }))
    await waitFor(() => expect(result()).toHaveTextContent(/^New website lead from /))
    const name = store.read().leads.at(-1)!.customer.name
    expect(await within(screen.getByRole('region', { name: 'Leads' })).findByText(name)).toBeInTheDocument()
  })

  test('a teammate calls the next lead, which moves to contacted under their name', async () => {
    const { panel } = await openTools()
    await userEvent.click(within(panel).getByRole('button', { name: 'Tom calls Hannah Okafor' }))
    await waitFor(() => expect(result()).toHaveTextContent('Tom Hughes called Hannah Okafor.'))
    const contacted = screen.getByRole('region', { name: /^Contacted/ })
    await waitFor(() => expect(within(contacted).getByText('Hannah Okafor').closest('a')).toHaveTextContent('Tom'))
  })

  test('the API mode switches at runtime, and back', async () => {
    const { panel } = await openTools()
    const flaky = await within(panel).findByRole('radio', { name: 'Flaky' })
    await waitFor(() => expect(within(panel).getByRole('radio', { name: 'Normal' })).not.toBeChecked())
    await userEvent.click(flaky)
    await waitFor(() => expect(flaky).toBeChecked())
    expect(result()).toHaveTextContent('API is now flaky.')
  })

  test('dropping the live connection shows reconnecting, then recovers on its own', async () => {
    const { panel } = await openTools()
    await userEvent.click(within(panel).getByRole('button', { name: /Drop live connection/ }))
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument()
    expect(await screen.findByText('Live', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  test('reset brings the sample data back', async () => {
    const { panel, store } = await openTools()
    await userEvent.click(within(panel).getByRole('button', { name: /New website lead/ }))
    await waitFor(() => expect(store.read().leads).toHaveLength(9))
    await userEvent.click(within(panel).getByRole('button', { name: /Reset sample data/ }))
    await waitFor(() => expect(result()).toHaveTextContent('Sample data reset, with fresh timers.'))
    expect(store.read().leads).toHaveLength(8)
  })
})
