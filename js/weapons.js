// Weapon definitions (parody names, CS-like stats) and procedural models.
// Model space: grip at origin, barrel toward -Z, up +Y. Units: metres.
import * as THREE from 'three';

export const WEAPONS = {
  aka: {
    id: 'aka', name: 'AKA-47', slot: 1, kind: 'rifle', auto: true, damage: 36, headMul: 4, interval: 0.1, mag: 30, reserve: 90, reload: 2.45,
    spread: { base: 0.0045, move: 0.085, jump: 0.2, crouch: 0.7, bloom: 0.0065, maxBloom: 0.05, recover: 5.5, ads: 0.55 },
    recoil: { v: 1.45, h: 0.75, recover: 7, pattern: 'ak' }, armorPen: 0.78, falloff: 0.98, moveMul: 0.86, adsZoom: 1.25, adsTime: 0.22, sound: 'rifleHeavy', price: 0,
    blurb: 'Hits like Nonna\'s wooden spoon. Kicks like one too.',
  },
  rigatoni: {
    id: 'rigatoni', name: 'M4-Rigatoni', slot: 1, kind: 'rifle', auto: true, damage: 31, headMul: 4, interval: 0.09, mag: 30, reserve: 90, reload: 2.9,
    spread: { base: 0.0035, move: 0.075, jump: 0.2, crouch: 0.7, bloom: 0.0055, maxBloom: 0.042, recover: 6, ads: 0.5 },
    recoil: { v: 1.15, h: 0.55, recover: 8, pattern: 'm4' }, armorPen: 0.7, falloff: 0.97, moveMul: 0.9, adsZoom: 1.55, adsTime: 0.2, sound: 'rifle', price: 0,
    blurb: 'Al dente accuracy with a little red dot on top.',
  },
  mpnein: {
    id: 'mpnein', name: 'MP-Nein', slot: 1, kind: 'smg', auto: true, damage: 24, headMul: 3.6, interval: 0.07, mag: 30, reserve: 120, reload: 2.1,
    spread: { base: 0.009, move: 0.025, jump: 0.12, crouch: 0.8, bloom: 0.005, maxBloom: 0.04, recover: 8, ads: 0.6 },
    recoil: { v: 0.85, h: 0.6, recover: 9, pattern: 'smg' }, armorPen: 0.6, falloff: 0.88, moveMul: 0.98, adsZoom: 1.15, adsTime: 0.16, sound: 'smg', price: 0,
    blurb: 'Says no 857 times per minute.',
  },
  nonna: {
    id: 'nonna', name: "Nonna's 12-Gauge", slot: 1, kind: 'shotgun', auto: false, damage: 23, pellets: 9, headMul: 2.5, interval: 0.88, mag: 8, reserve: 32, reload: 0.5, shellReload: true,
    spread: { base: 0.05, move: 0.02, jump: 0.05, crouch: 0.95, bloom: 0, maxBloom: 0, recover: 6, ads: 0.85 },
    recoil: { v: 5.5, h: 1.0, recover: 6, pattern: 'kick' }, armorPen: 0.75, falloff: 0.55, moveMul: 0.9, adsZoom: 1.1, adsTime: 0.2, sound: 'shotgun', price: 0,
    blurb: 'Grandma\'s home defence. Close range only.',
  },
  awpetito: {
    id: 'awpetito', name: 'AWPetito', slot: 1, kind: 'sniper', auto: false, damage: 115, headMul: 4, interval: 1.45, mag: 5, reserve: 30, reload: 3.6,
    spread: { base: 0.07, move: 0.25, jump: 0.35, crouch: 0.9, bloom: 0.0, maxBloom: 0, recover: 4, ads: 0.006 },
    recoil: { v: 5.5, h: 0.8, recover: 4, pattern: 'kick' }, armorPen: 0.98, falloff: 0.99, moveMul: 0.84, scope: [40, 12], adsTime: 0.3, sound: 'sniper', price: 0,
    blurb: 'Buon appetito. Right-click to scope (twice for more zoom).',
  },
  biretta: {
    id: 'biretta', name: 'Biretta 92', slot: 2, kind: 'pistol', auto: false, damage: 30, headMul: 4, interval: 0.14, mag: 15, reserve: 60, reload: 2.2,
    spread: { base: 0.004, move: 0.03, jump: 0.1, crouch: 0.75, bloom: 0.011, maxBloom: 0.04, recover: 7, ads: 0.6 },
    recoil: { v: 1.8, h: 0.4, recover: 10, pattern: 'kick' }, armorPen: 0.55, falloff: 0.9, moveMul: 1.0, adsZoom: 1.15, adsTime: 0.14, sound: 'pistol', price: 0,
    blurb: 'Classic, reliable, very Italian.',
  },
  beagle: {
    id: 'beagle', name: 'Desert Beagle', slot: 2, kind: 'pistol', auto: false, damage: 56, headMul: 4, interval: 0.25, mag: 7, reserve: 35, reload: 2.2,
    spread: { base: 0.006, move: 0.06, jump: 0.15, crouch: 0.75, bloom: 0.03, maxBloom: 0.07, recover: 4, ads: 0.6 },
    recoil: { v: 4.2, h: 1.0, recover: 6, pattern: 'kick' }, armorPen: 0.93, falloff: 0.86, moveMul: 0.96, adsZoom: 1.2, adsTime: 0.16, sound: 'deagle', price: 0,
    blurb: 'Woof. One-tap headshots if you\'re a good boy.',
  },
  stiletto: {
    id: 'stiletto', name: 'Stiletto', slot: 3, kind: 'melee', damage: 34, backstab: 2.5, interval: 0.42, range: 1.9, moveMul: 1.06, sound: 'knife',
    blurb: 'Italian switchblade. Backstabs deal massive damage.',
  },
  axe: {
    id: 'axe', name: 'Hatchet "Nonno"', slot: 4, kind: 'melee', damage: 62, backstab: 1.6, interval: 0.85, range: 2.15, moveMul: 1.0, sound: 'axe',
    blurb: 'Grandpa\'s firewood splitter. Slow, heavy, satisfying.',
  },
};
export const PRIMARIES = ['aka', 'rigatoni', 'mpnein', 'nonna', 'awpetito'];
export const SECONDARIES = ['biretta', 'beagle'];

