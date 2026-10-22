import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the lead inbox heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Lead Inbox' })).toBeInTheDocument()
})
