import { afterEach, expect, test, vi } from 'vitest'
import { browserFetch } from './browserFetch.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('AC-7.7: uses whatever window.fetch is at call time, so a fetch patched later (by tracing) is used', async () => {
  // Patched after the module was imported, as tracing does after the API client is created.
  const patched = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', patched)

  await browserFetch('/api/leads')

  expect(patched).toHaveBeenCalledWith('/api/leads', undefined)
})
