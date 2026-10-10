import type { ApiResponse } from "@pitwall/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

export { nav } from "./nav";

export const envelope = <T,>(data: T, extra: Partial<ApiResponse<T>> = {}): ApiResponse<T> => ({
  status: "ok",
  data,
  source: "jolpica",
  fetchedAt: new Date().toISOString(),
  observedAt: null,
  cache: "hit",
  maxAgeSeconds: 3600,
  ...extra,
});

/** Route API paths (path + query) to handlers; unknown paths fail the test loudly. */
export function mockApi(routes: Record<string, () => unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const key = url.pathname + url.search;
    const handler = routes[key];
    if (!handler) throw new Error(`unmocked API call ${key}`);
    const body = handler();
    const status = (body as ApiResponse<unknown>).status === "unavailable" ? 503 : 200;
    return Response.json(body, { status });
  });
}

export function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}
