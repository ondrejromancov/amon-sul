import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { MetricSeries } from '@amon-sul/shared';
import type { FleetStore } from './store.js';

export interface AppDeps {
  store: FleetStore;
  /** Resolve metrics for a resource id; return null for unknown resources. */
  metrics: (resourceId: string) => Promise<MetricSeries[] | null>;
  /** Optional dashboard token. When unset, all routes stay open. */
  token?: string;
}

const AUTH_COOKIE = 'amon_sul_token';
const METRICS_CACHE_MS = 60_000;

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const metricsCache = new Map<string, { at: number; series: MetricSeries[] }>();

  if (deps.token) installAuth(app, deps.token);

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

function installAuth(app: FastifyInstance, expectedToken: string) {
  const expectedHash = hashToken(expectedToken);

  app.register(fastifyCookie);
  app.addHook('onRequest', async (req, reply) => {
    const url = new URL(req.url, 'http://amon-sul.local');
    if (url.pathname === '/healthz') return;

    const queryToken = req.method === 'GET' ? url.searchParams.get('token') : null;
    if (matchesToken(expectedHash, queryToken)) {
      setAuthCookie(req, reply, expectedToken);
      if (isHtmlNavigation(req, url)) return reply.redirect(stripToken(url));
      return;
    }

    if (matchesToken(expectedHash, bearerToken(req.headers.authorization))) return;
    if (matchesToken(expectedHash, cookieToken(req))) return;

    if (url.pathname.startsWith('/api/')) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    return reply
      .code(401)
      .header('cache-control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(loginPage());
  });
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function matchesToken(expectedHash: Buffer, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  return timingSafeEqual(expectedHash, hashToken(candidate));
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  return match?.[1];
}

function cookieToken(req: FastifyRequest): string | undefined {
  const parsedCookie = req.cookies?.[AUTH_COOKIE];
  if (parsedCookie) return parsedCookie;

  return req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(AUTH_COOKIE.length + 1);
}

function setAuthCookie(req: FastifyRequest, reply: FastifyReply, token: string) {
  reply.setCookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: requestIsHttps(req),
  });
}

function requestIsHttps(req: FastifyRequest): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const firstForwardedProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return (
    Boolean((req.raw.socket as { encrypted?: boolean }).encrypted) ||
    firstForwardedProto?.split(',')[0]?.trim() === 'https'
  );
}

function isHtmlNavigation(req: FastifyRequest, url: URL): boolean {
  return !url.pathname.startsWith('/api/') && req.headers.accept?.includes('text/html') === true;
}

function stripToken(url: URL): string {
  url.searchParams.delete('token');
  return `${url.pathname}${url.search}`;
}

function loginPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Amon Sûl</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #111318; color: #f5f6f8; }
      main { width: min(360px, calc(100vw - 40px)); }
      h1 { margin: 0 0 16px; font-size: 22px; }
      form { display: grid; gap: 12px; }
      input, button { font: inherit; border-radius: 6px; padding: 11px 12px; }
      input { border: 1px solid #4b5263; background: #191d25; color: inherit; }
      button { border: 0; background: #f5f6f8; color: #111318; font-weight: 700; cursor: pointer; }
    </style>
  </head>
  <body>
    <main>
      <h1>Amon Sûl</h1>
      <form method="get">
        <input name="token" type="password" placeholder="Token" autocomplete="current-password" autofocus>
        <button type="submit">Unlock</button>
      </form>
    </main>
  </body>
</html>`;
}
