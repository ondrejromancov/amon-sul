import { NODE_H, NODE_W } from '@amon-sul/shared';
import { describe, expect, it, vi } from 'vitest';
import { resolveProject, worstStatus, type CollectedResource } from './layout.js';
import { FleetStore } from './store.js';
import type { FleetEvent } from '@amon-sul/shared';

function res(
  type: CollectedResource['type'],
  name: string,
  status: CollectedResource['status'] = 'ok',
): CollectedResource {
  return { type, name, status, statusText: 'x', consoleLinks: [] };
}

describe('worstStatus', () => {
  it('ranks err > warn > unknown > idle > ok', () => {
    expect(worstStatus(['ok', 'idle', 'warn'])).toBe('warn');
    expect(worstStatus(['ok', 'err', 'warn'])).toBe('err');
    expect(worstStatus(['ok', 'idle'])).toBe('idle');
    expect(worstStatus(['ok', 'unknown'])).toBe('unknown');
    expect(worstStatus([])).toBe('unknown');
  });
});

describe('resolveProject', () => {
  it('converts grid pins to px and auto-places the rest deterministically', () => {
    const p = resolveProject('proj', [res('run', 'api'), res('sql', 'db'), res('pubsub', 'jobs')], {
      layout: { 'run/api': [1, 0] },
      edges: [],
    });
    const api = p.resources.find((r) => r.name === 'api')!;
    expect(api.layout).toEqual({ x: 20 + (NODE_W + 55), y: 20 });
    // db auto-places at first free cell (0,0); jobs at (0,1) — (1,0) is pinned
    const db = p.resources.find((r) => r.name === 'db')!;
    const jobs = p.resources.find((r) => r.name === 'jobs')!;
    expect(db.layout).toEqual({ x: 20, y: 20 });
    expect(jobs.layout).toEqual({ x: 20, y: 20 + NODE_H + 73 });
  });

  it('resolves edges to resource ids and drops unknown keys with a warning', () => {
    const warn = vi.fn();
    const p = resolveProject(
      'proj',
      [res('run', 'api'), res('sql', 'db')],
      {
        edges: [
          ['run/api', 'sql/db'],
          ['run/api', 'redis/ghost'],
        ],
        layout: {},
      },
      warn,
    );
    expect(p.edges).toEqual([['proj/run/api', 'proj/sql/db']]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toMatch(/redis\/ghost/);
  });

  it('computes board size from layout with a minimum', () => {
    const one = resolveProject('proj', [res('run', 'api')]);
    expect(one.board).toEqual({ w: 470, h: 230 });
    const many = resolveProject('proj', [
      res('run', 'a'),
      res('run', 'b'),
      res('run', 'c'),
      res('run', 'd'),
      res('run', 'e'),
    ]);
    // 5 resources → 3 columns (2 rows each) → maxX = 20 + 2*(200+55) = 530
    expect(many.board.w).toBe(530 + NODE_W + 20);
  });

  it('sets displayName from config and worst-of status', () => {
    const p = resolveProject('proj', [res('run', 'api', 'ok'), res('sql', 'db', 'err')], {
      name: 'Nice Name',
      edges: [],
      layout: {},
    });
    expect(p.displayName).toBe('Nice Name');
    expect(p.status).toBe('err');
  });
});

describe('FleetStore', () => {
  const ev = (id: string, ts: string): FleetEvent => ({
    id,
    severity: 'err',
    projectId: 'p',
    message: id,
    timestamp: ts,
  });

  it('dedups by id, keeps newest-first, caps, and returns fresh events', () => {
    const store = new FleetStore('mock', 3);
    const first = store.addEvents([
      ev('a', '2026-07-04T10:00:00Z'),
      ev('b', '2026-07-04T11:00:00Z'),
    ]);
    expect(first.map((e) => e.id)).toEqual(['a', 'b']);
    const second = store.addEvents([
      ev('a', '2026-07-04T10:00:00Z'),
      ev('c', '2026-07-04T09:00:00Z'),
      ev('d', '2026-07-04T12:00:00Z'),
    ]);
    expect(second.map((e) => e.id).sort()).toEqual(['c', 'd']);
    expect(store.getSnapshot().events.map((e) => e.id)).toEqual(['d', 'b', 'a']); // capped at 3, newest first
  });

  it('notifies event and snapshot listeners', () => {
    const store = new FleetStore('mock');
    const events: string[] = [];
    const snaps: number[] = [];
    store.onEvent((e) => events.push(e.id));
    store.onSnapshot((s) => snaps.push(s.projects.length));
    store.addEvents([ev('x', '2026-07-04T10:00:00Z')]);
    store.setProjects([]);
    expect(events).toEqual(['x']);
    expect(snaps).toEqual([0]);
  });
});
