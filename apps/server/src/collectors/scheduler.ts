import { google, type cloudscheduler_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Status } from '@amon-sul/shared';
import { consoleLinks } from '../consoleLinks.js';
import {
  isApiDisabled,
  lastSegment,
  type CollectedResource,
  type ResourceCollector,
} from './types.js';

function jobStatus(job: cloudscheduler_v1.Schema$Job): { status: Status; note: string } {
  if (job.state === 'PAUSED') return { status: 'idle', note: 'paused' };
  if (job.state === 'DISABLED') return { status: 'idle', note: 'disabled' };
  // job.status is the RPC status of the last attempt; code 0 / absent = OK.
  if (job.status?.code) return { status: 'err', note: 'last run failed' };
  if (job.lastAttemptTime) return { status: 'ok', note: 'last OK' };
  return { status: 'ok', note: 'not run yet' };
}

export function mapJobs(
  jobs: cloudscheduler_v1.Schema$Job[],
  projectId: string,
): CollectedResource[] {
  return jobs.map((job) => {
    const name = lastSegment(job.name);
    // name format: projects/{p}/locations/{region}/jobs/{name}
    const region = job.name?.split('/')[3];
    const { status, note } = jobStatus(job);
    return {
      type: 'scheduler' as const,
      name,
      region,
      status,
      statusText: `${job.schedule ?? '?'} · ${note}`,
      consoleLinks: consoleLinks('scheduler', name, projectId),
    };
  });
}

export const schedulerCollector: ResourceCollector = {
  type: 'scheduler',
  async collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]> {
    const client = google.cloudscheduler({ version: 'v1', auth });
    try {
      const locs = await client.projects.locations.list({ name: `projects/${projectId}` });
      const jobs: cloudscheduler_v1.Schema$Job[] = [];
      for (const loc of locs.data.locations ?? []) {
        const res = await client.projects.locations.jobs.list({ parent: loc.name! });
        jobs.push(...(res.data.jobs ?? []));
      }
      return mapJobs(jobs, projectId);
    } catch (e) {
      if (isApiDisabled(e)) return [];
      throw e;
    }
  },
};
