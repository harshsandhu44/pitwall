// The 3D circuit on the home hero and the weekend page: the F1DB outline as a road, the way
// drive.harshsandhu.com builds its tracks (a ribbon either side of the centreline, red and white kerbs
// on the corners, its four lights), on a transparent canvas so it floats on the card. The only module that imports three; the
// component loads it on demand so no other page pays for it. Track (x, y) is three (x, 0, y).
import * as THREE from "three";
import { kerbs, normals, type Pt, type Sky } from "./circuit-geo";

// The drive's lights (scene.ts): the hemisphere's top and ground colours and strength,
// the sun's colour, strength and direction.
type Light = { top: string; low: string; hemi: number; sun: string; sunI: number; at: [number, number, number] };
const LIGHTS: Record<Sky, Light> = {
  day: { top: "#e4ebf0", low: "#3d5244", hemi: 1.4, sun: "#fff1dc", sunI: 2.6, at: [-40, 90, 30] },
  golden: { top: "#f3d3b2", low: "#4a4036", hemi: 1.15, sun: "#ffb26a", sunI: 2.4, at: [-95, 30, 40] },
  sunset: { top: "#b88aa6", low: "#2b2530", hemi: 0.85, sun: "#ff7a45", sunI: 0.9, at: [-110, 10, 40] },
  // At night the "sun" is the floodlights, high and cool.
  night: { top: "#a9b8e6", low: "#1b1e27", hemi: 0.9, sun: "#e8eeff", sunI: 1.9, at: [-15, 120, 10] },
};
// Mid grey, not real tarmac: with no ground under it the road has to read on both the light and dark card.
const TARMAC = "#7a7f8c";
const KERB = ["#e10600", "#f7f7f7"];
// Half the road's width and the kerb's, as shares of the lap's radius: exaggerated, as a real 12 m road is a
// hairline from this far up, and the same on a 3 km street circuit as on Spa.
const HALF_R = 1 / 32;
const KERB_R_W = 1 / 110;
// The camera's angle above the ground.
const TILT = 40;
// One orbit every this many seconds.
const ORBIT_S = 120;

// A flat ribbon between two offset lines over the segments `keep` allows, coloured per segment if asked.
function strip(a: Pt[], b: Pt[], y: number, keep: (i: number) => boolean, color?: (i: number) => THREE.Color) {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!keep(i)) continue;
    const j = (i + 1) % a.length;
    for (const [x, z] of [a[i]!, b[i]!, a[j]!, b[i]!, b[j]!, a[j]!]) {
      pos.push(x, y, z);
      if (color) col.push(...color(i).toArray());
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Double-sided: winding depends on which side of the centreline a strip is.
const flat = (g: THREE.BufferGeometry, p: THREE.MeshStandardMaterialParameters) =>
  new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, ...p }));

/**
 * Renders the circuit into a canvas of its own inside `host`, sized to it, orbiting slowly while `running()`.
 * `still` (reduced motion) draws one frame and redraws only on resize.
 */
export function createCircuitScene(host: HTMLElement, pts: Pt[], sky: Sky, still: boolean) {
  const L = LIGHTS[sky];
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.domElement.className = "block size-full";
  // ponytail: 1.5, not the screen's 2-3: a panel-sized scene doesn't need more, and phones keep their battery.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const n = normals(pts);
  const off = (d: number): Pt[] => pts.map(([x, y], i) => [x + n[i]![0] * d, y + n[i]![1] * d]);
  const radius = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  const HALF = radius * HALF_R;
  const KERB_W = radius * KERB_R_W;
  // Layers sit this far above each other, in proportion too: the depth buffer is coarse from this far back.
  const LIFT = radius / 1500;

  scene.add(new THREE.HemisphereLight(L.top, L.low, L.hemi));
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.set(...L.at);
  scene.add(sun);

  const all = () => true;
  scene.add(flat(strip(off(HALF), off(-HALF), LIFT, all), { color: TARMAC }));
  const kerbed = kerbs(pts);
  const band = (i: number) => new THREE.Color(KERB[Math.floor(i / 2) % 2]!);
  const kerbMat = { vertexColors: true, roughness: 0.7 };
  scene.add(flat(strip(off(HALF), off(HALF + KERB_W), 2 * LIFT, (i) => kerbed[i]!, band), kerbMat));
  scene.add(flat(strip(off(-HALF), off(-HALF - KERB_W), 2 * LIFT, (i) => kerbed[i]!, band), kerbMat));
  // The start/finish line: the first segment, painted white.
  scene.add(flat(strip(off(HALF), off(-HALF), 3 * LIFT, (i) => i === 0), { color: "#ffffff", roughness: 0.6 }));

  // Looking down at TILT, far enough back that the whole lap fits whatever the panel's shape.
  const camera = new THREE.PerspectiveCamera(32, 1, radius / 20, radius * 12);
  const fit = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const across = Math.atan(Math.tan(v) * camera.aspect);
    const t = THREE.MathUtils.degToRad(TILT);
    // The closest the camera can be with the lap's bounding circle (plus the road) in frame at any orbit
    // angle: top to bottom the circle's near edge sets it, across its sides do.
    const r = radius + HALF + KERB_W;
    camera.userData.dist = Math.max(r / (Math.cos(t) - Math.sin(t) / Math.tan(t + v)), r / Math.sin(across));
    camera.updateProjectionMatrix();
  };
  let angle = -Math.PI / 2;
  const frame = () => {
    const dist = camera.userData.dist as number;
    const tilt = THREE.MathUtils.degToRad(TILT);
    camera.position.set(Math.cos(angle) * dist * Math.cos(tilt), dist * Math.sin(tilt), Math.sin(angle) * dist * Math.cos(tilt));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  let running = false;
  let last = 0;
  const loop = (now: number) => {
    angle += ((now - (last || now)) / 1000) * ((2 * Math.PI) / ORBIT_S);
    last = now;
    frame();
  };
  const resize = new ResizeObserver(() => {
    fit();
    frame();
  });
  resize.observe(host);
  fit();
  frame();

  return {
    /** Orbit only while on screen (an IntersectionObserver calls this); still scenes never orbit. */
    setRunning(on: boolean) {
      if (still || on === running) return;
      running = on;
      last = 0;
      renderer.setAnimationLoop(on ? loop : null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      resize.disconnect();
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
