import * as THREE from 'three';
import { LAYOUT, LOT_BOUNDS, LOT_HISTORY } from '../config/block.js';
import { Batch, wallPlane, archShape, scaleUV } from '../lib/geom.js';
import {
  brickTex,
  stoneTex,
  concreteTex,
  plasterTex,
  panelTex,
  spandrelTex,
  curtainTex,
  timberTex,
  corrugatedTex,
  windowTex,
  windowEmissiveTex,
  graffitiTex,
  posterWallTex,
  leafTex,
  mkCanvas,
  noiseRoughTex,
} from '../lib/textures.js';
import { wallAdTex, storefrontSign, makeAnimatedDisplay, placardTex } from '../lib/signs.js';
import { makeRng, mixHex, shade, hex, rgbaStr, clamp, lerp, TAU } from '../lib/util.js';
import { buildStorefront } from './storefront.js';
import { buildGasStation, buildPlaza, buildVacantLot } from './specials.js';

const L = LAYOUT;

export function facadeMap(facade, seed) {
  const grime = facade.grime ?? 0.3;
  const living = facade.living ?? 0;
  switch (facade.tex) {
    case 'brick':
      return { map: brickTex({ color: facade.color, grime, seed, living }), tile: 2 };
    case 'stone':
      return { map: stoneTex({ color: facade.color, grime, seed, living }), tile: 2.6 };
    case 'concrete':
      return { map: concreteTex({ color: facade.color, grime, seed }), tile: 3 };
    case 'panel':
      return { map: panelTex({ color: facade.color, grime, seed }), tile: 2.4 };
    case 'plaster':
      return { map: plasterTex({ color: facade.color, grime, seed }), tile: 3 };
    case 'spandrel':
      return { map: spandrelTex({ color: facade.color, mullion: facade.mullion, grime, seed }), tile: 3.35 };
    case 'curtain':
      return {
        map: curtainTex({ color: facade.color, mullion: facade.mullion, tint: 0x2d5f6b, seed }),
        tile: 3.35,
      };
    case 'timber':
      return { map: timberTex({ color: facade.color, grime, seed, living }), tile: 2.2 };
    default:
      return { map: plasterTex({ color: facade.color || 0xb0a89a, grime, seed }), tile: 3 };
  }
}

/** Build every lot for the current era. */
export function buildBlock(ctx) {
  for (const lot of LOT_BOUNDS) {
    const spec = LOT_HISTORY[lot.id][ctx.era.id];
    if (!spec) continue;
    const group = new THREE.Group();
    group.name = 'lot' + lot.id;
    ctx.root.add(group);
    const lctx = { ...ctx, root: group, lot };
    if (spec.kind === 'building') buildBuilding(lctx, lot, spec);
    else if (spec.kind === 'lot') buildVacantLot(lctx, lot, spec);
    else if (spec.kind === 'gas') buildGasStation(lctx, lot, spec);
    else if (spec.kind === 'plaza') buildPlaza(lctx, lot, spec);
  }
}

