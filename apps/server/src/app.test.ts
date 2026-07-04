import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { FleetStore } from './store.js';
import { mockEvents, mockMetrics, mockProjects } from './mock/fixtures.js';

function testApp() {
  const store = new FleetStore('mock');
  store.setProjects(mockProjects());
  store.addEvents(mockEvents());
  const app = buildApp({
    store,
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
});
