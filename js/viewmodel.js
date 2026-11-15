// First-person viewmodel rendered in its own scene/camera (no wall clipping).
// A gloved right arm grips whichever item is equipped (left hand supports
// long guns), with sway, bob, sprint pose, ADS alignment, recoil, reload,
// melee swings, equip and inspect animations.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WEAPONS, buildWeaponModel } from './weapons.js';
import { damp, clamp, lerp } from './noise.js';
import { SUN_DIR } from './world/sky.js';

const V3 = THREE.Vector3;
const POSE = {
  rifle: { hip: new V3(0.16, -0.155, -0.45), rot: new THREE.Euler(0.02, 0.08, 0.02), adsD: 0.17 },
  smg: { hip: new V3(0.15, -0.14, -0.4), rot: new THREE.Euler(0.02, 0.08, 0.02), adsD: 0.2 },
  shotgun: { hip: new V3(0.16, -0.155, -0.45), rot: new THREE.Euler(0.02, 0.08, 0.02), adsD: 0.17 },
  sniper: { hip: new V3(0.16, -0.17, -0.48), rot: new THREE.Euler(0.02, 0.08, 0.02), adsD: 0.05 },
  pistol: { hip: new V3(0.13, -0.12, -0.42), rot: new THREE.Euler(0.03, 0.08, 0), adsD: 0.38 },
  knife: { hip: new V3(0.15, -0.16, -0.34), rot: new THREE.Euler(0.55, -0.4, 0.3), adsD: 0.3 },
  axe: { hip: new V3(0.2, -0.36, -0.42), rot: new THREE.Euler(0.15, 0.25, -0.25), adsD: 0.3 },
};

function glove(mat, sleeveMat, cuffMat) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.09, 0.075, 2, 0.012), mat); palm.position.set(0.026, -0.03, 0.0); hand.add(palm);
  // fingers wrapped around the grip (in front, -Z side)
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group(); f.position.set(0.018, -0.005 - i * 0.021, -0.03); hand.add(f);
    const s1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.022, 3, 8), mat); s1.rotation.z = Math.PI / 2; s1.position.set(-0.016, 0, -0.004); f.add(s1);
    const s2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.016, 3, 8), mat); s2.rotation.z = Math.PI / 2; s2.position.set(-0.04, 0, 0.012); s2.rotation.y = 0.9; f.add(s2);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.035, 3, 8), mat); th.position.set(-0.015, 0.012, -0.012); th.rotation.set(0.5, 0, 0.9); hand.add(th);
  const knuckle = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.08, 0.03, 2, 0.008), cuffMat); knuckle.position.set(0.04, -0.03, -0.022); hand.add(knuckle);
  return hand;
}

