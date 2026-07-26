import * as THREE from 'three';
import { makeRng, fbm2D, hex, rgbaStr, mixHex, shade, clamp, lerp, TAU } from './util.js';

/**
 * Procedural canvas textures. Nothing is loaded from disk — every brick,
 * cobblestone, blind slat and grimy streak below is drawn at runtime.
 */

const texCache = new Map();
const MAX_ANISO = { value: 4 };

export function setTextureQuality(aniso) {
  MAX_ANISO.value = aniso;
}

function finish(canvas, { repeat = [1, 1], srgb = true, wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = MAX_ANISO.value;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function key(name, opts) {
  return name + ':' + JSON.stringify(opts);
}

function memo(name, opts, make) {
  const k = key(name, opts);
  let t = texCache.get(k);
  if (!t) {
    t = make();
    texCache.set(k, t);
  }
  return t;
}

export function clearTextureCache() {
  for (const t of texCache.values()) t.dispose && t.dispose();
  texCache.clear();
}

// ---------------------------------------------------------------------------
// generic grain helpers
// ---------------------------------------------------------------------------
function grain(ctx, w, h, amount, seed = 1, size = 1) {
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < w * h * 0.06; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const v = (rng() - 0.5) * amount * 255;
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function mottle(ctx, w, h, color, amount, seed = 1, scale = 8) {
  const n = fbm2D(seed, 4);
  ctx.save();
  const step = 4;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = n((x / w) * scale, (y / h) * scale);
      ctx.fillStyle = rgbaStr(color, clamp((v - 0.45) * amount, 0, 1));
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.restore();
}

function streaks(ctx, w, h, color, amount, seed = 3) {
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < 40 * amount; i++) {
    const x = rng() * w;
    const wd = rng() * 6 + 1;
    const len = rng() * h * 0.8 + h * 0.1;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, rgbaStr(color, 0.22 * amount));
    g.addColorStop(1, rgbaStr(color, 0));
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, 0);
    ctx.fillRect(0, 0, wd, len);
    ctx.restore();
  }
  ctx.restore();
}

function edgeDirt(ctx, w, h, color, amount) {
  const g = ctx.createLinearGradient(0, h, 0, h * 0.55);
  g.addColorStop(0, rgbaStr(color, 0.5 * amount));
  g.addColorStop(1, rgbaStr(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// masonry
// ---------------------------------------------------------------------------
/** Brick wall. Tile size is 2m × 2m of wall. */
export function brickTex(opts = {}) {
  const o = {
    color: 0x8e4c3a,
    mortar: 0xbdb3a2,
    grime: 0.35,
    seed: 7,
    living: 0,
    ...opts,
  };
  return memo('brick', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.mortar);
    ctx.fillRect(0, 0, W, H);
    const rng = makeRng(o.seed);
    const courses = 16; // 16 courses per 2m ≈ 125mm each
    const bh = H / courses;
    const bricksPerRow = 8;
    const bw = W / bricksPerRow;
    for (let row = 0; row < courses; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let i = -1; i <= bricksPerRow; i++) {
        const x = i * bw + off;
        const y = row * bh;
        const v = rng();
        let col = mixHex(o.color, v > 0.86 ? 0x2f2f33 : 0xffffff, (v - 0.5) * 0.28);
        if (v > 0.965) col = mixHex(o.color, 0x6b3a2a, 0.6);
        ctx.fillStyle = hex(col);
        const gap = 1.6;
        ctx.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
        // subtle per-brick shading
        ctx.fillStyle = rgbaStr(0x000000, 0.06 + rng() * 0.06);
        ctx.fillRect(x + gap / 2, y + bh - gap - 1.5, bw - gap, 1.5);
        ctx.fillStyle = rgbaStr(0xffffff, 0.05 + rng() * 0.05);
        ctx.fillRect(x + gap / 2, y + gap / 2, bw - gap, 1.2);
      }
    }
    mottle(ctx, W, H, 0x201a14, 0.5 * o.grime + 0.1, o.seed + 1, 5);
    streaks(ctx, W, H, 0x1c1712, o.grime, o.seed + 2);
    grain(ctx, W, H, 0.1, o.seed + 3);
    if (o.living > 0) drawVines(ctx, W, H, o.living, o.seed + 9);
    return finish(c);
  });
}

function drawVines(ctx, W, H, amount, seed) {
  const rng = makeRng(seed);
  const n = Math.floor(6 + amount * 16);
  for (let i = 0; i < n; i++) {
    let x = rng() * W;
    let y = H;
    const len = rng() * H * (0.4 + amount * 0.6);
    ctx.strokeStyle = rgbaStr(0x2f5d34, 0.85);
    ctx.lineWidth = 1.2 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let steps = Math.floor(len / 8);
    for (let s = 0; s < steps; s++) {
      x += (rng() - 0.5) * 12;
      y -= 8;
      ctx.lineTo(x, y);
      if (rng() < 0.5) {
        const lr = 2 + rng() * 4;
        ctx.save();
        ctx.fillStyle = rgbaStr(mixHex(0x3f7a3a, 0x8fc46a, rng()), 0.9);
        ctx.beginPath();
        ctx.ellipse(x + (rng() - 0.5) * 8, y, lr, lr * 0.7, rng() * TAU, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.stroke();
  }
}

/** Cut-stone / limestone ashlar. */
export function stoneTex(opts = {}) {
  const o = { color: 0xbdb2a0, grime: 0.3, seed: 11, courses: 6, living: 0, ...opts };
  return memo('stone', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);
    ctx.fillStyle = hex(shade(o.color, -0.25));
    ctx.fillRect(0, 0, W, H);
    const bh = H / o.courses;
    const perRow = 3;
    for (let row = 0; row < o.courses; row++) {
      const off = row % 2 ? W / (perRow * 2) : 0;
      for (let i = -1; i <= perRow; i++) {
        const x = i * (W / perRow) + off;
        const y = row * bh;
        const v = rng();
        ctx.fillStyle = hex(mixHex(o.color, v > 0.5 ? 0xffffff : 0x8a8272, Math.abs(v - 0.5) * 0.36));
        ctx.fillRect(x + 2, y + 2, W / perRow - 4, bh - 4);
        // chisel highlight
        ctx.fillStyle = rgbaStr(0xffffff, 0.08);
        ctx.fillRect(x + 2, y + 2, W / perRow - 4, 2);
        ctx.fillStyle = rgbaStr(0x000000, 0.12);
        ctx.fillRect(x + 2, y + bh - 5, W / perRow - 4, 3);
      }
    }
    mottle(ctx, W, H, 0x3b342a, 0.55 * o.grime + 0.08, o.seed + 5, 4);
    streaks(ctx, W, H, 0x241f18, o.grime * 1.2, o.seed + 6);
    grain(ctx, W, H, 0.08, o.seed + 7);
    if (o.living > 0) drawVines(ctx, W, H, o.living, o.seed + 9);
    return finish(c);
  });
}

/** Poured / precast concrete. */
export function concreteTex(opts = {}) {
  const o = { color: 0xa9a49b, grime: 0.3, seed: 21, boards: false, ...opts };
  return memo('concrete', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    mottle(ctx, W, H, 0x5e5a52, 0.5, o.seed, 6);
    mottle(ctx, W, H, 0xffffff, 0.3, o.seed + 1, 10);
    if (o.boards) {
      for (let y = 0; y < H; y += H / 8) {
        ctx.fillStyle = rgbaStr(0x000000, 0.1);
        ctx.fillRect(0, y, W, 2);
      }
    }
    // form tie holes
    const rng = makeRng(o.seed + 2);
    for (let i = 0; i < 14; i++) {
      const x = rng() * W,
        y = rng() * H;
      ctx.fillStyle = rgbaStr(0x3c3832, 0.4);
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
    }
    streaks(ctx, W, H, 0x2a2721, o.grime, o.seed + 3);
    grain(ctx, W, H, 0.09, o.seed + 4);
    return finish(c);
  });
}

