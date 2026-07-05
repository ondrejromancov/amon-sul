import type { FleetEvent } from '@amon-sul/shared';
import type { LogSeverityFilter } from './collectors/logging.js';
import { filterEvents } from './collectors/logging.js';
import type { FleetStore } from './store.js';

export const MAX_LOG_LIMIT = 200;
export const DEFAULT_LOG_LIMIT = 100;

export interface LogQuery {
  projectId: string;
  severity: LogSeverityFilter;
  resourceId?: string;
  q?: string;
  limit: number;
}

export type QueryLogs = (query: LogQuery) => Promise<FleetEvent[]>;

export type RawLogQuery = {
  project?: string;
  severity?: string;
  resource?: string;
  q?: string;
  limit?: string;
};

export function parseLogQuery(
  raw: RawLogQuery,
  configuredProjectIds: ReadonlySet<string>,
): { ok: true; query: LogQuery } | { ok: false; error: string } {
  const projectId = raw.project?.trim();
  if (!projectId) return { ok: false, error: 'project is required' };
  if (!configuredProjectIds.has(projectId)) {
    return { ok: false, error: `unknown project: ${projectId}` };
  }

  const severity = raw.severity?.trim() || 'all';
  if (severity !== 'all' && severity !== 'warn' && severity !== 'err') {
    return { ok: false, error: 'severity must be all, warn, or err' };
  }

  const limit = raw.limit === undefined || raw.limit === '' ? DEFAULT_LOG_LIMIT : Number(raw.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LOG_LIMIT) {
    return { ok: false, error: `limit must be an integer from 1 to ${MAX_LOG_LIMIT}` };
  }

  const resourceId = raw.resource?.trim() || undefined;
  const q = raw.q?.trim() || undefined;
  return { ok: true, query: { projectId, severity, resourceId, q, limit } };
}

export async function queryMockLogs(store: FleetStore, query: LogQuery): Promise<FleetEvent[]> {
  return filterEvents(
    store.getSnapshot().events.filter((event) => event.projectId === query.projectId),
    {
      severity: query.severity,
      resourceId: query.resourceId,
      q: query.q,
      limit: query.limit,
    },
  );
}
