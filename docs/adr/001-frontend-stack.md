# ADR-001: Frontend stack

**Status:** Accepted
**Deciders:** Tung Vu

## Context

The frontend is the implemented layer. It has to show the full experience of a lead inbox: data
that changes underneath the user (live leads, other salespeople's activity), writes that must feel
instant, and error states that are real. I have to be able to explain every line, so familiar,
widely used tools beat novel ones.

## Decision

| Concern | Choice | Main alternative | Why |
|---|---|---|---|
| UI | React 19, TypeScript (strict), Vite | Next.js | No server rendering need: an internal tool behind login. Vite is a plain SPA build with nothing to explain away. |
| Server state | TanStack Query | SWR, hand-rolled | Caching, refetch on invalidation, and optimistic updates with rollback are built in. SWR's mutation support is thinner; hand-rolling would mean writing and testing a cache. |
| Client state | None (URL + React state) | Zustand, Redux | Almost all state is server state. The selected lead lives in the URL; the rest is local to components. |
| Routing | React Router | TanStack Router | Two routes. React Router is the one I know; TanStack Router's typed params aren't worth the learning curve here. |
| Validation | Zod | Valibot, hand-written guards | One schema gives the TypeScript type and the runtime check, and the mock server reuses it. |
| Styling | Plain CSS with custom-property tokens | Tailwind | No dependency, readable markup, and tokens give a consistent design without a build plugin. |
| Tests | Vitest, Testing Library, Playwright | Jest | Vitest shares Vite's config and transforms. Testing Library tests behaviour the user sees. One Playwright path covers what jsdom can't (real SSE, reload). |
| Lint | oxlint | ESLint | Came with the current Vite template; fast, and enough for this size. |

## Consequences

- Easier: optimistic updates, cache invalidation from live events, one source of truth for types.
- Harder: TanStack Query's cache is a second place state lives; tests need a fresh `QueryClient`
  each time to stay isolated.
- Runtime: Node 24 LTS. The latest React Router (8) and jsdom (30) need Node 22.22 or newer, and
  the mock server relies on Node running TypeScript without a flag (ADR-003). The project started
  on Node 22.13; we upgraded rather than pin older versions of both libraries.
