/** Small math / helper grab-bag. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInQuad = (t) => t * t;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Deterministic 32-bit hash → seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. */
export function makeRng(seed) {
  let a = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  return rng;
}

/** Cheap 2D value noise, good enough for texture mottling. */
export function valueNoise2D(seed = 1) {
  const rand = makeRng(seed);
  const size = 64;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, y) => grid[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  return function (x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smoothstep(x - xi);
    const ty = smoothstep(y - yi);
    const a = lerp(at(xi, yi), at(xi + 1, yi), tx);
    const b = lerp(at(xi, yi + 1), at(xi + 1, yi + 1), tx);
    return lerp(a, b, ty);
  };
}

export function fbm2D(seed = 1, octaves = 4) {
  const n = valueNoise2D(seed);
  return function (x, y) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
}

/** #rrggbb from 0xrrggbb */
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** Mix two 0xrrggbb ints. */
export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
}

/** Shift lightness of a 0xrrggbb int by amount (-1..1). */
export function shade(c, amt) {
  return amt >= 0 ? mixHex(c, 0xffffff, amt) : mixHex(c, 0x000000, -amt);
}

export function rgbaStr(c, a) {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** Simple time-based tween manager. */
export class Tweens {
  constructor() {
    this.items = [];
  }
  add(duration, onUpdate, opts = {}) {
    const t = {
      t: 0,
      duration,
      onUpdate,
      onComplete: opts.onComplete,
      ease: opts.ease || easeInOutCubic,
      delay: opts.delay || 0,
      dead: false,
    };
    this.items.push(t);
    return t;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.t += dt;
      const raw = clamp(it.t / it.duration, 0, 1);
      it.onUpdate(it.ease(raw), raw);
      if (raw >= 1) {
        it.onComplete && it.onComplete();
        this.items.splice(i, 1);
      }
    }
  }
  clear() {
    this.items.length = 0;
  }
}

/** Wrap a value into [min,max). */
export function wrap(v, min, max) {
  const span = max - min;
  return ((((v - min) % span) + span) % span) + min;
}

export function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
