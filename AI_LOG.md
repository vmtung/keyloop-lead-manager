# AI Collaboration Log

A running record of how AI was used on this project, kept as we go. Each entry: **ask → AI output →
my decision → why**.

Primary tool: Claude Code (Claude Opus) in the Claude desktop app.

---

## 1. Scope cut

- **Ask:** Read the brief, propose MUST vs NICE, then a stage plan. No code until I approve.
- **AI output:** MUST: the three core requirements polished, speed-to-lead logic (timers, urgency
  sort, overdue flag), optimistic activity logging with rollback, a mock server that injects latency
  and failures, a live SSE lead feed, keyboard triage and accessibility, basic observability.
  NICE, in order: claim/lock conflict, OpenTelemetry to Jaeger, a stubbed next-action suggestion.
  Cut: offline queue and presence. It pointed out that cutting presence is what makes SSE (one-way)
  the right choice over WebSockets.
- **Decision:** Approved as proposed, including the libraries: TanStack Query, React Router, Zod,
  Hono mock server, native EventSource, Vitest + Testing Library, plain CSS.
- **Why:** A finished, polished core beats a long half-built feature list. The cut features still
  appear in the design doc as future work.

## 2. Stage 0 setup, and two problems caught by running things

- **AI output:** Scaffolded with `create-vite` (React + TS), turned on extra strict flags, added
  Vitest and Testing Library, removed the demo assets.
- **Problem 1:** The first test run crashed inside `undici`. Cause: the latest jsdom (30) requires
  Node ≥ 22.22, and this machine runs 22.13. pnpm installed it anyway without complaint.
  **Fix:** pinned jsdom to 29.1.1, which supports Node 22.13.
- **Problem 2:** To stop that class of bug, the AI added `engine-strict=true` to `.npmrc`. Instead
  of assuming it worked, it re-ran the bad install to test the guard: pnpm 11 ignored the setting
  and installed jsdom 30 again. It moved the setting to `pnpm-workspace.yaml` (`engineStrict: true`),
  re-ran, and the install was now refused.
- **Also checked:** oxlint printed nothing on a clean run, so a file with a deliberate violation was
  added to prove the linter actually scans `src/`. It flagged both problems; the file was removed.
- **Why it matters:** Both guards looked done after the edit. Only running the failure case showed
  one of them was not.

## 3. Stage 1: specs, contract and ADRs

- **Ask:** Write assumptions, acceptance criteria and the API contract, plus ADRs for the key
  decisions. Treat `specs/` as the source of truth from here on.
- **AI output:** 17 assumptions, 35 acceptance criteria with IDs that tests will reference, the
  contract as Zod schemas in `src/contract.ts` with an endpoint spec, and four ADRs (stack, SSE,
  mock server, optimistic logging with client-generated IDs).
- **Product calls the AI made, flagged for my review:** a 15-minute first-response target; status
  derived from the activity log instead of stored; an unanswered call counts as a response; every
  activity needs a summary; the log reads oldest first.
- **Verified:** ran valid and malformed payloads through the schemas (bad date, unknown enum,
  whitespace-only summary, unknown event type) before relying on them.
- **Found:** the latest React Router (8) also needs Node ≥ 22.22, the same constraint that hit jsdom.
  Recorded in ADR-001.
- **Decision:** ✅ Approved all five product calls. Upgraded to Node 24 LTS instead of pinning
  around old Node: jsdom is back on 30 (reversing the pin from entry 2), React Router 8 is
  available, and the mock server can run TypeScript without an experimental flag.
- **Why:** Two libraries hitting the same limit was a sign the runtime was the problem, not the
  libraries. Pinning would have kept costing us at every new dependency.

## 4. Stage 2: the core build

- **Ask:** Build MUST 1–4 and 6: inbox, detail, activity logging with optimistic rollback,
  speed-to-lead logic, mock server with fault injection, keyboard and accessibility.
- **AI output:** Domain rules as pure functions, a Hono mock server, an API client that parses every
  response, and the React UI in the "achromatic ledger" style dealt by the design skill (ink chrome,
  colour only on the SLA signal). Integration tests run the real mock server in-process instead of
  hand-written fetch stubs, so they exercise the actual contract.
