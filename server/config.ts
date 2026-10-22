import type { Faults } from './app.ts'

/** Fault injection settings from env (specs/api-contract.md). Invalid values stop the server. */
export function parseFaults(env: NodeJS.ProcessEnv): Faults {
  const latency = (env.MOCK_LATENCY_MS ?? '150-600').split('-').map(Number)
  const [min, max = min] = latency
  const failureRate = Number(env.MOCK_FAILURE_RATE ?? '0')
  if (min === undefined || !Number.isFinite(min) || max === undefined || !Number.isFinite(max) || min < 0 || max < min) {
    throw new Error(`MOCK_LATENCY_MS must be "<ms>" or "<min>-<max>", got "${env.MOCK_LATENCY_MS}"`)
  }
  if (!Number.isFinite(failureRate) || failureRate < 0 || failureRate > 1) {
    throw new Error(`MOCK_FAILURE_RATE must be between 0 and 1, got "${env.MOCK_FAILURE_RATE}"`)
  }
  return { latencyMs: { min, max }, failureRate }
}
