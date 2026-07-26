import * as THREE from 'three';
import { LAYOUT } from '../config/block.js';
import { Batch } from '../lib/geom.js';
import {
  brickTex,
  concreteTex,
  corrugatedTex,
  posterWallTex,
  graffitiTex,
  leafTex,
  roadTex,
  panelTex,
  noiseRoughTex,
} from '../lib/textures.js';
import { wallAdTex, storefrontSign, makeAnimatedDisplay, placardTex } from '../lib/signs.js';
import { makeRng, mixHex, shade, TAU } from '../lib/util.js';
import { buildScooter, buildBicycle } from './storefront.js';
import { buildVehicle } from './vehicles.js';

const L = LAYOUT;

/** A hole in the block: hoarding, billboard, weeds, and whatever got dumped. */
export function buildVacantLot(ctx, lot, spec) {
  const { mats, era, root } = ctx;
  const b = new Batch('lot' + lot.id);
  const rng = makeRng('vac' + lot.id + era.id);
  const w = lot.x1 - lot.x0;
  const cx = (lot.x0 + lot.x1) / 2;
  const depth = L.blockDepth;
  const zFront = L.facadeZ;
  const cz = zFront - depth / 2;

  // ---- ground -----------------------------------------------------------
  const isParking = spec.fence === 'chainlink';
  const groundMat = isParking
    ? mats.std({ map: roadTex('asphalt-patched', { seed: 77 }), roughness: 0.95 })
    : mats.std({ color: 0x5b5346, roughness: 1, map: noiseRoughTex(4, 8) });
  b.plane(groundMat, w, depth, cx, 0.02, cz, -Math.PI / 2, 0, 0, isParking ? 8 : 0, {
    receiveShadow: true,
    label: spec.label,
  });

  // ---- exposed party walls of the neighbours ---------------------------
  if (spec.partyWall) {
    const pw = spec.partyWall;
    const pwMat = mats.std({
      map: brickTex({ color: pw.color, grime: 0.85, seed: 55 }),
      roughness: 0.95,
    });
    const hgt = 14;
    if (pw.west) {
      b.plane(pwMat, depth, hgt, lot.x0 + 0.06, hgt / 2, cz, 0, Math.PI / 2, 0, 2.4, {
        label: 'Exposed party wall — the building that stood here is gone',
      });
      // ghost of the demolished building's floors + chimney flues
      const gm = mats.std({ color: 0x8a7a6a, roughness: 1, transparent: true, opacity: 0.35 });
      for (let f = 1; f < 4; f++) b.box(gm, 0.06, 0.22, depth * 0.9, lot.x0 + 0.1, f * 3.3, cz);
      for (let i = 0; i < 3; i++) b.box(gm, 0.08, 11, 0.6, lot.x0 + 0.1, 5.5, cz - depth * 0.3 + i * 4);
    }
    if (pw.east) {
      b.plane(pwMat, depth, hgt, lot.x1 - 0.06, hgt / 2, cz, 0, -Math.PI / 2, 0, 2.4, {
        label: 'Exposed party wall',
      });
      const gm = mats.std({ color: 0x8a7a6a, roughness: 1, transparent: true, opacity: 0.3 });
      for (let f = 1; f < 4; f++) b.box(gm, 0.06, 0.22, depth * 0.9, lot.x1 - 0.1, f * 3.3, cz);
    }
    // back wall
    b.plane(pwMat, w, hgt, cx, hgt / 2, cz - depth / 2 + 0.05, 0, 0, 0, 2.4);
  }

  // ---- streetfront enclosure -------------------------------------------
  if (spec.fence === 'wood-hoarding') {
    const boardMat = mats.std({ color: 0x6b5540, roughness: 0.95 });
    const posterMat = mats.std({ map: posterWallTex(era.id, { seed: 12 }), roughness: 0.9 });
    const H = 2.6;
    for (let i = 0; i < Math.round(w / 0.3); i++) {
      const px = lot.x0 + 0.15 + i * 0.3;
      b.box(boardMat, 0.28, H, 0.06, px, H / 2 + 0.16, zFront - 0.2, 0, 0, rng.range(-0.006, 0.006), {
        castShadow: true,
        label: 'Timber hoarding',
      });
    }
    b.box(boardMat, w, 0.14, 0.14, cx, H + 0.2, zFront - 0.16);
    b.plane(posterMat, w * 0.55, 1.7, cx - w * 0.16, 1.4, zFront - 0.15, 0, 0, 0, 0, { label: 'Flyposted hoarding' });
  } else if (spec.fence === 'chainlink') {
    const postMat = mats.std({ color: 0x8d9296, roughness: 0.5, metalness: 0.7 });
    const meshMat = mats.std({
      map: makeChainlinkTex(),
      transparent: true,
      alphaTest: 0.4,
      roughness: 0.6,
      metalness: 0.6,
      side: THREE.DoubleSide,
    });
    const H = 2.2;
    const openX = lot.x0 + w * 0.5;
    for (let i = 0; i <= Math.round(w / 2.4); i++) {
      const px = lot.x0 + (i * w) / Math.round(w / 2.4);
      if (Math.abs(px - openX) < 1.8) continue;
      b.cyl(postMat, 0.05, H, px, H / 2 + 0.16, zFront - 0.3, 8, 0, 0, 0, { castShadow: true });
    }
    b.cyl(postMat, 0.04, w, cx, H + 0.16, zFront - 0.3, 8, 0, 0, Math.PI / 2);
    for (const [sx0, sx1] of [
      [lot.x0, openX - 1.8],
      [openX + 1.8, lot.x1],
    ]) {
      if (sx1 - sx0 < 0.3) continue;
      b.plane(meshMat, sx1 - sx0, H, (sx0 + sx1) / 2, H / 2 + 0.16, zFront - 0.3, 0, 0, 0, 0, {
        label: 'Chain-link fence',
      });
    }
  }

  // ---- billboard --------------------------------------------------------
  if (spec.billboard) {
    const bb = spec.billboard;
    const sign = wallAdTex({
      kind: bb.kind,
      text: bb.text,
      sub: bb.sub,
      bg: bb.bg,
      fg: bb.fg,
      accent: bb.accent,
      wear: 0.25,
      seed: 31,
      W: 900,
      H: Math.round((900 * bb.h) / bb.w),
    });
    const y = 4.6;
    const frame = mats.std({ color: 0x3f3a34, roughness: 0.7, metalness: 0.45 });
    b.plane(mats.signMaterial(sign), bb.w, bb.h, cx, y, zFront - 1.4, 0, 0, 0, 0, {
      label: bb.kind === 'painted' ? 'Painted billboard' : 'Poster billboard',
    });
    b.box(frame, bb.w + 0.5, bb.h + 0.5, 0.2, cx, y, zFront - 1.55, 0, 0, 0, { castShadow: true });
    b.box(frame, bb.w + 0.7, 0.3, 0.4, cx, y + bb.h / 2 + 0.35, zFront - 1.5);
    for (const s of [-1, 1]) {
      b.box(frame, 0.24, y + bb.h / 2, 0.24, cx + s * bb.w * 0.34, (y + bb.h / 2) / 2, zFront - 1.7, 0, 0, 0, { castShadow: true });
      b.box(frame, 0.16, 3.2, 1.8, cx + s * bb.w * 0.34, 2.2, zFront - 2.6, 0.5, 0, 0);
    }
    if (bb.kind !== 'painted') {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i * bb.w * 0.34;
        b.cyl(frame, 0.05, 1.2, gx, y + bb.h / 2 + 0.7, zFront - 0.9, 8, 0.8, 0, 0);
        b.cyl(mats.glow({ color: 0x2a2a2a, emissive: 0xfff1c8, emissiveIntensity: 2.4 }), 0.18, 0.22, gx, y + bb.h / 2 + 1.05, zFront - 0.5, 10, Math.PI / 2 + 0.7, 0, 0);
      }
      ctx.lightsWanted.push({ type: 'point', color: 0xfff1c8, intensity: 6, dist: 12, pos: [cx, y + bb.h / 2, zFront - 0.2] });
    }
  }

  // ---- contents ---------------------------------------------------------
  for (const item of spec.contents || []) {
    switch (item) {
      case 'parkedTruck': {
        const g = new THREE.Group();
        buildVehicle(ctx, g, 'panel45', { color: 0x3a4a3f, plate: 'CARTAGE' });
        g.position.set(cx - w * 0.2, 0, cz + 2.5);
        g.rotation.y = 0.4;
        root.add(g);
        break;
      }
      case 'parkedCars': {
        const kinds = ['suv05', 'sedan05', 'minivan05'];
        for (let i = 0; i < 4; i++) {
          const g = new THREE.Group();
          buildVehicle(ctx, g, kinds[i % 3], { color: [0x9aa0a6, 0xb8bcc0, 0x2b3138, 0x6b3a2e][i] });
          g.position.set(lot.x0 + 1.6 + (i % 2) * 2.6, 0, cz - 3 + Math.floor(i / 2) * 5.4);
          g.rotation.y = Math.PI / 2 + (i % 2 ? 0.02 : -0.02);
          root.add(g);
        }
        break;
      }
      case 'stripes': {
        const pm = mats.std({ color: 0xd8d4c8, roughness: 0.8, transparent: true, opacity: 0.7 });
        for (let i = 0; i < 5; i++) {
          b.plane(pm, 0.12, 4.8, lot.x0 + 1.0 + i * 2.6, 0.03, cz - 3, -Math.PI / 2, 0, Math.PI / 2);
          b.plane(pm, 0.12, 4.8, lot.x0 + 1.0 + i * 2.6, 0.03, cz + 3, -Math.PI / 2, 0, Math.PI / 2);
        }
        break;
      }
      case 'crates': {
        for (let i = 0; i < 7; i++) {
          const s = rng.range(0.5, 0.9);
          b.box(mats.std({ color: mixHex(0x8a6a44, 0x6b5030, rng()), roughness: 0.95 }), s, s * 0.7, s, lot.x0 + rng.range(1, w - 1), s * 0.35 + 0.02, cz + rng.range(-depth * 0.35, depth * 0.35), 0, rng.range(0, 3), 0, {
            castShadow: true,
            label: 'Packing crate',
          });
        }
        break;
      }
      case 'rubble': {
        for (let i = 0; i < 26; i++) {
          const s = rng.range(0.15, 0.55);
          b.box(mats.std({ color: mixHex(0x8a7f70, 0x6b6255, rng()), roughness: 1 }), s, s * 0.6, s * 0.8, lot.x0 + rng.range(0.5, w - 0.5), s * 0.3 + 0.02, cz + rng.range(-depth * 0.45, depth * 0.45), rng.range(0, 3), rng.range(0, 3), 0, {
            castShadow: true,
          });
        }
        break;
      }
      case 'weeds': {
        const wm = mats.cutout({ map: leafTex(0x6f7a3a, 91), color: 0xa8b070 });
        for (let i = 0; i < 22; i++) {
          const s = rng.range(0.4, 1.1);
          b.plane(wm, s, s, lot.x0 + rng.range(0.4, w - 0.4), s / 2 + 0.02, cz + rng.range(-depth * 0.46, depth * 0.46), 0, rng.range(0, 3), 0);
        }
        break;
      }
      case 'barrel': {
        b.cyl(mats.std({ color: 0x6b4a2c, roughness: 0.9, metalness: 0.2 }), 0.34, 0.95, lot.x0 + 1.4, 0.5, cz - 2, 14, 0, 0, 0, { castShadow: true, label: 'Oil drum' });
        b.cyl(mats.std({ color: 0x8a6a44, roughness: 0.9 }), 0.34, 0.9, lot.x0 + 2.2, 0.16, cz - 2.6, 14, Math.PI / 2, 0, 0, { castShadow: true });
        break;
      }
      case 'poster': {
        b.plane(mats.std({ map: posterWallTex(era.id, { seed: 44 }), roughness: 0.9 }), 2.4, 1.6, lot.x1 - 2, 2.4, cz - depth / 2 + 0.12, 0, 0, 0, 0);
        break;
      }
      case 'lightPole': {
        const pm = mats.std({ color: 0x6f7377, roughness: 0.5, metalness: 0.6 });
        b.cyl(pm, 0.12, 8, cx + w * 0.3, 4, cz, 10, 0, 0, 0, { castShadow: true, label: 'Parking lot mast light' });
        b.box(pm, 1.2, 0.3, 0.7, cx + w * 0.3, 8.1, cz, 0, 0, 0);
        b.box(mats.glow({ color: 0x2a2a2a, emissive: 0xd8e0ff, emissiveIntensity: 2.4 }), 1.0, 0.08, 0.55, cx + w * 0.3, 7.94, cz);
        ctx.lightsWanted.push({ type: 'point', color: 0xd8e0ff, intensity: 22, dist: 26, pos: [cx + w * 0.3, 7.8, cz] });
        break;
      }
      case 'payKiosk': {
        b.box(mats.std({ color: 0x2b3138, roughness: 0.6, metalness: 0.3 }), 0.5, 1.4, 0.4, cx, 0.7, zFront - 1.0, 0, 0, 0, { castShadow: true, label: 'Pay-and-display machine' });
        b.plane(mats.glow({ color: 0x101418, emissive: 0x8fd8ff, emissiveIntensity: 1.2 }), 0.32, 0.24, cx, 1.15, zFront - 0.79, 0, 0, 0, 0);
        break;
      }
      case 'dumpster': {
        buildDumpster(ctx, b, { x: lot.x1 - 2.2, z: cz - depth * 0.3, rot: 0.2 });
        break;
      }
      default:
        break;
    }
  }

  b.build(root, { castShadow: true, receiveShadow: true });
}

function makeChainlinkTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#b8bec2';
  g.lineWidth = 3;
  for (let i = -64; i < 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDumpster(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, rot = 0 } = o;
  const body = mats.std({ color: 0x2f5d4a, roughness: 0.85, metalness: 0.25 });
  const lid = mats.std({ color: 0x264d3e, roughness: 0.9 });
  b.box(body, 2.2, 1.25, 1.35, x, 0.78, z, 0, rot, 0, { castShadow: true, label: 'Refuse skip' });
  b.box(lid, 2.24, 0.1, 1.4, x, 1.44, z, 0, rot, 0, { castShadow: true });
  b.box(lid, 1.0, 0.1, 1.4, x + 0.6, 1.62, z - 0.3, -0.5, rot, 0, { castShadow: true });
  for (const s of [-1, 1]) {
    b.cyl(mats.std({ color: 0x232323, roughness: 0.9 }), 0.13, 0.1, x + s * 0.9 * Math.cos(rot), 0.13, z + s * 0.9 * Math.sin(rot), 10, 0, 0, Math.PI / 2);
  }
  if (era.street.graffiti > 0.4) {
    b.plane(mats.std({ map: graffitiTex({ amount: 0.8, seed: 17 }), transparent: true, alphaTest: 0.05, roughness: 0.9 }), 2.0, 1.0, x, 0.8, z + 0.69 * Math.cos(rot), 0, rot, 0);
  }
  // overflowing bags
  for (let i = 0; i < 3; i++) {
    b.sphere(mats.std({ color: 0x232326, roughness: 0.7 }), 0.28, x - 0.6 + i * 0.5, 1.62, z + 0.1, 8, { castShadow: true });
  }
}

