import { useEffect, useMemo, useState } from 'react';
import type { FleetEvent, Project, Resource } from '@amon-sul/shared';
import { fetchLogs, type LogParams } from '../api';
import './logbrowser.css';

type LogSeverity = NonNullable<LogParams['severity']>;

function timeHms(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

interface Props {
  project: Project;
  onOpen: (resourceId: string) => void;
}

export function LogBrowser({ project, onOpen }: Props) {
  const [severity, setSeverity] = useState<LogSeverity>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [entries, setEntries] = useState<FleetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resources = useMemo(
    () => new Map(project.resources.map((r): [string, Resource] => [r.id, r])),
    [project.resources],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchLogs({ project: project.id, severity, q: debouncedQuery, limit: 80 })
      .then((next) => {
        if (!alive) return;
        setEntries(next);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setEntries([]);
        setError(err instanceof Error ? err.message : 'logs failed');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [project.id, severity, debouncedQuery, refreshTick]);

  return (
    <div className="logbrowser" role="region" aria-label={`${project.displayName} logs`}>
      <div className="logcontrols">
        <select
          className="logselect"
          aria-label="Log severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as LogSeverity)}
        >
          <option value="all">all</option>
          <option value="warn">warn</option>
          <option value="err">err</option>
        </select>
        <input
          className="logfilter"
          aria-label="Filter logs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter logs..."
        />
        <button
          className="logrefresh"
          aria-label="Refresh logs"
          onClick={() => setRefreshTick((v) => v + 1)}
        >
          refresh
        </button>
      </div>

      <div className="loglist">
        {loading && <div className="logstate">loading logs...</div>}
        {!loading && error && <div className="logstate err">{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div className="logstate">no matching entries</div>
        )}
        {!loading &&
          !error &&
          entries.map((entry) => {
            const resource = entry.resourceId ? resources.get(entry.resourceId) : undefined;
            const clickable = Boolean(entry.resourceId);
            return (
              <div
                key={entry.id}
                className={`logrow${clickable ? ' clickable' : ''}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : -1}
                onClick={() => entry.resourceId && onOpen(entry.resourceId)}
                onKeyDown={(e) => e.key === 'Enter' && entry.resourceId && onOpen(entry.resourceId)}
              >
                <span className="logtime">{timeHms(entry.timestamp)}</span>
                <span className={`logsev ${entry.severity}`}>{entry.severity}</span>
                <span className="logmsg">{entry.message}</span>
                {entry.resourceId && (
                  <span className="logresource">
                    {resource?.name ?? entry.resourceId.split('/').pop()}
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
