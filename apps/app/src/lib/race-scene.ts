// The 3D race page (race-scene-3d.tsx): the recorded cars on the traced lap, built like a model on a table.
// The circuit sits on a slab cut like Pitwall's panels, the road stands on walls as high as its real
// elevation (exaggerated), and the cars are team-colour discs with their tags. It's the only module that imports
// three for this, loaded on demand. OpenF1's x/y/z (decimetres) are scaled so the lap spans SPAN units, and
// three's y is up.
import { carAt, type PositionWindow, type ReplayDriver, type SessionReplay } from "@pitwall/shared";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Battle } from "@/components/replay/track-canvas";
import { kerbs, nearestOnLap, normals, type Pt } from "./circuit-geo";

export type View = "overview" | "follow";
/** What the page changes while the scene runs; read every frame. */
export type SceneState = { selected: number | null; battles: Battle[]; order: number[]; view: View };

/** Points along the resampled centreline. */
const N = 1600;
/** The lap's longer side, in scene units. */
const SPAN = 10;
/**
 * Heights in scene units per decimetre: ×4, as if every lap were 4 km across, so a climb reads the same
 * at Monaco as at Spa (a real 40 m climb is a hairline across a whole circuit).
 */
const HEIGHT = (SPAN / 40_000) * 4;
/** The road's height over the slab at the lap's lowest point. */
const BASE = 0.1;
/** Road and kerb widths, exaggerated as on the hero circuit. */
const W = 0.12;
const KERB_W = 0.028;
const TARMAC = "#7a7f8c";
const KERB = ["#e10600", "#f7f7f7"];
// Trails as on the 2D map: this many past positions, this far apart.
const TRAIL = 20;
const TRAIL_STEP_MS = 100;
/** A car this far (decimetres) from where it was last frame has jumped (pit lane, a seek): look along the whole lap. */
const NEAR_DM = 300;
/** Cars further apart than this aren't wheel-to-wheel here (lapped traffic, the pit lane): no battle link. */
const BATTLE_MAX = 1.2;
const TILT = THREE.MathUtils.degToRad(40);
const FOLLOW_DIST = 4.6;

