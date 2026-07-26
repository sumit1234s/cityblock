import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Geometry helpers. The important one is `Batch`, which accumulates transformed
 * geometry per-material at build time and emits a handful of merged meshes.
 * A whole era of the block ends up as ~60 draw calls instead of ~4000.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

const cache = new Map();
function cached(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

export const unitBox = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
export const unitPlane = () => cached('plane', () => new THREE.PlaneGeometry(1, 1));
export const unitCyl = (seg = 12) =>
  cached('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1));
export const unitCone = (seg = 12) =>
  cached('cone' + seg, () => new THREE.ConeGeometry(0.5, 1, seg));
export const unitSphere = (seg = 12) =>
  cached('sph' + seg, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg >> 1)));
export const unitTorus = (seg = 14, rseg = 8, r = 0.3) =>
  cached(`tor${seg}_${rseg}_${r}`, () => new THREE.TorusGeometry(0.5 - r / 2, r / 2, rseg, seg));

/** Multiply a geometry's UVs (in place, on a clone-safe basis). */
export function scaleUV(geo, su, sv, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  }
  uv.needsUpdate = true;
  return geo;
}

/** A wall plane of w×h whose UVs are scaled so the texture keeps world scale. */
export function wallPlane(w, h, tile = 2, ou = 0, ov = 0) {
  const g = new THREE.PlaneGeometry(w, h, 1, 1);
  return scaleUV(g, w / tile, h / tile, ou, ov);
}

/** Rounded-rectangle THREE.Shape. */
export function roundedRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Extrude a 2D polyline (array of [x,y]) along Z with optional bevel. */
export function extrudeProfile(pts, depth, opts = {}) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const bevel = opts.bevel ?? 0;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: opts.bevelSegments ?? 2,
    curveSegments: opts.curveSegments ?? 4,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Extrude a smooth (spline) 2D profile — used for car silhouettes. */
export function extrudeSpline(pts, depth, opts = {}) {
  const v2 = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const curve = new THREE.SplineCurve(v2);
  const sampled = curve.getPoints(opts.samples ?? 40);
  const shape = new THREE.Shape(sampled);
  const bevel = opts.bevel ?? 0.06;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: opts.bevelSegments ?? 2,
    curveSegments: 4,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** An arched window opening shape (rect + semicircular head). */
export function archShape(w, h, archH) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(-hw, h - archH);
  s.absarc(0, h - archH, hw, Math.PI, 0, true);
  s.lineTo(hw, 0);
  s.closePath();
  return s;
}

export function shapeGeo(shape, curveSegments = 8) {
  const g = new THREE.ShapeGeometry(shape, curveSegments);
  return g;
}

/**
 * Accumulates geometry per material, then merges.
 */
export class Batch {
  constructor(name = 'batch') {
    this.name = name;
    this.groups = new Map(); // material -> {geos:[], opts}
  }

  _bucket(mat, opts) {
    let b = this.groups.get(mat);
    if (!b) {
      b = { geos: [], opts: opts || {} };
      this.groups.set(mat, b);
    }
    return b;
  }

  /** Add a geometry with an explicit matrix (geometry is cloned). */
  addGeo(geo, mat, matrix, opts) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    // merged geometries must agree on attributes
    if (g.index) g.toNonIndexed && (void 0);
    this._bucket(mat, opts).geos.push(g);
    return this;
  }

  /** Convenience: axis-aligned (or euler-rotated) box. */
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, opts) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(w, h, d));
    return this.addGeo(unitBox(), mat, _m, opts);
  }

  /** Box whose faces are UV-scaled to world size (for tiling textures). */
  texBox(mat, w, h, d, x, y, z, tile = 2, opts) {
    const g = new THREE.BoxGeometry(w, h, d);
    scaleUV(g, 1, 1);
    // approximate: scale UV by the largest face so brick size stays sane
    const uv = g.attributes.uv;
    const dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = dims[f];
      for (let i = f * 4; i < f * 4 + 4; i++) {
        uv.setXY(i, uv.getX(i) * (fw / tile), uv.getY(i) * (fh / tile));
      }
    }
    uv.needsUpdate = true;
    g.translate(x, y, z);
    return this.addGeo(g, mat, null, opts);
  }

  plane(mat, w, h, x, y, z, rx = 0, ry = 0, rz = 0, tile = 0, opts) {
    const g = tile > 0 ? wallPlane(w, h, tile) : new THREE.PlaneGeometry(w, h);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    return this.addGeo(g, mat, null, opts);
  }

  cyl(mat, r, h, x, y, z, seg = 12, rx = 0, ry = 0, rz = 0, opts) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(r * 2, h, r * 2));
    return this.addGeo(unitCyl(seg), mat, _m, opts);
  }

  sphere(mat, r, x, y, z, seg = 12, opts) {
    _m.makeTranslation(x, y, z);
    _m.scale(_v.set(r * 2, r * 2, r * 2));
    return this.addGeo(unitSphere(seg), mat, _m, opts);
  }

  /** Emit merged meshes into `parent`. */
  build(parent, defaults = {}) {
    const out = [];
    for (const [mat, bucket] of this.groups) {
      if (!bucket.geos.length) continue;
      let merged;
      try {
        merged = mergeGeometries(bucket.geos, false);
      } catch (e) {
        // fall back to individual meshes if attributes mismatch
        merged = null;
      }
      if (!merged) {
        for (const g of bucket.geos) {
          const mesh = new THREE.Mesh(g, mat);
          applyMeshOpts(mesh, defaults, bucket.opts);
          parent.add(mesh);
          out.push(mesh);
        }
        continue;
      }
      for (const g of bucket.geos) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      applyMeshOpts(mesh, defaults, bucket.opts);
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

function applyMeshOpts(mesh, defaults, opts) {
  mesh.castShadow = opts.castShadow ?? defaults.castShadow ?? false;
  mesh.receiveShadow = opts.receiveShadow ?? defaults.receiveShadow ?? false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
  if (opts.label) mesh.userData.label = opts.label;
}

/** Dispose everything under an object3D. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
