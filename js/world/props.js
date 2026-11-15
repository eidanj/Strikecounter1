// Detailed street props built from merged primitives. Each function adds
// geometry to the batch and (optionally) colliders to the collision world.
import * as THREE from 'three';
import { box, boxC, cyl, quad, transformed, displace } from './builder.js';

const C = (h) => new THREE.Color(h);
const rotP = (x, z, cx, cz, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return [cx + x * c + z * s, cz - x * s + z * c]; };

// local-space geometry placed at (x,y,z) rotated by ry
function put(g, x, y, z, ry) { g.rotateY(ry); g.translate(x, y, z); return g; }

export function car(B, W, x, z, ry, color, rng) {
  const paint = C(color);
  const sh = new THREE.Shape();
  const pts = [[-1.82, 0.32], [1.74, 0.32], [1.86, 0.5], [1.84, 0.78], [1.25, 0.96], [0.52, 1.4], [-1.28, 1.44], [-1.72, 1.02], [-1.86, 0.62]];
  sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: 1.46, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 4 });
  body.translate(0, 0, -0.73);
  B.add('carPaint', put(body, x, 0, z, ry), paint);
  const gs = new THREE.Shape();
  const gp = [[1.18, 0.99], [0.53, 1.36], [-1.24, 1.39], [-1.66, 1.03]];
  gs.moveTo(gp[0][0], gp[0][1]); for (let i = 1; i < gp.length; i++) gs.lineTo(gp[i][0], gp[i][1]); gs.closePath();
  const glass = new THREE.ExtrudeGeometry(gs, { depth: 1.62, bevelEnabled: false });
  glass.translate(0, 0.012, -0.81);
  glass.scale(1.012, 1, 1);
  B.add('carGlass', put(glass, x, 0, z, ry));
  // B pillars
  for (const sz of [-0.82, 0.82]) B.add('carPaint', put(boxC(0.12, 0.42, 0.04, -0.35, 1.18, sz), x, 0, z, ry), paint);
  // wheels
  for (const [wx, wz] of [[1.15, 0.78], [1.15, -0.78], [-1.2, 0.78], [-1.2, -0.78]]) {
    const w = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 16); w.rotateX(Math.PI / 2); w.translate(wx, 0.31, wz);
    B.add('rubber', put(w, x, 0, z, ry));
    const hub = new THREE.CylinderGeometry(0.17, 0.17, 0.235, 12); hub.rotateX(Math.PI / 2); hub.translate(wx, 0.31, wz);
    B.add('chrome', put(hub, x, 0, z, ry));
  }
  // bumpers & lights
  B.add('rubber', put(boxC(0.12, 0.16, 1.62, 1.9, 0.42, 0), x, 0, z, ry));
  B.add('rubber', put(boxC(0.12, 0.16, 1.62, -1.92, 0.42, 0), x, 0, z, ry));
  for (const sz of [-0.55, 0.55]) {
    B.add('lampGlass', put(boxC(0.06, 0.12, 0.26, 1.9, 0.68, sz), x, 0, z, ry));
    B.add('paint', put(boxC(0.06, 0.14, 0.2, -1.93, 0.75, sz), x, 0, z, ry), C('#c01818'));
  }
  // side mirrors
  for (const sz of [-0.86, 0.86]) B.add('carPaint', put(boxC(0.12, 0.08, 0.12, 0.62, 1.05, sz), x, 0, z, ry), paint);
  // collider (cars are axis aligned in practice; take the rotated AABB)
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = 1.95 * c + 0.85 * s, hz = 1.95 * s + 0.85 * c;
  W.addBox(x - hx, 0, z - hz, x + hx, 1.0, z + hz, { mat: 'metal' });
  W.addBox(x - hx * 0.7, 1.0, z - hz * 0.7, x + hx * 0.7, 1.45, z + hz * 0.7, { mat: 'metal' });
}

export function scooter(B, W, x, z, ry, color) {
  const paint = C(color);
  const body = new THREE.SphereGeometry(0.42, 14, 10); body.scale(1.5, 0.75, 0.75); body.translate(-0.25, 0.55, 0);
  B.add('carPaint', put(body, x, 0, z, ry), paint);
  const shield = boxC(0.1, 0.75, 0.44, 0.52, 0.72, 0); shield.rotateZ(-0.25);
  B.add('carPaint', put(shield, x, 0, z, ry), paint);
  B.add('paint', put(boxC(0.62, 0.12, 0.3, -0.25, 0.92, 0), x, 0, z, ry), C('#3b2a20'));
  B.add('chrome', put(boxC(0.06, 0.06, 0.62, 0.6, 1.12, 0), x, 0, z, ry));
  for (const wx of [0.62, -0.62]) {
    const w = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14); w.rotateX(Math.PI / 2); w.translate(wx, 0.2, 0);
    B.add('rubber', put(w, x, 0, z, ry));
  }
  W.addCyl(x, z, 0.5, 0, 1.0, { mat: 'metal', cover: false });
}

