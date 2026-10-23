// @vitest-environment node
import { context, propagation, trace } from '@opentelemetry/api'
import { afterAll, expect, test } from 'vitest'
import { createTracingSwitch, TracingUnavailable } from './tracing.ts'

afterAll(() => {
  trace.disable()
  context.disable()
  propagation.disable()
})

const URL = 'http://collector.test/v1/traces'
const recording = () => {
  const span = trace.getTracer('test').startSpan('probe')
  const recorded = span.isRecording()
  span.end()
  return recorded
}

test('AC-7.7: switching on with the collector unreachable fails and stays off', async () => {
  const tracing = createTracingSwitch(URL, async () => {
    throw new TypeError('fetch failed')
  })
  await expect(tracing.set(true)).rejects.toBeInstanceOf(TracingUnavailable)
  expect(tracing.enabled()).toBe(false)
  expect(recording()).toBe(false)
})

test('AC-7.7: off by default; on records spans, off again stops recording', async () => {
  const checked: string[] = []
  const tracing = createTracingSwitch(URL, async (url) => {
    checked.push(String(url))
    return new Response(null, { status: 200 })
  })
  expect(tracing.enabled()).toBe(false)
  expect(recording()).toBe(false)

  await tracing.set(true)
  expect(checked).toEqual([URL])
  expect(recording()).toBe(true)

  await tracing.set(false)
  expect(tracing.enabled()).toBe(false)
  expect(recording()).toBe(false)

  await tracing.set(true) // the SDK is registered once; the switch just turns it back on
  expect(recording()).toBe(true)
  await tracing.set(false)
})
