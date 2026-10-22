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
