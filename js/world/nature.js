// Countryside half: rolling Tuscan terrain, dirt roads, vineyard, olive grove,
// farmhouse + ruined barn, chapel, watchtower ruin, dry-stone walls, hay bales.
import * as THREE from 'three';
import { RNG, fbm2, smoothstep, lerp, clamp } from '../noise.js';
import { box, boxC, cyl, quad, displace, wallShade } from './builder.js';
import * as P from './props.js';
import { building, gableRoof } from './town.js';
import { signUV } from '../textures.js';

const col = (h) => new THREE.Color(h);

export const ROADS = [
  [[-2, 0], [10, 0.5], [24, -5], [40, -6], [56, 0], [70, 6], [84, 5], [98, -1], [112, 0], [128, 0]],
  [[24, -5], [22, 15], [18, 35], [10, 52], [-2, 56]],
  [[40, -6], [42, -22], [38, -40], [22, -52], [-2, -54]],
  [[70, 6], [74, 11], [78, 12.5]],
  [[-2, 27.3], [8, 30], [18, 35]],
];
export const NATURE = {
  farmhouse: [72, 14, 84, 23], barn: [70, -12, 80, -4], well: [87, 10], chapel: [98, 50, 104, 57],
  tower: [96, -58], tSpawn: [116, 0], vineyard: [28, 24, 60, 70], olive: [50, -74, 86, -28],
};
const FLAT = [
  { x: 78, z: 12, r: 15, f: 10 }, { x: 116, z: 0, r: 12, f: 10 }, { x: 101, z: 53.5, r: 8, f: 8 }, { x: 96, z: -58, r: 6, f: 6 },
  { x: 44, z: 47, r: 22, f: 10, scale: 0.35 },
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  return d;
}

function rawHeight(x, z) {
  let h = 2.4 * fbm2(x * 0.0105 + 3.1, z * 0.0105 - 1.7, 4) + 1.1 * fbm2(x * 0.032, z * 0.032 + 9, 3);
  h = h * 2.4 + 1.0;
  h += smoothstep(118, 165, x) * 16 + smoothstep(80, 130, Math.abs(z)) * 13;
  return h;
}

export function makeHeightField() {
  // pre-sampled grid -> fast bilinear lookups for physics/raycasts/nav
  const X0 = -2, Z0 = -130, X1 = 180, Z1 = 130, S = 1;
  const nx = Math.round((X1 - X0) / S) + 1, nz = Math.round((Z1 - Z0) / S) + 1;
  const H = new Float32Array(nx * nz);
  const flatH = FLAT.map(f => rawHeight(f.x, f.z));
  let maxH = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * S, z = Z0 + j * S;
    let h = rawHeight(x, z);
    FLAT.forEach((f, k) => {
      const d = Math.hypot(x - f.x, z - f.z);
      const w = 1 - smoothstep(f.r, f.r + f.f, d);
      if (f.scale) h = lerp(h, flatH[k] + (h - flatH[k]) * f.scale, w); else h = lerp(h, flatH[k], w);
    });
    // soften along roads
    const rd = roadDist(x, z);
    if (rd < 7) { const w = 1 - smoothstep(2.5, 7, rd); h = lerp(h, h * 0.82 + 0.15, w * 0.6); }
    const blend = smoothstep(2, 26, x);
    h = Math.max(-0.3, h) * blend;
    H[j * nx + i] = h; if (h > maxH) maxH = h;
  }
  const fn = (x, z) => {
    const fx = (x - X0) / S, fz = (z - Z0) / S;
    if (fx <= 0) return 0;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(nz - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  };
  return { fn, maxH, X0, Z0, X1, Z1 };
}

// macro colour variation shared by terrain and grass instances
export function dryness(x, z) { return smoothstep(-0.15, 0.45, fbm2(x * 0.018 + 40, z * 0.018 - 12, 3)); }
export function lushness(x, z) { return smoothstep(0.0, 0.5, fbm2(x * 0.05 - 7, z * 0.05 + 3, 2)); }

