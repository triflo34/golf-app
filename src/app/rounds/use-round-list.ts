"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RoundListItem,
  RoundListCursor,
  RoundListResponse,
} from "@/app/api/rounds/list/route";

const PAGE = 20;

/**
 * Shared data layer for the All Rounds page (classic + v2). Keyset-paginated
 * round history with optional search; re-fetches the first page whenever the
 * (debounced) query changes. `enabled` gates the first fetch until auth is
 * ready. A request-id ref drops stale responses when the query changes fast.
 */
export function useRoundList(query: string, enabled: boolean) {
  const [rounds, setRounds] = useState<RoundListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<RoundListCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (c: RoundListCursor | null, q: string) => {
    const qs = new URLSearchParams({ limit: String(PAGE) });
    if (q) qs.set("q", q);
    if (c) {
      qs.set("before_at", c.before_at);
      qs.set("before_id", String(c.before_id));
    }
    const res = await fetch(`/api/rounds/list?${qs}`, { cache: "no-store" });
    if (!res.ok) {
      return { rounds: [], next_cursor: null, total: 0 } as RoundListResponse;
    }
    return (await res.json()) as RoundListResponse;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = ++reqId.current;
    setLoading(true);
    fetchPage(null, query).then((d) => {
      if (id !== reqId.current) return; // a newer query superseded this one
      setRounds(d.rounds);
      setTotal(d.total);
      setCursor(d.next_cursor);
      setDone(d.next_cursor == null);
      setLoading(false);
    });
  }, [query, enabled, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const id = reqId.current;
    const d = await fetchPage(cursor, query);
    if (id !== reqId.current) return; // query changed mid-flight
    setRounds((prev) => [...prev, ...d.rounds]);
    setCursor(d.next_cursor);
    setDone(d.next_cursor == null);
    setLoadingMore(false);
  }, [cursor, loadingMore, query, fetchPage]);

  return { rounds, total, loading, loadingMore, done, loadMore };
}