- **My decisions:** lucide-react for icons and self-hosted Geist (no Google Fonts request), after
  the AI listed the options with trade-offs.
- **Caught by running it, not by reading it:**
  - The preview tool sets `PORT=5173`; the mock server read the generic `PORT` and took Vite's port.
    Renamed to `MOCK_API_PORT` and made Vite's port strict, so a clash fails loudly.
  - Testing Library wasn't cleaning up between tests, because Vitest runs without globals.
  - With failures on, Retry left the restored text in the composer, inviting a double submit. Retry
    now clears it.
  - On a phone the h1 disappeared with the hidden inbox, and the details card pushed the composer
    off screen. The open lead now owns the h1, and phone and email moved to the header.
- **Caught in review of the AI's own work:** a composer closure that could never see text typed after
  submitting (replaced with a ref), and a placeholder test for AC-1.4 that asserted nothing. Both
  rewritten; the failure-path test now drives a real 500 and a real Retry.
- **Verified:** 89 tests; mutation checks on the SLA boundaries and on Retry reusing the activity ID
  (each broken on purpose, each caught). In the browser with `MOCK_FAILURE_RATE=0.5`: four injected
  500s, then a 201, one activity stored, and client and server logs matched by request ID.
- **Kept against a design-lint finding:** `example.com` emails. RFC 2606 reserves the domain so
  fictional data can never reach a real inbox.

## 5. Stage 3: live updates

- **Ask:** New leads appear live, another salesperson's activity shows up, and a dropped connection
  recovers and catches up (AC-5.1–5.3).
- **AI output:** `subscribeToEvents` at the API boundary (events parsed against the contract,
  reconnect with backoff, a status for the UI), and a provider that turns thin events into cache
  invalidations, a screen-reader announcement and a brief highlight. For tests, an `EventSource`
  that reads the in-process server's real SSE stream, so the server's emit, the wire format and the
  UI are tested together.
- **Verified:** tests first for the subscription (red, then green); mutation checks on the resume
  refetch and on lead events (both caught). In the browser: a simulated lead appeared and was
  announced; an activity logged in one tab showed in a second tab; with the API killed and
  restarted, the UI said so and recovered by itself.
- **Caught by running it in a real browser, missed by every test:**
  - The indicator stuck on "Connecting…": Vite's proxy held the stream's headers until the first
    body bytes, 15 seconds later. The server now writes a comment the moment a stream opens.
  - With the API killed, both tabs still said "Live": the proxy kept the browser's side of a dead
    connection open, with no error event. The keep-alive was an SSE comment, which scripts never
    see. It is now a named `ping` event, and a client watchdog treats 35 seconds of silence as a
    drop. Re-tested: "Reconnecting…" after 35 s, back to "Live" 8 s after the restart.
- **Why it matters:** the in-process tests skip the proxy hop, which is exactly where both bugs
  lived. That is the case for the Playwright test in Stage 5, and for checking what the AI built in
  the real environment rather than trusting green tests.

## 6. Stage 4: observability

- **Ask:** Web Vitals, error capture, and logs that can be followed across client and server.
- **AI output:** Listed the choices with trade-offs; I chose the `web-vitals` package over a
  hand-rolled INP, shipping client logs to a new `POST /api/logs` over console-only, and moving
  OpenTelemetry to after hardening. The spec gained the endpoint and AC-7.6 before any code. Built:
  a batching log shipper (sendBeacon when the page hides), a session ID on every entry, page-level
  and pane-level error boundaries that show a reference the user can quote, and global handlers for
  uncaught errors and rejections.
- **Verified:** tests first for the shipper and the endpoint; a mutation check removing the pane
  boundary (caught). In the browser, a 404 produced a server line and a client line in the same
  terminal with the same request ID, and all five vitals arrived.
- **Caught by running it:** on every reload, requests the browser aborted were logged as `network`
  failures, false errors that would fill a dashboard. The AI's first fix (a flag set on `pagehide`)
  passed its unit test but failed in the browser: the aborts land *before* `pagehide`. The test had
  modelled the wrong order. Network failures are now logged one task later, after `pagehide` has
  had its chance; re-tested in the browser with no false errors.
