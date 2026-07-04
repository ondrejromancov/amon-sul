import type { FleetSnapshot } from '@amon-sul/shared';
import './sidebar.css';

interface Props {
  snapshot: FleetSnapshot;
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
}

export function Sidebar({ snapshot, activeProjectId, onSelect }: Props) {
  const services = snapshot.projects.reduce((a, p) => a + p.resources.length, 0);
  const errors = snapshot.events.filter((e) => e.severity === 'err').length;
  return (
    <aside>
      <div className="fleetstats">
        <div className="stat">
          <b>{snapshot.projects.length}</b>
          <span>projects</span>
        </div>
        <div className="stat">
          <b>{services}</b>
          <span>services</span>
        </div>
        <div className="stat err">
          <b>{errors}</b>
          <span>errors 24h</span>
        </div>
      </div>
      <div className="sidelabel">GCP projects</div>
      <nav>
        {snapshot.projects.map((p) => (
          <div
            key={p.id}
            className={`projitem${p.id === activeProjectId ? ' active' : ''}`}
            tabIndex={0}
            role="button"
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)}
          >
            <span className={`dot ${p.status}`} />
            <div>
              <div className="pname">{p.displayName}</div>
              <div className="pid">{p.id}</div>
            </div>
            <span className="pcount">{p.resources.length}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
