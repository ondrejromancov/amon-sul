import type { FleetEvent, MetricSeries, Project, Resource } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import { resolveProject, type CollectedResource } from '../layout.js';
import type { ProjectConfig } from '../config.js';

/**
 * Demo fleet ported from the original prototype (docs/prototype/
 * gcp-fleet-prototype.html): four projects with the same names, resources,
 * statuses and wiring.
 */

function r(
  type: CollectedResource['type'],
  name: string,
  status: CollectedResource['status'],
  statusText: string,
  projectId: string,
  region?: string,
): CollectedResource {
  return {
    type,
    name,
    status,
    statusText,
    region,
    consoleLinks: consoleLinks(type, name, projectId, region),
  };
}

type MockProject = {
  id: string;
  cfg: Pick<ProjectConfig, 'name' | 'edges' | 'layout'>;
  resources: CollectedResource[];
};

function mockDefs(): MockProject[] {
  return [
    {
      id: 'rankforge-prod',
      cfg: {
        name: 'Rankforge',
        edges: [
          ['scheduler/nightly-crawl', 'pubsub/crawl-jobs', 'pub · 02:00'],
          ['run/api', 'pubsub/crawl-jobs', 'pub · 840/h'],
          ['pubsub/crawl-jobs', 'run/crawl-worker', 'sub'],
          ['run/api', 'sql/rankforge-pg', '340 q/s'],
          ['run/crawl-worker', 'storage/rankforge-exports', 'writes'],
          ['run/crawl-worker', 'sql/rankforge-pg', '18 q/s'],
        ],
        layout: {
          'run/api': [0, 0],
          'run/crawl-worker': [0, 1],
          'scheduler/nightly-crawl': [1, 0],
          'pubsub/crawl-jobs': [1, 1],
          'sql/rankforge-pg': [2, 0],
          'storage/rankforge-exports': [2, 1],
        },
      },
      resources: [
        {
          ...r('run', 'api', 'ok', 'rev api-00092 · 2m ago', 'rankforge-prod', 'europe-west1'),
          details: {
            minInstances: 0,
            maxInstances: 4,
            revision: 'api-00092',
            env: [
              { name: 'DATABASE_URL', value: '••••••••' },
              { name: 'SERP_API_KEY', value: '••••••••' },
              { name: 'LOG_LEVEL', value: 'info' },
            ],
          },
        },
        {
          ...r(
            'run',
            'crawl-worker',
            'warn',
            'p95 latency ↑ 3.1s',
            'rankforge-prod',
            'europe-west1',
          ),
          details: {
            minInstances: 0,
            maxInstances: 10,
            revision: 'crawl-worker-00061',
            env: [
              { name: 'DATABASE_URL', value: '••••••••' },
              { name: 'CONCURRENCY', value: '8' },
            ],
          },
        },
        r(
          'scheduler',
          'nightly-crawl',
          'ok',
          '0 2 * * * · last OK',
          'rankforge-prod',
          'europe-west1',
        ),
        r('pubsub', 'crawl-jobs', 'ok', '14 msg/s · 0 backlog', 'rankforge-prod'),
        r('sql', 'rankforge-pg', 'ok', 'db-g1-small · 61% disk', 'rankforge-prod', 'europe-west1'),
        r('storage', 'rankforge-exports', 'ok', '12.4 GB · 38k objects', 'rankforge-prod'),
      ],
    },
    {
      id: 'pulseboard-prod',
      cfg: {
        name: 'Pulseboard',
        edges: [
          ['run/app', 'sql/pulseboard-pg'],
          ['run/app', 'redis/pb-cache'],
        ],
        layout: { 'run/app': [0, 0], 'sql/pulseboard-pg': [1, 0], 'redis/pb-cache': [1, 1] },
      },
      resources: [
        r('run', 'app', 'ok', 'rev app-00041 · 1h ago', 'pulseboard-prod', 'europe-west3'),
        r(
          'sql',
          'pulseboard-pg',
          'ok',
          'db-f1-micro · 22% disk',
          'pulseboard-prod',
          'europe-west3',
        ),
        r('redis', 'pb-cache', 'ok', '1 GB basic · 41% mem', 'pulseboard-prod', 'europe-west3'),
      ],
    },
    {
      id: 'ledgerlite-staging',
      cfg: {
        name: 'Ledgerlite',
        edges: [['run/api', 'sql/ledger-pg']],
        layout: { 'run/api': [0, 0], 'sql/ledger-pg': [1, 0] },
      },
      resources: [
        r('run', 'api', 'err', 'rev api-00017 failing', 'ledgerlite-staging', 'europe-west1'),
        r('sql', 'ledger-pg', 'ok', 'db-f1-micro · 9% disk', 'ledgerlite-staging', 'europe-west1'),
      ],
    },
    {
      id: 'ml-lab',
      cfg: {
        name: 'ML Lab',
        edges: [['vm/gpu-box', 'storage/ml-lab-datasets']],
        layout: { 'vm/gpu-box': [0, 0], 'storage/ml-lab-datasets': [1, 0] },
      },
      resources: [
        r('vm', 'gpu-box', 'idle', 'TERMINATED · a2-highgpu-1g', 'ml-lab', 'europe-west4-b'),
        r('storage', 'ml-lab-datasets', 'ok', '218 GB · nearline', 'ml-lab'),
      ],
    },
  ];
}

