// Shared weapon handling for player and bots: fire rate, spread, recoil,
// hitscan vs world + capsule hitboxes, damage falloff, melee, reloads.
import * as THREE from 'three';
import { rayCapsule } from './character.js';
import { recoilKick } from './weapons.js';
import { clamp, lerp } from './noise.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const PART_MUL = { head: 1, body: 1, arm: 0.9, leg: 0.75 };

export function currentSpread(actor) {
  const w = actor.w, s = w.def.spread;
  if (!s) return 0;
  const m = actor.mover;
  let sp = s.base + w.bloom;
  const f = clamp(m.hSpeed / 4.7, 0, 1.4);
  sp += s.move * f * f;
  if (!m.onGround) sp += s.jump;
  sp *= lerp(1, s.crouch, m.crouch);
  if (w.def.kind === 'sniper') sp = actor.ads > 0.9 ? sp * s.ads : Math.max(sp, s.base);
  else if (actor.ads > 0.5) sp *= s.ads;
  return sp;
}

function spreadDir(dir, spread, rng = Math.random) {
  if (spread <= 0) return dir.clone();
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, dir).normalize();
  return dir.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
}

export function updateWeapon(actor, dt, game) {
  const w = actor.w;
  // bloom & recoil recovery
  if (w.def.spread) w.bloom = Math.max(0, w.bloom - w.def.spread.recover * w.def.spread.base * dt * 6 - w.bloom * w.def.spread.recover * 0.25 * dt);
  const sinceShot = game.time - w.lastShot;
  if (sinceShot > (w.def.interval || 0.1) * 1.2) w.shots = Math.max(0, w.shots - dt * 12);
  const rec = w.def.recoil ? w.def.recoil.recover : 8;
  if (sinceShot > 0.08) {
    const k = Math.exp(-rec * dt);
    actor.recoilP *= k; actor.recoilY *= k;
  }
  // reloads
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.def.shellReload) {
      if (w.reloading <= 0) {
        if (w.ammo < w.def.mag && w.reserve > 0) { w.ammo++; w.reserve--; if (actor.isPlayer) game.audio.reload('shell'); }
        if (w.ammo < w.def.mag && w.reserve > 0) { w.reloading = w.def.reload; w.reloadTotal = w.def.reload; if (actor.isPlayer && game.vm) game.vm.onReload(w.def.reload); }
        else w.reloading = 0;
      }
    } else if (w.reloading <= 0) {
      const need = w.def.mag - w.ammo, take = Math.min(need, w.reserve);
      w.ammo += take; w.reserve -= take; w.reloading = 0;
    }
  }
  // pending melee hit
  if (actor.meleePending && game.time >= actor.meleePending.at) { const mp = actor.meleePending; actor.meleePending = null; meleeHit(actor, mp.def, game); }
  if (actor.meleeAnim >= 0) { actor.meleeAnim += dt / (w.def.interval || 0.5); if (actor.meleeAnim > 1) actor.meleeAnim = -1; }
}

export function startReload(actor, game) {
  const w = actor.w;
  if (!w.isGun || w.reloading > 0 || w.ammo >= w.def.mag || w.reserve <= 0) return false;
  w.reloading = w.def.shellReload ? w.def.reload + 0.25 : w.def.reload;
  w.reloadTotal = w.reloading;
  w.zoom = 0;
  if (actor.isPlayer) {
    game.audio.reload(w.def.shellReload ? 'shell' : 'mag', w.reloading);
    if (game.vm) game.vm.onReload(w.reloading);
  }
  return true;
}

