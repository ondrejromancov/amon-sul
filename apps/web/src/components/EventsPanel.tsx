import type { FleetEvent, Project, Resource } from '@amon-sul/shared';
import { CATEGORY_OF, CATEGORY_TINT, TYPE_BADGE } from '../categories';
import { timeAgo } from '../timeAgo';
import './events.css';

function timeShort(iso: string): string {
  const t = timeAgo(iso);
  return t === 'just now' ? 'now' : t.replace(' ago', '');
}

function resourceOf(projects: Project[], e: FleetEvent): Resource | undefined {
  if (!e.resourceId) return undefined;
  return projects.flatMap((p) => p.resources).find((r) => r.id === e.resourceId);
}

interface Props {
  events: FleetEvent[];
  projects: Project[];
  freshEventId: string | null;
  live: boolean;
  onOpen: (resourceId: string) => void;
}

export function EventsPanel({ events, projects, freshEventId, live, onOpen }: Props) {
  const errCount = events.filter((e) => e.severity === 'err').length;
  const warnCount = events.filter((e) => e.severity === 'warn').length;
  return (
    <div className="panel eventspanel">
      <div className="eventshead">
        <span className="eventstitle">Events</span>
        <span className={`livechip${live ? '' : ' down'}`}>
          <span className="livedot" />
          {live ? 'live' : 'offline'}
        </span>
        <span className="eventcounts">
          {errCount > 0 && <span className="countchip err">{errCount}</span>}
          {warnCount > 0 && <span className="countchip warn">{warnCount}</span>}
        </span>
      </div>
      <div className="eventslist">
        {events.length === 0 && <div className="eventsempty">no events in the last 24h ✓</div>}
        {events.map((e) => {
          const r = resourceOf(projects, e);
          const [chipBg, chipFg] = r ? CATEGORY_TINT[CATEGORY_OF[r.type]] : ['#eaeef3', '#4a5a70'];
          return (
            <div
              key={e.id}
              className={`evententry sev-${e.severity}${e.id === freshEventId ? ' fresh' : ''}${
                e.resourceId ? ' clickable' : ''
              }`}
              tabIndex={e.resourceId ? 0 : -1}
              role={e.resourceId ? 'button' : undefined}
              onClick={() => e.resourceId && onOpen(e.resourceId)}
              onKeyDown={(ev) => ev.key === 'Enter' && e.resourceId && onOpen(e.resourceId)}
            >
              <div className="eventrow">
                {r && (
                  <span className="typechip" style={{ background: chipBg, color: chipFg }}>
                    {TYPE_BADGE[r.type]}
                  </span>
                )}
                <span className="eventname">
                  {r?.name ?? e.resourceId?.split('/').pop() ?? e.projectId}
                </span>
                <span className="eventtime">{timeShort(e.timestamp)}</span>
              </div>
              <div className="eventmsg">{e.message}</div>
              <div className="eventproj">{e.projectId}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
