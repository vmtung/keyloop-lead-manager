import { describe, expect, test, vi } from 'vitest'
import { installErrorHandlers, installPageLifecycle } from './setup.ts'

function lifecycle(hidden = false) {
  const target = new EventTarget()
  const state = { hidden }
  const flush = vi.fn()
  const setUnloading = vi.fn()
  installPageLifecycle(target, { isHidden: () => state.hidden, flush, setUnloading })
  return { target, state, flush, setUnloading }
}

const pagehide = (persisted: boolean) => Object.assign(new Event('pagehide'), { persisted })

describe('AC-7.6: page lifecycle', () => {
  test('hiding the page flushes logs with a beacon; showing it again does not', () => {
    const { target, state, flush } = lifecycle()
    target.dispatchEvent(new Event('visibilitychange')) // still visible
    expect(flush).not.toHaveBeenCalled()

    state.hidden = true
    target.dispatchEvent(new Event('visibilitychange'))
    expect(flush).toHaveBeenCalledWith({ beacon: true })
  })

  test('a real unload marks the page as unloading and flushes', () => {
    const { target, flush, setUnloading } = lifecycle()
    target.dispatchEvent(pagehide(false))
    expect(setUnloading).toHaveBeenLastCalledWith(true)
    expect(flush).toHaveBeenCalledWith({ beacon: true })
  })

  test('a page kept in the back/forward cache is not unloading, and coming back clears it', () => {
    const { target, setUnloading } = lifecycle()
    target.dispatchEvent(pagehide(true))
    expect(setUnloading).toHaveBeenLastCalledWith(false)

    target.dispatchEvent(pagehide(false))
    target.dispatchEvent(new Event('pageshow'))
    expect(setUnloading).toHaveBeenLastCalledWith(false)
  })
})

describe('global error capture', () => {
  test('an uncaught error is logged with its message and stack', () => {
    const target = new EventTarget()
    const logError = vi.fn()
    installErrorHandlers(target, logError)

    const error = new Error('boom')
    target.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'app.js', lineno: 7, error }))

    expect(logError).toHaveBeenCalledWith('ui.unhandled_error', {
      message: 'boom',
      source: 'app.js',
      line: 7,
      stack: error.stack,
    })
  })

  test('an unhandled promise rejection is logged, whatever was rejected', () => {
    const target = new EventTarget()
    const logError = vi.fn()
    installErrorHandlers(target, logError)

    target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'plain string' }))

    expect(logError).toHaveBeenCalledWith('ui.unhandled_rejection', { message: 'plain string', stack: undefined })
  })
})