// ---------------------------------------------------------------------------
/** Corner service station (1945 → 2005). */
export function buildGasStation(ctx, lot, spec) {
  const { mats, era, root } = ctx;
  const b = new Batch('gas' + lot.id);
  const rng = makeRng('gas' + era.id);
  const w = lot.x1 - lot.x0;
  const cx = (lot.x0 + lot.x1) / 2;
  const depth = L.blockDepth;
  const zFront = L.facadeZ;
  const cz = zFront - depth / 2;

  // ---- forecourt --------------------------------------------------------
  const apron = mats.std({
    map: concreteTex({ color: era.id === '1945' ? 0xb0a89a : 0xbdb8ae, grime: era.id === '1985' ? 0.7 : 0.35, seed: 66 }),
    roughness: 0.92,
    map2: null,
  });
  b.plane(apron, w, depth, cx, 0.03, cz, -Math.PI / 2, 0, 0, 4, { receiveShadow: true, label: spec.label });
  // oil stains
  for (let i = 0; i < 10; i++) {
    b.plane(mats.std({ color: 0x1f1d1a, roughness: 0.6, transparent: true, opacity: 0.35 }), rng.range(0.6, 2), rng.range(0.5, 1.6), cx + rng.range(-w * 0.4, w * 0.4), 0.04, cz + rng.range(-depth * 0.4, depth * 0.4), -Math.PI / 2, 0, rng.range(0, 3));
  }
  // kerb cut ramps
  for (const s of [-1, 1]) {
    b.box(mats.std({ color: 0xa5a19a, roughness: 0.9 }), 4.5, 0.16, 1.0, cx + s * w * 0.3, 0.08, L.curbNorthZ - 0.5, 0, 0, 0);
  }

  // ---- kiosk / sales building -------------------------------------------
  const k = spec.kiosk;
  const kx = lot.x1 - k.w / 2 - 0.8;
  const kz = cz - depth * 0.28;
  const kioskMat = mats.std({
    map: era.id === '1945' ? panelTex({ color: k.color, seed: 3, grime: 0.3 }) : concreteTex({ color: k.color, grime: era.id === '1985' ? 0.6 : 0.2, seed: 9 }),
    roughness: 0.7,
    metalness: 0.15,
  });
  b.texBox(kioskMat, k.w, k.h, k.d, kx, k.h / 2, kz, 2.4, { castShadow: true, receiveShadow: true });
  // trim band
  b.box(mats.std({ color: k.trim, roughness: 0.5, metalness: 0.3 }), k.w + 0.2, 0.5, k.d + 0.2, kx, k.h - 0.3, kz, 0, 0, 0, { castShadow: true });
  // roof
  if (k.roof === 'hip') {
    b.cyl(mats.std({ color: 0x8a4a3a, roughness: 0.9 }), k.w * 0.72, 1.1, kx, k.h + 0.55, kz, 4, 0, Math.PI / 4, 0, { castShadow: true });
  } else if (k.roof === 'mansard') {
    b.box(mats.std({ color: 0x5a3a2a, roughness: 0.9 }), k.w + 0.8, 1.2, k.d + 0.8, kx, k.h + 0.5, kz, 0, 0, 0, { castShadow: true });
    b.box(mats.std({ color: 0x3f3a34, roughness: 0.9 }), k.w + 0.4, 0.16, k.d + 0.4, kx, k.h + 1.15, kz);
  } else if (k.roof === 'green') {
    b.box(mats.std({ color: 0x3a4238, roughness: 0.95 }), k.w + 0.5, 0.3, k.d + 0.5, kx, k.h + 0.15, kz, 0, 0, 0, { castShadow: true });
    b.plane(mats.cutout({ map: leafTex(0x4a8c4a, 88) }), k.w, k.d, kx, k.h + 0.45, kz, -Math.PI / 2, 0, 0);
  } else {
    b.box(mats.std({ color: 0x3f3a34, roughness: 0.9 }), k.w + 0.4, 0.24, k.d + 0.4, kx, k.h + 0.12, kz, 0, 0, 0, { castShadow: true });
  }
  // shop window + door
  const winMat = mats.glow({
    color: 0x2a3038,
    emissive: era.id === '2005' ? 0xffffff : 0xffe0a8,
    emissiveIntensity: era.id === '1945' ? 0.5 : 1.0,
    roughness: 0.2,
    metalness: 0.3,
  });
  b.plane(winMat, k.w * 0.7, k.h * 0.5, kx, k.h * 0.55, kz + k.d / 2 + 0.02, 0, 0, 0, 0, { label: 'Sales office' });
  b.box(mats.std({ color: k.trim, roughness: 0.4, metalness: 0.4 }), 0.9, k.h * 0.72, 0.1, kx - k.w * 0.34, k.h * 0.36, kz + k.d / 2 + 0.04);
  // service bay door (older stations)
  if ((spec.extras || []).includes('bay')) {
    b.plane(
      mats.std({ map: corrugatedTex({ color: 0xd8d4c8, grime: era.id === '1985' ? 0.7 : 0.3, seed: 4 }), roughness: 0.6, metalness: 0.4 }),
      3.0,
      3.0,
      kx + k.w * 0.5 - 1.7,
      1.5,
      kz + k.d / 2 + 0.03,
      0,
      0,
      0,
      0,
      { label: 'Service bay' }
    );
  }

  // ---- canopy -----------------------------------------------------------
  const c = spec.canopy;
  const canX = cx - w * 0.12;
  const canZ = cz + depth * 0.18;
  const canMat = mats.std({ color: c.color, roughness: 0.55, metalness: 0.3 });
  b.box(canMat, c.w, 0.55, c.d, canX, c.h, canZ, 0, 0, 0, { castShadow: true, label: 'Forecourt canopy' });
  b.box(mats.std({ color: c.trim, roughness: 0.45, metalness: 0.4 }), c.w + 0.3, 0.42, c.d + 0.3, canX, c.h - 0.3, canZ, 0, 0, 0, { castShadow: true });
  // soffit lighting
  const soffit = mats.glow({
    color: 0xe8e8e0,
    emissive: 0xfff4dc,
    emissiveIntensity: era.id === '1945' ? 1.0 : 2.2,
  });
  for (let i = 0; i < 4; i++) {
    b.box(soffit, c.w * 0.7, 0.06, 0.35, canX, c.h - 0.3, canZ - c.d * 0.3 + i * (c.d * 0.2));
  }
  ctx.lightsWanted.push({ type: 'point', color: 0xfff4dc, intensity: era.id === '1945' ? 12 : 30, dist: 22, pos: [canX, c.h - 0.6, canZ] });
  // columns
  for (let i = 0; i < (c.posts || 2); i++) {
    const px = canX - c.w * 0.34 + (i * (c.w * 0.68)) / Math.max(1, (c.posts || 2) - 1);
    b.box(canMat, 0.42, c.h, 0.42, px, c.h / 2, canZ, 0, 0, 0, { castShadow: true });
    b.box(mats.std({ color: c.trim, roughness: 0.5 }), 0.6, 0.3, 0.6, px, 0.15, canZ);
  }

  // ---- pumps ------------------------------------------------------------
  const p = spec.pumps;
  const islandMat = mats.std({ color: 0xb8b2a6, roughness: 0.9 });
  for (let i = 0; i < p.count; i++) {
    const island = Math.floor(i / 2);
    const ix = canX - c.w * 0.28 + island * (c.w * 0.28);
    const pz = canZ + (i % 2 ? 1.1 : -1.1);
    if (i % 2 === 0) {
      b.box(islandMat, 3.4, 0.22, 1.3, ix, 0.14, canZ, 0, 0, 0, { castShadow: true, label: 'Pump island' });
    }
    if (p.style === 'visible') {
      // 1940s visible-register pump: tall body, glass cylinder on top
      b.box(mats.std({ color: p.color, roughness: 0.45, metalness: 0.35 }), 0.5, 1.5, 0.5, ix, 0.95, pz, 0, 0, 0, { castShadow: true, label: 'Visible-register petrol pump' });
      b.cyl(mats.glass({ color: 0xd8c46a, opacity: 0.6, roughness: 0.1 }), 0.26, 0.7, ix, 2.05, pz, 14, 0, 0, 0);
      b.cyl(mats.std({ color: 0xd8d4c8, roughness: 0.4, metalness: 0.5 }), 0.28, 0.14, ix, 2.44, pz, 14);
      b.sphere(mats.glow({ color: 0xe8e0c8, emissive: 0xffd9a0, emissiveIntensity: 0.9 }), 0.2, ix, 2.6, pz, 12);
    } else {
      const ph = p.style === 'boxy' ? 1.4 : 1.6;
      b.box(mats.std({ color: p.color, roughness: 0.4, metalness: 0.3 }), 0.62, ph, 0.55, ix, ph / 2 + 0.24, pz, 0, 0, 0, { castShadow: true, label: 'Fuel dispenser' });
      b.box(mats.std({ color: shade(p.color, -0.4), roughness: 0.5 }), 0.66, 0.4, 0.58, ix, ph + 0.44, pz);
      const disp =
        p.style === 'digital' || p.style === 'modern'
          ? mats.glow({ color: 0x101418, emissive: 0xff4a2b, emissiveIntensity: 1.6 })
          : mats.std({ color: 0xe8e4d8, roughness: 0.4 });
      b.plane(disp, 0.44, 0.3, ix, ph * 0.75 + 0.24, pz + 0.29, 0, 0, 0, 0);
      if (p.style === 'modern') {
        b.plane(mats.glow({ color: 0x1a1f24, emissive: 0x8fd8ff, emissiveIntensity: 1.0 }), 0.4, 0.3, ix, ph * 0.45 + 0.24, pz + 0.29, 0, 0, 0, 0);
      }
    }
    // hose + nozzle
    b.cyl(mats.std({ color: 0x1a1a1a, roughness: 0.9 }), 0.035, 1.0, ix + 0.34, 1.1, pz, 6, 0, 0, 0.6);
    b.box(mats.std({ color: 0x8d9296, roughness: 0.4, metalness: 0.6 }), 0.1, 0.26, 0.1, ix + 0.42, 0.75, pz, 0, 0, 0.3);
  }

  // ---- pylon sign -------------------------------------------------------
  buildPylon(ctx, b, spec, { x: lot.x1 - 2.0, z: L.facadeZ + 1.6 });

  // ---- extras -----------------------------------------------------------
  buildForecourtExtras(ctx, b, spec, { lot, cx, cz, depth, w, kx, kz, k, canX, canZ, c, rng });

  b.build(root, { castShadow: true, receiveShadow: true });
}

