import * as THREE from 'three';

/**
 * Hover inspection. Every notable mesh carries a userData.label written by the
 * builder that made it, so pointing at a hydrant tells you which pattern it is
 * and pointing at a sign tells you how it is lit.
 */
export class Inspector {
  constructor(camera, domElement, tooltipEl) {
    this.camera = camera;
    this.dom = domElement;
    this.el = tooltipEl;
    this.ray = new THREE.Raycaster();
    this.ray.far = 160;
    this.pointer = new THREE.Vector2(-10, -10);
    this.screen = { x: 0, y: 0 };
    this.target = null;
    this.timer = 0;
    this.enabled = true;
    this.hasPointer = false;

    this._move = (e) => {
      const r = this.dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.screen.x = e.clientX;
      this.screen.y = e.clientY;
      this.hasPointer = true;
    };
    this._leave = () => {
      this.hasPointer = false;
      this.hide();
    };
    domElement.addEventListener('pointermove', this._move);
    domElement.addEventListener('pointerleave', this._leave);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.hide();
  }

  hide() {
    this.el.classList.remove('visible');
    this.target = null;
  }

  update(dt, root, locked) {
    if (!this.enabled || !root) return;
    this.timer += dt;
    if (this.timer < 0.09) {
      if (this.el.classList.contains('visible') && !locked) this._place();
      return;
    }
    this.timer = 0;

    if (locked) {
      // in pointer-lock modes, probe the centre of the screen
      this.pointer.set(0, 0);
    } else if (!this.hasPointer) {
      return;
    }

    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObject(root, true);
    let label = null;
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o = h.object;
      let depth = 0;
      while (o && depth < 4) {
        if (o.userData && o.userData.label) {
          label = o.userData.label;
          break;
        }
        o = o.parent;
        depth++;
      }
      if (label) break;
    }

    if (label) {
      if (label !== this.target) {
        this.target = label;
        this.el.textContent = label;
      }
      this.el.classList.add('visible');
      this._place(locked);
    } else {
      this.hide();
    }
  }

  _place(locked) {
    if (locked) {
      this.el.style.left = '50%';
      this.el.style.top = 'calc(50% + 26px)';
      this.el.style.transform = 'translate(-50%, 0)';
      return;
    }
    const pad = 16;
    const w = this.el.offsetWidth;
    const x = Math.min(window.innerWidth - w - pad, this.screen.x + 18);
    const y = Math.min(window.innerHeight - 60, this.screen.y + 18);
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.style.transform = 'none';
  }

  dispose() {
    this.dom.removeEventListener('pointermove', this._move);
    this.dom.removeEventListener('pointerleave', this._leave);
  }
}
