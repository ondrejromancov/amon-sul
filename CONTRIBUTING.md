# Contributing

## Development Setup

```bash
npm install
npm run dev
```

`npm run dev` starts the Fastify server and Vite web app together. With no
`amon-sul.config.yaml` present, the server runs in mock mode, so no GCP
credentials are needed for local UI work. You can also force mock mode with
`AMON_SUL_MOCK=1`.

## Checks

Run these from the repo root before opening a PR:

```bash
npm run test
npm run typecheck
npm run lint
npm run format
```

## Project Layout

- `apps/server` - Fastify API, poller, mock feed, GCP collectors.
- `apps/web` - Vite + React dashboard.
- `packages/shared` - shared domain types.
- `docs/self-hosting.md` - IAM, deployment, and runtime configuration.
- `docs/superpowers/specs/` - design specs and product notes.

## Pull Requests

Keep changes focused, add or update Vitest coverage for behavioral changes,
and make sure tests, typecheck, and Prettier pass. For user-facing changes,
update the README or self-hosting docs in the same PR.
