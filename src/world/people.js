import * as THREE from 'three';
import { LAYOUT } from '../config/block.js';
import { Batch } from '../lib/geom.js';
import { blobTex } from '../lib/textures.js';
import { makeRng, mixHex, shade, TAU, clamp, lerp } from '../lib/util.js';

const L = LAYOUT;
const swY = L.sidewalkY;

/**
 * Pedestrians. Low-poly, but the silhouette does the work: hat brims and long
 * coats in 1945, shift dresses in 1965, big hair and shoulder pads in 1985,
 * bootcut and backpacks in 2005, puffers and phones in 2025, visors and
 * electroluminescent trim in 2055.
 */

const SKINS = [0xf0cfa8, 0xe0b48a, 0xc08a5e, 0x8d5b3a, 0x5f3a26, 0xf5dcc0];
const HAIRS = [0x2a1d14, 0x4a3220, 0x6b4a2a, 0x8a6a3a, 0x1a1a1c, 0xa8a09a, 0xc8a05a];

const OUTFITS = {
  // ---------------------------------------------------------------- 1945
  suit45: {
    label: 'Man in a three-piece suit and fedora',
    coat: 0x2f3540, coatLen: 0.62, pants: 0x2a2f38, shirt: 0xe8e4d8, shoes: 0x1f1a16,
    hat: { type: 'fedora', color: 0x3a3226 }, tie: 0x6b2f2f, height: 1.0,
  },
  coat45: {
    label: 'Man in a belted trench coat',
    coat: 0x9c8a6a, coatLen: 0.95, pants: 0x3a3a3a, shirt: 0xe8e4d8, shoes: 0x2a2018,
    hat: { type: 'fedora', color: 0x4a3f2e }, belt: 0x6b5030, height: 1.02,
  },
  dress45: {
    label: 'Woman in a tea dress, hat and gloves',
    coat: 0x8a4a5a, coatLen: 1.15, dress: true, pants: null, shirt: 0x8a4a5a, shoes: 0x2a1a18,
    hat: { type: 'pillbox', color: 0x6b3a48 }, hairLong: true, height: 0.96, gloves: 0xe8e4d8,
  },
  worker45: {
    label: 'Workman in bib overalls and a flat cap',
    coat: 0x3f5a7a, coatLen: 0.7, pants: 0x3f5a7a, shirt: 0xd8d2c0, shoes: 0x3a2a1a,
    hat: { type: 'flatcap', color: 0x5a5248 }, height: 1.0,
  },
  sailor45: {
    label: 'Sailor on shore leave',
    coat: 0xe8e6de, coatLen: 0.6, pants: 0xe8e6de, shirt: 0xe8e6de, shoes: 0x1a1a1c,
    hat: { type: 'dixie', color: 0xf2f0ea }, collar: 0x1f3a6b, height: 0.98,
  },
  newsboy45: {
    label: 'Newsboy with the evening edition',
    coat: 0x8a6a3a, coatLen: 0.55, pants: 0x5a4a30, shirt: 0xd8cfa8, shoes: 0x3a2a1a,
    hat: { type: 'flatcap', color: 0x6b5a3a }, height: 0.74, papers: true,
  },
  vendor45: {
    label: 'Newsstand vendor',
    coat: 0x4a4438, coatLen: 0.7, pants: 0x3a3226, shirt: 0xd8d2c0, shoes: 0x2a2018,
    hat: { type: 'flatcap', color: 0x4a4438 }, height: 0.98,
  },
  attendant45: {
    label: 'Service station attendant in a bow tie',
    coat: 0xe8e4d8, coatLen: 0.62, pants: 0x2f4a3f, shirt: 0xe8e4d8, shoes: 0x2a2018,
    hat: { type: 'garrison', color: 0x2f4a3f }, tie: 0x8c2f2a, height: 1.0,
  },
  // ---------------------------------------------------------------- 1965
  mod65: {
    label: 'Woman in a mod shift dress',
    coat: 0xf0c14a, coatLen: 0.72, dress: true, pants: 0xf0d8c0, shirt: 0xf0c14a, shoes: 0xf2f0ea,
    hat: null, hairBob: 0x2a1d14, height: 0.98, boots: 0xf2f0ea,
  },
  suit65: {
    label: 'Man in a slim grey suit and skinny tie',
    coat: 0x6f7377, coatLen: 0.6, pants: 0x62666a, shirt: 0xf2f0ea, shoes: 0x1f1a16,
    hat: null, tie: 0x1f2a3a, height: 1.02,
  },
  housewife65: {
    label: 'Woman in a pastel A-line dress with a headscarf',
    coat: 0x7fd0c4, coatLen: 1.05, dress: true, pants: null, shirt: 0x7fd0c4, shoes: 0xd8c0a8,
    hat: { type: 'scarf', color: 0xe8788a }, hairLong: true, height: 0.96,
  },
  teen65: {
    label: 'Teenager in a striped shirt',
    coat: 0xd85a4a, coatLen: 0.5, pants: 0x2b4a7a, shirt: 0xd85a4a, shoes: 0xf2f0ea,
    hat: null, stripes: true, height: 0.92,
  },
  worker65: {
    label: 'Utility worker in coveralls',
    coat: 0x3a6b4a, coatLen: 0.85, pants: 0x3a6b4a, shirt: 0x3a6b4a, shoes: 0x3a2a1a,
    hat: { type: 'hardhat', color: 0xf0c14a }, height: 1.0,
  },
  kid65: {
    label: 'Child with an ice cream',
    coat: 0x5a9ad8, coatLen: 0.45, pants: 0x8a6a3a, shirt: 0x5a9ad8, shoes: 0xf2f0ea,
    hat: null, height: 0.62,
  },
  vendor65: { label: 'Newsstand vendor', coat: 0x8a8578, coatLen: 0.68, pants: 0x4a4438, shirt: 0xf2f0ea, shoes: 0x2a2018, hat: null, height: 0.98 },
  attendant65: {
    label: 'Full-serve attendant',
    coat: 0xf2f0ea, coatLen: 0.6, pants: 0xc0392b, shirt: 0xf2f0ea, shoes: 0x1f1a16,
    hat: { type: 'garrison', color: 0xc0392b }, height: 1.0,
  },
  // ---------------------------------------------------------------- 1985
  windbreaker85: {
    label: 'Man in a neon shell suit',
    coat: 0x39e08a, coatLen: 0.7, pants: 0x2b3a8a, shirt: 0xff4fa3, shoes: 0xf2f0ea,
    hat: null, height: 1.0, bigHair: 0x3a2a1a, blocks: true,
  },
  punk85: {
    label: 'Punk in a studded leather jacket',
    coat: 0x1a1a1c, coatLen: 0.62, pants: 0x2a2a2e, shirt: 0xc0392b, shoes: 0x1a1a1c,
    hat: null, mohawk: 0xff2f92, height: 1.0,
  },
  suit85: {
    label: 'Woman in a power suit with shoulder pads',
    coat: 0x6b2f5a, coatLen: 0.75, pants: 0x6b2f5a, shirt: 0xf2f0ea, shoes: 0x1a1a1c,
    hat: null, shoulders: true, bigHair: 0x4a3220, height: 0.99,
  },
  aerobics85: {
    label: 'Woman in a leotard and leg warmers',
    coat: 0xff4fa3, coatLen: 0.55, pants: 0x39e08a, shirt: 0xff4fa3, shoes: 0xf2f0ea,
    hat: { type: 'sweatband', color: 0xffd23f }, bigHair: 0x8a6a3a, height: 0.96, legWarmers: 0xffd23f,
  },
  jean85: {
    label: 'Teenager in a double-denim jacket',
    coat: 0x4a6b9a, coatLen: 0.6, pants: 0x3a5a8a, shirt: 0xf2f0ea, shoes: 0xf2f0ea,
    hat: null, bigHair: 0x2a1d14, height: 0.98, boombox: true,
  },
  cop85: {
    label: 'Patrol officer',
    coat: 0x1f2a4a, coatLen: 0.68, pants: 0x1f2a4a, shirt: 0x8a9ab8, shoes: 0x1a1a1c,
    hat: { type: 'peaked', color: 0x1f2a4a }, height: 1.02,
  },
  // ---------------------------------------------------------------- 2005
  office05: {
    label: 'Office worker with a lanyard and a flip phone',
    coat: 0x8a9298, coatLen: 0.58, pants: 0x2f3a4a, shirt: 0xdfe6ee, shoes: 0x2a2622,
    hat: null, height: 1.01, lanyard: 0x2b6cb0,
  },
  baggy05: {
    label: 'Man in bootcut jeans and a cap',
    coat: 0xdfe3e6, coatLen: 0.6, pants: 0x5a7a9a, shirt: 0xdfe3e6, shoes: 0xf2f0ea,
    hat: { type: 'ballcap', color: 0x2b3f6b }, height: 1.0, baggy: true,
  },
  hoodie05: {
    label: 'Student in a hoodie with a backpack',
    coat: 0x4a4a52, coatLen: 0.65, pants: 0x2f3a4a, shirt: 0x4a4a52, shoes: 0x1a1a1c,
    hat: { type: 'hood', color: 0x4a4a52 }, height: 0.99, backpack: 0x2b3f6b, baggy: true,
  },
  suit05: {
    label: 'Man in a black two-button suit',
    coat: 0x22262c, coatLen: 0.62, pants: 0x1f2328, shirt: 0xf2f0ea, shoes: 0x1a1a1c,
    hat: null, tie: 0x6b1f2a, height: 1.02,
  },
  student05: {
    label: 'Student with a messenger bag',
    coat: 0x6b8a4a, coatLen: 0.55, pants: 0x4a5a7a, shirt: 0xf2e8d8, shoes: 0xd8d2c0,
    hat: null, height: 0.96, bag: 0x8a6a3a, hairLong: true,
  },
  jogger05: {
    label: 'Runner in a tracksuit',
    coat: 0x2b3f6b, coatLen: 0.5, pants: 0x2b3f6b, shirt: 0xdfe6ee, shoes: 0xf2f0ea,
    hat: null, height: 1.0, stripes: true,
  },
  // ---------------------------------------------------------------- 2025
  puffer25: {
    label: 'Person in a puffer jacket, beanie and earbuds',
    coat: 0x2a2f36, coatLen: 0.72, pants: 0x1f2328, shirt: 0x2a2f36, shoes: 0xf2f0ea,
    hat: { type: 'beanie', color: 0xd85a4a }, height: 1.01, quilted: true, phone: true,
  },
  athleisure25: {
    label: 'Person in leggings with a yoga mat',
    coat: 0x1f2328, coatLen: 0.42, pants: 0x2f3a52, shirt: 0x8fd6a0, shoes: 0xf0f0ea,
    hat: null, height: 0.98, hairBun: 0x2a1d14, mat: 0x8f7bff,
  },
  tech25: {
    label: 'Person in an oversized hoodie with a tote bag',
    coat: 0x4a5a52, coatLen: 0.75, pants: 0x2a2f36, shirt: 0x4a5a52, shoes: 0xf2f0ea,
    hat: { type: 'cap-back', color: 0x1f2328 }, height: 1.0, tote: 0xd8cfa8, phone: true,
  },
  courier25: {
    label: 'Delivery courier with an insulated bag',
    coat: 0x1fa463, coatLen: 0.62, pants: 0x1f2328, shirt: 0x1fa463, shoes: 0x1a1a1c,
    hat: { type: 'helmet', color: 0x1f2328 }, height: 1.0, thermalBag: 0x1fa463, hiVis: 0xd8f04a,
  },
  student25: {
    label: 'Student with a laptop backpack',
    coat: 0x6b5a8a, coatLen: 0.68, pants: 0x2a2f36, shirt: 0xf2f0ea, shoes: 0xf0e8d8,
    hat: null, height: 0.97, backpack: 0x2a2f36, hairLong: true, phone: true,
  },
  parent25: {
    label: 'Parent carrying groceries',
    coat: 0x8a5a4a, coatLen: 0.8, pants: 0x3a4a5a, shirt: 0xf2f0ea, shoes: 0xd8d2c0,
    hat: null, height: 1.0, tote: 0x4a8c5a,
  },
  // ---------------------------------------------------------------- 2055
  techwear55: {
    label: 'Techwear commuter with electroluminescent seam trim',
    coat: 0x1b2030, coatLen: 0.88, pants: 0x14181f, shirt: 0x1b2030, shoes: 0x2a3352,
    hat: { type: 'visor', color: 0x2a3352 }, height: 1.02, glow: 0x7cf7ff, panels: true,
  },
  lumen55: {
    label: 'Person in a luminous woven coat',
    coat: 0x2a2352, coatLen: 1.0, pants: 0x1a1a2a, shirt: 0x2a2352, shoes: 0x3a3352,
    hat: null, height: 1.0, glow: 0xff7ad0, hairLong: true, panels: true,
  },
  medic55: {
    label: 'Community medic with a diagnostic slate',
    coat: 0xdfe6f2, coatLen: 0.92, pants: 0x2a3352, shirt: 0xdfe6f2, shoes: 0xdfe6f2,
    hat: null, height: 1.0, glow: 0x7cffd4, slate: true,
  },
  exo55: {
    label: 'Worker in a powered exoskeleton',
    coat: 0x4a5570, coatLen: 0.7, pants: 0x3a4358, shirt: 0x4a5570, shoes: 0x2a3352,
    hat: { type: 'visor', color: 0x3a4358 }, height: 1.06, glow: 0xffb347, exo: true,
  },
  kid55: {
    label: 'Child with a companion drone',
    coat: 0x8f7bff, coatLen: 0.5, pants: 0x2a3352, shirt: 0x8f7bff, shoes: 0xdfe6f2,
    hat: null, height: 0.64, glow: 0x9ef07a,
  },
};

