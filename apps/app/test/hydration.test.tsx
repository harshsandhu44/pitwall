import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useApi } from "@/lib/api";
import { envelope } from "./utils";

function Seasons() {
  const q = useApi<number[]>("/api/seasons");
  return <p>{q.data?.data?.join(",") ?? "none"}</p>;
}

describe("hydration", () => {
  it("matches the server HTML even when the cache already holds the data", async () => {
    const tree = (client: QueryClient) => (
      <QueryClientProvider client={client}>
        <Seasons />
      </QueryClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(tree(new QueryClient()));
    // A boundary that hydrates late finds the cache filled by the rest of the page.
    const client = new QueryClient();
    client.setQueryData(["/api/seasons"], envelope([2026]));
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(container, tree(client), { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe("2026");
  });
});
