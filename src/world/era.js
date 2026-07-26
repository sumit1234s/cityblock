import * as THREE from 'three';
import { ERA_BY_ID } from '../config/eras.js';
import { EraMaterials } from '../lib/materials.js';
import { disposeTree } from '../lib/geom.js';
import { blobTex, coneGlowTex } from '../lib/textures.js';
import { buildGround, buildTrolleyWires } from './ground.js';
import { buildBlock } from './buildings.js';
import { buildStreetProps, buildTrees } from './props.js';
import { buildBackdrop, buildWeather, buildLampGlows } from './environment.js';
import { createTraffic } from './vehicles.js';
import { createCrowd } from './people.js';

/**
 * Builds one complete era of the block as a single detachable group.
 * Only one era is in the scene at a time; the rest stay cached and hidden.
 */
export function buildEra(eraId, opts = {}) {
  const era = ERA_BY_ID[eraId];
  const t0 = performance.now();
  const mats = new EraMaterials(eraId);
  const root = new THREE.Group();
  root.name = 'era' + eraId;

  const ctx = {
    era,
    mats,
    root,
    animated: [], // { update(dt, time) } — live LED / holo displays
    holos: [], // { mat, base, seed } — hologram flicker
    lightsWanted: [], // point-light sources for the pool
    lampGlows: [], // positions that get a visible light cone
    billboards: [], // meshes that always face the camera
    extraPeople: [], // static figures requested by other builders
    dronePads: [],
    vehLights: [],
  };

  buildGround(ctx);
  buildTrolleyWires(ctx);
  buildBlock(ctx);
  buildBackdrop(ctx);
  buildStreetProps(ctx);
  buildTrees(ctx);
  const traffic = createTraffic(ctx);
  const crowd = createCrowd(ctx);
  const weather = buildWeather(ctx);
  buildLampGlows(ctx);

  // ---- headlights on moving vehicles (only where it reads) ---------------
  const darkEra = era.light.sun < 1.3;
  if (darkEra) {
    const heads = ctx.vehLights.filter((v) => v.head).slice(0, 3);
    for (const v of heads) {
      const l = new THREE.PointLight(v.color, v.intensity * 2.2, v.dist * 2.4, 2);
      l.position.set(v.offset[0], v.offset[1], v.offset[2]);
      v.group.add(l);
      // beam pool on the road
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 3.4),
        mats.additive({ map: blobTex(v.color, 1.6), opacity: 0.3, depthWrite: false })
      );
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(v.offset[0] + 3.4, 0.03, 0);
      v.group.add(beam);
    }
    for (const v of ctx.vehLights.filter((x) => !x.head).slice(0, 4)) {
      const l = new THREE.PointLight(v.color, v.intensity, v.dist, 2);
      l.position.set(v.offset[0], v.offset[1], v.offset[2]);
      v.group.add(l);
    }
  }

  root.visible = false;
  const buildMs = performance.now() - t0;

  let meshCount = 0;
  root.traverse((o) => {
    if (o.isMesh) meshCount++;
  });

  return {
    id: eraId,
    era,
    root,
    mats,
    ctx,
    traffic,
    crowd,
    weather,
    stats: { buildMs: Math.round(buildMs), meshes: meshCount },
    lightSources: ctx.lightsWanted,

    update(dt, time, camera) {
      traffic.update(dt, time);
      crowd.update(dt, time);
      weather.update(dt, time);
      for (const a of ctx.animated) a.update(dt, time);
      // holograms flicker and breathe
      for (const h of ctx.holos) {
        const f = 0.82 + 0.18 * Math.sin(time * 7.3 + h.seed) + (Math.random() < 0.02 ? -0.28 : 0);
        if (h.mat.color) h.mat.color.setScalar(1).multiplyScalar(1);
        h.mat.opacity = Math.max(0.25, 0.9 * f);
      }
      for (const bb of ctx.billboards) {
        bb.quaternion.copy(camera.quaternion);
      }
    },

    dispose() {
      root.parent && root.parent.remove(root);
      disposeTree(root);
      mats.dispose();
    },
  };
}
