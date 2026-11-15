// The Italian town half of de_Bellavista: blocks of attached palazzi with
// detailed facades, a piazza with fountain + arcade, a church & campanile,
// market square, and the medieval city wall that borders the countryside.
import * as THREE from 'three';
import { RNG } from '../noise.js';
import { box, boxC, cyl, quad, displace, wallShade } from './builder.js';
import { signUV, ghostUV, GHOST_TEXTS } from '../textures.js';
import * as P from './props.js';

const PALETTE = ['#dca451', '#e6cd93', '#cb7a4c', '#e7aa8b', '#d6917e', '#f0e4c6', '#bccaa2', '#c2cacd', '#d9b77b', '#c4623e', '#ebd9ab', '#d2a88c', '#e1b98a'];
const SHUTTERS = ['#3f6b47', '#2e5739', '#6b4b2f', '#3e6c6b', '#ddd6c4', '#5a713f', '#7b3024', '#3a5a2a'];
const DOORS = ['#5a3a22', '#3e2a1a', '#2e4a32', '#6b2a1e', '#2a3a4a'];
const CAR_COLORS = ['#c8102e', '#f1f1ee', '#1f4f86', '#f2c230', '#2f6b3a', '#a9c7d8', '#e86a2a', '#222326'];
const col = (h) => new THREE.Color(h);

export const TOWN = {
  piazza: [-80, -17, -44, 17],
  fountain: [-62, 0],
  spawnPlaza: [-126, -14, -108, 14],
  market: [-29, -29, -12, -13],
  churchRect: [-101, -10, -82, 10],
  campanile: [-92, 10, -86, 16],
};

const BLOCKS = [
  // x0, z0, x1, z1, opts
  [-136, -92, -126, 92, { boundary: 'w' }],
  [-126, 14, -108, 40, {}], [-126, 47, -108, 92, { alleysZ: [[68, 71]] }],
  [-101, 17, -80, 40, {}],
  [-80, 17, -36, 40, { arcade: [-80, -44], alleysX: [[-60.5, -57.5]] }],
  [-44, 4, -36, 17, {}],
  [-29, 4, -12, 40, { alleysZ: [[20, 23]] }],
  [-101, 47, -36, 92, { alleysX: [[-83, -79.5], [-61, -57.5]], alleysZ: [[68, 71]] }],
  [-29, 47, -12, 92, { alleysZ: [[68, 71]] }],
  [-126, -40, -108, -14, {}], [-126, -92, -108, -47, { alleysZ: [[-71, -68]] }],
  [-101, -40, -80, -17, {}],
  [-80, -40, -36, -17, { alleysX: [[-60.5, -57.5]] }],
  [-44, -17, -36, -4, {}],
  [-29, -13, -12, -4, {}], [-29, -40, -12, -29, {}],
  [-101, -92, -36, -47, { alleysX: [[-83, -79.5], [-61, -57.5]], alleysZ: [[-71, -68]] }],
  [-29, -92, -12, -47, { alleysZ: [[-71, -68]] }],
];

function inRect(x, z, r) { return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]; }

function splitBlock(rect, opts) {
  // cut alleys out of a block -> list of sub rects
  let rects = [rect.slice(0, 4)];
  for (const [a0, a1] of (opts.alleysX || [])) {
    const out = [];
    for (const r of rects) { if (a1 <= r[0] || a0 >= r[2]) { out.push(r); continue; } if (a0 > r[0]) out.push([r[0], r[1], a0, r[3]]); if (a1 < r[2]) out.push([a1, r[1], r[2], r[3]]); }
    rects = out;
  }
  for (const [a0, a1] of (opts.alleysZ || [])) {
    const out = [];
    for (const r of rects) { if (a1 <= r[1] || a0 >= r[3]) { out.push(r); continue; } if (a0 > r[1]) out.push([r[0], r[1], r[2], a0]); if (a1 < r[3]) out.push([r[0], a1, r[2], r[3]]); }
    rects = out;
  }
  return rects;
}

function lots(rect, rng, boundary) {
  const [x0, z0, x1, z1] = rect, w = x1 - x0, d = z1 - z0;
  const alongX = boundary ? false : w >= d;
  const L = alongX ? w : d, D = alongX ? d : w;
  const rows = D > 21 ? 2 : 1;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const a0 = (alongX ? z0 : x0) + (r * D) / rows, a1 = a0 + D / rows;
    let s = alongX ? x0 : z0; const end = alongX ? x1 : z1;
    while (s < end - 0.1) {
      let lw = rng.range(7, 12.5); if (end - s - lw < 6.5) lw = end - s;
      const e = Math.min(end, s + lw);
      out.push(alongX ? [s, a0, e, a1] : [a0, s, a1, e]);
      s = e;
    }
  }
  return out;
}

export { building };

export function buildTown(ctx) {
  const { batch: B, world: W, rng } = ctx;
  const buildings = [];
  const signQueue = [...Array(16).keys()];
  let signIdx = 0;

  // ---------------- plan buildings ----------------
  for (const blk of BLOCKS) {
    const opts = blk[4];
    for (const sub of splitBlock(blk, opts)) {
      for (const lot of lots(sub, rng, opts.boundary)) {
        const lotW = lot[2] - lot[0], lotD = lot[3] - lot[1];
        if (!opts.boundary && !opts.arcade && rng.chance(0.05) && lotW > 7 && lotD > 7) { buildings.push({ rect: lot, garden: true }); continue; }
        const floors = opts.boundary ? rng.int(4, 5) : rng.pick([2, 3, 3, 3, 4, 4]);
        const style = rng.chance(0.22) ? 'palazzo' : 'casa';
        const wallMat = rng.chance(0.07) ? 'brick' : (rng.chance(0.06) ? 'blocks' : 'plaster');
        const b = {
          rect: lot, floors, style, wallMat,
          color: col(rng.pick(PALETTE)), shutter: col(rng.pick(SHUTTERS)), door: col(rng.pick(DOORS)),
          roof: rng.chance(0.15) ? 'flat' : 'gable',
          H: 4.0 + 3.3 * (floors - 1) + 0.7,
          arcade: null,
        };
        if (opts.arcade && Math.abs(lot[1] - 17) < 0.01 && lot[0] >= opts.arcade[0] - 0.01 && lot[2] <= opts.arcade[1] + 0.01) b.arcade = { depth: 4.2 };
        buildings.push(b);
      }
    }
  }
  const solid = buildings.filter(b => !b.garden);
  const heightAt = (x, z) => { for (const b of solid) if (inRect(x, z, b.rect)) return b.H; return 0; };

  // ---------------- ground ----------------
  const g = new THREE.PlaneGeometry(134, 188, 14, 19); g.rotateX(-Math.PI / 2); g.translate(-69, 0, 0);
  B.add('cobble', g, col('#ffffff'), 3.2);
  const streets = [[-108, -92, -101, 92], [-36, -92, -29, 92], [-12, -92, -6, 92], [-126, -47, -12, -40], [-126, 40, -12, 47], [-44, -4, -6, 4]];
  for (const s of streets) {
    const pg = new THREE.PlaneGeometry(s[2] - s[0], s[3] - s[1]); pg.rotateX(-Math.PI / 2); pg.translate((s[0] + s[2]) / 2, 0.012, (s[1] + s[3]) / 2);
    B.add('pavers', pg, col('#ffffff'), 4);
  }
  W.surfaceTown = (x) => x < -2;

  // ---------------- each building ----------------
  for (const b of buildings) {
    if (b.garden) { garden(ctx, b.rect); continue; }
    building(ctx, b, heightAt, () => { const i = signQueue[signIdx % signQueue.length]; signIdx++; return i; });
  }

  church(ctx);
  fountain(ctx);
  cityWall(ctx);
  piazzaProps(ctx);
  streetProps(ctx, heightAt);
  laundry(ctx, solid);
  return { buildings: solid };
}

