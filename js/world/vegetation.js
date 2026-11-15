// Instanced vegetation with chunked LOD:
//  - trees: detailed leaf-card models near the camera, low-poly blobs far away
//  - grass + flowers: per-chunk instanced clumps that shrink away with distance
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../noise.js';
import { displace } from './builder.js';
import { roadDist, dryness, lushness } from './nature.js';
import { sharedUniforms } from '../materials.js';

const TREE_CHUNK = 32, GRASS_CHUNK = 16;

function prep(g, color) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const cc = typeof color === 'function' ? color(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)) : color;
    c[i * 3] = cc[0]; c[i * 3 + 1] = cc[1]; c[i * 3 + 2] = cc[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function leafCards(center, radius, count, size, rng, out, tint, squash = 1) {
  for (let i = 0; i < count; i++) {
    const u = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), rr = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(rr * Math.cos(a), u * squash, rr * Math.sin(a)).normalize();
    const p = center.clone().addScaledVector(dir, radius * rng.range(0.55, 1.0));
    const q = new THREE.PlaneGeometry(size, size);
    q.rotateZ(rng.range(0, 6.28)); q.rotateX(rng.range(-1.2, 1.2)); q.rotateY(rng.range(0, 6.28));
    q.translate(p.x, p.y, p.z);
    // spherical normals for soft foliage shading
    const pos = q.attributes.position, nor = q.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3(pos.getX(k) - center.x, (pos.getY(k) - center.y) * 0.8 + radius * 0.25, pos.getZ(k) - center.z).normalize();
      nor.setXYZ(k, v.x, v.y, v.z);
    }
    const k = rng.range(0.85, 1.1) * (0.75 + 0.25 * (u * 0.5 + 0.5));
    out.push(prep(q, [tint[0] * k, tint[1] * k, tint[2] * k]));
  }
}

function blob(center, r, detail, rng, color, sx = 1, sy = 1, sz = 1) {
  const g = displace(new THREE.IcosahedronGeometry(r, detail), r * 0.22, 2.2 / r, rng.range(0, 99));
  g.scale(sx, sy, sz); g.translate(center.x, center.y, center.z);
  return prep(g, (x, y) => { const k = 0.65 + 0.35 * Math.min(1, Math.max(0, (y - center.y + r) / (2 * r))); return [color[0] * k, color[1] * k, color[2] * k]; });
}

function trunk(points, r0, r1, seg, rng, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, Math.max(3, points.length * 3), 1, seg, false);
  // taper
  const pos = g.attributes.position, n = pos.count, ring = seg + 1;
  const pts = curve.getSpacedPoints(Math.max(3, points.length * 3));
  for (let i = 0; i < n; i++) {
    const ri = Math.floor(i / ring), t = ri / (pts.length - 1);
    const c = pts[Math.min(ri, pts.length - 1)];
    const r = r0 + (r1 - r0) * t;
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(c).multiplyScalar(r);
    pos.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
  return prep(g, color);
}

