import type { FleetEvent, Project } from '@amon-sul/shared';
import { SORT_LABELS, type SortMode } from '../viewPrefs';
import './sidebar.css';

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5" />
      <path d="M3 3l18 18" />
    </svg>
  ) : (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ProjectItem({
  project,
  active,
  hidden,
  onSelect,
  onToggle,
}: {
  project: Project;
  active: boolean;
  hidden: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={`projitem${active ? ' active' : ''}${hidden ? ' hiddenproj' : ''}`}
      tabIndex={0}
      role="button"
      onClick={() => (hidden ? onToggle(project.id) : onSelect(project.id))}
      onKeyDown={(e) => e.key === 'Enter' && (hidden ? onToggle(project.id) : onSelect(project.id))}
    >
      <span className={`dot ${project.status}`} />
      <div>
        <div className="pname">{project.displayName}</div>
        <div className="pid">{project.id}</div>
      </div>
      <span className="pcount">{project.resources.length}</span>
      <button
        className="eyebtn"
        aria-label={hidden ? `Show ${project.displayName}` : `Hide ${project.displayName}`}
        title={hidden ? 'show project' : 'hide project'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(project.id);
        }}
      >
        <EyeIcon off={!hidden} />
      </button>
    </div>
  );
}

interface Props {
  visible: Project[];
  hidden: Project[];
  events: FleetEvent[];
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  onHide: (projectId: string) => void;
  onShow: (projectId: string) => void;
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
}

export function Sidebar({
  visible,
  hidden,
  events,
  sort,
  onSort,
  onHide,
  onShow,
  activeProjectId,
  onSelect,
}: Props) {
  const services = visible.reduce((a, p) => a + p.resources.length, 0);
  const errors = events.filter((e) => e.severity === 'err').length;
  return (
    <aside>
      <div className="fleetstats">
        <div className="stat">
          <b>{visible.length}</b>
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
      <div className="sidelabel siderow">
        GCP projects
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
      </div>
      <nav>
        {visible.map((p) => (
          <ProjectItem
            key={p.id}
            project={p}
            active={p.id === activeProjectId}
            hidden={false}
            onSelect={onSelect}
            onToggle={onHide}
          />
        ))}
      </nav>
      {hidden.length > 0 && (
        <>
          <div className="sidelabel hiddenlabel">hidden ({hidden.length})</div>
          <nav>
            {hidden.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                active={false}
                hidden={true}
                onSelect={onSelect}
                onToggle={onShow}
              />
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}
