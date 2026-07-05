import type { FleetEvent, Project } from '@amon-sul/shared';
import './projectpanel.css';

function projectMonthlyUsd(project: Project): number {
  return project.resources.reduce((total, r) => total + (r.cost?.monthlyUsd ?? 0), 0);
}

interface Props {
  project: Project;
  events: FleetEvent[];
  logsOpen: boolean;
  onToggleLogs: () => void;
}

export function ProjectPanel({ project, events, logsOpen, onToggleLogs }: Props) {
  const monthly = projectMonthlyUsd(project);
  const running = project.resources.filter((r) => r.status === 'ok').length;
  const resourceIssues = project.resources.filter((r) => r.status === 'warn' || r.status === 'err');
  const errEvents = events.filter((e) => e.severity === 'err').length;
  const issues = resourceIssues.length + errEvents;

  return (
    <div
      className="projectpanel"
      role="region"
      aria-label={`${project.displayName} project summary`}
    >
      <div className="projectpanel-title">
        <span className="projectpanel-name">{project.displayName}</span>
        <span className="projectpanel-id">{project.id}</span>
      </div>
      <div className="projectstats">
        <div className="projectstat">
          <span className="projectstat-label">est cost/mo</span>
          <span className="projectstat-value">~${Math.round(monthly)}</span>
        </div>
        <div className="projectstat">
          <span className="projectstat-label">running</span>
          <span className="projectstat-value">{running}</span>
        </div>
        <div className="projectstat">
          <span className="projectstat-label">issues</span>
          <span className="projectstat-value">{issues}</span>
        </div>
      </div>
      <button
        className={`projectlogs${logsOpen ? ' active' : ''}`}
        aria-pressed={logsOpen}
        onClick={onToggleLogs}
      >
        Logs
      </button>
    </div>
  );
}
