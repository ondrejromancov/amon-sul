import { google, type monitoring_v3 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Vital } from '@amon-sul/shared';
import type { CollectedResource } from './layout.js';

/**
 * Phase-1 observability vitals: one Monitoring sweep per project answering
 * the core "state of my infrastructure" questions (spec:
 * docs/superpowers/specs/2026-07-05-observability-design.md).
 */
export interface ProjectVitals {
  /** SQL instance name → bytes. */
  sqlDiskUsed: Map<string, number>;
  sqlDiskQuota: Map<string, number>;
  /** SQL instance name → 0..1. */
  sqlMemory: Map<string, number>;
  /** Cloud Run service name → current instance count (active+idle). */
  runInstances: Map<string, number>;
  /** Bucket name → bytes / object count (daily-sampled metrics). */
  bucketBytes: Map<string, number>;
  bucketObjects: Map<string, number>;
  /** Redis instance id → 0..1 memory usage. */
  redisMemory: Map<string, number>;
  /** GCE instance name → 0..1 CPU utilization. */
  vmCpu: Map<string, number>;
  /** Buckets whose inventory hit the listing cap (values are lower bounds). */
  bucketApprox: Set<string>;
}

export function emptyVitals(): ProjectVitals {
  return {
    sqlDiskUsed: new Map(),
    sqlDiskQuota: new Map(),
    sqlMemory: new Map(),
    runInstances: new Map(),
    bucketBytes: new Map(),
    bucketObjects: new Map(),
    redisMemory: new Map(),
    vmCpu: new Map(),
    bucketApprox: new Set(),
  };
}

type Series = monitoring_v3.Schema$TimeSeries;

function pointValue(s: Series): number {
  const v = s.points?.[0]?.value;
  return Number(v?.doubleValue ?? v?.int64Value ?? 0);
}

/** Latest value per label; `pick` extracts the map key from a series. */
export function latestBy(
  series: Series[],
  pick: (s: Series) => string | undefined | null,
  combine: 'last' | 'sum' = 'last',
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of series) {
    const key = pick(s);
    if (!key) continue;
    const v = pointValue(s);
    out.set(key, combine === 'sum' ? (out.get(key) ?? 0) + v : v);
  }
  return out;
}

const sqlInstance = (s: Series) => s.resource?.labels?.database_id?.split(':')[1];
const bucketName = (s: Series) => s.resource?.labels?.bucket_name;
const serviceName = (s: Series) => s.resource?.labels?.service_name;
const redisId = (s: Series) => s.resource?.labels?.instance_id?.split('/').pop();
const vmName = (s: Series) => s.metric?.labels?.instance_name;

interface Query {
  metric: string;
  assign: (v: ProjectVitals, series: Series[]) => void;
  /** Lookback minutes (GCS metrics are daily-sampled). */
  lookbackMin?: number;
  aligner?: string;
}

const QUERIES: Query[] = [
  {
    metric: 'cloudsql.googleapis.com/database/disk/bytes_used',
    assign: (v, s) => (v.sqlDiskUsed = latestBy(s, sqlInstance)),
  },
  {
    metric: 'cloudsql.googleapis.com/database/disk/quota',
    assign: (v, s) => (v.sqlDiskQuota = latestBy(s, sqlInstance)),
  },
  {
    metric: 'cloudsql.googleapis.com/database/memory/utilization',
    assign: (v, s) => (v.sqlMemory = latestBy(s, sqlInstance)),
  },
  {
    metric: 'run.googleapis.com/container/instance_count',
    assign: (v, s) => (v.runInstances = latestBy(s, serviceName, 'sum')),
    aligner: 'ALIGN_MAX',
  },
  {
    metric: 'storage.googleapis.com/storage/v2/total_bytes',
    assign: (v, s) => (v.bucketBytes = latestBy(s, bucketName, 'sum')),
    lookbackMin: 26 * 60,
  },
  {
    metric: 'storage.googleapis.com/storage/v2/total_count',
    assign: (v, s) => (v.bucketObjects = latestBy(s, bucketName, 'sum')),
    lookbackMin: 26 * 60,
  },
  {
    metric: 'redis.googleapis.com/stats/memory/usage_ratio',
    assign: (v, s) => (v.redisMemory = latestBy(s, redisId)),
  },
  {
    metric: 'compute.googleapis.com/instance/cpu/utilization',
    assign: (v, s) => (v.vmCpu = latestBy(s, vmName)),
  },
];

export async function fetchProjectVitals(
  projectId: string,
  auth: GoogleAuth,
): Promise<ProjectVitals> {
  const client = google.monitoring({ version: 'v3', auth });
  const vitals = emptyVitals();
  await Promise.all(
    QUERIES.map(async (q) => {
      const end = new Date();
      const start = new Date(end.getTime() - (q.lookbackMin ?? 15) * 60_000);
      try {
        const res = await client.projects.timeSeries.list({
          name: `projects/${projectId}`,
          filter: `metric.type="${q.metric}"`,
          'interval.startTime': start.toISOString(),
          'interval.endTime': end.toISOString(),
          'aggregation.alignmentPeriod': `${Math.max(300, ((q.lookbackMin ?? 15) * 60) / 4)}s`,
          'aggregation.perSeriesAligner': q.aligner ?? 'ALIGN_MEAN',
          pageSize: 200,
        });
        q.assign(vitals, res.data.timeSeries ?? []);
      } catch {
        // Missing metric / disabled API — that vital simply stays absent.
      }
    }),
  );
  return vitals;
}

/* ---------- bucket inventory fallback ---------- */

/**
 * GCS's daily storage metrics are not emitted in all projects. When they're
 * absent, list objects directly: exact for small buckets, capped at
 * MAX_PAGES×1000 objects (value flagged approximate). Cached for an hour —
 * this is O(objects) and must not run per poll.
 */
