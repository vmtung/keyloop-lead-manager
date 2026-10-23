import { expect, test } from 'vitest'
import type { ApiErrorCode } from '../contract.ts'
import { ApiError, type ApiFailure } from './client.ts'
import { describeFailure, isRetryable } from './describeFailure.ts'

const err = (failure: ApiFailure) => new ApiError(failure, 'req-1')
const http = (status: number, code: ApiErrorCode | null = null) =>
  err({ kind: 'http', status, code, message: 'raw server text' })

test.each([
  [err({ kind: 'network' }), 'Can’t reach the server. Check your connection.', true],
  [err({ kind: 'timeout' }), 'The server took too long to answer.', true],
  [err({ kind: 'invalid_response', message: 'x' }), 'The server sent a response the app doesn’t understand.', false],
  [http(500), 'The server had a problem.', true],
  [http(404, 'not_found'), 'This lead no longer exists.', false],
  [http(401, 'unauthenticated'), 'Your sign-in wasn’t recognised. Reload and choose your name.', false],
  [http(409, 'idempotency_conflict'), 'This activity clashes with one already saved. Reload to see the latest.', false],
  [http(400, 'validation_failed'), 'Some details were rejected. Check the summary and try again.', false],
  [http(429), 'The request was refused (429).', false],
  [new Error('boom'), 'Something went wrong in the app.', false],
])('%o', (error, message, retryable) => {
  expect(describeFailure(error)).toBe(message)
  expect(isRetryable(error)).toBe(retryable)
})