// returns true if a shot/swing happened
export function tryFire(actor, game, pressed, held) {
  const w = actor.w, def = w.def, now = game.time;
  if (now < w.next) return false;
  if (def.kind === 'melee') {
    if (!held) return false;
    w.next = now + def.interval; w.cdStart = now;
    actor.meleeAnim = 0;
    actor.meleePending = { at: now + (def.id === 'axe' ? 0.32 : 0.12), def };
    if (actor.isPlayer) { game.audio.whoosh(def.id === 'axe'); game.vm && game.vm.onMelee(); }
    actor.lastFired = now;
    return true;
  }
  if (!def.auto && !pressed) return false;
  if (!held) return false;
  if (w.reloading > 0) {
    if (def.shellReload && w.ammo > 0) w.reloading = 0; else return false;
  }
  if (w.ammo <= 0) {
    if (pressed) { if (actor.isPlayer) game.audio.dryFire(); if (!startReload(actor, game)) w.next = now + 0.25; }
    return false;
  }
  w.ammo--; w.next = now + def.interval; w.cdStart = now; w.lastShot = now; actor.lastFired = now;
  const spread = currentSpread(actor);
  // origin + direction
  const origin = actor.isPlayer && game.player && game.player.aimOrigin ? game.player.aimOrigin(_o) : actor.eye(_o);
  const baseDir = actor.isPlayer && game.player && game.player.aimDirection ? game.player.aimDirection(_d) : actor.aimDir(_d);
  const pellets = def.pellets || 1;
  const muzzle = muzzleWorld(actor, game);
  let anyHit = false;
  for (let i = 0; i < pellets; i++) {
    const dir = spreadDir(baseDir, pellets > 1 ? def.spread.base * (0.4 + Math.random() * 0.6) + (spread - def.spread.base) : spread);
    const res = traceShot(actor, origin.clone(), dir, def, game);
    if (res.actor) anyHit = true;
    if (i < 3 || Math.random() < 0.3) game.effects.tracer(muzzle, res.end);
  }
  // recoil + bloom
  const k = recoilKick(def, Math.floor(w.shots), Math.random);
  const rm = actor.isPlayer ? 1 : (actor.brain ? actor.brain.recoilComp : 0.5);
  actor.recoilP += THREE.MathUtils.degToRad(k.v) * rm * (actor.mover.crouch > 0.5 ? 0.8 : 1);
  actor.recoilY += THREE.MathUtils.degToRad(k.h) * rm;
  w.shots++;
  if (def.spread) w.bloom = Math.min(def.spread.maxBloom, w.bloom + def.spread.bloom);
  // effects & sound
  const big = def.kind === 'sniper' || def.kind === 'shotgun' ? 1.6 : (def.kind === 'pistol' ? 0.8 : 1);
  game.effects.muzzle(muzzle, baseDir, big);
  game.audio.shot(def.sound, actor.mover.pos, actor.isPlayer && !game.player.thirdPerson);
  if (def.kind !== 'shotgun' && def.kind !== 'sniper') {
    const right = new THREE.Vector3(Math.cos(actor.yaw), 0, -Math.sin(actor.yaw));
    const ep = muzzle.clone().addScaledVector(baseDir, -0.4).addScaledVector(right, 0.08);
    game.effects.casing(ep, right.clone().multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 1.5 + Math.random(), 0)).addScaledVector(baseDir, -0.5));
  }
  if (actor.isPlayer) { game.vm && game.vm.onFire(); if (def.kind === 'sniper') { game.audio.bolt(); w.zoom = 0; } if (def.kind === 'shotgun') game.audio.pump(); }
  game.noise(actor, actor.mover.pos, def.kind === 'pistol' ? 45 : 70);
  if (w.ammo === 0 && w.reserve > 0) w.next = Math.max(w.next, now + def.interval);
  return true;
}

export function muzzleWorld(actor, game) {
  const m = actor.char.weaponModel;
  if (actor.isPlayer && !game.player.thirdPerson) {
    // approximate muzzle position in front of the first-person camera
    const cam = game.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const ads = actor.ads;
    return cam.position.clone().addScaledVector(f, 0.8).addScaledVector(r, 0.14 * (1 - ads)).addScaledVector(u, -0.1 * (1 - ads) - 0.04 * ads);
  }
  if (m && m.userData.muzzle) { m.updateWorldMatrix(true, false); return m.userData.muzzle.clone().applyMatrix4(m.matrixWorld); }
  return actor.eye(new THREE.Vector3()).add(actor.aimDir(new THREE.Vector3()).multiplyScalar(0.6));
}

