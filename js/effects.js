// Visual effects: point-sprite particle systems, tracers, decals, casings,
// world muzzle flashes with a fixed pool of lights (no shader recompiles).
import * as THREE from 'three';

const PVERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
varying float vAlpha; varying vec3 vColor; varying float vRot;
uniform float uScale;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(0.05, -mvPosition.z);
  vAlpha = aAlpha; vColor = aColor; vRot = aRot;
  #include <fog_vertex>
}`;
const PFRAG = `
uniform sampler2D map;
varying float vAlpha; varying vec3 vColor; varying float vRot;
#include <fog_pars_fragment>
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(map, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class Particles {
  constructor(scene, tex, max, additive) {
    this.max = max; this.n = 0;
    this.p = []; // particle structs
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex }, uScale: { value: 400 } }]),
    });
    this.mat.uniforms.map.value = tex;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: 0, max: o.life || 1, s0: o.size || 0.3, s1: o.size1 != null ? o.size1 : (o.size || 0.3) * 2,
      a0: o.alpha != null ? o.alpha : 1, r: o.r != null ? o.r : 1, g: o.g != null ? o.g : 1, b: o.b != null ? o.b : 1,
      grav: o.grav || 0, drag: o.drag != null ? o.drag : 1.5, rot: Math.random() * 6.28, vr: o.vr != null ? o.vr : (Math.random() - 0.5) * 2,
      fadeIn: o.fadeIn || 0.05,
    });
  }
  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      const d = Math.exp(-q.drag * dt);
      q.vx *= d; q.vy = q.vy * d - q.grav * dt; q.vz *= d;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
      const t = q.life / q.max;
      this.pos[w * 3] = q.x; this.pos[w * 3 + 1] = q.y; this.pos[w * 3 + 2] = q.z;
      this.size[w] = q.s0 + (q.s1 - q.s0) * t;
      this.alpha[w] = q.a0 * Math.min(1, q.life / q.fadeIn) * (1 - t) * (1 - t * 0.3);
      this.col[w * 3] = q.r; this.col[w * 3 + 1] = q.g; this.col[w * 3 + 2] = q.b;
      this.rot[w] = q.rot;
      P[w] = q; w++;
    }
    P.length = w;
    this.geo.setDrawRange(0, w);
    for (const k of ['position', 'aSize', 'aAlpha', 'aColor', 'aRot']) this.geo.attributes[k].needsUpdate = true;
  }
  setScale(s) { this.mat.uniforms.uScale.value = s; }
}

