// Fully synthesized audio (no sound files): spatial gunshots with a town
// reverb tail, surface footsteps, reload clicks, UI and ambience.
const SHOTS = {
  pistol: { crack: 2600, body: 900, thump: 140, dur: 0.12, gain: 0.7, tail: 0.25 },
  deagle: { crack: 1800, body: 600, thump: 90, dur: 0.22, gain: 1.0, tail: 0.45 },
  smg: { crack: 3000, body: 1100, thump: 160, dur: 0.08, gain: 0.55, tail: 0.18 },
  rifle: { crack: 2400, body: 800, thump: 110, dur: 0.13, gain: 0.8, tail: 0.35 },
  rifleHeavy: { crack: 1900, body: 650, thump: 85, dur: 0.16, gain: 0.9, tail: 0.4 },
  shotgun: { crack: 1300, body: 420, thump: 70, dur: 0.3, gain: 1.1, tail: 0.55 },
  sniper: { crack: 2200, body: 500, thump: 60, dur: 0.35, gain: 1.25, tail: 0.8 },
};

export class GameAudio {
  constructor() { this.ctx = null; this.ready = false; this.vol = 0.8; this.ambVol = 0.5; this.lastStep = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = this.ambVol; this.amb.connect(this.master);
    // reverb
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(1.8, 2.6);
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // white noise buffer
    const len = c.sampleRate * 2; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    this.ready = true;
    this._startAmbience();
  }
  _impulse(dur, decay) {
    const c = this.ctx, len = c.sampleRate * dur, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < c.sampleRate * 0.02 ? 0.3 : 1); }
    return b;
  }
  setVolume(v, amb) { this.vol = v; this.ambVol = amb; if (this.ctx) { this.master.gain.value = v; this.amb.gain.value = amb; } }

  setListener(pos, fwd) {
    if (!this.ready) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    this.listenerPos = pos;
  }

  _out(pos, ref = 5) {
    if (!pos) return this.sfx;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 400;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }
  _noise(dest, t, dur, type, freq, q, gain, attack = 0.002, rate = 1) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return g;
  }
  _tone(dest, t, f0, f1, dur, type, gain) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }

  shot(type, pos, local) {
    if (!this.ready) return;
    const S = SHOTS[type] || SHOTS.rifle, c = this.ctx, t = c.currentTime;
    const out = local ? this.sfx : this._out(pos, 8);
    const vari = 0.92 + Math.random() * 0.16;
    const send = c.createGain(); send.gain.value = local ? 0.5 : 0.8; send.connect(this.verb);
    const bus = c.createGain(); bus.gain.value = S.gain * (local ? 0.75 : 1); bus.connect(out); bus.connect(send);
    this._noise(bus, t, S.dur * 0.6, 'highpass', S.crack * vari, 0.7, 0.9, 0.001, 1.2);
    this._noise(bus, t, S.dur * 1.6, 'lowpass', S.body * vari, 0.8, 1.0, 0.002);
    this._tone(bus, t, S.thump * 2 * vari, S.thump * 0.4, S.dur * 1.2, 'sine', 0.9);
    this._noise(bus, t + 0.02, S.tail, 'lowpass', 380, 0.5, 0.25, 0.02);
    if (!local && this.listenerPos && pos) {
      const d = Math.hypot(pos.x - this.listenerPos.x, pos.z - this.listenerPos.z);
      if (d > 60) this._noise(this.verb, t + d / 340, 0.5, 'lowpass', 300, 0.5, 0.2, 0.05);
    }
  }
  dryFire() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(this.sfx, t, 0.03, 'bandpass', 3500, 4, 0.4); }
  reload(kind, dur) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.sfx;
    const click = (dt, f, g = 0.35, d = 0.04) => this._noise(o, t + dt, d, 'bandpass', f, 6, g);
    if (kind === 'shell') { click(0.05, 2200, 0.3); click(0.18, 1500, 0.35, 0.06); return; }
    click(dur * 0.12, 2400); click(dur * 0.3, 1200, 0.3, 0.08); // mag out
    click(dur * 0.55, 1800, 0.45, 0.05); click(dur * 0.62, 900, 0.4, 0.06); // mag in
    click(dur * 0.85, 3000, 0.4); click(dur * 0.9, 1600, 0.45, 0.07); // rack
  }
  bolt() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(this.sfx, t + 0.3, 0.06, 'bandpass', 1800, 5, 0.4); this._noise(this.sfx, t + 0.55, 0.08, 'bandpass', 1200, 5, 0.45); }
  pump() { if (!this.ready) return; const t = this.ctx.currentTime; this._noise(this.sfx, t + 0.2, 0.09, 'bandpass', 900, 3, 0.5); this._noise(this.sfx, t + 0.38, 0.08, 'bandpass', 1300, 3, 0.5); }
  footstep(surface, pos, local, soft) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, out = local ? this.sfx : this._out(pos, 3);
    const g = (soft ? 0.12 : 0.3) * (local ? 0.7 : 1);
    if (surface === 'grass') { this._noise(out, t, 0.12, 'bandpass', 2400 + Math.random() * 800, 0.8, g * 0.8); this._noise(out, t, 0.06, 'lowpass', 300, 1, g * 0.5); }
    else if (surface === 'dirt') { this._noise(out, t, 0.1, 'bandpass', 1500 + Math.random() * 500, 1, g * 0.9); this._noise(out, t, 0.06, 'lowpass', 250, 1, g * 0.6); }
    else { this._noise(out, t, 0.07, 'bandpass', 900 + Math.random() * 400, 2, g); this._tone(out, t, 160, 70, 0.06, 'sine', g * 0.8); this._noise(out, t, 0.03, 'highpass', 4000, 1, g * 0.4); }
  }
  whoosh(heavy) { if (!this.ready) return; const c = this.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(heavy ? 400 : 800, t); f.frequency.exponentialRampToValueAtTime(heavy ? 1500 : 3500, t + 0.18); const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 0.3); }
  meleeHit(pos, flesh) { if (!this.ready) return; const t = this.ctx.currentTime, o = this._out(pos, 4); if (flesh) { this._tone(o, t, 180, 60, 0.15, 'sine', 0.8); this._noise(o, t, 0.08, 'lowpass', 800, 1, 0.6); } else { this._noise(o, t, 0.1, 'bandpass', 2600, 3, 0.6); this._tone(o, t, 900, 500, 0.12, 'triangle', 0.25); } }
  hitmarker(head) { if (!this.ready) return; const t = this.ctx.currentTime; if (head) { this._tone(this.sfx, t, 2400, 2300, 0.25, 'sine', 0.35); this._tone(this.sfx, t, 3600, 3500, 0.18, 'sine', 0.15); } else this._noise(this.sfx, t, 0.04, 'bandpass', 3200, 5, 0.35); }
  killDing() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.sfx, t, 1320, 1320, 0.12, 'triangle', 0.3); this._tone(this.sfx, t + 0.09, 1760, 1760, 0.2, 'triangle', 0.3); }
  hurt() { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.sfx, t, 220, 90, 0.18, 'sawtooth', 0.12); this._noise(this.sfx, t, 0.1, 'lowpass', 500, 1, 0.4); }
  poof(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this._out(pos, 6); this._noise(o, t, 0.35, 'lowpass', 1400, 0.7, 0.7, 0.01); this._tone(o, t, 420, 140, 0.3, 'triangle', 0.35); }
  deathTone(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this._out(pos, 6); this._tone(o, t, 330, 180, 0.35, 'square', 0.08); }
  jump(local) { if (!this.ready || !local) return; const t = this.ctx.currentTime; this._noise(this.sfx, t, 0.08, 'lowpass', 600, 1, 0.15); }
  land(v, surface) { if (!this.ready) return; const t = this.ctx.currentTime, g = Math.min(0.6, v / 14); this._noise(this.sfx, t, 0.12, surface === 'stone' ? 'bandpass' : 'lowpass', surface === 'stone' ? 700 : 400, 1, g); this._tone(this.sfx, t, 120, 50, 0.12, 'sine', g); }
  dodge() { this.whoosh(true); }
  ui(kind = 'click') { if (!this.ready) return; const t = this.ctx.currentTime; if (kind === 'click') this._tone(this.sfx, t, 900, 1200, 0.06, 'triangle', 0.15); else if (kind === 'hover') this._tone(this.sfx, t, 600, 700, 0.04, 'sine', 0.06); }
  beep(hi) { if (!this.ready) return; const t = this.ctx.currentTime; this._tone(this.sfx, t, hi ? 1320 : 880, hi ? 1320 : 880, 0.15, 'square', 0.08); }
  roundStart() { if (!this.ready) return; const t = this.ctx.currentTime; [523, 659, 784].forEach((f, i) => this._tone(this.sfx, t + i * 0.12, f, f, 0.3, 'square', 0.07)); }
  roundEnd(win) { if (!this.ready) return; const t = this.ctx.currentTime; const seq = win ? [523, 659, 784, 1046] : [392, 349, 311, 262]; seq.forEach((f, i) => this._tone(this.sfx, t + i * 0.15, f, f, 0.35, 'triangle', 0.15)); }

  _startAmbience() {
    const c = this.ctx;
    // gentle wind
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 450;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    s.connect(f); f.connect(g); g.connect(this.amb); s.start();
    // fountain trickle (gain set by distance)
    const fs = c.createBufferSource(); fs.buffer = this.noiseBuf; fs.loop = true;
    const ff = c.createBiquadFilter(); ff.type = 'bandpass'; ff.frequency.value = 2200; ff.Q.value = 0.6;
    this.fountainGain = c.createGain(); this.fountainGain.gain.value = 0;
    fs.connect(ff); ff.connect(this.fountainGain); this.fountainGain.connect(this.amb); fs.start();
    this.nextBird = 0;
  }
  ambience(dt, pos) {
    if (!this.ready || !pos) return;
    const c = this.ctx, t = c.currentTime;
    const fd = Math.hypot(pos.x + 62, pos.z);
    this.fountainGain.gain.setTargetAtTime(Math.max(0, 0.16 * (1 - fd / 28)), t, 0.3);
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      const nature = pos.x > -10;
      this.nextBird = (nature ? 1.2 : 3.5) + Math.random() * 4;
      const f0 = 2500 + Math.random() * 2500, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const o = c.createOscillator(); o.type = 'sine';
        const tt = t + i * 0.11;
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.4), tt + 0.06);
        const g = c.createGain(); g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.09);
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        o.connect(g); if (p) { p.pan.value = Math.random() * 2 - 1; g.connect(p); p.connect(this.amb); } else g.connect(this.amb);
        o.start(tt); o.stop(tt + 0.12);
      }
    }
  }
}