// =========================================================================
//  Building + facades
// =========================================================================
function building(ctx, b, heightAt, nextSign) {
  const { batch: B, world: W, rng } = ctx;
  const [x0, z0, x1, z1] = b.rect, H = b.H;
  const wallMat = b.wallMat;
  const wc = b.wallMat === 'plaster' ? b.color : col('#ffffff');
  const shade = wallShade(wc);
  const arc = b.arcade;
  // main mass
  if (arc) {
    B.add(wallMat, box(x0, 0, z0 + arc.depth, x1, H, z1), shade, 7);
    B.add(wallMat, box(x0, 5.0, z0, x1, H, z0 + arc.depth), shade, 7);
    W.addBox(x0, 0, z0 + arc.depth, x1, H, z1, { mat: 'stone' });
    W.addBox(x0, 5.0, z0, x1, H, z0 + arc.depth, { mat: 'stone' });
  } else {
    B.add(wallMat, box(x0, 0, z0, x1, H, z1), shade, 7);
    W.addBox(x0, 0, z0, x1, H, z1, { mat: 'stone' });
  }

  const sides = [
    { ax: 'x', fixed: z1, n: 1, u0: x0, u1: x1, name: 'n' },
    { ax: 'x', fixed: z0, n: -1, u0: x0, u1: x1, name: 's' },
    { ax: 'z', fixed: x1, n: 1, u0: z0, u1: z1, name: 'e' },
    { ax: 'z', fixed: x0, n: -1, u0: z0, u1: z1, name: 'w' },
  ];
  for (const s of sides) {
    // exposure: height of whatever stands just outside this side
    let ex = 0;
    for (const t of [0.2, 0.5, 0.8]) {
      const u = s.u0 + (s.u1 - s.u0) * t;
      const px = s.ax === 'x' ? u : s.fixed + s.n * 0.6, pz = s.ax === 'x' ? s.fixed + s.n * 0.6 : u;
      ex = Math.max(ex, heightAt(px, pz));
    }
    if (ex >= H - 0.5) continue;
    if (arc && s.name === 's') { arcadeFacade(ctx, b, s); facade(ctx, b, s, 5.0, nextSign); continue; }
    facade(ctx, b, s, ex, nextSign);
  }
  roof(ctx, b);
}

function sideHelpers(s) {
  const Pt = (u, y, off) => (s.ax === 'x' ? [u, y, s.fixed + s.n * off] : [s.fixed + s.n * off, y, u]);
  const sb = (u, y, off, su, sy, so) => { const [x, yy, z] = Pt(u, y, off); return s.ax === 'x' ? boxC(su, sy, so, x, yy, z) : boxC(so, sy, su, x, yy, z); };
  const sq = (w, h, u, y, off, uvr) => { const [x, yy, z] = Pt(u, y, off); return quad(w, h, x, yy, z, s.ax === 'x' ? 0 : s.n, s.ax === 'x' ? s.n : 0, uvr); };
  return { Pt, sb, sq };
}

function winUV(v) { const c = v % 2, r = Math.floor(v / 2); return { u0: c * 0.5 + 0.01, u1: c * 0.5 + 0.49, v0: 1 - (r + 1) * 0.5 + 0.01, v1: 1 - r * 0.5 - 0.01 }; }

function facade(ctx, b, s, exposedFrom, nextSign) {
  const { batch: B, rng } = ctx;
  const { Pt, sb, sq } = sideHelpers(s);
  const L = s.u1 - s.u0, H = b.H;
  const trim = b.style === 'palazzo' ? col('#efe6d4') : col('#e4dccb');
  const bays = Math.max(1, Math.floor(L / 3.2)), bw = L / bays;
  const uc = (i) => s.u0 + bw * (i + 0.5);
  const blank = L > 8 && rng.chance(0.1) && exposedFrom < 1;

  // plinth & string courses & cornice
  if (exposedFrom < 0.5) B.add('blocks', sb((s.u0 + s.u1) / 2, 0.35, 0.04, L + 0.08, 0.7, 0.08), [0.9, 0.88, 0.85], 2);
  for (let f = 1; f < b.floors; f++) {
    const y = 4.0 + 3.3 * (f - 1);
    if (y > exposedFrom) B.add('stone', sb((s.u0 + s.u1) / 2, y, 0.03, L, 0.16, 0.07), trim, 2);
  }
  B.add('stone', sb((s.u0 + s.u1) / 2, H - 0.12, 0.13, L + 0.24, 0.22, 0.26), trim, 2);
  B.add('stone', sb((s.u0 + s.u1) / 2, H + 0.04, 0.24, L + 0.44, 0.12, 0.48), trim, 2);
  // quoins
  if (b.style === 'palazzo') {
    for (const u of [s.u0 + 0.3, s.u1 - 0.3]) for (let y = Math.max(0.8, exposedFrom); y < H - 0.5; y += 0.7) {
      const big = Math.round(y / 0.7) % 2 === 0;
      B.add('stone', sb(u + (u < (s.u0 + s.u1) / 2 ? (big ? 0.15 : 0) : (big ? -0.15 : 0)), y + 0.3, 0.025, big ? 0.9 : 0.6, 0.56, 0.06), trim, 1.5);
    }
  }

  // upper floors
  if (!blank) {
    for (let f = 1; f < b.floors; f++) {
      const yF = 4.0 + 3.3 * (f - 1), sill = yF + 0.85;
      if (sill < exposedFrom + 0.2) continue;
      for (let i = 0; i < bays; i++) {
        if (rng.chance(0.06)) continue;
        const u = uc(i), w = 1.05, h = 1.7;
        const balcony = f === 1 && bays >= 2 && rng.chance(0.28) && L > 6;
        const gh = balcony ? 2.3 : h, gy = balcony ? yF + 0.05 + gh / 2 : sill + h / 2;
        B.add('glass', sq(w, gh, u, gy, 0.012, winUV(rng.int(0, 3))));
        // frame
        B.add('stone', sb(u, gy + gh / 2 + 0.07, 0.04, w + 0.26, 0.14, 0.08), trim, 1);
        B.add('stone', sb(u - w / 2 - 0.06, gy, 0.035, 0.12, gh, 0.07), trim, 1);
        B.add('stone', sb(u + w / 2 + 0.06, gy, 0.035, 0.12, gh, 0.07), trim, 1);
        if (!balcony) B.add('stone', sb(u, sill - 0.05, 0.09, w + 0.34, 0.08, 0.18), trim, 1);
        if (b.style === 'palazzo') {
          B.add('stone', sb(u, gy + gh / 2 + 0.3, 0.1, w + 0.5, 0.1, 0.2), trim, 1);
          if (f === 1) B.add('stone', pediment(s, u, gy + gh / 2 + 0.35, w + 0.5, 0.35), trim, 1);
        }
        // shutters
        const mode = rng.pick(['open', 'open', 'open', 'closed', 'half']);
        const sw = w / 2 + 0.01;
        if (mode === 'closed') { B.add('shutter', sb(u - sw / 2, gy, 0.05, sw, gh, 0.04), b.shutter); B.add('shutter', sb(u + sw / 2, gy, 0.05, sw, gh, 0.04), b.shutter); }
        else if (mode === 'half') { B.add('shutter', sb(u - sw / 2, gy, 0.05, sw, gh, 0.04), b.shutter); B.add('shutter', sb(u + w / 2 + 0.14 + sw / 2, gy, 0.03, sw, gh, 0.04), b.shutter); }
        else { B.add('shutter', sb(u - w / 2 - 0.14 - sw / 2, gy, 0.03, sw, gh, 0.04), b.shutter); B.add('shutter', sb(u + w / 2 + 0.14 + sw / 2, gy, 0.03, sw, gh, 0.04), b.shutter); }
        if (balcony) balconyAt(ctx, s, Pt, sb, sq, u, yF, w + 1.0);
        else if (rng.chance(0.18)) flowerBox(ctx, Pt, sb, u, sill, w);
        if (rng.chance(0.03)) B.add('paint', sb(u + w / 2 + 0.8, sill + 0.2, 0.25, 0.8, 0.55, 0.5), [0.75, 0.75, 0.73]);
      }
    }
  } else if (H > 7) {
    const gi = rng.int(0, GHOST_TEXTS.length - 1);
    B.add('ghost', sq(Math.min(L - 1, 7), Math.min(L - 1, 7) / 8, (s.u0 + s.u1) / 2, H * 0.6, 0.02, ghostUV(gi)));
  }

  // ground floor
  if (exposedFrom < 0.5) groundFloor(ctx, b, s, Pt, sb, sq, bays, bw, nextSign, trim);

  // drainpipe
  if (rng.chance(0.55)) {
    const u = rng.chance(0.5) ? s.u0 + 0.22 : s.u1 - 0.22;
    const [x, , z] = Pt(u, 0, 0.12);
    B.add('copper', cyl(0.055, 0.055, H, 8, x, 0, z));
    B.add('copper', cyl(0.09, 0.09, 0.12, 8, x, H - 0.4, z));
  }
}

