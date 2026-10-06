"use client";

import { useEffect, useState } from "react";

/**
 * Minimal loader for client screens. Replace with TanStack Query when live data lands (P-3.2).
 * `deps` must be primitives; loading is derived from whether the stored result belongs to the current deps.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: (string | number | boolean | null | undefined)[]) {
  const key = deps.map(String).join("|");
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setResult({ key, data, error: null }))
      .catch((e: unknown) => alive && setResult({ key, data: null, error: e instanceof Error ? e.message : "Failed to load" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = result?.key === key ? result : null;
  return { data: current?.data ?? null, loading: current === null, error: current?.error ?? null };
}
