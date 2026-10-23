// Loaded only when the demo tools switch tracing on (AC-7.7): browser spans for user actions and every
// fetch, sent to Jaeger through Vite's /otlp proxy. The fetch instrumentation adds `traceparent` to
// API requests, so the server's spans join the same trace.
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { log } from './log.ts'
import { resetSpanRunner, setSpanRunner } from './trace.ts'

/** Starts browser tracing; the returned function stops it, sending what's already recorded. */
export function startTracing(): () => Promise<void> {
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'lead-manager-web' }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: '/otlp/v1/traces' }))],
  })
  provider.register()

  // Enables itself against the provider registered above. Log uploads and the exporter's own
  // requests stay out of the traces.
  const fetches = new FetchInstrumentation({ ignoreUrls: [/\/api\/logs/, /\/otlp\//] })

  const tracer = trace.getTracer('lead-manager-web')
  setSpanRunner((name, attributes, fn) =>
    tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await fn()
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    }),
  )
  log.info('tracing.started', { exporter: '/otlp/v1/traces' })

  return async () => {
    fetches.disable()
    resetSpanRunner()
    await provider.shutdown()
    // Unregister, so starting again can register a fresh provider.
    trace.disable()
    context.disable()
    propagation.disable()
    log.info('tracing.stopped')
  }
}
