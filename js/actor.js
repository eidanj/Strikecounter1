// Actor = anything that can fight: the player or a bot. Owns physics mover,
// character model, health/armor, weapons, hitboxes and the death sequence.
import * as THREE from 'three';
import { Mover } from './physics.js';
import { Character } from './character.js';
import { WEAPONS, buildWeaponModel } from './weapons.js';
import { clamp, lerp } from './noise.js';

export class WeaponState {
  constructor(id) {
    this.id = id; this.def = WEAPONS[id];
    this.ammo = this.def.mag || 0; this.reserve = this.def.reserve || 0;
    this.next = 0; this.cdStart = 0; this.reloading = 0; this.reloadTotal = 0; this.shots = 0; this.bloom = 0; this.lastShot = -9; this.zoom = 0;
  }
  get isGun() { return this.def.kind !== 'melee'; }
}

let ACTOR_ID = 0;
export class Actor {
  constructor(game, o) {
    this.id = ++ACTOR_ID;
    this.game = game; this.name = o.name; this.team = o.team; this.isPlayer = !!o.isPlayer;
    this.mover = new Mover(game.world.col);
    this.char = new Character(game.teamMats(o.team), o.team);
    this.char.root.name = 'actor_' + this.name;
    game.scene.add(this.char.root);
    this.health = 100; this.armor = 100; this.alive = true; this.deadTime = 0; this.poofed = false;
    this.yaw = 0; this.pitch = 0; this.recoilP = 0; this.recoilY = 0;
    this.ads = 0; this.adsHeld = false;
    this.kills = 0; this.deaths = 0; this.headshots = 0; this.score = 0;
    this.hb = []; this.hbFrame = -1;
    this.loadout = o.loadout || { primary: 'aka', secondary: 'biretta' };
    this.weapons = {};
    this.slot = 1;
    this.tpModels = {};
    this.lastFired = -9; this.lastHurt = -9; this.lastAttacker = null; this.spawnTime = 0;
    this.meleePending = null; this.meleeAnim = -1;
    this.input = { fwd: 0, right: 0, jump: false, crouch: false, sprint: false, dodge: false, dodgeSide: 1, yaw: 0 };
    this.marker = null;
    this.mover.onStep = (surf) => game.onStep(this, surf);
    this.mover.onLand = (v) => game.onLand(this, v);
    this.mover.onJump = () => game.onJump(this);
    this.giveLoadout();
  }

  giveLoadout() {
    this.weapons = {
      1: new WeaponState(this.loadout.primary), 2: new WeaponState(this.loadout.secondary),
      3: new WeaponState('stiletto'), 4: new WeaponState('axe'),
    };
    this.equip(1, true);
  }
  get w() { return this.weapons[this.slot]; }

  equip(slot, instant = false) {
    if (!this.weapons[slot]) return;
    if (this.slot === slot && !instant && this.char.weaponModel) return;
    const prev = this.w; if (prev) { prev.reloading = 0; }
    this.slot = slot;
    const w = this.w;
    w.next = Math.max(w.next, this.game.time + (instant ? 0 : 0.4)); w.cdStart = this.game.time;
    w.zoom = 0; this.ads = 0;
    if (!this.tpModels[w.id]) this.tpModels[w.id] = buildWeaponModel(w.id, this.game.tex);
    const kind = w.def.kind === 'melee' ? 'melee' : (w.def.kind === 'pistol' ? 'pistol' : 'rifle');
    this.char.setWeapon(this.tpModels[w.id], kind);
    this.mover.speedMul = w.def.moveMul || 1;
    if (this.isPlayer && this.game.onPlayerEquip) this.game.onPlayerEquip(w);
  }

  spawn(pos, yaw) {
    this.mover.teleport(pos.x, pos.y + 0.05, pos.z);
    this.yaw = yaw; this.pitch = 0; this.recoilP = this.recoilY = 0;
    this.health = 100; this.armor = 100; this.alive = true; this.poofed = false; this.deadTime = 0;
    this.char.resetDeath(); this.char.root.visible = true;
    this.giveLoadout();
    this.spawnTime = this.game.time;
    this.lastAttacker = null;
    if (this.marker) this.marker.visible = true;
  }

  eye(out = new THREE.Vector3()) { return out.set(this.mover.pos.x, this.mover.pos.y + this.mover.eyeHeight, this.mover.pos.z); }
  aimYaw() { return this.yaw + this.recoilY; }
  aimPitch() { return clamp(this.pitch + this.recoilP, -1.55, 1.55); }
  aimDir(out = new THREE.Vector3()) {
    const y = this.aimYaw(), p = this.aimPitch();
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
  center(out = new THREE.Vector3()) { return out.set(this.mover.pos.x, this.mover.pos.y + this.mover.height * 0.6, this.mover.pos.z); }
  head(out = new THREE.Vector3()) { return out.set(this.mover.pos.x, this.mover.pos.y + this.mover.height - 0.12, this.mover.pos.z); }

  hitboxes() {
    if (this.hbFrame !== this.game.frame) { this.char.hitboxes(this.hb); this.hbFrame = this.game.frame; }
    return this.hb;
  }

  takeDamage(dmg, part, attacker, weaponId, dir) {
    if (!this.alive) return 0;
    const def = WEAPONS[weaponId];
    let hp = dmg;
    if (this.armor > 0 && part !== 'leg' && def && def.armorPen) {
      hp = dmg * def.armorPen;
      let ad = (dmg - hp) * 0.5;
      if (ad > this.armor) { hp += (ad - this.armor) * 2; ad = this.armor; }
      this.armor = Math.max(0, this.armor - ad);
    }
    hp = Math.max(1, Math.round(hp));
    this.health -= hp;
    this.lastHurt = this.game.time; this.lastAttacker = attacker;
    if (this.health <= 0) { this.health = 0; this.die(attacker, weaponId, part === 'head', dir); }
    return hp;
  }

  die(killer, weaponId, headshot, dir) {
    this.alive = false; this.deadTime = 0; this.deaths++;
    // tip over sideways away from the shot
    let side = 1;
    if (dir) { const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); side = r.dot(dir) > 0 ? -1 : 1; }
    this.char.startDeath(side);
    this.mover.vel.set(0, 0, 0);
    if (this.marker) this.marker.visible = false;
    this.game.onKill(killer, this, weaponId, headshot);
  }

  updateDeath(dt) {
    this.deadTime += dt;
    this.char.animate(dt, {});
    if (!this.poofed && this.deadTime > 1.0) {
      this.poofed = true;
      const p = this.mover.pos;
      this.game.effects.deathPoof(new THREE.Vector3(p.x, p.y + 0.1, p.z));
      this.game.audio.poof(p);
      this.char.root.visible = false;
    }
  }

  updateModel(dt, extra = {}) {
    const m = this.mover, c = this.char;
    c.root.position.copy(m.pos);
    c.root.rotation.y = this.yaw;
    const w = this.w;
    c.animate(dt, {
      speed: m.hSpeed, sprint: m.sprinting, crouch: m.crouch, onGround: m.onGround, aimPitch: this.aimPitch(),
      kick: extra.kick || 0, reload: w.reloading > 0 ? 1 - w.reloading / w.reloadTotal : 0,
      melee: this.meleeAnim, dodge: m.dodging ? (this.input.right >= 0 ? -1 : 1) : 0,
    });
  }
}
