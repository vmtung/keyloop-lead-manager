// A seam for tracing user actions. Until tracing is switched on (tracing.ts), withSpan just runs the
// function, so the normal bundle carries no OpenTelemetry code.
type Attributes = Record<string, string>
type SpanRunner = <T>(name: string, attributes: Attributes, fn: () => Promise<T>) => Promise<T>

const untraced: SpanRunner = (_name, _attributes, fn) => fn()
let runner = untraced

export const withSpan: SpanRunner = (name, attributes, fn) => runner(name, attributes, fn)

export function setSpanRunner(next: SpanRunner) {
  runner = next
}

export function resetSpanRunner() {
  runner = untraced
}
