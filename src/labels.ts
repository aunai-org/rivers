import * as THREE from "three";
import { RADIUS, toVector } from "./globe";

export type Label = {
  id: string;
  text: string;
  /** A second, smaller line (the longest river while the land is inflated). */
  sub?: string;
  lat: number;
  lng: number;
  /** Where the label sits when the land is inflated; it slides there with the morph. */
  alt?: { lat: number; lng: number };
  /** Bigger wins when two labels would overlap. */
  weight: number;
};

type Placed = Label & { el: HTMLButtonElement; a: THREE.Vector3; b: THREE.Vector3 | null; w: number; h: number };

/** Labels fade out this close to the horizon (dot of the surface normal with the view direction). */
const EDGE = 0.18;
/** Room kept around each label when culling overlaps, px. */
const GAP = 4;

/**
 * Small country names drawn over the globe as HTML, so they stay crisp at every zoom. Every frame each label is
 * projected to the screen; labels on the far side, or overlapping a heavier one, are hidden.
 */
export class CountryLabels {
  private layer = document.createElement("div");
  private placed: Placed[] = [];
  private selected: string | null = null;
  private scratch = new THREE.Vector3();

  constructor(parent: HTMLElement, private onPick: (id: string) => void) {
    this.layer.className = "labels";
    parent.append(this.layer);
  }

  set(labels: Label[]) {
    const keep = new Map(this.placed.map((p) => [p.id, p]));
    this.placed = labels.map((label) => {
      const el = keep.get(label.id)?.el ?? this.button(label.id);
      const name = el.firstChild as HTMLElement;
      const sub = el.lastChild as HTMLElement;
      if (name.textContent !== label.text) name.textContent = label.text;
      if (sub.textContent !== (label.sub ?? "")) sub.textContent = label.sub ?? "";
      return {
        ...label,
        el,
        a: toVector(label.lat, label.lng, RADIUS),
        b: label.alt ? toVector(label.alt.lat, label.alt.lng, RADIUS) : null,
        w: 0,
        h: 0,
      };
    });
    this.layer.replaceChildren(...this.placed.map((p) => p.el));
    for (const p of this.placed) {
      p.el.hidden = false;
      p.w = p.el.offsetWidth;
      p.h = p.el.offsetHeight;
    }
    this.paintSelected();
  }

  /** The selected country stands out and always shows; the rest step back. */
  select(id: string | null) {
    this.selected = id;
    this.paintSelected();
  }

  update(camera: THREE.Camera, width: number, height: number, t: number) {
    const cam = camera.position;
    const toCam = new THREE.Vector3();
    const boxes: [number, number, number, number][] = [];
    const order = [...this.placed].sort((x, y) => (x.id === this.selected ? -1 : y.id === this.selected ? 1 : y.weight - x.weight));
    for (const p of order) {
      const at = this.scratch.copy(p.a);
      if (p.b) at.lerp(p.b, t);
      at.setLength(RADIUS);
      const facing = toCam.copy(cam).sub(at).normalize().dot(at.clone().normalize());
      if (facing <= 0.02) {
        p.el.hidden = true;
        continue;
      }
      at.project(camera);
      const x = ((at.x + 1) / 2) * width;
      const y = ((1 - at.y) / 2) * height;
      const box: [number, number, number, number] = [x - p.w / 2 - GAP, y - p.h / 2 - GAP, x + p.w / 2 + GAP, y + p.h / 2 + GAP];
      const clash = p.id !== this.selected && boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
      p.el.hidden = clash;
      if (clash) continue;
      boxes.push(box);
      p.el.style.transform = `translate(${(x - p.w / 2).toFixed(1)}px, ${(y - p.h / 2).toFixed(1)}px)`;
      p.el.style.opacity = String(Math.min(1, facing / EDGE));
    }
  }

  private button(id: string): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "label";
    el.append(document.createElement("span"), document.createElement("small"));
    el.addEventListener("click", () => this.onPick(id));
    return el;
  }

  private paintSelected() {
    for (const p of this.placed) {
      p.el.classList.toggle("on", p.id === this.selected);
      p.el.classList.toggle("off", !!this.selected && p.id !== this.selected);
    }
  }
}
