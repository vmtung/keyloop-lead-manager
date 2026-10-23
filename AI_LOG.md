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

## 10. NICE 3: suggested next action (AIME stand-in)

- **Ask:** A stubbed suggestion that shows where Keyloop's AIME would plug in, without pretending to
  be AI.
- **AI output:** spec first (A19, AC-9.1–9.3), four rules as a pure function with tests first, the
  server returning the suggestion with the lead, and a "Use" button that only fills the composer,
  labelled "Rules-based stand-in for AIME". The salesperson stays the author of every activity.
- **Caught by the compiler:** adding `suggestion` to the contract broke the cache update after a
  save. Keeping the old suggestion would have shown "Suggested: Call" right after the call was
  logged; the fix clears it and refetches.
- **Caught by a mutation check:** the test for that fix passed even with the fix removed. The live
  stream's own refetch was clearing the suggestion first, which happens to be the usual order but
  isn't guaranteed. The test now drops the live connection before saving, and fails without the fix.

## 11. NICE 2: OpenTelemetry traces to Jaeger

- **Ask (after approving 8 pinned packages and Docker):** one trace from a click to the server's
  write, in a traced mode only, with the normal bundle unchanged.
- **AI output:** spec first (AC-7.7). The server records spans through the OpenTelemetry API, which
  does nothing until traced mode registers the SDK, so there is one code path. The browser loads
  tracing behind a build-time flag; the normal build was checked to contain no OpenTelemetry code.
- **Found while installing:** npm marked the approved 2.12 packages deprecated three days earlier,
  when OpenTelemetry 3.0 merged them. Kept the approved, older set and recorded the move to 3.x as
  future work rather than jump to a three-day-old major.
- **Caught by running it, missed by the tests:**
  - `pnpm dev` ran every script matching `/^dev:/`, so the new `dev:traced` started itself again.
    The pattern now names exactly `dev:web` and `dev:api`.
  - The first real trace held only the browser's span. The API client had bound `window.fetch` at
    startup, before tracing patched it, so requests carried no `traceparent`. Confirmed in the page
    before changing anything; the client now looks `fetch` up on every call. The server's unit test
    (a hand-written `traceparent`) passed throughout, because the bug was on the other side.
  - A trace showed 270 ms on the server and 1.6 ms of real work. The gap was the mock's injected
    latency, now its own span so the trace explains itself.
- **Verified:** read the trace back from Jaeger's API (browser span, its POST, the server request,
  latency, write, emit), and screenshotted Jaeger's view for the docs.

## 12. Test audit

- **Ask:** Audit the tests themselves.
- **AI output:** a traceability map of all 47 criteria to the tests that cite them, then a code
  review of the test files. Ten findings; all fixed:
  - A blanket `console.error` silencer could hide a React crash inside a passing test. Replaced with
    a guard in the test setup that fails any test on unexpected console output, allowing only the
    app's own JSON log lines. Proved by planting a stray `console.error`: the test failed.
  - Missing tests for three things that had been verified only by hand: resubmitting restored text
    reuses the failed ID, the API client uses the `fetch` that traced mode patches later, and the
    page-lifecycle wiring (logs flushed on hide, unload flag, global error handlers). The wiring was
    extracted from `setup.ts` so it could be tested. Each new test was checked by breaking the code.
  - Flakiness and weak assertions: sample data was timed from module load, an absence was checked
    after a fixed 50 ms sleep, a server test checked `length > 0`, and AC-2.3 tested the clock but
    not the label it drives.
- **Found a real defect through a test that couldn't fail:** the first version of the AC-1.3
  check measured CLS, and it passed even with a planted 300 px jump. Measuring showed why: the
  header is a small part of the viewport, so that jump scored 0.016 against a 0.1 threshold.
  Rewriting it to compare where the skeleton and the real list start exposed a real 24 px jump: the
  line under the title appeared only once data arrived. Fixed by reserving its line. It can still
  wrap to two lines at tablet width.
- **Why it matters:** a test is only evidence if it fails when the code is wrong. Every new test in
  this pass was shown to fail first.

## 13. Design pass with the taste skill

- **Ask:** The UI looks bland; use the design skill to improve it, and find more improvements
  beyond the four I picked.
- **AI output:** inspected the before state first. The inspector's measures named the blandness:
  40% of the first screen empty, half the text under 13 px, no headline figure, people as plain
  text. It proposed changes that each show real data rather than decoration; I chose all four and
  asked for more. Built, with spec and tests first for the logic:
  - three figures in the inbox header: waiting now, share answered within 15 minutes over 24 hours,
    and the median first reply (AC-1.6);
  - a clock bar on each waiting row, and "late" on contacted leads that missed the target (AC-1.7);
  - "Next up" in the empty pane, the longest-waiting unclaimed lead with the queue after it (AC-3.7);
  - initials in a stable tint per salesperson;
  - from its own critique: the wait as the lead's headline figure, Call as the primary action
    (AC-3.8), a timeline line in the activity log, and 13 px small text.
- **Second critique round, from screenshots:** truncated figure labels, broken spacing in the owner
  text, two red marks for one fact on overdue rows (the bars now use a softer tint), the wait figure
  floating above the name, and names wrapping in the queue cards. All fixed.
- **Caught by the tests:** the layout-jump test from the test audit failed on the redesign. The
  figures' loading placeholder was 4 px shorter than the loaded values. Fixed with exact heights.
- **Verified:** 163 tests, both e2e tests, axe with no violations at desktop and phone widths, and
  impeccable's detector clean.
