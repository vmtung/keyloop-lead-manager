import { expect, test } from 'vitest'
import { ApiError, type ApiFailure } from './client.ts'
import { describeFailure, isRetryable } from './describeFailure.ts'

const err = (failure: ApiFailure) => new ApiError(failure, 'req-1')
const http = (status: number, message = 'Lead not found') =>
  err({ kind: 'http', status, code: null, message })

test.each([
  [err({ kind: 'network' }), 'Can’t reach the server. Check your connection.', true],
  [err({ kind: 'timeout' }), 'The server took too long to answer.', true],
  [err({ kind: 'invalid_response', message: 'x' }), 'The server sent a response the app doesn’t understand.', false],
  [http(500), 'The server had a problem.', true],
  [http(404), 'Lead not found', false],
  [new Error('boom'), 'Something went wrong in the app.', false],
])('%o', (error, message, retryable) => {
  expect(describeFailure(error)).toBe(message)
  expect(isRetryable(error)).toBe(retryable)
})
