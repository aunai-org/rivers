import * as THREE from "three";
import type { RiversAsset } from "./data";
import type { Flow } from "./discharge";
import { flowSpeed, flowWidth, ribbon } from "./flowmath";
import { SCENE, hex, type Mode } from "./theme";

/** Rivers draw out from their sources at this many km per second when the layer is turned on. */
const REVEAL_KM_S = 2600;
/** Pulses repeat this often along a river, km. */
const SPACING_KM = 420;
/** Ribbons sit this far above the surface so they never flicker into it. */
const LIFT = 1.003;

const VERTEX = /* glsl */ `
  attribute vec3 p0;
  attribute vec3 p1;
  attribute vec3 o0;
  attribute vec3 o1;
  attribute float side;
  attribute float dist;
  attribute float width;
  attribute float speed;
  attribute float lit;
  uniform float uT;
  uniform float uRadius;
  uniform float uZoom;
  varying float vDist;
  varying float vSide;
  varying float vSpeed;
  varying float vLit;
  void main() {
    vLit = lit;
    vec3 at = normalize(mix(p0, p1, uT)) * uRadius;
    vec3 off = normalize(mix(o0, o1, uT));
    vec3 pos = at + off * side * width * uZoom;
    vDist = dist;
    vSide = side;
    vSpeed = speed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uT;
  uniform float uReveal;
  uniform float uPulse;
  uniform float uSpacing;
  uniform vec3 uBase;
  uniform vec3 uHead;
  uniform float uLight;
  varying float vDist;
  varying float vSide;
  varying float vSpeed;
  varying float vLit;
  void main() {
    if (vLit < 0.5 || vDist > uReveal) discard;
    // A soft edge across the ribbon.
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
    // Comet-shaped pulses: a faint tail upstream, a bright head downstream, all moving toward the mouth.
    float f = fract((vDist - uTime * vSpeed) / uSpacing);
    float pulse = pow(smoothstep(0.0, 0.32, f), 2.0) * (1.0 - smoothstep(0.32, 0.36, f)) * uPulse;
    // The leading edge of the reveal glows as it draws out.
    float front = 1.0 - smoothstep(0.0, 260.0, uReveal - vDist);
    float glow = 0.5 + pulse * 1.1 + front * 0.8;
    // Over the blue inflated map the rivers move toward the head colour (lighter at night, deeper by day).
    vec3 base = mix(uBase, uHead, clamp(uT, 0.0, 1.0) * 0.6);
    vec3 colour = mix(base, uHead, clamp(pulse + front, 0.0, 1.0));
    // Night adds light to a dark globe; day paints ink on a pale one, so it blends by alpha instead.
    vec4 night = vec4(colour * glow * edge, 1.0);
    vec4 day = vec4(colour, edge * clamp(0.6 + pulse * 0.4 + front * 0.4, 0.0, 1.0));
    gl_FragColor = mix(night, day, uLight);
  }
`;

type Hit = { name: string; km: number; countries: string[]; flow?: Flow };

/** The world's rivers as glowing ribbons, flowing source → mouth, sized and paced by today's discharge. */
export class RiverFlow {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private rivers: RiversAsset["rivers"] = [];
  private riverOf: ArrayLike<number> = [];
  private flows = new Map<string, Flow>();
  /** Sample points for hover: [river index, x, y, z] in real and inflated positions. */
  private probes: { river: number; a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private shown = false;
  /** The rivers drawn: null for all, or a set of indices (a selected river, or a selected country's rivers). */
  private only: Set<number> | null = null;
  private revealStart = 0;
  private longest = 0;
  private scratch = new THREE.Vector3();

  constructor(private radius: number, private still: boolean) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uT: { value: 0 },
        uRadius: { value: radius * LIFT },
        uZoom: { value: 1 },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uPulse: { value: still ? 0 : 1 },
        uSpacing: { value: SPACING_KM },
        uBase: { value: new THREE.Color(hex(SCENE.dark.river)) },
        uHead: { value: new THREE.Color(hex(SCENE.dark.head)) },
        uLight: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0.5;
  }

  get visible() {
    return this.shown;
  }

  setMode(mode: Mode) {
    const m = this.mesh.material;
    m.uniforms.uBase.value.set(hex(SCENE[mode].river));
    m.uniforms.uHead.value.set(hex(SCENE[mode].head));
    m.uniforms.uLight.value = mode === "light" ? 1 : 0;
    m.blending = mode === "light" ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.needsUpdate = true;
  }

