# API contract

The shapes are defined once, as Zod schemas in [`src/contract.ts`](../src/contract.ts). The mock
server validates requests with them; the app validates every response with them. This file
describes the endpoints around those shapes.

Base path: `/api`. JSON in and out, timestamps in UTC ISO 8601.

## Headers

| Header | Direction | Purpose |
|---|---|---|
| `x-user-id` | request | Who is acting (stand-in for auth, see A2). Required on `POST /leads/:id/activities`. |
| `x-request-id` | request and response | A UUID the client generates per request. The server logs it and echoes it back. |

## Endpoints

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /users` | | 200 `UserListResponse` | |
| `GET /leads` | | 200 `LeadListResponse`, all leads, unsorted (the client sorts, AC-1.2) | |
| `GET /leads/:leadId` | | 200 `LeadDetailResponse`, activities oldest first | 404 `not_found` |
| `POST /leads/:leadId/activities` | `NewActivity` | 201 `CreateActivityResponse` (new) or 200 (same ID replayed) | 400 `validation_failed`, 401 `unauthenticated`, 404 `not_found`, 409 `idempotency_conflict` |
| `POST /leads` | `NewLead` | 201 `CreateLeadResponse` | 400 `validation_failed` |
| `GET /events` | | `text/event-stream` of `ServerEvent` | |
| `GET /health` | | 200 `{ "ok": true }` | |

Every error body is an `ApiErrorResponse`: `{ "error": { "code": "...", "message": "..." } }`.
Any endpoint can also return 500 `internal`, or be slow, when fault injection is on.

### Logging an activity

The client generates the activity `id` (UUID), so the request is idempotent (ADR-004):

- New `id`: store it, set `author` from `x-user-id` and `occurredAt` to server time, return 201.
- Same `id`, same lead, type and summary: return the stored activity with 200. Nothing changes.
- Same `id`, different content: 409 `idempotency_conflict`.

The response includes the updated `lead`, so the client takes `firstResponseAt` from the server
rather than computing it.

### Events

`GET /events` streams one JSON `ServerEvent` per SSE `message`:

```
data: {"type":"lead.created","leadId":"…"}

data: {"type":"activity.created","leadId":"…","activityId":"…"}
```

Events carry IDs only. The client refetches the affected queries (ADR-002). There is no replay of
missed events: after a reconnect the client refetches everything it has cached (AC-5.3). On connect the server
sends a comment line, so proxies release the response headers. Every 15 seconds it sends a named
`ping` event (not part of `ServerEvent`); the client treats 35 seconds of silence as a dropped
connection, because a dead connection behind a proxy can look open.

## Mock server fault injection

Set through env vars when starting the mock server. They apply to every `/api` route except
`/events` and `/health`.

| Variable | Default | Effect |
|---|---|---|
| `MOCK_LATENCY_MS` | `150-600` | Random delay per request, as `min-max` or a single number |
| `MOCK_FAILURE_RATE` | `0` | Share of requests (0–1) that return 500 `internal` |
| `MOCK_API_PORT` | `8787` | Port the mock API listens on (Vite proxies `/api` to it) |
| `MOCK_DATA_FILE` | `server/data/db.json` | Where data is stored; deleted to reset to seed data |
