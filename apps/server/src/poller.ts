import type { GoogleAuth } from 'google-auth-library';
import type { FleetEvent, Project, Status } from '@amon-sul/shared';
import type { AmonSulConfig } from './config.js';
import { resolveProject, worstStatus } from './layout.js';
import type { FleetStore } from './store.js';
import type { ResourceCollector } from './collectors/types.js';
import { ALL_COLLECTORS } from './collectors/index.js';
import { collectEvents } from './collectors/logging.js';
import { deriveAlerts } from './alerts.js';
import { estimateCost } from './costs/estimate.js';
import { fetchBillingMonths } from './costs/billing.js';
import { fetchFleetRecommendations } from './costs/recommender.js';
import { applyVitals, fetchProjectVitals, fillBucketInventory } from './vitals.js';

export interface PollerDeps {
  config: AmonSulConfig;
  store: FleetStore;
  auth: GoogleAuth;
  collectors?: ResourceCollector[];
  fetchEvents?: typeof collectEvents;
  fetchVitals?: typeof fetchProjectVitals;
  fillInventory?: typeof fillBucketInventory;
  fetchBilling?: typeof fetchBillingMonths;
  fetchRecommendations?: typeof fetchFleetRecommendations;
  log?: Pick<Console, 'warn' | 'error'>;
}

const BILLING_POLL_MS = 60 * 60_000;

const ESCALATION_WINDOW_MS = 30 * 60_000;

/** Resources with a recent err event surface as at least `warn` on the board. */
export function escalate(projects: Project[], events: FleetEvent[], now = Date.now()): Project[] {
  const hot = new Set(
    events
      .filter(
        (e) =>
          e.severity === 'err' &&
          e.resourceId &&
          now - Date.parse(e.timestamp) < ESCALATION_WINDOW_MS,
      )
      .map((e) => e.resourceId!),
  );
  const hasAlert = projects.some((p) => p.resources.some((r) => (r.alerts?.length ?? 0) > 0));
  if (hot.size === 0 && !hasAlert) return projects;
  return projects.map((p) => {
    const resources = p.resources.map((r) =>
      (hot.has(r.id) || (r.alerts?.length ?? 0) > 0) && (r.status === 'ok' || r.status === 'idle')
        ? { ...r, status: 'warn' as Status }
        : r,
    );
    return { ...p, resources, status: worstStatus(resources.map((r) => r.status)) };
  });
}

export function startPoller(deps: PollerDeps): () => void {
  const {
    config,
    store,
    auth,
    collectors = ALL_COLLECTORS,
    fetchEvents = collectEvents,
    fetchVitals = fetchProjectVitals,
    fillInventory = fillBucketInventory,
    fetchBilling = fetchBillingMonths,
    fetchRecommendations = fetchFleetRecommendations,
    log = console,
  } = deps;
  const lastEventTs = new Map<string, string>();
  let stopped = false;

  async function pollResources(): Promise<void> {
    const recentEvents = store.getSnapshot().events;
    const projects = await Promise.all(
      config.projects.map(async (pc) => {
        const [settled, vitals] = await Promise.all([
          Promise.allSettled(collectors.map((c) => c.collect(pc.id, auth))),
          fetchVitals(pc.id, auth),
        ]);
        const found = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
        // Bucket metrics are not emitted in every project — inventory fallback.
        await fillInventory(
          vitals,
          found.filter((r) => r.type === 'storage').map((r) => r.name),
          auth,
        );
        const collected = found
          .map((r) => applyVitals(r, vitals))
          .map((r) => ({
            ...r,
            cost:
              estimateCost(r, r.type === 'storage' ? vitals.bucketBytes.get(r.name) : undefined) ??
              undefined,
          }));
        const failures = settled
          .map((s, i) => ({ s, type: collectors[i]!.type }))
          .filter(({ s }) => s.status === 'rejected');
        for (const f of failures) {
          log.warn(
            `[${pc.id}] ${f.type} collector failed: ${((f.s as PromiseRejectedResult).reason as Error)?.message}`,
          );
        }
        const project = resolveProject(pc.id, collected, pc, (m) => log.warn(m));
        project.resources = project.resources.map((resource) => {
          const alerts = deriveAlerts(resource, vitals, recentEvents);
          return { ...resource, alerts: alerts.length > 0 ? alerts : undefined };
        });
        if (failures.length > 0) {
          project.error =
            failures.length === collectors.length
              ? 'discovery failed for all resource types'
              : `partial discovery: ${failures.map((f) => f.type).join(', ')} failed`;
          if (failures.length === collectors.length) project.status = 'unknown';
        }
        return project;
      }),
    );
    store.setProjects(escalate(projects, store.getSnapshot().events));
  }

  async function pollEvents(): Promise<void> {
    const knownIds = new Set(
      store.getSnapshot().projects.flatMap((p) => p.resources.map((r) => r.id)),
    );
    const batches = await Promise.allSettled(
      config.projects.map((pc) =>
        fetchEvents(
          pc.id,
          auth,
          {
            lookbackHours: config.events.lookbackHours,
            maxEntries: config.events.maxEntries,
            sinceIso: lastEventTs.get(pc.id),
          },
          knownIds,
        ),
      ),
    );
    const events: FleetEvent[] = [];
    batches.forEach((b, i) => {
      const pid = config.projects[i]!.id;
      if (b.status === 'rejected') {
        log.warn(`[${pid}] event poll failed: ${(b.reason as Error)?.message}`);
        return;
      }
      for (const e of b.value) {
        const prev = lastEventTs.get(pid);
        if (!prev || e.timestamp > prev) lastEventTs.set(pid, e.timestamp);
      }
      events.push(...b.value);
    });
    const fresh = store.addEvents(events);
    if (fresh.some((e) => e.severity === 'err' && e.resourceId)) {
      const snap = store.getSnapshot();
      store.setProjects(escalate(snap.projects, snap.events));
    }
  }

  async function pollRecommendations(): Promise<void> {
    try {
      const recommendations = await fetchRecommendations(store.getSnapshot().projects, auth);
      store.setRecommendations(recommendations);
    } catch (e) {
      log.warn(`recommender query failed: ${(e as Error).message}`);
    }
  }

  async function pollBilling(): Promise<void> {
    const table = config.billing.bigqueryTable;
    if (!table) return;
    try {
      const months = await fetchBilling(table, auth);
      store.setCosts({ source: 'billing', months });
    } catch (e) {
      log.warn(`billing export query failed: ${(e as Error).message}`);
    }
  }

  const kick = async () => {
    try {
      await pollResources();
      await pollEvents();
      await pollBilling();
      await pollRecommendations();
    } catch (e) {
      log.error(`poll failed: ${(e as Error).message}`);
    }
  };
  void kick();

  const resourceTimer = setInterval(() => {
    if (!stopped) void pollResources().catch((e) => log.error(`resource poll: ${e.message}`));
  }, config.poll.resourcesSeconds * 1000);
  const eventTimer = setInterval(() => {
    if (!stopped) void pollEvents().catch((e) => log.error(`event poll: ${e.message}`));
  }, config.poll.eventsSeconds * 1000);
  const billingTimer = setInterval(() => {
    if (!stopped) void pollBilling();
  }, BILLING_POLL_MS);
  const recommendationTimer = setInterval(() => {
    if (!stopped) void pollRecommendations();
  }, BILLING_POLL_MS);

  return () => {
    stopped = true;
    clearInterval(resourceTimer);
    clearInterval(eventTimer);
    clearInterval(billingTimer);
    clearInterval(recommendationTimer);
  };
}
