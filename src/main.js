import * as THREE from 'three';
import { ERAS, ERA_IDS } from './config/eras.js';
import { buildEra } from './world/era.js';
import { Environment, LightPool } from './world/environment.js';
import { PostFX } from './systems/postfx.js';
import { CameraRig, VIEWPOINTS } from './systems/controls.js';
import { Inspector } from './systems/inspector.js';
import { SoundEngine } from './systems/audio.js';
import { TimeTransition } from './systems/transition.js';
import { setTextureQuality } from './lib/textures.js';
import { UI } from './ui.js';
import { clamp } from './lib/util.js';

const canvas = document.getElementById('scene');

// ---------------------------------------------------------------------------
// renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
  preserveDrawingBuffer: true, // so 'P' can save a frame
});
renderer.info.autoReset = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.85));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
setTextureQuality(Math.min(4, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.12, 900);
camera.position.set(...VIEWPOINTS.wide.pos);

const environment = new Environment(scene, renderer);
const lightPool = new LightPool(scene, 14);
const postfx = new PostFX(renderer, scene, camera);
const rig = new CameraRig(camera, canvas);
const audio = new SoundEngine();
const inspector = new Inspector(camera, canvas, document.getElementById('tooltip'));
const transition = new TimeTransition({ scene, environment, postfx, rig, audio, lightPool, renderer });

const eraCache = new Map();
let current = null;
let currentIndex = 0;
let started = false;
let quality = 2;
let photoMode = false;
let pendingCapture = false;

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const ui = new UI({
  onSelect: (i) => selectEra(i),
  onHover: () => audio.ui('hover'),
  onView: (key) => {
    rig.cinematic = false;
    setOptionActive('cinematic', false);
    rig.goTo(key, 1.6);
    audio.ui('click');
    ui.toast(`View · ${VIEWPOINTS[key].name}`, 1400);
  },
  onMode: (mode) => {
    rig.setMode(mode);
    ui.setCrosshair(mode !== 'orbit');
    audio.ui('click');
    ui.toast(
      mode === 'orbit'
        ? 'Orbit — drag to look, scroll to zoom, right-drag to pan'
        : mode === 'walk'
        ? 'Walk — WASD to move, mouse to look, Esc to release the cursor'
        : 'Fly — WASD + Q/E, hold Shift to sprint, Esc to release',
      3600
    );
  },
  onToggle: (which) => {
    audio.ui('click');
    if (which === 'audio') {
      audio.setMuted(!audio.muted);
      ui.toast(audio.muted ? 'Sound off' : 'Sound on', 1200);
      return !audio.muted;
    }
    if (which === 'cinematic') {
      rig.cinematic = !rig.cinematic;
      if (rig.cinematic) rig.cinematicT = Math.random() * 40;
      ui.toast(rig.cinematic ? 'Cinematic camera' : 'Manual camera', 1400);
      return rig.cinematic;
    }
    if (which === 'labels') {
      inspector.setEnabled(!inspector.enabled);
      ui.toast(inspector.enabled ? 'Hover labels on' : 'Hover labels off', 1200);
      return inspector.enabled;
    }
    if (which === 'quality') {
      quality = (quality + 2) % 3; // 2 -> 1 -> 0 -> 2
      applyQuality();
      const name = ['Low', 'Med', 'High'][quality];
      ui.toast(`Quality ${name}`, 1200);
      return name;
    }
    return false;
  },
});

function setOptionActive(name, on) {
  const b = document.querySelector(`#option-buttons [data-toggle="${name}"]`);
  if (b) b.classList.toggle('active', on);
}

function applyQuality() {
  const pr = quality === 2 ? Math.min(window.devicePixelRatio, 1.85) : quality === 1 ? 1.25 : 0.85;
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = quality > 0;
  environment.sun.castShadow = quality > 0 && environment.shadowStrength > 0.12;
  environment.sun.shadow.mapSize.set(quality === 2 ? 2048 : 1024, quality === 2 ? 2048 : 1024);
  if (environment.sun.shadow.map) {
    environment.sun.shadow.map.dispose();
    environment.sun.shadow.map = null;
  }
  postfx.setQuality(quality);
  postfx.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// era management
// ---------------------------------------------------------------------------
function getEra(index) {
  const id = ERA_IDS[index];
  let e = eraCache.get(id);
  if (!e) {
    e = buildEra(id);
    scene.add(e.root);
    eraCache.set(id, e);
  }
  return e;
}

let queuedIndex = null;

function selectEra(index, instant = false) {
  index = clamp(index, 0, ERAS.length - 1);
  // a jump while another is in flight is remembered rather than dropped
  if (transition.running) {
    queuedIndex = index;
    return;
  }
  if (current && index === currentIndex) return;
  const dir = index > currentIndex ? 1 : -1;
  const id = ERA_IDS[index];
  const needsBuild = !eraCache.has(id);
  currentIndex = index;
  ui.setEra(index);
  ui.setBusy(true);
  audio.ui('select');

  const go = () => {
    const next = getEra(index);
    if (instant || !current) {
      if (current) current.root.visible = false;
      next.root.visible = true;
      current = next;
      environment.apply(next.era);
      postfx.applyGrade(next.era);
      lightPool.setSources(next.lightSources);
      audio.setEra(next.era, 0.6);
      ui.setBusy(false);
    } else {
      transition.start(current, next, dir, () => {
        current = next;
        ui.setBusy(false);
        ui.toast(`${next.era.year} — ${next.era.subtitle}`, 3000);
        if (queuedIndex !== null) {
          const q = queuedIndex;
          queuedIndex = null;
          if (q !== currentIndex) selectEra(q);
        }
      });
      current = current; // keep old until complete
      transitionFrom = next;
    }
  };

  if (needsBuild) {
    ui.toast(`Rebuilding the block for ${ERAS[index].year}…`, 1600);
    // let the toast paint before the (synchronous) build blocks the thread
    requestAnimationFrame(() => requestAnimationFrame(go));
  } else {
    go();
  }
}
let transitionFrom = null;

// ---------------------------------------------------------------------------
// keyboard
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (!started) return;
  const k = e.key;
  if (k >= '1' && k <= '6') selectEra(Number(k) - 1);
  else if (k === 'ArrowRight') selectEra(currentIndex + 1);
  else if (k === 'ArrowLeft') selectEra(currentIndex - 1);
  else if (k === 'h' || k === 'H') {
    photoMode = !photoMode;
    ui.setPhotoMode(photoMode);
  } else if (k === 'p' || k === 'P') {
    pendingCapture = true;
  } else if (k === 'c' || k === 'C') {
    rig.cinematic = !rig.cinematic;
    setOptionActive('cinematic', rig.cinematic);
  } else if (k === 'm' || k === 'M') {
    audio.setMuted(!audio.muted);
    setOptionActive('audio', !audio.muted);
  } else if (k === 'Escape') {
    if (document.pointerLockElement) document.exitPointerLock();
  }
});