// ---------- tree model library ----------
function makeModels(rng) {
  const M = {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Cypress
  {
    const bark = [trunk([V(0, -0.3, 0), V(0, 1.2, 0), V(0, 2.5, 0)], 0.2, 0.12, 6, rng, [1, 1, 1])];
    const prof = [[0.05, 0.6], [0.75, 1.2], [1.05, 2.6], [1.08, 4.4], [0.95, 6.2], [0.72, 8.0], [0.42, 9.6], [0.12, 10.8], [0.0, 11.3]].map(([r, y]) => new THREE.Vector2(r, y));
    const inner = new THREE.LatheGeometry(prof, 14);
    displace(inner, 0.12, 2.5, 3);
    const solid = [prep(inner, (x, y) => { const k = 0.6 + 0.4 * Math.min(1, y / 11); return [0.11 * k, 0.2 * k, 0.09 * k]; })];
    const leaves = [];
    for (let y = 1.2; y < 10.8; y += 0.55) {
      const r = prof.reduce((acc, p, i) => (i && y >= prof[i - 1].y && y <= p.y ? prof[i - 1].x + (p.x - prof[i - 1].x) * ((y - prof[i - 1].y) / (p.y - prof[i - 1].y)) : acc), 0.5);
      leafCards(V(0, y, 0), r * 1.05, 7, 1.05, rng, leaves, [0.55, 0.75, 0.55], 0.25);
    }
    const lo = [prep(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5).translate(0, 0.3, 0), [0.28, 0.2, 0.14]),
      prep(new THREE.LatheGeometry(prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1), 6), [0.1, 0.19, 0.08])];
    M.cypress = { bark, solid, leaves, lo, leafMat: 'leafNeedle', trunkR: 0.25, canopyR: 1.0, h: 11 };
  }
  // Olive
  {
    const bark = [
      trunk([V(0, -0.3, 0), V(0.2, 0.8, 0.1), V(-0.1, 1.6, 0.2), V(0.3, 2.3, 0)], 0.32, 0.14, 7, rng, [0.95, 0.92, 0.88]),
      trunk([V(0.2, 1.5, 0.1), V(0.9, 2.2, -0.3), V(1.4, 2.8, -0.4)], 0.13, 0.06, 5, rng, [0.95, 0.92, 0.88]),
      trunk([V(-0.05, 1.7, 0.2), V(-0.8, 2.5, 0.6), V(-1.1, 3.0, 0.9)], 0.12, 0.05, 5, rng, [0.95, 0.92, 0.88]),
    ];
    const cl = [V(0.3, 3.2, 0), V(1.4, 3.0, -0.5), V(-1.1, 3.2, 0.9), V(0.2, 3.9, 0.6), V(-0.4, 3.1, -0.9), V(0.9, 3.7, 0.8)];
    const solid = [], leaves = [];
    cl.forEach((c, i) => { const r = 1.0 + (i % 3) * 0.15; solid.push(blob(c, r * 0.72, 1, rng, [0.25, 0.3, 0.18], 1, 0.75, 1)); leafCards(c, r, 16, 1.0, rng, leaves, [0.82, 0.88, 0.72], 0.7); });
    const lo = [prep(new THREE.CylinderGeometry(0.15, 0.28, 2.4, 5).translate(0, 1.0, 0), [0.32, 0.28, 0.22])];
    cl.forEach((c) => lo.push(blob(c, 1.05, 0, rng, [0.27, 0.32, 0.2], 1, 0.75, 1)));
    M.olive = { bark, solid, leaves, lo, leafMat: 'leafOlive', trunkR: 0.32, canopyR: 2.4, h: 5 };
  }
  // Umbrella (stone) pine
  {
    const bark = [
      trunk([V(0, -0.3, 0), V(0.3, 3, 0.1), V(0.1, 6, -0.2), V(0.5, 8.5, 0)], 0.36, 0.18, 8, rng, [1, 0.95, 0.9]),
      trunk([V(0.3, 6.5, -0.1), V(1.8, 8.2, 0.6), V(2.8, 9.0, 1.0)], 0.14, 0.07, 5, rng, [1, 0.95, 0.9]),
      trunk([V(0.2, 7.0, -0.1), V(-1.6, 8.6, -0.8), V(-2.6, 9.1, -1.2)], 0.14, 0.07, 5, rng, [1, 0.95, 0.9]),
    ];
    const cl = [V(0.5, 9.4, 0), V(2.6, 9.2, 1.1), V(-2.4, 9.3, -1.2), V(1.4, 9.5, -1.9), V(-1.2, 9.6, 1.8), V(3.0, 9.0, -1.0), V(-3.0, 9.1, 0.6)];
    const solid = [], leaves = [];
    cl.forEach((c) => { solid.push(blob(c, 1.5, 1, rng, [0.13, 0.22, 0.1], 1.3, 0.42, 1.3)); leafCards(c, 1.9, 14, 1.4, rng, leaves, [0.6, 0.78, 0.55], 0.35); });
    const lo = [prep(new THREE.CylinderGeometry(0.2, 0.34, 9, 5).translate(0, 4.2, 0), [0.35, 0.25, 0.18])];
    lo.push(blob(V(0.2, 9.3, 0), 3.6, 1, rng, [0.13, 0.22, 0.1], 1.1, 0.3, 1.1));
    M.pine = { bark, solid, leaves, lo, leafMat: 'leafNeedle', trunkR: 0.36, canopyR: 4, h: 10 };
  }
  // Oak (forest)
  {
    const bark = [
      trunk([V(0, -0.4, 0), V(0.1, 2.5, 0), V(-0.1, 4.5, 0.1)], 0.42, 0.22, 8, rng, [0.9, 0.85, 0.8]),
      trunk([V(0, 3.4, 0), V(1.5, 5.0, 0.4), V(2.4, 6.0, 0.5)], 0.18, 0.08, 5, rng, [0.9, 0.85, 0.8]),
      trunk([V(0, 3.8, 0), V(-1.4, 5.3, -0.6), V(-2.2, 6.4, -0.8)], 0.17, 0.08, 5, rng, [0.9, 0.85, 0.8]),
    ];
    const cl = [V(0, 7.2, 0), V(2.2, 6.4, 0.6), V(-2.0, 6.7, -0.8), V(0.6, 6.0, -2.0), V(-0.8, 6.2, 2.0), V(1.0, 8.3, 0.8), V(-1.0, 8.1, -0.6)];
    const solid = [], leaves = [];
    cl.forEach((c) => { solid.push(blob(c, 1.6, 1, rng, [0.14, 0.25, 0.08])); leafCards(c, 2.1, 16, 1.6, rng, leaves, [0.78, 0.92, 0.65]); });
    const lo = [prep(new THREE.CylinderGeometry(0.25, 0.42, 5, 5).translate(0, 2.2, 0), [0.32, 0.25, 0.18])];
    lo.push(blob(V(0, 7.0, 0), 3.4, 1, rng, [0.16, 0.27, 0.09], 1, 0.85, 1));
    M.oak = { bark, solid, leaves, lo, leafMat: 'leafBroad', trunkR: 0.42, canopyR: 3, h: 9 };
  }
  for (const k in M) {
    const m = M[k];
    m.barkG = mergeGeometries(m.bark); m.solidG = mergeGeometries(m.solid); m.leafG = mergeGeometries(m.leaves); m.loG = mergeGeometries(m.lo);
  }
  return M;
}

