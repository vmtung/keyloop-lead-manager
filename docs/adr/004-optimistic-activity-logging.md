# ADR-004: Optimistic activity logging with client-generated IDs

**Status:** Accepted
**Deciders:** Tung Vu

## Context

Logging a follow-up is the most frequent write, often done on a phone with weak signal on the lot.
Waiting for the server before showing the entry feels slow. Retrying a request that timed out is
risky: the first attempt may have been saved, and a retry would log the call twice.

## Options considered

1. **Pessimistic:** disable the form until the server answers. Simple, but slow and blocking.
2. **Optimistic, server-assigned IDs:** fast, but a retry after a timeout can create a duplicate.
3. **Optimistic, client-generated IDs:** the client creates the UUID; the server treats a repeated
   ID as the same request.

## Decision

Option 3.

- The entry appears at once, marked as saving.
- On success it is replaced by the server's version (server timestamp, author).
- On failure it is removed, the summary goes back into the composer, and Retry resends **the same
  ID**. If the first attempt actually reached the server, the retry gets 200 with the stored
  activity instead of creating a second one.
- The same ID with different content is rejected with 409, so a bug cannot silently overwrite.

## Consequences

- Retry is safe by construction, which is also the base an offline queue would need later.
- Rolling back means the entry disappears, which could surprise a user; restoring their text and
  announcing the error is what makes it acceptable.
- The server must remember IDs for as long as a client might retry. Here that is forever (IDs are
  stored with the activity); in production the activity table's primary key does the same job.
