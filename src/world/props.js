import * as THREE from 'three';
import { LAYOUT } from '../config/block.js';
import { Batch } from '../lib/geom.js';
import { leafTex, graffitiTex, posterWallTex, coneGlowTex, blobTex, corrugatedTex } from '../lib/textures.js';
import { placardTex, storefrontSign, makeAnimatedDisplay, wallAdTex } from '../lib/signs.js';
import { makeRng, mixHex, shade, TAU, lerp } from '../lib/util.js';
import { buildDumpster } from './specials.js';
import { buildBicycle, buildScooter } from './storefront.js';

const L = LAYOUT;
const swY = L.sidewalkY;

/**
 * Everything between the building line and the kerb. This is where an era
 * gives itself away fastest: the shape of a lamp post, whether there is a
 * payphone, whether the bin is a wire basket or a solar compactor.
 */
export function buildStreetProps(ctx) {
  const { era, mats, root } = ctx;
  const s = era.street;
  const b = new Batch('props');
  const rng = makeRng('props' + era.id);

  const kerbN = L.curbNorthZ;
  const kerbS = L.curbSouthZ;
  const nearKerbN = kerbN - 0.75;
  const nearKerbS = kerbS + 0.75;

  // -------------------------------------------------------------- lamps
  const lampXs = [-33, -21.5, -9, 3.5, 16, 25.5, 33];
  for (const lx of lampXs) {
    buildLamp(ctx, b, { x: lx, z: nearKerbN, kind: s.lamp, flip: false });
    if (Math.abs(lx) < 30) buildLamp(ctx, b, { x: lx + 6, z: nearKerbS, kind: s.lamp, flip: true });
  }

  // ------------------------------------------------- traffic signals
  for (const [x0, x1] of [L.crossWest, L.crossEast]) {
    buildSignal(ctx, b, { x: x1 + 1.2, z: kerbN - 0.8, kind: s.signal, rotY: Math.PI });
    buildSignal(ctx, b, { x: x0 - 1.2, z: kerbS + 0.8, kind: s.signal, rotY: 0 });
    // street name blades
    buildStreetNameSign(ctx, b, { x: x1 + 1.2, z: kerbN - 0.8, era });
  }

  // ------------------------------------------------------ wooden poles
  if (s.poles === 'wood' || s.poles === 'concrete') {
    const poleXs = [-30, -14, 6, 22, 34];
    const poleMat =
      s.poles === 'wood'
        ? mats.std({ color: 0x5f4a34, roughness: 0.98 })
        : mats.std({ color: 0x9c9890, roughness: 0.9 });
    for (const px of poleXs) {
      const h = 9.5;
      b.cyl(poleMat, 0.17, h, px, h / 2, nearKerbS + 0.3, 8, 0, 0, 0, {
        castShadow: true,
        label: s.poles === 'wood' ? 'Timber utility pole' : 'Concrete utility pole',
      });
      // crossarms + insulators
      for (const [ay, aw] of [
        [8.4, 2.6],
        [7.5, 2.0],
      ]) {
        b.box(poleMat, aw, 0.14, 0.14, px, ay, nearKerbS + 0.3, 0, 0, 0, { castShadow: true });
        for (let i = -2; i <= 2; i++) {
          if (i === 0) continue;
          b.cyl(mats.std({ color: 0x4a6b5a, roughness: 0.35 }), 0.07, 0.18, px + (i * aw) / 5, ay + 0.16, nearKerbS + 0.3, 8);
        }
      }
      // transformer can
      if (px === -14 || px === 22) {
        b.cyl(mats.std({ color: 0x8d8a82, roughness: 0.7, metalness: 0.4 }), 0.42, 1.1, px + 0.5, 6.6, nearKerbS + 0.3, 12, 0, 0, 0, { castShadow: true, label: 'Pole transformer' });
      }
      // stapled staple-gun flyers
      if (era.id === '1985' || era.id === '2005') {
        b.plane(mats.std({ map: posterWallTex(era.id, { seed: 66 }), roughness: 0.9 }), 0.34, 0.46, px, 1.9, nearKerbS + 0.13, 0, 0, rng.range(-0.15, 0.15), 0);
      }
    }
    // spans between poles
    const wireMat = mats.std({ color: 0x22201d, roughness: 0.7 });
    for (let i = 0; i < poleXs.length - 1; i++) {
      const a = poleXs[i];
      const c = poleXs[i + 1];
      const span = c - a;
      const segs = 8;
      for (const wy of [8.4, 7.5]) {
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs;
          const t1 = (k + 1) / segs;
          const y0 = wy - Math.sin(t0 * Math.PI) * 0.5;
          const y1 = wy - Math.sin(t1 * Math.PI) * 0.5;
          const midY = (y0 + y1) / 2;
          const dx = span / segs;
          const ang = Math.atan2(y1 - y0, dx);
          b.box(wireMat, Math.hypot(dx, y1 - y0), 0.025, 0.025, a + dx * (k + 0.5), midY, nearKerbS + 0.3, 0, 0, ang);
        }
      }
    }
  }

  // ---------------------------------------------------------- hydrants
  for (const [hx, hz] of [
    [-25.5, nearKerbN],
    [12.5, nearKerbN],
    [-2, nearKerbS],
  ]) {
    buildHydrant(ctx, b, { x: hx, z: hz, kind: s.hydrant });
  }

  // ----------------------------------------------------------- mailbox
  buildMailbox(ctx, b, { x: -19.5, z: nearKerbN, kind: s.mailbox });

  // ------------------------------------------------------------- bins
  const binXs = [-23.5, -11.5, 5.5, 20.5];
  for (const bx of binXs) buildTrash(ctx, b, { x: bx, z: nearKerbN, kind: s.trash, rng });

  // ------------------------------------------------------ phones
  if (s.phone === 'booth') {
    buildPhoneBooth(ctx, b, ctx, { x: -16.5, z: nearKerbN - 0.2 });
  } else if (s.phone === 'payphone' || s.phone === 'payphone-slim') {
    buildPayphone(ctx, b, { x: -16.5, z: kerbN - 1.1, slim: s.phone === 'payphone-slim', graffiti: s.graffiti });
    buildPayphone(ctx, b, { x: 8.5, z: kerbN - 1.1, slim: s.phone === 'payphone-slim', graffiti: s.graffiti });
  }

  // ------------------------------------------------------ parking meters
  if (s.meters === true) {
    for (let x = -26; x < 27; x += 2.6) {
      if (x > -1 && x < 1) continue;
      buildMeter(ctx, b, { x, z: kerbN - 0.5 });
    }
  } else if (s.meters === 'kiosk') {
    for (const mx of [-20, 6, 22]) buildMeterKiosk(ctx, b, { x: mx, z: kerbN - 0.6 });
  }

  // ------------------------------------------------------- bus / pod stop
  buildTransitStop(ctx, b, { x: -6.5, z: nearKerbN, kind: s.busStop, era });

  // ---------------------------------------------------------- newsstand
  if (s.newsstand) buildNewsstand(ctx, b, { x: 27.2, z: kerbN - 1.6, era });

  // ------------------------------------------------------------ benches
  if (era.id !== '1985') {
    for (const bx of [-27, 18]) {
      const wood = mats.std({ color: era.id === '2055' ? 0x3a4358 : era.id === '1945' ? 0x5f4a30 : 0x6b5a42, roughness: 0.9 });
      const legMat = mats.std({ color: era.id === '1945' ? 0x2a2622 : 0x54585c, roughness: 0.5, metalness: 0.6 });
      for (let i = 0; i < 5; i++) b.box(wood, 1.8, 0.06, 0.12, bx, swY + 0.44, L.facadeZ + 1.6 + i * 0.14, 0, 0, 0, { castShadow: true, label: 'Bench' });
      for (let i = 0; i < 4; i++) b.box(wood, 1.8, 0.12, 0.06, bx, swY + 0.6 + i * 0.14, L.facadeZ + 2.05, 0, 0, 0);
      for (const sgn of [-1, 1]) {
        b.box(legMat, 0.08, 0.44, 0.5, bx + sgn * 0.8, swY + 0.22, L.facadeZ + 1.8);
        b.box(legMat, 0.08, 0.66, 0.08, bx + sgn * 0.8, swY + 0.55, L.facadeZ + 2.05);
      }
      if (era.id === '2055') {
        b.box(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 1.6 }), 1.8, 0.03, 0.06, bx, swY + 0.4, L.facadeZ + 1.55);
      }
    }
  }

  // ---------------------------------------------------------- bike racks
  if (s.bikeRack) {
    for (const bx of [-13, 15]) {
      const rm = mats.std({ color: 0x54585c, roughness: 0.45, metalness: 0.7 });
      for (let i = 0; i < 2; i++) {
        const rx = bx + i * 1.1;
        b.cyl(rm, 0.05, 0.9, rx - 0.35, swY + 0.45, kerbN - 1.3, 8);
        b.cyl(rm, 0.05, 0.9, rx + 0.35, swY + 0.45, kerbN - 1.3, 8);
        b.cyl(rm, 0.05, 0.7, rx, swY + 0.9, kerbN - 1.3, 8, 0, 0, Math.PI / 2, { label: 'Inverted-U bike rack' });
      }
      buildBicycle(ctx, b, { x: bx + 0.2, z: kerbN - 1.3, y: swY, rot: 0.05, color: 0x2b6cb0 });
    }
  }

  // ------------------------------------------------------------ planters
  if (s.planters) {
    for (const px of [-29, -4, 11, 24]) {
      const pm = mats.std({ color: era.id === '2055' ? 0x35405e : 0x8d8579, roughness: 0.88 });
      b.box(pm, 1.5, 0.6, 1.0, px, swY + 0.3, kerbN - 1.1, 0, 0, 0, { castShadow: true, label: 'Street planter' });
      b.box(mats.std({ color: 0x4a3a2a, roughness: 1 }), 1.34, 0.1, 0.86, px, swY + 0.61, kerbN - 1.1);
      const lm = mats.cutout({ map: leafTex(era.id === '2055' ? 0x4fa06a : 0x4a8c3f, 200 + px) });
      b.plane(lm, 1.5, 1.1, px, swY + 1.05, kerbN - 1.1, 0, 0, 0);
      b.plane(lm, 1.5, 1.1, px, swY + 1.05, kerbN - 1.1, 0, Math.PI / 2, 0);
    }
  }

  // --------------------------------------------------------- EV chargers
  if (s.evCharger === true) {
    for (const ex of [-15.5, 19.5]) {
      b.box(mats.std({ color: 0xe9edf0, roughness: 0.4, metalness: 0.3 }), 0.4, 1.4, 0.3, ex, swY + 0.7, kerbN - 0.55, 0, 0, 0, { castShadow: true, label: 'Kerbside EV charger' });
      b.plane(mats.glow({ color: 0x101418, emissive: 0x5ecf9a, emissiveIntensity: 1.8 }), 0.26, 0.32, ex, swY + 1.05, kerbN - 0.4, 0, 0, 0, 0);
      b.cyl(mats.std({ color: 0x1a1a1a, roughness: 0.9 }), 0.035, 0.9, ex + 0.24, swY + 0.8, kerbN - 0.55, 6, 0, 0, 0.5);
    }
  }

  // ------------------------------------------------------------- parklet
  if (s.parklet) {
    buildParklet(ctx, b, { x: -8.5, z: kerbN + 1.3, era });
  }

  // ------------------------------------------------------------ scooters
  if (s.scooters) {
    for (let i = 0; i < 3; i++) buildScooter(ctx, b, { x: 12 + i * 0.8, z: kerbN - 1.5, y: swY, rot: Math.PI / 2 + rng.range(-0.15, 0.15) });
    buildScooter(ctx, b, { x: -26, z: kerbN - 1.2, y: swY, rot: rng.range(0, 3) });
  }

  // ------------------------------------------------------------- dumpster
  if (s.dumpster) {
    buildDumpster(ctx, b, { x: L.crossWest[1] + 2.2, z: L.facadeZ - 3.5, rot: Math.PI / 2 + 0.1 });
  }

  // ------------------------------------------------ fire alarm / call box
  if (era.id === '1945' || era.id === '1965') {
    const px = 22.5;
    b.cyl(mats.std({ color: 0x8c2f2a, roughness: 0.6, metalness: 0.3 }), 0.08, 1.5, px, swY + 0.75, kerbN - 0.6, 8, 0, 0, 0);
    b.box(mats.std({ color: 0x8c2f2a, roughness: 0.55, metalness: 0.3 }), 0.34, 0.5, 0.26, px, swY + 1.6, kerbN - 0.6, 0, 0, 0, { castShadow: true, label: 'Fire alarm call box' });
    b.sphere(mats.glow({ color: 0x8c2f2a, emissive: 0xff5533, emissiveIntensity: 1.2 }), 0.09, px, swY + 1.92, kerbN - 0.6, 8);
  }

  // ---------------------------------------------------- regulatory signs
  const signPost = (x, z, texture, h = 2.3, w2 = 0.42, h2 = 0.62, label = 'Street sign') => {
    b.cyl(mats.std({ color: 0x9c9890, roughness: 0.5, metalness: 0.5 }), 0.035, h, x, swY + h / 2, z, 8);
    b.plane(mats.std({ map: texture, roughness: 0.5, side: THREE.DoubleSide }), w2, h2, x, swY + h - h2 / 2, z + 0.02, 0, 0, 0, 0, { label });
  };
  const noParking = placardTex({
    W: 128,
    H: 192,
    bg: 0xf4f4f0,
    fg: 0xc0392b,
    title: 'NO',
    rows: ['PARKING', '8AM-6PM', 'TOW AWAY'],
    font: 'Arial, sans-serif',
    wear: era.id === '1985' ? 0.4 : 0.1,
  });
  signPost(-30.5, kerbN - 0.5, noParking, 2.3, 0.4, 0.6, 'No parking sign');
  signPost(9.5, kerbN - 0.5, noParking, 2.3, 0.4, 0.6, 'No parking sign');
  if (era.id === '2025' || era.id === '2055') {
    const loading = placardTex({
      W: 128,
      H: 192,
      bg: 0xf4f4f0,
      fg: 0x1f6f5c,
      title: era.id === '2055' ? 'POD' : 'LOADING',
      rows: era.id === '2055' ? ['PICKUP', 'ONLY'] : ['ZONE', '15 MIN'],
      font: 'Arial, sans-serif',
      wear: 0.05,
    });
    signPost(-1.5, kerbN - 0.5, loading, 2.3, 0.4, 0.6, era.id === '2055' ? 'Pod pickup zone' : 'Loading zone');
  }

  // ------------------------------------------------------------- litter
  const litterCount = Math.round(s.litter * 30);
  const litterMats = [
    mats.std({ color: 0xd8d2c0, roughness: 0.9 }),
    mats.std({ color: 0xb0402f, roughness: 0.8 }),
    mats.std({ color: 0x8a8f94, roughness: 0.8, metalness: 0.4 }),
    mats.std({ color: 0x2f3a2a, roughness: 0.9 }),
  ];
  for (let i = 0; i < litterCount; i++) {
    const lx = rng.range(-34, 34);
    const onSidewalk = rng() < 0.6;
    const lz = onSidewalk ? rng.range(L.facadeZ + 0.5, kerbN - 0.2) : rng.range(kerbN + 0.2, kerbN + 1.2);
    const m = litterMats[i % litterMats.length];
    if (rng() < 0.5) {
      b.plane(m, rng.range(0.12, 0.3), rng.range(0.16, 0.34), lx, (onSidewalk ? swY : 0) + 0.012, lz, -Math.PI / 2, 0, rng.range(0, 3));
    } else {
      b.cyl(m, rng.range(0.03, 0.055), rng.range(0.08, 0.14), lx, (onSidewalk ? swY : 0) + 0.04, lz, 8, Math.PI / 2, rng.range(0, 3), 0);
    }
  }
  // fallen leaves / windblown paper drifts at the kerb
  if (era.id !== '2055') {
    for (let i = 0; i < 8; i++) {
      b.plane(
        mats.basic({ map: blobTex(era.id === '1945' ? 0x6b5a3a : 0x4a4a44, 2.4), transparent: true, opacity: 0.28, depthWrite: false }),
        rng.range(1.4, 3.2),
        rng.range(0.5, 1.0),
        rng.range(-32, 32),
        0.02,
        kerbN + 0.35,
        -Math.PI / 2,
        0,
        0
      );
    }
  }

  // ------------------------------------------------------- 2055 additions
  if (s.skybridge) buildSkybridge(ctx, b);
  if (s.lightStrip) {
    // kerb edge glow
    const km = mats.glow({ color: 0x1b2334, emissive: 0x5f7fd8, emissiveIntensity: 1.6 });
    for (let x = -L.worldHalf; x < L.worldHalf; x += 6) {
      b.box(km, 5.6, 0.04, 0.06, x + 2.8, swY - 0.02, kerbN - 0.02);
      b.box(km, 5.6, 0.04, 0.06, x + 2.8, swY - 0.02, kerbS + 0.02);
    }
  }
  if (s.trash === 'chute') {
    for (const cx2 of [-20, 14]) {
      b.cyl(mats.std({ color: 0x2f3850, roughness: 0.5, metalness: 0.4 }), 0.4, 1.2, cx2, swY + 0.6, kerbN - 1.0, 12, 0, 0, 0, { castShadow: true, label: 'Pneumatic waste chute' });
      b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 1.5 }), 0.42, 0.06, cx2, swY + 1.22, kerbN - 1.0, 12);
    }
  }
  if (s.mailbox === 'locker') {
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++)
        b.box(mats.std({ color: 0x2f3850, roughness: 0.5, metalness: 0.35 }), 0.5, 0.55, 0.45, -12 + i * 0.55, swY + 0.32 + k * 0.6, L.facadeZ + 0.8, 0, 0, 0, { label: 'Parcel locker' });
  }

  b.build(root, { castShadow: true, receiveShadow: true });
}

