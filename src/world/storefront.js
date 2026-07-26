import * as THREE from 'three';
import { shopInteriorTex, awningTex, graffitiTex, posterWallTex, leafTex, corrugatedTex, brickTex, noiseRoughTex } from '../lib/textures.js';
import { storefrontSign, placardTex, makeAnimatedDisplay } from '../lib/signs.js';
import { makeRng, mixHex, shade, TAU } from '../lib/util.js';

/**
 * A shopfront: bulkhead, display glazing with a painted interior, recessed
 * entrance with transom, fascia signboard, awning, blade sign, plus whatever
 * the era spills onto the pavement.
 */
export function buildStorefront(ctx, o) {
  const { mats, era, batch: b } = ctx;
  const { x0, x1, groundH, zFront, spec, sf, lotId } = o;
  const w = x1 - x0;
  if (w < 1.2) return;
  const cx = (x0 + x1) / 2;
  const rng = makeRng('sf' + lotId + era.id + sf.name);

  const fasciaH = Math.min(1.05, groundH * 0.2);
  const fasciaY = groundH - fasciaH / 2 - 0.15;
  const bulkH = era.id === '2055' ? 0.35 : era.id === '2025' ? 0.42 : 0.72;
  const glassTop = groundH - fasciaH - 0.32;

  // ---- bulkhead ---------------------------------------------------------
  const bulkColor =
    era.id === '1945' ? 0x2f3b32 : era.id === '1965' ? 0x8b3a2f : era.id === '1985' ? 0x33303a : era.id === '2005' ? 0x8f9498 : era.id === '2025' ? 0x2a2c2e : 0x1b2334;
  const bulkMat = mats.std({ color: bulkColor, roughness: era.id === '1945' ? 0.55 : 0.7, metalness: 0.15 });
  b.box(bulkMat, w, bulkH, 0.34, cx, bulkH / 2 + 0.02, zFront + 0.16, 0, 0, 0, { castShadow: true });
  b.box(mats.std({ color: shade(bulkColor, 0.25), roughness: 0.5, metalness: 0.3 }), w, 0.07, 0.4, cx, bulkH + 0.05, zFront + 0.18);

  // ---- display glazing --------------------------------------------------
  const glassH = glassTop - bulkH;
  const interiorMap = shopInteriorTex(sf.type, {
    accent: sf.accent,
    dark: era.id === '1985' || era.id === '2055',
    seed: 3 + lotId.charCodeAt(0),
  });
  const shopLit = era.id !== '1945' || rng() < 0.7;
  const interiorMat = mats.std({
    map: interiorMap,
    emissiveMap: interiorMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: shopLit ? (era.id === '1985' ? 0.75 : era.id === '2055' ? 0.9 : era.id === '1945' ? 0.35 : 0.55) : 0.08,
    roughness: 0.25,
    metalness: 0.1,
  });

  // recessed entry: doorway occupies ~28% of the frontage
  const doorW = Math.min(1.5, w * 0.3);
  const doorX = cx + (rng() < 0.5 ? -1 : 1) * (w / 2 - doorW / 2 - 0.28);
  const recess = 0.55;

  // left + right display windows
  const segs = [];
  const leftW = doorX - doorW / 2 - x0;
  const rightW = x1 - (doorX + doorW / 2);
  if (leftW > 0.5) segs.push([x0, doorX - doorW / 2]);
  if (rightW > 0.5) segs.push([doorX + doorW / 2, x1]);

  const mullionMat = mats.std({
    color: era.id === '1965' ? 0xcfd4d6 : era.id === '2005' || era.id === '2025' ? 0x3a3d40 : era.id === '2055' ? 0x6d7ba8 : 0x3f3222,
    roughness: 0.4,
    metalness: era.id === '1965' ? 0.8 : 0.5,
  });
  const glassMat = mats.glass({
    color: 0xaecad8,
    opacity: 0.18,
    roughness: 0.03,
    metalness: 0.5,
  });

  for (const [sx0, sx1] of segs) {
    const sw = sx1 - sx0;
    const scx = (sx0 + sx1) / 2;
    // interior backdrop, set back so you can see "into" the shop
    b.plane(interiorMat, sw - 0.1, glassH, scx, bulkH + glassH / 2, zFront - 0.9, 0, 0, 0, 0, {
      label: `${sf.name} — ${sf.sub || 'shopfront'}`,
    });
    // side reveals of the display box
    const sideMat = mats.std({ color: 0x2b2620, roughness: 0.9 });
    b.plane(sideMat, 1.1, glassH, sx0 + 0.03, bulkH + glassH / 2, zFront - 0.42, 0, Math.PI / 2, 0);
    b.plane(sideMat, 1.1, glassH, sx1 - 0.03, bulkH + glassH / 2, zFront - 0.42, 0, -Math.PI / 2, 0);
    b.plane(sideMat, sw, 1.1, scx, bulkH + glassH, zFront - 0.42, Math.PI / 2, 0, 0);
    // the glass itself
    b.plane(glassMat, sw - 0.12, glassH, scx, bulkH + glassH / 2, zFront + 0.17, 0, 0, 0, 0, { label: 'Plate glass' });
    // frame
    b.box(mullionMat, sw, 0.1, 0.2, scx, bulkH + glassH + 0.05, zFront + 0.18);
    b.box(mullionMat, 0.1, glassH, 0.2, sx0 + 0.05, bulkH + glassH / 2, zFront + 0.18);
    b.box(mullionMat, 0.1, glassH, 0.2, sx1 - 0.05, bulkH + glassH / 2, zFront + 0.18);
    // divided lights in older eras
    if (era.id === '1945' || era.id === '1965') {
      const n = Math.max(1, Math.round(sw / 1.5));
      for (let i = 1; i < n; i++) b.box(mullionMat, 0.07, glassH, 0.18, sx0 + (sw * i) / n, bulkH + glassH / 2, zFront + 0.18);
    }
    // stained-glass transom
    if (sf.extras?.includes('transomStained')) {
      const tm = mats.glow({
        color: 0x7a4f2a,
        emissive: 0xffb84d,
        emissiveIntensity: 0.7,
        roughness: 0.3,
      });
      b.plane(tm, sw - 0.2, 0.34, scx, glassTop + 0.2, zFront + 0.17, 0, 0, 0, 0, { label: 'Leaded transom light' });
    }
  }

  // ---- entrance ---------------------------------------------------------
  const doorMat = mats.std({
    color: era.id === '1945' ? 0x3a2a1c : era.id === '1965' ? 0xb8bcbe : era.id === '2055' ? 0x27304a : 0x2f3336,
    roughness: 0.45,
    metalness: era.id === '1965' ? 0.7 : 0.2,
  });
  // recess floor + ceiling
  b.plane(mats.std({ color: 0x6f6a60, roughness: 0.85 }), doorW + 0.4, recess, doorX, 0.03, zFront - recess / 2 + 0.1, -Math.PI / 2, 0, 0, 0, { receiveShadow: true });
  b.plane(mats.std({ color: 0x2a2620, roughness: 0.9 }), doorW + 0.4, recess, doorX, groundH - fasciaH - 0.3, zFront - recess / 2 + 0.1, Math.PI / 2, 0, 0);
  b.box(doorMat, doorW, glassTop - 0.05, 0.12, doorX, (glassTop - 0.05) / 2, zFront - recess + 0.1, 0, 0, 0, { castShadow: true, label: 'Entrance' });
  b.plane(mats.glass({ color: 0x9fbccb, opacity: 0.3, roughness: 0.05 }), doorW * 0.66, glassTop * 0.55, doorX, glassTop * 0.62, zFront - recess + 0.17, 0, 0, 0, 0);
  // door hardware
  b.cyl(mats.std({ color: era.id === '1945' ? 0xb08d3f : 0xc8ccce, roughness: 0.3, metalness: 0.9 }), 0.035, 0.9, doorX + doorW * 0.34, glassTop * 0.42, zFront - recess + 0.2, 8, 0, 0, 0);
  // transom over the door
  b.plane(mats.glow({ color: 0x2a241c, emissive: 0xffe0a8, emissiveIntensity: shopLit ? 0.8 : 0.1 }), doorW, 0.42, doorX, glassTop + 0.2, zFront - recess + 0.14, 0, 0, 0, 0);
  // address number
  if (era.id !== '2055') {
    b.plane(
      mats.std({
        map: placardTex({
          W: 128,
          H: 64,
          bg: era.id === '1945' ? 0x1f2b22 : 0xe8e8e6,
          fg: era.id === '1945' ? 0xd8c88a : 0x2a2a2a,
          title: String(310 + Math.floor(rng() * 40)),
          rows: [],
          font: era.id === '1945' ? 'Georgia, serif' : 'Arial, sans-serif',
          wear: 0.2,
        }),
        roughness: 0.6,
      }),
      0.42,
      0.21,
      doorX,
      glassTop + 0.5,
      zFront + 0.14,
      0,
      0,
      0,
      0,
      { label: 'Street number' }
    );
  }

  // ---- fascia + sign ----------------------------------------------------
  const fasciaMat = mats.std({ color: shade(sf.color, -0.15), roughness: 0.7 });
  b.box(fasciaMat, w, fasciaH + 0.3, 0.3, cx, fasciaY, zFront + 0.15, 0, 0, 0, { castShadow: true });
  const sign = storefrontSign({
    kind: sf.signKind,
    name: sf.name,
    sub: sf.sub,
    color: sf.color,
    accent: sf.accent,
    wear: era.id === '1985' ? 0.45 : era.id === '1945' ? 0.3 : 0.12,
    seed: 7 + lotId.charCodeAt(0),
    W: 1024,
    H: 176,
  });
  const signMat =
    sf.signKind === 'holo'
      ? mats.holoMaterial(sign.map, sf.accent, 1.25)
      : mats.signMaterial(sign, { glowScale: sf.signKind === 'neon' ? 1.15 : 1 });
  b.plane(signMat, w - 0.12, fasciaH, cx, fasciaY + 0.04, zFront + 0.32, 0, 0, 0, 0, {
    label: `${sf.name} — ${signKindLabel(sf.signKind)}`,
  });
  if (sf.signKind === 'holo') ctx.holos.push({ mat: signMat, base: 1.25, seed: rng() * 10 });

  // sign illumination spills onto the pavement
  const glowColors = { neon: sf.accent, 'plastic-lit': sf.accent, plastic: 0xfff0c8, holo: sf.accent, minimal: 0xffe9c0, vinyl: 0xffffff };
  if (sign.glow > 0.7 && (era.id === '1985' || era.id === '2055' || era.id === '2025')) {
    ctx.lightsWanted.push({
      type: 'point',
      color: glowColors[sf.signKind] ?? 0xffe9c0,
      intensity: sf.signKind === 'neon' ? 9 : 5,
      dist: 11,
      pos: [cx, fasciaY - 0.2, zFront + 1.4],
    });
  }
  // gooseneck lamps over hand-painted signs
  if (sf.signKind === 'painted' || sf.signKind === 'gilded') {
    for (let i = -1; i <= 1; i += 2) {
      const gx = cx + i * w * 0.3;
      b.cyl(mats.std({ color: 0x2d2a26, roughness: 0.6, metalness: 0.5 }), 0.035, 0.6, gx, fasciaY + fasciaH * 0.75, zFront + 0.45, 6, 0.9, 0, 0);
      b.cyl(mats.glow({ color: 0x3a3630, emissive: 0xffeec0, emissiveIntensity: 1.6 }), 0.14, 0.14, gx, fasciaY + fasciaH * 0.55, zFront + 0.72, 10, Math.PI / 2, 0, 0);
    }
  }

  // ---- projecting blade sign -------------------------------------------
  if ((era.id === '1945' || era.id === '1985' || era.id === '1965') && rng() < 0.75) {
    const bw = 0.55;
    const bh = Math.min(2.1, groundH * 0.5);
    const blade = storefrontSign({
      kind: sf.signKind,
      name: sf.name.split(' ')[0],
      sub: '',
      color: sf.color,
      accent: sf.accent,
      wear: era.id === '1985' ? 0.4 : 0.25,
      seed: 21,
      W: 256,
      H: 768,
    });
    const bx = cx + w * 0.34;
    const bMat = mats.signMaterial(blade, { side: THREE.DoubleSide, glowScale: 1.1 });
    b.box(mats.std({ color: 0x33302c, roughness: 0.6, metalness: 0.5 }), 0.1, 0.1, 1.5, bx, groundH + 0.3, zFront + 0.75);
    b.plane(bMat, bw, bh, bx, groundH - bh / 2 - 0.1, zFront + 1.32, 0, Math.PI / 2, 0, 0, {
      label: `Projecting blade sign — ${sf.name}`,
    });
    b.box(mats.std({ color: 0x2b2825, roughness: 0.6 }), 0.12, bh + 0.14, 0.1, bx, groundH - bh / 2 - 0.1, zFront + 1.32);
    if (sf.signKind === 'neon') {
      ctx.lightsWanted.push({ type: 'point', color: sf.accent, intensity: 6, dist: 8, pos: [bx, groundH - bh / 2, zFront + 1.5] });
    }
  }

  // ---- awning -----------------------------------------------------------
  if (sf.awning) {
    buildAwning(ctx, b, { cx, w, y: glassTop + 0.42, zFront, kind: sf.awning, color: sf.color, accent: sf.accent, name: sf.name });
  }

  // ---- pavement clutter -------------------------------------------------
  buildStorefrontExtras(ctx, b, { cx, w, x0, x1, zFront, groundH, sf, rng, glassTop, bulkH });
}

