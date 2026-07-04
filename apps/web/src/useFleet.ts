import { useCallback, useEffect, useRef, useState } from 'react';
import type { FleetEvent, FleetSnapshot } from '@amon-sul/shared';
import { fetchSnapshot, openStream } from './api';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'error';

export interface Fleet {
  snapshot: FleetSnapshot | null;
  /** Set on each SSE fleet-event so the rail can flash the newest chip. */
  freshEventId: string | null;
  connection: Connection;
  refresh: () => void;
}

const MAX_EVENTS = 100;

export function useFleet(): Fleet {
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);
  const [freshEventId, setFreshEventId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const everConnected = useRef(false);

  const refresh = useCallback(() => {
    fetchSnapshot()
      .then((s) => setSnapshot(s))
      .catch(() => setConnection('error'));
  }, []);

  useEffect(() => {
    refresh();
    const close = openStream({
      onEvent: (event: FleetEvent) => {
        setSnapshot((prev) =>
          prev
            ? { ...prev, events: [event, ...prev.events].slice(0, MAX_EVENTS) }
            : prev,
        );
        setFreshEventId(event.id);
      },
      onSnapshot: (s: FleetSnapshot) => setSnapshot(s),
      onOpen: () => {
        setConnection('live');
        // EventSource auto-reconnects; resync after a drop.
        if (everConnected.current) refresh();
        everConnected.current = true;
      },
      onError: () => setConnection('reconnecting'),
    });
    return close;
  }, [refresh]);

  return { snapshot, freshEventId, connection, refresh };
}
