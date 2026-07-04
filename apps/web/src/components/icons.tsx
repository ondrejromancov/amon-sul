import type { ResourceType } from '@amon-sul/shared';

export const TYPE_META: Record<ResourceType, { label: string; bg: string }> = {
  run: { label: 'Cloud Run', bg: 'rgba(91,157,255,.14)' },
  sql: { label: 'Cloud SQL', bg: 'rgba(52,211,153,.13)' },
  pubsub: { label: 'Pub/Sub', bg: 'rgba(251,191,36,.12)' },
  storage: { label: 'Cloud Storage', bg: 'rgba(230,234,242,.08)' },
  scheduler: { label: 'Cloud Scheduler', bg: 'rgba(230,234,242,.08)' },
  redis: { label: 'Memorystore', bg: 'rgba(248,113,113,.12)' },
  vm: { label: 'Compute Engine', bg: 'rgba(91,157,255,.14)' },
};

export function TypeIcon({ type }: { type: ResourceType }) {
  switch (type) {
    case 'run':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B9DFF" strokeWidth="2">
          <path d="M6 4l14 8-14 8z" />
        </svg>
      );
    case 'sql':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2">
          <ellipse cx="12" cy="5.5" rx="8" ry="3" />
          <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      );
    case 'pubsub':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2">
          <circle cx="12" cy="5" r="2.5" />
          <circle cx="5" cy="19" r="2.5" />
          <circle cx="19" cy="19" r="2.5" />
          <path d="M12 8v4m0 0l-5 5m5-5l5 5" />
        </svg>
      );
    case 'storage':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B94A7" strokeWidth="2">
          <path d="M4 7l2-4h12l2 4M4 7h16v13H4z" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'scheduler':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B94A7" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case 'redis':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2">
          <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
        </svg>
      );
    case 'vm':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B9DFF" strokeWidth="2">
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
        </svg>
      );
  }
}

export function LogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="5" cy="5" r="2.4" fill="#5B9DFF" />
      <circle cx="15" cy="5" r="2.4" fill="#34D399" />
      <circle cx="5" cy="15" r="2.4" fill="#FBBF24" />
      <circle cx="15" cy="15" r="2.4" fill="#F87171" />
      <path d="M7 5h6M5 7v6M15 7v6M7 15h6" stroke="#3A4557" strokeWidth="1.2" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B94A7" strokeWidth="2.4">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}
