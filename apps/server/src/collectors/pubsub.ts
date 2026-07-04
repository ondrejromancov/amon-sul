import { google, type pubsub_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import { consoleLinks } from '../consoleLinks.js';
import {
  isApiDisabled,
  lastSegment,
  type CollectedResource,
  type ResourceCollector,
} from './types.js';

export function mapTopics(
  topics: pubsub_v1.Schema$Topic[],
  projectId: string,
): CollectedResource[] {
  return topics.map((t) => {
    const name = lastSegment(t.name);
    return {
      type: 'pubsub' as const,
      name,
      status: 'ok' as const,
      statusText: 'topic',
      consoleLinks: consoleLinks('pubsub', name, projectId),
    };
  });
}

export const pubsubCollector: ResourceCollector = {
  type: 'pubsub',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.pubsub({ version: 'v1', auth });
    try {
      const res = await client.projects.topics.list({ project: `projects/${projectId}` });
      return mapTopics(res.data.topics ?? [], projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
