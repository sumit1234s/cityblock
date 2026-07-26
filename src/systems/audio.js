/**
 * Everything you hear is synthesised in the browser: no audio files.
 *
 * Each era gets an ambient bed (traffic rumble, crowd babble, hiss, mains hum,
 * wind) run through a low-pass that models the era's "recording quality", a
 * period-appropriate music loop, and a set of random one-shot events —
 * streetcar bells and paperboys in 1945, arcade bleeps and car alarms in 1985,
 * servos and drone rotors in 2055.
 */

const A4 = 440;
const NOTE = (semisFromA4) => A4 * Math.pow(2, semisFromA4 / 12);

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.era = null;
    this.volume = 0.8;
    this.layers = {};
    this.musicTimer = null;
    this.eventTimer = null;
    this.step = 0;
    this.lastEvent = 0;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('WebAudio unavailable');
    const ctx = new AC();
    this.ctx = ctx;
    // resume() can hang on some platforms; don't let it block the scene
    await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 800))]);

    // ---- master chain ---------------------------------------------------
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp).connect(ctx.destination);

    // a cheap reverb so the street has some size
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.22;
    this.reverbGain.connect(this.master);
    this.reverb.connect(this.reverbGain);

    // ---- buses ----------------------------------------------------------
    this.eraFilter = ctx.createBiquadFilter();
    this.eraFilter.type = 'lowpass';
    this.eraFilter.frequency.value = 8000;
    this.eraFilter.Q.value = 0.4;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.9;
    this.bedGain.connect(this.eraFilter);
    this.eraFilter.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 6000;
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
    this.musicFilter.connect(this.reverb);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this.sfxGain.connect(this.reverb);

    // ---- noise sources --------------------------------------------------
    this.whiteBuf = this._noiseBuffer('white', 3);
    this.brownBuf = this._noiseBuffer('brown', 4);

    this.layers.rumble = this._noiseLayer(this.brownBuf, 'lowpass', 130, 0.9);
    this.layers.hiss = this._noiseLayer(this.whiteBuf, 'bandpass', 4200, 0.7);
    this.layers.crowd = this._noiseLayer(this.brownBuf, 'bandpass', 760, 1.4);
    this.layers.wind = this._noiseLayer(this.whiteBuf, 'bandpass', 420, 0.5);

    // slow amplitude wobble on the crowd so it sounds like people, not static
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(this.layers.crowd.gain.gain);
    lfo.start();
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 0.3;
    lfo2.connect(lfo2g).connect(this.layers.wind.gain.gain);
    lfo2.start();

    // mains / machine hum: a couple of detuned oscillators
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.bedGain);
    for (const f of [60, 121, 183]) {
      const o = ctx.createOscillator();
      o.type = f === 60 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f === 60 ? 0.5 : 0.12;
      o.connect(g).connect(this.humGain);
      o.start();
    }

    this.ready = true;
    if (this.era) this.setEra(this.era, 0.2);
    this._startSchedulers();
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < rate * 0.01 ? t * 100 : 1);
      }
    }
    return buf;
  }

  _noiseBuffer(kind, seconds) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      } else {
        d[i] = w * 0.6;
      }
    }
    return buf;
  }

  _noiseLayer(buffer, filterType, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(this.bedGain);
    src.start();
    return { src, filt, gain };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }
  setVolume(v) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.value = v;
  }

  /** Crossfade the bed + music to a new era. */
  setEra(era, fade = 1.2) {
    this.era = era;
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bed = era.audio.bed;
    const ramp = (param, value) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + fade);
    };
    ramp(this.layers.rumble.gain.gain, bed.rumble * 0.5);
    ramp(this.layers.hiss.gain.gain, bed.hiss * 0.1);
    ramp(this.layers.crowd.gain.gain, bed.crowd * 0.18);
    ramp(this.layers.wind.gain.gain, bed.wind * 0.09);
    ramp(this.humGain.gain, bed.hum * 0.035);
    ramp(this.eraFilter.frequency, era.audio.lowpass);
    ramp(this.musicGain.gain, 0.085);
    this.musicFilter.frequency.value = Math.min(era.audio.lowpass * 1.2, 12000);
    this.step = 0;
  }

  // ---------------------------------------------------------------------
  // small synth helpers
  // ---------------------------------------------------------------------
  _tone(opts) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const {
      freq = 440, type = 'sine', dur = 0.3, gain = 0.15, at = 0.005, dk = null,
      dest = this.sfxGain, detune = 0, pan = 0, filter = null, glideTo = null, delay = 0,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dk ?? dur));
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.freq ?? 1200, t0);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t0 + dur);
      f.Q.value = filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(g).connect(p).connect(dest);
    } else {
      node.connect(g).connect(dest);
    }
    o.start(t0);
    o.stop(t0 + (dk ?? dur) + 0.05);
    return o;
  }

  _noise(opts) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const { dur = 0.3, gain = 0.15, type = 'bandpass', freq = 1200, to = null, q = 1, pan = 0, delay = 0, at = 0.005, buf = 'white' } = opts;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf === 'brown' ? this.brownBuf : this.whiteBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    return src;
  }

  // ---------------------------------------------------------------------
  // one-shot library
  // ---------------------------------------------------------------------
  ui(kind = 'click') {
    if (kind === 'click') this._tone({ freq: 880, type: 'triangle', dur: 0.06, gain: 0.05, dest: this.sfxGain });
    else if (kind === 'hover') this._tone({ freq: 1400, type: 'sine', dur: 0.03, gain: 0.018 });
    else if (kind === 'select') {
      this._tone({ freq: 660, type: 'triangle', dur: 0.08, gain: 0.05 });
      this._tone({ freq: 990, type: 'triangle', dur: 0.12, gain: 0.04, delay: 0.06 });
    }
  }

  event(kind, pan = 0) {
    switch (kind) {
      case 'tramBell':
        for (let i = 0; i < 2; i++) {
          this._tone({ freq: 1180, type: 'sine', dur: 0.5, dk: 0.55, gain: 0.11, pan, delay: i * 0.22 });
          this._tone({ freq: 1770, type: 'sine', dur: 0.35, gain: 0.05, pan, delay: i * 0.22 });
          this._noise({ freq: 2400, q: 6, dur: 0.1, gain: 0.03, pan, delay: i * 0.22 });
        }
        break;
      case 'oldHorn':
        this._tone({ freq: 300, type: 'sawtooth', dur: 0.55, gain: 0.07, pan, filter: { freq: 1100, q: 3 } });
        this._tone({ freq: 226, type: 'square', dur: 0.55, gain: 0.045, pan });
        break;
      case 'chromeHorn':
        this._tone({ freq: 392, type: 'square', dur: 0.4, gain: 0.06, pan });
        this._tone({ freq: 494, type: 'square', dur: 0.4, gain: 0.05, pan });
        break;
      case 'whistle':
        this._tone({ freq: 2100, type: 'sine', dur: 0.22, gain: 0.05, pan, glideTo: 2600 });
        this._tone({ freq: 2650, type: 'sine', dur: 0.2, gain: 0.03, pan, delay: 0.24 });
        break;
      case 'paperboy':
        // a shouted vowel: filtered noise with a formant sweep
        this._noise({ freq: 700, to: 1500, q: 7, dur: 0.36, gain: 0.06, pan, buf: 'brown' });
        this._noise({ freq: 1100, to: 800, q: 9, dur: 0.3, gain: 0.035, pan, delay: 0.4, buf: 'brown' });
        break;
      case 'radio':
        // tinny AM band music fragment
        for (let i = 0; i < 5; i++) {
          this._tone({
            freq: NOTE([-9, -5, -2, 0, 3][i]) * 2, type: 'square', dur: 0.16, gain: 0.022,
            pan, delay: i * 0.17, filter: { type: 'bandpass', freq: 1800, q: 4 },
          });
        }
        this._noise({ freq: 2600, q: 1, dur: 0.9, gain: 0.012, pan });
        break;
      case 'v8Pass':
        this._noise({ freq: 90, to: 160, q: 2, dur: 1.6, gain: 0.09, pan: -0.8, buf: 'brown' });
        this._tone({ freq: 70, type: 'sawtooth', dur: 1.6, gain: 0.05, glideTo: 120, pan: 0.8, filter: { freq: 400, q: 2 } });
        break;
      case 'busAir':
        this._noise({ freq: 2800, to: 900, q: 1.2, dur: 0.75, gain: 0.07, pan });
        break;
      case 'jackhammer':
        for (let i = 0; i < 14; i++) this._noise({ freq: 260, q: 1.5, dur: 0.05, gain: 0.05, pan, delay: i * 0.075, buf: 'brown' });
        break;
      case 'transistorRadio':
        for (let i = 0; i < 6; i++) {
          this._tone({ freq: NOTE([0, 4, 7, 12, 7, 4][i]), type: 'square', dur: 0.14, gain: 0.02, pan, delay: i * 0.15, filter: { type: 'bandpass', freq: 2200, q: 5 } });
        }
        break;
      case 'arcade':
        for (let i = 0; i < 6; i++) {
          this._tone({ freq: 220 * (1 + i * 0.5), type: 'square', dur: 0.07, gain: 0.035, pan, delay: i * 0.09 });
        }
        this._tone({ freq: 1400, type: 'square', dur: 0.4, gain: 0.02, glideTo: 300, pan, delay: 0.6 });
        break;
      case 'carAlarm':
        for (let i = 0; i < 6; i++) {
          this._tone({ freq: 900, type: 'square', dur: 0.12, gain: 0.035, pan, delay: i * 0.18 });
          this._tone({ freq: 1200, type: 'square', dur: 0.12, gain: 0.03, pan, delay: i * 0.18 + 0.09 });
        }
        break;
      case 'sirenFar':
        for (let i = 0; i < 3; i++) {
          this._tone({ freq: 620, type: 'sine', dur: 0.9, gain: 0.028, glideTo: 900, pan, delay: i * 1.0, filter: { freq: 1400, q: 2 } });
        }
        break;
      case 'bassCar':
        for (let i = 0; i < 8; i++) this._tone({ freq: 55, type: 'sine', dur: 0.22, gain: 0.12, pan, delay: i * 0.28 });
        break;
      case 'payphone':
        for (let i = 0; i < 2; i++) {
          this._tone({ freq: 440, type: 'sine', dur: 0.9, gain: 0.045, pan, delay: i * 2.0 });
          this._tone({ freq: 480, type: 'sine', dur: 0.9, gain: 0.045, pan, delay: i * 2.0 });
        }
        break;
      case 'ringtone':
        // polyphonic-era MIDI ringtone
        [0, 4, 7, 12, 7, 4, 0].forEach((n, i) =>
          this._tone({ freq: NOTE(n + 12), type: 'square', dur: 0.12, gain: 0.03, pan, delay: i * 0.14 })
        );
        break;
      case 'skid':
        this._noise({ freq: 1800, to: 700, q: 2, dur: 0.5, gain: 0.06, pan });
        break;
      case 'trolleyBagRoll':
        for (let i = 0; i < 22; i++) this._noise({ freq: 3200, q: 3, dur: 0.03, gain: 0.014, pan, delay: i * 0.055 });
        break;
      case 'construction':
        this._noise({ freq: 420, q: 1, dur: 0.9, gain: 0.05, pan, buf: 'brown' });
        for (let i = 0; i < 3; i++) this._tone({ freq: 1000, type: 'square', dur: 0.25, gain: 0.03, pan, delay: 1.1 + i * 0.5 });
        break;
      case 'evWhine':
        this._tone({ freq: 620, type: 'triangle', dur: 1.5, gain: 0.035, glideTo: 1400, pan, filter: { freq: 3000, q: 3 } });
        this._noise({ freq: 500, to: 900, q: 1, dur: 1.5, gain: 0.03, pan, buf: 'brown' });
        break;
      case 'scooterBell':
        this._tone({ freq: 2100, type: 'sine', dur: 0.3, gain: 0.05, pan });
        this._tone({ freq: 3150, type: 'sine', dur: 0.22, gain: 0.025, pan });
        break;
      case 'notification':
        this._tone({ freq: NOTE(7), type: 'sine', dur: 0.12, gain: 0.04, pan });
        this._tone({ freq: NOTE(14), type: 'sine', dur: 0.2, gain: 0.035, pan, delay: 0.1 });
        break;
      case 'skate':
        for (let i = 0; i < 16; i++) this._noise({ freq: 2600, q: 4, dur: 0.04, gain: 0.02, pan, delay: i * 0.09 });
        break;
      case 'droneWhir':
        this._tone({ freq: 220, type: 'sawtooth', dur: 2.2, gain: 0.022, pan, filter: { type: 'bandpass', freq: 900, q: 6 } });
        this._noise({ freq: 1800, q: 3, dur: 2.2, gain: 0.02, pan });
        this._tone({ freq: 440, type: 'triangle', dur: 2.2, gain: 0.012, pan, detune: 12 });
        break;
      case 'podPass':
        this._tone({ freq: 180, type: 'sine', dur: 1.4, gain: 0.05, glideTo: 90, pan: -0.9, filter: { freq: 700, q: 2 } });
        this._noise({ freq: 3000, to: 1200, q: 2, dur: 1.4, gain: 0.025, pan: 0.9 });
        break;
      case 'holoChime':
        [0, 7, 12, 19].forEach((n, i) =>
          this._tone({ freq: NOTE(n + 12), type: 'sine', dur: 0.9, gain: 0.028, pan, delay: i * 0.09, filter: { freq: 5000, q: 1 } })
        );
        break;
      case 'servo':
        this._tone({ freq: 900, type: 'square', dur: 0.16, gain: 0.02, glideTo: 1500, pan, filter: { freq: 2600, q: 6 } });
        this._tone({ freq: 1500, type: 'square', dur: 0.14, gain: 0.016, glideTo: 800, pan, delay: 0.2 });
        break;
      case 'transitAnnounce':
        for (let i = 0; i < 3; i++) this._tone({ freq: NOTE([12, 16, 19][i]), type: 'sine', dur: 0.35, gain: 0.03, pan, delay: i * 0.22 });
        this._noise({ freq: 900, to: 1400, q: 8, dur: 0.7, gain: 0.02, pan, delay: 0.8, buf: 'brown' });
        break;
      default:
        break;
    }
  }

  /** The time-jump: a riser, a slam, and a tail. */
  timeWarp(direction = 1) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    // riser
    this._noise({ freq: 200, to: 6000, q: 1.2, dur: 0.85, gain: 0.14, at: 0.3 });
    this._tone({ freq: direction > 0 ? 110 : 440, type: 'sawtooth', dur: 0.85, gain: 0.07, glideTo: direction > 0 ? 880 : 110, filter: { freq: 600, to: 4000, q: 4 } });
    // slam
    this._noise({ freq: 90, q: 0.7, dur: 1.5, gain: 0.22, delay: 0.85, buf: 'brown' });
    this._tone({ freq: 70, type: 'sine', dur: 1.4, gain: 0.2, delay: 0.85, glideTo: 40 });
    // shimmer tail
    [0, 7, 12, 16, 19].forEach((n, i) =>
      this._tone({ freq: NOTE(n + 24), type: 'sine', dur: 1.6, gain: 0.022, delay: 0.9 + i * 0.05, filter: { freq: 6000, q: 1 } })
    );
    void t0;
  }

  // ---------------------------------------------------------------------
  // music + random events
  // ---------------------------------------------------------------------
  _startSchedulers() {
    const tick = () => {
      if (!this.ready || !this.era) return;
      this._musicStep();
    };
    this.musicTimer = setInterval(tick, 250);

    const evTick = () => {
      if (!this.ready || !this.era || this.muted) return;
      const evs = this.era.audio.events;
      if (Math.random() < 0.5) {
        const kind = evs[Math.floor(Math.random() * evs.length)];
        this.event(kind, Math.random() * 1.6 - 0.8);
      }
    };
    this.eventTimer = setInterval(evTick, 3400);
  }

  _musicStep() {
    const style = this.era.audio.music;
    const s = this.step++;
    const g = this.musicGain;
    const bar = Math.floor(s / 8) % 4;
    const beat = s % 8;
    const root = [0, -5, -7, -3][bar]; // I - IV - V - vi-ish

    const play = (semis, opts = {}) =>
      this._tone({ freq: NOTE(semis), dest: g, gain: 0.5, dur: 0.3, ...opts });

    switch (style) {
      case 'swing': {
        // walking bass + brushed snare + occasional muted brass
        if (beat % 2 === 0) play(root - 24, { type: 'triangle', dur: 0.4, gain: 0.5, filter: { freq: 400, q: 1 } });
        if (beat === 3 || beat === 7) this._noise({ freq: 5200, q: 0.9, dur: 0.1, gain: 0.02 });
        if (bar === 3 && beat === 6) {
          [0, 4, 7].forEach((n, i) => play(root + n, { type: 'sawtooth', dur: 0.5, gain: 0.22, delay: i * 0.02, filter: { freq: 1400, q: 2 } }));
        }
        if (beat === 0 && bar % 2 === 0) play(root + 12, { type: 'triangle', dur: 0.6, gain: 0.18, filter: { freq: 2200, q: 2 } });
        break;
      }
      case 'surf': {
        const mel = [0, 3, 5, 7, 5, 3, 0, -2];
        play(root - 12, { type: 'triangle', dur: 0.25, gain: 0.4 });
        play(root + mel[beat] + 12, { type: 'sawtooth', dur: 0.22, gain: 0.16, filter: { freq: 2600, to: 1200, q: 6 } });
        if (beat % 4 === 2) this._noise({ freq: 6200, q: 0.8, dur: 0.08, gain: 0.025 });
        break;
      }
      case 'synth': {
        const arp = [0, 7, 12, 15, 19, 15, 12, 7];
        play(root + arp[beat] + 12, { type: 'sawtooth', dur: 0.22, gain: 0.14, filter: { freq: 900 + (beat % 4) * 600, to: 500, q: 8 } });
        if (beat === 0 || beat === 4) this._tone({ freq: 55, type: 'sine', dur: 0.3, gain: 0.5, dest: g, glideTo: 40 });
        if (beat === 2 || beat === 6) this._noise({ freq: 4200, q: 1.2, dur: 0.12, gain: 0.03 });
        if (beat % 2 === 1) this._noise({ freq: 9000, q: 2, dur: 0.04, gain: 0.012 });
        break;
      }
      case 'indie': {
        const chord = [0, 4, 7, 11];
        if (beat % 4 === 0) {
          chord.forEach((n, i) => play(root + n + 12, { type: 'triangle', dur: 0.9, gain: 0.1, delay: i * 0.045, filter: { freq: 2600, q: 1 } }));
        }
        if (beat === 0) this._tone({ freq: 60, type: 'sine', dur: 0.25, gain: 0.42, dest: g });
        if (beat === 4) this._noise({ freq: 3400, q: 0.9, dur: 0.14, gain: 0.03 });
        break;
      }
      case 'lofi': {
        if (beat === 0 || beat === 5) {
          [0, 3, 7, 10].forEach((n, i) => play(root + n + 12, { type: 'sine', dur: 1.4, gain: 0.11, delay: i * 0.06, filter: { freq: 1600, q: 1 } }));
        }
        if (beat === 0) this._tone({ freq: 52, type: 'sine', dur: 0.4, gain: 0.4, dest: g });
        if (beat === 4) this._noise({ freq: 2600, q: 0.8, dur: 0.18, gain: 0.022 });
        // vinyl crackle
        if (Math.random() < 0.5) this._noise({ freq: 7000, q: 4, dur: 0.02, gain: 0.01 });
        break;
      }
      case 'ambient': {
        if (s % 16 === 0) {
          [0, 7, 14, 19].forEach((n, i) =>
            play(root + n, { type: 'sine', dur: 5.0, gain: 0.1, at: 1.4, delay: i * 0.35, filter: { freq: 1800, q: 1 } })
          );
        }
        if (s % 8 === 4) play(root + 26, { type: 'sine', dur: 2.6, gain: 0.035, at: 0.6, filter: { freq: 5200, q: 1 } });
        break;
      }
      default:
        break;
    }
  }

  /** Called every frame — used for vehicle pass-bys keyed to the camera. */
  update(dt, cameraPos, eraId) {
    if (!this.ready || this.muted) return;
    this.passTimer = (this.passTimer ?? 0) + dt;
    const interval = eraId === '2055' ? 4.5 : eraId === '1945' ? 5.5 : 3.2;
    if (this.passTimer > interval) {
      this.passTimer = 0;
      const kind =
        eraId === '1945' ? 'oldHorn' : eraId === '1965' ? 'v8Pass' : eraId === '1985' ? 'bassCar' : eraId === '2005' ? 'skid' : eraId === '2025' ? 'evWhine' : 'podPass';
      if (Math.random() < 0.6) this.event(kind, Math.random() * 1.8 - 0.9);
    }
  }

  dispose() {
    clearInterval(this.musicTimer);
    clearInterval(this.eventTimer);
    if (this.ctx) this.ctx.close();
  }
}
