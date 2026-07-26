import * as THREE from 'three';
import { LAYOUT } from '../config/block.js';
import { Batch, extrudeSpline } from '../lib/geom.js';
import { placardTex, wallAdTex, storefrontSign } from '../lib/signs.js';
import { blobTex } from '../lib/textures.js';
import { makeRng, mixHex, shade, clamp, TAU, wrap } from '../lib/util.js';

const L = LAYOUT;

/**
 * Vehicles are extruded side-profiles. Change the profile and the era changes:
 * 1945 is all rounded pontoon fenders and running boards, 1965 grows fins and
 * chrome, 1985 goes rectilinear, 2005 rounds off into jellybean SUVs, 2025 is a
 * smooth one-box EV, and 2055 stops touching the ground altogether.
 */

const P = {
  // ---- 1945 -------------------------------------------------------------
  sedan45: {
    len: 4.6, wide: 1.85, wheelR: 0.44, wheelbase: 2.7, ride: 0.02,
    profile: [
      [-2.3, 0.30], [-2.36, 0.86], [-2.0, 1.08], [-1.5, 1.2], [-1.05, 1.74],
      [0.3, 1.8], [0.85, 1.26], [1.65, 1.14], [2.06, 1.0], [2.3, 0.62], [2.26, 0.30],
    ],
    cabin: [-1.15, 0.75], cabinTop: 1.78, beltline: 1.16,
    fenders: 'pontoon', runningBoard: true, whitewall: true, chrome: 0.85,
    lights: 'round-standalone', grille: 'vertical-bars', visor: true,
    colors: [0x1b1b1e, 0x22303a, 0x2f3a2b, 0x4a2b2b, 0x5a5f63, 0x1f2a3a],
    label: 'Late-1940s four-door sedan',
  },
  coupe45: {
    len: 4.3, wide: 1.8, wheelR: 0.43, wheelbase: 2.55, ride: 0.02,
    profile: [
      [-2.15, 0.30], [-2.2, 0.84], [-1.8, 1.06], [-1.2, 1.16], [-0.7, 1.66],
      [0.25, 1.7], [0.8, 1.22], [1.6, 1.1], [1.98, 0.96], [2.15, 0.6], [2.12, 0.30],
    ],
    cabin: [-0.8, 0.7], cabinTop: 1.68, beltline: 1.12,
    fenders: 'pontoon', runningBoard: true, whitewall: true, chrome: 0.8,
    lights: 'round-standalone', grille: 'vertical-bars', visor: true,
    colors: [0x6b2f2f, 0x2b3f4a, 0x3f4a2f, 0x1b1b1e, 0x8a7f5a],
    label: 'Late-1940s business coupe',
  },
  taxi45: {
    len: 4.8, wide: 1.9, wheelR: 0.45, wheelbase: 2.9, ride: 0.02,
    profile: [
      [-2.4, 0.30], [-2.46, 0.9], [-2.1, 1.12], [-1.6, 1.24], [-1.15, 1.86],
      [0.35, 1.92], [0.9, 1.3], [1.7, 1.16], [2.12, 1.02], [2.4, 0.64], [2.36, 0.30],
    ],
    cabin: [-1.25, 0.8], cabinTop: 1.9, beltline: 1.2,
    fenders: 'pontoon', runningBoard: true, whitewall: true, chrome: 0.85,
    lights: 'round-standalone', grille: 'vertical-bars', visor: true,
    taxi: { color: 0xd8a828, checker: true, sign: 'TAXI' },
    colors: [0xd8a828],
    label: '1940s checker cab',
  },
  panel45: {
    len: 5.0, wide: 1.95, wheelR: 0.46, wheelbase: 3.0, ride: 0.04,
    profile: [
      [-2.5, 0.34], [-2.55, 2.1], [-0.2, 2.2], [0.7, 2.05], [1.05, 1.35],
      [1.8, 1.2], [2.2, 1.05], [2.45, 0.66], [2.42, 0.34],
    ],
    cabin: [0.15, 1.0], cabinTop: 2.05, beltline: 1.3,
    fenders: 'pontoon', runningBoard: true, whitewall: false, chrome: 0.6,
    lights: 'round-standalone', grille: 'vertical-bars', visor: true,
    signPanel: { text: 'CARTAGE', sub: 'MOVING  •  STORAGE' },
    colors: [0x2f4a3f, 0x6b3a2a, 0x2b3a5a],
    label: '1940s panel delivery van',
  },
  pickup45: {
    len: 4.7, wide: 1.9, wheelR: 0.46, wheelbase: 2.8, ride: 0.05,
    profile: [
      [-2.35, 0.36], [-2.4, 1.15], [-0.5, 1.2], [-0.45, 1.9], [0.35, 1.95],
      [0.85, 1.32], [1.7, 1.18], [2.1, 1.04], [2.35, 0.68], [2.32, 0.36],
    ],
    cabin: [-0.45, 0.8], cabinTop: 1.93, beltline: 1.3,
    fenders: 'pontoon', runningBoard: true, whitewall: false, chrome: 0.55,
    lights: 'round-standalone', grille: 'vertical-bars', bed: true, visor: true,
    colors: [0x3f4a35, 0x6b4a2a, 0x2b3a44],
    label: '1940s half-ton pickup',
  },
  // ---- 1965 -------------------------------------------------------------
  fin65: {
    len: 5.5, wide: 2.0, wheelR: 0.4, wheelbase: 3.3, ride: -0.02,
    profile: [
      [-2.75, 0.28], [-2.85, 1.02], [-2.4, 0.84], [-1.7, 0.92], [-1.25, 1.42],
      [0.55, 1.46], [1.1, 1.0], [2.3, 0.92], [2.72, 0.84], [2.75, 0.34],
    ],
    cabin: [-1.35, 1.0], cabinTop: 1.44, beltline: 0.94,
    fenders: 'integrated', runningBoard: false, whitewall: true, chrome: 1.0,
    lights: 'quad-round', grille: 'wide-chrome', fins: true,
    colors: [0xd8e4e8, 0xa8d8d0, 0xe8d8a8, 0xd8a8b8, 0x2b4a7a, 0xf0f0ea],
    label: '1965 full-size sedan with tailfins',
  },
  wagon65: {
    len: 5.6, wide: 2.0, wheelR: 0.4, wheelbase: 3.3, ride: -0.01,
    profile: [
      [-2.8, 0.3], [-2.85, 1.5], [-1.4, 1.56], [-1.2, 1.5], [0.5, 1.52],
      [1.05, 1.02], [2.3, 0.94], [2.72, 0.86], [2.76, 0.34],
    ],
    cabin: [-1.3, 1.0], cabinTop: 1.5, beltline: 0.96,
    fenders: 'integrated', runningBoard: false, whitewall: true, chrome: 0.9,
    lights: 'quad-round', grille: 'wide-chrome', roofRack: true,
    colors: [0x8a9a6a, 0xd8d8c8, 0x6a8a9a, 0xa87a5a],
    label: '1965 station wagon',
  },
  muscle65: {
    len: 5.0, wide: 1.95, wheelR: 0.41, wheelbase: 2.95, ride: -0.03,
    profile: [
      [-2.5, 0.28], [-2.55, 0.92], [-2.0, 0.86], [-1.5, 0.92], [-0.9, 1.32],
      [0.5, 1.36], [1.0, 0.96], [2.1, 0.9], [2.45, 0.82], [2.48, 0.32],
    ],
    cabin: [-1.0, 0.85], cabinTop: 1.34, beltline: 0.9,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.8,
    lights: 'quad-round', grille: 'blackout', stripes: true,
    colors: [0xc0392b, 0x1b2a4a, 0x2f6b3a, 0xe8b923],
    label: '1965 two-door hardtop',
  },
  van65: {
    len: 4.4, wide: 1.85, wheelR: 0.36, wheelbase: 2.4, ride: 0.06,
    profile: [
      [-2.2, 0.34], [-2.28, 2.05], [-0.6, 2.15], [1.3, 2.05], [1.9, 1.5],
      [2.15, 1.0], [2.2, 0.36],
    ],
    cabin: [0.3, 1.4], cabinTop: 2.1, beltline: 1.35,
    fenders: 'integrated', runningBoard: false, whitewall: true, chrome: 0.5,
    lights: 'round', grille: 'none', twoTone: true,
    colors: [0xd8d8d0, 0x7aa8c8, 0xd8a86a],
    label: '1965 forward-control van',
  },
  taxi65: {
    len: 5.5, wide: 2.0, wheelR: 0.4, wheelbase: 3.3, ride: -0.01,
    profile: [
      [-2.75, 0.3], [-2.85, 1.0], [-2.4, 0.86], [-1.7, 0.94], [-1.25, 1.5],
      [0.55, 1.54], [1.1, 1.02], [2.3, 0.94], [2.72, 0.86], [2.75, 0.34],
    ],
    cabin: [-1.35, 1.0], cabinTop: 1.52, beltline: 0.96,
    fenders: 'integrated', runningBoard: false, whitewall: true, chrome: 0.95,
    lights: 'quad-round', grille: 'wide-chrome',
    taxi: { color: 0xe8b923, checker: true, sign: 'TAXI' },
    colors: [0xe8b923],
    label: '1965 checker cab',
  },
  // ---- 1985 -------------------------------------------------------------
  box85: {
    len: 4.8, wide: 1.8, wheelR: 0.34, wheelbase: 2.75, ride: 0.0,
    profile: [
      [-2.4, 0.3], [-2.44, 1.02], [-1.75, 1.08], [-1.45, 1.44], [0.55, 1.46],
      [0.95, 1.06], [2.24, 1.0], [2.4, 0.92], [2.4, 0.32],
    ],
    cabin: [-1.5, 0.9], cabinTop: 1.45, beltline: 1.02,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.35,
    lights: 'rect', grille: 'plastic', blackTrim: true,
    colors: [0x8a7f5a, 0x6b4a2a, 0xd8d4c8, 0x2b3a4a, 0x8a2f2a, 0x4a4a4a],
    label: '1985 mid-size sedan',
  },
  hatch85: {
    len: 3.9, wide: 1.65, wheelR: 0.3, wheelbase: 2.35, ride: 0.0,
    profile: [
      [-1.95, 0.28], [-2.0, 1.28], [-1.3, 1.38], [0.35, 1.4], [0.8, 1.0],
      [1.8, 0.94], [1.95, 0.86], [1.95, 0.3],
    ],
    cabin: [-1.35, 0.75], cabinTop: 1.39, beltline: 0.98,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.2,
    lights: 'rect', grille: 'plastic', blackTrim: true,
    colors: [0xd8d8d0, 0xc0392b, 0x2b6b8a, 0xe8d84a],
    label: '1985 three-door hatchback',
  },
  wagon85: {
    len: 5.0, wide: 1.85, wheelR: 0.34, wheelbase: 2.9, ride: 0.01,
    profile: [
      [-2.5, 0.3], [-2.54, 1.5], [-1.2, 1.54], [0.5, 1.52], [0.92, 1.06],
      [2.3, 1.0], [2.48, 0.92], [2.48, 0.32],
    ],
    cabin: [-1.3, 0.88], cabinTop: 1.52, beltline: 1.04,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.3,
    lights: 'rect', grille: 'plastic', roofRack: true, woodPanel: true,
    colors: [0x8a7f5a, 0x3f4a5a, 0xa8a8a0],
    label: '1985 wood-panelled wagon',
  },
  van85: {
    len: 5.2, wide: 1.95, wheelR: 0.36, wheelbase: 3.0, ride: 0.05,
    profile: [
      [-2.6, 0.34], [-2.66, 2.1], [-0.4, 2.16], [1.2, 2.0], [1.75, 1.3],
      [2.4, 1.16], [2.58, 0.9], [2.58, 0.36],
    ],
    cabin: [0.3, 1.35], cabinTop: 2.05, beltline: 1.3,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.25,
    lights: 'rect', grille: 'plastic',
    signPanel: { text: 'VIDEO 2000', sub: 'DELIVERY' },
    colors: [0xd8d4c8, 0x2b3a6a, 0x8a8f94],
    label: '1985 panel van',
  },
  taxi85: {
    len: 5.2, wide: 1.9, wheelR: 0.35, wheelbase: 3.0, ride: 0.01,
    profile: [
      [-2.6, 0.3], [-2.64, 1.04], [-1.9, 1.1], [-1.6, 1.48], [0.6, 1.5],
      [1.0, 1.08], [2.4, 1.02], [2.6, 0.94], [2.6, 0.32],
    ],
    cabin: [-1.65, 0.95], cabinTop: 1.49, beltline: 1.04,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.4,
    lights: 'rect', grille: 'plastic',
    taxi: { color: 0xe8c02a, checker: false, sign: 'TAXI' },
    colors: [0xe8c02a],
    label: '1985 taxi',
  },
  // ---- 2005 -------------------------------------------------------------
  sedan05: {
    len: 4.7, wide: 1.8, wheelR: 0.33, wheelbase: 2.75, ride: 0.0,
    profile: [
      [-2.35, 0.3], [-2.4, 1.1], [-1.7, 1.2], [-1.2, 1.44], [0.5, 1.46],
      [1.05, 1.14], [2.2, 1.04], [2.36, 0.88], [2.34, 0.32],
    ],
    cabin: [-1.3, 0.85], cabinTop: 1.45, beltline: 1.1,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.35,
    lights: 'swept', grille: 'body', bodyKit: true,
    colors: [0xa8adb2, 0xd8dcdf, 0x2b3138, 0x6b1f1f, 0x1f3a6b, 0x8a9298],
    label: '2005 mid-size saloon',
  },
  suv05: {
    len: 4.9, wide: 1.95, wheelR: 0.4, wheelbase: 2.9, ride: 0.14,
    profile: [
      [-2.45, 0.36], [-2.5, 1.7], [-1.5, 1.78], [0.3, 1.76], [0.85, 1.34],
      [2.2, 1.24], [2.42, 1.0], [2.42, 0.38],
    ],
    cabin: [-1.55, 0.9], cabinTop: 1.77, beltline: 1.3,
    fenders: 'flared', runningBoard: true, whitewall: false, chrome: 0.4,
    lights: 'swept', grille: 'chrome-slats', roofRack: true,
    colors: [0x2b3138, 0x8a8f94, 0x4a3a2a, 0xd8dcdf, 0x1f3a2a],
    label: '2005 mid-size SUV',
  },
  minivan05: {
    len: 5.0, wide: 1.9, wheelR: 0.35, wheelbase: 3.0, ride: 0.04,
    profile: [
      [-2.5, 0.32], [-2.56, 1.66], [-1.6, 1.82], [0.2, 1.8], [0.95, 1.3],
      [2.25, 1.18], [2.46, 0.96], [2.46, 0.34],
    ],
    cabin: [-1.7, 1.0], cabinTop: 1.81, beltline: 1.24,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.3,
    lights: 'swept', grille: 'body',
    colors: [0x9aa0a6, 0xd8dcdf, 0x6b7a8a, 0x2b3138],
    label: '2005 minivan',
  },
  van05: {
    len: 5.4, wide: 2.0, wheelR: 0.37, wheelbase: 3.2, ride: 0.06,
    profile: [
      [-2.7, 0.34], [-2.76, 2.3], [-0.3, 2.36], [1.3, 2.16], [1.85, 1.4],
      [2.5, 1.24], [2.66, 0.96], [2.66, 0.36],
    ],
    cabin: [0.4, 1.45], cabinTop: 2.2, beltline: 1.4,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.2,
    lights: 'swept', grille: 'body',
    signPanel: { text: 'COURIER', sub: 'NEXT DAY' },
    colors: [0xf0f0ee, 0xd8a828, 0x8a4a2a],
    label: '2005 courier van',
  },
  taxi05: {
    len: 4.9, wide: 1.95, wheelR: 0.4, wheelbase: 2.9, ride: 0.12,
    profile: [
      [-2.45, 0.36], [-2.5, 1.68], [-1.5, 1.76], [0.3, 1.74], [0.85, 1.32],
      [2.2, 1.22], [2.42, 1.0], [2.42, 0.38],
    ],
    cabin: [-1.55, 0.9], cabinTop: 1.75, beltline: 1.28,
    fenders: 'flared', runningBoard: false, whitewall: false, chrome: 0.35,
    lights: 'swept', grille: 'chrome-slats',
    taxi: { color: 0xe8c02a, checker: false, sign: 'TAXI' },
    colors: [0xe8c02a],
    label: '2005 hybrid taxi',
  },
  // ---- 2025 -------------------------------------------------------------
  ev25: {
    len: 4.7, wide: 1.9, wheelR: 0.36, wheelbase: 2.9, ride: 0.06,
    profile: [
      [-2.35, 0.32], [-2.42, 1.34], [-1.5, 1.6], [0.2, 1.62], [1.1, 1.26],
      [2.2, 1.1], [2.36, 0.86], [2.34, 0.34],
    ],
    cabin: [-1.6, 1.2], cabinTop: 1.61, beltline: 1.22,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.15,
    lights: 'lightbar', grille: 'sealed', glassRoof: true,
    colors: [0xdfe3e6, 0x2b3138, 0x1f4a6b, 0x6b6f74, 0xf2f4f6],
    label: '2025 battery-electric crossover',
  },
  suv25: {
    len: 5.0, wide: 2.0, wheelR: 0.42, wheelbase: 3.0, ride: 0.16,
    profile: [
      [-2.5, 0.38], [-2.56, 1.78], [-1.5, 1.86], [0.35, 1.84], [0.95, 1.4],
      [2.25, 1.28], [2.46, 1.02], [2.46, 0.4],
    ],
    cabin: [-1.55, 0.95], cabinTop: 1.85, beltline: 1.34,
    fenders: 'flared', runningBoard: true, whitewall: false, chrome: 0.2,
    lights: 'lightbar', grille: 'blackout', roofRack: true,
    colors: [0x2b3138, 0x1b1b1e, 0x8a8f94, 0xf2f4f6],
    label: '2025 large SUV',
  },
  sedan25: {
    len: 4.8, wide: 1.85, wheelR: 0.35, wheelbase: 2.85, ride: 0.02,
    profile: [
      [-2.4, 0.3], [-2.46, 1.16], [-1.7, 1.42], [0.1, 1.46], [1.05, 1.12],
      [2.25, 1.0], [2.4, 0.82], [2.38, 0.32],
    ],
    cabin: [-1.75, 1.0], cabinTop: 1.45, beltline: 1.1,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.15,
    lights: 'lightbar', grille: 'body',
    colors: [0x1b1b1e, 0xdfe3e6, 0x3a4a5a, 0x6b1f2a],
    label: '2025 saloon',
  },
  cargoVan25: {
    len: 5.4, wide: 2.0, wheelR: 0.38, wheelbase: 3.2, ride: 0.07,
    profile: [
      [-2.7, 0.34], [-2.76, 2.4], [-0.3, 2.46], [1.3, 2.2], [1.9, 1.4],
      [2.5, 1.2], [2.66, 0.92], [2.66, 0.36],
    ],
    cabin: [0.4, 1.45], cabinTop: 2.24, beltline: 1.4,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.1,
    lights: 'lightbar', grille: 'sealed',
    signPanel: { text: 'SAME DAY', sub: 'ZERO EMISSION FLEET' },
    colors: [0xf2f4f6, 0x1fa463, 0x2b3138],
    label: '2025 electric delivery van',
  },
  rideshare25: {
    len: 4.7, wide: 1.85, wheelR: 0.35, wheelbase: 2.8, ride: 0.04,
    profile: [
      [-2.35, 0.32], [-2.42, 1.3], [-1.55, 1.56], [0.2, 1.58], [1.05, 1.2],
      [2.2, 1.06], [2.36, 0.84], [2.34, 0.34],
    ],
    cabin: [-1.6, 1.1], cabinTop: 1.57, beltline: 1.18,
    fenders: 'integrated', runningBoard: false, whitewall: false, chrome: 0.12,
    lights: 'lightbar', grille: 'sealed', rideshare: true,
    colors: [0x2b3138, 0xdfe3e6],
    label: '2025 rideshare hybrid',
  },
  // ---- 2055 -------------------------------------------------------------
  pod55: {
    len: 3.9, wide: 1.9, wheelR: 0, wheelbase: 0, ride: 0.55, hover: true,
    profile: [
      [-1.95, 0.35], [-2.0, 1.15], [-1.5, 1.62], [0.2, 1.66], [1.55, 1.3],
      [1.95, 1.0], [1.98, 0.4],
    ],
    cabin: [-1.7, 1.7], cabinTop: 1.65, beltline: 1.0,
    fenders: 'none', runningBoard: false, chrome: 0.1,
    lights: 'lightblade', grille: 'none', glassRoof: true, skirtGlow: 0x7cf7ff,
    colors: [0xdfe6f2, 0x2a3352, 0x8f7bff, 0xc8d4e8],
    label: '2055 autonomous passenger pod',
  },
  shuttle55: {
    len: 7.5, wide: 2.3, wheelR: 0, wheelbase: 0, ride: 0.6, hover: true,
    profile: [
      [-3.75, 0.35], [-3.8, 2.3], [-3.0, 2.6], [3.0, 2.6], [3.7, 2.25], [3.75, 0.4],
    ],
    cabin: [-3.2, 3.2], cabinTop: 2.55, beltline: 1.2,
    fenders: 'none', runningBoard: false, chrome: 0.1,
    lights: 'lightblade', grille: 'none', skirtGlow: 0x7cf7ff, transit: true,
    colors: [0xe8eef6, 0x3a4a72],
    label: '2055 autonomous transit shuttle',
  },
  freight55: {
    len: 6.5, wide: 2.4, wheelR: 0, wheelbase: 0, ride: 0.8, hover: true,
    profile: [
      [-3.25, 0.3], [-3.3, 2.5], [3.0, 2.5], [3.25, 2.1], [3.25, 0.35],
    ],
    cabin: [3.0, 3.2], cabinTop: 2.45, beltline: 1.4,
    fenders: 'none', runningBoard: false, chrome: 0.1,
    lights: 'lightblade', grille: 'none', skirtGlow: 0xff7ad0, container: true,
    colors: [0x4a5570, 0x2f3850],
    label: '2055 hover freight skid',
  },
  trike55: {
    len: 2.6, wide: 1.2, wheelR: 0.28, wheelbase: 1.7, ride: 0.08,
    profile: [
      [-1.3, 0.3], [-1.34, 1.5], [-0.5, 1.7], [0.6, 1.6], [1.2, 1.0], [1.28, 0.34],
    ],
    cabin: [-0.6, 0.9], cabinTop: 1.68, beltline: 1.0,
    fenders: 'none', runningBoard: false, chrome: 0.1,
    lights: 'lightblade', grille: 'none', skirtGlow: 0x9ef07a,
    colors: [0x9ef07a, 0xdfe6f2],
    label: '2055 covered e-trike',
  },
};