export function streetLamp(B, W, x, z, ry = 0) {
  B.add('iron', cyl(0.16, 0.2, 0.35, 10, x, 0, z));
  B.add('iron', cyl(0.065, 0.08, 3.9, 8, x, 0.35, z));
  B.add('iron', cyl(0.1, 0.1, 0.12, 8, x, 4.2, z));
  const [ax, az] = rotP(0.45, 0, x, z, ry);
  B.add('iron', put(boxC(0.9, 0.05, 0.05, 0.45, 4.2, 0), x, 0, z, ry));
  B.add('iron', cyl(0.18, 0.08, 0.12, 6, ax, 4.08, az));
  B.add('lampGlass', cyl(0.13, 0.1, 0.35, 6, ax, 3.73, az));
  B.add('iron', cyl(0.02, 0.2, 0.14, 6, ax, 4.04, az));
  W.addCyl(x, z, 0.16, 0, 4.2, { mat: 'metal', cover: false });
}

export function wallLantern(B, side, u, y, P) {
  // side helper P(u,y,off) -> [x,y,z]
  const [x0, y0, z0] = P(u, y, 0.25);
  const [bx, by, bz] = P(u, y + 0.25, 0.12);
  B.add('iron', side.ax === 'x' ? boxC(0.05, 0.05, 0.3, bx, by, bz) : boxC(0.3, 0.05, 0.05, bx, by, bz));
  B.add('iron', cyl(0.16, 0.06, 0.12, 6, x0, y0 + 0.12, z0));
  B.add('lampGlass', cyl(0.12, 0.09, 0.3, 6, x0, y0 - 0.18, z0));
}

export function bench(B, W, x, z, ry) {
  for (let i = 0; i < 4; i++) B.add('wood', put(boxC(1.8, 0.05, 0.1, 0, 0.46, -0.2 + i * 0.13), x, 0, z, ry), C('#8a6a48'), 0.6);
  for (let i = 0; i < 3; i++) B.add('wood', put(boxC(1.8, 0.09, 0.04, 0, 0.62 + i * 0.13, 0.26), x, 0, z, ry), C('#8a6a48'), 0.6);
  for (const lx of [-0.75, 0.75]) {
    B.add('iron', put(boxC(0.06, 0.46, 0.5, lx, 0.23, 0.02), x, 0, z, ry));
    B.add('iron', put(boxC(0.06, 0.5, 0.06, lx, 0.72, 0.26), x, 0, z, ry));
  }
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  W.addBox(x - (0.92 * c + 0.3 * s), 0, z - (0.92 * s + 0.3 * c), x + (0.92 * c + 0.3 * s), 0.5, z + (0.92 * s + 0.3 * c), { mat: 'wood', cover: false });
}

export function planter(B, W, x, z, rng, kind = 'lemon') {
  const pot = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.32, 0), new THREE.Vector2(0.42, 0.62), new THREE.Vector2(0.47, 0.66), new THREE.Vector2(0.47, 0.72), new THREE.Vector2(0, 0.72)], 14);
  pot.translate(x, 0, z);
  B.add('terracotta', pot, C('#ffffff'));
  B.add('dirt', cyl(0.4, 0.4, 0.02, 10, x, 0.68, z), C('#7a6a5a'), 0.5);
  if (kind === 'lemon') {
    B.add('bark', cyl(0.04, 0.06, 1.0, 6, x, 0.68, z), C('#ffffff'), 0.5);
    const f = displace(new THREE.IcosahedronGeometry(0.62, 2), 0.12, 4, rng.range(0, 9));
    f.translate(x, 1.85, z);
    B.add('foliageLo', f, (px, py, pz) => { const k = 0.7 + 0.3 * Math.sin(px * 13 + py * 7); return [0.12 * k, 0.32 * k, 0.08 * k]; });
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, 6.28), e = rng.range(-0.6, 0.8);
      const s = new THREE.IcosahedronGeometry(0.06, 0); s.translate(x + Math.cos(a) * 0.58 * Math.cos(e), 1.85 + Math.sin(e) * 0.55, z + Math.sin(a) * 0.58 * Math.cos(e));
      B.add('paint', s, C('#f2d02a'));
    }
  } else {
    const f = displace(new THREE.IcosahedronGeometry(0.5, 1), 0.12, 5, rng.range(0, 9));
    f.scale(1, 0.7, 1); f.translate(x, 1.0, z);
    B.add('foliageLo', f, [0.14, 0.3, 0.1]);
    for (let i = 0; i < 8; i++) {
      const a = rng.range(0, 6.28);
      const s = new THREE.IcosahedronGeometry(0.07, 0); s.translate(x + Math.cos(a) * 0.42, 1.12 + rng.range(-0.1, 0.15), z + Math.sin(a) * 0.42);
      B.add('paint', s, C(rng.pick(['#d8233a', '#e8487a', '#f5f0f0'])));
    }
  }
  W.addCyl(x, z, 0.47, 0, 0.72, { mat: 'stone' });
}

