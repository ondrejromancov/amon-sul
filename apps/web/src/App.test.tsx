import { render, screen, fireEvent } from '@testing-library/react';
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
      board: { w: 470, h: 230 },
      edges: [['rankforge-prod/run/api', 'rankforge-prod/sql/db']],
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
          layout: { x: 275, y: 20 },
        },
      ],
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
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {}
}

beforeEach(() => {
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
  // jsdom has no canvas; Spark guards on missing context
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders projects, nodes and events from the snapshot', async () => {
    render(<App />);
    expect((await screen.findAllByText('Rankforge')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('api').length).toBeGreaterThan(0);
    expect(screen.getByText('mock data')).toBeInTheDocument();
    expect(screen.getByText(/something broke/)).toBeInTheDocument();
  });

  it('dims non-matching nodes when searching', async () => {
    render(<App />);
    await screen.findAllByText('Rankforge');
    fireEvent.change(screen.getByLabelText('Filter services'), { target: { value: 'api' } });
    const apiNode = screen.getByRole('button', { name: /api, Cloud Run/ });
    const dbNode = screen.getByRole('button', { name: /db, Cloud SQL/ });
    expect(apiNode.className).not.toContain('dimmed');
    expect(dbNode.className).toContain('dimmed');
  });

  it('opens the drawer with resource details on node click', async () => {
    render(<App />);
    await screen.findAllByText('Rankforge');
    fireEvent.click(screen.getByRole('button', { name: /api, Cloud Run/ }));
    expect(await screen.findByRole('heading', { name: 'api' })).toBeInTheDocument();
    expect(screen.getByText('service ↗')).toBeInTheDocument();
    expect(screen.getByText('healthy', { exact: false })).toBeDefined();
  });

  it('opens the errors panel from the header button', async () => {
    render(<App />);
    await screen.findAllByText('Rankforge');
    fireEvent.click(screen.getByRole('button', { name: /errors/ }));
    expect(await screen.findByText('Errors & warnings')).toBeInTheDocument();
  });
});
