import { describe, expect, it, vi } from 'vitest';
import { FleetStore } from '../store.js';
import { startMockFeed } from './feed.js';
import { mockEvents, mockMetrics, mockProjects } from './fixtures.js';

describe('mockProjects', () => {
  it('produces 4 valid projects with well-formed ids and resolvable edges', () => {
    const projects = mockProjects();
    expect(projects.map((p) => p.displayName)).toEqual([
      'Rankforge',
      'Pulseboard',
      'Ledgerlite',
      'ML Lab',
    ]);
    for (const p of projects) {
      const ids = new Set(p.resources.map((r) => r.id));
      for (const r of p.resources) {
        expect(r.id).toBe(`${p.id}/${r.type}/${r.name}`);
        expect(r.layout.x).toBeGreaterThanOrEqual(0);
        expect(r.layout.y).toBeGreaterThanOrEqual(0);
      }
      for (const [a, b] of p.edges) {
        expect(ids.has(a)).toBe(true);
        expect(ids.has(b)).toBe(true);
      }
      expect(p.board.w).toBeGreaterThanOrEqual(470);
    }
  });

  it('derives project statuses from resources', () => {
    const byId = Object.fromEntries(mockProjects().map((p) => [p.id, p.status]));
    expect(byId['rankforge-prod']).toBe('warn');
    expect(byId['pulseboard-prod']).toBe('ok');
    expect(byId['ledgerlite-staging']).toBe('err');
    expect(byId['ml-lab']).toBe('idle');
  });
});

describe('mockEvents', () => {
  it('references existing resources', () => {
    const resourceIds = new Set(mockProjects().flatMap((p) => p.resources.map((r) => r.id)));
    for (const e of mockEvents()) {
      expect(resourceIds.has(e.resourceId!)).toBe(true);
    }
  });
});

describe('mockMetrics', () => {
  it('returns a 60-point series for run/sql and nothing for others', () => {
    expect(mockMetrics({ type: 'run', status: 'ok' })[0]!.points).toHaveLength(60);
    expect(mockMetrics({ type: 'sql', status: 'ok' })[0]!.label).toBe('connections · 1h');
    expect(mockMetrics({ type: 'storage', status: 'ok' })).toEqual([]);
  });

  it('flatlines idle resources', () => {
    const pts = mockMetrics({ type: 'run', status: 'idle' })[0]!.points;
    expect(new Set(pts.map((p) => p.v)).size).toBe(1);
  });
});

describe('startMockFeed', () => {
  it('pushes a canned event per interval until stopped', () => {
    vi.useFakeTimers();
    const store = new FleetStore('mock');
    const stop = startMockFeed(store, 1000);
    vi.advanceTimersByTime(3000);
    expect(store.getSnapshot().events).toHaveLength(3);
    stop();
    vi.advanceTimersByTime(3000);
    expect(store.getSnapshot().events).toHaveLength(3);
    vi.useRealTimers();
  });
});
