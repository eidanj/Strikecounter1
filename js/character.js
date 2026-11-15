// Procedural soldier: a bone hierarchy of shaped meshes with gait/crouch/jump
// animation, two-bone IK arms that grip whatever weapon is held, hitboxes
// derived from the live pose, and the Minecraft-style red tip-over death.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp, clamp, lerp } from './noise.js';

const V3 = THREE.Vector3;
const _RED = new THREE.Color(1, 0.35, 0.35);

export function makeTeamMaterials(tex, team) {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const camo = team === 'T' ? tex.camoDesert : (team === 'CT' ? tex.camoUrban : tex.camoDesert);
  const ffa = team === 'FFA';
  return {
    uniform: S({ map: camo.map, normalMap: camo.normalMap, roughness: 0.9, color: ffa ? 0xb8c8a0 : 0xffffff }),
    vest: S({ color: team === 'T' ? 0x6b5a3c : (team === 'CT' ? 0x3c4a60 : 0x4a5a34), roughness: 0.75, map: tex.fabric.map, normalMap: tex.fabric.normalMap }),
    gear: S({ color: 0x2c2d30, roughness: 0.65, map: tex.polymer.map, normalMap: tex.polymer.normalMap }),
    skin: S({ color: team === 'CT' ? 0xd9a888 : 0xc89070, roughness: 0.6 }),
    boots: S({ color: 0x2a2018, roughness: 0.55 }),
    helmet: S({ color: team === 'T' ? 0xb3261e : (team === 'CT' ? 0x2b4f86 : 0x6b7a3a), roughness: 0.5, metalness: 0.1 }),
    accent: S({ color: team === 'T' ? 0xf2a41f : (team === 'CT' ? 0x6fb0ff : 0xe0e0e0), roughness: 0.5, emissive: team === 'T' ? 0x3a2000 : 0x001a3a, emissiveIntensity: 0.4 }),
    lens: S({ color: 0x101418, roughness: 0.05, metalness: 0.6, envMapIntensity: 2 }),
    eye: S({ color: 0x111111, roughness: 0.3 }),
  };
}

function capsule(r, len, mat, sx = 1, sz = 1) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, -(len / 2 + r), 0); // hang down from pivot
  g.scale(sx, 1, sz);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sph(r, mat, x, y, z, sx = 1, sy = 1, sz = 1, ws = 14, hs = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  return m;
}
function bone(parent, x, y, z) { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); return b; }

