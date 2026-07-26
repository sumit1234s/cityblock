import * as THREE from 'three';
import { mkCanvas } from './textures.js';
import { makeRng, hex, rgbaStr, mixHex, shade, clamp, TAU, lerp } from './util.js';

/**
 * Signage. Each era advertises with a different technology, and that shows up
 * in the typography, the materials and whether the thing emits light:
 *
 *   painted / gilded  → 1945     hand-lettered, gold leaf, serif
 *   plastic / enamel   → 1965     backlit acrylic, starbursts, Futura-ish
 *   neon               → 1985     glass tube, script, buzzing
 *   vinyl              → 2005     flat corporate, Helvetica, drop shadow
 *   minimal            → 2025     lowercase sans, thin, understated
 *   holo               → 2055     volumetric scanlines, additive blending
 */

const cache = new Map();
function memo(k, make) {
  let v = cache.get(k);
  if (!v) {
    v = make();
    cache.set(k, v);
  }
  return v;
}
export function clearSignCache() {
  for (const t of cache.values()) if (t && t.dispose) t.dispose();
  cache.clear();
}

function tex(canvas, { srgb = true, clamp: cl = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = cl ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Draw text letter-by-letter so we control tracking on every browser. */
function tracked(ctx, text, x, y, spacing, align = 'center') {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}
function trackedStroke(ctx, text, x, y, spacing, align = 'center') {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const ch of chars) {
    ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}

/** Shrink font until the string fits the width. */
function fitFont(ctx, text, maxW, start, family, weight = 'bold', spacing = 0) {
  let size = start;
  for (let i = 0; i < 40; i++) {
    ctx.font = `${weight} ${size}px ${family}`;
    let w = 0;
    for (const ch of [...text]) w += ctx.measureText(ch).width + spacing;
    if (w - spacing <= maxW) break;
    size -= Math.max(1, size * 0.06);
  }
  return size;
}

function wear(ctx, W, H, amount, seed = 1) {
  if (amount <= 0) return;
  const rng = makeRng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 700 * amount; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + rng() * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(rng() * W, rng() * H, rng() * 7 + 0.6, rng() * 5 + 0.6, rng() * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function grime(ctx, W, H, amount, seed = 2) {
  if (amount <= 0) return;
  const rng = makeRng(seed);
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgbaStr(0x1b1710, 0.15 * amount));
    g.addColorStop(1, rgbaStr(0x1b1710, 0));
    ctx.fillStyle = g;
    ctx.fillRect(rng() * W, 0, rng() * 20 + 3, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// storefront fascia sign
// ---------------------------------------------------------------------------
/**
 * @returns {{map:THREE.Texture, emissive:THREE.Texture|null, glow:number}}
 */
export function storefrontSign(spec) {
  const o = {
    kind: 'painted',
    name: 'SHOP',
    sub: '',
    color: 0x1d2b22,
    accent: 0xe8dcc0,
    wear: 0.2,
    seed: 1,
    W: 1024,
    H: 176,
    ...spec,
  };
  const k = 'sf' + JSON.stringify(o);
  return memo(k, () => {
    const { W, H } = o;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const ec = mkCanvas(W, H); // emissive
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    let glow = 0;

    ctx.textBaseline = 'middle';
    ectx.textBaseline = 'middle';

    const bg = (fill) => {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, W, H);
    };

    switch (o.kind) {
      // ---------------------------------------------------------------- 1945
      case 'painted': {
        bg(hex(o.color));
        // painted wood board with beading
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgbaStr(0xffffff, 0.12));
        g.addColorStop(0.5, rgbaStr(0x000000, 0.04));
        g.addColorStop(1, rgbaStr(0x000000, 0.22));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = rgbaStr(o.accent, 0.75);
        ctx.lineWidth = 4;
        ctx.strokeRect(14, 14, W - 28, H - 28);
        ctx.strokeStyle = rgbaStr(o.accent, 0.35);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(22, 22, W - 44, H - 44);
        const size = fitFont(ctx, o.name, W * 0.78, H * 0.52, 'Georgia, "Times New Roman", serif', 'bold', 4);
        ctx.font = `bold ${size}px Georgia, "Times New Roman", serif`;
        ctx.fillStyle = rgbaStr(0x000000, 0.4);
        tracked(ctx, o.name, W / 2 + 3, H * 0.42 + 3, 4);
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, o.name, W / 2, H * 0.42, 4);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.7, H * 0.19, 'Georgia, serif', '', 3);
          ctx.font = `${s2}px Georgia, serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.8);
          tracked(ctx, o.sub, W / 2, H * 0.76, 3);
        }
        wear(ctx, W, H, o.wear * 0.7, o.seed);
        grime(ctx, W, H, o.wear, o.seed + 1);
        break;
      }
      case 'gilded': {
        bg(hex(o.color));
        ctx.fillStyle = rgbaStr(0x000000, 0.25);
        ctx.fillRect(0, H - 10, W, 10);
        // gold-leaf serif with bevel
        const size = fitFont(ctx, o.name, W * 0.8, H * 0.56, 'Georgia, serif', 'bold', 6);
        ctx.font = `bold ${size}px Georgia, serif`;
        const gg = ctx.createLinearGradient(0, H * 0.15, 0, H * 0.7);
        gg.addColorStop(0, '#f7e6a8');
        gg.addColorStop(0.45, hex(o.accent));
        gg.addColorStop(0.55, '#8a6b1e');
        gg.addColorStop(1, '#e0c164');
        ctx.fillStyle = rgbaStr(0x000000, 0.55);
        tracked(ctx, o.name, W / 2 + 3, H * 0.42 + 4, 6);
        ctx.fillStyle = gg;
        tracked(ctx, o.name, W / 2, H * 0.42, 6);
        ctx.strokeStyle = rgbaStr(0x3a2c08, 0.6);
        ctx.lineWidth = 1.4;
        ctx.font = `bold ${size}px Georgia, serif`;
        trackedStroke(ctx, o.name, W / 2, H * 0.42, 6);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.72, H * 0.17, 'Georgia, serif', '', 4);
          ctx.font = `${s2}px Georgia, serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.85);
          tracked(ctx, o.sub, W / 2, H * 0.78, 4);
        }
        grime(ctx, W, H, o.wear, o.seed);
        break;
      }
      // ---------------------------------------------------------------- 1965
      case 'plastic':
      case 'plastic-lit': {
        // backlit acrylic box
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, hex(shade(o.color, 0.22)));
        g.addColorStop(0.5, hex(o.color));
        g.addColorStop(1, hex(shade(o.color, -0.18)));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // metal return
        ctx.fillStyle = '#c9ccce';
        ctx.fillRect(0, 0, W, 9);
        ctx.fillRect(0, H - 9, W, 9);
        const size = fitFont(ctx, o.name, W * 0.8, H * 0.6, 'Impact, "Arial Black", sans-serif', 'bold', 2);
        ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, o.name, W / 2, H * 0.44, 2);
        ectx.font = ctx.font;
        ectx.fillStyle = '#fff';
        ectx.textBaseline = 'middle';
        tracked(ectx, o.name, W / 2, H * 0.44, 2);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.74, H * 0.2, 'Arial, Helvetica, sans-serif', 'bold', 2);
          ctx.font = `bold ${s2}px Arial, Helvetica, sans-serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.9);
          tracked(ctx, o.sub, W / 2, H * 0.8, 2);
          ectx.font = ctx.font;
          ectx.fillStyle = '#8a8a8a';
          tracked(ectx, o.sub, W / 2, H * 0.8, 2);
        }
        // internal illumination bloom
        ectx.globalCompositeOperation = 'lighter';
        const eg = ectx.createLinearGradient(0, 0, 0, H);
        eg.addColorStop(0, 'rgba(90,90,90,1)');
        eg.addColorStop(0.5, 'rgba(140,140,140,1)');
        eg.addColorStop(1, 'rgba(70,70,70,1)');
        ectx.fillStyle = eg;
        ectx.fillRect(0, 0, W, H);
        glow = o.kind === 'plastic-lit' ? 1.1 : 0.75;
        grime(ctx, W, H, o.wear * 0.6, o.seed);
        break;
      }
      case 'enamel': {
        bg(hex(o.color));
        ctx.fillStyle = rgbaStr(0xffffff, 0.1);
        ctx.fillRect(0, 0, W, H * 0.45);
        ctx.strokeStyle = hex(o.accent);
        ctx.lineWidth = 5;
        ctx.strokeRect(12, 12, W - 24, H - 24);
        const size = fitFont(ctx, o.name, W * 0.76, H * 0.5, '"Helvetica Neue", Arial, sans-serif', 'bold', 8);
        ctx.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, o.name, W / 2, H * 0.42, 8);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.7, H * 0.18, 'Arial, sans-serif', '', 5);
          ctx.font = `${s2}px Arial, sans-serif`;
          tracked(ctx, o.sub, W / 2, H * 0.78, 5);
        }
        ectx.fillStyle = '#3c3c3c';
        ectx.fillRect(0, 0, W, H);
        glow = 0.35;
        grime(ctx, W, H, o.wear * 0.5, o.seed);
        break;
      }
      // ---------------------------------------------------------------- 1985
      case 'neon': {
        // dark cabinet
        bg(hex(o.color));
        const rng = makeRng(o.seed);
        for (let i = 0; i < 200; i++) {
          ctx.fillStyle = rgbaStr(0xffffff, 0.02);
          ctx.fillRect(rng() * W, rng() * H, 2, 2);
        }
        ctx.strokeStyle = rgbaStr(0x3a3a44, 0.9);
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, W - 12, H - 12);

        const drawTube = (target, blurScale) => {
          const size = fitFont(target, o.name, W * 0.78, H * 0.58, '"Brush Script MT", "Segoe Script", cursive', 'bold', 2);
          target.font = `bold ${size}px "Brush Script MT", "Segoe Script", cursive`;
          target.textBaseline = 'middle';
          // outer halo
          target.save();
          target.shadowColor = hex(o.accent);
          target.shadowBlur = 34 * blurScale;
          target.strokeStyle = rgbaStr(o.accent, 0.55);
          target.lineWidth = 11;
          trackedStroke(target, o.name, W / 2, H * 0.44, 2);
          target.shadowBlur = 16 * blurScale;
          target.strokeStyle = rgbaStr(o.accent, 0.95);
          target.lineWidth = 6;
          trackedStroke(target, o.name, W / 2, H * 0.44, 2);
          // hot glass core
          target.shadowBlur = 5 * blurScale;
          target.strokeStyle = '#ffffff';
          target.lineWidth = 2.4;
          trackedStroke(target, o.name, W / 2, H * 0.44, 2);
          target.restore();
          if (o.sub) {
            const s2 = fitFont(target, o.sub, W * 0.7, H * 0.17, 'Arial, sans-serif', 'bold', 4);
            target.font = `bold ${s2}px Arial, sans-serif`;
            target.save();
            target.shadowColor = '#7cf0ff';
            target.shadowBlur = 14 * blurScale;
            target.fillStyle = '#d8fbff';
            tracked(target, o.sub, W / 2, H * 0.8, 4);
            target.restore();
          }
        };
        drawTube(ctx, 1);
        drawTube(ectx, 1.2);
        glow = 2.1;
        break;
      }
      // ---------------------------------------------------------------- 2005
      case 'vinyl': {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, hex(shade(o.color, 0.12)));
        g.addColorStop(1, hex(shade(o.color, -0.12)));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = rgbaStr(0xffffff, 0.08);
        ctx.fillRect(0, 0, W, 6);
        const size = fitFont(ctx, o.name, W * 0.8, H * 0.54, '"Helvetica Neue", Arial, sans-serif', 'bold', 1);
        ctx.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = rgbaStr(0x000000, 0.25);
        tracked(ctx, o.name, W / 2 + 2, H * 0.42 + 2, 1);
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, o.name, W / 2, H * 0.42, 1);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.76, H * 0.19, 'Arial, sans-serif', '', 1);
          ctx.font = `${s2}px Arial, sans-serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.85);
          tracked(ctx, o.sub, W / 2, H * 0.78, 1);
        }
        ectx.fillStyle = '#2a2a2a';
        ectx.fillRect(0, 0, W, H);
        glow = 0.5;
        grime(ctx, W, H, o.wear * 0.4, o.seed);
        break;
      }
      // ---------------------------------------------------------------- 2025
      case 'minimal': {
        bg(hex(o.color));
        ctx.fillStyle = rgbaStr(0xffffff, 0.04);
        ctx.fillRect(0, 0, W, H * 0.5);
        const nm = o.name.toLowerCase();
        const size = fitFont(ctx, nm, W * 0.6, H * 0.4, '"Helvetica Neue", system-ui, sans-serif', '300', 10);
        ctx.font = `300 ${size}px "Helvetica Neue", system-ui, sans-serif`;
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, nm, W / 2, H * 0.42, 10);
        ectx.font = ctx.font;
        ectx.textBaseline = 'middle';
        ectx.fillStyle = '#9a9a9a';
        tracked(ectx, nm, W / 2, H * 0.42, 10);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.64, H * 0.14, 'system-ui, sans-serif', '400', 6);
          ctx.font = `400 ${s2}px system-ui, sans-serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.55);
          tracked(ctx, o.sub, W / 2, H * 0.76, 6);
        }
        glow = 0.7;
        break;
      }
      // ---------------------------------------------------------------- 2055
      case 'holo': {
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgbaStr(o.accent, 0.06));
        g.addColorStop(0.5, rgbaStr(o.accent, 0.16));
        g.addColorStop(1, rgbaStr(o.accent, 0.03));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const nm = o.name.toUpperCase();
        const size = fitFont(ctx, nm, W * 0.72, H * 0.46, '"Courier New", monospace', 'bold', 12);
        ctx.font = `bold ${size}px "Courier New", monospace`;
        ctx.save();
        ctx.shadowColor = hex(o.accent);
        ctx.shadowBlur = 26;
        ctx.fillStyle = '#ffffff';
        tracked(ctx, nm, W / 2, H * 0.42, 12);
        ctx.shadowBlur = 8;
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, nm, W / 2, H * 0.42, 12);
        ctx.restore();
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.76, H * 0.14, '"Courier New", monospace', '', 6);
          ctx.font = `${s2}px "Courier New", monospace`;
          ctx.fillStyle = rgbaStr(o.accent, 0.8);
          tracked(ctx, o.sub, W / 2, H * 0.78, 6);
        }
        // scanlines + chromatic ghost
        for (let y = 0; y < H; y += 4) {
          ctx.fillStyle = rgbaStr(0x000000, 0.22);
          ctx.fillRect(0, y, W, 1.6);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgbaStr(0xff3d7f, 0.05);
        ctx.fillRect(-3, 0, W, H);
        ctx.fillStyle = rgbaStr(0x3dfaff, 0.05);
        ctx.fillRect(3, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ectx.drawImage(c, 0, 0);
        glow = 2.4;
        break;
      }
      default: {
        bg(hex(o.color));
        ctx.font = `bold ${H * 0.5}px sans-serif`;
        ctx.fillStyle = hex(o.accent);
        tracked(ctx, o.name, W / 2, H / 2, 2);
      }
    }

    return {
      map: tex(c),
      emissive: glow > 0 ? tex(ec, { srgb: false }) : null,
      glow,
      transparent: o.kind === 'holo',
    };
  });
}

// ---------------------------------------------------------------------------
// big wall advertisement / billboard
// ---------------------------------------------------------------------------
export function wallAdTex(spec) {
  const o = {
    kind: 'painted',
    text: 'COLA',
    sub: '',
    bg: 0x9e2b2b,
    fg: 0xf2e6d0,
    accent: 0xffd23f,
    wear: 0.3,
    seed: 5,
    W: 768,
    H: 512,
    ...spec,
  };
  const k = 'ad' + JSON.stringify(o);
  return memo(k, () => {
    const { W, H } = o;
    const c = mkCanvas(W, H);
    const ctx = c.getContext('2d');
    const ec = mkCanvas(W, H);
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    let glow = 0;
    let transparent = false;
    ctx.textBaseline = 'middle';
    const lines = o.text.split('\n');

    const drawLines = (target, fill, font, spacing, yc = 0.42, sizeFrac = 0.3) => {
      const longest = lines.reduce((a, b) => (a.length > b.length ? a : b));
      const size = fitFont(target, longest, W * 0.84, H * sizeFrac, font, 'bold', spacing);
      target.font = `bold ${size}px ${font}`;
      target.textBaseline = 'middle';
      const lh = size * 1.02;
      const y0 = H * yc - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => {
        target.fillStyle = fill;
        tracked(target, ln, W / 2, y0 + i * lh, spacing);
      });
      return size;
    };

    switch (o.kind) {
      case 'painted':
      case 'ghost': {
        // paint straight onto brick — the brick shows through
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = rgbaStr(o.bg, 0.92);
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = rgbaStr(o.fg, 0.7);
        ctx.lineWidth = 8;
        ctx.strokeRect(18, 18, W - 36, H - 36);
        drawLines(ctx, hex(o.fg), 'Georgia, "Times New Roman", serif', 6, 0.4, 0.3);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.8, H * 0.1, 'Georgia, serif', 'bold', 4);
          ctx.font = `bold ${s2}px Georgia, serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.95);
          tracked(ctx, o.sub, W / 2, H * 0.76, 4);
        }
        // brush texture + fade
        const rng = makeRng(o.seed);
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 300; i++) {
          ctx.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.12})`;
          ctx.fillRect(rng() * W, rng() * H, rng() * 60 + 10, rng() * 3 + 1);
        }
        ctx.globalCompositeOperation = 'source-over';
        wear(ctx, W, H, o.kind === 'ghost' ? o.wear * 3.2 : o.wear, o.seed + 3);
        // ghost signs fade top-down (sun bleach)
        if (o.kind === 'ghost') {
          ctx.globalCompositeOperation = 'destination-out';
          const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
          g.addColorStop(0, 'rgba(0,0,0,0.75)');
          g.addColorStop(1, 'rgba(0,0,0,0.15)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over';
        }
        transparent = true;
        break;
      }
      case 'billboard':
      case 'billboard-lit': {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, hex(shade(o.bg, 0.16)));
        g.addColorStop(1, hex(shade(o.bg, -0.16)));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // print halftone
        const rng = makeRng(o.seed);
        for (let y = 0; y < H; y += 6)
          for (let x = 0; x < W; x += 6) {
            ctx.fillStyle = rgbaStr(0xffffff, 0.02 + rng() * 0.02);
            ctx.fillRect(x, y, 3, 3);
          }
        ctx.fillStyle = rgbaStr(o.accent, 0.9);
        ctx.fillRect(0, H * 0.06, W, 10);
        ctx.fillRect(0, H * 0.9, W, 10);
        drawLines(ctx, hex(o.fg), 'Impact, "Arial Black", sans-serif', 2, 0.4, 0.32);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.86, H * 0.085, 'Arial, sans-serif', 'bold', 2);
          ctx.font = `bold ${s2}px Arial, sans-serif`;
          ctx.fillStyle = rgbaStr(o.accent, 1);
          tracked(ctx, o.sub, W / 2, H * 0.75, 2);
        }
        wear(ctx, W, H, o.wear * 0.5, o.seed + 1);
        if (o.kind === 'billboard-lit') {
          ectx.drawImage(c, 0, 0);
          ectx.fillStyle = 'rgba(60,60,60,1)';
          ectx.globalCompositeOperation = 'multiply';
          ectx.fillRect(0, 0, W, H);
          glow = 0.85;
        }
        break;
      }
      case 'led': {
        ctx.fillStyle = '#05070c';
        ctx.fillRect(0, 0, W, H);
        // pixel grid content
        drawLines(ctx, hex(o.fg), '"Helvetica Neue", Arial, sans-serif', 4, 0.4, 0.3);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.82, H * 0.09, 'Arial, sans-serif', 'bold', 3);
          ctx.font = `bold ${s2}px Arial, sans-serif`;
          ctx.fillStyle = rgbaStr(0xffffff, 0.9);
          tracked(ctx, o.sub, W / 2, H * 0.72, 3);
        }
        // colour wash bands
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createLinearGradient(0, 0, W, H);
        g2.addColorStop(0, rgbaStr(o.fg, 0.18));
        g2.addColorStop(0.5, rgbaStr(0xff3d7f, 0.1));
        g2.addColorStop(1, rgbaStr(0x3dfaff, 0.16));
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        // LED dot mask
        for (let y = 0; y < H; y += 5) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(0, y + 3.4, W, 1.6);
        }
        for (let x = 0; x < W; x += 5) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(x + 3.4, 0, 1.6, H);
        }
        ectx.drawImage(c, 0, 0);
        glow = 1.8;
        break;
      }
      case 'holo': {
        ctx.clearRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
        g.addColorStop(0, rgbaStr(o.fg, 0.2));
        g.addColorStop(1, rgbaStr(o.fg, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.shadowColor = hex(o.fg);
        ctx.shadowBlur = 30;
        drawLines(ctx, '#ffffff', '"Courier New", monospace', 14, 0.4, 0.26);
        ctx.restore();
        ctx.save();
        ctx.shadowColor = hex(o.fg);
        ctx.shadowBlur = 10;
        drawLines(ctx, hex(o.fg), '"Courier New", monospace', 14, 0.4, 0.26);
        ctx.restore();
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.84, H * 0.075, '"Courier New", monospace', '', 5);
          ctx.font = `${s2}px "Courier New", monospace`;
          ctx.fillStyle = rgbaStr(o.fg, 0.85);
          tracked(ctx, o.sub, W / 2, H * 0.72, 5);
        }
        // frame ticks
        ctx.strokeStyle = rgbaStr(o.fg, 0.5);
        ctx.lineWidth = 3;
        const m = 26,
          L = 60;
        [
          [m, m, 1, 1],
          [W - m, m, -1, 1],
          [m, H - m, 1, -1],
          [W - m, H - m, -1, -1],
        ].forEach(([x, y, sx, sy]) => {
          ctx.beginPath();
          ctx.moveTo(x, y + sy * L);
          ctx.lineTo(x, y);
          ctx.lineTo(x + sx * L, y);
          ctx.stroke();
        });
        for (let y = 0; y < H; y += 5) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(0, y, W, 2);
        }
        ectx.drawImage(c, 0, 0);
        glow = 2.6;
        transparent = true;
        break;
      }
      case 'graffiti': {
        ctx.clearRect(0, 0, W, H);
        const rng = makeRng(o.seed);
        const word = o.text.replace('\n', '');
        ctx.save();
        ctx.translate(W / 2, H * 0.5);
        ctx.rotate(-0.06);
        const size = fitFont(ctx, word, W * 0.9, H * 0.6, 'Impact, "Arial Black", sans-serif', 'bold', 0);
        ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = size * 0.14;
        ctx.strokeStyle = '#0d0a10';
        ctx.strokeText(word, 0, 0);
        const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
        g.addColorStop(0, hex(o.fg));
        g.addColorStop(1, hex(mixHex(o.fg, o.accent, 0.7)));
        ctx.fillStyle = g;
        ctx.fillText(word, 0, 0);
        const wm = ctx.measureText(word).width;
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = hex(o.fg);
          ctx.fillRect(-wm / 2 + rng() * wm, size * 0.16, 3, rng() * 60);
        }
        // overspray
        ctx.globalAlpha = 0.25;
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = hex(o.fg);
          const a = rng() * TAU;
          const r = rng() * wm * 0.6;
          ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.5, 2, 2);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (o.sub) {
          ctx.font = `bold ${H * 0.09}px Impact, sans-serif`;
          ctx.fillStyle = rgbaStr(o.accent, 0.9);
          ctx.textAlign = 'center';
          ctx.fillText(o.sub, W / 2, H * 0.86);
        }
        transparent = true;
        break;
      }
      case 'mural': {
        ctx.fillStyle = hex(o.bg);
        ctx.fillRect(0, 0, W, H);
        // abstract geometric mural
        const rng = makeRng(o.seed);
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = rgbaStr(mixHex(o.fg, o.accent, rng()), 0.5 + rng() * 0.4);
          ctx.beginPath();
          if (rng() < 0.5) {
            ctx.arc(rng() * W, rng() * H, rng() * 120 + 20, 0, TAU);
          } else {
            ctx.moveTo(rng() * W, rng() * H);
            ctx.lineTo(rng() * W, rng() * H);
            ctx.lineTo(rng() * W, rng() * H);
            ctx.closePath();
          }
          ctx.fill();
        }
        drawLines(ctx, hex(o.fg), '"Helvetica Neue", Arial, sans-serif', 8, 0.44, 0.26);
        if (o.sub) {
          const s2 = fitFont(ctx, o.sub, W * 0.8, H * 0.06, 'Arial, sans-serif', '', 3);
          ctx.font = `${s2}px Arial, sans-serif`;
          ctx.fillStyle = rgbaStr(0xffffff, 0.7);
          tracked(ctx, o.sub, W / 2, H * 0.88, 3);
        }
        wear(ctx, W, H, o.wear, o.seed + 2);
        transparent = true;
        break;
      }
      default:
        ctx.fillStyle = hex(o.bg);
        ctx.fillRect(0, 0, W, H);
    }

    return {
      map: tex(c),
      emissive: glow > 0 ? tex(ec, { srgb: false }) : null,
      glow,
      transparent,
    };
  });
}

// ---------------------------------------------------------------------------
// animated LED / holo display (media wall, price signs, transit boards)
// ---------------------------------------------------------------------------
/**
 * Returns { texture, update(t) } — the canvas is redrawn a few times a second.
 */
export function makeAnimatedDisplay(opts = {}) {
  const o = {
    W: 512,
    H: 256,
    kind: 'led', // led | holo | prices | transit
    accent: 0x59e0ff,
    lines: ['STREAM EVERYTHING'],
    fps: 12,
    seed: 3,
    ...opts,
  };
  const c = mkCanvas(o.W, o.H);
  const ctx = c.getContext('2d');
  const texture = tex(c, { srgb: true });
  const rng = makeRng(o.seed);
  let acc = 0;
  let frame = 0;
  const stars = Array.from({ length: 60 }, () => ({
    x: rng() * o.W,
    y: rng() * o.H,
    s: rng() * 2 + 0.5,
    v: rng() * 40 + 10,
  }));

  function draw(t) {
    const { W, H } = o;
    ctx.clearRect(0, 0, W, H);
    if (o.kind === 'led') {
      // animated gradient + scrolling headline
      const g = ctx.createLinearGradient(0, 0, W, H);
      const p = (t * 0.08) % 1;
      g.addColorStop(0, hex(mixHex(o.accent, 0xff2f92, (Math.sin(t * 0.6) + 1) / 2)));
      g.addColorStop(clamp(p, 0.01, 0.99), hex(mixHex(0x1b1440, o.accent, 0.4)));
      g.addColorStop(1, hex(mixHex(0x120c2a, 0x3dfaff, (Math.cos(t * 0.4) + 1) / 2)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // moving product blocks
      for (let i = 0; i < 5; i++) {
        const x = ((t * 60 + i * 140) % (W + 160)) - 160;
        ctx.fillStyle = rgbaStr(0xffffff, 0.09);
        ctx.fillRect(x, H * 0.1, 110, H * 0.8);
      }
      const msg = o.lines.join('   •   ') + '   •   ';
      ctx.font = `bold ${H * 0.3}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textBaseline = 'middle';
      const wid = ctx.measureText(msg).width;
      const sx = -((t * 110) % wid);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(msg, sx, H * 0.5);
      ctx.fillText(msg, sx + wid, H * 0.5);
      // dot mask
      for (let y = 0; y < H; y += 5) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(0, y + 3.4, W, 1.6);
      }
      for (let x = 0; x < W; x += 5) {
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.fillRect(x + 3.4, 0, 1.6, H);
      }
    } else if (o.kind === 'holo') {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, W, H);
      // rotating wireframe object + text
      ctx.save();
      ctx.translate(W * 0.28, H * 0.5);
      ctx.strokeStyle = rgbaStr(o.accent, 0.85);
      ctx.lineWidth = 2;
      const r = H * 0.3;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const ang = t * 0.8 + (i * Math.PI) / 5;
        ctx.ellipse(0, 0, r, r * Math.abs(Math.cos(ang)) + 3, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.shadowColor = hex(o.accent);
      ctx.shadowBlur = 18;
      ctx.font = `bold ${H * 0.2}px "Courier New", monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const line = o.lines[Math.floor(t * 0.5) % o.lines.length];
      ctx.fillText(line, W * 0.5, H * 0.42);
      ctx.font = `${H * 0.1}px "Courier New", monospace`;
      ctx.fillStyle = rgbaStr(o.accent, 0.9);
      ctx.fillText('◈ ' + Math.floor(1000 + (t * 37) % 8999) + ' CR', W * 0.5, H * 0.66);
      ctx.restore();
      for (const s of stars) {
        s.y += (s.v * 1) / 30;
        if (s.y > H) s.y = 0;
        ctx.fillStyle = rgbaStr(o.accent, 0.5);
        ctx.fillRect(s.x, s.y, s.s, s.s * 3);
      }
      const off = (t * 90) % H;
      const sg = ctx.createLinearGradient(0, off - 30, 0, off + 30);
      sg.addColorStop(0, rgbaStr(o.accent, 0));
      sg.addColorStop(0.5, rgbaStr(0xffffff, 0.28));
      sg.addColorStop(1, rgbaStr(o.accent, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(0, off - 30, W, 60);
      for (let y = 0; y < H; y += 5) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, y, W, 2);
      }
    } else if (o.kind === 'prices') {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, W, H);
      const grades = ['REG', 'MID', 'PRE'];
      const base = [2.19, 2.39, 2.59];
      grades.forEach((gr, i) => {
        const y = H * (0.22 + i * 0.28);
        ctx.font = `bold ${H * 0.14}px Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(gr, W * 0.06, y);
        ctx.fillStyle = '#ff4a2b';
        ctx.font = `bold ${H * 0.2}px "Courier New", monospace`;
        const flick = Math.sin(t * 3 + i) > 0.98 ? '' : base[i].toFixed(2);
        ctx.fillText(flick + '⁹', W * 0.42, y);
      });
    } else if (o.kind === 'transit') {
      ctx.fillStyle = '#04060e';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `bold ${H * 0.15}px "Courier New", monospace`;
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 4; i++) {
        const mins = Math.max(0, ((Math.floor(t / 4) + i * 3) % 14) + 1);
        ctx.fillStyle = rgbaStr(o.accent, 0.9);
        ctx.fillText(`POD ${12 + i}`, W * 0.06, H * (0.2 + i * 0.24));
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${mins} MIN`, W * 0.62, H * (0.2 + i * 0.24));
      }
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, y, W, 1.5);
      }
    }
    texture.needsUpdate = true;
  }

  draw(0);
  return {
    texture,
    canvas: c,
    update(dt, t) {
      acc += dt;
      if (acc >= 1 / o.fps) {
        acc = 0;
        frame++;
        draw(t);
      }
    },
  };
}

/** Small placard/plaque texture (menus, permits, transit signs, price cards). */
export function placardTex(opts = {}) {
  const o = {
    W: 256,
    H: 320,
    bg: 0xf2ead8,
    fg: 0x2a2118,
    title: 'MENU',
    rows: ['COFFEE  .05', 'PIE  .15', 'SOUP  .10'],
    font: 'Georgia, serif',
    seed: 2,
    wear: 0.25,
    ...opts,
  };
  return memo('plac' + JSON.stringify(o), () => {
    const c = mkCanvas(o.W, o.H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex(o.bg);
    ctx.fillRect(0, 0, o.W, o.H);
    ctx.strokeStyle = rgbaStr(o.fg, 0.6);
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, o.W - 16, o.H - 16);
    ctx.fillStyle = hex(o.fg);
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${o.H * 0.1}px ${o.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(o.title, o.W / 2, o.H * 0.12);
    ctx.font = `${o.H * 0.055}px ${o.font}`;
    ctx.textAlign = 'left';
    o.rows.forEach((r, i) => {
      ctx.fillStyle = rgbaStr(o.fg, 0.85);
      ctx.fillText(r, 22, o.H * (0.26 + i * 0.075));
    });
    wear(ctx, o.W, o.H, o.wear * 0.4, o.seed);
    return tex(c);
  });
}
