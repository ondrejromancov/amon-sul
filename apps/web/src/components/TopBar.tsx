import { useEffect, useRef, useState } from 'react';
import type { Project } from '@amon-sul/shared';
import { SORT_LABELS, type SortMode } from '../viewPrefs';
import './topbar.css';

export type ProjectFilter = 'all' | string;

interface Props {
  visible: Project[];
  hidden: Project[];
  filter: ProjectFilter;
  onFilter: (f: ProjectFilter) => void;
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  onHide: (projectId: string) => void;
  onShow: (projectId: string) => void;
  query: string;
  onQuery: (q: string) => void;
  mock: boolean;
  view: 'graph' | 'costs';
  onView: (view: 'graph' | 'costs') => void;
}

export function TopBar({
  visible,
  hidden,
  filter,
  onFilter,
  sort,
  onSort,
  onHide,
  onShow,
  query,
  onQuery,
  mock,
  view,
  onView,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brandmark">▲</div>
        <span className="brandname">Amon Sûl</span>
      </div>
      <div className="pills" role="tablist" aria-label="Projects">
        <button
          className={`pill${filter === 'all' ? ' active' : ''}`}
          role="tab"
          aria-selected={filter === 'all'}
          onClick={() => onFilter('all')}
        >
          All projects
        </button>
        {visible.map((p) => (
          <span key={p.id} className={`pill pillproj${filter === p.id ? ' active' : ''}`}>
            <button
              className="pill-label"
              role="tab"
              aria-selected={filter === p.id}
              onClick={() => onFilter(p.id)}
            >
              {p.displayName}
            </button>
            <button
              className="pill-eye"
              aria-label={`Hide ${p.displayName}`}
              title="hide project"
              onClick={() => onHide(p.id)}
            >
              ✕
            </button>
          </span>
        ))}
        {hidden.length > 0 && (
          <button
            className={`pill dimmed`}
            onClick={() => setShowHidden(!showHidden)}
            aria-expanded={showHidden}
          >
            {hidden.length} hidden {showHidden ? '▴' : '▾'}
          </button>
        )}
        {showHidden &&
          hidden.map((p) => (
            <button
              key={p.id}
              className="pill dimmed"
              onClick={() => onShow(p.id)}
              aria-label={`Show ${p.displayName}`}
              title="show project"
            >
              {p.displayName} ⊕
            </button>
          ))}
      </div>
      <div className="topspacer" />
      <button
        className={`pill${view === 'costs' ? ' active' : ''}`}
        aria-pressed={view === 'costs'}
        onClick={() => onView(view === 'costs' ? 'graph' : 'costs')}
      >
        $ Costs
      </button>
      {mock && <span className="mockbadge">mock data</span>}
      <select
        className="sortselect"
        aria-label="Sort projects"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortMode)}
      >
        {Object.entries(SORT_LABELS).map(([mode, label]) => (
          <option key={mode} value={mode}>
            {label}
          </option>
        ))}
      </select>
      <div className="searchbox">
        <span className="searchglyph">⌕</span>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search…"
          aria-label="Filter services"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <span className="searchkbd">⌘K</span>
      </div>
    </header>
  );
}