/** Build a vehicle into `group`. */
export function buildVehicle(ctx, group, kind, opts = {}) {
  const { mats } = ctx;
  if (kind === 'streetcar') return buildStreetcar(ctx, group, opts);
  if (kind === 'bus65' || kind === 'bus85' || kind === 'bus05' || kind === 'bus25') return buildBus(ctx, group, kind, opts);
  const spec = P[kind];
  if (!spec) return;
  const rng = makeRng('veh' + kind + (opts.seed ?? 0));
  const b = new Batch('veh');
  const color = opts.color ?? spec.colors[rng.int(0, spec.colors.length - 1)];
  const bodyMat = mats.std({
    color: spec.taxi ? spec.taxi.color : color,
    roughness: kind.endsWith('45') ? 0.32 : kind.endsWith('55') ? 0.18 : 0.24,
    metalness: kind.endsWith('55') ? 0.5 : 0.65,
  });
  const chromeMat = mats.std({ color: 0xe0e4e8, roughness: 0.12, metalness: 0.98 });
  const darkMat = mats.std({ color: 0x14161a, roughness: 0.75, metalness: 0.2 });
  const glassMat = mats.glass({
    color: kind.endsWith('55') ? 0x1c2c48 : 0x1b2530,
    opacity: kind.endsWith('55') ? 0.55 : 0.72,
    roughness: 0.05,
    metalness: 0.6,
  });
  const rubberMat = mats.std({ color: 0x18181a, roughness: 0.92 });
  const trimMat = spec.blackTrim
    ? mats.std({ color: 0x1f1f22, roughness: 0.6 })
    : mats.std({ color: shade(color, -0.35), roughness: 0.4, metalness: 0.5 });

  // ---- body shell -------------------------------------------------------
  const bodyGeo = extrudeSpline(spec.profile, spec.wide, { bevel: kind.endsWith('45') ? 0.1 : 0.06, samples: 46 });
  bodyGeo.rotateY(Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.position.y = spec.ride;
  bodyMesh.userData.label = spec.label;
  group.add(bodyMesh);

  const halfW = spec.wide / 2;
  const y0 = spec.ride;

  // ---- glazing ----------------------------------------------------------
  const [cabFront, cabLen] = [spec.cabin[0], spec.cabin[1]];
  const cabTop = spec.cabinTop;
  const belt = spec.beltline;
  const winH = Math.max(0.25, cabTop - belt - 0.08);
  const winY = y0 + belt + winH / 2 + 0.02;
  // side glass
  for (const s of [-1, 1]) {
    b.plane(glassMat, cabLen * 0.94, winH, cabFront + cabLen / 2, winY, s * (halfW - 0.02), 0, s * Math.PI / 2, 0, 0, { label: 'Side glass' });
    // door line + handle
    b.box(trimMat, cabLen * 0.96, 0.03, 0.02, cabFront + cabLen / 2, y0 + belt - 0.02, s * (halfW + 0.01));
    b.box(chromeMat, 0.16, 0.05, 0.04, cabFront + cabLen * 0.3, y0 + belt - 0.16, s * (halfW + 0.02));
    if (cabLen > 1.6) b.box(chromeMat, 0.16, 0.05, 0.04, cabFront + cabLen * 0.72, y0 + belt - 0.16, s * (halfW + 0.02));
    // b-pillar
    if (cabLen > 1.5) b.box(bodyMat, 0.1, winH + 0.06, 0.06, cabFront + cabLen * 0.5, winY, s * (halfW + 0.005));
  }
  // windscreen + rear glass, raked
  const wsX = cabFront + cabLen;
  b.plane(glassMat, spec.wide * 0.86, winH * 1.05, wsX + 0.16, winY - 0.02, 0, 0, 0, 0, 0, { label: 'Windscreen' });
  b.plane(glassMat, spec.wide * 0.84, winH, cabFront - 0.14, winY - 0.02, 0, 0, Math.PI, 0, 0);
  // roof
  b.box(bodyMat, cabLen + 0.1, 0.06, spec.wide - 0.08, cabFront + cabLen / 2, y0 + cabTop, 0, 0, 0, 0, { castShadow: true });
  if (spec.glassRoof) {
    b.plane(glassMat, cabLen * 0.8, spec.wide * 0.7, cabFront + cabLen / 2, y0 + cabTop + 0.035, 0, -Math.PI / 2, 0, 0, 0, { label: 'Panoramic glass roof' });
  }

  // ---- wheels -----------------------------------------------------------
  if (!spec.hover && spec.wheelR > 0) {
    const wb = spec.wheelbase / 2;
    for (const wx of [wb, -wb]) {
      for (const s of [-1, 1]) {
        const wz = s * (halfW - 0.12);
        b.cyl(rubberMat, spec.wheelR, 0.24, wx, spec.wheelR, wz, 18, 0, 0, Math.PI / 2, { castShadow: true, label: 'Wheel' });
        // whitewall + hubcap
        if (spec.whitewall) {
          b.cyl(mats.std({ color: 0xe8e6de, roughness: 0.6 }), spec.wheelR * 0.78, 0.26, wx, spec.wheelR, wz, 18, 0, 0, Math.PI / 2);
        }
        const hubR = spec.wheelR * (spec.whitewall ? 0.56 : 0.66);
        b.cyl(spec.chrome > 0.5 ? chromeMat : mats.std({ color: 0x8a8f94, roughness: 0.35, metalness: 0.8 }), hubR, 0.27, wx, spec.wheelR, wz, 14, 0, 0, Math.PI / 2, { label: 'Hubcap' });
        if (spec.chrome < 0.4) {
          // 80s steel wheel with visible bolts
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU;
            b.cyl(darkMat, 0.03, 0.29, wx + Math.cos(a) * hubR * 0.5, spec.wheelR + Math.sin(a) * hubR * 0.5, wz, 6, 0, 0, Math.PI / 2);
          }
        }
        // wheel arch
        if (spec.fenders === 'flared') {
          b.cyl(trimMat, spec.wheelR + 0.14, 0.12, wx, spec.wheelR + 0.02, s * (halfW - 0.02), 16, 0, 0, Math.PI / 2);
        }
      }
      // pontoon fenders (1940s)
      if (spec.fenders === 'pontoon') {
        for (const s of [-1, 1]) {
          b.cyl(bodyMat, spec.wheelR + 0.22, 0.42, wx, spec.wheelR + 0.06, s * (halfW - 0.08), 18, 0, 0, Math.PI / 2, { castShadow: true, label: 'Pontoon fender' });
        }
      }
    }
    // running boards
    if (spec.runningBoard) {
      for (const s of [-1, 1]) {
        b.box(darkMat, spec.wheelbase * 0.72, 0.07, 0.26, 0, y0 + 0.34, s * (halfW + 0.02), 0, 0, 0, { castShadow: true, label: 'Running board' });
      }
    }
    // axles + shadow
    b.box(darkMat, 0.1, 0.1, spec.wide - 0.3, spec.wheelbase / 2, spec.wheelR, 0);
    b.box(darkMat, 0.1, 0.1, spec.wide - 0.3, -spec.wheelbase / 2, spec.wheelR, 0);
  }

  // ---- hover skirt (2055) ----------------------------------------------
  if (spec.hover) {
    const skirt = mats.glow({ color: 0x1b2334, emissive: spec.skirtGlow, emissiveIntensity: 2.6, roughness: 0.3 });
    b.box(mats.std({ color: 0x22283c, roughness: 0.4, metalness: 0.5 }), spec.len * 0.92, 0.2, spec.wide * 0.86, 0, y0 + 0.1, 0, 0, 0, 0);
    b.box(skirt, spec.len * 0.86, 0.07, spec.wide * 0.8, 0, y0 - 0.02, 0, 0, 0, 0, { label: 'Magnetic levitation skirt' });
    for (const s of [-1, 1]) {
      b.box(skirt, spec.len * 0.7, 0.05, 0.08, 0, y0 + 0.16, s * spec.wide * 0.44);
    }
    ctx.vehLights.push({ group, color: spec.skirtGlow, intensity: 4, dist: 6, offset: [0, -0.1, 0] });
  }

  // ---- lights -----------------------------------------------------------
  const headMat = mats.glow({ color: 0xf0f4f8, emissive: 0xfff4e0, emissiveIntensity: 3.0, roughness: 0.1 });
  const tailMat = mats.glow({ color: 0x8a1f1f, emissive: 0xff2a1a, emissiveIntensity: 2.4, roughness: 0.2 });
  const noseX = spec.profile.reduce((m, p) => Math.max(m, p[0]), 0);
  const tailX = spec.profile.reduce((m, p) => Math.min(m, p[0]), 0);
  const lampY = y0 + (spec.lights === 'round-standalone' ? 0.95 : spec.beltline * 0.72);

  if (spec.lights === 'round-standalone') {
    for (const s of [-1, 1]) {
      b.sphere(chromeMat, 0.19, noseX - 0.22, lampY, s * (halfW - 0.24), 12, { castShadow: true });
      b.cyl(headMat, 0.15, 0.06, noseX - 0.08, lampY, s * (halfW - 0.24), 14, 0, 0, Math.PI / 2, { label: 'Sealed-beam headlamp' });
    }
  } else if (spec.lights === 'quad-round') {
    for (const s of [-1, 1]) {
      for (const o2 of [0.2, 0.46]) {
        b.cyl(headMat, 0.115, 0.06, noseX - 0.04, lampY, s * (halfW - o2), 14, 0, 0, Math.PI / 2, { label: 'Quad headlamp' });
        b.cyl(chromeMat, 0.14, 0.03, noseX - 0.08, lampY, s * (halfW - o2), 14, 0, 0, Math.PI / 2);
      }
    }
  } else if (spec.lights === 'rect') {
    for (const s of [-1, 1]) {
      b.box(headMat, 0.05, 0.16, 0.42, noseX - 0.03, lampY, s * (halfW - 0.34), 0, 0, 0, { label: 'Rectangular sealed beam' });
      b.box(mats.std({ color: 0xd8a828, roughness: 0.3 }), 0.05, 0.1, 0.16, noseX - 0.03, lampY - 0.2, s * (halfW - 0.14));
    }
  } else if (spec.lights === 'swept') {
    for (const s of [-1, 1]) {
      b.box(headMat, 0.1, 0.14, 0.5, noseX - 0.08, lampY, s * (halfW - 0.36), 0, 0, s * -0.12, { label: 'Projector headlamp cluster' });
    }
  } else if (spec.lights === 'lightbar') {
    b.box(headMat, 0.07, 0.07, spec.wide * 0.82, noseX - 0.08, lampY + 0.12, 0, 0, 0, 0, { label: 'Full-width LED light bar' });
    for (const s of [-1, 1]) b.box(headMat, 0.09, 0.13, 0.3, noseX - 0.1, lampY - 0.1, s * (halfW - 0.3));
  } else if (spec.lights === 'lightblade') {
    b.box(mats.glow({ color: 0xdfe6f2, emissive: 0xbfe4ff, emissiveIntensity: 3.2 }), 0.06, 0.05, spec.wide * 0.88, noseX - 0.06, y0 + spec.beltline * 0.8, 0, 0, 0, 0, { label: 'Signature light blade' });
  }
  // tail lights
  const tailW = spec.lights === 'lightblade' ? spec.wide * 0.88 : 0.34;
  if (spec.lights === 'lightblade') {
    b.box(mats.glow({ color: 0x8a1f2f, emissive: 0xff3a6a, emissiveIntensity: 2.4 }), 0.06, 0.05, tailW, tailX + 0.06, y0 + spec.beltline * 0.8, 0);
  } else {
    for (const s of [-1, 1]) {
      b.box(tailMat, 0.06, spec.fins ? 0.3 : 0.16, tailW, tailX + 0.04, y0 + spec.beltline * (spec.fins ? 0.85 : 0.78), s * (halfW - 0.3), 0, 0, 0, { label: 'Tail lamp' });
    }
  }
  ctx.vehLights.push({ group, color: 0xfff0d0, intensity: 3, dist: 9, offset: [noseX, lampY, 0], head: true });

  // ---- grille / front detail -------------------------------------------
  if (spec.grille === 'vertical-bars') {
    b.box(chromeMat, 0.1, 0.62, spec.wide * 0.5, noseX - 0.02, y0 + 0.78, 0, 0, 0, 0, { label: 'Chrome grille' });
    for (let i = -4; i <= 4; i++) {
      b.box(darkMat, 0.06, 0.55, 0.04, noseX + 0.02, y0 + 0.78, i * 0.09);
    }
  } else if (spec.grille === 'wide-chrome') {
    b.box(chromeMat, 0.1, 0.3, spec.wide * 0.8, noseX - 0.02, y0 + spec.beltline * 0.55, 0, 0, 0, 0, { label: 'Chrome grille' });
    for (let i = -7; i <= 7; i++) b.box(darkMat, 0.05, 0.24, 0.03, noseX + 0.03, y0 + spec.beltline * 0.55, i * 0.11);
  } else if (spec.grille === 'chrome-slats') {
    for (let i = 0; i < 3; i++) b.box(chromeMat, 0.06, 0.06, spec.wide * 0.6, noseX - 0.02, y0 + spec.beltline * 0.5 + i * 0.11, 0);
  } else if (spec.grille === 'plastic') {
    b.box(darkMat, 0.07, 0.22, spec.wide * 0.66, noseX - 0.02, y0 + spec.beltline * 0.5, 0, 0, 0, 0, { label: 'Plastic grille' });
    for (let i = 0; i < 3; i++) b.box(mats.std({ color: 0x2a2a2e, roughness: 0.5 }), 0.03, 0.03, spec.wide * 0.62, noseX + 0.02, y0 + spec.beltline * 0.44 + i * 0.07, 0);
  } else if (spec.grille === 'blackout') {
    b.box(darkMat, 0.08, 0.26, spec.wide * 0.7, noseX - 0.02, y0 + spec.beltline * 0.5, 0);
  } else if (spec.grille === 'sealed') {
    b.box(mats.std({ color: shade(color, -0.2), roughness: 0.3, metalness: 0.5 }), 0.06, 0.2, spec.wide * 0.6, noseX - 0.03, y0 + spec.beltline * 0.5, 0, 0, 0, 0, { label: 'Sealed nose panel' });
  }
  // bumpers
  if (spec.chrome > 0.45) {
    for (const [bx, w2] of [
      [noseX + 0.06, 1],
      [tailX - 0.06, 1],
    ]) {
      b.box(chromeMat, 0.16, 0.2, spec.wide * 0.98, bx, y0 + 0.44, 0, 0, 0, 0, { castShadow: true, label: 'Chrome bumper' });
      if (spec.chrome > 0.8) {
        for (const s of [-1, 1]) b.cyl(chromeMat, 0.07, 0.22, bx + (bx > 0 ? 0.06 : -0.06), y0 + 0.44, s * spec.wide * 0.24, 10, 0, 0, Math.PI / 2, { label: 'Bumper guard' });
      }
      void w2;
    }
  } else {
    b.box(spec.blackTrim ? darkMat : trimMat, 0.14, 0.24, spec.wide * 0.96, noseX + 0.03, y0 + 0.42, 0, 0, 0, 0, { castShadow: true });
    b.box(spec.blackTrim ? darkMat : trimMat, 0.14, 0.24, spec.wide * 0.96, tailX - 0.03, y0 + 0.42, 0);
  }
  // fins
  if (spec.fins) {
    for (const s of [-1, 1]) {
      b.box(bodyMat, 1.1, 0.5, 0.09, tailX + 0.55, y0 + 1.1, s * (halfW - 0.08), 0, 0, -0.16, { castShadow: true, label: 'Tailfin' });
      b.box(chromeMat, 1.0, 0.05, 0.12, tailX + 0.55, y0 + 1.3, s * (halfW - 0.08), 0, 0, -0.16);
    }
  }
  // side chrome spear / two-tone / stripes / wood panelling
  if (spec.chrome > 0.7) {
    for (const s of [-1, 1]) b.box(chromeMat, spec.len * 0.6, 0.04, 0.02, 0, y0 + spec.beltline * 0.62, s * (halfW + 0.015));
  }
  if (spec.twoTone) {
    for (const s of [-1, 1]) b.plane(mats.std({ color: 0xf0f0ea, roughness: 0.3, metalness: 0.5 }), spec.len * 0.8, 0.4, 0, y0 + spec.beltline + 0.24, s * (halfW + 0.012), 0, (s * Math.PI) / 2, 0);
  }
  if (spec.stripes) {
    b.box(mats.std({ color: 0x14161a, roughness: 0.4 }), spec.len * 0.9, 0.02, 0.34, 0, y0 + spec.cabinTop + 0.02, 0);
  }
  if (spec.woodPanel) {
    for (const s of [-1, 1]) b.plane(mats.std({ color: 0x8a6a3a, roughness: 0.6 }), spec.len * 0.62, 0.42, 0, y0 + spec.beltline * 0.62, s * (halfW + 0.012), 0, (s * Math.PI) / 2, 0, 0, { label: 'Vinyl wood applique' });
  }
  // mirrors, aerial, wipers
  for (const s of [-1, 1]) {
    b.box(spec.chrome > 0.5 ? chromeMat : trimMat, 0.1, 0.1, 0.16, wsX - 0.1, y0 + belt + 0.12, s * (halfW + 0.1), 0, 0, 0, { label: 'Mirror' });
  }
  if (!spec.hover) {
    b.cyl(chromeMat, 0.012, 0.8, wsX - 0.2, y0 + belt + 0.5, halfW - 0.2, 4, 0, 0, 0.2, { label: 'Aerial' });
    b.box(darkMat, 0.4, 0.02, 0.02, wsX + 0.05, y0 + belt + 0.04, -0.3, 0, 0, 0.1);
    b.box(darkMat, 0.4, 0.02, 0.02, wsX + 0.05, y0 + belt + 0.04, 0.3, 0, 0, 0.1);
  }
  // sun visor over the windscreen (1940s-50s accessory)
  if (spec.visor) {
    b.box(bodyMat, 0.3, 0.04, spec.wide * 0.84, wsX + 0.12, y0 + cabTop - 0.02, 0, 0.2, 0, 0, { castShadow: true, label: 'Windscreen visor' });
  }
  // roof rack
  if (spec.roofRack) {
    for (const s of [-1, 1]) {
      b.box(darkMat, cabLen * 0.8, 0.04, 0.05, cabFront + cabLen / 2, y0 + cabTop + 0.08, s * spec.wide * 0.3);
      for (let i = 0; i < 3; i++) b.box(darkMat, 0.05, 0.08, 0.05, cabFront + cabLen * (0.2 + i * 0.3), y0 + cabTop + 0.04, s * spec.wide * 0.3);
    }
    b.box(darkMat, 0.06, 0.04, spec.wide * 0.6, cabFront + cabLen * 0.3, y0 + cabTop + 0.08, 0);
  }
  // pickup bed
  if (spec.bed) {
    b.box(bodyMat, 1.7, 0.06, spec.wide - 0.1, tailX + 0.95, y0 + 1.14, 0);
    for (const s of [-1, 1]) b.box(bodyMat, 1.7, 0.34, 0.08, tailX + 0.95, y0 + 1.3, s * (halfW - 0.04));
    b.box(bodyMat, 0.08, 0.34, spec.wide - 0.1, tailX + 0.12, y0 + 1.3, 0);
    // cargo
    b.box(mats.std({ color: 0x6b5030, roughness: 0.95 }), 0.7, 0.5, 0.7, tailX + 0.8, y0 + 1.42, -0.3, 0, 0.3, 0, { label: 'Crate' });
  }
  // signwriting on van sides
  if (spec.signPanel) {
    const sign = storefrontSign({
      kind: opts.signKind ?? (kind.endsWith('45') ? 'painted' : kind.endsWith('85') ? 'plastic' : 'vinyl'),
      name: opts.plate ?? spec.signPanel.text,
      sub: spec.signPanel.sub,
      color: shade(color, -0.1),
      accent: 0xf2ead8,
      wear: kind.endsWith('45') ? 0.35 : 0.15,
      seed: 4,
      W: 512,
      H: 220,
    });
    const sm = mats.signMaterial(sign);
    for (const s of [-1, 1]) {
      b.plane(sm, spec.len * 0.5, 0.9, -0.4, y0 + spec.beltline + 0.5, s * (halfW + 0.02), 0, (s * Math.PI) / 2, 0, 0, {
        label: 'Signwritten livery',
      });
    }
  }
  // taxi roof sign + checker band
  if (spec.taxi) {
    b.box(mats.glow({ color: 0x2a2a2a, emissive: 0xffe8a8, emissiveIntensity: 2.2 }), 0.6, 0.22, 0.3, cabFront + cabLen * 0.55, y0 + cabTop + 0.14, 0, 0, 0, 0, { label: 'Taxi roof light' });
    if (spec.taxi.checker) {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 14; i++) {
          b.box(mats.std({ color: i % 2 ? 0x1b1b1e : 0xf0f0ea, roughness: 0.4 }), spec.len / 16, 0.16, 0.02, tailX + 0.4 + (i * spec.len) / 16, y0 + spec.beltline * 0.75, s * (halfW + 0.015));
        }
      }
    }
    const t = placardTex({ W: 128, H: 64, bg: 0x1b1b1e, fg: 0xe8c02a, title: 'TAXI', rows: [], font: 'Arial, sans-serif', wear: 0.2 });
    for (const s of [-1, 1]) b.plane(mats.std({ map: t, roughness: 0.5 }), 0.7, 0.35, 0, y0 + spec.beltline + 0.4, s * (halfW + 0.02), 0, (s * Math.PI) / 2, 0, 0, { label: 'Taxi livery' });
  }
  if (spec.rideshare) {
    b.plane(mats.glow({ color: 0x101418, emissive: 0x59e0ff, emissiveIntensity: 2.0 }), 0.4, 0.2, wsX - 0.3, y0 + cabTop - 0.12, 0.5, 0, 0, 0, 0, { label: 'Rideshare beacon' });
  }
  if (spec.transit) {
    // shuttle window band + doors
    for (const s of [-1, 1]) {
      b.plane(glassMat, spec.len * 0.82, 1.0, 0, y0 + 1.65, s * (halfW - 0.01), 0, (s * Math.PI) / 2, 0, 0, { label: 'Shuttle glazing' });
      b.box(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 1.6 }), 1.2, 0.04, 0.04, 1.0, y0 + 0.9, s * (halfW + 0.01));
    }
    const t = placardTex({ W: 256, H: 96, bg: 0x04060e, fg: 0x7cf7ff, title: 'LOOP 12', rows: [], font: '"Courier New", monospace', wear: 0 });
    b.plane(mats.std({ map: t, emissiveMap: t, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.8, roughness: 0.4 }), 1.4, 0.5, noseX - 0.05, y0 + 2.1, 0, 0, 0, 0, 0, { label: 'Route display' });
  }
  if (spec.container) {
    b.box(mats.std({ color: 0x2f6b8a, roughness: 0.6, metalness: 0.3 }), 5.2, 1.9, 2.2, -0.2, y0 + 1.5, 0, 0, 0, 0, { castShadow: true, label: 'Freight container' });
    for (let i = 0; i < 8; i++) b.box(mats.std({ color: 0x2a5f7a, roughness: 0.7 }), 0.06, 1.8, 2.22, -2.6 + i * 0.7, y0 + 1.5, 0);
    b.plane(
      mats.std({ map: placardTex({ W: 256, H: 128, bg: 0x2f6b8a, fg: 0xdfe6f2, title: 'FRT-2211', rows: ['AUTONOMOUS'], font: '"Courier New", monospace', wear: 0.1 }), roughness: 0.6 }),
      1.6,
      0.8,
      -0.2,
      y0 + 1.6,
      1.12,
      0,
      0,
      0,
      0
    );
  }
  // number plate
  const plateT = placardTex({
    W: 192,
    H: 96,
    bg: kind.endsWith('45') ? 0x2f4a3f : kind.endsWith('65') ? 0xe8e4d8 : 0xf0f0ee,
    fg: kind.endsWith('45') ? 0xe8dcc0 : 0x2a3138,
    title: opts.plateText ?? (kind.endsWith('45') ? '4B-1187' : kind.endsWith('65') ? 'NX-4412' : kind.endsWith('55') ? 'AV·8842' : 'KLR-8842'),
    rows: [],
    font: 'Arial, sans-serif',
    wear: 0.15,
  });
  const plateMat = mats.std({ map: plateT, roughness: 0.6 });
  b.plane(plateMat, 0.4, 0.2, noseX + 0.14, y0 + 0.42, 0, 0, 0, 0, 0, { label: 'Registration plate' });
  b.plane(plateMat, 0.4, 0.2, tailX - 0.14, y0 + 0.42, 0, 0, Math.PI, 0, 0);
  // exhaust
  if (!spec.hover) {
    b.cyl(mats.std({ color: 0x8a8f94, roughness: 0.4, metalness: 0.8 }), 0.05, 0.2, tailX - 0.02, y0 + 0.3, -0.4, 8, 0, 0, Math.PI / 2, { label: 'Exhaust' });
  }
  // contact shadow
  b.plane(
    mats.basic({ map: blobTex(0x000000, 1.8), transparent: true, opacity: 0.5, depthWrite: false }),
    spec.len * 1.15,
    spec.wide * 1.5,
    0,
    0.02,
    0,
    -Math.PI / 2,
    0,
    0
  );

  b.build(group, { castShadow: true });
  group.userData.label = spec.label;
  group.userData.spec = spec;
  return group;
}