export class Character {
  constructor(mats, team) {
    this.team = team;
    this.mats = mats;
    const root = this.root = new THREE.Group();
    this.body = bone(root, 0, 0, 0); // tilts on death
    const hips = this.hips = bone(this.body, 0, 0.98, 0);
    hips.add(rbox(0.33, 0.17, 0.22, 0.05, mats.uniform, 0, -0.03, 0));
    hips.add(rbox(0.35, 0.05, 0.24, 0.02, mats.gear, 0, 0.04, 0));
    hips.add(rbox(0.08, 0.06, 0.03, 0.01, mats.accent, 0, 0.04, -0.125));
    hips.add(rbox(0.07, 0.1, 0.06, 0.02, mats.gear, 0.15, -0.02, -0.06));
    hips.add(rbox(0.07, 0.1, 0.06, 0.02, mats.gear, -0.16, -0.02, 0.02));
    const spine = this.spine = bone(hips, 0, 0.06, 0);
    const abd = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.1, 4, 10), mats.uniform);
    abd.position.y = 0.11; abd.scale.set(1.15, 1, 0.82); abd.castShadow = true; spine.add(abd);
    const chest = this.chest = bone(spine, 0, 0.22, 0);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.14, 4, 12), mats.uniform);
    torso.position.y = 0.1; torso.scale.set(1.2, 1, 0.8); torso.castShadow = true; chest.add(torso);
    chest.add(rbox(0.38, 0.34, 0.27, 0.05, mats.vest, 0, 0.08, 0));
    for (let i = 0; i < 3; i++) chest.add(rbox(0.085, 0.12, 0.05, 0.015, mats.vest, -0.11 + i * 0.11, 0.0, -0.155));
    chest.add(rbox(0.06, 0.03, 0.02, 0.01, mats.accent, 0.1, 0.17, -0.142));
    chest.add(rbox(0.32, 0.06, 0.2, 0.02, mats.vest, 0, 0.24, 0.02));
    if (team === 'CT') {
      chest.add(rbox(0.26, 0.3, 0.12, 0.04, mats.gear, 0, 0.08, 0.19));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), mats.gear); ant.position.set(0.09, 0.42, 0.2); chest.add(ant);
    } else {
      const strap = rbox(0.06, 0.5, 0.29, 0.02, mats.gear, 0, 0.08, 0); strap.rotation.z = 0.7; chest.add(strap);
      chest.add(rbox(0.2, 0.22, 0.1, 0.03, mats.vest, 0, 0.04, 0.18));
    }
    const neck = this.neck = bone(chest, 0, 0.25, 0);
    const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10), mats.skin); nk.position.y = 0.03; neck.add(nk);
    const head = this.head = bone(neck, 0, 0.09, 0);
    head.add(sph(0.105, mats.skin, 0, 0.06, 0, 0.93, 1.12, 1.0, 18, 14));
    head.add(sph(0.017, mats.eye, -0.037, 0.08, -0.095)); head.add(sph(0.017, mats.eye, 0.037, 0.08, -0.095));
    head.add(rbox(0.026, 0.045, 0.03, 0.01, mats.skin, 0, 0.05, -0.105));
    head.add(sph(0.025, mats.skin, -0.1, 0.06, 0, 0.5, 1, 0.8)); head.add(sph(0.025, mats.skin, 0.1, 0.06, 0, 0.5, 1, 0.8));
    if (team === 'CT') {
      const hel = new THREE.Mesh(new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.helmet);
      hel.position.y = 0.085; hel.scale.set(1, 0.95, 1.08); hel.castShadow = true; head.add(hel);
      head.add(rbox(0.2, 0.05, 0.05, 0.02, mats.lens, 0, 0.1, -0.1));
      head.add(rbox(0.17, 0.06, 0.06, 0.02, mats.gear, 0, 0.0, -0.085));
    } else {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.helmet);
      cap.position.y = 0.1; cap.scale.set(1.05, 0.75, 1.1); cap.castShadow = true; head.add(cap);
      head.add(rbox(0.13, 0.015, 0.09, 0.006, mats.helmet, 0, 0.11, -0.12));
      head.add(rbox(0.19, 0.075, 0.06, 0.025, mats.accent, 0, 0.0, -0.075));
      head.add(rbox(0.17, 0.04, 0.04, 0.015, mats.lens, 0, 0.165, -0.09));
    }
    this.headTop = head;
    // arms
    const mkArm = (side) => {
      const sh = bone(chest, side * 0.215, 0.2, 0);
      sh.add(sph(0.07, mats.vest, 0, -0.01, 0, 1, 0.9, 1));
      sh.add(capsule(0.056, 0.17, mats.uniform));
      const el = bone(sh, 0, -0.29, 0);
      el.add(capsule(0.05, 0.16, mats.uniform));
      el.add(rbox(0.085, 0.05, 0.085, 0.02, mats.gear, 0, -0.2, 0));
      const hand = bone(el, 0, -0.27, 0);
      hand.add(rbox(0.075, 0.095, 0.04, 0.018, mats.gear, 0, -0.04, 0));
      const th = rbox(0.022, 0.05, 0.022, 0.01, mats.gear, side * -0.035, -0.02, -0.02); th.rotation.z = side * 0.5; hand.add(th);
      return { sh, el, hand, side };
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    // legs
    const mkLeg = (side) => {
      const hp = bone(hips, side * 0.1, -0.05, 0);
      hp.add(capsule(0.078, 0.29, mats.uniform, 1, 1.05));
      if (side > 0) hp.add(rbox(0.06, 0.16, 0.12, 0.02, mats.gear, 0.08, -0.17, 0));
      const kn = bone(hp, 0, -0.44, 0);
      kn.add(rbox(0.1, 0.1, 0.06, 0.03, mats.gear, 0, 0.0, -0.05));
      kn.add(capsule(0.062, 0.3, mats.uniform));
      const an = bone(kn, 0, -0.43, 0);
      an.add(rbox(0.105, 0.12, 0.25, 0.035, mats.boots, 0, -0.01, -0.045));
      an.add(rbox(0.11, 0.025, 0.26, 0.01, mats.gear, 0, -0.07, -0.045));
      return { hp, kn, an };
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);

    this.weaponMount = new THREE.Group(); chest.add(this.weaponMount);
    this.weaponModel = null; this.weaponKind = 'rifle';
    this.phase = Math.random() * 10;
    this.crouchSm = 0; this.airSm = 0; this.speedSm = 0; this.kick = 0; this.meleeT = -1; this.reload = 0;
    this.dying = false; this.deathT = 0; this.deathDir = 1;
    this.meshes = []; root.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    this._t = { a: new V3(), b: new V3(), c: new V3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
  }

  setWeapon(model, kind) {
    if (this.weaponModel && this.weaponModel.parent) this.weaponModel.parent.remove(this.weaponModel);
    this.weaponModel = model; this.weaponKind = kind;
    if (!model) return;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.weaponMount.add(model);
    // a newly equipped weapon must match the current first-person "ghost" state
    this._applyGhost(model, !!this._ghost && !this.dying);
  }

  // two-bone IK in chest space; target in chest-local coords
  _ik(arm, target, pole) {
    const { a: S, b: E, c: D } = this._t;
    S.copy(arm.sh.position);
    const la = 0.29, lb = 0.27;
    D.copy(target).sub(S);
    let d = D.length(); d = clamp(d, 0.08, (la + lb) * 0.995);
    D.normalize();
    const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = pole.clone().sub(D.clone().multiplyScalar(pole.dot(D))).normalize();
    E.copy(S).addScaledVector(D, la * cosA).addScaledVector(perp, la * sinA);
    const down = new V3(0, -1, 0);
    const upperDir = E.clone().sub(S).normalize();
    const qU = new THREE.Quaternion().setFromUnitVectors(down, upperDir);
    arm.sh.quaternion.copy(qU);
    const T = S.clone().addScaledVector(D, d);
    const foreDir = T.clone().sub(E).normalize();
    const local = foreDir.applyQuaternion(qU.clone().invert());
    arm.el.quaternion.setFromUnitVectors(down, local);
  }

  animate(dt, st) {
    // st: { speed, sprint, crouch, onGround, aimPitch, kick, reload, melee, dodge, alive }
    if (this.dying) { this._deathAnim(dt); return; }
    const sp = this.speedSm = damp(this.speedSm, st.speed, 10, dt);
    this.crouchSm = damp(this.crouchSm, st.crouch, 12, dt);
    this.airSm = damp(this.airSm, st.onGround ? 0 : 1, 10, dt);
    const c = this.crouchSm, air = this.airSm;
    const stride = st.sprint ? 2.0 : (c > 0.5 ? 1.15 : 1.6);
    this.phase += (sp * dt / stride) * Math.PI;
    const amp = clamp(sp / 4.7, 0, 1.35) * (1 - air * 0.8);
    const ph = this.phase;
    const legs = [[this.legL, ph], [this.legR, ph + Math.PI]];
    for (const [L, p] of legs) {
      const s = Math.sin(p), cs = Math.cos(p);
      let th = s * 0.55 * amp + c * 1.15 + air * 0.55;
      let kn = -(0.08 + 0.95 * amp * Math.max(0, cs)) - c * 2.05 - air * 0.9;
      if (L === this.legR) { th -= air * 0.35; kn += air * 0.4; }
      L.hp.rotation.x = th; L.kn.rotation.x = kn;
      L.an.rotation.x = -(th + kn) * 0.75 + (amp > 0.1 ? Math.max(0, -cs) * 0.2 * amp : 0);
      L.hp.rotation.z = (L === this.legL ? -1 : 1) * (0.03 + c * 0.12);
    }
    const bob = Math.cos(ph * 2) * 0.028 * amp;
    this.hips.position.y = 0.98 - c * 0.42 + bob - air * 0.06;
    this.hips.position.z = c * 0.12;
    this.hips.rotation.y = Math.sin(ph) * 0.08 * amp;
    this.spine.rotation.x = -0.06 * amp - c * 0.32 - (st.sprint ? 0.12 : 0);
    this.spine.rotation.y = -Math.sin(ph) * 0.1 * amp;
    const pitch = clamp(st.aimPitch || 0, -1.3, 1.3);
    this.chest.rotation.x = pitch * 0.55 + c * 0.18 + (st.sprint ? 0.08 : 0);
    this.head.rotation.x = pitch * 0.4;
    this.head.rotation.y = 0;
    this.kick = damp(this.kick, 0, 18, dt);
    if (st.kick) this.kick = Math.min(1, this.kick + st.kick);

    const kind = this.weaponKind;
    if (kind === 'melee') {
      // right hand holds the weapon; swing animation
      this.weaponMount.position.set(0, 0, 0); this.weaponMount.rotation.set(0, 0, 0);
      const m = st.melee >= 0 ? st.melee : -1;
      const swing = m >= 0 ? Math.sin(Math.min(1, m) * Math.PI) : 0;
      this.armR.sh.rotation.set(0.5 + swing * 1.4 - Math.sin(ph) * 0.4 * amp, 0, -0.15 - swing * 0.4);
      this.armR.el.rotation.set(0.9 - swing * 0.6, 0, 0);
      this.armL.sh.rotation.set(0.35 - Math.sin(ph + Math.PI) * 0.5 * amp, 0, 0.2);
      this.armL.el.rotation.set(0.5, 0, 0);
      if (this.weaponModel && this.weaponModel.parent !== this.armR.hand) { this.armR.hand.add(this.weaponModel); this.weaponModel.position.set(0, -0.07, -0.01); this.weaponModel.rotation.set(-Math.PI / 2, 0, 0); }
    } else {
      if (this.weaponModel && this.weaponModel.parent !== this.weaponMount) this.weaponMount.add(this.weaponModel);
      const pistol = kind === 'pistol';
      const sprintLower = st.sprint ? 1 : 0;
      const rl = st.reload > 0 ? Math.sin(Math.min(1, st.reload) * Math.PI) : 0;
      // weapon held in chest space
      const wx = pistol ? 0.02 : 0.1, wy = pistol ? 0.16 : 0.1 - sprintLower * 0.08, wz = pistol ? -0.42 : -0.24;
      this.weaponMount.position.set(wx, wy - rl * 0.06, wz + this.kick * 0.05);
      this.weaponMount.rotation.set(-sprintLower * 0.55 + this.kick * 0.12 + rl * 0.35, sprintLower * 0.5, rl * 0.5);
      this.weaponMount.updateMatrix();
      const W = this.weaponModel;
      if (W) {
        const grip = W.userData.grip || new V3(), sup = W.userData.support || new V3(0, 0.02, -0.2);
        const g = grip.clone().applyMatrix4(this.weaponMount.matrix);
        const s2 = sup.clone().applyMatrix4(this.weaponMount.matrix);
        this._ik(this.armR, g, new V3(0.6, -0.6, 0.4).normalize());
        if (pistol) { const s3 = g.clone().add(new V3(-0.04, -0.01, 0.0)); this._ik(this.armL, s3, new V3(-0.7, -0.6, 0.2).normalize()); }
        else this._ik(this.armL, rl > 0.2 ? s2.clone().add(new V3(0.05, -0.12, 0.1)) : s2, new V3(-0.7, -0.7, 0.1).normalize());
        this.armR.hand.rotation.set(0, 0, 0); this.armL.hand.rotation.set(0, 0, 0);
      }
    }
    // dodge roll lean
    this.body.rotation.z = damp(this.body.rotation.z, (st.dodge || 0) * 0.25, 12, dt);
  }

  startDeath(dirSign = 1) {
    if (this.dying) return;
    // restore real materials first so the red flash is applied to private copies only
    if (this._ghost) { this._applyGhost(this.root, false); this._ghost = false; this.root.userData.hideFromAO = false; }
    this.dying = true; this.deathT = 0; this.deathDir = dirSign;
    this._origMats = new Map(); this._deathMats = [];
    this.root.traverse(o => {
      if (!o.isMesh || this._origMats.has(o)) return;
      const orig = o.material;
      const cm = orig.clone();
      if (cm.emissive) { cm.emissive = new THREE.Color(0xff0000); cm.emissiveIntensity = 0; }
      this._origMats.set(o, orig); this._deathMats.push(cm);
      o.material = cm;
    });
  }
  _deathAnim(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.75);
    const e = t * t;
    this.body.rotation.z = this.deathDir * e * (Math.PI / 2);
    const red = Math.min(1, this.deathT * 6);
    for (const cm of this._deathMats) { if (cm.emissive) { cm.emissiveIntensity = 0.85 * red; cm.color.lerp(_RED, 0.1); } }
  }
  resetDeath() {
    if (this._origMats) { for (const [m, mat] of this._origMats) m.material = mat; this._origMats = null; }
    if (this._deathMats) { for (const cm of this._deathMats) cm.dispose(); this._deathMats = null; }
    this.dying = false; this.deathT = 0; this.body.rotation.set(0, 0, 0); this.root.visible = true;
    this._ghost = false; this.root.userData.hideFromAO = false; // camera re-applies ghost mode next frame
  }

  _applyGhost(obj, on) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        if (o.material === o.userData.ghostMat) return;
        if (!o.userData.ghostMat || o.userData.realMat !== o.material) {
          if (o.userData.ghostMat) o.userData.ghostMat.dispose();
          o.userData.realMat = o.material;
          o.userData.ghostMat = o.material.clone();
          o.userData.ghostMat.colorWrite = false; o.userData.ghostMat.depthWrite = false;
        }
        o.material = o.userData.ghostMat;
      } else if (o.userData.realMat && o.material === o.userData.ghostMat) {
        o.material = o.userData.realMat;
      }
    });
  }
  setGhost(on) {
    // first-person: invisible to the camera but still casts a shadow
    if (this.dying || this._ghost === on) return;
    this._ghost = on;
    this.root.userData.hideFromAO = on; // invisible body sits around the camera
    this._applyGhost(this.root, on);
  }

  // capsules for hit detection: [ax,ay,az,bx,by,bz,r,part]
  hitboxes(out) {
    out.length = 0;
    this.root.updateMatrixWorld(true);
    const p = (o, x = 0, y = 0, z = 0) => new V3(x, y, z).applyMatrix4(o.matrixWorld);
    const head = p(this.head, 0, 0.07, 0);
    out.push([head, head, 0.135, 'head']);
    out.push([p(this.hips, 0, 0.02, 0), p(this.neck, 0, -0.02, 0), 0.2, 'body']);
    for (const L of [this.legL, this.legR]) { out.push([p(L.hp), p(L.kn), 0.095, 'leg']); out.push([p(L.kn), p(L.an), 0.075, 'leg']); }
    for (const A of [this.armL, this.armR]) { out.push([p(A.sh), p(A.el), 0.065, 'arm']); out.push([p(A.el), p(A.hand), 0.055, 'arm']); }
    return out;
  }
  headWorld(out) { return out.set(0, 0.07, 0).applyMatrix4(this.head.matrixWorld); }
}