export function buildTerrain(ctx, hf) {
  const { batch: B } = ctx;
  const X0 = -2, X1 = 178, Z0 = -128, Z1 = 128, S = 1;
  const w = X1 - X0, d = Z1 - Z0;
  const g = new THREE.PlaneGeometry(w, d, Math.round(w / S), Math.round(d / S));
  g.rotateX(-Math.PI / 2);
  g.translate(X0 + w / 2, 0, Z0 + d / 2);
  const p = g.attributes.position, n = p.count;
  const colors = new Float32Array(n * 3), splat = new Float32Array(n), uv = g.attributes.uv;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, hf.fn(x, z));
    uv.setXY(i, x / 6, z / 6);
    const dr = dryness(x, z), lu = lushness(x, z);
    let r = 1, gg = 1, b = 1;
    r = lerp(0.92, 1.18, dr); gg = lerp(0.98, 1.04, dr); b = lerp(0.9, 0.62, dr);
    r *= lerp(0.88, 1, lu); gg *= lerp(0.92, 1, lu); b *= lerp(0.9, 1, lu);
    colors[i * 3] = r; colors[i * 3 + 1] = gg; colors[i * 3 + 2] = b;
    const rd = roadDist(x, z);
    let sp = 1 - smoothstep(1.4, 3.3, rd);
    // yard + spawn dirt
    sp = Math.max(sp, 1 - smoothstep(6, 12, Math.hypot(x - 78, z - 8)));
    sp = Math.max(sp, 1 - smoothstep(5, 9, Math.hypot(x - 116, z)));
    sp = Math.max(sp, (1 - smoothstep(0, 5, x)) * 0.9);
    // vineyard inter-row dirt strips
    if (x > 28 && x < 60 && z > 24 && z < 70) sp = Math.max(sp, 0.55 + 0.35 * Math.cos(((z - 22) / 2.6) * Math.PI * 2));
    splat[i] = sp;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 1));
  const mesh = new THREE.Mesh(g, ctx.mats.terrain);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}

// wraps batch/world so code written for y=0 ground can be placed on a hillside
function offsetCtx(ctx, dy) {
  const B0 = ctx.batch, W0 = ctx.world;
  return Object.assign({}, ctx, {
    batch: { add: (m, g, c, uv, h) => { g.translate(0, dy, 0); const cc = typeof c === 'function' ? ((x, y, z, a, b, d) => c(x, y - dy, z, a, b, d)) : c; return B0.add(m, g, cc, uv, h); } },
    world: Object.assign(Object.create(W0), {
      addBox: (x0, y0, z0, x1, y1, z1, o) => W0.addBox(x0, y0 + dy, z0, x1, y1 + dy, z1, o),
      addCyl: (x, z, r, y0, y1, o) => W0.addCyl(x, z, r, y0 + dy, y1 + dy, o),
    }),
  });
}