/** Painted stucco / plaster. */
export function plasterTex(opts = {}) {
  const o = { color: 0xd8cfa8, grime: 0.25, seed: 31, cracks: 0.3, ...opts };
  return memo('plaster', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    mottle(ctx, W, H, shade(o.color, -0.4), 0.45, o.seed, 7);
    mottle(ctx, W, H, 0xffffff, 0.25, o.seed + 1, 12);
    const rng = makeRng(o.seed + 2);
    for (let i = 0; i < 22 * o.cracks; i++) {
      ctx.strokeStyle = rgbaStr(0x4a423a, 0.35);
      ctx.lineWidth = rng() * 1.2 + 0.4;
      ctx.beginPath();
      let x = rng() * W,
        y = rng() * H;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (rng() - 0.5) * 40;
        y += rng() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    streaks(ctx, W, H, 0x342d26, o.grime, o.seed + 3);
    grain(ctx, W, H, 0.07, o.seed + 4);
    return finish(c);
  });
}

/** Mid-century porcelain-enamel / metal slipcover panels. */
export function panelTex(opts = {}) {
  const o = { color: 0x7fd0c4, grime: 0.15, seed: 41, pattern: 'grid', damage: 0, ...opts };
  return memo('panel', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    const cells = 4;
    const s = W / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const g = ctx.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
        g.addColorStop(0, rgbaStr(0xffffff, 0.16));
        g.addColorStop(0.5, rgbaStr(0xffffff, 0.02));
        g.addColorStop(1, rgbaStr(0x000000, 0.1));
        ctx.fillStyle = g;
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        ctx.strokeStyle = rgbaStr(0x2c2c2c, 0.35);
        ctx.lineWidth = 2;
        ctx.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
      }
    }
    if (o.pattern === 'ribbed') {
      for (let x = 0; x < W; x += 8) {
        ctx.fillStyle = rgbaStr(0x000000, 0.07);
        ctx.fillRect(x, 0, 3, H);
      }
    }
    if (o.damage > 0) {
      const rng = makeRng(o.seed + 3);
      for (let i = 0; i < 30 * o.damage; i++) {
        const x = rng() * W,
          y = rng() * H;
        ctx.fillStyle = rgbaStr(0x6b4a32, 0.5 + rng() * 0.4);
        ctx.beginPath();
        ctx.ellipse(x, y, rng() * 18 + 3, rng() * 12 + 3, rng() * TAU, 0, TAU);
        ctx.fill();
      }
      streaks(ctx, W, H, 0x5a3a22, o.damage * 1.4, o.seed + 4);
    }
    mottle(ctx, W, H, 0x3a3a3a, 0.4 * o.grime, o.seed, 6);
    grain(ctx, W, H, 0.05, o.seed + 1);
    return finish(c);
  });
}

/** 1960s tower spandrel band (glass strip + opaque panel). */
export function spandrelTex(opts = {}) {
  const o = { color: 0xd7d4cc, mullion: 0xdadfe2, grime: 0.15, seed: 51, ...opts };
  return memo('spandrel', o, () => {
    const W = 256,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += H / 4) {
      ctx.fillStyle = rgbaStr(0x000000, 0.08);
      ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = hex(o.mullion);
      ctx.fillRect(0, y + 3, W, 5);
    }
    for (let x = 0; x < W; x += W / 6) {
      ctx.fillStyle = hex(shade(o.mullion, -0.1));
      ctx.fillRect(x, 0, 5, H);
    }
    mottle(ctx, W, H, 0x4a4438, 0.5 * o.grime, o.seed, 5);
    streaks(ctx, W, H, 0x3c352a, o.grime * 1.6, o.seed + 1);
    grain(ctx, W, H, 0.05, o.seed + 2);
    return finish(c);
  });
}

/** Modern glass curtain wall with reflected sky gradient. */
export function curtainTex(opts = {}) {
  const o = { color: 0x8fa6b0, mullion: 0xb6c0c6, tint: 0x2d5f6b, lit: 0.4, seed: 61, ...opts };
  return memo('curtain', o, () => {
    const W = 256,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const cells = 4;
    const s = W / cells;
    const rng = makeRng(o.seed);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const g = ctx.createLinearGradient(x * s, y * s, x * s, y * s + s);
        const bright = rng();
        g.addColorStop(0, hex(mixHex(o.tint, o.color, 0.55 + bright * 0.3)));
        g.addColorStop(0.55, hex(mixHex(o.tint, 0x000000, 0.15)));
        g.addColorStop(1, hex(mixHex(o.tint, o.color, 0.2)));
        ctx.fillStyle = g;
        ctx.fillRect(x * s, y * s, s, s);
        if (rng() < o.lit) {
          ctx.fillStyle = rgbaStr(0xffe9c0, 0.16 + rng() * 0.2);
          ctx.fillRect(x * s + 4, y * s + 4, s - 8, s - 8);
        }
        // horizontal blinds hint
        if (rng() < 0.4) {
          const bl = Math.floor(rng() * (s * 0.6));
          ctx.fillStyle = rgbaStr(0xe8e4d8, 0.3);
          ctx.fillRect(x * s + 3, y * s + 3, s - 6, bl);
        }
        ctx.strokeStyle = hex(o.mullion);
        ctx.lineWidth = 5;
        ctx.strokeRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    }
    grain(ctx, W, H, 0.04, o.seed + 1);
    return finish(c);
  });
}