// ---------------------------------------------------------------------------
function buildBus(ctx, group, kind, opts = {}) {
  const { mats } = ctx;
  const b = new Batch('bus');
  const era = kind.slice(3);
  const len = era === '65' ? 10.5 : era === '85' ? 11.0 : 11.5;
  const wide = 2.55;
  const h = era === '65' ? 2.9 : 3.05;
  const color = opts.color ?? (era === '65' ? 0xd8d4c8 : era === '85' ? 0xd8dcdf : era === '05' ? 0xdfe3e6 : 0xe8eef2);
  const accent = era === '65' ? 0x1f6f4f : era === '85' ? 0x1f4f9c : era === '05' ? 0x2b6cb0 : 0x1fa463;
  const bodyMat = mats.std({ color, roughness: 0.4, metalness: 0.4 });
  const accentMat = mats.std({ color: accent, roughness: 0.45, metalness: 0.3 });
  const glassMat = mats.glass({ color: 0x1b2530, opacity: 0.7, roughness: 0.06, metalness: 0.5 });
  const darkMat = mats.std({ color: 0x1a1c20, roughness: 0.8 });
  const rubber = mats.std({ color: 0x18181a, roughness: 0.92 });
  const wheelR = 0.52;
  const y0 = 0.34;

  // body with a slight taper via two stacked boxes
  b.box(bodyMat, len, h - 0.5, wide, 0, y0 + (h - 0.5) / 2, 0, 0, 0, 0, { castShadow: true, label: `${1900 + Number('19' + era) % 100} city bus` });
  b.box(bodyMat, len - 0.5, 0.5, wide - 0.14, 0, y0 + h - 0.25, 0, 0, 0, 0, { castShadow: true });
  b.box(accentMat, len, 0.35, wide + 0.02, 0, y0 + 0.42, 0);
  // window band
  for (const s of [-1, 1]) {
    b.plane(glassMat, len - 1.4, era === '65' ? 1.0 : 1.2, 0, y0 + h * 0.62, s * (wide / 2 + 0.01), 0, (s * Math.PI) / 2, 0, 0, { label: 'Bus glazing' });
    // window pillars
    for (let i = 0; i < 8; i++) b.box(bodyMat, 0.1, 1.3, 0.05, -len / 2 + 1.0 + i * ((len - 2) / 7), y0 + h * 0.62, s * (wide / 2 + 0.015));
  }
  // windscreen + rear
  b.plane(glassMat, wide - 0.3, era === '65' ? 1.3 : 1.5, len / 2 + 0.01, y0 + h * 0.62, 0, 0, 0, 0, 0);
  b.plane(glassMat, wide - 0.3, 1.1, -len / 2 - 0.01, y0 + h * 0.62, 0, 0, Math.PI, 0, 0);
  // doors
  for (const dx of [len * 0.3, -len * 0.12]) {
    b.box(darkMat, 1.1, h - 0.9, 0.06, dx, y0 + (h - 0.9) / 2, wide / 2 + 0.02, 0, 0, 0, { label: 'Passenger door' });
    b.plane(glassMat, 1.0, h - 1.3, dx, y0 + h * 0.55, wide / 2 + 0.06, 0, 0, 0, 0);
  }
  // wheels
  for (const wx of [len * 0.32, -len * 0.28, -len * 0.28 + 1.2]) {
    for (const s of [-1, 1]) {
      b.cyl(rubber, wheelR, 0.3, wx, wheelR, s * (wide / 2 - 0.16), 18, 0, 0, Math.PI / 2, { castShadow: true });
      b.cyl(mats.std({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.7 }), wheelR * 0.5, 0.32, wx, wheelR, s * (wide / 2 - 0.16), 12, 0, 0, Math.PI / 2);
    }
  }
  // destination sign
  const dest = placardTex({
    W: 384,
    H: 96,
    bg: era === '65' ? 0x1b1b1e : 0x04060e,
    fg: era === '65' ? 0xf0ead8 : era === '25' ? 0xffcc55 : 0xffb347,
    title: era === '25' ? '12 · VINE ST' : '12 VINE ST',
    rows: [],
    font: era === '65' ? 'Georgia, serif' : '"Courier New", monospace',
    wear: era === '85' ? 0.3 : 0.05,
  });
  b.plane(
    mats.std({ map: dest, emissiveMap: dest, emissive: new THREE.Color(0xffffff), emissiveIntensity: era === '65' ? 0.8 : 1.6, roughness: 0.4 }),
    2.2,
    0.55,
    len / 2 + 0.02,
    y0 + h - 0.4,
    0,
    0,
    0,
    0,
    0,
    { label: 'Destination blind' }
  );
  // advertising panel on the flank — the era's tell
  const ad = wallAdTex({
    kind: era === '65' ? 'billboard' : era === '85' ? 'billboard-lit' : era === '05' ? 'billboard' : 'led',
    text: era === '65' ? 'FLY JET' : era === '85' ? 'RENT VHS' : era === '05' ? 'GO BROADBAND' : 'STREAM NOW',
    sub: era === '65' ? 'NEW NONSTOP SERVICE' : era === '85' ? '2 FOR 1 TUESDAYS' : era === '05' ? 'NO DIAL TONE REQUIRED' : 'FIRST MONTH FREE',
    bg: era === '65' ? 0x1f4f9c : era === '85' ? 0x241a44 : era === '05' ? 0x0b2f6b : 0x081018,
    fg: 0xf2f7ff,
    accent: 0xffb703,
    wear: era === '85' ? 0.3 : 0.1,
    seed: 71,
    W: 768,
    H: 220,
  });
  const adMat = mats.signMaterial(ad, { glowScale: era === '25' ? 1.6 : 1 });
  for (const s of [-1, 1]) {
    b.plane(adMat, len * 0.5, 1.0, -len * 0.08, y0 + 0.95, s * (wide / 2 + 0.02), 0, (s * Math.PI) / 2, 0, 0, { label: 'Bus advertising panel' });
  }
  // headlights / tails
  for (const s of [-1, 1]) {
    b.box(mats.glow({ color: 0xf0f4f8, emissive: 0xfff4e0, emissiveIntensity: 2.6 }), 0.06, 0.2, 0.34, len / 2 + 0.02, y0 + 0.5, s * (wide / 2 - 0.4));
    b.box(mats.glow({ color: 0x8a1f1f, emissive: 0xff2a1a, emissiveIntensity: 2.0 }), 0.06, 0.2, 0.3, -len / 2 - 0.02, y0 + 0.5, s * (wide / 2 - 0.4));
  }
  if (era === '25') {
    // pantograph charge shoe + electric badge
    b.box(mats.std({ color: 0x6f7377, roughness: 0.4, metalness: 0.7 }), 1.4, 0.14, 0.6, len * 0.1, y0 + h + 0.1, 0, 0, 0, 0, { label: 'Opportunity-charging pantograph' });
  }
  if (era === '85') {
    // rooftop AC + soot
    b.box(mats.std({ color: 0xc8ccce, roughness: 0.6 }), 2.0, 0.3, 1.4, -len * 0.2, y0 + h + 0.1, 0, 0, 0, 0, { castShadow: true });
  }
  b.plane(mats.basic({ map: blobTex(0x000000, 1.8), transparent: true, opacity: 0.5, depthWrite: false }), len * 1.1, wide * 1.5, 0, 0.02, 0, -Math.PI / 2, 0, 0);
  b.build(group, { castShadow: true });
  group.userData.label = `${era === '65' ? '1965' : era === '85' ? '1985' : era === '05' ? '2005' : '2025'} city bus, route 12`;
  return group;
}

