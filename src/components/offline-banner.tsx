"use client";

import { useCallback, useEffect, useState } from "react";
import { countQueue, flushQueue } from "@/lib/offline-queue";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setQueued(await countQueue());
    } catch {
      // ignore — IDB unavailable
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    function onOnline() {
      setOnline(true);
      void doFlush();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Poll the queue count periodically so it stays in sync when other tabs add to it.
    const t = setInterval(refresh, 5000);
    void refresh();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doFlush = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      const { failed } = await flushQueue();
      if (failed) {
        setLastError(
          `Sync paused on ${failed.label ?? failed.method + " " + failed.url}.`,
        );
      }
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  // Nothing to show: online and queue empty.
  if (online && queued === 0) return null;

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[calc(100vw-2rem)] px-3 py-2 rounded-lg shadow-lg text-xs ${
        online
          ? "bg-blue-50 border border-blue-200 text-blue-900"
          : "bg-orange-50 border border-orange-200 text-orange-900"
      }`}
      role="status"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">
          {online ? "Online" : "Offline"}
        </span>
        {queued > 0 && (
          <span>
            · {queued} {queued === 1 ? "save" : "saves"} pending
          </span>
        )}
        {online && queued > 0 && (
          <button
            type="button"
            onClick={() => void doFlush()}
            disabled={busy}
            className="ml-auto text-blue-700 font-medium underline disabled:opacity-50"
          >
            {busy ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
      {lastError && (
        <div className="mt-1 text-[11px] opacity-80">{lastError}</div>
      )}
    </div>
  );
}
