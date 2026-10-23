# ADR-002: Server-sent events for live updates, with thin events

**Status:** Accepted
**Deciders:** Tung Vu

## Context

Speed-to-lead depends on seeing a new lead the moment it arrives. Salespeople also share leads, so
an activity one person logs should show up for anyone looking at the same lead. The browser needs
to hear about changes from the server; it never needs to push anything back except through normal
API calls.

## Options considered

| | Polling | Server-sent events | WebSocket |
|---|---|---|---|
| Latency | Up to the interval | Immediate | Immediate |
| Direction | Client pulls | Server → client | Both ways |
| Reconnect | n/a | Built into `EventSource` | Write it yourself |
| Proxies, HTTP/2, auth | Plain HTTP | Plain HTTP | Upgrade handshake, separate path through infra |
| Dependencies | None | None | Usually a library on both ends |

## Decision

Use **SSE** via the browser's `EventSource`. Events are **thin**: they carry IDs only
(`lead.created`, `activity.created`), and the client invalidates the matching TanStack Query
caches, which refetch.

- WebSocket's two-way channel would only pay off for presence ("Anna is viewing"), which we cut.
  If presence comes back, this decision should be revisited.
- Thin events mean the client never merges partial state from two sources: the REST API stays the
  only way data reaches the cache. The cost is one extra request per event, which is nothing at a
  dealership's volume.

## Consequences

- No replay of missed events. After a reconnect the client refetches all cached lead queries. This
  is simple and correct; at higher volume we would add event IDs and `Last-Event-ID` replay.
- One open connection per tab. Browsers limit HTTP/1.1 connections per host to six, so many tabs
  could starve. HTTP/2 in production removes that limit.
- Proxies hold a response until its first body bytes, so the server writes an SSE comment the
  moment a stream opens; without it the browser's `open` event waited for the first keep-alive.
- A dead connection behind a proxy can look open, with no error event. The server sends a named
  `ping` every 15 seconds (a comment would be invisible to scripts), and the client treats 35
  seconds of silence as a drop: it says so, reconnects with backoff, and refetches. Both were found
  by running the app through Vite's proxy, not by the in-process tests.
- In production the stream would sit behind the same gateway and auth as the API, fed by the lead
  service's event bus rather than an in-process emitter.
