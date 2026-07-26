import * as THREE from 'three';
import { LAYOUT } from '../config/block.js';
import { Batch, wallPlane } from '../lib/geom.js';
import { roadTex, sidewalkTex, roadPaintTex, blobTex, noiseRoughTex } from '../lib/textures.js';
import { makeRng, mixHex } from '../lib/util.js';

const L = LAYOUT;

/**
 * The street surface: roadway, sidewalks, kerbs, painted markings, tram rails,
 * drainage, manholes, puddles and (in 2055) embedded light guideways.
 */
export function buildGround(ctx) {
  const { era, mats, root } = ctx;
  const s = era.street;
  const rng = makeRng('ground' + era.id);
  const b = new Batch('ground');

  const HALF = L.worldHalf;
  const roadMap = roadTex(s.surface === 'cobble' ? 'cobble' : s.surface === 'composite' ? 'composite' : s.surface, {
    seed: 91,
  });
  const wet = era.weather.wet || 0;
  const roadMat = mats.std({
    map: roadMap,
    roughnessMap: noiseRoughTex(7, 3),
    roughness: 0.98 - wet * 0.62,
    metalness: wet * 0.22,
    color: 0xffffff,
  });

  const swMap = sidewalkTex(s.sidewalk);
  const swMat = mats.std({
    map: swMap,
    roughnessMap: noiseRoughTex(9, 4),
    roughness: 0.95 - wet * 0.4,
    metalness: wet * 0.1,
  });

  const curbMat = mats.std({
    color: s.curb === 'granite' ? 0x8d887c : s.curb === 'composite' ? 0x4d5570 : 0xa5a19a,
    roughness: 0.9 - wet * 0.3,
    metalness: 0.02,
  });

  const metalMat = mats.std({ color: 0x54524d, roughness: 0.62, metalness: 0.75 });
  const darkMat = mats.std({ color: 0x1b1a18, roughness: 0.9 });

  // ---- earth base so nothing shows through -------------------------------
  b.plane(mats.std({ color: 0x2a2723, roughness: 1 }), HALF * 4, HALF * 4, 0, -0.06, 0, -Math.PI / 2, 0, 0, 0, {
    receiveShadow: false,
  });

  // ---- roadway ----------------------------------------------------------
  // main avenue (runs east-west)
  b.plane(roadMat, HALF * 2, L.streetHalf * 2, 0, 0.0, 0, -Math.PI / 2, 0, 0, 8, {
    receiveShadow: true,
    label: `Vine Street — ${s.surface}`,
  });
  // cross streets (north-south)
  for (const [x0, x1] of [L.crossWest, L.crossEast]) {
    const w = x1 - x0;
    const cx = (x0 + x1) / 2;
    b.plane(roadMat, w, 46, cx, 0.001, -21, -Math.PI / 2, 0, 0, 8, { receiveShadow: true });
    b.plane(roadMat, w, 40, cx, 0.001, 26, -Math.PI / 2, 0, 0, 8, { receiveShadow: true });
  }

  // ---- sidewalks -------------------------------------------------------
  const swY = L.sidewalkY;
  const northSegs = [
    [L.blockX[0], L.blockX[1]],
    [-HALF, L.crossWest[0]],
    [L.crossWest[1], L.blockX[0]],
    [L.blockX[1], L.crossEast[0]],
    [L.crossEast[1], HALF],
  ];
  const nDepth = L.curbNorthZ - L.facadeZ; // 4.4
  for (const [x0, x1] of northSegs) {
    const w = x1 - x0;
    if (w <= 0.01) continue;
    b.plane(swMat, w, nDepth, (x0 + x1) / 2, swY, L.facadeZ + nDepth / 2, -Math.PI / 2, 0, 0, 4, {
      receiveShadow: true,
    });
    // kerb face + top
    b.box(curbMat, w, swY, 0.34, (x0 + x1) / 2, swY / 2, L.curbNorthZ - 0.17, 0, 0, 0, {
      castShadow: false,
      receiveShadow: true,
    });
  }
  // south sidewalk
  const sDepth = L.sidewalkSouthZ - L.curbSouthZ;
  for (const [x0, x1] of northSegs) {
    const w = x1 - x0;
    if (w <= 0.01) continue;
    b.plane(swMat, w, sDepth, (x0 + x1) / 2, swY, L.curbSouthZ + sDepth / 2, -Math.PI / 2, 0, 0, 4, {
      receiveShadow: true,
    });
    b.box(curbMat, w, swY, 0.34, (x0 + x1) / 2, swY / 2, L.curbSouthZ + 0.17, 0, 0, 0, {
      receiveShadow: true,
    });
  }
  // corner returns along the cross streets
  for (const [x0, x1] of [L.crossWest, L.crossEast]) {
    for (const side of [-1, 1]) {
      const zc = side < 0 ? L.facadeZ + nDepth / 2 : L.curbSouthZ + sDepth / 2;
      const d = side < 0 ? nDepth : sDepth;
      const zEnd = side < 0 ? L.facadeZ - 14 : L.sidewalkSouthZ + 14;
      const len = Math.abs(zEnd - (side < 0 ? L.facadeZ : L.sidewalkSouthZ));
      for (const xx of [x0, x1]) {
        const dir = xx === x0 ? -1 : 1;
        b.plane(swMat, nDepth, len, xx + (dir * nDepth) / 2, swY, zEnd + (side < 0 ? len / 2 : -len / 2), -Math.PI / 2, 0, 0, 4, {
          receiveShadow: true,
        });
      }
      void zc;
      void d;
    }
  }

  // ---- painted markings --------------------------------------------------
  const paintY = 0.014;
  const paintCol = s.markings === 'classic' ? 0xf3f0dc : 0xf4f4ee;
  const wearAmt = s.markings === 'worn' ? 0.55 : s.markings === 'modern' ? 0.12 : 0.25;
  const paintMat = (kind, color = paintCol, w2 = wearAmt) =>
    mats.std({
      map: roadPaintTex(kind, { color, wear: w2 }),
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.75,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

  if (s.markings !== 'none') {
    const flatPaint = mats.std({
      color: paintCol,
      roughness: 0.7,
      transparent: true,
      opacity: s.markings === 'worn' ? 0.62 : 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const yellowPaint = mats.std({
      color: s.markings === 'classic' ? 0xf0e14a : 0xe8c93a,
      roughness: 0.7,
      transparent: true,
      opacity: s.markings === 'worn' ? 0.55 : 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    // centre line (double yellow in later eras, single white in 1965)
    if (s.markings === 'classic') {
      for (let x = -HALF; x < HALF; x += 4) {
        if (inCross(x)) continue;
        b.plane(flatPaint, 2.4, 0.16, x, paintY, 0, -Math.PI / 2);
      }
    } else {
      for (const off of [-0.18, 0.18]) {
        for (let x = -HALF; x < HALF; x += 12) {
          if (inCross(x)) continue;
          b.plane(yellowPaint, 11.2, 0.14, x + 5.6, paintY, off, -Math.PI / 2);
        }
      }
    }
    // lane edge lines
    for (const z of [-L.streetHalf + 0.5, L.streetHalf - 0.5]) {
      for (let x = -HALF; x < HALF; x += 12) {
        if (inCross(x)) continue;
        b.plane(flatPaint, 11.4, 0.12, x + 5.7, paintY, z, -Math.PI / 2);
      }
    }
    // stop lines + crosswalks at both intersections
    for (const [x0, x1] of [L.crossWest, L.crossEast]) {
      for (const xx of [x0 - 0.6, x1 + 0.6]) {
        b.plane(flatPaint, 0.45, L.streetHalf * 2 - 0.6, xx, paintY, 0, -Math.PI / 2, 0, 0);
      }
      const cx = (x0 + x1) / 2;
      if (s.crosswalk === 'continental') {
        for (let i = -4; i <= 4; i++) {
          b.plane(flatPaint, 0.55, L.streetHalf * 2 - 0.4, cx + i * 1.05, paintY + 0.001, 0, -Math.PI / 2);
        }
      } else if (s.crosswalk.startsWith('ladder')) {
        const op = s.crosswalk.endsWith('worn') ? 0.5 : 0.9;
        const lm = mats.std({
          color: paintCol,
          roughness: 0.7,
          transparent: true,
          opacity: op,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        for (const zz of [-L.streetHalf + 0.4, L.streetHalf - 0.4]) {
          b.plane(lm, 5.2, 0.3, cx, paintY + 0.001, zz, -Math.PI / 2);
        }
        for (let i = -3; i <= 3; i++) {
          b.plane(lm, 0.3, L.streetHalf * 2 - 0.8, cx + i * 0.8, paintY + 0.001, 0, -Math.PI / 2);
        }
      }
      // turn arrows
      b.plane(paintMat('arrow'), 2.2, 2.8, cx - 4.2, paintY + 0.001, -2.3, -Math.PI / 2, 0, 0);
      b.plane(paintMat('arrow'), 2.2, 2.8, cx + 4.2, paintY + 0.001, 2.3, -Math.PI / 2, 0, Math.PI);
    }
  }

  // ---- bike lane -------------------------------------------------------
  if (s.bikeLane) {
    const green = mats.std({
      color: 0x1d6b4a,
      roughness: 0.85,
      transparent: true,
      opacity: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    b.plane(green, HALF * 2, 1.7, 0, paintY, -L.streetHalf + 0.95, -Math.PI / 2, 0, 0, 0);
    const bikeSym = paintMat('bike', 0xf4f4ee, 0.1);
    for (let x = -HALF + 8; x < HALF; x += 16) {
      if (inCross(x)) continue;
      b.plane(bikeSym, 1.2, 1.5, x, paintY + 0.002, -L.streetHalf + 0.95, -Math.PI / 2, 0, 0);
    }
    // protective bollard line
    const bol = mats.std({ color: 0xd8dde0, roughness: 0.5, metalness: 0.1 });
    for (let x = -HALF + 3; x < HALF; x += 5) {
      if (inCross(x)) continue;
      b.cyl(bol, 0.07, 0.85, x, 0.42, -L.streetHalf + 1.95, 8);
      b.cyl(mats.glow({ color: 0xe8f0f2, emissive: 0xffe9a8, emissiveIntensity: 0.6 }), 0.075, 0.1, x, 0.8, -L.streetHalf + 1.95, 8);
    }
  }

  // ---- tram rails -------------------------------------------------------
  if (s.tracks === true || s.tracks === 'paved' || s.tracks === 'ghost') {
    const railMat =
      s.tracks === true
        ? mats.std({ color: 0x6e6459, roughness: 0.35, metalness: 0.9 })
        : mats.std({ color: s.tracks === 'paved' ? 0x3f3d3a : 0x45423d, roughness: 0.85, metalness: 0.3 });
    const gaugeOffsets = [-1.9, -0.48, 0.48, 1.9]; // two tracks, 1.435m gauge
    for (const z of gaugeOffsets) {
      for (let x = -HALF; x < HALF; x += 20) {
        if (inCross(x) && s.tracks !== true) continue;
        b.box(railMat, 19.6, s.tracks === true ? 0.05 : 0.02, 0.09, x + 9.8, s.tracks === true ? 0.03 : 0.012, z, 0, 0, 0, {
          receiveShadow: false,
          label: s.tracks === true ? 'Streetcar rail — 1.435 m gauge' : 'Paved-over streetcar rail',
        });
      }
    }
    if (s.tracks === true) {
      // setts either side of the rails
      const sett = mats.std({ map: roadTex('cobble', { seed: 22 }), roughness: 0.95 });
      for (const z of [-1.2, 1.2]) {
        b.plane(sett, HALF * 2, 1.5, 0, 0.006, z, -Math.PI / 2, 0, 0, 2);
      }
    }
  }

  // ---- 2055 light guideways --------------------------------------------
  if (s.lightStrip) {
    const stripMat = mats.glow({
      color: 0x101a2c,
      emissive: 0x66d8ff,
      emissiveIntensity: 2.6,
      roughness: 0.3,
    });
    const stripWarm = mats.glow({
      color: 0x1a1024,
      emissive: 0xff7ad0,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    });
    for (const [z, m] of [
      [-2.6, stripMat],
      [-0.9, stripMat],
      [0.9, stripWarm],
      [2.6, stripWarm],
    ]) {
      for (let x = -HALF; x < HALF; x += 8) {
        b.box(m, 6.4, 0.012, 0.11, x + 3.2, 0.012, z, 0, 0, 0, {
          label: 'Embedded guideway lighting — lane assignment is dynamic',
        });
      }
    }
    // crossing light bars
    for (const [x0, x1] of [L.crossWest, L.crossEast]) {
      const cx = (x0 + x1) / 2;
      for (let i = -4; i <= 4; i++) {
        b.box(mats.glow({ color: 0x0d1526, emissive: 0x9fe8ff, emissiveIntensity: 2.0 }), 0.5, 0.012, L.streetHalf * 2 - 0.4, cx + i * 1.05, 0.013, 0, 0, 0, 0);
      }
    }
  }

  // ---- utilities: manholes, grates, patches -----------------------------
  const manholeMat = mats.std({ color: 0x3a3630, roughness: 0.55, metalness: 0.65 });
  const manholes = [
    [-24, -3.2],
    [-6, 2.6],
    [11, -3.4],
    [24, 3.0],
    [-33, 1.4],
    [32, -1.8],
  ];
  for (const [mx, mz] of manholes) {
    b.cyl(manholeMat, 0.42, 0.03, mx, 0.015, mz, 16, 0, 0, 0, { label: 'Sewer access cover' });
    b.cyl(mats.std({ color: 0x2c2823, roughness: 0.75, metalness: 0.4 }), 0.34, 0.035, mx, 0.026, mz, 16);
  }
  // gutter drains at the kerb
  for (const gx of [-22, -2, 16, 30, -34]) {
    b.box(metalMat, 0.9, 0.1, 0.42, gx, 0.05, L.curbNorthZ + 0.3, 0, 0, 0, { label: 'Storm drain' });
    for (let i = 0; i < 5; i++) b.box(darkMat, 0.82, 0.06, 0.04, gx, 0.09, L.curbNorthZ + 0.14 + i * 0.08);
  }
  // trench patches
  for (let i = 0; i < 7; i++) {
    const px = rng.range(-HALF * 0.8, HALF * 0.8);
    const pw = rng.range(1.4, 5);
    b.plane(
      mats.std({ color: mixHex(0x2b2a28, 0x3d3a35, rng()), roughness: 0.95 }),
      pw,
      rng.range(0.8, 2.4),
      px,
      0.008,
      rng.range(-3.6, 3.6),
      -Math.PI / 2,
      0,
      rng.range(-0.05, 0.05)
    );
  }

  // ---- puddles / wet sheen ---------------------------------------------
  if (wet > 0.3) {
    const puddleMat = mats.std({
      color: 0x1b2026,
      roughness: 0.06,
      metalness: 0.85,
      transparent: true,
      opacity: 0.55 * wet,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    for (let i = 0; i < 16; i++) {
      const px = rng.range(-40, 40);
      const pz = rng.range(-4.2, 4.2);
      const pr = rng.range(0.6, 2.6);
      b.plane(puddleMat, pr * 2, pr * 1.3, px, 0.01, pz, -Math.PI / 2, 0, rng.range(0, 3.14));
    }
    for (let i = 0; i < 8; i++) {
      b.plane(puddleMat, rng.range(0.8, 2.4), rng.range(0.5, 1.4), rng.range(-28, 28), swY + 0.006, rng.range(L.facadeZ + 0.6, L.curbNorthZ - 0.4), -Math.PI / 2, 0, rng.range(0, 3));
    }
  }

  // ---- ground contact shadows (fake AO under the facade line) -----------
  const aoMat = mats.basic({
    map: blobTex(0x000000, 1.6),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  for (let x = L.blockX[0]; x < L.blockX[1]; x += 4) {
    b.plane(aoMat, 5, 2.4, x + 2, swY + 0.01, L.facadeZ + 0.9, -Math.PI / 2, 0, 0);
  }

  b.build(root, { receiveShadow: true });

  function inCross(x) {
    return (
      (x > L.crossWest[0] - 2 && x < L.crossWest[1] + 2) ||
      (x > L.crossEast[0] - 2 && x < L.crossEast[1] + 2)
    );
  }
}

/** Tram overhead wire + span poles (1945 only). */
export function buildTrolleyWires(ctx) {
  const { era, mats, root } = ctx;
  if (!era.street.trolleyWire) return;
  const b = new Batch('wires');
  const wireMat = mats.std({ color: 0x2a2724, roughness: 0.6, metalness: 0.5 });
  const HALF = L.worldHalf;
  // two contact wires above the two tracks, with a slight catenary sag
  for (const z of [-1.19, 1.19]) {
    for (let x = -HALF; x < HALF; x += 4) {
      const t = ((x + HALF) % 24) / 24;
      const sag = Math.sin(t * Math.PI) * 0.16;
      b.box(wireMat, 4.05, 0.028, 0.028, x + 2, 6.6 - sag, z);
    }
  }
  // span wires across the street every 24m
  for (let x = -HALF; x < HALF; x += 24) {
    b.box(wireMat, 0.03, 0.03, 11.6, x, 7.15, 0);
    for (const z of [-1.19, 1.19]) {
      b.box(wireMat, 0.025, 0.55, 0.025, x, 6.85, z);
    }
  }
  b.build(root, { castShadow: false });
}