// ---------------------------------------------------------------------------
function buildStreetcar(ctx, group, opts = {}) {
  const { mats } = ctx;
  const b = new Batch('tram');
  const len = 13.5;
  const wide = 2.5;
  const h = 3.1;
  const body = mats.std({ color: 0xd8a828, roughness: 0.42, metalness: 0.35 });
  const cream = mats.std({ color: 0xe8dcc0, roughness: 0.45 });
  const green = mats.std({ color: 0x1f4f3f, roughness: 0.5 });
  const glassMat = mats.glass({ color: 0x2a3540, opacity: 0.68, roughness: 0.08 });
  const dark = mats.std({ color: 0x1a1c20, roughness: 0.8 });
  const chrome = mats.std({ color: 0xd8dce0, roughness: 0.2, metalness: 0.9 });
  const y0 = 0.42;

  b.box(green, len, 1.0, wide, 0, y0 + 0.5, 0, 0, 0, 0, { castShadow: true });
  b.box(body, len, 1.1, wide, 0, y0 + 1.55, 0, 0, 0, 0, { castShadow: true, label: 'Streetcar No. 41 — Vine Street line' });
  b.box(cream, len, 0.5, wide - 0.02, 0, y0 + 2.35, 0);
  // clerestory roof
  b.box(cream, len - 0.6, 0.4, wide - 0.5, 0, y0 + 2.72, 0, 0, 0, 0, { castShadow: true });
  b.box(mats.std({ color: 0x8a8578, roughness: 0.7 }), len - 0.3, 0.12, wide - 0.2, 0, y0 + 2.95, 0);
  // rounded ends
  for (const s of [-1, 1]) {
    b.cyl(body, wide / 2, 1.1, s * len * 0.5, y0 + 1.55, 0, 20, 0, 0, 0, { castShadow: true });
    b.cyl(green, wide / 2, 1.0, s * len * 0.5, y0 + 0.5, 0, 20);
    b.cyl(cream, wide / 2 - 0.01, 0.5, s * len * 0.5, y0 + 2.35, 0, 20);
  }
  // windows
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const wx = -len / 2 + 1.1 + i * ((len - 2.2) / 8);
      b.plane(glassMat, 1.05, 1.0, wx, y0 + 1.7, s * (wide / 2 + 0.01), 0, (s * Math.PI) / 2, 0, 0, { label: 'Drop sash window' });
      b.box(body, 0.16, 1.1, 0.05, wx + 0.62, y0 + 1.7, s * (wide / 2 + 0.015));
    }
    // clerestory lights
    for (let i = 0; i < 9; i++) {
      b.plane(mats.glow({ color: 0xc8a878, emissive: 0xffd9a0, emissiveIntensity: 1.2 }), 0.8, 0.26, -len / 2 + 1.1 + i * ((len - 2.2) / 8), y0 + 2.72, s * (wide / 2 - 0.26), 0, (s * Math.PI) / 2, 0, 0);
    }
  }
  // front dash + destination roll
  b.plane(glassMat, wide - 0.5, 1.2, len / 2 + 0.02, y0 + 1.75, 0, 0, 0, 0, 0);
  const dest = placardTex({ W: 384, H: 96, bg: 0x1b1b1e, fg: 0xf0ead8, title: '41  VINE ST', rows: [], font: 'Georgia, serif', wear: 0.2 });
  b.plane(mats.std({ map: dest, emissiveMap: dest, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.7, roughness: 0.5 }), 1.8, 0.45, len / 2 + 0.02, y0 + 2.5, 0, 0, 0, 0, 0, {
    label: 'Destination roll — Route 41',
  });
  b.plane(mats.std({ map: dest, emissiveMap: dest, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.7, roughness: 0.5 }), 1.8, 0.45, -len / 2 - 0.02, y0 + 2.5, 0, 0, Math.PI, 0, 0);
  // headlamp + fender/cowcatcher
  b.cyl(chrome, 0.22, 0.24, len / 2 + 0.1, y0 + 1.2, 0, 14, 0, 0, Math.PI / 2, { label: 'Headlamp' });
  b.cyl(mats.glow({ color: 0xf0f4f8, emissive: 0xfff0d0, emissiveIntensity: 2.8 }), 0.17, 0.06, len / 2 + 0.23, y0 + 1.2, 0, 14, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    b.box(dark, 0.1, 0.8, wide - 0.4, s * (len / 2 + 0.16), 0.42, 0, 0, 0, s * 0.25, { label: 'Cowcatcher' });
    for (let i = 0; i < 5; i++) b.box(dark, 0.06, 0.5, 0.06, s * (len / 2 + 0.2), 0.3, -0.8 + i * 0.4, 0, 0, s * 0.25);
  }
  // trucks + wheels
  for (const tx of [len * 0.3, -len * 0.3]) {
    b.box(dark, 2.4, 0.4, wide - 0.5, tx, 0.36, 0, 0, 0, 0, { castShadow: true, label: 'Truck (bogie)' });
    for (const wx of [tx - 0.8, tx + 0.8]) {
      for (const s of [-1, 1]) {
        b.cyl(mats.std({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.7 }), 0.34, 0.12, wx, 0.34, s * (wide / 2 - 0.42), 16, 0, 0, Math.PI / 2, { label: 'Steel wheel' });
      }
    }
  }
  // trolley pole to the overhead wire
  b.cyl(dark, 0.1, 0.3, -len * 0.18, y0 + 3.05, 0, 10, 0, 0, 0);
  b.cyl(mats.std({ color: 0x6f6f74, roughness: 0.4, metalness: 0.8 }), 0.045, 4.6, -len * 0.18 + 1.5, y0 + 4.2, 0, 8, 0, 0, -0.75, {
    label: 'Trolley pole — collects current from the overhead wire',
  });
  b.cyl(chrome, 0.14, 0.1, -len * 0.18 + 3.0, y0 + 5.85, 0, 12, Math.PI / 2, 0, 0, { label: 'Trolley wheel' });
  // route boards + bell
  b.plane(
    mats.std({ map: placardTex({ W: 256, H: 64, bg: 0x1f4f3f, fg: 0xe8dcc0, title: 'PAY AS YOU ENTER', rows: [], font: 'Georgia, serif', wear: 0.3 }), roughness: 0.6 }),
    1.6,
    0.4,
    2.0,
    y0 + 1.02,
    wide / 2 + 0.02,
    0,
    0,
    0,
    0
  );
  b.sphere(chrome, 0.12, len * 0.42, y0 + 2.95, 0, 10, { label: 'Bell' });
  ctx.vehLights.push({ group, color: 0xfff0d0, intensity: 4, dist: 10, offset: [len / 2, y0 + 1.2, 0], head: true });
  b.plane(mats.basic({ map: blobTex(0x000000, 1.8), transparent: true, opacity: 0.45, depthWrite: false }), len * 1.05, wide * 1.6, 0, 0.02, 0, -Math.PI / 2, 0, 0);
  b.build(group, { castShadow: true });
  group.userData.label = 'Streetcar No. 41 — Vine Street line';
  return group;
}

