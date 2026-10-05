"use client";

/**
 * Live data (playbook P-3.2). With the indexer connected, client screens poll it every few seconds and
 * server-rendered pages re-render themselves (LiveRefresh). On mocks, nothing polls: the data can't change.
 * Polling pauses while the tab is hidden (TanStack Query's default for refetchInterval).
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasIndexer } from "@/lib/graphql";

/** How often live screens refresh. Oracle reports land every few minutes; this keeps receipts snappy. */
export const LIVE_INTERVAL_MS = 4_000;

/** Drop-in for useAsync that keeps polling. Same { data, loading, error } shape; data stays put while refetching. */
export function useLive<T>(key: readonly (string | number | null | undefined)[], fn: () => Promise<T>) {
  const q = useQuery({
    queryKey: ["live", ...key],
    queryFn: fn,
    refetchInterval: hasIndexer() ? LIVE_INTERVAL_MS : false,
    staleTime: hasIndexer() ? LIVE_INTERVAL_MS / 2 : Infinity,
    retry: 1,
  });
  return {
    data: q.data ?? null,
    loading: q.isPending,
    error: q.error ? (q.error instanceof Error ? q.error.message : "Failed to load") : null,
  };
}

/** Re-renders the current server page every few seconds (server fetches revalidate every 5 s). Renders nothing. */
export function LiveRefresh({ everyMs = 5_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasIndexer()) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