// ---------------- materials ----------------
let GM = null;
export function gunMaterials(tex) {
  if (GM) return GM;
  const S = (o) => new THREE.MeshStandardMaterial(o);
  GM = {
    metal: S({ color: 0x3e4148, metalness: 0.75, roughness: 0.36, map: tex.metal.map, normalMap: tex.metal.normalMap, envMapIntensity: 1.2 }),
    darkMetal: S({ color: 0x2a2c30, metalness: 0.7, roughness: 0.42, map: tex.metal.map, envMapIntensity: 1.1 }),
    polymer: S({ color: 0x2a2a2d, roughness: 0.72, map: tex.polymer.map, normalMap: tex.polymer.normalMap }),
    wood: S({ color: 0x8a3e1c, roughness: 0.48, map: tex.woodH.map, normalMap: tex.woodH.normalMap, envMapIntensity: 0.8 }),
    steel: S({ color: 0xd2d6dc, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.6 }),
    brass: S({ color: 0xc9a248, metalness: 1.0, roughness: 0.3 }),
    lens: S({ color: 0x0a1018, metalness: 0.4, roughness: 0.02, envMapIntensity: 2.5, emissive: 0x0a2a3a, emissiveIntensity: 0.4 }),
    red: S({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 4, toneMapped: false }),
    sightGlass: S({ color: 0x9fc4ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false, envMapIntensity: 0.6 }),
    hood: S({ color: 0x2a2c30, metalness: 0.7, roughness: 0.42, side: THREE.DoubleSide }),
    olive: S({ color: 0x5e6a44, roughness: 0.62, map: tex.polymer.map, normalMap: tex.polymer.normalMap }),
    tan: S({ color: 0xa88c62, roughness: 0.68, map: tex.polymer.map }),
    handle: S({ color: 0x7a4a26, roughness: 0.55, map: tex.wood.map, normalMap: tex.wood.normalMap }),
    bakelite: S({ color: 0x6a2410, roughness: 0.45, metalness: 0.1 }),
  };
  return GM;
}

