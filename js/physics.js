// Collision world (AABBs + vertical cylinders + terrain heightfield) with a
// spatial hash, ray casting, and the character Mover shared by player & bots.
import * as THREE from 'three';
import { damp, clamp } from './noise.js';

export class CollisionWorld {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.colliders = [];
    this.stamp = 1;
    this.heightFn = () => 0;
    this.terrainMinX = 1e9;
    this.terrainMaxH = 0;
    this.surfaceFn = () => 'stone';
    this.bounds = { x0: -130, x1: 130, z0: -90, z1: 90 };
    this._tmp = [];
  }
  _k(ix, iz) { return (ix + 1024) * 4096 + (iz + 1024); }
  _insert(c) {
    const s = this.cell;
    const ix0 = Math.floor(c.x0 / s), ix1 = Math.floor(c.x1 / s), iz0 = Math.floor(c.z0 / s), iz1 = Math.floor(c.z1 / s);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = this._k(ix, iz);
      let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
      a.push(c);
    }
  }
  addBox(x0, y0, z0, x1, y1, z1, o = {}) {
    const c = {
      kind: 0, x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      mat: o.mat || 'stone', los: o.los !== false, solid: o.solid !== false, bullets: o.bullets !== false, cover: o.cover !== false, _s: 0, id: this.colliders.length,
    };
    this.colliders.push(c); this._insert(c); return c;
  }
  addCyl(x, z, r, y0, y1, o = {}) {
    const c = {
      kind: 1, cx: x, cz: z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0, y1,
      mat: o.mat || 'wood', los: o.los !== false, solid: o.solid !== false, bullets: o.bullets !== false, cover: o.cover !== false, _s: 0, id: this.colliders.length,
    };
    this.colliders.push(c); this._insert(c); return c;
  }
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const s = this.cell, st = ++this.stamp;
    const ix0 = Math.floor(x0 / s), ix1 = Math.floor(x1 / s), iz0 = Math.floor(z0 / s), iz1 = Math.floor(z1 / s);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const a = this.grid.get(this._k(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const c = a[i]; if (c._s !== st) { c._s = st; out.push(c); } }
    }
    return out;
  }
  terrainHeight(x, z) { return x < this.terrainMinX ? 0 : this.heightFn(x, z); }

  // Highest walkable surface under (x,z) at or below y+maxStep
  groundAt(x, z, y = 100, maxStep = 0.45) {
    let g = this.terrainHeight(x, z);
    const arr = this.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, this._tmp);
    for (const c of arr) {
      if (!c.solid) continue;
      if (c.kind === 0) { if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue; }
      else { const dx = x - c.cx, dz = z - c.cz; if (dx * dx + dz * dz > c.r * c.r) continue; }
      if (c.y1 <= y + maxStep && c.y1 > g) g = c.y1;
    }
    return g;
  }

  // ---------------- ray casting ----------------
  // returns { t, x, y, z, nx, ny, nz, collider } or null
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mode = 'bullets', ignoreTerrain = false) {
    const s = this.cell;
    let best = maxDist, hit = null;
    let ix = Math.floor(ox / s), iz = Math.floor(oz / s);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-9 ? Math.abs(s / dx) : 1e9;
    const tDZ = Math.abs(dz) > 1e-9 ? Math.abs(s / dz) : 1e9;
    let tMX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1) * s - ox : ox - ix * s) / Math.abs(dx)) : 1e9;
    let tMZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1) * s - oz : oz - iz * s) / Math.abs(dz)) : 1e9;
    const st = ++this.stamp;
    let tCell = 0;
    for (let iter = 0; iter < 200; iter++) {
      const a = this.grid.get(this._k(ix, iz));
      if (a) {
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c._s === st) continue; c._s = st;
          if (mode === 'los' ? !c.los : (mode === 'move' ? !c.solid : !c.bullets)) continue;
          const r = c.kind === 0 ? rayBox(ox, oy, oz, dx, dy, dz, c, best) : rayCyl(ox, oy, oz, dx, dy, dz, c, best);
          if (r >= 0 && r < best) { best = r; hit = c; }
        }
      }
      const tNext = Math.min(tMX, tMZ);
      if (best <= tNext || tNext > maxDist) break;
      tCell = tNext;
      if (tMX < tMZ) { tMX += tDX; ix += stepX; } else { tMZ += tDZ; iz += stepZ; }
    }
    let res = null;
    if (hit) {
      res = { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: _n.x, ny: _n.y, nz: _n.z, collider: hit };
      // recompute normal for the winning collider
      if (hit.kind === 0) rayBox(ox, oy, oz, dx, dy, dz, hit, best + 1e-4); else rayCyl(ox, oy, oz, dx, dy, dz, hit, best + 1e-4);
      res.nx = _n.x; res.ny = _n.y; res.nz = _n.z;
    }
    if (!ignoreTerrain) {
      const tt = this._rayTerrain(ox, oy, oz, dx, dy, dz, res ? res.t : maxDist);
      if (tt >= 0) {
        const x = ox + dx * tt, z = oz + dz * tt, e = 0.3;
        const hx = this.terrainHeight(x + e, z) - this.terrainHeight(x - e, z);
        const hz = this.terrainHeight(x, z + e) - this.terrainHeight(x, z - e);
        const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize();
        res = { t: tt, x, y: oy + dy * tt, z, nx: n.x, ny: n.y, nz: n.z, collider: null, terrain: true };
      }
    }
    return res;
  }

  _rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    // cheap rejection: town ground is flat at y=0
    const step = 0.6;
    let tPrev = 0;
    let prevAbove = oy - this.terrainHeight(ox, oz);
    if (prevAbove < 0) return -1;
    for (let t = step; t <= maxT + step; t += step) {
      const tc = Math.min(t, maxT);
      const y = oy + dy * tc;
      if (y > this.terrainMaxH + 0.5 && dy >= 0) return -1;
      const x = ox + dx * tc, z = oz + dz * tc;
      const above = y - this.terrainHeight(x, z);
      if (above < 0) {
        let a = tPrev, b = tc;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5;
          const ym = oy + dy * m, xm = ox + dx * m, zm = oz + dz * m;
          if (ym - this.terrainHeight(xm, zm) < 0) b = m; else a = m;
        }
        return (a + b) * 0.5;
      }
      tPrev = tc;
      if (tc >= maxT) break;
    }
    return -1;
  }

  // Is the segment a->b clear for line-of-sight?
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d, 'los');
    return !h;
  }
}