export function cafeSet(B, W, x, z, rng, umbrellaColor) {
  B.add('iron', cyl(0.25, 0.25, 0.03, 12, x, 0, z));
  B.add('iron', cyl(0.035, 0.035, 0.72, 6, x, 0.03, z));
  B.add('paint', cyl(0.42, 0.42, 0.035, 18, x, 0.74, z), C('#efeae0'));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + rng.range(-0.3, 0.3), cx = x + Math.cos(a) * 0.72, cz = z + Math.sin(a) * 0.72;
    const ry = -a + Math.PI / 2;
    B.add('paint', put(boxC(0.42, 0.04, 0.42, 0, 0.45, 0), cx, 0, cz, ry), C('#2e4a3a'));
    B.add('paint', put(boxC(0.42, 0.42, 0.04, 0, 0.68, 0.2), cx, 0, cz, ry), C('#2e4a3a'));
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) B.add('iron', put(boxC(0.03, 0.45, 0.03, lx, 0.225, lz), cx, 0, cz, ry));
  }
  // cups & a tiny espresso
  B.add('paint', cyl(0.04, 0.03, 0.06, 8, x + 0.12, 0.775, z - 0.05), C('#ffffff'));
  B.add('paint', cyl(0.04, 0.03, 0.06, 8, x - 0.15, 0.775, z + 0.08), C('#ffffff'));
  if (umbrellaColor) {
    B.add('iron', cyl(0.025, 0.025, 2.4, 6, x, 0.77, z));
    const cone = new THREE.ConeGeometry(1.5, 0.45, 12, 1, true);
    cone.translate(x, 3.0, z);
    const uc = C(umbrellaColor), wc = C('#f3ecdc');
    B.add('cloth', cone, (px, py, pz) => { const a = Math.atan2(pz - z, px - x); return (Math.floor((a + Math.PI) / (Math.PI * 2) * 12) % 2) ? [uc.r, uc.g, uc.b] : [wc.r, wc.g, wc.b]; });
  }
  W.addCyl(x, z, 0.48, 0, 0.78, { mat: 'metal', cover: false });
}

export function crate(B, W, x, y, z, s, ry = 0, collide = true) {
  const g = boxC(s, s, s, 0, s / 2, 0);
  B.add('wood', put(g, x, y, z, ry), C('#c9a77a'), 0.9);
  // slats / frame
  for (const sy of [0.06, s - 0.06]) for (const sz of [-1, 1]) B.add('wood', put(boxC(s + 0.02, 0.1, 0.03, 0, sy, sz * (s / 2)), x, y, z, ry), C('#9c7a52'), 0.9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('wood', put(boxC(0.08, s, 0.08, sx * (s / 2 - 0.03), s / 2, sz * (s / 2 - 0.03)), x, y, z, ry), C('#8a6a44'), 0.9);
  if (collide) W.addBox(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, { mat: 'wood' });
}

export function barrel(B, W, x, z, rng) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.38 + Math.sin(t * Math.PI) * 0.07, t * 1.05)); }
  const g = new THREE.LatheGeometry(pts, 16); g.translate(x, 0, z);
  B.add('wood', g, C('#a07a50'), null);
  for (const hy of [0.12, 0.35, 0.7, 0.93]) {
    const r = 0.38 + Math.sin(hy / 1.05 * Math.PI) * 0.07 + 0.008;
    const h = new THREE.CylinderGeometry(r, r, 0.05, 16, 1, true); h.translate(x, hy, z);
    B.add('iron', h);
  }
  B.add('wood', cyl(0.38, 0.38, 0.02, 14, x, 1.03, z), C('#8a6844'), 0.5);
  W.addCyl(x, z, 0.44, 0, 1.05, { mat: 'wood' });
}

export function bin(B, W, x, z, ry) {
  B.add('paint', put(boxC(0.7, 1.0, 0.6, 0, 0.5, 0), x, 0, z, ry), C('#2f5d3a'));
  B.add('paint', put(boxC(0.74, 0.08, 0.64, 0, 1.03, 0), x, 0, z, ry), C('#25492e'));
  W.addBox(x - 0.4, 0, z - 0.4, x + 0.4, 1.06, z + 0.4, { mat: 'metal' });
}