// ---------------------------------------------------------------------------
function buildLamp(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, kind, flip } = o;
  const dark = mats.std({ color: 0x2a2724, roughness: 0.6, metalness: 0.4 });
  const grey = mats.std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.55 });
  const dir = flip ? -1 : 1;

  if (kind === 'iron-globe') {
    // fluted cast-iron column with a single opal globe
    b.cyl(dark, 0.28, 0.5, x, swY + 0.25, z, 12, 0, 0, 0, { castShadow: true });
    b.cyl(dark, 0.2, 0.4, x, swY + 0.7, z, 12);
    b.cyl(dark, 0.11, 3.6, x, swY + 2.6, z, 12, 0, 0, 0, { castShadow: true, label: 'Cast-iron lamp standard (1912)' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.box(dark, 0.03, 3.4, 0.03, x + Math.cos(a) * 0.11, swY + 2.6, z + Math.sin(a) * 0.11);
    }
    b.cyl(dark, 0.2, 0.28, x, swY + 4.5, z, 12);
    b.sphere(mats.glow({ color: 0xf0ead8, emissive: 0xffe0a8, emissiveIntensity: 2.6 }), 0.34, x, swY + 4.95, z, 16, { label: 'Opal glass globe' });
    b.cyl(dark, 0.09, 0.3, x, swY + 5.3, z, 8);
    ctx.lightsWanted.push({ type: 'point', color: 0xffd9a0, intensity: era.id === '1945' ? 10 : 8, dist: 15, pos: [x, swY + 4.95, z] });
    // trolley pole bracket
    if (era.street.trolleyWire) {
      b.box(dark, 0.08, 0.08, 2.2, x, 6.8, z + dir * -1.1, 0, 0, 0);
    }
  } else if (kind === 'cobra' || kind === 'sodium') {
    const isSodium = kind === 'sodium';
    b.cyl(grey, 0.22, 0.4, x, swY + 0.2, z, 10);
    b.cyl(grey, 0.13, 8.0, x, swY + 4.2, z, 10, 0, 0, 0, { castShadow: true, label: isSodium ? 'High-pressure sodium cobra-head' : 'Mercury-vapour cobra-head (1965)' });
    // curved arm
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const ang = t * 1.1;
      b.cyl(grey, 0.1, 0.65, x, swY + 8.1 + Math.sin(ang) * 0.5, z - dir * (t * 2.1 + 0.2), 8, Math.PI / 2 - ang * 0.9, 0, 0);
    }
    b.box(grey, 0.5, 0.22, 1.1, x, swY + 8.45, z - dir * 2.4, 0.1, 0, 0, { castShadow: true });
    b.box(mats.glow({ color: 0xd8d2c0, emissive: isSodium ? 0xffb457 : 0xd8e4ff, emissiveIntensity: 3.0 }), 0.42, 0.1, 0.8, x, swY + 8.3, z - dir * 2.45);
    ctx.lightsWanted.push({
      type: 'point',
      color: isSodium ? 0xffa845 : 0xd8e4ff,
      intensity: isSodium ? 26 : 22,
      dist: 30,
      pos: [x, swY + 8.2, z - dir * 2.4],
    });
    if (isSodium) ctx.lampGlows.push({ x, y: swY + 8.2, z: z - dir * 2.4, color: 0xffa845 });
  } else if (kind === 'shoebox' || kind === 'led-arm') {
    const led = kind === 'led-arm';
    b.cyl(grey, 0.2, 0.35, x, swY + 0.18, z, 12);
    b.cyl(grey, 0.11, 7.4, x, swY + 3.9, z, 12, 0, 0, 0, { castShadow: true, label: led ? 'LED street light (4000 K)' : 'Metal-halide shoebox luminaire' });
    b.box(grey, 0.12, 0.12, 1.8, x, swY + 7.6, z - dir * 0.9, 0, 0, 0);
    b.box(grey, 0.7, 0.16, 0.5, x, swY + 7.55, z - dir * 1.9, 0.05, 0, 0, { castShadow: true });
    b.box(mats.glow({ color: 0xdedede, emissive: led ? 0xf0f6ff : 0xffeedd, emissiveIntensity: 3.4 }), 0.6, 0.06, 0.4, x, swY + 7.46, z - dir * 1.9);
    ctx.lightsWanted.push({ type: 'point', color: led ? 0xf0f6ff : 0xfff0dd, intensity: 20, dist: 26, pos: [x, swY + 7.4, z - dir * 1.9] });
    if (led) {
      // small comms/sensor pod, because everything is a sensor now
      b.box(mats.std({ color: 0x3a3f44, roughness: 0.5 }), 0.22, 0.3, 0.2, x, swY + 6.6, z - dir * 0.2, 0, 0, 0, { label: 'Smart-city sensor node' });
    }
  } else if (kind === 'halo') {
    // 2055: a floating luminous ring on a slim mast
    b.cyl(mats.std({ color: 0x2a3352, roughness: 0.4, metalness: 0.6 }), 0.09, 6.6, x, swY + 3.3, z, 10, 0, 0, 0, { castShadow: true, label: 'Halo luminaire' });
    const ring = mats.glow({ color: 0x18203a, emissive: 0xbfe4ff, emissiveIntensity: 3.2 });
    b.cyl(ring, 0.95, 0.09, x, swY + 6.7, z - dir * 0.5, 26);
    b.cyl(ring, 0.72, 0.05, x, swY + 6.66, z - dir * 0.5, 26);
    b.box(mats.std({ color: 0x2a3352, roughness: 0.4, metalness: 0.6 }), 0.09, 0.09, 1.1, x, swY + 6.7, z - dir * 0.05);
    ctx.lightsWanted.push({ type: 'point', color: 0xbfe4ff, intensity: 24, dist: 26, pos: [x, swY + 6.6, z - dir * 0.5] });
    ctx.lampGlows.push({ x, y: swY + 6.6, z: z - dir * 0.5, color: 0xbfe4ff });
  }
}

