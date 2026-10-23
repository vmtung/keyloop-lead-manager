// Starts client observability in the browser: log shipping, global error capture, Web Vitals.
// Called once from main.tsx; tests don't call it, so they never send network traffic for logs.
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { flushLogs, log, shipLogs } from './log.ts'

const LOGS_URL = '/api/logs'

let unloading = false
/** Set on pagehide; requests the browser aborts after that are not failures worth logging. */
export const isPageUnloading = () => unloading

export function startObservability() {
  shipLogs({
    send: (body, { beacon }) => {
      // sendBeacon survives the page closing; it returns false if the browser refuses the payload.
      if (beacon && navigator.sendBeacon) {
        return navigator.sendBeacon(LOGS_URL, new Blob([body], { type: 'application/json' }))
      }
      return fetch(LOGS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).then((r) => r.ok)
    },
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    // Straight to the console, not `log`: logging a failure to ship logs would loop.
    onSendFailed: (reason) => console.warn('Client logs could not be sent; batch dropped.', reason),
  })

  // The last batch goes out as the tab is hidden or closed.
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
  addEventListener('pagehide', (event) => {
    // A page kept in the back/forward cache can come back; only a real unload stays unloading.
    unloading = !event.persisted
    flushNow()
  })
  addEventListener('pageshow', () => {
    unloading = false
  })

  addEventListener('error', (event) => {
    log.error('ui.unhandled_error', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    })
  })
  addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason
    log.error('ui.unhandled_rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })

  // AC-7.5. INP and CLS report when the page is hidden, which is why the beacon flush matters.
  const report = (metric: Metric) =>
    log.info('web_vital', {
      name: metric.name,
      // CLS is a unitless score; the others are milliseconds.
      value: metric.name === 'CLS' ? Number(metric.value.toFixed(3)) : Math.round(metric.value),
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: location.pathname,
    })
  onLCP(report)
  onINP(report)
  onCLS(report)
  onFCP(report)
  onTTFB(report)
}

function flushNow() {
  flushLogs({ beacon: true })
}
