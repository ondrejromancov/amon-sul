# Self-hosting Amon Sûl

Amon Sûl is a single container: a Fastify server that serves the API and the
built web UI on one port, polling GCP with Application Default Credentials.

## IAM

The identity running Amon Sûl (your user locally, a service account when
hosted) needs **read-only** access to each watched project.

**Simple path** — grant `roles/viewer` on each watched project:

```bash
gcloud projects add-iam-policy-binding WATCHED_PROJECT \
  --member="serviceAccount:amon-sul@HOST_PROJECT.iam.gserviceaccount.com" \
  --role="roles/viewer"
```

**Least-privilege path** — grant per-service viewer roles instead, on each
watched project, for the resource types you actually use:

| Resource type   | Role                                                            |
| --------------- | --------------------------------------------------------------- |
| Cloud Run       | `roles/run.viewer`                                              |
| Cloud SQL       | `roles/cloudsql.viewer`                                         |
| Pub/Sub         | `roles/pubsub.viewer`                                           |
| Cloud Storage   | custom role with `storage.buckets.list` + `storage.buckets.get` |
| Cloud Scheduler | `roles/cloudscheduler.viewer`                                   |
| Memorystore     | `roles/redis.viewer`                                            |
| Compute Engine  | `roles/compute.viewer`                                          |
| Events (rail)   | `roles/logging.viewer`                                          |
| Sparklines      | `roles/monitoring.viewer`                                       |
| Recommendations | `roles/recommender.viewer`                                      |

Collectors treat disabled APIs as "not used" — you don't need to enable APIs a
project doesn't use.

## Write actions

Amon Sûl stays read-only by default. To enable write actions from the dashboard,
set `AMON_SUL_ALLOW_WRITES=1`. This enables VM start/stop, Cloud Run
min-instances updates, and Cloud Scheduler pause/resume.

When write actions are enabled, grant the runtime identity only the editor-level
roles needed for the resource types you will control:

| Action area     | Role                             |
| --------------- | -------------------------------- |
| Compute Engine  | `roles/compute.instanceAdmin.v1` |
| Cloud Run       | `roles/run.developer`            |
| Cloud Scheduler | `roles/cloudscheduler.admin`     |

Strongly prefer setting `AMON_SUL_TOKEN` whenever writes are enabled. In live
mode, Amon Sûl logs a startup warning if writes are enabled without dashboard
auth.

## Deploying to Cloud Run

Host Amon Sûl in its own GCP project, watching the others:

```bash
HOST_PROJECT=my-amon-sul
REGION=europe-west1

# service account for the watchtower
gcloud iam service-accounts create amon-sul --project $HOST_PROJECT
# grant it roles/viewer on each watched project (see above)

# build and deploy
gcloud builds submit --tag $REGION-docker.pkg.dev/$HOST_PROJECT/amon-sul/amon-sul --project $HOST_PROJECT
gcloud run deploy amon-sul \
  --image $REGION-docker.pkg.dev/$HOST_PROJECT/amon-sul/amon-sul \
  --project $HOST_PROJECT --region $REGION \
  --service-account amon-sul@$HOST_PROJECT.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --port 8080
```

Mount or bake in your config: either `COPY amon-sul.config.yaml /app/` in a
derived image, or mount it via a secret:

```bash
gcloud run services update amon-sul --project $HOST_PROJECT --region $REGION \
  --update-secrets=/app/amon-sul.config.yaml=amon-sul-config:latest
```

Instead of building from source, you can deploy the published image
`ghcr.io/ondrejromancov/amon-sul:latest` or a version tag such as
`ghcr.io/ondrejromancov/amon-sul:v0.1.0`.

## Costs

The Costs view always shows **list-price estimates** derived from discovered
resources (SQL tier, machine type, Redis GB, bucket bytes via Monitoring,
Cloud Run min-instances). Estimates cover compute only — disks and egress
are excluded — and are labeled as such in the UI.

For **actual spend**, enable a BigQuery billing export (Console → Billing →
Billing export → BigQuery, "standard usage cost") and point config at it:

```yaml
billing:
  bigqueryTable: my-project.billing.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX
```

The runtime identity needs `roles/bigquery.jobUser` on the table's project
and `roles/bigquery.dataViewer` on the dataset. Amon Sûl then queries the
last 6 invoice months (hourly) and the Costs view gains a real monthly trend
and per-service actuals.

When `roles/recommender.viewer` is granted on watched projects, the Costs view
also surfaces GCP Recommender cost advice such as idle VM and Cloud SQL
rightsizing opportunities.

## Authentication

Amon Sûl exposes infrastructure topology and error logs, so do not leave it
open on the public internet without an access layer.

Set `AMON_SUL_TOKEN` to enable the built-in dashboard token gate. When enabled,
all routes except `/healthz` require one of:

- `Authorization: Bearer <token>` for API clients.
- `amon_sul_token=<token>` cookie for browser dashboard and SSE access.
- `?token=<token>` on a GET request, which sets the `HttpOnly`,
  `SameSite=Lax`, `Path=/` cookie. Browser navigations redirect back to the same
  URL without the token parameter.

When `AMON_SUL_TOKEN` is unset, Amon Sûl has no dashboard auth. Keep
`--no-allow-unauthenticated` (use `gcloud run services proxy amon-sul` or IAP to
reach it), or run it on a private network / behind Tailscale.

## Environment variables

| Variable                | Default                          | Purpose                          |
| ----------------------- | -------------------------------- | -------------------------------- |
| `PORT`                  | `8787` (dev) / `8080` (Docker)   | listen port                      |
| `AMON_SUL_CONFIG`       | `./amon-sul.config.yaml`         | config file path                 |
| `AMON_SUL_MOCK`         | unset                            | `1` forces mock mode             |
| `AMON_SUL_TOKEN`        | unset                            | optional dashboard bearer token  |
| `AMON_SUL_ALLOW_WRITES` | unset                            | `1` enables opt-in write actions |
| `LOG_LEVEL`             | `info`                           | Fastify log level                |
| `WEB_DIST`              | `../web/dist` relative to server | built SPA location               |
