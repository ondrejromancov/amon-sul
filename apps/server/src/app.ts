import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { MetricSeries } from '@amon-sul/shared';
import type { FleetStore } from './store.js';

export interface AppDeps {
  store: FleetStore;
  /** Resolve metrics for a resource id; return null for unknown resources. */
  metrics: (resourceId: string) => Promise<MetricSeries[] | null>;
}

const METRICS_CACHE_MS = 60_000;

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const metricsCache = new Map<string, { at: number; series: MetricSeries[] }>();

  app.get('/healthz', async () => ({
    ok: true,
    mode: deps.store.getSnapshot().mode,
    lastPollAt: deps.store.lastPollAt,
  }));

  app.get('/api/snapshot', async () => deps.store.getSnapshot());

  app.get<{ Querystring: { resource?: string } }>('/api/metrics', async (req, reply) => {
    const resourceId = req.query.resource ?? '';
    const cached = metricsCache.get(resourceId);
    if (cached && Date.now() - cached.at < METRICS_CACHE_MS) return cached.series;
    const series = await deps.metrics(resourceId);
    if (series === null) return reply.code(404).send({ error: `unknown resource: ${resourceId}` });
    metricsCache.set(resourceId, { at: Date.now(), series });
    return series;
  });

  app.get('/api/stream', (req, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(':connected\n\n');

    const offEvent = deps.store.onEvent((event) => {
      reply.raw.write(`event: fleet-event\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const offSnapshot = deps.store.onSnapshot((snapshot) => {
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(':hb\n\n'), 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      offEvent();
      offSnapshot();
    });
  });

  // In production the server also serves the built SPA.
  if (process.env.NODE_ENV === 'production') {
    const here = dirname(fileURLToPath(import.meta.url));
    const webDist = process.env.WEB_DIST ?? join(here, '../../web/dist');
    if (existsSync(webDist)) {
      app.register(fastifyStatic, { root: webDist });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
        return reply.sendFile('index.html');
      });
    } else {
      app.log.warn(`web dist not found at ${webDist} — serving API only`);
    }
  }

  return app;
}
