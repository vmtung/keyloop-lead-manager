import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ServerEvent } from '../contract.ts'
import { type EventSourceLike, type LiveStatus, STALE_AFTER_MS, subscribeToEvents } from './events.ts'

const LEAD_ID = '00000000-0000-4000-8000-000000000001'

/** Stands in for the browser's EventSource; the test drives it. */
class FakeSource implements EventSourceLike {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  onopen: ((ev: Event) => unknown) | null = null
  onmessage: ((ev: MessageEvent) => unknown) | null = null
  onerror: ((ev: Event) => unknown) | null = null
  readyState = FakeSource.CONNECTING
  closed = false
  readonly url: string
  private listeners = new Map<string, (() => void)[]>()

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  ping() {
    this.listeners.get('ping')?.forEach((l) => l())
  }

  constructor(url: string) {
    this.url = url
  }
  close() {
    this.closed = true
    this.readyState = FakeSource.CLOSED
  }
  open() {
    this.readyState = FakeSource.OPEN
    this.onopen?.(new Event('open'))
  }
  send(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }))
  }
  /** The browser keeps retrying by itself (CONNECTING), or gives up (CLOSED). */
  fail(readyState: number) {
    this.readyState = readyState
    this.onerror?.(new Event('error'))
  }
}

function setup() {
  const sources: FakeSource[] = []
  const events: ServerEvent[] = []
  const statuses: LiveStatus[] = []
  const onResume = vi.fn()
  const all: { fn: () => void; ms: number; cancelled: boolean }[] = []
  const unsubscribe = subscribeToEvents('/api/events', {
    create: (url) => {
      const source = new FakeSource(url)
      sources.push(source)
      return source
    },
    schedule: (fn, ms) => {
      all.push({ fn, ms, cancelled: false })
      return all.length - 1
    },
    cancel: (handle) => {
      if (typeof handle === 'number' && all[handle]) all[handle].cancelled = true
    },
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    onResume,
  })
  const latest = () => sources.at(-1)!
  // Reconnect timers; the watchdog's timers are checked separately.
  const timers = {
    get list() {
      return all.filter((t) => t.ms !== STALE_AFTER_MS)
    },
    map: <T,>(f: (t: { fn: () => void; ms: number }) => T) => timers.list.map(f),
    at: (i: number) => timers.list.at(i),
  }
  const watchdogs = () => all.filter((t) => t.ms === STALE_AFTER_MS && !t.cancelled)
  return { sources, events, statuses, onResume, timers, watchdogs, unsubscribe, latest }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('subscribeToEvents', () => {
  test('connects, goes live on open, and passes parsed events through', () => {
    const { latest, events, statuses } = setup()
    expect(latest().url).toBe('/api/events')
    expect(statuses).toEqual(['connecting'])

    latest().open()
    latest().send(JSON.stringify({ type: 'lead.created', leadId: LEAD_ID }))

    expect(statuses).toEqual(['connecting', 'live'])
    expect(events).toEqual([{ type: 'lead.created', leadId: LEAD_ID }])
  })

  test('an event that breaks the contract is dropped and logged, not passed on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { latest, events } = setup()
    latest().open()
    latest().send('{"type":"lead.deleted"}')
    latest().send('not json')

    expect(events).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
  })

  test('AC-5.3: while the browser retries, status is reconnecting; on reopen it asks to refetch', () => {
    const { latest, sources, statuses, onResume } = setup()
    latest().open()
    expect(onResume).not.toHaveBeenCalled()

    latest().fail(FakeSource.CONNECTING)
    expect(statuses.at(-1)).toBe('reconnecting')
    expect(sources).toHaveLength(1) // the browser reconnects the same source

    latest().open()
    expect(statuses.at(-1)).toBe('live')
    expect(onResume).toHaveBeenCalledOnce()
  })

  test('AC-5.3: if the browser gives up, we reconnect ourselves with growing delays', () => {
    const { latest, sources, timers, onResume } = setup()
    latest().open()

    latest().fail(FakeSource.CLOSED)
    expect(timers.map((t) => t.ms)).toEqual([1000])
    timers.list[0]!.fn()
    expect(sources).toHaveLength(2)

    latest().fail(FakeSource.CLOSED)
    timers.list[1]!.fn()
    latest().fail(FakeSource.CLOSED)
    timers.list[2]!.fn()
    latest().fail(FakeSource.CLOSED)
    timers.list[3]!.fn()
    latest().fail(FakeSource.CLOSED)
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000, 5000, 10000, 10000])

    timers.list[4]!.fn()
    latest().open()
    expect(onResume).toHaveBeenCalledOnce()

    // A successful open resets the delay.
    latest().fail(FakeSource.CLOSED)
    expect(timers.at(-1)!.ms).toBe(1000)
  })

  test('AC-5.3: a connection that goes silent is treated as dropped (half-open behind a proxy)', () => {
    const { latest, sources, statuses, watchdogs, timers, onResume } = setup()
    latest().open()
    expect(watchdogs()).toHaveLength(1)

    // Pings keep it alive: each one replaces the watchdog.
    latest().ping()
    expect(watchdogs()).toHaveLength(1)

    // Silence: the watchdog fires, we close and reconnect.
    watchdogs()[0]!.fn()
    expect(statuses.at(-1)).toBe('reconnecting')
    expect(sources[0]!.closed).toBe(true)
    expect(timers.map((t) => t.ms)).toEqual([1000])

    timers.list[0]!.fn()
    latest().open()
    expect(statuses.at(-1)).toBe('live')
    expect(onResume).toHaveBeenCalledOnce()
  })

  test('unsubscribing closes the source and stops reconnecting', () => {
    const { latest, timers, unsubscribe, sources } = setup()
    latest().fail(FakeSource.CLOSED)
    unsubscribe()
    timers.list[0]!.fn()
    expect(sources).toHaveLength(1)
    expect(sources[0]!.closed).toBe(true)
  })
})
