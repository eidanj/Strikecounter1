// Keyboard / mouse input with pointer lock and double-tap detection

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // pressed this frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.lastTap = {};          // code -> time of last keydown
    this.doubleTaps = new Set();
    this.enabled = true;
    this.onLockChange = null;
    // touch controls write analog movement + toggles here (see touch.js)
    this.touchMode = false;
    this.touch = { fwd: 0, right: 0, sprint: false, ads: false, crouch: false };

    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      const now = performance.now();
      if (this.lastTap[e.code] && now - this.lastTap[e.code] < 280) this.doubleTaps.add(e.code);
      this.lastTap[e.code] = now;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!this.locked) return;
      // guard against the occasional giant jump some browsers emit on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    window.addEventListener('wheel', e => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = false; this.mouse.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  addLook(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }

  lock() {
    if (this.touchMode) { this.locked = true; return; } // no pointer lock on touch screens
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* needs a user gesture */ } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); });
    } catch (e) { plain(); }
  }
  unlock() {
    if (this.touchMode) { this.locked = false; this.touch.fwd = this.touch.right = 0; this.touch.sprint = false; this.mouse.left = false; return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  up(code) { return this.released.has(code); }
  doubleTap(code) { return this.doubleTaps.has(code); }

  endFrame() {
    this.pressed.clear(); this.released.clear(); this.doubleTaps.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftPressed = false; this.mouse.rightPressed = false;
  }
}
