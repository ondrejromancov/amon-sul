import { google, type monitoring_v3 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import { isApiDisabled } from '../collectors/types.js';

/** Extract bucket_name → latest total_bytes from a Monitoring response. */
export function mapBucketSizes(series: monitoring_v3.Schema$TimeSeries[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const s of series) {
    const bucket = s.resource?.labels?.bucket_name;
    const latest = s.points?.[0]?.value;
    if (!bucket || !latest) continue;
    sizes.set(bucket, Number(latest.doubleValue ?? latest.int64Value ?? 0));
  }
  return sizes;
}

/**
 * One Monitoring call per project: total stored bytes per bucket over the
 * last 2h (the metric is written every few hours). Empty map on failure —
 * storage estimates simply drop out rather than failing the poll.
 */
export async function fetchBucketSizes(
  projectId: string,
  auth: GoogleAuth,
): Promise<Map<string, number>> {
  const client = google.monitoring({ version: 'v3', auth });
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 3_600_000);
  try {
    const res = await client.projects.timeSeries.list({
      name: `projects/${projectId}`,
      filter: 'metric.type="storage.googleapis.com/storage/v2/total_bytes"',
      'interval.startTime': start.toISOString(),
      'interval.endTime': end.toISOString(),
      'aggregation.alignmentPeriod': '3600s',
      'aggregation.perSeriesAligner': 'ALIGN_MEAN',
    });
    return mapBucketSizes(res.data.timeSeries ?? []);
  } catch (e) {
    if (!isApiDisabled(e)) {
      console.warn(`[${projectId}] bucket sizes unavailable: ${(e as Error).message}`);
    }
    return new Map();
  }
}