function pediment(s, u, y, w, h) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false });
  if (s.ax === 'x') g.translate(u, y, s.n > 0 ? s.fixed : s.fixed - 0.14);
  else { g.rotateY(-Math.PI / 2); g.translate(s.n > 0 ? s.fixed + 0.14 : s.fixed, y, u); }
  return g;
}

function balconyAt(ctx, s, Pt, sb, sq, u, yF, w) {
  const { batch: B, rng } = ctx;
  const d = 0.8;
  B.add('stone', sb(u, yF - 0.02, d / 2, w, 0.14, d), [0.92, 0.9, 0.86], 1);
  for (const du of [-w / 2 + 0.2, w / 2 - 0.2]) B.add('stone', sb(u + du, yF - 0.3, 0.2, 0.14, 0.4, 0.4), [0.9, 0.88, 0.84], 1);
  // railings (alpha textured)
  const rr = { u0: 0, u1: w / 1.6, v0: 0, v1: 1 };
  B.add('railing', sq(w, 0.95, u, yF + 0.55, d - 0.02, rr));
  const [lx, ly, lz] = Pt(u - w / 2 + 0.02, yF + 0.55, d / 2), [rx, ry2, rz] = Pt(u + w / 2 - 0.02, yF + 0.55, d / 2);
  const nx = s.ax === 'x' ? 1 : 0, nz = s.ax === 'x' ? 0 : 1;
  B.add('railing', quad(d, 0.95, lx, ly, lz, nx, nz, { u0: 0, u1: 0.5, v0: 0, v1: 1 }));
  B.add('railing', quad(d, 0.95, rx, ry2, rz, nx, nz, { u0: 0, u1: 0.5, v0: 0, v1: 1 }));
  // pots with geraniums
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const pu = u + (i - (n - 1) / 2) * 0.55;
    const [px, py, pz] = Pt(pu, yF + 0.05, 0.45);
    B.add('terracotta', cyl(0.14, 0.11, 0.25, 8, px, py, pz), [1, 1, 1]);
    const f = displace(new THREE.IcosahedronGeometry(0.2, 1), 0.06, 7, rng.range(0, 9)); f.translate(px, py + 0.38, pz);
    B.add('foliageLo', f, [0.12, 0.3, 0.09]);
    const fc = col(rng.pick(['#d81f3a', '#ff4f7a', '#f1f1f1', '#d63a9a']));
    for (let k = 0; k < 6; k++) { const fl = new THREE.IcosahedronGeometry(0.045, 0); fl.translate(px + rng.range(-0.16, 0.16), py + 0.45 + rng.range(-0.05, 0.1), pz + rng.range(-0.16, 0.16)); B.add('paint', fl, fc); }
  }
}

function flowerBox(ctx, Pt, sb, u, sill, w) {
  const { batch: B, rng } = ctx;
  B.add('terracotta', sb(u, sill + 0.08, 0.22, w, 0.18, 0.22), [1, 1, 1]);
  const fc = col(rng.pick(['#d81f3a', '#ff4f7a', '#f5f5f5', '#e8a21a']));
  for (let k = 0; k < 9; k++) {
    const [x, y, z] = Pt(u + rng.range(-w / 2 + 0.05, w / 2 - 0.05), sill + 0.25 + rng.range(0, 0.08), 0.22 + rng.range(-0.06, 0.06));
    const f = new THREE.IcosahedronGeometry(rng.range(0.05, 0.08), 0); f.translate(x, y, z);
    B.add(k % 3 ? 'foliageLo' : 'paint', f, k % 3 ? [0.14, 0.32, 0.1] : fc);
  }
}