// ---------------------------------------------------------------------------
function buildSignal(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, kind, rotY } = o;
  const body = mats.std({ color: kind === 'pedestal' ? 0x1f3f2f : kind === 'holo' ? 0x2a3352 : 0x3a4a3f, roughness: 0.6, metalness: 0.3 });
  const pole = mats.std({ color: kind === 'pedestal' ? 0x1f3f2f : 0x8a8d90, roughness: 0.5, metalness: 0.55 });
  const lens = (c, on) => mats.glow({ color: shade(c, -0.5), emissive: c, emissiveIntensity: on ? 3.2 : 0.15 });

  if (kind === 'pedestal') {
    // 1940s four-way pedestal signal in the middle of the crossing
    b.cyl(pole, 0.34, 0.7, x, 0.35, z, 12, 0, 0, 0, { castShadow: true });
    b.cyl(pole, 0.12, 2.4, x, 1.7, z, 10, 0, 0, 0, { castShadow: true, label: 'Pedestal traffic signal (1930s pattern)' });
    b.box(body, 0.5, 1.3, 0.5, x, 3.3, z, 0, 0, 0, { castShadow: true });
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const dx = Math.sin(ry) * 0.26;
      const dz = Math.cos(ry) * 0.26;
      b.cyl(lens(0xd83a2a, ry === 0), 0.11, 0.06, x + dx, 3.72, z + dz, 10, Math.PI / 2, 0, 0);
      b.cyl(lens(0xd8b02a, false), 0.11, 0.06, x + dx, 3.3, z + dz, 10, Math.PI / 2, 0, 0);
      b.cyl(lens(0x3aa84a, ry !== 0), 0.11, 0.06, x + dx, 2.88, z + dz, 10, Math.PI / 2, 0, 0);
      // eyebrow visors
      b.cyl(body, 0.13, 0.12, x + dx * 1.4, 3.78, z + dz * 1.4, 10, Math.PI / 2, 0, 0);
    }
    b.cyl(body, 0.2, 0.3, x, 4.1, z, 12);
    b.sphere(mats.glow({ color: 0xd8d2c0, emissive: 0xffe0a8, emissiveIntensity: 1.6 }), 0.14, x, 4.35, z, 10);
    ctx.lightsWanted.push({ type: 'point', color: 0xffd9a0, intensity: 4, dist: 8, pos: [x, 4.3, z] });
  } else if (kind === 'holo') {
    b.cyl(pole, 0.16, 5.4, x, 2.7, z, 10, 0, 0, 0, { castShadow: true });
    b.box(pole, 0.12, 0.12, 4.5, x, 5.3, z + 2.2, 0, 0, 0);
    const em = mats.glow({ color: 0x18203a, emissive: 0x7cf7ff, emissiveIntensity: 2.6 });
    b.cyl(em, 0.5, 0.08, x, 5.1, z + 4.2, 20, 0, 0, 0, { label: 'Holographic signal gantry — advisory only, vehicles negotiate directly' });
    const disp = makeAnimatedDisplay({ W: 256, H: 128, kind: 'holo', accent: 0x7cf7ff, lines: ['CLEAR', 'YIELD', 'FLOW'], fps: 6, seed: 4 });
    const hm = ctx.mats.holoMaterial(disp.texture, 0x7cf7ff, 1.4);
    b.plane(hm, 1.6, 0.8, x, 4.4, z + 4.2, 0, 0, 0, 0, { label: 'Signal advisory hologram' });
    ctx.animated.push(disp);
    ctx.holos.push({ mat: hm, base: 1.4, seed: 5 });
    ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 5, dist: 10, pos: [x, 5.0, z + 4.2] });
  } else {
    // mast arm signal
    const led = kind === 'mast-led';
    const old = kind === 'mast-old';
    b.cyl(pole, 0.26, 0.6, x, 0.3, z, 12, 0, 0, 0, { castShadow: true });
    b.cyl(pole, 0.16, 6.4, x, 3.4, z, 12, 0, 0, 0, { castShadow: true, label: led ? 'LED signal on mast arm' : 'Mast-arm traffic signal' });
    b.box(pole, 0.14, 0.14, 6.0, x, 6.4, z + 3.0, 0, 0, 0, { castShadow: true });
    for (let i = 0; i < 2; i++) {
      const hx = x;
      const hz = z + 2.0 + i * 2.6;
      b.box(body, 0.44, 1.24, 0.42, hx, 5.6, hz, 0, 0, 0, { castShadow: true });
      b.cyl(lens(0xd83a2a, i === 0), 0.11, 0.07, hx, 6.02, hz + 0.22, 10, Math.PI / 2, 0, 0);
      b.cyl(lens(0xd8b02a, false), 0.11, 0.07, hx, 5.6, hz + 0.22, 10, Math.PI / 2, 0, 0);
      b.cyl(lens(0x3aa84a, i !== 0), 0.11, 0.07, hx, 5.18, hz + 0.22, 10, Math.PI / 2, 0, 0);
      if (!old) b.box(body, 0.5, 0.16, 0.2, hx, 6.24, hz + 0.24);
    }
    // pedestrian signal + push button
    b.box(body, 0.42, 0.5, 0.3, x + 0.3, 2.9, z + 0.1, 0, 0, 0, { castShadow: true, label: 'Pedestrian signal' });
    b.plane(mats.glow({ color: 0x101010, emissive: old ? 0xff6a3a : 0xff5533, emissiveIntensity: 2.2 }), 0.3, 0.34, x + 0.3, 2.9, z + 0.26, 0, 0, 0, 0);
    if (!old) {
      b.box(mats.std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.5 }), 0.16, 0.24, 0.12, x - 0.22, 1.15, z + 0.1, 0, 0, 0, { label: 'Push button' });
    }
    if (led) {
      // countdown timer + camera
      b.box(mats.std({ color: 0x3a3f44, roughness: 0.5 }), 0.2, 0.2, 0.34, x, 6.9, z + 2.0, 0, 0, 0, { label: 'Signal camera' });
    }
  }
}

