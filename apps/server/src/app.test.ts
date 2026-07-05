import { describe, expect, it, vi } from 'vitest';
import { buildApp, type AppDeps } from './app.js';
import { executeAction, type ActionClients } from './actions.js';
import { FleetStore } from './store.js';
import { mockEvents, mockMetrics, mockProjects } from './mock/fixtures.js';
import type { QueryLogs } from './logs.js';

function testApp(
  options: {
    token?: string;
    queryLogs?: QueryLogs;
    projects?: string[];
    writes?: boolean;
    executeAction?: AppDeps['executeAction'];
    useRealActions?: boolean;
  } = {},
) {
  const store = new FleetStore('mock');
  store.setProjects(mockProjects());
  store.addEvents(mockEvents());
  const projectIds = options.projects ?? store.getSnapshot().projects.map((project) => project.id);
  const app = buildApp({
    store,
    token: options.token,
    writes: options.writes,
    projects: projectIds,
    queryLogs: options.queryLogs,
    executeAction:
      options.executeAction ?? (options.useRealActions ? routeExecutor(store) : undefined),
    metrics: async (id) => {
      const resource = store
        .getSnapshot()
        .projects.flatMap((p) => p.resources)
        .find((r) => r.id === id);
      return resource ? mockMetrics(resource) : null;
    },
  });
  return { app, store };
}

function routeExecutor(store: FleetStore): NonNullable<AppDeps['executeAction']> {
  return (body) => executeAction(store, {} as Parameters<typeof executeAction>[1], body, clients());
}

function clients(): ActionClients {
  return {
    compute: {
      instances: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
      },
    },
    run: {
      projects: {
        locations: {
          services: {
            get: vi.fn(async () => ({ data: { template: {} } })),
            patch: vi.fn(async () => undefined),
          },
        },
      },
    },
    scheduler: {
      projects: {
        locations: {
          jobs: {
            pause: vi.fn(async () => undefined),
            resume: vi.fn(async () => undefined),
          },
        },
      },
    },
  };
}

