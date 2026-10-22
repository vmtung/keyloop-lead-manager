# Lead Manager

A Sales Lead Management Tool for dealership salespeople (Keyloop technical assessment, Scenario C,
Demand domain). Work in progress.

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm 11

## Build, run, test

```bash
pnpm install
pnpm dev            # app on http://localhost:5173, mock API on :8787
pnpm test           # unit and integration tests
pnpm lint
pnpm typecheck
pnpm build
```

While `pnpm dev` is running:

```bash
pnpm simulate:lead  # post a new website enquiry to the mock API
```

To see the error paths, start the mock API slow and unreliable:

```bash
MOCK_LATENCY_MS=1500-2500 MOCK_FAILURE_RATE=0.5 pnpm dev
```

Data is stored in `server/data/db.json`. Stop `pnpm dev`, then run `pnpm reset-data` to go back to
the sample data (the running server keeps its data in memory).

## AI Collaboration Narrative

To be written. The running log is in [AI_LOG.md](AI_LOG.md).
