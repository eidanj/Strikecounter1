// Local player: keyboard/mouse -> Actor input, plus the first/third-person
// camera rig with head bob, sprint tilt, landing dip and a smooth C toggle.
import * as THREE from 'three';
import { settings } from './settings.js';
import { tryFire, startReload } from './combat.js';
import { clamp, damp, lerp, smoothstep } from './noise.js';

const V3 = THREE.Vector3;
export function vFovFromH(h, aspect) { return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / aspect)); }

export class PlayerController {
  constructor(game, actor) {
    this.g = game; this.a = actor;
    this.thirdPerson = false; this.camBlend = 0; this.sprintActive = false;
    this.bobPhase = 0; this.bobAmp = 0; this.roll = 0; this.lookDX = 0; this.lookDY = 0; this.strafe = 0;
    this.camPos = new V3(); this.fov = 70; this.deadCamT = 0;
    this.shoulder = 1; this._aimPoint = new V3();
    this.firing = false;
  }
  attach(actor) { this.a = actor; this.sprintActive = false; }

  update(dt, input, uiBlocked) {
    const a = this.a, g = this.g, m = a.mover;
    this.lookDX = input.mouse.dx; this.lookDY = input.mouse.dy;
    if (input.hit('KeyC')) { this.thirdPerson = !this.thirdPerson; g.hud.toast(this.thirdPerson ? 'Third-person camera' : 'First-person camera'); }
    if (!a.alive) return;
    const frozen = !g.canMove();
    // look
    const baseV = vFovFromH(settings.fov, g.camera.aspect);
    const sens = 0.0021 * settings.sensitivity * (a.ads > 0.5 ? settings.adsSensitivity * (this.fov / baseV) : 1);
    a.yaw -= input.mouse.dx * sens;
    a.pitch -= input.mouse.dy * sens * (settings.invertY ? -1 : 1);
    a.pitch = clamp(a.pitch, -1.5, 1.5);
    if (uiBlocked) { a.input.fwd = a.input.right = 0; a.input.jump = a.input.dodge = false; return; }

    // movement
    let fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    let right = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const T = input.touch;
    if (input.touchMode) { fwd = clamp(fwd + T.fwd, -1, 1); right = clamp(right + T.right, -1, 1); }
    if (frozen) { fwd = 0; right = 0; }
    // sprint: double-tap W
    if (input.doubleTap('KeyW')) {
      if (settings.sprintMode === 'toggle') this.sprintActive = !this.sprintActive;
      else this.sprintActive = true;
      if (m.exhausted) g.hud.flashStamina();
    }
    if (settings.sprintMode === 'hold' && !input.down('KeyW')) this.sprintActive = false;
    const crouch = input.down('ShiftLeft') || input.down('ShiftRight') || (input.touchMode && T.crouch);
    const firing = input.mouse.left && a.w.isGun;
    if (crouch || a.adsHeld || firing || m.exhausted) this.sprintActive = false;
    if (settings.sprintMode === 'toggle' && fwd <= 0 && m.hSpeed < 0.5) this.sprintActive = false;
    if (input.touchMode) this.sprintActive = T.sprint && !m.exhausted && !firing; // touch: push the stick to the edge
    this.strafe = damp(this.strafe, right, 8, dt);

    a.input.fwd = fwd; a.input.right = right;
    a.input.jump = input.hit('Space') && !frozen;
    a.input.crouch = crouch;
    a.input.sprint = this.sprintActive && fwd > 0;
    a.input.dodge = input.hit('KeyQ') && !frozen;
    a.input.dodgeSide = right !== 0 ? Math.sign(right) : 1;
    a.input.yaw = a.yaw;

    // weapons
    for (let s = 1; s <= 4; s++) if (input.hit('Digit' + s)) a.equip(s);
    if (input.mouse.wheel) {
      let s = a.slot + (input.mouse.wheel > 0 ? 1 : -1);
      if (s > 4) s = 1; if (s < 1) s = 4;
      a.equip(s);
    }
    if (input.hit('KeyR')) startReload(a, g);
    if (input.hit('KeyF') && g.vm) g.vm.onInspect();
    const w = a.w;
    // ADS / scope
    if (w.def.scope) {
      if (input.mouse.rightPressed && w.reloading <= 0) { w.zoom = (w.zoom + 1) % 3; }
      a.adsHeld = w.zoom > 0;
    } else a.adsHeld = (input.mouse.right || (input.touchMode && T.ads)) && w.isGun;
    const canAds = a.adsHeld && w.isGun && w.reloading <= 0 && !m.sprinting;
    const adsTime = w.def.adsTime || 0.2;
    a.ads = clamp(a.ads + (canAds ? dt : -dt) / adsTime, 0, 1);
    // fire (not while sprinting; firing cancels sprint)
    if (!m.sprinting && !frozen) tryFire(a, g, input.mouse.leftPressed, input.mouse.left);
    else if (frozen && input.mouse.leftPressed) g.hud.toast('Wait for the round to start!');
  }

