import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '@amon-sul/shared';
import { sortProjects, useViewPrefs } from './viewPrefs';

function proj(id: string, status: Project['status'], resources: number): Project {
  return {
    id,
    displayName: id,
    status,
    board: { w: 470, h: 230 },
    edges: [],
    resources: Array.from({ length: resources }, (_, i) => ({
      id: `${id}/run/r${i}`,
      projectId: id,
      type: 'run' as const,
      name: `r${i}`,
      status: 'ok' as const,
      statusText: '',
      consoleLinks: [],
      layout: { x: 0, y: 0 },
    })),
  };
}

const projects = [proj('alpha', 'ok', 1), proj('zulu', 'err', 3), proj('mid', 'warn', 2)];

describe('sortProjects', () => {
  it('keeps config order by default', () => {
    expect(sortProjects(projects, 'config').map((p) => p.id)).toEqual(['alpha', 'zulu', 'mid']);
  });

  it('sorts problems first', () => {
    expect(sortProjects(projects, 'status').map((p) => p.id)).toEqual(['zulu', 'mid', 'alpha']);
  });

  it('sorts by name and by resource count', () => {
    expect(sortProjects(projects, 'name').map((p) => p.id)).toEqual(['alpha', 'mid', 'zulu']);
    expect(sortProjects(projects, 'resources').map((p) => p.id)).toEqual(['zulu', 'mid', 'alpha']);
  });

  it('does not mutate the input', () => {
    const input = [...projects];
    sortProjects(input, 'status');
    expect(input.map((p) => p.id)).toEqual(['alpha', 'zulu', 'mid']);
  });
});

describe('useViewPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('hides, shows, and persists across instances', () => {
    const first = renderHook(() => useViewPrefs());
    act(() => first.result.current.hide('alpha'));
    act(() => first.result.current.setSort('status'));
    expect(first.result.current.hidden).toEqual(['alpha']);

    const second = renderHook(() => useViewPrefs());
    expect(second.result.current.hidden).toEqual(['alpha']);
    expect(second.result.current.sort).toBe('status');

    act(() => second.result.current.show('alpha'));
    expect(second.result.current.hidden).toEqual([]);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('amon-sul:view', '{not json');
    const { result } = renderHook(() => useViewPrefs());
    expect(result.current.hidden).toEqual([]);
    expect(result.current.sort).toBe('config');
  });
});
