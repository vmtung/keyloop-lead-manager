# ADR-003: Mock backend as a small Node server

**Status:** Accepted
**Deciders:** Tung Vu

## Context

The brief allows static data, a mock API library, or a local JSON server. Our mock has to:

- persist activities (requirement 3),
- push live events (ADR-002), including to a second browser tab,
- fail and be slow on demand, so error paths are real and can be demonstrated.

## Options considered

| | Static JSON | MSW (in-browser) | json-server | Small Hono server |
|---|---|---|---|---|
| Persists | No | `localStorage` only, per browser | Yes | Yes (JSON file) |
| Live events across tabs | No | No real server to push from | No | Yes |
| Latency and failures | No | Yes | Limited | Yes |
| Idempotent writes, custom rules | No | Yes | No | Yes |
| Looks like a real backend in the network tab | No | Partly (intercepted) | Yes | Yes |

## Decision

A **Hono** server in `server/`, run with Node's built-in TypeScript type stripping (no extra build
tool), storing data in a JSON file. It imports `src/contract.ts` to validate requests, so app and
mock cannot drift apart. Vite proxies `/api` to it in development.

## Consequences

- One more process to run; `pnpm dev` starts both.
- Writes go through a single in-process queue; with one process there is no concurrency to
  manage. A real backend needs a database and transactions; the design doc covers that.
- Integration tests do not use the server: they stub `fetch`, so they stay fast and deterministic.
  The end-to-end test runs against the real mock server.
