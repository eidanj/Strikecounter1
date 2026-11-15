// Match director: Free-For-All and Tactical Team Deathmatch (rounds),
// spawning, respawn rules, kill/hit events, team markers, scoreboard data.
import * as THREE from 'three';
import { settings } from './settings.js';
import { Actor } from './actor.js';
import { BotBrain } from './ai.js';
import { PlayerController } from './player.js';
import { makeTeamMaterials } from './character.js';
import { updateWeapon } from './combat.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from './weapons.js';

const BOT_NAMES = ['Gino Flash', 'Paolo Spray', 'Big Tony', 'Nonna Rosa', 'Franco Ninja', 'Alfredo Sauce', 'Bruno Rush-B', 'Vito Camper', 'Carlo Clutch', 'Rocco Peek',
  'Dante Inferno', 'Salvatore AFK', 'Luca Lurker', 'Enzo Entry', 'Marta Molotov', 'Sofia Smokes', 'Gianni Ganker', 'Pietro Pixel', 'Aldo Ace', 'Beppe Bait', 'Chiara Crosshair', 'Ugo Utility'];
export const TEAM_NAME = { T: 'Tortellini', CT: 'Counter-Tortellini', FFA: 'Free-For-All' };
const RESPAWN_TIME = 20, BOT_FFA_RESPAWN = 8, FREEZE = 3.5, ROUND_TIME = 150, POST = 5, FFA_LIMIT = 20, FFA_TIME = 600;

export class Game {
  constructor(app) {
    Object.assign(this, { app, scene: app.scene, camera: app.camera, world: app.world, tex: app.tex, effects: app.effects, audio: app.audio, hud: app.hud, vm: app.vm, nav: app.nav });
    this.actors = []; this.time = 0; this.frame = 0; this.mats = {}; this.running = false;
    this.pathBudget = 3;
  }
  teamMats(team) { return this.mats[team] || (this.mats[team] = makeTeamMaterials(this.tex, team)); }
  isTeammate(a, b) { return this.mode === 'tdm' && a !== b && a.team === b.team; }
  canMove() { return this.phase !== 'freeze' && this.phase !== 'over'; }

  clear() {
    for (const a of this.actors) { this.scene.remove(a.char.root); if (a.marker) this.scene.remove(a.marker); }
    this.actors = [];
  }

  start(opts) {
    this.clear();
    this.mode = opts.mode; this.time = 0; this.frame = 0; this.running = true;
    this.score = { T: 0, CT: 0 }; this.round = 0; this.killfeed = [];
    const used = new Set();
    const name = () => { let n; do { n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; } while (used.has(n) && used.size < BOT_NAMES.length); used.add(n); return n; };
    const botLoadout = () => {
      const r = Math.random();
      const primary = r < 0.32 ? 'aka' : r < 0.6 ? 'rigatoni' : r < 0.75 ? 'mpnein' : r < 0.86 ? 'nonna' : 'awpetito';
      return { primary, secondary: Math.random() < 0.65 ? 'biretta' : 'beagle' };
    };
    let playerTeam = 'FFA';
    if (this.mode === 'tdm') playerTeam = opts.team === 'auto' ? (Math.random() < 0.5 ? 'T' : 'CT') : opts.team;
    this.playerTeam = playerTeam;
    const pl = this.playerLoadout || { primary: playerTeam === 'CT' ? 'rigatoni' : 'aka', secondary: 'biretta' };
    this.playerLoadout = pl;
    const player = new Actor(this, { name: settings.playerName || 'You', team: playerTeam, isPlayer: true, loadout: { ...pl } });
    this.actors.push(player);
    this.playerActor = player;
    if (!this.player) this.player = new PlayerController(this, player); else this.player.attach(player);
    this.vm.setMaterials(this.teamMats(playerTeam));
    if (this.mode === 'tdm') {
      const n = opts.teamSize;
      for (const team of ['T', 'CT']) {
        const count = team === playerTeam ? n - 1 : n;
        for (let i = 0; i < count; i++) { const b = new Actor(this, { name: name(), team, loadout: botLoadout() }); new BotBrain(b, this); this.actors.push(b); }
      }
    } else {
      for (let i = 0; i < opts.botCount; i++) { const b = new Actor(this, { name: name(), team: 'FFA', loadout: botLoadout() }); new BotBrain(b, this); this.actors.push(b); }
    }
    for (const a of this.actors) if (!a.isPlayer) a.marker = this.makeMarker(a);
    this.onPlayerEquip = (w) => { this.vm.equip(w.id); this.hud.weapon(w); };
    if (this.mode === 'tdm') this.startRound();
    else { this.phase = 'live'; this.phaseT = 0; this.matchEnd = FFA_TIME; for (const a of this.actors) this.spawnActor(a); this.hud.centerMsg('FREE-FOR-ALL', `First to ${FFA_LIMIT} eliminations`, 3); this.audio.roundStart(); }
    this.vm.equip(player.w.id); this.hud.weapon(player.w);
    this.hud.hideDeath();
  }