function groundFloor(ctx, b, s, Pt, sb, sq, bays, bw, nextSign, trim) {
  const { batch: B, rng } = ctx;
  const L = s.u1 - s.u0;
  // what does this side face?
  const mid = (s.u0 + s.u1) / 2;
  const [fx, , fz] = Pt(mid, 0, 3);
  const major = inRect(fx, fz, TOWN.piazza) || inRect(fx, fz, [-44, -4, -6, 4]) || inRect(fx, fz, TOWN.market) || inRect(fx, fz, TOWN.spawnPlaza);
  const street = Math.abs(fx + 32.5) < 4 || Math.abs(fx + 104.5) < 4 || Math.abs(Math.abs(fz) - 43.5) < 4;
  const shop = L >= 5 && rng.chance(major ? 0.85 : street ? 0.45 : 0.08);
  if (shop) {
    const nShop = Math.min(bays, L > 14 ? 3 : bays);
    const start = Math.floor((bays - nShop) / 2);
    const su0 = s.u0 + bw * start, su1 = su0 + bw * nShop, sc = (su0 + su1) / 2;
    for (let i = 0; i < nShop; i++) {
      const u = su0 + bw * (i + 0.5);
      B.add('shopGlass', sq(bw - 0.62, 2.75, u, 0.5 + 1.375, 0.015, winUV(rng.int(0, 3))));
    }
    for (let i = 0; i <= nShop; i++) B.add('stone', sb(su0 + bw * i, 1.7, 0.08, 0.5, 3.4, 0.16), trim, 1.5);
    B.add('stone', sb(sc, 3.0, 0.1, su1 - su0 + 0.5, 0.25, 0.2), trim, 1.5);
    // sign
    const si = nextSign();
    const sw = Math.min(su1 - su0 - 0.3, 6.4);
    B.add('wood', sb(sc, 3.55, 0.08, sw + 0.16, 0.62, 0.12), [0.4, 0.3, 0.2], 1);
    B.add('signs', sq(sw, sw / 8, sc, 3.55, 0.145, signUV(si)));
    // awning
    if (rng.chance(0.6)) {
      const scheme = rng.int(0, 3);
      const aw = su1 - su0 - 0.1, out = 1.5, yTop = 3.18, yBot = 2.58;
      const v0 = 1 - (scheme + 1) / 4 + 0.22 / 4, v1 = 1 - scheme / 4;
      const a = Pt(sc - aw / 2, yTop, 0.05), bb = Pt(sc + aw / 2, yTop, 0.05), c = Pt(sc + aw / 2, yBot, out), d = Pt(sc - aw / 2, yBot, out);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...bb, ...c, ...a, ...c, ...d], 3));
      const ur = aw / 2.5;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, v1, ur, v1, ur, v0, 0, v1, ur, v0, 0, v0], 2));
      geo.computeVertexNormals();
      B.add('awning', geo);
      const vv0 = 1 - (scheme + 1) / 4, vv1 = 1 - scheme / 4 - 0.78 / 4;
      B.add('awning', sq(aw, 0.3, sc, yBot - 0.13, out, { u0: 0, u1: ur, v0: vv0, v1: vv1 }));
      for (const du of [-aw / 2, aw / 2]) { const [x, , z] = Pt(sc + du, 0, 0.6); B.add('iron', boxC(0.03, 0.03, 0.03, x, 2.9, z)); }
    }
    // outdoor crates/barrels
    if (rng.chance(0.35)) { const [x, , z] = Pt(su0 - 0.6, 0, 0.6); if (rng.chance(0.5)) P.barrel(B, ctx.world, x, z, rng); else P.crate(B, ctx.world, x, 0, z, 0.7, rng.range(0, 1)); }
  }
  // residential bays (or remaining bays)
  const doorBay = rng.int(0, bays - 1);
  for (let i = 0; i < bays; i++) {
    const u = s.u0 + bw * (i + 0.5);
    if (shop) { const nShop = Math.min(bays, L > 14 ? 3 : bays), start = Math.floor((bays - nShop) / 2); if (i >= start && i < start + nShop) continue; }
    if (i === doorBay || (!shop && rng.chance(0.15))) {
      B.add('wood', sb(u, 1.25, 0.04, 1.3, 2.5, 0.08), b.door, 1.2);
      B.add('stone', sb(u, 2.62, 0.09, 1.7, 0.24, 0.18), trim, 1);
      B.add('stone', sb(u - 0.75, 1.25, 0.08, 0.2, 2.5, 0.16), trim, 1);
      B.add('stone', sb(u + 0.75, 1.25, 0.08, 0.2, 2.5, 0.16), trim, 1);
      B.add('chrome', sb(u + 0.45, 1.1, 0.1, 0.04, 0.12, 0.06));
      B.add('stone', sb(u, 0.06, 0.4, 1.7, 0.12, 0.8), trim, 1);
      if (rng.chance(0.45)) P.wallLantern(B, s, u + 1.15, 2.6, Pt);
    } else if (rng.chance(0.18)) {
      B.add('posters', sq(0.85, 1.7, u, 1.8, 0.02, (() => { const k = rng.int(0, 3); return { u0: k * 0.25, u1: k * 0.25 + 0.25, v0: 0, v1: 1 }; })()));
    } else {
      const w = 1.0, h = 1.45, sill = 1.15;
      B.add('glass', sq(w, h, u, sill + h / 2, 0.012, winUV(rng.int(0, 3))));
      B.add('stone', sb(u, sill + h + 0.07, 0.04, w + 0.26, 0.14, 0.08), trim, 1);
      B.add('stone', sb(u, sill - 0.05, 0.08, w + 0.3, 0.1, 0.16), trim, 1);
      if (rng.chance(0.6)) for (let k = 0; k < 5; k++) B.add('iron', sb(u - w / 2 + 0.1 + k * (w - 0.2) / 4, sill + h / 2, 0.08, 0.03, h, 0.03));
      else { B.add('shutter', sb(u - w / 2 - 0.14 - 0.26, sill + h / 2, 0.03, 0.52, h, 0.04), b.shutter); B.add('shutter', sb(u + w / 2 + 0.14 + 0.26, sill + h / 2, 0.03, 0.52, h, 0.04), b.shutter); }
    }
  }
  // street plaque near a corner
  if (rng.chance(0.25)) { const pi = rng.pick([16, 17, 18, 19, 31]); B.add('signs', sq(1.4, 0.35, s.u0 + 1.2, 3.4, 0.02, signUV(pi))); }
}

function arcadeFacade(ctx, b, s) {
  const { batch: B, world: W, rng } = ctx;
  const [x0, z0, x1] = b.rect;
  const depth = b.arcade.depth;
  const L = x1 - x0, n = Math.max(2, Math.round(L / 3.6)), sp = L / n;
  const trim = col('#ece3d0');
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * sp;
    B.add('stone', cyl(0.24, 0.27, 2.75, 12, x, 0.25, z0 + 0.3), trim);
    B.add('stone', boxC(0.62, 0.25, 0.62, x, 0.125, z0 + 0.3), trim, 1);
    B.add('stone', boxC(0.66, 0.2, 0.66, x, 3.08, z0 + 0.3), trim, 1);
    W.addBox(x - 0.31, 0, z0, x + 0.31, 5.0, z0 + 0.62, { mat: 'stone' });
  }
  // arches
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * sp, hw = sp / 2, r = hw - 0.3;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, 3.18); sh.lineTo(-hw, 5.0); sh.lineTo(hw, 5.0); sh.lineTo(hw, 3.18); sh.lineTo(r, 3.18);
    sh.absarc(0, 3.18, r, 0, Math.PI, false); sh.lineTo(-hw, 3.18);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.62, bevelEnabled: false, curveSegments: 10 });
    g.translate(cx, 0, z0);
    B.add('plaster', g, wallShade(b.color), 2);
  }
  // ceiling (vault-ish flat)
  const cg = new THREE.PlaneGeometry(L, depth); cg.rotateX(Math.PI / 2); cg.translate((x0 + x1) / 2, 4.98, z0 + depth / 2);
  B.add('plaster', cg, [0.75, 0.72, 0.68], 2);
  // inner shop facade
  const inner = { ax: 'x', fixed: z0 + depth, n: -1, u0: x0, u1: x1 };
  const { Pt, sb, sq } = sideHelpers(inner);
  for (let i = 0; i < n; i++) {
    const u = x0 + (i + 0.5) * sp;
    B.add('shopGlass', sq(sp - 0.8, 2.8, u, 1.75, 0.015, winUV(rng.int(0, 3))));
    B.add('stone', sb(u - sp / 2, 1.75, 0.06, 0.4, 3.5, 0.12), trim, 1);
    if (i % 2 === 0) B.add('signs', sq(Math.min(sp - 0.6, 3.2), Math.min(sp - 0.6, 3.2) / 8, u, 3.75, 0.03, signUV(rng.int(0, 15))));
    if (rng.chance(0.4)) P.wallLantern(B, inner, u + sp / 2 - 0.2, 3.4, Pt);
  }
  // floor of arcade slightly raised stone
  B.add('stone', box(x0, 0, z0 + 0.6, x1, 0.05, z0 + depth), [0.85, 0.83, 0.8], 2);
}

