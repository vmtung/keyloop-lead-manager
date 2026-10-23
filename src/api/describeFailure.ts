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
      // The server's own message is for logs; salespeople get one they can act on.
      switch (failure.code) {
        case 'not_found':
          return 'This lead no longer exists.'
        case 'unauthenticated':
          return 'Your sign-in wasn’t recognised. Reload and choose your name.'
        case 'claim_conflict':
          return 'Someone else claimed this lead first.'
        case 'forbidden':
          return 'Only the salesperson who claimed this lead can release it.'
        case 'idempotency_conflict':
          return 'This activity clashes with one already saved. Reload to see the latest.'
        case 'validation_failed':
          return 'Some details were rejected. Check the summary and try again.'
        case 'internal':
        case null:
          return `The request was refused (${failure.status}).`
      }
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
