import type { ApiResponse } from "@pitwall/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement, ReactNode } from "react";
import { SeasonProvider } from "@/lib/hooks";
import { ThemeProvider } from "@/theme/theme";

// Same helpers as apps/app/test/utils.tsx.
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

/** Paths a screen asked for that the test didn't mock; checked after each test (the screen swallows the error). */
export const unmocked: string[] = [];
afterEach(() => {
  expect(unmocked.splice(0)).toEqual([]);
  jest.restoreAllMocks();
});

/** Route API paths (path + query) to handlers; unknown paths fail the test. */
export function mockApi(routes: Record<string, () => unknown>) {
  return jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const handler = routes[url.pathname + url.search];
    if (!handler) {
      unmocked.push(url.pathname + url.search);
      throw new Error(`unmocked API call ${url.pathname + url.search}`);
    }
    const body = handler();
    return { ok: true, status: 200, json: async () => body, text: async () => "" } as Response;
  });
}

/** One screen at "/", inside the app's providers. */
export function renderScreen(Screen: () => ReactElement | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <SeasonProvider>{children}</SeasonProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
  return renderRouter({ index: Screen }, { wrapper });
}
