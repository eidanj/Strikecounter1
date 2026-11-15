// DOM HUD: vitals, stamina, ammo, dynamic crosshair, hitmarkers, damage arcs,
// team survivor bar + timer, rotating radar, killfeed, scoreboard, scope.
import * as THREE from 'three';
import { settings } from './settings.js';
import { currentSpread } from './combat.js';
import { TEAM_NAME } from './game.js';
import { TOWN } from './world/town.js';
import { ROADS, NATURE } from './world/nature.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'), hp: $('hpNum'), hpBar: $('hpBar'), ar: $('arNum'), arBar: $('arBar'), st: $('stBar'), stWrap: $('stamina'),
      wname: $('wName'), mag: $('ammoMag'), res: $('ammoRes'), slots: $('slots'), cross: $('crosshair'), hit: $('hitmarker'),
      kf: $('killfeed'), dmg: $('dmgind'), cbig: $('cmBig'), csmall: $('cmSmall'), cm: $('centermsg'), toast: $('toast'), hint: $('hint'),
      timer: $('timer'), roundLbl: $('roundLbl'), tL: $('teamL'), tR: $('teamR'), scope: $('scope'), lowhp: $('lowhp'), fps: $('fps'),
      sb: $('scoreboard'), radar: $('radar'), reload: $('reloadBar'), death: $('death'), deathKiller: $('deathKiller'), deathCount: $('deathCount'), btnRespawn: $('btnRespawn'),
      stance: $('stance'), cd: $('cooldown'),
    };
    this.cmT = 0; this.toastT = 0; this.hintT = 0; this.hitT = 0; this.kfItems = []; this.dmgItems = [];
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.radarCtx = this.el.radar.getContext('2d');
    this.mapImg = null;
  }
  show(on) { this.el.root.classList.toggle('hidden', !on); }

  buildRadar(world) {
    const W = 520, H = 360; // world x -130..130, z -90..90 -> 2px/m
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const X = (x) => (x + 130) * 2, Z = (z) => (z + 90) * 2;
    g.fillStyle = '#4a5a3a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7d766a'; g.fillRect(0, 0, X(-2), H);
    g.strokeStyle = '#8f7a58'; g.lineWidth = 5; g.lineCap = 'round';
    for (const r of ROADS) { g.beginPath(); r.forEach((p, i) => i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))); g.stroke(); }
    g.fillStyle = '#d9cdb6';
    for (const b of world.buildings) g.fillRect(X(b.rect[0]), Z(b.rect[1]), (b.rect[2] - b.rect[0]) * 2, (b.rect[3] - b.rect[1]) * 2);
    g.fillStyle = '#c9b48a'; const ch = TOWN.churchRect; g.fillRect(X(ch[0]), Z(ch[1]), (ch[2] - ch[0]) * 2, (ch[3] - ch[1]) * 2);
    g.fillStyle = '#6f8fa8'; g.beginPath(); g.arc(X(TOWN.fountain[0]), Z(TOWN.fountain[1]), 9, 0, 7); g.fill();
    g.fillStyle = '#a89a80'; g.fillRect(X(-6), 0, 8, H);
    g.fillStyle = '#6a8a3a'; const v = NATURE.vineyard; g.fillRect(X(v[0]), Z(v[1]), (v[2] - v[0]) * 2, (v[3] - v[1]) * 2);
    g.fillStyle = '#cfc2a6'; for (const r of [NATURE.farmhouse, NATURE.barn, NATURE.chapel]) g.fillRect(X(r[0]), Z(r[1]), (r[2] - r[0]) * 2, (r[3] - r[1]) * 2);
    this.mapImg = c;
  }

  weapon(w) {
    this.el.wname.textContent = w.def.name;
    [...this.el.slots.children].forEach((s, i) => s.classList.toggle('on', i + 1 === w.def.slot));
  }

  centerMsg(big, small, t = 2.5) { this.el.cbig.textContent = big; this.el.csmall.textContent = small; this.el.cm.classList.add('on'); this.cmT = t; }
  toast(t) { this.el.toast.textContent = t; this.el.toast.classList.add('on'); this.toastT = 2.2; }
  hint(t) { this.el.hint.textContent = t; this.el.hint.classList.add('on'); this.hintT = 4; }
  flashStamina() { this.el.stWrap.classList.remove('flash'); void this.el.stWrap.offsetWidth; this.el.stWrap.classList.add('flash'); }
  hitmarker(head, kill) {
    const h = this.el.hit; h.classList.remove('on', 'head', 'kill'); void h.offsetWidth;
    h.classList.add('on'); if (head) h.classList.add('head'); if (kill) h.classList.add('kill');
  }
  damage(attacker, dmg) {
    if (!attacker || !this.game) return;
    const d = document.createElement('div'); d.className = 'arc';
    this.el.dmg.appendChild(d);
    this.dmgItems.push({ d, a: attacker, t: 1.4 });
    document.body.classList.remove('hurt'); void document.body.offsetWidth; document.body.classList.add('hurt');
  }
  killfeed(killer, victim, wname, head, player) {
    const row = document.createElement('div');
    const cls = (a) => a ? (a.team === 'T' ? 't' : a.team === 'CT' ? 'ct' : 'ffa') : 'ffa';
    if ((killer && killer === player) || victim === player) row.className = 'mine';
    row.innerHTML = `${killer && killer !== victim ? `<span class="${cls(killer)}">${esc(killer.name)}</span>` : ''}<span class="wpn">${esc(wname)}${head ? ' <b class="hs">◎</b>' : ''}</span><span class="${cls(victim)}">${esc(victim.name)}</span>`;
    this.el.kf.prepend(row);
    this.kfItems.push({ row, t: 6 });
    while (this.el.kf.children.length > 6) this.el.kf.lastChild.remove();
  }

  showDeath(killer, wname, head, secs) {
    this.el.death.classList.remove('hidden');
    this.el.deathKiller.innerHTML = killer ? `Eliminated by <b class="${killer.team === 'T' ? 't' : killer.team === 'CT' ? 'ct' : 'ffa'}">${esc(killer.name)}</b> with the ${esc(wname)}${head ? ' (headshot)' : ''}` : 'You were eliminated';
    this.el.btnRespawn.disabled = true;
  }
  hideDeath() { this.el.death.classList.add('hidden'); }

  update(dt, game, cam) {
    this.game = game;
    const p = game.playerActor; if (!p) return;
    const m = p.mover, w = p.w, e = this.el;
    // vitals
    e.hp.textContent = Math.ceil(p.health); e.hpBar.style.width = p.health + '%';
    e.hp.parentElement.parentElement.classList.toggle('low', p.health < 30);
    e.ar.textContent = Math.ceil(p.armor); e.arBar.style.width = p.armor + '%';
    e.st.style.width = m.stamina + '%';
    e.stWrap.classList.toggle('exhausted', m.exhausted);
    e.stWrap.classList.toggle('sprint', m.sprinting);
    e.stance.textContent = m.sprinting ? 'SPRINT' : m.crouch > 0.5 ? 'CROUCH' : m.hSpeed > 0.5 ? 'WALK' : 'STAND';
    // ammo
    if (w.isGun) { e.mag.textContent = w.ammo; e.res.textContent = '/ ' + w.reserve; e.mag.classList.toggle('empty', w.ammo === 0); e.mag.classList.toggle('low', w.ammo > 0 && w.ammo <= w.def.mag * 0.25); }
    else { e.mag.textContent = '∞'; e.res.textContent = ''; }
    e.reload.style.opacity = w.reloading > 0 ? 1 : 0;
    if (w.reloading > 0) e.reload.firstElementChild.style.width = (100 * (1 - w.reloading / w.reloadTotal)) + '%';
    // crosshair
    const scoped = w.def.scope && p.ads > 0.9 && w.zoom > 0 && p.alive;
    e.scope.classList.toggle('on', !!scoped);
    const hideCross = scoped || !p.alive || m.sprinting || (w.def.kind === 'sniper' && p.ads < 0.9) || p.ads > 0.85;
    e.cross.classList.toggle('hidden', hideCross);
    e.cross.classList.toggle('melee', w.def.kind === 'melee');
    if (!hideCross) {
      const sp = currentSpread(p);
      const H = innerHeight;
      const gap = Math.max(3, Math.tan(sp) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (H / 2));
      e.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
      e.cd.style.setProperty('--gap', gap.toFixed(1) + 'px');
      e.cross.style.setProperty('--cc', settings.crosshairColor);
      e.cross.classList.toggle('dot', settings.crosshairDot);
    }
    // cooldown / reload bar under the crosshair (all weapons)
    {
      const now = game.time;
      let prog = -1, reload = false;
      if (w.reloading > 0 && w.reloadTotal > 0) { prog = 1 - w.reloading / w.reloadTotal; reload = true; }
      else if (now < w.next && w.next - w.cdStart > 0.001) prog = (now - w.cdStart) / (w.next - w.cdStart);
      const show = p.alive && prog >= 0;
      if (show) { e.cd.firstElementChild.style.width = (Math.max(0, Math.min(1, prog)) * 100).toFixed(1) + '%'; this.cdWasOn = true; }
      else if (this.cdWasOn && p.alive) { e.cd.firstElementChild.style.width = '100%'; this.cdWasOn = false; this.cdReadyT = 0.18; }
      this.cdReadyT = Math.max(0, (this.cdReadyT || 0) - dt);
      e.cd.classList.toggle('on', show || this.cdReadyT > 0);
      e.cd.classList.toggle('reload', reload);
      e.cd.classList.toggle('ready', !show && this.cdReadyT > 0);
    }
    // timers / messages
    this.cmT -= dt; if (this.cmT <= 0) e.cm.classList.remove('on');
    this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('on');
    this.hintT -= dt; if (this.hintT <= 0) e.hint.classList.remove('on');
    for (const k of this.kfItems) { k.t -= dt; if (k.t <= 0) k.row.classList.add('gone'); }
    this.kfItems = this.kfItems.filter(k => { if (k.t < -0.6) { k.row.remove(); return false; } return true; });
    // damage arcs
    const yaw = p.aimYaw();
    for (const d of this.dmgItems) {
      d.t -= dt;
      const dx = d.a.mover.pos.x - m.pos.x, dz = d.a.mover.pos.z - m.pos.z;
      const ang = Math.atan2(-dx, -dz) - yaw;
      d.d.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
      d.d.style.opacity = Math.max(0, Math.min(1, d.t));
    }
    this.dmgItems = this.dmgItems.filter(d => { if (d.t <= 0) { d.d.remove(); return false; } return true; });
    // low hp
    e.lowhp.style.opacity = p.alive && p.health < 35 ? (0.35 + 0.25 * Math.sin(performance.now() * 0.006)) * (1 - p.health / 35) + 0.15 : 0;
    // team bar + timer
    if (game.mode === 'tdm') {
      const left = game.playerTeam, right = left === 'T' ? 'CT' : 'T';
      const icons = (team) => game.actors.filter(a => a.team === team).map(a => `<i class="${a.alive ? 'up' : 'down'} ${a.isPlayer ? 'me' : ''}"></i>`).join('');
      e.tL.className = 'team ' + (left === 'T' ? 't' : 'ct'); e.tR.className = 'team ' + (right === 'T' ? 't' : 'ct');
      e.tL.innerHTML = `<div class="tn">${TEAM_NAME[left]}</div><div class="row"><b class="sc">${game.score[left]}</b><div class="icons">${icons(left)}</div><b class="al">${game.alive(left)}</b></div>`;
      e.tR.innerHTML = `<div class="tn">${TEAM_NAME[right]}</div><div class="row"><b class="al">${game.alive(right)}</b><div class="icons">${icons(right)}</div><b class="sc">${game.score[right]}</b></div>`;
      let t = game.phase === 'freeze' ? 3.5 - game.phaseT : game.phase === 'live' ? 150 - game.phaseT : 0;
      t = Math.max(0, t);
      e.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      e.timer.classList.toggle('freeze', game.phase === 'freeze');
      e.roundLbl.textContent = game.phase === 'freeze' ? 'FREEZE TIME' : `ROUND ${game.round}`;
    } else {
      const alive = game.actors.filter(a => a.alive).length;
      const sorted = [...game.actors].sort((a, b) => b.kills - a.kills);
      e.tL.className = 'team ffa'; e.tR.className = 'team ffa';
      e.tL.innerHTML = `<div class="tn">Survivors</div><div class="row"><b class="al">${alive}</b><div class="icons">${game.actors.map(a => `<i class="${a.alive ? 'up' : 'down'} ${a.isPlayer ? 'me' : ''}"></i>`).join('')}</div></div>`;
      e.tR.innerHTML = `<div class="tn">Leader</div><div class="row"><b class="al">${sorted[0].kills}</b><div class="lead">${esc(sorted[0].name)}</div><b class="sc">You: ${p.kills}</b></div>`;
      const t = Math.max(0, (game.matchEnd || 0) - game.phaseT);
      e.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      e.roundLbl.textContent = 'FREE-FOR-ALL';
    }
    // death screen countdown
    if (!p.alive && !e.death.classList.contains('hidden')) {
      const left = Math.max(0, p.respawnAt - game.time);
      e.deathCount.textContent = left > 0 ? `Respawn available in ${Math.ceil(left)}s` : (game.mode === 'tdm' && game.phase === 'post' ? 'Next round starting…' : 'Ready to respawn');
      e.btnRespawn.disabled = left > 0 || (game.mode === 'tdm' && game.phase === 'post');
    }
    // scoreboard
    if (this.showScores) this.renderScores(game);
    this.radar(game);
    // fps
    this.fpsAcc += dt; this.fpsN++; this.fpsT -= dt;
    if (this.fpsT <= 0) { e.fps.textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0.5; }
    e.fps.style.display = settings.showFps ? 'block' : 'none';
  }

  renderScores(game) {
    const row = (a) => `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.headshots}</td><td>${a.score}</td></tr>`;
    const tbl = (title, list, cls) => `<div class="sbteam ${cls}"><h3>${title}</h3><table><tr><th>Player</th><th>K</th><th>D</th><th>HS</th><th>Score</th></tr>${list.sort((a, b) => b.score - a.score).map(row).join('')}</table></div>`;
    let html = '';
    if (game.mode === 'tdm') html = tbl(`${TEAM_NAME.T} — ${game.score.T}`, game.actors.filter(a => a.team === 'T'), 't') + tbl(`${TEAM_NAME.CT} — ${game.score.CT}`, game.actors.filter(a => a.team === 'CT'), 'ct');
    else html = tbl('Free-For-All', [...game.actors], 'ffa');
    this.el.sb.innerHTML = html;
  }
  scores(on, game) { this.showScores = on; this.el.sb.classList.toggle('on', on); if (on) this.renderScores(game); }

  radar(game) {
    const g = this.radarCtx, S = this.el.radar.width, p = game.playerActor;
    if (!this.mapImg) return;
    const scale = 2.2; // px per metre on radar
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
    g.fillStyle = '#1a1e16'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(p.aimYaw());
    g.scale(scale / 2, scale / 2);
    g.globalAlpha = 0.9;
    g.drawImage(this.mapImg, -(p.mover.pos.x + 130) * 2, -(p.mover.pos.z + 90) * 2);
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const toR = (pos) => {
      const dx = pos.x - p.mover.pos.x, dz = pos.z - p.mover.pos.z;
      const c = Math.cos(p.aimYaw()), s = Math.sin(p.aimYaw());
      return [S / 2 + (dx * c - dz * s) * scale, S / 2 + (dx * s + dz * c) * scale];
    };
    const R = S / 2 - 7;
    for (const a of game.actors) {
      if (a === p || !a.alive) continue;
      const ally = game.isTeammate(p, a);
      // enemies are always on the radar; ones that are spotted / shooting are drawn bolder
      let hot = ally || game.time - a.lastFired < 1.5;
      if (!hot) for (const b of game.actors) if (b.brain && b.alive && game.isTeammate(p, b)) { const r = b.brain.aware.get(a); if (r && r.visible) { hot = true; break; } }
      let [x, y] = toR(a.mover.pos);
      const dx = x - S / 2, dy = y - S / 2, dist = Math.hypot(dx, dy);
      const col = ally ? (a.team === 'T' ? '#ffb02e' : '#5aa8ff') : '#ff3b2f';
      g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.5; g.fillStyle = col;
      if (dist > R) {
        // off the edge: small arrow on the rim pointing toward them
        const ux = dx / dist, uy = dy / dist; x = S / 2 + ux * R; y = S / 2 + uy * R;
        g.beginPath(); g.moveTo(x + ux * 6, y + uy * 6); g.lineTo(x - uy * 4.5 - ux * 2, y + ux * 4.5 - uy * 2); g.lineTo(x + uy * 4.5 - ux * 2, y - ux * 4.5 - uy * 2); g.closePath();
        g.globalAlpha = ally ? 0.9 : 0.95; g.fill(); g.stroke(); g.globalAlpha = 1;
        continue;
      }
      const rad = ally ? 4 : (hot ? 5 : 4);
      g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.stroke();
      if (!ally && hot) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, rad + 2.5, 0, 7); g.stroke(); }
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(S / 2, S / 2 - 7); g.lineTo(S / 2 + 5, S / 2 + 5); g.lineTo(S / 2, S / 2 + 2); g.lineTo(S / 2 - 5, S / 2 + 5); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.stroke();
  }
}
