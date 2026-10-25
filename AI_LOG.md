# AI Collaboration Log

How AI was used on this project, kept as we went. Each entry: **ask → AI output → my decision →
why**, plus what was caught and how. Primary tool: Claude Code (Claude Opus) in the Claude desktop
app.

---

## 1. Scope cut

- **Ask:** Read the brief, propose must-haves and nice-to-haves, then a stage plan. No code until I
  approve.
- **AI output:** Must: the three core requirements, speed-to-lead logic, optimistic logging with
  rollback, a mock server that injects latency and failures, a live lead feed, keyboard and
  accessibility, basic observability. Nice, in order: claiming, OpenTelemetry, a stubbed next-step
  suggestion. Cut: an offline queue and presence. It pointed out that cutting presence is what makes
  one-way SSE the right choice over WebSockets.
- **Decision:** Approved as proposed. A finished core beats a long half-built list; the cuts are in
  the design doc as future work.

## 2. Setup: guards that only looked done

- jsdom 30 crashed on the installed Node 22.13, and pnpm installed it without complaint. The AI
  added `engine-strict` to `.npmrc`, then re-ran the bad install to test the guard rather than
  assume it: pnpm 11 ignored it. Moved to `pnpm-workspace.yaml`, re-ran, refused.
- oxlint printed nothing on a clean run, so a planted violation proved it actually scans `src/`.
- **Why it matters:** both guards looked finished after the edit. Only running the failure case
  showed one wasn't.

## 3. Specs, contract and ADRs

- **AI output:** assumptions, acceptance criteria with IDs for tests to cite, the contract as Zod
  schemas, and ADRs for the stack, SSE, the mock server and optimistic logging. Malformed payloads
  were run through the schemas before relying on them.
- **Product calls it flagged for me:** a 15-minute target, status derived from the log, an
  unanswered call counting as a response. I approved all of them.
- **Decision:** React Router 8 hit the same Node limit as jsdom, so I upgraded to Node 24 instead of
  pinning around it. Two libraries hitting one limit meant the runtime was the problem.

## 4. The core build

- **AI output:** domain rules as pure functions, a Hono mock server, an API client that parses every
  response, the UI, and integration tests that run the real server in-process instead of fetch
  stubs. I chose the icon and font packages from options it laid out.
- **Caught by running it:** the preview tool's `PORT` hijacked the mock server's port; Retry left the
  restored text in the box, inviting a double submit; on a phone the composer was pushed off screen.
- **Caught reviewing its own code:** a placeholder test that asserted nothing, and a closure that
  could never see text typed after submitting.
- **Verified:** breaking the SLA boundaries and the ID reuse on Retry made their tests fail. In the
  browser with half of requests failing: four 500s, then a 201, one activity stored.

## 5. Live updates: two bugs only a real browser showed

- **AI output:** an event subscriber with reconnect and backoff, and a test `EventSource` that reads
  the server's real stream.
- **Caught in the browser, missed by every test:** the status stuck on "Connecting…" because Vite's
  proxy held the response until the first bytes; and with the server killed, the app still said
  "Live", because the proxy kept a dead connection open. Fixed with an immediate first write, a
  named ping every 15 s and a 35 s watchdog.
- **Why it matters:** the in-process tests skip the proxy, which is where both bugs lived. That made
  the case for the Playwright test.

## 6. Observability

- **Decisions:** from options it listed, the `web-vitals` package, shipping client logs to a
  `/api/logs` endpoint, and OpenTelemetry later.
- **Caught:** reloads logged aborted requests as failures. The AI's first fix passed its unit test
  and failed in the browser: the test modelled the wrong event order. Logging now waits one task.
- **Corrected:** it guessed missing vitals were a quirk of the hidden browser pane, then doubted
  it. Measured later: paint metrics don't report from a hidden tab, so the guess was right.

## 7. Hardening

- **Its own code review found data loss:** a save that failed after moving to another lead vanished
  silently. Failures now live in the mutation cache: announced, flagged "Not saved" in the inbox,
  restored on return (AC-4.8, added to the spec afterwards, and said so).
- **Accessibility:** axe on every view plus a keyboard pass. A screenshot caught the skip link
  showing at rest, which the keyboard check had passed.
- **End-to-end:** the Playwright test passed locally and failed on CI, because locally it reused my
  dev server. It now starts its own servers and data.
- **Pattern:** the bugs that mattered passed one check and failed another: unit test and browser,
  keyboard and screenshot, my machine and CI.

## 8. Documentation

