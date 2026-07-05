import { describe, expect, it } from 'vitest';
import { estimateCost } from './estimate.js';
import { mapBucketSizes } from './bucketSizes.js';
import { rollupMonths } from './billing.js';

describe('estimateCost', () => {
  it('prices known SQL tiers and custom tiers, zero when stopped', () => {
    expect(
      estimateCost({ type: 'sql', status: 'ok', statusText: 'db-g1-small · RUNNABLE' })!.monthlyUsd,
    ).toBe(31);
    expect(
      estimateCost({ type: 'sql', status: 'ok', statusText: 'db-custom-2-7680 · RUNNABLE' })!
        .monthlyUsd,
    ).toBeCloseTo(2 * 30.1 + 7.5 * 5.1, 1);
    expect(
      estimateCost({ type: 'sql', status: 'idle', statusText: 'db-g1-small · STOPPED' })!
        .monthlyUsd,
    ).toBe(0);
    expect(
      estimateCost({ type: 'sql', status: 'ok', statusText: 'db-weird · RUNNABLE' }),
    ).toBeNull();
  });

  it('prices VMs by machine type, zero when not running', () => {
    expect(
      estimateCost({ type: 'vm', status: 'ok', statusText: 'RUNNING · e2-medium' })!.monthlyUsd,
    ).toBe(26);
    const stopped = estimateCost({
      type: 'vm',
      status: 'idle',
      statusText: 'TERMINATED · a2-highgpu-1g',
    })!;
    expect(stopped.monthlyUsd).toBe(0);
    expect(stopped.note).toContain('stopped');
  });

  it('prices redis by GB, storage by bytes, run by min instances', () => {
    expect(
      estimateCost({ type: 'redis', status: 'ok', statusText: '1 GB basic · READY' })!.monthlyUsd,
    ).toBe(36);
    expect(
      estimateCost({ type: 'storage', status: 'ok', statusText: 'eu · standard' }, 50e9)!
        .monthlyUsd,
    ).toBe(1);
    expect(
      estimateCost({ type: 'storage', status: 'ok', statusText: 'eu · nearline' }, 200e9)!
        .monthlyUsd,
    ).toBe(2);
    expect(estimateCost({ type: 'storage', status: 'ok', statusText: 'eu · standard' })).toBeNull();
    expect(
      estimateCost({
        type: 'run',
        status: 'ok',
        statusText: 'rev x · 1m ago',
        details: { minInstances: 2 },
      })!.monthlyUsd,
    ).toBe(14);
    expect(
      estimateCost({
        type: 'run',
        status: 'ok',
        statusText: 'rev x',
        details: { minInstances: 0 },
      })!.monthlyUsd,
    ).toBe(0);
  });

  it('marks everything as an estimate', () => {
    const c = estimateCost({ type: 'pubsub', status: 'ok', statusText: 'topic' })!;
    expect(c.source).toBe('estimate');
  });
});

describe('mapBucketSizes', () => {
  it('extracts bucket name to latest bytes', () => {
    const sizes = mapBucketSizes([
      {
        resource: { labels: { bucket_name: 'photos' } },
        points: [{ value: { doubleValue: 4.2e9 } }],
      },
      {
        resource: { labels: { bucket_name: 'exports' } },
        points: [{ value: { int64Value: '1000' } }],
      },
      { resource: { labels: {} }, points: [{ value: { doubleValue: 1 } }] },
    ]);
    expect(sizes.get('photos')).toBe(4.2e9);
    expect(sizes.get('exports')).toBe(1000);
    expect(sizes.size).toBe(2);
  });
});

describe('rollupMonths', () => {
  it('groups rows into sorted months with project/service breakdowns', () => {
    const months = rollupMonths([
      { month: '2026-06', projectId: 'a', service: 'Cloud Run', cost: 10.005 },
      { month: '2026-06', projectId: 'a', service: 'Cloud SQL', cost: 30 },
      { month: '2026-06', projectId: 'b', service: 'Cloud Run', cost: 5 },
      { month: '2026-05', projectId: 'a', service: 'Cloud SQL', cost: 28 },
    ]);
    expect(months.map((m) => m.month)).toEqual(['2026-05', '2026-06']);
    expect(months[1]!.totalUsd).toBeCloseTo(45.01, 2);
    expect(months[1]!.byProject).toEqual({ a: 40.01, b: 5 });
    expect(months[1]!.byService['Cloud Run']).toBeCloseTo(15.01, 2);
  });
});
