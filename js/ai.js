// Bot brain. Drives an Actor through the same input struct the player uses
// (move, jump, crouch, sprint, dodge) so bots obey identical physics/stamina.
//  - Perception: vision cone + line-of-sight to head/chest; awareness builds
//    over time (slowly for crouched, quiet targets) -> crouching behind cover hides you.
//  - Focus: once in a firefight a bot stays on its current target.
//  - Tactics: strafing, crouch-spraying, jumps, dodges when hit, cover when hurt/reloading.
import * as THREE from 'three';
import { DIFFICULTY, settings } from './settings.js';
import { tryFire, startReload } from './combat.js';
import { angleDiff, clamp, damp } from './noise.js';
import { STRATEGIC } from './world/world.js';

const V3 = THREE.Vector3;
// roughly normal-distributed random in about [-1, 1]
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
const IDEAL = { rifle: 22, smg: 12, shotgun: 6, sniper: 45, pistol: 14, melee: 1.5 };

export class BotBrain {
  constructor(actor, game) {
    this.a = actor; this.game = game; actor.brain = this;
    this.diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    this.recoilComp = this.diff.recoilComp;
    this.errGoal = new THREE.Vector2(); this.settleT = 0; this.settleNeed = 1.5; this.settleWait = 0;
    this.state = 'roam';
    this.path = null; this.pathIdx = 0; this.goal = null; this.needPath = false; this.pathTimer = 0;
    this.aware = new Map();
    this.target = null; this.targetSince = 0; this.lastCombat = -99; this.reactionUntil = 0; this.aimHead = false;
    this.percT = Math.random() * 0.2; this.thinkT = Math.random() * 0.3;
    this.strafeDir = 0; this.strafeT = 0; this.crouchSpray = false; this.crouchT = 0;
    this.burstLeft = 0; this.burstPause = 0; this.semiT = 0;
    this.err = new THREE.Vector2(); this.errT = 0;
    this.stuckT = 0; this.lastPos = new V3(); this.progressT = 0;
    this.coverPt = null; this.coverUntil = 0; this.lastCoverTry = -99;
    this.investigate = null; this.lookYaw = actor.yaw; this.lookPitch = 0; this.scanT = 0;
    this.dodgeReq = false; this.jumpReq = false;
    this.goalsDone = 0;
  }

  rec(e) {
    let r = this.aware.get(e);
    if (!r) { r = { aw: 0, lastSeen: -99, lastPos: new V3(), visible: false }; this.aware.set(e, r); }
    return r;
  }

  reset() { this.aware.clear(); this.target = null; this.path = null; this.goal = null; this.state = 'roam'; this.investigate = null; this.coverPt = null; this.goalsDone = 0; }

  // -------- events --------
  onThreat(src, amt) {
    if (!src || !src.alive) return;
    const r = this.rec(src);
    r.aw = Math.max(r.aw, 0.45 + amt);
    r.lastPos.copy(src.mover.pos).add(new V3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
    r.lastSeen = Math.max(r.lastSeen, this.game.time - 1.5);
    if (!this.target) { this.investigate = r.lastPos.clone(); this.lookAtPos(src.mover.pos); }
  }
  onDamaged(src) {
    if (!src) return;
    const now = this.game.time, r = this.rec(src);
    r.aw = 1.3; r.lastPos.copy(src.mover.pos); r.lastSeen = now - 0.2;
    this.lastCombat = now;
    if (!this.target || !this.target.alive || now - this.lastCombat > 4) { this.setTarget(src); }
    if (Math.random() < this.diff.dodgeChance) { this.dodgeReq = true; }
    // getting hit throws their aim off (humans flinch)
    const fl = THREE.MathUtils.degToRad(this.diff.flinch);
    this.err.x += gauss() * fl; this.err.y += gauss() * fl * 0.7; this.errGoal.copy(this.err);
    this.settleT = Math.min(this.settleT, this.settleNeed * 0.4);
    if (!this.target || this.target === src) this.lookAtPos(src.mover.pos);
  }
  onNoise(pos, src) {
    if (this.target || !src) return;
    const d = pos.distanceTo(this.a.mover.pos);
    if (Math.random() < 0.7 && d > 3) { this.investigate = pos.clone().add(new V3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)); this.lookAtPos(pos); this.rec(src).aw = Math.max(this.rec(src).aw, 0.3); }
  }
  lookAtPos(p) { const e = this.a.eye(new V3()); this.lookYaw = Math.atan2(-(p.x - e.x), -(p.z - e.z)); }
  setTarget(t) {
    if (t === this.target) return;
    const D = this.diff;
    this.target = t; this.targetSince = this.game.time;
    this.reactionUntil = this.game.time + THREE.MathUtils.lerp(D.reaction[0], D.reaction[1], Math.random());
    this.aimHead = Math.random() < D.headChance;
    this.flick();
    this.settleT = 0; this.settleWait = 0;
    this.settleNeed = THREE.MathUtils.lerp(D.sniperSettle[0], D.sniperSettle[1], Math.random());
  }
  // first snap toward a target lands roughly, then settles (no instant lock-on)
  flick(scale = 1) {
    const e = THREE.MathUtils.degToRad(this.diff.aimError) * scale;
    this.err.set((Math.random() < 0.5 ? -1 : 1) * e * (1.2 + Math.random() * 1.3), gauss() * e * 0.8);
    this.errGoal.copy(this.err);
  }

