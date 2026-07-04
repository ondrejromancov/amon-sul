import { google, type monitoring_v3 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { MetricSeries, Resource } from '@amon-sul/shared';
import { isApiDisabled } from './types.js';

interface MetricSpec {
  label: string;
  filter: (r: Resource) => string;
  aligner: 'ALIGN_RATE' | 'ALIGN_MEAN';
}

const SPECS: Partial<Record<Resource['type'], MetricSpec>> = {
  run: {
    label: 'requests · 1h',
    filter: (r) =>
      `metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="${r.name}"`,
    aligner: 'ALIGN_RATE',
  },
  sql: {
    label: 'connections · 1h',
    filter: (r) =>
      `metric.type="cloudsql.googleapis.com/database/network/connections" AND resource.labels.database_id="${r.projectId}:${r.name}"`,
    aligner: 'ALIGN_MEAN',
  },
};

export function mapTimeSeries(
  series: monitoring_v3.Schema$TimeSeries[],
  label: string,
): MetricSeries[] {
  const points = series
    .flatMap((s) => s.points ?? [])
    .filter((p) => p.interval?.endTime)
    .map((p) => ({
      t: new Date(p.interval!.endTime!).toISOString(),
      v: Number(p.value?.doubleValue ?? p.value?.int64Value ?? 0),
    }))
    .sort((a, b) => a.t.localeCompare(b.t));
  return points.length ? [{ label, points }] : [];
}

/** Fetch the drawer sparkline series for a resource; [] when the type has no metric. */
export async function liveMetrics(resource: Resource, auth: GoogleAuth): Promise<MetricSeries[]> {
  const spec = SPECS[resource.type];
  if (!spec) return [];
  const client = google.monitoring({ version: 'v3', auth });
  const end = new Date();
  const start = new Date(end.getTime() - 3_600_000);
  try {
    const res = await client.projects.timeSeries.list({
      name: `projects/${resource.projectId}`,
      filter: spec.filter(resource),
      'interval.startTime': start.toISOString(),
      'interval.endTime': end.toISOString(),
      'aggregation.alignmentPeriod': '60s',
      'aggregation.perSeriesAligner': spec.aligner,
      'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    });
    return mapTimeSeries(res.data.timeSeries ?? [], spec.label);
  } catch (e) {
    if (isApiDisabled(e)) return [];
    throw e;
  }
}