function buildPylon(ctx, b, spec, o) {
  const { mats, era } = ctx;
  const py = spec.pylon;
  const { x, z } = o;
  const poleMat = mats.std({ color: 0x8d9296, roughness: 0.5, metalness: 0.6 });
  b.cyl(poleMat, 0.16, py.h, x, py.h / 2, z, 12, 0, 0, 0, { castShadow: true });
  const sw = era.id === '1945' ? 2.4 : 3.2;
  const sh = sw * (era.id === '1965' ? 0.75 : 0.5);
  const sign = storefrontSign({
    kind: py.kind === 'led-price' ? 'vinyl' : py.kind === 'holo' ? 'holo' : py.kind === 'plastic-lit' ? 'plastic-lit' : py.kind,
    name: py.text,
    sub: py.sub,
    color: py.bg,
    accent: py.fg,
    wear: era.id === '1985' ? 0.4 : 0.15,
    seed: 19,
    W: 512,
    H: Math.round((512 * sh) / sw),
  });
  const mat = py.kind === 'holo' ? mats.holoMaterial(sign.map, py.fg, 1.4) : mats.signMaterial(sign, { side: THREE.DoubleSide, glowScale: 1.2 });
  b.plane(mat, sw, sh, x, py.h - sh * 0.6, z, 0, 0, 0, 0, { label: `Pylon sign — ${py.text}` });
  if (py.kind !== 'painted') {
    b.box(mats.std({ color: 0xd8d4c8, roughness: 0.4, metalness: 0.5 }), sw + 0.2, sh + 0.2, 0.24, x, py.h - sh * 0.6, z - 0.14, 0, 0, 0, { castShadow: true });
    ctx.lightsWanted.push({ type: 'point', color: py.fg, intensity: 8, dist: 14, pos: [x, py.h - sh * 0.5, z + 1] });
  }
  if (py.kind === 'holo') ctx.holos.push({ mat, base: 1.4, seed: 7 });
  // live price board
  if (py.kind === 'led-price' || py.kind === 'plastic-lit' || py.kind === 'led') {
    const disp = makeAnimatedDisplay({
      W: 256,
      H: 200,
      kind: py.kind === 'led' ? 'led' : 'prices',
      accent: py.fg,
      lines: [py.sub],
      fps: 4,
      seed: 5,
    });
    const dm = mats.std({
      map: disp.texture,
      emissiveMap: disp.texture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.8,
      roughness: 0.4,
    });
    b.plane(dm, sw * 0.8, sw * 0.62, x, py.h - sh * 1.5 - 0.5, z + 0.02, 0, 0, 0, 0, { label: 'Price board' });
    ctx.animated.push(disp);
  }
}