  // aim origin/direction for bullets (third-person converges on the crosshair point)
  aimOrigin(out) { return this.a.eye(out); }
  aimDirection(out) {
    const a = this.a;
    if (this.camBlend < 0.5) return a.aimDir(out);
    const cam = this.g.camera;
    const f = new V3(0, 0, -1).applyQuaternion(cam.quaternion);
    const col = this.g.world.col;
    const h = col.raycast(cam.position.x, cam.position.y, cam.position.z, f.x, f.y, f.z, 400, 'bullets');
    const p = h ? new V3(h.x, h.y, h.z) : cam.position.clone().addScaledVector(f, 400);
    const e = a.eye(new V3());
    if (p.distanceTo(e) < 1.5) return a.aimDir(out);
    return out.copy(p).sub(e).normalize();
  }

  updateCamera(dt, cam) {
    const a = this.a, m = a.mover, g = this.g;
    const w = a.w;
    const scoped = w.def.scope && a.ads > 0.9 && w.zoom > 0;
    // in scope always use first person
    const wantTP = this.thirdPerson && !(w.def.scope && a.adsHeld);
    const k = 1 / 0.35;
    this.camBlend = clamp(this.camBlend + (wantTP ? dt : -dt) * k, 0, 1);
    const blend = smoothstep(0, 1, this.camBlend);

    if (!a.alive) { this.deathCamera(dt, cam); return; }
    this.deadCamT = 0;
    // head bob (side-to-side), faster + tilt when sprinting
    const moving = m.onGround && m.hSpeed > 0.6;
    const freq = m.sprinting ? 2.45 : (m.crouch > 0.5 ? 1.2 : 1.75);
    this.bobAmp = damp(this.bobAmp, moving ? clamp(m.hSpeed / 4.7, 0, 1.35) : 0, 8, dt);
    this.bobPhase += dt * freq * (moving ? 1 : 0.3);
    const bk = settings.headBob * (1 - a.ads * 0.85);
    const s = Math.sin(this.bobPhase * Math.PI * 2);
    const bobX = s * 0.028 * this.bobAmp * bk * (m.sprinting ? 1.25 : 1);
    const bobY = (Math.abs(s) - 0.5) * 0.034 * this.bobAmp * bk * (m.sprinting ? 1.4 : 1);
    const sprintTilt = m.sprinting ? s * 0.016 * bk : 0;
    const dodgeRoll = m.dodging ? -a.input.right * 0.07 : 0;
    this.roll = damp(this.roll, -this.strafe * 0.012 * bk + sprintTilt + dodgeRoll, 10, dt);

    const yaw = a.aimYaw(), pitch = a.aimPitch();
    const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const eye = a.eye(new V3());
    const fp = eye.clone().addScaledVector(right, bobX);
    fp.y += bobY + m.stepSmooth - m.landImpact * 0.1;
    // third-person position
    const fwd = new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const pivot = new V3(m.pos.x, m.pos.y + m.height - 0.1 + m.stepSmooth, m.pos.z).addScaledVector(right, 0.5 * this.shoulder);
    const dist = lerp(2.8, 1.5, a.ads);
    let tp = pivot.clone().addScaledVector(fwd, -dist).add(new V3(0, 0.18, 0));
    const dir = tp.clone().sub(pivot); const dl = dir.length(); dir.normalize();
    const hit = g.world.col.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, dl + 0.3, 'move');
    if (hit) tp = pivot.clone().addScaledVector(dir, Math.max(0.2, hit.t - 0.3));
    cam.position.copy(fp).lerp(tp, blend);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, this.roll * (1 - blend));
    // FOV
    const baseV = vFovFromH(settings.fov, cam.aspect);
    let target = baseV;
    if (w.def.scope) { if (scoped) target = w.zoom === 2 ? w.def.scope[1] : w.def.scope[0]; }
    else if (w.isGun) target = baseV / lerp(1, w.def.adsZoom || 1.2, a.ads);
    if (m.sprinting) target *= 1.06;
    this.fov = damp(this.fov, target, scoped ? 30 : 14, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // character visibility: ghost (shadow only) in first person
    a.char.setGhost(blend < 0.5);
  }

  deathCamera(dt, cam) {
    const a = this.a, g = this.g;
    this.deadCamT += dt;
    a.char.setGhost(false);
    const p = a.mover.pos;
    const ang = a.yaw + Math.PI + this.deadCamT * 0.25;
    const r = 3.5 + Math.min(2.5, this.deadCamT * 1.2);
    const target = new V3(p.x, p.y + 0.6, p.z);
    let pos = new V3(p.x + Math.sin(ang) * r, p.y + 2.2 + Math.min(2, this.deadCamT), p.z + Math.cos(ang) * r);
    const d = pos.clone().sub(target), dl = d.length(); d.normalize();
    const h = g.world.col.raycast(target.x, target.y, target.z, d.x, d.y, d.z, dl, 'move');
    if (h) pos = target.clone().addScaledVector(d, Math.max(0.5, h.t - 0.3));
    cam.position.lerp(pos, 1 - Math.exp(-4 * dt));
    const killer = a.lastAttacker;
    const look = (this.deadCamT > 1.6 && killer && killer.alive) ? killer.center(new V3()) : target;
    const m = new THREE.Matrix4().lookAt(cam.position, look, new V3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    cam.quaternion.slerp(q, 1 - Math.exp(-3 * dt));
    const baseV = vFovFromH(settings.fov, cam.aspect);
    if (Math.abs(cam.fov - baseV) > 0.01) { cam.fov = damp(cam.fov, baseV, 5, dt); cam.updateProjectionMatrix(); }
  }
}
