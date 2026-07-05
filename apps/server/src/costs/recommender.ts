import { createHash } from 'node:crypto';
import { google, type recommender_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Project, Recommendation, Resource } from '@amon-sul/shared';
import { isApiDisabled } from '../collectors/types.js';

export const RECOMMENDER_IDS = [
  'google.compute.instance.IdleResourceRecommender',
  'google.compute.instance.MachineTypeRecommender',
  'google.cloudsql.instance.IdleRecommender',
  'google.cloudsql.instance.OverprovisionedRecommender',
] as const;

const MONTH_SECONDS = 30 * 24 * 60 * 60;

type GcpRecommendation = recommender_v1.Schema$GoogleCloudRecommenderV1Recommendation;

export function deriveRecommendationLocations(resources: Resource[]): string[] {
  const locations = new Set<string>(['global']);
  for (const resource of resources) {
    if (!resource.region) continue;
    locations.add(resource.region);
    const regionFromZone = /^(.+\d)-[a-z]$/.exec(resource.region)?.[1];
    if (regionFromZone) locations.add(regionFromZone);
  }
  return [...locations]
    .filter((location) => location !== 'global')
    .sort()
    .concat('global');
}

export function mapRecommendation(
  recommendation: GcpRecommendation,
  projectId: string,
  recommender: string,
  resources: Resource[],
): Recommendation {
  return {
    id: recommendation.name ?? fallbackId(projectId, recommender, recommendation),
    projectId,
    resourceId: matchRecommendedResource(recommendation, recommender, resources),
    description:
      recommendation.description?.trim() || recommendation.recommenderSubtype || recommender,
    monthlySavingsUsd: monthlySavings(recommendation.primaryImpact?.costProjection),
    recommender,
  };
}

export function mapRecommendations(
  recommendations: GcpRecommendation[],
  projectId: string,
  recommender: string,
  resources: Resource[],
): Recommendation[] {
  return recommendations.map((recommendation) =>
    mapRecommendation(recommendation, projectId, recommender, resources),
  );
}

export async function fetchFleetRecommendations(
  projects: Project[],
  auth: GoogleAuth,
): Promise<Recommendation[]> {
  const client = google.recommender({ version: 'v1', auth });
  const batches = await Promise.all(
    projects.map((project) => fetchProjectRecommendations(project, client)),
  );
  const byId = new Map<string, Recommendation>();
  for (const recommendation of batches.flat()) byId.set(recommendation.id, recommendation);
  return [...byId.values()].sort((a, b) => {
    const savings = (b.monthlySavingsUsd ?? 0) - (a.monthlySavingsUsd ?? 0);
    return (
      savings ||
      a.projectId.localeCompare(b.projectId) ||
      a.description.localeCompare(b.description)
    );
  });
}

async function fetchProjectRecommendations(
  project: Project,
  client: recommender_v1.Recommender,
): Promise<Recommendation[]> {
  const locations = deriveRecommendationLocations(project.resources);
  const batches = await Promise.all(
    locations.flatMap((location) =>
      RECOMMENDER_IDS.map(async (recommender) => {
        const parent = `projects/${project.id}/locations/${location}/recommenders/${recommender}`;
        const recommendations = await listActiveRecommendations(client, parent);
        return mapRecommendations(recommendations, project.id, recommender, project.resources);
      }),
    ),
  );
  return batches.flat();
}

async function listActiveRecommendations(
  client: recommender_v1.Recommender,
  parent: string,
): Promise<GcpRecommendation[]> {
  const recommendations: GcpRecommendation[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const res = await client.projects.locations.recommenders.recommendations.list({
        parent,
        filter: 'stateInfo.state = ACTIVE',
        pageSize: 100,
        pageToken,
      });
      recommendations.push(...(res.data.recommendations ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (e) {
    if (isSkippableRecommenderError(e)) return [];
    throw e;
  }
  return recommendations;
}

function isSkippableRecommenderError(e: unknown): boolean {
  const err = e as { code?: number | string; response?: { status?: number } };
  const status = Number(err.response?.status ?? err.code);
  return status === 404 || isApiDisabled(e);
}

function monthlySavings(
  costProjection: recommender_v1.Schema$GoogleCloudRecommenderV1CostProjection | undefined,
): number | undefined {
  const cost = costProjection?.cost;
  if (!cost) return undefined;
  const raw = Number(cost.units ?? 0) + Number(cost.nanos ?? 0) / 1e9;
  const seconds = durationSeconds(costProjection.duration);
  const savings = -raw * (MONTH_SECONDS / seconds);
  return Number.isFinite(savings) && savings > 0 ? round2(savings) : undefined;
}

function durationSeconds(duration: string | null | undefined): number {
  if (!duration) return MONTH_SECONDS;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration);
  if (!match) return MONTH_SECONDS;
  const seconds = Number(match[1]);
  return seconds > 0 ? seconds : MONTH_SECONDS;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function matchRecommendedResource(
  recommendation: GcpRecommendation,
  recommender: string,
  resources: Resource[],
): string | undefined {
  const resourceType = recommender.includes('.compute.instance.')
    ? 'vm'
    : recommender.includes('.cloudsql.instance.')
      ? 'sql'
      : undefined;
  if (!resourceType) return undefined;

  const targetNames = extractTargetResources(recommendation).map(lastSegment);
  return resources.find(
    (resource) => resource.type === resourceType && targetNames.includes(resource.name),
  )?.id;
}

function extractTargetResources(recommendation: GcpRecommendation): string[] {
  const targets = new Set<string>();
  for (const target of recommendation.targetResources ?? []) {
    if (target) targets.add(target);
  }
  for (const group of recommendation.content?.operationGroups ?? []) {
    for (const operation of group.operations ?? []) {
      if (operation.resource) targets.add(operation.resource);
      if (operation.sourceResource) targets.add(operation.sourceResource);
    }
  }
  return [...targets];
}

function lastSegment(name: string): string {
  return name.split('/').filter(Boolean).pop() ?? '';
}

function fallbackId(
  projectId: string,
  recommender: string,
  recommendation: GcpRecommendation,
): string {
  return createHash('sha256')
    .update(`${projectId}:${recommender}:${recommendation.description ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}
