import { useState } from 'react';
import { Canvas } from './components/Canvas';
import { CostsView } from './components/CostsView';
import { DetailPanel } from './components/DetailPanel';
import { EventsPanel } from './components/EventsPanel';
import { Toast } from './components/Toast';
import { TopBar, type ProjectFilter } from './components/TopBar';
import { useFleet } from './useFleet';
import { sortProjects, useViewPrefs } from './viewPrefs';

export default function App() {
  const { snapshot, freshEventId, connection, refresh } = useFleet();
  const prefs = useViewPrefs();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'costs'>('graph');

  if (connection === 'error' && !snapshot) {
    return (
      <div className="fullscreen-state">
        <p>Could not reach the Amon Sûl server — is `npm run dev` running?</p>
        <button onClick={refresh}>retry</button>
      </div>
    );
  }
  if (!snapshot) {
    return <div className="fullscreen-state">watching the palantír…</div>;
  }

  const hiddenSet = new Set(prefs.hidden);
  const visible = sortProjects(
    snapshot.projects.filter((p) => !hiddenSet.has(p.id)),
    prefs.sort,
  );
  const hidden = snapshot.projects.filter((p) => hiddenSet.has(p.id));
  const visibleEvents = snapshot.events.filter((e) => !hiddenSet.has(e.projectId));
  const panelEvents =
    filter === 'all' ? visibleEvents : visibleEvents.filter((e) => e.projectId === filter);

  const selected =
    snapshot.projects.flatMap((p) => p.resources).find((r) => r.id === selectedId) ?? null;

  const openResource = (resourceId: string) => setSelectedId(resourceId);
  const hideProject = (projectId: string) => {
    prefs.hide(projectId);
    if (filter === projectId) setFilter('all');
    if (selected?.projectId === projectId) setSelectedId(null);
  };

  return (
    <>
      <div id="app">
        <TopBar
          visible={visible}
          hidden={hidden}
          filter={filter}
          onFilter={setFilter}
          sort={prefs.sort}
          onSort={prefs.setSort}
          onHide={hideProject}
          onShow={prefs.show}
          query={query}
          onQuery={setQuery}
          mock={snapshot.mode === 'mock'}
          view={view}
          onView={setView}
        />
        <div className="mainrow">
          {view === 'costs' ? (
            <CostsView
              projects={visible}
              costs={snapshot.costs}
              recommendations={snapshot.recommendations}
            />
          ) : (
            <Canvas
              projects={visible}
              events={visibleEvents}
              filter={filter}
              onFilter={setFilter}
              query={query}
              selectedId={selectedId}
              onOpen={openResource}
            />
          )}
          <DetailPanel resource={selected} onClose={() => setSelectedId(null)} />
          <EventsPanel
            events={panelEvents}
            projects={snapshot.projects}
            freshEventId={freshEventId}
            live={connection === 'live'}
            onOpen={openResource}
          />
        </div>
      </div>
      <Toast message={connection === 'reconnecting' ? 'connection lost — reconnecting…' : null} />
    </>
  );
}
