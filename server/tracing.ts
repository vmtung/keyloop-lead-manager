// Traced mode only (OTEL_TRACING=true, via `pnpm dev:traced`): registers the OpenTelemetry SDK so the
// spans server/app.ts records through the API are exported to Jaeger over OTLP.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

export function startTracing(url: string) {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'lead-manager-api' }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url }))],
  })
  // Also installs the W3C trace-context propagator and async context, so `traceparent` is read
  // and child spans find their parent across awaits.
  provider.register()
  return provider
}