  // -------- main --------
  update(dt) {
    const a = this.a;
    if (!a.alive) return;
    this.percT -= dt; if (this.percT <= 0) { const p = 0.12 + Math.random() * 0.06; this.perceive(p); this.percT = p; }
    this.thinkT -= dt; if (this.thinkT <= 0) { this.think(); this.thinkT = 0.18 + Math.random() * 0.1; }
    this.move(dt);
    this.aim(dt);
    this.fight(dt);
  }

  perceive(dtp) {
    const a = this.a, g = this.game, col = g.world.col, now = g.time;
    const eye = a.eye(new V3());
    for (const e of g.actors) {
      if (e === a || !e.alive || g.isTeammate(a, e)) continue;
      const r = this.rec(e);
      r.visible = false;
      const ec = e.center(new V3());
      const d = eye.distanceTo(ec);
      if (d < 125) {
        const yawTo = Math.atan2(-(ec.x - eye.x), -(ec.z - eye.z));
        const ang = Math.abs(angleDiff(a.yaw, yawTo));
        const loud = now - e.lastFired < 0.4;
        const close = d < 3.2 && !(e.mover.crouch > 0.5 && e.mover.hSpeed < 2.5);
        if (ang < 1.2 || close || (loud && d < 40)) {
          const h = e.head(new V3());
          const vis = col.lineOfSight(eye.x, eye.y, eye.z, h.x, h.y, h.z) || col.lineOfSight(eye.x, eye.y, eye.z, ec.x, ec.y, ec.z);
          if (vis) {
            if (e === this.target && now - r.lastSeen > 1.2) {
              // target popped back into view: re-react and re-aim like a person would
              const D = this.diff;
              this.reactionUntil = Math.max(this.reactionUntil, now + THREE.MathUtils.lerp(D.reaction[0], D.reaction[1], Math.random()) * 0.65);
              this.targetSince = now - 0.2; this.flick(0.7); this.settleT = 0;
            }
            r.visible = true; r.lastSeen = now; r.lastPos.copy(e.mover.pos);
            let rate = d < 12 ? 4.5 : d < 35 ? 2.0 : d < 70 ? 1.0 : 0.55;
            if (e.mover.crouch > 0.5 && now - e.lastFired > 1.5) rate *= 0.32;
            if (e.mover.hSpeed > 3.2) rate *= 1.3;
            if (ang > 0.6) rate *= 0.5;
            if (loud) rate *= 2.2;
            rate *= this.diff.spotRate;
            r.aw = Math.min(1.6, r.aw + rate * dtp);
          }
        }
      }
      if (!r.visible) r.aw = Math.max(0, r.aw - 0.22 * dtp);
    }
  }