// ray (o + t d, t in [0,tmax]) vs capsule segment a-b radius r -> t or -1
export function rayCapsule(o, d, tmax, a, b, r) {
  const ab = new V3().subVectors(b, a), ao = new V3().subVectors(o, a);
  const abab = ab.dot(ab), abd = ab.dot(d), abao = ab.dot(ao), dao = d.dot(ao);
  let t, s;
  if (abab < 1e-8) { // sphere
    const bq = dao, c = ao.dot(ao) - r * r, disc = bq * bq - c;
    if (disc < 0) return -1; t = -bq - Math.sqrt(disc); return t >= 0 && t <= tmax ? t : (c < 0 ? 0 : -1);
  }
  // closest points between ray and segment
  const denom = abab - abd * abd;
  if (Math.abs(denom) < 1e-8) { s = 0; t = -dao; }
  else { t = (abd * abao - abab * dao) / denom; s = (abao + t * abd) / abab; }
  s = clamp(s, 0, 1);
  t = d.dot(new V3().copy(a).addScaledVector(ab, s).sub(o));
  t = clamp(t, 0, tmax);
  const pr = new V3().copy(o).addScaledVector(d, t), ps = new V3().copy(a).addScaledVector(ab, s);
  // re-project for accuracy
  const s2 = clamp(new V3().subVectors(pr, a).dot(ab) / abab, 0, 1);
  ps.copy(a).addScaledVector(ab, s2);
  const dist = pr.distanceTo(ps);
  if (dist > r) return -1;
  // back off to surface entry point
  const back = Math.sqrt(Math.max(0, r * r - dist * dist));
  return Math.max(0, t - back);
}