export function traceShot(shooter, origin, dir, def, game) {
  const range = def.kind === 'shotgun' ? 70 : 420;
  const wh = game.world.col.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range, 'bullets');
  let maxT = wh ? wh.t : range;
  let best = null;
  for (const a of game.actors) {
    if (!a.alive || a === shooter) continue;
    if (game.isTeammate(shooter, a)) continue; // friendly fire off: rounds pass teammates
    // broadphase
    _t.copy(a.mover.pos).setY(a.mover.pos.y + 1).sub(origin);
    const along = _t.dot(dir);
    if (along < -1 || along > maxT + 1.5) continue;
    const perp = _t.addScaledVector(dir, -along).length();
    if (perp > 1.6) continue;
    for (const hb of a.hitboxes()) {
      const t = rayCapsule(origin, dir, maxT, hb[0], hb[1], hb[2]);
      if (t >= 0 && t < maxT) { maxT = t; best = { a, t, part: hb[3] }; }
    }
  }
  const end = origin.clone().addScaledVector(dir, maxT);
  // near-miss awareness for bots
  for (const a of game.actors) {
    if (!a.alive || a === shooter || !a.brain || game.isTeammate(shooter, a)) continue;
    _t.copy(a.mover.pos).setY(a.mover.pos.y + 1).sub(origin);
    const along = _t.dot(dir);
    if (along < 0 || along > maxT) continue;
    const perp = _t.addScaledVector(dir, -along).length();
    if (perp < 3.5) a.brain.onThreat(shooter, 0.6);
  }
  if (best) {
    const a = best.a, dist = best.t;
    let dmg = def.damage * (best.part === 'head' ? def.headMul : PART_MUL[best.part]);
    dmg *= Math.pow(def.falloff || 0.95, dist / 12.7);
    const dealt = a.takeDamage(dmg, best.part, shooter, def.id, dir);
    game.effects.hitPuff(end, best.part === 'head');
    game.onHit(shooter, a, dealt, best.part === 'head', dir);
    return { actor: a, end };
  }
  if (wh) game.effects.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), wh.collider ? wh.collider.mat : 'dirt', !!wh.terrain);
  return { actor: null, end };
}

function meleeHit(actor, def, game) {
  if (!actor.alive) return;
  const origin = actor.eye(new THREE.Vector3());
  const base = actor.aimDir(new THREE.Vector3());
  let best = null;
  for (const yawOff of [0, 0.22, -0.22, 0.4, -0.4]) {
    const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOff);
    const wh = game.world.col.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range, 'bullets', true);
    let maxT = wh ? wh.t : def.range;
    for (const a of game.actors) {
      if (!a.alive || a === actor || game.isTeammate(actor, a)) continue;
      if (a.mover.pos.distanceTo(actor.mover.pos) > def.range + 1.5) continue;
      for (const hb of a.hitboxes()) {
        const t = rayCapsule(origin, dir, maxT, hb[0], hb[1], hb[2] + 0.08);
        if (t >= 0 && t < maxT && (!best || t < best.t)) { best = { a, t, part: hb[3], dir }; maxT = t; }
      }
    }
    if (best) break;
    if (yawOff === 0 && wh) { const p = origin.clone().addScaledVector(dir, wh.t); game.effects.impact(p, new THREE.Vector3(wh.nx, wh.ny, wh.nz), wh.collider ? wh.collider.mat : 'dirt', !!wh.terrain); game.audio.meleeHit(p, false); return; }
  }
  if (!best) return;
  const a = best.a;
  const vf = new THREE.Vector3(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
  const toVictim = a.mover.pos.clone().sub(actor.mover.pos).setY(0).normalize();
  const back = vf.dot(toVictim) > 0.45;
  let dmg = def.damage * (back ? def.backstab : 1) * (best.part === 'head' ? 1.4 : 1);
  const p = origin.clone().addScaledVector(best.dir, best.t);
  const dealt = a.takeDamage(dmg, best.part === 'leg' ? 'body' : best.part, actor, def.id, best.dir);
  game.effects.hitPuff(p, false);
  game.audio.meleeHit(p, true);
  game.onHit(actor, a, dealt, best.part === 'head', best.dir);
}