  think() {
    const a = this.a, g = this.game, now = g.time;
    // ---- target selection with firefight focus ----
    let t = this.target;
    if (t) {
      const r = this.rec(t);
      const lost = !t.alive || (!r.visible && now - r.lastSeen > 3.5);
      if (lost) { if (t.alive) this.investigate = r.lastPos.clone(); this.target = null; t = null; }
    }
    const engaged = t && (now - this.lastCombat < 4) && (this.rec(t).visible || now - this.rec(t).lastSeen < 3);
    if (!engaged) {
      let best = null, bs = 1e9;
      for (const [e, r] of this.aware) {
        if (!e.alive || r.aw < 1 || !r.visible) continue;
        const d = e.mover.pos.distanceTo(a.mover.pos);
        let s = d;
        if (e.lastAttacker === a) s -= 6;
        if (a.lastAttacker === e && now - a.lastHurt < 3) s -= 25;
        if (s < bs) { bs = s; best = e; }
      }
      if (best) this.setTarget(best);
    }
    t = this.target;
    // ---- state ----
    const w = a.w;
    if (t) {
      const r = this.rec(t);
      const d = t.mover.pos.distanceTo(a.mover.pos);
      const wantsCover = (a.health < 40 && now - this.lastCoverTry > 6) || (w.isGun && w.ammo === 0 && w.reserve > 0 && d > 6);
      if (this.state === 'cover' && this.coverPt && now < this.coverUntil) {
        // stay in cover; peek when ready
        if (w.reloading <= 0 && (now > this.coverUntil - 0.3)) this.state = 'engage';
      } else if (wantsCover && r.visible) {
        this.lastCoverTry = now;
        const cp = this.findCover(t);
        if (cp) { this.coverPt = cp; this.state = 'cover'; this.coverUntil = now + 1.6 + Math.random() * 1.8; this.setGoal(cp.x, cp.z); if (w.isGun && w.ammo < w.def.mag) startReload(a, g); }
        else this.state = 'engage';
      } else if (r.visible) {
        this.state = 'engage';
        if (!this.coverPt) this.path = null;
      } else {
        this.state = 'chase';
        if (!this.goal || this.goal.distanceTo(r.lastPos) > 3) this.setGoal(r.lastPos.x, r.lastPos.z);
      }
      // weapon choice
      if (w.isGun && w.ammo === 0 && w.reserve === 0) a.equip(a.weapons[2].ammo + a.weapons[2].reserve > 0 && a.slot !== 2 ? 2 : 3);
      if (a.slot === 1 && w.ammo === 0 && w.reloading > 0 && d < 9 && a.weapons[2].ammo > 0) a.equip(2);
    } else {
      this.coverPt = null;
      if (this.investigate) {
        this.state = 'investigate';
        if (!this.goal || this.goal.distanceTo(this.investigate) > 2) this.setGoal(this.investigate.x, this.investigate.z);
        if (a.mover.pos.distanceTo(this.investigate) < 2.5 || (this.path && this.pathIdx >= this.path.length)) { this.investigate = null; this.goal = null; }
      } else {
        this.state = 'roam';
        if (!this.goal || (this.path && this.pathIdx >= this.path.length) || a.mover.pos.distanceTo(this.goal) < 3) this.pickRoamGoal();
      }
      // housekeeping
      if (a.slot !== 1 && (a.weapons[1].ammo + a.weapons[1].reserve) > 0) a.equip(1);
      if (w.isGun && w.ammo < w.def.mag * 0.6 && w.reserve > 0 && w.reloading <= 0) startReload(a, g);
    }
    if (this.state === 'engage' && t) {
      // strafing & stance decisions
      this.strafeT -= 0.25;
      if (this.strafeT <= 0) {
        const d = t.mover.pos.distanceTo(a.mover.pos);
        const r = Math.random();
        this.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
        this.strafeT = 0.35 + Math.random() * 0.9;
        this.crouchSpray = d > 14 && Math.random() < 0.3 && w.def.kind !== 'shotgun';
        if (d < 16 && Math.random() < 0.08) this.jumpReq = true;
        if (Math.random() < this.diff.dodgeChance * 0.25 && now - t.lastFired < 0.6) this.dodgeReq = true;
      }
    }
  }

  setGoal(x, z) { this.goal = new V3(x, 0, z); this.needPath = true; }

