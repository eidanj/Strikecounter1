// Assembles de_Bellavista and owns per-frame world upkeep:
// distance culling of map chunks, tree LOD, grass fade, shadow-camera follow.
import * as THREE from 'three';
import { RNG } from '../noise.js';
import { CollisionWorld } from '../physics.js';
import { Materials } from '../materials.js';
import { TextureLib } from '../textures.js';
import { GeoBatch } from './builder.js';
import { buildTown, TOWN } from './town.js';
import { buildNature, buildTerrain, makeHeightField, roadDist, NATURE } from './nature.js';
import { Vegetation } from './vegetation.js';
import { createSky, createLights, buildEnvironment, SUN_DIR, HORIZON } from './sky.js';

export const STRATEGIC = [
  { name: 'Mid Gate', x: 2, z: 0 }, { name: 'Piazza', x: -62, z: 8 }, { name: 'Market', x: -20, z: -21 },
  { name: 'Church', x: -86, z: 13.5 }, { name: 'North Alley', x: -59, z: 55 }, { name: 'South Street', x: -60, z: -43.5 },
  { name: 'North Breach', x: 4, z: 56 }, { name: 'South Breach', x: 4, z: -54 }, { name: 'Postern', x: 4, z: 27.3 },
  { name: 'Vineyard', x: 44, z: 46 }, { name: 'Farmhouse', x: 78, z: 9 }, { name: 'Barn', x: 75, z: -8 },
  { name: 'Olive Grove', x: 62, z: -48 }, { name: 'Watchtower', x: 96, z: -58 }, { name: 'Chapel', x: 101, z: 46 },
  { name: 'Via Roma', x: -22, z: 0 }, { name: 'West Street', x: -104.5, z: 30 }, { name: 'Ring Road', x: -9, z: -40 },
];