/** Build one pedestrian. Legs/arms stay separate so they can be animated. */
export function buildPerson(ctx, outfitId, opts = {}) {
  const { mats } = ctx;
  const o = OUTFITS[outfitId] || OUTFITS.suit45;
  const rng = makeRng('p' + outfitId + (opts.seed ?? 0));
  const group = new THREE.Group();
  const scale = (o.height ?? 1) * rng.range(0.96, 1.05);
  const skin = mats.std({ color: SKINS[rng.int(0, SKINS.length - 1)], roughness: 0.88 });
  const hairCol = o.mohawk ?? o.bigHair ?? o.hairBob ?? HAIRS[rng.int(0, HAIRS.length - 1)];
  const hair = mats.std({ color: hairCol, roughness: 0.95 });
  const coat = mats.std({ color: o.coat, roughness: o.quilted ? 0.9 : 0.82, metalness: o.glow ? 0.2 : 0 });
  const pants = mats.std({ color: o.pants ?? o.coat, roughness: 0.85 });
  const shirt = mats.std({ color: o.shirt, roughness: 0.85 });
  const shoes = mats.std({ color: o.shoes, roughness: 0.7 });
  const glowMat = o.glow ? mats.glow({ color: shade(o.coat, -0.3), emissive: o.glow, emissiveIntensity: 1.8 }) : null;

  // ---- static torso batch ----------------------------------------------
  const b = new Batch('person');
  const hipY = 0.86;
  const shoulderY = 1.42;
  const headY = 1.62;

  if (o.dress) {
    // tapered skirt via two stacked boxes
    b.box(coat, 0.42, 0.5, 0.28, 0, hipY - 0.16, 0);
    b.box(coat, 0.56, 0.16, 0.38, 0, hipY - 0.42, 0);
    b.box(shirt, 0.36, 0.44, 0.24, 0, hipY + 0.3, 0);
  } else {
    b.box(coat, 0.4, shoulderY - hipY + (o.coatLen > 0.7 ? 0.3 : 0.06), 0.26, 0, (hipY + shoulderY) / 2 + 0.02, 0, 0, 0, 0, { label: o.label });
    if (o.coatLen > 0.7) {
      b.box(coat, 0.42, o.coatLen - 0.5, 0.28, 0, hipY - (o.coatLen - 0.5) / 2 + 0.06, 0);
    }
    // shirt / lapel gap
    b.box(shirt, 0.14, 0.34, 0.06, 0, shoulderY - 0.2, 0.13);
    if (o.tie) b.box(mats.std({ color: o.tie, roughness: 0.7 }), 0.06, 0.3, 0.03, 0, shoulderY - 0.22, 0.17);
  }
  if (o.shoulders) {
    for (const s of [-1, 1]) b.box(coat, 0.16, 0.12, 0.28, s * 0.26, shoulderY + 0.02, 0, 0, 0, 0, { label: 'Shoulder pads' });
  }
  if (o.collar) b.box(mats.std({ color: o.collar, roughness: 0.8 }), 0.34, 0.1, 0.24, 0, shoulderY + 0.02, -0.02);
  if (o.hiVis) {
    b.box(mats.std({ color: o.hiVis, roughness: 0.7, emissive: new THREE.Color(o.hiVis), emissiveIntensity: 0.35 }), 0.42, 0.1, 0.28, 0, shoulderY - 0.18, 0);
  }
  if (o.stripes) {
    for (let i = 0; i < 3; i++) b.box(mats.std({ color: 0xf2f0ea, roughness: 0.8 }), 0.41, 0.05, 0.27, 0, hipY + 0.18 + i * 0.16, 0);
  }
  if (o.quilted) {
    for (let i = 0; i < 4; i++) b.box(shade ? mats.std({ color: shade(o.coat, -0.12), roughness: 0.9 }) : coat, 0.41, 0.03, 0.27, 0, hipY + 0.1 + i * 0.16, 0);
  }
  if (o.panels && glowMat) {
    for (const s of [-1, 1]) b.box(glowMat, 0.03, shoulderY - hipY + 0.2, 0.03, s * 0.2, (hipY + shoulderY) / 2, 0.13, 0, 0, 0, { label: 'EL seam trim' });
    b.box(glowMat, 0.28, 0.03, 0.03, 0, shoulderY - 0.3, 0.14);
  }
  if (o.belt) b.box(mats.std({ color: o.belt, roughness: 0.6 }), 0.42, 0.07, 0.28, 0, hipY + 0.02, 0);
  if (o.lanyard) {
    b.box(mats.std({ color: o.lanyard, roughness: 0.8 }), 0.04, 0.3, 0.02, 0, shoulderY - 0.2, 0.14);
    b.box(mats.std({ color: 0xf2f0ea, roughness: 0.5 }), 0.09, 0.13, 0.01, 0, shoulderY - 0.4, 0.15, 0, 0, 0, { label: 'ID badge' });
  }
  if (o.exo) {
    for (const s of [-1, 1]) {
      b.box(mats.std({ color: 0x8a9298, roughness: 0.4, metalness: 0.7 }), 0.06, 0.7, 0.06, s * 0.24, hipY + 0.3, -0.12, 0, 0, 0, { label: 'Exoskeleton frame' });
      b.box(mats.std({ color: 0x8a9298, roughness: 0.4, metalness: 0.7 }), 0.06, 0.5, 0.06, s * 0.18, hipY - 0.35, -0.1);
    }
    if (glowMat) b.box(glowMat, 0.12, 0.12, 0.08, 0, hipY + 0.5, -0.16);
  }

  // ---- head ------------------------------------------------------------
  b.box(skin, 0.1, 0.14, 0.1, 0, shoulderY + 0.08, 0);
  b.sphere(skin, 0.115, 0, headY, 0, 12, { label: o.label });
  b.box(skin, 0.13, 0.14, 0.13, 0, headY - 0.02, 0.01);
  // hair
  if (o.mohawk) {
    for (let i = 0; i < 6; i++) b.box(hair, 0.04, 0.22 - Math.abs(i - 2.5) * 0.03, 0.16, 0, headY + 0.16, -0.06 + i * 0.024, 0, 0, 0, { label: 'Mohawk' });
  } else if (o.bigHair) {
    b.sphere(hair, 0.2, 0, headY + 0.07, -0.02, 12, { label: 'Volumised hair' });
    b.sphere(hair, 0.13, 0.12, headY + 0.02, -0.06, 10);
    b.sphere(hair, 0.13, -0.12, headY + 0.02, -0.06, 10);
  } else if (o.hairBob) {
    b.sphere(hair, 0.14, 0, headY + 0.03, 0, 12);
    b.box(hair, 0.28, 0.16, 0.24, 0, headY - 0.04, -0.02, 0, 0, 0, { label: 'Bob cut' });
  } else if (o.hairLong) {
    b.sphere(hair, 0.13, 0, headY + 0.03, 0, 12);
    b.box(hair, 0.24, 0.3, 0.16, 0, headY - 0.12, -0.07);
  } else if (o.hairBun) {
    b.sphere(hair, 0.125, 0, headY + 0.03, 0, 12);
    b.sphere(hair, 0.07, 0, headY + 0.06, -0.14, 10, { label: 'Top knot' });
  } else {
    b.sphere(hair, 0.125, 0, headY + 0.025, -0.01, 12);
  }
  // hats
  const hat = o.hat;
  if (hat) {
    const hm = mats.std({ color: hat.color, roughness: hat.type === 'helmet' || hat.type === 'visor' ? 0.35 : 0.9, metalness: hat.type === 'visor' ? 0.4 : 0 });
    switch (hat.type) {
      case 'fedora':
        b.cyl(hm, 0.3, 0.02, 0, headY + 0.1, 0, 16, 0, 0, 0, { label: 'Fedora' });
        b.cyl(hm, 0.135, 0.16, 0, headY + 0.18, 0, 14);
        b.cyl(mats.std({ color: shade(hat.color, -0.4), roughness: 0.8 }), 0.14, 0.04, 0, headY + 0.12, 0, 14);
        break;
      case 'flatcap':
        b.sphere(hm, 0.14, 0, headY + 0.06, -0.01, 12, { label: 'Flat cap' });
        b.box(hm, 0.24, 0.03, 0.16, 0, headY + 0.07, 0.13);
        break;
      case 'dixie':
        b.cyl(hm, 0.15, 0.09, 0, headY + 0.14, 0, 16, 0, 0, 0, { label: 'Sailor cap' });
        b.cyl(hm, 0.13, 0.06, 0, headY + 0.19, 0, 16);
        break;
      case 'pillbox':
        b.cyl(hm, 0.13, 0.1, 0, headY + 0.15, -0.02, 14, 0, 0, 0.1, { label: 'Pillbox hat' });
        break;
      case 'scarf':
        b.sphere(hm, 0.145, 0, headY + 0.04, -0.01, 12, { label: 'Headscarf' });
        b.box(hm, 0.12, 0.16, 0.06, 0, headY - 0.1, -0.12, 0.4, 0, 0);
        break;
      case 'garrison':
        b.box(hm, 0.26, 0.1, 0.2, 0, headY + 0.12, 0, 0, 0, 0.06, { label: 'Garrison cap' });
        break;
      case 'hardhat':
        b.sphere(hm, 0.16, 0, headY + 0.08, 0, 12, { label: 'Hard hat' });
        b.cyl(hm, 0.19, 0.02, 0, headY + 0.04, 0, 16);
        break;
      case 'peaked':
        b.cyl(hm, 0.15, 0.1, 0, headY + 0.13, 0, 16, 0, 0, 0, { label: 'Peaked cap' });
        b.box(hm, 0.26, 0.03, 0.14, 0, headY + 0.09, 0.15);
        b.box(mats.std({ color: 0xc8a828, roughness: 0.4, metalness: 0.7 }), 0.08, 0.06, 0.02, 0, headY + 0.14, 0.15);
        break;
      case 'sweatband':
        b.cyl(hm, 0.135, 0.06, 0, headY + 0.06, 0, 14, 0, 0, 0, { label: 'Sweatband' });
        break;
      case 'ballcap':
      case 'cap-back':
        b.sphere(hm, 0.135, 0, headY + 0.05, 0, 12, { label: 'Baseball cap' });
        b.box(hm, 0.22, 0.03, 0.15, 0, headY + 0.06, hat.type === 'ballcap' ? 0.14 : -0.14);
        break;
      case 'beanie':
        b.sphere(hm, 0.14, 0, headY + 0.05, 0, 12, { label: 'Beanie' });
        b.cyl(hm, 0.145, 0.07, 0, headY + 0.02, 0, 14);
        break;
      case 'hood':
        b.sphere(hm, 0.19, 0, headY + 0.02, -0.06, 12, { label: 'Hood' });
        break;
      case 'helmet':
        b.sphere(hm, 0.16, 0, headY + 0.04, 0, 12, { label: 'Cycle helmet' });
        for (let i = 0; i < 3; i++) b.box(mats.std({ color: 0x14181f, roughness: 0.5 }), 0.03, 0.12, 0.2, -0.06 + i * 0.06, headY + 0.14, 0);
        break;
      case 'visor':
        b.sphere(hm, 0.145, 0, headY + 0.03, 0, 12, { label: 'Visor' });
        b.box(mats.glow({ color: 0x101828, emissive: o.glow ?? 0x7cf7ff, emissiveIntensity: 1.6 }), 0.24, 0.07, 0.04, 0, headY + 0.01, 0.11, 0, 0, 0, { label: 'HUD visor' });
        break;
      default:
        break;
    }
  }
  // face hint
  b.box(mats.std({ color: 0x2a2018, roughness: 0.9 }), 0.14, 0.015, 0.01, 0, headY + 0.02, 0.115);

  // ---- carried things ---------------------------------------------------
  const prop = opts.prop;
  const propMats = {
    briefcase: 0x4a3020, newspaper: 0xd8d2c0, hatbox: 0xd8c0a8, shoppingBag: 0xd85a4a,
    boombox: 0x2a2a2e, skateboard: 0x8a4a2a, coffee: 0xf0ece2, flipPhone: 0x2a2f36,
    backpack: 0x2b3f6b, umbrella: 0x2a2f36, phone: 0x1a1d22, tote: 0xd8cfa8,
    yogaMat: 0x8f7bff, companionDrone: 0x2a3352, holoSlate: 0x1b2334, camera: 0x2a2a2e,
  };
  if (prop && propMats[prop] !== undefined) {
    const pm = mats.std({ color: propMats[prop], roughness: 0.7 });
    switch (prop) {
      case 'briefcase':
        b.box(pm, 0.1, 0.24, 0.34, 0.28, hipY - 0.1, 0.02, 0, 0, 0, { label: 'Briefcase' });
        b.box(mats.std({ color: 0x2a1a12, roughness: 0.6 }), 0.02, 0.06, 0.1, 0.28, hipY + 0.04, 0.02);
        break;
      case 'newspaper':
        b.box(pm, 0.03, 0.24, 0.2, 0.26, hipY + 0.14, 0.1, 0, 0, 0.3, { label: 'Evening paper' });
        break;
      case 'hatbox':
        b.cyl(pm, 0.12, 0.16, 0.28, hipY - 0.05, 0.02, 14, 0, 0, 0, { label: 'Hat box' });
        break;
      case 'shoppingBag':
        b.box(pm, 0.18, 0.24, 0.12, 0.26, hipY - 0.12, 0.04, 0, 0, 0, { label: 'Shopping bag' });
        break;
      case 'boombox':
        b.box(pm, 0.44, 0.24, 0.14, 0.34, shoulderY + 0.04, -0.06, 0, 0, 0, { label: 'Boombox' });
        for (const s of [-1, 1]) b.cyl(mats.std({ color: 0x4a4a52, roughness: 0.5 }), 0.07, 0.02, 0.34 + s * 0.13, shoulderY + 0.04, 0.02, 12, Math.PI / 2, 0, 0);
        break;
      case 'skateboard':
        b.box(pm, 0.7, 0.04, 0.2, 0.28, hipY - 0.1, 0.06, 0, 0, 1.2, { label: 'Skateboard' });
        break;
      case 'coffee':
        b.cyl(pm, 0.045, 0.12, 0.24, hipY + 0.36, 0.14, 12, 0, 0, 0, { label: 'Coffee cup' });
        b.cyl(mats.std({ color: 0xd8d2c0, roughness: 0.6 }), 0.05, 0.02, 0.24, hipY + 0.43, 0.14, 12);
        break;
      case 'flipPhone':
        b.box(pm, 0.04, 0.11, 0.05, 0.2, shoulderY - 0.02, 0.1, 0, 0, 0.2, { label: 'Flip phone' });
        break;
      case 'phone':
        b.box(pm, 0.07, 0.14, 0.01, 0.16, shoulderY - 0.22, 0.22, -0.4, 0, 0, { label: 'Smartphone' });
        b.box(mats.glow({ color: 0x101418, emissive: 0xbfe4ff, emissiveIntensity: 1.4 }), 0.06, 0.12, 0.005, 0.16, shoulderY - 0.215, 0.228, -0.4, 0, 0);
        break;
      case 'backpack':
        b.box(pm, 0.3, 0.4, 0.16, 0, shoulderY - 0.22, -0.2, 0, 0, 0, { label: 'Backpack' });
        b.box(mats.std({ color: shade(propMats[prop], -0.3), roughness: 0.7 }), 0.24, 0.12, 0.04, 0, shoulderY - 0.28, -0.29);
        break;
      case 'umbrella':
        b.cyl(mats.std({ color: 0x2a2622, roughness: 0.6 }), 0.015, 0.8, 0.26, hipY + 0.3, 0.06, 6, 0, 0, 0.1, { label: 'Umbrella' });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          b.plane(mats.std({ color: propMats[prop], roughness: 0.8, side: THREE.DoubleSide }), 0.34, 0.34, 0.26 + Math.cos(a) * 0.17, hipY + 0.74, 0.06 + Math.sin(a) * 0.17, -1.2, a, 0);
        }
        break;
      case 'tote':
        b.box(pm, 0.24, 0.3, 0.12, 0.27, hipY - 0.06, 0.02, 0, 0, 0, { label: 'Tote bag' });
        b.box(mats.std({ color: shade(propMats[prop], -0.3), roughness: 0.8 }), 0.02, 0.18, 0.02, 0.27, hipY + 0.18, 0.02);
        break;
      case 'yogaMat':
        b.cyl(pm, 0.075, 0.6, 0, shoulderY - 0.2, -0.24, 12, 0, 0, Math.PI / 2 + 0.3, { label: 'Yoga mat' });
        break;
      case 'holoSlate':
        b.box(mats.glow({ color: 0x101828, emissive: 0x7cf7ff, emissiveIntensity: 1.8 }), 0.2, 0.13, 0.01, 0.2, shoulderY - 0.18, 0.2, -0.5, 0, 0, { label: 'Holo slate' });
        break;
      case 'camera':
        b.box(pm, 0.13, 0.09, 0.07, 0.1, shoulderY - 0.1, 0.16, 0, 0, 0, { label: 'Rangefinder camera' });
        b.cyl(mats.std({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.6 }), 0.035, 0.05, 0.1, shoulderY - 0.1, 0.21, 12, Math.PI / 2, 0, 0);
        break;
      default:
        break;
    }
  }
  if (o.papers) {
    b.box(mats.std({ color: 0xd8d2c0, roughness: 0.9 }), 0.28, 0.16, 0.2, 0.2, hipY + 0.1, 0.14, 0, 0, 0.2, { label: 'Stack of newspapers' });
  }
  if (o.backpack) {
    b.box(mats.std({ color: o.backpack, roughness: 0.8 }), 0.3, 0.4, 0.16, 0, shoulderY - 0.22, -0.2, 0, 0, 0, { label: 'Backpack' });
  }
  if (o.tote) {
    b.box(mats.std({ color: o.tote, roughness: 0.85 }), 0.24, 0.28, 0.12, 0.26, hipY - 0.04, 0.02, 0, 0, 0, { label: 'Tote' });
  }
  if (o.bag) {
    b.box(mats.std({ color: o.bag, roughness: 0.8 }), 0.3, 0.22, 0.1, 0.16, hipY - 0.06, 0.14, 0, 0, 0, { label: 'Messenger bag' });
  }
  if (o.thermalBag) {
    b.box(mats.std({ color: o.thermalBag, roughness: 0.75 }), 0.42, 0.42, 0.3, 0, shoulderY - 0.3, -0.28, 0, 0, 0, { label: 'Insulated delivery box' });
    b.box(mats.std({ color: 0xf2f0ea, roughness: 0.8 }), 0.2, 0.14, 0.01, 0, shoulderY - 0.28, -0.44);
  }
  if (o.mat) {
    b.cyl(mats.std({ color: o.mat, roughness: 0.8 }), 0.075, 0.6, 0, shoulderY - 0.24, -0.24, 12, 0, 0, Math.PI / 2 + 0.25, { label: 'Yoga mat' });
  }
  if (o.slate) {
    b.box(mats.glow({ color: 0x101828, emissive: 0x7cffd4, emissiveIntensity: 1.8 }), 0.22, 0.15, 0.01, 0.22, shoulderY - 0.2, 0.18, -0.5, 0, 0, { label: 'Diagnostic slate' });
  }
  if (o.boombox) {
    b.box(mats.std({ color: 0x2a2a2e, roughness: 0.6 }), 0.44, 0.24, 0.14, 0.34, shoulderY + 0.02, -0.06, 0, 0, 0, { label: 'Boombox' });
  }

  const bodyMeshes = b.build(group, { castShadow: true });
  void bodyMeshes;

  // ---- limbs (animated) -------------------------------------------------
  const limbs = { legs: [], arms: [] };
  const legLen = 0.86;
  const armLen = 0.56;
  for (const s of [-1, 1]) {
    const legPivot = new THREE.Group();
    legPivot.position.set(s * 0.11, hipY - 0.02, 0);
    const lb = new Batch('leg');
    if (o.dress || o.coatLen > 0.9) {
      lb.cyl(mats.std({ color: SKINS[2], roughness: 0.88 }), 0.055, legLen * 0.5, 0, -legLen * 0.32, 0, 8);
    } else {
      lb.box(pants, 0.15, legLen * 0.62, 0.17, 0, -legLen * 0.32, 0);
    }
    if (o.baggy) lb.box(pants, 0.19, legLen * 0.34, 0.2, 0, -legLen * 0.6, 0.01);
    if (o.legWarmers) lb.cyl(mats.std({ color: o.legWarmers, roughness: 0.9 }), 0.085, 0.26, 0, -legLen * 0.62, 0, 10, 0, 0, 0, { label: 'Leg warmers' });
    if (o.boots) lb.cyl(mats.std({ color: o.boots, roughness: 0.5 }), 0.075, 0.3, 0, -legLen * 0.6, 0, 10, 0, 0, 0, { label: 'Go-go boots' });
    lb.box(shoes, 0.13, 0.09, 0.28, 0, -legLen * 0.82, 0.05);
    if (o.exo) lb.box(mats.std({ color: 0x8a9298, roughness: 0.4, metalness: 0.7 }), 0.05, legLen * 0.6, 0.05, s * 0.1, -legLen * 0.3, -0.08);
    lb.build(legPivot, { castShadow: true });
    group.add(legPivot);
    limbs.legs.push({ pivot: legPivot, side: s });

    const armPivot = new THREE.Group();
    armPivot.position.set(s * 0.23, shoulderY - 0.04, 0);
    const ab = new Batch('arm');
    ab.box(coat, 0.11, armLen * 0.72, 0.13, 0, -armLen * 0.36, 0);
    ab.sphere(skin, 0.055, 0, -armLen * 0.78, 0.01, 8);
    if (o.gloves) ab.sphere(mats.std({ color: o.gloves, roughness: 0.8 }), 0.06, 0, -armLen * 0.78, 0.01, 8);
    if (o.panels && glowMat) ab.box(glowMat, 0.03, armLen * 0.5, 0.03, s * 0.055, -armLen * 0.34, 0.06);
    ab.build(armPivot, { castShadow: true });
    group.add(armPivot);
    limbs.arms.push({ pivot: armPivot, side: s });
  }

  // contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.7),
    mats.basic({ map: blobTex(0x000000, 2.0), transparent: true, opacity: 0.45, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  group.scale.setScalar(scale);
  group.userData.label = o.label;
  return { group, limbs, outfit: o };
}

// ---------------------------------------------------------------------------
/** Populate the pavements. Returns an updater. */
export function createCrowd(ctx) {
  const { era } = ctx;
  const rng = makeRng('crowd' + era.id);
  const root = new THREE.Group();
  root.name = 'crowd';
  ctx.root.add(root);
  const people = [];

  const count = Math.round(era.crowd.density * 20);
  const northZ = [L.facadeZ + 1.1, L.curbNorthZ - 1.0];
  const southZ = [L.curbSouthZ + 1.0, L.sidewalkSouthZ - 0.8];

  for (let i = 0; i < count; i++) {
    const outfit = era.crowd.outfits[i % era.crowd.outfits.length];
    const prop = era.crowd.props[i % era.crowd.props.length];
    const p = buildPerson(ctx, outfit, { seed: i, prop: prop === 'none' ? null : prop });
    const north = i % 3 !== 2;
    const zr = north ? northZ : southZ;
    const z = rng.range(zr[0], zr[1]);
    const dir = rng() < 0.5 ? 1 : -1;
    const x = rng.range(-38, 38);
    p.group.position.set(x, swY, z);
    p.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(p.group);

    // one in five stops to look in a window
    const idle = rng() < 0.2;
    people.push({
      ...p,
      dir,
      speed: idle ? 0 : era.crowd.speed * rng.range(0.75, 1.3),
      phase: rng() * TAU,
      idle,
      lookAt: idle && north ? L.facadeZ : null,
      bobAmp: rng.range(0.015, 0.035),
      z,
      north,
    });
    if (idle && north) p.group.rotation.y = Math.PI;
  }

  // static extras requested by other builders (attendants, vendors)
  for (const ex of ctx.extraPeople) {
    const p = buildPerson(ctx, ex.outfit, { seed: 900 + people.length, prop: null });
    p.group.position.set(ex.x, ex.y ?? swY, ex.z);
    p.group.rotation.y = ex.rot ?? 0;
    root.add(p.group);
    people.push({ ...p, dir: 0, speed: 0, phase: rng() * TAU, idle: true, bobAmp: 0.01 });
  }

  // a pair waiting at the crossing
  for (let i = 0; i < 2; i++) {
    const outfit = era.crowd.outfits[(i + 3) % era.crowd.outfits.length];
    const p = buildPerson(ctx, outfit, { seed: 500 + i, prop: era.crowd.props[i] === 'none' ? null : era.crowd.props[i] });
    p.group.position.set(L.crossEast[0] - 1.4 - i * 0.7, swY, L.curbNorthZ - 0.9);
    p.group.rotation.y = Math.PI / 2;
    root.add(p.group);
    people.push({ ...p, dir: 0, speed: 0, phase: rng() * TAU, idle: true, bobAmp: 0.012 });
  }

  return {
    root,
    people,
    update(dt, time) {
      for (const p of people) {
        if (p.speed > 0) {
          p.group.position.x += p.dir * p.speed * dt;
          if (p.group.position.x > 40) p.group.position.x = -40;
          if (p.group.position.x < -40) p.group.position.x = 40;
          const t = time * p.speed * 3.2 + p.phase;
          const swing = Math.sin(t) * 0.62;
          p.limbs.legs[0].pivot.rotation.x = swing;
          p.limbs.legs[1].pivot.rotation.x = -swing;
          p.limbs.arms[0].pivot.rotation.x = -swing * 0.7;
          p.limbs.arms[1].pivot.rotation.x = swing * 0.7;
          p.group.position.y = swY + Math.abs(Math.sin(t)) * p.bobAmp;
        } else {
          const t = time * 0.9 + p.phase;
          p.limbs.arms[0].pivot.rotation.x = Math.sin(t) * 0.05;
          p.limbs.arms[1].pivot.rotation.x = -Math.sin(t * 1.1) * 0.05;
          p.group.position.y = swY + Math.sin(t) * 0.004;
        }
      }
    },
  };
}