const _n = new THREE.Vector3();
function rayBox(ox, oy, oz, dx, dy, dz, b, tmax) {
  let tmin = 0, tm = tmax, ax = -1, sg = 0;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; }
  else { const inv = 1 / dx; let t1 = (b.x0 - ox) * inv, t2 = (b.x1 - ox) * inv, s = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; } if (t1 > tmin) { tmin = t1; ax = 0; sg = s; } if (t2 < tm) tm = t2; if (tmin > tm) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; }
  else { const inv = 1 / dy; let t1 = (b.y0 - oy) * inv, t2 = (b.y1 - oy) * inv, s = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; } if (t1 > tmin) { tmin = t1; ax = 1; sg = s; } if (t2 < tm) tm = t2; if (tmin > tm) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; }
  else { const inv = 1 / dz; let t1 = (b.z0 - oz) * inv, t2 = (b.z1 - oz) * inv, s = -1; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; } if (t1 > tmin) { tmin = t1; ax = 2; sg = s; } if (t2 < tm) tm = t2; if (tmin > tm) return -1; }
  if (ax === 0) _n.set(sg, 0, 0); else if (ax === 1) _n.set(0, sg, 0); else if (ax === 2) _n.set(0, 0, sg); else _n.set(-dx, -dy, -dz);
  return tmin;
}
function rayCyl(ox, oy, oz, dx, dy, dz, c, tmax) {
  const px = ox - c.cx, pz = oz - c.cz;
  const a = dx * dx + dz * dz, b = 2 * (px * dx + pz * dz), cc = px * px + pz * pz - c.r * c.r;
  let best = -1;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0 && cc < 0) t = 0;
      if (t >= 0 && t <= tmax) {
        const y = oy + dy * t;
        if (y >= c.y0 && y <= c.y1) { best = t; const hx = px + dx * t, hz = pz + dz * t; _n.set(hx / c.r, 0, hz / c.r); }
      }
    }
  }
  // caps
  if (Math.abs(dy) > 1e-9) {
    for (const yy of [c.y1, c.y0]) {
      const t = (yy - oy) / dy;
      if (t < 0 || t > tmax || (best >= 0 && t >= best)) continue;
      const hx = px + dx * t, hz = pz + dz * t;
      if (hx * hx + hz * hz <= c.r * c.r) { best = t; _n.set(0, yy === c.y1 ? 1 : -1, 0); }
    }
  }
  return best;
}

// ======================================================================
//  Mover: capsule-ish character physics used by both the player and bots
// ======================================================================
export const MOVE = {
  walk: 4.7, sprintMul: 1.35, crouchMul: 0.42, accel: 13, airAccel: 2.4, jumpV: 5.5, gravity: 19,
  step: 0.46, stepDown: 0.4, dodgeSpeed: 10.5, dodgeTime: 0.2, dodgeCD: 1.05, dodgeCost: 16,
  staminaDrain: 19, regenWalk: 6.5, regenStill: 17, jumpCost: 4, exhaustBelow: 6, recoverAt: 22,
};

