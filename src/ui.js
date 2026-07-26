import { ERAS } from './config/eras.js';
import { VIEWPOINTS } from './systems/controls.js';
import { clamp } from './lib/util.js';

/** DOM chrome: timeline, era card, control panel, toasts, loader. */
export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.index = 0;
    this.el = {
      ui: document.getElementById('ui'),
      timeline: document.getElementById('timeline'),
      ticks: document.querySelector('.tl-ticks'),
      thumb: document.querySelector('.tl-thumb'),
      fill: document.querySelector('.tl-fill'),
      prev: document.getElementById('tl-prev'),
      next: document.getElementById('tl-next'),
      year: document.getElementById('eh-year'),
      name: document.getElementById('eh-name'),
      sub: document.getElementById('eh-sub'),
      cardTitle: document.getElementById('card-title'),
      cardBlurb: document.getElementById('card-blurb'),
      cardDetails: document.getElementById('card-details'),
      card: document.getElementById('era-card'),
      cardToggle: document.getElementById('card-toggle'),
      viewButtons: document.getElementById('view-buttons'),
      modeButtons: document.getElementById('mode-buttons'),
      optionButtons: document.getElementById('option-buttons'),
      tooltip: document.getElementById('tooltip'),
      toast: document.getElementById('toast'),
      stats: document.getElementById('stats'),
      crosshair: document.getElementById('crosshair'),
      stamp: document.querySelector('#year-stamp span'),
      loader: document.getElementById('loader'),
      loaderFill: document.querySelector('.loader-fill'),
      loaderStatus: document.querySelector('.loader-status'),
      startBtn: document.getElementById('start-btn'),
    };
    this._buildTicks();
    this._buildViews();
    this._wire();
  }

  // ---------------------------------------------------------------- build
  _buildTicks() {
    this.el.ticks.innerHTML = '';
    this.tickEls = ERAS.map((era, i) => {
      const b = document.createElement('button');
      b.className = 'tl-tick';
      b.innerHTML = `<span>${era.year}</span>`;
      b.title = `${era.year} — ${era.name}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onSelect(i);
      });
      b.addEventListener('pointerenter', () => this.h.onHover && this.h.onHover());
      this.el.ticks.appendChild(b);
      return b;
    });
  }

  _buildViews() {
    this.el.viewButtons.innerHTML = '';
    for (const [key, vp] of Object.entries(VIEWPOINTS)) {
      const b = document.createElement('button');
      b.textContent = vp.name;
      b.dataset.view = key;
      b.addEventListener('click', () => {
        this.h.onView(key);
        this.flashButton(b);
      });
      this.el.viewButtons.appendChild(b);
    }
  }

  _wire() {
    this.el.prev.addEventListener('click', () => this.h.onSelect(this.index - 1));
    this.el.next.addEventListener('click', () => this.h.onSelect(this.index + 1));

    // drag along the rail, snapping to the nearest year
    const tl = this.el.timeline;
    let dragging = false;
    const posToIndex = (clientX) => {
      const r = tl.getBoundingClientRect();
      const t = clamp((clientX - r.left - 10) / (r.width - 20), 0, 1);
      return Math.round(t * (ERAS.length - 1));
    };
    const moveThumbRaw = (clientX) => {
      const r = tl.getBoundingClientRect();
      const t = clamp((clientX - r.left - 10) / (r.width - 20), 0, 1);
      this.el.thumb.style.left = 10 + t * (r.width - 20) + 'px';
      this.el.fill.style.width = t * 100 + '%';
    };
    tl.addEventListener('pointerdown', (e) => {
      dragging = true;
      tl.classList.add('dragging');
      tl.setPointerCapture(e.pointerId);
      moveThumbRaw(e.clientX);
      this.pendingIndex = posToIndex(e.clientX);
      this._previewTick(this.pendingIndex);
    });
    tl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      moveThumbRaw(e.clientX);
      const i = posToIndex(e.clientX);
      if (i !== this.pendingIndex) {
        this.pendingIndex = i;
        this._previewTick(i);
        this.h.onHover && this.h.onHover();
      }
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      tl.classList.remove('dragging');
      const i = posToIndex(e.clientX ?? 0);
      this.setThumb(this.index);
      this.h.onSelect(i);
    };
    tl.addEventListener('pointerup', endDrag);
    tl.addEventListener('pointercancel', endDrag);
    tl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.h.onSelect(this.index + 1);
      if (e.key === 'ArrowLeft') this.h.onSelect(this.index - 1);
    });

    this.el.cardToggle.addEventListener('click', () => {
      const c = this.el.card.classList.toggle('collapsed');
      this.el.cardToggle.textContent = c ? '+' : '–';
    });

    this.el.modeButtons.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        this.el.modeButtons.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.h.onMode(b.dataset.mode);
      });
    });

    this.el.optionButtons.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        const on = this.h.onToggle(b.dataset.toggle);
        if (b.dataset.toggle === 'quality') {
          b.textContent = 'Quality: ' + on;
          b.classList.toggle('active', on !== 'Low');
        } else {
          b.classList.toggle('active', !!on);
        }
      });
    });
  }

  // ---------------------------------------------------------------- state
  _previewTick(i) {
    this.tickEls.forEach((t, k) => {
      t.classList.toggle('current', k === i);
      t.classList.toggle('done', k < i);
    });
  }

  setThumb(i) {
    const r = this.el.timeline.getBoundingClientRect();
    const t = i / (ERAS.length - 1);
    this.el.thumb.style.left = 10 + t * (r.width - 20) + 'px';
    this.el.fill.style.width = t * 100 + '%';
  }

  setEra(i) {
    const era = ERAS[i];
    this.index = i;
    document.documentElement.style.setProperty('--accent', era.palette);
    document.documentElement.style.setProperty('--accent-dim', hexToRgba(era.palette, 0.22));
    this._previewTick(i);
    this.setThumb(i);
    this.el.year.textContent = era.year;
    this.el.name.textContent = era.name;
    this.el.sub.textContent = era.subtitle;
    this.el.cardTitle.textContent = `${era.name} · ${era.year}`;
    this.el.cardBlurb.textContent = era.blurb;
    this.el.stamp.textContent = era.year;
    this.el.cardDetails.innerHTML = '';
    era.details.forEach((d, k) => {
      const li = document.createElement('li');
      li.textContent = d;
      li.classList.add('in');
      li.style.animationDelay = 90 + k * 70 + 'ms';
      this.el.cardDetails.appendChild(li);
    });
    this.el.prev.disabled = i === 0;
    this.el.next.disabled = i === ERAS.length - 1;
  }

  setBusy(busy) {
    this.el.timeline.style.pointerEvents = busy ? 'none' : 'auto';
    this.el.prev.disabled = busy || this.index === 0;
    this.el.next.disabled = busy || this.index === ERAS.length - 1;
  }

  setCrosshair(on) {
    this.el.crosshair.classList.toggle('on', on);
  }

  setStats(text) {
    this.el.stats.textContent = text;
  }

  flashButton(b) {
    b.classList.add('active');
    setTimeout(() => b.classList.remove('active'), 420);
  }

  toast(msg, ms = 2200) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  setPhotoMode(on) {
    this.el.ui.classList.toggle('photo', on);
  }

  // ---------------------------------------------------------------- loader
  progress(frac, status) {
    this.el.loaderFill.style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
    if (status) this.el.loaderStatus.textContent = status;
  }

  readyToStart(onStart) {
    this.el.startBtn.disabled = false;
    this.el.loaderStatus.textContent = 'Ready';
    this.el.startBtn.addEventListener('click', () => {
      this.el.loader.classList.add('done');
      this.el.ui.classList.remove('hidden');
      setTimeout(() => {
        this.el.loader.style.display = 'none';
      }, 900);
      onStart();
    });
  }
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