export function mockProjects(): Project[] {
  return mockDefs().map((d) => resolveProject(d.id, d.resources, d.cfg));
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

export function mockEvents(): FleetEvent[] {
  return [
    {
      id: 'mock-1',
      severity: 'err',
      projectId: 'ledgerlite-staging',
      resourceId: 'ledgerlite-staging/run/api',
      message: 'ECONNREFUSED 10.44.0.2:5432 — connection pool exhausted',
      timestamp: minutesAgo(2),
    },
    {
      id: 'mock-2',
      severity: 'err',
      projectId: 'ledgerlite-staging',
      resourceId: 'ledgerlite-staging/run/api',
      message: 'Startup probe failed: container exited (1)',
      timestamp: minutesAgo(6),
    },
    {
      id: 'mock-3',
      severity: 'warn',
      projectId: 'rankforge-prod',
      resourceId: 'rankforge-prod/run/crawl-worker',
      message: 'p95 latency 3.1s exceeds SLO 2.0s',
      timestamp: minutesAgo(18),
    },
    {
      id: 'mock-4',
      severity: 'info',
      projectId: 'rankforge-prod',
      resourceId: 'rankforge-prod/run/api',
      message: 'Deployed revision api-00092 (100% traffic)',
      timestamp: minutesAgo(120),
    },
    {
      id: 'mock-5',
      severity: 'warn',
      projectId: 'rankforge-prod',
      resourceId: 'rankforge-prod/sql/rankforge-pg',
      message: 'Disk utilisation 61% — projected full in 40 days',
      timestamp: minutesAgo(300),
    },
    {
      id: 'mock-6',
      severity: 'info',
      projectId: 'pulseboard-prod',
      resourceId: 'pulseboard-prod/run/app',
      message: 'Scheduled scale-down to min 1 instance',
      timestamp: minutesAgo(420),
    },
  ];
}

/**
 * Metrics generator shaped by status, port of the prototype's drawSpark data:
 * random walk; requests fall off a cliff for `err`; flatline for `idle`.
 */
export function mockMetrics(resource: Pick<Resource, 'type' | 'status'>): MetricSeries[] {
  if (resource.type !== 'run' && resource.type !== 'sql') return [];
  const N = 60;
  const points: { t: string; v: number }[] = [];
  let v = 0.4 + Math.random() * 0.2;
  for (let i = 0; i < N; i++) {
    v += (Math.random() - 0.5) * 0.12;
    v = Math.min(0.9, Math.max(0.08, v));
    let out = v;
    if (resource.status === 'err' && i > N - 12) out = Math.max(0.02, v - 0.09 * (i - (N - 12)));
    if (resource.status === 'idle') out = 0.04;
    points.push({
      t: new Date(Date.now() - (N - 1 - i) * 60_000).toISOString(),
      v: Math.round(out * 100),
    });
  }
  return [{ label: resource.type === 'sql' ? 'connections · 1h' : 'requests · 1h', points }];
}
