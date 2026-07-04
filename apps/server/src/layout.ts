import {
  NODE_H,
  NODE_W,
  type Project,
  type Resource,
  type ResourceType,
  type Status,
} from '@amon-sul/shared';
import type { ProjectConfig } from './config.js';

/** What collectors produce — everything except identity and layout, which are resolved here. */
export type CollectedResource = Omit<Resource, 'id' | 'projectId' | 'layout'>;

const GAP_X = 55;
const GAP_Y = 73;
const PAD = 20;
const GRID_ROWS = 2;
const MIN_BOARD = { w: 470, h: 230 };

const STATUS_RANK: Record<Status, number> = { err: 4, warn: 3, unknown: 2, idle: 1, ok: 0 };

export function worstStatus(statuses: Status[]): Status {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'ok');
}

function cellToPx(col: number, row: number): { x: number; y: number } {
  return { x: PAD + col * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y) };
}

function shorthand(type: ResourceType, name: string): string {
  return `${type}/${name}`;
}

/**
 * Turn collected resources into a full Project: resolve layout pins and
 * auto-place the rest into a 2-row grid, resolve edge shorthands to resource
 * ids (unknown keys warn and drop), compute board size and worst-of status.
 */
export function resolveProject(
  projectId: string,
  resources: CollectedResource[],
  cfg?: Pick<ProjectConfig, 'name' | 'edges' | 'layout'>,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): Project {
  const pins = cfg?.layout ?? {};
  const occupied = new Set<string>(Object.values(pins).map(([c, r]) => `${c},${r}`));

  // Deterministic auto-fill: first free cell scanning column-major, 2 rows per column.
  let nextCell = 0;
  const takeFreeCell = (): { col: number; row: number } => {
    for (;;) {
      const col = Math.floor(nextCell / GRID_ROWS);
      const row = nextCell % GRID_ROWS;
      nextCell++;
      if (!occupied.has(`${col},${row}`)) {
        occupied.add(`${col},${row}`);
        return { col, row };
      }
    }
  };

  const byShorthand = new Map<string, string>();
  const placed: Resource[] = resources.map((r) => {
    const key = shorthand(r.type, r.name);
    const pin = pins[key];
    const cell = pin ? { col: pin[0], row: pin[1] } : takeFreeCell();
    if (pin) occupied.add(`${pin[0]},${pin[1]}`);
    const id = `${projectId}/${key}`;
    byShorthand.set(key, id);
    return { ...r, id, projectId, layout: cellToPx(cell.col, cell.row) };
  });

  const edges: [string, string][] = [];
  for (const [a, b] of cfg?.edges ?? []) {
    const ra = byShorthand.get(a);
    const rb = byShorthand.get(b);
    if (!ra || !rb) {
      warn(`[${projectId}] edge [${a}, ${b}] references unknown resource — dropped`);
      continue;
    }
    edges.push([ra, rb]);
  }

  const maxX = Math.max(0, ...placed.map((r) => r.layout.x));
  const maxY = Math.max(0, ...placed.map((r) => r.layout.y));

  return {
    id: projectId,
    displayName: cfg?.name ?? projectId,
    status: worstStatus(placed.map((r) => r.status)),
    resources: placed,
    edges,
    board: {
      w: Math.max(MIN_BOARD.w, maxX + NODE_W + PAD),
      h: Math.max(MIN_BOARD.h, maxY + NODE_H + PAD),
    },
  };
}
