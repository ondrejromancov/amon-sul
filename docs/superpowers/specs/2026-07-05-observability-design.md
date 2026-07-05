# Amon Sûl Observability — Design & Signal Catalog

**Date:** 2026-07-05
**Status:** Approved direction; Phase 1 implemented, later phases roadmapped.

## Problem

The dashboard shows _that_ things exist and whether they're broken, but not the
basic vitals an owner actually asks: how big is my database, how many Cloud Run
instances are running right now, how big are they, how many objects are in that
bucket, what's eating money, what happened recently in _this_ project. The
information architecture also flattens everything into one graph + one global
event stream; there is no per-project "situation report".

## Information architecture (target)

Three altitudes, one consistent mental model — **cost · running · issues** at
every level:

1. **Fleet overview** (default view): stat strip (est/actual cost per month,
   resources running vs stopped, open issues), one card per project with its
   three numbers and a sparkline of errors; the existing graph canvas remains
   the spatial view of the same data.
2. **Project detail** (click a project): the project's graph, its own
   cost/running/issues tiles, its event feed (not the global one), a log tail,
   and per-resource vitals.
3. **Resource detail** (existing right panel, richer): identity + status +
   **vitals grid** + config + metrics sparklines + console links + its recent
   log lines.

## Signal catalog — what we can easily query

Everything below is available with the viewer roles we already require, via
APIs we already call (Cloud Monitoring `timeSeries.list`, admin list APIs,
Cloud Logging `entries.list`). "Cadence" = how fresh the source is.

### Cloud Run

| Question                                  | Source                                                                        | Cadence | Phase                         |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ------- | ----------------------------- |
| Instances running right now               | `run.googleapis.com/container/instance_count` (labels: state=active/idle)     | ~1 min  | **1**                         |
| How big is each instance                  | Admin API `template.containers[].resources.limits` (cpu/memory)               | live    | **1**                         |
| Requests/s, latency p50/p95/p99           | `request_count`, `request_latencies`                                          | ~1 min  | 1 (rate exists) / 2 (latency) |
| Error rate (5xx share)                    | `request_count` grouped by `response_code_class`                              | ~1 min  | 2                             |
| Billable instance time (real cost driver) | `container/billable_instance_time`                                            | ~1 min  | 2                             |
| CPU/memory pressure                       | `container/cpu/utilizations`, `container/memory/utilizations` (distributions) | ~1 min  | 2                             |
| Cold start count                          | `container/startup_latencies`                                                 | ~1 min  | 3                             |
| Revisions & traffic split                 | Admin API `traffic`                                                           | live    | 2                             |

### Cloud SQL

| Question                                | Source                                                    | Cadence | Phase                       |
| --------------------------------------- | --------------------------------------------------------- | ------- | --------------------------- |
| **How large is my database**            | `cloudsql.../database/disk/bytes_used` + `disk/quota`     | ~1 min  | **1**                       |
| Memory / CPU pressure                   | `database/memory/utilization`, `database/cpu/utilization` | ~1 min  | **1**                       |
| Active connections                      | `database/network/connections`                            | ~1 min  | 1 (drawer sparkline exists) |
| Storage growth trend ("full in N days") | linear fit over `bytes_used` history                      | derived | 2                           |
| Uptime / restarts                       | `database/up`, `database/instance_state`                  | ~1 min  | 2                           |
| Slow queries                            | Query Insights API (needs flag enabled)                   | live    | 3                           |
| Backups status                          | Admin API `backupRuns.list`                               | live    | 2                           |

### Cloud Storage

| Question                           | Source                                               | Cadence   | Phase |
| ---------------------------------- | ---------------------------------------------------- | --------- | ----- |
| **How many objects in the bucket** | `storage.googleapis.com/storage/v2/total_count`      | **daily** | **1** |
| Total stored bytes                 | `storage/v2/total_bytes` (already fetched for costs) | daily     | **1** |
| By storage class                   | same metrics, `storage_class` label                  | daily     | 2     |
| Request rate / egress              | `api/request_count`, `network/sent_bytes_count`      | ~1 min    | 3     |
| Public-access / lifecycle config   | Admin API `iamConfiguration`, `lifecycle`            | live      | 3     |

### Pub/Sub