export function bollard(B, W, x, z) {
  B.add('stone', cyl(0.14, 0.18, 0.75, 10, x, 0, z), C('#e8e2d6'));
  B.add('stone', new THREE.SphereGeometry(0.15, 10, 6).translate(x, 0.78, z), C('#e8e2d6'));
  W.addCyl(x, z, 0.18, 0, 0.9, { mat: 'stone', cover: false });
}

export function marketStall(B, W, x, z, ry, scheme, rng) {
  const prod = ['#d8231f', '#f2c21a', '#f08a1a', '#5a2a6a', '#5aa02a', '#e8e0c0'];
  // counter
  B.add('wood', put(boxC(2.6, 0.95, 1.1, 0, 0.475, 0), x, 0, z, ry), C('#9c7a52'), 0.8);
  // produce crates on top (tilted)
  for (let i = 0; i < 3; i++) {
    const cx = -0.85 + i * 0.85;
    B.add('wood', put(boxC(0.78, 0.18, 0.95, cx, 1.04, 0), x, 0, z, ry), C('#c9a77a'), 0.8);
    const col = C(rng.pick(prod));
    for (let k = 0; k < 14; k++) {
      const s = new THREE.IcosahedronGeometry(rng.range(0.06, 0.09), 1);
      s.translate(cx + rng.range(-0.32, 0.32), 1.16 + rng.range(0, 0.05), rng.range(-0.38, 0.38));
      B.add('paint', put(s, x, 0, z, ry), col);
    }
  }
  // posts
  for (const [px, pz] of [[-1.25, -0.5], [1.25, -0.5], [-1.25, 0.6], [1.25, 0.6]]) B.add('wood', put(boxC(0.08, 2.5, 0.08, px, 1.25, pz), x, 0, z, ry), C('#6a4a2e'), 0.6);
  // canopy
  const v0 = 1 - (scheme + 1) / 4 + 0.22 / 4, v1 = 1 - scheme / 4;
  const can = new THREE.PlaneGeometry(2.9, 1.6);
  const uv = can.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  can.rotateX(-Math.PI / 2 + 0.25); can.translate(0, 2.55, 0.05);
  B.add('awning', put(can, x, 0, z, ry));
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = 1.3 * c + 0.55 * s, hz = 1.3 * s + 0.55 * c;
  W.addBox(x - hx, 0, z - hz, x + hx, 1.15, z + hz, { mat: 'wood' });
}

export function kiosk(B, W, x, z, ry) {
  B.add('paint', put(boxC(2.6, 2.6, 2.0, 0, 1.3, 0), x, 0, z, ry), C('#2d5a3a'));
  B.add('paint', put(boxC(3.0, 0.15, 2.4, 0, 2.7, 0), x, 0, z, ry), C('#234a2e'));
  B.add('shopGlass', put(quad(2.2, 1.4, 0, 1.35, 1.01, 0, 1, { u0: 0.5, u1: 1, v0: 0.5, v1: 1 }), x, 0, z, ry));
  B.add('signs', put(quad(2.4, 0.3, 0, 2.95, 1.22, 0, 1, { u0: 0.5, u1: 1, v0: 1 - 5 / 16, v1: 1 - 4 / 16 }), x, 0, z, ry));
  B.add('paint', put(boxC(2.5, 0.3, 0.02, 0, 2.95, 1.2), x, 0, z, ry), C('#1b3a6b'));
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hx = 1.3 * c + 1.0 * s, hz = 1.3 * s + 1.0 * c;
  W.addBox(x - hx, 0, z - hz, x + hx, 2.7, z + hz, { mat: 'metal' });
}

export function hayBale(B, W, x, y, z, ry, rng) {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 18, 2);
  // rounded edges
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i); const r = Math.hypot(p.getX(i), p.getZ(i)); if (Math.abs(yy) > 0.55 && r > 0.6) { p.setX(i, p.getX(i) * 0.93); p.setZ(i, p.getZ(i) * 0.93); } }
  g.computeVertexNormals();
  g.rotateZ(Math.PI / 2); g.rotateY(ry); g.translate(x, y + 0.75, z);
  B.add('hay', g, C('#ffffff'), null);
  W.addCyl(x, z, 0.82, y, y + 1.5, { mat: 'wood' });
}

export function rockMesh(rng, r) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  displace(g, r * 0.35, 1.6 / r, rng.range(0, 50));
  g.scale(rng.range(0.9, 1.4), rng.range(0.55, 0.9), rng.range(0.9, 1.3));
  return g;
}
