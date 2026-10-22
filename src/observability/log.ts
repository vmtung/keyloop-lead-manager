// Structured client logging. One JSON object per event so lines can be shipped to a collector as-is;
// for now the transport is the console. Stage 4 adds Web Vitals and the error boundary on top.
type Fields = Record<string, unknown>

function write(level: 'info' | 'warn' | 'error', event: string, fields: Fields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
  console[level](line)
}

export const log = {
  info: (event: string, fields: Fields = {}) => write('info', event, fields),
  warn: (event: string, fields: Fields = {}) => write('warn', event, fields),
  error: (event: string, fields: Fields = {}) => write('error', event, fields),
}