- The AI fact-checked its own drafts against the repo: wrong test counts, sentences claiming things
  on my behalf, and a Mermaid diagram that failed to render. The narrative claims only what this log
  shows.

## 9. Claiming a lead

- **AI output:** spec first, then ADR-005: a conditional update on the claim, not a version number,
  which would fail a claim whenever someone logged a note. It asked whether the first call should
  claim the lead; I didn't answer, so it took its recommendation and said so.
- **The compiler did review work:** the new error codes broke an exhaustive switch until each had a
  message, and the AI added the same check to live events after finding one missing.
- **Verified:** two claims at the same moment, exactly one wins; removing the check failed both
  conflict tests.

## 10. Suggested next step (AIME stand-in)

- Four rules as a pure function, labelled as a stand-in. **Use** only fills the composer.
- **Caught by breaking the fix:** the test for clearing a stale suggestion passed without the fix,
  because a live refetch usually got there first. The test now drops the connection and fails
  without the fix.

## 11. Tracing to Jaeger

- **Ask:** one trace from a click to the file write, with nothing added to the normal bundle.
- **Caught by running it:** the first trace had only the browser's span. The API client had bound
  `fetch` before tracing patched it. The server's unit test passed throughout, because the bug was on
  the other side. Also: 270 ms on the server was mostly the mock's injected delay, now its own span.
- **Later:** tracing moved from a start-up flag to a switch in the demo tools, off by default. It
  checks Jaeger answers before switching on, and says to start it if not.
- **Verified:** read the trace back from Jaeger's API; the production bundle has no tracing code.

## 12. Test audit

- **Ask:** audit the tests themselves. Ten findings, all fixed.
- A blanket `console.error` silencer could hide a crash in a passing test; now any unexpected
  console output fails it. Three behaviours checked only by hand got tests, each shown to fail.
- **A test that couldn't fail found a real bug:** the layout-shift check passed with a planted
  300 px jump. Its replacement compares positions directly and found a real 24 px jump.

## 13. Design pass

- **Ask:** the UI looked bland. The design skill measured why first: 40% of the screen empty, no
  headline figure. It proposed changes that each show data: the three inbox figures, a clock bar per
  waiting lead, Next up, the wait as the lead's headline, Call as the primary action.
- **Caught by the tests:** the redesign brought back a 4 px loading jump.

## 14. Demo tools

- A development-only panel to simulate leads, teammates, a dropped connection, a slow or flaky API,
  and reset. A scan of the production bundle found the client's dev methods still in it; moved
  behind the same check and rescanned clean. The test `EventSource` didn't model a server closing
  the stream; fixed and shown to fail without it.

## 15. Chaos test for saving

- Fifty follow-ups through the real composer while half the saves fail: the request lost, the
  response lost after the server stored it, or a 500. Each is retried. The server must end with
  exactly fifty.
- **Verified by breaking it three ways:** a new ID on Retry (58 saved), on resubmit (59), and the
  server ignoring IDs (64). Seeded, so a failure replays exactly.

## 16. Scale: a month of history and lazy loading

- **AI output:** it flagged first that paging breaks more than the list: the figures, Next up and the
  row clocks all needed every lead. Approved plan (ADR-006): waiting leads in full, contacted ones 50
  at a time with a keyset cursor, figures from the server, live events moving one row instead of
  refetching pages. `content-visibility` over a virtualised list, measured first.
- The mock now starts with 5,000 contacted leads of history. Generating it, the slowest first
  contact could land in the future; a test now checks none does.
- **Measured:** first load from 2.4 MB to 25 KB; with all 5,005 rows loaded, layout after a jump
  16 ms (22 ms without `content-visibility`).

## 17. Team view

- Speed to lead per salesperson, credited to whoever made first contact (A20).
- **Caught on a phone:** the new links pushed the user picker off the top bar, and the table
  scrolled sideways. Both fixed at 375 px.
- **Caught by the tests:** my expected figures were wrong, not the code; corrected after checking
  the seed.

## 18. Notifications

- **AI output:** spec and ADR-007 first. Notifications are stored in the same write as their cause,
  and read state is one time per person, so "mark all read" is one write; I accepted losing
  "mark one unread". The pop-up isn't a live region, because the inbox already announces new leads.
  Sound is off by default.
- **Caught on a phone:** the bell pushed the user picker 46 px off screen; fixed.
- **Verified by breaking it four ways:** not marking read, pop-ups announced twice, sound on by
  default, and teammate notifications going to everyone. Each failed its test.