/** Cross-laminated timber / wood slat cladding. */
export function timberTex(opts = {}) {
  const o = { color: 0xb99263, grime: 0.1, seed: 71, slat: 10, living: 0, ...opts };
  return memo('timber', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    const rng = makeRng(o.seed);
    const sh = H / o.slat;
    for (let i = 0; i < o.slat; i++) {
      const y = i * sh;
      const tone = mixHex(o.color, rng() > 0.5 ? 0xffffff : 0x6a4b2c, rng() * 0.22);
      ctx.fillStyle = hex(tone);
      ctx.fillRect(0, y + 1, W, sh - 2);
      // grain lines
      for (let g2 = 0; g2 < 14; g2++) {
        ctx.strokeStyle = rgbaStr(0x5a3f26, 0.1 + rng() * 0.14);
        ctx.lineWidth = 0.8 + rng();
        ctx.beginPath();
        const yy = y + rng() * sh;
        ctx.moveTo(0, yy);
        for (let x = 0; x <= W; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + i) * 1.6);
        ctx.stroke();
      }
      ctx.fillStyle = rgbaStr(0x000000, 0.24);
      ctx.fillRect(0, y + sh - 2, W, 2);
    }
    mottle(ctx, W, H, 0x3a2a18, 0.4 * o.grime, o.seed + 1, 6);
    grain(ctx, W, H, 0.06, o.seed + 2);
    if (o.living > 0) drawVines(ctx, W, H, o.living, o.seed + 9);
    return finish(c);
  });
}

/** Corrugated metal / rolling shutter. */
export function corrugatedTex(opts = {}) {
  const o = { color: 0x8d8f92, grime: 0.4, seed: 81, graffiti: 0, ...opts };
  return memo('corrugated', o, () => {
    const W = 256,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.color);
    ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 12) {
      const g = ctx.createLinearGradient(x, 0, x + 12, 0);
      g.addColorStop(0, rgbaStr(0x000000, 0.22));
      g.addColorStop(0.5, rgbaStr(0xffffff, 0.18));
      g.addColorStop(1, rgbaStr(0x000000, 0.22));
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 12, H);
    }
    streaks(ctx, W, H, 0x4a3a2a, o.grime, o.seed);
    if (o.graffiti > 0) drawTags(ctx, W, H, o.graffiti, o.seed + 3);
    grain(ctx, W, H, 0.06, o.seed + 1);
    return finish(c);
  });
}

// ---------------------------------------------------------------------------
// ground surfaces
// ---------------------------------------------------------------------------
export function roadTex(variant = 'asphalt', opts = {}) {
  const o = { seed: 91, wet: 0, ...opts };
  return memo('road' + variant, o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);

    if (variant === 'cobble') {
      ctx.fillStyle = '#3a3630';
      ctx.fillRect(0, 0, W, H);
      const cs = 26;
      for (let y = 0; y < H + cs; y += cs) {
        const off = (y / cs) % 2 ? cs / 2 : 0;
        for (let x = -cs; x < W + cs; x += cs) {
          const v = rng();
          ctx.fillStyle = hex(mixHex(0x6d675d, v > 0.5 ? 0x9a9184 : 0x413c34, Math.abs(v - 0.5) * 1.4));
          ctx.beginPath();
          const cx = x + off + (rng() - 0.5) * 3;
          const cy = y + (rng() - 0.5) * 3;
          ctx.ellipse(cx, cy, cs * 0.46, cs * 0.42, rng() * 0.4, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = rgbaStr(0x241f19, 0.5);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      mottle(ctx, W, H, 0x120f0c, 0.5, o.seed + 1, 4);
    } else if (variant === 'composite') {
      ctx.fillStyle = '#26282f';
      ctx.fillRect(0, 0, W, H);
      mottle(ctx, W, H, 0x3d4250, 0.5, o.seed, 5);
      mottle(ctx, W, H, 0x11131a, 0.6, o.seed + 1, 9);
      // fine hex weave
      ctx.strokeStyle = rgbaStr(0x4c5468, 0.25);
      ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 16) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + ((x / 8) % 2 ? 4 : 0));
        ctx.stroke();
      }
    } else {
      const base = variant === 'asphalt-new' ? 0x2f2f30 : variant === 'asphalt-patched' ? 0x3b3833 : 0x36363a;
      ctx.fillStyle = hex(base);
      ctx.fillRect(0, 0, W, H);
      // aggregate
      for (let i = 0; i < 9000; i++) {
        const x = rng() * W,
          y = rng() * H;
        const v = rng();
        ctx.fillStyle = rgbaStr(v > 0.5 ? 0x8a8880 : 0x1a1a1c, 0.12 + rng() * 0.3);
        ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
      }
      if (variant !== 'asphalt-new') {
        // cracks + patches
        const nCrack = variant === 'asphalt-patched' ? 26 : 10;
        for (let i = 0; i < nCrack; i++) {
          ctx.strokeStyle = rgbaStr(0x16161a, 0.75);
          ctx.lineWidth = rng() * 2.4 + 0.7;
          ctx.beginPath();
          let x = rng() * W,
            y = rng() * H;
          ctx.moveTo(x, y);
          for (let s = 0; s < 8; s++) {
            x += (rng() - 0.5) * 70;
            y += (rng() - 0.5) * 70;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        if (variant === 'asphalt-patched') {
          for (let i = 0; i < 7; i++) {
            ctx.fillStyle = rgbaStr(0x1e1e20, 0.55);
            const x = rng() * W,
              y = rng() * H;
            ctx.beginPath();
            ctx.ellipse(x, y, rng() * 60 + 20, rng() * 45 + 15, rng() * TAU, 0, TAU);
            ctx.fill();
          }
        }
      }
      // tyre polish tracks
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, rgbaStr(0x000000, 0));
      g.addColorStop(0.5, rgbaStr(0x000000, 0.14));
      g.addColorStop(1, rgbaStr(0x000000, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    grain(ctx, W, H, 0.12, o.seed + 5);
    return finish(c);
  });
}

export function sidewalkTex(variant = 'slab', opts = {}) {
  const o = { seed: 101, ...opts };
  return memo('sw' + variant, o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);
    const base =
      variant === 'composite'
        ? 0x3b4152
        : variant === 'slab-worn'
        ? 0x9d968a
        : variant === 'slab-cracked'
        ? 0x8e8a82
        : variant === 'slab-new'
        ? 0xb6b2aa
        : 0xa8a49c;
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, W, H);
    const cells = 4;
    const s = W / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        ctx.fillStyle = hex(mixHex(base, rng() > 0.5 ? 0xffffff : 0x6f6b64, rng() * 0.16));
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        ctx.strokeStyle = rgbaStr(0x4b4740, 0.55);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
      }
    }
    if (variant === 'composite') {
      ctx.strokeStyle = rgbaStr(0x6d7ba8, 0.35);
      ctx.lineWidth = 1.5;
      for (let y = 0; y < H; y += 32)
        for (let x = 0; x < W; x += 32) ctx.strokeRect(x + 6, y + 6, 20, 20);
    }
    if (variant === 'slab-cracked' || variant === 'slab-worn') {
      for (let i = 0; i < (variant === 'slab-cracked' ? 30 : 14); i++) {
        ctx.strokeStyle = rgbaStr(0x3c3830, 0.6);
        ctx.lineWidth = rng() * 2 + 0.5;
        ctx.beginPath();
        let x = rng() * W,
          y = rng() * H;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += (rng() - 0.5) * 50;
          y += (rng() - 0.5) * 50;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // gum spots
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = rgbaStr(0x2a2724, 0.3 + rng() * 0.3);
        ctx.beginPath();
        ctx.arc(rng() * W, rng() * H, rng() * 3 + 1, 0, TAU);
        ctx.fill();
      }
    }
    mottle(ctx, W, H, 0x35322c, 0.4, o.seed + 2, 6);
    grain(ctx, W, H, 0.1, o.seed + 3);
    return finish(c);
  });
}

