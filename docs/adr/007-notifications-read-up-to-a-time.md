# ADR-007: Notifications stored by the server, read up to a time

**Status:** Accepted
**Deciders:** Tung Vu

## Context

Salespeople need to know about a new lead even when they aren't looking at the inbox, and about a
teammate working a lead they own (A21). The bell has to show an unread count on every page load and
in every tab, and the starting data holds thousands of past notifications.

## Options considered

| | Derived in the browser from live events | Stored, read flag per notification | Stored, read up to a time per person |
|---|---|---|---|
| Survives a reload, another tab or device | No: only what this tab heard | Yes | Yes |
| Marking all read | n/a | One write per notification | One write |
| "Unread" for one item later | n/a | Possible | Not possible |
| Count for the badge | n/a | Count of unread flags | Count of newer than the time |

## Decision

- **The server stores notifications,** created in the same write as the lead or activity that
  causes them, so a notification can't exist without its cause or be lost after it.
- **Read state is one time per salesperson.** Opening the list marks everything up to now as read.
  Salespeople read the list top-down; marking one item unread again isn't worth a write per item.
- **No new event type.** `lead.created` and `activity.created` already reach every client; the
  client refetches its unread count on them. Events stay thin (ADR-002).
- **The list loads only when opened,** 20 at a time with the same keyset paging as the inbox
  (ADR-006).

## Consequences

- An unread count is a filtered count over the notifications, which the mock does in memory. A
  database answers it from an index on (recipient, created at).
- Notifications are a record of what happened, so they keep the customer's name as it was then.
- Sound and the pop-up are per browser, not per person: they follow the device in the showroom.
