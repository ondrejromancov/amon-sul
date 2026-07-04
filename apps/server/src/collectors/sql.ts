import { google, type sqladmin_v1beta4 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Status } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import { isApiDisabled, type CollectedResource, type ResourceCollector } from './types.js';

function sqlStatus(state: string | null | undefined): Status {
  switch (state) {
    case 'RUNNABLE':
      return 'ok';
    case 'STOPPED':
    case 'SUSPENDED':
      return 'idle';
    default:
      return 'err';
  }
}

export function mapSqlInstances(
  instances: sqladmin_v1beta4.Schema$DatabaseInstance[],
  projectId: string,
): CollectedResource[] {
  return instances.map((inst) => {
    const name = inst.name ?? '';
    return {
      type: 'sql' as const,
      name,
      region: inst.region ?? undefined,
      status: sqlStatus(inst.state),
      statusText: `${inst.settings?.tier ?? 'unknown tier'} · ${inst.state ?? 'UNKNOWN'}`,
      consoleLinks: consoleLinks('sql', name, projectId),
    };
  });
}

export const sqlCollector: ResourceCollector = {
  type: 'sql',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.sqladmin({ version: 'v1beta4', auth });
    try {
      const res = await client.instances.list({ project: projectId });
      return mapSqlInstances(res.data.items ?? [], projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