// ---------------------------------------------------------------------------
// windows
// ---------------------------------------------------------------------------
/**
 * A complete window: frame, glazing bars, glass with reflected gradient, plus
 * interior clutter (blinds, curtains, plants, silhouettes, a window A/C unit).
 * Returns { map, emissive } canvas textures.
 */
export function windowTex(opts = {}) {
  const o = {
    style: 'punched', // punched | arched | ribbon | grid | shop
    frame: 0xd8d2c4,
    tint: 0x2b3540,
    lit: false,
    blinds: 0,
    curtains: 0,
    ac: false,
    boarded: false,
    bars: false,
    plant: false,
    silhouette: false,
    grime: 0.3,
    seed: 1,
    ...opts,
  };
  return memo('win', o, () => {
    const W = 128,
      H = 192;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);

    // ---- glass ----
    const gg = ctx.createLinearGradient(0, 0, W * 0.4, H);
    if (o.lit) {
      gg.addColorStop(0, hex(mixHex(o.tint, 0xffd9a0, 0.55)));
      gg.addColorStop(0.6, hex(mixHex(o.tint, 0xffc078, 0.4)));
      gg.addColorStop(1, hex(mixHex(o.tint, 0xff9d4a, 0.2)));
    } else {
      gg.addColorStop(0, hex(mixHex(o.tint, 0xa8c8e8, 0.5)));
      gg.addColorStop(0.45, hex(o.tint));
      gg.addColorStop(1, hex(mixHex(o.tint, 0x000000, 0.35)));
    }
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);

    // interior depth
    ctx.fillStyle = rgbaStr(0x000000, 0.35);
    ctx.fillRect(0, H * 0.62, W, H * 0.38);

    if (o.silhouette) {
      ctx.fillStyle = rgbaStr(0x120e0a, 0.55);
      const hx = W * (0.3 + rng() * 0.4);
      const hy = H * (0.45 + rng() * 0.2);
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, TAU);
      ctx.fill();
      ctx.fillRect(hx - 12, hy + 7, 24, 40);
    }
    if (o.plant) {
      ctx.fillStyle = rgbaStr(0x4a3a24, 0.9);
      ctx.fillRect(W * 0.62, H * 0.6, 22, 16);
      ctx.fillStyle = rgbaStr(0x2f6b34, 0.9);
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.ellipse(W * 0.62 + 11 + (rng() - 0.5) * 22, H * 0.6 - rng() * 22, 4, 9, rng() * TAU, 0, TAU);
        ctx.fill();
      }
    }

    // ---- blinds / curtains ----
    if (o.blinds > 0) {
      const bh = H * o.blinds;
      ctx.fillStyle = hex(0xe4dfd2);
      ctx.fillRect(0, 0, W, bh);
      for (let y = 0; y < bh; y += 6) {
        ctx.fillStyle = rgbaStr(0x9c9787, 0.55);
        ctx.fillRect(0, y, W, 1.6);
      }
      ctx.fillStyle = rgbaStr(0x000000, 0.18);
      ctx.fillRect(0, bh - 3, W, 3);
    }
    if (o.curtains > 0) {
      for (const side of [0, 1]) {
        const cw = W * (0.16 + rng() * 0.12);
        const g2 = ctx.createLinearGradient(side ? W - cw : 0, 0, side ? W : cw, 0);
        g2.addColorStop(0, rgbaStr(0xe8dcc4, 0.95));
        g2.addColorStop(1, rgbaStr(0xb8ab92, 0.75));
        ctx.fillStyle = g2;
        ctx.fillRect(side ? W - cw : 0, 0, cw, H);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = rgbaStr(0x8e8371, 0.25);
          ctx.fillRect((side ? W - cw : 0) + (i * cw) / 5, 0, 1.5, H);
        }
      }
    }

    // ---- frame / glazing bars ----
    const fw = 7;
    ctx.strokeStyle = hex(o.frame);
    ctx.lineWidth = fw;
    ctx.strokeRect(fw / 2, fw / 2, W - fw, H - fw);
    ctx.fillStyle = hex(o.frame);
    if (o.style === 'punched' || o.style === 'arched') {
      ctx.fillRect(0, H / 2 - 3, W, 6); // meeting rail
      ctx.fillRect(W / 2 - 2.5, 0, 5, H); // muntin
      ctx.fillRect(0, H * 0.25 - 1.5, W, 3);
      ctx.fillRect(0, H * 0.75 - 1.5, W, 3);
    } else if (o.style === 'grid') {
      for (let i = 1; i < 4; i++) ctx.fillRect((W * i) / 4 - 2, 0, 4, H);
      for (let i = 1; i < 6; i++) ctx.fillRect(0, (H * i) / 6 - 2, W, 4);
    } else if (o.style === 'ribbon' || o.style === 'shop') {
      ctx.fillRect(W / 2 - 3, 0, 6, H);
    }

    // reflected highlight sweep
    const rg = ctx.createLinearGradient(0, H, W, 0);
    rg.addColorStop(0, rgbaStr(0xffffff, 0));
    rg.addColorStop(0.45, rgbaStr(0xffffff, 0.12));
    rg.addColorStop(0.5, rgbaStr(0xffffff, 0.2));
    rg.addColorStop(0.56, rgbaStr(0xffffff, 0.05));
    rg.addColorStop(1, rgbaStr(0xffffff, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // ---- era hardware ----
    if (o.ac) {
      ctx.fillStyle = '#b9b6ad';
      ctx.fillRect(W * 0.2, H * 0.52, W * 0.6, H * 0.2);
      ctx.fillStyle = '#8d8a82';
      ctx.fillRect(W * 0.2, H * 0.52, W * 0.6, 5);
      for (let y = H * 0.57; y < H * 0.71; y += 4) {
        ctx.fillStyle = rgbaStr(0x5a5852, 0.7);
        ctx.fillRect(W * 0.23, y, W * 0.54, 2);
      }
      ctx.fillStyle = rgbaStr(0x2e2c28, 0.5);
      ctx.fillRect(W * 0.2, H * 0.72, W * 0.6, 4);
    }
    if (o.bars) {
      ctx.strokeStyle = rgbaStr(0x22201e, 0.85);
      ctx.lineWidth = 3;
      for (let x = 10; x < W; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x, H - 4);
        ctx.stroke();
      }
      for (let y = 18; y < H; y += 44) {
        ctx.beginPath();
        ctx.moveTo(4, y);
        ctx.lineTo(W - 4, y);
        ctx.stroke();
      }
    }
    if (o.boarded) {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(W / 2, H * (0.25 + i * 0.25));
        ctx.rotate((rng() - 0.5) * 0.16);
        const g3 = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
        g3.addColorStop(0, '#8a6f4c');
        g3.addColorStop(0.5, '#9c8058');
        g3.addColorStop(1, '#7d6344');
        ctx.fillStyle = g3;
        ctx.fillRect(-W / 2 - 6, -H * 0.11, W + 12, H * 0.22);
        ctx.strokeStyle = rgbaStr(0x5c4630, 0.6);
        ctx.lineWidth = 1;
        ctx.strokeRect(-W / 2 - 6, -H * 0.11, W + 12, H * 0.22);
        ctx.restore();
      }
    }

    // grime
    ctx.fillStyle = rgbaStr(0x2a251d, 0.16 * o.grime);
    ctx.fillRect(0, 0, W, H);
    edgeDirt(ctx, W, H, 0x241f16, o.grime);
    grain(ctx, W, H, 0.05, o.seed + 1);

    return finish(c);
  });
}

