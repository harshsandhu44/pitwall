import type { ApiResponse } from "@pitwall/shared";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** An API envelope without data (unavailable, not found, error) or a network failure. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly response: ApiResponse<unknown> | null,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError("Can't reach the Pitwall API. Check your connection.", null);
  }
  let body: ApiResponse<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`The Pitwall API returned an unreadable response (HTTP ${res.status}).`, null);
  }
  if (body.data === null) throw new ApiError(body.reason ?? body.status, body);
  return body;
}

const noSubscribe = () => () => {};

/**
 * Query an API path; `null` disables the query until its inputs are known. `poll` returns how often to
 * refetch (ms) given the latest response, or false to stop.
 */
export function useApi<T>(path: string | null, poll?: (res: ApiResponse<T> | undefined) => number | false) {
  // The server never has data, but a Suspense boundary can hydrate after the shared cache has filled.
  // Read as "not loaded" while hydrating so that render matches the server HTML.
  const hydrating = useSyncExternalStore(noSubscribe, () => false, () => true);
  return useQuery({
    queryKey: hydrating ? ["hydrating"] : [path],
    queryFn: ({ signal }) => apiGet<T>(path!, signal),
    enabled: path !== null && !hydrating,
    refetchInterval: poll && ((query) => poll(query.state.data)),
  });
}
