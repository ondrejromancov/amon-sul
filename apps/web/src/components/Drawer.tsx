import { useEffect, useRef, useState } from 'react';
import type { FleetEvent, FleetSnapshot, MetricSeries, Resource, Status } from '@amon-sul/shared';
import { fetchMetrics } from '../api';
import { timeAgo } from '../timeAgo';
import './drawer.css';
import { TYPE_META, TypeIcon } from './icons';

export type DrawerState = { kind: 'resource'; resourceId: string } | { kind: 'errors' } | null;

const STATUS_LABEL: Record<Status, string> = {
  ok: 'healthy',
  warn: 'degraded',
  err: 'failing',
  idle: 'stopped',
  unknown: 'unknown',
};

function Spark({ series, status }: { series: MetricSeries; status: Status }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width;
    const H = c.height;
    const values = series.points.map((p) => p.v);
    const max = Math.max(...values, 1);
    const pts = values.map((v) => v / max);
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * W;
      const y = H - p * H * 0.86 - 6;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = status === 'err' ? '#F87171' : '#5B9DFF';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, status === 'err' ? 'rgba(248,113,113,.22)' : 'rgba(91,157,255,.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();
  }, [series, status]);
  return (
    <>
      <div className="dsection">
        <h4>{series.label}</h4>
        <canvas ref={ref} className="spark" width={680} height={112} />
        <div className="sparkcap">
          <span>-60m</span>
          <span>now</span>
        </div>
      </div>
    </>
  );
}

function ErrorEntry({ event, onJump }: { event: FleetEvent; onJump?: (id: string) => void }) {
  return (
    <div
      className={`errentry${event.severity === 'warn' ? ' warn' : ''}${onJump && event.resourceId ? ' clickable' : ''}`}
      onClick={onJump && event.resourceId ? () => onJump(event.resourceId!) : undefined}
    >
      <div className="emsg">{event.message}</div>
      <div className="etime">
        {timeAgo(event.timestamp)} · {event.projectId}
      </div>
    </div>
  );
}

function ResourceDrawer({
  resource,
  events,
  onClose,
}: {
  resource: Resource;
  events: FleetEvent[];
  onClose: () => void;
}) {
  const meta = TYPE_META[resource.type];
  const [series, setSeries] = useState<MetricSeries[] | null>(null);
  useEffect(() => {
    let alive = true;
    setSeries(null);
    fetchMetrics(resource.id)
      .then((s) => alive && setSeries(s))
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [resource.id]);

  const related = events.filter((e) => e.resourceId === resource.id && e.severity !== 'info');

  return (
    <>
      <div className="dhead">
        <div className="top">
          <div className="nicon" style={{ background: meta.bg }}>
            <TypeIcon type={resource.type} />
          </div>
          <h3>{resource.name}</h3>
          <button className="dclose" aria-label="Close panel" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="dmeta">
          {meta.label} · {resource.projectId}
          {resource.region ? ` · ${resource.region}` : ''}
        </div>
        <span className={`pill ${resource.status}`}>
          <span className={`dot ${resource.status}`} />
          {STATUS_LABEL[resource.status]}
        </span>
      </div>
      <div className="dbody">
        {resource.consoleLinks.length > 0 && (
          <div className="dsection">
            <h4>GCP console</h4>
            <div className="linkrow">
              {resource.consoleLinks.map((l) => (
                <a key={l.label} className="clink" href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </div>
          </div>
        )}
        {series?.map((s) => <Spark key={s.label} series={s} status={resource.status} />)}
        <div className="dsection">
          <h4>recent errors</h4>
          {related.length > 0 ? (
            related.map((e) => <ErrorEntry key={e.id} event={e} />)
          ) : (
            <div className="emptystate">no errors in the last 24h ✓</div>
          )}
        </div>
      </div>
    </>
  );
}

interface Props {
  state: DrawerState;
  snapshot: FleetSnapshot;
  onClose: () => void;
  onJump: (resourceId: string) => void;
}

export function Drawer({ state, snapshot, onClose, onJump }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resource =
    state?.kind === 'resource'
      ? snapshot.projects.flatMap((p) => p.resources).find((r) => r.id === state.resourceId)
      : undefined;

  return (
    <div id="drawer" className={state ? 'open' : ''} aria-hidden={state ? 'false' : 'true'}>
      {state?.kind === 'resource' && resource && (
        <ResourceDrawer resource={resource} events={snapshot.events} onClose={onClose} />
      )}
      {state?.kind === 'errors' && (
        <>
          <div className="dhead">
            <div className="top">
              <h3>Errors &amp; warnings</h3>
              <button className="dclose" aria-label="Close panel" onClick={onClose}>
                ✕
              </button>
            </div>
            <div className="dmeta">all projects · last 24h</div>
          </div>
          <div className="dbody">
            {snapshot.events
              .filter((e) => e.severity !== 'info')
              .map((e) => (
                <ErrorEntry key={e.id} event={e} onJump={onJump} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
