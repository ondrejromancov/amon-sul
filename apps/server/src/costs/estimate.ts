import type { ResourceCost } from '@amon-sul/shared';
import type { CollectedResource } from '../layout.js';

/**
 * Rough monthly list-price estimates (USD, ~730h months, eu/us blended).
 * Deliberately conservative and clearly labeled 'estimate' — the accurate
 * path is a BigQuery billing export (see docs). Prices as of mid-2026.
 */

const SQL_TIER_USD: Record<string, number> = {
  'db-f1-micro': 9.4,
  'db-g1-small': 31,
  'db-n1-standard-1': 66,
  'db-n1-standard-2': 132,
};

const VM_TYPE_USD: Record<string, number> = {
  'e2-micro': 6.5,
  'e2-small': 13,
  'e2-medium': 26,
  'e2-standard-2': 52,
  'e2-standard-4': 104,
  'n1-standard-1': 25,
  'n1-standard-2': 50,
  'n2-standard-2': 63,
  'n2-standard-4': 126,
  'a2-highgpu-1g': 2700,
};

const RUN_IDLE_INSTANCE_USD = 7; // ~512Mi min-instance kept warm
const REDIS_BASIC_GB_USD = 36;
const GCS_STANDARD_GB_USD = 0.02;
const GCS_COLD_GB_USD = 0.01;

function est(monthlyUsd: number, note: string): ResourceCost {
  return { monthlyUsd: Math.round(monthlyUsd * 100) / 100, source: 'estimate', note };
}

/** Parse "db-custom-<vcpus>-<ramMb>" tiers. */
function customSqlUsd(tier: string): number | null {
  const m = /^db-custom-(\d+)-(\d+)$/.exec(tier);
  if (!m) return null;
  const vcpus = Number(m[1]);
  const ramGb = Number(m[2]) / 1024;
  return vcpus * 30.1 + ramGb * 5.1;
}

/**
 * Estimate the monthly cost of a discovered resource. `bucketBytes` feeds
 * storage estimates (from Cloud Monitoring). Returns null when no sensible
 * estimate exists.
 */
export function estimateCost(
  resource: Pick<CollectedResource, 'type' | 'status' | 'statusText' | 'details'>,
  bucketBytes?: number,
): ResourceCost | null {
  switch (resource.type) {
    case 'sql': {
      const tier = resource.statusText.split('·')[0]?.trim() ?? '';
      if (resource.status === 'idle') return est(0, `${tier} stopped — storage still billed`);
      const usd = SQL_TIER_USD[tier] ?? customSqlUsd(tier);
      if (usd === null || usd === undefined) return null;
      return est(usd, `${tier} · compute only, excludes disk`);
    }
    case 'vm': {
      // statusText: "RUNNING · e2-medium"
      const machine = resource.statusText.split('·')[1]?.trim() ?? '';
      if (resource.status !== 'ok') return est(0, `${machine} stopped — disk still billed`);
      const usd = VM_TYPE_USD[machine];
      if (usd === undefined) return null;
      return est(usd, `${machine} · compute only, excludes disk`);
    }
    case 'redis': {
      // statusText: "1 GB basic · READY"
      const m = /([\d.]+)\s*GB/i.exec(resource.statusText);
      if (!m) return null;
      const gb = Number(m[1]);
      const standard = /standard/i.test(resource.statusText);
      return est(gb * (standard ? 55 : REDIS_BASIC_GB_USD), `${gb} GB memorystore`);
    }
    case 'storage': {
      if (bucketBytes === undefined) return null;
      const gb = bucketBytes / 1e9;
      const cold = /nearline|coldline|archive/i.test(resource.statusText);
      return est(
        gb * (cold ? GCS_COLD_GB_USD : GCS_STANDARD_GB_USD),
        `${gb >= 1 ? gb.toFixed(1) : gb.toFixed(2)} GB stored, excludes egress`,
      );
    }
    case 'run': {
      const min = resource.details?.minInstances ?? 0;
      if (min === 0) return est(0, 'scales to zero — request costs usually free tier');
      return est(min * RUN_IDLE_INSTANCE_USD, `${min} min instance(s) kept warm`);
    }
    case 'pubsub':
    case 'scheduler':
      return est(0, 'free tier at this scale');
  }
}
