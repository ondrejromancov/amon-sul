import { findConfig, loadConfig } from './config.js';
import { buildApp } from './app.js';
import { executeAction, validateAction } from './actions.js';
import { FleetStore } from './store.js';
import { startMockFeed } from './mock/feed.js';
import {
  mockBillingMonths,
  mockEvents,
  mockMetrics,
  mockProjects,
  mockRecommendations,
} from './mock/fixtures.js';
import { queryMockLogs } from './logs.js';

const PORT = Number(process.env.PORT ?? 8787);
const configPath = process.env.AMON_SUL_CONFIG ?? findConfig() ?? undefined;
const token = process.env.AMON_SUL_TOKEN || undefined;
const writes = process.env.AMON_SUL_ALLOW_WRITES === '1';

async function main() {
  const config = process.env.AMON_SUL_MOCK === '1' ? null : loadConfig(configPath);
  const mode: 'live' | 'mock' = config ? 'live' : 'mock';

  if (mode === 'mock') {
    const store = new FleetStore('mock');
    const projects = mockProjects();
    store.setProjects(projects);
    store.addEvents(mockEvents());
    store.setCosts({ source: 'billing', months: mockBillingMonths() });
    store.setRecommendations(mockRecommendations());
    startMockFeed(store);

    const app = buildApp({
      store,
      token,
      writes,
      projects: projects.map((project) => project.id),
      queryLogs: (query) => queryMockLogs(store, query),
      executeAction: async (body) => {
        const request = validateAction(store, body);
        return { ok: true, message: `${request.body.action} simulated (mock mode)` };
      },
      metrics: async (resourceId) => {
        const resource = store
          .getSnapshot()
          .projects.flatMap((p) => p.resources)
          .find((r) => r.id === resourceId);
        return resource ? mockMetrics(resource) : null;
      },
    });
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info('Amon Sûl running in MOCK mode — no GCP credentials needed');
    return;
  }

  // Live mode: verify ADC before starting.
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  try {
    await auth.getCredentials();
  } catch {
    console.error(
      [
        'Amon Sûl could not find Google Application Default Credentials.',
        '',
        'Run:  gcloud auth application-default login',
        'or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.',
        `(Config found at ${configPath} — delete it or set AMON_SUL_MOCK=1 to run with demo data.)`,
      ].join('\n'),
    );
    process.exit(1);
  }

  const store = new FleetStore('live', config!.events.maxEntries);
  const { startPoller } = await import('./poller.js');
  const { liveMetrics } = await import('./collectors/monitoring.js');
  const { queryCloudLogs } = await import('./collectors/logging.js');
  startPoller({ config: config!, store, auth });

  const app = buildApp({
    store,
    token,
    writes,
    projects: config!.projects.map((project) => project.id),
    executeAction: (body) => executeAction(store, auth, body),
    queryLogs: async (query) => {
      const knownIds = new Set(
        store.getSnapshot().projects.flatMap((project) => project.resources.map((r) => r.id)),
      );
      return queryCloudLogs(
        query.projectId,
        auth,
        {
          lookbackHours: 24,
          maxEntries: query.limit,
          severity: query.severity,
          resourceId: query.resourceId,
          q: query.q,
        },
        knownIds,
      );
    },
    metrics: async (resourceId) => {
      const resource = store
        .getSnapshot()
        .projects.flatMap((p) => p.resources)
        .find((r) => r.id === resourceId);
      if (!resource) return null;
      return liveMetrics(resource, auth);
    },
  });
  await app.listen({ port: PORT, host: '0.0.0.0' });
  if (writes && !token) {
    app.log.warn('writes enabled without dashboard auth');
  }
  app.log.info(`Amon Sûl running in LIVE mode — watching ${config!.projects.length} project(s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
