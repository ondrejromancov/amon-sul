# Amon Sûl — Design

**Date:** 2026-07-04
**Status:** Draft for review

## Overview

Amon Sûl is a self-hostable watchtower for Google Cloud Platform. It renders a
fleet of GCP projects as boards of connected resource nodes with live status,
recent errors, metrics sparklines, and deep links into the GCP console. The
visual language comes from the `gcp-fleet-prototype.html` mockup: dark theme,
Space Grotesk + JetBrains Mono, per-project boards with animated dashed wires
between nodes, a bottom event rail, and a right-hand detail drawer.

### Goals

- **Read-only observability** across many GCP projects in one screen.
- **Reusable**: anyone can clone the repo, point it at their own projects, and
  self-host it. No personal data or project IDs baked into the codebase.
- **Zero-credential demo**: mock mode runs the full UI with fixture data so the
  project is usable (dev, demo, contribution) without any GCP access.
- **Simple auth story**: Application Default Credentials only. Locally that is
  `gcloud auth application-default login`; hosted it is the runtime service
  account. No key files in config.

### Non-goals (v1)

- Write operations of any kind (config editing, deploys, VM start/stop). The
  prototype's "Save changes" flow is intentionally dropped.
- Historical data, trends, or cost tracking (no database).
- Dashboard authentication. Self-hosters protect the app with their platform
  (Cloud Run IAM/IAP, VPN, Tailscale). Documented, not implemented.
- Automatic edge inference. Wiring between nodes is declared in config.

## Architecture

npm-workspaces monorepo, three packages:

```
amon-sul/
├── apps/
│   ├── web/                       # Vite + React + TypeScript SPA
│   └── server/                    # Fastify + TypeScript API + poller
├── packages/
│   └── shared/                    # domain types shared by web and server
├── docs/                          # self-hosting guide, config reference, IAM roles
├── amon-sul.config.example.yaml
├── Dockerfile                     # multi-stage; Fastify serves the built SPA
└── README.md
```

- **`packages/shared`** — pure TypeScript types, no runtime code. Both apps
  import it; it is the API contract.
- **`apps/server`** — Fastify. Owns GCP access, the background poller, the
  in-memory cache, REST endpoints, and an SSE stream. In production it also
  serves the built SPA (single container, single port).
- **`apps/web`** — Vite + React SPA. Fetches one snapshot, subscribes to SSE,
  renders. No client-side GCP access ever.

