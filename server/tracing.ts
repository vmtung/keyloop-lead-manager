// Tracing for the mock server, off by default (AC-7.7). The demo tools switch it on at runtime: the
// first time registers the OpenTelemetry SDK, so the spans server/app.ts records through the API are
// exported to Jaeger over OTLP. Switched off, a sampler drops every new span. The SDK loads only
// when first switched on, so a server that never traces never loads it.
import type { Sampler } from '@opentelemetry/sdk-trace-base'

export interface TracingSwitch {
  enabled(): boolean
  /** Rejects with TracingUnavailable when switching on and the collector can't be reached. */
  set(enabled: boolean): Promise<void>
}

export class TracingUnavailable extends Error {
  constructor(url: string, options?: ErrorOptions) {
    super(`Jaeger isn't reachable at ${url}. Start it with pnpm traces:up.`, options)
  }
}

export function createTracingSwitch(url: string, fetchFn: typeof fetch = fetch): TracingSwitch {
  let on = false
  let started = false
  return {
    enabled: () => on,
    async set(next) {
      if (next) {
        await checkCollector(url, fetchFn)
        if (!started) {
          await start(url, () => on)
          started = true
        }
      }
      on = next
    },
  }
}

// An empty batch: Jaeger answers 200, so anything else means traces would be lost.
async function checkCollector(url: string, fetchFn: typeof fetch) {
  let res: Response
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"resourceSpans":[]}',
    })
  } catch (cause) {
    throw new TracingUnavailable(url, { cause })
  }
  if (!res.ok) throw new TracingUnavailable(url, { cause: `HTTP ${res.status}` })
}

async function start(url: string, isOn: () => boolean) {
  const [{ OTLPTraceExporter }, { resourceFromAttributes }, { BatchSpanProcessor, SamplingDecision }, { NodeTracerProvider }] =
    await Promise.all([
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/resources'),
      import('@opentelemetry/sdk-trace-base'),
      import('@opentelemetry/sdk-trace-node'),
    ])
  const sampler: Sampler = {
    shouldSample: () => ({ decision: isOn() ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD }),
    toString: () => 'DemoToolsSwitch',
  }
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'lead-manager-api' }),
    sampler,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url }))],
  })
  // Also installs the W3C trace-context propagator and async context, so `traceparent` is read
  // and child spans find their parent across awaits.
  provider.register()
}
