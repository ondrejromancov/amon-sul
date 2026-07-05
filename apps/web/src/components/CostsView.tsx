import { Fragment } from 'react';
import type { FleetCosts, Project, Recommendation, Resource } from '@amon-sul/shared';
import {
  CATEGORY_OF,
  CATEGORY_TINT,
  CHART_CATEGORY_COLOR,
  CHART_CATEGORY_ORDER,
  TYPE_BADGE,
  TYPE_LABEL,
  categoryOfService,
  type Category,
} from '../categories';
import './costs.css';

const OTHER_COLOR = '#64748b';

function usd(n: number): string {
  if (n >= 100) return `$${Math.round(n)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  return `$${n.toFixed(2)}`;
}

function savingsUsd(n: number): string {
  return `$${Math.round(n)}`;
}

interface ProjectCost {
  project: Project;
  totalUsd: number;
  byCategory: Partial<Record<Category, number>>;
}

function projectCosts(projects: Project[]): ProjectCost[] {
  return projects
    .map((project) => {
      const byCategory: Partial<Record<Category, number>> = {};
      let totalUsd = 0;
      for (const r of project.resources) {
        const c = r.cost?.monthlyUsd ?? 0;
        if (c <= 0) continue;
        const cat = CATEGORY_OF[r.type];
        byCategory[cat] = (byCategory[cat] ?? 0) + c;
        totalUsd += c;
      }
      return { project, totalUsd, byCategory };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

/** Horizontal stacked bars — one row per project, segments in fixed category order. */
function ProjectBars({ rows }: { rows: ProjectCost[] }) {
  const max = Math.max(...rows.map((r) => r.totalUsd), 1);
  return (
    <div className="costchart">
      {rows.map(({ project, totalUsd, byCategory }) => (
        <div key={project.id} className="barrow">
          <span className="barname" title={project.id}>
            {project.displayName}
          </span>
          <div className="bartrack">
            {totalUsd > 0 ? (
              <div className="barstack" style={{ width: `${(totalUsd / max) * 100}%` }}>
                {CHART_CATEGORY_ORDER.filter((cat) => (byCategory[cat] ?? 0) > 0).map((cat) => (
                  <div
                    key={cat}
                    className="barseg"
                    style={{
                      flexGrow: byCategory[cat]!,
                      background: CHART_CATEGORY_COLOR[cat],
                    }}
                    title={`${project.displayName} · ${cat}: ${usd(byCategory[cat]!)}/mo`}
                  />
                ))}
              </div>
            ) : (
              <span className="barzero">$0</span>
            )}
          </div>
          <span className="barvalue">{usd(totalUsd)}</span>
        </div>
      ))}
      <div className="chartlegend">
        {CHART_CATEGORY_ORDER.map((cat) => (
          <span key={cat}>
            <span className="legendswatch" style={{ background: CHART_CATEGORY_COLOR[cat] }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Single-segment bars per service (actuals when billing months exist, else estimates). */
function ServiceBars({ entries }: { entries: [string, number][] }) {
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="costchart">
      {entries.map(([service, value]) => {
        const cat = categoryOfService(service);
        return (
          <div key={service} className="barrow">
            <span className="barname">{service}</span>
            <div className="bartrack">
              <div
                className="barseg solo"
                style={{
                  width: `${(value / max) * 100}%`,
                  background: cat ? CHART_CATEGORY_COLOR[cat] : OTHER_COLOR,
                }}
                title={`${service}: ${usd(value)}/mo`}
              />
            </div>
            <span className="barvalue">{usd(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Monthly trend columns — single hue, rounded tops, last column direct-labeled. */
function TrendColumns({ costs }: { costs: FleetCosts }) {
  const months = costs.months ?? [];
  if (months.length < 2) return null;
  const W = 560;
  const H = 130;
  const PAD_BOTTOM = 18;
  const max = Math.max(...months.map((m) => m.totalUsd), 1);
  const colW = Math.min(56, (W - 20) / months.length - 10);
  const step = W / months.length;
  return (
    <svg
      className="trendsvg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Monthly spend, ${months[0]!.month} to ${months[months.length - 1]!.month}`}
    >
      {months.map((m, i) => {
        const h = Math.max(3, (m.totalUsd / max) * (H - PAD_BOTTOM - 16));
        const x = step * i + (step - colW) / 2;
        const y = H - PAD_BOTTOM - h;
        const last = i === months.length - 1;
        return (
          <Fragment key={m.month}>
            <rect
              x={x}
              y={y}
              width={colW}
              height={h}
              rx="4"
              fill="#5658d2"
              opacity={last ? 1 : 0.55}
            >
              <title>
                {m.month}: {usd(m.totalUsd)}
              </title>
            </rect>
            {last && (
              <text x={x + colW / 2} y={y - 5} textAnchor="middle" className="trendvalue">
                {usd(m.totalUsd)}
              </text>
            )}
            <text x={x + colW / 2} y={H - 4} textAnchor="middle" className="trendmonth">
              {m.month.slice(5)}
            </text>
          </Fragment>
        );
      })}
    </svg>
  );
}

