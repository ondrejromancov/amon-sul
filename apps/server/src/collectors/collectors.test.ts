import { describe, expect, it } from 'vitest';
import { mapRunServices } from './run.js';
import { mapSqlInstances } from './sql.js';
import { mapTopics } from './pubsub.js';
import { mapBuckets } from './storage.js';
import { mapJobs } from './scheduler.js';
import { mapRedisInstances } from './redis.js';
import { mapInstances } from './vm.js';
import { mapEntries, matchResourceId } from './logging.js';
import { mapTimeSeries } from './monitoring.js';
import { isApiDisabled, timeAgo } from './types.js';

const NOW = Date.parse('2026-07-04T12:00:00Z');

describe('run mapper', () => {
  it('maps a ready service to ok with revision + age', () => {
    const [r] = mapRunServices(
      [
        {
          name: 'projects/p/locations/europe-west1/services/api',
          latestReadyRevision: 'projects/p/locations/europe-west1/services/api/revisions/api-00092',
          updateTime: '2026-07-04T11:58:00Z',
          terminalCondition: { state: 'CONDITION_SUCCEEDED' },
        },
      ],
      'p',
      NOW,
    );
    expect(r).toMatchObject({
      type: 'run',
      name: 'api',
      region: 'europe-west1',
      status: 'ok',
      statusText: 'rev api-00092 · 2m ago',
    });
    expect(r!.consoleLinks.map((l) => l.label)).toEqual(['service', 'logs', 'revisions']);
  });

  it('maps a failing service to err', () => {
    const [r] = mapRunServices(
      [
        {
          name: 'projects/p/locations/europe-west1/services/api',
          terminalCondition: { state: 'CONDITION_FAILED' },
        },
      ],
      'p',
      NOW,
    );
    expect(r!.status).toBe('err');
    expect(r!.statusText).toBe('no ready revision');
  });
});

describe('sql mapper', () => {
  it('maps states to ok/idle/err', () => {
    const rows = mapSqlInstances(
      [
        { name: 'a', state: 'RUNNABLE', region: 'europe-west1', settings: { tier: 'db-g1-small' } },
        { name: 'b', state: 'STOPPED' },
        { name: 'c', state: 'MAINTENANCE' },
      ],
      'p',
    );
    expect(rows.map((r) => r.status)).toEqual(['ok', 'idle', 'err']);
    expect(rows[0]!.statusText).toBe('db-g1-small · RUNNABLE');
  });
});

describe('pubsub/storage mappers', () => {
  it('maps topics and buckets to ok resources', () => {
    expect(mapTopics([{ name: 'projects/p/topics/jobs' }], 'p')[0]).toMatchObject({
      type: 'pubsub',
      name: 'jobs',
      status: 'ok',
    });
    expect(
      mapBuckets([{ name: 'exports', location: 'EU', storageClass: 'NEARLINE' }], 'p')[0],
    ).toMatchObject({ type: 'storage', name: 'exports', statusText: 'eu · nearline' });
  });
});

describe('scheduler mapper', () => {
  it('derives ok/err/idle from state and last attempt', () => {
    const rows = mapJobs(
      [
        {
          name: 'projects/p/locations/europe-west1/jobs/nightly',
          schedule: '0 2 * * *',
          state: 'ENABLED',
          lastAttemptTime: '2026-07-04T02:00:00Z',
        },
        {
          name: 'projects/p/locations/europe-west1/jobs/broken',
          schedule: '* * * * *',
          state: 'ENABLED',
          status: { code: 2 },
        },
        { name: 'projects/p/locations/europe-west1/jobs/paused', state: 'PAUSED' },
      ],
      'p',
    );
    expect(rows.map((r) => r.status)).toEqual(['ok', 'err', 'idle']);
    expect(rows[0]!.statusText).toBe('0 2 * * * · last OK');
  });
});

