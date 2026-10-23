# Acceptance criteria

Each criterion has an ID. Tests name the ID they cover, e.g. `test('AC-3.4: ...')`. The **Test**
column says how it is verified: **unit** (pure function), **integration** (component with a stubbed
API), **e2e** (Playwright against the mock server), **manual** (checked in the browser, noted in
AI_LOG).

## 1. Lead inbox

| ID | Criterion | Test |
|---|---|---|
| AC-1.1 | `/leads` lists every lead with customer name, enquiry type, vehicle of interest (if any), time since received, and status. | integration |
| AC-1.2 | Leads awaiting response come first, longest-waiting first. Contacted leads follow, newest first. | unit |
| AC-1.3 | While loading, a skeleton list shows; no layout shift when data arrives. | integration |
| AC-1.4 | If loading fails, an error message and a **Retry** button show; Retry refetches. | integration |
| AC-1.5 | With no leads, an empty state says so. | integration |

## 2. Speed-to-lead

| ID | Criterion | Test |
|---|---|---|
| AC-2.1 | A lead awaiting response shows how long it has waited and an SLA state: on track (< 10 min), at risk (10–15 min), overdue (> 15 min). | unit |
| AC-2.2 | SLA state is shown with text and an icon, not colour alone. | integration |
| AC-2.3 | Time-since-received and SLA state update while the page is open, at least every 30 seconds, without refetching. | integration |
| AC-2.4 | A contacted lead shows its response time ("Responded in 7 min") and whether it met the 15-minute target. | unit |
| AC-2.5 | Only calls, emails, SMS and appointments count as a response. A note does not. | unit |

## 3. Lead detail

| ID | Criterion | Test |
|---|---|---|
| AC-3.1 | Selecting a lead opens `/leads/:leadId` showing customer details, enquiry type, message, vehicle of interest, received time and speed-to-lead state. | integration |
| AC-3.2 | The URL alone opens the lead (deep link, reload). | e2e |
| AC-3.3 | The activity log is oldest first, starting with a "Lead received" entry. Each entry shows type, summary, author and time. | integration |
| AC-3.4 | With no activities yet, the log shows "Lead received" and a prompt to log the first follow-up. | integration |
| AC-3.5 | An unknown lead ID shows a "Lead not found" state with a link back to the inbox. | integration |
| AC-3.6 | If loading the lead fails, an error with **Retry** shows; the inbox stays usable. | integration |

## 4. Logging an activity

| ID | Criterion | Test |
|---|---|---|
| AC-4.1 | The composer has an activity type (call, email, SMS, appointment, note) and a summary. Submit is disabled until the summary has non-space text; maximum 2000 characters. | integration |
| AC-4.2 | On submit, the activity appears in the log at once, marked as saving, and the composer clears. | integration |
| AC-4.3 | When the server confirms, the saving mark goes and the entry shows the server's time. | integration |
| AC-4.4 | If saving fails, the entry is removed, the summary is restored to the composer, and an error with **Retry** shows. Retry resends with the same activity ID. | integration |
| AC-4.5 | The first contact attempt on a lead awaiting response changes it to contacted, in the detail view and in the inbox, without a reload. | integration |
| AC-4.6 | Logged activities persist across a reload and a server restart. | e2e |
| AC-4.7 | Sending the same activity ID twice stores one activity. | unit (server) |
| AC-4.8 | If a save fails after the salesperson has moved to another lead, the failure is still announced, the lead shows "Not saved" in the inbox, and opening it again restores the text with Retry. | integration |

## 5. Real-time

| ID | Criterion | Test |
|---|---|---|
| AC-5.1 | A new lead posted to the server appears in an open inbox within 2 seconds, without a reload, and is announced to screen readers. | e2e |
| AC-5.2 | An activity logged in one browser tab appears in another tab showing the same lead. | manual |
| AC-5.3 | If the live connection drops, the UI says so, reconnects on its own, and refetches to catch anything missed. | integration |

## 6. Keyboard and accessibility

| ID | Criterion | Test |
|---|---|---|
| AC-6.1 | In the inbox, `j`/`k` move to the next/previous lead and `Enter` opens it. `c` focuses the composer. Shortcuts do nothing while typing in a field. | integration |
| AC-6.2 | Everything works with keyboard alone, with a visible focus indicator. | manual |
| AC-6.3 | Text and controls meet WCAG 2.1 AA contrast; animation respects `prefers-reduced-motion`. | manual |
| AC-6.4 | Status changes (saved, failed, new lead, connection lost) are announced through a polite live region. | integration |

## 7. Robustness and observability

| ID | Criterion | Test |
|---|---|---|
| AC-7.1 | Every API response is validated against the contract. A malformed response is treated as an error, logged, and shown as a normal error state. | integration |
| AC-7.2 | Requests time out after 10 seconds and show as an error. | integration |
| AC-7.3 | Every request carries an `x-request-id`; the mock server logs it, so a client error can be matched to a server log line. | manual |
| AC-7.4 | Render errors are caught by an error boundary that shows a recovery screen with a reference the user can quote, and logs the error. A failure in the lead pane leaves the inbox working. | integration |
| AC-7.5 | Web Vitals (LCP, INP, CLS) are reported through the same logger. | manual |
| AC-7.6 | Client log entries (errors, failed requests, vitals) are batched and sent to `POST /api/logs`, and flushed when the page is hidden. Each carries a session ID and the signed-in user. Failing to send logs never breaks the app or logs in a loop. | unit |
| AC-7.7 | In traced mode (`pnpm dev:traced`), logging an activity produces one trace in Jaeger from the click through the browser's request to the server's handler, file write and event emit. Normal mode sends no traces and the normal bundle carries no tracing code. | unit (server), manual |

## 8. Claiming a lead

| ID | Criterion | Test |
|---|---|---|
| AC-8.1 | An unclaimed lead offers **Claim**. After claiming, the lead shows "You claimed this" with **Release**, and the inbox row shows the owner's name. | integration |
| AC-8.2 | If someone else claimed the lead first, **Claim** fails without a reload: the lead shows who owns it and "Tom Hughes claimed this lead first." is shown and announced. | integration |
| AC-8.3 | Claiming a lead you already own changes nothing. | unit (server) |
| AC-8.4 | Only the owner can release a claim. Releasing an unclaimed lead changes nothing. | unit (server) |
| AC-8.5 | Logging the first contact attempt on an unclaimed lead claims it for the author. A note does not. | integration |
| AC-8.6 | A claim or release made elsewhere shows up in an open inbox and lead without a reload. | integration |

## 9. Suggested next action (AIME stand-in)

| ID | Criterion | Test |
|---|---|---|
| AC-9.1 | The lead shows a suggested next step from the rules in A19, with its reason, labelled as a rules-based stand-in for AIME. | unit, integration |
| AC-9.2 | **Use** fills the composer with the suggested type and a draft summary. Nothing is logged until the salesperson submits. | integration |
| AC-9.3 | With no suggestion (an appointment is booked, or the lead was contacted recently), nothing is shown. | unit, integration |
