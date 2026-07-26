import * as THREE from 'three';
import { LAYOUT, SOUTH_ROW, SKYLINE, SOUTH_LAYOUT, POCKET_PARK } from '../config/block.js';
import { Batch } from '../lib/geom.js';
import {
  brickTex,
  stoneTex,
  panelTex,
  curtainTex,
  timberTex,
  windowTex,
  leafTex,
  blobTex,
  coneGlowTex,
  graffitiTex,
} from '../lib/textures.js';
import { storefrontSign, placardTex, makeAnimatedDisplay } from '../lib/signs.js';
import { makeRng, mixHex, shade, lerp, clamp, TAU } from '../lib/util.js';

const L = LAYOUT;

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------
const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uHaze;
uniform float uStars;
uniform float uClouds;
uniform vec3 uCloudColor;
uniform float uTime;
varying vec3 vDir;

float hash( vec2 p ) { return fract( sin( dot( p, vec2(127.1, 311.7) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix( mix( hash(i), hash(i+vec2(1,0)), f.x ), mix( hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x ), f.y );
}
float fbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize( vDir );
  float h = clamp( d.y, -1.0, 1.0 );
  // vertical gradient
  vec3 col = mix( uBottom, uMid, smoothstep( -0.05, 0.32, h ) );
  col = mix( col, uTop, smoothstep( 0.25, 0.92, h ) );
  // horizon haze
  float haze = pow( 1.0 - abs(h), 5.0 ) * uHaze;
  col = mix( col, uBottom * 1.06, haze * 0.85 );

  // stars
  if ( uStars > 0.001 && h > -0.02 ) {
    vec2 sp = d.xz / max( 0.08, d.y + 0.25 ) * 22.0;
    float st = hash( floor( sp * 6.0 ) );
    float tw = 0.6 + 0.4 * sin( uTime * 2.2 + st * 60.0 );
    float star = smoothstep( 0.9975, 1.0, st ) * tw;
    col += vec3( 0.85, 0.9, 1.0 ) * star * uStars * smoothstep( 0.0, 0.35, h ) * 2.2;
  }

  // sun / glow
  float sd = max( dot( d, normalize( uSunDir ) ), 0.0 );
  if ( uSunSize > 0.0005 ) {
    float disc = smoothstep( 1.0 - uSunSize, 1.0 - uSunSize * 0.35, sd );
    col += uSunColor * disc * 2.4;
  }
  col += uSunColor * pow( sd, 14.0 ) * 0.55;
  col += uSunColor * pow( sd, 3.0 ) * 0.14 * uHaze;

  // clouds
  if ( uClouds > 0.01 && h > 0.0 ) {
    vec2 cp = d.xz / max( 0.12, d.y ) * 1.4;
    cp += vec2( uTime * 0.006, uTime * 0.002 );
    float c = fbm( cp * 1.1 );
    float cover = smoothstep( 0.52 - uClouds * 0.3, 0.78, c ) * uClouds;
    cover *= smoothstep( 0.0, 0.22, h );
    float lit = pow( max( dot( d, normalize( uSunDir ) ), 0.0 ), 6.0 );
    vec3 cc = mix( uCloudColor, uCloudColor * 1.35 + uSunColor * 0.4, lit );
    col = mix( col, cc, cover * 0.9 );
  }

  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}`;

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(600, 32, 20);
  const uniforms = {
    uTop: { value: new THREE.Color(0x2f74c8) },
    uMid: { value: new THREE.Color(0x84b6e6) },
    uBottom: { value: new THREE.Color(0xd6e7f4) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.5) },
    uSunColor: { value: new THREE.Color(0xfff6df) },
    uSunSize: { value: 0.025 },
    uHaze: { value: 0.4 },
    uStars: { value: 0 },
    uClouds: { value: 0.3 },
    uCloudColor: { value: new THREE.Color(0xffffff) },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------
// Persistent lighting + atmosphere that blends between eras
// ---------------------------------------------------------------------------
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = createSky(scene);

    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a6b4a, 0.6);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xc0a884, 0.15);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffd7a6, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const d = 46;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 190;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.035;
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 4, -6);
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    scene.add(this.sun);

    // a soft fill from the opposite side so shadowed facades keep some form
    this.fill = new THREE.DirectionalLight(0xbcd0ea, 0.35);
    this.fill.position.set(-30, 22, 34);
    scene.add(this.fill);

    scene.fog = new THREE.FogExp2(0xd6bd97, 0.0072);
    this.current = null;
  }

  /** Snap or blend to an era's atmosphere. t=1 → fully era b. */
  apply(a, b = null, t = 1) {
    const mix = (key, sub) => {
      const va = sub ? a[key][sub] : a[key];
      if (!b) return va;
      const vb = sub ? b[key][sub] : b[key];
      return lerp(va, vb, t);
    };
    const mixColor = (out, key, sub) => {
      const ca = sub ? a[key][sub] : a[key];
      out.set(ca);
      if (b) {
        const cb = new THREE.Color(sub ? b[key][sub] : b[key]);
        out.lerp(cb, t);
      }
      return out;
    };
    const u = this.sky.uniforms;
    mixColor(u.uTop.value, 'sky', 'top');
    mixColor(u.uMid.value, 'sky', 'mid');
    mixColor(u.uBottom.value, 'sky', 'bottom');
    mixColor(u.uSunColor.value, 'sky', 'sunColor');
    mixColor(u.uCloudColor.value, 'sky', 'clouds');
    if (a.sky.clouds) u.uCloudColor.value.set(a.sky.clouds.color);
    if (b && b.sky.clouds) u.uCloudColor.value.lerp(new THREE.Color(b.sky.clouds.color), t);
    u.uSunSize.value = mix('sky', 'sunSize');
    u.uHaze.value = mix('sky', 'haze');
    u.uStars.value = mix('sky', 'stars');
    u.uClouds.value = b ? lerp(a.sky.clouds.amount, b.sky.clouds.amount, t) : a.sky.clouds.amount;

    const sa = a.sky.sunDir;
    const dir = new THREE.Vector3(sa[0], sa[1], sa[2]).normalize();
    if (b) {
      const sb = b.sky.sunDir;
      dir.lerp(new THREE.Vector3(sb[0], sb[1], sb[2]).normalize(), t).normalize();
    }
    u.uSunDir.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(110).add(new THREE.Vector3(0, 0, -6));
    this.sun.intensity = mix('light', 'sun');
    mixColor(this.sun.color, 'light', 'sunColor');
    this.sun.castShadow = mix('light', 'shadow') > 0.12;
    this.shadowStrength = mix('light', 'shadow');

    this.hemi.intensity = mix('light', 'hemi');
    mixColor(this.hemi.color, 'light', 'skyColor');
    mixColor(this.hemi.groundColor, 'light', 'groundColor');
    this.ambient.intensity = mix('light', 'ambient');
    mixColor(this.ambient.color, 'light', 'ambientColor');
    this.fill.intensity = 0.18 + mix('light', 'hemi') * 0.22;
    this.fill.color.copy(this.hemi.color);

    mixColor(this.scene.fog.color, 'fog', 'color');
    this.scene.fog.density = mix('fog', 'density');
    this.renderer.toneMappingExposure = mix('grade', 'exposure');
    this.current = b && t > 0.5 ? b : a;
  }

  update(dt, time) {
    this.sky.uniforms.uTime.value = time;
  }
}

// ---------------------------------------------------------------------------
// Dynamic point-light pool: many sources, few actual lights
// ---------------------------------------------------------------------------
export class LightPool {
  constructor(scene, count = 14) {
    // one knob for the overall strength of practical lights
    this.gain = 0.55;
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.visible = false;
      scene.add(l);
      this.lights.push({ light: l, target: 0, src: null });
    }
    this.sources = [];
    this.timer = 0;
  }
  setSources(list) {
    this.sources = list.slice();
    for (const e of this.lights) {
      e.src = null;
      e.target = 0;
      e.light.intensity = 0;
      e.light.visible = false;
    }
    this.timer = 999;
  }
  update(dt, cameraPos) {
    this.timer += dt;
    if (this.timer > 0.28) {
      this.timer = 0;
      // score by apparent brightness at the camera
      const scored = this.sources.map((s) => {
        const dx = s.pos[0] - cameraPos.x;
        const dy = s.pos[1] - cameraPos.y;
        const dz = s.pos[2] - cameraPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        return { s, score: s.intensity / (d2 * 0.02 + 1) };
      });
      scored.sort((a, b) => b.score - a.score);
      const picked = scored.slice(0, this.lights.length).map((x) => x.s);
      // keep already-assigned sources in their existing slots to avoid popping
      const used = new Set();
      for (const e of this.lights) {
        if (e.src && picked.includes(e.src)) {
          used.add(e.src);
        } else {
          e.src = null;
        }
      }
      for (const e of this.lights) {
        if (e.src) continue;
        const next = picked.find((p) => !used.has(p));
        if (!next) {
          e.target = 0;
          continue;
        }
        used.add(next);
        e.src = next;
        e.light.color.set(next.color);
        e.light.distance = next.dist;
        e.light.position.set(next.pos[0], next.pos[1], next.pos[2]);
        e.light.intensity = 0;
      }
      for (const e of this.lights) e.target = e.src ? e.src.intensity * this.gain : 0;
    }
    for (const e of this.lights) {
      const k = 1 - Math.pow(0.001, dt);
      e.light.intensity = lerp(e.light.intensity, e.target, k);
      e.light.visible = e.light.intensity > 0.02;
    }
  }
}

// ---------------------------------------------------------------------------
// South side of the street + distant skyline
// ---------------------------------------------------------------------------
export function buildBackdrop(ctx) {
  const { era, mats, root } = ctx;
  const b = new Batch('backdrop');
  const rng = makeRng('back' + era.id);
  const row = SOUTH_ROW[era.id];
  const zF = L.southFacadeZ;
  const depth = L.southDepth;

  let x = SOUTH_LAYOUT.westStart;
  for (const [i, spec] of row.entries()) {
    if (i === SOUTH_LAYOUT.westCount) x = SOUTH_LAYOUT.eastStart;
    const w = spec.w;
    const floors = spec.floors;
    const fh = 3.4;
    const H = floors * fh + 1.2;
    const cx = x + w / 2;
    const map =
      spec.tex === 'brick'
        ? brickTex({ color: spec.color, grime: era.id === '1985' ? 0.8 : 0.4, seed: 300 + i, living: spec.living || 0 })
        : spec.tex === 'stone'
        ? stoneTex({ color: spec.color, grime: era.id === '1985' ? 0.7 : 0.35, seed: 310 + i })
        : spec.tex === 'panel'
        ? panelTex({ color: spec.color, grime: 0.3, seed: 320 + i })
        : spec.tex === 'timber'
        ? timberTex({ color: spec.color, grime: 0.15, seed: 330 + i, living: spec.living || 0 })
        : curtainTex({ color: spec.color, mullion: 0xb6c0c6, tint: 0x2d5f6b, seed: 340 + i });
    const wallMat = mats.std({ map, roughness: 0.9, metalness: spec.tex === 'curtain' ? 0.25 : 0.03 });
    b.texBox(wallMat, w, H, depth, cx, H / 2, zF + depth / 2, spec.tex === 'curtain' ? 3.4 : 2.2, {
      castShadow: true,
      receiveShadow: true,
      label: `${spec.sign} — south side of Vine Street`,
    });
    // cornice
    const trim = mats.std({ color: shade(spec.color, 0.35), roughness: 0.8 });
    if (spec.cornice === 'heavy' || spec.cornice === 'bracketed') {
      b.box(trim, w + 0.8, 0.55, 0.8, cx, H - 0.3, zF - 0.2, 0, 0, 0, { castShadow: true });
      b.box(trim, w + 0.3, 0.8, 0.3, cx, H + 0.4, zF - 0.05, 0, 0, 0, { castShadow: true });
    } else {
      b.box(trim, w + 0.3, 0.4, 0.4, cx, H - 0.2, zF - 0.1, 0, 0, 0, { castShadow: true });
    }
    // windows facing us
    const cols = Math.max(2, Math.round(w / 2.6));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < (era.id === '1985' || era.id === '2055' ? 0.55 : 0.3);
        const wm = mats.std({
          map: windowTex({
            style: spec.tex === 'curtain' ? 'ribbon' : 'punched',
            frame: shade(spec.color, 0.4),
            tint: 0x2b3540,
            lit,
            blinds: rng() < 0.5 ? rng() * 0.5 : 0,
            curtains: rng() < 0.3 ? 0.7 : 0,
            ac: era.id === '1985' && rng() < 0.5,
            grime: era.id === '1985' ? 0.8 : 0.4,
            seed: 400 + f * 3 + c,
          }),
          roughness: 0.25,
          metalness: 0.3,
          emissive: lit ? new THREE.Color(0xffd9a0) : undefined,
          emissiveIntensity: lit ? 0.9 : 0,
        });
        b.plane(wm, 1.2, fh * 0.6, x + (w * (c + 0.5)) / cols, 1.6 + f * fh + fh * 0.42, zF - 0.03, 0, Math.PI, 0, 0);
      }
    }
    // ground floor + sign
    b.box(mats.std({ color: shade(spec.color, -0.3), roughness: 0.7 }), w, 1.4, 0.4, cx, 0.7, zF - 0.15);
    const shopMat = mats.glow({
      color: 0x2a2f36,
      emissive: 0xffd9a0,
      emissiveIntensity: era.id === '1985' ? 0.8 : 0.5,
      roughness: 0.2,
    });
    b.plane(shopMat, w - 1.0, 2.0, cx, 2.2, zF - 0.04, 0, Math.PI, 0, 0, { label: spec.sign });
    const isMarquee = spec.signKind.startsWith('marquee');
    const sign = storefrontSign({
      kind: isMarquee ? (era.id === '1985' ? 'neon' : era.id === '2055' ? 'holo' : era.id === '1945' ? 'painted' : 'plastic') : spec.signKind,
      name: spec.sign,
      sub: '',
      color: era.id === '1985' ? 0x1a1226 : era.id === '2055' ? 0x101728 : 0x24303a,
      accent: era.id === '1985' ? 0xff4fa3 : era.id === '2055' ? 0x8fd7ff : era.id === '1945' ? 0xe8dcc0 : 0xffffff,
      wear: era.id === '1985' ? 0.5 : 0.15,
      seed: 500 + i,
      W: 768,
      H: 160,
    });
    const sm = spec.signKind.endsWith('holo') || spec.signKind === 'holo' ? mats.holoMaterial(sign.map, 0x8fd7ff, 1.2) : mats.signMaterial(sign);
    b.plane(sm, Math.min(w - 0.6, 8), 1.1, cx, 3.9, zF - 0.12, 0, Math.PI, 0, 0, { label: `${spec.sign} sign` });
    if (isMarquee) {
      // projecting cinema marquee with chase bulbs
      b.box(mats.std({ color: 0x2a2f36, roughness: 0.5, metalness: 0.4 }), w * 0.8, 0.9, 2.2, cx, 5.0, zF - 1.2, 0, 0, 0, { castShadow: true, label: 'Cinema marquee' });
      const bulb = mats.glow({ color: 0xfff1c8, emissive: 0xffe0a0, emissiveIntensity: 2.6 });
      const n = Math.round(w * 0.8 / 0.5);
      for (let k2 = 0; k2 < n; k2++) {
        b.sphere(bulb, 0.07, cx - w * 0.4 + k2 * 0.5, 4.5, zF - 2.28, 8);
      }
      ctx.lightsWanted.push({ type: 'point', color: 0xffe0a0, intensity: 12, dist: 16, pos: [cx, 4.6, zF - 2.6] });
    }
    if (spec.fireEscape) {
      const steel = mats.std({ color: era.id === '2055' ? 0x707880 : 0x33302c, roughness: 0.7, metalness: 0.6 });
      for (let f = 1; f < floors; f++) {
        b.box(steel, 2.2, 0.06, 1.0, cx, 1.4 + f * fh, zF - 0.55, 0, 0, 0, { castShadow: true });
        b.box(steel, 2.2, 0.05, 0.05, cx, 2.4 + f * fh, zF - 1.05);
        for (let k2 = 0; k2 <= 5; k2++) b.box(steel, 0.04, 1.0, 0.04, cx - 1.1 + k2 * 0.44, 1.9 + f * fh, zF - 1.05);
      }
    }
    if (era.id === '2055' || era.id === '2025') {
      // rooftop plant + solar
      b.box(mats.std({ color: 0x16233d, roughness: 0.2, metalness: 0.6 }), w * 0.5, 0.06, 1.6, cx, H + 0.9, zF + 2.4, -0.3, 0, 0);
      b.plane(mats.cutout({ map: leafTex(0x4a8c4a, 600 + i) }), w * 0.5, 1.0, cx - w * 0.2, H + 1.1, zF + 4.5, 0, 0, 0);
    }
    x += w + 0.6;
  }

  // ---- distant skyline ---------------------------------------------------
  const sk = SKYLINE[era.id];
  const skyRng = makeRng('skyline' + era.id);
  const silMat = mats.std({
    color: era.id === '2055' ? 0x151d33 : era.id === '1985' ? 0x2b2438 : era.id === '2005' ? 0x8d99a4 : 0x8a94a0,
    roughness: 0.95,
    metalness: 0.05,
  });
  const litMat = mats.glow({
    color: era.id === '2055' ? 0x1a2440 : 0x3a3f4a,
    emissive: era.id === '2055' ? 0x8fb8ff : era.id === '1985' ? 0xffc078 : 0xffe8c0,
    emissiveIntensity: era.id === '1985' || era.id === '2055' ? 1.0 : 0.25,
    roughness: 0.4,
  });
  for (let i = 0; i < sk.count; i++) {
    const bx = skyRng.range(-190, 190);
    const bz = -110 - skyRng.range(0, 130);
    const bw = skyRng.range(10, 30);
    const bh = skyRng.range(sk.maxH * 0.25, sk.maxH);
    b.box(silMat, bw, bh, bw * skyRng.range(0.6, 1.4), bx, bh / 2, bz, 0, 0, 0, { label: 'Downtown skyline' });
    // a few lit windows / crown lights
    if (era.id === '1985' || era.id === '2055' || era.id === '1945') {
      const rows = Math.floor(bh / 6);
      for (let r = 0; r < rows; r++) {
        if (skyRng() < 0.45) continue;
        b.box(litMat, bw * 0.7, 0.5, 0.3, bx, 3 + r * 6, bz + bw * 0.5, 0, 0, 0);
      }
    }
    if (sk.style === 'future' && skyRng() < 0.5) {
      b.box(litMat, bw * 0.14, bh * 0.3, bw * 0.14, bx, bh + bh * 0.15, bz);
      b.sphere(mats.glow({ color: 0x2a1a3a, emissive: 0xff5c8a, emissiveIntensity: 2.4 }), 1.1, bx, bh + bh * 0.32, bz, 10);
    }
    if (sk.style === 'lowrise' && skyRng() < 0.4) {
      // water towers on the distant roofs too
      b.cyl(mats.std({ color: 0x5c4530, roughness: 0.95 }), 2.2, 4.5, bx + bw * 0.2, bh + 3.6, bz, 10);
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
        b.box(mats.std({ color: 0x3f3c37, roughness: 0.9 }), 0.3, 2.4, 0.3, bx + bw * 0.2 + dx, bh + 1.2, bz + dz);
      }
    }
  }
  // a ridge of hills behind everything
  b.box(mats.std({ color: era.id === '2055' ? 0x101830 : 0x6f7a86, roughness: 1 }), 800, 40, 40, 0, 6, -330, 0, 0, 0);

  b.build(root, { castShadow: false, receiveShadow: false });
  buildPocketPark(ctx);
}

// ---------------------------------------------------------------------------
/** The little park across the street — same footprint, six states of repair. */
export function buildPocketPark(ctx) {
  const { era, mats, root } = ctx;
  const p = POCKET_PARK[era.id];
  const b = new Batch('park');
  const rng = makeRng('park' + era.id);
  const [gx0, gx1] = SOUTH_LAYOUT.gap;
  const cx = (gx0 + gx1) / 2;
  const z0 = L.sidewalkSouthZ;
  const z1 = z0 + 15;
  const cz = (z0 + z1) / 2;
  const w = gx1 - gx0;
  const d = z1 - z0;

  // ---- ground: lawn, path, kerb ----------------------------------------
  b.plane(mats.std({ color: p.grass, roughness: 1 }), w, d, cx, 0.05, cz, -Math.PI / 2, 0, 0, 0, {
    receiveShadow: true,
    label: 'Vine Street pocket park',
  });
  const pathMat = mats.std({
    color: era.id === '2055' ? 0x3b4152 : era.id === '1945' ? 0x9c8f74 : 0xa5a29a,
    roughness: 0.95,
  });
  b.plane(pathMat, 2.4, d, cx - 2.6, 0.06, cz, -Math.PI / 2, 0, 0, 0, { receiveShadow: true });
  b.plane(pathMat, w, 2.4, cx, 0.06, cz + 1.5, -Math.PI / 2, 0, 0, 0, { receiveShadow: true });
  b.box(mats.std({ color: 0x8d887c, roughness: 0.9 }), w, 0.2, 0.3, cx, 0.1, z0 - 0.15, 0, 0, 0);

  // ---- railings ---------------------------------------------------------
  if (p.rail === 'iron' || p.rail === 'steel') {
    const rm = mats.std({ color: p.rail === 'iron' ? 0x1f2a24 : 0x54585c, roughness: 0.6, metalness: 0.5 });
    const n = Math.round(w / 0.5);
    for (let i = 0; i <= n; i++) {
      const rx = gx0 + (i * w) / n;
      if (Math.abs(rx - (cx - 2.6)) < 1.4) continue; // gateway
      b.cyl(rm, 0.03, 1.1, rx, 0.65, z0 + 0.1, 6, 0, 0, 0, { label: 'Park railing' });
      if (p.rail === 'iron') b.cyl(rm, 0.05, 0.12, rx, 1.24, z0 + 0.1, 6);
    }
    b.box(rm, w, 0.05, 0.05, cx, 1.12, z0 + 0.1);
    b.box(rm, w, 0.05, 0.05, cx, 0.35, z0 + 0.1);
    for (const gx of [gx0 + 0.2, gx1 - 0.2]) b.cyl(rm, 0.07, 2.0, gx, 1.05, z0 + 0.1, 8, 0, 0, 0, { castShadow: true });
  } else if (p.rail === 'chain') {
    const rm = mats.std({ color: 0x8d9296, roughness: 0.6, metalness: 0.6 });
    for (let i = 0; i <= 6; i++) b.cyl(rm, 0.045, 2.0, gx0 + (i * w) / 6, 1.05, z0 + 0.1, 8, 0, 0, 0, { label: 'Chain-link fence' });
    b.cyl(rm, 0.035, w, cx, 2.0, z0 + 0.1, 8, 0, 0, Math.PI / 2);
  }

  // ---- trees ------------------------------------------------------------
  const barkMat = mats.std({ color: 0x4a3b2a, roughness: 0.98 });
  const leafMat = mats.cutout({
    map: leafTex(era.id === '1985' ? 0x35521f : era.id === '2055' ? 0x3f8c52 : 0x3d7534, 12, era.id === '2005' ? 0.3 : 0),
  });
  // planted along the flanks and the back so the street stays visible through
  // the gap — the same reason a real square keeps its centre open
  const treeSpots = [
    [gx0 + 1.3, z0 + 4.5],
    [gx0 + 1.6, z0 + 11.5],
    [gx1 - 1.3, z0 + 6.5],
    [gx1 - 1.5, z0 + 12.5],
    [cx + 0.5, z1 - 1.6],
  ];
  for (const [tx0, tz0] of treeSpots) {
    const tx = tx0 + rng.range(-0.3, 0.3);
    const tz = tz0 + rng.range(-0.6, 0.6);
    const s = p.trees * rng.range(0.85, 1.15);
    const th = 3.4 + s * 3.6;
    b.cyl(barkMat, 0.13 + s * 0.14, th, tx, th / 2, tz, 10, 0, 0, rng.range(-0.04, 0.04), { castShadow: true, label: 'Park tree' });
    const cr = 1.3 + s * 1.7;
    for (let k = 0; k < 3; k++) {
      b.plane(leafMat, cr * 2, cr * 1.8, tx, th + cr * 0.45, tz, 0, (k * Math.PI) / 3, 0, 0, { castShadow: true });
    }
    for (let k = 0; k < 3; k++) {
      const a = rng.range(0, TAU);
      b.plane(leafMat, cr * 1.1, cr * 0.9, tx + Math.cos(a) * cr * 0.5, th + cr * 0.45 + rng.range(-0.5, 0.6), tz + Math.sin(a) * cr * 0.5, 0, rng.range(0, 3), 0);
    }
  }
  // low shrubs hugging the railings
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? gx0 + 0.9 : gx1 - 0.9;
    b.plane(leafMat, 1.3, 0.95, side + rng.range(-0.3, 0.3), 0.55, z0 + 1.5 + i * 1.8, 0, rng.range(0, 3), 0);
  }

  // ---- centrepiece ------------------------------------------------------
  const stone = mats.std({ color: era.id === '1985' ? 0x7c766a : 0x9c968a, roughness: 0.92 });
  if (p.monument === 'obelisk') {
    b.box(stone, 1.6, 0.4, 1.6, cx + 2.2, 0.25, cz, 0, 0, 0, { castShadow: true });
    b.box(stone, 1.1, 0.5, 1.1, cx + 2.2, 0.68, cz, 0, 0, 0, { castShadow: true });
    b.box(stone, 0.75, 3.4, 0.75, cx + 2.2, 2.6, cz, 0, 0, 0, { castShadow: true, label: 'War memorial obelisk (1919)' });
    b.cyl(stone, 0.5, 0.6, cx + 2.2, 4.55, cz, 4, 0, Math.PI / 4, 0, { castShadow: true });
    b.plane(
      mats.std({ map: placardTex({ W: 192, H: 256, bg: 0x8a8478, fg: 0x3a352c, title: 'IN MEMORIAM', rows: ['1914 — 1918', '1939 — 1945'], font: 'Georgia, serif', wear: 0.4 }), roughness: 0.9 }),
      0.6,
      0.8,
      cx + 2.2,
      1.6,
      cz + 0.38,
      0,
      0,
      0,
      0,
      { label: 'Memorial inscription' }
    );
  } else if (p.monument === 'fountain' || p.monument === 'fountain-dry') {
    const dry = p.monument === 'fountain-dry';
    b.cyl(stone, 2.4, 0.5, cx + 2.2, 0.25, cz, 24, 0, 0, 0, { castShadow: true, label: dry ? 'Fountain — switched off since 1979' : 'Ornamental fountain' });
    b.cyl(mats.std({ color: dry ? 0x4a4636 : 0x2f5f6b, roughness: dry ? 0.95 : 0.1, metalness: dry ? 0 : 0.4 }), 2.15, 0.42, cx + 2.2, 0.32, cz, 24);
    b.cyl(stone, 0.45, 1.1, cx + 2.2, 0.8, cz, 12, 0, 0, 0, { castShadow: true });
    b.cyl(stone, 1.0, 0.16, cx + 2.2, 1.4, cz, 16, 0, 0, 0, { castShadow: true });
    if (!dry) {
      const water = mats.additive({ map: blobTex(0xbfe0f0, 1.6), opacity: 0.5 });
      for (let i = 0; i < 4; i++) {
        b.plane(water, 0.5, 1.5, cx + 2.2, 1.0, cz, 0, (i * Math.PI) / 2, 0, 0, { label: 'Water' });
      }
    } else {
      for (let i = 0; i < 5; i++) b.box(mats.std({ color: 0x6b6355, roughness: 1 }), 0.3, 0.2, 0.3, cx + 1.4 + rng.range(0, 1.6), 0.4, cz + rng.range(-1.2, 1.2), 0, rng.range(0, 3), 0);
    }
  } else if (p.monument === 'holo-art') {
    b.cyl(mats.std({ color: 0x2a3352, roughness: 0.4, metalness: 0.5 }), 2.0, 0.4, cx + 2.2, 0.2, cz, 24, 0, 0, 0, { castShadow: true });
    b.cyl(mats.glow({ color: 0x18203a, emissive: 0x8f7bff, emissiveIntensity: 2.4 }), 1.7, 0.06, cx + 2.2, 0.44, cz, 24);
    const disp = makeAnimatedDisplay({ W: 256, H: 384, kind: 'holo', accent: 0x8f7bff, lines: ['VINE', 'PARK', '2051'], fps: 10, seed: 21 });
    const hm = mats.holoMaterial(disp.texture, 0x8f7bff, 1.4);
    for (let i = 0; i < 2; i++) {
      b.plane(hm, 2.6, 3.9, cx + 2.2, 2.5, cz, 0, (i * Math.PI) / 2, 0, 0, { label: 'Public holographic artwork' });
    }
    ctx.animated.push(disp);
    ctx.holos.push({ mat: hm, base: 1.4, seed: 11 });
    ctx.lightsWanted.push({ type: 'point', color: 0x8f7bff, intensity: 10, dist: 16, pos: [cx + 2.2, 2.4, cz] });
  }

  // ---- benches ----------------------------------------------------------
  const benchWood = mats.std({
    color: p.bench === 'timber' ? 0x5f4a30 : p.bench === 'broken' ? 0x4a3f30 : p.bench === 'glow' ? 0x3a4358 : 0x5a6068,
    roughness: 0.9,
  });
  const benchLeg = mats.std({ color: p.bench === 'timber' ? 0x1f2a24 : 0x54585c, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const bx = cx - 4.2 + (i % 2) * 8.4;
    const bz = z0 + 4.5 + Math.floor(i / 2) * 6.5;
    const ry = (i % 2) * Math.PI;
    if (p.bench === 'broken' && i === 2) continue;
    const slats = p.bench === 'broken' && i === 1 ? 2 : 4;
    for (let k = 0; k < slats; k++) b.box(benchWood, 1.7, 0.07, 0.14, bx, 0.45, bz + k * 0.16, 0, ry, 0, { castShadow: true, label: 'Park bench' });
    for (let k = 0; k < 3; k++) b.box(benchWood, 1.7, 0.14, 0.06, bx, 0.62 + k * 0.16, bz - 0.28, 0, ry, 0);
    for (const s of [-1, 1]) b.box(benchLeg, 0.08, 0.45, 0.5, bx + s * 0.78, 0.22, bz + 0.2, 0, ry, 0);
    if (p.bench === 'glow') b.box(mats.glow({ color: 0x1b2334, emissive: 0x7cf7ff, emissiveIntensity: 1.6 }), 1.7, 0.03, 0.06, bx, 0.4, bz - 0.06, 0, ry, 0);
  }

  // ---- lamp + bin -------------------------------------------------------
  if (p.lamp) {
    const dark = mats.std({ color: era.id === '2055' ? 0x2a3352 : 0x2a2724, roughness: 0.6, metalness: 0.4 });
    for (const lx of [cx - 3.8, cx + 4.6]) {
      b.cyl(dark, 0.1, 3.6, lx, 1.8, cz + 3.2, 10, 0, 0, 0, { castShadow: true, label: 'Park lamp' });
      if (era.id === '2055') {
        b.cyl(mats.glow({ color: 0x18203a, emissive: 0xbfe4ff, emissiveIntensity: 3.0 }), 0.55, 0.07, lx, 3.7, cz + 3.2, 20);
      } else {
        b.sphere(mats.glow({ color: 0xf0ead8, emissive: 0xffe0a8, emissiveIntensity: 2.4 }), 0.28, lx, 3.85, cz + 3.2, 14);
      }
      ctx.lightsWanted.push({
        type: 'point',
        color: era.id === '2055' ? 0xbfe4ff : 0xffd9a0,
        intensity: 9,
        dist: 14,
        pos: [lx, 3.8, cz + 3.2],
      });
    }
  }

  // ---- era extras -------------------------------------------------------
  if (p.extra === 'bandstand') {
    const bs = mats.std({ color: 0xd8cfb8, roughness: 0.85 });
    b.cyl(mats.std({ color: 0x8d8578, roughness: 0.9 }), 2.6, 0.4, cx - 2.6, 0.2, z1 - 3.5, 12, 0, 0, 0, { castShadow: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.cyl(bs, 0.11, 2.8, cx - 2.6 + Math.cos(a) * 2.2, 1.6, z1 - 3.5 + Math.sin(a) * 2.2, 8, 0, 0, 0, { castShadow: true });
    }
    b.cyl(mats.std({ color: 0x6b4a3a, roughness: 0.9 }), 2.9, 1.1, cx - 2.6, 3.5, z1 - 3.5, 12, 0, 0, 0, { castShadow: true, label: 'Bandstand' });
    b.sphere(bs, 0.24, cx - 2.6, 4.2, z1 - 3.5, 10);
  } else if (p.extra === 'sandpit') {
    b.plane(mats.std({ color: 0xd8c8a0, roughness: 1 }), 4.0, 3.0, cx - 2.6, 0.07, z1 - 3.5, -Math.PI / 2, 0, 0, 0, { label: 'Sand pit' });
    b.box(mats.std({ color: 0x6b5030, roughness: 0.95 }), 4.2, 0.24, 0.16, cx - 2.6, 0.12, z1 - 5.0);
    b.box(mats.std({ color: 0x6b5030, roughness: 0.95 }), 4.2, 0.24, 0.16, cx - 2.6, 0.12, z1 - 2.0);
  } else if (p.extra === 'playground') {
    const frame = mats.std({ color: 0x2b6cb0, roughness: 0.5, metalness: 0.4 });
    b.plane(mats.std({ color: 0x6b4a4a, roughness: 1 }), 5.0, 4.0, cx - 2.6, 0.07, z1 - 3.8, -Math.PI / 2, 0, 0, 0, { label: 'Rubber safety surface' });
    b.box(frame, 2.2, 0.16, 1.2, cx - 2.6, 1.6, z1 - 3.8, 0, 0, 0, { castShadow: true, label: 'Play frame' });
    for (const s of [-1, 1]) {
      b.cyl(frame, 0.07, 1.6, cx - 2.6 + s * 1.0, 0.8, z1 - 3.8, 8);
      b.box(mats.std({ color: 0xffb703, roughness: 0.6 }), 0.4, 0.06, 0.2, cx - 2.6 + s * 0.5, 0.55, z1 - 3.8);
      for (const k of [-1, 1]) b.cyl(mats.std({ color: 0x2a2a2e, roughness: 0.8 }), 0.015, 1.0, cx - 2.6 + s * 0.5 + k * 0.15, 1.05, z1 - 3.8, 4);
    }
    b.box(mats.std({ color: 0xd94f45, roughness: 0.6 }), 1.0, 0.1, 2.4, cx + 0.4, 1.0, z1 - 3.8, -0.5, 0, 0, { castShadow: true, label: 'Slide' });
  } else if (p.extra === 'graffiti') {
    b.plane(mats.std({ map: graffitiTex({ amount: 1, seed: 55 }), transparent: true, alphaTest: 0.05, roughness: 0.9 }), 5.0, 2.2, cx, 1.4, z1 - 0.2, 0, Math.PI, 0, 0, { label: 'Tagged park wall' });
    for (let i = 0; i < 12; i++) {
      b.cyl(mats.std({ color: [0x3a5a2a, 0x8a8f94, 0xd8d2c0][i % 3], roughness: 0.8 }), 0.035, 0.12, gx0 + rng.range(0.5, w - 0.5), 0.12, z0 + rng.range(1, d - 1), 8, Math.PI / 2, rng.range(0, 3), 0, { label: 'Litter' });
    }
  } else if (p.extra === 'raingarden') {
    b.plane(mats.std({ color: 0x3f5a3a, roughness: 0.98 }), 5.0, 3.0, cx - 2.6, 0.06, z1 - 3.5, -Math.PI / 2, 0, 0, 0, { label: 'Bioretention basin' });
    for (let i = 0; i < 10; i++) {
      b.plane(mats.cutout({ map: leafTex(0x7fa04a, 300 + i) }), 0.9, 1.1, cx - 4.6 + i * 0.45, 0.6, z1 - 3.5 + rng.range(-1.2, 1.2), 0, rng.range(0, 3), 0);
    }
    // a couple of bike racks and a bin
    b.cyl(mats.std({ color: 0x54585c, roughness: 0.45, metalness: 0.7 }), 0.05, 0.9, cx - 5.0, 0.45, z0 + 1.2, 8);
  } else if (p.extra === 'canopy') {
    const frame = mats.std({ color: 0x2a3352, roughness: 0.45, metalness: 0.55 });
    b.box(frame, 7.0, 0.2, 5.0, cx - 1.0, 4.2, z1 - 4.0, 0, 0, 0, { castShadow: true, label: 'Photovoltaic shade canopy' });
    b.box(mats.std({ color: 0x16233d, roughness: 0.2, metalness: 0.6 }), 6.6, 0.06, 4.6, cx - 1.0, 4.34, z1 - 4.0, 0, 0, 0);
    for (const [ox, oz] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) {
      b.cyl(frame, 0.12, 4.2, cx - 1.0 + ox, 2.1, z1 - 4.0 + oz, 10, 0, 0, 0, { castShadow: true });
    }
    b.box(mats.glow({ color: 0x18203a, emissive: 0x7cf7ff, emissiveIntensity: 2.0 }), 6.4, 0.05, 0.1, cx - 1.0, 4.06, z1 - 6.3);
    ctx.lightsWanted.push({ type: 'point', color: 0x7cf7ff, intensity: 10, dist: 14, pos: [cx - 1, 4.0, z1 - 4] });
  }

  // ---- litter -----------------------------------------------------------
  const lm = mats.std({ color: 0xd8d2c0, roughness: 0.9 });
  for (let i = 0; i < Math.round(p.litter * 14); i++) {
    b.plane(lm, rng.range(0.12, 0.28), rng.range(0.14, 0.3), gx0 + rng.range(0.5, w - 0.5), 0.075, z0 + rng.range(0.8, d - 0.8), -Math.PI / 2, 0, rng.range(0, 3));
  }
  b.build(root, { castShadow: true, receiveShadow: true });
}

// ---------------------------------------------------------------------------
// Weather + light shafts
// ---------------------------------------------------------------------------
export function buildWeather(ctx) {
  const { era, mats, root } = ctx;
  const w = era.weather;
  const out = { update: () => {} };
  if (!w || w.amount <= 0.01) return out;
  const rng = makeRng('weather' + era.id);

  if (w.kind === 'rain') {
    const n = Math.round(2600 * w.amount);
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.range(-60, 60);
      pos[i * 3 + 1] = rng.range(0, 42);
      pos[i * 3 + 2] = rng.range(-50, 40);
      vel[i] = rng.range(26, 40);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc8d8e8,
      size: 0.11,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
    out.update = (dt) => {
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        p[i * 3 + 1] -= vel[i] * dt;
        p[i * 3] += dt * 3.5;
        if (p[i * 3 + 1] < 0) {
          p[i * 3 + 1] = 42;
          p[i * 3] = rng.range(-60, 60);
          p[i * 3 + 2] = rng.range(-50, 40);
        }
      }
      geo.attributes.position.needsUpdate = true;
    };
    // splash mist near the ground
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 6),
      mats.additive({ map: blobTex(0xa8c0d8, 1.4), opacity: 0.1, blending: THREE.NormalBlending, transparent: true })
    );
    mist.position.set(0, 0.7, -2);
    root.add(mist);
  } else if (w.kind === 'dust' || w.kind === 'smog' || w.kind === 'fog') {
    const n = Math.round(700 * w.amount);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.range(-50, 50);
      pos[i * 3 + 1] = rng.range(0.5, 26);
      pos[i * 3 + 2] = rng.range(-40, 30);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: blobTex(0xffffff, 2.2),
      color: w.kind === 'dust' ? 0xd8c8a8 : w.kind === 'smog' ? 0xb0a0b8 : 0x9fc0e8,
      size: w.kind === 'fog' ? 2.2 : 0.5,
      transparent: true,
      opacity: w.kind === 'dust' ? 0.28 : 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
    let t = 0;
    out.update = (dt) => {
      t += dt;
      pts.rotation.y = t * 0.006;
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i += 3) {
        p[i * 3 + 1] += Math.sin(t * 0.4 + i) * dt * 0.25;
      }
      geo.attributes.position.needsUpdate = true;
    };
  }
  return out;
}

/** Visible light cones under street lamps in the dark eras. */
export function buildLampGlows(ctx) {
  const { mats, root, era } = ctx;
  if (!ctx.lampGlows.length) return;
  const tex = coneGlowTex(era.id === '2055' ? 0xbfe4ff : 0xffb457);
  const mat = mats.additive({ map: tex, opacity: era.id === '2055' ? 0.16 : 0.2, depthWrite: false });
  for (const g of ctx.lampGlows) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, g.y * 1.05), mat);
      m.position.set(g.x, g.y * 0.5, g.z);
      m.rotation.y = (i * Math.PI) / 2;
      m.renderOrder = 5;
      root.add(m);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mats.additive({ map: blobTex(era.id === '2055' ? 0xbfe4ff : 0xffc070, 2.4), opacity: 0.3, depthWrite: false }));
    halo.position.set(g.x, g.y, g.z);
    halo.userData.billboard = true;
    root.add(halo);
    ctx.billboards.push(halo);
  }
}
