import { google, type storage_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import { consoleLinks } from '../consoleLinks.js';
import { isApiDisabled, type CollectedResource, type ResourceCollector } from './types.js';

export function mapBuckets(
  buckets: storage_v1.Schema$Bucket[],
  projectId: string,
): CollectedResource[] {
  return buckets.map((b) => {
    const name = b.name ?? '';
    return {
      type: 'storage' as const,
      name,
      region: b.location?.toLowerCase() ?? undefined,
      status: 'ok' as const,
      statusText: `${b.location?.toLowerCase() ?? '?'} · ${(b.storageClass ?? 'standard').toLowerCase()}`,
      consoleLinks: consoleLinks('storage', name, projectId),
    };
  });
}

export const storageCollector: ResourceCollector = {
  type: 'storage',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.storage({ version: 'v1', auth });
    try {
      const res = await client.buckets.list({ project: projectId });
      return mapBuckets(res.data.items ?? [], projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
