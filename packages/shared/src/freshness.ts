import type { ApiResponse } from "./types";

export type Freshness = "fresh" | "stale" | "unknown";

/** Freshness of a payload at `now`, from when it was fetched and its freshness window. */
export function freshness(
  res: Pick<ApiResponse<unknown>, "fetchedAt" | "maxAgeSeconds">,
  now: number = Date.now(),
): Freshness {
  if (!res.fetchedAt) return "unknown";
  const fetched = Date.parse(res.fetchedAt);
  if (Number.isNaN(fetched)) return "unknown";
  return now - fetched <= res.maxAgeSeconds * 1000 ? "fresh" : "stale";
}
