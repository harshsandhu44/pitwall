// One-off generator for the circuit registry. Re-run when a new circuit or layout appears.
//
//   gh release download -R f1db/f1db -p f1db-json-single.zip -D /tmp/f1db && unzip /tmp/f1db/f1db-json-single.zip -d /tmp/f1db
//   node apps/api/scripts/gen-circuits.mjs /tmp/f1db/f1db.json
//
// Sources (nothing is hand-entered):
//   - Jolpica /circuits: the circuit ids the API uses
//   - f1db (CC BY 4.0): coordinates for matching, layout per race, layout lengths, SVG layouts
//   - Open-Meteo timezone=auto: IANA timezone for each circuit coordinate
//   - bacinger/f1-circuits (MIT): GeoJSON for the latest layout of current venues, replacing f1db's SVG
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
  circuits[j.circuitId] = { f1dbId: c.id, lat: c.latitude, lon: c.longitude, jolpica: { lat: Number(j.Location.lat), lon: Number(j.Location.long) }, timezone: null };
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
// bacinger/f1-circuits (MIT): real-world GeoJSON for current venues. It replaces a venue's latest f1db layout when the
// lengths agree; older layouts and venues it lacks keep f1db. Written as the same single-stroke SVG, north up.
const BACINGER = "https://raw.githubusercontent.com/bacinger/f1-circuits/master";
const SIZE = 500;
const PAD = 25;
const latest = {}; // Jolpica circuit id -> [year*100+round, layout id] of its most recent f1db race
for (const [key, [jid, layoutId]] of Object.entries(races)) {
  const [y, r] = key.split("/").map(Number);
  if (!latest[jid] || y * 100 + r > latest[jid][0]) latest[jid] = [y * 100 + r, layoutId];
}
const geo = await (await fetch(`${BACINGER}/f1-circuits.geojson`)).json();
const replaced = [];
for (const f of geo.features) {
  const { id, length } = f.properties;
  let pts = f.geometry.coordinates;
  const lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  // A venue near by either source's coordinates (f1db's are kilometres off for Jeddah and Las Vegas) whose latest
  // layout is the same length; Las Vegas has two venues nearby, Caesars Palace and the Strip.
  const near = (j) => Math.min(km({ lat: lat0, lon: lon0 }, circuits[j]), km({ lat: lat0, lon: lon0 }, circuits[j].jolpica));
  const sameLength = (j) => Math.abs(length - layoutLength[latest[j]?.[1]] * 1000) <= length * 0.02;
  const nearby = ids.filter((j) => near(j) <= MATCH_KM);
  const jid = nearby.find(sameLength);
  if (!jid) {
    console.warn(`bacinger ${id}: kept f1db (${length}m; nearby: ${nearby.map((j) => `${latest[j]?.[1]} ${layoutLength[latest[j]?.[1]]}km`).join(", ") || "none"})`);
    continue;
  }
  const layoutId = latest[jid][1];
  // Local equirectangular projection, y down: fine at circuit scale.
  const k = Math.cos((lat0 * Math.PI) / 180);
  const at = pts.at(-1);
  if (at[0] === pts[0][0] && at[1] === pts[0][1]) pts = pts.slice(0, -1);
  const xy = pts.map(([lon, lat]) => [(lon - lon0) * k, lat0 - lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = (SIZE - 2 * PAD) / Math.max(maxX - minX, maxY - minY);
  const ox = (SIZE - (maxX - minX) * s) / 2;
  const oy = (SIZE - (maxY - minY) * s) / 2;
  const out = xy.map(([x, y]) => [(x - minX) * s + ox, (y - minY) * s + oy]);
  if (!out.every(([x, y]) => x >= PAD - 1e-6 && x <= SIZE - PAD + 1e-6 && y >= PAD - 1e-6 && y <= SIZE - PAD + 1e-6))
    throw new Error(`bacinger ${id}: projection outside the ${SIZE}px canvas`);
  const path = out.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + "Z";
  writeFileSync(
    join(OUT_SVG, `${layoutId}.svg`),
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">\n    <path style="fill: none; stroke: #fff; stroke-width: 20; stroke-linejoin: round;" d="${path}"/>\n</svg>\n`,
  );
  replaced.push(layoutId);
}
const mit = await (await fetch(`${BACINGER}/LICENSE.md`)).text();
writeFileSync(
  join(OUT_SVG, "ATTRIBUTION.md"),
  "Circuit layouts from F1DB (https://github.com/f1db/f1db), licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).\n\n" +
    `These layouts are from bacinger/f1-circuits (https://github.com/bacinger/f1-circuits) instead, under the MIT licence below: ${replaced.sort().join(", ")}.\n\n` +
    mit,
);
console.log(`${ids.length} circuits, ${Object.keys(races).length} races, ${list.length} layouts (${replaced.length} from bacinger)`);
