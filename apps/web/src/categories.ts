import type { ResourceType, Status } from '@amon-sul/shared';

/** Visual category a resource type belongs to — drives node/edge colors. */
export type Category = 'compute' | 'data' | 'storage' | 'messaging' | 'jobs';

export const CATEGORY_OF: Record<ResourceType, Category> = {
  run: 'compute',
  vm: 'compute',
  sql: 'data',
  redis: 'data',
  storage: 'storage',
  pubsub: 'messaging',
  scheduler: 'jobs',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  compute: '#5658d2',
  data: '#12898b',
  storage: '#2f7fd4',
  messaging: '#9a4fc9',
  jobs: '#64748b',
};

/** Tinted chip palette per category: [background, foreground, border]. */
export const CATEGORY_TINT: Record<Category, [string, string, string]> = {
  compute: ['#e9e9fa', '#4547b8', '#e0e0f8'],
  data: ['#ddf0f0', '#0d6c6e', '#c9e5e5'],
  storage: ['#e2eefa', '#2668ab', '#d3e3f4'],
  messaging: ['#f1e5f9', '#7a3aa3', '#e6d4f2'],
  jobs: ['#eaeef3', '#4a5a70', '#dfe4ea'],
};

export const TYPE_BADGE: Record<ResourceType, string> = {
  run: 'RUN',
  vm: 'VM',
  sql: 'SQL',
  redis: 'REDIS',
  storage: 'GCS',
  pubsub: 'PUB',
  scheduler: 'CRON',
};

export const TYPE_LABEL: Record<ResourceType, string> = {
  run: 'Cloud Run',
  vm: 'Compute Engine',
  sql: 'Cloud SQL',
  redis: 'Memorystore',
  storage: 'Cloud Storage',
  pubsub: 'Pub/Sub',
  scheduler: 'Cloud Scheduler',
};

export const STATUS_COLOR: Record<Status, string> = {
  ok: '#2fa572',
  warn: '#dd8a12',
  err: '#d64545',
  idle: '#94a0b3',
  unknown: '#94a0b3',
};

/** Status pill: label + [background, foreground]. */
export const STATUS_PILL: Record<Status, { label: string; bg: string; fg: string }> = {
  ok: { label: 'Healthy', bg: '#e4f4ec', fg: '#1e7a4f' },
  warn: { label: 'Degraded', bg: '#fcf0dd', fg: '#a06110' },
  err: { label: 'Failing', bg: '#fbe7e7', fg: '#b13030' },
  idle: { label: 'Stopped', bg: '#eaeef3', fg: '#4a5a70' },
  unknown: { label: 'No data', bg: '#eaeef3', fg: '#4a5a70' },
};