// =========================================================================
//  Roofs
// =========================================================================
function roof(ctx, b) {
  const { batch: B, rng } = ctx;
  const [x0, z0, x1, z1] = b.rect, H = b.H;
  const wc = b.wallMat === 'plaster' ? b.color : col('#ffffff');
  if (b.roof === 'flat') {
    B.add('pavers', box(x0, H - 0.02, z0, x1, H + 0.1, z1), [0.85, 0.8, 0.75], 3);
    const t = 0.25, ph = 0.9;
    B.add(b.wallMat, box(x0, H, z0, x1, H + ph, z0 + t), wc, 4);
    B.add(b.wallMat, box(x0, H, z1 - t, x1, H + ph, z1), wc, 4);
    B.add(b.wallMat, box(x0, H, z0, x0 + t, H + ph, z1), wc, 4);
    B.add(b.wallMat, box(x1 - t, H, z0, x1, H + ph, z1), wc, 4);
    // terrace bits
    if (rng.chance(0.6)) B.add('iron', cyl(0.5, 0.5, 1.1, 12, x0 + 1.5, H + 0.1, z0 + 1.5));
    for (let i = 0; i < 3; i++) { const px = x0 + rng.range(1.5, x1 - x0 - 1.5), pz = z0 + rng.range(1.5, z1 - z0 - 1.5); B.add('terracotta', cyl(0.25, 0.2, 0.4, 8, px, H + 0.1, pz), [1, 1, 1]); const f = displace(new THREE.IcosahedronGeometry(0.35, 1), 0.08, 6, i); f.translate(px, H + 0.75, pz); B.add('foliageLo', f, [0.15, 0.32, 0.1]); }
    return;
  }
  gableRoof(B, x0, z0, x1, z1, H, wc, b.wallMat, (x1 - x0) >= (z1 - z0) ? 'x' : 'z');
  // chimneys
  const nC = rng.int(0, 2);
  for (let i = 0; i < nC; i++) {
    const cx = x0 + rng.range(1, x1 - x0 - 1), cz = z0 + rng.range(1, z1 - z0 - 1);
    B.add('plaster', box(cx - 0.3, H, cz - 0.3, cx + 0.3, H + 2.3, cz + 0.3), wallShade(wc, H), 2);
    B.add('roof', box(cx - 0.42, H + 2.3, cz - 0.42, cx + 0.42, H + 2.42, cz + 0.42), [0.9, 0.85, 0.8], 1);
    B.add('roof', box(cx - 0.2, H + 2.42, cz - 0.2, cx + 0.2, H + 2.7, cz + 0.2), [0.9, 0.85, 0.8], 1);
  }
  if (rng.chance(0.25)) {
    const ax = x0 + rng.range(1, x1 - x0 - 1), az = z0 + rng.range(1, z1 - z0 - 1);
    B.add('iron', cyl(0.025, 0.025, 3.0, 4, ax, H + 0.8, az));
    for (let k = 0; k < 4; k++) B.add('iron', boxC(1.2 - k * 0.2, 0.02, 0.02, ax, H + 2.6 + k * 0.25, az));
  }
}

