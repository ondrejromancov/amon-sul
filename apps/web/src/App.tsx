import { useState } from 'react';
import { Canvas } from './components/Canvas';
import { Drawer, type DrawerState } from './components/Drawer';
import { EventRail } from './components/EventRail';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { useFleet } from './useFleet';

export default function App() {
  const { snapshot, freshEventId, connection, refresh } = useFleet();
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  if (connection === 'error' && !snapshot) {
    return (
      <div className="fullscreen-state">
        <p>Could not reach the Amon Sûl server.</p>
        <button onClick={refresh}>retry</button>
      </div>
    );
  }
  if (!snapshot) {
    return <div className="fullscreen-state">watching the palantír…</div>;
  }

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
          errorCount={snapshot.events.filter((e) => e.severity === 'err').length}
          onErrors={() => setDrawer({ kind: 'errors' })}
          mock={snapshot.mode === 'mock'}
        />
        <Sidebar snapshot={snapshot} activeProjectId={activeProjectId} onSelect={scrollToProject} />
        <Canvas
          snapshot={snapshot}
          query={query}
          selectedId={drawer?.kind === 'resource' ? drawer.resourceId : null}
          onOpen={openResource}
        />
        <EventRail
          snapshot={snapshot}
          freshEventId={freshEventId}
          live={connection === 'live'}
          onOpen={openResource}
        />
      </div>
      <Drawer
        state={drawer}
        snapshot={snapshot}
        onClose={() => setDrawer(null)}
        onJump={openResource}
      />
      <Toast message={connection === 'reconnecting' ? 'connection lost — reconnecting…' : null} />
    </>
  );
}
