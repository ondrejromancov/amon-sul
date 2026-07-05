import { google } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { BillingMonth } from '@amon-sul/shared';

/**
 * Actual spend from a standard-usage BigQuery billing export
 * (gcp_billing_export_v1_*). Monthly rollup per project and service,
 * credits included, last 6 invoice months.
 */

export interface BillingRow {
  month: string;
  projectId: string;
  service: string;
  cost: number;
}

export function rollupMonths(rows: BillingRow[]): BillingMonth[] {
  const byMonth = new Map<string, BillingMonth>();
  for (const r of rows) {
    let m = byMonth.get(r.month);
    if (!m) {
      m = { month: r.month, byProject: {}, byService: {}, totalUsd: 0 };
      byMonth.set(r.month, m);
    }
    m.byProject[r.projectId] = (m.byProject[r.projectId] ?? 0) + r.cost;
    m.byService[r.service] = (m.byService[r.service] ?? 0) + r.cost;
    m.totalUsd += r.cost;
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.totalUsd = round2(m.totalUsd);
    for (const k of Object.keys(m.byProject)) m.byProject[k] = round2(m.byProject[k]!);
    for (const k of Object.keys(m.byService)) m.byService[k] = round2(m.byService[k]!);
  }
  return months;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `table` is `project.dataset.table`; the query runs in the table's project. */
export async function fetchBillingMonths(table: string, auth: GoogleAuth): Promise<BillingMonth[]> {
  const [queryProject] = table.split('.');
  if (!queryProject) throw new Error(`invalid billing table: ${table}`);
  const client = google.bigquery({ version: 'v2', auth });
  const query = `
    SELECT
      FORMAT_DATE('%Y-%m', PARSE_DATE('%Y%m', invoice.month)) AS month,
      project.id AS project_id,
      service.description AS service,
      SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS cost
    FROM \`${table}\`
    WHERE PARSE_DATE('%Y%m', invoice.month)
      >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 5 MONTH)
    GROUP BY month, project_id, service
    HAVING cost > 0.005
    ORDER BY month`;
  const res = await client.jobs.query({
    projectId: queryProject,
    requestBody: { query, useLegacySql: false, timeoutMs: 30_000 },
  });
  const rows: BillingRow[] = (res.data.rows ?? []).map((r) => ({
    month: String(r.f?.[0]?.v ?? ''),
    projectId: String(r.f?.[1]?.v ?? 'unknown'),
    service: String(r.f?.[2]?.v ?? 'unknown'),
    cost: Number(r.f?.[3]?.v ?? 0),
  }));
  return rollupMonths(rows);
}
