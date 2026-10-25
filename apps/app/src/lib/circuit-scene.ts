// The 3D circuit on the home hero and the weekend page: the F1DB outline as a road, the way
// drive.harshsandhu.com builds its tracks (a ribbon either side of the centreline, red and white kerbs
// on the corners, mown grass, fog and its four lights). The only module that imports three; the
// component loads it on demand so no other page pays for it. Track (x, y) is three (x, 0, y).
import * as THREE from "three";
import { kerbs, normals, type Pt, type Sky } from "./circuit-geo";

// The drive's lights (scene.ts): sky and fog, the hemisphere's top and ground colours and strength,
// the sun's colour, strength and direction.
type Light = { sky: string; top: string; low: string; hemi: number; sun: string; sunI: number; at: [number, number, number] };
const LIGHTS: Record<Sky, Light> = {
  day: { sky: "#c9d2d6", top: "#e4ebf0", low: "#3d5244", hemi: 1.4, sun: "#fff1dc", sunI: 2.6, at: [-40, 90, 30] },
  golden: { sky: "#e7b48a", top: "#f3d3b2", low: "#4a4036", hemi: 1.15, sun: "#ffb26a", sunI: 2.4, at: [-95, 30, 40] },
  sunset: { sky: "#6f4a6e", top: "#b88aa6", low: "#2b2530", hemi: 0.85, sun: "#ff7a45", sunI: 0.9, at: [-110, 10, 40] },
  // At night the "sun" is the floodlights, high and cool.
  night: { sky: "#0a0e1c", top: "#a9b8e6", low: "#1b1e27", hemi: 0.9, sun: "#e8eeff", sunI: 1.9, at: [-15, 120, 10] },
};
const GRASS = ["#56705c", "#5d7863"];
const TARMAC = "#3e3e47";
const KERB = ["#e10600", "#f7f7f7"];
// Half the road's width and the kerb's, as shares of the lap's radius: exaggerated, as a real 12 m road is a
// hairline from this far up, and the same on a 3 km street circuit as on Spa.
const HALF_R = 1 / 45;
const KERB_R_W = 1 / 150;
// The camera's angle above the ground: low enough that the far side hazes into the fog.
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

// Mowing stripes, as a two-pixel texture repeated across the ground.
function grass(size: number) {
  const c = document.createElement("canvas");
  [c.width, c.height] = [2, 1];
  const ctx = c.getContext("2d")!;
  GRASS.forEach((g, i) => {
    ctx.fillStyle = g;
    ctx.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(size / 40, 1); // 20 m stripes
  return tex;
}

/**
 * Renders the circuit into a canvas of its own inside `host`, sized to it, orbiting slowly while `running()`.
 * `still` (reduced motion) draws one frame and redraws only on resize.
 */
export function createCircuitScene(host: HTMLElement, pts: Pt[], sky: Sky, still: boolean) {
  const L = LIGHTS[sky];
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.className = "block size-full";
  // ponytail: 1.5, not the screen's 2-3: a panel-sized scene doesn't need more, and phones keep their battery.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(L.sky);
  const n = normals(pts);
  const off = (d: number): Pt[] => pts.map(([x, y], i) => [x + n[i]![0] * d, y + n[i]![1] * d]);
  const radius = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  const HALF = radius * HALF_R;
  const KERB_W = radius * KERB_R_W;
  // Layers sit this far above each other, in proportion too: the depth buffer is coarse from this far back.
  const LIFT = radius / 1500;
  const fog = new THREE.Fog(L.sky, 1, 2);
  scene.fog = fog;

  scene.add(new THREE.HemisphereLight(L.top, L.low, L.hemi));
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.set(...L.at);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 10, radius * 10),
    new THREE.MeshStandardMaterial({ map: grass(radius * 10), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

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
    const fov = THREE.MathUtils.degToRad(camera.fov) / 2;
    // The lap seen at TILT is foreshortened top to bottom, so it fits closer than its radius suggests.
    const dist = (radius * 0.9) / Math.tan(Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect)));
    camera.userData.dist = dist;
    camera.updateProjectionMatrix();
    // Fog is measured from the camera: clear over the near side of the lap, hazing into the sky beyond it.
    fog.near = dist * 0.95;
    fog.far = dist * 2.4;
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
        const m = o.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
