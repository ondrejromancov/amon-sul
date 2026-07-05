import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetSnapshot } from '@amon-sul/shared';
import App from './App';

const snapshot: FleetSnapshot = {
  mode: 'mock',
  fetchedAt: new Date().toISOString(),
  projects: [
    {
      id: 'rankforge-prod',
      displayName: 'Rankforge',
      status: 'warn',
      board: { w: 460, h: 200 },
      edges: [['rankforge-prod/run/api', 'rankforge-prod/sql/db', '340 q/s']],
      resources: [
        {
          id: 'rankforge-prod/run/api',
          projectId: 'rankforge-prod',
          type: 'run',
          name: 'api',
          region: 'europe-west1',
          status: 'ok',
          statusText: 'rev api-00092 · 2m ago',
          consoleLinks: [{ label: 'service', url: 'https://example.com' }],
          details: {
            minInstances: 0,
            maxInstances: 4,
            revision: 'api-00092',
            env: [{ name: 'LOG_LEVEL', value: 'info' }],
          },
          cost: { monthlyUsd: 0, source: 'estimate', note: 'scales to zero' },
          layout: { x: 20, y: 20 },
        },
        {
          id: 'rankforge-prod/sql/db',
          projectId: 'rankforge-prod',
          type: 'sql',
          name: 'db',
          status: 'ok',
          statusText: 'db-g1-small · RUNNABLE',
          consoleLinks: [],
          cost: { monthlyUsd: 31, source: 'estimate', note: 'db-g1-small · compute only' },
          layout: { x: 280, y: 20 },
        },
      ],
    },
    {
      id: 'other-proj',
      displayName: 'Other',
      status: 'ok',
      board: { w: 460, h: 200 },
      edges: [],
      resources: [],
    },
  ],
  events: [
    {
      id: 'e1',
      severity: 'err',
      projectId: 'rankforge-prod',
      resourceId: 'rankforge-prod/run/api',
      message: 'something broke',
      timestamp: new Date().toISOString(),
    },
  ],
  costs: {
    source: 'billing',
    months: [
      {
        month: '2026-06',
        byProject: { 'rankforge-prod': 40 },
        byService: { 'Cloud SQL': 40 },
        totalUsd: 40,
      },
      {
        month: '2026-07',
        byProject: { 'rankforge-prod': 45 },
        byService: { 'Cloud SQL': 45 },
        totalUsd: 45,
      },
    ],
  },
};

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/api/snapshot')) {
        return { ok: true, json: async () => snapshot } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App (v2)', () => {
  it('renders project pills, nodes, edge labels and events', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Rankforge' })).toBeInTheDocument();
    expect(screen.getAllByText('api').length).toBeGreaterThan(0);
    expect(screen.getByText('340 q/s')).toBeInTheDocument();
    expect(screen.getByText('mock data')).toBeInTheDocument();
    expect(screen.getByText(/something broke/)).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('dims non-matching nodes when searching', async () => {
    render(<App />);
    await screen.findByRole('tab', { name: 'Rankforge' });
    fireEvent.change(screen.getByLabelText('Filter services'), { target: { value: 'api' } });
    const apiNode = screen.getByRole('button', { name: /api, Cloud Run/ });
    const dbNode = screen.getByRole('button', { name: /db, Cloud SQL/ });
    expect(apiNode.className).not.toContain('dimmed');
    expect(dbNode.className).toContain('dimmed');
  });

  it('opens the detail panel with scaling, env and console links on node click', async () => {
    render(<App />);
    await screen.findByRole('tab', { name: 'Rankforge' });
    fireEvent.click(screen.getByRole('button', { name: /api, Cloud Run/ }));
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Scaling')).toBeInTheDocument();
    expect(screen.getByText('Min instances')).toBeInTheDocument();
    expect(screen.getByText('LOG_LEVEL')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getAllByText(/rev api-00092/).length).toBeGreaterThan(0);
  });

  it('focuses a project via its pill and shows others as cluster chips', async () => {
    render(<App />);
    await screen.findByRole('tab', { name: 'Rankforge' });
    fireEvent.click(screen.getByRole('tab', { name: 'Rankforge' }));
    // Other project collapses into a cluster chip
    expect(screen.getByRole('button', { name: /Other · 0/ })).toBeInTheDocument();
    // Clicking the chip focuses that project instead
    fireEvent.click(screen.getByRole('button', { name: /Other · 0/ }));
    expect(screen.getByRole('button', { name: /Rankforge · 2/ })).toBeInTheDocument();
  });

  it('shows node cost chips and the costs view with charts and table', async () => {
    render(<App />);
    await screen.findByRole('tab', { name: 'Rankforge' });
    // cost chip on the sql node
    expect(screen.getByText('~$31/mo')).toBeInTheDocument();
    // switch to costs view
    fireEvent.click(screen.getByRole('button', { name: '$ Costs' }));
    expect(await screen.findByText('Costs')).toBeInTheDocument();
    expect(screen.getByText('actuals from billing export')).toBeInTheDocument();
    expect(screen.getByText('2026-07 actual')).toBeInTheDocument();
    expect(screen.getByText('Monthly spend')).toBeInTheDocument();
    // resource table lists the priced sql instance
    expect(screen.getByText('db-g1-small · compute only')).toBeInTheDocument();
    // back to graph
    fireEvent.click(screen.getByRole('button', { name: '$ Costs' }));
    expect(screen.getByRole('button', { name: /api, Cloud Run/ })).toBeInTheDocument();
  });

  it('hides a project via the pill and restores it from the hidden pill', async () => {
    render(<App />);
    await screen.findByRole('tab', { name: 'Rankforge' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Rankforge' }));
    expect(screen.queryByRole('tab', { name: 'Rankforge' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1 hidden/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Rankforge' }));
    expect(await screen.findByRole('tab', { name: 'Rankforge' })).toBeInTheDocument();
  });
});
