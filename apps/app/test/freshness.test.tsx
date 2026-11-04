import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FreshnessIndicator } from "@/components/layout/freshness-indicator";
import { useApi } from "@/lib/api";
import { envelope, mockApi } from "./utils";

// Like the header's calendar, which waits for the seasons: its query is first built while this renders.
function Dependent() {
  const seasons = useApi<number[]>("/api/seasons");
  useApi(seasons.data?.data ? `/api/calendar?season=${seasons.data.data[0]}` : null);
  return null;
}

describe("freshness indicator", () => {
  it("doesn't update while another component builds a query in the pass after hydration", async () => {
    // A boundary that hydrates late, as the header's NavLinks does, finds the cache filled and watched.
    const tree = (client: QueryClient) => (
      <QueryClientProvider client={client}>
        <Dependent />
        <FreshnessIndicator />
      </QueryClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree(new QueryClient()));
    const client = new QueryClient();
    client.setQueryData(["/api/seasons"], envelope([2026]));
    const unwatch = new QueryObserver(client, { queryKey: ["/api/seasons"], enabled: false }).subscribe(() => {});
    mockApi({ "/api/calendar?season=2026": () => envelope([]) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, tree(client));
    });
    expect(error.mock.calls.flat().join("\n")).not.toMatch(/Cannot update a component/);
    expect(container.textContent).toContain("Data fresh");
    error.mockRestore();
    unwatch();
  });
});
