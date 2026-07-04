import { useState } from 'react';
import { Canvas } from './components/Canvas';
import { Drawer, type DrawerState } from './components/Drawer';
import { EventRail } from './components/EventRail';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { useFleet } from './useFleet';
import { sortProjects, useViewPrefs } from './viewPrefs';

export default function App() {
  const { snapshot, freshEventId, connection, refresh } = useFleet();
  const prefs = useViewPrefs();
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

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

  const openResource = (resourceId: string) => setDrawer({ kind: 'resource', resourceId });
  const scrollToProject = (projectId: string) => {
    setActiveProjectId(projectId);
    document
      .getElementById(`g-${projectId}`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <>
      <div id="app">
        <Header
          query={query}
          onQuery={setQuery}
          errorCount={visibleEvents.filter((e) => e.severity === 'err').length}
          onErrors={() => setDrawer({ kind: 'errors' })}
          mock={snapshot.mode === 'mock'}
        />
        <Sidebar
          visible={visible}
          hidden={hidden}
          events={visibleEvents}
          sort={prefs.sort}
          onSort={prefs.setSort}
          onHide={prefs.hide}
          onShow={prefs.show}
          activeProjectId={activeProjectId}
          onSelect={scrollToProject}
        />
        <Canvas
          projects={visible}
          query={query}
          selectedId={drawer?.kind === 'resource' ? drawer.resourceId : null}
          onOpen={openResource}
        />
        <EventRail
          events={visibleEvents}
          projects={snapshot.projects}
          freshEventId={freshEventId}
          live={connection === 'live'}
          onOpen={openResource}
        />
      </div>
      <Drawer
        state={drawer}
        snapshot={{ ...snapshot, events: visibleEvents }}
        onClose={() => setDrawer(null)}
        onJump={openResource}
      />
      <Toast message={connection === 'reconnecting' ? 'connection lost — reconnecting…' : null} />
    </>
  );
}
