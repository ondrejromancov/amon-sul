import type { FleetSnapshot, Project, Resource } from '@amon-sul/shared';
import { NODE_H, NODE_W } from '@amon-sul/shared';
import './canvas.css';
import { TYPE_META, TypeIcon } from './icons';

function matchesQuery(r: Resource, p: Project, q: string): boolean {
  const hay = `${r.name} ${TYPE_META[r.type].label} ${p.id} ${p.displayName}`.toLowerCase();
  return hay.includes(q);
}

function Wires({ project }: { project: Project }) {
  const byId = new Map(project.resources.map((r) => [r.id, r]));
  return (
    <svg className="wires" width={project.board.w} height={project.board.h}>
      {project.edges.map(([a, b]) => {
        const na = byId.get(a);
        const nb = byId.get(b);
        if (!na || !nb) return null;
        const y1 = na.layout.y + NODE_H / 2;
        const y2 = nb.layout.y + NODE_H / 2;
        let sx = na.layout.x + NODE_W;
        let tx = nb.layout.x;
        // if target is left of source, route from the left side instead
        if (nb.layout.x + NODE_W / 2 < na.layout.x + NODE_W / 2) {
          sx = na.layout.x;
          tx = nb.layout.x + NODE_W;
        }
        const mx = (sx + tx) / 2;
        return (
          <path
            key={`${a}->${b}`}
            className="wire"
            d={`M ${sx} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${tx} ${y2}`}
          />
        );
      })}
    </svg>
  );
}

function ResourceNode({
  resource,
  dimmed,
  selected,
  onOpen,
}: {
  resource: Resource;
  dimmed: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const meta = TYPE_META[resource.type];
  return (
    <div
      className={`node${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
      style={{ left: resource.layout.x, top: resource.layout.y }}
      tabIndex={0}
      role="button"
      aria-label={`${resource.name}, ${meta.label}, status ${resource.status}`}
      onClick={() => onOpen(resource.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(resource.id)}
    >
      <div className="nrow">
        <div className="nicon" style={{ background: meta.bg }}>
          <TypeIcon type={resource.type} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="nname">{resource.name}</div>
          <div className="ntype">{meta.label}</div>
        </div>
      </div>
      <div className="nstatus">
        <span className={`dot ${resource.status}`} />
        {resource.statusText}
      </div>
    </div>
  );
}

function badge(project: Project) {
  const failing = project.resources.filter((r) => r.status === 'err').length;
  if (failing > 0) return <span className="gbadge err">{failing} failing</span>;
  if (project.status === 'warn') return <span className="gbadge warn">degraded</span>;
  if (project.status === 'unknown') return <span className="gbadge warn">no data</span>;
  return null;
}

interface Props {
  snapshot: FleetSnapshot;
  query: string;
  selectedId: string | null;
  onOpen: (resourceId: string) => void;
}

export function Canvas({ snapshot, query, selectedId, onOpen }: Props) {
  const q = query.trim().toLowerCase();
  return (
    <main>
      <div id="canvas">
        {snapshot.projects.map((p) => (
          <section className="group" key={p.id} id={`g-${p.id}`}>
            <div className="ghead">
              <h2>{p.displayName}</h2>
              <span className="gid">{p.id}</span>
              {badge(p)}
              <a
                href={`https://console.cloud.google.com/home/dashboard?project=${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                open in console ↗
              </a>
            </div>
            <div className="board" style={{ width: p.board.w, height: p.board.h }}>
              <Wires project={p} />
              {p.resources.map((r) => (
                <ResourceNode
                  key={r.id}
                  resource={r}
                  dimmed={q !== '' && !matchesQuery(r, p, q)}
                  selected={r.id === selectedId}
                  onOpen={onOpen}
                />
              ))}
              {p.error && <div className="boarderror">{p.error}</div>}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