function signKindLabel(k) {
  return (
    {
      painted: 'hand-painted signboard',
      gilded: 'gold-leaf lettering on glass',
      plastic: 'internally-lit acrylic box sign',
      'plastic-lit': 'internally-lit acrylic box sign',
      enamel: 'porcelain-enamel panel sign',
      neon: 'neon tube sign',
      vinyl: 'printed vinyl fascia',
      minimal: 'routed metal letters',
      holo: 'projected volumetric sign',
    }[k] || 'sign'
  );
}

function buildAwning(ctx, b, o) {
  const { mats, era } = ctx;
  const { cx, w, y, zFront, kind, color, accent, name } = o;
  if (kind === 'canvas-stripe' || kind === 'canvas-flat') {
    const map = awningTex(kind, { a: color, b: accent, wear: era.id === '1985' ? 0.6 : 0.3 });
    const mat = mats.std({ map, roughness: 0.92, side: THREE.DoubleSide });
    const proj = 1.5;
    // sloped canopy
    b.plane(mat, w - 0.1, Math.hypot(proj, 0.55), cx, y - 0.28, zFront + proj / 2 + 0.1, -0.35, 0, 0, 3, {
      castShadow: true,
      label: 'Canvas awning',
    });
    // valance
    b.plane(mat, w - 0.1, 0.34, cx, y - 0.72, zFront + proj + 0.08, 0, 0, 0, 3, { castShadow: false });
    // side gussets
    for (const s of [-1, 1]) {
      b.plane(mat, proj, 0.6, cx + s * (w / 2 - 0.05), y - 0.4, zFront + proj / 2 + 0.1, 0, (s * Math.PI) / 2, 0.35, 0);
    }
    // frame
    const fr = mats.std({ color: 0x3a3630, roughness: 0.6, metalness: 0.4 });
    for (const s of [-1, 1]) {
      b.cyl(fr, 0.03, proj, cx + s * (w / 2 - 0.08), y - 0.4, zFront + proj / 2 + 0.1, 6, Math.PI / 2 - 0.35, 0, 0);
    }
    b.cyl(fr, 0.03, w, cx, y - 0.62, zFront + proj + 0.05, 6, 0, 0, Math.PI / 2);
  } else if (kind === 'metal') {
    const mat = mats.std({ color: mixHex(color, 0xffffff, 0.15), roughness: 0.45, metalness: 0.6 });
    b.box(mat, w, 0.16, 1.7, cx, y - 0.2, zFront + 0.9, -0.12, 0, 0, { castShadow: true, label: 'Cantilevered metal canopy' });
    b.box(mats.std({ color: shade(color, -0.3), roughness: 0.5, metalness: 0.5 }), w, 0.34, 0.1, cx, y - 0.42, zFront + 1.72);
    // under-canopy strip lighting
    b.box(mats.glow({ color: 0x2a2a2a, emissive: 0xfff2d0, emissiveIntensity: 1.4 }), w - 0.6, 0.05, 0.16, cx, y - 0.32, zFront + 1.2);
    for (const s of [-1, 1]) {
      b.cyl(mats.std({ color: 0x8d9296, roughness: 0.4, metalness: 0.7 }), 0.025, 1.5, cx + s * w * 0.36, y + 0.35, zFront + 1.0, 6, -0.9, 0, 0);
    }
  } else if (kind === 'glow') {
    const mat = mats.glow({ color: 0x141c2e, emissive: accent, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
    b.box(mats.std({ color: 0x1b2334, roughness: 0.4, metalness: 0.5 }), w, 0.12, 1.5, cx, y - 0.15, zFront + 0.8, 0, 0, 0, { castShadow: true, label: 'Illuminated canopy' });
    b.box(mat, w - 0.2, 0.05, 1.3, cx, y - 0.23, zFront + 0.8);
    ctx.lightsWanted.push({ type: 'point', color: accent, intensity: 4, dist: 7, pos: [cx, y - 0.6, zFront + 1.0] });
  }
}

function buildStorefrontExtras(ctx, b, o) {
  const { mats, era } = ctx;
  const { cx, w, x0, x1, zFront, groundH, sf, rng, glassTop, bulkH } = o;
  const zW = zFront + 0.6; // just off the building line
  const extras = sf.extras || [];
  const swY = 0.16;

  const wood = mats.std({ color: 0x7d6244, roughness: 0.95 });
  const metal = mats.std({ color: 0x6a6f73, roughness: 0.5, metalness: 0.7 });
  const dark = mats.std({ color: 0x2b2926, roughness: 0.8 });

  for (const ex of extras) {
    switch (ex) {
      case 'columns': {
        for (const s of [-1, 1]) {
          const px = cx + s * (w / 2 - 0.5);
          b.cyl(mats.std({ color: 0x9c9484, roughness: 0.7 }), 0.42, groundH - 0.4, px, (groundH - 0.4) / 2 + swY, zFront + 0.55, 16, 0, 0, 0, {
            castShadow: true,
            label: 'Engaged limestone column',
          });
          b.cyl(mats.std({ color: 0xa8a090, roughness: 0.6 }), 0.52, 0.3, px, groundH - 0.45 + swY, zFront + 0.55, 16, 0, 0, 0, { castShadow: true });
          b.box(mats.std({ color: 0x8d8578, roughness: 0.7 }), 1.1, 0.24, 1.1, px, swY + 0.12, zFront + 0.55);
        }
        break;
      }
      case 'brassRail': {
        for (const s of [-1, 1]) {
          b.cyl(mats.std({ color: 0xb08d3f, roughness: 0.25, metalness: 0.95 }), 0.04, 1.0, cx + s * w * 0.2, swY + 0.5, zFront + 1.1, 8, 0, 0, 0, { label: 'Brass stanchion' });
        }
        b.cyl(mats.std({ color: 0xb08d3f, roughness: 0.25, metalness: 0.95 }), 0.035, w * 0.4, cx, swY + 0.98, zFront + 1.1, 8, 0, 0, Math.PI / 2);
        break;
      }
      case 'nightDeposit': {
        b.box(mats.std({ color: 0x6f6a5e, roughness: 0.4, metalness: 0.8 }), 0.5, 0.7, 0.16, x1 - 0.9, 1.5, zFront + 0.24, 0, 0, 0, { label: 'Night deposit box' });
        b.box(dark, 0.36, 0.08, 0.1, x1 - 0.9, 1.68, zFront + 0.32);
        break;
      }
      case 'atm':
      case 'atmOld': {
        b.box(mats.std({ color: ex === 'atm' ? 0xdfe3e6 : 0x9a958c, roughness: 0.5, metalness: 0.3 }), 0.8, 1.9, 0.4, x0 + 1.1, 0.95 + swY, zFront + 0.3, 0, 0, 0, {
          castShadow: true,
          label: ex === 'atm' ? 'ATM' : 'Cash machine (1985)',
        });
        b.plane(mats.glow({ color: 0x101418, emissive: ex === 'atm' ? 0x8fd8ff : 0x6ac06a, emissiveIntensity: 1.6 }), 0.44, 0.34, x0 + 1.1, 1.55 + swY, zFront + 0.51, 0, 0, 0, 0);
        b.box(dark, 0.5, 0.06, 0.06, x0 + 1.1, 1.2 + swY, zFront + 0.52);
        break;
      }
      case 'securityGrille': {
        const gm = mats.std({ map: corrugatedTex({ color: 0x8d8f92, grime: 0.6, graffiti: era.street.graffiti }), roughness: 0.6, metalness: 0.5 });
        // rolled up above the shopfront
        b.cyl(gm, 0.28, w - 0.3, cx, glassTop + 0.42, zFront + 0.34, 14, 0, 0, Math.PI / 2, {
          castShadow: true,
          label: 'Roller security shutter (rolled up)',
        });
        b.box(metal, w, 0.14, 0.5, cx, glassTop + 0.72, zFront + 0.3);
        break;
      }
      case 'barredWindow': {
        for (let i = 0; i < 6; i++) {
          b.box(dark, 0.05, glassTop - bulkH, 0.05, x0 + 0.6 + i * ((w - 1.2) / 5), bulkH + (glassTop - bulkH) / 2, zFront + 0.26);
        }
        break;
      }
      case 'boardedWindow': {
        for (let i = 0; i < 3; i++) {
          b.box(mats.std({ color: 0x8a6f4c, roughness: 0.95 }), w * 0.42, 0.28, 0.06, x0 + w * 0.28, bulkH + 0.5 + i * 0.42, zFront + 0.26, 0, 0, rng.range(-0.05, 0.05));
        }
        break;
      }
      case 'posterWall': {
        const pm = mats.std({ map: posterWallTex(era.id, { seed: 4 }), roughness: 0.9 });
        b.plane(pm, Math.min(w * 0.5, 2.2), 1.6, x0 + 0.7, 1.3, zFront + 0.23, 0, 0, 0, 0, { label: 'Flyposted bills' });
        break;
      }
      case 'graffitiTag': {
        const gm = mats.std({ map: graffitiTex({ amount: 1, seed: 9 }), transparent: true, alphaTest: 0.05, roughness: 0.9 });
        b.plane(gm, Math.min(w * 0.7, 3), 1.4, cx + w * 0.1, 1.0, zFront + 0.25, 0, 0, 0, 0, { label: 'Tag' });
        break;
      }
      case 'sidewalkTables': {
        const n = Math.max(1, Math.floor(w / 2.6));
        for (let i = 0; i < n; i++) {
          const tx = x0 + 1.0 + i * 2.5;
          const tMat = mats.std({ color: era.id === '2055' ? 0x2b3550 : 0x4a4640, roughness: 0.6, metalness: 0.3 });
          b.cyl(tMat, 0.36, 0.06, tx, swY + 0.72, zW + 0.5, 14, 0, 0, 0, { castShadow: true, label: 'Pavement table' });
          b.cyl(tMat, 0.04, 0.72, tx, swY + 0.36, zW + 0.5, 8);
          b.cyl(tMat, 0.22, 0.04, tx, swY + 0.03, zW + 0.5, 12);
          for (const s of [-1, 1]) {
            const chx = tx + s * 0.62;
            b.box(tMat, 0.36, 0.05, 0.36, chx, swY + 0.44, zW + 0.5, 0, 0, 0, { castShadow: true });
            b.box(tMat, 0.36, 0.42, 0.05, chx, swY + 0.65, zW + 0.5 + s * 0.16, 0, 0, 0);
            for (const [ox, oz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]])
              b.box(tMat, 0.03, 0.44, 0.03, chx + ox, swY + 0.22, zW + 0.5 + oz);
          }
          // a cup on the table
          b.cyl(mats.std({ color: 0xf0ece2, roughness: 0.5 }), 0.05, 0.12, tx + 0.1, swY + 0.81, zW + 0.45, 10);
        }
        break;
      }
      case 'stools': {
        for (let i = 0; i < 3; i++) {
          const sx = x0 + 0.8 + i * 0.9;
          b.cyl(mats.std({ color: 0xb0453c, roughness: 0.7 }), 0.19, 0.08, sx, swY + 0.72, zW + 0.2, 12, 0, 0, 0, { label: 'Counter stool' });
          b.cyl(metal, 0.045, 0.72, sx, swY + 0.36, zW + 0.2, 8);
        }
        break;
      }
      case 'milkCrates': {
        for (let i = 0; i < 3; i++) {
          b.box(mats.std({ color: [0x8a5a2b, 0x6f5030, 0x7d6244][i % 3], roughness: 0.95 }), 0.44, 0.32, 0.44, x1 - 0.6, swY + 0.16 + i * 0.32, zW + 0.1, 0, rng.range(-0.2, 0.2), 0, {
            castShadow: true,
            label: 'Wooden crate',
          });
        }
        break;
      }
      case 'sandwichBoard': {
        const pm = mats.std({
          map: placardTex({
            W: 256,
            H: 340,
            bg: era.id === '2025' ? 0x23201c : 0xe8dcc0,
            fg: era.id === '2025' ? 0xe8e2d2 : 0x2a2118,
            title: era.id === '1945' ? "TODAY'S" : 'TODAY',
            rows: era.id === '1945' ? ['SOUP  .10', 'PIE  .15', 'COFFEE .05'] : ['flat white 4.5', 'cortado 4.0', 'oat +0.5'],
            font: era.id === '1945' ? 'Georgia, serif' : 'system-ui, sans-serif',
            wear: era.id === '1945' ? 0.35 : 0.1,
          }),
          roughness: 0.85,
          side: THREE.DoubleSide,
        });
        const bx = x1 - 1.2;
        for (const s of [-1, 1]) {
          b.plane(pm, 0.62, 0.85, bx, swY + 0.5, zW + 0.7 + s * 0.12, 0, 0, 0, 0, { label: 'A-board' });
        }
        b.box(wood, 0.68, 0.06, 0.3, bx, swY + 0.05, zW + 0.7);
        break;
      }
      case 'chalkboard': {
        b.plane(
          mats.std({
            map: placardTex({ W: 256, H: 320, bg: 0x1d201d, fg: 0xe8e2d2, title: 'SPECIALS', rows: ['sourdough  6', 'focaccia  5', 'cardamom bun  4'], font: 'system-ui, sans-serif', wear: 0.05 }),
            roughness: 0.9,
          }),
          0.7,
          0.9,
          x0 + 0.7,
          swY + 1.2,
          zFront + 0.24,
          0,
          0,
          0,
          0,
          { label: 'Chalkboard' }
        );
        break;
      }
      case 'planterRow': {
        for (let i = 0; i < Math.max(2, Math.floor(w / 2.2)); i++) {
          const px = x0 + 0.8 + i * 2.1;
          b.box(mats.std({ color: era.id === '2055' ? 0x35405e : 0x6f6a60, roughness: 0.9 }), 0.7, 0.5, 0.7, px, swY + 0.25, zW + 0.9, 0, 0, 0, { castShadow: true, label: 'Planter' });
          b.plane(mats.cutout({ map: leafTex(era.id === '2055' ? 0x4fa06a : 0x3f7a3a, 40 + i) }), 0.9, 0.9, px, swY + 0.85, zW + 0.9, 0, 0, 0);
          b.plane(mats.cutout({ map: leafTex(era.id === '2055' ? 0x4fa06a : 0x3f7a3a, 41 + i) }), 0.9, 0.9, px, swY + 0.85, zW + 0.9, 0, Math.PI / 2, 0);
        }
        break;
      }
      case 'planterConcrete': {
        for (const s of [-1, 1]) {
          b.box(mats.std({ color: 0xa8a49c, roughness: 0.92 }), 1.3, 0.62, 1.3, cx + s * w * 0.32, swY + 0.31, zW + 1.0, 0, 0, 0, { castShadow: true, label: 'Cast concrete planter' });
          b.plane(mats.cutout({ map: leafTex(0x4a7a3a, 50) }), 1.3, 1.1, cx + s * w * 0.32, swY + 1.05, zW + 1.0, 0, 0, 0);
        }
        break;
      }
      case 'planterModern': {
        for (let i = 0; i < 3; i++) {
          b.box(mats.std({ color: 0x3d4145, roughness: 0.5, metalness: 0.3 }), 0.55, 0.85, 0.55, x0 + 1.2 + i * 1.6, swY + 0.42, zW + 1.0, 0, 0, 0, { castShadow: true });
          b.plane(mats.cutout({ map: leafTex(0x3f7a4a, 60 + i) }), 0.7, 1.0, x0 + 1.2 + i * 1.6, swY + 1.2, zW + 1.0, 0, 0, 0);
        }
        break;
      }
      case 'stringLights': {
        const bulb = mats.glow({ color: 0xfff1c8, emissive: 0xffd9a0, emissiveIntensity: 2.6 });
        const n = Math.max(4, Math.round(w / 0.7));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const lx = x0 + 0.2 + t * (w - 0.4);
          const sag = Math.sin(t * Math.PI) * 0.28;
          b.sphere(bulb, 0.055, lx, glassTop + 0.72 - sag, zFront + 0.7, 8);
          b.box(mats.std({ color: 0x2a2724, roughness: 0.8 }), 0.02, 0.12, 0.02, lx, glassTop + 0.82 - sag, zFront + 0.7);
        }
        ctx.lightsWanted.push({ type: 'point', color: 0xffd9a0, intensity: 3, dist: 8, pos: [cx, glassTop + 0.6, zFront + 1.2] });
        break;
      }
      case 'podSeats': {
        for (let i = 0; i < 2; i++) {
          const px = x0 + 1.2 + i * 2.4;
          b.sphere(mats.std({ color: 0x2b3550, roughness: 0.35, metalness: 0.4 }), 0.55, px, swY + 0.5, zW + 0.8, 14, { castShadow: true, label: 'Seating pod' });
          b.cyl(mats.glow({ color: 0x1b2334, emissive: sf.accent, emissiveIntensity: 1.6 }), 0.4, 0.04, px, swY + 0.04, zW + 0.8, 16);
        }
        break;
      }
      case 'holoMenu': {
        const disp = makeAnimatedDisplay({ W: 256, H: 384, kind: 'holo', accent: sf.accent, lines: [sf.name, 'ORDER', 'NEURAL'], fps: 10, seed: 12 });
        const hm = mats.holoMaterial(disp.texture, sf.accent, 1.5);
        b.plane(hm, 0.8, 1.2, x0 + 0.85, swY + 1.5, zW + 0.4, 0, 0, 0, 0, { label: 'Holographic menu' });
        b.cyl(mats.std({ color: 0x2a3350, roughness: 0.4, metalness: 0.6 }), 0.08, 0.9, x0 + 0.85, swY + 0.45, zW + 0.4, 8);
        b.cyl(mats.glow({ color: 0x1b2334, emissive: sf.accent, emissiveIntensity: 2.2 }), 0.16, 0.05, x0 + 0.85, swY + 0.9, zW + 0.4, 12);
        ctx.animated.push(disp);
        ctx.holos.push({ mat: hm, base: 1.5, seed: 3 });
        break;
      }
      case 'growRacks': {
        const glowM = mats.glow({ color: 0x14201c, emissive: 0xff5ce0, emissiveIntensity: 2.2 });
        for (let r = 0; r < 3; r++) {
          b.box(mats.std({ color: 0x2a3340, roughness: 0.6, metalness: 0.4 }), w * 0.5, 0.06, 0.5, x0 + w * 0.3, 1.0 + r * 0.7, zFront + 0.4);
          b.box(glowM, w * 0.48, 0.04, 0.42, x0 + w * 0.3, 1.28 + r * 0.7, zFront + 0.4);
          b.plane(mats.cutout({ map: leafTex(0x4fbf6a, 70 + r) }), w * 0.5, 0.4, x0 + w * 0.3, 1.16 + r * 0.7, zFront + 0.42, 0, 0, 0);
        }
        ctx.lightsWanted.push({ type: 'point', color: 0xff5ce0, intensity: 5, dist: 7, pos: [x0 + w * 0.3, 1.6, zFront + 1.1] });
        break;
      }
      case 'lockerWall': {
        for (let i = 0; i < 3; i++)
          for (let k = 0; k < 2; k++) {
            b.box(mats.std({ color: 0x2f3850, roughness: 0.5, metalness: 0.35 }), 0.5, 0.6, 0.45, x1 - 1.2 - i * 0.55, swY + 0.35 + k * 0.65, zFront + 0.32, 0, 0, 0, {
              label: 'Autonomous delivery locker',
            });
            b.plane(mats.glow({ color: 0x101828, emissive: 0x7cf7ff, emissiveIntensity: 1.4 }), 0.16, 0.1, x1 - 1.2 - i * 0.55, swY + 0.45 + k * 0.65, zFront + 0.56, 0, 0, 0, 0);
          }
        break;
      }
      case 'newsRack':
      case 'newsBoxes': {
        const cols = [0x1f4f9c, 0xc0392b, 0x1f6f5c, 0xd8a828];
        for (let i = 0; i < 3; i++) {
          b.box(mats.std({ color: cols[i % 4], roughness: 0.6, metalness: 0.2 }), 0.42, 1.0, 0.36, x1 - 0.8 - i * 0.46, swY + 0.5, zW + 0.5, 0, 0, 0, {
            castShadow: true,
            label: 'Newspaper honour box',
          });
          b.plane(mats.std({ color: 0xe8e4d8, roughness: 0.8 }), 0.3, 0.34, x1 - 0.8 - i * 0.46, swY + 0.72, zW + 0.69, 0, 0, 0, 0);
        }
        break;
      }
      case 'gumballMachine': {
        b.cyl(metal, 0.12, 0.9, x1 - 0.7, swY + 0.45, zW + 0.3, 10);
        b.sphere(mats.glass({ color: 0xd94f45, opacity: 0.8, roughness: 0.1 }), 0.28, x1 - 0.7, swY + 1.05, zW + 0.3, 14, { label: 'Gumball machine' });
        break;
      }
      case 'barberPole': {
        b.cyl(mats.std({ color: 0xf2f0e6, roughness: 0.4 }), 0.1, 0.9, x0 + 0.5, swY + 1.6, zFront + 0.3, 12, 0, 0, 0, { label: 'Barber pole' });
        b.cyl(mats.std({ color: 0xc0392b, roughness: 0.4 }), 0.105, 0.12, x0 + 0.5, swY + 1.35, zFront + 0.3, 12);
        b.cyl(mats.std({ color: 0x1f4f9c, roughness: 0.4 }), 0.105, 0.12, x0 + 0.5, swY + 1.62, zFront + 0.3, 12);
        b.cyl(mats.std({ color: 0xc0392b, roughness: 0.4 }), 0.105, 0.12, x0 + 0.5, swY + 1.89, zFront + 0.3, 12);
        b.cyl(metal, 0.13, 0.1, x0 + 0.5, swY + 2.1, zFront + 0.3, 12);
        break;
      }
      case 'benchOutside': {
        b.box(wood, 1.6, 0.08, 0.42, cx, swY + 0.44, zW + 0.8, 0, 0, 0, { castShadow: true, label: 'Bench' });
        b.box(wood, 1.6, 0.4, 0.07, cx, swY + 0.66, zW + 1.0);
        for (const s of [-1, 1]) b.box(metal, 0.08, 0.44, 0.4, cx + s * 0.7, swY + 0.22, zW + 0.8);
        break;
      }
      case 'bikeLeaning': {
        buildBicycle(ctx, b, { x: x0 + 0.9, z: zFront + 0.55, y: swY, rot: 0.18, color: mixHex(0x2b6cb0, 0xc0392b, rng()) });
        break;
      }
      case 'scooterPair': {
        for (let i = 0; i < 2; i++) buildScooter(ctx, b, { x: x1 - 1.0 - i * 0.7, z: zW + 0.8, y: swY, rot: 0.2 + i * 0.3 });
        break;
      }
      case 'deliveryBags': {
        for (let i = 0; i < 2; i++) {
          b.box(mats.std({ color: i ? 0x1fa463 : 0xe8452b, roughness: 0.8 }), 0.5, 0.5, 0.42, x1 - 0.8 - i * 0.6, swY + 0.25, zW + 0.4, 0, rng.range(-0.3, 0.3), 0, {
            castShadow: true,
            label: 'Insulated delivery bag',
          });
        }
        break;
      }
      case 'queueRope': {
        for (let i = 0; i < 3; i++) {
          b.cyl(metal, 0.05, 1.0, x0 + 1.0 + i * 1.2, swY + 0.5, zW + 1.2, 8);
          b.cyl(metal, 0.14, 0.04, x0 + 1.0 + i * 1.2, swY + 0.03, zW + 1.2, 12);
          if (i < 2) b.box(mats.std({ color: 0x2b2b2b, roughness: 0.9 }), 1.2, 0.03, 0.03, x0 + 1.6 + i * 1.2, swY + 0.92, zW + 1.2);
        }
        break;
      }
      case 'windowDecals': {
        b.plane(
          mats.std({
            map: placardTex({ W: 256, H: 256, bg: 0xffffff, fg: sf.accent, title: 'OPEN', rows: ['MON-SAT', '9-19'], font: 'Arial, sans-serif', wear: 0.05 }),
            transparent: true,
            opacity: 0.9,
            roughness: 0.4,
          }),
          0.6,
          0.6,
          cx - w * 0.28,
          bulkH + 1.0,
          zFront + 0.2,
          0,
          0,
          0,
          0,
          { label: 'Window decal' }
        );
        break;
      }
      case 'menuCase':
      case 'directoryBoard': {
        b.box(metal, 0.7, 0.9, 0.09, x0 + 0.65, 1.6, zFront + 0.25, 0, 0, 0, { label: ex === 'menuCase' ? 'Menu case' : 'Tenant directory' });
        b.plane(mats.glow({ color: 0x101010, emissive: 0xd8d2c0, emissiveIntensity: 0.5 }), 0.58, 0.78, x0 + 0.65, 1.6, zFront + 0.31, 0, 0, 0, 0);
        break;
      }
      case 'noren': {
        b.plane(mats.cutout({ color: 0x1b2b4a, side: THREE.DoubleSide, roughness: 0.95 }), w * 0.7, 0.5, cx, glassTop - 0.1, zFront + 0.22, 0, 0, 0, 0, { label: 'Noren curtain' });
        break;
      }
      case 'starburst': {
        const sm = mats.glow({ color: 0xf6e7a1, emissive: 0xffe14d, emissiveIntensity: 2.0 });
        const sx2 = x1 - 0.8;
        const sy = glassTop + 0.9;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          b.box(sm, 0.55, 0.05, 0.05, sx2 + Math.cos(a) * 0.3, sy + Math.sin(a) * 0.3, zFront + 0.3, 0, 0, a, { label: 'Atomic starburst' });
        }
        b.sphere(sm, 0.12, sx2, sy, zFront + 0.32, 10);
        break;
      }
      case 'neonScript': {
        ctx.lightsWanted.push({ type: 'point', color: sf.accent, intensity: 7, dist: 9, pos: [cx, glassTop + 0.3, zFront + 1.1] });
        break;
      }
      case 'arcadeGlow':
      case 'fabGlow':
      case 'medGlow': {
        const col = ex === 'arcadeGlow' ? 0x36f0ff : ex === 'fabGlow' ? 0xff7ae0 : 0x7cffd4;
        ctx.lightsWanted.push({ type: 'point', color: col, intensity: 8, dist: 10, pos: [cx, 1.8, zFront + 1.2] });
        break;
      }
      case 'aluminumMullions': {
        const am = mats.std({ color: 0xcfd4d6, roughness: 0.3, metalness: 0.85 });
        for (let i = 0; i <= 6; i++) b.box(am, 0.09, glassTop, 0.24, x0 + (i * w) / 6, glassTop / 2, zFront + 0.22);
        b.box(am, w, 0.14, 0.28, cx, glassTop + 0.07, zFront + 0.22);
        break;
      }
      case 'revolvingDoor': {
        b.cyl(mats.glass({ color: 0xb8d0dc, opacity: 0.28, roughness: 0.04 }), 1.3, glassTop - 0.1, cx, (glassTop - 0.1) / 2, zFront - 0.4, 20, 0, 0, 0, { label: 'Revolving door' });
        for (let i = 0; i < 4; i++) {
          b.box(mats.std({ color: 0x8d9296, roughness: 0.3, metalness: 0.85 }), 1.25, glassTop - 0.2, 0.05, cx, (glassTop - 0.1) / 2, zFront - 0.4, 0, (i * Math.PI) / 4, 0);
        }
        b.cyl(mats.std({ color: 0x9aa0a4, roughness: 0.3, metalness: 0.8 }), 1.38, 0.16, cx, glassTop, zFront - 0.4, 20);
        break;
      }
      case 'bollards':
      case 'holoBollards': {
        for (let i = 0; i < 4; i++) {
          const px = x0 + 0.8 + i * ((w - 1.6) / 3);
          if (ex === 'bollards') {
            b.cyl(mats.std({ color: 0x8d9296, roughness: 0.4, metalness: 0.7 }), 0.11, 1.0, px, swY + 0.5, zW + 1.3, 12, 0, 0, 0, { castShadow: true, label: 'Bollard' });
          } else {
            b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 2.0 }), 0.09, 0.9, px, swY + 0.45, zW + 1.3, 10, 0, 0, 0, { label: 'Light bollard' });
          }
        }
        break;
      }
      case 'inductionPad': {
        b.cyl(mats.glow({ color: 0x1b2334, emissive: 0x8f7bff, emissiveIntensity: 1.8 }), 0.9, 0.04, cx, swY + 0.03, zW + 1.6, 24, 0, 0, 0, { label: 'Inductive charge pad' });
        break;
      }
      case 'evStall': {
        b.box(mats.std({ color: 0xe9edf0, roughness: 0.4, metalness: 0.3 }), 0.4, 1.3, 0.25, x1 - 1.0, swY + 0.65, zW + 1.4, 0, 0, 0, { castShadow: true, label: 'EV charge point' });
        b.plane(mats.glow({ color: 0x101418, emissive: 0x5ecf9a, emissiveIntensity: 1.8 }), 0.24, 0.3, x1 - 1.0, swY + 0.95, zW + 1.53, 0, 0, 0, 0);
        break;
      }
      case 'binPair': {
        for (let i = 0; i < 2; i++) {
          b.cyl(mats.std({ color: i ? 0x2b6cb0 : 0x3f4a3a, roughness: 0.7 }), 0.3, 0.9, x1 - 0.9 - i * 0.7, swY + 0.45, zW + 0.9, 12, 0, 0, 0, {
            castShadow: true,
            label: i ? 'Recycling bin' : 'Waste bin',
          });
          b.cyl(mats.std({ color: 0x2b2b2b, roughness: 0.6 }), 0.32, 0.08, x1 - 0.9 - i * 0.7, swY + 0.92, zW + 0.9, 12);
        }
        break;
      }
      case 'drumTrash': {
        b.cyl(mats.std({ color: 0x4a5a3a, roughness: 0.85, metalness: 0.3 }), 0.32, 1.0, x1 - 0.8, swY + 0.5, zW + 0.7, 14, 0, 0, 0, { castShadow: true, label: 'Oil-drum litter bin' });
        for (let i = 0; i < 4; i++) b.cyl(mats.std({ color: 0x3a4a2e, roughness: 0.9 }), 0.33, 0.05, x1 - 0.8, swY + 0.2 + i * 0.22, zW + 0.7, 14);
        b.box(mats.std({ color: 0x6b5a3a, roughness: 0.9 }), 0.3, 0.2, 0.2, x1 - 0.72, swY + 1.05, zW + 0.66, 0.4, 0.3, 0);
        break;
      }
      case 'cigarStand': {
        b.box(wood, 0.7, 1.1, 0.45, x1 - 0.9, swY + 0.55, zW + 0.5, 0, 0, 0, { castShadow: true, label: 'Cigar stand' });
        b.plane(mats.std({ color: 0x8a5a2b, roughness: 0.7 }), 0.6, 0.3, x1 - 0.9, swY + 1.0, zW + 0.73, 0, 0, 0, 0);
        break;
      }
      case 'sidewalkClock': {
        b.cyl(mats.std({ color: 0x1f2b22, roughness: 0.5, metalness: 0.5 }), 0.09, 2.6, x1 - 0.4, swY + 1.3, zW + 1.4, 10, 0, 0, 0, { castShadow: true });
        b.cyl(mats.glow({ color: 0xe8e2d2, emissive: 0xfff0c8, emissiveIntensity: 0.8 }), 0.34, 0.16, x1 - 0.4, swY + 2.75, zW + 1.4, 18, Math.PI / 2, 0, 0, {
          label: 'Pavement clock',
        });
        break;
      }
      case 'mortarPestle': {
        b.cyl(mats.std({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 }), 0.22, 0.3, cx, glassTop + 0.75, zFront + 0.4, 14, 0, 0, 0, { label: 'Mortar & pestle trade sign' });
        b.cyl(mats.std({ color: 0xb08d3f, roughness: 0.3, metalness: 0.9 }), 0.05, 0.4, cx + 0.12, glassTop + 0.95, zFront + 0.4, 8, 0, 0, 0.5);
        break;
      }
      case 'sewingWindow':
      case 'tvWall':
      case 'washerRow':
      case 'sliceCounter':
      case 'globeProp':
      case 'oilRack':
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
export function buildBicycle(ctx, b, o) {
  const { mats } = ctx;
  const { x, z, y = 0.16, rot = 0, color = 0x2b6cb0 } = o;
  const frame = mats.std({ color, roughness: 0.4, metalness: 0.5 });
  const rubber = mats.std({ color: 0x1c1c1e, roughness: 0.9 });
  const chrome = mats.std({ color: 0xc8ccce, roughness: 0.25, metalness: 0.9 });
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const px = (dx, dz) => [x + dx * cos - dz * sin, z + dx * sin + dz * cos];
  const [fx, fz] = px(0.55, 0);
  const [rx, rz] = px(-0.55, 0);
  b.cyl(rubber, 0.33, 0.05, fx, y + 0.33, fz, 18, 0, rot, Math.PI / 2, { label: 'Bicycle' });
  b.cyl(rubber, 0.33, 0.05, rx, y + 0.33, rz, 18, 0, rot, Math.PI / 2);
  b.cyl(chrome, 0.28, 0.02, fx, y + 0.33, fz, 12, 0, rot, Math.PI / 2);
  b.cyl(chrome, 0.28, 0.02, rx, y + 0.33, rz, 12, 0, rot, Math.PI / 2);
  const [mx, mz] = px(0, 0);
  b.box(frame, 1.0, 0.05, 0.05, mx, y + 0.62, mz, 0, rot, 0.1);
  b.box(frame, 0.7, 0.05, 0.05, mx + 0.1 * cos, y + 0.45, mz + 0.1 * sin, 0, rot, -0.5);
  b.box(frame, 0.05, 0.5, 0.05, ...swap(px(0.5, 0), y + 0.55), 0, rot, 0.25);
  b.box(frame, 0.05, 0.42, 0.05, ...swap(px(-0.45, 0), y + 0.5), 0, rot, -0.2);
  const [hx, hz] = px(0.5, 0);
  b.box(chrome, 0.06, 0.06, 0.5, hx, y + 0.95, hz, 0, rot, 0, { label: 'Handlebar' });
  const [sx, sz] = px(-0.4, 0);
  b.box(mats.std({ color: 0x1a1a1c, roughness: 0.7 }), 0.24, 0.07, 0.12, sx, y + 0.88, sz, 0, rot, 0);
}

