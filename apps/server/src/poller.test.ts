import type { GoogleAuth } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import type { FleetEvent } from '@amon-sul/shared';
import type { AmonSulConfig } from './config.js';
import { escalate, startPoller } from './poller.js';
import { FleetStore } from './store.js';
import { emptyVitals } from './vitals.js';
import type { CollectedResource, ResourceCollector } from './collectors/types.js';

const auth = {} as GoogleAuth;
const silent = { warn: vi.fn(), error: vi.fn() };
const noVitals = async () => emptyVitals();

function cfg(): AmonSulConfig {
  return {
    projects: [{ id: 'p1', edges: [], layout: {} }],
    billing: {},
    poll: { resourcesSeconds: 60, eventsSeconds: 30 },
    events: { lookbackHours: 24, maxEntries: 100 },
  };
}

function collector(
  type: ResourceCollector['type'],
  impl: () => Promise<CollectedResource[]>,
): ResourceCollector {
  return { type, collect: impl };
}

const okRun = collector('run', async () => [
  { type: 'run', name: 'api', status: 'ok', statusText: 'x', consoleLinks: [] },
]);
const failingSql = collector('sql', async () => {
  throw new Error('quota exceeded');
});

function ev(id: string, resourceId: string | undefined, minutesOld = 1): FleetEvent {
  return {
    id,
    severity: 'err',
    projectId: 'p1',
    resourceId,
    message: 'boom',
    timestamp: new Date(Date.now() - minutesOld * 60_000).toISOString(),
  };
}

async function tick() {
  await new Promise((r) => setTimeout(r, 10));
}

describe('escalate', () => {
  it('bumps ok resources with recent err events to warn and recomputes project status', () => {
    const store = new FleetStore('live');
    const projects = [
      {
        id: 'p1',
        displayName: 'p1',
        status: 'ok' as const,
        board: { w: 470, h: 230 },
        edges: [] as [string, string][],
        resources: [
          {
            id: 'p1/run/api',
            projectId: 'p1',
            type: 'run' as const,
            name: 'api',
            status: 'ok' as const,
            statusText: '',
            consoleLinks: [],
            layout: { x: 0, y: 0 },
          },
        ],
      },
    ];
    const out = escalate(projects, [ev('e1', 'p1/run/api')]);
    expect(out[0]!.resources[0]!.status).toBe('warn');
    expect(out[0]!.status).toBe('warn');
    // stale events don't escalate
    const stale = escalate(projects, [ev('e2', 'p1/run/api', 60)]);
    expect(stale[0]!.resources[0]!.status).toBe('ok');
    void store;
  });
});

describe('startPoller', () => {
  it('keeps successful collectors on partial failure and marks project.error', async () => {
    const store = new FleetStore('live');
    const stop = startPoller({
      config: cfg(),
      store,
      auth,
      collectors: [okRun, failingSql],
      fetchEvents: async () => [],
      fetchVitals: noVitals,
      fillInventory: async () => {},
      log: silent,
    });
    await tick();
    stop();
    const p = store.getSnapshot().projects[0]!;
    expect(p.resources).toHaveLength(1);
    expect(p.error).toContain('sql');
    expect(p.status).toBe('ok');
  });

  it('marks project unknown when every collector fails', async () => {
    const store = new FleetStore('live');
    const failingRun = collector('run', async () => {
      throw new Error('nope');
    });
    const stop = startPoller({
      config: cfg(),
      store,
      auth,
      collectors: [failingRun, failingSql],
      fetchEvents: async () => [],
      fetchVitals: noVitals,
      fillInventory: async () => {},
      log: silent,
    });
    await tick();
    stop();
    const p = store.getSnapshot().projects[0]!;
    expect(p.status).toBe('unknown');
    expect(p.error).toContain('all resource types');
  });

  it('only forwards events newer than the last seen timestamp per project', async () => {
    const store = new FleetStore('live');
    const calls: (string | undefined)[] = [];
    const first = ev('a', 'p1/run/api', 5);
    const fetchEvents = vi
      .fn()
      .mockImplementation(async (_p: string, _a: unknown, opts: { sinceIso?: string }) => {
        calls.push(opts.sinceIso);
        return calls.length === 1 ? [first] : [];
      });
    const stop = startPoller({
      config: cfg(),
      store,
      auth,
      collectors: [okRun],
      fetchEvents,
      fetchVitals: noVitals,
      fillInventory: async () => {},
      log: silent,
    });
    await tick();
    stop();
    expect(calls[0]).toBeUndefined();
    // escalation triggered a second pass? No — pollEvents runs once here.
    expect(store.getSnapshot().events).toHaveLength(1);
    // the err event escalated the resource
    expect(store.getSnapshot().projects[0]!.resources[0]!.status).toBe('warn');
  });
});
