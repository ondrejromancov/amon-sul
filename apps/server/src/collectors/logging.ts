import { createHash } from 'node:crypto';
import { google, type logging_v2 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { FleetEvent, Severity } from '@amon-sul/shared';
import { isApiDisabled } from './types.js';

const MAX_MESSAGE = 300;

function severityOf(entry: logging_v2.Schema$LogEntry): Severity {
  const s = entry.severity ?? 'DEFAULT';
  if (s === 'WARNING') return 'warn';
  if (s === 'ERROR' || s === 'CRITICAL' || s === 'ALERT' || s === 'EMERGENCY') return 'err';
  return 'info';
}

function messageOf(entry: logging_v2.Schema$LogEntry): string {
  const payload = entry.jsonPayload as { message?: unknown } | undefined;
  const msg =
    entry.textPayload ??
    (typeof payload?.message === 'string' ? payload.message : undefined) ??
    JSON.stringify(entry.jsonPayload ?? entry.protoPayload ?? '');
  const oneLine = String(msg).replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_MESSAGE ? `${oneLine.slice(0, MAX_MESSAGE)}…` : oneLine;
}

/**
 * Map a log entry's monitored-resource labels to one of our resource ids.
 * Only mappings with a stable name label are attempted.
 */
export function matchResourceId(
  entry: logging_v2.Schema$LogEntry,
  projectId: string,
  knownIds: ReadonlySet<string>,
): string | undefined {
  const type = entry.resource?.type;
  const labels = entry.resource?.labels ?? {};
  let candidate: string | undefined;
  if (type === 'cloud_run_revision' || type === 'cloud_run_job') {
    candidate = `${projectId}/run/${labels.service_name}`;
  } else if (type === 'cloudsql_database') {
    // database_id is "project:instance"
    candidate = `${projectId}/sql/${(labels.database_id ?? '').split(':')[1]}`;
  } else if (type === 'pubsub_topic') {
    candidate = `${projectId}/pubsub/${(labels.topic_id ?? '').split('/').pop()}`;
  } else if (type === 'gcs_bucket') {
    candidate = `${projectId}/storage/${labels.bucket_name}`;
  } else if (type === 'cloud_scheduler_job') {
    candidate = `${projectId}/scheduler/${labels.job_id}`;
  } else if (type === 'redis_instance') {
    candidate = `${projectId}/redis/${labels.instance_id?.split('/').pop()}`;
  }
  return candidate && knownIds.has(candidate) ? candidate : undefined;
}

export function mapEntries(
  entries: logging_v2.Schema$LogEntry[],
  projectId: string,
  knownIds: ReadonlySet<string>,
): FleetEvent[] {
  return entries
    .filter((e) => e.timestamp)
    .map((e) => ({
      id: createHash('sha256')
        .update(`${projectId}:${e.insertId ?? ''}:${e.timestamp}`)
        .digest('hex')
        .slice(0, 16),
      severity: severityOf(e),
      projectId,
      resourceId: matchResourceId(e, projectId, knownIds),
      message: messageOf(e),
      timestamp: new Date(e.timestamp!).toISOString(),
    }));
}

export async function collectEvents(
  projectId: string,
  auth: GoogleAuth,
  opts: { lookbackHours: number; maxEntries: number; sinceIso?: string },
  knownIds: ReadonlySet<string>,
): Promise<FleetEvent[]> {
  const client = google.logging({ version: 'v2', auth });
  const since =
    opts.sinceIso ?? new Date(Date.now() - opts.lookbackHours * 3_600_000).toISOString();
  const filter = [
    'severity>=WARNING',
    `timestamp>="${since}"`,
    // Ignore noisy audit logs; the rail is about workload health.
    'NOT logName:"cloudaudit.googleapis.com"',
  ].join(' AND ');
  try {
    const res = await client.entries.list({
      requestBody: {
        resourceNames: [`projects/${projectId}`],
        filter,
        orderBy: 'timestamp desc',
        pageSize: opts.maxEntries,
      },
    });
    return mapEntries(res.data.entries ?? [], projectId, knownIds);
  } catch (e) {
    if (isApiDisabled(e)) return [];
    throw e;
  }
}