export class Effects {
  constructor(scene, tex, world) {
    this.scene = scene; this.world = world; this.mult = 1;
    this.smoke = new Particles(scene, tex.smoke, 900, false);
    this.poof = new Particles(scene, tex.square, 500, false);
    this.sparks = new Particles(scene, tex.spark, 500, true);
    this.flashes = new Particles(scene, tex.flash, 64, true);
    // tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.frustumCulled = false; m.userData.hideFromAO = true; scene.add(m); this.tracers.push({ m, t: 0, max: 0.07 });
    }
    // decals
    this.decalMat = new THREE.MeshStandardMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 1 });
    this.decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
    this.decals = []; this.decalIdx = 0; this.maxDecals = 80;
    // casings
    const cg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 6); cg.rotateZ(Math.PI / 2);
    this.casingMesh = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xc9a248, metalness: 1, roughness: 0.3 }), 64);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.frustumCulled = false; this.casingMesh.castShadow = false; this.casingMesh.userData.hideFromAO = true;
    scene.add(this.casingMesh);
    this.casings = []; this.casingIdx = 0;
    for (let i = 0; i < 64; i++) this.casings.push({ life: 99, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), vr: new THREE.Vector3(), gy: 0 });
    // fixed pool of muzzle lights
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(l); this.lights.push({ l, t: 0 }); }
    this.lightIdx = 0;
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
  }

  configure(gfx, renderer, camera) {
    this.mult = gfx.particles;
    this.maxDecals = gfx.decals;
    while (this.decals.length > this.maxDecals) { const d = this.decals.shift(); this.scene.remove(d); }
    this.decalIdx = 0;
    this.updateScale(renderer, camera);
  }
  updateScale(renderer, camera) {
    const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const p of [this.smoke, this.poof, this.sparks, this.flashes]) p.setScale(s);
  }

  n(k) { return Math.max(1, Math.round(k * this.mult)); }

  tracer(from, to) {
    const t = this.tracers.find(t => !t.m.visible) || this.tracers[0];
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    t.m.position.copy(from); t.m.lookAt(to);
    const show = Math.min(len, 6 + Math.random() * 4);
    t.m.scale.set(0.018, 0.018, show);
    t.from = from.clone(); t.to = to.clone(); t.len = len; t.show = show;
    t.t = 0; t.max = Math.min(0.12, len / 450); t.m.visible = true;
  }

  muzzle(pos, dir, big = 1) {
    this.flashes.emit({ x: pos.x, y: pos.y, z: pos.z, size: 0.35 * big, size1: 0.5 * big, life: 0.05, alpha: 1, r: 1, g: 0.85, b: 0.6, drag: 0, vr: 0 });
    for (let i = 0; i < this.n(2); i++) this.smoke.emit({ x: pos.x + dir.x * 0.1, y: pos.y, z: pos.z + dir.z * 0.1, vx: dir.x * 1.5 + (Math.random() - 0.5) * 0.4, vy: 0.4 + Math.random() * 0.3, vz: dir.z * 1.5 + (Math.random() - 0.5) * 0.4, size: 0.12, size1: 0.6, life: 0.6, alpha: 0.18, r: 0.9, g: 0.9, b: 0.9, drag: 3 });
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.l.position.copy(pos); L.l.intensity = 14 * big; L.t = 0.05;
  }

  impact(p, n, mat, terrain) {
    const nx = n.x, ny = n.y, nz = n.z;
    let col = [0.72, 0.68, 0.6];
    if (terrain) col = [0.5, 0.42, 0.3];
    else if (mat === 'wood') col = [0.45, 0.32, 0.2];
    else if (mat === 'metal') col = [0.5, 0.5, 0.5];
    else if (mat === 'foliage') col = [0.25, 0.4, 0.15];
    const cnt = this.n(mat === 'foliage' ? 4 : 3);
    for (let i = 0; i < cnt; i++) {
      this.smoke.emit({ x: p.x + nx * 0.05, y: p.y + ny * 0.05, z: p.z + nz * 0.05, vx: nx * (1 + Math.random() * 2) + (Math.random() - 0.5), vy: ny * (1 + Math.random() * 2) + Math.random() * 0.8, vz: nz * (1 + Math.random() * 2) + (Math.random() - 0.5), size: 0.08, size1: 0.45 + Math.random() * 0.3, life: 0.7 + Math.random() * 0.5, alpha: 0.55, r: col[0], g: col[1], b: col[2], drag: 4, grav: -0.3 });
    }
    if (mat === 'metal' || (mat === 'stone' && Math.random() < 0.4)) {
      for (let i = 0; i < this.n(mat === 'metal' ? 8 : 3); i++) {
        this.sparks.emit({ x: p.x, y: p.y, z: p.z, vx: nx * 3 + (Math.random() - 0.5) * 5, vy: ny * 3 + Math.random() * 3, vz: nz * 3 + (Math.random() - 0.5) * 5, size: 0.04, size1: 0.01, life: 0.25 + Math.random() * 0.2, alpha: 1, r: 1, g: 0.8, b: 0.4, drag: 1, grav: 9.8 });
      }
    }
    if (mat !== 'foliage') this.decal(p, n);
  }

  decal(p, n) {
    if (this.maxDecals <= 0) return;
    let d;
    if (this.decals.length < this.maxDecals) { d = new THREE.Mesh(this.decalGeo, this.decalMat); d.receiveShadow = true; d.userData.hideFromAO = true; this.scene.add(d); this.decals.push(d); }
    else { d = this.decals[this.decalIdx % this.decals.length]; this.decalIdx++; }
    d.position.set(p.x + n.x * 0.004, p.y + n.y * 0.004, p.z + n.z * 0.004);
    d.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    d.rotateZ(Math.random() * 6.28);
    const s = 0.7 + Math.random() * 0.5; d.scale.set(s, s, s);
  }

  hitPuff(p, head) {
    for (let i = 0; i < this.n(head ? 10 : 6); i++) {
      this.sparks.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, size: head ? 0.07 : 0.05, size1: 0.0, life: 0.3, alpha: 1, r: 1, g: head ? 0.95 : 0.85, b: head ? 0.6 : 0.85, drag: 2, grav: 4 });
    }
    this.smoke.emit({ x: p.x, y: p.y, z: p.z, size: 0.15, size1: 0.5, life: 0.4, alpha: 0.35, r: 1, g: 1, b: 1, drag: 3 });
  }

  deathPoof(p) {
    for (let i = 0; i < this.n(26); i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.4;
      const g = 0.75 + Math.random() * 0.25;
      this.poof.emit({ x: p.x + Math.cos(a) * 0.3, y: p.y + 0.2 + Math.random() * 0.9, z: p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 0.6 + Math.random() * 1.6, vz: Math.sin(a) * s, size: 0.12 + Math.random() * 0.1, size1: 0.05, life: 0.8 + Math.random() * 0.6, alpha: 0.95, r: g, g: g, b: g, drag: 2.5, vr: 0, grav: -0.4 });
    }
  }

  dust(p, amount = 1) {
    for (let i = 0; i < this.n(4 * amount); i++) this.smoke.emit({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.05, z: p.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 1.5, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 1.5, size: 0.15, size1: 0.8, life: 0.8, alpha: 0.25, r: 0.72, g: 0.66, b: 0.55, drag: 3 });
  }

  casing(pos, vel) {
    const c = this.casings[this.casingIdx++ % this.casings.length];
    c.life = 0; c.p.copy(pos); c.v.copy(vel); c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.vr.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    c.gy = this.world ? this.world.col.groundAt(pos.x, pos.z, pos.y, 0.1) : 0;
  }

  update(dt, camera) {
    this.smoke.update(dt); this.poof.update(dt); this.sparks.update(dt); this.flashes.update(dt);
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.t += dt;
      const k = t.t / t.max;
      if (k >= 1) { t.m.visible = false; continue; }
      // the streak travels from muzzle to impact
      const head = Math.min(t.len, k * t.len + t.show);
      const tail = Math.max(0, head - t.show);
      const dir = t.to.clone().sub(t.from).normalize();
      t.m.position.copy(t.from).addScaledVector(dir, tail);
      t.m.scale.z = Math.max(0.01, head - tail);
      t.m.material.opacity = 0.8 * (1 - k * 0.5);
    }
    for (const L of this.lights) { if (L.t > 0) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; } }
    let any = false;
    for (let i = 0; i < this.casings.length; i++) {
      const c = this.casings[i];
      if (c.life > 3) { this._m4.makeScale(0, 0, 0); this.casingMesh.setMatrixAt(i, this._m4); continue; }
      any = true;
      c.life += dt;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.gy + 0.006) { c.p.y = c.gy + 0.006; c.v.y = Math.abs(c.v.y) * 0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.vr.multiplyScalar(0.6); }
      c.r.x += c.vr.x * dt; c.r.y += c.vr.y * dt; c.r.z += c.vr.z * dt;
      this._q.setFromEuler(c.r);
      this._m4.compose(c.p, this._q, this._s);
      this.casingMesh.setMatrixAt(i, this._m4);
    }
    this.casingMesh.instanceMatrix.needsUpdate = true;
  }
}
