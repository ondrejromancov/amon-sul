import type { FleetEvent } from '@amon-sul/shared';
import type { FleetStore } from '../store.js';

const SIMULATED: Omit<FleetEvent, 'id' | 'timestamp'>[] = [
  {
    severity: 'err',
    projectId: 'ledgerlite-staging',
    resourceId: 'ledgerlite-staging/run/api',
    message: 'ECONNREFUSED 10.44.0.2:5432 — connection pool exhausted',
  },
  {
    severity: 'err',
    projectId: 'ledgerlite-staging',
    resourceId: 'ledgerlite-staging/run/api',
    message: 'Uncaught TypeError: cannot read properties of undefined (fx.rate)',
  },
  {
    severity: 'warn',
    projectId: 'rankforge-prod',
    resourceId: 'rankforge-prod/run/crawl-worker',
    message: 'Crawl batch retried 3× — SERP endpoint 429',
  },
  {
    severity: 'info',
    projectId: 'pulseboard-prod',
    resourceId: 'pulseboard-prod/run/app',
    message: 'Health check OK across 2 instances',
  },
];

/** Push a canned event into the store every `intervalMs`. Returns a stop function. */
export function startMockFeed(store: FleetStore, intervalMs = 9000): () => void {
  let i = 0;
  let seq = 0;
  const timer = setInterval(() => {
    const t = SIMULATED[i++ % SIMULATED.length]!;
    store.addEvents([{ ...t, id: `mock-feed-${++seq}`, timestamp: new Date().toISOString() }]);
  }, intervalMs);
  return () => clearInterval(timer);
}