/** The lit portion of a window, used as an emissiveMap. */
export function windowEmissiveTex(opts = {}) {
  const o = { blinds: 0, curtains: 0, boarded: false, seed: 1, style: 'punched', ...opts };
  return memo('winE', o, () => {
    const W = 64,
      H = 96;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#c8a878');
    g.addColorStop(1, '#4a3a26');
    ctx.fillStyle = g;
    ctx.fillRect(3, 3, W - 6, H - 6);
    if (o.blinds > 0) {
      ctx.fillStyle = '#6a6050';
      ctx.fillRect(0, 0, W, H * o.blinds);
    }
    if (o.boarded) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillRect(0, 0, 4, H);
    ctx.fillRect(W - 4, 0, 4, H);
    if (o.style === 'punched' || o.style === 'arched') {
      ctx.fillRect(0, H / 2 - 2, W, 4);
      ctx.fillRect(W / 2 - 2, 0, 4, H);
    }
    return finish(c, { srgb: false });
  });
}

// ---------------------------------------------------------------------------
// storefront interiors — drawn onto the display-window plane
// ---------------------------------------------------------------------------
export function shopInteriorTex(type, opts = {}) {
  const o = { seed: 5, accent: 0xffcc66, dark: false, ...opts };
  return memo('shop' + type, o, () => {
    const W = 512,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);
    const wallCol = o.dark ? 0x1b1a1f : 0x584c40;
    // back wall + floor perspective
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(shade(wallCol, o.dark ? 0.1 : 0.18)));
    g.addColorStop(0.62, hex(wallCol));
    g.addColorStop(1, hex(shade(wallCol, -0.45)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // ceiling light spill
    ctx.fillStyle = rgbaStr(0xffe6b8, o.dark ? 0.1 : 0.22);
    ctx.fillRect(0, 0, W, H * 0.12);

    const shelf = (x, y, w, h, col) => {
      ctx.fillStyle = hex(col);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = rgbaStr(0x000000, 0.3);
      ctx.fillRect(x, y + h - 3, w, 3);
    };
    const bottles = (x, y, w, n, cols) => {
      for (let i = 0; i < n; i++) {
        const bx = x + (i * w) / n;
        ctx.fillStyle = hex(cols[i % cols.length]);
        const bh = 14 + rng() * 16;
        ctx.fillRect(bx + 2, y - bh, w / n - 4, bh);
        ctx.fillStyle = rgbaStr(0xffffff, 0.25);
        ctx.fillRect(bx + 3, y - bh, 2, bh);
      }
    };

    switch (type) {
      case 'diner': {
        shelf(0, H * 0.62, W, 16, 0x9c6b3f);
        bottles(20, H * 0.62, W - 40, 16, [0xd9534f, 0xf0ad4e, 0xf7f2e0, 0x8b5a2b]);
        // counter stools
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = '#b0453c';
          ctx.beginPath();
          ctx.ellipse(50 + i * 100, H * 0.8, 26, 9, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#7d7f82';
          ctx.fillRect(46 + i * 100, H * 0.8, 8, H * 0.2);
        }
        // menu board
        ctx.fillStyle = '#20302a';
        ctx.fillRect(W * 0.3, 20, W * 0.4, 60);
        ctx.fillStyle = '#e8dcc0';
        ctx.font = 'bold 18px Georgia, serif';
        ctx.fillText('TODAY', W * 0.34, 45);
        ctx.font = '14px Georgia, serif';
        ctx.fillText('MEATLOAF  .45', W * 0.34, 66);
        break;
      }
      case 'pharmacy':
      case 'apothecary': {
        for (let r = 0; r < 3; r++) {
          shelf(10, H * (0.3 + r * 0.19), W - 20, 10, 0x8a6a44);
          bottles(14, H * (0.3 + r * 0.19), W - 28, 22, [0x6fa8dc, 0xe06666, 0xffd966, 0x93c47d, 0xf3f3f3]);
        }
        ctx.fillStyle = hex(o.accent);
        ctx.font = 'bold 26px Georgia, serif';
        ctx.fillText('DRUGS', 30, 40);
        break;
      }
      case 'video': {
        for (let r = 0; r < 4; r++) {
          for (let i = 0; i < 22; i++) {
            ctx.fillStyle = hex(mixHex(0x2b2b44, rng() * 0xffffff, 0.55));
            ctx.fillRect(14 + i * 22, H * (0.22 + r * 0.18), 18, 34);
            ctx.fillStyle = rgbaStr(0xffffff, 0.15);
            ctx.fillRect(14 + i * 22, H * (0.22 + r * 0.18), 18, 5);
          }
          shelf(10, H * (0.22 + r * 0.18) + 34, W - 20, 6, 0x3b3b52);
        }
        break;
      }
      case 'arcade': {
        ctx.fillStyle = '#08060f';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 8; i++) {
          const x = 20 + i * 62;
          ctx.fillStyle = hex(mixHex(0x1a1030, 0x552288, rng()));
          ctx.fillRect(x, H * 0.35, 44, H * 0.6);
          const scr = ctx.createLinearGradient(x, H * 0.4, x + 44, H * 0.6);
          scr.addColorStop(0, '#39f0ff');
          scr.addColorStop(1, '#a855ff');
          ctx.fillStyle = scr;
          ctx.fillRect(x + 6, H * 0.42, 32, 26);
          ctx.fillStyle = hex(mixHex(0xff2f92, 0xffd23f, rng()));
          ctx.fillRect(x, H * 0.3, 44, 10);
        }
        break;
      }
      case 'tvShop': {
        for (let r = 0; r < 2; r++)
          for (let i = 0; i < 5; i++) {
            const x = 24 + i * 96,
              y = H * (0.24 + r * 0.36);
            ctx.fillStyle = '#6b4a2e';
            ctx.fillRect(x, y, 76, 62);
            ctx.fillStyle = rng() > 0.4 ? '#cfd8dc' : '#2b2f33';
            ctx.fillRect(x + 8, y + 8, 60, 40);
            ctx.fillStyle = rgbaStr(0xffffff, 0.2);
            ctx.fillRect(x + 8, y + 8, 60, 12);
          }
        break;
      }
      case 'laundromat': {
        for (let i = 0; i < 8; i++) {
          const x = 16 + i * 62;
          ctx.fillStyle = '#e8ebee';
          ctx.fillRect(x, H * 0.4, 52, 76);
          ctx.fillStyle = '#8fa3ad';
          ctx.beginPath();
          ctx.arc(x + 26, H * 0.4 + 40, 18, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#c8d4da';
          ctx.beginPath();
          ctx.arc(x + 26, H * 0.4 + 40, 13, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'bank':
      case 'lobby':
      case 'lobbyGlass':
      case 'lobbyFuture': {
        const marble = type === 'bank' ? 0x9c937f : 0x4a5560;
        ctx.fillStyle = hex(marble);
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) {
          ctx.strokeStyle = rgbaStr(0xffffff, 0.08);
          ctx.lineWidth = rng() * 2;
          ctx.beginPath();
          ctx.moveTo(rng() * W, 0);
          ctx.lineTo(rng() * W, H);
          ctx.stroke();
        }
        // teller line / reception desk
        ctx.fillStyle = hex(type === 'bank' ? 0x4a3520 : 0x22303a);
        ctx.fillRect(W * 0.15, H * 0.55, W * 0.7, H * 0.3);
        ctx.fillStyle = rgbaStr(0xffffff, 0.12);
        ctx.fillRect(W * 0.15, H * 0.55, W * 0.7, 6);
        if (type === 'bank') {
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = rgbaStr(0xc9a227, 0.8);
            ctx.fillRect(W * 0.2 + i * W * 0.17, H * 0.3, 4, H * 0.25);
          }
        }
        ctx.fillStyle = rgbaStr(0xffe9c0, 0.16);
        ctx.fillRect(0, 0, W, H * 0.2);
        break;
      }
      case 'coffeeChain':
      case 'cafe':
      case 'bakery':
      case 'cafeFuture': {
        ctx.fillStyle = hex(type === 'cafeFuture' ? 0x101a2a : 0x3d2b1f);
        ctx.fillRect(0, 0, W, H);
        // counter
        ctx.fillStyle = hex(type === 'cafeFuture' ? 0x1d3348 : 0x6b4a2c);
        ctx.fillRect(0, H * 0.6, W, H * 0.4);
        ctx.fillStyle = rgbaStr(0xffffff, 0.1);
        ctx.fillRect(0, H * 0.6, W, 5);
        // pastry case
        ctx.fillStyle = rgbaStr(0xf6e7c8, 0.85);
        ctx.fillRect(W * 0.08, H * 0.46, W * 0.3, H * 0.14);
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = hex(mixHex(0xd9a05b, 0x8a5a2b, rng()));
          ctx.beginPath();
          ctx.ellipse(W * 0.11 + i * 20, H * 0.56, 7, 5, 0, 0, TAU);
          ctx.fill();
        }
        // menu board + machine
        ctx.fillStyle = type === 'cafeFuture' ? hex(o.accent) : '#1c1c1c';
        ctx.fillRect(W * 0.5, H * 0.12, W * 0.42, H * 0.3);
        ctx.fillStyle = type === 'cafeFuture' ? '#04121c' : '#e8e0cc';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText('ESPRESSO  3', W * 0.53, H * 0.22);
        ctx.fillText('FILTER    4', W * 0.53, H * 0.3);
        ctx.fillText('MATCHA    5', W * 0.53, H * 0.38);
        ctx.fillStyle = '#b8bfc4';
        ctx.fillRect(W * 0.42, H * 0.5, 60, 40);
        break;
      }
      case 'phoneShop':
      case 'repair': {
        ctx.fillStyle = '#eef1f4';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#d6dbe0';
          ctx.fillRect(24, H * (0.25 + i * 0.22), W - 48, 8);
          for (let k = 0; k < 12; k++) {
            ctx.fillStyle = hex(mixHex(0x2b3138, 0x9aa3ad, rng()));
            ctx.fillRect(34 + k * 38, H * (0.25 + i * 0.22) - 22, 16, 22);
          }
        }
        ctx.fillStyle = hex(o.accent);
        ctx.fillRect(0, 0, W, 22);
        break;
      }
      case 'boba':
      case 'ramen':
      case 'fastCasual':
      case 'sushi': {
        ctx.fillStyle = hex(type === 'sushi' ? 0x24211d : 0x2b2030);
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = hex(type === 'sushi' ? 0x4a3a28 : 0x40304a);
        ctx.fillRect(0, H * 0.58, W, H * 0.42);
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = hex(mixHex(o.accent, 0xffffff, rng() * 0.5));
          ctx.beginPath();
          ctx.arc(30 + i * 38, H * 0.54, 8, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = rgbaStr(0xffffff, 0.9);
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillText(type.toUpperCase(), 24, 44);
        break;
      }
      case 'hydroponics':
      case 'growRack': {
        ctx.fillStyle = '#07130f';
        ctx.fillRect(0, 0, W, H);
        for (let r = 0; r < 4; r++) {
          const y = H * (0.16 + r * 0.22);
          ctx.fillStyle = rgbaStr(0xff5ce0, 0.35);
          ctx.fillRect(10, y - 8, W - 20, 6);
          for (let i = 0; i < 18; i++) {
            ctx.fillStyle = hex(mixHex(0x3fbf6a, 0x9ef07a, rng()));
            ctx.beginPath();
            ctx.ellipse(20 + i * 28, y + 8, 9, 7, rng(), 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#123028';
          ctx.fillRect(10, y + 14, W - 20, 6);
        }
        break;
      }
      case 'fabShop':
      case 'medpod':
      case 'atelier':
      case 'gymFuture': {
        ctx.fillStyle = '#0a1020';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 5; i++) {
          const x = 30 + i * 96;
          ctx.strokeStyle = rgbaStr(o.accent, 0.8);
          ctx.lineWidth = 2;
          ctx.strokeRect(x, H * 0.3, 66, H * 0.5);
          ctx.fillStyle = rgbaStr(o.accent, 0.16);
          ctx.fillRect(x, H * 0.3, 66, H * 0.5);
          ctx.fillStyle = rgbaStr(o.accent, 0.9);
          ctx.fillRect(x + 8, H * 0.3 + 8 + rng() * 40, 50, 3);
        }
        break;
      }
      case 'tanning':
      case 'barber':
      case 'gym': {
        ctx.fillStyle = hex(o.dark ? 0x1a1620 : 0xe4e0d6);
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = hex(o.dark ? 0x352a3f : 0xb8b2a6);
          ctx.fillRect(30 + i * 120, H * 0.35, 70, H * 0.55);
          ctx.fillStyle = rgbaStr(0xffffff, 0.3);
          ctx.fillRect(36 + i * 120, H * 0.38, 58, 26);
        }
        break;
      }
      case 'checkCash':
      case 'pawn': {
        ctx.fillStyle = '#2a2430';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#3d3446';
        ctx.fillRect(0, H * 0.5, W, H * 0.5);
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = hex(mixHex(0xffe14d, 0xc0392b, rng()));
          ctx.fillRect(20 + i * 30, H * 0.3 + rng() * 30, 18, 26);
        }
        ctx.fillStyle = '#ffe14d';
        ctx.font = 'bold 28px Impact, sans-serif';
        ctx.fillText('CASH', 24, 46);
        break;
      }
      default: {
        // generic goods on shelves
        for (let r = 0; r < 3; r++) {
          shelf(12, H * (0.32 + r * 0.2), W - 24, 9, 0x6b563c);
          bottles(16, H * (0.32 + r * 0.2), W - 32, 16, [0xd9534f, 0x5bc0de, 0xf0ad4e, 0xe8e0cc, 0x8fbc6b]);
        }
      }
    }

    // glass reflection over the whole thing
    const rg = ctx.createLinearGradient(0, 0, W, H);
    rg.addColorStop(0, rgbaStr(0xffffff, 0.1));
    rg.addColorStop(0.35, rgbaStr(0xdfeaff, 0.04));
    rg.addColorStop(0.45, rgbaStr(0xffffff, 0.16));
    rg.addColorStop(0.55, rgbaStr(0xffffff, 0.02));
    rg.addColorStop(1, rgbaStr(0x9ab4d0, 0.1));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    grain(ctx, W, H, 0.04, o.seed + 2);
    return finish(c);
  });
}

