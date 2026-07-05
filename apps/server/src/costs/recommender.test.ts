import { describe, expect, it } from 'vitest';
import type { Resource } from '@amon-sul/shared';
import { deriveRecommendationLocations, mapRecommendations } from './recommender.js';

function resource(type: Resource['type'], name: string, region?: string): Resource {
  return {
    id: `p/${type}/${name}`,
    projectId: 'p',
    type,
    name,
    region,
    status: 'ok',
    statusText: 'x',
    consoleLinks: [],
    layout: { x: 0, y: 0 },
  };
}

describe('recommender mapper', () => {
  it('maps VM recommendations, resource ids, and monthly savings', () => {
    const [mapped] = mapRecommendations(
      [
        {
          name: 'projects/p/locations/europe-west4-b/recommenders/r/recommendations/idle-gpu',
          description: 'Delete idle VM instance gpu-box',
          targetResources: [
            '//compute.googleapis.com/projects/p/zones/europe-west4-b/instances/gpu-box',
          ],
          primaryImpact: {
            costProjection: { cost: { units: '-61', nanos: -500_000_000 }, duration: '2592000s' },
          },
        },
      ],
      'p',
      'google.compute.instance.IdleResourceRecommender',
      [resource('vm', 'gpu-box', 'europe-west4-b')],
    );

    expect(mapped).toEqual({
      id: 'projects/p/locations/europe-west4-b/recommenders/r/recommendations/idle-gpu',
      projectId: 'p',
      resourceId: 'p/vm/gpu-box',
      description: 'Delete idle VM instance gpu-box',
      monthlySavingsUsd: 61.5,
      recommender: 'google.compute.instance.IdleResourceRecommender',
    });
  });

  it('maps SQL operation resources and normalizes non-monthly durations', () => {
    const [mapped] = mapRecommendations(
      [
        {
          name: 'rec/sql-over',
          description: 'Downsize Cloud SQL instance pg-main',
          content: {
            operationGroups: [
              {
                operations: [
                  {
                    action: 'replace',
                    resource: '//sqladmin.googleapis.com/projects/p/instances/pg-main',
                    resourceType: 'sqladmin.googleapis.com/Instance',
                    path: '/settings/tier',
                  },
                ],
              },
            ],
          },
          primaryImpact: {
            costProjection: { cost: { units: '-11', nanos: -500_000_000 }, duration: '1296000s' },
          },
        },
      ],
      'p',
      'google.cloudsql.instance.OverprovisionedRecommender',
      [resource('sql', 'pg-main', 'europe-west1')],
    );

    expect(mapped?.resourceId).toBe('p/sql/pg-main');
    expect(mapped?.monthlySavingsUsd).toBe(23);
  });

  it('derives regions, zones, and global locations without duplicates', () => {
    expect(
      deriveRecommendationLocations([
        resource('vm', 'gpu-box', 'europe-west4-b'),
        resource('sql', 'pg-main', 'europe-west1'),
        resource('storage', 'bucket'),
      ]),
    ).toEqual(['europe-west1', 'europe-west4', 'europe-west4-b', 'global']);
  });
});
