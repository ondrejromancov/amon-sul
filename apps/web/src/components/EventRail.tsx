import type { FleetEvent, Project } from '@amon-sul/shared';
import { timeAgo } from '../timeAgo';
import './rail.css';

const MAX_CHIPS = 12;

function shortMessage(msg: string): string {
  return msg.length > 52 ? `${msg.slice(0, 52)}…` : msg;
}

function resourceName(projects: Project[], e: FleetEvent): string {
  if (!e.resourceId) return e.projectId;
  const r = projects.flatMap((p) => p.resources).find((r) => r.id === e.resourceId);
  return r?.name ?? e.resourceId.split('/').pop() ?? e.projectId;
}

interface Props {
  events: FleetEvent[];
  projects: Project[];
  freshEventId: string | null;
  live: boolean;
  onOpen: (resourceId: string) => void;
}

export function EventRail({ events, projects, freshEventId, live, onOpen }: Props) {
  return (
    <footer>
      <div className="railcap">
        <span className={`raildot${live ? '' : ' down'}`} />
        {live ? 'live' : 'offline'}
      </div>
      <div id="rail" aria-label="Recent events">
        {events.slice(0, MAX_CHIPS).map((e) => (
          <div
            key={e.id}
            className={`event ${e.severity}${e.id === freshEventId ? ' fresh' : ''}`}
            tabIndex={0}
            role="button"
            onClick={() => e.resourceId && onOpen(e.resourceId)}
            onKeyDown={(ev) => ev.key === 'Enter' && e.resourceId && onOpen(e.resourceId)}
          >
            <span className="etag">{e.severity}</span>
            <b>{resourceName(projects, e)}</b>
            <span>{shortMessage(e.message)}</span>
            <span style={{ color: 'var(--dim)' }}>{timeAgo(e.timestamp)}</span>
          </div>
        ))}
      </div>
    </footer>
  );
}