// ---------------------------------------------------------------------------
// overlays: graffiti, posters, decals
// ---------------------------------------------------------------------------
const TAG_WORDS = ['ZEPH', 'RIOT', 'FADE', 'SKUZ', 'TFK', 'ONE', 'KRUSH', 'DUST', 'VEXT', 'RAZE'];

function drawTags(ctx, W, H, amount, seed) {
  const rng = makeRng(seed);
  const n = Math.max(1, Math.round(amount * 4));
  for (let i = 0; i < n; i++) {
    const word = TAG_WORDS[Math.floor(rng() * TAG_WORDS.length)];
    const size = 40 + rng() * 70;
    ctx.save();
    ctx.translate(rng() * W, H * (0.35 + rng() * 0.55));
    ctx.rotate((rng() - 0.5) * 0.34);
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    ctx.lineWidth = size * 0.12;
    const c1 = mixHex(0xff3d7f, 0x39ff88, rng());
    const c2 = mixHex(0x63e0ff, 0xffd23f, rng());
    // drips
    ctx.strokeStyle = rgbaStr(0x120c14, 0.8);
    ctx.strokeText(word, 0, 0);
    const g = ctx.createLinearGradient(0, -size, 0, 0);
    g.addColorStop(0, hex(c1));
    g.addColorStop(1, hex(c2));
    ctx.fillStyle = g;
    ctx.fillText(word, 0, 0);
    const wmeas = ctx.measureText(word).width;
    for (let d = 0; d < 5; d++) {
      const dx = rng() * wmeas;
      ctx.fillStyle = hex(c2);
      ctx.fillRect(dx, 0, 2.5, rng() * 26);
    }
    ctx.restore();
  }
}