function clockTex(kind = 'analog') {
  const c = mkCanvas(256, 256);
  const g = c.getContext('2d');
  if (kind === 'digital') {
    g.fillStyle = '#050a18';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#7cf7ff';
    g.font = 'bold 64px "Courier New", monospace';
    g.textAlign = 'center';
    g.fillText('17:42', 128, 120);
    g.font = '26px "Courier New", monospace';
    g.fillText('2055.07.26', 128, 168);
  } else {
    g.fillStyle = '#e8e2d2';
    g.beginPath();
    g.arc(128, 128, 120, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a2418';
    g.lineWidth = 8;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.save();
      g.translate(128, 128);
      g.rotate(a);
      g.fillStyle = '#2a2418';
      g.fillRect(-4, -104, 8, i % 3 === 0 ? 24 : 14);
      g.restore();
    }
    g.strokeStyle = '#1a160f';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(-0.6) * 60, 128 + Math.sin(-0.6) * 60);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(2.1) * 92, 128 + Math.sin(2.1) * 92);
    g.stroke();
    if (kind === 'broken') {
      g.strokeStyle = 'rgba(40,36,30,0.85)';
      g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(128, 128);
        g.lineTo(128 + Math.cos(i * 1.1) * 120, 128 + Math.sin(i * 1.1) * 120);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
export function buildBuilding(ctx, lot, spec) {
  const { era, mats, root } = ctx;
  const rng = makeRng('bldg' + lot.id + era.id);
  const b = new Batch('bldg' + lot.id);

  const w = lot.x1 - lot.x0;
  const cx = (lot.x0 + lot.x1) / 2;
  const depth = spec.depth || L.blockDepth;
  const zFront = L.facadeZ;
  const zBack = zFront - depth;
  const cz = (zFront + zBack) / 2;
  const groundH = spec.groundH;
  const floorH = spec.floorH;
  const floors = spec.floors;
  const H = groundH + floors * floorH;

  const fm = facadeMap(spec.facade, 3 + lot.id.charCodeAt(0));
  const wallMat = mats.std({
    map: fm.map,
    roughnessMap: noiseRoughTex(5, 2),
    roughness: 0.92,
    metalness: spec.facade.tex === 'curtain' || spec.facade.tex === 'panel' ? 0.25 : 0.02,
  });
  const trimMat = mats.std({ color: spec.facade.trim, roughness: 0.78, metalness: 0.04 });
  const trimDark = mats.std({ color: shade(spec.facade.trim, -0.35), roughness: 0.8 });
  const baseCol =
    spec.facade.base === 'granite'
      ? 0x5e5c58
      : spec.facade.base === 'travertine'
      ? 0xc8bfa8
      : spec.facade.base === 'panel'
      ? 0x9aa0a2
      : spec.facade.base === 'stone'
      ? 0x9c9484
      : spec.facade.base === 'concrete'
      ? 0x9a958c
      : shade(spec.facade.color, -0.25);
  const baseMat = mats.std({ color: baseCol, roughness: 0.7, metalness: 0.05 });

  // ---- core mass --------------------------------------------------------
  b.texBox(wallMat, w, H, depth, cx, H / 2, cz, fm.tile, {
    castShadow: true,
    receiveShadow: true,
    label: spec.label,
  });
  // roof deck
  b.plane(mats.std({ color: 0x3c3a36, roughness: 0.95 }), w - 0.2, depth - 0.2, cx, H + 0.02, cz, -Math.PI / 2, 0, 0, 0, {
    receiveShadow: true,
  });

  // ---- ground-floor base course ----------------------------------------
  const baseH = Math.min(1.0, groundH * 0.2);
  b.box(baseMat, w + 0.16, baseH, depth + 0.05, cx, baseH / 2, cz + 0.02, 0, 0, 0, { castShadow: true });

  // ---- pilasters / bays -------------------------------------------------
  const bayW = spec.windowStyle === 'ribbon' || spec.windowStyle === 'curtain' ? 3.2 : 2.55;
  const cols = Math.max(2, Math.round((w - 0.9) / bayW));
  const colStep = w / cols;

  if (spec.pilasters) {
    for (let i = 0; i <= cols; i++) {
      const px = lot.x0 + i * colStep;
      const pw = i === 0 || i === cols ? 0.72 : 0.42;
      b.texBox(wallMat, pw, H - groundH * 0.4, 0.24, px, groundH * 0.7 + (H - groundH * 0.4) / 2 - 0.1, zFront + 0.12, fm.tile, {
        castShadow: true,
      });
      // capital
      b.box(trimMat, pw + 0.18, 0.22, 0.34, px, H - 0.6, zFront + 0.16, 0, 0, 0, { castShadow: true });
    }
  }
  if (spec.quoins) {
    for (const qx of [lot.x0 + 0.24, lot.x1 - 0.24]) {
      for (let y = groundH; y < H - 0.6; y += 0.9) {
        const long = ((y / 0.9) | 0) % 2 === 0;
        b.box(trimMat, long ? 0.9 : 0.6, 0.86, 0.14, qx, y + 0.43, zFront + 0.08, 0, 0, 0, { castShadow: true });
      }
    }
  }

  // ---- windows ----------------------------------------------------------
  const gl = spec.glass;
  const winStyle = spec.windowStyle;
  const nVariants = 5;
  const winMats = [];
  for (let v = 0; v < nVariants; v++) {
    const r2 = makeRng('win' + lot.id + era.id + v);
    const lit = r2() < (gl.lit ?? 0.3);
    const opts = {
      style: winStyle === 'bay' ? 'grid' : winStyle,
      frame: spec.facade.trim,
      tint: gl.tint,
      lit,
      blinds: r2() < (gl.blinds ?? 0) ? r2.range(0.12, 0.55) : 0,
      curtains: r2() < (gl.curtains ?? 0) ? r2.range(0.5, 1) : 0,
      ac: r2() < (gl.ac ?? 0),
      bars: r2() < (gl.bars ?? 0),
      boarded: r2() < (gl.boarded ?? 0),
      plant: r2() < 0.18,
      silhouette: r2() < 0.16,
      grime: spec.facade.grime ?? 0.3,
      seed: 100 + v * 7 + lot.id.charCodeAt(0),
    };
    const map = windowTex(opts);
    const m = mats.std({
      map,
      roughness: 0.22,
      metalness: 0.35,
      emissiveMap: lit ? windowEmissiveTex({ blinds: opts.blinds, boarded: opts.boarded, style: opts.style, seed: opts.seed }) : undefined,
      emissive: lit ? new THREE.Color(0xffd9a0) : undefined,
      emissiveIntensity: lit ? (era.id === '1945' ? 0.9 : era.id === '2055' ? 1.5 : 1.2) : 0,
    });
    winMats.push({ mat: m, opts });
  }

  const winW = Math.min(1.5, colStep * 0.56);
  const isRibbon = winStyle === 'ribbon' || winStyle === 'curtain';

  for (let f = 0; f < floors; f++) {
    const fy = groundH + f * floorH;
    if (isRibbon) {
      // continuous horizontal band of glazing
      const bandH = floorH * 0.62;
      const bandY = fy + floorH * 0.52;
      const pick = winMats[(f * 3) % nVariants];
      b.plane(pick.mat, w - 1.1, bandH, cx, bandY, zFront + 0.05, 0, 0, 0, 0, {
        label: 'Ribbon glazing',
      });
      // spandrel below
      b.box(trimMat, w - 1.0, floorH - bandH - 0.12, 0.1, cx, fy + (floorH - bandH) * 0.22, zFront + 0.07);
      // vertical mullions
      for (let i = 0; i <= cols; i++) {
        b.box(mats.std({ color: spec.facade.mullion || 0xcfd4d6, roughness: 0.4, metalness: 0.6 }), 0.11, bandH + 0.1, 0.16, lot.x0 + i * colStep, bandY, zFront + 0.11);
      }
      continue;
    }
    for (let i = 0; i < cols; i++) {
      const wx = lot.x0 + colStep * (i + 0.5);
      const variant = winMats[(i + f * 2 + lot.id.charCodeAt(0)) % nVariants];
      const wh = winStyle === 'bay' ? floorH * 0.74 : floorH * 0.62;
      const wy = fy + floorH * (winStyle === 'bay' ? 0.5 : 0.46);

      if (winStyle === 'bay' && i % 2 === 1) {
        // projecting bay window
        const bw = colStep * 0.8;
        b.box(mats.std({ color: spec.facade.trim, roughness: 0.6 }), bw, wh + 0.3, 0.5, wx, wy, zFront + 0.26, 0, 0, 0, { castShadow: true });
        b.plane(variant.mat, bw - 0.2, wh, wx, wy, zFront + 0.52, 0, 0, 0, 0, { label: 'Bay window' });
        b.plane(variant.mat, 0.45, wh, wx - bw / 2 + 0.02, wy, zFront + 0.28, 0, -Math.PI / 2, 0);
        b.plane(variant.mat, 0.45, wh, wx + bw / 2 - 0.02, wy, zFront + 0.28, 0, Math.PI / 2, 0);
        continue;
      }

      // reveal: dark recess, glazing set back, sill + lintel proud of the wall
      b.box(mats.std({ color: 0x14120f, roughness: 1 }), winW + 0.12, wh + 0.12, 0.16, wx, wy, zFront - 0.08);
      if (winStyle === 'arched') {
        const archH = winW * 0.5;
        const g = new THREE.ShapeGeometry(archShape(winW, wh, archH), 10);
        // remap uv from object space to 0..1
        const uv = g.attributes.uv;
        const pos = g.attributes.position;
        for (let k = 0; k < uv.count; k++) {
          uv.setXY(k, (pos.getX(k) + winW / 2) / winW, pos.getY(k) / wh);
        }
        g.translate(wx, wy - wh / 2, zFront + 0.02);
        b.addGeo(g, variant.mat, null, { label: 'Segmental-arched sash window' });
        // brick arch voussoirs
        const steps = 9;
        for (let k = 0; k <= steps; k++) {
          const a = Math.PI * (k / steps);
          const rx = Math.cos(a) * (winW / 2 + 0.11);
          const ry = Math.sin(a) * (winW / 2 + 0.11);
          b.box(trimMat, 0.19, 0.22, 0.12, wx - rx, wy - wh / 2 + (wh - archH) + ry, zFront + 0.08, 0, 0, -a + Math.PI / 2);
        }
        // keystone
        b.box(trimMat, 0.26, 0.36, 0.17, wx, wy - wh / 2 + wh + 0.1, zFront + 0.11, 0, 0, 0, { castShadow: true });
      } else {
        b.plane(variant.mat, winW, wh, wx, wy, zFront + 0.02, 0, 0, 0, 0, { label: 'Window' });
        // lintel
        b.box(trimMat, winW + 0.34, 0.16, 0.14, wx, wy + wh / 2 + 0.1, zFront + 0.08, 0, 0, 0, { castShadow: true });
      }
      // stone sill
      b.box(trimMat, winW + 0.4, 0.12, 0.26, wx, wy - wh / 2 - 0.08, zFront + 0.12, 0, 0, 0, { castShadow: true });
      // window AC unit sticking out (1985 especially)
      if (variant.opts.ac) {
        b.box(mats.std({ color: 0xb9b6ad, roughness: 0.65, metalness: 0.3 }), winW * 0.66, 0.34, 0.42, wx, wy - wh / 2 + 0.2, zFront + 0.26, 0, 0, 0, {
          castShadow: true,
          label: 'Window air-conditioner',
        });
        b.box(mats.std({ color: 0x6f6c66, roughness: 0.8 }), winW * 0.66, 0.05, 0.06, wx, wy - wh / 2 + 0.02, zFront + 0.3);
      }
      // flower box
      if (rng() < (gl.flowerBox ?? 0)) {
        b.box(mats.std({ color: 0x6b4a2c, roughness: 0.9 }), winW * 0.8, 0.2, 0.28, wx, wy - wh / 2 - 0.18, zFront + 0.24, 0, 0, 0, { castShadow: true });
        const leafMat = mats.cutout({ map: leafTex(0x4a8c3f, 5 + i), color: 0xffffff });
        b.plane(leafMat, winW * 0.9, 0.5, wx, wy - wh / 2 - 0.02, zFront + 0.26, 0, 0, 0);
      }
    }
    // belt course between floors on masonry buildings
    if ((spec.facade.tex === 'brick' || spec.facade.tex === 'stone') && f > 0) {
      b.box(trimMat, w + 0.1, 0.12, 0.14, cx, fy - 0.02, zFront + 0.08);
    }
  }

  // ---- solar shading fins (2025+ towers) --------------------------------
  if (spec.facade.fins) {
    const finMat = mats.std({ color: 0xb8c2c8, roughness: 0.45, metalness: 0.7 });
    for (let f = 0; f < floors; f++) {
      const fy = groundH + f * floorH;
      for (let i = 0; i <= cols; i++) {
        b.box(finMat, 0.08, floorH * 0.8, 0.55, lot.x0 + i * colStep, fy + floorH * 0.5, zFront + 0.4, 0, 0, 0, { castShadow: true });
      }
      b.box(finMat, w, 0.1, 0.7, cx, fy + floorH * 0.92, zFront + 0.45, 0, 0, 0, { castShadow: true });
    }
  }

  // ---- balconies (2025 timber infill) ----------------------------------
  if (spec.balconies) {
    const slabMat = mats.std({ color: 0x8d8c88, roughness: 0.8 });
    const railMat = mats.std({ color: 0x2f3134, roughness: 0.5, metalness: 0.6 });
    for (let f = 0; f < floors; f++) {
      if (f % 2 === 1) continue;
      const fy = groundH + f * floorH;
      const bw = w * 0.44;
      const bx = f % 4 === 0 ? lot.x0 + bw * 0.6 : lot.x1 - bw * 0.6;
      b.box(slabMat, bw, 0.16, 1.5, bx, fy + 0.08, zFront + 0.75, 0, 0, 0, { castShadow: true, label: 'Balcony' });
      for (let k = 0; k <= 8; k++) {
        b.box(railMat, 0.05, 1.05, 0.05, bx - bw / 2 + (k * bw) / 8, fy + 0.6, zFront + 1.48);
      }
      b.box(railMat, bw, 0.06, 0.06, bx, fy + 1.12, zFront + 1.48);
      b.box(railMat, 0.05, 1.05, 1.5, bx - bw / 2, fy + 0.6, zFront + 0.75);
      b.box(railMat, 0.05, 1.05, 1.5, bx + bw / 2, fy + 0.6, zFront + 0.75);
      // clutter: a chair and a plant
      if (rng() < 0.7) {
        b.box(mats.std({ color: mixHex(0x8899aa, 0xffffff, rng() * 0.4), roughness: 0.8 }), 0.5, 0.06, 0.5, bx - bw * 0.25, fy + 0.5, zFront + 1.0);
        b.plane(mats.cutout({ map: leafTex(0x3f7a3a, 12) }), 0.7, 0.8, bx + bw * 0.28, fy + 0.6, zFront + 1.0, 0, 0, 0);
      }
    }
  }

  // ---- living facade (2055) -------------------------------------------
  if (spec.facade.living) {
    const vineMat = mats.cutout({ map: leafTex(0x3f7a3a, 21), color: 0x9fd08a });
    for (let f = 0; f < floors; f++) {
      const fy = groundH + f * floorH;
      for (let i = 0; i < cols; i++) {
        if ((i + f) % 2) continue;
        b.plane(vineMat, colStep * 0.7, floorH * 0.8, lot.x0 + colStep * (i + 0.5), fy + floorH * 0.5, zFront + 0.3, 0, 0, 0);
      }
      b.box(mats.std({ color: 0x4a5148, roughness: 0.9 }), w - 0.6, 0.24, 0.4, cx, fy + 0.14, zFront + 0.28, 0, 0, 0, { castShadow: true });
    }
  }

  // ---- slipcover (1958 metal facade over the old brick) -----------------
  if (spec.slipcover) {
    const sc = spec.slipcover;
    const scMat = mats.std({
      map: panelTex({ color: sc.color, pattern: sc.pattern, damage: sc.damage || 0, seed: 42 }),
      roughness: 0.42,
      metalness: 0.45,
    });
    const y0 = groundH - 0.3;
    const scH = H - y0 - 0.1;
    b.texBox(scMat, w + 0.3, scH, 0.5, cx, y0 + scH / 2, zFront + 0.3, 2.4, {
      castShadow: true,
      receiveShadow: true,
      label: 'Metal slipcover facade — hides the 1897 brickwork behind',
    });
    // its own thin cornice
    b.box(mats.std({ color: shade(sc.color, -0.3), roughness: 0.5, metalness: 0.5 }), w + 0.5, 0.3, 0.7, cx, y0 + scH + 0.12, zFront + 0.4, 0, 0, 0, { castShadow: true });
    if (sc.damage > 0.3) {
      // a panel has fallen away, revealing brick + an old window
      const px = lot.x0 + w * 0.34;
      b.plane(mats.std({ map: brickTex({ color: 0x7d4a35, grime: 0.9, seed: 8 }), roughness: 0.95 }), colStep * 0.9, floorH * 0.9, px, y0 + scH * 0.55, zFront + 0.29, 0, 0, 0, 2);
      b.plane(winMats[2].mat, winW, floorH * 0.5, px, y0 + scH * 0.5, zFront + 0.3, 0, 0, 0);
    }
  }

  // ---- cornice ---------------------------------------------------------
  buildCornice(b, spec, mats, { cx, w, zFront, H, depth, cz, trimMat, trimDark, wallMat, tile: fm.tile });

  // ---- rooftop addition (2049 glass cap / lattice extension) ------------
  let roofY = H;
  if (spec.addition) {
    const ad = spec.addition;
    const inset = ad.inset;
    const aH = ad.floors * (floorH * 0.95);
    const glassMat = mats.glass({
      color: ad.tint,
      opacity: 0.55,
      roughness: 0.05,
      metalness: 0.7,
      emissive: 0x25406b,
      emissiveIntensity: era.id === '2055' ? 0.55 : 0.15,
    });
    const frameMat = mats.std({ color: 0xd8dee2, roughness: 0.35, metalness: 0.8 });
    b.box(glassMat, w - inset * 2, aH, depth - inset * 2, cx, H + aH / 2 + 0.2, cz, 0, 0, 0, {
      castShadow: true,
      label: ad.style === 'lattice' ? 'Vertical extension (2041)' : 'Rooftop glass addition (2049)',
    });
    for (let f = 0; f <= ad.floors; f++) {
      b.box(frameMat, w - inset * 2 + 0.14, 0.16, depth - inset * 2 + 0.14, cx, H + 0.2 + f * (floorH * 0.95), cz);
    }
    const nv = Math.max(2, Math.round((w - inset * 2) / 2.4));
    for (let i = 0; i <= nv; i++) {
      b.box(frameMat, 0.1, aH, 0.1, lot.x0 + inset + ((w - inset * 2) * i) / nv, H + aH / 2 + 0.2, zFront - inset);
    }
    if (ad.style === 'lattice') {
      const latMat = mats.std({ color: 0x5f6f86, roughness: 0.5, metalness: 0.5 });
      for (let i = 0; i <= nv; i++) {
        for (let f = 0; f < ad.floors; f++) {
          b.box(latMat, 0.12, 0.12, 3.1, lot.x0 + inset + ((w - inset * 2) * i) / nv, H + 0.2 + (f + 0.5) * floorH * 0.95, zFront - inset + 0.2, 0.6, 0, 0);
        }
      }
    }
    roofY = H + aH + 0.2;
  }

  // ---- fire escape -----------------------------------------------------
  if (spec.fireEscape) buildFireEscape(b, mats, { lot, spec, groundH, floorH, floors, zFront, retrofit: spec.fireEscape === 'retrofit' });

  // ---- laundry lines (1945 tenement) ----------------------------------
  if (spec.laundryLines) {
    const lineMat = mats.std({ color: 0xcfc8b8, roughness: 0.9 });
    const clothMat = (c2) => mats.cutout({ color: c2, roughness: 0.95, side: THREE.DoubleSide });
    for (let f = 1; f < floors; f++) {
      const y = groundH + f * floorH + floorH * 0.7;
      b.box(lineMat, 0.03, 0.03, 5.5, lot.x1 - 0.4, y, zBack + 2.6);
      for (let k = 0; k < 5; k++) {
        b.plane(
          clothMat(mixHex(0xf0ece0, [0x9bb7d4, 0xd8a0a0, 0xe8dcc0][k % 3], 0.6)),
          0.42,
          0.6,
          lot.x1 - 0.4,
          y - 0.34,
          zBack + 0.8 + k * 1.05,
          0,
          Math.PI / 2,
          0
        );
      }
    }
  }

  // ---- scaffolding (2005 restoration) ---------------------------------
  if (spec.scaffold) {
    const tube = mats.std({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.7 });
    const plank = mats.std({ color: 0xb59468, roughness: 0.9 });
    const mesh = mats.std({
      color: 0x2f5d8a,
      transparent: true,
      opacity: 0.32,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const lifts = Math.floor((H - groundH) / 2) + 1;
    for (let i = 0; i <= Math.round(w / 2.2); i++) {
      const px = lot.x0 + 0.3 + (i * (w - 0.6)) / Math.round(w / 2.2);
      b.cyl(tube, 0.05, H - 0.4, px, (H - 0.4) / 2, zFront + 1.1, 8);
      b.cyl(tube, 0.05, H - 0.4, px, (H - 0.4) / 2, zFront + 0.35, 8);
    }
    for (let li = 1; li <= lifts; li++) {
      const y = groundH + (li - 1) * 2;
      if (y > H - 1) break;
      b.box(tube, w - 0.4, 0.06, 0.06, cx, y, zFront + 1.1);
      b.box(tube, w - 0.4, 0.06, 0.06, cx, y + 1, zFront + 1.1);
      b.box(plank, w - 0.5, 0.06, 0.9, cx, y + 0.05, zFront + 0.72, 0, 0, 0, { castShadow: true });
      b.plane(mesh, w - 0.4, 2, cx, y + 1, zFront + 1.16, 0, 0, 0);
    }
    b.box(plank, w + 0.6, 0.1, 2.2, cx, groundH * 0.62, zFront + 0.9, 0, 0, 0, { castShadow: true, label: 'Sidewalk shed' });
  }

  // ---- clock ------------------------------------------------------------
  if (spec.clock) {
    const cm = mats.std({
      map: clockTex(spec.clock === 'broken' ? 'broken' : spec.clock === 'digital' ? 'digital' : 'analog'),
      roughness: 0.4,
      metalness: 0.2,
      emissive: spec.clock === 'digital' ? new THREE.Color(0x7cf7ff) : undefined,
      emissiveIntensity: spec.clock === 'digital' ? 0.7 : 0,
    });
    const cyY = H - 1.3;
    b.cyl(mats.std({ color: shade(spec.facade.trim, -0.2), roughness: 0.6 }), 0.9, 0.22, cx, cyY, zFront + 0.2, 20, Math.PI / 2, 0, 0, { castShadow: true });
    b.plane(cm, 1.5, 1.5, cx, cyY, zFront + 0.32, 0, 0, 0, 0, { label: 'Facade clock' });
  }

  // ---- flag / bunting --------------------------------------------------
  if (spec.flag) {
    const poleMat = mats.std({ color: 0x8d8b84, roughness: 0.5, metalness: 0.5 });
    b.cyl(poleMat, 0.06, 3.4, cx + w * 0.3, groundH + 1.4, zFront + 1.2, 8, 0, 0, -0.9, { castShadow: true });
    const flagMat =
      spec.flag === 'usa'
        ? mats.cutout({ color: 0xb22234, side: THREE.DoubleSide, roughness: 0.9 })
        : mats.cutout({ color: 0xc9483c, side: THREE.DoubleSide, roughness: 0.9 });
    b.plane(flagMat, 1.5, 0.9, cx + w * 0.3 + 1.5, groundH + 2.5, zFront + 1.2, 0, 0.2, 0.06, 0, { label: 'Flag' });
    if (spec.flag === 'bunting') {
      // victory bunting swagged under the cornice
      const cols = [0xb22234, 0xf2f0e6, 0x2b4c8c];
      const n = Math.max(4, Math.round(w / 1.4));
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const bx = lot.x0 + 0.4 + t * (w - 0.8);
        const sag = Math.sin(t * Math.PI * n * 0.5) * 0.0;
        b.plane(
          mats.cutout({ color: cols[i % 3], side: THREE.DoubleSide, roughness: 0.95 }),
          w / n,
          0.75,
          bx,
          H - 1.1 - sag,
          zFront + 0.34,
          0,
          0,
          0,
          0,
          { label: 'Victory bunting' }
        );
      }
    }
  }

  // ---- wall advertisement ----------------------------------------------
  if (spec.wallSign) buildWallSign(ctx, b, { lot, spec, H, groundH, floorH, floors, zFront, depth });

  // ---- storefronts ------------------------------------------------------
  let sx = lot.x0;
  for (const sf of spec.storefronts || []) {
    const sw = w * (sf.width ?? 1);
    buildStorefront({ ...ctx, batch: b }, { x0: sx + 0.18, x1: sx + sw - 0.18, groundH, zFront, spec, sf, lotId: lot.id });
    sx += sw;
  }

  // ---- roof clutter -----------------------------------------------------
  buildRoof(ctx, b, { lot, spec, roofY, w, depth, cx, cz, zFront, zBack, rng });

  b.build(root, { castShadow: true, receiveShadow: true });
}

// ---------------------------------------------------------------------------
function buildCornice(b, spec, mats, o) {
  const { cx, w, zFront, H, depth, cz, trimMat, trimDark, wallMat, tile } = o;
  const kind = spec.cornice;
  const proj = { heavy: 0.75, bracketed: 0.6, simple: 0.34, parapet: 0.12, flat: 0.1, deco: 0.5 }[kind] ?? 0.2;
  if (kind === 'parapet' || kind === 'flat') {
    // simple coping around the roof
    b.box(trimMat, w + 0.2, kind === 'parapet' ? 1.0 : 0.5, 0.3, cx, H + (kind === 'parapet' ? 0.5 : 0.25), zFront + 0.05, 0, 0, 0, { castShadow: true });
    b.box(trimDark, w + 0.3, 0.14, 0.42, cx, H + (kind === 'parapet' ? 1.0 : 0.5), zFront + 0.06, 0, 0, 0, { castShadow: true });
    // side parapets
    for (const sxx of [cx - w / 2, cx + w / 2]) {
      b.box(trimMat, 0.24, kind === 'parapet' ? 1.0 : 0.5, depth, sxx, H + (kind === 'parapet' ? 0.5 : 0.25), cz, 0, 0, 0, { castShadow: true });
    }
    return;
  }
  // main cornice band
  b.box(trimMat, w + proj * 0.6, 0.3, 0.3 + proj * 0.5, cx, H - 0.75, zFront + proj * 0.25, 0, 0, 0, { castShadow: true });
  b.box(trimMat, w + proj * 1.4, 0.42, 0.3 + proj, cx, H - 0.4, zFront + proj * 0.5, 0, 0, 0, { castShadow: true });
  b.box(trimDark, w + proj * 1.5, 0.16, 0.34 + proj, cx, H - 0.12, zFront + proj * 0.5, 0, 0, 0, { castShadow: true });
  // dentils / modillions
  if (kind === 'heavy' || kind === 'deco') {
    const n = Math.floor(w / 0.42);
    for (let i = 0; i < n; i++) {
      b.box(trimMat, 0.2, 0.2, 0.3 + proj * 0.8, cx - w / 2 + 0.21 + i * 0.42, H - 0.62, zFront + proj * 0.45);
    }
  }
  if (kind === 'bracketed') {
    const n = Math.max(3, Math.floor(w / 1.5));
    for (let i = 0; i <= n; i++) {
      const bxp = cx - w / 2 + (i * w) / n;
      b.box(trimMat, 0.2, 0.7, 0.24 + proj, bxp, H - 0.85, zFront + proj * 0.5, 0, 0, 0, { castShadow: true });
      b.box(trimMat, 0.28, 0.2, 0.3 + proj, bxp, H - 0.52, zFront + proj * 0.55);
    }
  }
  // parapet wall above the cornice
  b.texBox(wallMat, w, 0.9, 0.34, cx, H + 0.45, zFront - 0.05, tile, { castShadow: true });
  b.box(trimMat, w + 0.2, 0.16, 0.44, cx, H + 0.95, zFront - 0.02, 0, 0, 0, { castShadow: true });
  if (kind === 'deco' || kind === 'heavy') {
    // centre cartouche
    b.box(trimMat, 1.4, 0.7, 0.2, cx, H + 0.55, zFront + 0.14, 0, 0, 0, { castShadow: true });
  }
  for (const sxx of [cx - w / 2, cx + w / 2]) {
    b.box(trimMat, 0.24, 0.9, depth, sxx, H + 0.45, cz, 0, 0, 0, { castShadow: true });
  }
}

// ---------------------------------------------------------------------------
function buildFireEscape(b, mats, o) {
  const { lot, spec, groundH, floorH, floors, zFront, retrofit } = o;
  const steel = mats.std({ color: retrofit ? 0x707880 : 0x2f2a26, roughness: 0.62, metalness: 0.72 });
  const rust = mats.std({ color: retrofit ? 0x8a929a : 0x5a3a26, roughness: 0.9, metalness: 0.3 });
  const x = lot.x0 + (lot.x1 - lot.x0) * 0.62;
  const pw = 2.5;
  const pd = 1.15;
  for (let f = 0; f < floors; f++) {
    const y = groundH + f * floorH;
    // platform grating
    b.box(steel, pw, 0.07, pd, x, y + 0.05, zFront + pd / 2 + 0.05, 0, 0, 0, { castShadow: true, label: 'Fire escape' });
    for (let i = 0; i < 7; i++) {
      b.box(rust, pw, 0.03, 0.05, x, y + 0.1, zFront + 0.2 + i * 0.15);
    }
    // railings
    for (const zz of [zFront + pd + 0.05]) {
      b.box(steel, pw, 0.05, 0.05, x, y + 1.0, zz);
      b.box(steel, pw, 0.05, 0.05, x, y + 0.55, zz);
      for (let i = 0; i <= 6; i++) b.box(steel, 0.04, 1.0, 0.04, x - pw / 2 + (i * pw) / 6, y + 0.5, zz);
    }
    for (const sxx of [x - pw / 2, x + pw / 2]) {
      b.box(steel, 0.05, 0.05, pd, sxx, y + 1.0, zFront + pd / 2 + 0.05);
      b.box(steel, 0.05, 1.0, 0.05, sxx, y + 0.5, zFront + pd + 0.05);
      b.box(steel, 0.05, 1.0, 0.05, sxx, y + 0.5, zFront + 0.08);
    }
    // stair flight up to the next platform
    if (f < floors - 1) {
      const len = Math.sqrt(floorH * floorH + 1.4 * 1.4);
      const ang = Math.atan2(floorH, 1.4);
      b.box(steel, 0.85, 0.06, len, x + (f % 2 ? pw * 0.28 : -pw * 0.28), y + floorH / 2 + 0.1, zFront + pd * 0.55, ang - Math.PI / 2, 0, 0, { castShadow: true });
      const steps = 9;
      for (let s2 = 0; s2 < steps; s2++) {
        const t = s2 / steps;
        b.box(rust, 0.8, 0.04, 0.16, x + (f % 2 ? pw * 0.28 : -pw * 0.28), y + 0.12 + t * floorH, zFront + pd * 0.95 - t * 0.75);
      }
      b.box(steel, 0.04, 0.04, len, x + (f % 2 ? pw * 0.28 + 0.42 : -pw * 0.28 - 0.42), y + floorH / 2 + 0.65, zFront + pd * 0.55, ang - Math.PI / 2, 0, 0);
    }
    // drop ladder at the bottom
    if (f === 0) {
      for (let i = 0; i < 8; i++) {
        b.box(steel, 0.6, 0.04, 0.04, x, groundH - 0.4 - i * 0.36, zFront + pd * 0.8);
      }
      for (const sxx of [-0.3, 0.3]) b.box(steel, 0.05, groundH * 0.6, 0.05, x + sxx, groundH - 1.4, zFront + pd * 0.8);
    }
  }
}

// ---------------------------------------------------------------------------
function buildWallSign(ctx, b, o) {
  const { mats, era } = ctx;
  const { lot, spec, H, groundH, floorH, floors, zFront, depth } = o;
  const ws = spec.wallSign;
  const w = lot.x1 - lot.x0;
  const isSide = ws.side === 'west' || ws.side === 'east';
  const adW = isSide ? Math.min(depth * 0.7, 14) : Math.min(w * 0.88, 11);
  const adH = Math.min(adW * 0.62, (H - groundH) * 0.66);

  const sign = wallAdTex({
    kind: ws.kind === 'graffiti' ? 'graffiti' : ws.kind,
    text: ws.text,
    sub: ws.sub,
    bg: ws.bg,
    fg: ws.fg,
    accent: ws.accent ?? 0xffd23f,
    wear: ws.wear ?? 0.3,
    seed: 5 + lot.id.charCodeAt(0),
    W: 768,
    H: Math.round((768 * adH) / adW),
  });

  const isHolo = ws.kind === 'holo';
  const mat = isHolo
    ? mats.holoMaterial(sign.map, ws.fg, 1.35)
    : mats.signMaterial(sign, { glowScale: ws.kind === 'led' ? 1.4 : 1 });

  const y = ws.side === 'front-upper' ? H - adH / 2 - 1.6 : groundH + (H - groundH) * 0.52;

  if (isSide) {
    const x = ws.side === 'west' ? lot.x0 - 0.06 : lot.x1 + 0.06;
    const ry = ws.side === 'west' ? -Math.PI / 2 : Math.PI / 2;
    b.plane(mat, adW, adH, x, y, zFront - depth * 0.45, 0, ry, 0, 0, {
      label: labelForAd(ws, era),
      castShadow: false,
    });
    if (ws.kind === 'billboard' || ws.kind === 'billboard-lit' || ws.kind === 'led') {
      const fr = mats.std({ color: 0x2e2c28, roughness: 0.7, metalness: 0.4 });
      b.box(fr, 0.18, adH + 0.35, adW + 0.35, x + (ws.side === 'west' ? -0.12 : 0.12), y, zFront - depth * 0.45, 0, 0, 0, { castShadow: true });
    }
  } else {
    b.plane(mat, adW, adH, (lot.x0 + lot.x1) / 2, y, zFront + 0.09, 0, 0, 0, 0, {
      label: labelForAd(ws, era),
    });
    if (ws.kind === 'billboard' || ws.kind === 'billboard-lit' || ws.kind === 'led') {
      const fr = mats.std({ color: 0x2e2c28, roughness: 0.7, metalness: 0.4 });
      b.box(fr, adW + 0.4, adH + 0.4, 0.2, (lot.x0 + lot.x1) / 2, y, zFront + 0.02, 0, 0, 0, { castShadow: true });
      // gooseneck lamps
      if (ws.kind === 'billboard-lit') {
        for (let i = -1; i <= 1; i++) {
          const gx = (lot.x0 + lot.x1) / 2 + i * adW * 0.34;
          b.cyl(fr, 0.05, 1.1, gx, y + adH / 2 + 0.5, zFront + 0.5, 8, 0.7, 0, 0);
          b.cyl(mats.glow({ color: 0x2a2a2a, emissive: 0xfff1c8, emissiveIntensity: 2.2 }), 0.17, 0.2, gx, y + adH / 2 + 0.85, zFront + 0.95, 10, Math.PI / 2 + 0.6, 0, 0);
        }
      }
    }
  }

  // an LED media wall gets a live animated texture
  if (ws.kind === 'led') {
    const disp = makeAnimatedDisplay({
      W: 512,
      H: Math.round((512 * adH) / adW),
      kind: 'led',
      accent: ws.fg,
      lines: [ws.text.replace('\n', ' '), ws.sub],
      fps: 14,
      seed: 9,
    });
    const dm = mats.std({
      map: disp.texture,
      emissiveMap: disp.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.9,
      roughness: 0.5,
      toneMapped: true,
    });
    b.plane(dm, adW - 0.1, adH - 0.1, (lot.x0 + lot.x1) / 2, y, zFront + 0.14, 0, 0, 0, 0, {
      label: 'LED media wall — 6 mm pitch',
    });
    ctx.animated.push(disp);
  }
  if (isHolo) {
    // emitter bar + volumetric haze card
    const em = mats.glow({ color: 0x1a2440, emissive: ws.fg, emissiveIntensity: 2.4 });
    if (isSide) {
      const x = ws.side === 'west' ? lot.x0 - 0.2 : lot.x1 + 0.2;
      b.box(em, 0.14, 0.14, adW, x, y - adH / 2 - 0.4, zFront - depth * 0.45);
    } else {
      b.box(em, adW, 0.14, 0.14, (lot.x0 + lot.x1) / 2, y - adH / 2 - 0.4, zFront + 0.4);
    }
    ctx.holos.push({ mat, base: 1.35, seed: Math.random() * 10 });
  }
}

function labelForAd(ws, era) {
  const kindName = {
    painted: 'Hand-painted wall advertisement',
    ghost: 'Ghost sign — fading painted ad',
    billboard: 'Pasted paper billboard',
    'billboard-lit': 'Floodlit billboard',
    led: 'LED media wall',
    holo: 'Volumetric holographic advertisement',
    graffiti: 'Graffiti piece',
    mural: 'Commissioned mural',
  }[ws.kind];
  return `${kindName} (${era.year})`;
}

// ---------------------------------------------------------------------------
function buildRoof(ctx, b, o) {
  const { mats, era } = ctx;
  const { lot, spec, roofY, w, depth, cx, cz, zFront, zBack, rng } = o;
  const r = spec.roof;
  if (!r) return;
  const metal = mats.std({ color: 0x8a8680, roughness: 0.55, metalness: 0.6 });
  const dark = mats.std({ color: 0x3f3c37, roughness: 0.8, metalness: 0.2 });
  const wood = mats.std({ color: 0x6b5238, roughness: 0.95 });

  // water tower
  if (r.waterTower) {
    const restored = r.waterTower === 'restored';
    const tx = cx - w * 0.22;
    const tz = cz - depth * 0.12;
    const legH = 2.6;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      b.box(dark, 0.16, legH, 0.16, tx + dx * 1.15, roofY + legH / 2, tz + dz * 1.15, 0, 0, 0, { castShadow: true });
      b.box(dark, 3.3, 0.1, 0.1, tx, roofY + legH * 0.55, tz + dz * 1.15, 0, 0, 0);
      b.box(dark, 0.1, 0.1, 3.3, tx + dx * 1.15, roofY + legH * 0.55, tz, 0, 0, 0);
    }
    const tankMat = restored
      ? mats.std({ color: 0x8a6b46, roughness: 0.75 })
      : mats.std({ color: 0x5c4530, roughness: 0.95 });
    b.cyl(tankMat, 1.5, 3.2, tx, roofY + legH + 1.6, tz, 18, 0, 0, 0, {
      castShadow: true,
      label: restored ? 'Restored 1920s water tower (decorative)' : 'Rooftop water tank — riveted redwood staves',
    });
    // hoops
    for (const hy of [0.5, 1.6, 2.7]) {
      b.cyl(metal, 1.54, 0.08, tx, roofY + legH + hy, tz, 18);
    }
    b.cyl(mats.std({ color: 0x4a4643, roughness: 0.7, metalness: 0.5 }), 1.62, 0.9, tx, roofY + legH + 3.5, tz, 18, 0, 0, 0, { castShadow: true });
    b.cyl(metal, 0.1, 3.6, tx + 1.2, roofY + legH + 1.6, tz + 1.2, 8);
    if (restored) {
      ctx.lightsWanted.push({ type: 'point', color: 0x8fd7ff, intensity: 4, dist: 9, pos: [tx, roofY + legH + 3.9, tz] });
    }
  }

  // extra tanks / bulkhead / stair head
  if (r.bulkhead) {
    b.texBox(mats.std({ map: brickTex({ color: shade(spec.facade.color, -0.1), grime: 0.6, seed: 33 }), roughness: 0.95 }), 3.2, 2.4, 3.0, cx + w * 0.24, roofY + 1.2, cz + depth * 0.16, 2, {
      castShadow: true,
      label: 'Stair bulkhead',
    });
    b.box(dark, 3.4, 0.14, 3.2, cx + w * 0.24, roofY + 2.45, cz + depth * 0.16, 0, 0, 0, { castShadow: true });
    b.box(mats.std({ color: 0x6d5030, roughness: 0.9 }), 0.9, 1.9, 0.1, cx + w * 0.24, roofY + 0.95, cz + depth * 0.16 + 1.55);
  }
  for (let i = 0; i < (r.tanks || 0); i++) {
    b.cyl(metal, 0.5, 1.3, cx + rng.range(-w * 0.3, w * 0.3), roofY + 0.65, cz + rng.range(-depth * 0.3, depth * 0.3), 12, 0, 0, 0, { castShadow: true, label: 'Water storage tank' });
  }

  // AC / mechanical plant
  for (let i = 0; i < (r.ac || 0); i++) {
    const ax = cx + rng.range(-w * 0.36, w * 0.36);
    const az = cz + rng.range(-depth * 0.36, depth * 0.36);
    const aw = rng.range(1.1, 2.0);
    b.box(mats.std({ color: 0xb0aca4, roughness: 0.7, metalness: 0.35 }), aw, 0.85, aw * 0.8, ax, roofY + 0.42, az, 0, 0, 0, {
      castShadow: true,
      label: 'Packaged rooftop HVAC unit',
    });
    b.cyl(dark, aw * 0.3, 0.12, ax, roofY + 0.9, az, 12);
    for (let k = 0; k < 5; k++) b.box(dark, aw, 0.04, 0.04, ax, roofY + 0.2 + k * 0.14, az + aw * 0.41);
    b.box(dark, 0.5, 0.3, 0.5, ax + aw * 0.7, roofY + 0.15, az, 0, 0, 0);
  }
  for (let i = 0; i < (r.vents || 0); i++) {
    const vx = cx + rng.range(-w * 0.4, w * 0.4);
    const vz = cz + rng.range(-depth * 0.4, depth * 0.4);
    b.cyl(metal, 0.18, 0.9, vx, roofY + 0.45, vz, 10, 0, 0, 0, { castShadow: true });
    b.cyl(metal, 0.3, 0.18, vx, roofY + 0.95, vz, 10);
    b.cyl(dark, 0.1, 1.6, vx + 0.8, roofY + 0.8, vz + 0.5, 8, 0, 0, 0);
  }

  // TV aerials
  for (let i = 0; i < (r.antennas || 0); i++) {
    const ax = cx + rng.range(-w * 0.42, w * 0.42);
    const az = cz + rng.range(-depth * 0.42, depth * 0.42);
    const hh = rng.range(1.8, 3.6);
    b.cyl(metal, 0.035, hh, ax, roofY + hh / 2, az, 6, 0, 0, 0, { castShadow: false, label: 'Television aerial' });
    const nEl = Math.floor(rng.range(3, 7));
    for (let k = 0; k < nEl; k++) {
      const y = roofY + hh * (0.45 + (k / nEl) * 0.5);
      const len = 1.6 - (k / nEl) * 0.9;
      b.box(metal, len, 0.025, 0.025, ax, y, az, 0, rng.range(0, 1.2), 0);
    }
    b.box(metal, 0.5, 0.05, 0.5, ax, roofY + 0.05, az);
  }

  // satellite dishes
  for (let i = 0; i < (r.dishes || 0); i++) {
    const ax = cx + rng.range(-w * 0.4, w * 0.4);
    const az = cz + rng.range(-depth * 0.4, depth * 0.4);
    const dr = rng.range(0.45, 0.95);
    b.cyl(mats.std({ color: 0xd8d4cc, roughness: 0.6 }), dr, 0.1, ax, roofY + 1.0, az, 16, 1.0, rng.range(-0.6, 0.6), 0, {
      castShadow: true,
      label: 'Satellite dish',
    });
    b.cyl(dark, 0.06, 1.0, ax, roofY + 0.5, az, 8);
    b.cyl(dark, 0.05, dr * 0.9, ax, roofY + 1.1, az + dr * 0.4, 6, 0.8, 0, 0);
  }

  // solar
  for (let i = 0; i < (r.solar || 0); i++) {
    const ax = cx - w * 0.4 + (i % 3) * (w * 0.3);
    const az = cz - depth * 0.3 + Math.floor(i / 3) * 2.6;
    b.box(mats.std({ color: 0x1b2b45, roughness: 0.22, metalness: 0.55, emissive: new THREE.Color(0x0a1830), emissiveIntensity: 0.3 }), w * 0.26, 0.06, 1.8, ax, roofY + 0.6, az, -0.42, 0, 0, {
      castShadow: true,
      label: 'Photovoltaic array',
    });
    b.box(metal, 0.06, 0.55, 0.06, ax, roofY + 0.28, az + 0.7);
    b.box(metal, 0.06, 0.3, 0.06, ax, roofY + 0.15, az - 0.7);
  }

  // roof garden
  if (r.garden) {
    const soil = mats.std({ color: 0x4a3a2a, roughness: 0.98 });
    const planter = mats.std({ color: 0x8d8579, roughness: 0.9 });
    for (let i = 0; i < r.garden; i++) {
      const ax = cx - w * 0.38 + (i % 3) * (w * 0.36);
      const az = cz + depth * 0.1 + Math.floor(i / 3) * 2.2;
      b.box(planter, 1.9, 0.5, 1.1, ax, roofY + 0.25, az, 0, 0, 0, { castShadow: true });
      b.box(soil, 1.7, 0.1, 0.95, ax, roofY + 0.5, az);
      const lm = mats.cutout({ map: leafTex(0x4a8c3f, 30 + i) });
      b.plane(lm, 1.7, 1.1, ax, roofY + 0.95, az, 0, 0, 0);
      b.plane(lm, 1.7, 1.1, ax, roofY + 0.95, az, 0, Math.PI / 2, 0);
    }
  }

  // drone pad
  if (r.pad) {
    const padMat = mats.std({ color: 0x22283c, roughness: 0.7 });
    const lineMat = mats.glow({ color: 0x0d1526, emissive: 0x7cf7ff, emissiveIntensity: 2.4 });
    const px = cx;
    const pz = cz - depth * 0.28;
    b.cyl(padMat, 2.4, 0.12, px, roofY + 0.06, pz, 24, 0, 0, 0, { castShadow: true, label: 'Autonomous freight landing pad' });
    b.cyl(lineMat, 2.42, 0.03, px, roofY + 0.13, pz, 24);
    b.cyl(padMat, 1.5, 0.05, px, roofY + 0.15, pz, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.box(lineMat, 0.5, 0.04, 0.12, px + Math.cos(a) * 1.9, roofY + 0.16, pz + Math.sin(a) * 1.9, 0, -a, 0);
    }
    ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 8, dist: 12, pos: [px, roofY + 1.2, pz] });
  }

  // holo emitter mast
  if (r.holo) {
    const em = mats.glow({ color: 0x1a2440, emissive: 0x9f8cff, emissiveIntensity: 2.2 });
    b.cyl(mats.std({ color: 0x3a4358, roughness: 0.5, metalness: 0.6 }), 0.12, 3.4, cx + w * 0.34, roofY + 1.7, cz - depth * 0.4, 8, 0, 0, 0, { castShadow: true });
    b.sphere(em, 0.22, cx + w * 0.34, roofY + 3.5, cz - depth * 0.4, 12);
    ctx.lightsWanted.push({ type: 'point', color: 0x9f8cff, intensity: 6, dist: 14, pos: [cx + w * 0.34, roofY + 3.6, cz - depth * 0.4] });
  }

  // roof sign (the Progress Building's letters)
  if (r.sign) {
    const sign = storefrontSign({
      kind: era.id === '1985' ? 'plastic-lit' : 'plastic',
      name: r.sign,
      sub: '',
      color: era.id === '1985' ? 0x2b2f33 : 0x1f3f6b,
      accent: era.id === '1985' ? 0xd8d2c0 : 0xffffff,
      wear: era.id === '1985' ? 0.5 : 0.1,
      seed: 3,
      W: 1024,
      H: 256,
    });
    const sw = Math.min(w * 0.8, 9);
    const sh = sw * 0.25;
    const frame = mats.std({ color: 0x3a3733, roughness: 0.7, metalness: 0.5 });
    // lattice support
    for (let i = 0; i <= 4; i++) {
      b.box(frame, 0.09, sh + 1.6, 0.09, cx - sw / 2 + (i * sw) / 4, roofY + sh / 2 + 0.8, cz - depth * 0.44);
    }
    b.box(frame, sw, 0.1, 0.1, cx, roofY + 0.2, cz - depth * 0.44);
    b.plane(mats.signMaterial(sign), sw, sh, cx, roofY + sh / 2 + 1.0, cz - depth * 0.44 + 0.08, 0, 0, 0, 0, {
      label: `Rooftop sign — ${r.sign}`,
    });
    if (era.id === '1985') {
      ctx.lightsWanted.push({ type: 'point', color: 0xffd0a0, intensity: 5, dist: 14, pos: [cx, roofY + sh, cz - depth * 0.4] });
    }
  }

  // pigeons
  for (let i = 0; i < (r.pigeons || 0); i++) {
    const px = cx + rng.range(-w * 0.45, w * 0.45);
    const pz = zFront - 0.1;
    b.box(mats.std({ color: mixHex(0x6e6a66, 0x3f3d3a, rng()), roughness: 0.9 }), 0.16, 0.14, 0.3, px, roofY + 1.05, pz, 0, rng.range(-0.4, 0.4), 0, { label: 'Pigeon' });
    b.sphere(mats.std({ color: 0x5a5652, roughness: 0.9 }), 0.06, px, roofY + 1.16, pz - 0.14, 8);
  }
}