  pickRoamGoal() {
    const g = this.game, a = this.a;
    let pts = STRATEGIC;
    if (g.mode === 'tdm') {
      const prog = Math.min(1, (g.time - g.roundStart) / 45);
      const sign = a.team === 'T' ? 1 : -1; // T start east (x>0), CT start west
      pts = STRATEGIC.filter(p => {
        const depth = sign * p.x; // positive = own side
        return depth < 90 - prog * 140 && depth > -90 + (1 - prog) * 30 - 20;
      });
      if (!pts.length) pts = STRATEGIC;
    } else if (Math.random() < 0.4) {
      const sp = g.world.spawnPoints.FFA[Math.floor(Math.random() * g.world.spawnPoints.FFA.length)];
      this.setGoal(sp.x, sp.z); return;
    }
    let p = pts[Math.floor(Math.random() * pts.length)];
    if (this.goal && Math.hypot(p.x - this.goal.x, p.z - this.goal.z) < 4) p = pts[Math.floor(Math.random() * pts.length)];
    this.setGoal(p.x + (Math.random() - 0.5) * 6, p.z + (Math.random() - 0.5) * 6);
  }

  findCover(threat) {
    const g = this.game, nav = g.nav, col = g.world.col, a = this.a;
    const te = threat.eye(new V3());
    const [ix, iz] = nav.toCell(a.mover.pos.x, a.mover.pos.z);
    let best = null, checks = 0;
    for (let r = 1; r <= 14 && checks < 50; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if ((dx + dz) & 1) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 1 || jz < 1 || jx >= nav.w - 1 || jz >= nav.h - 1) continue;
        const i = nav.idx(jx, jz);
        if (!nav.cover[i]) continue;
        const [cx, cz] = nav.center(i);
        const gy = nav.gy[i];
        if (Math.hypot(cx - te.x, cz - te.z) < 6) continue;
        checks++;
        if (col.lineOfSight(te.x, te.y, te.z, cx, gy + 1.0, cz)) continue;
        const score = r + (Math.hypot(cx - te.x, cz - te.z) < 10 ? 6 : 0);
        if (!best || score < best.score) best = { x: cx, z: cz, score };
      }
      if (best && r > best.score - 2) break;
    }
    return best;
  }

  move(dt) {
    const a = this.a, g = this.game, now = g.time, inp = a.input;
    let wx = 0, wz = 0, sprint = false, crouch = false;
    const p = a.mover.pos;
    const t = this.target;
    // path requests (budgeted)
    if (this.needPath && this.goal && g.pathBudget > 0) {
      g.pathBudget--; this.needPath = false;
      this.path = g.nav.findPath(p.x, p.z, this.goal.x, this.goal.z); this.pathIdx = 0; this.progressT = 0;
      if (!this.path) { this.goal = null; this.investigate = null; }
    }
    const follow = () => {
      if (!this.path || this.pathIdx >= this.path.length) return false;
      const wp = this.path[this.pathIdx];
      const dx = wp[0] - p.x, dz = wp[1] - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8) { this.pathIdx++; return follow(); }
      wx = dx / d; wz = dz / d;
      return true;
    };
    if (this.state === 'engage' && t) {
      const tp = t.mover.pos, dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      const ideal = IDEAL[a.w.def.kind] || 18;
      let adv = 0;
      if (d > ideal + 12) adv = 1; else if (d < ideal * 0.4 && a.w.def.kind !== 'shotgun' && a.w.def.kind !== 'melee') adv = -0.6;
      if (a.w.def.kind === 'melee') adv = 1;
      if (adv > 0 && this.path && this.pathIdx < this.path.length) { follow(); }
      else {
        wx = nx * adv + (-nz) * this.strafeDir; wz = nz * adv + nx * this.strafeDir;
      }
      if (adv > 0 && (!this.path || this.pathIdx >= this.path.length) && now - this.pathTimer > 1.5) { this.pathTimer = now; this.setGoal(tp.x, tp.z); }
      const firingStill = this.crouchSpray && a.w.reloading <= 0;
      if (firingStill) { wx *= 0.0; wz *= 0.0; crouch = true; }
      if (a.w.def.kind === 'sniper' && now - a.lastHurt > 1.5 && d > 10) { wx = 0; wz = 0; }
      // counter-strafe: stop moving while a burst is going at range (like real players)
      if (this.burstLeft > 0 && this.burstPause <= 0 && d > 9 && a.w.def.kind !== 'shotgun' && now >= this.reactionUntil) { wx = 0; wz = 0; }
    } else if (this.state === 'cover' && this.coverPt) {
      const dx = this.coverPt.x - p.x, dz = this.coverPt.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.7) { if (!follow()) { wx = dx / d; wz = dz / d; } sprint = d > 4; }
      else crouch = true;
    } else {
      const moving = follow();
      if (moving) sprint = this.state !== 'investigate' && a.mover.stamina > 35 && !t && this.path && (this.path.length - this.pathIdx > 1 || (this.goal && this.goal.distanceTo(p) > 15));
      if (this.state === 'investigate' && this.investigate && this.investigate.distanceTo(p) < 12) crouch = Math.random() < 0.02 ? !this.crouchT : !!this.crouchT;
    }
    // separation from nearby actors
    for (const o of g.actors) {
      if (o === a || !o.alive) continue;
      const dx = p.x - o.mover.pos.x, dz = p.z - o.mover.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.6 && d2 > 1e-4) { const d = Math.sqrt(d2); wx += dx / d * (1.3 - d) * 1.5; wz += dz / d * (1.3 - d) * 1.5; }
    }
    // stuck detection
    const want = Math.hypot(wx, wz) > 0.3;
    if (want) {
      this.progressT += dt;
      if (this.progressT > 0.9) {
        const moved = p.distanceTo(this.lastPos);
        if (moved < 0.35) { this.stuckT++; if (this.stuckT === 1) this.jumpReq = true; else if (this.stuckT >= 2) { this.stuckT = 0; if (this.goal) this.setGoal(this.goal.x + (Math.random() - 0.5) * 6, this.goal.z + (Math.random() - 0.5) * 6); else this.pickRoamGoal(); } }
        else this.stuckT = 0;
        this.lastPos.copy(p); this.progressT = 0;
      }
    }
    // convert world wish -> local input relative to current yaw
    const y = a.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    inp.fwd = wx * fx + wz * fz; inp.right = wx * rx + wz * rz;
    inp.sprint = sprint && inp.fwd > 0.5 && !t;
    inp.crouch = crouch;
    inp.jump = this.jumpReq; this.jumpReq = false;
    inp.dodge = this.dodgeReq; if (this.dodgeReq) inp.dodgeSide = Math.random() < 0.5 ? -1 : 1; this.dodgeReq = false;
    inp.yaw = a.yaw;
  }

  aim(dt) {
    const a = this.a, g = this.game, now = g.time, t = this.target;
    let dy = this.lookYaw, dp = 0;
    const eye = a.eye(new V3());
    if (t && (this.state === 'engage' || (this.state === 'cover' && this.rec(t).visible))) {
      const r = this.rec(t);
      const tp = this.aimHead ? t.head(new V3()) : t.center(new V3()).add(new V3(0, 0.1, 0));
      if (!r.visible) tp.copy(r.lastPos).setY(r.lastPos.y + 1.3);
      const d = eye.distanceTo(tp);
      // lead slightly for movement
      tp.addScaledVector(t.mover.vel, Math.min(0.15, d / 600));
      dy = Math.atan2(-(tp.x - eye.x), -(tp.z - eye.z));
      dp = Math.atan2(tp.y - eye.y, Math.hypot(tp.x - eye.x, tp.z - eye.z));
      // human aim: wobble that shrinks while tracking, worse when moving/jumping
      this.errT -= dt;
      if (this.errT <= 0) {
        this.errT = 0.09 + Math.random() * 0.06;
        const D = this.diff, w = a.w;
        const track = Math.exp(-(now - this.targetSince) * D.trackGain);
        let deg = D.errorFloor + (D.aimError - D.errorFloor) * track;
        if (a.mover.hSpeed > 1.5) deg *= 1.6;
        if (t.mover.hSpeed > 2.5) deg *= 1.35;
        if (!a.mover.onGround) deg *= 2.2;
        if (w.def.kind === 'sniper') deg *= this.settleT > this.settleNeed * 0.7 ? 0.85 : 1.7;
        const mag = THREE.MathUtils.degToRad(deg);
        this.errGoal.set(gauss() * mag, gauss() * mag * 0.6);
      }
      this.err.lerp(this.errGoal, 1 - Math.exp(-5 * dt));
      dy += this.err.x; dp += this.err.y;
      this.lookYaw = dy;
    } else {
      // look where we're going, glance around occasionally
      if (this.path && this.pathIdx < this.path.length && a.mover.hSpeed > 0.5) {
        const wp = this.path[this.pathIdx];
        dy = Math.atan2(-(wp[0] - a.mover.pos.x), -(wp[1] - a.mover.pos.z));
        this.scanT -= dt;
        if (this.scanT < 0) { this.scanT = 2 + Math.random() * 3; this.scanOff = (Math.random() - 0.5) * 1.6; }
        if (this.scanT < 0.8) dy += this.scanOff || 0;
        this.lookYaw = dy;
      }
      dp = 0;
    }
    const ts = this.diff.turnSpeed;
    const dYaw = angleDiff(a.yaw, dy), dPit = dp - a.pitch;
    // ease in: fast when far off, slowing down as the crosshair nears the target
    const ease = (d) => clamp(d * Math.min(1, 7 * dt), -ts * dt, ts * dt);
    a.yaw += ease(dYaw);
    a.pitch += ease(dPit);
    a.pitch = clamp(a.pitch, -1.2, 1.2);
    this.aimErrAngle = Math.abs(angleDiff(a.yaw, dy - this.err.x)) + Math.abs(a.pitch - (dp - this.err.y));
  }

  fight(dt) {
    const a = this.a, g = this.game, now = g.time, t = this.target, w = a.w, D = this.diff;
    a.ads = 0;
    if (!t || this.state !== 'engage') { this.settleT = 0; return; }
    const r = this.rec(t);
    if (!r.visible) { this.settleT = Math.max(0, this.settleT - dt * 2); return; }
    const d = a.mover.pos.distanceTo(t.mover.pos);
    if (w.def.kind === 'melee') { if (d < 2.2 && now >= this.reactionUntil) tryFire(a, g, true, true); return; }
    if (w.ammo === 0) { if (w.reserve > 0) startReload(a, g); return; }
    const tol = Math.atan2(0.4, d) * 1.4 + 0.006;
    if (w.def.kind === 'sniper') {
      // a human sniper stops, scopes in, steadies, then takes the shot
      if (a.mover.hSpeed > 0.9 || !a.mover.onGround) { this.settleT = Math.max(0, this.settleT - dt * 3); return; }
      this.settleT += dt;
      a.ads = this.settleT > 0.35 ? 1 : 0;
      if (now < this.reactionUntil || this.settleT < this.settleNeed || w.reloading > 0 || now < w.next) return;
      if (this.aimErrAngle > tol) { this.settleWait += dt; if (this.settleWait < 1.0 + Math.random() * 0.8) return; }
      if (tryFire(a, g, true, true)) {
        this.lastCombat = now; this.settleWait = 0;
        this.settleT = 0; this.settleNeed = THREE.MathUtils.lerp(D.sniperSettle[0], D.sniperSettle[1], Math.random()) * 0.75;
        this.flick(0.5); // recoil throws the scope off target
      }
      return;
    }
    if (now < this.reactionUntil) return;
    if (this.aimErrAngle > tol + D.slack) return;
    if (w.def.auto) {
      if (this.burstPause > 0) { this.burstPause -= dt; return; }
      if (this.burstLeft <= 0) {
        const [b0, b1] = D.burst;
        this.burstLeft = d > 35 ? 1 + Math.floor(Math.random() * 3) : (d > 15 ? b0 + Math.floor(Math.random() * 2) : b0 + Math.floor(Math.random() * (b1 - b0 + 1)));
      }
      if (tryFire(a, g, true, true)) {
        this.burstLeft--; this.lastCombat = now;
        if (this.burstLeft <= 0) this.burstPause = THREE.MathUtils.lerp(D.firePause[0], D.firePause[1], Math.random()) * (d > 30 ? 1.4 : 1);
      }
    } else {
      this.semiT -= dt;
      if (this.semiT > 0) return;
      if (tryFire(a, g, true, true)) { this.lastCombat = now; this.semiT = w.def.kind === 'pistol' ? THREE.MathUtils.lerp(D.firePause[0], D.firePause[1], Math.random()) * (0.6 + d / 30) : 0.1 + Math.random() * 0.2; }
    }
  }
}
