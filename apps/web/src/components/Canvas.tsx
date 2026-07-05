import { Fragment } from 'react';
import { NODE_H, NODE_W, type Project, type Resource } from '@amon-sul/shared';
import {
  CATEGORY_COLOR,
  CATEGORY_OF,
  CATEGORY_TINT,
  STATUS_COLOR,
  TYPE_BADGE,
  TYPE_LABEL,
} from '../categories';
import type { ProjectFilter } from './TopBar';
import './canvas.css';

const LABEL_H = 36;
const ARROW_GAP = 8;

function projectMonthlyUsd(project: Project): number {
  return project.resources.reduce((a, r) => a + (r.cost?.monthlyUsd ?? 0), 0);
}

function matchesQuery(r: Resource, p: Project, q: string): boolean {
  const hay = `${r.name} ${TYPE_LABEL[r.type]} ${p.id} ${p.displayName}`.toLowerCase();
  return hay.includes(q);
}

function TypeChip({ type }: { type: Resource['type'] }) {
  const [bg, fg] = CATEGORY_TINT[CATEGORY_OF[type]];
  return (
    <span className="typechip" style={{ background: bg, color: fg }}>
      {TYPE_BADGE[type]}
    </span>
  );
}

function StatusDot({ status }: { status: Resource['status'] }) {
  const cls = status === 'err' ? ' pulse-red' : status === 'warn' ? ' pulse-amber' : '';
  return <span className={`statusdot${cls}`} style={{ background: STATUS_COLOR[status] }} />;
}

