# AGENTS.md: instructions for AI coding agents

Read this before changing anything. It is the contract between the owner (Tung Vu) and any AI agent
working in this repo.

## What we are building

A Sales Lead Management Tool for Keyloop's Demand domain (Scenario C, frontend). Salespeople see
incoming website leads in an inbox, open a lead to see its details and a chronological activity log,
and log new follow-up activities that persist. Speed-to-lead is the core metric: how long a lead has
waited for a first response drives sorting and overdue flags.

Requirements, acceptance criteria and the API contract live in [`specs/`](specs/). **The spec is the
source of truth.** If code and spec disagree, stop and ask. Do not silently "fix" either one.

## Architecture (target)

```
src/       React app: the implemented layer
server/    mock API (Hono on Node): JSON-file persistence, SSE feed, latency and failure injection
src/contract.ts   Zod schemas shared by app and mock server
```

Key decisions are recorded in [`docs/adr/`](docs/adr/). Do not contradict an ADR; propose a new one.

## Stack

- TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 24 LTS, pnpm
- React 19 + Vite, React Router, TanStack Query, Zod, plain CSS with design tokens
- Vitest + React Testing Library for unit and integration tests; Playwright for one end-to-end path
- oxlint for linting

## Working rules

1. **Spec first.** Before implementing a behaviour, confirm it is in `specs/`. If not, propose the
   spec change first.
2. **Tests first for logic.** Write the failing test, then the code. Every error path (server
   failure, timeout, conflict, malformed response) needs a test.
3. **Small diffs.** One concern per change, readable in a few minutes.
4. **No new dependency without asking.** Name the package, why, and the alternative. Verify it exists
   on npm, is maintained, and supports our Node version before proposing it.
5. **No silent catch-alls.** Never swallow an error; map it to an explicit outcome the UI can show,
   and log it.
6. **Explain trade-offs before coding** when there is more than one reasonable approach.
7. **Never claim it works without running it.** Run lint, typecheck and tests and report the real
   output. For UI work, check it in a browser too.
8. **Log notable collaboration** in [`AI_LOG.md`](AI_LOG.md): ask → AI output → decision → why.

## Commands

```bash
pnpm install     # install deps (engineStrict: fails on a Node version mismatch)
pnpm dev         # run the app
pnpm lint        # oxlint, warnings fail
pnpm typecheck   # tsc -b
pnpm test        # vitest run
pnpm build       # typecheck + production build
```
