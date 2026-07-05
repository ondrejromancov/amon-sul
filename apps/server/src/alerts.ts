import type { FleetEvent, Resource } from '@amon-sul/shared';
import type { ProjectVitals } from './vitals.js';

const ERROR_SPIKE_WINDOW_MS = 15 * 60_000;
const ERROR_SPIKE_MIN_EVENTS = 5;

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function deriveAlerts(
  resource: Resource,
  vitals: ProjectVitals,
  recentEvents: FleetEvent[],
  now = Date.now(),
): string[] {
  const alerts: string[] = [];

  if (resource.type === 'sql') {
    const used = vitals.sqlDiskUsed.get(resource.name);
    const quota = vitals.sqlDiskQuota.get(resource.name);
    if (used !== undefined && quota !== undefined && quota > 0 && used / quota > 0.8) {
      alerts.push(`disk ${pct(used / quota)}`);
    }

    const memory = vitals.sqlMemory.get(resource.name);
    if (memory !== undefined && memory >= 0.97) alerts.push(`memory ${pct(memory)}`);
  }

  if (resource.type === 'redis') {
    const memory = vitals.redisMemory.get(resource.name);
    if (memory !== undefined && memory > 0.85) alerts.push(`memory ${pct(memory)}`);
  }

  if (resource.type === 'run') {
    const instances = vitals.runInstances.get(resource.name);
    const maxInstances = resource.details?.maxInstances ?? 0;
    if (instances !== undefined && maxInstances > 0 && instances >= maxInstances) {
      alerts.push('at max scale');
    }
  }

  const errCount = recentEvents.filter(
    (event) =>
      event.severity === 'err' &&
      event.resourceId === resource.id &&
      now - Date.parse(event.timestamp) < ERROR_SPIKE_WINDOW_MS,
  ).length;
  if (errCount >= ERROR_SPIKE_MIN_EVENTS) alerts.push('error spike');

  return alerts;
}
