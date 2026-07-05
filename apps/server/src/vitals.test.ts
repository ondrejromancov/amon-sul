import { describe, expect, it } from 'vitest';
import { applyVitals, emptyVitals, latestBy } from './vitals.js';
import type { CollectedResource } from './layout.js';

function res(
  type: CollectedResource['type'],
  name: string,
  statusText: string,
  status: CollectedResource['status'] = 'ok',
): CollectedResource {
  return { type, name, status, statusText, consoleLinks: [] };
}

describe('latestBy', () => {
  const series = [
    {
      resource: { labels: { bucket_name: 'photos' } },
      points: [{ value: { doubleValue: 4.2e9 } }],
    },
    {
      resource: { labels: { bucket_name: 'photos' } },
      points: [{ value: { int64Value: '1000' } }],
    },
    { resource: { labels: {} }, points: [{ value: { doubleValue: 1 } }] },
  ];
  const pick = (s: (typeof series)[number]) => s.resource?.labels?.bucket_name;

  it('takes the latest value per key, skipping unlabeled series', () => {
    const m = latestBy(series, pick);
    expect(m.get('photos')).toBe(1000);
    expect(m.size).toBe(1);
  });

  it('sums when asked (multi-series metrics like instance state)', () => {
    expect(latestBy(series, pick, 'sum').get('photos')).toBe(4.2e9 + 1000);
  });
});

describe('applyVitals', () => {
  it('upgrades SQL statusText with used/quota GB and adds vitals', () => {
    const v = emptyVitals();
    v.sqlDiskUsed.set('pg-main', 2.1e9);
    v.sqlDiskQuota.set('pg-main', 10e9);
    v.sqlMemory.set('pg-main', 0.34);
    const out = applyVitals(res('sql', 'pg-main', 'db-f1-micro · RUNNABLE'), v);
    expect(out.statusText).toBe('db-f1-micro · 2.1/10 GB');
    expect(out.vitals).toEqual([
      { label: 'Database size', value: '2.1 / 10 GB' },
      { label: 'Disk used', value: '21%' },
      { label: 'Memory', value: '34%' },
    ]);
  });

  it('prefixes Run statusText with live instance count and reports size', () => {
    const v = emptyVitals();
    v.runInstances.set('api', 2);
    const out = applyVitals(
      {
        ...res('run', 'api', 'rev api-00118 · 1d ago'),
        details: { cpuLimit: '1', memoryLimit: '512Mi' },
      },
      v,
    );
    expect(out.statusText).toBe('2 inst · rev api-00118 · 1d ago');
    expect(out.vitals).toEqual([
      { label: 'Instances now', value: '2' },
      { label: 'Instance size', value: '1 vCPU · 512Mi' },
    ]);
  });

  it('replaces storage statusText with GB and object count', () => {
    const v = emptyVitals();
    v.bucketBytes.set('uploads', 4.2e9);
    v.bucketObjects.set('uploads', 18234);
    const out = applyVitals(res('storage', 'uploads', 'eu · standard'), v);
    expect(out.statusText).toBe('4.2 GB · 18k obj');
  });

  it('appends redis memory and vm cpu, leaves unknown resources untouched', () => {
    const v = emptyVitals();
    v.redisMemory.set('cache', 0.41);
    v.vmCpu.set('box', 0.03);
    expect(applyVitals(res('redis', 'cache', '1 GB basic · READY'), v).statusText).toBe(
      '1 GB basic · READY · mem 41%',
    );
    expect(applyVitals(res('vm', 'box', 'RUNNING · e2-medium'), v).statusText).toBe(
      'RUNNING · e2-medium · cpu 3%',
    );
    // stopped VMs don't get a CPU line
    expect(
      applyVitals(res('vm', 'box', 'TERMINATED · e2-medium', 'idle'), v).vitals,
    ).toBeUndefined();
    const untouched = res('sql', 'ghost', 'db-f1-micro · RUNNABLE');
    expect(applyVitals(untouched, v)).toEqual(untouched);
  });
});
