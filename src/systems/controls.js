import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LAYOUT, LOT_BOUNDS } from '../config/block.js';
import { clamp, lerp, easeInOutCubic, TAU } from '../lib/util.js';

const L = LAYOUT;

/**
 * Fixed vantage points. All of them sit in the roadway, on the south pavement
 * or above the pocket-park gap — never inside a tree, a shelter or a building.
 */
export const VIEWPOINTS = {
  street: { pos: [34.5, 5.0, -0.9], target: [-6, 7.5, -7], name: 'Street' },
  wide: { pos: [-1.6, 17, 27], target: [-4, 8.5, -11], name: 'Wide' },
  corner: { pos: [-34.5, 3.4, 7.4], target: [-17, 6.5, -8.5], name: 'Corner' },
  shopfront: { pos: [-11.0, 1.9, 0.4], target: [-14.5, 2.4, -8.6], name: 'Shopfront' },
  aerial: { pos: [24, 40, 42], target: [-3, 9, -12], name: 'Aerial' },
  lookup: { pos: [-2.0, 1.9, 2.6], target: [-4, 26, -12], name: 'Look up' },
};

/**
 * Three ways to move: orbit (default), walk (pointer-locked, 1.7 m eye height,
 * collides with the buildings) and fly (free 6-DOF). Plus tweened bookmarks
 * and a slow cinematic dolly when idle.
 */
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.mode = 'orbit';

    this.orbit = new OrbitControls(camera, domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.075;
    this.orbit.minDistance = 3;
    this.orbit.maxDistance = 120;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.target.set(-1, 5.5, -6);
    this.orbit.zoomSpeed = 0.9;
    this.orbit.rotateSpeed = 0.75;
    this.orbit.panSpeed = 0.8;
    this.orbit.screenSpacePanning = true;

    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.locked = false;
    this.tween = null;
    this.cinematic = false;
    this.cinematicT = 0;
    this.idleTimer = 0;
    this.autoRotate = false;

    this._onKeyDown = (e) => {
      const k = e.code;
      this.keys.add(k);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(k)) {
        if (this.mode !== 'orbit') e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._onMouseMove = (e) => {
      if (!this.locked) return;
      const s = 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch = clamp(this.pitch - e.movementY * s, -1.45, 1.45);
    };
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked && this.mode !== 'orbit') this.onExitLock && this.onExitLock();
    });

    // collision volumes: the building block + the south row
    this.blockers = [];
    for (const lot of LOT_BOUNDS) {
      this.blockers.push({ x0: lot.x0 - 0.3, x1: lot.x1 + 0.3, z0: L.facadeZ - L.blockDepth, z1: L.facadeZ + 0.25 });
    }
    // the south row, either side of the pocket park gap
    this.blockers.push({ x0: -41, x1: -6.6, z0: L.southFacadeZ - 0.25, z1: L.southFacadeZ + L.southDepth });
    this.blockers.push({ x0: 6.6, x1: 44, z0: L.southFacadeZ - 0.25, z1: L.southFacadeZ + L.southDepth });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      if (document.pointerLockElement) document.exitPointerLock();
      // rebuild an orbit target in front of the camera
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.orbit.target.copy(this.camera.position).add(fwd.multiplyScalar(14));
      this.orbit.update();
    } else {
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = e.y;
      this.pitch = e.x;
      if (mode === 'walk') {
        this.camera.position.y = L.sidewalkY + 1.68;
      }
      this.requestLock();
    }
  }

  requestLock() {
    if (this.mode !== 'orbit' && !document.pointerLockElement) {
      this.dom.requestPointerLock && this.dom.requestPointerLock();
    }
  }

  goTo(name, duration = 1.5) {
    const vp = VIEWPOINTS[name];
    if (!vp) return;
    this.flyTo(new THREE.Vector3(...vp.pos), new THREE.Vector3(...vp.target), duration);
  }

  flyTo(pos, target, duration = 1.5) {
    const startPos = this.camera.position.clone();
    const startTarget = this.mode === 'orbit'
      ? this.orbit.target.clone()
      : this.camera.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(14));
    this.tween = { t: 0, duration, startPos, startTarget, pos: pos.clone(), target: target.clone() };
    this.cinematic = false;
  }

  nudge(amount) {
    // small kick used by the time-jump shake
    this.shake = Math.max(this.shake || 0, amount);
  }

  update(dt, rawDt = dt) {
    // ---- bookmark tween (wall-clock, so slow machines still arrive) --------
    if (this.tween) {
      const tw = this.tween;
      tw.t += Math.min(rawDt, 0.3);
      const k = easeInOutCubic(clamp(tw.t / tw.duration, 0, 1));
      this.camera.position.lerpVectors(tw.startPos, tw.pos, k);
      const tgt = new THREE.Vector3().lerpVectors(tw.startTarget, tw.target, k);
      if (this.mode === 'orbit') {
        this.orbit.target.copy(tgt);
      } else {
        this.camera.lookAt(tgt);
        const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = e.y;
        this.pitch = e.x;
      }
      if (this.mode === 'orbit') this.camera.lookAt(tgt);
      if (tw.t >= tw.duration) this.tween = null;
    }

    // ---- movement ---------------------------------------------------------
    if (this.mode !== 'orbit' && !this.tween) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      if (this.mode === 'walk') {
        fwd.y = 0;
        fwd.normalize();
        right.y = 0;
        right.normalize();
      }
      const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3.4 : 1;
      const speed = (this.mode === 'walk' ? 3.6 : 11) * boost;
      const dir = new THREE.Vector3();
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dir.add(fwd);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dir.sub(fwd);
      if (this.keys.has('KeyD')) dir.add(right);
      if (this.keys.has('KeyA')) dir.sub(right);
      if (this.mode === 'fly') {
        if (this.keys.has('KeyE') || this.keys.has('Space')) dir.y += 1;
        if (this.keys.has('KeyQ')) dir.y -= 1;
      }
      if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
      this.velocity.lerp(dir, 1 - Math.pow(0.0001, dt));
      const before = this.camera.position.clone();
      this.camera.position.addScaledVector(this.velocity, dt);

      if (this.mode === 'walk') {
        this.camera.position.y = L.sidewalkY + 1.68 + Math.sin(performance.now() * 0.008) * 0.012 * Math.min(1, this.velocity.length() / 3);
        // building collision
        for (const bl of this.blockers) {
          const p = this.camera.position;
          if (p.x > bl.x0 && p.x < bl.x1 && p.z > bl.z0 && p.z < bl.z1) {
            // push out along the shallowest axis
            const dz1 = Math.abs(p.z - bl.z1);
            const dz0 = Math.abs(p.z - bl.z0);
            const dx0 = Math.abs(p.x - bl.x0);
            const dx1 = Math.abs(p.x - bl.x1);
            const m = Math.min(dz1, dz0, dx0, dx1);
            if (m === dz1) p.z = bl.z1 + 0.01;
            else if (m === dz0) p.z = bl.z0 - 0.01;
            else if (m === dx0) p.x = bl.x0 - 0.01;
            else p.x = bl.x1 + 0.01;
          }
        }
      }
      this.camera.position.x = clamp(this.camera.position.x, -70, 70);
      this.camera.position.z = clamp(this.camera.position.z, -40, 60);
      this.camera.position.y = clamp(this.camera.position.y, this.mode === 'walk' ? 0 : 0.6, 90);
      void before;
    } else if (!this.tween) {
      this.orbit.update();
      this.camera.position.y = Math.max(this.camera.position.y, 0.7);
    }

    // ---- cinematic dolly --------------------------------------------------
    if (this.cinematic && !this.tween) {
      this.cinematicT += dt * 0.06;
      const t = this.cinematicT;
      const r = 30 + Math.sin(t * 0.7) * 8;
      const a = t * 0.55;
      this.camera.position.set(Math.sin(a) * r * 0.9, 6.5 + Math.sin(t * 0.9) * 4.5, 14 + Math.cos(a) * r * 0.55);
      const tgt = new THREE.Vector3(Math.sin(a * 0.6) * 8, 7 + Math.sin(t) * 2.5, -8);
      this.camera.lookAt(tgt);
      if (this.mode === 'orbit') this.orbit.target.copy(tgt);
    }

    // ---- shake ------------------------------------------------------------
    if (this.shake > 0.0001) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotateZ((Math.random() - 0.5) * s * 0.02);
      this.shake *= Math.pow(0.02, dt);
      if (this.shake < 0.001) this.shake = 0;
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    this.orbit.dispose();
  }
}