/** Transparent graffiti decal sheet. */
export function graffitiTex(opts = {}) {
  const o = { amount: 1, seed: 3, ...opts };
  return memo('graf', o, () => {
    const W = 512,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    drawTags(ctx, W, H, o.amount * 2.2, o.seed);
    return finish(c, { wrap: THREE.ClampToEdgeWrapping });
  });
}

/** Flyposted paper on a hoarding. */
export function posterWallTex(era = '1985', opts = {}) {
  const o = { seed: 4, era, ...opts };
  return memo('posters', o, () => {
    const W = 512,
      H = 512;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const rng = makeRng(o.seed);
    ctx.fillStyle = era === '1945' ? '#6b5b45' : '#3a3a3e';
    ctx.fillRect(0, 0, W, H);
    const words =
      era === '1945'
        ? ['DANCE', 'WAR BONDS', 'NEWSREEL', 'BOXING', 'SWING NITE', 'ENLIST']
        : era === '1965'
        ? ['TWIST', 'DRIVE-IN', 'SURF SHOW', 'NEW 65', 'TEEN DANCE']
        : era === '1985'
        ? ['LIVE!', 'PUNK NITE', 'CLUB', '$5 SHOW', 'MIXTAPE', 'RENT ME']
        : era === '2005'
        ? ['GIG', 'OPEN MIC', 'LOFT PARTY', 'FREE WIFI', 'MYSPACE.COM']
        : era === '2025'
        ? ['POP-UP', 'DJ SET', 'MARKET', 'YOGA', 'SCAN ME']
        : ['NEURO SET', 'DECK 12', 'LOOP', 'SYNTH', 'VOLUME'];
    for (let i = 0; i < 26; i++) {
      const w = 70 + rng() * 90;
      const h = 90 + rng() * 110;
      const x = rng() * (W - w);
      const y = rng() * (H - h);
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((rng() - 0.5) * 0.22);
      ctx.fillStyle = hex(mixHex(0xf2e9d8, rng() * 0xffffff, 0.4));
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = hex(mixHex(0x1a1a1a, rng() * 0xffffff, 0.25));
      ctx.font = `bold ${12 + rng() * 12}px Impact, sans-serif`;
      const word = words[Math.floor(rng() * words.length)];
      ctx.fillText(word, -w / 2 + 6, -h / 2 + 24);
      for (let l = 0; l < 6; l++) {
        ctx.fillStyle = rgbaStr(0x2a2a2a, 0.5);
        ctx.fillRect(-w / 2 + 6, -h / 2 + 34 + l * 10, w * (0.4 + rng() * 0.5), 3);
      }
      // torn corner
      if (rng() < 0.4) {
        ctx.fillStyle = era === '1945' ? '#6b5b45' : '#3a3a3e';
        ctx.beginPath();
        ctx.moveTo(w / 2, -h / 2);
        ctx.lineTo(w / 2 - 30 * rng() - 8, -h / 2);
        ctx.lineTo(w / 2, -h / 2 + 30 * rng() + 8);
        ctx.fill();
      }
      ctx.restore();
    }
    mottle(ctx, W, H, 0x181410, 0.4, o.seed + 1, 5);
    grain(ctx, W, H, 0.1, o.seed + 2);
    return finish(c);
  });
}

