import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { FleetStore } from './store.js';
import { mockEvents, mockMetrics, mockProjects } from './mock/fixtures.js';

function testApp(options: { token?: string } = {}) {
  const store = new FleetStore('mock');
  store.setProjects(mockProjects());
  store.addEvents(mockEvents());
  const app = buildApp({
    store,
    token: options.token,
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
});
