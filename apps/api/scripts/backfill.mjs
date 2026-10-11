// Fills production D1 with Jolpica seasons, from your own IP (Jolpica refuses most requests from Workers).
// Run the API locally with its D1 binding pointed at production (see README "Deploying"), then:
//
//   node apps/api/scripts/backfill.mjs http://localhost:8790 2000 2022
//
// It requests the normal routes, newest season first: calendar, standings, progression, results, every
// race weekend, then the profile of every driver and constructor seen. Snapshots never expire, so a rerun
// skips what's already stored (cache hits) and picks up where it stopped. Rate limits are waited out.
const [base, from, to] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
if (!base || !from || !to) throw new Error("usage: backfill.mjs <api base url> <first season> <last season>");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let fetched = 0;
let skipped = 0;

async function get(path) {
  for (let failures = 0; ; ) {
    let body = null;
    try {
      body = await (await fetch(base + path, { signal: AbortSignal.timeout(180_000) }) // a hung request is retried).json();
    } catch (e) {
      body = { status: "unavailable", reason: String(e) };
    }
    if (body.status === "ok" || body.status === "stale") {
      if (body.cache === "miss") fetched++;
      else skipped++;
      return body.data;
    }
    if (body.status === "not_found" || body.status === "error") {
      log(`skip ${path}: ${body.reason}`);
      return null;
    }
    const wait = /(?:retry in|retry after|backing off for) (\d+)s/.exec(body.reason ?? "");
    if (!wait && ++failures > 5) {
      log(`giving up on ${path}: ${body.reason}`);
      return null;
    }
    const secs = wait ? Number(wait[1]) + 1 : 30;
    log(`waiting ${secs}s for ${path} (${body.reason})`);
    await sleep(secs * 1000);
  }
}

const drivers = new Set();
const constructors = new Set();
for (let season = to; season >= from; season--) {
  const races = (await get(`/api/calendar?season=${season}`)) ?? [];
  for (const type of ["drivers", "constructors"]) {
    const s = await get(`/api/standings/${type}?season=${season}`);
    for (const e of s?.entries ?? []) (type === "drivers" ? drivers : constructors).add(e.driver?.id ?? e.constructor?.id);
    await get(`/api/standings/progression?season=${season}&type=${type}`);
  }
  await get(`/api/results?season=${season}`);
  for (const r of races) await get(`/api/races/${r.round}?season=${season}`);
  log(`${season} done (${fetched} fetched, ${skipped} already stored)`);
}
for (const id of drivers) await get(`/api/drivers/${id}`);
for (const id of constructors) await get(`/api/teams/${id}`);
log(`profiles done: ${drivers.size} drivers, ${constructors.size} constructors (${fetched} fetched, ${skipped} already stored)`);