function buildStreetNameSign(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z } = o;
  const isOld = era.id === '1945' || era.id === '1965';
  const bg = isOld ? 0x1f4f3f : era.id === '2055' ? 0x101c34 : 0x1f6f4f;
  const fg = isOld ? 0xe8e2d2 : 0xffffff;
  const t1 = placardTex({ W: 256, H: 64, bg, fg, title: 'VINE ST', rows: [], font: isOld ? 'Georgia, serif' : 'Arial, sans-serif', wear: era.id === '1985' ? 0.35 : 0.08 });
  const t2 = placardTex({ W: 256, H: 64, bg, fg, title: '4th AVE', rows: [], font: isOld ? 'Georgia, serif' : 'Arial, sans-serif', wear: era.id === '1985' ? 0.35 : 0.08 });
  const mat1 = mats.std({ map: t1, roughness: 0.5, side: THREE.DoubleSide, emissive: era.id === '2055' ? new THREE.Color(0x7cf7ff) : undefined, emissiveIntensity: era.id === '2055' ? 0.5 : 0 });
  const mat2 = mats.std({ map: t2, roughness: 0.5, side: THREE.DoubleSide, emissive: era.id === '2055' ? new THREE.Color(0x7cf7ff) : undefined, emissiveIntensity: era.id === '2055' ? 0.5 : 0 });
  b.plane(mat1, 1.5, 0.36, x, 4.6, z, 0, 0, 0, 0, { label: 'Street name blade — Vine Street' });
  b.plane(mat2, 1.5, 0.36, x, 4.2, z, 0, Math.PI / 2, 0, 0, { label: 'Street name blade — 4th Avenue' });
}