/** Road paint decal (arrow / stop line / bike symbol / crosswalk band). */
export function roadPaintTex(kind, opts = {}) {
  const o = { color: 0xf2f2e8, wear: 0.2, seed: 6, ...opts };
  return memo('paint' + kind, o, () => {
    const W = 256,
      H = 256;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = hex(o.color);
    ctx.strokeStyle = hex(o.color);
    if (kind === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(W / 2, 20);
      ctx.lineTo(W * 0.78, 96);
      ctx.lineTo(W * 0.6, 96);
      ctx.lineTo(W * 0.6, 236);
      ctx.lineTo(W * 0.4, 236);
      ctx.lineTo(W * 0.4, 96);
      ctx.lineTo(W * 0.22, 96);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'bike') {
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(W * 0.32, H * 0.66, 34, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W * 0.7, H * 0.66, 34, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W * 0.32, H * 0.66);
      ctx.lineTo(W * 0.48, H * 0.4);
      ctx.lineTo(W * 0.7, H * 0.66);
      ctx.lineTo(W * 0.52, H * 0.66);
      ctx.closePath();
      ctx.stroke();
      ctx.fillRect(W * 0.42, H * 0.28, 40, 12);
    } else if (kind === 'lettersBus') {
      ctx.font = 'bold 84px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BUS', W / 2, H * 0.42);
      ctx.fillText('ONLY', W / 2, H * 0.82);
    } else if (kind === 'ev') {
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(W * 0.56, 24);
      ctx.lineTo(W * 0.3, H * 0.55);
      ctx.lineTo(W * 0.52, H * 0.55);
      ctx.lineTo(W * 0.42, H - 24);
      ctx.lineTo(W * 0.74, H * 0.42);
      ctx.lineTo(W * 0.5, H * 0.42);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'stopline') {
      ctx.fillRect(0, H * 0.35, W, H * 0.3);
    } else if (kind === 'hatch') {
      ctx.lineWidth = 14;
      for (let i = -H; i < W; i += 46) {
        ctx.beginPath();
        ctx.moveTo(i, H);
        ctx.lineTo(i + H, 0);
        ctx.stroke();
      }
    }
    // paint wear
    const rng = makeRng(o.seed);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 240 * o.wear; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rng() * 0.7})`;
      ctx.beginPath();
      ctx.ellipse(rng() * W, rng() * H, rng() * 9 + 1, rng() * 6 + 1, rng() * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return finish(c, { wrap: THREE.ClampToEdgeWrapping });
  });
}

/** Fabric for awnings: canvas stripes or flat. */
export function awningTex(kind, opts = {}) {
  const o = { a: 0x1e5f4a, b: 0xe8dcc0, seed: 8, wear: 0.3, ...opts };
  return memo('awn' + kind, o, () => {
    const W = 256,
      H = 128;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    if (kind === 'canvas-stripe') {
      const sw = W / 8;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = hex(i % 2 ? o.a : o.b);
        ctx.fillRect(i * sw, 0, sw, H);
      }
    } else {
      ctx.fillStyle = hex(o.a);
      ctx.fillRect(0, 0, W, H);
    }
    // weave
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = rgbaStr(0x000000, 0.05);
      ctx.fillRect(0, y, W, 1);
    }
    mottle(ctx, W, H, 0x2a2418, 0.5 * o.wear, o.seed, 5);
    edgeDirt(ctx, W, H, 0x2a2418, o.wear);
    grain(ctx, W, H, 0.05, o.seed + 1);
    return finish(c);
  });
}

/** Fine-grained normal-ish bump substitute: a subtle roughness map. */
export function noiseRoughTex(scale = 6, seed = 1) {
  return memo('rough', { scale, seed }, () => {
    const W = 128;
    const c = mkCanvas(W, W);
    const ctx = c.getContext('2d');
    const n = fbm2D(seed, 4);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const v = n((x / W) * scale, (y / W) * scale);
        const g = Math.round(120 + v * 110);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(x, y, 1, 1);
      }
    return finish(c, { srgb: false });
  });
}

/** Soft round shadow / glow blob. */
export function blobTex(color = 0x000000, power = 2.2) {
  return memo('blob', { color, power }, () => {
    const S = 128;
    const c = mkCanvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      g.addColorStop(t, rgbaStr(color, Math.pow(1 - t, power)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return finish(c, { wrap: THREE.ClampToEdgeWrapping });
  });
}

/** A light-cone / god-ray sprite for street lamps. */
export function coneGlowTex(color = 0xffdca8) {
  return memo('coneGlow', { color }, () => {
    const S = 128;
    const c = mkCanvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, rgbaStr(color, 0.55));
    g.addColorStop(0.5, rgbaStr(color, 0.14));
    g.addColorStop(1, rgbaStr(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // horizontal falloff
    ctx.globalCompositeOperation = 'destination-in';
    const g2 = ctx.createLinearGradient(0, 0, S, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(0.5, 'rgba(0,0,0,1)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, S, S);
    return finish(c, { wrap: THREE.ClampToEdgeWrapping });
  });
}

/** Tree foliage billboard cluster. */
export function leafTex(color = 0x3f7a3a, seed = 2, autumn = 0) {
  return memo('leaf', { color, seed, autumn }, () => {
    const S = 128;
    const c = mkCanvas(S, S);
    const ctx = c.getContext('2d');
    const rng = makeRng(seed);
    ctx.clearRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
      const a = rng() * TAU;
      const r = Math.pow(rng(), 0.55) * S * 0.46;
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r * 0.9;
      const col = mixHex(
        mixHex(color, 0x1d3d1c, rng() * 0.5),
        autumn > 0 ? 0xd08b2a : 0x9ed46a,
        rng() * (autumn > 0 ? autumn : 0.45)
      );
      ctx.fillStyle = rgbaStr(col, 0.85);
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + rng() * 8, 4 + rng() * 6, rng() * TAU, 0, TAU);
      ctx.fill();
    }
    return finish(c, { wrap: THREE.ClampToEdgeWrapping });
  });
}