canvas.addEventListener('mousedown', () => {
  if (rig.mode !== 'orbit') rig.requestLock();
});

rig.onExitLock = () => {
  ui.toast('Cursor released — click the scene to look around again', 2200);
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
  ui.setThumb(currentIndex);
});

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
async function boot() {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  ui.setEra(0);
  ui.progress(0.08, 'Pouring the pavement…');
  await frame();

  ui.progress(0.3, 'Laying brick, cutting stone…');
  await frame();
  const first = getEra(0);
  current = first;
  first.root.visible = true;

  ui.progress(0.72, 'Painting signs by hand…');
  await frame();
  environment.apply(first.era);
  postfx.applyGrade(first.era);
  lightPool.setSources(first.lightSources);
  // pre-warm shaders so the first frames don't hitch
  renderer.compile(scene, camera);

  ui.progress(0.94, 'Winding the clocks…');
  await frame();
  ui.progress(1, 'Ready');

  ui.readyToStart(() => {
    started = true;
    // audio must not be able to stall the intro: fire and forget
    audio
      .start()
      .then(() => audio.setEra(first.era, 0.9))
      .catch(() => ui.toast('Audio unavailable in this browser', 2500));
    rig.flyTo(
      new THREE.Vector3(...VIEWPOINTS.street.pos),
      new THREE.Vector3(...VIEWPOINTS.street.target),
      3.4
    );
    setTimeout(() => ui.toast('Drag the timeline, or press 1–6 to jump between years', 4200), 1400);
  });

  animate();
}

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let fps = 60;
let statTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05); // animation stays stable on slow frames
  const time = clock.elapsedTime;
  renderer.info.reset();

  rig.update(dt, raw);
  environment.update(dt, time);
  // the time jump runs on wall-clock time so it always takes ~2 s, even if the
  // machine can only manage a handful of frames while both eras are resident
  transition.update(Math.min(raw, 0.4));

  // the incoming era animates during the sweep too
  if (transition.running && transitionFrom && transitionFrom !== current) {
    transitionFrom.update(dt, time, camera);
  }
  if (current) current.update(dt, time, camera);

  lightPool.update(dt, camera.position);
  if (started) {
    audio.update(dt, camera.position, current ? current.id : '1945');
    inspector.update(dt, current ? current.root : null, !!document.pointerLockElement);
  }

  postfx.render(dt);

  if (pendingCapture) {
    pendingCapture = false;
    captureFrame();
  }

  fps = fps * 0.92 + (1 / Math.max(dt, 0.0001)) * 0.08;
  statTimer += dt;
  if (statTimer > 0.5) {
    statTimer = 0;
    const info = renderer.info.render;
    ui.setStats(
      `${Math.round(fps)} fps\n${info.calls} draws\n${(info.triangles / 1000).toFixed(0)}k tris\n` +
        `${current ? current.stats.meshes : 0} objects\n${eraCache.size}/6 eras built`
    );
  }
}

function captureFrame() {
  try {
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `chrono-block-${current ? current.era.year : 'view'}.png`;
    a.click();
    ui.toast('Frame saved', 1600);
  } catch (err) {
    ui.toast('Could not save the frame', 1600);
  }
}

// a small hook for debugging / automated capture
window.__chrono = {
  get current() {
    return current;
  },
  get index() {
    return currentIndex;
  },
  eraCache,
  transition,
  rig,
  environment,
  postfx,
  audio,
  select: selectEra,
  debug() {
    return {
      index: currentIndex,
      current: current && current.id,
      running: transition.running,
      t: transition.active ? transition.active.t : null,
      visible: [...eraCache.values()].map((e) => `${e.id}:${e.root.visible}`),
    };
  },
};

boot();
