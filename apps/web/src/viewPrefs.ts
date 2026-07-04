import { useCallback, useState } from 'react';
import type { Project, Status } from '@amon-sul/shared';

export type SortMode = 'config' | 'status' | 'name' | 'resources';

export const SORT_LABELS: Record<SortMode, string> = {
  config: 'config order',
  status: 'problems first',
  name: 'name',
  resources: 'most resources',
};

export interface ViewPrefs {
  hidden: string[];
  sort: SortMode;
}

const STORAGE_KEY = 'amon-sul:view';
const DEFAULT_PREFS: ViewPrefs = { hidden: [], sort: 'config' };

function loadPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((h) => typeof h === 'string')
        : [],
      sort: parsed.sort && parsed.sort in SORT_LABELS ? parsed.sort : 'config',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const STATUS_RANK: Record<Status, number> = { err: 0, warn: 1, unknown: 2, idle: 3, ok: 4 };

/** Stable sort of projects for the canvas and sidebar. 'config' keeps server order. */
export function sortProjects(projects: Project[], mode: SortMode): Project[] {
  if (mode === 'config') return projects;
  const sorted = [...projects];
  switch (mode) {
    case 'status':
      sorted.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
      break;
    case 'name':
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    case 'resources':
      sorted.sort((a, b) => b.resources.length - a.resources.length);
      break;
  }
  return sorted;
}

export interface ViewPrefsApi extends ViewPrefs {
  hide: (projectId: string) => void;
  show: (projectId: string) => void;
  setSort: (mode: SortMode) => void;
}

export function useViewPrefs(): ViewPrefsApi {
  const [prefs, setPrefs] = useState<ViewPrefs>(loadPrefs);

  const update = useCallback((next: ViewPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — prefs stay session-only
    }
  }, []);

  return {
    ...prefs,
    hide: (projectId) => update({ ...prefs, hidden: [...new Set([...prefs.hidden, projectId])] }),
    show: (projectId) =>
      update({ ...prefs, hidden: prefs.hidden.filter((id) => id !== projectId) }),
    setSort: (sort) => update({ ...prefs, sort }),
  };
}