Node 24, npm workspaces (no turbo/nx — three packages don't need it).

## Domain model (`packages/shared`)

```ts
type ResourceType = 'run' | 'sql' | 'pubsub' | 'storage' | 'scheduler' | 'redis' | 'vm';
type Status = 'ok' | 'warn' | 'err' | 'idle' | 'unknown';

interface Resource {
  id: string;                 // `${projectId}/${type}/${name}`
  projectId: string;
  type: ResourceType;
  name: string;
  region?: string;
  status: Status;
  statusText: string;         // one-line human summary, e.g. "db-g1-small · 61% disk"
  consoleLinks: { label: string; url: string }[];
  layout: { x: number; y: number };   // px, resolved server-side (config pin or auto-layout)
}

interface Project {
  id: string;                 // GCP project id
  displayName: string;        // from config, defaults to id
  status: Status;             // worst-of its resources
  resources: Resource[];
  edges: [string, string][];  // pairs of Resource.id
  board: { w: number; h: number };    // computed from layout
  error?: string;             // set when discovery for this project failed
}

type Severity = 'info' | 'warn' | 'err';

interface FleetEvent {
  id: string;
  severity: Severity;
  projectId: string;
  resourceId?: string;        // matched where possible, else undefined
  message: string;
  timestamp: string;          // ISO 8601
}

interface FleetSnapshot {
  projects: Project[];
  events: FleetEvent[];       // newest first, capped (default 100)
  fetchedAt: string;
  mode: 'live' | 'mock';
}

interface MetricSeries {
  label: string;              // e.g. "requests · 1h"
  points: { t: string; v: number }[];
}
```

Layout is resolved **server-side** so the web app stays a dumb renderer and
mock mode exercises the same code path.

## Configuration

YAML file, path from `AMON_SUL_CONFIG` (default `./amon-sul.config.yaml`).
Validated with a schema (zod) at startup; validation errors are fatal with a
clear message.

```yaml
projects:
  - id: rankforge-prod
    name: Rankforge                  # optional; defaults to id
    edges:                           # optional; type/name shorthand, scoped to this project
      - [run/api, pubsub/crawl-jobs]
      - [pubsub/crawl-jobs, run/crawl-worker]
    layout:                          # optional grid pins; col,row — converted to px server-side
      run/api: [0, 0]
      pubsub/crawl-jobs: [1, 0]

poll:
  resourcesSeconds: 60               # default 60
  eventsSeconds: 30                  # default 30

events:
  lookbackHours: 24                  # default 24
  maxEntries: 100                    # default 100
```

- Resource keys in `edges`/`layout` are `type/name` (e.g. `run/api`). Keys that
  match nothing discovered are logged as warnings, not errors, so config
  survives infra changes.
- Unpinned resources get a deterministic grid auto-layout: nodes placed in
  discovery order into a grid (2 rows, growing columns), same cell size as the
  prototype (200×76 nodes, generous gaps). Pinned and unpinned resources can
  mix; auto-layout fills cells not occupied by pins.

## GCP integration (`apps/server`)

One `ResourceCollector` per resource type with a common interface:

```ts
interface ResourceCollector {
  type: ResourceType;
  collect(projectId: string, auth: GoogleAuth): Promise<Resource[]>;
}
```

Collectors use the official `googleapis`/`@google-cloud/*` clients with ADC.
Per-type discovery and status derivation:

| Type | API | Status derivation | statusText example |
|---|---|---|---|
| `run` | Cloud Run Admin v2, list services | Ready condition true → `ok`, false → `err` | `rev api-00092 · 2m ago` |
| `sql` | SQL Admin, list instances | `RUNNABLE` → `ok`; `STOPPED/SUSPENDED` → `idle`; else `err` | `db-g1-small · RUNNABLE` |
| `pubsub` | Pub/Sub, list topics | exists → `ok` | `topic · <region or global>` |
| `storage` | Cloud Storage, list buckets | exists → `ok` | `<location> · <storageClass>` |
| `scheduler` | Cloud Scheduler, list jobs | last attempt OK → `ok`; failed → `err`; `PAUSED` → `idle` | `0 2 * * * · last OK` |
| `redis` | Memorystore Redis, list instances | `READY` → `ok`; `MAINTENANCE` → `warn`; else `err` | `1 GB BASIC · READY` |
| `vm` | Compute Engine, aggregated list | `RUNNING` → `ok`; `TERMINATED` → `idle`; else `warn` | `a2-highgpu-1g · TERMINATED` |

Notes:

- Disk %, memory %, message rates require Monitoring queries; v1 statusText
  uses only what the list APIs return. Richer statusText is a later
  enhancement, not a contract change.
- A resource with recent `err` events (see below) is escalated to at least
  `warn` so log noise is visible on the board.
- Console links are generated per type exactly as in the prototype
  (service/logs/revisions for Run, instance/backups for SQL, etc.).
- APIs not enabled on a project (`SERVICE_DISABLED` / 403) are treated as
  "type not used": empty result, debug log, no error.
- Any other collector failure is caught per collector; the project keeps its
  remaining resources and gets `error` set plus status `unknown` only if
  everything failed.

### Events (Cloud Logging)

Per project, poll `entries.list` with a filter: `severity>=WARNING`, lookback
from config, excluding Amon Sûl's own logs. Map entries to `FleetEvent`:

- `severity`: `WARNING` → `warn`, `ERROR+` → `err`.
- `resourceId`: matched from the log entry's monitored-resource labels
  (e.g. `service_name` for Cloud Run) when it corresponds to a discovered
  resource.
- `message`: `textPayload`, or `jsonPayload.message`, truncated server-side to
  ~300 chars.

Deduplication: an event id is a hash of (project, insertId); the poller only
emits entries newer than the last seen timestamp per project.

### Metrics (Cloud Monitoring)

Fetched **on demand** when the drawer opens, not polled:

- `run`: `run.googleapis.com/request_count`, 1h window, 1-minute alignment.
- `sql`: `cloudsql.googleapis.com/database/network/connections`, same window.
- Other types: no metrics in v1; the drawer hides the sparkline section.

Results cached in memory for 60s per resource.

## Data flow

**Poller → cache → REST + SSE** (approved option B):

1. On startup the server builds the collector set from config and runs an
   immediate poll, then loops: resources every `poll.resourcesSeconds`, events
   every `poll.eventsSeconds`. Projects are polled concurrently; collectors
   within a project too.
2. Results land in a single in-memory `FleetStore` holding the current
   `FleetSnapshot`.
3. REST API:
   - `GET /api/snapshot` → current `FleetSnapshot` (instant, from cache)
   - `GET /api/resources/:id/metrics` → `MetricSeries[]` (on-demand, cached 60s)
   - `GET /api/stream` → SSE
   - `GET /healthz` → `{ ok, mode, lastPollAt }`
4. SSE emits two event kinds:
   - `event: fleet-event` — each new `FleetEvent` as it is discovered (feeds
     the rail live, with the flash-in animation)
   - `event: snapshot` — after each resource poll completes, the full new
     snapshot (statuses may have changed)

The web client's reconnect strategy is the browser's native EventSource
retry; on reconnect it refetches `/api/snapshot` to resync.

## Mock mode

Active when `AMON_SUL_MOCK=1` **or** no config file exists (so a fresh clone
`npm run dev` just works). The server swaps collectors for a fixture module:

- Fixture data ports the prototype's four demo projects (Rankforge,
  Pulseboard, Ledgerlite, ML Lab) including edges, layout pins, statuses, and
  the error list.