  makeMarker(a) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80;
    const g = c.getContext('2d');
    const col = a.team === 'T' ? '#ffb02e' : a.team === 'CT' ? '#5aa8ff' : '#ff5a4a';
    const ally = this.isTeammate(this.playerActor, a);
    g.font = "600 30px 'Rajdhani', Arial"; g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(a.name, 128, 32);
    g.fillStyle = '#fff'; g.fillText(a.name, 128, 32);
    g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(108, 44); g.lineTo(148, 44); g.lineTo(128, 72); g.closePath(); g.stroke(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: !ally, depthWrite: false, transparent: true, sizeAttenuation: false, fog: false }));
    m.scale.set(0.11, 0.034, 1); m.renderOrder = 20; m.userData.ally = ally; m.userData.hideFromAO = true;
    this.scene.add(m);
    return m;
  }

  spawnPoint(a) {
    const sp = this.world.spawnPoints;
    if (this.mode === 'tdm') {
      const list = sp[a.team];
      const i = (this._spawnIdx = (this._spawnIdx || 0) + 1);
      const mates = this.actors.filter(o => o.team === a.team);
      const k = mates.indexOf(a);
      const p = list[(k >= 0 ? k : i) % list.length];
      return { p, yaw: a.team === 'T' ? Math.PI / 2 : -Math.PI / 2 };
    }
    // FFA: farthest from living enemies
    let best = null, bd = -1;
    for (const p of sp.FFA) {
      let md = 1e9;
      for (const o of this.actors) if (o !== a && o.alive) md = Math.min(md, o.mover.pos.distanceTo(p));
      md += Math.random() * 15;
      if (md > bd) { bd = md; best = p; }
    }
    return { p: best, yaw: Math.random() * Math.PI * 2 };
  }
  spawnActor(a) {
    const { p, yaw } = this.spawnPoint(a);
    if (a.isPlayer) a.loadout = { ...this.playerLoadout };
    a.spawn(p, yaw);
    a.respawnAt = 0;
    if (a.brain) a.brain.reset();
    if (a.isPlayer) { this.vm.equip(a.w.id); this.hud.weapon(a.w); this.hud.hideDeath(); this.player.sprintActive = false; if (this.app.state === 'dead') this.app.onAutoRespawn(); }
  }

  startRound() {
    this.round++;
    this.phase = 'freeze'; this.phaseT = 0; this.roundStart = this.time + FREEZE;
    for (const a of this.actors) this.spawnActor(a);
    for (const e of this.effects.decals) e.visible = true;
    this.hud.centerMsg(`ROUND ${this.round}`, `${TEAM_NAME[this.playerTeam]} — first to ${settings.roundsToWin}`, FREEZE);
    this.hud.hint('Press B to change loadout during freeze time');
  }

  alive(team) { return this.actors.filter(a => a.alive && a.team === team).length; }

  endRound(winner) {
    this.phase = 'post'; this.phaseT = 0;
    if (winner) this.score[winner]++;
    const win = winner === this.playerTeam;
    this.hud.centerMsg(winner ? `${TEAM_NAME[winner].toUpperCase()} WIN` : 'ROUND DRAW', `${TEAM_NAME.T} ${this.score.T} — ${this.score.CT} ${TEAM_NAME.CT}`, POST);
    this.audio.roundEnd(win);
    if (this.score.T >= settings.roundsToWin || this.score.CT >= settings.roundsToWin) this.matchOverPending = winner;
  }

  endMatch(text) {
    this.phase = 'over'; this.running = false;
    this.app.showMatchEnd(text);
  }

  noise(src, pos, radius) {
    for (const a of this.actors) {
      if (!a.brain || !a.alive || a === src || this.isTeammate(src, a)) continue;
      if (a.mover.pos.distanceTo(pos) < radius) a.brain.onNoise(pos, src);
    }
  }

  onStep(a, surf) {
    const P = this.playerActor;
    const quiet = a.mover.crouch > 0.5 || a.mover.hSpeed < 3.0;
    if (a.isPlayer || a.mover.pos.distanceTo(P.mover.pos) < 45) this.audio.footstep(surf, a.mover.pos, a.isPlayer && !this.player.thirdPerson, quiet);
    if (!quiet) this.noise(a, a.mover.pos, a.mover.sprinting ? 20 : 11);
  }
  onLand(a, v) {
    if (v > 4 && a.isPlayer) { this.audio.land(v, this.world.col.surfaceFn(a.mover.pos.x, a.mover.pos.z)); this.vm.onLand(v); }
    if (v > 9) this.effects.dust(a.mover.pos, 0.6);
  }
  onJump(a) { if (a.isPlayer) this.audio.jump(true); }

  onHit(attacker, victim, dmg, head, dir) {
    if (attacker && attacker.isPlayer) { this.hud.hitmarker(head, !victim.alive); this.audio.hitmarker(head); }
    if (victim.isPlayer) { this.hud.damage(attacker, dmg); this.audio.hurt(); }
    if (victim.brain) victim.brain.onDamaged(attacker);
  }

  onKill(killer, victim, weaponId, head) {
    if (killer && killer !== victim) { killer.kills++; killer.score += head ? 3 : 2; if (head) killer.headshots++; }
    this.hud.killfeed(killer, victim, WEAPONS[weaponId] ? WEAPONS[weaponId].name : '?', head, this.playerActor);
    this.audio.deathTone(victim.mover.pos);
    if (killer && killer.isPlayer) { this.audio.killDing(); this.hud.toast(`Eliminated ${victim.name}${head ? ' — HEADSHOT' : ''}`); }
    if (victim.isPlayer) {
      victim.respawnAt = this.time + RESPAWN_TIME;
      this.hud.showDeath(killer, WEAPONS[weaponId] ? WEAPONS[weaponId].name : '', head, RESPAWN_TIME);
      this.app.onPlayerDeath();
    } else if (this.mode === 'ffa') victim.respawnAt = this.time + BOT_FFA_RESPAWN;
    if (this.mode === 'ffa' && killer && killer.kills >= FFA_LIMIT) this.matchOverPending = killer;
  }

  requestRespawn() {
    const p = this.playerActor;
    if (p.alive || this.time < p.respawnAt) return false;
    if (this.mode === 'tdm' && this.phase !== 'live' && this.phase !== 'freeze') return false;
    this.spawnActor(p);
    this.app.onPlayerRespawn();
    return true;
  }

  update(dt, input, uiBlocked) {
    if (!this.running && this.phase !== 'over') return;
    this.time += dt; this.frame++; this.pathBudget = 3;
    this.phaseT += dt;
    // ---- rules ----
    if (this.mode === 'tdm') {
      if (this.phase === 'freeze' && this.phaseT >= FREEZE) { this.phase = 'live'; this.phaseT = 0; this.audio.roundStart(); this.hud.centerMsg('GO GO GO!', '', 1.2); }
      else if (this.phase === 'live') {
        const tA = this.alive('T'), cA = this.alive('CT');
        if (tA === 0 || cA === 0) this.endRound(tA === 0 && cA === 0 ? null : tA === 0 ? 'CT' : 'T');
        else if (this.phaseT >= ROUND_TIME) this.endRound(tA > cA ? 'T' : cA > tA ? 'CT' : null);
      } else if (this.phase === 'post' && this.phaseT >= POST) {
        if (this.matchOverPending) { const w = this.matchOverPending; this.matchOverPending = null; this.endMatch(w === this.playerTeam ? 'VICTORY' : 'DEFEAT'); return; }
        this.startRound();
      }
    } else if (this.phase === 'live') {
      if (this.matchOverPending || this.phaseT >= this.matchEnd) {
        const sorted = [...this.actors].sort((a, b) => b.kills - a.kills);
        this.matchOverPending = null;
        this.endMatch(sorted[0].isPlayer ? 'VICTORY' : `${sorted[0].name.toUpperCase()} WINS`);
        return;
      }
    }
    // ---- actors ----
    const P = this.playerActor;
    this.player.update(dt, input, uiBlocked);
    for (const a of this.actors) if (a.brain && a.alive && this.phase !== 'over') { if (this.canMove()) a.brain.update(dt); else { a.brain.perceive(dt); a.input.fwd = a.input.right = 0; a.input.sprint = a.input.jump = a.input.dodge = false; } }
    for (const a of this.actors) {
      if (a.alive) {
        const inp = a.input;
        if (!this.canMove()) { inp.fwd = inp.right = 0; inp.jump = inp.dodge = inp.sprint = false; }
        const wasDodge = a.mover.dodgeT > 0;
        a.mover.update(dt, inp);
        if (!wasDodge && a.mover.dodgeT > 0) { this.effects.dust(a.mover.pos, 1); if (a.isPlayer) this.audio.dodge(); }
        updateWeapon(a, dt, this);
        a.updateModel(dt);
      } else {
        a.updateDeath(dt);
        if (!a.isPlayer && this.mode === 'ffa' && a.respawnAt && this.time >= a.respawnAt) this.spawnActor(a);
      }
      if (a.marker) {
        const ally = a.marker.userData.ally;
        a.marker.visible = a.alive && (ally || a.char.root.visible);
        a.marker.position.set(a.mover.pos.x, a.mover.pos.y + a.mover.height + 0.42, a.mover.pos.z);
        if (!ally) { const d = a.mover.pos.distanceTo(P.mover.pos); a.marker.material.opacity = d > 70 ? 0 : 1; }
      }
    }
  }
}
