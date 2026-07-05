import type { FleetCosts, FleetEvent, FleetSnapshot, Project } from '@amon-sul/shared';

type EventListener = (event: FleetEvent) => void;
type SnapshotListener = (snapshot: FleetSnapshot) => void;

/**
 * In-memory source of truth. The poller (or mock feed) writes into it;
 * REST and SSE read from it.
 */
export class FleetStore {
  private projects: Project[] = [];
  private events: FleetEvent[] = [];
  private costs: FleetCosts = { source: 'estimate' };
  private seenEventIds = new Set<string>();
  private fetchedAt = new Date(0).toISOString();
  private eventListeners = new Set<EventListener>();
  private snapshotListeners = new Set<SnapshotListener>();

  constructor(
    private readonly mode: 'live' | 'mock',
    private readonly maxEvents = 100,
  ) {}

  getSnapshot(): FleetSnapshot {
    return {
      projects: this.projects,
      events: this.events,
      costs: this.costs,
      fetchedAt: this.fetchedAt,
      mode: this.mode,
    };
  }

  setCosts(costs: FleetCosts): void {
    this.costs = costs;
    const snapshot = this.getSnapshot();
    for (const cb of this.snapshotListeners) cb(snapshot);
  }

  get lastPollAt(): string {
    return this.fetchedAt;
  }

  setProjects(projects: Project[]): void {
    this.projects = projects;
    this.fetchedAt = new Date().toISOString();
    const snapshot = this.getSnapshot();
    for (const cb of this.snapshotListeners) cb(snapshot);
  }

  /**
   * Add events (any order), dropping ones already seen. Keeps newest-first
   * order and the cap. Returns the genuinely new events (also emitted to
   * event listeners, newest last so the rail can prepend in order).
   */
  addEvents(incoming: FleetEvent[]): FleetEvent[] {
    const fresh = incoming.filter((e) => !this.seenEventIds.has(e.id));
    if (fresh.length === 0) return [];
    for (const e of fresh) this.seenEventIds.add(e.id);
    this.events = [...fresh, ...this.events]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, this.maxEvents);
    const oldestFirst = [...fresh].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const e of oldestFirst) for (const cb of this.eventListeners) cb(e);
    return fresh;
  }

  onEvent(cb: EventListener): () => void {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  onSnapshot(cb: SnapshotListener): () => void {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }
}
