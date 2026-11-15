// Touch controls for phones/tablets: a floating move stick (push to the edge
// to sprint), drag-to-look on the right, one big fire button (drag it to aim
// while shooting) with five icon buttons in an arc, and four mini icons top-right.
// Everything feeds the same Input object the keyboard/mouse use.
import { settings } from './settings.js';

const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const ICONS = {
  fire: svg('<path d="M12 2.6c2.3 2 3.3 4.6 3.3 7.2v7.4H8.7V9.8c0-2.6 1-5.2 3.3-7.2z" fill="currentColor" stroke="none"/><rect x="8.2" y="18.6" width="7.6" height="2.7" rx="0.7" fill="currentColor" stroke="none"/>'),
  aim: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
  jump: svg('<path d="M12 3.5l7.5 7.5h-4.3v8.5H8.8V11H4.5z" fill="currentColor" stroke="none"/>'),
  crouch: svg('<path d="M12 3.5v9.5M7.3 8.6l4.7 4.7 4.7-4.7M5 19.5h14"/>'),
  reload: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 3.8v5h-5"/>'),
  dodge: svg('<path d="M2 8h4.5M1 12h5.5M2 16h4.5"/><path d="M9.5 6l6 6-6 6M14.5 6l6 6-6 6"/>'),
  swap: svg('<path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5"/><path d="M20 16H6M9.5 12.5L6 16l3.5 3.5"/>'),
  camera: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.6-4 3.8-6 7.5-6s6.9 2 7.5 6"/>'),
  loadout: svg('<path d="M5.5 8h13l-1.2 12.5H6.7z"/><path d="M9 8V6.6a3 3 0 0 1 6 0V8"/>'),
  pause: svg('<path d="M8.5 5v14M15.5 5v14"/>'),
};

export function prefersTouch() {
  try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { return 'ontouchstart' in window; }
}

const ARC = [
  { a: 'aim', deg: 90 }, { a: 'reload', deg: 112.5 }, { a: 'jump', deg: 135 }, { a: 'dodge', deg: 157.5 }, { a: 'crouch', deg: 180 },
];
const MINI = ['pause', 'swap', 'camera', 'loadout'];
const LABEL = { fire: 'Fire', aim: 'Aim', reload: 'Reload', jump: 'Jump', dodge: 'Dodge', crouch: 'Crouch', swap: 'Switch weapon', camera: 'Toggle camera', loadout: 'Loadout', pause: 'Pause' };

export class TouchControls {
  constructor(app) {
    this.app = app; this.input = app.input;
    this.enabled = false; this.visible = false;
    this.ptr = new Map();
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this._build();
    this.refreshEnabled();
    window.addEventListener('resize', () => this.layout());
  }

  refreshEnabled() {
    const m = settings.touchControls || 'auto';
    this.enabled = m === 'on' || (m === 'auto' && prefersTouch());
    this.input.touchMode = this.enabled;
    document.body.classList.toggle('touch', this.enabled);
    if (!this.enabled) this.setVisible(false);
  }

  _build() {
    const root = this.root = document.createElement('div');
    root.id = 'touch'; root.className = 'hidden';
    root.innerHTML = `
      <div class="tz tz-move"></div><div class="tz tz-look"></div>
      <div id="joy"><div class="ring"></div><div class="knob"></div><div class="sprintTag">${ICONS.dodge}<span>SPRINT</span></div></div>
      <button class="tb fire" data-a="fire" aria-label="${LABEL.fire}">${ICONS.fire}</button>
      ${ARC.map(b => `<button class="tb" data-a="${b.a}" aria-label="${LABEL[b.a]}">${ICONS[b.a]}</button>`).join('')}
      <div class="tmini">${MINI.map(a => `<button class="tm" data-a="${a}" aria-label="${LABEL[a]}">${ICONS[a]}</button>`).join('')}</div>
      <button class="tscore" data-a="scores" aria-label="Scoreboard"></button>`;
    document.body.appendChild(root);
    this.el = { joy: root.querySelector('#joy'), knob: root.querySelector('#joy .knob'), btn: {} };
    root.querySelectorAll('[data-a]').forEach(b => { this.el.btn[b.dataset.a] = b; });
    root.querySelector('.tz-move').addEventListener('pointerdown', (e) => this._down(e, 'move'));
    root.querySelector('.tz-look').addEventListener('pointerdown', (e) => this._down(e, 'look'));
    root.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', (e) => this._down(e, b.dataset.a)));
    window.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.layout();
  }

  layout() {
    const w = innerWidth, h = innerHeight;
    const s = Math.max(0.78, Math.min(1.15, Math.min(w, h) / 420));
    this.scale = s;
    const fire = 84 * s, small = 52 * s, R = 128 * s;
    const cx = 26 * s + fire / 2, cy = 30 * s + fire / 2; // fire centre, measured from bottom-right
    const f = this.el.btn.fire;
    Object.assign(f.style, { width: fire + 'px', height: fire + 'px', right: (cx - fire / 2) + 'px', bottom: (cy - fire / 2) + 'px' });
    for (const b of ARC) {
      const t = b.deg * Math.PI / 180, el = this.el.btn[b.a];
      const x = cx - R * Math.cos(t), y = cy + R * Math.sin(t);
      Object.assign(el.style, { width: small + 'px', height: small + 'px', right: (x - small / 2) + 'px', bottom: (y - small / 2) + 'px' });
    }
    this.joyR = 58 * s;
    this.joyHome = { x: 40 * s + this.joyR, y: h - (34 * s + this.joyR) };
    this.el.joy.style.setProperty('--r', this.joyR + 'px');
    if (this.joy.id === null) this._placeJoy(this.joyHome.x, this.joyHome.y, 0, 0, false);
  }