| Question                       | Source                                    | Cadence | Phase                           |
| ------------------------------ | ----------------------------------------- | ------- | ------------------------------- |
| Backlog (undelivered messages) | `subscription/num_undelivered_messages`   | ~1 min  | **2** (needs sub→topic mapping) |
| Oldest unacked message age     | `subscription/oldest_unacked_message_age` | ~1 min  | 2                               |
| Publish rate                   | `topic/send_message_operation_count`      | ~1 min  | 2                               |
| Dead-letter traffic            | `subscription/dead_letter_message_count`  | ~1 min  | 3                               |

### Memorystore (Redis)

| Question          | Source                                          | Cadence | Phase |
| ----------------- | ----------------------------------------------- | ------- | ----- |
| Memory usage %    | `redis.googleapis.com/stats/memory/usage_ratio` | ~1 min  | **1** |
| Connected clients | `redis.../clients/connected`                    | ~1 min  | 2     |
| Hit ratio         | `stats/cache_hit_ratio`                         | ~1 min  | 3     |
| Evictions         | `stats/evicted_keys`                            | ~1 min  | 3     |

### Compute Engine

| Question                | Source                                                                        | Cadence | Phase           |
| ----------------------- | ----------------------------------------------------------------------------- | ------- | --------------- |
| CPU utilization         | `compute.googleapis.com/instance/cpu/utilization` (has `instance_name` label) | ~1 min  | **1**           |
| Machine size (vCPU/RAM) | Admin API `machineType` (already shown)                                       | live    | done            |
| Disk attached & size    | Admin API `disks[]` — feeds "stopped but disk still billed"                   | live    | 2               |
| Memory utilization      | needs Ops Agent installed — often absent                                      | ~1 min  | 3 (best effort) |

### Cloud Scheduler / jobs

| Question                   | Source                                                                  | Cadence | Phase                   |
| -------------------------- | ----------------------------------------------------------------------- | ------- | ----------------------- |
| Last run result / next run | Admin API `status`, `scheduleTime`, `lastAttemptTime` (partially shown) | live    | 1 (done) / 2 (next run) |
| Failure streak             | Logging filter on job attempt logs                                      | ~1 min  | 3                       |

### Cross-cutting

| Question                                    | Source                                                                   | Cadence   | Phase                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------ | --------- | ------------------------------------------------------------ |
| Recent errors/warnings per project          | Logging `entries.list` (already polled)                                  | ~30 s     | done                                                         |
| **Browsable log tail per project/resource** | same API, on-demand query w/ filters                                     | on demand | **2**                                                        |
| Actual spend & trend                        | BigQuery billing export (implemented, opt-in)                            | daily     | done                                                         |
| Estimated cost per resource                 | pricing table (implemented)                                              | live      | done                                                         |
| Quota warnings (e.g. Logging reads)         | Service Usage API `consumerQuotaMetrics`                                 | hourly    | 3                                                            |
| Uptime checks / SSL expiry on URLs          | Monitoring Uptime Check API (create = write op)                          | 1–5 min   | 4                                                            |
| Recommendations (idle VM, rightsizing)      | Recommender API (`google.compute.instance.IdleResourceRecommender` etc.) | daily     | **3** — high value: GCP literally tells you what to optimize |

## Phasing

- **Phase 1 — Vitals (implemented with this spec):** one Monitoring sweep per
  project per resource-poll answering the four core questions: SQL
  used/quota GB + memory %, Run active instance count + configured cpu/mem
  size, GCS bytes + object count, Redis memory %, GCE CPU %. Vitals render
  as an expanded grid in the detail panel and upgraded one-line statusText
  on node cards. Bucket bytes reused for cost estimates (replaces the
  separate cost fetch).
- **Phase 2 — Project drill-in & logs:** per-project page (tiles, own event
  feed, log browser with severity/resource filters over `entries.list`),
  Pub/Sub backlog via subscription mapping, latency/error-rate on Run, disk
  inventory on stopped VMs, SQL growth projection.
- **Phase 3 — Advice & alerting:** Recommender API surfacing GCP's own
  idle/rightsizing advice (pairs with the Costs view), threshold badges
  (disk >80%, backlog growing, error-rate spike), quota watch.
- **Phase 4 — Actions (write ops, opt-in `--allow-writes`):** start/stop VM
  and SQL, scale Run min-instances, pause scheduler jobs — the read-only
  contract stays the default.

## Query budget

Phase 1 adds ≤6 Monitoring `timeSeries.list` calls per project per 60 s poll
(~36k/day for 7 projects) — well inside the free Monitoring API quota
(1 M read calls/day) and free tier (reads are free; only ingestion bills).
GCS metrics are daily-sampled; they're fetched with a 26 h lookback.