// ---------------- builders ----------------
function prof(pts, thick, mat, bevel = 0.004, curves = null) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]);
  }
  sh.closePath();
  const d = Math.max(0.001, thick - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -d / 2);
  g.rotateY(Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i) * 7);
  const m = new THREE.Mesh(g, mat); m.castShadow = true;
  return m;
}
function tube(r, len, f0, y, mat, x = 0, seg = 14, r2 = null) {
  const g = new THREE.CylinderGeometry(r2 == null ? r : r2, r, len, seg);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, -(f0 + len / 2)); m.castShadow = true;
  return m;
}
function bx(w, h, d, f, y, mat, x = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, -f); m.castShadow = true; return m;
}
function rail(g, f0, f1, y, mat, w = 0.022) {
  for (let f = f0; f < f1; f += 0.012) g.add(bx(w, 0.006, 0.006, f, y, mat));
  g.add(bx(w * 0.7, 0.006, f1 - f0, (f0 + f1) / 2, y - 0.005, mat));
}

function grip(mat, scale = 1) {
  return prof([[-0.022 * scale, 0], [0.034 * scale, 0], [0.012 * scale, -0.115 * scale], [-0.042 * scale, -0.122 * scale], [-0.05 * scale, -0.1 * scale]], 0.032, mat, 0.006);
}
function triggerGroup(M, f0 = 0.03, f1 = 0.1) {
  const g = new THREE.Group();
  g.add(bx(0.008, 0.006, f1 - f0, (f0 + f1) / 2, -0.045, M.metal));
  g.add(bx(0.008, 0.045, 0.006, f1, -0.022, M.metal));
  const tr = bx(0.006, 0.025, 0.006, (f0 + f1) / 2 + 0.005, -0.018, M.steel); tr.rotation.x = 0.3; g.add(tr);
  return g;
}

function buildAK(M) {
  const g = new THREE.Group();
  g.add(prof([[-0.13, 0.0], [0.26, 0.0], [0.26, 0.068], [0.2, 0.084], [-0.08, 0.09], [-0.13, 0.076]], 0.05, M.metal, 0.004));
  g.add(grip(M.bakelite));
  g.add(triggerGroup(M));
  const mag = new THREE.Group(); mag.position.set(0, 0, -0.1);
  mag.add(prof([[-0.03, 0], [0.035, 0], [0.05, -0.12, 0.13, -0.21], [0.065, -0.235], [-0.015, -0.13, -0.03, 0]], 0.032, M.bakelite, 0.005));
  g.add(mag);
  g.add(prof([[0.26, 0.005], [0.47, 0.01], [0.48, 0.035], [0.47, 0.058], [0.26, 0.062]], 0.056, M.wood, 0.012));
  g.add(tube(0.017, 0.2, 0.27, 0.088, M.wood));
  g.add(tube(0.011, 0.46, 0.26, 0.05, M.metal));
  g.add(tube(0.008, 0.33, 0.27, 0.088, M.metal));
  g.add(bx(0.02, 0.05, 0.025, 0.62, 0.068, M.metal));
  g.add(bx(0.004, 0.026, 0.004, 0.62, 0.104, M.metal));
  g.add(tube(0.015, 0.045, 0.7, 0.05, M.darkMetal));
  g.add(bx(0.03, 0.022, 0.05, 0.24, 0.094, M.metal));
  g.add(prof([[-0.12, 0.074], [-0.12, 0.005], [-0.2, -0.022], [-0.5, -0.078], [-0.535, -0.078], [-0.535, 0.062], [-0.5, 0.068], [-0.2, 0.06]], 0.042, M.wood, 0.007));
  g.add(bx(0.044, 0.142, 0.012, -0.54, -0.007, M.metal));
  g.add(tube(0.006, 0.04, 0.16, 0.07, M.steel, 0.028));
  const ud = g.userData;
  ud.grip = new THREE.Vector3(0, 0, 0); ud.support = new THREE.Vector3(0, 0.0, -0.37);
  ud.muzzle = new THREE.Vector3(0, 0.05, -0.75); ud.sight = new THREE.Vector3(0, 0.104, -0.24); ud.eject = new THREE.Vector3(0.03, 0.07, -0.15);
  ud.mag = mag;
  return g;
}

