import { describe, expect, it, vi } from 'vitest';
import type { GoogleAuth } from 'google-auth-library';
import type { Project, Resource } from '@amon-sul/shared';
import {
  ActionInputError,
  ActionNotFoundError,
  executeAction,
  type ActionClients,
} from './actions.js';
import { FleetStore } from './store.js';

function resource(type: Resource['type'], name: string, region?: string): Resource {
  return {
    id: `p/${type}/${name}`,
    projectId: 'p',
    type,
    name,
    region,
    status: 'ok',
    statusText: 'ok',
    consoleLinks: [],
    layout: { x: 0, y: 0 },
  };
}

function store(): FleetStore {
  const store = new FleetStore('live');
  const project: Project = {
    id: 'p',
    displayName: 'p',
    status: 'ok',
    board: { w: 1, h: 1 },
    edges: [],
    resources: [
      resource('vm', 'gpu-box', 'europe-west4-b'),
      resource('run', 'api', 'europe-west1'),
      resource('scheduler', 'nightly-crawl', 'europe-west1'),
      resource('storage', 'bucket'),
    ],
  };
  store.setProjects([project]);
  return store;
}

function clients() {
  const calls = {
    computeStart: vi.fn(async () => undefined),
    computeStop: vi.fn(async () => undefined),
    runGet: vi.fn(async () => ({
      data: {
        template: {
          containers: [{ image: 'europe-docker.pkg.dev/p/app/api:latest' }],
          scaling: { maxInstanceCount: 10 },
        },
      },
    })),
    runPatch: vi.fn(async () => undefined),
    schedulerPause: vi.fn(async () => undefined),
    schedulerResume: vi.fn(async () => undefined),
  };

  const clients: ActionClients = {
    compute: {
      instances: {
        start: calls.computeStart,
        stop: calls.computeStop,
      },
    },
    run: {
      projects: {
        locations: {
          services: {
            get: calls.runGet,
            patch: calls.runPatch,
          },
        },
      },
    },
    scheduler: {
      projects: {
        locations: {
          jobs: {
            pause: calls.schedulerPause,
            resume: calls.schedulerResume,
          },
        },
      },
    },
  };

  return { clients, calls };
}

const auth = {} as GoogleAuth;

describe('executeAction', () => {
  it('dispatches vm.start and vm.stop to Compute Engine instances', async () => {
    const { clients: stubs, calls } = clients();
    const fleet = store();

    await expect(
      executeAction(fleet, auth, { action: 'vm.start', resourceId: 'p/vm/gpu-box' }, stubs),
    ).resolves.toEqual({ ok: true, message: 'start requested for gpu-box' });
    expect(calls.computeStart).toHaveBeenCalledWith({
      project: 'p',
      zone: 'europe-west4-b',
      instance: 'gpu-box',
    });

    await expect(
      executeAction(fleet, auth, { action: 'vm.stop', resourceId: 'p/vm/gpu-box' }, stubs),
    ).resolves.toEqual({ ok: true, message: 'stop requested for gpu-box' });
    expect(calls.computeStop).toHaveBeenCalledWith({
      project: 'p',
      zone: 'europe-west4-b',
      instance: 'gpu-box',
    });
  });

  it('patches Cloud Run template scaling minInstanceCount', async () => {
    const { clients: stubs, calls } = clients();
    const result = await executeAction(
      store(),
      auth,
      {
        action: 'run.setMinInstances',
        resourceId: 'p/run/api',
        params: { minInstances: 3 },
      },
      stubs,
    );

    expect(result).toEqual({ ok: true, message: 'min-instances set to 3 for api' });
    const name = 'projects/p/locations/europe-west1/services/api';
    expect(calls.runGet).toHaveBeenCalledWith({ name });
    expect(calls.runPatch).toHaveBeenCalledWith({
      name,
      updateMask: 'template.scaling.minInstanceCount',
      requestBody: {
        name,
        template: {
          containers: [{ image: 'europe-docker.pkg.dev/p/app/api:latest' }],
          scaling: { maxInstanceCount: 10, minInstanceCount: 3 },
        },
      },
    });
  });

  it('dispatches scheduler pause and resume to Cloud Scheduler jobs', async () => {
    const { clients: stubs, calls } = clients();
    const fleet = store();
    const name = 'projects/p/locations/europe-west1/jobs/nightly-crawl';

    await expect(
      executeAction(
        fleet,
        auth,
        { action: 'scheduler.pause', resourceId: 'p/scheduler/nightly-crawl' },
        stubs,
      ),
    ).resolves.toEqual({ ok: true, message: 'pause requested for nightly-crawl' });
    expect(calls.schedulerPause).toHaveBeenCalledWith({ name });

    await expect(
      executeAction(
        fleet,
        auth,
        { action: 'scheduler.resume', resourceId: 'p/scheduler/nightly-crawl' },
        stubs,
      ),
    ).resolves.toEqual({ ok: true, message: 'resume requested for nightly-crawl' });
    expect(calls.schedulerResume).toHaveBeenCalledWith({ name });
  });

  it('rejects unknown actions, unknown resources, wrong types, and invalid params', async () => {
    const { clients: stubs, calls } = clients();
    const fleet = store();

    await expect(
      executeAction(fleet, auth, { action: 'vm.reboot', resourceId: 'p/vm/gpu-box' }, stubs),
    ).rejects.toBeInstanceOf(ActionInputError);

    await expect(
      executeAction(fleet, auth, { action: 'vm.start', resourceId: 'p/vm/missing' }, stubs),
    ).rejects.toBeInstanceOf(ActionNotFoundError);

    await expect(
      executeAction(fleet, auth, { action: 'vm.start', resourceId: 'p/storage/bucket' }, stubs),
    ).rejects.toMatchObject({ message: 'vm.start requires vm resource' });

    await expect(
      executeAction(
        fleet,
        auth,
        {
          action: 'run.setMinInstances',
          resourceId: 'p/run/api',
          params: { minInstances: 1.5 },
        },
        stubs,
      ),
    ).rejects.toMatchObject({ message: 'run.setMinInstances requires integer minInstances 0-100' });

    expect(calls.computeStart).not.toHaveBeenCalled();
    expect(calls.runPatch).not.toHaveBeenCalled();
  });
});
