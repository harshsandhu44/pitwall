// Generator for the OpenF1 → Jolpica identity map. Re-run when a season starts or a lineup changes
// (a driver or team missing from the map shows without a profile link until then):
//
//   node apps/api/scripts/gen-openf1-map.mjs
//
// Sources (nothing is hand-entered):
//   - Jolpica: driver/constructor ids and details, the seasons each took part in, circuit details
//   - OpenF1: driver numbers, acronyms and team names as used in its race sessions
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/openf1-map.json");
const FIRST_SEASON = 2023;
const LAST_SEASON = new Date().getUTCFullYear();
const UA = { "User-Agent": "Pitwall/0.1 (non-commercial F1 dashboard; +https://f1.harshsandhu.com)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Jolpica: ~4 req/s burst, ~500 req/hour. Wait out 429s instead of failing.
async function jolpica(path) {
  for (;;) {
    await sleep(300);
    const res = await fetch(`https://api.jolpi.ca/ergast/f1/${path}`, { headers: UA });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 60);
      console.warn(`429 from Jolpica, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Jolpica ${path}: HTTP ${res.status}`);
    const body = await res.json();
    if (Number(body.MRData.total) > Number(body.MRData.limit)) throw new Error(`Jolpica ${path} needs pagination`);
    return body.MRData;
  }
}

// OpenF1 free tier: 3 req/s, 30/min.
async function openf1(path) {
  await sleep(2100);
  const res = await fetch(`https://api.openf1.org/v1/${path}`, { headers: UA });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OpenF1 ${path}: HTTP ${res.status}`);
  return res.json();
}

const driverInfo = (d) => ({
  code: d.code ?? null,
  number: d.permanentNumber ? Number(d.permanentNumber) : null,
  givenName: d.givenName,
  familyName: d.familyName,
  nationality: d.nationality ?? null,
  dateOfBirth: d.dateOfBirth ?? null,
  url: d.url ?? null,
});
const constructorInfo = (c) => ({ name: c.name, nationality: c.nationality ?? null, url: c.url ?? null });
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

const drivers = {};
const constructors = {};
const circuits = {};
const seasons = {};

for (let season = FIRST_SEASON; season <= LAST_SEASON; season++) {
  for (const r of (await jolpica(`${season}.json?limit=100`)).RaceTable.Races) {
    const c = r.Circuit;
    circuits[c.circuitId] = {
      name: c.circuitName,
      locality: c.Location.locality,
      country: c.Location.country,
      lat: Number(c.Location.lat),
      lon: Number(c.Location.long),
    };
  }
  const standings = (await jolpica(`${season}/driverStandings.json?limit=100`)).StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  const teamsOf = new Map(standings.map((s) => [s.Driver.driverId, s.Constructors.map((c) => c.constructorId)]));
  for (const s of standings) {
    drivers[s.Driver.driverId] = driverInfo(s.Driver);
    for (const c of s.Constructors) constructors[c.constructorId] = constructorInfo(c);
  }

  const raceKeys = (await openf1(`sessions?year=${season}&session_name=Race`))
    .filter((s) => !s.is_cancelled && Date.parse(s.date_end) < Date.now())
    .map((s) => s.session_key);
  if (!raceKeys.length) {
    console.warn(`${season}: no finished OpenF1 races yet`);
    continue;
  }
  const rows = await openf1(`drivers?${raceKeys.map((k) => `session_key=${k}`).join("&")}`);

  // Driver number → Jolpica id: by three-letter code, then by permanent number; ambiguous stays unmapped.
  const numbers = {};
  const unique = (xs) => (xs.length === 1 ? xs[0] : null);
  for (const row of rows) {
    if (row.driver_number in numbers) continue;
    const id =
      unique(standings.filter((s) => s.Driver.code === row.name_acronym)) ??
      unique(standings.filter((s) => Number(s.Driver.permanentNumber) === row.driver_number));
    if (id) numbers[row.driver_number] = id.Driver.driverId;
    else console.warn(`${season}: no Jolpica driver for #${row.driver_number} ${row.name_acronym}`);
  }

  // OpenF1 team name → Jolpica constructor: through drivers who drove for exactly one constructor this
  // season, then by name.
  const teams = {};
  for (const row of rows) {
    const only = teamsOf.get(numbers[row.driver_number]);
    if (row.team_name && only?.length === 1) teams[row.team_name] ??= only[0];
  }
  const seasonConstructors = [...new Set(standings.flatMap((s) => s.Constructors.map((c) => c.constructorId)))];
  for (const name of new Set(rows.map((r) => r.team_name).filter(Boolean))) {
    if (teams[name]) continue;
    const id = unique(seasonConstructors.filter((c) => norm(constructors[c].name).includes(norm(name)) || norm(name).includes(norm(constructors[c].name))));
    if (id) teams[name] = id;
    else console.warn(`${season}: no Jolpica constructor for OpenF1 team "${name}"`);
  }
  seasons[season] = { numbers, teams };
}

// Every season each driver and constructor took part in, so profiles don't need Jolpica for the list.
for (const [kind, out] of [["drivers", drivers], ["constructors", constructors]]) {
  for (const id of Object.keys(out)) {
    const list = (await jolpica(`${kind}/${id}/seasons.json?limit=100`)).SeasonTable.Seasons;
    out[id].seasons = list.map((s) => Number(s.season)).sort((a, b) => b - a);
  }
}

writeFileSync(OUT, JSON.stringify({ source: "Jolpica + OpenF1", drivers, constructors, circuits, seasons }, null, 1) + "\n");
console.log(
  `${Object.keys(drivers).length} drivers, ${Object.keys(constructors).length} constructors, ${Object.keys(circuits).length} circuits, seasons ${Object.keys(seasons).join(", ")}`,
);