// ---------------------------------------------------------------------------
function buildHydrant(ctx, b, o) {
  const { mats } = ctx;
  const { x, z, kind } = o;
  const col = kind === 'victorian' ? 0x1f5f3f : kind === 'flush' ? 0x3a4358 : 0xc0392b;
  const m = mats.std({ color: col, roughness: kind === 'flush' ? 0.4 : 0.62, metalness: 0.25 });
  if (kind === 'flush') {
    b.cyl(m, 0.34, 0.14, x, swY + 0.07, z, 16, 0, 0, 0, { label: 'Flush-mounted hydrant point' });
    b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 1.4 }), 0.28, 0.03, x, swY + 0.15, z, 16);
    return;
  }
  b.cyl(m, 0.24, 0.14, x, swY + 0.07, z, 12, 0, 0, 0, { castShadow: true });
  b.cyl(m, 0.17, 0.7, x, swY + 0.47, z, 12, 0, 0, 0, { castShadow: true, label: kind === 'victorian' ? 'Fire hydrant (Victorian pattern)' : 'Fire hydrant' });
  b.cyl(m, 0.2, 0.12, x, swY + 0.86, z, 12);
  if (kind === 'victorian') {
    b.sphere(m, 0.19, x, swY + 1.0, z, 12, { castShadow: true });
    b.cyl(m, 0.05, 0.16, x, swY + 1.18, z, 8);
  } else {
    b.cyl(m, 0.16, 0.22, x, swY + 1.02, z, 12, 0, 0, 0, { castShadow: true });
    b.box(m, 0.42, 0.1, 0.1, x, swY + 1.16, z);
  }
  // side outlets
  for (const s of [-1, 1]) b.cyl(m, 0.08, 0.18, x + s * 0.2, swY + 0.6, z, 8, 0, 0, Math.PI / 2);
  b.cyl(m, 0.09, 0.16, x, swY + 0.6, z + 0.2, 8, Math.PI / 2, 0, 0);
}

function buildMailbox(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, kind } = o;
  if (kind === 'locker') return;
  const col = kind === 'olive' ? 0x3f4a35 : 0x1f4f9c;
  const m = mats.std({ color: col, roughness: 0.55, metalness: 0.3 });
  if (kind === 'olive') {
    // 1940s lamp-post box: small, mounted on a post
    b.cyl(mats.std({ color: 0x2a2724, roughness: 0.6 }), 0.06, 1.3, x, swY + 0.65, z, 8);
    b.box(m, 0.44, 0.62, 0.36, x, swY + 1.5, z, 0, 0, 0, { castShadow: true, label: 'US Mail letter box (1940s)' });
    b.cyl(m, 0.22, 0.36, x, swY + 1.81, z, 14, 0, 0, Math.PI / 2, { castShadow: true });
    b.box(mats.std({ color: 0x2f3a2a, roughness: 0.7 }), 0.3, 0.09, 0.06, x, swY + 1.62, z + 0.19);
  } else {
    b.box(m, 0.75, 1.0, 0.62, x, swY + 0.6, z, 0, 0, 0, { castShadow: true, label: 'Collection box' });
    b.cyl(m, 0.38, 0.72, x, swY + 1.24, z, 16, 0, 0, Math.PI / 2, { castShadow: true });
    b.box(mats.std({ color: shade(col, -0.3), roughness: 0.6 }), 0.5, 0.14, 0.1, x, swY + 1.3, z + 0.32);
    for (const s of [-1, 1]) b.box(mats.std({ color: 0x3a3f44, roughness: 0.6 }), 0.08, 0.6, 0.08, x + s * 0.3, swY + 0.3, z);
    if (era.street.graffiti > 0.5) {
      b.plane(mats.std({ map: graffitiTex({ amount: 0.5, seed: 31 }), transparent: true, alphaTest: 0.05, roughness: 0.9 }), 0.7, 0.5, x, swY + 0.75, z + 0.32, 0, 0, 0);
    }
  }
}

function buildTrash(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, kind, rng } = o;
  if (kind === 'ashcan') {
    const m = mats.std({ color: 0x4a5040, roughness: 0.8, metalness: 0.35 });
    b.cyl(m, 0.3, 0.9, x, swY + 0.45, z, 14, 0, 0, 0, { castShadow: true, label: 'Galvanised ash can' });
    for (let i = 0; i < 3; i++) b.cyl(mats.std({ color: 0x3f4438, roughness: 0.85 }), 0.31, 0.05, x, swY + 0.2 + i * 0.28, z, 14);
    b.cyl(m, 0.32, 0.07, x, swY + 0.93, z, 14, 0, 0, 0, { castShadow: true });
    b.cyl(m, 0.07, 0.06, x, swY + 1.0, z, 8);
  } else if (kind === 'wire') {
    const m = mats.std({ color: 0x3a4a3a, roughness: 0.6, metalness: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      b.box(m, 0.04, 0.85, 0.04, x + Math.cos(a) * 0.28, swY + 0.42, z + Math.sin(a) * 0.28);
    }
    for (const yy of [0.1, 0.45, 0.8]) b.cyl(m, 0.3, 0.04, x, swY + yy, z, 16);
    b.cyl(mats.std({ color: 0x6b5a3a, roughness: 0.9 }), 0.26, 0.4, x, swY + 0.5, z, 12, 0, 0, 0, { label: 'Wire mesh litter basket' });
  } else if (kind === 'drum') {
    const m = mats.std({ color: 0x4a5a3a, roughness: 0.85, metalness: 0.3 });
    b.cyl(m, 0.33, 1.0, x, swY + 0.5, z, 14, 0, 0, 0, { castShadow: true, label: 'Oil-drum litter bin' });
    for (let i = 0; i < 4; i++) b.cyl(mats.std({ color: 0x3a4a2e, roughness: 0.9 }), 0.34, 0.05, x, swY + 0.2 + i * 0.22, z, 14);
    for (let i = 0; i < 3; i++) b.sphere(mats.std({ color: 0x232326, roughness: 0.7 }), 0.14, x + rng.range(-0.2, 0.2), swY + 1.05, z + rng.range(-0.2, 0.2), 8);
  } else if (kind === 'bin' || kind === 'bin-solar') {
    const solar = kind === 'bin-solar';
    b.box(mats.std({ color: solar ? 0x2b3138 : 0x3a4a3a, roughness: 0.6, metalness: 0.2 }), 0.7, 1.15, 0.7, x, swY + 0.58, z, 0, 0, 0, {
      castShadow: true,
      label: solar ? 'Solar-compacting waste bin' : 'Litter bin',
    });
    b.box(mats.std({ color: 0x2a2f33, roughness: 0.5 }), 0.74, 0.12, 0.74, x, swY + 1.2, z);
    b.box(mats.std({ color: 0x1a1d20, roughness: 0.8 }), 0.4, 0.16, 0.06, x, swY + 0.95, z + 0.36);
    if (solar) {
      b.box(mats.std({ color: 0x16233d, roughness: 0.2, metalness: 0.6 }), 0.6, 0.04, 0.5, x, swY + 1.28, z, -0.12, 0, 0, { label: 'PV lid' });
      b.plane(mats.glow({ color: 0x101418, emissive: 0x5ecf9a, emissiveIntensity: 1.2 }), 0.12, 0.06, x, swY + 0.75, z + 0.36, 0, 0, 0, 0);
    }
  } else if (kind === 'chute') {
    // handled in the 2055 block
  }
}

