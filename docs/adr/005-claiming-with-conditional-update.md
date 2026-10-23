# ADR-005: Claiming a lead with a conditional update

**Status:** Accepted
**Deciders:** Tung Vu

## Context

Two salespeople can open the same new lead within seconds of each other, and both would call the
customer. A claim makes one of them the owner (specs A18). Claims race by nature: two browsers send
"claim" for the same lead at almost the same time, and exactly one may win.

## Options considered

| | Last write wins | Version number (optimistic concurrency) | Conditional update on the claim itself |
|---|---|---|---|
| Correct under a race | No: the second claim silently replaces the first | Yes | Yes |
| What the client sends | Nothing | The version it last saw | Nothing |
| False conflicts | n/a | Yes: any unrelated change to the lead (a new activity) bumps the version and fails a claim that should succeed | No: only a claim conflicts with a claim |
| In a database | `UPDATE` | `UPDATE … WHERE version = $seen` | `UPDATE … WHERE claimed_by IS NULL` |

## Decision

A **conditional update on the claim**: the server sets the owner only if the lead is unclaimed, in
one step, and answers 409 `claim_conflict` otherwise. The loser's client refetches the lead to show
who won, so the error body stays the standard `ApiErrorResponse`. Claiming a lead you already own
returns 200, the same idempotency rule as activities (ADR-004).

Here the mock's single write queue makes the check-and-set atomic. In production it is one SQL
statement, and the database's row lock does the same job.

## Consequences

- No version field for the client to track, and no false conflicts from unrelated edits.
- A claim cannot be taken over, only released by its owner. A manager override or an expiry after
  inactivity would be new rules (future work).
- Logging the first contact attempt claims an unclaimed lead in the same write, so a salesperson who
  just calls never has to remember to claim.
