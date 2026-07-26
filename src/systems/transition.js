import * as THREE from 'three';
import { blobTex } from '../lib/textures.js';
import { clamp, lerp, easeOutCubic, smoothstep } from '../lib/util.js';

/**
 * The time jump.
 *
 * A single horizontal "time front" sweeps up through the world. Below the line
 * you are in the new era; above it you are still in the old one. The old era's
 * materials discard fragments below the line, the new era's discard above it,
 * and both draw a glowing rim exactly at the cut — so the block appears to be
 * rebuilt from the pavement up, in place, in one continuous shot.
 */
export class TimeTransition {
  constructor({ scene, environment, postfx, rig, audio, lightPool, renderer }) {
    this.renderer = renderer;
    this.scene = scene;
    this.env = environment;
    this.postfx = postfx;
    this.rig = rig;
    this.audio = audio;
    this.lightPool = lightPool;
    this.active = null;
    this.duration = 2.15;
    this.yMax = 210;

    // ---- the visible sweep: a glowing disc + an expanding ring ----------
    const discMat = new THREE.MeshBasicMaterial({
      map: blobTex(0xffffff, 1.1),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.renderOrder = 900;
    this.disc.visible = false;
    scene.add(this.disc);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 901;
    this.ring.visible = false;
    scene.add(this.ring);

    // vertical scan curtain, gives the front some body when seen from the side
    const curtainMat = new THREE.MeshBasicMaterial({
      map: blobTex(0xffffff, 2.4),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), curtainMat);
    this.curtain.renderOrder = 899;
    this.curtain.visible = false;
    scene.add(this.curtain);
  }

  get running() {
    return !!this.active;
  }

  /**
   * @param {object} from era object (or null on first load)
   * @param {object} to   era object
   * @param {number} dir  +1 forwards in time, -1 backwards
   */
  start(from, to, dir = 1, onComplete) {
    if (this.active) return false;
    const edge = new THREE.Color(to.era.palette);
    to.root.visible = true;
    to.mats.setWipe({ y: -4, dir: 1, on: true, edge, width: 2.2, jitter: 1 });
    if (from) from.mats.setWipe({ y: -4, dir: -1, on: true, edge, width: 2.2, jitter: 1 });

    this.disc.visible = true;
    this.ring.visible = true;
    this.curtain.visible = true;
    this.disc.material.color.copy(edge);
    this.ring.material.color.copy(edge);
    this.curtain.material.color.copy(edge);

    this.audio && this.audio.timeWarp(dir);
    this.rig && this.rig.nudge(0.22);
    // two eras are resident for the next couple of seconds — freeze the shadow
    // map so we are not paying for it twice
    if (this.renderer) {
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
    }

    this.active = { from, to, dir, t: 0, onComplete, lightsSwapped: false, edge };
    return true;
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const p = clamp(a.t / this.duration, 0, 1);
    // fast through the built volume, then race away to the horizon
    const y = -4 + (this.yMax + 4) * Math.pow(p, 2.35);

    a.to.mats.setWipe({ y, dir: 1, width: 1.6 + p * 4 });
    if (a.from) a.from.mats.setWipe({ y, dir: -1, width: 1.6 + p * 4 });

    // atmosphere + grade crossfade, biased slightly ahead of the sweep
    const envT = smoothstep(clamp(p * 1.35, 0, 1));
    if (a.from) {
      this.env.apply(a.from.era, a.to.era, envT);
      this.postfx.applyGrade(a.from.era, a.to.era, envT);
    }

    // swap the light pool once the street level has changed over
    if (!a.lightsSwapped && y > 9) {
      a.lightsSwapped = true;
      this.lightPool.setSources(a.to.lightSources);
      this.audio && this.audio.setEra(a.to.era, 1.1);
    }

    // ---- sweep visuals ---------------------------------------------------
    const vis = Math.sin(Math.min(1, p * 1.15) * Math.PI);
    const size = 60 + p * 340;
    this.disc.position.set(0, Math.min(y, 120), -6);
    this.disc.scale.set(size, size, 1);
    this.disc.material.opacity = 0.5 * vis;

    this.ring.position.set(0, Math.min(y, 120) + 0.2, -6);
    const rs = 18 + Math.pow(p, 1.4) * 220;
    this.ring.scale.set(rs, rs, 1);
    this.ring.material.opacity = 0.85 * vis;

    this.curtain.position.set(0, Math.min(y, 120), -6);
    this.curtain.scale.set(240, 22 + p * 40, 1);
    this.curtain.material.opacity = 0.16 * vis;
    if (this.rig) this.curtain.quaternion.copy(this.rig.camera.quaternion);

    // ---- camera + lens punctuation --------------------------------------
    const flash = Math.pow(1 - Math.abs(p - 0.06) * 14, 3);
    this.postfx.flash(Math.max(0, flash) * 0.5 + vis * 0.035, a.edge);
    this.postfx.warp(vis * 0.09);
    if (this.rig && p < 0.35) this.rig.nudge(0.1 * (1 - p / 0.35));

    if (p >= 1) {
      a.to.mats.setWipe({ on: false, y: 9999 });
      if (a.from) {
        a.from.mats.setWipe({ on: false, y: 9999 });
        a.from.root.visible = false;
      }
      this.env.apply(a.to.era);
      this.postfx.applyGrade(a.to.era);
      this.postfx.flash(0);
      this.postfx.warp(0);
      this.disc.visible = this.ring.visible = this.curtain.visible = false;
      this.lightPool.setSources(a.to.lightSources);
      if (this.renderer) {
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      }
      const cb = a.onComplete;
      this.active = null;
      cb && cb();
    }
  }
}
