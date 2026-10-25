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
| `traceparent` | request | While tracing is on: W3C trace context from the browser, so the server's spans join the same trace. |

## Endpoints

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /users` | | 200 `UserListResponse` | |
| `GET /leads?group=awaiting` | | 200 `LeadListResponse`: every lead awaiting response, longest-waiting first | 400 `validation_failed` |
| `GET /leads?group=contacted&cursor=…&limit=…` | | 200 `LeadPageResponse`: contacted leads newest first, `limit` (1–100, default 50) at a time from `cursor` | 400 `validation_failed` (missing group, bad cursor or limit) |
| `GET /stats/team` | | 200 `TeamStatsResponse`: per salesperson, the 24-hour figures for leads they answered first, and the waiting leads they have claimed (AC-10.1) | |
| `GET /stats` | | 200 `ResponseStats`: leads first answered in the last 24 hours, the share within the target, and the median first response (AC-1.6) | |
| `GET /leads/:leadId` | | 200 `LeadDetailResponse`, activities oldest first, plus `suggestion` (A19) | 404 `not_found` |
| `POST /leads/:leadId/activities` | `NewActivity` | 201 `CreateActivityResponse` (new) or 200 (same ID replayed) | 400 `validation_failed`, 401 `unauthenticated`, 404 `not_found`, 409 `idempotency_conflict` |
| `POST /leads` | `NewLead` | 201 `CreateLeadResponse` | 400 `validation_failed` |
| `POST /leads/:leadId/claim` | | 200 `LeadResponse` (claimed, or already yours) | 401 `unauthenticated`, 404 `not_found`, 409 `claim_conflict` |
| `DELETE /leads/:leadId/claim` | | 200 `LeadResponse` (released, or was unclaimed) | 401 `unauthenticated`, 403 `forbidden`, 404 `not_found` |
| `GET /notifications?cursor=…&limit=…` | | 200 `NotificationPageResponse`: the signed-in salesperson's notifications, newest first, `limit` (1–100, default 20) at a time, with when they last read them | 400 `validation_failed`, 401 `unauthenticated` |
| `GET /notifications/unread` | | 200 `UnreadResponse` | 401 `unauthenticated` |
| `POST /notifications/read` | | 200 `UnreadResponse`: everything up to now is read | 401 `unauthenticated` |
| `GET /events` | | `text/event-stream` of `ServerEvent` | |
| `POST /logs` | `ClientLogBatch` | 204 | 400 `validation_failed` |
| `GET /health` | | 200 `{ "ok": true }` | |

Every error body is an `ApiErrorResponse`: `{ "error": { "code": "...", "message": "..." } }`.
Any endpoint can also return 500 `internal`, or be slow, when fault injection is on.

### Paging the inbox

Leads awaiting response are few and urgent, so they come in one response. Contacted leads grow
without limit, so they come a page at a time (ADR-006). `nextCursor` is opaque to the client: pass it
back as `cursor` for the next page; `null` means the last page. The cursor names the last lead
returned (its `receivedAt` and `id`) rather than an offset, so a lead added while someone scrolls
doesn't shift the pages and show a row twice. `total` is every contacted lead, for the group
heading.

### Notifications

Created by the server as it stores the change, in the same write: a new lead notifies everyone; an
activity by someone other than the lead's owner notifies the owner (A21). There is no separate
event: clients already hear `lead.created` and `activity.created`, and refetch their unread count
on either. Read state is one time per salesperson (ADR-007), so marking read is one write however
many notifications there are. Notification IDs name their source (`lead:<id>`, `activity:<id>`).

### Logging an activity

The client generates the activity `id` (UUID), so the request is idempotent (ADR-004):

- New `id`: store it, set `author` from `x-user-id` and `occurredAt` to server time, return 201.
- Same `id`, same lead, type and summary: return the stored activity with 200. Nothing changes.
- Same `id`, different content: 409 `idempotency_conflict`.

The response includes the updated `lead`, so the client takes `firstResponseAt` from the server
rather than computing it.

### Claiming a lead

A claim succeeds only while the lead is unclaimed (ADR-005). The server checks and sets the owner in
one step, so of two simultaneous claims exactly one wins; the other gets 409 `claim_conflict` and
refetches the lead to see who. Claiming a lead you already own returns 200 and changes nothing.
Only the owner can release (403 `forbidden` otherwise). Logging the first contact attempt on an
unclaimed lead also claims it for the author. Every claim and release emits `lead.updated`.

### Client logs

The browser batches its structured log entries (up to 20, or every 5 seconds) and posts them here,
using `navigator.sendBeacon` when the page is being hidden so the last batch is not lost. The mock
server prints each entry as one JSON line with `"source": "client"`, beside its own request lines,
so a failed request can be followed across both sides by `requestId`. In production this endpoint
would be an OpenTelemetry collector or a vendor intake; the client code would not change shape.

### Events

`GET /events` streams one JSON `ServerEvent` per SSE `message`:

```
data: {"type":"lead.created","leadId":"…"}

data: {"type":"activity.created","leadId":"…","activityId":"…"}

data: {"type":"lead.updated","leadId":"…"}
```

Events carry IDs only. The client refetches the affected queries (ADR-002). There is no replay of
missed events: after a reconnect the client refetches everything it has cached (AC-5.3). On connect the server
sends a comment line, so proxies release the response headers. Every 15 seconds it sends a named
`ping` event (not part of `ServerEvent`); the client treats 35 seconds of silence as a dropped
connection, because a dead connection behind a proxy can look open.

## Dev endpoints (demo tools)

The mock server only; the demo tools panel in development builds calls them. They are exempt from
fault injection, so a flaky API can always be switched back to normal.

| Method and path | Request | Success |
|---|---|---|
| `GET /dev/faults` | | 200 `DevFaults`: the current latency and failure rate |
| `PUT /dev/faults` | `DevFaults` | 200 `DevFaults`; 400 `validation_failed` |
| `POST /dev/leads` | | 201 `CreateLeadResponse`: a sample website enquiry, announced as `lead.created` |
| `POST /dev/reset` | | 200 `LeadListResponse`: the starting data again (the sample leads and a month of history, A16), with fresh timers |
| `POST /dev/drop-streams` | | 200 `DropStreamsResponse`: closes every live event stream, so clients reconnect |
| `GET /dev/tracing` | | 200 `DevTracing`: whether the server is sending traces to Jaeger |
| `PUT /dev/tracing` | `DevTracing` | 200 `DevTracing`; 400 `validation_failed`; 503 `internal` when switching on and Jaeger can't be reached |

## Mock server fault injection

Set through env vars when starting the mock server. They apply to every `/api` route except
`/events`, `/health` and `/logs`.

| Variable | Default | Effect |
|---|---|---|
| `MOCK_LATENCY_MS` | `150-600` | Random delay per request, as `min-max` or a single number |
| `MOCK_FAILURE_RATE` | `0` | Share of requests (0–1) that return 500 `internal` |
| `MOCK_API_PORT` | `8787` | Port the mock API listens on (Vite proxies `/api` to it) |
| `MOCK_DATA_FILE` | `server/data/db.json` | Where data is stored; deleted to reset to seed data |