- A simulated feed pushes a canned event over SSE every ~9s.
- Metrics endpoint returns generated series shaped by status (cliff for
  `err`, flatline for `idle`) mirroring the prototype's spark generator.
- `FleetSnapshot.mode = 'mock'`; the web app shows a small "mock data" badge
  in the header so it is never mistaken for live.

Mock mode is the same code path from `FleetStore` onward — poller, SSE, REST
are all exercised.

## Frontend (`apps/web`)

Single screen, no router. Plain CSS ported from the prototype (CSS custom
properties, one stylesheet per component area; no Tailwind — pixel fidelity to
the prototype matters more than utility classes).

Components:

- `App` — layout grid (header / sidebar / canvas / rail), owns the snapshot
  via a `useFleet()` hook (initial fetch + SSE subscription).
- `Header` — logo, search input, errors button with live count, mock badge.
- `Sidebar` — fleet stats (projects, services, errors 24h; the prototype's
  hardcoded cost tile is dropped in v1), project list with status dots;
  clicking scrolls the canvas to the project board.
- `Canvas` → `ProjectBoard` → `ResourceNode` — boards sized by server-computed
  layout, SVG wires with the hover dash-flow animation, nodes with icon,
  name, type, status line. Search dims non-matching nodes.
- `Drawer` — opens on node click: console links, sparkline (lazy-fetched
  metrics, canvas-drawn like the prototype), recent events for that resource.
  The prototype's configuration section is omitted (read-only v1). Also hosts
  the errors-panel variant opened by the header button (all warn/err events,
  click-through to the owning node).
- `EventRail` — newest-first event chips, click opens the drawer for the
  resource; `fresh` flash animation on SSE arrivals.
- `Toast` — kept as a generic utility for transient notices (e.g. "connection
  lost, retrying"), not for save actions.

State: React `useState`/`useReducer` inside `useFleet()`; no state library.
Accessibility carried over from the prototype: keyboard-activatable nodes and
events, `aria-label`s, `prefers-reduced-motion` respected, visible focus
outlines.

## Error handling

- **Server startup**: invalid config → exit with a readable validation
  message. Missing ADC in live mode → exit with instructions
  (`gcloud auth application-default login`).
- **Poll failures**: per-collector try/catch as described; a fully failed
  project renders its board with an inline error note instead of nodes. The
  snapshot always ships whatever succeeded.
- **Web**: snapshot fetch failure → full-screen retry state; SSE drop → toast
  + automatic resync on reconnect.

## Testing

Vitest across the workspace:

- **server** (bulk of the tests): each collector's mapping and status
  derivation against recorded/mocked API payloads; config parsing and
  validation; edge/layout resolution incl. unknown-key warnings; event
  mapping, dedup, and resource matching; auto-layout determinism.
- **shared**: type-only, compile via `tsc --noEmit`.
- **web**: `@testing-library/react` smoke tests — renders mock snapshot,
  search dims nodes, drawer opens with resource details.

CI: GitHub Actions — lint (eslint + prettier), typecheck, test on push/PR.
Mock mode makes all of this credential-free.

## Self-hosting & docs

- **Dockerfile**: multi-stage — install workspace, build web + server, final
  `node:24-slim` image running Fastify which serves `/api/*` and the static
  SPA on one port (default 8080).
- **README**: what it is (screenshot from mock mode), quickstart
  (`npm i && npm run dev` → mock mode instantly), pointing at real GCP
  (ADC + config file), config reference link.
- **docs/self-hosting.md**: required IAM for the runtime identity — the
  simple path is `roles/viewer` on each watched project; the guide also lists
  the granular per-service viewer roles (`roles/run.viewer`,
  `roles/cloudsql.viewer`, `roles/pubsub.viewer`, `roles/cloudscheduler.viewer`,
  `roles/redis.viewer`, `roles/compute.viewer`, `roles/logging.viewer`,
  `roles/monitoring.viewer`, plus `storage.buckets.list` via a small custom
  role) for least-privilege setups — and a Cloud Run deploy recipe. Explicit note: the app itself has no auth;
  put it behind Cloud Run IAM/IAP or a private network.

## Deferred (explicitly v2+)

- Write operations (Cloud Run config editing, VM start/stop) with
  confirmation UX and editor roles.
- History and trends (SQLite), cost tracking (Billing API — replaces the
  prototype's static "$41/mo" tile).
- Richer statusText via Monitoring (disk %, memory %, msg rates).
- Auto-discovery of the project list itself (Resource Manager) as an
  alternative to declaring projects in config.
- Dashboard-level authentication.