function swap(pair, y) {
  return [pair[0], y, pair[1]];
}

export function buildScooter(ctx, b, o) {
  const { mats } = ctx;
  const { x, z, y = 0.16, rot = 0 } = o;
  const deck = mats.std({ color: 0x2a2f36, roughness: 0.5, metalness: 0.4 });
  const rubber = mats.std({ color: 0x1c1c1e, roughness: 0.9 });
  const accent = mats.std({ color: 0x5ecf9a, roughness: 0.4, metalness: 0.3 });
  b.box(deck, 0.9, 0.07, 0.2, x, y + 0.14, z, 0, rot, 0, { label: 'Shared e-scooter' });
  b.cyl(rubber, 0.14, 0.06, x + Math.cos(rot) * 0.42, y + 0.14, z + Math.sin(rot) * 0.42, 12, 0, rot, Math.PI / 2);
  b.cyl(rubber, 0.14, 0.06, x - Math.cos(rot) * 0.42, y + 0.14, z - Math.sin(rot) * 0.42, 12, 0, rot, Math.PI / 2);
  b.cyl(deck, 0.03, 1.0, x + Math.cos(rot) * 0.4, y + 0.62, z + Math.sin(rot) * 0.4, 8, 0, 0, 0.12);
  b.box(deck, 0.06, 0.06, 0.44, x + Math.cos(rot) * 0.34, y + 1.1, z + Math.sin(rot) * 0.34, 0, rot, 0);
  b.box(accent, 0.3, 0.12, 0.14, x + Math.cos(rot) * 0.3, y + 1.0, z + Math.sin(rot) * 0.3, 0, rot, 0);
}
