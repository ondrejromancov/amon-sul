import { useEffect, useState } from 'react';
import type { MetricSeries, Resource } from '@amon-sul/shared';
import { fetchMetrics } from '../api';
import {
  CATEGORY_COLOR,
  CATEGORY_OF,
  CATEGORY_TINT,
  STATUS_PILL,
  TYPE_BADGE,
  TYPE_LABEL,
} from '../categories';
import { timeAgo } from '../timeAgo';
import './detail.css';

function rateOf(series: MetricSeries[] | null): string | null {
  const points = series?.[0]?.points;
  if (!points?.length) return null;
  const tail = points.slice(-5).map((p) => p.v);
  const avg = tail.reduce((a, v) => a + v, 0) / tail.length;
  return avg >= 100 ? Math.round(avg).toString() : avg.toFixed(1);
}

interface Props {
  resource: Resource | null;
  onClose: () => void;
}

export function DetailPanel({ resource, onClose }: Props) {
  const [series, setSeries] = useState<MetricSeries[] | null>(null);

  useEffect(() => {
    setSeries(null);
    if (!resource) return;
    let alive = true;
    fetchMetrics(resource.id)
      .then((s) => alive && setSeries(s))
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [resource?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!resource) {
    return (
      <div className="panel detailpanel">
        <div className="detailempty">
          <div className="detailempty-mark">◈</div>
          Select a service to inspect it
        </div>
      </div>
    );
  }

  const cat = CATEGORY_OF[resource.type];
  const [chipBg, chipFg] = CATEGORY_TINT[cat];
  const pill = STATUS_PILL[resource.status];
  const d = resource.details;
  const rate = rateOf(series);
  const rateLabel = series?.[0]?.label?.split(' ')[0] ?? 'rate';

  const tiles: { label: string; value: string; suffix?: string }[] = [];
  if (rate !== null) tiles.push({ label: rateLabel, value: rate });
  if (d?.minInstances !== undefined || d?.maxInstances !== undefined) {
    tiles.push({ label: 'instances', value: `${d.minInstances ?? 0}–${d.maxInstances ?? '∞'}` });
  }
  if (resource.region) tiles.push({ label: 'region', value: resource.region });

  const meta: string[] = [resource.projectId];
  if (d?.revision) meta.push(`rev ${d.revision}`);
  if (d?.deployedAt) meta.push(`deployed ${timeAgo(d.deployedAt)}`);
  if (!d) meta.push(resource.statusText);

  return (
    <div className="panel detailpanel">
      <div className="detailhead" style={{ borderTopColor: CATEGORY_COLOR[cat] }}>
        <div className="detailtitle">
          <span className="typechip" style={{ background: chipBg, color: chipFg }}>
            {TYPE_BADGE[resource.type]}
          </span>
          <span className="detailname">{resource.name}</span>
          <span className="statuspill" style={{ background: pill.bg, color: pill.fg }}>
            {pill.label}
          </span>
          <button className="detailclose" aria-label="Close panel" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="detailmeta">{meta.join(' · ')}</div>
      </div>

      {tiles.length > 0 && (
        <div className="stattiles" style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
          {tiles.map((t) => (
            <div key={t.label} className="stattile">
              <div className="stattile-label">{t.label}</div>
              <div className="stattile-value">{t.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="detailscroll">
        {resource.vitals && resource.vitals.length > 0 && (
          <div className="detailsection">
            <div className="sectiontitle">Vitals</div>
            <div className="vitalsgrid">
              {resource.vitals.map((v) => (
                <div key={v.label} className="vitalcell">
                  <div className="vitallabel">{v.label}</div>
                  <div className="vitalvalue">{v.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(d?.minInstances !== undefined || d?.maxInstances !== undefined) && (
          <div className="detailsection">
            <div className="sectiontitle">Scaling</div>
            <div className="kvrow">
              <span className="kvlabel">Min instances</span>
              <span className="kvvalue">{d?.minInstances ?? 0}</span>
            </div>
            <div className="kvrow">
              <span className="kvlabel">Max instances</span>
              <span className="kvvalue">{d?.maxInstances ?? '—'}</span>
            </div>
          </div>
        )}

        {d?.env && d.env.length > 0 && (
          <div className="detailsection">
            <div className="sectiontitle">Environment</div>
            {d.env.map((e) => (
              <div key={e.name} className="envrow">
                <span className="envkey">{e.name}</span>
                <span className="envvalue">{e.value || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {resource.consoleLinks.length > 0 && (
          <div className="detailsection">
            <div className="sectiontitle">Console</div>
            {resource.consoleLinks.map((l) => (
              <a
                key={l.label}
                className="consolerow"
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{l.label}</span>
                <span>↗</span>
              </a>
            ))}
          </div>
        )}

        <div className="detailsection">
          <div className="sectiontitle">Status</div>
          <div className="detailstatustext">{resource.statusText}</div>
          <div className="detailtypelabel">{TYPE_LABEL[resource.type]}</div>
        </div>
      </div>

      <div className="detailfoot">
        <a
          className="consolebtn"
          href={
            resource.consoleLinks[0]?.url ??
            `https://console.cloud.google.com/home/dashboard?project=${resource.projectId}`
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in console ↗
        </a>
      </div>
    </div>
  );
}
