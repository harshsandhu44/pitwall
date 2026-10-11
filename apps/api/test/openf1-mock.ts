/**
 * A fake OpenF1 over fixture tables. It applies the query filters Pitwall uses: equality (repeated keys
 * are ORed), `key>=`, `key<=` and `key<` (numbers or dates; strictness is ignored). Like OpenF1, it answers an empty result with 404.
 */
export function openf1Mock(tables: Record<string, Record<string, unknown>[]>) {
  return (url: URL): Response => {
    const table = tables[url.pathname.replace("/v1/", "")];
    if (!table) return new Response("not mocked", { status: 500 });
    const eq = new Map<string, string[]>();
    const range: [string, ">" | "<", number][] = [];
    const value = (x: unknown) => (typeof x === "number" ? x : Number.isNaN(Number(x)) ? Date.parse(String(x)) : Number(x));
    for (let [k, v] of url.searchParams) {
      // `date<x` has no "=", so it arrives as a key with an empty value.
      const bare = /^(\w+[<>])(.+)$/.exec(k);
      if (bare && v === "") [k, v] = [bare[1]!, bare[2]!];
      const op = k.at(-1);
      if (op === ">" || op === "<") range.push([k.slice(0, -1), op, value(v)]);
      else eq.set(k, [...(eq.get(k) ?? []), v]);
    }
    const rows = table.filter(
      (r) =>
        [...eq].every(([k, vs]) => vs.includes(String(r[k]))) &&
        range.every(([k, op, v]) => (op === ">" ? value(r[k]) >= v : value(r[k]) <= v)),
    );
    return rows.length ? Response.json(rows) : Response.json({ detail: "No results found." }, { status: 404 });
  };
}
