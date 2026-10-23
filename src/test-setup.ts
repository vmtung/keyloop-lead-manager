import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Unexpected console output fails the test. The app's own structured log lines (JSON objects, as
// written by src/observability/log.ts) are expected; React warnings and stray errors are not.
// A test that expects other output declares it with allowConsole().
const unexpected: string[] = []
let allowed: RegExp[] = []

export function allowConsole(...patterns: RegExp[]) {
  allowed.push(...patterns)
}

beforeEach(() => {
  unexpected.length = 0
  allowed = []
  for (const level of ['error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const text = args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ')
      if (text.startsWith('{') || allowed.some((p) => p.test(text))) return
      unexpected.push(`console.${level}: ${text.slice(0, 500)}`)
    })
  }
})

afterEach(() => {
  // Vitest runs without globals, so Testing Library can't register its own cleanup.
  cleanup()
  vi.restoreAllMocks()
  if (unexpected.length > 0) {
    throw new Error(`Unexpected console output:\n${unexpected.join('\n')}`)
  }
})