function buildPhoneBooth(ctx, b, _ctx, o) {
  const { mats } = ctx;
  const { x, z } = o;
  const frame = mats.std({ color: 0xc8ccce, roughness: 0.35, metalness: 0.8 });
  const glass = mats.glass({ color: 0xbcd4e0, opacity: 0.22, roughness: 0.05 });
  const H = 2.3;
  b.box(mats.std({ color: 0x8d9296, roughness: 0.7 }), 1.05, 0.12, 1.05, x, swY + 0.06, z);
  for (const [dx, dz] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    b.box(frame, 0.09, H, 0.09, x + dx, swY + H / 2, z + dz, 0, 0, 0, { castShadow: true });
  }
  for (const [px, pz, ry] of [
    [0, -0.5, 0],
    [0, 0.5, 0],
    [-0.5, 0, Math.PI / 2],
    [0.5, 0, Math.PI / 2],
  ]) {
    b.plane(glass, 0.95, H - 0.3, x + px, swY + H / 2 + 0.05, z + pz, 0, ry, 0, 0, { label: 'Glass telephone booth (1965)' });
  }
  b.box(frame, 1.15, 0.3, 1.15, x, swY + H + 0.12, z, 0, 0, 0, { castShadow: true });
  b.plane(mats.glow({ color: 0x1f4f9c, emissive: 0x8fd8ff, emissiveIntensity: 1.8 }), 1.0, 0.22, x, swY + H + 0.12, z + 0.59, 0, 0, 0, 0, { label: 'TELEPHONE' });
  b.box(mats.std({ color: 0x2a2f33, roughness: 0.6, metalness: 0.4 }), 0.4, 0.7, 0.2, x, swY + 1.3, z - 0.38, 0, 0, 0);
  ctx.lightsWanted.push({ type: 'point', color: 0xd8e8ff, intensity: 5, dist: 7, pos: [x, swY + 2.1, z] });
}

function buildPayphone(ctx, b, o) {
  const { mats } = ctx;
  const { x, z, slim, graffiti } = o;
  const pole = mats.std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.6 });
  b.cyl(pole, 0.07, 2.0, x, swY + 1.0, z, 8, 0, 0, 0, { castShadow: true });
  b.box(mats.std({ color: slim ? 0xdfe3e6 : 0x2b2f33, roughness: 0.55, metalness: 0.4 }), 0.55, 1.0, 0.28, x, swY + 1.6, z, 0, 0, 0, {
    castShadow: true,
    label: slim ? 'Payphone (2000s)' : 'Payphone',
  });
  b.box(mats.std({ color: 0x1a1d20, roughness: 0.7 }), 0.16, 0.4, 0.1, x - 0.22, swY + 1.7, z + 0.18, 0, 0, 0.15);
  b.plane(mats.std({ color: 0xd8d2c0, roughness: 0.6 }), 0.3, 0.2, x + 0.08, swY + 1.95, z + 0.15, 0, 0, 0, 0);
  if (!slim) {
    // acoustic hood
    b.box(mats.std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.5 }), 0.9, 0.7, 0.55, x, swY + 2.35, z - 0.1, 0, 0, 0, { castShadow: true });
  }
  if (graffiti > 0.5) {
    b.plane(mats.std({ map: graffitiTex({ amount: 0.4, seed: 41 }), transparent: true, alphaTest: 0.05, roughness: 0.9 }), 0.5, 0.4, x, swY + 1.35, z + 0.15, 0, 0, 0);
  }
}

function buildMeter(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z } = o;
  const pole = mats.std({ color: era.id === '1965' ? 0x8a8d90 : 0x6f7377, roughness: 0.5, metalness: 0.6 });
  b.cyl(pole, 0.045, 1.2, x, swY + 0.6, z, 8, 0, 0, 0, { castShadow: true });
  b.box(mats.std({ color: era.id === '1965' ? 0xc0392b : 0x3a3f44, roughness: 0.55, metalness: 0.3 }), 0.19, 0.34, 0.16, x, swY + 1.32, z, 0, 0, 0, {
    castShadow: true,
    label: 'Parking meter',
  });
  b.plane(mats.std({ color: 0xe8e4d8, roughness: 0.4 }), 0.13, 0.13, x, swY + 1.36, z + 0.085, 0, 0, 0, 0);
  b.cyl(pole, 0.1, 0.05, x, swY + 1.51, z, 10);
}

function buildMeterKiosk(ctx, b, o) {
  const { mats } = ctx;
  const { x, z } = o;
  b.box(mats.std({ color: 0x2b3138, roughness: 0.55, metalness: 0.3 }), 0.42, 1.5, 0.32, x, swY + 0.75, z, 0, 0, 0, {
    castShadow: true,
    label: 'Pay-by-plate kiosk',
  });
  b.box(mats.std({ color: 0x1f2429, roughness: 0.5 }), 0.44, 0.3, 0.36, x, swY + 1.55, z, -0.3, 0, 0);
  b.plane(mats.glow({ color: 0x101418, emissive: 0x8fd8ff, emissiveIntensity: 1.3 }), 0.26, 0.2, x, swY + 1.56, z + 0.19, -0.3, 0, 0, 0);
  b.box(mats.std({ color: 0x16233d, roughness: 0.2, metalness: 0.6 }), 0.4, 0.03, 0.3, x, swY + 1.72, z - 0.04, -0.2, 0, 0);
}

// ---------------------------------------------------------------------------
function buildTransitStop(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z, kind } = o;
  const post = mats.std({ color: 0x8a8d90, roughness: 0.5, metalness: 0.55 });

  if (kind === 'sign-old' || kind === 'sign-mid') {
    const isTrolley = kind === 'sign-old';
    b.cyl(post, 0.05, 2.8, x, swY + 1.4, z, 8, 0, 0, 0, { castShadow: true });
    const t = placardTex({
      W: 192,
      H: 256,
      bg: isTrolley ? 0x1f4f3f : 0x1f6f4f,
      fg: 0xf0ead8,
      title: isTrolley ? 'CAR STOP' : 'BUS STOP',
      rows: isTrolley ? ['LINE 41', 'VINE ST'] : ['ROUTE 12', 'NO PARKING'],
      font: isTrolley ? 'Georgia, serif' : 'Arial, sans-serif',
      wear: 0.25,
    });
    b.plane(mats.std({ map: t, roughness: 0.5, side: THREE.DoubleSide }), 0.5, 0.66, x, swY + 2.5, z + 0.03, 0, 0, 0, 0, {
      label: isTrolley ? 'Streetcar stop — Line 41' : 'Bus stop — Route 12',
    });
    return;
  }

  // sheltered stops
  const glassMat = mats.glass({ color: 0xbcd4e0, opacity: 0.2, roughness: 0.05 });
  const frameMat = mats.std({ color: kind === 'podDock' ? 0x2a3352 : 0x3a4045, roughness: 0.45, metalness: 0.6 });
  const W = 4.4;
  const D = 1.6;
  const H = 2.5;
  b.box(frameMat, W, 0.16, D, x, swY + H, z, 0, 0, 0, { castShadow: true, label: 'Transit shelter' });
  for (const dx of [-W / 2 + 0.1, W / 2 - 0.1]) {
    b.box(frameMat, 0.12, H, 0.12, x + dx, swY + H / 2, z - D / 2 + 0.1, 0, 0, 0, { castShadow: true });
    b.box(frameMat, 0.12, H, 0.12, x + dx, swY + H / 2, z + D / 2 - 0.1, 0, 0, 0, { castShadow: true });
  }
  b.plane(glassMat, W - 0.3, H - 0.4, x, swY + H / 2 + 0.1, z - D / 2 + 0.12, 0, 0, 0, 0);
  b.plane(glassMat, D - 0.3, H - 0.4, x - W / 2 + 0.12, swY + H / 2 + 0.1, z, 0, Math.PI / 2, 0);
  // bench
  b.box(mats.std({ color: kind === 'podDock' ? 0x3a4358 : 0x6f7377, roughness: 0.6, metalness: 0.3 }), W - 1.2, 0.1, 0.4, x, swY + 0.5, z - D / 2 + 0.42, 0, 0, 0, { castShadow: true });
  for (const dx of [-1.2, 1.2]) b.box(frameMat, 0.08, 0.5, 0.36, x + dx, swY + 0.25, z - D / 2 + 0.42);

  // the ad panel is the era's tell
  if (kind === 'shelter-ad' || kind === 'shelter-glass') {
    const ad = wallAdTex({
      kind: kind === 'shelter-ad' ? 'billboard-lit' : 'billboard',
      text: kind === 'shelter-ad' ? 'CIGARS' : 'GO ONLINE',
      sub: kind === 'shelter-ad' ? 'SMOOTH  •  RICH  •  MILD' : 'BROADBAND FROM $19.99',
      bg: kind === 'shelter-ad' ? 0x6b2f2f : 0x0b2f6b,
      fg: 0xf2e6d0,
      accent: 0xffd23f,
      wear: kind === 'shelter-ad' ? 0.35 : 0.1,
      seed: 61,
      W: 384,
      H: 640,
    });
    b.plane(mats.signMaterial(ad), 1.4, 2.1, x + W / 2 - 0.14, swY + 1.3, z, 0, -Math.PI / 2, 0, 0, {
      label: 'Bus shelter advertising panel',
    });
    b.box(frameMat, 0.16, 2.3, 1.5, x + W / 2 - 0.05, swY + 1.3, z, 0, 0, 0, { castShadow: true });
    ctx.lightsWanted.push({ type: 'point', color: 0xffe8c0, intensity: 4, dist: 7, pos: [x + W / 2, swY + 1.6, z + 0.9] });
  }
  if (kind === 'shelter-solar') {
    b.box(mats.std({ color: 0x16233d, roughness: 0.2, metalness: 0.6 }), W - 0.4, 0.06, D - 0.3, x, swY + H + 0.14, z, -0.06, 0, 0, { label: 'PV shelter roof' });
    const disp = makeAnimatedDisplay({ W: 256, H: 384, kind: 'transit', accent: 0x5ecf9a, fps: 3, seed: 11 });
    const dm = mats.std({ map: disp.texture, emissiveMap: disp.texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.7, roughness: 0.4 });
    b.plane(dm, 0.8, 1.2, x + W / 2 - 0.16, swY + 1.5, z, 0, -Math.PI / 2, 0, 0, { label: 'Real-time arrivals display' });
    ctx.animated.push(disp);
  }
  if (kind === 'podDock') {
    const em = mats.glow({ color: 0x18203a, emissive: 0x7cf7ff, emissiveIntensity: 2.4 });
    b.box(em, W - 0.4, 0.05, 0.1, x, swY + H - 0.12, z + D / 2 - 0.14);
    b.box(em, 0.1, 0.05, D - 0.3, x - W / 2 + 0.12, swY + H - 0.12, z);
    const disp = makeAnimatedDisplay({ W: 384, H: 256, kind: 'transit', accent: 0x7cf7ff, fps: 3, seed: 13 });
    const dm = mats.std({ map: disp.texture, emissiveMap: disp.texture, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.0, roughness: 0.4 });
    b.plane(dm, 1.7, 1.1, x, swY + 1.65, z - D / 2 + 0.16, 0, 0, 0, 0, { label: 'Pod dispatch board' });
    ctx.animated.push(disp);
    ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 7, dist: 10, pos: [x, swY + 2.2, z] });
  }
  ctx.lightsWanted.push({ type: 'point', color: 0xfff0d8, intensity: 5, dist: 8, pos: [x, swY + 2.3, z] });
}