export function gableRoof(B, x0, z0, x1, z1, H, wallColor, wallMat = 'plaster', axis = 'x', pitch = 0.42, o = 0.38) {
  // build in a frame where ridge runs along local X
  const alongX = axis === 'x';
  const L0 = alongX ? x0 : z0, L1 = alongX ? x1 : z1, S0 = alongX ? z0 : x0, S1 = alongX ? z1 : x1;
  const half = (S1 - S0) / 2, sc = (S0 + S1) / 2;
  const rise = half * pitch;
  const yR = H + rise, yE = H - o * pitch;
  const map = (l, y, s) => (alongX ? [l, y, s] : [s, y, l]);
  const pos = [], uv = [];
  const slopeLen = Math.hypot(half + o, rise + o * pitch);
  const pushQuad = (a, b, c, d, ua, ub, uc, ud) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud); };
  // side 1 (S0 side) and side 2 (S1 side)
  const lA = L0 - o, lB = L1 + o, ut = 2;
  for (const side of [0, 1]) {
    const sE = side === 0 ? S0 - o : S1 + o;
    const a = map(lA, yE, sE), b = map(lB, yE, sE), c = map(lB, yR, sc), d = map(lA, yR, sc);
    const vE = -slopeLen / ut, vR = 0;
    let ua = [lA / ut, vE], ub = [lB / ut, vE], ucc = [lB / ut, vR], ud = [lA / ut, vR];
    const flip = (side === 0) === alongX;
    if (flip) pushQuad(b, a, d, c, ub, ua, ud, ucc); else pushQuad(a, b, c, d, ua, ub, ucc, ud);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  rg.computeVertexNormals();
  B.add('roof', rg, (x, y) => { const k = 0.8 + 0.2 * Math.min(1, (y - H + 0.4) / 2); return [k, k * 0.97, k * 0.95]; });
  // gable triangles
  const gp = [];
  for (const end of [0, 1]) {
    const l = end === 0 ? L0 : L1;
    const a = map(l, H, S0), b = map(l, H, S1), c = map(l, yR, sc);
    const flip = (end === 1) === alongX;
    if (flip) gp.push(...a, ...c, ...b); else gp.push(...a, ...b, ...c);
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.computeVertexNormals();
  B.add(wallMat, gg, wallColor, 4);
  // eave fascia
  for (const side of [0, 1]) {
    const sE = side === 0 ? S0 - o : S1 + o;
    const a = map(lA, yE - 0.14, sE - 0.06), b = map(lB, yE, sE + 0.06);
    B.add('wood', box(a[0], a[1], a[2], b[0], b[1], b[2]), [0.55, 0.42, 0.3], 1);
  }
}

// =========================================================================
//  Church & campanile
// =========================================================================
function church(ctx) {
  const { batch: B, world: W } = ctx;
  const [x0, z0, x1, z1] = TOWN.churchRect; // facade at x1 facing +x
  const H = 14;
  const stoneC = col('#efe5d2');
  B.add('blocks', box(x0, 0, z0 + 1, x1 - 0.8, H, z1 - 1), wallShade(stoneC), 3);
  W.addBox(x0, 0, z0 + 1, x1 - 0.8, H, z1 - 1, { mat: 'stone' });
  gableRoof(B, x0, z0 + 1, x1 - 0.8, z1 - 1, H, stoneC, 'blocks', 'x', 0.45, 0.45);
  // facade slab
  const fx0 = x1 - 0.8, fx1 = x1, FH = 17;
  B.add('stone', box(fx0, 0, z0, fx1, FH, z1), wallShade(stoneC), 3);
  W.addBox(fx0, 0, z0, fx1 + 0.05, FH, z1, { mat: 'stone' });
  // pediment
  const sh = new THREE.Shape(); sh.moveTo(z0 - 0.3, 0); sh.lineTo(z1 + 0.3, 0); sh.lineTo((z0 + z1) / 2, 4.2); sh.closePath();
  const pg = new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: false }); pg.rotateY(-Math.PI / 2); pg.translate(fx0 + 0.9, FH, 0);
  B.add('stone', pg, stoneC, 3);
  B.add('stone', box(fx1, FH - 0.4, z0 - 0.3, fx1 + 0.35, FH, z1 + 0.3), stoneC, 2);
  // pilasters
  for (const z of [z0 + 0.4, z0 + 5, z1 - 5, z1 - 0.4]) {
    B.add('stone', box(fx1, 0, z - 0.45, fx1 + 0.3, FH - 0.4, z + 0.45), [0.95, 0.93, 0.88], 2);
    B.add('stone', box(fx1, FH - 1.2, z - 0.6, fx1 + 0.42, FH - 0.4, z + 0.6), [0.95, 0.93, 0.88], 1);
  }
  // portal
  const dz = 0, dw = 3.2, dh = 5.2;
  B.add('wood', box(fx1, 0, dz - dw / 2, fx1 + 0.06, dh, dz + dw / 2), col('#5a3820'), 1.2);
  const arch = new THREE.Shape(); arch.moveTo(-2.3, 0); arch.lineTo(-2.3, dh + 2.4); arch.lineTo(2.3, dh + 2.4); arch.lineTo(2.3, 0); arch.lineTo(1.6, 0); arch.lineTo(1.6, dh); arch.absarc(0, dh, 1.6, 0, Math.PI, false); arch.lineTo(-1.6, 0);
  const ag = new THREE.ExtrudeGeometry(arch, { depth: 0.35, bevelEnabled: false, curveSegments: 14 }); ag.rotateY(Math.PI / 2); ag.translate(fx1, 0, dz);
  B.add('stone', ag, [0.92, 0.9, 0.85], 1.5);
  const tymp = new THREE.CircleGeometry(1.6, 14, 0, Math.PI); tymp.rotateY(Math.PI / 2); tymp.translate(fx1 + 0.05, dh, dz);
  B.add('paint', tymp, col('#3a5a8a'));
  // steps
  for (let i = 0; i < 3; i++) {
    B.add('stone', box(fx1, 0, z0 + 1.5, fx1 + 2.4 - i * 0.7, 0.15 * (i + 1), z1 - 1.5), [0.9, 0.88, 0.84], 2);
    W.addBox(fx1, 0, z0 + 1.5, fx1 + 2.4 - i * 0.7, 0.15 * (i + 1), z1 - 1.5, { mat: 'stone', cover: false });
  }
  // rose window
  const rose = new THREE.CircleGeometry(1.9, 32); rose.rotateY(Math.PI / 2); rose.translate(fx1 + 0.03, 11, 0);
  B.add('rose', rose);
  const ring = new THREE.TorusGeometry(2.0, 0.22, 8, 32); ring.rotateY(Math.PI / 2); ring.translate(fx1 + 0.08, 11, 0);
  B.add('stone', ring, [0.95, 0.93, 0.88]);
  B.add('signs', quad(4.5, 4.5 / 8, fx1 + 0.04, 8.0, 0, 1, 0, signUV(28)));
  // side windows (tall arched glass)
  for (const z of [z0 + 1, z1 - 1]) for (let i = 0; i < 4; i++) {
    const x = x0 + 3 + i * 4;
    B.add('rose', quad(1.0, 3.2, x, 8.5, z + (z < 0 ? -0.02 : 0.02), 0, z < 0 ? -1 : 1));
  }
  // campanile
  const [cx0, cz0, cx1, cz1] = TOWN.campanile;
  const CH = 22;
  B.add('brick', box(cx0, 0, cz0, cx1, CH, cz1), wallShade(col('#ffffff')), 2);
  W.addBox(cx0, 0, cz0, cx1, 31, cz1, { mat: 'stone' });
  for (let y = 4; y < CH; y += 6) B.add('stone', box(cx0 - 0.1, y, cz0 - 0.1, cx1 + 0.1, y + 0.3, cz1 + 0.1), stoneC, 2);
  // belfry: corner piers
  const by0 = CH, by1 = CH + 5;
  for (const [px, pz] of [[cx0, cz0], [cx1 - 1, cz0], [cx0, cz1 - 1], [cx1 - 1, cz1 - 1]]) B.add('brick', box(px, by0, pz, px + 1, by1, pz + 1), [1, 1, 1], 2);
  B.add('stone', box(cx0 - 0.25, by1, cz0 - 0.25, cx1 + 0.25, by1 + 0.6, cz1 + 0.25), stoneC, 2);
  B.add('stone', box(cx0 - 0.15, by0 - 0.2, cz0 - 0.15, cx1 + 0.15, by0 + 0.1, cz1 + 0.15), stoneC, 2);
  const bell = new THREE.LatheGeometry([new THREE.Vector2(0, 1.3), new THREE.Vector2(0.35, 1.25), new THREE.Vector2(0.5, 0.8), new THREE.Vector2(0.65, 0.2), new THREE.Vector2(0.8, 0), new THREE.Vector2(0.7, 0.05)], 16);
  bell.translate((cx0 + cx1) / 2, by0 + 2.2, (cz0 + cz1) / 2);
  B.add('bellBronze', bell);
  const cone = new THREE.ConeGeometry(4.6, 4.5, 4, 1); cone.rotateY(Math.PI / 4); cone.translate((cx0 + cx1) / 2, by1 + 0.6 + 2.25, (cz0 + cz1) / 2);
  B.add('roof', cone, [0.9, 0.85, 0.8], 2);
  B.add('iron', cyl(0.04, 0.04, 1.6, 4, (cx0 + cx1) / 2, by1 + 5.1, (cz0 + cz1) / 2));
  B.add('iron', boxC(0.7, 0.05, 0.05, (cx0 + cx1) / 2, by1 + 6.2, (cz0 + cz1) / 2));
  // clocks
  B.add('clock', quad(2.6, 2.6, cx1 + 0.03, 18, (cz0 + cz1) / 2, 1, 0));
  B.add('clock', quad(2.6, 2.6, (cx0 + cx1) / 2, 18, cz1 + 0.03, 0, 1));
  B.add('clock', quad(2.6, 2.6, (cx0 + cx1) / 2, 18, cz0 - 0.03, 0, -1));
}

