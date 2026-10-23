// The fetch the app uses in the browser. It looks up window.fetch on every call instead of binding
// it once: tracing patches window.fetch after the API client exists, and a bound copy would keep
// the unpatched one (no fetch spans, no traceparent).
export const browserFetch: typeof fetch = (input, init) => window.fetch(input, init)
