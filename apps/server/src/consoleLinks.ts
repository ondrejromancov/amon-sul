import type { ConsoleLink, ResourceType } from '@amon-sul/shared';

const BASE = 'https://console.cloud.google.com';

/**
 * Deep links into the GCP console per resource type. Region-dependent links
 * (run, redis, vm) are omitted when the region is unknown rather than
 * guessing one.
 */
export function consoleLinks(
  type: ResourceType,
  name: string,
  projectId: string,
  region?: string,
): ConsoleLink[] {
  const q = `project=${projectId}`;
  switch (type) {
    case 'run':
      if (!region) return [];
      return [
        { label: 'service', url: `${BASE}/run/detail/${region}/${name}/metrics?${q}` },
        {
          label: 'logs',
          url: `${BASE}/logs/query;query=resource.labels.service_name%3D%22${name}%22?${q}`,
        },
        { label: 'revisions', url: `${BASE}/run/detail/${region}/${name}/revisions?${q}` },
      ];
    case 'sql':
      return [
        { label: 'instance', url: `${BASE}/sql/instances/${name}/overview?${q}` },
        { label: 'backups', url: `${BASE}/sql/instances/${name}/backups?${q}` },
      ];
    case 'pubsub':
      return [{ label: 'topic', url: `${BASE}/cloudpubsub/topic/detail/${name}?${q}` }];
    case 'storage':
      return [{ label: 'bucket', url: `${BASE}/storage/browser/${name}?${q}` }];
    case 'scheduler':
      return [{ label: 'jobs', url: `${BASE}/cloudscheduler?${q}` }];
    case 'redis':
      if (!region) return [];
      return [
        {
          label: 'instance',
          url: `${BASE}/memorystore/redis/locations/${region}/instances/${name}/details?${q}`,
        },
      ];
    case 'vm': {
      // VM "region" is a zone for links; collectors pass the zone here.
      if (!region) return [];
      return [
        {
          label: 'instance',
          url: `${BASE}/compute/instancesDetail/zones/${region}/instances/${name}?${q}`,
        },
        {
          label: 'serial log',
          url: `${BASE}/compute/instancesDetail/zones/${region}/instances/${name}?${q}&tab=serialconsole`,
        },
      ];
    }
  }
}

/** Project-level console link used by the board header. */
export function projectConsoleUrl(projectId: string): string {
  return `${BASE}/home/dashboard?project=${projectId}`;
}
