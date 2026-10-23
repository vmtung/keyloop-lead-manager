// A seam for tracing user actions. Until traced mode loads (tracing.ts), withSpan just runs the
// function, so the normal bundle carries no OpenTelemetry code.
type Attributes = Record<string, string>
type SpanRunner = <T>(name: string, attributes: Attributes, fn: () => Promise<T>) => Promise<T>

let runner: SpanRunner = (_name, _attributes, fn) => fn()

export const withSpan: SpanRunner = (name, attributes, fn) => runner(name, attributes, fn)

export function setSpanRunner(next: SpanRunner) {
  runner = next
}
