# Assumptions

The brief leaves these open. Each is a decision we can defend, and each names what would change it.

## Users and scope

- **A1. One dealership, one sales team.** Every salesperson sees every lead. Multi-site routing and
  per-team visibility are out of scope.
- **A2. No real authentication.** The user picks who they are from a seeded list of salespeople
  ("Signed in as"). The choice is kept in `localStorage` and sent as the `x-user-id` header, so
  activities have an author. In production this comes from Keyloop's identity provider.
- **A3. Leads come from the dealership website only**, as the brief says. Third-party portals
  (e.g. marketplaces) would add a `source` field; not modelled now.
- **A4. Desktop first, usable on a phone.** Salespeople triage at a desk; on the lot they open a
  single lead and log a call. The layout is two-pane on wide screens, one pane at a time on narrow
  ones.

## Leads

- **A5. A lead is** a customer (name, email, phone), an enquiry type (vehicle enquiry, test drive,
  part exchange, finance), the customer's message, an optional vehicle of interest (make, model,
  variant, registration, price), and the time it was received.
- **A6. Status is derived from the activity log, not stored.** A lead is **awaiting response**
  until its first contact attempt, then **contacted**. Deriving it means status and log can never
  disagree. Closing a lead as won or lost is out of scope.
- **A7. Volume is small per dealership**: tens to low hundreds of open leads. The inbox loads all
  of them in one request, without pagination. Past roughly 500, the API would need status filtering
  and cursor pagination (see the design doc).

## Speed-to-lead

- **A8. Response time** = time from `receivedAt` to the first **contact attempt**: a call, email,
  SMS or booked appointment. A note does not count. An unanswered call **does** count: the metric
  measures how fast the dealership reacts, not whether the customer picked up.
- **A9. Target: first response within 15 minutes.** A lead awaiting response is **on track** under
  10 minutes, **at risk** from 10 to 15, **overdue** after 15. These thresholds live in one constant
  so a dealership could configure them later.
- **A10. The clock runs 24/7.** A lead received at 23:00 is overdue at 23:15. A business-hours
  clock is the obvious next step and is listed as future work.

## Activities

- **A11. An activity is** a type (call, email, SMS, appointment, note) plus a required short
  summary (1–2000 characters), e.g. type *call*, "Called customer, left voicemail". Every activity
  needs a summary so the log reads on its own.
- **A12. Activities are logged as they happen.** The server sets `occurredAt`; backdating ("I
  called an hour ago") is out of scope.
- **A13. Activities are append-only.** No edit or delete, so the log stays an honest audit trail.
- **A14. The client generates each activity's ID** (a UUID). Posting the same ID twice is safe,
  which makes retrying after a timeout safe (see ADR-004).
- **A15. "Chronological" means oldest first.** The log reads top to bottom like a conversation,
  starting with "Lead received", with the composer at the bottom.

## Mock backend

- **A16. A small Node server stands in for the backend** and stores data in a JSON file, so
  activities survive a reload and a restart. It can add latency and random failures through env
  vars, so the error paths are real (see ADR-003). It starts with eight sample leads, three of them
  waiting, plus a month of history: 5,000 contacted leads with their first contacts and follow-ups,
  so the inbox, the figures and the team view look like a real dealership. Reset in the demo tools
  restores the same data with fresh timers; `pnpm reset-data` deletes the file to reseed on start.
- **A17. Website form submissions** arrive as `POST /api/leads`. A script (`pnpm simulate:lead`)
  calls it to demo a lead arriving live.

## Claiming a lead

- **A18. One salesperson can claim a lead** so two people don't call the same customer. Claiming
  only succeeds while the lead is unclaimed; the second of two simultaneous claims loses and is told
  who won. Logging the first contact attempt on an unclaimed lead claims it for whoever logged it,
  because that is the moment someone takes the lead on. Only the owner can release a claim. Anyone
  can still log follow-ups on a claimed lead, so teammates can cover for each other. Claims don't
  expire on their own (future work).

## Suggested next action

- **A19. A rules-based stand-in for AIME suggests the next step** on a lead, to show where Keyloop's
  AIME agent would plug in (see the design doc). It never acts: the salesperson chooses to use the
  suggestion, edits the draft, and logs it themselves. The rules, in order:
  1. An appointment is booked: no suggestion.
  2. No contact yet: call, with a reason that depends on the enquiry type.
  3. The last contact attempt is over 24 hours old: follow up by SMS.
  4. Otherwise: no suggestion.

## Team view

- **A20. A lead's first response is credited to whoever made the first contact attempt,** even if
  someone else had claimed it. Speed to lead measures how fast the customer heard back, so the person
  who answered is the honest owner of that number. The team view uses the same 24-hour window and
  15-minute target as the inbox figures.

## Only if time allows (specced before building)

- Browser OpenTelemetry traces exported to Jaeger

## Out of scope (covered as future work in the design doc)

- Offline queue for logging activities with no signal
- Presence ("Anna is viewing")
- Won/lost outcomes, reassignment, search and filters
- Business-hours SLA clock
- **Customer record:** in production the customer would be resolved against Keyloop's Active Data
  Core rather than stored on the lead.
- **AI lead qualification:** an AIME-style score and suggested next action (Keyloop's Motortech.ai
  acquisition). The design doc shows where it plugs in.