function buildM4(M) {
  const g = new THREE.Group();
  g.add(prof([[-0.11, 0.0], [0.2, 0.0], [0.2, 0.072], [-0.11, 0.072]], 0.05, M.darkMetal, 0.004));
  g.add(prof([[-0.11, 0.0], [0.15, 0.0], [0.15, -0.055], [0.07, -0.058], [0.05, -0.02], [-0.11, -0.02]], 0.048, M.darkMetal, 0.004));
  rail(g, -0.1, 0.19, 0.078, M.darkMetal);
  g.add(grip(M.polymer));
  g.add(triggerGroup(M));
  const mag = new THREE.Group(); mag.position.set(0, -0.04, -0.11);
  mag.add(prof([[-0.035, 0], [0.03, 0], [0.04, -0.1, 0.07, -0.19], [0.005, -0.2], [-0.02, -0.1, -0.035, 0]], 0.03, M.darkMetal, 0.004));
  g.add(mag);
  const hg = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.058, 0.28), M.polymer); hg.position.set(0, 0.04, -0.34); hg.castShadow = true; g.add(hg);
  rail(g, 0.21, 0.47, 0.073, M.darkMetal, 0.02);
  for (const s of [-1, 1]) for (let f = 0.22; f < 0.46; f += 0.03) g.add(bx(0.004, 0.012, 0.012, f, 0.04, M.darkMetal, s * 0.031));
  g.add(tube(0.01, 0.26, 0.48, 0.04, M.metal));
  g.add(tube(0.013, 0.05, 0.72, 0.04, M.darkMetal));
  g.add(tube(0.006, 0.18, -0.29, 0.04, M.metal));
  g.add(prof([[-0.25, 0.068], [-0.25, -0.015], [-0.355, -0.068], [-0.38, -0.068], [-0.38, 0.072], [-0.3, 0.075]], 0.044, M.polymer, 0.008));
  g.add(bx(0.03, 0.012, 0.03, -0.1, 0.08, M.darkMetal));
  // red dot: open-ended hood you can look through, faint lens, glowing dot
  const hoodG = new THREE.CylinderGeometry(0.021, 0.021, 0.075, 24, 1, true); hoodG.rotateX(-Math.PI / 2);
  const hood = new THREE.Mesh(hoodG, M.hood); hood.position.set(0, 0.118, -0.0025); hood.castShadow = true; g.add(hood);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0035, 6, 24), M.darkMetal); ring.position.set(0, 0.118, -0.04); g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, 6, 24), M.darkMetal); ring2.position.set(0, 0.118, 0.035); g.add(ring2);
  g.add(bx(0.022, 0.02, 0.04, -0.0, 0.094, M.darkMetal));
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), M.sightGlass); lensF.position.set(0, 0.118, -0.036); g.add(lensF);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0019, 8, 6), M.red); dot.position.set(0, 0.118, -0.034); g.add(dot);
  const ud = g.userData;
  ud.support = new THREE.Vector3(0, 0.0, -0.34); ud.muzzle = new THREE.Vector3(0, 0.04, -0.77); ud.sight = new THREE.Vector3(0, 0.118, 0.04); ud.eject = new THREE.Vector3(0.03, 0.05, -0.12);
  ud.mag = mag; ud.redDot = true;
  return g;
}