export function buildNature(ctx0, hf) {
  const ctx = ctx0;
  const { rng } = ctx;
  let B = ctx.batch, W = ctx.world;
  const H = hf.fn;
  const trees = []; // {type, x, y, z, s, ry, collide}
  const bushes = [];
  const occupied = []; // rects/circles to keep vegetation off
  const blocked = (x, z, pad = 0) => {
    for (const o of occupied) {
      if (o.r) { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true; }
      else if (x > o[0] - pad && x < o[2] + pad && z > o[1] - pad && z < o[3] + pad) return true;
    }
    return false;
  };

  // ---------- farmhouse ----------
  const fr = NATURE.farmhouse;
  const fy = H((fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2);
  const fctx = offsetCtx(ctx, fy);
  B = fctx.batch; W = fctx.world;
  B.add('blocks', box(fr[0] - 0.1, -2, fr[1] - 0.1, fr[2] + 0.1, 0.05, fr[3] + 0.1), [0.8, 0.78, 0.74], 3);
  building(fctx, { rect: fr, floors: 2, style: 'casa', wallMat: 'blocks', color: col('#ffffff'), shutter: col('#6b4b2f'), door: col('#4a2e1a'), roof: 'gable', H: 4.0 + 3.3 + 0.7, arcade: null }, () => 0, () => 26);
  occupied.push([fr[0] - 2, fr[1] - 3, fr[2] + 2, fr[3] + 2]);
  // external stone stair on the south side
  for (let i = 0; i < 8; i++) {
    const y = (i + 1) * 0.42;
    B.add('blocks', box(fr[0] + 1 + i * 0.55, 0, fr[1] - 1.4, fr[0] + 1.55 + i * 0.55, y, fr[1]), [0.95, 0.93, 0.9], 1.5);
    W.addBox(fr[0] + 1 + i * 0.55, 0, fr[1] - 1.4, fr[0] + 1.55 + i * 0.55, y, fr[1], { mat: 'stone' });
  }
  B.add('blocks', box(fr[0] + 5.4, 0, fr[1] - 1.6, fr[0] + 7.4, 3.36, fr[1]), [0.95, 0.93, 0.9], 1.5);
  W.addBox(fr[0] + 5.4, 0, fr[1] - 1.6, fr[0] + 7.4, 3.36, fr[1], { mat: 'stone' });
  B.add('iron', box(fr[0] + 5.4, 3.36, fr[1] - 1.62, fr[0] + 7.4, 4.3, fr[1] - 1.58));
  // yard props
  { const o = offsetCtx(ctx, H(82, 8)); P.cafeSet(o.batch, o.world, 82, 8, rng, '#b3261e'); }
  { const o = offsetCtx(ctx, H(73, 11.3)); P.barrel(o.batch, o.world, 72.5, 11.6, rng); P.barrel(o.batch, o.world, 73.4, 11.0, rng); }
  B = ctx.batch; W = ctx.world;
  for (let i = 0; i < 3; i++) P.crate(B, W, 84 + i * 1.1, H(84, 9), 9 + (i % 2) * 0.4, 0.9, i * 0.3);
  // well
  const [wx, wz] = NATURE.well, wy = H(wx, wz);
  B.add('blocks', new THREE.CylinderGeometry(1.0, 1.05, 0.95, 16, 1, false).translate(wx, wy + 0.47, wz), [0.95, 0.93, 0.9], 1);
  B.add('carGlass', new THREE.CircleGeometry(0.8, 14).rotateX(-Math.PI / 2).translate(wx, wy + 0.8, wz));
  for (const s of [-1, 1]) B.add('wood', boxC(0.12, 2.2, 0.12, wx + s * 0.85, wy + 1.1, wz), col('#7a5a3a'), 0.6);
  B.add('wood', boxC(1.9, 0.1, 0.1, wx, wy + 2.1, wz), col('#7a5a3a'), 0.6);
  gableRoof(B, wx - 1.2, wz - 0.8, wx + 1.2, wz + 0.8, wy + 2.15, col('#8a6a4a'), 'wood', 'x', 0.6, 0.1);
  W.addCyl(wx, wz, 1.05, wy, wy + 0.95, { mat: 'stone' });
  occupied.push({ x: wx, z: wz, r: 2 });

  // ---------- barn ruin ----------
  const br = NATURE.barn, by = H((br[0] + br[2]) / 2, (br[1] + br[3]) / 2);
  const wallSeg = (x0, z0, x1, z1, h) => {
    B.add('blocks', box(x0, by - 0.5, z0, x1, by + h, z1), wallShade(col('#e6dcc8'), by), 3);
    W.addBox(x0, by - 0.5, z0, x1, by + h, z1, { mat: 'stone' });
  };
  const t = 0.55;
  // north wall with doorway
  wallSeg(br[0], br[3] - t, br[0] + 3.5, br[3], 3.6); wallSeg(br[0] + 5.5, br[3] - t, br[2], br[3], 2.2);
  // south wall broken
  wallSeg(br[0], br[1], br[0] + 4, br[1] + t, 1.3); wallSeg(br[0] + 6, br[1], br[2], br[1] + t, 4.2);
  // west/east walls
  wallSeg(br[0], br[1], br[0] + t, br[3], 3.0);
  wallSeg(br[2] - t, br[1], br[2], br[1] + 3, 4.4); wallSeg(br[2] - t, br[3] - 2.5, br[2], br[3], 1.1);
  B.add('wood', boxC(10.6, 0.25, 0.25, (br[0] + br[2]) / 2, by + 3.5, br[1] + 3.5, 0, 0, 0.35), col('#5a4030'), 1);
  P.hayBale(B, W, br[0] + 2, by, br[1] + 2.4, 0.2, rng);
  P.hayBale(B, W, br[0] + 7.5, by, br[3] - 2.0, 1.4, rng);
  P.crate(B, W, br[0] + 4.5, by, br[1] + 4, 1.0, 0.5);
  occupied.push([br[0] - 1, br[1] - 1, br[2] + 1, br[3] + 1]);

  // ---------- chapel ----------
  const cr = NATURE.chapel;
  const cy = H((cr[0] + cr[2]) / 2, (cr[1] + cr[3]) / 2);
  { const o = offsetCtx(ctx, cy);
    o.batch.add('blocks', box(cr[0] - 0.1, -2, cr[1] - 0.1, cr[2] + 0.1, 0.05, cr[3] + 0.1), [0.8, 0.78, 0.74], 3);
    building(o, { rect: cr, floors: 2, style: 'palazzo', wallMat: 'blocks', color: col('#ffffff'), shutter: col('#3f6b47'), door: col('#5a3820'), roof: 'gable', H: 8.0, arcade: null }, () => 0, () => 28);
    o.batch.add('blocks', box(cr[0] + 2.2, 8.0, cr[3] - 1.2, cr[0] + 3.8, 11, cr[3]), [1, 1, 1], 2); }
  occupied.push([cr[0] - 2, cr[1] - 2, cr[2] + 2, cr[3] + 2]);

  // ---------- watchtower ruin ----------
  const [tx, tz] = NATURE.tower, ty = H(tx, tz);
  const segs = 10, R = 3.4;
  for (let i = 0; i < segs; i++) {
    if (i === 7) continue; // doorway
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const h = i % 3 === 0 ? rng.range(2, 3.5) : rng.range(5, 9);
    const cx = tx + Math.cos((a0 + a1) / 2) * R, cz = tz + Math.sin((a0 + a1) / 2) * R;
    const L = 2 * R * Math.sin(Math.PI / segs) + 0.2;
    B.add('blocks', boxC(L, h + 1, 0.9, cx, ty + h / 2 - 0.5, cz, -(a0 + a1) / 2 + Math.PI / 2), wallShade(col('#e2d6be'), ty), 3);
    W.addBox(cx - 0.75, ty - 0.5, cz - 0.75, cx + 0.75, ty + h, cz + 0.75, { mat: 'stone' });
  }
  occupied.push({ x: tx, z: tz, r: 6 });

  // ---------- T spawn camp ----------
  const [sx, sz] = NATURE.tSpawn, sy = H(sx, sz);
  for (let i = 0; i < 4; i++) P.crate(B, W, sx - 6 + i * 1.2, sy, sz + 7, 1.0, 0.2 * i);
  P.crate(B, W, sx - 5.4, sy + 1.0, sz + 7, 0.9, 0.4);
  for (let i = 0; i < 3; i++) P.hayBale(B, W, sx - 4 + i * 2.2, H(sx - 4 + i * 2.2, sz - 8), sz - 8, 0, rng);
  tractor(B, W, sx + 4, H(sx + 4, sz + 6), sz + 6, 0.6);
  occupied.push({ x: sx, z: sz, r: 9 });

  // ---------- dry stone walls ----------
  const walls = [
    [[12, -13], [30, -14.5], [48, -13]], [[62, -20], [66, -34], [70, -48]], [[88, 20], [96, 30], [106, 33]],
    [[64, 24], [66, 46]], [[90, -20], [106, -24], [112, -36]], [[14, 18], [10, 40]], [[30, 76], [60, 78]],
  ];
  for (const wl of walls) for (let i = 0; i < wl.length - 1; i++) stoneWall(B, W, H, rng, wl[i], wl[i + 1], occupied);

  // ---------- vineyard ----------
  const [vx0, vz0, vx1, vz1] = NATURE.vineyard;
  B.add('signs', quad(2.4, 0.3, vx0 - 1.5, H(vx0 - 1.5, vz0 - 1) + 1.6, vz0 - 1, -1, 0, signUV(27)));
  B.add('wood', boxC(0.1, 1.8, 0.1, vx0 - 1.5, H(vx0 - 1.5, vz0 - 1) + 0.9, vz0 - 1.6), col('#6a4a30'), 0.5);
  B.add('wood', boxC(0.1, 1.8, 0.1, vx0 - 1.5, H(vx0 - 1.5, vz0 - 1) + 0.9, vz0 - 0.4), col('#6a4a30'), 0.5);
  for (let z = vz0 + 1; z < vz1; z += 2.6) {
    for (const [a, b] of [[vx0, 43], [47, vx1]]) {
      vineRow(B, W, H, rng, a, b, z);
    }
  }
  occupied.push([vx0 - 1, vz0 - 1, vx1 + 1, vz1 + 1]);

  // ---------- hay bales in fields ----------
  for (let i = 0; i < 14; i++) {
    const x = rng.range(86, 112), z = rng.chance(0.5) ? rng.range(-22, -8) : rng.range(28, 46);
    if (blocked(x, z, 1.5) || roadDist(x, z) < 4) continue;
    P.hayBale(B, W, x, H(x, z) - 0.05, z, rng.range(0, 3), rng);
    occupied.push({ x, z, r: 1.6 });
  }
  // ---------- boulders ----------
  for (let i = 0; i < 46; i++) {
    const x = rng.range(10, 126), z = rng.range(-86, 86);
    if (blocked(x, z, 2) || roadDist(x, z) < 4) continue;
    const s = rng.range(0.5, 1.6);
    const g = P.rockMesh(rng, s); g.translate(x, H(x, z) + s * 0.2, z);
    B.add('rock', g, [1, 1, 1], 2.5);
    W.addBox(x - s * 0.9, H(x, z) - 0.5, z - s * 0.9, x + s * 0.9, H(x, z) + s * 0.85, z + s * 0.9, { mat: 'stone' });
    occupied.push({ x, z, r: s * 1.2 });
  }
  // fence line near farmhouse
  fence(B, W, H, [[88, 26], [100, 22], [106, 12], [104, -4]]);

  // ---------- trees ----------
  const tryTree = (type, x, z, s, collide = true, pad = 1.2) => {
    if (blocked(x, z, pad)) return false;
    if (roadDist(x, z) < (type === 'cypress' ? 3.2 : 4.2)) return false;
    if (x < 4) return false;
    trees.push({ type, x, y: H(x, z), z, s, ry: rng.range(0, 6.28), collide });
    occupied.push({ x, z, r: type === 'pine' ? 2.5 : 1.4 });
    return true;
  };
  // cypress avenues along the main road
  const R0 = ROADS[0];
  for (let i = 0; i < R0.length - 1; i++) {
    const [ax, az] = R0[i], [bx, bz] = R0[i + 1];
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let t = 6; t < L; t += 11) {
      const x = ax + (bx - ax) * (t / L), z = az + (bz - az) * (t / L);
      if (x < 14 || x > 108) continue;
      tryTree('cypress', x + nx * 5.2, z + nz * 5.2, rng.range(0.9, 1.15), true, 0.4);
      tryTree('cypress', x - nx * 5.2, z - nz * 5.2, rng.range(0.9, 1.15), true, 0.4);
    }
  }
  for (let i = 0; i < 12; i++) tryTree('cypress', 98 + rng.range(-8, 10), 50 + rng.range(-10, 12), rng.range(0.85, 1.2));
  for (let i = 0; i < 10; i++) tryTree('cypress', rng.range(86, 108), rng.range(24, 36), rng.range(0.8, 1.1));
  // olive grove grid
  const [ox0, oz0, ox1, oz1] = NATURE.olive;
  for (let x = ox0 + 3; x < ox1; x += 7.5) for (let z = oz0 + 3; z < oz1; z += 7.5) tryTree('olive', x + rng.range(-1.2, 1.2), z + rng.range(-1.2, 1.2), rng.range(0.85, 1.2));
  // umbrella pines
  for (let i = 0, n = 0; i < 200 && n < 22; i++) if (tryTree('pine', rng.range(10, 112), rng.range(-84, 84), rng.range(0.85, 1.15), true, 3)) n++;
  // forest edge east & backdrop belts
  for (let i = 0; i < 900; i++) {
    const x = rng.range(4, 178), z = rng.range(-128, 128);
    const inPlay = x < 127 && Math.abs(z) < 87;
    let dens;
    if (x > 118) dens = 1; else if (Math.abs(z) > 80) dens = 0.9; else dens = 0.035;
    if (rng.next() > dens) continue;
    if (inPlay && Math.hypot(x - 116, z) < 16) continue;
    tryTree(rng.chance(0.75) ? 'oak' : (rng.chance(0.5) ? 'pine' : 'cypress'), x, z, rng.range(0.8, 1.3), inPlay, 1.8);
  }
  // bushes
  for (let i = 0; i < 260; i++) {
    const x = rng.range(5, 126), z = rng.range(-86, 86);
    if (blocked(x, z, 0.8) || roadDist(x, z) < 3) continue;
    const s = rng.range(0.7, 1.4);
    bushes.push({ x, y: H(x, z), z, s });
    W.addCyl(x, z, 0.9 * s, H(x, z), H(x, z) + 1.35 * s, { solid: false, los: true, bullets: false, mat: 'foliage', cover: false });
  }
  return { trees, bushes, occupied, blocked };
}