describe('redis/vm mappers', () => {
  it('maps redis states and strips zone suffix from location', () => {
    const [r] = mapRedisInstances(
      [
        {
          name: 'projects/p/locations/europe-west3/instances/pb-cache',
          state: 'READY',
          tier: 'BASIC',
          memorySizeGb: 1,
          locationId: 'europe-west3-a',
        },
      ],
      'p',
    );
    expect(r).toMatchObject({ name: 'pb-cache', region: 'europe-west3', status: 'ok' });
  });

  it('maps vm statuses to ok/idle/warn', () => {
    const rows = mapInstances(
      [
        {
          name: 'gpu-box',
          status: 'TERMINATED',
          zone: 'https://compute/zones/europe-west4-b',
          machineType: 'https://compute/machineTypes/a2-highgpu-1g',
        },
        { name: 'web', status: 'RUNNING' },
        { name: 'mid', status: 'STAGING' },
      ],
      'p',
    );
    expect(rows.map((r) => r.status)).toEqual(['idle', 'ok', 'warn']);
    expect(rows[0]!.statusText).toBe('TERMINATED · a2-highgpu-1g');
    expect(rows[0]!.consoleLinks[0]!.url).toContain('/zones/europe-west4-b/instances/gpu-box');
  });
});

describe('logging mapper', () => {
  const known = new Set(['p/run/api', 'p/sql/db']);

  it('maps severity, truncates messages, matches cloud run resources', () => {
    const events = mapEntries(
      [
        {
          insertId: 'i1',
          timestamp: '2026-07-04T11:59:00Z',
          severity: 'ERROR',
          textPayload: 'x'.repeat(400),
          resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
        },
        {
          insertId: 'i2',
          timestamp: '2026-07-04T11:58:00Z',
          severity: 'WARNING',
          jsonPayload: { message: 'disk almost full' },
          resource: { type: 'cloudsql_database', labels: { database_id: 'p:db' } },
        },
      ],
      'p',
      known,
    );
    expect(events[0]).toMatchObject({ severity: 'err', resourceId: 'p/run/api' });
    expect(events[0]!.message.length).toBeLessThanOrEqual(301);
    expect(events[1]).toMatchObject({
      severity: 'warn',
      resourceId: 'p/sql/db',
      message: 'disk almost full',
    });
    expect(events[0]!.id).not.toBe(events[1]!.id);
  });

  it('leaves resourceId undefined for unknown resources', () => {
    const id = matchResourceId(
      { resource: { type: 'cloud_run_revision', labels: { service_name: 'ghost' } } },
      'p',
      known,
    );
    expect(id).toBeUndefined();
  });
});

describe('monitoring mapper', () => {
  it('flattens and sorts points, empty when no series', () => {
    const series = mapTimeSeries(
      [
        {
          points: [
            { interval: { endTime: '2026-07-04T11:59:00Z' }, value: { doubleValue: 2.5 } },
            { interval: { endTime: '2026-07-04T11:58:00Z' }, value: { int64Value: '4' } },
          ],
        },
      ],
      'requests · 1h',
    );
    expect(series[0]!.points.map((p) => p.v)).toEqual([4, 2.5]);
    expect(mapTimeSeries([], 'x')).toEqual([]);
  });
});

describe('helpers', () => {
  it('timeAgo formats minutes/hours/days', () => {
    expect(timeAgo('2026-07-04T11:58:00Z', NOW)).toBe('2m ago');
    expect(timeAgo('2026-07-04T09:00:00Z', NOW)).toBe('3h ago');
    expect(timeAgo('2026-07-01T09:00:00Z', NOW)).toBe('3d ago');
    expect(timeAgo(new Date(NOW - 5000).toISOString(), NOW)).toBe('just now');
  });

  it('isApiDisabled only matches service-disabled 403s', () => {
    expect(
      isApiDisabled({ code: 403, message: 'Cloud Run Admin API has not been used in project x' }),
    ).toBe(true);
    expect(isApiDisabled({ code: 403, message: 'Permission denied' })).toBe(false);
    expect(isApiDisabled({ code: 500, message: 'boom' })).toBe(false);
  });
});
