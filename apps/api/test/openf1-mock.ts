/**
 * A fake OpenF1 over fixture tables. It applies the query filters Pitwall uses: equality (repeated keys
 * are ORed), `key>=` and `key<=`. Like OpenF1, it answers an empty result with 404.
 */
export function openf1Mock(tables: Record<string, Record<string, unknown>[]>) {
  return (url: URL): Response => {
    const table = tables[url.pathname.replace("/v1/", "")];
    if (!table) return new Response("not mocked", { status: 500 });
    const eq = new Map<string, string[]>();
    const range: [string, ">" | "<", number][] = [];
    for (const [k, v] of url.searchParams) {
      const op = k.at(-1);
      if (op === ">" || op === "<") range.push([k.slice(0, -1), op, Number(v)]);
      else eq.set(k, [...(eq.get(k) ?? []), v]);
    }
    const rows = table.filter(
      (r) =>
        [...eq].every(([k, vs]) => vs.includes(String(r[k]))) &&
        range.every(([k, op, v]) => (op === ">" ? Number(r[k]) >= v : Number(r[k]) <= v)),
    );
    return rows.length ? Response.json(rows) : Response.json({ detail: "No results found." }, { status: 404 });
  };
}
