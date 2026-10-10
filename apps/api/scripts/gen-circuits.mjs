// One-off generator for the circuit registry. Re-run when a new circuit or layout appears.
//
//   gh release download -R f1db/f1db -p f1db-json-single.zip -D /tmp/f1db && unzip /tmp/f1db/f1db-json-single.zip -d /tmp/f1db
//   node apps/api/scripts/gen-circuits.mjs /tmp/f1db/f1db.json
//
// Sources (nothing is hand-entered):
//   - Jolpica /circuits: the circuit ids the API uses
//   - f1db (CC BY 4.0): coordinates for matching, layout per race, layout lengths, SVG layouts
//   - Open-Meteo timezone=auto: IANA timezone for each circuit coordinate
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_JSON = join(here, "../src/circuits.json");
const OUT_SVG = join(here, "../../app/public/circuits");
const MATCH_KM = 3;

const f1db = JSON.parse(readFileSync(process.argv[2], "utf8"));

// Jolpica: ~4 req/s burst, ~500 req/hour. Wait out 429s instead of failing.
async function jolpicaJson(path) {
  for (;;) {
    const res = await fetch(`https://api.jolpi.ca/ergast/f1/${path}`);
    if (res.status !== 429) return res.json();
    const wait = Number(res.headers.get("retry-after") ?? 60);
    console.warn(`429 from Jolpica, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const jolpica = await jolpicaJson("circuits.json?limit=100");
const jCircuits = jolpica.MRData.CircuitTable.Circuits;
if (Number(jolpica.MRData.total) > jCircuits.length) throw new Error("Jolpica circuits need pagination");

const km = (a, b) => {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// Match through a shared race: the circuit's first Jolpica race (season, round) -> f1db race -> circuitId.
const f1dbRace = new Map(f1db.races.map((r) => [`${r.year}/${r.round}`, r]));
const f1dbCircuit = new Map(f1db.circuits.map((c) => [c.id, c]));
const circuits = {};
for (const j of jCircuits) {
  await new Promise((r) => setTimeout(r, 300)); // Jolpica burst limit ~4 req/s
  const res = await jolpicaJson(`circuits/${j.circuitId}/races.json?limit=1`);
  const first = res.MRData.RaceTable.Races[0];
  const c = first && f1dbCircuit.get(f1dbRace.get(`${first.season}/${first.round}`)?.circuitId);
  if (!c) {
    console.warn(`unmatched: ${j.circuitId}`);
    continue;
  }
  const d = km({ lat: Number(j.Location.lat), lon: Number(j.Location.long) }, { lat: c.latitude, lon: c.longitude });
  if (d > MATCH_KM) console.warn(`check: ${j.circuitId} -> ${c.id} coordinates differ by ${d.toFixed(1)}km`);
  circuits[j.circuitId] = { f1dbId: c.id, lat: c.latitude, lon: c.longitude, timezone: null };
}
const byF1db = Object.fromEntries(Object.entries(circuits).map(([id, c]) => [c.f1dbId, id]));
const dupes = Object.values(circuits).length - Object.keys(byF1db).length;
if (dupes) throw new Error(`${dupes} f1db circuits matched more than one Jolpica id`);

// Timezones: one multi-location request.
const ids = Object.keys(circuits);
const tzUrl = new URL("https://api.open-meteo.com/v1/forecast");
tzUrl.searchParams.set("latitude", ids.map((id) => circuits[id].lat).join(","));
tzUrl.searchParams.set("longitude", ids.map((id) => circuits[id].lon).join(","));
tzUrl.searchParams.set("timezone", "auto");
tzUrl.searchParams.set("current", "temperature_2m");
const tz = await (await fetch(tzUrl)).json();
if (!Array.isArray(tz) || tz.length !== ids.length) throw new Error("unexpected Open-Meteo response");
ids.forEach((id, i) => (circuits[id].timezone = tz[i].timezone));

// Layout per race ("year/round"), only for matched circuits.
const layoutLength = {};
for (const c of f1db.circuits) for (const l of c.layouts ?? []) layoutLength[l.id] = l.length ?? null;
const races = {};
const used = new Set();
for (const r of f1db.races) {
  const jid = byF1db[r.circuitId];
  if (!jid || !r.circuitLayoutId) continue;
  races[`${r.year}/${r.round}`] = [jid, r.circuitLayoutId];
  used.add(r.circuitLayoutId);
}

// Coordinates are only used for matching/timezone; at runtime the API uses Jolpica's own coordinates.
const timezones = Object.fromEntries(ids.map((id) => [id, circuits[id].timezone]));
writeFileSync(
  OUT_JSON,
  JSON.stringify({ source: "f1db (CC BY 4.0) + Jolpica + Open-Meteo", timezones, layoutLength, races }) + "\n",
);

// SVG layouts ("white" style: single stroke, used as a CSS mask so it follows theme colors).
mkdirSync(OUT_SVG, { recursive: true });
const list = [...used];
for (let i = 0; i < list.length; i += 8) {
  await Promise.all(
    list.slice(i, i + 8).map(async (id) => {
      const res = await fetch(`https://raw.githubusercontent.com/f1db/f1db/main/src/assets/circuits/white/${id}.svg`);
      if (!res.ok) return console.warn(`missing svg ${id}`);
      writeFileSync(join(OUT_SVG, `${id}.svg`), await res.text());
    }),
  );
}
writeFileSync(
  join(OUT_SVG, "ATTRIBUTION.md"),
  "Circuit layouts from F1DB (https://github.com/f1db/f1db), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).\n",
);
console.log(`${ids.length} circuits, ${Object.keys(races).length} races, ${list.length} layouts`);