// ---------------------------------------------------------------------------
/** Flying machines: 2025 gets a camera drone, 2055 gets freight. */
export function buildDrone(ctx, group, kind = 'quad') {
  const { mats } = ctx;
  const b = new Batch('drone');
  const shell = mats.std({ color: kind === 'freight' ? 0x3a4358 : 0x2b3138, roughness: 0.4, metalness: 0.5 });
  const em = mats.glow({ color: 0x1b2334, emissive: kind === 'freight' ? 0xff7ad0 : 0x7cf7ff, emissiveIntensity: 2.6 });
  const size = kind === 'freight' ? 1.5 : 0.55;
  b.box(shell, size, size * 0.34, size * 0.7, 0, 0, 0, 0, 0, 0, { castShadow: true, label: kind === 'freight' ? 'Autonomous freight drone' : 'Camera drone' });
  const arms = 4;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + Math.PI / 4;
    const ax = Math.cos(a) * size * 0.75;
    const az = Math.sin(a) * size * 0.75;
    b.box(shell, size * 0.9, size * 0.07, size * 0.1, ax * 0.5, 0, az * 0.5, 0, -a, 0);
    b.cyl(shell, size * 0.07, size * 0.14, ax, 0.02, az, 8);
    b.cyl(mats.std({ color: 0x6f7377, roughness: 0.5, transparent: true, opacity: 0.35 }), size * 0.36, 0.02, ax, size * 0.1, az, 16, 0, 0, 0, { label: 'Rotor' });
    b.cyl(em, size * 0.05, 0.03, ax, -size * 0.12, az, 8);
  }
  if (kind === 'freight') {
    b.box(mats.std({ color: 0x8a6a3a, roughness: 0.9 }), size * 0.7, size * 0.6, size * 0.6, 0, -size * 0.5, 0, 0, 0, 0, { castShadow: true, label: 'Parcel' });
    for (const s of [-1, 1]) b.box(shell, 0.04, size * 0.4, 0.04, s * size * 0.3, -size * 0.28, 0);
  } else {
    b.sphere(mats.std({ color: 0x14161a, roughness: 0.3, metalness: 0.4 }), size * 0.16, 0, -size * 0.2, size * 0.2, 10, { label: 'Gimbal camera' });
  }
  b.build(group, { castShadow: true });
  ctx.vehLights.push({ group, color: kind === 'freight' ? 0xff7ad0 : 0x7cf7ff, intensity: 3, dist: 7, offset: [0, -0.2, 0] });
  return group;
}