export function createRaceScene(
  host: HTMLElement,
  o: {
    track: NonNullable<SessionReplay["track"]>;
    drivers: ReplayDriver[];
    time: () => number;
    getWindow: (t: number) => PositionWindow | null;
    state: SceneState;
    onSelect: (n: number) => void;
    /** Reduced motion: no trails or orbit, and the camera cuts instead of flying. */
    still: boolean;
  },
) {
  // ---- the centreline: the trace is one lap from the line, so it ends where it began; drop the overlap
  const raw = o.track.x.map((x, i) => new THREE.Vector3(x, o.track.y[i]!, o.track.z?.[i] ?? 0));
  while (raw.length > 10 && raw.at(-1)!.distanceTo(raw[0]!) < 120) raw.pop();
  const P = new THREE.CatmullRomCurve3(raw, true, "centripetal").getSpacedPoints(N).slice(0, N);
  // Heights are noisy sample to sample: average over about 10 points either side.
  const zs = P.map((p) => p.z);
  P.forEach((p, i) => (p.z = Array.from({ length: 21 }, (_, k) => zs[(i + k - 10 + N) % N]!).reduce((a, b) => a + b) / 21));
  const flat2: Pt[] = P.map((p) => [p.x, p.y]);
  const xs = flat2.map((p) => p[0]);
  const ys = flat2.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const minZ = Math.min(...P.map((p) => p.z));
  const S = SPAN / Math.max(maxX - minX, maxY - minY);
  const [CX, CY] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const wx = (x: number) => (x - CX) * S;
  const wz = (y: number) => -(y - CY) * S;
  const PW = P.map((p) => new THREE.Vector3(wx(p.x), (p.z - minZ) * HEIGHT + BASE, wz(p.y)));
  const NW = normals(flat2).map(([nx, ny]) => new THREE.Vector3(nx, 0, -ny));

  // ---- renderer, labels, light (the hero circuit's daytime light)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.domElement.className = "block size-full touch-none";
  // ponytail: 1.5, not the screen's 2-3, as on the hero; phones keep their battery.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  host.append(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = "pointer-events-none absolute inset-0";
  host.append(labels.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#e4ebf0", "#3d5244", 1.4));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.6);
  sun.position.set(-40, 90, 30).normalize().multiplyScalar(14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  scene.add(sun);

  // ---- the slab: a panel with one cut corner, laid flat, coloured from the theme
  const bx = ((maxX - minX) * S) / 2 + 0.45;
  const bz = ((maxY - minY) * S) / 2 + 0.45;
  const CUT = 0.55;
  const corners: Pt[] = [[-bx, -bz], [bx - CUT, -bz], [bx, -bz + CUT], [bx, bz], [-bx, bz]];
  const slabGeo = new THREE.ExtrudeGeometry(new THREE.Shape(corners.map(([x, z]) => new THREE.Vector2(x, z))), { depth: 0.12, bevelEnabled: false });
  slabGeo.rotateX(Math.PI / 2);
  const slabTop = new THREE.MeshBasicMaterial({ toneMapped: false });
  const slabSide = new THREE.MeshBasicMaterial({ toneMapped: false });
  const slab = new THREE.Mesh(slabGeo, [slabTop, slabSide]);
  slab.castShadow = true;
  scene.add(slab);
  const outlineMat = new THREE.LineBasicMaterial({ toneMapped: false });
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners.map(([x, z]) => new THREE.Vector3(x, 0.002, z))), outlineMat));
  // The road's shadow on the slab, and the slab's, faint, on a floor far below.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(bx * 2, bz * 2), new THREE.ShadowMaterial({ opacity: 0.16 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.001;
  catcher.receiveShadow = true;
  scene.add(catcher);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  scene.add(floor);

  // Where the lap crosses itself (Suzuka), the higher road is a bridge: no wall under it, no kerbs on it.
  const bridge = new Uint8Array(N);
  for (let i = 0; i < N; i += 2)
    for (let j = 0; j < N; j += 2) {
      if (Math.min(Math.abs(i - j), N - Math.abs(i - j)) < N * 0.1) continue;
      if (Math.hypot(PW[i]!.x - PW[j]!.x, PW[i]!.z - PW[j]!.z) < W * 1.3 && PW[i]!.y > PW[j]!.y + 0.02) for (let k = -16; k <= 16; k++) bridge[(i + k + N) % N] = 1;
    }

  // ---- road, kerbs, start line and the walls under the road
  const strip = (a: number, b: number, lift: number, keep: (i: number) => boolean = () => true, colour?: (i: number) => THREE.Color) => {
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!keep(i)) continue;
      const j = (i + 1) % N;
      const at = (k: number, off: number) => [PW[k]!.x + NW[k]!.x * off, PW[k]!.y + lift, PW[k]!.z + NW[k]!.z * off];
      for (const v of [at(i, a), at(i, b), at(j, a), at(i, b), at(j, b), at(j, a)]) {
        pos.push(...v);
        if (colour) col.push(...colour(i).toArray());
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    if (colour) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  // Double-sided: winding depends on which side of the centreline a strip is.
  const mesh = (g: THREE.BufferGeometry, p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, ...p }));
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  scene.add(mesh(strip(W / 2, -W / 2, 0), { color: TARMAC }));
  const cornered = kerbs(flat2.map(([x, y]) => [x / 10, y / 10]));
  const kerbed = (i: number) => cornered[i]! && !bridge[i];
  const band = (i: number) => new THREE.Color(KERB[Math.floor(i / 4) % 2]);
  scene.add(mesh(strip(W / 2, W / 2 + KERB_W, 0.003, kerbed, band), { vertexColors: true, roughness: 0.7 }));
  scene.add(mesh(strip(-W / 2, -W / 2 - KERB_W, 0.003, kerbed, band), { vertexColors: true, roughness: 0.7 }));
  scene.add(mesh(strip(W / 2, -W / 2, 0.005, (i) => i < 2), { color: "#ffffff", roughness: 0.6 }));
  const skirts = [W / 2, -W / 2].map((off) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const [p, n] = [PW[i % N]!, NW[i % N]!];
      pos.push(p.x + n.x * off, p.y, p.z + n.z * off, p.x + n.x * off, 0, p.z + n.z * off);
      if (i < N && !bridge[i] && !bridge[(i + 1) % N]) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = true;
    scene.add(m);
    return g;
  });

  // ---- cars: team-colour discs with a card-colour edge, as on the 2D map, each with a tag
  const edgeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const edgeGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.02, 32);
  const discGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.034, 32);
  const hitGeo = new THREE.SphereGeometry(0.17, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const pickables: THREE.Object3D[] = [];
  const cars = o.drivers.map((d) => {
    const colour = new THREE.Color(d.colour ?? TARMAC);
    const g = new THREE.Group();
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y = 0.012;
    const discMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, transparent: true });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.02;
    disc.castShadow = true;
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData.n = d.number;
    pickables.push(hit);
    g.add(edge, disc, hit);
    scene.add(g);
    const el = document.createElement("button");
    el.type = "button";
    el.tabIndex = -1; // the timing tower is the keyboard route to the same cars
    el.className =
      "pointer-events-auto flex items-center gap-1 border bg-card py-px pr-1.5 pl-1 font-mono text-[10.5px] font-medium whitespace-nowrap text-foreground hover:text-live data-selected:border-live";
    el.innerHTML = `<i class="block h-[11px] w-1 rounded-full" style="background:${d.colour ?? "var(--muted-foreground)"}"></i>${d.acronym}<b class="font-bold text-live"></b>`;
    el.addEventListener("click", (e) => (e.stopPropagation(), o.onSelect(d.number)));
    const tag = new CSS2DObject(el);
    tag.position.y = 0.16;
    g.add(tag);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array((TRAIL + 1) * 3), 3));
    tg.setAttribute("color", new THREE.BufferAttribute(Float32Array.from({ length: (TRAIL + 1) * 4 }, (_, i) => (i % 4 === 3 ? 0.7 * (1 - Math.floor(i / 4) / TRAIL) : colour.toArray()[i % 4]!)), 4));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    trail.frustumCulled = false;
    scene.add(trail);
    return { n: d.number, g, disc: discMat, el, tag, trail, idx: -1 };
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.095, 0.112, 48), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // Battles: a dashed red link from the chasing car to the one ahead, with the interval.
  const battleMat = new THREE.LineDashedMaterial({ dashSize: 0.03, gapSize: 0.03, depthTest: false, transparent: true, toneMapped: false });
  const links = Array.from({ length: o.drivers.length - 1 }, () => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), battleMat);
    line.renderOrder = 5;
    const el = document.createElement("div");
    el.className = "font-mono text-[10px] font-semibold whitespace-nowrap text-live";
    const label = new CSS2DObject(el);
    scene.add(line, label);
    return { line, label, el };
  });

  // ---- theme: the slab, edges and links take their colours from the page's tokens
  const theme = () => {
    const css = getComputedStyle(host);
    const tok = (k: string) => css.getPropertyValue(`--${k}`).trim();
    slabTop.color.set(tok("card"));
    slabSide.color.set(tok("border"));
    outlineMat.color.set(tok("border"));
    edgeMat.color.set(tok("card"));
    (ring.material as THREE.MeshBasicMaterial).color.set(tok("foreground"));
    battleMat.color.set(tok("live"));
    const [top, bottom] = [new THREE.Color(TARMAC).multiplyScalar(0.72).toArray(), new THREE.Color(tok("border")).toArray()];
    for (const g of skirts) {
      const c = g.getAttribute("color") as THREE.BufferAttribute;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, ...((i % 2 ? bottom : top) as [number, number, number]));
      c.needsUpdate = true;
    }
  };
  theme();
  const themed = new MutationObserver(theme);
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });

  // ---- camera: 40° above the slab, a slow orbit until you take over
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, minDistance: 0.6, maxDistance: 30, maxPolarAngle: 1.36, rotateSpeed: 0.6, autoRotateSpeed: 0.5, autoRotate: !o.still });
  const HOME = new THREE.Vector3(0, 0.2, 0.15);
  const HOME_DIR = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
  // Far enough back that the lap fits between the side panels (phones: the whole width).
  const homeDistance = () => {
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const share = host.clientWidth < 768 ? 0.94 : 0.5;
    return Math.max((SPAN * 0.6) / Math.tan((hf * share) / 2), (bz + 0.15) / Math.tan((vf * 0.82) / 2));
  };
  let fly: { fromT: THREE.Vector3; fromP: THREE.Vector3; toT: THREE.Vector3; toP: THREE.Vector3; t0: number } | null = null;
  const flyTo = (target: THREE.Vector3, dist: number, dir = camera.position.clone().sub(controls.target).normalize()) => {
    const toP = target.clone().add(dir.multiplyScalar(dist));
    if (o.still) {
      controls.target.copy(target);
      camera.position.copy(toP);
      fly = null;
    } else fly = { fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target.clone(), toP, t0: performance.now() };
  };
  let touched = false;
  controls.addEventListener("start", () => {
    fly = null;
    touched = true;
    controls.autoRotate = false;
  });
  const fit = () => {
    const [w, h] = [host.clientWidth || 1, host.clientHeight || 1];
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!touched && o.state.view === "overview") flyTo(HOME, homeDistance(), HOME_DIR.clone());
  };
  const resize = new ResizeObserver(fit);
  resize.observe(host);
  fit();
  camera.position.copy(HOME).addScaledVector(HOME_DIR, homeDistance() * 1.3);
  controls.target.copy(HOME);
  flyTo(HOME, homeDistance(), HOME_DIR.clone());

  // A click (not a drag) on a car selects it.
  let down: [number, number] | null = null;
  const ray = new THREE.Raycaster();
  renderer.domElement.addEventListener("pointerdown", (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) o.onSelect(hit.object.userData.n as number);
  });

  // ---- per frame
  const fixAt = (n: number, t: number) => {
    const w = o.getWindow(t);
    const s = w?.cars[n];
    return s ? carAt(s, t - w!.from) : null;
  };
  const v = new THREE.Vector3();
  // Tags: the selected car's always shows, then higher-placed cars win where they overlap; then battle gaps.
  const declutter = () => {
    const placed: [number, number, number][] = [];
    const [w, h] = [host.clientWidth, host.clientHeight];
    const fits = (obj: THREE.Object3D, bw: number, bh: number, force = false) => {
      obj.getWorldPosition(v).project(camera);
      const [x, y] = [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
      const ok = force || !placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + bw) / 2 && Math.abs(py - y) < bh);
      if (ok) placed.push([x, y, bw]);
      return ok;
    };
    const sel = o.state.selected;
    const ranked = [...cars].sort((a, b) => Number(b.n === sel) - Number(a.n === sel) || rank(a.n) - rank(b.n));
    for (const c of ranked) c.el.style.visibility = c.tag.visible && fits(c.tag, c.n === sel ? 64 : 44, 18, c.n === sel) ? "" : "hidden";
    for (const l of links) l.el.style.visibility = l.label.visible && fits(l.label, 30, 16) ? "" : "hidden";
  };
  const rank = (n: number) => {
    const i = o.state.order.indexOf(n);
    return i < 0 ? 99 : i;
  };

  let lastView: View | null = null;
  let lastSelected: number | null = null;
  const loop = (now: number) => {
    const t = o.time();
    const { selected, battles, view } = o.state;
    const at = new Map<number, THREE.Vector3>();
    for (const c of cars) {
      const f = fixAt(c.n, t);
      c.g.visible = c.tag.visible = c.trail.visible = !!f;
      if (!f) continue;
      c.idx = nearestOnLap(flat2, [f.x, f.y], c.idx, NEAR_DM);
      c.g.position.set(wx(f.x), PW[c.idx]!.y, wz(f.y));
      // No sample for over a second: faded, at the last recorded spot.
      c.disc.opacity = f.kind === "stale" ? 0.35 : 1;
      c.el.style.opacity = f.kind === "stale" ? "0.5" : "";
      c.el.toggleAttribute("data-selected", c.n === selected);
      c.el.querySelector("b")!.textContent = c.n === selected && rank(c.n) < 99 ? ` P${rank(c.n) + 1}` : "";
      if (f.kind !== "stale") at.set(c.n, c.g.position);
      // The tail: back along the recorded positions, broken by a jump or a gap in the data.
      let count = 0;
      if (!o.still && f.kind !== "stale") {
        const pos = c.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
        let [px, py, idx] = [f.x, f.y, c.idx];
        for (let k = 0; k <= TRAIL; k++) {
          const fk = k ? fixAt(c.n, t - k * TRAIL_STEP_MS) : f;
          if (!fk || fk.kind === "stale" || Math.hypot(fk.x - px, fk.y - py) > NEAR_DM) break;
          idx = nearestOnLap(flat2, [fk.x, fk.y], idx, NEAR_DM);
          pos.setXYZ(k, wx(fk.x), PW[idx]!.y + 0.008, wz(fk.y));
          [px, py, count] = [fk.x, fk.y, k + 1];
        }
        pos.needsUpdate = true;
      }
      c.trail.geometry.setDrawRange(0, count);
    }
    const followed = cars.find((c) => c.n === selected && c.g.visible);
    ring.visible = !!followed;
    if (followed) ring.position.copy(followed.g.position).setY(followed.g.position.y + 0.006);

    links.forEach((l, i) => {
      const b = battles[i];
      const [a, c] = b ? [at.get(b.ahead), at.get(b.behind)] : [];
      l.line.visible = l.label.visible = !!a && !!c && a.distanceTo(c) <= BATTLE_MAX;
      if (!l.line.visible) return;
      (l.line.geometry.getAttribute("position") as THREE.BufferAttribute).setXYZ(0, c!.x, c!.y + 0.03, c!.z).setXYZ(1, a!.x, a!.y + 0.03, a!.z).needsUpdate = true;
      l.line.computeLineDistances();
      l.el.textContent = `${b!.interval.toFixed(1)}s`;
      l.label.position.set((a!.x + c!.x) / 2, Math.max(a!.y, c!.y) + 0.07, (a!.z + c!.z) / 2);
    });

    // Overview flies home; follow flies to the selected car, then keeps it centred however you orbit.
    if (view !== lastView || (view === "follow" && selected !== lastSelected)) {
      if (view === "overview" && lastView !== null) flyTo(HOME, homeDistance(), HOME_DIR.clone());
      if (view === "follow" && followed) flyTo(followed.g.position, FOLLOW_DIST);
      if (view === "follow") controls.autoRotate = false;
      [lastView, lastSelected] = [view, selected];
    }
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / 1100);
      const e = 1 - (1 - k) ** 3;
      controls.target.lerpVectors(fly.fromT, fly.toT, e);
      camera.position.lerpVectors(fly.fromP, fly.toP, e);
      if (k >= 1) fly = null;
    } else if (view === "follow" && followed) {
      const d = followed.g.position.clone().sub(controls.target).multiplyScalar(o.still ? 1 : 0.08);
      controls.target.add(d);
      camera.position.add(d);
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    declutter();
  };
  renderer.setAnimationLoop(loop);

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      themed.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line)) return;
        obj.geometry.dispose();
        for (const m of [obj.material].flat()) (m as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