function stoneWall(B, W, H, rng, a, b, occupied) {
  const [ax, az] = a, [bx, bz] = b;
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
  const ang = Math.atan2(-dz, dx);
  let gapAt = rng.range(0.3, 0.7) * L;
  for (let t = 0; t < L; t += 0.9) {
    if (Math.abs(t - gapAt) < 1.4 && L > 10) continue;
    const x = ax + dx * t, z = az + dz * t, y = H(x, z);
    // stacked irregular stones
    for (let layer = 0; layer < 3; layer++) {
      const w = rng.range(0.6, 1.0), hh = rng.range(0.28, 0.38);
      const g = boxC(w, hh, rng.range(0.45, 0.6), 0, 0, 0);
      displace(g, 0.04, 9, rng.range(0, 99));
      g.rotateY(ang + rng.range(-0.15, 0.15)); g.translate(x + rng.range(-0.05, 0.05), y - 0.1 + layer * 0.34 + hh / 2, z + rng.range(-0.05, 0.05));
      B.add('rock', g, [rng.range(0.85, 1.05), rng.range(0.85, 1.0), rng.range(0.8, 0.95)], 1.2);
    }
    W.addBox(x - 0.45, y - 0.3, z - 0.45, x + 0.45, y + 1.05, z + 0.45, { mat: 'stone' });
    occupied.push({ x, z, r: 0.7 });
  }
}

