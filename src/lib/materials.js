import * as THREE from 'three';

/**
 * Per-era material factory.
 *
 * Every material an era creates is patched with a shared "chrono wipe" shader:
 * a horizontal plane sweeps through the world and geometry beyond it is
 * discarded, with a glowing rim at the cut. Outgoing eras cut upward, incoming
 * eras materialise upward, so the block appears to be rebuilt in place.
 */

export function makeWipeUniforms() {
  return {
    uWipeY: { value: 9999 },
    uWipeDir: { value: 1 }, // +1: discard above the plane, -1: discard below
    uWipeWidth: { value: 1.6 },
    uWipeOn: { value: 0 },
    uEdgeColor: { value: new THREE.Color(0x8ad8ff) },
    uWipeJitter: { value: 1.0 },
  };
}

const VERT_INJECT = `
        vec4 _wp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        _wp = modelMatrix * _wp;
        vWipePos = _wp.xyz;
        #include <project_vertex>`;

const FRAG_HEAD = `
uniform float uWipeY;
uniform float uWipeDir;
uniform float uWipeWidth;
uniform float uWipeOn;
uniform float uWipeJitter;
uniform vec3 uEdgeColor;
varying vec3 vWipePos;
float _whash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453123); }
`;

const FRAG_INJECT = `
        #include <dithering_fragment>
        if ( uWipeOn > 0.5 ) {
          float n = (_whash(floor(vWipePos * 2.2)) - 0.5) * 2.2 * uWipeJitter
                  + (_whash(floor(vWipePos * 0.55)) - 0.5) * 3.0 * uWipeJitter;
          float sd = ( vWipePos.y - ( uWipeY + n ) ) * uWipeDir;
          if ( sd > 0.0 ) discard;
          float g = smoothstep( uWipeWidth, 0.0, -sd );
          gl_FragColor.rgb += uEdgeColor * g * 2.6;
          gl_FragColor.rgb = mix( gl_FragColor.rgb, uEdgeColor, g * 0.35 );
        }`;

export function patchWipe(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    for (const k in uniforms) shader.uniforms[k] = uniforms[k];
    if (shader.vertexShader.includes('#include <project_vertex>')) {
      shader.vertexShader =
        'varying vec3 vWipePos;\n' +
        shader.vertexShader.replace('#include <project_vertex>', VERT_INJECT);
    }
    if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
      shader.fragmentShader =
        FRAG_HEAD + shader.fragmentShader.replace('#include <dithering_fragment>', FRAG_INJECT);
    }
  };
  mat.customProgramCacheKey = () => 'chronowipe';
  return mat;
}

export class EraMaterials {
  constructor(eraId) {
    this.eraId = eraId;
    this.uniforms = makeWipeUniforms();
    this.cache = new Map();
    this.all = [];
    this.animated = []; // {update(dt,t)}
  }

  _reg(mat) {
    patchWipe(mat, this.uniforms);
    this.all.push(mat);
    return mat;
  }

  _get(key, make) {
    let m = this.cache.get(key);
    if (!m) {
      m = this._reg(make());
      this.cache.set(key, m);
    }
    return m;
  }

  /** Builders pass conditional params freely; drop the undefined ones so
   *  three.js doesn't warn about them. */
  static clean(p) {
    const out = {};
    for (const k in p) if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
    return out;
  }

  /** Standard PBR-ish surface. */
  std(params = {}) {
    const key = 'std' + stableKey(params);
    return this._get(key, () => {
      const p = { roughness: 0.85, metalness: 0.0, ...params };
      const m = new THREE.MeshStandardMaterial(EraMaterials.clean(p));
      return m;
    });
  }

  /** Emissive surface (signs, lamps, screens). */
  glow(params = {}) {
    const key = 'glow' + stableKey(params);
    return this._get(key, () => {
      const p = {
        color: 0x111111,
        roughness: 0.4,
        metalness: 0,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        ...params,
      };
      return new THREE.MeshStandardMaterial(EraMaterials.clean(p));
    });
  }

  /** Glass — cheap: no refraction, just a dark tint + high specular. */
  glass(params = {}) {
    const key = 'glass' + stableKey(params);
    return this._get(key, () => {
      const p = {
        color: 0x2b3540,
        roughness: 0.08,
        metalness: 0.55,
        transparent: true,
        opacity: 0.72,
        ...params,
      };
      return new THREE.MeshStandardMaterial(EraMaterials.clean(p));
    });
  }

  /** Additive, unlit — holograms, light shafts, glow cards. */
  additive(params = {}) {
    const key = 'add' + stableKey(params);
    return this._get(key, () => {
      const p = {
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        ...params,
      };
      return new THREE.MeshBasicMaterial(EraMaterials.clean(p));
    });
  }

  /** Unlit flat colour / texture — decals, road paint, distant skyline. */
  basic(params = {}) {
    const key = 'basic' + stableKey(params);
    return this._get(key, () => new THREE.MeshBasicMaterial(EraMaterials.clean(params)));
  }

  /** Cutout foliage / fabric — alpha tested so shadows stay cheap. */
  cutout(params = {}) {
    const key = 'cut' + stableKey(params);
    return this._get(key, () => {
      const p = {
        transparent: true,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
        ...params,
      };
      return new THREE.MeshStandardMaterial(EraMaterials.clean(p));
    });
  }

  /** Build a material for a sign/ad result from signs.js. */
  signMaterial(sign, opts = {}) {
    const base = {
      map: sign.map,
      roughness: 0.55,
      metalness: 0.05,
      side: opts.side || THREE.FrontSide,
    };
    if (sign.transparent) {
      base.transparent = true;
      base.alphaTest = 0.02;
    }
    if (sign.emissive) {
      base.emissiveMap = sign.emissive;
      base.emissive = new THREE.Color(0xffffff);
      base.emissiveIntensity = (sign.glow || 1) * (opts.glowScale ?? 1);
    }
    const key = 'sign' + (sign.map.uuid || '') + JSON.stringify(opts);
    return this._get(key, () => new THREE.MeshStandardMaterial(EraMaterials.clean(base)));
  }

  /** A hologram plate: additive, double sided, animated flicker. */
  holoMaterial(map, color = 0x9fd8ff, intensity = 1.5) {
    const key = 'holo' + (map.uuid || '') + color + intensity;
    return this._get(key, () => {
      const m = new THREE.MeshBasicMaterial({
        map,
        color: new THREE.Color(color).multiplyScalar(intensity),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.9,
      });
      return m;
    });
  }

  setWipe({ y, dir, on, edge, width, jitter }) {
    const u = this.uniforms;
    if (y !== undefined) u.uWipeY.value = y;
    if (dir !== undefined) u.uWipeDir.value = dir;
    if (on !== undefined) u.uWipeOn.value = on ? 1 : 0;
    if (width !== undefined) u.uWipeWidth.value = width;
    if (jitter !== undefined) u.uWipeJitter.value = jitter;
    if (edge !== undefined) u.uEdgeColor.value.set(edge);
  }

  dispose() {
    for (const m of this.all) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
    this.all.length = 0;
    this.cache.clear();
  }
}

function stableKey(o) {
  const parts = [];
  for (const k of Object.keys(o).sort()) {
    const v = o[k];
    if (v && v.isTexture) parts.push(k + '=' + v.uuid);
    else if (v && v.isColor) parts.push(k + '=' + v.getHex());
    else parts.push(k + '=' + v);
  }
  return parts.join('|');
}