export class ViewModel {
  constructor(tex, mats) {
    this.tex = tex;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.008, 20);
    this.sun = new THREE.DirectionalLight(0xffe2c2, 2.8); this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd3f2, 0x6d5c42, 1.1); this.scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.9); this.fill.position.set(-0.4, 0.6, 1); this.scene.add(this.fill);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.holder = new THREE.Group(); this.root.add(this.holder);
    this.weaponSlot = new THREE.Group(); this.holder.add(this.weaponSlot);
    this.mats = mats;
    // arms
    this.rHand = glove(mats.gear, mats.uniform, mats.vest);
    this.lHand = glove(mats.gear, mats.uniform, mats.vest); this.lHand.scale.x = -1;
    this.rFore = this._forearm(mats); this.lFore = this._forearm(mats);
    for (const o of [this.rHand, this.lHand, this.rFore, this.lFore]) this.holder.add(o);
    this.models = {};
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.flash, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.12); this.flash.visible = false; this.holder.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.5); this.holder.add(this.flashLight);
    this.state = { swayX: 0, swayY: 0, swayR: 0, kick: 0, kickRot: 0, bob: 0, equip: 1, sprint: 0, ads: 0, flashT: 0, inspect: 0, slide: 0, crouch: 0, land: 0 };
    this.id = null; this.def = null; this.model = null;
    this.reloadT = -1; this.reloadDur = 1; this.meleeT = -1; this.boltT = -1; this.pumpT = -1;
  }

  _forearm(mats) {
    const g = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.043, 0.3, 4, 12), mats.uniform);
    sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.19; g.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.05, 12), mats.gear);
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.035; g.add(cuff);
    const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.018, 12), mats.vest);
    watch.rotation.x = Math.PI / 2; watch.position.z = 0.075; g.add(watch);
    return g;
  }

  setMaterials(mats) {
    // team change: rebuild arms with new materials
    for (const o of [this.rHand, this.lHand, this.rFore, this.lFore]) this.holder.remove(o);
    this.mats = mats;
    this.rHand = glove(mats.gear, mats.uniform, mats.vest);
    this.lHand = glove(mats.gear, mats.uniform, mats.vest); this.lHand.scale.x = -1;
    this.rFore = this._forearm(mats); this.lFore = this._forearm(mats);
    for (const o of [this.rHand, this.lHand, this.rFore, this.lFore]) this.holder.add(o);
  }

  equip(id) {
    if (this.model) this.weaponSlot.remove(this.model);
    if (!this.models[id]) {
      const m = buildWeaponModel(id, this.tex);
      m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      this.models[id] = m;
    }
    this.id = id; this.def = WEAPONS[id]; this.model = this.models[id];
    this.weaponSlot.add(this.model);
    this.state.equip = 0; this.reloadT = -1; this.meleeT = -1; this.boltT = -1; this.pumpT = -1; this.state.inspect = 0;
    const ud = this.model.userData;
    if (ud.mag) ud.mag.userData.home = ud.mag.userData.home || ud.mag.position.clone();
    if (ud.slide) ud.slide.position.z = 0;
    const kind = this.def.kind;
    this.pose = POSE[kind === 'melee' ? id === 'axe' ? 'axe' : 'knife' : kind];
  }

  onFire() {
    const k = this.def.kind;
    this.state.kick += k === 'sniper' || k === 'shotgun' ? 1 : (k === 'pistol' ? 0.7 : 0.45);
    this.state.kickRot += k === 'sniper' || k === 'shotgun' ? 1 : 0.5;
    this.state.flashT = 0.05;
    this.flash.material.rotation = Math.random() * 6.28;
    this.state.slide = 1;
    if (k === 'sniper') this.boltT = 0;
    if (k === 'shotgun') this.pumpT = 0;
    this.state.inspect = 0;
  }
  onReload(dur) { this.reloadT = 0; this.reloadDur = dur; this.state.inspect = 0; }
  onMelee() { this.meleeT = 0; }
  onInspect() { if (this.reloadT < 0) this.state.inspect = 2.6; }
  onLand(v) { this.state.land = Math.min(1, v / 10); }

  update(dt, cam, st) {
    // st: { lookDX, lookDY, speed, sprint, crouch, onGround, ads (0..1), stepPhase, bobScale, dodge }
    const S = this.state, p = this.pose;
    if (!p) return;
    this.camera.aspect = cam.aspect; this.camera.fov = lerp(54, 44, S.ads * (this.def.kind === 'sniper' ? 0 : 1)); this.camera.updateProjectionMatrix();
    // light in camera space
    const inv = cam.quaternion.clone().invert();
    this.sun.position.copy(SUN_DIR).applyQuaternion(inv).multiplyScalar(5);
    this.hemi.position.set(0, 1, 0).applyQuaternion(inv);

    S.ads = damp(S.ads, st.ads, 22, dt);
    S.sprint = damp(S.sprint, st.sprint && st.onGround ? 1 : 0, 10, dt);
    S.crouch = damp(S.crouch, st.crouch, 10, dt);
    S.equip = Math.min(1, S.equip + dt / 0.38);
    S.kick = damp(S.kick, 0, 16, dt); S.kickRot = damp(S.kickRot, 0, 12, dt);
    S.slide = damp(S.slide, 0, 24, dt);
    S.land = damp(S.land, 0, 8, dt);
    S.flashT -= dt;
    S.inspect = Math.max(0, S.inspect - dt);
    const adsK = S.ads * (1 - S.sprint);
    // sway
    const swayAmt = 1 - adsK * 0.8;
    S.swayX = damp(S.swayX, clamp(-st.lookDX * 0.0006, -0.04, 0.04) * swayAmt, 9, dt);
    S.swayY = damp(S.swayY, clamp(st.lookDY * 0.0006, -0.04, 0.04) * swayAmt, 9, dt);
    S.swayR = damp(S.swayR, clamp(-st.lookDX * 0.0025, -0.12, 0.12) * swayAmt, 7, dt);
    // bob
    const amp = clamp(st.speed / 4.7, 0, 1.5) * (st.onGround ? 1 : 0.2) * st.bobScale * (1 - adsK * 0.85);
    const ph = st.stepPhase * Math.PI;
    const bx = Math.sin(ph) * 0.011 * amp * (1 + S.sprint * 0.8), by = -Math.abs(Math.cos(ph)) * 0.009 * amp * (1 + S.sprint);
    const idle = Math.sin(performance.now() * 0.0012) * 0.0025 * (1 - adsK);

    // base position (hip <-> ADS)
    const sight = this.model.userData.sight || new V3(0, 0.09, -0.1);
    const adsPos = new V3(-sight.x, -sight.y, -p.adsD - sight.z);
    const pos = p.hip.clone().lerp(adsPos, adsK);
    const rot = new THREE.Euler(p.rot.x * (1 - adsK), p.rot.y * (1 - adsK), p.rot.z * (1 - adsK));
    // sprint pose
    const sp = S.sprint * (this.reloadT >= 0 ? 0.3 : 1);
    pos.add(new V3(-0.04 * sp, -0.05 * sp, 0.03 * sp));
    rot.x += -0.3 * sp; rot.y += 0.75 * sp; rot.z += 0.35 * sp;
    // crouch / land dip
    pos.y -= S.land * 0.03 + S.crouch * 0.008;
    // equip
    const e = 1 - Math.pow(1 - S.equip, 3);
    pos.y -= (1 - e) * 0.25; rot.x -= (1 - e) * 0.8;
    // kick
    const kickBack = this.def.kind === 'sniper' ? 0.06 : (this.def.kind === 'shotgun' ? 0.07 : 0.025);
    pos.z += S.kick * kickBack * (1 - adsK * 0.4);
    rot.x += S.kickRot * (this.def.kind === 'pistol' ? 0.22 : 0.08) * (1 - adsK * 0.6);
    pos.y += S.kickRot * 0.006;

    // reload animation
    const ud = this.model.userData;
    let leftOff = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const t = clamp(this.reloadT / this.reloadDur, 0, 1);
      if (this.def.shellReload) {
        const k = Math.sin(t * Math.PI);
        rot.z += 0.35 * k; rot.x += 0.12 * k; pos.y -= 0.03 * k;
        leftOff = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      } else {
        const tilt = Math.sin(Math.min(1, t / 0.85) * Math.PI);
        rot.z += 0.55 * tilt; rot.x += 0.18 * tilt; pos.y -= 0.035 * tilt; pos.x -= 0.02 * tilt;
        if (ud.mag) {
          const home = ud.mag.userData.home;
          let drop = 0;
          if (t < 0.3) drop = t / 0.3; else if (t < 0.45) drop = 1 + (t - 0.3) * 6; else if (t < 0.7) drop = 1 - (t - 0.45) / 0.25; else drop = 0;
          ud.mag.position.set(home.x, home.y - drop * 0.22, home.z + drop * 0.04);
          ud.mag.visible = !(t > 0.38 && t < 0.48);
        }
        leftOff = t < 0.7 ? Math.min(1, t / 0.15) : Math.max(0, 1 - (t - 0.7) / 0.2);
        if (ud.slide && t > 0.82) ud.slide.position.z = Math.sin((t - 0.82) / 0.18 * Math.PI) * 0.03;
      }
      if (t >= 1) { this.reloadT = -1; if (ud.mag) { ud.mag.position.copy(ud.mag.userData.home); ud.mag.visible = true; } }
    }
    if (ud.slide && this.reloadT < 0) ud.slide.position.z = S.slide * 0.022;
    if (ud.bolt) {
      if (this.boltT >= 0) {
        this.boltT += dt;
        const t = (this.boltT - 0.25) / 0.85;
        if (t > 0 && t < 1) { const k = Math.sin(t * Math.PI); ud.bolt.rotation.z = -k * 1.2; ud.bolt.position.z = 0.02 + Math.max(0, Math.sin(t * Math.PI * 1.0)) * 0.07; rot.z += k * 0.15; }
        if (t >= 1) { this.boltT = -1; ud.bolt.rotation.z = 0; ud.bolt.position.z = 0.02; }
      }
    }
    if (ud.pump) {
      if (this.pumpT >= 0) {
        this.pumpT += dt;
        const t = (this.pumpT - 0.18) / 0.4;
        if (t > 0 && t < 1) { ud.pump.position.z = Math.sin(t * Math.PI) * 0.08; leftOff = -Math.sin(t * Math.PI) * 0.3; rot.x += Math.sin(t * Math.PI) * 0.06; }
        if (t >= 1) { this.pumpT = -1; ud.pump.position.z = 0; }
      }
    }
    // melee
    if (this.meleeT >= 0) {
      this.meleeT += dt;
      const dur = this.id === 'axe' ? 0.7 : 0.38;
      const t = clamp(this.meleeT / dur, 0, 1);
      if (this.id === 'axe') {
        const up = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.25;
        const down = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.2);
        rot.x += up * 0.9 - down * 1.4 * (1 - Math.max(0, (t - 0.7) / 0.3));
        pos.y += up * 0.12 - down * 0.08 * (1 - Math.max(0, (t - 0.7) / 0.3)); pos.z -= down * 0.15 * (1 - Math.max(0, (t - 0.7) / 0.3));
      } else {
        const s = Math.sin(t * Math.PI);
        pos.x -= s * 0.2; pos.z -= s * 0.12; pos.y += s * 0.03;
        rot.y += s * 1.1; rot.z -= s * 0.6; rot.x -= s * 0.2;
      }
      if (t >= 1) this.meleeT = -1;
    }
    // inspect
    if (S.inspect > 0) {
      const k = Math.sin(Math.min(1, (2.6 - S.inspect) / 2.6) * Math.PI);
      rot.y -= k * 0.9; rot.z += k * 0.45; rot.x += k * 0.2; pos.x -= k * 0.06; pos.z += k * 0.04;
    }

    this.holder.position.set(pos.x + S.swayX + bx, pos.y + S.swayY + by + idle, pos.z);
    this.holder.rotation.set(rot.x + S.swayY * 2.5, rot.y + S.swayX * 2, rot.z + S.swayR + (st.dodge || 0) * 0.2);
    this.root.rotation.z = damp(this.root.rotation.z, (st.strafe || 0) * -0.03, 8, dt);

    this._placeArms(leftOff);
    // muzzle flash
    const mz = ud.muzzle;
    this.flash.visible = S.flashT > 0 && !!mz;
    this.flashLight.intensity = S.flashT > 0 ? 6 : 0;
    if (mz) { this.flash.position.copy(mz); this.flashLight.position.copy(mz); }
  }

  _placeArms(leftOff) {
    const ud = this.model.userData, kind = this.def.kind;
    const upright = ud.upright;
    // right hand at the grip
    this.rHand.position.set(0, upright ? 0.0 : -0.012, upright ? 0.0 : 0.012);
    this.rHand.rotation.set(upright ? 0 : -0.28, 0, upright ? 0 : 0);
    if (kind === 'melee' && !upright) { this.rHand.rotation.set(Math.PI / 2, 0, 0); this.rHand.position.set(0, 0.0, -0.01); }
    const rElbow = new V3(0.14, -0.26, 0.36);
    this._orientFore(this.rFore, this.rHand.position.clone().add(new V3(0.022, -0.06, 0.04)), rElbow);
    // left hand on the support
    const twoHand = kind === 'rifle' || kind === 'smg' || kind === 'shotgun' || kind === 'sniper';
    this.lHand.visible = this.lFore.visible = twoHand || kind === 'pistol';
    if (twoHand) {
      const s = (ud.support || new V3(0, 0, -0.3)).clone();
      if (ud.pump) s.z += ud.pump.position.z;
      s.y -= leftOff * 0.18; s.x -= leftOff * 0.05;
      this.lHand.position.copy(s).add(new V3(0.0, -0.02, 0));
      this.lHand.rotation.set(-1.2, 0.0, -1.25);
      this._orientFore(this.lFore, this.lHand.position.clone().add(new V3(-0.04, -0.03, 0.02)), new V3(-0.2, -0.24, s.z + 0.32));
    } else if (kind === 'pistol') {
      this.lHand.position.set(-0.03, -0.04, 0.005);
      this.lHand.rotation.set(-0.3, 0.2, -0.2);
      this._orientFore(this.lFore, this.lHand.position.clone().add(new V3(-0.03, -0.05, 0.04)), new V3(-0.16, -0.24, 0.3));
    }
  }
  _orientFore(fore, wrist, elbow) {
    fore.position.copy(wrist);
    const dir = elbow.clone().sub(wrist).normalize();
    fore.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
  }

  render(renderer) { renderer.render(this.scene, this.camera); }
}
