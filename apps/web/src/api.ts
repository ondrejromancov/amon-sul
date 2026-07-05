import type { FleetEvent, FleetSnapshot, MetricSeries } from '@amon-sul/shared';

export async function fetchSnapshot(): Promise<FleetSnapshot> {
  const res = await fetch('/api/snapshot', { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
  return res.json();
}

export async function fetchMetrics(resourceId: string): Promise<MetricSeries[]> {
  const res = await fetch(`/api/metrics?resource=${encodeURIComponent(resourceId)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
  return res.json();
}

export interface LogParams {
  project: string;
  severity?: 'all' | 'warn' | 'err';
  resource?: string;
  q?: string;
  limit?: number;
}

export async function fetchLogs(params: LogParams): Promise<FleetEvent[]> {
  const search = new URLSearchParams();
  search.set('project', params.project);
  search.set('severity', params.severity ?? 'all');
  if (params.resource) search.set('resource', params.resource);
  if (params.q?.trim()) search.set('q', params.q.trim());
  search.set('limit', String(params.limit ?? 80));

  const res = await fetch(`/api/logs?${search.toString()}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`logs failed: ${res.status}`);
  const body = (await res.json()) as { entries?: FleetEvent[] };
  return body.entries ?? [];
}

export interface Capabilities {
  writes: boolean;
}

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch('/api/capabilities', { credentials: 'same-origin' });
    if (!res.ok) return { writes: false };
    const body = (await res.json()) as Partial<Capabilities>;
    return { writes: body.writes === true };
  } catch {
    return { writes: false };
  }
}

export type ResourceAction =
  'vm.start' | 'vm.stop' | 'run.setMinInstances' | 'scheduler.pause' | 'scheduler.resume';

export interface ActionRequest {
  action: ResourceAction;
  resourceId: string;
  params?: { minInstances?: number };
}

export async function postAction(request: ActionRequest): Promise<{ ok: true; message: string }> {
  const res = await fetch('/api/actions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<{ message: string; error: string }>;
  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? `action failed: ${res.status}`);
  }
  return { ok: true, message: body.message ?? 'action queued' };
}

export interface StreamHandlers {
  onEvent: (event: FleetEvent) => void;
  onSnapshot: (snapshot: FleetSnapshot) => void;
  onOpen?: () => void;
  onError?: () => void;
}

/** Subscribe to the live SSE stream. Returns a close function. */
export function openStream(handlers: StreamHandlers): () => void {
  const es = new EventSource('/api/stream');
  es.addEventListener('fleet-event', (e) => handlers.onEvent(JSON.parse(e.data)));
  es.addEventListener('snapshot', (e) => handlers.onSnapshot(JSON.parse(e.data)));
  es.onopen = () => handlers.onOpen?.();
  es.onerror = () => handlers.onError?.();
  return () => es.close();
}
