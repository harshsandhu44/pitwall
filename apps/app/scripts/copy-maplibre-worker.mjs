// MapLibre 6 loads its worker as a separate ES module, resolved next to the main module by default.
// Bundling moves the main module, so serve the worker (and the chunk it imports) from /public instead.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkg, "utf8"));
const out = join(import.meta.dirname, "../public/maplibre", version);
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(dirname(pkg), "dist", f), join(out, f));
