import type { FleetEvent, FleetSnapshot, MetricSeries } from '@amon-sul/shared';

export async function fetchSnapshot(): Promise<FleetSnapshot> {
  const res = await fetch('/api/snapshot');
  if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
  return res.json();
}

export async function fetchMetrics(resourceId: string): Promise<MetricSeries[]> {
  const res = await fetch(`/api/metrics?resource=${encodeURIComponent(resourceId)}`);
  if (!res.ok) throw new Error(`metrics failed: ${res.status}`);
  return res.json();
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
