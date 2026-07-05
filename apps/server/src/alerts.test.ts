import { describe, expect, it } from 'vitest';
import type { FleetEvent, Resource } from '@amon-sul/shared';
import { deriveAlerts } from './alerts.js';
import { emptyVitals } from './vitals.js';

const NOW = Date.parse('2026-07-05T12:00:00Z');

function resource(type: Resource['type'], name: string, extras: Partial<Resource> = {}): Resource {
  return {
    id: `p/${type}/${name}`,
    projectId: 'p',
    type,
    name,
    status: 'ok',
    statusText: 'x',
    consoleLinks: [],
    layout: { x: 0, y: 0 },
    ...extras,
  };
}

function err(id: string, minutesOld: number): FleetEvent {
  return {
    id,
    severity: 'err',
    projectId: 'p',
    resourceId: 'p/run/api',
    message: 'boom',
    timestamp: new Date(NOW - minutesOld * 60_000).toISOString(),
  };
}

describe('deriveAlerts', () => {
  it('flags SQL disk and memory thresholds', () => {
    const vitals = emptyVitals();
    vitals.sqlDiskUsed.set('pg', 82);
    vitals.sqlDiskQuota.set('pg', 100);
    vitals.sqlMemory.set('pg', 0.971);

    expect(deriveAlerts(resource('sql', 'pg'), vitals, [], NOW)).toEqual([
      'disk 82%',
      'memory 97%',
    ]);
  });

  it('flags redis memory and Cloud Run max scale', () => {
    const vitals = emptyVitals();
    vitals.redisMemory.set('cache', 0.86);
    vitals.runInstances.set('api', 4);

    expect(deriveAlerts(resource('redis', 'cache'), vitals, [], NOW)).toEqual(['memory 86%']);
    expect(
      deriveAlerts(resource('run', 'api', { details: { maxInstances: 4 } }), vitals, [], NOW),
    ).toEqual(['at max scale']);
    expect(
      deriveAlerts(resource('run', 'api', { details: { maxInstances: 0 } }), vitals, [], NOW),
    ).toEqual([]);
  });

  it('flags an error spike only after five recent matching err events', () => {
    const vitals = emptyVitals();
    const events = [
      err('a', 1),
      err('b', 2),
      err('c', 3),
      err('d', 4),
      err('e', 14),
      err('stale', 16),
      { ...err('other', 1), resourceId: 'p/run/other' },
      { ...err('warn', 1), severity: 'warn' as const },
    ];

    expect(deriveAlerts(resource('run', 'api'), vitals, events, NOW)).toEqual(['error spike']);
    expect(deriveAlerts(resource('run', 'other'), vitals, events, NOW)).toEqual([]);
  });
});