function bannerTexture(team) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 768;
  const g = c.getContext('2d');
  if (team === 'T') {
    const gr = g.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, '#f2a41f'); gr.addColorStop(1, '#c4561a');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 768);
    g.fillStyle = '#fff3d0'; g.beginPath(); g.ellipse(256, 330, 150, 120, 0, 0, 7); g.fill();
    g.fillStyle = '#e9c26e'; g.beginPath(); g.ellipse(256, 330, 120, 95, 0, 0, 7); g.fill();
    g.fillStyle = '#c4561a'; g.beginPath(); g.ellipse(256, 320, 48, 36, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = "92px 'Bebas Neue', Impact"; g.textAlign = 'center'; g.fillText('TORTELLINI', 256, 590);
  } else {
    const gr = g.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, '#2b6fd6'); gr.addColorStop(1, '#14336b');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 768);
    g.fillStyle = '#e8eef8'; g.beginPath(); g.moveTo(256, 150); g.lineTo(400, 210); g.lineTo(380, 400); g.lineTo(256, 500); g.lineTo(132, 400); g.lineTo(112, 210); g.closePath(); g.fill();
    g.fillStyle = '#f2a41f'; g.beginPath(); g.ellipse(256, 320, 70, 55, 0, 0, 7); g.fill();
    g.strokeStyle = '#14336b'; g.lineWidth = 14; g.beginPath(); g.moveTo(180, 240); g.lineTo(332, 400); g.stroke();
    g.fillStyle = '#fff'; g.font = "70px 'Bebas Neue', Impact"; g.textAlign = 'center'; g.fillText('COUNTER-', 256, 590); g.fillText('TORTELLINI', 256, 660);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.static = new THREE.Group(); this.static.name = 'static';
    scene.add(this.static);
    this.meshes = [];
    this.cullTimer = 0;
    this.flags = [];
  }

  async build(gfx, progress = () => {}) {
    const yieldUI = () => new Promise(r => setTimeout(r, 0));
    progress(0.05, 'Painting textures');
    await yieldUI();
    this.mats = new Materials();
    this.texLib = new TextureLib(this.renderer);
    this.texSize = gfx.texSize;
    const t = this.texLib.build(gfx.texSize, gfx.anisotropy);
    this.mats.applyTextures(t, gfx);
    progress(0.3, 'Shaping the hills');
    await yieldUI();
    const col = this.col = new CollisionWorld(8);
    const hf = this.hf = makeHeightField();
    col.heightFn = hf.fn; col.terrainMinX = 2; col.terrainMaxH = hf.maxH;
    col.surfaceFn = (x, z) => (x < -2 ? 'stone' : (roadDist(x, z) < 2.6 ? 'dirt' : 'grass'));
    col.bounds = { x0: -125.5, x1: 127, z0: -88, z1: 88 };

    progress(0.4, 'Building the town');
    await yieldUI();
    const batch = new GeoBatch(40);
    const ctx = { batch, world: col, rng: new RNG(2024), mats: this.mats.m, waterMeshes: [] };
    const town = buildTown(ctx);
    this.buildings = town.buildings;
    this.fountainJets = ctx.fountainJets;
    progress(0.55, 'Planting the countryside');
    await yieldUI();
    const nat = buildNature(ctx, hf);
    nat.world = col;
    this.terrain = buildTerrain(ctx, hf);
    this.scene.add(this.terrain);
    this.meshes = batch.build(this.mats.m, this.static, {
      noCast: ['glass', 'shopGlass', 'signs', 'ghost', 'posters', 'lampGlass', 'clock', 'rose', 'cobble', 'pavers', 'cloth'],
      noReceive: ['ghost', 'lampGlass'],
    });
    for (const m of this.meshes) { const mt = m.material; if (mt.alphaTest > 0 || mt.transparent) m.userData.hideFromAO = true; }
    // water
    if (ctx.waterMeshes.length) {
      const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
      const wg = mergeGeometries(ctx.waterMeshes.map(w => w.geo));
      const water = new THREE.Mesh(wg, this.mats.m.water); water.receiveShadow = true; water.userData.hideFromAO = true; this.scene.add(water);
    }
    progress(0.72, 'Growing trees');
    await yieldUI();
    this.veg = new Vegetation(this.scene, this.mats.m, hf, nat);
    this.grassDensity = -1;
    this._flags();
    this._fountainWater();

    progress(0.85, 'Lighting the sky');
    await yieldUI();
    this.sky = createSky();
    this.sky.userData.hideFromAO = true;
    this.scene.add(this.sky);
    this.lights = createLights(this.scene);
    this.env = buildEnvironment(this.renderer, this.sky);
    this.spawnPoints = this._spawns();
    this.applyGraphics(gfx, true);
    progress(1, 'Ready');
  }

  _spawns() {
    const pts = { T: [], CT: [], FFA: [] };
    const [sx, sz] = NATURE.tSpawn;
    for (let i = 0; i < 12; i++) { const x = sx - 2 + (i % 4) * 2.2, z = sz - 4 + Math.floor(i / 4) * 3; pts.T.push(new THREE.Vector3(x, this.hf.fn(x, z), z)); }
    const [x0, z0, x1, z1] = TOWN.spawnPlaza;
    for (let i = 0; i < 12; i++) { const x = -120 + (i % 4) * 2.4, z = -6 + Math.floor(i / 4) * 4; pts.CT.push(new THREE.Vector3(x, 0, z)); }
    const rng = new RNG(808);
    let tries = 0;
    while (pts.FFA.length < 48 && tries++ < 4000) {
      const x = rng.range(-123, 124), z = rng.range(-85, 85);
      if (!this.isFree(x, z, 0.6)) continue;
      pts.FFA.push(new THREE.Vector3(x, this.col.groundAt(x, z, 50), z));
    }
    return pts;
  }

  isFree(x, z, r) {
    const g = this.col.groundAt(x, z, 50, 0.45);
    if (g > this.col.terrainHeight(x, z) + 0.5) return false;
    const arr = this.col.query(x - r, z - r, x + r, z + r, []);
    for (const c of arr) {
      if (!c.solid || c.y1 < g + 0.4 || c.y0 > g + 1.8) continue;
      if (c.kind === 0) { if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return false; }
      else if (Math.hypot(x - c.cx, z - c.cz) < r + c.r) return false;
    }
    return true;
  }

  _flags() {
    const mk = (team, x, z, ry) => {
      const y = this.col.groundAt(x, z, 50);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 8, 8), this.mats.m.iron);
      pole.position.set(x, y + 4, z); pole.castShadow = true; this.scene.add(pole);
      const geo = new THREE.PlaneGeometry(2.4, 3.4, 16, 8);
      geo.translate(1.2, 0, 0);
      const mat = new THREE.MeshStandardMaterial({ map: bannerTexture(team), side: THREE.DoubleSide, roughness: 0.85 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + 0.05, y + 6.1, z); m.rotation.y = ry; m.castShadow = true;
      this.scene.add(m);
      this.col.addCyl(x, z, 0.12, y, y + 8, { mat: 'metal', cover: false });
      this.flags.push({ mesh: m, base: geo.attributes.position.array.slice() });
    };
    mk('T', 110, 9, Math.PI);
    mk('CT', -112, 12, 0);
    mk('T', 76, 26, Math.PI * 0.8);
    mk('CT', -46, 15.5, -Math.PI / 2);
  }

  _fountainWater() {
    const N = 360;
    const geo = new THREE.BufferGeometry();
    this.fwPos = new Float32Array(N * 3);
    this.fwSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) this.fwSeed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fwPos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false });
    this.fw = new THREE.Points(geo, mat);
    this.fw.frustumCulled = false;
    this.scene.add(this.fw);
  }

  applyGraphics(gfx, first = false) {
    this.gfx = gfx;
    const r = this.renderer, s = this.scene;
    if (!first && gfx.texSize !== this.texSize) {
      const t = this.texLib.build(gfx.texSize, gfx.anisotropy, true);
      this.mats.applyTextures(t, gfx);
      this.texSize = gfx.texSize;
    }
    s.fog = new THREE.Fog(HORIZON.clone(), gfx.drawDistance * 0.28, gfx.drawDistance);
    s.environment = gfx.envMap ? this.env : null;
    s.environmentIntensity = 0.65;
    const { sun, hemi } = this.lights;
    hemi.intensity = gfx.envMap ? 0.5 : 1.25;
    sun.castShadow = gfx.shadows;
    r.shadowMap.enabled = gfx.shadows;
    r.shadowMap.type = gfx.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (gfx.shadows) {
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(gfx.shadowSize, gfx.shadowSize);
      const R = gfx.shadowRange;
      Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 320 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.035 * (R / 50);
      sun.shadow.radius = gfx.shadowSoft ? 3 : 1;
    }
    // materials need recompiling when shadow type / env toggles
    for (const k in this.mats.m) this.mats.m[k].needsUpdate = true;
    if (gfx.grassDensity !== this.grassDensity) {
      this.veg.buildGrass(gfx.grassDensity, gfx.flowerDensity);
      this.grassDensity = gfx.grassDensity;
    }
    for (const c of this.veg.treeChunks) c.state = -1;
    this.cullTimer = 0;
  }

  update(dt, time, camera, focus) {
    this.mats.update(dt, time);
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = time;
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.2;
      const dd = this.gfx.drawDistance, cp = camera.position;
      for (const m of this.meshes) {
        const c = m.userData.cullCenter;
        m.visible = Math.hypot(cp.x - c.x, cp.z - c.z) - m.userData.cullRadius < dd;
      }
      this.veg.update(cp, this.gfx);
    }
    // shadow camera follows the focus point, snapped to texels to avoid shimmer
    const sun = this.lights.sun;
    if (this.gfx.shadows) {
      const R = this.gfx.shadowRange, texel = (2 * R) / this.gfx.shadowSize;
      const fx = focus.x, fz = focus.z;
      const right = new THREE.Vector3().crossVectors(SUN_DIR, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, SUN_DIR).normalize();
      const p = new THREE.Vector3(fx, focus.y, fz);
      const a = Math.round(p.dot(right) / texel) * texel, b = Math.round(p.dot(up) / texel) * texel, c = p.dot(SUN_DIR);
      const snapped = right.multiplyScalar(a).add(up.multiplyScalar(b)).add(SUN_DIR.clone().multiplyScalar(c));
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(SUN_DIR, 160);
      sun.target.updateMatrixWorld();
    }
    // flags
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position, b = f.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1];
        const k = x / 2.4;
        pos.setZ(i, Math.sin(time * 3.2 - x * 2.2 + y * 0.4) * 0.22 * k + Math.sin(time * 5.1 - x * 3.7) * 0.06 * k);
        pos.setY(i, y - k * k * 0.25);
      }
      pos.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
    }
    // fountain jets
    if (this.fw) {
      const cam = camera.position, [fx, fz] = TOWN.fountain;
      const near = Math.hypot(cam.x - fx, cam.z - fz) < 90;
      this.fw.visible = near;
      if (near) {
        const N = this.fwSeed.length, P = this.fwPos;
        for (let i = 0; i < N; i++) {
          const s = this.fwSeed[i], jet = i % 3 === 0 ? 0 : 1, J = this.fountainJets[jet];
          const period = jet === 0 ? 1.1 : 0.8;
          const tt = ((time / period + s) % 1);
          const a = s * 97.3 + Math.floor(time / period + s) * 1.7;
          const dist = J.r * (0.75 + 0.25 * ((s * 13.1) % 1));
          const x = Math.cos(a) * dist * tt, z = Math.sin(a) * dist * tt;
          const v0 = jet === 0 ? 2.2 : 1.6;
          const y = J.y + v0 * tt * period * 2 - 9.8 * (tt * period) * (tt * period) * 0.9;
          P[i * 3] = fx + x; P[i * 3 + 1] = Math.max(J.fall, y); P[i * 3 + 2] = fz + z;
        }
        this.fw.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}
