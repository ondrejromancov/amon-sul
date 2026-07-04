import { describe, expect, it } from 'vitest';
import { consoleLinks } from './consoleLinks.js';

describe('consoleLinks', () => {
  it('builds run links (service, logs, revisions) with region', () => {
    const links = consoleLinks('run', 'api', 'proj', 'europe-west1');
    expect(links.map((l) => l.label)).toEqual(['service', 'logs', 'revisions']);
    expect(links[0]!.url).toBe(
      'https://console.cloud.google.com/run/detail/europe-west1/api/metrics?project=proj',
    );
    expect(links[1]!.url).toContain('service_name%3D%22api%22');
  });

  it('omits region-dependent links when region is unknown', () => {
    expect(consoleLinks('run', 'api', 'proj')).toEqual([]);
    expect(consoleLinks('redis', 'cache', 'proj')).toEqual([]);
    expect(consoleLinks('vm', 'box', 'proj')).toEqual([]);
  });

  it('builds sql, pubsub, storage, scheduler links without region', () => {
    expect(consoleLinks('sql', 'db', 'proj').map((l) => l.label)).toEqual(['instance', 'backups']);
    expect(consoleLinks('pubsub', 'jobs', 'proj')[0]!.url).toContain('/cloudpubsub/topic/detail/jobs');
    expect(consoleLinks('storage', 'bucket-x', 'proj')[0]!.url).toContain('/storage/browser/bucket-x');
    expect(consoleLinks('scheduler', 'nightly', 'proj')[0]!.url).toContain('/cloudscheduler');
  });

  it('builds vm links from a zone', () => {
    const links = consoleLinks('vm', 'gpu-box', 'proj', 'europe-west4-b');
    expect(links[0]!.url).toContain('/zones/europe-west4-b/instances/gpu-box');
    expect(links[1]!.url).toContain('tab=serialconsole');
  });
});
