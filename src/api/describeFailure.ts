import { ApiError } from './client.ts'

/** One sentence a salesperson can act on. Unknown errors are bugs, so they say so. */
export function describeFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong in the app.'
  const { failure } = error
  switch (failure.kind) {
    case 'network':
      return 'Can’t reach the server. Check your connection.'
    case 'timeout':
      return 'The server took too long to answer.'
    case 'invalid_response':
      return 'The server sent a response the app doesn’t understand.'
    case 'http':
      if (failure.status >= 500) return 'The server had a problem.'
      return failure.message
  }
}

/** Dropped connections and server trouble are worth retrying; a 4xx or a malformed body will fail
 * the same way again. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const { failure } = error
  switch (failure.kind) {
    case 'network':
    case 'timeout':
      return true
    case 'http':
      return failure.status >= 500
    case 'invalid_response':
      return false
  }
}