- **Also corrected:** the AI first guessed that missing LCP and CLS were a quirk of the background
  browser pane. A later run showed all five vitals arriving, so the guess was wrong, and it was not
  recorded as a finding.

## 7. Stage 5: hardening and review

- **Code review (AI reviewing its own code, 9 findings, all fixed):** the important one was data
  loss. A save that failed after the salesperson had moved to the next lead disappeared: no error,
  no announcement, text gone. Failure handling lived in per-call callbacks that don't run once the
  component unmounts. Failures now live in the mutation cache: announced from anywhere, marked
  "Not saved" in the inbox, restored with Retry on return (AC-4.8, added to the spec after the fact
  and said so here). Others: no timeout while the stream was still connecting, an SSE listener leak,
  raw server text shown to salespeople, a client log field able to overwrite the server timestamp.
- **Accessibility:** axe-core (injected for the audit, not a dependency) on every view and state,
  plus a manual keyboard pass. Fixed a skipped heading level, an unnamed user picker on phones,
  touch targets under 44 px, and added a skip link past the inbox.
- **End-to-end:** one Playwright journey through the real proxy and SSE stream. Mutation check:
  removing the server's connect flush (the Stage 3 bug) makes it fail. It first passed locally and
  failed on CI: locally it had reused my dev server, whose latency hid an ambiguous locator. Then the
  design screenshots showed its test leads in my dev inbox. Both from the same shortcut; e2e now
  always starts its own servers on separate ports with a fresh data file.
- **Design critique:** the screenshots caught the skip link showing at rest, which the keyboard check
  (focused state only) had passed. Fixed; activity icons lost their tinted circles.
- **Production numbers:** 132 KB gzipped JS (react-dom 66, zod 26, app 10.5). LCP 330–700 ms on the
  production build in a visible tab, bound by the mock API's latency, not the bundle. Paint metrics
  don't report from a hidden tab, which is why the browser pane had shown none: the earlier guess
  in entry 6 was right after all, for the wrong reason.
- **Process note:** several bugs this stage passed one kind of check and failed another (unit test
  vs browser, keyboard vs visual, local vs CI). Checking the same thing from two angles was what
  caught them.

## 8. Stage 6: documentation

- **Ask:** The design doc (diagram, components, data flow, technology choices, observability, how
  GenAI helped) and the README (build, run, test, AI Collaboration Narrative), with no AI-sounding
  prose.
- **AI output:** `docs/design.md` with five Mermaid diagrams, and the README in my voice.
- **Checked before committing:** the AI fact-checked its own draft against the repo and corrected
  the test counts by level, which it had first got wrong. It removed sentences that overclaimed on
  my behalf ("I watched…", "I can explain every file") and a timeline mention I had asked to keep
  out. It rendered every diagram in headless Chrome: one failed to parse, because Mermaid reads
  `;` as a statement separator in sequence messages.
- **Decision:** the narrative claims only what the log shows. Lines that are mine to say in the
  interview stay out of the README.

## 9. NICE 1: claiming a lead

- **Ask:** Let a salesperson claim a lead, with a conflict when two claim the same one. The AI asked
  whether the first call should claim the lead automatically; I didn't answer, so it went with its
  recommendation (yes) and said so, leaving it as a one-line spec change if I disagree.
- **AI output:** spec first (assumption A18, AC-8.1–8.6, contract, ADR-005), then server tests,
  then code. ADR-005 compares a version number with a conditional update on the claim itself and
  picks the latter: a version would fail a claim whenever an unrelated activity was logged.
- **The type system did review work:** adding the claim to the contract made the compiler list every
  place affected, including an exhaustive `switch` over error codes that refused to build until the
  new codes had a user-facing message. The AI also found a gap: the switch over live event types had
  no exhaustiveness check, so a new event would have been ignored silently. It added one and proved
  it by removing a case and watching the build fail.
- **Verified:** server tests red then green, including two claims sent at the same moment (exactly
  one wins); a mutation removing the "already claimed" check failed both conflict tests; an
  integration test reproduces losing the race before the other claim's event arrives. In the
  browser, Tom claimed in one tab and Anna's tab updated by itself. axe: no violations. A data file
  from before claims still loads.
