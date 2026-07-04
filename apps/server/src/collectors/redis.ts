import { google, type redis_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Status } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import { isApiDisabled, lastSegment, type CollectedResource, type ResourceCollector } from './types.js';

function redisStatus(state: string | null | undefined): Status {
  switch (state) {
    case 'READY':
      return 'ok';
    case 'MAINTENANCE':
      return 'warn';
    default:
      return 'err';
  }
}

export function mapRedisInstances(
  instances: redis_v1.Schema$Instance[],
  projectId: string,
): CollectedResource[] {
  return instances.map((inst) => {
    const name = lastSegment(inst.name);
    const region = inst.locationId?.replace(/-[a-z]$/, '') ?? undefined;
    return {
      type: 'redis' as const,
      name,
      region,
      status: redisStatus(inst.state),
      statusText: `${inst.memorySizeGb ?? '?'} GB ${(inst.tier ?? 'basic').toLowerCase()} · ${inst.state ?? 'UNKNOWN'}`,
      consoleLinks: consoleLinks('redis', name, projectId, region),
    };
  });
}

export const redisCollector: ResourceCollector = {
  type: 'redis',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.redis({ version: 'v1', auth });
    try {
      const res = await client.projects.locations.instances.list({
        parent: `projects/${projectId}/locations/-`,
      });
      return mapRedisInstances(res.data.instances ?? [], projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