function buildForecourtExtras(ctx, b, spec, o) {
  const { mats, era } = ctx;
  const { lot, cx, cz, depth, w, kx, kz, k, canX, canZ, c, rng } = o;
  const metal = mats.std({ color: 0x8d9296, roughness: 0.5, metalness: 0.65 });
  const swY = 0.16;
  for (const ex of spec.extras || []) {
    switch (ex) {
      case 'oilRack': {
        b.box(metal, 1.2, 1.0, 0.5, kx - k.w * 0.5 - 1.0, 0.5, kz + k.d * 0.3, 0, 0, 0, { castShadow: true, label: 'Motor oil rack' });
        for (let i = 0; i < 8; i++) {
          b.cyl(mats.std({ color: [0x1f6f5c, 0xc0392b, 0x1f4f9c][i % 3], roughness: 0.5, metalness: 0.4 }), 0.08, 0.3, kx - k.w * 0.5 - 1.45 + (i % 4) * 0.3, 1.15, kz + k.d * 0.3 + (i > 3 ? 0.2 : -0.1), 10, 0, 0, 0);
        }
        break;
      }
      case 'tyreStack': {
        for (let i = 0; i < 5; i++) {
          b.cyl(mats.std({ color: 0x1f1f22, roughness: 0.95 }), 0.36, 0.2, kx + k.w * 0.5 + 1.2, 0.12 + i * 0.2, kz - k.d * 0.2, 16, 0, 0, 0, { castShadow: true, label: 'Tyre stack' });
        }
        break;
      }
      case 'airHose': {
        b.cyl(metal, 0.14, 1.2, canX + c.w * 0.44, 0.6, canZ + 2.6, 10, 0, 0, 0, { castShadow: true, label: 'Air & water' });
        b.box(mats.std({ color: 0xc0392b, roughness: 0.5 }), 0.4, 0.5, 0.3, canX + c.w * 0.44, 1.35, canZ + 2.6, 0, 0, 0);
        for (let i = 0; i < 5; i++) {
          b.cyl(mats.std({ color: 0x1a1a1a, roughness: 0.9 }), 0.032, 0.5, canX + c.w * 0.44 + 0.25, 0.9 - i * 0.05, canZ + 2.6, 6, 0, i * 1.2, Math.PI / 2);
        }
        break;
      }
      case 'vendingMachine': {
        b.box(mats.std({ color: era.id === '1965' ? 0xc0392b : 0x1f4f9c, roughness: 0.5, metalness: 0.2 }), 0.9, 1.8, 0.6, kx - k.w * 0.5 + 0.6, 0.9, kz + k.d / 2 + 0.4, 0, 0, 0, {
          castShadow: true,
          label: 'Soda vending machine',
        });
        b.plane(mats.glow({ color: 0xe8e4d8, emissive: 0xffe8b0, emissiveIntensity: 1.4 }), 0.6, 0.9, kx - k.w * 0.5 + 0.6, 1.05, kz + k.d / 2 + 0.71, 0, 0, 0, 0);
        break;
      }
      case 'iceBox': {
        b.box(mats.std({ color: 0xe8ebee, roughness: 0.6 }), 1.5, 1.1, 0.8, kx - k.w * 0.5 + 0.9, 0.55, kz + k.d / 2 + 0.5, 0, 0, 0, { castShadow: true, label: 'Ice chest' });
        b.plane(mats.std({ color: 0x1f6fa8, roughness: 0.5 }), 1.2, 0.5, kx - k.w * 0.5 + 0.9, 0.7, kz + k.d / 2 + 0.91, 0, 0, 0, 0);
        break;
      }
      case 'propaneCage': {
        b.box(mats.std({ color: 0x8d9296, transparent: true, opacity: 0.5, roughness: 0.6, metalness: 0.6 }), 1.4, 1.5, 0.9, kx + k.w * 0.5 + 1.0, 0.75, kz, 0, 0, 0, { label: 'Propane exchange' });
        for (let i = 0; i < 4; i++) {
          b.cyl(mats.std({ color: 0xc9a227, roughness: 0.6, metalness: 0.3 }), 0.16, 0.6, kx + k.w * 0.5 + 0.7 + (i % 2) * 0.5, 0.45, kz + (i > 1 ? 0.25 : -0.25), 10, 0, 0, 0);
        }
        break;
      }
      case 'bunting': {
        const cols = [0xc0392b, 0xf2f0e6, 0x1f4f9c, 0xffd23f];
        const n = 14;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          b.plane(mats.cutout({ color: cols[i % 4], side: THREE.DoubleSide, roughness: 0.95 }), 0.4, 0.5, canX - c.w / 2 + t * c.w, c.h + 0.6 - Math.sin(t * Math.PI) * 0.5, canZ + c.d / 2, 0, 0, 0.2, 0, {
            label: 'Forecourt bunting',
          });
        }
        break;
      }
      case 'attendant': {
        ctx.extraPeople.push({
          x: canX + 1.6,
          z: canZ + 1.4,
          rot: -0.6,
          outfit: era.id === '1945' ? 'attendant45' : 'attendant65',
          pose: 'stand',
        });
        break;
      }
      case 'squeegee': {
        b.cyl(metal, 0.16, 1.0, canX + c.w * 0.3, 0.5, canZ - 2.2, 10, 0, 0, 0, { label: 'Squeegee bucket' });
        b.box(mats.std({ color: 0x1f4f9c, roughness: 0.6 }), 0.4, 0.4, 0.3, canX + c.w * 0.3, 1.15, canZ - 2.2);
        break;
      }
      case 'carWashSign': {
        b.plane(
          mats.std({
            map: placardTex({ W: 256, H: 128, bg: 0x1f4f9c, fg: 0xffffff, title: 'CAR WASH', rows: ['WITH FILL-UP'], font: 'Arial, sans-serif', wear: 0.1 }),
            roughness: 0.5,
          }),
          1.6,
          0.8,
          kx,
          k.h + 1.4,
          kz + k.d / 2,
          0,
          0,
          0,
          0,
          { label: 'Car wash sign' }
        );
        break;
      }
      case 'payphone': {
        b.box(mats.std({ color: 0x2b2f33, roughness: 0.6, metalness: 0.4 }), 0.6, 1.1, 0.35, kx + k.w * 0.5 + 0.4, 1.3, kz + k.d / 2 + 0.2, 0, 0, 0, { castShadow: true, label: 'Payphone' });
        b.box(mats.std({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.6 }), 0.7, 0.3, 0.4, kx + k.w * 0.5 + 0.4, 1.95, kz + k.d / 2 + 0.2);
        break;
      }
      case 'graffitiTag': {
        b.plane(mats.std({ map: graffitiTex({ amount: 0.9, seed: 23 }), transparent: true, alphaTest: 0.05, roughness: 0.9 }), 3.2, 1.6, kx, 1.4, kz + k.d / 2 + 0.05, 0, 0, 0);
        break;
      }
      case 'bucket': {
        b.cyl(mats.std({ color: 0x8d9296, roughness: 0.6, metalness: 0.4 }), 0.18, 0.3, canX - 2.2, 0.15, canZ + 2.0, 12, 0, 0, 0);
        break;
      }
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
/** EV charge plaza (2025) / autonomy hub (2055). */
export function buildPlaza(ctx, lot, spec) {
  const { mats, era, root } = ctx;
  const b = new Batch('plaza' + lot.id);
  const rng = makeRng('plaza' + era.id);
  const w = lot.x1 - lot.x0;
  const cx = (lot.x0 + lot.x1) / 2;
  const depth = L.blockDepth;
  const zFront = L.facadeZ;
  const cz = zFront - depth / 2;
  const future = era.id === '2055';

  // ---- paving -----------------------------------------------------------
  const paveMat = mats.std({
    map: concreteTex({ color: future ? 0x545c72 : 0xa8a49c, grime: 0.15, seed: 12, boards: true }),
    roughness: future ? 0.55 : 0.85,
    metalness: future ? 0.2 : 0.05,
  });
  b.plane(paveMat, w, depth, cx, 0.03, cz, -Math.PI / 2, 0, 0, 4, { receiveShadow: true, label: spec.label });
  // permeable paving grid + rain garden
  const gridMat = mats.std({ color: future ? 0x2f3852 : 0x8a8d84, roughness: 0.9 });
  for (let i = 0; i < 8; i++) b.box(gridMat, w, 0.02, 0.08, cx, 0.045, cz - depth * 0.4 + i * (depth * 0.11));

  // ---- solar canopy -----------------------------------------------------
  const c = spec.canopy;
  const canX = cx - w * 0.05;
  const canZ = cz + depth * 0.16;
  const frameMat = mats.std({ color: c.color, roughness: 0.45, metalness: 0.55 });
  b.box(frameMat, c.w, 0.35, c.d, canX, c.h, canZ, 0, 0, 0, { castShadow: true, label: 'Solar canopy' });
  // PV modules on top, tilted
  const pv = mats.std({
    color: 0x16233d,
    roughness: 0.18,
    metalness: 0.6,
    emissive: new THREE.Color(future ? 0x1a2c55 : 0x0c1526),
    emissiveIntensity: 0.4,
  });
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    b.box(pv, c.w * 0.94, 0.07, (c.d * 0.9) / rows - 0.12, canX, c.h + 0.32 + 0.12, canZ - c.d * 0.42 + ((r + 0.5) * c.d * 0.9) / rows, -0.18, 0, 0, {
      castShadow: true,
      label: 'Photovoltaic canopy module',
    });
  }
  for (let i = 0; i < (c.posts || 2); i++) {
    const px = canX - c.w * 0.36 + (i * (c.w * 0.72)) / Math.max(1, (c.posts || 2) - 1);
    b.box(frameMat, 0.34, c.h, 0.34, px, c.h / 2, canZ, 0, 0, 0, { castShadow: true });
    if (future) b.box(mats.glow({ color: 0x1b2334, emissive: c.trim, emissiveIntensity: 2.0 }), 0.36, 0.1, 0.36, px, c.h * 0.28, canZ);
  }
  // canopy underlighting
  const soffit = mats.glow({ color: 0x2a3138, emissive: future ? 0x9fd8ff : 0xffffff, emissiveIntensity: future ? 2.4 : 1.8 });
  for (let i = 0; i < 3; i++) b.box(soffit, c.w * 0.8, 0.05, 0.2, canX, c.h - 0.2, canZ - c.d * 0.25 + i * (c.d * 0.25));
  ctx.lightsWanted.push({ type: 'point', color: future ? 0x9fd8ff : 0xffffff, intensity: future ? 26 : 22, dist: 22, pos: [canX, c.h - 0.6, canZ] });

  // ---- chargers ---------------------------------------------------------
  const ch = spec.chargers;
  for (let i = 0; i < ch.count; i++) {
    const bayX = canX - c.w * 0.4 + (i % 3) * (c.w * 0.4);
    const bayZ = canZ + (i < 3 ? -1.6 : 2.4);
    if (ch.induction) {
      b.cyl(mats.glow({ color: 0x1b2334, emissive: ch.accent, emissiveIntensity: 1.8 }), 1.05, 0.05, bayX, 0.05, bayZ, 24, 0, 0, 0, { label: 'Inductive charging pad' });
      b.cyl(mats.std({ color: 0x2a3352, roughness: 0.6 }), 1.2, 0.03, bayX, 0.04, bayZ, 24);
    } else {
      b.box(mats.std({ color: ch.color, roughness: 0.4, metalness: 0.3 }), 0.45, 1.55, 0.35, bayX, 0.78, bayZ, 0, 0, 0, { castShadow: true, label: 'DC fast charger — 350 kW' });
      b.plane(mats.glow({ color: 0x101418, emissive: ch.accent, emissiveIntensity: 1.8 }), 0.3, 0.4, bayX, 1.2, bayZ + 0.19, 0, 0, 0, 0);
      b.cyl(mats.std({ color: 0x1a1a1a, roughness: 0.9 }), 0.04, 1.1, bayX + 0.26, 0.9, bayZ, 6, 0, 0, 0.5);
      b.box(mats.std({ color: 0x2f3338, roughness: 0.5 }), 0.14, 0.26, 0.12, bayX + 0.34, 0.5, bayZ);
    }
    // bay markings
    b.plane(mats.std({ color: future ? 0x4a5f8f : 0x3f7f5f, roughness: 0.8, transparent: true, opacity: 0.55 }), 2.4, 4.6, bayX, 0.04, bayZ + (i < 3 ? -2.6 : 2.6), -Math.PI / 2, 0, 0);
  }

  // ---- kiosk / cafe pod --------------------------------------------------
  const k = spec.kiosk;
  const kx = lot.x1 - k.w / 2 - 1.0;
  const kz = cz - depth * 0.3;
  b.box(mats.std({ color: k.color, roughness: 0.45, metalness: 0.3 }), k.w, k.h, k.d, kx, k.h / 2, kz, 0, 0, 0, {
    castShadow: true,
    receiveShadow: true,
    label: future ? 'Autonomy hub control pod' : 'Charge plaza cafe',
  });
  b.plane(
    mats.glow({ color: 0x1a2028, emissive: future ? 0x8fd7ff : 0xffe0b0, emissiveIntensity: 1.5, roughness: 0.2 }),
    k.w * 0.78,
    k.h * 0.42,
    kx,
    k.h * 0.56,
    kz + k.d / 2 + 0.02,
    0,
    0,
    0,
    0,
    { label: 'Serving window' }
  );
  b.box(mats.std({ color: k.trim, roughness: 0.4, metalness: 0.5 }), k.w + 0.5, 0.18, k.d + 0.5, kx, k.h + 0.1, kz, 0, 0, 0, { castShadow: true });
  if (k.roof === 'green') {
    b.box(mats.std({ color: 0x3a4a38, roughness: 0.95 }), k.w, 0.26, k.d, kx, k.h + 0.3, kz);
    b.plane(mats.cutout({ map: leafTex(0x4fa06a, 99) }), k.w, k.d, kx, k.h + 0.55, kz, -Math.PI / 2, 0, 0);
  }
  ctx.lightsWanted.push({ type: 'point', color: future ? 0x8fd7ff : 0xffd9a0, intensity: 8, dist: 12, pos: [kx, k.h * 0.7, kz + k.d] });

  // ---- pylon ------------------------------------------------------------
  buildPylon(ctx, b, spec, { x: lot.x1 - 2.2, z: L.facadeZ + 1.8 });

  // ---- extras -----------------------------------------------------------
  const swY = 0.16;
  for (const ex of spec.extras || []) {
    switch (ex) {
      case 'cafePod': {
        b.cyl(mats.std({ color: 0x2f3a36, roughness: 0.5, metalness: 0.2 }), 1.6, 2.4, lot.x0 + 2.4, 1.2, cz + depth * 0.3, 16, 0, 0, 0, { castShadow: true, label: 'Cafe pod' });
        b.cyl(mats.glow({ color: 0x1a2420, emissive: 0xffd9a0, emissiveIntensity: 1.4 }), 1.62, 0.7, lot.x0 + 2.4, 1.5, cz + depth * 0.3, 16);
        b.cyl(mats.std({ color: 0x5ecf9a, roughness: 0.5 }), 1.75, 0.16, lot.x0 + 2.4, 2.5, cz + depth * 0.3, 16, 0, 0, 0, { castShadow: true });
        break;
      }
      case 'podDock': {
        // kerbside autonomous pod berths
        const dockMat = mats.std({ color: 0x27304a, roughness: 0.5, metalness: 0.4 });
        const glowMat = mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 2.2 });
        for (let i = 0; i < 3; i++) {
          const dx = lot.x0 + 2.0 + i * 3.0;
          b.box(dockMat, 2.6, 0.12, 1.2, dx, 0.1, zFront + 1.4, 0, 0, 0, { label: 'Pod berth ' + (12 + i) });
          b.box(glowMat, 2.5, 0.04, 0.12, dx, 0.18, zFront + 1.95);
          b.cyl(dockMat, 0.1, 2.6, dx - 1.2, 1.3, zFront + 0.9, 8, 0, 0, 0, { castShadow: true });
          b.box(glowMat, 0.12, 0.6, 0.12, dx - 1.2, 2.2, zFront + 0.9);
        }
        const disp = makeAnimatedDisplay({ W: 384, H: 256, kind: 'transit', accent: 0x7cf7ff, fps: 3, seed: 8 });
        const dm = mats.std({ map: disp.texture, emissiveMap: disp.texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.9, roughness: 0.4 });
        b.plane(dm, 1.7, 1.1, lot.x0 + 5.0, 2.6, zFront + 0.85, 0, 0, 0, 0, { label: 'Pod arrivals board' });
        ctx.animated.push(disp);
        break;
      }
      case 'droneTower': {
        const tx = lot.x1 - 3.0;
        const tz = cz - depth * 0.42;
        const tMat = mats.std({ color: 0x2a3352, roughness: 0.5, metalness: 0.5 });
        b.cyl(tMat, 0.35, 9, tx, 4.5, tz, 12, 0, 0, 0, { castShadow: true, label: 'Drone freight tower' });
        for (let i = 0; i < 3; i++) {
          b.cyl(tMat, 1.5, 0.16, tx, 3.2 + i * 2.4, tz, 20, 0, 0, 0, { castShadow: true });
          b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 2.0 }), 1.55, 0.05, tx, 3.3 + i * 2.4, tz, 20);
        }
        ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 10, dist: 16, pos: [tx, 8.4, tz] });
        ctx.dronePads.push({ x: tx, y: 3.3, z: tz });
        ctx.dronePads.push({ x: tx, y: 5.7, z: tz });
        break;
      }
      case 'bikeRepairStand': {
        b.cyl(mats.std({ color: 0x2b3138, roughness: 0.5, metalness: 0.6 }), 0.07, 1.5, lot.x0 + 1.2, 0.75 + swY, zFront + 1.6, 8, 0, 0, 0, { label: 'Public bike repair stand' });
        b.box(mats.std({ color: 0x5ecf9a, roughness: 0.5 }), 0.5, 0.1, 0.1, lot.x0 + 1.2, 1.5 + swY, zFront + 1.6);
        break;
      }
      case 'scooterDock': {
        for (let i = 0; i < 4; i++) buildScooter(ctx, b, { x: lot.x0 + 1.0 + i * 0.72, z: zFront + 2.6, y: swY, rot: Math.PI / 2 });
        b.box(mats.std({ color: 0x2f3338, roughness: 0.6 }), 3.4, 0.1, 0.3, lot.x0 + 2.1, swY + 0.05, zFront + 2.6, 0, 0, 0, { label: 'Scooter dock' });
        break;
      }
      case 'planterRow': {
        for (let i = 0; i < 4; i++) {
          const px = lot.x0 + 1.2 + i * 2.0;
          b.box(mats.std({ color: future ? 0x35405e : 0x6f6a60, roughness: 0.85 }), 1.6, 0.55, 0.9, px, 0.28, zFront - 1.2, 0, 0, 0, { castShadow: true, label: 'Planter' });
          b.plane(mats.cutout({ map: leafTex(future ? 0x4fa06a : 0x4a8c3f, 120 + i) }), 1.6, 1.1, px, 0.95, zFront - 1.2, 0, 0, 0);
        }
        break;
      }
      case 'raingarden': {
        b.plane(mats.std({ color: future ? 0x2a4a3a : 0x3f5a3a, roughness: 0.95 }), w * 0.7, 2.2, cx, 0.05, cz - depth * 0.42, -Math.PI / 2, 0, 0, 0, { label: 'Bioretention rain garden' });
        for (let i = 0; i < 12; i++) {
          b.plane(mats.cutout({ map: leafTex(0x6f9a4a, 130 + i) }), 0.8, 0.9, cx - w * 0.3 + i * (w * 0.055), 0.45, cz - depth * 0.42 + rng.range(-0.8, 0.8), 0, rng.range(0, 3), 0);
        }
        break;
      }
      case 'growRacks': {
        const rackMat = mats.std({ color: 0x2a3340, roughness: 0.6, metalness: 0.4 });
        const growMat = mats.glow({ color: 0x14201c, emissive: 0xff5ce0, emissiveIntensity: 2.0 });
        for (let r = 0; r < 4; r++) {
          for (let cI = 0; cI < 2; cI++) {
            const gx = lot.x0 + 1.6 + cI * 2.6;
            b.box(rackMat, 2.2, 0.08, 0.9, gx, 1.0 + r * 0.8, cz - depth * 0.2);
            b.box(growMat, 2.1, 0.05, 0.8, gx, 1.3 + r * 0.8, cz - depth * 0.2);
            b.plane(mats.cutout({ map: leafTex(0x4fbf6a, 140 + r) }), 2.1, 0.5, gx, 1.2 + r * 0.8, cz - depth * 0.2, 0, 0, 0);
          }
        }
        ctx.lightsWanted.push({ type: 'point', color: 0xff5ce0, intensity: 8, dist: 12, pos: [lot.x0 + 2.8, 2.4, cz - depth * 0.2] });
        break;
      }
      case 'lockerWall': {
        for (let i = 0; i < 4; i++)
          for (let k2 = 0; k2 < 3; k2++) {
            b.box(mats.std({ color: 0x2f3850, roughness: 0.5, metalness: 0.35 }), 0.55, 0.6, 0.5, lot.x0 + 1.0 + i * 0.6, 0.35 + k2 * 0.65, cz - depth * 0.46, 0, 0, 0, {
              label: 'Freight locker',
            });
          }
        break;
      }
      case 'holoBollards': {
        for (let i = 0; i < 6; i++) {
          b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 2.0 }), 0.08, 0.9, lot.x0 + 1.0 + i * 1.4, 0.45 + swY, zFront + 0.6, 10, 0, 0, 0, { label: 'Light bollard' });
        }
        break;
      }
      case 'sidewalkTables': {
        for (let i = 0; i < 2; i++) {
          const tx = lot.x0 + 3.6 + i * 2.2;
          b.cyl(mats.std({ color: 0x3a4038, roughness: 0.6 }), 0.36, 0.06, tx, swY + 0.72, zFront + 2.0, 14, 0, 0, 0, { castShadow: true });
          b.cyl(mats.std({ color: 0x3a4038, roughness: 0.6 }), 0.04, 0.72, tx, swY + 0.36, zFront + 2.0, 8);
        }
        break;
      }
      default:
        break;
    }
  }

  b.build(root, { castShadow: true, receiveShadow: true });
}
