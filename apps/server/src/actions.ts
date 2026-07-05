import { google, type run_v2 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import type { Resource, ResourceType } from '@amon-sul/shared';
import type { FleetStore } from './store.js';

export type ActionName =
  'vm.start' | 'vm.stop' | 'run.setMinInstances' | 'scheduler.pause' | 'scheduler.resume';

export interface ActionResult {
  ok: true;
  message: string;
}

export interface ActionBody {
  action: ActionName;
  resourceId: string;
  params?: {
    minInstances?: number;
  };
}

interface ResolvedAction {
  body: ActionBody;
  resource: Resource;
  region: string;
}

interface ComputeActionClient {
  instances: {
    start(params: { project: string; zone: string; instance: string }): Promise<unknown>;
    stop(params: { project: string; zone: string; instance: string }): Promise<unknown>;
  };
}

interface RunActionClient {
  projects: {
    locations: {
      services: {
        get(params: { name: string }): Promise<{ data: run_v2.Schema$GoogleCloudRunV2Service }>;
        patch(params: {
          name: string;
          updateMask: string;
          requestBody: run_v2.Schema$GoogleCloudRunV2Service;
        }): Promise<unknown>;
      };
    };
  };
}

interface SchedulerActionClient {
  projects: {
    locations: {
      jobs: {
        pause(params: { name: string }): Promise<unknown>;
        resume(params: { name: string }): Promise<unknown>;
      };
    };
  };
}

export interface ActionClients {
  compute: ComputeActionClient;
  run: RunActionClient;
  scheduler: SchedulerActionClient;
}

export class ActionInputError extends Error {
  readonly statusCode = 400;
}

export class ActionNotFoundError extends Error {
  readonly statusCode = 404;
}

const ACTION_RESOURCE_TYPES: Record<ActionName, ResourceType> = {
  'vm.start': 'vm',
  'vm.stop': 'vm',
  'run.setMinInstances': 'run',
  'scheduler.pause': 'scheduler',
  'scheduler.resume': 'scheduler',
};

export function actionErrorStatus(error: unknown): 400 | 404 | null {
  if (error instanceof ActionInputError) return 400;
  if (error instanceof ActionNotFoundError) return 404;
  return null;
}

export function validateAction(store: FleetStore, body: unknown): ResolvedAction {
  const parsed = parseActionBody(body);
  const resource = findResource(store, parsed.resourceId);
  if (!resource) throw new ActionNotFoundError(`unknown resource: ${parsed.resourceId}`);

  const expectedType = ACTION_RESOURCE_TYPES[parsed.action];
  if (resource.type !== expectedType) {
    throw new ActionInputError(`${parsed.action} requires ${expectedType} resource`);
  }
  const region = resource.region;
  if (!region) {
    throw new ActionInputError(`${resource.id} has no region or zone`);
  }

  return { body: parsed, resource, region };
}

export async function executeAction(
  store: FleetStore,
  auth: GoogleAuth,
  body: unknown,
  clients?: ActionClients,
): Promise<ActionResult> {
  const request = validateAction(store, body);
  const actionClients = clients ?? googleActionClients(auth);
  const { action } = request.body;
  const { resource, region } = request;

  switch (action) {
    case 'vm.start':
      await actionClients.compute.instances.start({
        project: resource.projectId,
        zone: region,
        instance: resource.name,
      });
      return { ok: true, message: `start requested for ${resource.name}` };
    case 'vm.stop':
      await actionClients.compute.instances.stop({
        project: resource.projectId,
        zone: region,
        instance: resource.name,
      });
      return { ok: true, message: `stop requested for ${resource.name}` };
    case 'run.setMinInstances':
      await setCloudRunMinInstances(
        actionClients.run,
        resource,
        region,
        request.body.params!.minInstances!,
      );
      return {
        ok: true,
        message: `min-instances set to ${request.body.params!.minInstances} for ${resource.name}`,
      };
    case 'scheduler.pause':
      await actionClients.scheduler.projects.locations.jobs.pause({
        name: schedulerJobName(resource, region),
      });
      return { ok: true, message: `pause requested for ${resource.name}` };
    case 'scheduler.resume':
      await actionClients.scheduler.projects.locations.jobs.resume({
        name: schedulerJobName(resource, region),
      });
      return { ok: true, message: `resume requested for ${resource.name}` };
  }
}

function googleActionClients(auth: GoogleAuth): ActionClients {
  return {
    compute: google.compute({ version: 'v1', auth }),
    run: google.run({ version: 'v2', auth }),
    scheduler: google.cloudscheduler({ version: 'v1', auth }),
  };
}

function parseActionBody(body: unknown): ActionBody {
  if (!isRecord(body)) throw new ActionInputError('action body must be an object');

  const action = body.action;
  if (!isActionName(action)) throw new ActionInputError(`unknown action: ${String(action)}`);

  const resourceId = body.resourceId;
  if (typeof resourceId !== 'string' || resourceId.length === 0) {
    throw new ActionInputError('resourceId must be a non-empty string');
  }

  const params = body.params;
  if (params !== undefined && !isRecord(params)) {
    throw new ActionInputError('params must be an object');
  }

  if (action === 'run.setMinInstances') {
    const minInstances = params?.minInstances;
    if (
      typeof minInstances !== 'number' ||
      !Number.isInteger(minInstances) ||
      minInstances < 0 ||
      minInstances > 100
    ) {
      throw new ActionInputError('run.setMinInstances requires integer minInstances 0-100');
    }
    return { action, resourceId, params: { minInstances } };
  }

  return { action, resourceId };
}

function isActionName(value: unknown): value is ActionName {
  return (
    value === 'vm.start' ||
    value === 'vm.stop' ||
    value === 'run.setMinInstances' ||
    value === 'scheduler.pause' ||
    value === 'scheduler.resume'
  );
}

function findResource(store: FleetStore, resourceId: string): Resource | undefined {
  return store
    .getSnapshot()
    .projects.flatMap((project) => project.resources)
    .find((resource) => resource.id === resourceId);
}

async function setCloudRunMinInstances(
  client: RunActionClient,
  resource: Resource,
  region: string,
  minInstances: number,
): Promise<void> {
  const name = runServiceName(resource, region);
  const current = await client.projects.locations.services.get({ name });
  const template: run_v2.Schema$GoogleCloudRunV2RevisionTemplate = {
    ...(current.data.template ?? {}),
    scaling: {
      ...(current.data.template?.scaling ?? {}),
      minInstanceCount: minInstances,
    },
  };

  await client.projects.locations.services.patch({
    name,
    updateMask: 'template.scaling.minInstanceCount',
    requestBody: { name, template },
  });
}

function runServiceName(resource: Resource, region: string): string {
  return `projects/${resource.projectId}/locations/${region}/services/${resource.name}`;
}

function schedulerJobName(resource: Resource, region: string): string {
  return `projects/${resource.projectId}/locations/${region}/jobs/${resource.name}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