// =========================================================================
//  Fountain
// =========================================================================
function fountain(ctx) {
  const { batch: B, world: W } = ctx;
  const [fx, fz] = TOWN.fountain;
  const sc = col('#ebe2cf');
  const basin = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.05), new THREE.Vector2(4.0, 0.05), new THREE.Vector2(4.0, 0.62), new THREE.Vector2(4.2, 0.72), new THREE.Vector2(4.55, 0.72),
    new THREE.Vector2(4.6, 0.6), new THREE.Vector2(4.5, 0.5), new THREE.Vector2(4.55, 0.0),
  ], 48);
  basin.translate(fx, 0, fz);
  B.add('stone', basin, sc);
  const water = new THREE.CircleGeometry(4.02, 48); water.rotateX(-Math.PI / 2); water.translate(fx, 0.5, fz);
  ctx.waterMeshes.push({ geo: water });
  const col1 = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0), new THREE.Vector2(0.9, 0.5), new THREE.Vector2(0.55, 0.7), new THREE.Vector2(0.4, 1.6),
    new THREE.Vector2(0.5, 1.9), new THREE.Vector2(1.6, 2.2), new THREE.Vector2(1.7, 2.45), new THREE.Vector2(1.4, 2.4), new THREE.Vector2(0.35, 2.5),
    new THREE.Vector2(0.25, 3.3), new THREE.Vector2(0.45, 3.45), new THREE.Vector2(0.15, 3.9), new THREE.Vector2(0, 4.05),
  ], 32);
  col1.translate(fx, 0.05, fz);
  B.add('stone', col1, sc);
  const w2 = new THREE.CircleGeometry(1.45, 32); w2.rotateX(-Math.PI / 2); w2.translate(fx, 2.43, fz);
  ctx.waterMeshes.push({ geo: w2 });
  W.addCyl(fx, fz, 4.6, 0, 0.72, { mat: 'stone' });
  W.addCyl(fx, fz, 1.0, 0, 4.0, { mat: 'stone' });
  ctx.fountainJets = [{ x: fx, y: 3.9, z: fz, r: 1.5, fall: 2.45 }, { x: fx, y: 2.4, z: fz, r: 3.6, fall: 0.5 }];
}

// =========================================================================
//  City wall, gate, towers, breaches
// =========================================================================
function cityWall(ctx) {
  const { batch: B, world: W, rng } = ctx;
  const x0 = -6, x1 = -2, H = 7;
  const gaps = [[-3.6, 3.6, 5.0], [-58, -50, 0], [52, 60, 0], [26, 28.6, 3.0]]; // z0, z1, passage height (0=breach)
  const segs = [];
  let z = -92;
  for (const gp of gaps.slice().sort((a, b) => a[0] - b[0])) { segs.push([z, gp[0]]); z = gp[1]; }
  segs.push([z, 92]);
  const wcol = col('#e9dcc4');
  for (const [a, b] of segs) {
    B.add('blocks', box(x0, 0, a, x1, H, b), wallShade(wcol), 3);
    W.addBox(x0, 0, a, x1, H, b, { mat: 'stone' });
    // merlons on outer edge (east) and walkway parapet
    for (let mz = a + 0.6; mz < b - 0.6; mz += 2.1) {
      B.add('blocks', box(x1 - 0.6, H, mz, x1, H + 1.3, mz + 1.1), wcol, 3);
    }
    B.add('stone', box(x1 - 0.05, H - 0.25, a, x1 + 0.15, H - 0.05, b), wcol, 2);
  }
  // passages: lintels over gate & postern
  for (const [a, b, ph] of gaps) {
    if (ph > 0) {
      B.add('blocks', box(x0, ph, a, x1, H, b), wallShade(wcol), 3);
      W.addBox(x0, ph, a, x1, H, b, { mat: 'stone' });
      const hw = (b - a) / 2, mid = (a + b) / 2, r = hw;
      for (const face of [x1, x0]) {
        const sh = new THREE.Shape();
        sh.moveTo(-hw - 0.5, ph - r * 0.9); sh.lineTo(-hw - 0.5, ph + 0.6); sh.lineTo(hw + 0.5, ph + 0.6); sh.lineTo(hw + 0.5, ph - r * 0.9); sh.lineTo(hw, ph - r * 0.9);
        sh.absarc(0, ph - r * 0.9, hw, 0, Math.PI, false); sh.lineTo(-hw - 0.5, ph - r * 0.9);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: 12 });
        g.rotateY(Math.PI / 2); g.translate(face === x1 ? x1 : x0 - 0.3, 0, mid);
        B.add('stone', g, [0.95, 0.92, 0.86], 1.5);
      }
    } else {
      // breach rubble
      for (let i = 0; i < 14; i++) {
        const rx = rng.range(x0 - 2.5, x1 + 3), rz = rng.chance(0.5) ? rng.range(a - 0.5, a + 2.2) : rng.range(b - 2.2, b + 0.5);
        const s = rng.range(0.3, 0.9);
        const rg = P.rockMesh(rng, s); rg.translate(rx, s * 0.35, rz);
        B.add('blocks', rg, wcol, 1.5);
        if (s > 0.55) W.addBox(rx - s * 0.7, 0, rz - s * 0.7, rx + s * 0.7, s * 0.8, rz + s * 0.7, { mat: 'stone' });
      }
      // broken wall stumps
      B.add('blocks', box(x0, 0, a, x1, rng.range(1.2, 2.4), a + 1.4), wallShade(wcol), 3);
      B.add('blocks', box(x0, 0, b - 1.4, x1, rng.range(1.0, 2.2), b), wallShade(wcol), 3);
      W.addBox(x0, 0, a, x1, 1.2, a + 1.4, { mat: 'stone' });
      W.addBox(x0, 0, b - 1.4, x1, 1.0, b, { mat: 'stone' });
    }
  }
  // gate towers
  for (const [tz0, tz1] of [[-10, -3.6], [3.6, 10]]) {
    B.add('blocks', box(-7.5, 0, tz0, 0.8, 11.5, tz1), wallShade(wcol), 3);
    W.addBox(-7.5, 0, tz0, 0.8, 11.5, tz1, { mat: 'stone' });
    B.add('stone', box(-7.8, 11.5, tz0 - 0.3, 1.1, 11.9, tz1 + 0.3), wcol, 2);
    for (let i = 0; i < 4; i++) { const zz = tz0 + 0.3 + i * ((tz1 - tz0 - 0.6) / 3.5); B.add('blocks', box(0.1, 11.9, zz, 1.1, 13.2, zz + 0.9), wcol, 3); B.add('blocks', box(-7.8, 11.9, zz, -6.8, 13.2, zz + 0.9), wcol, 3); }
    B.add('glass', quad(0.5, 1.2, 0.82, 7.5, (tz0 + tz1) / 2, 1, 0, winUV(3)));
  }
  B.add('signs', quad(4, 0.5, x1 + 0.32, 6.2, 0, 1, 0, signUV(23)));
  B.add('signs', quad(3.2, 0.4, x0 - 0.32, 6.2, 0, -1, 0, signUV(22)));
}

// =========================================================================
function garden(ctx, r) {
  const { batch: B, world: W, rng } = ctx;
  const [x0, z0, x1, z1] = r;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  B.add('blocks', box(x0, 0, z0, x1, 0.06, z1), [0.85, 0.8, 0.72], 2);
  P.planter(B, W, cx, cz, rng, 'lemon');
  P.bench(B, W, cx, z0 + 1.2, 0);
  if (rng.chance(0.5)) P.crate(B, W, x1 - 1, 0, z1 - 1, 0.8, 0.3);
}