  setData(asset: RiversAsset) {
    this.rivers = asset.rivers;
    const r = ribbon(asset.rivers, 1);
    const g = this.mesh.geometry;
    g.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(r.p0, 3));
    geometry.setAttribute("p0", new THREE.BufferAttribute(r.p0, 3));
    geometry.setAttribute("p1", new THREE.BufferAttribute(r.p1, 3));
    geometry.setAttribute("o0", new THREE.BufferAttribute(r.o0, 3));
    geometry.setAttribute("o1", new THREE.BufferAttribute(r.o1, 3));
    geometry.setAttribute("side", new THREE.BufferAttribute(r.side, 1));
    geometry.setAttribute("dist", new THREE.BufferAttribute(r.dist, 1));
    geometry.setAttribute("width", new THREE.BufferAttribute(new Float32Array(r.side.length), 1));
    geometry.setAttribute("speed", new THREE.BufferAttribute(new Float32Array(r.side.length), 1));
    geometry.setAttribute("lit", new THREE.BufferAttribute(new Float32Array(r.side.length).fill(1), 1));
    geometry.setIndex(new THREE.BufferAttribute(r.index, 1));
    this.mesh.geometry = geometry;
    this.riverOf = r.river;
    this.longest = asset.rivers.reduce((m, river) => Math.max(m, ...river.lines.map((l) => l.dist[l.dist.length - 1] ?? 0)), 0);
    this.probes = [];
    asset.rivers.forEach((river, i) => {
      for (const l of river.lines) {
        for (let p = 0; p < l.dist.length; p++) {
          this.probes.push({ river: i, a: vec(l.real, p, this.radius), b: vec(l.inflated, p, this.radius) });
        }
      }
    });
    this.paintFlows();
    this.paintShown();
  }

  /** Today's discharge by river name; rivers without a usable value keep their rank-based look. */
  setFlows(flows: Map<string, Flow>) {
    // Under 1 m³/s is a sample point beside the model's channel (or a delta side-arm), not a real reading.
    this.flows = new Map([...flows].filter(([, flow]) => flow.q >= 1));
    this.paintFlows();
  }

  flowOf(name: string): Flow | undefined {
    return this.flows.get(name);
  }

  /** Every usable discharge value, by river name. */
  get allFlows(): ReadonlyMap<string, Flow> {
    return this.flows;
  }

  /**
   * Draw only these rivers (null: all). A new filter replays the reveal, so the chosen rivers draw out from their
   * sources again; the same filter again changes nothing.
   */
  setShown(only: Set<number> | null) {
    const same = only === this.only || (!!only && !!this.only && only.size === this.only.size && [...only].every((i) => this.only!.has(i)));
    if (same) return;
    this.only = only;
    this.paintShown();
    this.revealStart = performance.now();
  }

  setVisible(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.mesh.visible = on;
    this.revealStart = performance.now();
  }

  /** Every frame: the clock, the land morph, and the camera distance (ribbons keep roughly the same width on screen). */
  update(now: number, t: number, cameraDistance: number) {
    if (!this.shown) return;
    const u = this.mesh.material.uniforms;
    u.uT.value = t;
    u.uTime.value = this.still ? 0 : now / 1000;
    u.uZoom.value = Math.max(0.35, (cameraDistance - this.radius) / 5.1);
    u.uReveal.value = this.still ? this.longest + 1 : ((now - this.revealStart) / 1000) * REVEAL_KM_S;
  }

  /** The river under a screen point, if any, within `px` pixels. */
  hit(x: number, y: number, camera: THREE.Camera, width: number, height: number, t: number, px = 7): Hit | null {
    if (!this.shown || !this.probes.length) return null;
    const cam = camera.position;
    const horizon = this.radius * this.radius;
    let best = px * px;
    let found = -1;
    for (const probe of this.probes) {
      if (this.only && !this.only.has(probe.river)) continue;
      const p = this.scratch.copy(probe.a).lerp(probe.b, t).setLength(this.radius);
      if (p.dot(cam) - horizon <= 0) continue;
      p.project(camera);
      const dx = ((p.x + 1) / 2) * width - x;
      const dy = ((1 - p.y) / 2) * height - y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        found = probe.river;
      }
    }
    if (found < 0) return null;
    const river = this.rivers[found];
    return { name: river.name, km: river.km, countries: river.countries, flow: this.flows.get(river.name) };
  }

  private paintShown() {
    const lit = this.mesh.geometry.getAttribute("lit") as THREE.BufferAttribute | undefined;
    if (!lit) return;
    for (let v = 0; v < this.riverOf.length; v++) lit.setX(v, !this.only || this.only.has(this.riverOf[v]) ? 1 : 0);
    lit.needsUpdate = true;
  }

  private paintFlows() {
    const g = this.mesh.geometry;
    const width = g.getAttribute("width") as THREE.BufferAttribute | undefined;
    const speed = g.getAttribute("speed") as THREE.BufferAttribute | undefined;
    if (!width || !speed) return;
    const per = this.rivers.map((r) => {
      const q = this.flows.get(r.name)?.q ?? null;
      return [flowWidth(q, r.rank), flowSpeed(q)];
    });
    for (let v = 0; v < this.riverOf.length; v++) {
      const [w, s] = per[this.riverOf[v]];
      width.setX(v, w);
      speed.setX(v, s);
    }
    width.needsUpdate = true;
    speed.needsUpdate = true;
  }
}

function vec(flat: number[], i: number, r: number): THREE.Vector3 {
  const a = (flat[2 * i + 1] * Math.PI) / 180;
  const b = (flat[2 * i] * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
}