const INVENTORY_TTL_MS = 60 * 60_000;
const MAX_PAGES = 5;
const inventoryCache = new Map<
  string,
  { at: number; bytes: number; objects: number; approx: boolean }
>();

export async function fillBucketInventory(
  vitals: ProjectVitals,
  bucketNames: string[],
  auth: GoogleAuth,
): Promise<void> {
  const client = google.storage({ version: 'v1', auth });
  const missing = bucketNames.filter((b) => !vitals.bucketBytes.has(b));
  await Promise.all(
    missing.map(async (bucket) => {
      const cached = inventoryCache.get(bucket);
      let entry = cached && Date.now() - cached.at < INVENTORY_TTL_MS ? cached : undefined;
      if (!entry) {
        try {
          let bytes = 0;
          let objects = 0;
          let pageToken: string | undefined;
          let pages = 0;
          do {
            const res = await client.objects.list({
              bucket,
              maxResults: 1000,
              pageToken,
              fields: 'nextPageToken,items(size)',
            });
            for (const o of res.data.items ?? []) {
              bytes += Number(o.size ?? 0);
              objects += 1;
            }
            pageToken = res.data.nextPageToken ?? undefined;
            pages += 1;
          } while (pageToken && pages < MAX_PAGES);
          entry = { at: Date.now(), bytes, objects, approx: Boolean(pageToken) };
          inventoryCache.set(bucket, entry);
        } catch {
          return; // no access / listing denied — vital stays absent
        }
      }
      vitals.bucketBytes.set(bucket, entry.bytes);
      vitals.bucketObjects.set(bucket, entry.objects);
      if (entry.approx) vitals.bucketApprox.add(bucket);
    }),
  );
}

/* ---------- pure decoration (tested) ---------- */

export function gb(bytes: number): string {
  const v = bytes / 1e9;
  if (v >= 100) return String(Math.round(v));
  const s = v >= 1 ? v.toFixed(1) : v.toFixed(2);
  return s.replace(/\.0+$/, '');
}

/** Human size with unit — buckets can be KB-sized, databases GB-sized. */
export function size(bytes: number): string {
  if (bytes >= 1e9) return `${gb(bytes)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Normalize k8s-style cpu limits: "1000m" → "1", "500m" → "0.5". */
function cpu(limit?: string): string | undefined {
  if (!limit) return undefined;
  const m = /^(\d+)m$/.exec(limit);
  if (!m) return limit;
  const v = Number(m[1]) / 1000;
  return String(v % 1 === 0 ? v : v);
}

function count(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Attach vitals + upgrade statusText using the project's monitoring sweep.
 * Pure; unknown resources pass through untouched.
 */
export function applyVitals(r: CollectedResource, v: ProjectVitals): CollectedResource {
  switch (r.type) {
    case 'sql': {
      const used = v.sqlDiskUsed.get(r.name);
      const quota = v.sqlDiskQuota.get(r.name);
      const mem = v.sqlMemory.get(r.name);
      if (used === undefined) return r;
      const tier = r.statusText.split('·')[0]?.trim();
      const vitals: Vital[] = [
        {
          label: 'Database size',
          value: quota ? `${gb(used)} / ${gb(quota)} GB` : `${gb(used)} GB`,
        },
      ];
      if (quota) vitals.push({ label: 'Disk used', value: pct(used / quota) });
      if (mem !== undefined) vitals.push({ label: 'Memory', value: pct(mem) });
      return {
        ...r,
        vitals,
        statusText: `${tier} · ${gb(used)}${quota ? `/${gb(quota)}` : ''} GB`,
      };
    }
    case 'run': {
      const instances = v.runInstances.get(r.name);
      if (instances === undefined) return r;
      const n = Math.round(instances);
      const vitals: Vital[] = [{ label: 'Instances now', value: String(n) }];
      if (r.details?.cpuLimit || r.details?.memoryLimit) {
        vitals.push({
          label: 'Instance size',
          value: `${cpu(r.details.cpuLimit) ?? '?'} vCPU · ${r.details.memoryLimit ?? '?'}`,
        });
      }
      return { ...r, vitals, statusText: `${n} inst · ${r.statusText}` };
    }
    case 'storage': {
      const bytes = v.bucketBytes.get(r.name);
      const objects = v.bucketObjects.get(r.name);
      if (bytes === undefined && objects === undefined) return r;
      const approx = v.bucketApprox.has(r.name) ? '≥' : '';
      const vitals: Vital[] = [];
      if (bytes !== undefined) vitals.push({ label: 'Stored', value: `${approx}${size(bytes)}` });
      if (objects !== undefined)
        vitals.push({ label: 'Objects', value: `${approx}${count(objects)}` });
      const parts = [
        bytes !== undefined ? `${approx}${size(bytes)}` : null,
        objects !== undefined ? `${approx}${count(objects)} obj` : null,
      ].filter(Boolean);
      return { ...r, vitals, statusText: parts.join(' · ') };
    }
    case 'redis': {
      const mem = v.redisMemory.get(r.name);
      if (mem === undefined) return r;
      return {
        ...r,
        vitals: [{ label: 'Memory used', value: pct(mem) }],
        statusText: `${r.statusText} · mem ${pct(mem)}`,
      };
    }
    case 'vm': {
      const cpu = v.vmCpu.get(r.name);
      if (cpu === undefined || r.status !== 'ok') return r;
      return {
        ...r,
        vitals: [{ label: 'CPU', value: pct(cpu) }],
        statusText: `${r.statusText} · cpu ${pct(cpu)}`,
      };
    }
    default:
      return r;
  }
}