function vineRow(B, W, H, rng, x0, x1, z) {
  for (let x = x0; x <= x1; x += 4) {
    const y = H(x, z);
    B.add('wood', cyl(0.05, 0.06, 1.7, 6, x, y - 0.1, z), col('#7a5a3a'), 0.5);
  }
  const ya = H(x0, z), yb = H(x1, z);
  for (const hh of [0.75, 1.25]) {
    const g = new THREE.CylinderGeometry(0.008, 0.008, x1 - x0, 3); g.rotateZ(Math.PI / 2);
    g.rotateZ(Math.atan2(yb - ya, x1 - x0)); g.translate((x0 + x1) / 2, (ya + yb) / 2 + hh, z);
    B.add('iron', g);
  }
  // foliage clumps
  for (let x = x0 + 0.4; x < x1; x += 0.75) {
    const y = H(x, z);
    const inner = displace(new THREE.IcosahedronGeometry(0.42, 1), 0.08, 6, x);
    inner.scale(1.1, 0.95, 0.75); inner.translate(x, y + 1.0, z);
    const lk = rng.range(0.8, 1.1);
    B.add('foliageLo', inner, [0.16 * lk, 0.3 * lk, 0.08 * lk]);
    for (let k = 0; k < 3; k++) {
      const q = new THREE.PlaneGeometry(0.75, 0.75);
      q.rotateX(rng.range(-0.6, 0.6)); q.rotateY(rng.range(0, 6.28));
      q.translate(x + rng.range(-0.25, 0.25), y + rng.range(0.75, 1.35), z + rng.range(-0.25, 0.25));
      B.add('leafBroad', q, [0.85 * lk, 1.0 * lk, 0.75 * lk]);
    }
    if (rng.chance(0.25)) {
      for (let k = 0; k < 5; k++) { const gr = new THREE.IcosahedronGeometry(0.045, 0); gr.translate(x + rng.range(-0.08, 0.08), y + 0.72 - k * 0.04, z + (rng.chance(0.5) ? 0.33 : -0.33)); B.add('paint', gr, col('#3a1840')); }
    }
  }
  W.addBox(x0 - 0.2, H((x0 + x1) / 2, z) - 0.5, z - 0.38, x1 + 0.2, Math.max(ya, yb) + 1.45, z + 0.38, { mat: 'foliage', bullets: false, los: true });
}

