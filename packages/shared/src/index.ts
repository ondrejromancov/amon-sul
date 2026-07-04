/** Resource types Amon Sûl knows how to discover and render. */
export type ResourceType = 'run' | 'sql' | 'pubsub' | 'storage' | 'scheduler' | 'redis' | 'vm';

/** Health status of a resource or project. */
export type Status = 'ok' | 'warn' | 'err' | 'idle' | 'unknown';

export type Severity = 'info' | 'warn' | 'err';

export interface ConsoleLink {
  label: string;
  url: string;
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
  /** Position in px, resolved server-side (config pin or auto-layout). */
  layout: { x: number; y: number };
}

export interface Project {
  /** GCP project id. */
  id: string;
  /** From config, defaults to id. */
  displayName: string;
  /** Worst-of its resources. */
  status: Status;
  resources: Resource[];
  /** Pairs of Resource.id. */
  edges: [string, string][];
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

export interface FleetSnapshot {
  projects: Project[];
  /** Newest first, capped. */
  events: FleetEvent[];
  fetchedAt: string;
  mode: 'live' | 'mock';
}

export interface MetricSeries {
  /** e.g. "requests · 1h" */
  label: string;
  points: { t: string; v: number }[];
}

/** Node card dimensions in px — the layout grid and the web renderer agree on these. */
export const NODE_W = 200;
export const NODE_H = 76;