function Recommendations({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <div className="costsection">
      <div className="costsection-title">Recommendations</div>
      {recommendations.length === 0 ? (
        <div className="costempty">No recommendations from GCP right now ✓</div>
      ) : (
        <div className="reclist">
          {recommendations.map((rec) => (
            <div key={rec.id} className="recrow">
              <div className="recbody">
                <div className="recdesc">{rec.description}</div>
                <div className="recproject">{rec.projectId}</div>
              </div>
              {rec.monthlySavingsUsd !== undefined && rec.monthlySavingsUsd > 0 && (
                <span className="savechip">save ~{savingsUsd(rec.monthlySavingsUsd)}/mo</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  projects: Project[];
  costs?: FleetCosts;
  recommendations?: Recommendation[];
}

export function CostsView({ projects, costs, recommendations }: Props) {
  const rows = projectCosts(projects);
  const fleetTotal = rows.reduce((a, r) => a + r.totalUsd, 0);
  const months = costs?.months ?? [];
  const currentMonth = months[months.length - 1];
  const hasBilling = costs?.source === 'billing' && months.length > 0;

  const serviceEntries: [string, number][] = hasBilling
    ? Object.entries(currentMonth!.byService).sort((a, b) => b[1] - a[1])
    : Object.entries(
        projects
          .flatMap((p) => p.resources)
          .reduce<Record<string, number>>((acc, r) => {
            const c = r.cost?.monthlyUsd ?? 0;
            if (c > 0) acc[TYPE_LABEL[r.type]] = (acc[TYPE_LABEL[r.type]] ?? 0) + c;
            return acc;
          }, {}),
      ).sort((a, b) => b[1] - a[1]);

  const costly: Resource[] = projects
    .flatMap((p) => p.resources)
    .filter((r) => (r.cost?.monthlyUsd ?? 0) > 0)
    .sort((a, b) => b.cost!.monthlyUsd - a.cost!.monthlyUsd)
    .slice(0, 20);

  const topProject = rows[0];
  const topService = serviceEntries[0];

  return (
    <div className="panel costsview">
      <div className="costsscroll">
        <div className="costshead">
          <span className="coststitle">Costs</span>
          <span className="costssource">
            {hasBilling ? 'actuals from billing export' : 'estimated from list prices'}
          </span>
        </div>

        <div className="costtiles">
          <div className="costtile">
            <div className="costtile-label">
              {hasBilling ? `${currentMonth!.month} actual` : 'estimated / mo'}
            </div>
            <div className="costtile-value">
              {usd(hasBilling ? currentMonth!.totalUsd : fleetTotal)}
            </div>
          </div>
          {topProject && topProject.totalUsd > 0 && (
            <div className="costtile">
              <div className="costtile-label">top project</div>
              <div className="costtile-value">{topProject.project.displayName}</div>
              <div className="costtile-sub">{usd(topProject.totalUsd)}/mo</div>
            </div>
          )}
          {topService && (
            <div className="costtile">
              <div className="costtile-label">top service</div>
              <div className="costtile-value">{topService[0]}</div>
              <div className="costtile-sub">{usd(topService[1])}/mo</div>
            </div>
          )}
        </div>

        {hasBilling && (
          <div className="costsection">
            <div className="costsection-title">Monthly spend</div>
            <TrendColumns costs={costs!} />
          </div>
        )}

        {recommendations !== undefined && <Recommendations recommendations={recommendations} />}

        <div className="costsection">
          <div className="costsection-title">By project {hasBilling ? '(estimated now)' : ''}</div>
          <ProjectBars rows={rows} />
        </div>

        <div className="costsection">
          <div className="costsection-title">
            By service {hasBilling ? `(${currentMonth!.month} actual)` : ''}
          </div>
          <ServiceBars entries={serviceEntries} />
        </div>

        <div className="costsection">
          <div className="costsection-title">Resources</div>
          <table className="costtable">
            <thead>
              <tr>
                <th>resource</th>
                <th>project</th>
                <th className="num">est / mo</th>
              </tr>
            </thead>
            <tbody>
              {costly.map((r) => {
                const [bg, fg] = CATEGORY_TINT[CATEGORY_OF[r.type]];
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="typechip" style={{ background: bg, color: fg }}>
                        {TYPE_BADGE[r.type]}
                      </span>
                      <span className="costres">{r.name}</span>
                      {r.cost?.note && <span className="costnote">{r.cost.note}</span>}
                    </td>
                    <td className="costproj">{r.projectId}</td>
                    <td className="num">{usd(r.cost!.monthlyUsd)}</td>
                  </tr>
                );
              })}
              {costly.length === 0 && (
                <tr>
                  <td colSpan={3} className="costempty">
                    nothing with a nonzero estimate — everything fits free tiers ✓
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="costsfoot">
          {hasBilling
            ? 'Trend and service breakdown are actuals from your billing export; per-resource figures are list-price estimates.'
            : 'All figures are estimates from list prices (compute only, disks and egress excluded). For actual spend, configure billing.bigqueryTable with a BigQuery billing export — see docs/self-hosting.md.'}
        </div>
      </div>
    </div>
  );
}
