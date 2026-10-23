import { render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { sessionId } from '../observability/log.ts'
import { LEADS, renderApp } from '../test/renderApp.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

// Make the lead pane crash, to check the boundary around it in the real app.
vi.mock('../leads/LeadDetail.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../leads/LeadDetail.tsx')>()),
  LeadDetail: () => {
    throw new Error('Detail exploded')
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
})

function Boom(): never {
  throw new Error('Kaboom')
}

test('AC-7.4: a render error shows a recovery screen with a reference, and is logged', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary scope="page">
      <Boom />
    </ErrorBoundary>,
  )

  const alert = screen.getByRole('alert')
  expect(within(alert).getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong')
  expect(alert).toHaveTextContent(sessionId.slice(0, 8))
  expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument()

  const entries = logged.mock.calls
    .map(([line]) => line)
    .filter((line): line is string => typeof line === 'string' && line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
  expect(entries).toContainEqual(
    expect.objectContaining({ event: 'ui.render_error', message: 'Kaboom', sessionId, scope: 'page' }),
  )
})

test('AC-7.4: when the lead pane crashes, the inbox keeps working', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await renderApp({ route: `/leads/${LEADS.hannahOverdue38min}` })

  const alert = await screen.findByRole('alert')
  expect(within(alert).getByRole('heading', { level: 2 })).toHaveTextContent('Something went wrong')
  expect(await screen.findByText('Hannah Okafor')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Leads' })).toBeInTheDocument()
})