describe('app', () => {
  it('serves the snapshot', async () => {
    const { app } = testApp();
    const res = await app.inject({ url: '/api/snapshot' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('mock');
    expect(body.projects).toHaveLength(4);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('reports write capabilities from the feature flag', async () => {
    const off = testApp();
    const offRes = await off.app.inject({ url: '/api/capabilities' });
    expect(offRes.statusCode).toBe(200);
    expect(offRes.json()).toEqual({ writes: false });

    const on = testApp({ writes: true });
    const onRes = await on.app.inject({ url: '/api/capabilities' });
    expect(onRes.statusCode).toBe(200);
    expect(onRes.json()).toEqual({ writes: true });
  });

  it('rejects write actions when writes are disabled', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, message: 'should not run' }));
    const { app } = testApp({ executeAction: execute });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload: { action: 'vm.start', resourceId: 'ml-lab/vm/gpu-box' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'write actions disabled' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('maps action validation errors to 400', async () => {
    const { app } = testApp({ writes: true, useRealActions: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload: { action: 'vm.reboot', resourceId: 'ml-lab/vm/gpu-box' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('unknown action');
  });

  it('maps unknown action resources to 404', async () => {
    const { app } = testApp({ writes: true, useRealActions: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload: { action: 'vm.start', resourceId: 'ml-lab/vm/missing' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'unknown resource: ml-lab/vm/missing' });
  });

  it('validates Cloud Run minInstances params', async () => {
    const { app } = testApp({ writes: true, useRealActions: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload: {
        action: 'run.setMinInstances',
        resourceId: 'rankforge-prod/run/api',
        params: { minInstances: 101 },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('integer minInstances 0-100');
  });

  it('executes write actions through the injected executor', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      message: 'start requested for gpu-box',
    }));
    const { app } = testApp({ writes: true, executeAction: execute });
    const payload = { action: 'vm.start', resourceId: 'ml-lab/vm/gpu-box' };
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions',
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, message: 'start requested for gpu-box' });
    expect(execute).toHaveBeenCalledWith(payload);
  });

  it('serves metrics for a known resource and 404s unknown', async () => {
    const { app } = testApp();
    const ok = await app.inject({ url: '/api/metrics?resource=rankforge-prod/run/api' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()[0].points).toHaveLength(60);
    const missing = await app.inject({ url: '/api/metrics?resource=nope/run/x' });
    expect(missing.statusCode).toBe(404);
  });

  it('reports health with mode and lastPollAt', async () => {
    const { app } = testApp();
    const res = await app.inject({ url: '/healthz' });
    expect(res.json()).toMatchObject({ ok: true, mode: 'mock' });
  });

  it('serves logs through the injected queryLogs dependency', async () => {
    const entries = mockEvents().slice(0, 1);
    const queryLogs = vi.fn<QueryLogs>(async () => entries);
    const { app } = testApp({ queryLogs });
    const res = await app.inject({
      url: '/api/logs?project=rankforge-prod&severity=err&resource=rankforge-prod/run/crawl-worker&q=pool&limit=2',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ entries });
    expect(queryLogs).toHaveBeenCalledWith({
      projectId: 'rankforge-prod',
      severity: 'err',
      resourceId: 'rankforge-prod/run/crawl-worker',
      q: 'pool',
      limit: 2,
    });
  });

  it('rejects logs for unknown projects', async () => {
    const queryLogs = vi.fn<QueryLogs>(async () => []);
    const { app } = testApp({ queryLogs });
    const res = await app.inject({ url: '/api/logs?project=ghost' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'unknown project: ghost' });
    expect(queryLogs).not.toHaveBeenCalled();
  });

  it('leaves routes open when no token is configured', async () => {
    const { app } = testApp();
    const res = await app.inject({ url: '/api/snapshot' });
    expect(res.statusCode).toBe(200);
  });

  it('protects API routes when a token is configured', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({ url: '/api/snapshot' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('accepts a bearer token', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({
      url: '/api/snapshot',
      headers: { authorization: 'Bearer secret' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects).toHaveLength(4);
  });

  it('accepts a token cookie', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({
      url: '/api/snapshot',
      headers: { cookie: 'amon_sul_token=secret' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects).toHaveLength(4);
  });

  it('sets the token cookie from a valid query token', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({ url: '/api/snapshot?token=secret' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toContain('amon_sul_token=secret');
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect(res.headers['set-cookie']).toContain('SameSite=Lax');
  });

  it('redirects HTML navigations after setting the token cookie', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({
      url: '/dashboard?token=secret&view=costs',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/dashboard?view=costs');
    expect(res.headers['set-cookie']).toContain('amon_sul_token=secret');
  });

  it('keeps health open when a token is configured', async () => {
    const { app } = testApp({ token: 'secret' });
    const res = await app.inject({ url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: 'mock' });
  });

  it('protects logs when a token is configured', async () => {
    const queryLogs = vi.fn<QueryLogs>(async () => []);
    const { app } = testApp({ token: 'secret', queryLogs });

    const denied = await app.inject({ url: '/api/logs?project=rankforge-prod' });
    expect(denied.statusCode).toBe(401);
    expect(queryLogs).not.toHaveBeenCalled();

    const allowed = await app.inject({
      url: '/api/logs?project=rankforge-prod',
      headers: { authorization: 'Bearer secret' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(queryLogs).toHaveBeenCalledOnce();
  });

  it('protects write routes when a token is configured', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      message: 'start requested for gpu-box',
    }));
    const { app } = testApp({ token: 'secret', writes: true, executeAction: execute });
    const payload = { action: 'vm.start', resourceId: 'ml-lab/vm/gpu-box' };

    const denied = await app.inject({ method: 'POST', url: '/api/actions', payload });
    expect(denied.statusCode).toBe(401);
    expect(execute).not.toHaveBeenCalled();

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/actions',
      headers: { authorization: 'Bearer secret' },
      payload,
    });
    expect(allowed.statusCode).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
  });
});
