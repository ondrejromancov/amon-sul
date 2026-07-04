import type { GoogleAuth } from 'google-auth-library';
import type { ResourceType } from '@amon-sul/shared';
import type { CollectedResource } from '../layout.js';

export type { CollectedResource };

export interface ResourceCollector {
  type: ResourceType;
  collect(projectId: string, auth: GoogleAuth): Promise<CollectedResource[]>;
}

/**
 * True when an API is simply not enabled on the project — treated as
 * "this project doesn't use that resource type", not an error.
 */
export function isApiDisabled(e: unknown): boolean {
  const err = e as { code?: number | string; message?: string };
  const msg = err?.message ?? '';
  return (
    err?.code === 403 &&
    (msg.includes('has not been used') ||
      msg.includes('is disabled') ||
      msg.includes('SERVICE_DISABLED') ||
      msg.includes('API not enabled'))
  );
}

/** Relative time like "2m ago" / "3h ago" / "5d ago" for statusText lines. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Last path segment of a GCP resource name/url. */
export function lastSegment(name: string | null | undefined): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] ?? '';
}
