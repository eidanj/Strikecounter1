// Strike Counter 1 — entry point: boot, menus, settings, game loop.
import * as THREE from 'three';
import { settings, saveSettings, gfx, PRESETS, PRESET_ORDER, DEVICE, bootGuard, markPending, markGood, resetAllSettings } from './settings.js';
import { Renderer } from './renderer.js';
import { World } from './world/world.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { ViewModel } from './viewmodel.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { makeTeamMaterials } from './character.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from './weapons.js';
import { vFovFromH } from './player.js';
import { TouchControls, ICONS } from './touch.js';

const $ = (id) => document.getElementById(id);
const TIPS = [
  'Crouch behind a wall and enemies lose sight of you.',
  'Double-tap W to sprint. Watch your energy bar!',
  'Press C to switch between first and third person.',
  'Q dodges in the direction you are moving.',
  'Bots in a firefight stay focused on their target. Flank them.',
  'Headshots deal 4x damage. Aim for the beret.',
  'The AWPetito has two zoom levels. Buon appetito.',
  'Bullets pass through vines and bushes, but enemies can\'t see through them.',
  'No gore here. Eliminated players simply go poof.',
  'Nonna\'s 12-Gauge is devastating up close and useless far away.',
];

class App {
  constructor() {
    this.state = 'loading';
    this.canvas = $('game');
    this.clock = new THREE.Clock();
    this.time = 0;
    this.params = new URLSearchParams(location.search);
  }