// ---------------------------------------------------------------------------
function buildNewsstand(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z } = o;
  const wood = mats.std({ color: 0x5f4a34, roughness: 0.95 });
  const green = mats.std({ color: 0x2f4a3a, roughness: 0.8 });
  b.box(green, 2.6, 2.2, 1.5, x, swY + 1.1, z, 0, 0, 0, { castShadow: true, receiveShadow: true, label: 'Corner newsstand' });
  b.box(wood, 3.0, 0.14, 1.9, x, swY + 2.3, z, 0, 0, 0, { castShadow: true });
  // open serving hatch
  b.box(wood, 2.4, 0.1, 0.9, x, swY + 1.9, z + 1.1, -0.35, 0, 0, { castShadow: true });
  b.box(mats.glow({ color: 0x1a1d18, emissive: 0xffe0a8, emissiveIntensity: 0.9 }), 2.2, 0.9, 0.06, x, swY + 1.3, z + 0.76);
  // stacked papers + magazines
  for (let i = 0; i < 5; i++) {
    b.box(mats.std({ color: 0xd8d2c0, roughness: 0.9 }), 0.5, 0.14, 0.36, x - 1.0 + i * 0.5, swY + 1.82, z + 0.95, -0.35, 0, 0, { label: 'Newspapers' });
  }
  b.plane(mats.std({ map: posterWallTex(era.id, { seed: 77 }), roughness: 0.9 }), 2.4, 1.3, x, swY + 1.2, z - 0.76, 0, Math.PI, 0, 0);
  ctx.lightsWanted.push({ type: 'point', color: 0xffd9a0, intensity: 5, dist: 8, pos: [x, swY + 1.9, z + 0.9] });
  ctx.extraPeople.push({ x: x - 0.1, z: z - 0.2, rot: 0, outfit: era.id === '1945' ? 'vendor45' : 'vendor65', pose: 'stand' });
}

// ---------------------------------------------------------------------------
function buildParklet(ctx, b, o) {
  const { mats, era } = ctx;
  const { x, z } = o;
  const deckMat = mats.std({ color: 0x8d6f4a, roughness: 0.92 });
  const frameMat = mats.std({ color: 0x2f3338, roughness: 0.5, metalness: 0.4 });
  const W = 7.5;
  const D = 2.4;
  // raised timber deck out in the parking lane
  b.box(deckMat, W, 0.18, D, x, 0.24, z, 0, 0, 0, { castShadow: true, receiveShadow: true, label: 'Parklet / dining shed' });
  for (let i = 0; i < 14; i++) b.box(mats.std({ color: 0x7d6244, roughness: 0.95 }), W, 0.03, 0.12, x, 0.34, z - D / 2 + 0.1 + i * 0.17);
  // perimeter planters + railing
  for (const dx of [-W / 2 + 0.4, W / 2 - 0.4]) {
    b.box(mats.std({ color: 0x3a4a38, roughness: 0.9 }), 0.7, 0.8, D - 0.2, x + dx, 0.73, z, 0, 0, 0, { castShadow: true });
    b.plane(mats.cutout({ map: leafTex(0x4a8c3f, 310) }), 0.9, 1.0, x + dx, 1.5, z, 0, 0, 0);
  }
  b.box(frameMat, W, 0.08, 0.08, x, 1.15, z + D / 2 - 0.06);
  for (let i = 0; i <= 9; i++) b.box(frameMat, 0.05, 0.85, 0.05, x - W / 2 + (i * W) / 9, 0.75, z + D / 2 - 0.06);
  // pergola + string lights
  for (const dx of [-W / 2 + 0.5, 0, W / 2 - 0.5]) {
    b.box(frameMat, 0.1, 2.5, 0.1, x + dx, 1.55, z - D / 2 + 0.2, 0, 0, 0, { castShadow: true });
    b.box(frameMat, 0.1, 2.5, 0.1, x + dx, 1.55, z + D / 2 - 0.2, 0, 0, 0, { castShadow: true });
  }
  b.box(frameMat, W, 0.1, 0.1, x, 2.78, z - D / 2 + 0.2);
  b.box(frameMat, W, 0.1, 0.1, x, 2.78, z + D / 2 - 0.2);
  for (let i = 0; i < 5; i++) b.box(frameMat, 0.08, 0.08, D, x - W / 2 + 0.6 + i * 1.6, 2.78, z);
  const bulb = mats.glow({ color: 0xfff1c8, emissive: 0xffd9a0, emissiveIntensity: 2.8 });
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    b.sphere(bulb, 0.06, x - W / 2 + t * W, 2.62 - Math.sin(t * Math.PI * 3) * 0.12, z, 8);
  }
  ctx.lightsWanted.push({ type: 'point', color: 0xffd9a0, intensity: 8, dist: 12, pos: [x, 2.4, z] });
  // tables & chairs
  for (let i = 0; i < 3; i++) {
    const tx = x - 2.3 + i * 2.3;
    b.cyl(mats.std({ color: 0x3a4038, roughness: 0.6 }), 0.4, 0.06, tx, 0.99, z, 14, 0, 0, 0, { castShadow: true });
    b.cyl(mats.std({ color: 0x3a4038, roughness: 0.6 }), 0.05, 0.66, tx, 0.66, z, 8);
    for (const s of [-1, 1]) {
      b.box(mats.std({ color: 0x4a5048, roughness: 0.7 }), 0.4, 0.05, 0.4, tx, 0.75, z + s * 0.75, 0, 0, 0, { castShadow: true });
      b.box(mats.std({ color: 0x4a5048, roughness: 0.7 }), 0.4, 0.45, 0.05, tx, 0.97, z + s * 0.95, 0, 0, 0);
    }
  }
  // reflective end bollard, because cars still exist
  b.cyl(mats.std({ color: 0xffb703, roughness: 0.6 }), 0.12, 1.1, x + W / 2 + 0.3, 0.55, z, 10, 0, 0, 0, { label: 'Delineator post' });
  b.cyl(mats.glow({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 }), 0.125, 0.12, x + W / 2 + 0.3, 0.9, z, 10);
}

