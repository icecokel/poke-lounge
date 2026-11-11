"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPublicRooms, type PublicRoomSummary } from "../network/public-room-directory";

/**
 * Loads the public room directory while `active` and on manual refresh.
 *
 * Every request owns an AbortController: starting another request, leaving the directory or
 * unmounting aborts the one in flight, so a late response never updates state.
 */
export function usePublicRooms({
  active,
  loadFailedMessage,
}: {
  active: boolean;
  loadFailedMessage: string;
}) {
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    function loadPublicRoomDirectory() {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      setLoading(true);
      setError("");
      void fetchPublicRooms(controller.signal)
        .then(function handleResolved(nextRooms) {
          if (!controller.signal.aborted) setRooms(nextRooms);
        })
        .catch(function handleRejected() {
          if (!controller.signal.aborted) setError(loadFailedMessage);
        })
        .finally(function handleSettled() {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [loadFailedMessage],
  );

  useEffect(
    function loadWhileActive() {
      if (!active) return undefined;

      refresh();
      return function cleanup() {
        requestRef.current?.abort();
      };
    },
    [active, refresh],
  );

  const markLoading = useCallback(function markLoading() {
    setLoading(true);
  }, []);

  return { rooms, loading, error, refresh, markLoading };
}