function NodeCard({
  resource,
  top,
  dimmed,
  selected,
  onOpen,
}: {
  resource: Resource;
  top: number;
  dimmed: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const cat = CATEGORY_OF[resource.type];
  const metrics = resource.statusText.split('·').map((s) => s.trim());
  const tone =
    resource.status === 'warn' ? '#b06a08' : resource.status === 'err' ? '#b13030' : undefined;
  return (
    <div
      className={`nodecard${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
      style={{ left: resource.layout.x, top, borderLeftColor: CATEGORY_COLOR[cat] }}
      tabIndex={0}
      role="button"
      aria-label={`${resource.name}, ${TYPE_LABEL[resource.type]}, status ${resource.status}`}
      onClick={() => onOpen(resource.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(resource.id)}
    >
      <div className="noderow">
        <TypeChip type={resource.type} />
        <span className="nodename">{resource.name}</span>
        <StatusDot status={resource.status} />
      </div>
      <div className="nodemetrics" style={tone ? { color: tone } : undefined}>
        {metrics.map((m, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="metricsep">│</span>}
            <span>{m}</span>
          </Fragment>
        ))}
        {(resource.cost?.monthlyUsd ?? 0) > 0 && (
          <>
            <span className="metricsep">│</span>
            <span className="nodecost" title={resource.cost!.note}>
              ~${Math.round(resource.cost!.monthlyUsd)}/mo
            </span>
          </>
        )}
      </div>
    </div>
  );
}

interface EdgeGeom {
  sx: number;
  tx: number;
  y1: number;
  y2: number;
  portS: [number, number];
  portT: [number, number];
  arrow: string;
  color: string;
  dashed: boolean;
  label?: string;
}

function edgeGeometry(project: Project): EdgeGeom[] {
  const byId = new Map(project.resources.map((r) => [r.id, r]));
  const geoms: EdgeGeom[] = [];
  for (const edge of project.edges) {
    const [a, b, label] = edge;
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    const y1 = na.layout.y + NODE_H / 2 + LABEL_H;
    const y2 = nb.layout.y + NODE_H / 2 + LABEL_H;
    const leftward = nb.layout.x + NODE_W / 2 < na.layout.x + NODE_W / 2;
    const sx = leftward ? na.layout.x : na.layout.x + NODE_W;
    const portTx = leftward ? nb.layout.x + NODE_W : nb.layout.x;
    const tx = leftward ? portTx + ARROW_GAP : portTx - ARROW_GAP;
    const dir = leftward ? 6 : -6;
    const color = CATEGORY_COLOR[CATEGORY_OF[nb.type]];
    const dashed = CATEGORY_OF[na.type] === 'messaging' || CATEGORY_OF[nb.type] === 'messaging';
    geoms.push({
      sx,
      tx,
      y1,
      y2,
      portS: [sx, y1],
      portT: [portTx, y2],
      arrow: `M ${tx} ${y2} l ${dir} -3.5 v 7 z`,
      color,
      dashed,
      label,
    });
  }
  return geoms;
}

function EdgeLayer({
  project,
  width,
  height,
}: {
  project: Project;
  width: number;
  height: number;
}) {
  const geoms = edgeGeometry(project);
  const srcColor = (g: EdgeGeom) => g.color;
  return (
    <>
      <svg className="edgelayer" width={width} height={height} fill="none">
        {geoms.map((g, i) => {
          const mx = (g.sx + g.tx) / 2;
          const d = `M ${g.sx} ${g.y1} C ${mx} ${g.y1} ${mx} ${g.y2} ${g.tx} ${g.y2}`;
          return (
            <Fragment key={i}>
              <path
                d={d}
                stroke={g.color}
                strokeWidth="1.5"
                opacity={g.dashed ? 0.25 : 0.3}
                strokeDasharray={g.dashed ? '5 4' : undefined}
              />
              <path
                d={d}
                stroke={g.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="3 9"
                style={{
                  animation: `asFlow ${(0.8 + (i % 5) * 0.35).toFixed(2)}s linear infinite`,
                }}
              />
              <path d={g.arrow} fill={g.color} stroke="none" />
              <circle
                cx={g.portS[0]}
                cy={g.portS[1]}
                r="3.5"
                fill="#fff"
                stroke={srcColor(g)}
                strokeWidth="1.5"
              />
              <circle
                cx={g.portT[0]}
                cy={g.portT[1]}
                r="3.5"
                fill="#fff"
                stroke={g.color}
                strokeWidth="1.5"
              />
            </Fragment>
          );
        })}
      </svg>
      {geoms
        .filter((g) => g.label)
        .map((g, i) => {
          const cat = Object.entries(CATEGORY_COLOR).find(([, c]) => c === g.color)?.[0] as
            keyof typeof CATEGORY_TINT | undefined;
          const [, fg, border] = cat ? CATEGORY_TINT[cat] : ['', 'var(--text-2)', 'var(--border)'];
          return (
            <div
              key={`label-${i}`}
              className="edgelabel"
              style={{
                left: (g.portS[0] + g.portT[0]) / 2,
                top: (g.y1 + g.y2) / 2 + 20,
                color: fg,
                borderColor: border,
              }}
            >
              {g.label}
            </div>
          );
        })}
    </>
  );
}

function ProjectGroup({
  project,
  query,
  selectedId,
  onOpen,
}: {
  project: Project;
  query: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const height = project.board.h + LABEL_H;
  return (
    <div className="projgroup" id={`g-${project.id}`} style={{ width: project.board.w, height }}>
      <div className="projlabel">
        <span className="projsquare" style={{ background: STATUS_COLOR[project.status] }} />
        {project.displayName}
        <span className="projmeta">
          {project.id} · {project.resources.length} services
          {projectMonthlyUsd(project) > 0 && ` · ~$${Math.round(projectMonthlyUsd(project))}/mo`}
        </span>
        <a
          className="projconsole"
          href={`https://console.cloud.google.com/home/dashboard?project=${project.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          console ↗
        </a>
      </div>
      <EdgeLayer project={project} width={project.board.w} height={height} />
      {project.resources.map((r) => (
        <NodeCard
          key={r.id}
          resource={r}
          top={r.layout.y + LABEL_H}
          dimmed={q !== '' && !matchesQuery(r, project, q)}
          selected={r.id === selectedId}
          onOpen={onOpen}
        />
      ))}
      {project.error && <div className="projerror">{project.error}</div>}
      {project.resources.length === 0 && !project.error && (
        <div className="projempty">no watched resources discovered</div>
      )}
    </div>
  );
}

interface Props {
  projects: Project[];
  filter: ProjectFilter;
  onFilter: (f: ProjectFilter) => void;
  query: string;
  selectedId: string | null;
  onOpen: (resourceId: string) => void;
}

export function Canvas({ projects, filter, onFilter, query, selectedId, onOpen }: Props) {
  const focused = filter === 'all' ? null : projects.find((p) => p.id === filter);
  const shown = focused ? [focused] : projects;
  const others = focused ? projects.filter((p) => p.id !== focused.id) : [];

  return (
    <div className="panel canvaspanel">
      <div className="dotgrid" />
      <div className="canvasscroll">
        <div className="canvascontent">
          {shown.map((p) => (
            <ProjectGroup
              key={p.id}
              project={p}
              query={query}
              selectedId={selectedId}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
      {others.length > 0 && (
        <div className="clusterchips">
          {others.map((p) => (
            <button key={p.id} className="clusterchip" onClick={() => onFilter(p.id)}>
              <span
                className={`chipdot${p.status === 'err' ? ' pulse-red' : ''}`}
                style={{ background: STATUS_COLOR[p.status] }}
              />
              {p.displayName} · {p.resources.length}
            </button>
          ))}
        </div>
      )}
      <div className="typelegend">
        {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
          <span key={cat}>
            <span className="legendsquare" style={{ background: color }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