function fence(B, W, H, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 2.5);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, y = H(x, z);
      B.add('wood', cyl(0.06, 0.07, 1.2, 6, x, y - 0.05, z), col('#8a6a48'), 0.5);
      if (k < n) {
        const x2 = ax + (bx - ax) * (k + 1) / n, z2 = az + (bz - az) * (k + 1) / n, y2 = H(x2, z2);
        for (const hh of [0.5, 0.95]) {
          const seg = Math.hypot(x2 - x, z2 - z, y2 - y);
          const g = new THREE.BoxGeometry(seg, 0.08, 0.05);
          g.rotateZ(Math.atan2(y2 - y, Math.hypot(x2 - x, z2 - z))); g.rotateY(Math.atan2(-(z2 - z), x2 - x));
          g.translate((x + x2) / 2, (y + y2) / 2 + hh, (z + z2) / 2);
          B.add('wood', g, col('#9a7a58'), 0.8);
        }
        const mx = (x + x2) / 2, mz = (z + z2) / 2;
        W.addBox(Math.min(x, x2) - 0.1, Math.min(y, y2), Math.min(z, z2) - 0.1, Math.max(x, x2) + 0.1, Math.max(y, y2) + 1.1, Math.max(z, z2) + 0.1, { mat: 'wood', los: false, bullets: false, cover: false });
      }
    }
  }
}

