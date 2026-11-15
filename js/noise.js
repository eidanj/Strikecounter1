// Seeded random + gradient noise helpers (deterministic so the map is the same every load)

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length) % arr.length]; }
  chance(p) { return this.r() < p; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
}

// ---------- Perlin noise (2D) with optional periodic wrap ----------
const P = new Uint8Array(512);
(function init() {
  const r = mulberry32(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
}

// returns roughly -1..1 ; period (integer) makes it tile
export function perlin2(x, y, period = 0) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  let xi1 = xi + 1, yi1 = yi + 1;
  if (period > 0) {
    xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period;
    xi1 = (xi + 1) % period; yi1 = (yi + 1) % period;
  }
  xi &= 255; yi &= 255; xi1 &= 255; yi1 &= 255;
  const u = fade(xf), v = fade(yf);
  const aa = P[P[xi] + yi], ab = P[P[xi] + yi1], ba = P[P[xi1] + yi], bb = P[P[xi1] + yi1];
  const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
  const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
  return (x1 + v * (x2 - x1)) * 0.9;
}

export function fbm2(x, y, oct = 4, lac = 2, gain = 0.5, period = 0) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * perlin2(x * f, y * f, period ? period * f : 0);
    n += a; a *= gain; f *= lac;
  }
  return s / n;
}

export function ridged2(x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (1 - Math.abs(perlin2(x * f, y * f)));
    a *= 0.5; f *= 2;
  }
  return s;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
