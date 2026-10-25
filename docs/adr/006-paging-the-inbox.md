# ADR-006: Paging the inbox

**Status:** Accepted
**Deciders:** Tung Vu

## Context

The inbox loaded every lead in one request, and the browser worked out the figures, the order, Next
up and the groups from that list. A dealership answers thousands of leads a year, so the contacted
group grows without limit while the awaiting group stays small: a lead leaves it within minutes. At
5,000 leads the single response is about 2.4 MB and every live event refetched all of it.

## Options considered

| | Load everything | Offset pages for the whole list | Awaiting in full, contacted in keyset pages |
|---|---|---|---|
| First load at 5,000 leads | All of them | One page | The waiting leads plus one page |
| Next up, waiting count, row clocks | Work | Break: a waiting lead can be on a later page | Work: every waiting lead is loaded |
| A lead added while scrolling | n/a | Shifts later pages, so a row shows twice | No effect: the cursor names the last lead seen |
| 24-hour figures | Browser | Need the server | Need the server |

## Decision

- **Awaiting response loads in full,** longest-waiting first. Everything urgent stays in the
  browser, so Next up, the waiting count and the row clocks keep working and tick without
  refetching.
- **Contacted loads 50 at a time,** newest first, with a keyset cursor (`receivedAt`, `id`). In a
  database that is `WHERE (received_at, id) < ($at, $id) ORDER BY received_at DESC, id DESC LIMIT 50`
  on an index, as fast on page 100 as on page 1.
- **The 24-hour figures come from the server** (`GET /stats`), computed with the same domain
  function the browser used, over every lead.
- **Live events patch rows instead of refetching pages.** An event names a lead; the client fetches
  that lead and moves it into place: out of awaiting, into the loaded contacted pages at its sorted
  position, or nowhere if it sorts below them (it arrives with its page). Data still only reaches
  the cache through the REST API (ADR-002); only the placement is the client's.
- **A reconnect restarts the contacted list from its first page.** Events missed while offline
  could have moved any loaded row, and refetching every loaded page would be one request per page.

## Consequences

- The browser no longer has every lead, so anything that needs all of them (figures today, the team
  view next) is a server endpoint built on `src/domain`.
- Rendering stays cheap without a virtualised list: rows use `content-visibility: auto`, so the
  browser skips laying out rows off screen. A virtualised list would cut more, at the cost of a
  dependency and harder keyboard and screen reader support; it is the next step if measurements
  ask for it.
- After a reconnect someone deep in the list is taken back to the first page. Reconnects are rare,
  and correct beats convenient here.
- The mock still rewrites its whole JSON file on every save, which slows with 5,000 leads. A
  database removes that; the mock only has to stay fast enough to demo.