// ---------------------------------------------------------------------------
function buildSkybridge(ctx, b) {
  const { mats } = ctx;
  const y = 13.5;
  const frame = mats.std({ color: 0x3a4358, roughness: 0.45, metalness: 0.6 });
  const glass = mats.glass({ color: 0x7fa8d8, opacity: 0.22, roughness: 0.04, emissive: 0x2a4a7a, emissiveIntensity: 0.5 });
  const x0 = -2;
  const span = 20;
  b.box(frame, span, 0.4, 3.2, x0, y, 0, 0, 0, 0, { castShadow: true, label: 'Pedestrian skybridge (2043)' });
  b.box(frame, span, 0.3, 3.2, x0, y + 3.0, 0, 0, 0, 0, { castShadow: true });
  b.plane(glass, span, 2.7, x0, y + 1.6, 1.6, 0, 0, 0, 0);
  b.plane(glass, span, 2.7, x0, y + 1.6, -1.6, 0, Math.PI, 0, 0);
  for (let i = 0; i <= 10; i++) {
    b.box(frame, 0.14, 3.0, 0.14, x0 - span / 2 + (i * span) / 10, y + 1.6, 1.6);
    b.box(frame, 0.14, 3.0, 0.14, x0 - span / 2 + (i * span) / 10, y + 1.6, -1.6);
  }
  const em = mats.glow({ color: 0x18203a, emissive: 0x7cf7ff, emissiveIntensity: 2.0 });
  b.box(em, span, 0.06, 0.1, x0, y + 0.24, 1.62);
  b.box(em, span, 0.06, 0.1, x0, y + 0.24, -1.62);
  ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 12, dist: 20, pos: [x0, y + 0.5, 0] });
}

// ---------------------------------------------------------------------------
/** Street trees. The same pits are planted in 1945 and grow across the eras. */
export function buildTrees(ctx) {
  const { era, mats, root } = ctx;
  const b = new Batch('trees');
  const stage = era.street.treeStage;
  if (stage <= 0.01) return;
  const rng = makeRng('trees' + era.id);
  const positions = [
    [-27.5, L.curbNorthZ - 1.5, 1.0],
    [-16.0, L.curbNorthZ - 1.5, 0.85],
    [-3.0, L.curbNorthZ - 1.5, 1.1],
    [10.0, L.curbNorthZ - 1.5, 0.7],
    [22.0, L.curbNorthZ - 1.5, 0.95],
    [-24.0, L.curbSouthZ + 1.5, 0.9],
    [-9.5, L.curbSouthZ + 1.5, 1.05],
    [4.0, L.curbSouthZ + 1.5, 0.8],
    [19.0, L.curbSouthZ + 1.5, 1.0],
  ];
  const barkMat = mats.std({ color: era.id === '2055' ? 0x4a4238 : 0x50412f, roughness: 0.98 });
  const autumn = era.id === '2005' ? 0.35 : era.id === '1945' ? 0.25 : 0;
  const leafMat = mats.cutout({
    map: leafTex(era.id === '2055' ? 0x3f8c52 : era.id === '1985' ? 0x3a5f30 : 0x3f7a3a, 7, autumn),
    color: 0xffffff,
  });

  for (const [x, z, vig] of positions) {
    const scale = Math.max(0.12, stage * vig);
    const trunkH = 2.2 + scale * 3.2;
    const trunkR = 0.07 + scale * 0.22;
    // tree pit
    b.plane(mats.std({ color: 0x3a3128, roughness: 1 }), 1.5, 1.5, x, swY + 0.015, z, -Math.PI / 2, 0, 0, 0, { label: 'Tree pit' });
    b.box(mats.std({ color: 0x8a8578, roughness: 0.9 }), 1.7, 0.14, 0.12, x, swY + 0.06, z - 0.8);
    b.box(mats.std({ color: 0x8a8578, roughness: 0.9 }), 1.7, 0.14, 0.12, x, swY + 0.06, z + 0.8);
    b.box(mats.std({ color: 0x8a8578, roughness: 0.9 }), 0.12, 0.14, 1.7, x - 0.8, swY + 0.06, z);
    b.box(mats.std({ color: 0x8a8578, roughness: 0.9 }), 0.12, 0.14, 1.7, x + 0.8, swY + 0.06, z);
    // trunk (slightly tapered, with a lean)
    const lean = rng.range(-0.05, 0.05);
    b.cyl(barkMat, trunkR, trunkH, x, swY + trunkH / 2, z, 10, 0, 0, lean, { castShadow: true, label: 'Street tree' });
    b.cyl(barkMat, trunkR * 1.35, 0.35, x, swY + 0.17, z, 10, 0, 0, 0);
    // branches
    const nB = scale < 0.35 ? 3 : 6;
    for (let i = 0; i < nB; i++) {
      const a = (i / nB) * TAU + rng.range(-0.3, 0.3);
      const bl = 0.7 + scale * 1.8;
      const by = swY + trunkH * (0.62 + (i % 3) * 0.12);
      b.cyl(barkMat, trunkR * 0.42, bl, x + Math.cos(a) * bl * 0.35, by + bl * 0.22, z + Math.sin(a) * bl * 0.35, 6, Math.PI / 2 - 0.9, -a, 0, { castShadow: true });
    }
    // crown: crossed billboards + a few blobs
    const crownR = 0.8 + scale * 2.6;
    const crownY = swY + trunkH + crownR * 0.42;
    for (let i = 0; i < 3; i++) {
      b.plane(leafMat, crownR * 2, crownR * 1.7, x, crownY + i * 0.25 - 0.25, z, 0, (i * Math.PI) / 3, 0, 0, { castShadow: true });
    }
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, TAU);
      const rr = crownR * rng.range(0.3, 0.7);
      b.plane(leafMat, crownR * 1.1, crownR * 0.9, x + Math.cos(a) * rr, crownY + rng.range(-0.4, 0.7), z + Math.sin(a) * rr, 0, rng.range(0, 3), 0, 0);
    }
    // young trees get a stake and a guard
    if (scale < 0.45) {
      b.cyl(mats.std({ color: 0x8a6f4c, roughness: 0.95 }), 0.035, trunkH * 0.9, x + 0.22, swY + trunkH * 0.45, z, 6, 0, 0, 0, { label: 'Tree stake' });
      b.box(mats.std({ color: 0x6f5a3a, roughness: 0.9 }), 0.02, 0.02, 0.3, x + 0.11, swY + trunkH * 0.7, z);
    }
    // 2055: irrigation collar + sensor
    if (era.id === '2055') {
      b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x5fd8a0, emissiveIntensity: 1.2 }), 0.55, 0.05, x, swY + 0.05, z, 18, 0, 0, 0, { label: 'Irrigation & soil sensor collar' });
    }
  }
  b.build(root, { castShadow: true, receiveShadow: true });
}