  async init() {
    $('loadTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const progress = (p, t) => { $('loadBar').style.width = Math.round(p * 100) + '%'; $('loadText').textContent = t + '…'; };
    progress(0.02, 'Loading fonts');
    await this.loadFonts();
    // recovery links: ?reset wipes saved settings, ?preset=low saves that preset
    if (this.params.has('reset')) { resetAllSettings(); location.replace(location.pathname); return; }
    if (this.params.get('preset') && PRESETS[this.params.get('preset')]) { settings.preset = this.params.get('preset'); settings.overrides = {}; saveSettings(); markGood(); }
    this.crashNotice = bootGuard();
    markPending();
    this.renderer = new Renderer(this.canvas);
    DEVICE.maxTexture = this.renderer.r.capabilities.maxTextureSize || 4096;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(); });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 600);
    this.world = new World(this.renderer.r, this.scene);
    await this.world.build(gfx(), progress);
    this.tex = this.world.texLib.t;
    progress(0.92, 'Teaching bots to walk');
    await new Promise(r => setTimeout(r, 0));
    this.nav = new NavGrid(this.world.col, this.world.col.bounds, 1);
    this.effects = new Effects(this.scene, this.tex, this.world);
    this.audio = new GameAudio();
    this.audio.setVolume(settings.volume, settings.ambientVolume);
    this.input = new Input(this.canvas);
    this.touch = new TouchControls(this);
    this.vm = new ViewModel(this.tex, makeTeamMaterials(this.tex, 'CT'));
    this.hud = new HUD();
    this.hud.buildRadar(this.world);
    this.game = new Game(this);
    this.applyGraphics();
    progress(0.97, 'Compiling shaders');
    // warm up shaders
    this.camera.position.set(-40, 2, 0); this.camera.lookAt(-62, 2, 0);
    this.world.update(0.016, 0, this.camera, this.camera.position);
    try { this.renderer.r.compile(this.scene, this.camera); } catch (e) { /* optional */ }
    this.bindUI();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    window.addEventListener('resize', () => { this.onResize(); this.updateRotateHint(); });
    document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] || ''; });
    this.updateRotateHint();
    this.onResize();
    $('loading').classList.add('hidden');
    this.showMenu();
    this.trialT = 4; // clear the boot marker after a few seconds of smooth rendering
    if (this.crashNotice) this.notice(this.crashNotice, 15, { label: 'OK', fn: () => $('notice').classList.remove('on') });
    window.__sc1 = this;
    requestAnimationFrame((t) => this.frame(t));
    const auto = this.params.get('autostart');
    if (auto) { this.mode = auto; setTimeout(() => this.startGame(), 50); }
  }

  async loadFonts() {
    if (!document.fonts) return;
    const fams = ["40px 'Bebas Neue'", "700 40px 'Cinzel'", "700 40px 'Oswald'", "40px 'Pacifico'", "italic 700 40px 'Playfair Display'", "700 40px 'Playfair Display'", "600 30px 'Rajdhani'"];
    const all = Promise.all(fams.map(f => document.fonts.load(f).catch(() => null)));
    await Promise.race([all, new Promise(r => setTimeout(r, 3000))]);
  }

  applyGraphics() {
    const g = gfx();
    this.world.applyGraphics(g);
    this.renderer.configure(g, this.scene, this.camera, this.vm);
    this.camera.far = g.drawDistance + 60; this.camera.updateProjectionMatrix();
    this.effects.configure(g, this.renderer.r, this.camera);
    this.vm.scene.environment = g.envMap ? this.world.env : null;
    this.vm.scene.environmentIntensity = 0.7;
  }

  notice(text, secs = 6, action = null) {
    let n = $('notice');
    if (!n) { n = document.createElement('div'); n.id = 'notice'; document.body.appendChild(n); }
    n.innerHTML = '';
    const p = document.createElement('span'); p.textContent = text; n.appendChild(p);
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = action.fn; n.appendChild(b); }
    n.classList.add('on');
    clearTimeout(this._noticeT);
    if (secs) this._noticeT = setTimeout(() => n.classList.remove('on'), secs * 1000);
  }

  onContextLost() {
    // the GPU gave up (usually out of memory): drop the quality and offer a reload
    const idx = PRESET_ORDER.indexOf(settings.preset);
    settings.preset = PRESET_ORDER[Math.max(0, Math.min(idx - 2, PRESET_ORDER.indexOf('normal')))];
    settings.overrides = {};
    saveSettings(); markGood();
    this.input.unlock();
    this.notice(`The graphics driver ran out of memory. Quality was lowered to “${PRESETS[settings.preset].label}”.`, 0, { label: 'Reload', fn: () => location.reload() });
  }

  updateRotateHint() { $('rotate').classList.toggle('hidden', !(this.input.touchMode && innerHeight > innerWidth)); }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.effects.updateScale(this.renderer.r, this.camera);
  }

  // ---------------- UI ----------------
  showMenu() {
    this.state = 'menu';
    $('menu').classList.remove('hidden', 'ingame');
    $('hud').classList.add('hidden');
    for (const id of ['death', 'pause', 'matchend', 'buy', 'clickToPlay']) $(id).classList.add('hidden');
    this.hud.show(false);
  }
  openPanel(name) {
    for (const p of document.querySelectorAll('.panel')) p.classList.add('hidden');
    for (const b of document.querySelectorAll('.mainnav button')) b.classList.toggle('on', b.dataset.panel === name);
    if (name) $('panel-' + name).classList.remove('hidden');
    this.openPanelName = name;
  }

  bindUI() {
    const click = () => this.audio.ui('click');
    document.querySelectorAll('.mainnav button').forEach(b => b.addEventListener('click', () => { this.audio.init(); click(); this.openPanel(this.openPanelName === b.dataset.panel ? null : b.dataset.panel); }));
    // play panel
    const fill = (sel, ids, val) => { sel.innerHTML = ids.map(id => `<option value="${id}">${WEAPONS[id].name}</option>`).join(''); sel.value = val; };
    fill($('optPrimary'), PRIMARIES, 'aka'); fill($('optSecondary'), SECONDARIES, 'biretta');
    this.mode = settings.mode;
    const setMode = (m) => {
      this.mode = m;
      document.querySelectorAll('.mode').forEach(x => x.classList.toggle('on', x.dataset.mode === m));
      document.querySelectorAll('.tdm-only').forEach(x => x.classList.toggle('hidden', m !== 'tdm'));
      document.querySelectorAll('.ffa-only').forEach(x => x.classList.toggle('hidden', m !== 'ffa'));
    };
    document.querySelectorAll('.mode').forEach(x => x.addEventListener('click', () => { click(); setMode(x.dataset.mode); }));
    setMode(this.mode);
    $('optTeamSize').value = String(settings.teamSize); $('optBots').value = String(settings.botCount);
    $('optRounds').value = String(settings.roundsToWin); $('optDiff').value = settings.difficulty; $('optName').value = settings.playerName;
    $('btnDeploy').addEventListener('click', () => { click(); this.startGame(); });
    // settings
    this.bindSettings();
    // death
    $('btnRespawn').addEventListener('click', () => { click(); this.game.requestRespawn(); });
    $('btnDeathMenu').addEventListener('click', () => { click(); this.quitToMenu(); });
    // pause
    $('btnResume').addEventListener('click', () => { click(); this.resume(); });
    $('btnQuit').addEventListener('click', () => { click(); this.quitToMenu(); });
    $('btnPauseSettings').addEventListener('click', () => { click(); this.ingamePanel('settings'); });
    $('btnPauseHelp').addEventListener('click', () => { click(); this.ingamePanel('tutorial'); });
    // match end
    $('btnAgain').addEventListener('click', () => { click(); $('matchend').classList.add('hidden'); this.startGame(); });
    $('btnEndMenu').addEventListener('click', () => { click(); this.quitToMenu(); });
    $('clickToPlay').addEventListener('click', () => this.resume());
    // buy menu
    this.buildBuy();
    $('btnBuyClose').addEventListener('click', () => { click(); this.closeBuy(); });
    // back button for in-game panels
    const back = document.createElement('button'); back.id = 'btnBack'; back.className = 'cta'; back.textContent = '◂ Back';
    back.style.cssText = 'position:absolute;left:5vw;top:9vh;display:none;';
    $('menu').appendChild(back);
    back.addEventListener('click', () => { click(); $('menu').classList.add('hidden'); $('menu').classList.remove('ingame'); back.style.display = 'none'; $('pause').classList.remove('hidden'); });
    this.backBtn = back;
    // hover sounds
    document.querySelectorAll('button, .mode').forEach(b => b.addEventListener('mouseenter', () => this.audio.ui('hover')));
  }

  ingamePanel(name) {
    $('pause').classList.add('hidden');
    $('menu').classList.remove('hidden'); $('menu').classList.add('ingame');
    document.querySelector('.menu-left').style.display = 'none';
    this.openPanel(name);
    this.backBtn.style.display = 'block';
  }

  bindSettings() {
    // tabs
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
    }));
    // presets
    const pc = $('presets');
    pc.innerHTML = PRESET_ORDER.map(k => `<button data-p="${k}">${PRESETS[k].label}</button>`).join('');
    let gfxTimer = null;
    const scheduleGfx = () => { clearTimeout(gfxTimer); gfxTimer = setTimeout(() => { saveSettings(); markPending(); this.applyGraphics(); this.trialT = 5; }, 250); };
    const refresh = () => {
      const g = gfx();
      pc.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === settings.preset));
      $('presetBlurb').textContent = PRESETS[settings.preset].blurb + (Object.keys(settings.overrides).length ? '  (customised)' : '') + (DEVICE.mobile && (settings.preset === 'ultra' || settings.preset === 'blowup') ? '  Limited on phones/tablets so it can\'t crash.' : '');
      const setR = (id, v, fmt) => { const el = $(id); el.value = v; el.nextElementSibling.textContent = fmt ? fmt(v) : v; };
      setR('setScale', g.pixelRatio, v => Math.round(v * 100) + '%'); setR('setDraw', g.drawDistance, v => v + ' m'); setR('setGrass', g.grassDensity, v => Math.round(v * 100) + '%');
      $('setShadows').value = g.shadows ? String(g.shadowSize) : '0'; $('setTex').value = String(g.texSize); $('setAA').value = g.aa;
      $('setPost').checked = g.post; $('setBloom').checked = g.bloom; $('setAO').checked = g.ao; $('setFps').checked = settings.showFps;
      setR('setSens', settings.sensitivity, v => (+v).toFixed(2)); setR('setAdsSens', settings.adsSensitivity, v => (+v).toFixed(2)); setR('setFov', settings.fov, v => v + '°');
      $('setSprint').value = settings.sprintMode; $('setInvert').checked = settings.invertY;
      $('setTouch').value = settings.touchControls || 'auto'; setR('setTouchSens', settings.touchSens || 1, v => (+v).toFixed(2));
      setR('setVol', settings.volume, v => Math.round(v * 100) + '%'); setR('setAmb', settings.ambientVolume, v => Math.round(v * 100) + '%');
      setR('setBob', settings.headBob, v => Math.round(v * 100) + '%'); $('setCross').value = settings.crosshairColor; $('setDot').checked = settings.crosshairDot;
    };
    pc.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      settings.preset = b.dataset.p; settings.overrides = {}; refresh(); scheduleGfx();
      if (b.dataset.p === 'blowup') this.hud.toast('Your GPU fan has entered low orbit.');
    }));
    const ov = (key, val) => { settings.overrides[key] = val; refresh(); scheduleGfx(); };
    $('setScale').addEventListener('input', e => ov('pixelRatio', +e.target.value));
    $('setDraw').addEventListener('input', e => ov('drawDistance', +e.target.value));
    $('setGrass').addEventListener('input', e => { const v = +e.target.value; settings.overrides.grassDensity = v; settings.overrides.grassDistance = Math.max(gfx().grassDistance, v > 0 ? 30 : 0); refresh(); scheduleGfx(); });
    $('setShadows').addEventListener('change', e => { const v = +e.target.value; settings.overrides.shadows = v > 0; if (v > 0) { settings.overrides.shadowSize = v; settings.overrides.shadowRange = { 512: 28, 1024: 42, 2048: 58, 4096: 75, 8192: 105 }[v]; settings.overrides.shadowSoft = v >= 2048; } refresh(); scheduleGfx(); });
    $('setTex').addEventListener('change', e => ov('texSize', +e.target.value));
    $('setAA').addEventListener('change', e => ov('aa', e.target.value));
    $('setPost').addEventListener('change', e => ov('post', e.target.checked));
    $('setBloom').addEventListener('change', e => ov('bloom', e.target.checked));
    $('setAO').addEventListener('change', e => ov('ao', e.target.checked));
    $('setFps').addEventListener('change', e => { settings.showFps = e.target.checked; saveSettings(); });
    const sv = (id, key, num = true) => $(id).addEventListener('input', e => { settings[key] = num ? +e.target.value : e.target.value; refresh(); saveSettings(); if (key === 'volume' || key === 'ambientVolume') this.audio.setVolume(settings.volume, settings.ambientVolume); });
    sv('setSens', 'sensitivity'); sv('setAdsSens', 'adsSensitivity'); sv('setFov', 'fov'); sv('setVol', 'volume'); sv('setAmb', 'ambientVolume'); sv('setBob', 'headBob');
    $('setSprint').addEventListener('change', e => { settings.sprintMode = e.target.value; saveSettings(); });
    $('setInvert').addEventListener('change', e => { settings.invertY = e.target.checked; saveSettings(); });
    $('setTouch').addEventListener('change', e => { settings.touchControls = e.target.value; saveSettings(); this.touch.refreshEnabled(); this.updateRotateHint(); });
    sv('setTouchSens', 'touchSens');
    $('setCross').addEventListener('input', e => { settings.crosshairColor = e.target.value; saveSettings(); });
    $('setDot').addEventListener('change', e => { settings.crosshairDot = e.target.checked; saveSettings(); });
    refresh();
  }

  buildBuy() {
    const card = (id) => {
      const d = WEAPONS[id];
      const dmg = Math.min(100, (d.damage * (d.pellets || 1)) / 1.6), rate = Math.min(100, 8 / d.interval), mob = Math.min(100, (d.moveMul - 0.75) * 330);
      return `<div class="card" data-id="${id}"><b>${d.name}</b><p>${d.blurb}</p><div class="stat">DMG<i style="--v:${dmg}%"></i></div><div class="stat">RATE<i style="--v:${rate}%"></i></div><div class="stat">MOB<i style="--v:${mob}%"></i></div></div>`;
    };
    $('buyPrimary').innerHTML = PRIMARIES.map(card).join('');
    $('buySecondary').innerHTML = SECONDARIES.map(card).join('');
    document.querySelectorAll('#buy .card').forEach(c => c.addEventListener('click', () => {
      this.audio.ui('click');
      const id = c.dataset.id, slot = WEAPONS[id].slot;
      const lo = this.game.playerLoadout;
      if (slot === 1) lo.primary = id; else lo.secondary = id;
      this.refreshBuy();
      const p = this.game.playerActor;
      if (p && p.alive && this.canBuyNow()) {
        p.loadout = { ...lo };
        const ws = new (p.weapons[1].constructor)(id);
        p.weapons[slot] = ws; p.equip(slot, true);
        this.hud.toast(`Equipped ${WEAPONS[id].name}`);
      } else this.hud.toast(`${WEAPONS[id].name} — applies when you respawn`);
    }));
  }
  canBuyNow() { const g = this.game; return g.phase === 'freeze' || (g.time - g.playerActor.spawnTime) < 15; }
  refreshBuy() {
    const lo = this.game.playerLoadout || {};
    document.querySelectorAll('#buy .card').forEach(c => c.classList.toggle('on', c.dataset.id === lo.primary || c.dataset.id === lo.secondary));
    $('buyNote').textContent = this.canBuyNow() ? 'Buy time active — picks are equipped instantly with full ammo.' : 'Buy time is over — your picks apply on your next spawn.';
  }
  openBuy() { this.state = 'buy'; this.refreshBuy(); $('buy').classList.remove('hidden'); this.input.unlock(); }
  closeBuy() { $('buy').classList.add('hidden'); if (this.state === 'buy') { this.state = 'playing'; this.input.lock(); } }

  startGame() {
    this.audio.init();
    settings.mode = this.mode;
    settings.teamSize = +$('optTeamSize').value; settings.botCount = +$('optBots').value; settings.roundsToWin = +$('optRounds').value;
    settings.difficulty = $('optDiff').value; settings.playerName = ($('optName').value || 'You').slice(0, 16);
    saveSettings();
    this.game.playerLoadout = { primary: $('optPrimary').value, secondary: $('optSecondary').value };
    $('menu').classList.add('hidden'); this.openPanel(null);
    for (const id of ['death', 'pause', 'matchend', 'buy']) $(id).classList.add('hidden');
    this.hud.show(true);
    this.game.start({ mode: this.mode, team: $('optTeam').value, teamSize: settings.teamSize, botCount: settings.botCount });
    this.state = 'playing';
    this.input.lock();
    markPending(); this.trialT = 6;
    if (this.input.touchMode) {
      // phones: go fullscreen + landscape where the browser allows it
      try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); } catch (e) { /* not supported */ }
      try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ }
    }
  }

  onLockChange(locked) {
    if (!locked && this.state === 'playing') this.pause();
    if (locked) $('clickToPlay').classList.add('hidden');
  }
  pause() { this.state = 'paused'; $('pause').classList.remove('hidden'); this.touch.scoresOn = false; this.hud.scores(false, this.game); }
  resume() {
    $('pause').classList.add('hidden'); $('clickToPlay').classList.add('hidden');
    this.state = this.game.playerActor && !this.game.playerActor.alive ? 'dead' : 'playing';
    if (this.state === 'playing') this.input.lock(); else $('death').classList.remove('hidden');
  }
  onPlayerDeath() { this.state = 'dead'; $('buy').classList.add('hidden'); this.hud.scores(false, this.game); this.input.unlock(); }
  onPlayerRespawn() { this.state = 'playing'; this.hud.hideDeath(); this.input.lock(); }
  onAutoRespawn() { this.state = 'playing'; this.hud.hideDeath(); if (this.input.touchMode) this.input.lock(); else if (!this.input.locked) $('clickToPlay').classList.remove('hidden'); }
  showMatchEnd(text) {
    this.state = 'over'; this.input.unlock();
    $('death').classList.add('hidden'); $('buy').classList.add('hidden');
    $('endTitle').textContent = text;
    this.hud.renderScores(this.game);
    $('endScores').innerHTML = $('scoreboard').innerHTML;
    $('matchend').classList.remove('hidden');
  }
  quitToMenu() {
    this.game.clear(); this.game.running = false;
    this.input.unlock();
    document.querySelector('.menu-left').style.display = '';
    this.backBtn.style.display = 'none';
    this.showMenu();
  }

  // ---------------- loop ----------------
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.trialT > 0) { this.trialT -= dt; if (this.trialT <= 0) markGood(); }
    const input = this.input, cam = this.camera;
    try {
      if (this.state === 'menu' || this.state === 'loading') {
        const a = this.time * 0.035;
        cam.position.set(-28 + Math.cos(a) * 78, 26 + Math.sin(this.time * 0.11) * 4, Math.sin(a) * 78);
        cam.lookAt(-38, 4, 0);
        const v = vFovFromH(settings.fov, cam.aspect); if (Math.abs(cam.fov - v) > 0.01) { cam.fov = v; cam.updateProjectionMatrix(); }
        this.world.update(dt, this.time, cam, cam.position);
        this.effects.update(dt, cam);
        this.renderer.render(false);
        this.touch.setVisible(false);
        input.endFrame();
        return;
      }
      const g = this.game, P = g.playerActor;
      const active = this.state === 'playing' || this.state === 'dead' || this.state === 'buy' || this.state === 'over';
      if (this.state === 'playing' || this.state === 'buy') {
        if (input.hit('KeyB') && P.alive) { if (this.state === 'buy') this.closeBuy(); else this.openBuy(); }
      }
      if (active) {
        g.update(dt, input, this.state === 'buy' || this.state === 'over');
        if (!input.touchMode) this.hud.scores(input.down('Tab') && this.state === 'playing', g);
      }
      g.player.updateCamera(dt, cam);
      const w = P.w, m = P.mover;
      this.vm.update(dt, cam, {
        lookDX: g.player.lookDX, lookDY: g.player.lookDY, speed: m.hSpeed, sprint: m.sprinting, crouch: m.crouch, onGround: m.onGround,
        ads: P.ads, stepPhase: m.stepPhase, bobScale: settings.headBob, dodge: m.dodging ? -P.input.right : 0, strafe: P.input.right,
      });
      const scoped = w.def.scope && P.ads > 0.9 && w.zoom > 0;
      const showVM = P.alive && g.player.camBlend < 0.5 && !scoped;
      this.world.update(dt, this.time, cam, P.alive ? m.pos : cam.position);
      this.effects.update(dt, cam);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      this.audio.setListener(cam.position, fwd);
      this.audio.ambience(dt, cam.position);
      this.hud.update(dt, g, cam);
      this.renderer.setLowHp(P.alive ? Math.max(0, 1 - P.health / 35) : 0.6);
      this.renderer.render(showVM);
      this.touch.setVisible(this.state === 'playing');
      this.touch.update(g);
    } catch (e) {
      console.error(e);
    }
    input.endFrame();
  }
}

const app = new App();
app.init().catch(e => { console.error(e); $('loadText').textContent = 'Failed to start: ' + e.message + ' (WebGL2 required)'; });