function piazzaProps(ctx) {
  const { batch: B, world: W, rng } = ctx;
  // cafe under the arcade side
  const umb = ['#b3261e', '#2f6b3a', '#f3ead8', '#1f4f86'];
  for (let i = 0; i < 6; i++) P.cafeSet(B, W, -76 + i * 3.4, 12.2 + (i % 2) * 0.8, rng, umb[i % umb.length]);
  for (let i = 0; i < 4; i++) P.cafeSet(B, W, -74 + i * 3.6, 20.2 + (i % 2) * 0.4, rng, null);
  // market stalls on the south side
  for (let i = 0; i < 4; i++) P.marketStall(B, W, -73 + i * 6.5, -12.5, 0, i % 4, rng);
  // benches around fountain
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; P.bench(B, W, -62 + Math.cos(a) * 7.2, Math.sin(a) * 7.2, -a + Math.PI / 2); }
  // corner lamps
  for (const [x, z] of [[-79, -16], [-45, -16], [-79, 16], [-45, 16]]) P.streetLamp(B, W, x, z, x > -60 ? Math.PI : 0);
  P.kiosk(B, W, -48, -9, -Math.PI / 2);
  for (const [x, z] of [[-52, 7], [-71, -6], [-55, -7]]) P.planter(B, W, x, z, rng, rng.chance(0.5) ? 'lemon' : 'flowers');
  // market square props
  const [mx0, mz0, mx1, mz1] = TOWN.market;
  for (let i = 0; i < 3; i++) P.marketStall(B, W, mx0 + 3.5 + i * 5, (mz0 + mz1) / 2 - 2.5, 0, (i + 1) % 4, rng);
  for (let i = 0; i < 2; i++) P.marketStall(B, W, mx0 + 6 + i * 6, (mz0 + mz1) / 2 + 3.5, Math.PI, (i + 2) % 4, rng);
  for (let i = 0; i < 6; i++) P.crate(B, W, mx0 + rng.range(1, mx1 - mx0 - 1), 0, rng.chance(0.5) ? mz0 + 1 : mz1 - 1, rng.range(0.6, 0.9), rng.range(0, 1));
  // spawn plaza (CT)
  const [sx0, sz0, sx1, sz1] = TOWN.spawnPlaza;
  for (let i = 0; i < 4; i++) P.crate(B, W, sx0 + 6 + i * 2.2, sz0 + 2, 0.95, 0.1 * i);
  P.crate(B, W, sx0 + 7, 0.95, sz0 + 2, 0.85, 0.2, true);
  for (let i = 0; i < 3; i++) P.barrel(B, W, sx1 - 2, sz1 - 2 - i * 1.0, rng);
  P.planter(B, W, sx0 + 3, sz1 - 3, rng, 'lemon');
  P.planter(B, W, sx0 + 3, sz0 + 3, rng, 'lemon');
  B.add('signs', quad(5, 0.625, sx0 + 0.02, 4.2, 0, 1, 0, signUV(21)));
}

function streetProps(ctx, heightAt) {
  const { batch: B, world: W, rng } = ctx;
  // cars parked along streets
  const spots = [
    [-20, -2.2, 0], [-27, 2.2, Math.PI], [-32.5, -24, Math.PI / 2], [-32.5, 30, -Math.PI / 2], [-32.5, 62, Math.PI / 2], [-32.5, -70, -Math.PI / 2],
    [-104.5, 30, Math.PI / 2], [-104.5, -28, -Math.PI / 2], [-90, 43.5, 0], [-55, -43.5, Math.PI], [-70, 43.5, Math.PI], [-9, -30, Math.PI / 2], [-9, 66, -Math.PI / 2], [-118, 43.5, 0],
  ];
  for (const [x, z, ry] of spots) P.car(B, W, x, z, ry, rng.pick(CAR_COLORS), rng);
  const scoots = [[-38.5, 8, 0.3], [-30.5, -20, 1.6], [-45, -6.5, 0.1], [-106, 10, 1.5], [-15, 6.2, 0.2], [-60, 44.5, 3.1]];
  for (const [x, z, ry] of scoots) P.scooter(B, W, x, z, ry, rng.pick(['#a8d8c8', '#e8e0c8', '#c8302e', '#7aa8d8', '#f2c230']));
  // street lamps
  for (let z = -84; z <= 84; z += 18) { if (Math.abs(z) < 6) continue; P.streetLamp(B, W, -29.6, z + 4, Math.PI); P.streetLamp(B, W, -101.6, z - 4, Math.PI); }
  for (let x = -120; x <= -16; x += 20) { P.streetLamp(B, W, x, 40.6, -Math.PI / 2); P.streetLamp(B, W, x + 8, -40.6, Math.PI / 2); }
  // bins, bollards, crates
  for (let i = 0; i < 16; i++) {
    const x = rng.range(-120, -10), z = rng.range(-85, 85);
    if (heightAt(x, z) > 0 || inRect(x, z, TOWN.piazza) || Math.abs(x - TOWN.fountain[0]) < 6) continue;
    if (rng.chance(0.5)) P.bin(B, W, x, z, rng.pick([0, Math.PI / 2])); else P.crate(B, W, x, 0, z, rng.range(0.7, 1.0), rng.range(0, 1));
  }
  for (const z of [-3, 0, 3]) P.bollard(B, W, -36.6, z);
  for (const z of [-2.5, 2.5]) P.bollard(B, W, -13, z);
  // a few cover stacks in streets (tactical)
  const stacks = [[-33, -55], [-33, 52], [-105, 55], [-105, -58], [-9, -15], [-9, 18], [-70, -43], [-50, 43]];
  for (const [x, z] of stacks) { P.crate(B, W, x - 0.5, 0, z, 1.0, 0); P.crate(B, W, x + 0.6, 0, z + 0.3, 0.9, 0.4); if (rng.chance(0.5)) P.crate(B, W, x - 0.5, 1.0, z, 0.8, 0.2); }
}

function laundry(ctx, solid) {
  const { batch: B, rng } = ctx;
  // lines across narrow alleys
  const alleyLines = [[-60.5, -57.5, 'x'], [-83, -79.5, 'x'], [68, 71, 'z'], [20, 23, 'z'], [-71, -68, 'z']];
  for (const [a0, a1, ax] of alleyLines) {
    for (let k = 0; k < 5; k++) {
      const t = rng.range(-80, 80), y = rng.range(6.5, 9.5);
      let x0, z0, x1, z1;
      if (ax === 'x') { x0 = a0; x1 = a1; z0 = z1 = t; } else { z0 = a0; z1 = a1; x0 = x1 = (ax === 'z' ? rng.range(-120, -15) : t); }
      // only if buildings on both sides
      const inside = (x, z) => solid.some(b => inRect(x, z, b.rect) && b.H > y + 0.5);
      if (ax === 'x' ? !(inside(x0 - 0.5, z0) && inside(x1 + 0.5, z0)) : !(inside(x0, z0 - 0.5) && inside(x0, z1 + 0.5))) continue;
      B.add('iron', box(Math.min(x0, x1) - 0.01, y - 0.01, Math.min(z0, z1) - 0.01, Math.max(x0, x1) + 0.01, y + 0.01, Math.max(z0, z1) + 0.01));
      const len = ax === 'x' ? x1 - x0 : z1 - z0;
      for (let c = 0.4; c < len - 0.4; c += rng.range(0.5, 0.9)) {
        const w = rng.range(0.35, 0.7), h = rng.range(0.4, 0.9);
        const cx = ax === 'x' ? x0 + c : x0, cz = ax === 'x' ? z0 : z0 + c;
        const q = quad(w, h, cx, y - h / 2, cz, ax === 'x' ? 0 : 1, ax === 'x' ? 1 : 0);
        B.add('cloth', q, col(rng.pick(['#ffffff', '#f2d7d7', '#b8d4f0', '#f5e6a8', '#d63a3a', '#3a6ad6', '#e8e8e8', '#a8e0b8'])));
      }
    }
  }
}
