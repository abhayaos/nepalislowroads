// Procedural Web Audio: subtle bus engine hum + Dashain festive layer
// (temple bells, dhol-like groove, mountain wind). No audio files needed.
// Must be started from a user gesture (Begin button) for autoplay policy.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.festive = false;
    this.started = false;
  }

  start(festive) {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch {
        return; // no Web Audio — stay silent
      }
      this.buildGraph();
      this.startWind();
      this.startEngineOsc();
      this.bellLoop();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.started = true;
    this.setFestive(festive);
  }

  buildGraph() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(c.destination);

    this.festiveGain = c.createGain();
    this.festiveGain.gain.value = 0;
    this.festiveGain.connect(this.master);

    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    // shared noise buffer (wind + drum slaps)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------- festive layer ----------
  setFestive(v) {
    this.festive = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.festiveGain.gain.cancelScheduledValues(t);
    this.festiveGain.gain.setTargetAtTime(v ? 0.5 : 0, t, 0.8);
    if (v) {
      this.startDrums();
      this.strikeBell();
    } else {
      this.stopDrums();
    }
  }

  startWind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.05;
    // slow swell LFO for a living breeze
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.025;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.festiveGain);
    src.start();
    lfo.start();
  }

  strikeBell() {
    if (!this.ctx || !this.festive) return;
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
    const base = scale[Math.floor(Math.random() * scale.length)];
    const partials = [
      { r: 1, g: 0.5, d: 3.5 },
      { r: 2.01, g: 0.22, d: 2.4 },
      { r: 2.74, g: 0.12, d: 1.6 },
      { r: 3.76, g: 0.07, d: 1.1 },
    ];
    for (const p of partials) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * p.r;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16 * p.g, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
      o.connect(g);
      g.connect(this.festiveGain);
      o.start(t);
      o.stop(t + p.d + 0.1);
    }
  }

  bellLoop() {
    const tick = () => {
      if (this.festive && Math.random() < 0.45) this.strikeBell();
      this.bellTimer = setTimeout(tick, 5000 + Math.random() * 9000);
    };
    this.bellTimer = setTimeout(tick, 2500);
  }

  playStep(s, t) {
    // 16-step folk groove: low dhol strokes + high slaps
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 10 || s === 12 || s === 14) this.thump(t);
    if (s === 2 || s === 5 || s === 7 || s === 11 || s === 13 || s === 15) this.slap(t);
    if (s === 0) this.slap(t + 0.0, 0.4); // soft keep-alive tick
  }

  thump(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g);
    g.connect(this.festiveGain);
    o.start(t);
    o.stop(t + 0.35);
  }

  slap(t, vol = 1) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.16 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.festiveGain);
    src.start(t, Math.random() * 1.2, 0.15);
  }

  startDrums() {
    if (this.drumTimer || !this.ctx) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.drumTimer = setInterval(() => {
      const SPB = 60 / 96 / 2; // 8th notes @ 96bpm
      while (this.nextT < this.ctx.currentTime + 0.25) {
        if (this.festive) this.playStep(this.step, this.nextT);
        this.nextT += SPB;
        this.step = (this.step + 1) % 16;
      }
    }, 80);
  }

  stopDrums() {
    if (this.drumTimer) {
      clearInterval(this.drumTimer);
      this.drumTimer = null;
    }
  }

  // ---------- engine hum (always, subtle) ----------
  startEngineOsc() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 44;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc.start();
  }

  setEngine(speed) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const a = Math.min(Math.abs(speed) / 30, 1);
    this.engineOsc.frequency.setTargetAtTime(42 + a * 68, t, 0.15);
    this.engineGain.gain.setTargetAtTime(this.started ? 0.028 + a * 0.035 : 0, t, 0.2);
  }

  // ---------- air horn (H) ----------
  horn() {
    if (!this.ctx || !this.started) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (const f of [369.99, 440.0]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
      g.gain.setValueAtTime(0.2, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  // ---------- mute ----------
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }
}