  setVisible(v) {
    v = v && this.enabled;
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) this.releaseAll();
  }

  releaseAll() {
    for (const [, p] of this.ptr) this._release(p);
    this.ptr.clear();
    const T = this.input.touch;
    T.fwd = T.right = 0; T.sprint = false;
    this.input.mouse.left = false;
    this.input.keys.delete('Tab');
  }

  _placeJoy(x, y, kx, ky, active) {
    const j = this.el.joy;
    j.style.left = x + 'px'; j.style.top = y + 'px';
    this.el.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    j.classList.toggle('active', active);
  }

  _down(e, role) {
    if (e.pointerType === 'mouse' && !this.enabled) return;
    e.preventDefault(); e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const I = this.input, T = I.touch, app = this.app, P = app.game.playerActor;
    const p = { id: e.pointerId, role, x: e.clientX, y: e.clientY, btn: this.el.btn[role] };
    if (p.btn) p.btn.classList.add('down');
    switch (role) {
      case 'move': {
        if (this.joy.id !== null) return;
        const r = this.joyR;
        const x = Math.max(r + 10, Math.min(innerWidth * 0.45, e.clientX)), y = Math.max(r + 60, Math.min(innerHeight - r - 10, e.clientY));
        this.joy = { id: e.pointerId, ox: x, oy: y };
        this._placeJoy(x, y, 0, 0, true);
        this._joyUpdate(e.clientX, e.clientY);
        break;
      }
      case 'look': break;
      case 'fire': I.mouse.left = true; I.mouse.leftPressed = true; break;
      case 'aim':
        if (P && P.w.def.scope) I.mouse.rightPressed = true; else T.ads = !T.ads;
        break;
      case 'reload': I.pressed.add('KeyR'); break;
      case 'jump': I.pressed.add('Space'); break;
      case 'dodge': I.pressed.add('KeyQ'); break;
      case 'crouch': T.crouch = !T.crouch; break;
      case 'swap': I.mouse.wheel += 1; T.ads = false; break;
      case 'camera': I.pressed.add('KeyC'); break;
      case 'loadout': I.pressed.add('KeyB'); break;
      case 'pause': if (p.btn) p.btn.classList.remove('down'); if (app.state === 'playing') { this.releaseAll(); app.pause(); } return;
      case 'scores': this.scoresOn = !this.scoresOn; break;
    }
    this.ptr.set(e.pointerId, p);
  }

  _joyUpdate(x, y) {
    const r = this.joyR, T = this.input.touch;
    let dx = x - this.joy.ox, dy = y - this.joy.oy;
    const d = Math.hypot(dx, dy);
    const k = d > r ? r / d : 1;
    const kx = dx * k, ky = dy * k;
    T.right = kx / r; T.fwd = -ky / r;
    // dead zone
    const m = Math.hypot(T.right, T.fwd);
    if (m < 0.12) { T.right = T.fwd = 0; }
    // push to the edge, roughly forward, to sprint
    const ang = Math.atan2(T.right, T.fwd);
    T.sprint = m > 0.92 && Math.abs(ang) < 0.75;
    if (T.sprint) { T.ads = false; T.crouch = false; }
    this._placeJoy(this.joy.ox, this.joy.oy, kx, ky, true);
    this.el.joy.classList.toggle('sprint', T.sprint);
  }

  _move(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.role === 'move') { this._joyUpdate(e.clientX, e.clientY); return; }
    if (p.role === 'look' || p.role === 'fire') {
      const k = 2.3 * (settings.touchSens || 1);
      this.input.addLook((e.clientX - p.x) * k, (e.clientY - p.y) * k);
      p.x = e.clientX; p.y = e.clientY;
    }
  }

  _up(e) {
    const p = this.ptr.get(e.pointerId);
    if (!p) return;
    this._release(p);
    this.ptr.delete(e.pointerId);
  }

  _release(p) {
    if (p.btn) p.btn.classList.remove('down');
    const T = this.input.touch;
    if (p.role === 'move') {
      this.joy.id = null; T.fwd = T.right = 0; T.sprint = false;
      this.el.joy.classList.remove('sprint');
      this._placeJoy(this.joyHome.x, this.joyHome.y, 0, 0, false);
    } else if (p.role === 'fire') this.input.mouse.left = false;
  }

  // per-frame visual state
  update(game) {
    if (!this.visible || !game || !game.playerActor) return;
    const P = game.playerActor, w = P.w, T = this.input.touch, b = this.el.btn;
    const gun = w.isGun;
    b.aim.classList.toggle('on', gun && (w.def.scope ? w.zoom > 0 : T.ads));
    b.aim.classList.toggle('off', !gun);
    b.reload.classList.toggle('off', !gun || w.ammo >= (w.def.mag || 0) || w.reserve <= 0);
    b.crouch.classList.toggle('on', T.crouch);
    b.dodge.classList.toggle('off', P.mover.dodgeCD > 0);
    b.camera.classList.toggle('on', game.player.thirdPerson);
    b.loadout.classList.toggle('off', !this.app.canBuyNow());
    if (T.ads && !gun) T.ads = false;
    this.app.hud.scores(!!this.scoresOn, game);
  }
}
