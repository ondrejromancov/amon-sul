import { google, type compute_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Status } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import {
  isApiDisabled,
  lastSegment,
  type CollectedResource,
  type ResourceCollector,
} from './types.js';

function vmStatus(status: string | null | undefined): Status {
  switch (status) {
    case 'RUNNING':
      return 'ok';
    case 'TERMINATED':
    case 'SUSPENDED':
    case 'STOPPED':
      return 'idle';
    default:
      return 'warn'; // transitional states: PROVISIONING, STAGING, STOPPING…
  }
}

export function mapInstances(
  instances: compute_v1.Schema$Instance[],
  projectId: string,
): CollectedResource[] {
  return instances.map((inst) => {
    const name = inst.name ?? '';
    const zone = lastSegment(inst.zone);
    const machineType = lastSegment(inst.machineType);
    return {
      type: 'vm' as const,
      name,
      region: zone || undefined,
      status: vmStatus(inst.status),
      statusText: `${inst.status ?? 'UNKNOWN'} · ${machineType || '?'}`,
      consoleLinks: consoleLinks('vm', name, projectId, zone || undefined),
    };
  });
}

export const vmCollector: ResourceCollector = {
  type: 'vm',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.compute({ version: 'v1', auth });
    try {
      const res = await client.instances.aggregatedList({ project: projectId });
      const instances = Object.values(res.data.items ?? {}).flatMap(
        (scope) => scope.instances ?? [],
      );
      return mapInstances(instances, projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