function tractor(B, W, x, y, z, ry) {
  const put = (g) => { g.rotateY(ry); g.translate(x, y, z); return g; };
  B.add('carPaint', put(boxC(2.2, 0.9, 1.1, 0.2, 1.1, 0)), col('#c8302e'));
  B.add('carPaint', put(boxC(1.0, 1.3, 1.2, -0.9, 1.6, 0)), col('#c8302e'));
  B.add('carGlass', put(boxC(0.9, 0.7, 1.22, -0.9, 1.95, 0)));
  B.add('chrome', put(cyl(0.06, 0.06, 1.0, 6, 0.9, 1.5, 0.3)));
  for (const [wx, wz, r] of [[-1.0, 0.75, 0.75], [-1.0, -0.75, 0.75], [1.0, 0.65, 0.42], [1.0, -0.65, 0.42]]) {
    const w = new THREE.CylinderGeometry(r, r, 0.4, 16); w.rotateX(Math.PI / 2); w.translate(wx, r, wz);
    B.add('rubber', put(w));
    const h = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.42, 10); h.rotateX(Math.PI / 2); h.translate(wx, r, wz);
    B.add('carPaint', put(h), col('#e8c020'));
  }
  W.addBox(x - 1.8, y, z - 1.8, x + 1.8, y + 2.3, z + 1.8, { mat: 'metal' });
}
