import { google, type run_v2 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { EnvVar } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import {
  isApiDisabled,
  lastSegment,
  timeAgo,
  type CollectedResource,
  type ResourceCollector,
} from './types.js';

function envOf(svc: run_v2.Schema$GoogleCloudRunV2Service): EnvVar[] | undefined {
  const env = svc.template?.containers?.[0]?.env;
  if (!env?.length) return undefined;
  return env.map((e) => ({
    name: e.name ?? '',
    // Secret-manager backed values are never exposed by the API; mask them.
    value: e.valueSource ? '••••••••' : (e.value ?? ''),
  }));
}

export function mapRunServices(
  services: run_v2.Schema$GoogleCloudRunV2Service[],
  projectId: string,
  now = Date.now(),
): CollectedResource[] {
  return services.map((svc) => {
    const name = lastSegment(svc.name);
    // name format: projects/{p}/locations/{region}/services/{name}
    const region = svc.name?.split('/')[3];
    const ready = svc.terminalCondition?.state === 'CONDITION_SUCCEEDED';
    const revision = lastSegment(svc.latestReadyRevision);
    return {
      type: 'run' as const,
      name,
      region,
      status: ready ? ('ok' as const) : ('err' as const),
      statusText: revision
        ? `rev ${revision} · ${timeAgo(svc.updateTime, now)}`
        : 'no ready revision',
      consoleLinks: consoleLinks('run', name, projectId, region),
      details: {
        minInstances: svc.template?.scaling?.minInstanceCount ?? 0,
        maxInstances: svc.template?.scaling?.maxInstanceCount ?? undefined,
        env: envOf(svc),
        revision: revision || undefined,
        deployedAt: svc.updateTime ?? undefined,
        cpuLimit: svc.template?.containers?.[0]?.resources?.limits?.cpu ?? undefined,
        memoryLimit: svc.template?.containers?.[0]?.resources?.limits?.memory ?? undefined,
      },
    };
  });
}

export const runCollector: ResourceCollector = {
  type: 'run',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.run({ version: 'v2', auth });
    try {
      const res = await client.projects.locations.services.list({
        parent: `projects/${projectId}/locations/-`,
      });
      return mapRunServices(res.data.services ?? [], projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
