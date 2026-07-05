/** Resource types Amon Sûl knows how to discover and render. */
export type ResourceType = 'run' | 'sql' | 'pubsub' | 'storage' | 'scheduler' | 'redis' | 'vm';

/** Health status of a resource or project. */
export type Status = 'ok' | 'warn' | 'err' | 'idle' | 'unknown';

export type Severity = 'info' | 'warn' | 'err';

export interface ConsoleLink {
  label: string;
  url: string;
}

export interface EnvVar {
  name: string;
  /** Literal value, or "••••••••" for secret-backed vars. */
  value: string;
}

/** Extra read-only details some collectors provide (Cloud Run today). */
export interface ResourceDetails {
  minInstances?: number;
  maxInstances?: number;
  env?: EnvVar[];
  revision?: string;
  deployedAt?: string;
  /** Configured per-instance limits, e.g. "1" vCPU and "512Mi". */
  cpuLimit?: string;
  memoryLimit?: string;
}

/** A display-ready observability fact, e.g. { label: "Database size", value: "2.1 / 10 GB" }. */
export interface Vital {
  label: string;
  value: string;
}

export interface ResourceCost {
  monthlyUsd: number;
  /** 'estimate' = derived from list prices; 'billing' = from a billing export. */
  source: 'estimate' | 'billing';
  /** What the estimate covers / assumes, e.g. "compute only, excludes disk". */
  note?: string;
}

export interface Resource {
  /** `${projectId}/${type}/${name}` */
  id: string;
  projectId: string;
  type: ResourceType;
  name: string;
  region?: string;
  status: Status;
  /** One-line human summary, e.g. "db-g1-small · 61% disk". */
  statusText: string;
  consoleLinks: ConsoleLink[];
  details?: ResourceDetails;
  cost?: ResourceCost;
  vitals?: Vital[];
  /** Position in px, resolved server-side (config pin or auto-layout). */
  layout: { x: number; y: number };
}

/** [fromResourceId, toResourceId, optional label shown on the wire]. */
export type Edge = [string, string] | [string, string, string];

export interface Project {
  /** GCP project id. */
  id: string;
  /** From config, defaults to id. */
  displayName: string;
  /** Worst-of its resources. */
  status: Status;
  resources: Resource[];
  edges: Edge[];
  /** Computed from layout, px. */
  board: { w: number; h: number };
  /** Set when discovery for this project failed. */
  error?: string;
}

export interface FleetEvent {
  id: string;
  severity: Severity;
  projectId: string;
  /** Matched where possible, else undefined. */
  resourceId?: string;
  message: string;
  /** ISO 8601. */
  timestamp: string;
}

/** One invoice month of actual spend from a billing export. */
export interface BillingMonth {
  /** e.g. "2026-06" */
  month: string;
  byProject: Record<string, number>;
  byService: Record<string, number>;
  totalUsd: number;
}

export interface FleetCosts {
  /** 'billing' when a BigQuery billing export is configured, else 'estimate'. */
  source: 'estimate' | 'billing';
  /** Present only with a billing export; oldest first. */
  months?: BillingMonth[];
}

export interface FleetSnapshot {
  projects: Project[];
  /** Newest first, capped. */
  events: FleetEvent[];
  costs?: FleetCosts;
  fetchedAt: string;
  mode: 'live' | 'mock';
}

export interface MetricSeries {
  /** e.g. "requests · 1h" */
  label: string;
  points: { t: string; v: number }[];
}

/** Node card dimensions in px — the layout grid and the web renderer agree on these. */
export const NODE_W = 184;
export const NODE_H = 64;