// ---------------------------------------------------------------------------
/** Populate the street with moving traffic. Returns an update function. */
export function createTraffic(ctx) {
  const { era } = ctx;
  const t = era.traffic;
  const rng = makeRng('traffic' + era.id);
  const HALF = L.worldHalf;
  const agents = [];
  const root = new THREE.Group();
  root.name = 'traffic';
  ctx.root.add(root);

  const lanes = [
    { z: -2.55, dir: 1 },
    { z: 2.55, dir: -1 },
  ];
  if (era.street.bikeLane) lanes.push({ z: -L.streetHalf + 0.95, dir: 1, bike: true });

  // ---- cars -------------------------------------------------------------
  const count = Math.round(t.density * 9);
  for (let i = 0; i < count; i++) {
    const lane = lanes[i % 2];
    const kind = t.kinds[i % t.kinds.length];
    const g = new THREE.Group();
    buildVehicle(ctx, g, kind, { seed: i * 7 });
    g.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    const speed = t.speed * rng.range(0.82, 1.18);
    const x = -HALF + ((i * (HALF * 2)) / count + rng.range(-6, 6));
    g.position.set(x, 0, lane.z + rng.range(-0.25, 0.25));
    root.add(g);
    agents.push({ obj: g, dir: lane.dir, speed, kind, hover: !!P[kind]?.hover, bob: rng() * TAU });
  }

  // ---- tram / bus -------------------------------------------------------
  if (t.tram === 'streetcar') {
    for (const [i, d] of [[0, 1], [1, -1]]) {
      const g = new THREE.Group();
      buildVehicle(ctx, g, 'streetcar', {});
      g.rotation.y = d > 0 ? 0 : Math.PI;
      g.position.set(d > 0 ? -30 : 34, 0, d > 0 ? -1.19 : 1.19);
      root.add(g);
      agents.push({ obj: g, dir: d, speed: 6.5, kind: 'streetcar', tram: true });
      void i;
    }
  }
  if (t.bus) {
    const g = new THREE.Group();
    buildVehicle(ctx, g, t.bus, {});
    const d = 1;
    g.rotation.y = 0;
    g.position.set(-52, 0, -2.55);
    root.add(g);
    agents.push({ obj: g, dir: d, speed: t.speed * 0.72, kind: t.bus, hover: !!P[t.bus]?.hover, bob: 0 });
  }

  // ---- bicycles / scooters in motion ------------------------------------
  const bikeCount = Math.round(t.bikes * 5);
  for (let i = 0; i < bikeCount; i++) {
    const g = new THREE.Group();
    const b2 = new Batch('rider');
    const lane = era.street.bikeLane ? -L.streetHalf + 0.95 : -3.7;
    buildRider(ctx, b2, era);
    b2.build(g, { castShadow: true });
    g.position.set(-HALF + i * 22 + rng.range(-5, 5), 0, lane + rng.range(-0.2, 0.2));
    root.add(g);
    agents.push({ obj: g, dir: 1, speed: 5.2 * rng.range(0.9, 1.15), kind: 'bike', pedal: 0 });
  }

  // ---- flying -----------------------------------------------------------
  const flyCount = era.id === '2055' ? 4 : era.id === '2025' ? 1 : 0;
  for (let i = 0; i < flyCount; i++) {
    const g = new THREE.Group();
    buildDrone(ctx, g, era.id === '2055' && i % 2 === 0 ? 'freight' : 'quad');
    const y = 11 + i * 4.5;
    g.position.set(rng.range(-30, 30), y, rng.range(-16, 12));
    root.add(g);
    agents.push({
      obj: g,
      fly: true,
      speed: rng.range(3, 6),
      dir: rng() < 0.5 ? -1 : 1,
      baseY: y,
      bob: rng() * TAU,
      spin: rng.range(0.4, 1.2),
    });
  }

  // ---- parked at the kerb ----------------------------------------------
  const parkKinds = t.kinds;
  const parkSpots = era.id === '2055' ? [] : era.id === '2025' ? [-24, 26] : [-24.5, -19, 4.5, 13.5, 26];
  parkSpots.forEach((px, i) => {
    const g = new THREE.Group();
    buildVehicle(ctx, g, parkKinds[(i + 2) % parkKinds.length], { seed: 100 + i });
    g.position.set(px, 0, L.curbNorthZ + 1.35);
    g.rotation.y = i % 2 ? 0 : Math.PI;
    root.add(g);
  });
  if (era.id === '2055') {
    // pods docked at the kerb instead
    [-22, -17.5].forEach((px, i) => {
      const g = new THREE.Group();
      buildVehicle(ctx, g, 'pod55', { seed: 200 + i, color: 0xdfe6f2 });
      g.position.set(px, 0, L.curbNorthZ + 1.5);
      g.rotation.y = Math.PI;
      root.add(g);
      agents.push({ obj: g, docked: true, bob: i * 2, baseY: 0 });
    });
  }

  return {
    root,
    agents,
    update(dt, time) {
      for (const a of agents) {
        if (a.docked) {
          a.obj.position.y = Math.sin(time * 1.2 + a.bob) * 0.03;
          continue;
        }
        if (a.fly) {
          a.obj.position.x += a.dir * a.speed * dt;
          a.obj.position.y = a.baseY + Math.sin(time * 1.4 + a.bob) * 0.35;
          a.obj.rotation.y = a.dir > 0 ? 0 : Math.PI;
          a.obj.rotation.z = Math.sin(time * 0.8 + a.bob) * 0.06;
          if (a.obj.position.x > HALF) a.obj.position.x = -HALF;
          if (a.obj.position.x < -HALF) a.obj.position.x = HALF;
          continue;
        }
        a.obj.position.x += a.dir * a.speed * dt;
        if (a.hover) {
          a.obj.position.y = Math.sin(time * 1.6 + a.bob) * 0.05;
          a.obj.rotation.z = Math.sin(time * 0.9 + a.bob) * 0.02;
        }
        if (a.kind === 'bike') {
          a.obj.rotation.z = Math.sin(time * 7) * 0.035;
        }
        if (a.dir > 0 && a.obj.position.x > HALF + 6) a.obj.position.x = -HALF - 6;
        if (a.dir < 0 && a.obj.position.x < -HALF - 6) a.obj.position.x = HALF + 6;
      }
    },
  };
}