function grassClump(rng) {
  const parts = [];
  for (let b = 0; b < 7; b++) {
    const a = rng.range(0, Math.PI * 2), lean = rng.range(0.1, 0.45), h = rng.range(0.35, 0.68), w = rng.range(0.035, 0.06);
    const ox = rng.range(-0.12, 0.12), oz = rng.range(-0.12, 0.12);
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (t, side) => { const ww = w * (1 - t) * side; const bend = lean * t * t; return [ox + ca * ww + sa * bend * h, h * t, oz - sa * ww + ca * bend * h]; };
    const v = [P(0, -1), P(0, 1), P(0.5, -1), P(0.5, 1), P(1, 0)];
    const pos = [...v[0], ...v[1], ...v[3], ...v[0], ...v[3], ...v[2], ...v[2], ...v[3], ...v[4]];
    const cols = [];
    const tip = [rng.range(0.55, 0.75), rng.range(0.68, 0.82), rng.range(0.25, 0.35)];
    const base = [0.12, 0.2, 0.06];
    for (const [t] of [[0], [0], [0.5], [0], [0.5], [0.5], [0.5], [0.5], [1]]) cols.push(base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const nn = []; for (let i = 0; i < 9; i++) nn.push(sa * 0.3, 0.9, ca * 0.3);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(18), 2));
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function flowerGeo() {
  const parts = [];
  const stem = new THREE.PlaneGeometry(0.02, 0.32); stem.translate(0, 0.16, 0);
  parts.push(prep(stem, [0.2, 0.35, 0.1]));
  for (let k = 0; k < 2; k++) {
    const head = new THREE.PlaneGeometry(0.11, 0.11); head.rotateX(-Math.PI / 2 + 0.4); head.rotateY(k * Math.PI / 2); head.translate(0, 0.33, 0);
    parts.push(prep(head, [1, 1, 1]));
  }
  const g = mergeGeometries(parts);
  const nor = g.attributes.normal; for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  return g;
}

export class Vegetation {
  constructor(scene, mats, hf, natureData) {
    this.scene = scene; this.mats = mats; this.hf = hf; this.data = natureData;
    this.group = new THREE.Group(); this.group.name = 'vegetation';
    scene.add(this.group);
    this.models = makeModels(new RNG(77));
    this.treeChunks = [];
    this.grassChunks = [];
    this.grassUniform = { value: 50 };
    this._patchGrassMaterial();
    this._buildTrees();
  }

  _patchGrassMaterial() {
    const gu = this.grassUniform;
    for (const key of ['grassBlade', 'flower']) {
      const m = this.mats[key];
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev(sh, r);
        sh.uniforms.uGrassDist = gu;
        sh.vertexShader = 'uniform float uGrassDist;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gwp = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float gd = distance(gwp.xz, cameraPosition.xz);
          float gfade = 1.0 - smoothstep(uGrassDist * 0.7, uGrassDist, gd);
          transformed *= max(gfade, 0.0);
        #endif`);
      };
      m.customProgramCacheKey = () => key + '_fade';
      m.needsUpdate = true;
    }
  }

  _buildTrees() {
    const buckets = new Map();
    for (const t of this.data.trees) {
      const key = Math.floor(t.x / TREE_CHUNK) + ',' + Math.floor(t.z / TREE_CHUNK);
      let b = buckets.get(key); if (!b) { b = { cx: (Math.floor(t.x / TREE_CHUNK) + 0.5) * TREE_CHUNK, cz: (Math.floor(t.z / TREE_CHUNK) + 0.5) * TREE_CHUNK, types: {} }; buckets.set(key, b); }
      (b.types[t.type] = b.types[t.type] || []).push(t);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const b of buckets.values()) {
      const chunk = { cx: b.cx, cz: b.cz, hi: [], lo: [], state: -1 };
      for (const type in b.types) {
        const list = b.types[type], M = this.models[type], n = list.length;
        const mk = (geo, mat, cast) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = true; return im; };
        const hb = mk(M.barkG, this.mats.bark, true), hs = mk(M.solidG, this.mats.foliageLo, true), hl = mk(M.leafG, this.mats[M.leafMat], true), lo = mk(M.loG, this.mats.foliageLo, true);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.ry); s.setScalar(t.s); p.set(t.x, t.y, t.z);
          m4.compose(p, q, s);
          hb.setMatrixAt(i, m4); hs.setMatrixAt(i, m4); hl.setMatrixAt(i, m4); lo.setMatrixAt(i, m4);
        });
        for (const im of [hb, hs, hl, lo]) { im.computeBoundingSphere(); im.visible = false; this.group.add(im); }
        hl.userData.hideFromAO = true; // alpha-cut leaf cards would render as solid squares
        chunk.hi.push(hb, hs, hl); chunk.lo.push(lo);
        // colliders
        for (const t of list) if (t.collide) {
          this.data.world.addCyl(t.x, t.z, M.trunkR * t.s, t.y - 0.5, t.y + Math.min(M.h * 0.6, 6) * t.s, { mat: 'wood' });
          if (t.type === 'cypress') this.data.world.addCyl(t.x, t.z, 0.95 * t.s, t.y + 0.8, t.y + 10 * t.s, { solid: false, los: true, bullets: false, mat: 'foliage', cover: false });
          if (t.type === 'olive') this.data.world.addCyl(t.x, t.z, 1.8 * t.s, t.y + 2.4 * t.s, t.y + 4.2 * t.s, { solid: false, los: true, bullets: false, mat: 'foliage', cover: false });
        }
      }
      this.treeChunks.push(chunk);
    }
    // bushes: instanced blobs + leaf cards
    const rng = new RNG(91);
    const bushSolid = blob(new THREE.Vector3(0, 0.55, 0), 0.75, 1, rng, [0.16, 0.28, 0.1], 1.2, 0.8, 1.1);
    const bl = []; leafCards(new THREE.Vector3(0, 0.6, 0), 0.9, 14, 0.8, rng, bl, [0.75, 0.9, 0.6], 0.7);
    const bushLeaf = mergeGeometries(bl);
    const n = this.data.bushes.length;
    this.bushSolid = new THREE.InstancedMesh(bushSolid, this.mats.foliageLo, n);
    this.bushLeaf = new THREE.InstancedMesh(bushLeaf, this.mats.leafBroad, n);
    this.data.bushes.forEach((b, i) => { q.setFromAxisAngle(up, rng.range(0, 6.28)); s.set(b.s, b.s * rng.range(0.8, 1.2), b.s); p.set(b.x, b.y - 0.1, b.z); m4.compose(p, q, s); this.bushSolid.setMatrixAt(i, m4); this.bushLeaf.setMatrixAt(i, m4); });
    for (const im of [this.bushSolid, this.bushLeaf]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    this.bushLeaf.userData.hideFromAO = true;
  }

  buildGrass(density, flowerDensity) {
    for (const c of this.grassChunks) { this.group.remove(c.mesh); c.mesh.dispose(); if (c.flowers) { this.group.remove(c.flowers); c.flowers.dispose(); } }
    this.grassChunks = [];
    if (density <= 0) return;
    if (!this.clumpGeo) this.clumpGeo = grassClump(new RNG(5));
    if (!this.flowerGeo) this.flowerGeo = flowerGeo();
    const rng = new RNG(1234);
    const H = this.hf.fn, blocked = this.data.blocked;
    const perChunk = Math.floor(GRASS_CHUNK * GRASS_CHUNK * 1.55 * density);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const fcols = ['#d8231f', '#d8231f', '#f2d23a', '#f4f0f8', '#8a5ad8', '#e85a9a'].map(h => new THREE.Color(h));
    for (let cx = 0; cx < 134; cx += GRASS_CHUNK) for (let cz = -96; cz < 96; cz += GRASS_CHUNK) {
      const mats = [], cols = [], fm = [], fc = [];
      for (let i = 0; i < perChunk; i++) {
        const x = cx + rng.next() * GRASS_CHUNK, z = cz + rng.next() * GRASS_CHUNK;
        if (x < 3.5 || roadDist(x, z) < 2.1) continue;
        if (x > 28 && x < 60 && z > 24 && z < 70 && Math.abs(((z - 25) % 2.6) - 1.3) > 0.55) continue;
        if (blocked(x, z, -0.6)) { if (rng.chance(0.85)) continue; }
        const y = H(x, z);
        const dr = dryness(x, z), lu = lushness(x, z);
        const sc = rng.range(0.7, 1.3) * (0.8 + 0.5 * lu);
        q.setFromAxisAngle(up, rng.range(0, 6.28)); s.set(sc, sc * rng.range(0.8, 1.25), sc); p.set(x, y - 0.03, z);
        m4.compose(p, q, s); mats.push(m4.clone());
        c.setRGB(1 + dr * 0.35, 1 + dr * 0.08, 1 - dr * 0.45); cols.push(c.clone());
        if (flowerDensity > 0 && lu > 0.55 && rng.chance(0.06 * flowerDensity)) {
          for (let k = 0; k < 3; k++) {
            q.setFromAxisAngle(up, rng.range(0, 6.28)); const fs = rng.range(0.8, 1.3); s.set(fs, fs, fs);
            const fx = x + rng.range(-0.4, 0.4), fz = z + rng.range(-0.4, 0.4); p.set(fx, H(fx, fz) - 0.02, fz);
            m4.compose(p, q, s); fm.push(m4.clone()); fc.push(fcols[Math.floor((fx * 0.7 + fz * 0.3 + 100) * 0.13) % fcols.length]);
          }
        }
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(this.clumpGeo, this.mats.grassBlade, mats.length);
      mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
      im.computeBoundingSphere(); im.receiveShadow = true; im.castShadow = false;
      im.userData.hideFromAO = true; // AO pass can't see the distance fade, so skip grass
      this.group.add(im);
      const chunk = { cx: cx + GRASS_CHUNK / 2, cz: cz + GRASS_CHUNK / 2, mesh: im, flowers: null };
      if (fm.length) {
        const f = new THREE.InstancedMesh(this.flowerGeo, this.mats.flower, fm.length);
        fm.forEach((m, i) => { f.setMatrixAt(i, m); f.setColorAt(i, fc[i]); });
        f.computeBoundingSphere(); f.receiveShadow = true; f.userData.hideFromAO = true; this.group.add(f); chunk.flowers = f;
      }
      this.grassChunks.push(chunk);
    }
  }

  update(camPos, gfx) {
    this.grassUniform.value = gfx.grassDistance;
    const dd = gfx.drawDistance, td = gfx.treeDetailDist;
    for (const c of this.treeChunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) - TREE_CHUNK * 0.71;
      const st = d < td ? 1 : (d < dd + 20 ? 2 : 0);
      if (st === c.state) continue;
      c.state = st;
      for (const m of c.hi) m.visible = st === 1;
      for (const m of c.lo) m.visible = st === 2;
    }
    const gd = gfx.grassDistance + GRASS_CHUNK;
    for (const c of this.grassChunks) {
      const v = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) < gd;
      c.mesh.visible = v; if (c.flowers) c.flowers.visible = v;
    }
    const bushVis = true;
    this.bushSolid.visible = this.bushLeaf.visible = bushVis;
  }
}