function buildSMG(M) {
  const g = new THREE.Group();
  g.add(prof([[-0.1, 0.0], [0.19, 0.0], [0.2, 0.03], [0.19, 0.07], [-0.1, 0.07]], 0.046, M.polymer, 0.008));
  rail(g, -0.08, 0.15, 0.075, M.darkMetal, 0.018);
  const gr = prof([[-0.02, 0], [0.034, 0], [0.024, -0.1], [-0.03, -0.1]], 0.034, M.polymer, 0.006); g.add(gr);
  g.add(triggerGroup(M, 0.04, 0.1));
  const mag = new THREE.Group(); mag.position.set(0, -0.09, 0.0);
  mag.add(prof([[-0.026, 0], [0.024, 0], [0.024, -0.12], [-0.026, -0.12]], 0.026, M.darkMetal, 0.003));
  g.add(mag);
  g.add(tube(0.009, 0.08, 0.2, 0.04, M.metal));
  g.add(tube(0.012, 0.03, 0.27, 0.04, M.darkMetal));
  g.add(prof([[0.13, -0.0], [0.16, -0.0], [0.155, -0.075], [0.135, -0.075]], 0.024, M.polymer, 0.005));
  for (const s of [-1, 1]) g.add(tube(0.004, 0.22, -0.32, 0.04 + s * 0.012, M.metal, 0.0));
  g.add(bx(0.03, 0.08, 0.012, -0.33, 0.035, M.polymer));
  g.add(bx(0.006, 0.018, 0.006, 0.17, 0.084, M.darkMetal));
  g.add(bx(0.016, 0.016, 0.01, -0.07, 0.084, M.darkMetal));
  const ud = g.userData;
  ud.support = new THREE.Vector3(0, -0.05, -0.145); ud.muzzle = new THREE.Vector3(0, 0.04, -0.31); ud.sight = new THREE.Vector3(0, 0.091, -0.07); ud.eject = new THREE.Vector3(0.025, 0.05, -0.1);
  ud.mag = mag;
  return g;
}

function buildShotgun(M) {
  const g = new THREE.Group();
  g.add(prof([[-0.1, 0], [0.18, 0], [0.18, 0.07], [-0.1, 0.078]], 0.05, M.metal, 0.005));
  g.add(triggerGroup(M, 0.0, 0.07));
  g.add(tube(0.012, 0.55, 0.18, 0.055, M.metal));
  g.add(tube(0.012, 0.44, 0.18, 0.02, M.darkMetal));
  const pump = new THREE.Group(); pump.add(tube(0.026, 0.17, 0.3, 0.022, M.wood, 0, 14)); g.add(pump);
  for (let i = 0; i < 6; i++) g.add(tube(0.027, 0.006, 0.31 + i * 0.026, 0.022, M.darkMetal));
  g.add(prof([[-0.1, 0.066], [-0.1, -0.005], [-0.04, -0.03], [-0.07, -0.11], [-0.11, -0.11], [-0.14, -0.04], [-0.45, -0.085], [-0.48, -0.085], [-0.48, 0.058], [-0.4, 0.064]], 0.044, M.wood, 0.008));
  g.add(bx(0.046, 0.15, 0.014, -0.485, -0.012, M.polymer));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), M.brass); bead.position.set(0, 0.07, -0.72); g.add(bead);
  const ud = g.userData;
  ud.support = new THREE.Vector3(0, -0.005, -0.39); ud.muzzle = new THREE.Vector3(0, 0.055, -0.74); ud.sight = new THREE.Vector3(0, 0.074, -0.08); ud.eject = new THREE.Vector3(0.03, 0.05, -0.08);
  ud.pump = pump;
  return g;
}