/** A cyclist: bike + rider, era-dressed. */
function buildRider(ctx, b, era) {
  const { mats } = ctx;
  const future = era.id === '2055';
  const frame = mats.std({ color: future ? 0x9ef07a : era.id === '2025' ? 0x1fa463 : 0x2b6cb0, roughness: 0.4, metalness: 0.5 });
  const rubber = mats.std({ color: 0x18181a, roughness: 0.92 });
  const chrome = mats.std({ color: 0xc8ccce, roughness: 0.25, metalness: 0.9 });
  // wheels
  for (const wx of [0.55, -0.55]) {
    b.cyl(rubber, 0.34, 0.05, wx, 0.34, 0, 18, 0, 0, Math.PI / 2, { label: 'Bicycle' });
    b.cyl(chrome, 0.28, 0.02, wx, 0.34, 0, 12, 0, 0, Math.PI / 2);
  }
  b.box(frame, 1.0, 0.05, 0.05, 0, 0.62, 0, 0, 0, 0.1);
  b.box(frame, 0.7, 0.05, 0.05, 0.1, 0.48, 0, 0, 0, -0.5);
  b.box(frame, 0.05, 0.5, 0.05, 0.5, 0.6, 0, 0, 0, 0.25);
  b.box(chrome, 0.06, 0.06, 0.48, 0.5, 0.98, 0, 0, 0, 0);
  b.box(mats.std({ color: 0x1a1a1c, roughness: 0.7 }), 0.24, 0.07, 0.12, -0.4, 0.9, 0);
  // rider
  const skin = mats.std({ color: 0xc89a72, roughness: 0.85 });
  const cloth = mats.std({
    color: era.id === '1945' ? 0x3a4a5a : era.id === '1965' ? 0xd85a4a : era.id === '1985' ? 0x39e08a : era.id === '2005' ? 0x2b3f6b : future ? 0x2a3352 : 0xe8532b,
    roughness: 0.85,
  });
  b.box(cloth, 0.34, 0.5, 0.3, -0.05, 1.28, 0, 0.35, 0, 0, { label: 'Cyclist' });
  b.sphere(skin, 0.13, 0.15, 1.62, 0, 12);
  // helmet or hat
  if (era.id === '1945' || era.id === '1965') {
    b.cyl(mats.std({ color: 0x3a3226, roughness: 0.9 }), 0.15, 0.1, 0.15, 1.72, 0, 12);
    b.cyl(mats.std({ color: 0x3a3226, roughness: 0.9 }), 0.24, 0.02, 0.15, 1.67, 0, 14);
  } else {
    b.sphere(mats.std({ color: future ? 0x8f7bff : 0xe8e8e8, roughness: 0.4 }), 0.15, 0.15, 1.66, 0, 12, { label: 'Helmet' });
    if (future) b.box(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 2.2 }), 0.06, 0.03, 0.26, 0.15, 1.7, 0);
  }
  // legs + arms
  for (const s of [-1, 1]) {
    b.box(cloth, 0.14, 0.42, 0.12, -0.02, 0.88, s * 0.12, 0, 0, s * 0.4);
    b.box(cloth, 0.12, 0.4, 0.1, 0.3, 1.2, s * 0.14, 0, 0, -0.7);
  }
  // courier bag (2025) / cargo box
  if (era.id === '2025') {
    b.box(mats.std({ color: 0x1fa463, roughness: 0.8 }), 0.42, 0.42, 0.36, -0.35, 1.35, 0, 0, 0, 0.2, { label: 'Courier backpack' });
  }
  if (future) {
    b.box(mats.glow({ color: 0x1b2334, emissive: 0x9ef07a, emissiveIntensity: 2.0 }), 0.5, 0.03, 0.03, 0, 0.2, 0);
  }
}
