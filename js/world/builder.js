// Geometry batching: thousands of small parts are merged per material per
// map chunk, so the town renders in a few hundred draw calls and each chunk
// can be frustum- and distance-culled on its own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv', 'color'];

export class GeoBatch {
  constructor(chunk = 40) { this.chunk = chunk; this.buckets = new Map(); this.count = 0; }

  // geo must already be in world space. color: THREE.Color | [r,g,b] | fn(x,y,z,nx,ny,nz)->[r,g,b]
  // uv: null (keep) | number (world box-projection tile size in meters)
  add(mat, geo, color = null, uv = null, chunkHint = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
    if (uv != null) {
      const arr = new Float32Array(n * 2), s = 1 / uv;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        if (ay >= ax && ay >= az) { arr[i * 2] = x * s; arr[i * 2 + 1] = z * s; }
        else if (ax >= az) { arr[i * 2] = z * s; arr[i * 2 + 1] = y * s; }
        else { arr[i * 2] = x * s; arr[i * 2 + 1] = y * s; }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
    } else if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const col = new Float32Array(n * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < n; i++) {
        const c = color(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
    } else {
      let r = 1, gg = 1, b = 1;
      if (color && color.isColor) { r = color.r; gg = color.g; b = color.b; }
      else if (Array.isArray(color)) { r = color[0]; gg = color[1]; b = color[2]; }
      for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // chunk by centroid
    let cx = 0, cz = 0;
    if (chunkHint) { cx = chunkHint[0]; cz = chunkHint[1]; }
    else { g.computeBoundingBox(); const bb = g.boundingBox; cx = (bb.min.x + bb.max.x) / 2; cz = (bb.min.z + bb.max.z) / 2; }
    const key = Math.floor(cx / this.chunk) + ',' + Math.floor(cz / this.chunk) + '|' + mat;
    let b = this.buckets.get(key); if (!b) { b = []; this.buckets.set(key, b); }
    b.push(g); this.count++;
    return g;
  }

  build(materials, parent, opts = {}) {
    const meshes = [];
    for (const [key, geos] of this.buckets) {
      const matKey = key.split('|')[1];
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mat = materials[matKey];
      if (!mat) { console.warn('missing material', matKey); continue; }
      const mesh = new THREE.Mesh(merged, mat);
      const noShadow = opts.noCast && opts.noCast.includes(matKey);
      mesh.castShadow = !noShadow;
      mesh.receiveShadow = !(opts.noReceive && opts.noReceive.includes(matKey));
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.cullRadius = merged.boundingSphere.radius;
      mesh.userData.cullCenter = merged.boundingSphere.center.clone();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ---------- world-space primitive helpers ----------
export function box(x0, y0, z0, x1, y1, z1) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
export function boxC(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
export function cyl(rt, rb, h, seg, x, y, z, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}
// quad facing direction (nx,nz) centered at (x,y,z) with atlas uv rect
export function quad(w, h, x, y, z, nx, nz, uvr = null) {
  const g = new THREE.PlaneGeometry(w, h);
  if (uvr) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uvr.u0 + uv.getX(i) * (uvr.u1 - uvr.u0), uvr.v0 + uv.getY(i) * (uvr.v1 - uvr.v0));
    }
  }
  g.rotateY(Math.atan2(nx, nz));
  g.translate(x, y, z);
  return g;
}
export function transformed(g, pos, rotY = 0, scale = 1, rotX = 0, rotZ = 0) {
  if (scale !== 1) g.scale(scale, scale, scale);
  if (rotZ) g.rotateZ(rotZ);
  if (rotX) g.rotateX(rotX);
  if (rotY) g.rotateY(rotY);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}

// random displacement for organic shapes (rocks, canopies)
export function displace(g, amount, freq, seed = 0) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq + seed) * Math.cos(v.y * freq * 1.3 + seed * 2.1) * Math.sin(v.z * freq * 0.9 + seed * 0.7)
      + 0.5 * Math.sin(v.x * freq * 2.3 + seed * 3.0) * Math.sin(v.z * freq * 2.1);
    const l = v.length() || 1;
    v.multiplyScalar(1 + (n * amount) / l);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// vertex-color AO for walls: darker near the ground
export function wallShade(base, groundY = 0) {
  const c = base.isColor ? base : new THREE.Color(base);
  return (x, y) => {
    const t = Math.min(1, Math.max(0, (y - groundY) / 2.2));
    const k = 0.62 + 0.38 * (t * t * (3 - 2 * t));
    return [c.r * k, c.g * k, c.b * k];
  };
}