function buildAWP(M) {
  const g = new THREE.Group();
  g.add(prof([[-0.52, 0.07], [-0.52, -0.085], [-0.46, -0.085], [-0.24, -0.035], [-0.12, -0.03], [-0.07, -0.13], [-0.02, -0.13], [0.01, -0.03], [0.05, -0.012], [0.46, -0.0], [0.47, 0.04], [-0.1, 0.05], [-0.22, 0.072]], 0.056, M.olive, 0.008));
  g.add(prof([[-0.06, -0.035], [-0.01, -0.035], [-0.02, -0.11], [-0.06, -0.11]], 0.02, M.olive, 0.004));
  g.add(tube(0.021, 0.3, -0.12, 0.062, M.metal));
  g.add(tube(0.013, 0.68, 0.18, 0.062, M.darkMetal, 0, 14, 0.016));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.07), M.darkMetal)); g.children[g.children.length - 1].position.set(0, 0.062, -0.9);
  const bolt = new THREE.Group(); bolt.position.set(0.03, 0.062, 0.02);
  const bh = tube(0.005, 0.05, -0.0, 0, M.steel); bh.rotation.set(0, Math.PI / 2, 0); bh.position.set(0.025, 0, 0); bolt.add(bh);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), M.metal); ball.position.set(0.05, -0.006, 0); bolt.add(ball);
  g.add(bolt);
  // scope
  g.add(tube(0.018, 0.32, -0.1, 0.13, M.darkMetal, 0, 18));
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.018, 0.08, 18), M.darkMetal); bell.rotation.x = -Math.PI / 2; bell.position.set(0, 0.13, -0.26); g.add(bell);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.06, 18), M.darkMetal); eye.rotation.x = -Math.PI / 2; eye.position.set(0, 0.13, 0.12); g.add(eye);
  const lf = new THREE.Mesh(new THREE.CircleGeometry(0.03, 18), M.lens); lf.position.set(0, 0.13, -0.301); lf.rotation.y = Math.PI; g.add(lf);
  const lb = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), M.lens); lb.position.set(0, 0.13, 0.151); g.add(lb);
  g.add(tube(0.011, 0.025, 0.05, 0.155, M.darkMetal)); g.children[g.children.length - 1].rotation.x = 0;
  const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.025, 12), M.darkMetal); tt.position.set(0, 0.155, -0.05); g.add(tt);
  const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.025, 12), M.darkMetal); ts.rotation.z = Math.PI / 2; ts.position.set(0.026, 0.13, -0.05); g.add(ts);
  for (const f of [-0.05, 0.14]) g.add(bx(0.03, 0.05, 0.02, f, 0.1, M.darkMetal));
  const mag = new THREE.Group(); mag.position.set(0, -0.02, -0.08);
  mag.add(bx(0.03, 0.08, 0.07, 0, -0.04, M.darkMetal)); g.add(mag);
  const ud = g.userData;
  ud.support = new THREE.Vector3(0, -0.01, -0.3); ud.muzzle = new THREE.Vector3(0, 0.062, -0.94); ud.sight = new THREE.Vector3(0, 0.13, 0.1); ud.eject = new THREE.Vector3(0.03, 0.07, -0.02);
  ud.bolt = bolt; ud.mag = mag; ud.scoped = true;
  return g;
}

function buildPistol(M, big = false) {
  const g = new THREE.Group();
  const k = big ? 1.22 : 1;
  const slide = new THREE.Group();
  slide.add(prof([[-0.05 * k, 0.04], [0.15 * k, 0.04], [0.15 * k, 0.074 * k + 0.004], [0.14 * k, 0.082 * k], [-0.045 * k, 0.082 * k]], big ? 0.034 : 0.028, big ? M.steel : M.metal, 0.004));
  for (let i = 0; i < 6; i++) slide.add(bx(big ? 0.036 : 0.03, 0.025, 0.002, -0.035 * k + i * 0.006, 0.062 * k, M.darkMetal));
  slide.add(bx(0.004, 0.008, 0.004, 0.135 * k, 0.086 * k + 0.002, M.darkMetal));
  slide.add(bx(0.02, 0.008, 0.006, -0.04 * k, 0.086 * k + 0.002, M.darkMetal));
  if (big) slide.add(prof([[-0.05 * k, 0.082 * k], [0.15 * k, 0.082 * k], [0.15 * k, 0.09 * k], [-0.04 * k, 0.09 * k]], 0.014, M.steel, 0.002));
  g.add(slide);
  g.add(prof([[-0.04 * k, 0.0], [0.145 * k, 0.0], [0.145 * k, 0.04], [-0.04 * k, 0.04]], big ? 0.032 : 0.026, M.darkMetal, 0.004));
  g.add(prof([[-0.035, 0.002], [0.022, 0.002], [0.008, -0.112 * k], [-0.048, -0.112 * k], [-0.056, -0.09 * k]], big ? 0.036 : 0.031, big ? M.darkMetal : M.handle, 0.006));
  g.add(triggerGroup(M, 0.0, 0.065));
  g.add(tube(0.0065 * k, 0.008, 0.148 * k, 0.06, M.darkMetal));
  const mag = new THREE.Group(); g.add(mag);
  mag.add(bx(0.022, 0.012, 0.04, -0.015, -0.112 * k - 0.004, M.darkMetal));
  const ud = g.userData;
  ud.muzzle = new THREE.Vector3(0, 0.06, -0.16 * k); ud.sight = new THREE.Vector3(0, 0.088 * k + 0.004, 0.0); ud.eject = new THREE.Vector3(0.02, 0.07, -0.04);
  ud.slide = slide; ud.mag = mag; ud.support = new THREE.Vector3(-0.02, -0.03, 0.0);
  return g;
}