export class Mover {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = 0.34; this.standH = 1.8; this.crouchH = 1.16; this.height = 1.8;
    this.crouch = 0; this.onGround = false;
    this.stamina = 100; this.exhausted = false; this.sprinting = false; this.regenDelay = 0;
    this.dodgeT = 0; this.dodgeCD = 0; this.dodgeDir = new THREE.Vector3(); this.dodging = false;
    this.landImpact = 0; this.airTime = 0; this.stepSmooth = 0; this.stepPhase = 0;
    this.speedMul = 1; this.yaw = 0;
    this.onStep = null; this.onLand = null; this.onJump = null; this.onDodge = null;
    this.hSpeed = 0;
    this._q = [];
  }
  get eyeHeight() { return this.height - 0.13; }

  teleport(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.crouch = 0; this.height = this.standH; this.onGround = false; this.stamina = 100; this.exhausted = false; }

  canStand() {
    const p = this.pos, r = this.radius * 0.95;
    const arr = this.world.query(p.x - r, p.z - r, p.x + r, p.z + r, this._q);
    for (const c of arr) {
      if (!c.solid) continue;
      if (c.y0 <= p.y + this.height - 0.02 || c.y0 >= p.y + this.standH) continue;
      if (circleOverlaps(c, p.x, p.z, r)) return false;
    }
    return true;
  }

  // inp: { fwd, right, jump, crouch, sprint, dodge, yaw }
  update(dt, inp) {
    this.yaw = inp.yaw;
    const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
    // forward = -Z rotated by yaw
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let wx = fx * inp.fwd + rx * inp.right, wz = fz * inp.fwd + rz * inp.right;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    // crouch
    const wantC = inp.crouch ? 1 : 0;
    let target = wantC;
    if (!wantC && this.crouch > 0.01 && !this.canStand()) target = this.crouch;
    this.crouch = damp(this.crouch, target, 11, dt);
    if (Math.abs(this.crouch - target) < 0.003) this.crouch = target;
    this.height = this.standH + (this.crouchH - this.standH) * this.crouch;

    // stamina & sprint
    const moving = wl > 0.1;
    const canSprint = inp.sprint && inp.fwd > 0.3 && this.crouch < 0.3 && !this.exhausted && this.dodgeT <= 0;
    this.sprinting = canSprint;
    if (this.sprinting) {
      this.stamina -= MOVE.staminaDrain * dt; this.regenDelay = 0.45;
      if (this.stamina < MOVE.exhaustBelow) { this.exhausted = true; this.sprinting = false; }
    } else {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) {
        const still = this.hSpeed < 0.35;
        this.stamina += (still ? MOVE.regenStill : MOVE.regenWalk) * dt;
      }
    }
    this.stamina = clamp(this.stamina, 0, 100);
    if (this.exhausted && this.stamina >= MOVE.recoverAt) this.exhausted = false;

    const speed = MOVE.walk * this.speedMul * (this.sprinting ? MOVE.sprintMul : 1) * (1 + (MOVE.crouchMul - 1) * this.crouch);

    // dodge
    this.dodgeCD -= dt;
    if (inp.dodge && this.dodgeCD <= 0 && this.onGround && this.stamina >= 8) {
      let dxd = wx, dzd = wz;
      if (Math.hypot(dxd, dzd) < 0.1) { const side = inp.dodgeSide || 1; dxd = rx * side; dzd = rz * side; }
      const l = Math.hypot(dxd, dzd); this.dodgeDir.set(dxd / l, 0, dzd / l);
      this.dodgeT = MOVE.dodgeTime; this.dodgeCD = MOVE.dodgeCD; this.stamina -= MOVE.dodgeCost; this.regenDelay = 0.6;
      this.vel.y = 1.9; this.onGround = false;
      if (this.onDodge) this.onDodge();
    }
    this.dodging = this.dodgeT > 0;

    if (this.dodgeT > 0) {
      const k = this.dodgeT / MOVE.dodgeTime;
      const sp = MOVE.dodgeSpeed * (0.45 + 0.55 * k);
      this.vel.x = this.dodgeDir.x * sp; this.vel.z = this.dodgeDir.z * sp;
      this.dodgeT -= dt;
    } else if (this.onGround) {
      const rate = moving ? MOVE.accel : MOVE.accel * 0.85;
      this.vel.x = damp(this.vel.x, wx * speed, rate, dt);
      this.vel.z = damp(this.vel.z, wz * speed, rate, dt);
    } else {
      const k = Math.min(1, MOVE.airAccel * dt);
      const tx = wx * speed, tz = wz * speed;
      // air control: only steer, don't brake hard
      if (moving) { this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k; }
    }

    if (inp.jump && this.onGround && this.dodgeT <= 0) {
      this.vel.y = MOVE.jumpV * (this.exhausted ? 0.85 : 1);
      this.onGround = false; this.stamina = Math.max(0, this.stamina - MOVE.jumpCost);
      if (this.onJump) this.onJump();
    }

    this.vel.y -= MOVE.gravity * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    const wasGround = this.onGround;
    const fallV = this.vel.y;
    const total = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
    const n = Math.min(10, Math.max(1, Math.ceil(total / 0.12)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this._substep(h);

    if (!wasGround && this.onGround) { this.landImpact = Math.min(1, -fallV / 12); if (this.onLand) this.onLand(-fallV); }
    if (!this.onGround) this.airTime += dt; else this.airTime = 0;

    this.hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.hSpeed > 0.5) {
      const stride = this.sprinting ? 2.1 : (this.crouch > 0.5 ? 1.2 : 1.65);
      const prev = Math.floor(this.stepPhase);
      this.stepPhase += this.hSpeed * dt / stride;
      if (Math.floor(this.stepPhase) !== prev && this.onStep) this.onStep(this.world.surfaceFn(this.pos.x, this.pos.z));
    }
    this.stepSmooth = damp(this.stepSmooth, 0, 14, dt);
    this.landImpact = damp(this.landImpact, 0, 6, dt);

    // world bounds
    const B = this.world.bounds;
    this.pos.x = clamp(this.pos.x, B.x0 + 0.5, B.x1 - 0.5);
    this.pos.z = clamp(this.pos.z, B.z0 + 0.5, B.z1 - 0.5);
  }

  _substep(h) {
    const p = this.pos, v = this.vel, r = this.radius, W = this.world;
    p.x += v.x * h; p.z += v.z * h;
    // horizontal resolve (2 passes for corners)
    for (let pass = 0; pass < 2; pass++) {
      const arr = W.query(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1, this._q);
      for (const c of arr) {
        if (!c.solid) continue;
        if (c.y1 <= p.y + MOVE.step || c.y0 >= p.y + this.height) continue;
        if (c.kind === 0) {
          const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
          let dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = r - d;
            p.x += nx * pen; p.z += nz * pen;
            const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= nx * vn; v.z -= nz * vn; }
          } else {
            // center inside box: push along smallest axis
            const l = p.x - c.x0, rr = c.x1 - p.x, b = p.z - c.z0, f = c.z1 - p.z;
            const m = Math.min(l, rr, b, f);
            if (m === l) { p.x = c.x0 - r; if (v.x > 0) v.x = 0; }
            else if (m === rr) { p.x = c.x1 + r; if (v.x < 0) v.x = 0; }
            else if (m === b) { p.z = c.z0 - r; if (v.z > 0) v.z = 0; }
            else { p.z = c.z1 + r; if (v.z < 0) v.z = 0; }
          }
        } else {
          let dx = p.x - c.cx, dz = p.z - c.cz;
          const rr = r + c.r, d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-5, nx = dx / d, nz = dz / d, pen = rr - d;
          p.x += nx * pen; p.z += nz * pen;
          const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= nx * vn; v.z -= nz * vn; }
        }
      }
    }
    // vertical
    const prevY = p.y;
    p.y += v.y * h;
    let ground = W.terrainHeight(p.x, p.z);
    const rs = r * 0.55;
    const arr = W.query(p.x - r, p.z - r, p.x + r, p.z + r, this._q);
    const reach = this.onGround ? MOVE.step : Math.max(0.06, prevY - p.y + 0.06);
    for (const c of arr) {
      if (!c.solid) continue;
      if (!circleOverlaps(c, p.x, p.z, rs)) continue;
      if (c.y1 <= Math.max(prevY, p.y) + reach && c.y1 > ground) ground = c.y1;
      // ceiling
      if (v.y > 0 && c.y0 > prevY + 0.2 && c.y0 < p.y + this.height && circleOverlaps(c, p.x, p.z, r * 0.8)) {
        p.y = c.y0 - this.height; v.y = 0;
      }
    }
    if (p.y <= ground) {
      if (this.onGround && ground - prevY > 0.05) this.stepSmooth -= (ground - prevY);
      p.y = ground; if (v.y < 0) v.y = 0; this.onGround = true;
    } else if (this.onGround && v.y <= 0.01 && p.y - ground < MOVE.stepDown) {
      this.stepSmooth += (p.y - ground);
      p.y = ground; v.y = 0;
    } else {
      this.onGround = false;
    }
  }
}

function circleOverlaps(c, x, z, r) {
  if (c.kind === 0) {
    const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
    const dx = x - cx, dz = z - cz; return dx * dx + dz * dz < r * r;
  }
  const dx = x - c.cx, dz = z - c.cz, rr = r + c.r; return dx * dx + dz * dz < rr * rr;
}
