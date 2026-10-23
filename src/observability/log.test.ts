import { afterEach, describe, expect, test, vi } from 'vitest'
import { ClientLogBatch, ClientLogEntry } from '../contract.ts'
import { createShipper, log, shipLogs } from './log.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeTimers() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = []
  return {
    timers,
    pending: () => timers.filter((t) => !t.cancelled),
    schedule: (fn: () => void, ms: number) => {
      timers.push({ fn, ms, cancelled: false })
      return timers.length - 1
    },
    cancel: (handle: unknown) => {
      if (typeof handle === 'number' && timers[handle]) timers[handle].cancelled = true
    },
  }
}

const entry = (event: string) =>
  ClientLogEntry.parse({
    ts: '2026-10-23T09:00:00.000Z',
    level: 'info',
    event,
    sessionId: '3f6c1f7e-8a7b-4c1d-9e2f-0a1b2c3d4e5f',
    fields: {},
  })

type Send = (body: string, how: { beacon: boolean }) => boolean | Promise<boolean>
const sender = (impl: Send = () => true) => vi.fn<Send>(impl)

describe('AC-7.6: createShipper', () => {
  test('batches entries and sends them when the interval passes', () => {
    const send = sender()
    const t = fakeTimers()
    const shipper = createShipper({ send, ...t, onSendFailed: vi.fn() })

    shipper.add(entry('a'))
    shipper.add(entry('b'))
    expect(send).not.toHaveBeenCalled()
    expect(t.pending()).toHaveLength(1) // one timer for the batch, not one per entry

    t.pending()[0]!.fn()
    expect(send).toHaveBeenCalledOnce()
    const [body, how] = send.mock.calls[0]!
    expect(ClientLogBatch.parse(JSON.parse(body)).entries.map((e) => e.event)).toEqual(['a', 'b'])
    expect(how).toEqual({ beacon: false })
  })

  test('sends at once when the batch is full', () => {
    const send = sender()
    const shipper = createShipper({ send, ...fakeTimers(), onSendFailed: vi.fn(), maxBatch: 3 })
    shipper.add(entry('a'))
    shipper.add(entry('b'))
    shipper.add(entry('c'))
    expect(send).toHaveBeenCalledOnce()
  })

  test('flushing as the page hides uses a beacon, and an empty buffer sends nothing', () => {
    const send = sender()
    const shipper = createShipper({ send, ...fakeTimers(), onSendFailed: vi.fn() })
    shipper.flush({ beacon: true })
    expect(send).not.toHaveBeenCalled()

    shipper.add(entry('a'))
    shipper.flush({ beacon: true })
    expect(send.mock.calls[0]?.[1]).toEqual({ beacon: true })
  })

  test.each([
    ['returns false', () => false],
    ['rejects', () => Promise.reject(new Error('offline'))],
    ['throws', () => {
      throw new Error('boom')
    }],
  ])('a send that %s is reported once, never thrown, and the batch is dropped', async (_, impl) => {
    const onSendFailed = vi.fn()
    const send = sender(impl as Send)
    const shipper = createShipper({ send, ...fakeTimers(), onSendFailed, maxBatch: 1 })

    expect(() => shipper.add(entry('a'))).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(onSendFailed).toHaveBeenCalledOnce()

    shipper.flush({ beacon: false })
    expect(send).toHaveBeenCalledOnce() // nothing left to resend
  })
})

describe('log', () => {
  test('writes one JSON line to the console and ships the entry with session and user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sent: string[] = []
    const stop = shipLogs({
      send: (body) => {
        sent.push(body)
        return true
      },
      ...fakeTimers(),
      onSendFailed: () => {},
      maxBatch: 1,
    })
    log.setContext({ userId: 'anna' })

    log.error('api.request_failed', { requestId: 'req-1', status: 500 })

    const line = JSON.parse(vi.mocked(console.error).mock.calls[0]![0] as string)
    expect(line).toMatchObject({ level: 'error', event: 'api.request_failed', requestId: 'req-1', userId: 'anna' })

    const [shipped] = ClientLogBatch.parse(JSON.parse(sent[0]!)).entries
    expect(shipped).toMatchObject({
      level: 'error',
      event: 'api.request_failed',
      sessionId: line.sessionId,
      fields: { requestId: 'req-1', status: 500, userId: 'anna' },
    })
    stop()
  })
})