function buildKnife(M) {
  const g = new THREE.Group();
  const handle = new THREE.LatheGeometry([new THREE.Vector2(0.0, -0.065), new THREE.Vector2(0.013, -0.062), new THREE.Vector2(0.016, -0.03), new THREE.Vector2(0.014, 0.0), new THREE.Vector2(0.016, 0.03), new THREE.Vector2(0.013, 0.045), new THREE.Vector2(0, 0.046)], 12);
  handle.rotateX(-Math.PI / 2); handle.scale(0.75, 1, 1);
  const hm = new THREE.Mesh(handle, M.handle); hm.castShadow = true; g.add(hm);
  g.add(bx(0.03, 0.012, 0.008, 0.05, 0, M.steel));
  g.add(tube(0.012, 0.006, -0.068, 0, M.steel));
  g.add(prof([[0.05, 0.011], [0.05, -0.011], [0.16, -0.007], [0.215, 0.0], [0.17, 0.006]], 0.0045, M.steel, 0.0016));
  g.userData.tip = new THREE.Vector3(0, 0, -0.215);
  return g;
}

function buildAxe(M) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.46, 10), M.handle); h.position.y = 0.16; h.castShadow = true; g.add(h);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.handle); knob.position.y = -0.07; knob.scale.set(1, 0.7, 1.2); g.add(knob);
  const head = prof([[-0.035, 0.32], [-0.035, 0.4], [0.04, 0.41], [0.115, 0.455], [0.13, 0.37], [0.115, 0.275], [0.04, 0.325]], 0.028, M.metal, 0.004);
  g.add(head);
  const edge = prof([[0.104, 0.452], [0.118, 0.456], [0.134, 0.37], [0.118, 0.272], [0.104, 0.28], [0.118, 0.37]], 0.012, M.steel, 0.002);
  g.add(edge);
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), M.handle); wedge.position.set(0, 0.405, 0); g.add(wedge);
  g.userData.upright = true;
  return g;
}

export function buildWeaponModel(id, tex) {
  const M = gunMaterials(tex);
  switch (id) {
    case 'aka': return buildAK(M);
    case 'rigatoni': return buildM4(M);
    case 'mpnein': return buildSMG(M);
    case 'nonna': return buildShotgun(M);
    case 'awpetito': return buildAWP(M);
    case 'biretta': return buildPistol(M, false);
    case 'beagle': return buildPistol(M, true);
    case 'stiletto': return buildKnife(M);
    case 'axe': return buildAxe(M);
  }
  return new THREE.Group();
}

// recoil pattern offsets per shot index (degrees of pitch up, yaw)
export function recoilKick(def, shot, rng) {
  const r = def.recoil;
  let v = r.v, h = 0;
  if (r.pattern === 'ak') {
    v *= shot < 3 ? 0.7 : (shot < 10 ? 1.25 : 0.55);
    h = shot < 6 ? (rng() - 0.5) * 0.3 : Math.sin(shot * 0.55) * r.h * 1.4 + (rng() - 0.5) * r.h * 0.5;
  } else if (r.pattern === 'm4') {
    v *= shot < 3 ? 0.7 : (shot < 9 ? 1.15 : 0.5);
    h = shot < 6 ? (rng() - 0.5) * 0.25 : Math.sin(shot * 0.45 + 1) * r.h * 1.2 + (rng() - 0.5) * r.h * 0.4;
  } else if (r.pattern === 'smg') {
    v *= shot < 5 ? 1 : 0.6; h = (rng() - 0.5) * r.h * 1.6;
  } else { h = (rng() - 0.5) * r.h * 2; }
  return { v, h };
}
