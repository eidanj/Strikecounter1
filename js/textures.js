// Procedural texture library. Everything is painted on canvases at load time
// (no external image files), with height -> normal map conversion for depth.
import * as THREE from 'three';
import { perlin2, fbm2, RNG } from './noise.js';

function mk(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ---------- tileable noise masks (generated once) ----------
let MASKS = null;
function buildMasks() {
  if (MASKS) return MASKS;
  const make = (period, oct, contrast, seedOff) => {
    const S = 256;
    const [c, g] = mk(S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = fbm2((x / S) * period + seedOff, (y / S) * period + seedOff * 0.7, oct, 2, 0.5, period);
      v = Math.max(0, Math.min(1, 0.5 + v * contrast));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v * 255;
    }
    g.putImageData(img, 0, 0);
    // grayscale opaque version
    const [c2, g2] = mk(S);
    g2.fillStyle = '#000'; g2.fillRect(0, 0, S, S); g2.drawImage(c, 0, 0);
    return { alpha: c, gray: c2 };
  };
  MASKS = {
    coarse: make(3, 4, 1.6, 0),
    mid: make(8, 4, 1.5, 17),
    fine: make(32, 2, 1.4, 41),
    blotch: make(5, 5, 2.4, 73),
  };
  return MASKS;
}

function pattern(g, src, size, reps) {
  const p = g.createPattern(src, 'repeat');
  const s = size / (256 * reps);
  p.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
  return p;
}
function overlay(g, size, src, alpha, op = 'overlay', reps = 1) {
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = op;
  g.fillStyle = pattern(g, src, size, reps); g.fillRect(0, 0, size, size); g.restore();
}
// colored blobs using an alpha mask
function tintBlobs(g, size, maskAlpha, reps, color, alpha = 1, op = 'source-over') {
  const [c, cg] = mk(size);
  cg.fillStyle = color; cg.fillRect(0, 0, size, size);
  cg.globalCompositeOperation = 'destination-in';
  cg.fillStyle = pattern(cg, maskAlpha, size, reps); cg.fillRect(0, 0, size, size);
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = op; g.drawImage(c, 0, 0); g.restore();
}
function wrapDraw(size, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const xx = x + ox * size, yy = y + oy * size;
    if (xx + r < 0 || xx - r > size || yy + r < 0 || yy - r > size) continue;
    fn(xx, yy);
  }
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = mk(w, h);
  const out = g.createImageData(w, h);
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = src[i * 4] / 255;
  const s = strength * (w / 512);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (H[yc + xp] - H[yc + xm]) * s;
      const dy = (H[yp + x] - H[ym + x]) * s;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (yc + x) * 4;
      out.data[i] = (nx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

// ======================================================================
//  Surface generators: each returns { color: canvas, height: canvas }
// ======================================================================

function genCobble(S, seed = 3) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#3b352c'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const rows = 9, rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = r.range(0, rh);
    const y0 = row * rh;
    const startX = x;
    while (x < startX + S) {
      const w = rh * r.range(0.75, 1.35);
      const sw = w - rh * 0.1, shh = rh * r.range(0.8, 0.9);
      const sx = x + rh * 0.05, sy = y0 + (rh - shh) / 2 + r.range(-1, 1) * rh * 0.04;
      const l = r.range(40, 62), sat = r.range(6, 18), hue = r.range(25, 45);
      const rad = rh * r.range(0.22, 0.35);
      wrapDraw(S, sx + sw / 2, sy + shh / 2, Math.max(sw, shh), (cx, cy) => {
        const X = cx - sw / 2, Y = cy - shh / 2;
        rrect(g, X, Y, sw, shh, rad);
        const gr = g.createLinearGradient(X, Y, X + sw * 0.3, Y + shh);
        gr.addColorStop(0, hsl(hue, sat, l + 8)); gr.addColorStop(1, hsl(hue, sat, l - 10));
        g.fillStyle = gr; g.fill();
        rrect(hg, X, Y, sw, shh, rad);
        const hr = hg.createRadialGradient(cx, cy, 0, cx, cy, Math.max(sw, shh) * 0.62);
        hr.addColorStop(0, '#fff'); hr.addColorStop(0.65, '#bbb'); hr.addColorStop(1, '#444');
        hg.fillStyle = hr; hg.fill();
      });
      x += w;
    }
  }
  overlay(g, S, M.mid.gray, 0.35, 'multiply', 2);
  overlay(g, S, M.fine.gray, 0.25, 'overlay', 2);
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgba(40,30,20,1)', 0.25, 'multiply');
  overlay(hg, S, M.fine.gray, 0.25, 'overlay', 3);
  return { color: c, height: h };
}

function genPavers(S, seed = 5) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#4c473f'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#111'; hg.fillRect(0, 0, S, S);
  const rows = 8, rh = S / rows, gap = Math.max(1, S / 300);
  for (let row = 0; row < rows; row++) {
    const len = rh * 2;
    const off = (row % 2) * len * 0.5;
    for (let x = -len; x < S + len; x += len) {
      const X = x + off + gap, Y = row * rh + gap, W = len - gap * 2, H = rh - gap * 2;
      const l = r.range(52, 66);
      g.fillStyle = hsl(r.range(30, 42), r.range(5, 12), l); g.fillRect(X, Y, W, H);
      const gr = hg.createLinearGradient(X, Y, X, Y + H);
      gr.addColorStop(0, '#ddd'); gr.addColorStop(0.5, '#eee'); gr.addColorStop(1, '#bbb');
      hg.fillStyle = gr; hg.fillRect(X, Y, W, H);
    }
  }
  overlay(g, S, M.mid.gray, 0.3, 'multiply', 2);
  overlay(g, S, M.fine.gray, 0.3, 'overlay', 4);
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(60,50,40)', 0.25, 'multiply');
  overlay(hg, S, M.fine.gray, 0.3, 'overlay', 4);
  return { color: c, height: h };
}

function drawBricks(g, hg, S, x0, y0, w, h, rowsPerS, r) {
  const bh = S / rowsPerS, bl = bh * 3.6, m = Math.max(1, bh * 0.16);
  for (let y = y0; y < y0 + h; y += bh) {
    const off = (Math.round(y / bh) % 2) * bl * 0.5;
    for (let x = x0 - bl + off; x < x0 + w; x += bl) {
      g.fillStyle = hsl(r.range(8, 22), r.range(40, 62), r.range(32, 48));
      g.fillRect(x + m / 2, y + m / 2, bl - m, bh - m);
      if (hg) { const v = r.int(170, 225); hg.fillStyle = `rgb(${v},${v},${v})`; hg.fillRect(x + m / 2, y + m / 2, bl - m, bh - m); }
    }
  }
}

function genPlaster(S, seed = 7) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#9a9a9a'; hg.fillRect(0, 0, S, S);
  // soft mottling
  for (let i = 0; i < 70; i++) {
    const x = r.range(0, S), y = r.range(0, S), rad = r.range(S * 0.04, S * 0.18);
    const dark = r.chance(0.6);
    wrapDraw(S, x, y, rad, (cx, cy) => {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, dark ? 'rgba(120,100,80,0.10)' : 'rgba(255,255,255,0.14)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    });
  }
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(150,130,105)', 0.22, 'multiply');
  overlay(g, S, M.fine.gray, 0.22, 'overlay', 3);
  // exposed brick patches where plaster has fallen off
  const patches = 1;
  for (let p = 0; p < patches; p++) {
    const px = r.range(0.2, 0.8) * S, py = r.range(0.25, 0.75) * S, pr = r.range(0.035, 0.05) * S;
    const path = new Path2D();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = pr * (0.6 + 0.5 * Math.abs(perlin2(p * 3 + Math.cos(a) * 1.5, Math.sin(a) * 1.5)) + 0.25 * Math.sin(a * 3 + p));
      const X = px + Math.cos(a) * rr * 1.5, Y = py + Math.sin(a) * rr;
      i ? path.lineTo(X, Y) : path.moveTo(X, Y);
    }
    path.closePath();
    // plaster edge shadow
    g.save(); g.translate(2, 3); g.fillStyle = 'rgba(70,55,40,0.35)'; g.fill(path); g.restore();
    g.save(); g.clip(path); g.fillStyle = '#a99d8a'; g.fillRect(0, 0, S, S);
    drawBricks(g, null, S, px - pr * 2, py - pr * 2, pr * 4, pr * 4, 56, r);
    g.restore();
    hg.save(); hg.clip(path); hg.fillStyle = '#3c3c3c'; hg.fillRect(0, 0, S, S); hg.restore();
  }
  // hairline cracks
  g.strokeStyle = 'rgba(80,65,50,0.45)'; g.lineWidth = Math.max(1, S / 700);
  for (let k = 0; k < 5; k++) {
    let x = r.range(0, S), y = r.range(0, S), a = r.range(0, Math.PI * 2);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 22; s++) { a += r.range(-0.6, 0.6); x += Math.cos(a) * S * 0.012; y += Math.sin(a) * S * 0.012; g.lineTo(x, y); }
    g.stroke();
  }
  overlay(hg, S, M.mid.gray, 0.5, 'overlay', 2);
  overlay(hg, S, M.fine.gray, 0.4, 'overlay', 4);
  return { color: c, height: h };
}

function genBrick(S, seed = 9) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#b3a793'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#222'; hg.fillRect(0, 0, S, S);
  drawBricks(g, hg, S, 0, 0, S, S, 24, r);
  overlay(g, S, M.mid.gray, 0.3, 'multiply', 2);
  overlay(g, S, M.fine.gray, 0.3, 'overlay', 3);
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(40,35,30)', 0.2, 'multiply');
  overlay(hg, S, M.fine.gray, 0.35, 'overlay', 3);
  return { color: c, height: h };
}

function genRoof(S, seed = 11) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#5a2e1c'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const cols = 10, rows = 5, cw = S / cols, rh = S / rows;
  for (let col = 0; col < cols; col++) {
    const cap = col % 2 === 0; // cover tile (convex) vs pan
    for (let row = -1; row < rows + 1; row++) {
      const x = col * cw, y = row * rh + (cap ? rh * 0.5 : 0);
      const hue = r.range(10, 24), sat = r.range(48, 66), l = r.range(36, 50) - (cap ? 0 : 7);
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, hsl(hue, sat, l - 12)); gr.addColorStop(0.45, hsl(hue, sat, l + 6));
      gr.addColorStop(1, hsl(hue, sat, l - 14));
      g.fillStyle = gr; g.fillRect(x, y, cw, rh * 1.02);
      const sh = g.createLinearGradient(0, y, 0, y + rh);
      sh.addColorStop(0, 'rgba(255,230,200,0.08)'); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = sh; g.fillRect(x, y, cw, rh);
      const hgr = hg.createLinearGradient(x, 0, x + cw, 0);
      const top = cap ? 255 : 120;
      hgr.addColorStop(0, `rgb(${top * 0.35},${top * 0.35},${top * 0.35})`); hgr.addColorStop(0.5, `rgb(${top},${top},${top})`);
      hgr.addColorStop(1, `rgb(${top * 0.35},${top * 0.35},${top * 0.35})`);
      hg.fillStyle = hgr; hg.fillRect(x, y, cw, rh);
      const lip = hg.createLinearGradient(0, y, 0, y + rh);
      lip.addColorStop(0, 'rgba(0,0,0,0.3)'); lip.addColorStop(1, 'rgba(255,255,255,0.25)');
      hg.fillStyle = lip; hg.fillRect(x, y, cw, rh);
    }
  }
  // lichen and grime
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(150,150,110)', 0.18, 'source-over');
  overlay(g, S, M.mid.gray, 0.35, 'multiply', 2);
  overlay(g, S, M.fine.gray, 0.3, 'overlay', 3);
  for (let i = 0; i < S / 6; i++) { g.fillStyle = `rgba(${r.int(160, 210)},${r.int(170, 200)},${r.int(120, 150)},${r.range(0.2, 0.5)})`; g.beginPath(); g.arc(r.range(0, S), r.range(0, S), r.range(0.5, 2.2) * S / 512, 0, 7); g.fill(); }
  return { color: c, height: h };
}

function genStoneSmooth(S, seed = 13) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#ddd3c1'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#bbb'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const y = r.range(0, S), x = r.range(0, S), w = r.range(S * 0.1, S * 0.6), hh = r.range(1, S * 0.012);
    wrapDraw(S, x + w / 2, y, w, (cx, cy) => { g.fillStyle = `rgba(${r.int(120, 170)},${r.int(105, 150)},${r.int(85, 120)},${r.range(0.05, 0.18)})`; g.fillRect(cx - w / 2, cy, w, hh); });
  }
  for (let i = 0; i < S * 1.2; i++) {
    const x = r.range(0, S), y = r.range(0, S), rad = r.range(0.4, 2.2) * S / 512;
    g.fillStyle = 'rgba(90,75,55,0.5)'; g.beginPath(); g.ellipse(x, y, rad * 1.8, rad, 0, 0, 7); g.fill();
    hg.fillStyle = '#333'; hg.beginPath(); hg.ellipse(x, y, rad * 1.8, rad, 0, 0, 7); hg.fill();
  }
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(150,140,120)', 0.25, 'multiply');
  overlay(g, S, M.fine.gray, 0.2, 'overlay', 3);
  overlay(hg, S, M.mid.gray, 0.3, 'overlay', 2);
  return { color: c, height: h };
}

function genStoneBlocks(S, seed = 15, warm = true) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#8a7f6c'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const rows = 8, rh = S / rows, m = Math.max(1, rh * 0.06);
  for (let row = 0; row < rows; row++) {
    let x = r.range(-rh, 0);
    const y = row * rh;
    while (x < S) {
      const w = rh * r.range(1.3, 2.6);
      const ww = Math.min(w, S - x + rh * 3);
      const hue = warm ? r.range(30, 42) : r.range(25, 40), sat = r.range(10, 24), l = r.range(58, 74);
      wrapDraw(S, x + ww / 2, y + rh / 2, ww, (cx) => {
        const X = cx - ww / 2;
        const gr = g.createLinearGradient(X, y, X + ww, y + rh);
        gr.addColorStop(0, hsl(hue, sat, l + 5)); gr.addColorStop(1, hsl(hue, sat, l - 8));
        rrect(g, X + m, y + m, ww - m * 2, rh - m * 2, m * 2); g.fillStyle = gr; g.fill();
        rrect(hg, X + m, y + m, ww - m * 2, rh - m * 2, m * 3);
        const hr = hg.createLinearGradient(X, y, X, y + rh);
        hr.addColorStop(0, '#d8d8d8'); hr.addColorStop(0.5, '#fff'); hr.addColorStop(1, '#bbb');
        hg.fillStyle = hr; hg.fill();
      });
      x += w;
    }
  }
  overlay(g, S, M.mid.gray, 0.4, 'multiply', 2);
  overlay(g, S, M.fine.gray, 0.35, 'overlay', 3);
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(50,55,40)', 0.25, 'multiply');
  overlay(hg, S, M.fine.gray, 0.4, 'overlay', 3);
  return { color: c, height: h };
}

function genWood(S, seed = 17, horizontal = false) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  const planks = 4, pw = S / planks;
  for (let p = 0; p < planks; p++) {
    const hue = r.range(22, 32), l = r.range(34, 46);
    g.fillStyle = hsl(hue, 45, l); g.fillRect(p * pw, 0, pw, S);
    hg.fillStyle = '#ccc'; hg.fillRect(p * pw, 0, pw, S);
    for (let k = 0; k < 40; k++) {
      const x0 = p * pw + r.range(0, pw);
      g.strokeStyle = hsl(hue, 40, l + r.range(-14, 8), r.range(0.15, 0.4)); g.lineWidth = r.range(0.5, 2) * S / 512;
      hg.strokeStyle = `rgba(80,80,80,${r.range(0.2, 0.5)})`; hg.lineWidth = g.lineWidth;
      g.beginPath(); hg.beginPath();
      for (let y = 0; y <= S; y += S / 32) {
        const x = x0 + perlin2(x0 * 0.05, y / S * 3, 3) * pw * 0.08;
        y ? (g.lineTo(x, y), hg.lineTo(x, y)) : (g.moveTo(x, y), hg.moveTo(x, y));
      }
      g.stroke(); hg.stroke();
    }
    g.fillStyle = 'rgba(20,10,5,0.7)'; g.fillRect(p * pw, 0, Math.max(1, S / 256), S);
    hg.fillStyle = '#000'; hg.fillRect(p * pw, 0, Math.max(2, S / 200), S);
  }
  overlay(g, S, M.mid.gray, 0.25, 'multiply', 2);
  if (horizontal) {
    const rot = (cv) => { const [o, og] = mk(S); og.translate(S / 2, S / 2); og.rotate(Math.PI / 2); og.drawImage(cv, -S / 2, -S / 2); return o; };
    return { color: rot(c), height: rot(h) };
  }
  return { color: c, height: h };
}

function genShutter(S, seed = 19) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#e8e8e0'; g.fillRect(0, 0, S, S);
  const slats = 18, sh = S / slats;
  for (let i = 0; i < slats; i++) {
    const y = i * sh;
    const gr = g.createLinearGradient(0, y, 0, y + sh);
    gr.addColorStop(0, '#fbfbf4'); gr.addColorStop(0.7, '#d6d6cc'); gr.addColorStop(1, '#6c6c66');
    g.fillStyle = gr; g.fillRect(0, y, S, sh);
    const hr = hg.createLinearGradient(0, y, 0, y + sh);
    hr.addColorStop(0, '#fff'); hr.addColorStop(0.85, '#888'); hr.addColorStop(1, '#111');
    hg.fillStyle = hr; hg.fillRect(0, y, S, sh);
  }
  // frame stiles
  const fw = S * 0.08;
  g.fillStyle = '#efefe6'; g.fillRect(0, 0, fw, S); g.fillRect(S - fw, 0, fw, S);
  hg.fillStyle = '#fff'; hg.fillRect(0, 0, fw, S); hg.fillRect(S - fw, 0, fw, S);
  // chipped paint
  tintBlobs(g, S, M.fine.alpha, 2, 'rgb(90,70,50)', 0.18, 'multiply');
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(110,80,55,0.55)'; g.beginPath(); g.ellipse(r.range(0, S), r.range(0, S), r.range(1, 6) * S / 512, r.range(1, 3) * S / 512, r.range(0, 3), 0, 7); g.fill(); }
  overlay(g, S, M.mid.gray, 0.25, 'multiply', 1);
  return { color: c, height: h };
}

function genGrass(S, seed = 21) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#56733a'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#777'; hg.fillRect(0, 0, S, S);
  tintBlobs(g, S, M.coarse.alpha, 1, '#8f8f4a', 0.45);
  tintBlobs(g, S, M.mid.alpha, 2, '#3e5a2a', 0.45);
  tintBlobs(g, S, M.blotch.alpha, 1, '#7a6a45', 0.25);
  const n = Math.floor(S * S / 90);
  for (let i = 0; i < n; i++) {
    const x = r.range(0, S), y = r.range(0, S), len = r.range(2, 7) * S / 512, a = -Math.PI / 2 + r.range(-0.6, 0.6);
    const l = r.range(22, 52);
    g.strokeStyle = hsl(r.range(70, 100), r.range(30, 55), l, 0.7); g.lineWidth = Math.max(1, S / 700);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    hg.strokeStyle = `rgba(255,255,255,0.35)`; hg.lineWidth = g.lineWidth;
    hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); hg.stroke();
  }
  for (let i = 0; i < S / 3; i++) { g.fillStyle = hsl(30, 25, r.range(30, 45), 0.6); g.beginPath(); g.arc(r.range(0, S), r.range(0, S), r.range(0.5, 2) * S / 512, 0, 7); g.fill(); }
  overlay(g, S, M.fine.gray, 0.25, 'overlay', 2);
  return { color: c, height: h };
}

function genDirt(S, seed = 23) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#8a7152'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#666'; hg.fillRect(0, 0, S, S);
  tintBlobs(g, S, M.coarse.alpha, 1, '#6b553d', 0.5);
  tintBlobs(g, S, M.mid.alpha, 2, '#a88f6c', 0.35);
  for (let i = 0; i < S * 1.5; i++) {
    const x = r.range(0, S), y = r.range(0, S), rad = r.range(0.8, 4.5) * S / 512, l = r.range(35, 70);
    g.fillStyle = hsl(r.range(25, 40), r.range(5, 20), l); g.beginPath(); g.ellipse(x, y, rad, rad * r.range(0.6, 1), r.range(0, 3), 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.4, 0, 7); g.fill();
    const hr = hg.createRadialGradient(x, y, 0, x, y, rad);
    hr.addColorStop(0, '#fff'); hr.addColorStop(1, 'rgba(100,100,100,0)');
    hg.fillStyle = hr; hg.beginPath(); hg.arc(x, y, rad, 0, 7); hg.fill();
  }
  overlay(g, S, M.fine.gray, 0.35, 'overlay', 3);
  overlay(hg, S, M.mid.gray, 0.4, 'overlay', 2);
  return { color: c, height: h };
}

function genBark(S, seed = 25) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#6a5a4a'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#ccc'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x0 = r.range(0, S), w = r.range(1, 5) * S / 512;
    g.strokeStyle = `rgba(30,22,15,${r.range(0.4, 0.8)})`; g.lineWidth = w;
    hg.strokeStyle = 'rgba(0,0,0,0.8)'; hg.lineWidth = w * 1.4;
    g.beginPath(); hg.beginPath();
    for (let y = -10; y <= S + 10; y += S / 24) {
      const x = x0 + perlin2(x0 * 0.03, y / S * 4, 4) * S * 0.05;
      y > -10 ? (g.lineTo(x, y), hg.lineTo(x, y)) : (g.moveTo(x, y), hg.moveTo(x, y));
    }
    g.stroke(); hg.stroke();
  }
  tintBlobs(g, S, M.blotch.alpha, 1, 'rgb(120,130,100)', 0.25);
  overlay(g, S, M.fine.gray, 0.3, 'overlay', 2);
  return { color: c, height: h };
}

function genRock(S, seed = 27) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#8b8478'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#888'; hg.fillRect(0, 0, S, S);
  tintBlobs(g, S, M.coarse.alpha, 1, '#5e584f', 0.6);
  tintBlobs(g, S, M.mid.alpha, 2, '#b0a896', 0.4);
  tintBlobs(g, S, M.blotch.alpha, 2, '#a7a36c', 0.25);
  g.strokeStyle = 'rgba(40,35,30,0.5)';
  for (let k = 0; k < 10; k++) {
    let x = r.range(0, S), y = r.range(0, S), a = r.range(0, 7);
    g.lineWidth = r.range(1, 3) * S / 512; g.beginPath(); g.moveTo(x, y);
    hg.strokeStyle = 'rgba(0,0,0,0.7)'; hg.lineWidth = g.lineWidth * 2; hg.beginPath(); hg.moveTo(x, y);
    for (let s = 0; s < 18; s++) { a += r.range(-0.5, 0.5); x += Math.cos(a) * S * 0.02; y += Math.sin(a) * S * 0.02; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  overlay(g, S, M.fine.gray, 0.35, 'overlay', 3);
  overlay(hg, S, M.mid.gray, 0.6, 'overlay', 2);
  overlay(hg, S, M.fine.gray, 0.4, 'overlay', 3);
  return { color: c, height: h };
}

function genFoliage(S, seed = 39) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#c3cfb0'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#333'; hg.fillRect(0, 0, S, S);
  const n = Math.floor(S * S / 60);
  for (let i = 0; i < n; i++) {
    const x = r.range(0, S), y = r.range(0, S), len = r.range(4, 9) * S / 512, a = r.range(0, 6.28);
    const l = r.range(150, 255);
    wrapDraw(S, x, y, len, (cx, cy) => {
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = `rgb(${l * 0.9 | 0},${l | 0},${l * 0.8 | 0})`; g.beginPath(); g.ellipse(0, 0, len, len * 0.4, 0, 0, 7); g.fill(); g.restore();
      hg.save(); hg.translate(cx, cy); hg.rotate(a);
      const v = Math.floor(120 + r.range(0, 135)); hg.fillStyle = `rgb(${v},${v},${v})`; hg.beginPath(); hg.ellipse(0, 0, len, len * 0.4, 0, 0, 7); hg.fill(); hg.restore();
    });
  }
  overlay(g, S, M.mid.gray, 0.2, 'multiply', 2);
  return { color: c, height: h };
}

function genCamo(S, seed, palette) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = palette[0]; g.fillRect(0, 0, S, S);
  for (let layer = 1; layer < palette.length; layer++) {
    for (let i = 0; i < 22; i++) {
      const x = r.range(0, S), y = r.range(0, S);
      g.fillStyle = palette[layer];
      for (let k = 0; k < 6; k++) {
        const rad = r.range(0.03, 0.08) * S;
        const ox = x + r.range(-0.08, 0.08) * S, oy = y + r.range(-0.05, 0.05) * S;
        wrapDraw(S, ox, oy, rad * 1.6, (cx, cy) => { g.beginPath(); g.ellipse(cx, cy, rad * 1.6, rad, r.range(-0.4, 0.4), 0, 7); g.fill(); });
      }
    }
  }
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  const step = Math.max(2, S / 128);
  hg.globalAlpha = 0.5;
  for (let y = 0; y < S; y += step) { hg.fillStyle = (y / step) % 2 ? '#fff' : '#000'; hg.fillRect(0, y, S, step / 2); }
  for (let x = 0; x < S; x += step) { hg.fillStyle = (x / step) % 2 ? '#fff' : '#000'; hg.fillRect(x, 0, step / 2, S); }
  hg.globalAlpha = 1;
  overlay(g, S, M.fine.gray, 0.25, 'overlay', 4);
  overlay(g, S, M.mid.gray, 0.2, 'multiply', 2);
  return { color: c, height: h };
}

function genMetal(S, seed = 31) {
  const r = new RNG(seed), M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#8a8c90'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  overlay(g, S, M.fine.gray, 0.25, 'overlay', 4);
  overlay(g, S, M.mid.gray, 0.2, 'multiply', 2);
  for (let i = 0; i < S / 2; i++) {
    const x = r.range(0, S), y = r.range(0, S), a = r.range(0, Math.PI), l = r.range(4, 30) * S / 512;
    g.strokeStyle = `rgba(230,230,235,${r.range(0.08, 0.25)})`; g.lineWidth = Math.max(0.5, S / 1024);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  overlay(hg, S, M.fine.gray, 0.3, 'overlay', 4);
  return { color: c, height: h };
}

function genPolymer(S, seed = 33) {
  const r = new RNG(seed);
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  const n = S * S / 30;
  for (let i = 0; i < n; i++) {
    const x = r.range(0, S), y = r.range(0, S), v = r.int(0, 255);
    hg.fillStyle = `rgb(${v},${v},${v})`; hg.fillRect(x, y, 2, 2);
    g.fillStyle = `rgba(${v},${v},${v},0.12)`; g.fillRect(x, y, 2, 2);
  }
  return { color: c, height: h };
}

function genHay(S, seed = 35) {
  const r = new RNG(seed);
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#b49448'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#666'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < S * 3; i++) {
    const x = r.range(0, S), y = r.range(0, S), l = r.range(8, 40) * S / 512, a = r.range(-0.4, 0.4);
    g.strokeStyle = hsl(r.range(38, 50), r.range(40, 65), r.range(35, 70), 0.8); g.lineWidth = r.range(0.6, 2) * S / 512;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    hg.strokeStyle = `rgba(255,255,255,0.4)`; hg.lineWidth = g.lineWidth;
    hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); hg.stroke();
  }
  return { color: c, height: h };
}

function genFabric(S, seed = 37) {
  const M = buildMasks();
  const [c, g] = mk(S), [h, hg] = mk(S);
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  const step = Math.max(2, S / 160);
  hg.globalAlpha = 0.55;
  for (let y = 0; y < S; y += step) { hg.fillStyle = '#fff'; hg.fillRect(0, y, S, step * 0.45); }
  for (let x = 0; x < S; x += step) { hg.fillStyle = '#000'; hg.fillRect(x, 0, step * 0.45, S); }
  hg.globalAlpha = 1;
  overlay(g, S, M.fine.gray, 0.2, 'overlay', 4);
  overlay(g, S, M.mid.gray, 0.15, 'multiply', 2);
  return { color: c, height: h };
}

// ======================================================================
//  RGBA special textures (no tiling)
// ======================================================================

function genLeaves(S, seed, kind) {
  const r = new RNG(seed);
  const [c, g] = mk(S);
  g.clearRect(0, 0, S, S);
  if (kind === 'needle') {
    for (let b = 0; b < 46; b++) {
      const cx = r.range(0.12, 0.88) * S, cy = r.range(0.12, 0.88) * S;
      g.fillStyle = hsl(r.range(90, 110), 40, r.range(18, 26)); g.beginPath(); g.arc(cx, cy, S * 0.035, 0, 7); g.fill();
      for (let i = 0; i < 34; i++) {
        const a = r.range(0, Math.PI * 2), l = r.range(0.05, 0.12) * S;
        g.strokeStyle = hsl(r.range(85, 112), r.range(35, 55), r.range(26, 50)); g.lineWidth = Math.max(1.5, S / 170);
        g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + Math.cos(a + 0.3) * l * 0.5, cy + Math.sin(a + 0.3) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
      }
    }
  } else {
    const count = kind === 'olive' ? 110 : 70;
    for (let i = 0; i < count; i++) {
      const x = r.range(0.1, 0.9) * S, y = r.range(0.1, 0.9) * S;
      const len = (kind === 'olive' ? r.range(0.07, 0.11) : r.range(0.08, 0.15)) * S;
      const wid = len * (kind === 'olive' ? 0.22 : 0.45);
      const a = r.range(0, Math.PI * 2);
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0);
      const l = r.range(28, 52);
      const gr = g.createLinearGradient(0, -wid, 0, wid);
      gr.addColorStop(0, hsl(r.range(80, 110), r.range(35, 60), l + 10)); gr.addColorStop(1, hsl(r.range(80, 110), r.range(35, 60), l - 8));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(30,50,20,0.5)'; g.lineWidth = Math.max(0.5, S / 512);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.95, 0); g.stroke();
      g.restore();
    }
  }
  return c;
}

function genWindowAtlas(S, seed = 41) {
  const r = new RNG(seed);
  const [c, g] = mk(S);
  const half = S / 2;
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * half, oy = Math.floor(v / 2) * half;
    const gr = g.createLinearGradient(ox, oy, ox, oy + half);
    gr.addColorStop(0, '#2a2f36'); gr.addColorStop(1, '#0d0f12');
    g.fillStyle = gr; g.fillRect(ox, oy, half, half);
    // dim interior hints
    g.fillStyle = 'rgba(120,100,80,0.25)'; g.fillRect(ox + half * 0.2, oy + half * 0.55, half * 0.6, half * 0.3);
    if (v !== 3) {
      const cc = r.pick(['#c9b48a', '#a33a2a', '#e8e2d0', '#3c5a7a', '#7b8a5a']);
      const cw = half * r.range(0.18, 0.32);
      for (const side of [0, 1]) {
        const x = side ? ox + half - cw : ox;
        const cg = g.createLinearGradient(x, 0, x + cw, 0);
        cg.addColorStop(0, cc); cg.addColorStop(0.5, 'rgba(0,0,0,0.25)'); cg.addColorStop(1, cc);
        g.fillStyle = cg; g.fillRect(x, oy, cw, half);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let k = 1; k < 5; k++) g.fillRect(x + (cw / 5) * k, oy, 1.5, half);
      }
    } else {
      // closed blinds
      for (let y = oy; y < oy + half; y += half / 24) { g.fillStyle = '#b8b0a0'; g.fillRect(ox, y, half, half / 40); }
    }
    // muntins
    g.fillStyle = '#e9e4d8';
    g.fillRect(ox + half / 2 - half * 0.025, oy, half * 0.05, half);
    g.fillRect(ox, oy + half * 0.4, half, half * 0.04);
    // reflection streak
    const rg = g.createLinearGradient(ox, oy, ox + half, oy + half);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.0)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.18)'); rg.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(ox, oy, half, half);
  }
  return c;
}

function genShopAtlas(S, seed = 43) {
  const r = new RNG(seed);
  const [c, g] = mk(S);
  const half = S / 2;
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * half, oy = Math.floor(v / 2) * half;
    const wall = r.pick(['#d9b98a', '#c9a77a', '#e0cfa8', '#b9c4a8']);
    const gr = g.createLinearGradient(ox, oy, ox, oy + half);
    gr.addColorStop(0, '#fff3d6'); gr.addColorStop(0.3, wall); gr.addColorStop(1, '#3a2a1c');
    g.fillStyle = gr; g.fillRect(ox, oy, half, half);
    // shelves with goods
    for (let s = 0; s < 3; s++) {
      const y = oy + half * (0.25 + s * 0.17);
      g.fillStyle = '#5a3a22'; g.fillRect(ox + half * 0.05, y + half * 0.11, half * 0.9, half * 0.02);
      for (let x = ox + half * 0.07; x < ox + half * 0.92; x += half * r.range(0.04, 0.08)) {
        g.fillStyle = hsl(r.range(0, 360), r.range(40, 80), r.range(40, 65));
        const hh = half * r.range(0.04, 0.1);
        g.fillRect(x, y + half * 0.11 - hh, half * 0.035, hh);
      }
    }
    // counter
    g.fillStyle = '#6b4a2e'; g.fillRect(ox + half * 0.15, oy + half * 0.78, half * 0.7, half * 0.22);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(ox + half * 0.15, oy + half * 0.78, half * 0.7, half * 0.015);
    // window lettering frame
    g.strokeStyle = '#2a1a10'; g.lineWidth = half * 0.03; g.strokeRect(ox + 2, oy + 2, half - 4, half - 4);
    const rg = g.createLinearGradient(ox, oy, ox + half, oy + half);
    rg.addColorStop(0.35, 'rgba(255,255,255,0)'); rg.addColorStop(0.42, 'rgba(255,255,255,0.22)'); rg.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(ox, oy, half, half);
  }
  return c;
}

function genAwningAtlas(S) {
  const [c, g] = mk(S);
  const schemes = [['#b3261e', '#f3ead8'], ['#2f6b3a', '#efe6cf'], ['#1f4f86', '#f1f1ea'], ['#c9781a', '#f5ecd5']];
  const rowH = S / 4;
  schemes.forEach((sc, i) => {
    const oy = i * rowH;
    const stripes = 12, sw = S / stripes;
    for (let k = 0; k < stripes; k++) { g.fillStyle = sc[k % 2]; g.fillRect(k * sw, oy, sw, rowH * 0.78); }
    const sh = g.createLinearGradient(0, oy, 0, oy + rowH * 0.78);
    sh.addColorStop(0, 'rgba(0,0,0,0.15)'); sh.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = sh; g.fillRect(0, oy, S, rowH * 0.78);
    // scalloped valance
    const sc2 = S / 16;
    for (let k = 0; k < 16; k++) {
      g.fillStyle = sc[k % 2 ? 1 : 0];
      g.beginPath(); g.moveTo(k * sc2, oy + rowH * 0.78);
      g.lineTo(k * sc2 + sc2, oy + rowH * 0.78);
      g.lineTo(k * sc2 + sc2, oy + rowH * 0.86);
      g.arc(k * sc2 + sc2 / 2, oy + rowH * 0.86, sc2 / 2, 0, Math.PI);
      g.closePath(); g.fill();
    }
  });
  return c;
}

function genRailing(S) {
  const [c, g] = mk(S, S / 2);
  const H = S / 2;
  g.clearRect(0, 0, S, H);
  g.strokeStyle = '#1d1d1f'; g.fillStyle = '#1d1d1f';
  g.lineWidth = H * 0.06;
  g.beginPath(); g.moveTo(0, H * 0.06); g.lineTo(S, H * 0.06); g.stroke();
  g.beginPath(); g.moveTo(0, H * 0.92); g.lineTo(S, H * 0.92); g.stroke();
  const n = 10;
  g.lineWidth = H * 0.025;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (S / n);
    g.beginPath(); g.moveTo(x, H * 0.06); g.lineTo(x, H * 0.92); g.stroke();
    g.beginPath(); g.arc(x + S / n / 2, H * 0.5, H * 0.08, 0, Math.PI * 2); g.stroke();
  }
  g.lineWidth = H * 0.02;
  g.beginPath(); g.moveTo(0, H * 0.2); g.lineTo(S, H * 0.2); g.stroke();
  return c;
}

// --- signs / plaques atlas (2 columns x 16 rows of 1024x128 cells) ---
export const SIGNS = [
  { text: 'Pizzeria Rush B', bg: '#1f3d2b', fg: '#f3e6c4', font: "italic 700 78px 'Playfair Display', Georgia, serif", icon: 'pizza' },
  { text: 'Gelateria Eco Round', bg: '#f3c6cf', fg: '#7a2340', font: "64px 'Pacifico', cursive", icon: 'cone' },
  { text: 'Caffè Clutch', bg: '#16120e', fg: '#e0b65a', font: "700 80px 'Playfair Display', Georgia, serif", icon: 'cup' },
  { text: 'FARMACIA', bg: '#0f6b3c', fg: '#ffffff', font: "700 84px 'Oswald', Arial, sans-serif", icon: 'cross' },
  { text: 'BANCA DEL DEFUSE', bg: 'stone', fg: '#3a3026', font: "700 70px 'Cinzel', Georgia, serif" },
  { text: 'Trattoria da Nonna', bg: 'wood', fg: '#f5ead0', font: "italic 700 74px 'Playfair Display', Georgia, serif" },
  { text: 'HOTEL INFERNO ★★★', bg: '#14233f', fg: '#e8c66a', font: "700 70px 'Cinzel', Georgia, serif" },
  { text: 'Panetteria Headshot', bg: '#efe0bd', fg: '#5a2f12', font: "italic 700 70px 'Playfair Display', Georgia, serif", icon: 'bread' },
  { text: 'Macelleria Vegetariana', bg: '#a41d1d', fg: '#fff6e8', font: "700 62px 'Oswald', Arial, sans-serif" },
  { text: 'Libreria Spray & Pray', bg: '#4a1426', fg: '#f1d9a6', font: "italic 700 66px 'Playfair Display', Georgia, serif" },
  { text: 'Barbiere Flick', bg: '#f4f1ea', fg: '#1c2f6b', font: "700 76px 'Oswald', Arial, sans-serif", icon: 'barber' },
  { text: 'Ferramenta 1-Tap', bg: '#2b2b2b', fg: '#ffd23a', font: "700 78px 'Oswald', Arial, sans-serif" },
  { text: 'Salumeria Peek-a-Boo', bg: 'wood', fg: '#fff2cf', font: "italic 700 66px 'Playfair Display', Georgia, serif" },
  { text: 'Pasticceria Ace', bg: '#f7e9ef', fg: '#8c3b5a', font: "60px 'Pacifico', cursive" },
  { text: 'Lavanderia Rinse & Respawn', bg: '#d8eef3', fg: '#14506a', font: "700 56px 'Oswald', Arial, sans-serif" },
  { text: 'Ristorante Wallbang', bg: '#2d1a12', fg: '#f0c674', font: "italic 700 70px 'Playfair Display', Georgia, serif" },
  // plaques (column 2)
  { text: 'VIA DEL HEADSHOT', bg: 'marble', fg: '#222', font: "700 62px 'Cinzel', Georgia, serif" },
  { text: 'PIAZZA DELLA CONTRO', bg: 'marble', fg: '#222', font: "700 56px 'Cinzel', Georgia, serif" },
  { text: 'VICOLO RUSH B', bg: 'marble', fg: '#222', font: "700 64px 'Cinzel', Georgia, serif" },
  { text: 'VIA ECO ROUND', bg: 'marble', fg: '#222', font: "700 64px 'Cinzel', Georgia, serif" },
  { text: 'EDICOLA', bg: '#1b3a6b', fg: '#fff', font: "700 84px 'Oswald', Arial, sans-serif" },
  { text: 'STRIKE COUNTER 1', bg: '#111', fg: '#ff9a1f', font: "88px 'Bebas Neue', Impact, sans-serif" },
  { text: 'DE_BELLAVISTA', bg: '#c9b48a', fg: '#2a1d10', font: "84px 'Bebas Neue', Impact, sans-serif" },
  { text: 'PORTA DEL MID', bg: 'stone', fg: '#2f271d', font: "700 66px 'Cinzel', Georgia, serif" },
  { text: 'TABERNA DEL CAMPER', bg: 'wood', fg: '#fbeccb', font: "700 60px 'Cinzel', Georgia, serif" },
  { text: 'VIETATO CAMPEGGIARE', bg: '#f4f4f0', fg: '#b01818', font: "700 58px 'Oswald', Arial, sans-serif" },
  { text: 'CASALE PEEKABOO', bg: 'wood', fg: '#fff1d2', font: "700 64px 'Cinzel', Georgia, serif" },
  { text: 'VIGNA SPAGHETTI', bg: 'wood', fg: '#fff1d2', font: "700 64px 'Cinzel', Georgia, serif" },
  { text: 'CHIESA DI SAN RESPAWN', bg: 'stone', fg: '#2f271d', font: "700 52px 'Cinzel', Georgia, serif" },
  { text: 'NO GORE · SOLO GELATO', bg: '#ffef9a', fg: '#7a3a00', font: "700 58px 'Oswald', Arial, sans-serif" },
  { text: 'MERCATO', bg: '#7d1f1f', fg: '#ffe9b8', font: "700 84px 'Oswald', Arial, sans-serif" },
  { text: 'VIA ROMA', bg: 'marble', fg: '#222', font: "700 70px 'Cinzel', Georgia, serif" },
];

function drawIcon(g, kind, x, y, s, color) {
  g.save(); g.translate(x, y); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = s * 0.08;
  if (kind === 'cross') { g.fillRect(-s * 0.15, -s * 0.45, s * 0.3, s * 0.9); g.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.3); }
  else if (kind === 'pizza') { g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(s * 0.4, s * 0.4); g.lineTo(-s * 0.4, s * 0.4); g.closePath(); g.fill(); g.fillStyle = '#b3261e'; for (const [a, b] of [[0, 0], [-0.15, 0.25], [0.15, 0.22]]) { g.beginPath(); g.arc(a * s, b * s, s * 0.07, 0, 7); g.fill(); } }
  else if (kind === 'cone') { g.beginPath(); g.moveTo(-s * 0.25, -s * 0.05); g.lineTo(s * 0.25, -s * 0.05); g.lineTo(0, s * 0.45); g.closePath(); g.fill(); g.beginPath(); g.arc(0, -s * 0.15, s * 0.24, 0, 7); g.fill(); }
  else if (kind === 'cup') { g.fillRect(-s * 0.3, -s * 0.2, s * 0.5, s * 0.45); g.beginPath(); g.arc(s * 0.25, 0, s * 0.13, -1.5, 1.5); g.stroke(); g.fillRect(-s * 0.42, s * 0.28, s * 0.74, s * 0.06); }
  else if (kind === 'bread') { g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.22, -0.3, 0, 7); g.fill(); }
  else if (kind === 'barber') { g.fillStyle = '#fff'; g.fillRect(-s * 0.15, -s * 0.45, s * 0.3, s * 0.9); g.fillStyle = '#b3261e'; for (let i = -3; i < 3; i++) { g.save(); g.beginPath(); g.rect(-s * 0.15, -s * 0.45, s * 0.3, s * 0.9); g.clip(); g.translate(0, i * s * 0.18); g.rotate(-0.6); g.fillRect(-s * 0.4, -s * 0.03, s * 0.8, s * 0.06); g.restore(); } }
  g.restore();
}

function genSignAtlas(woodTex, stoneTex) {
  const W = 2048, H = 2048, cw = 1024, ch = 128;
  const [c, g] = mk(W, H);
  SIGNS.forEach((s, i) => {
    const col = Math.floor(i / 16), row = i % 16;
    const x = col * cw, y = row * ch;
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    if (s.bg === 'wood') { g.drawImage(woodTex, 0, 0, woodTex.width, woodTex.height / 8, x, y, cw, ch); g.fillStyle = 'rgba(60,30,10,0.45)'; g.fillRect(x, y, cw, ch); }
    else if (s.bg === 'stone') { g.drawImage(stoneTex, 0, 0, stoneTex.width, stoneTex.height / 6, x, y, cw, ch); }
    else if (s.bg === 'marble') { g.fillStyle = '#efece6'; g.fillRect(x, y, cw, ch); g.strokeStyle = 'rgba(120,120,130,0.25)'; for (let k = 0; k < 10; k++) { g.lineWidth = 1 + k % 3; g.beginPath(); g.moveTo(x + k * 100, y); g.bezierCurveTo(x + k * 100 + 40, y + 50, x + k * 100 - 30, y + 80, x + k * 100 + 60, y + ch); g.stroke(); } }
    else { g.fillStyle = s.bg; g.fillRect(x, y, cw, ch); const sh = g.createLinearGradient(0, y, 0, y + ch); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = sh; g.fillRect(x, y, cw, ch); }
    // border
    g.strokeStyle = s.bg === 'marble' ? '#8d8a82' : 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeRect(x + 10, y + 10, cw - 20, ch - 20);
    g.fillStyle = s.fg; g.font = s.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    let tx = x + cw / 2;
    if (s.icon) { drawIcon(g, s.icon, x + 80, y + ch / 2, 80, s.fg); drawIcon(g, s.icon, x + cw - 80, y + ch / 2, 80, s.fg); }
    const maxW = s.icon ? cw - 220 : cw - 60;
    let m = g.measureText(s.text).width;
    if (m > maxW) { g.save(); g.translate(tx, y + ch / 2 + 4); g.scale(maxW / m, 1); g.fillText(s.text, 0, 0); g.restore(); }
    else g.fillText(s.text, tx, y + ch / 2 + 4);
    // weathering
    g.globalAlpha = 0.12; g.fillStyle = '#000';
    for (let k = 0; k < 40; k++) g.fillRect(x + Math.random() * cw, y + Math.random() * ch, 2 + Math.random() * 10, 1 + Math.random() * 3);
    g.globalAlpha = 1;
    g.restore();
  });
  return c;
}
export function signUV(index) {
  const col = Math.floor(index / 16), row = index % 16;
  // canvas y down, texture flipY -> v = 1 - y/H
  return { u0: col * 0.5, u1: col * 0.5 + 0.5, v0: 1 - (row + 1) / 16, v1: 1 - row / 16 };
}

export const GHOST_TEXTS = ['VINI · OLII · SAPONI', 'TRATTORIA', 'PANE E LATTE', 'GARAGE 1951', 'GG WP', 'RUSH B NON STOP'];
function genGhostAtlas() {
  const W = 1024, H = 1024, ch = H / 8;
  const [c, g] = mk(W, H);
  g.clearRect(0, 0, W, H);
  GHOST_TEXTS.forEach((t, i) => {
    const y = i * ch;
    g.fillStyle = i % 2 ? 'rgba(120,40,30,0.55)' : 'rgba(40,40,40,0.5)';
    g.font = "700 92px 'Oswald', Arial, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, W / 2, y + ch / 2);
    // erode
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 500; k++) { g.globalAlpha = Math.random() * 0.7; g.fillRect(Math.random() * W, y + Math.random() * ch, 3 + Math.random() * 14, 2 + Math.random() * 6); }
    g.restore();
  });
  return c;
}
export function ghostUV(i) { return { u0: 0, u1: 1, v0: 1 - (i + 1) / 8, v1: 1 - i / 8 }; }

function genPosterAtlas() {
  const W = 1024, H = 512, pw = 256;
  const [c, g] = mk(W, H);
  const posters = [
    () => { // game poster
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff8a00'); gr.addColorStop(1, '#3a1200');
      g.fillStyle = gr; g.fillRect(0, 0, pw, H);
      g.fillStyle = '#111'; g.beginPath(); g.arc(pw / 2, 230, 70, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(pw / 2, 230, 50, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(pw / 2, 160); g.lineTo(pw / 2, 300); g.moveTo(pw / 2 - 70, 230); g.lineTo(pw / 2 + 70, 230); g.stroke();
      g.fillStyle = '#fff'; g.font = "64px 'Bebas Neue', Impact"; g.textAlign = 'center'; g.fillText('STRIKE', pw / 2, 70); g.fillText('COUNTER 1', pw / 2, 125);
      g.font = "22px 'Oswald', Arial"; g.fillText('NOW WITH 0% GORE', pw / 2, 360); g.fillText('100% PASTA', pw / 2, 390);
    },
    () => { // opera
      g.fillStyle = '#1b1530'; g.fillRect(0, 0, pw, H);
      g.fillStyle = '#e8c66a'; g.font = "700 44px 'Cinzel', Georgia"; g.textAlign = 'center'; g.fillText('OPERA', pw / 2, 80);
      g.font = "italic 700 28px 'Playfair Display', Georgia"; g.fillText('La Traviata', pw / 2, 125); g.fillText('dello Spray', pw / 2, 158);
      g.beginPath(); g.arc(pw / 2, 290, 70, 0, 7); g.fillStyle = '#7a1f3a'; g.fill();
      g.fillStyle = '#e8c66a'; g.font = "22px 'Oswald', Arial"; g.fillText('TEATRO COMUNALE · ORE 21', pw / 2, 420);
    },
    () => { // gelato fest
      g.fillStyle = '#9ee3dc'; g.fillRect(0, 0, pw, H);
      g.fillStyle = '#ff5f8f'; g.font = "46px 'Pacifico', cursive"; g.textAlign = 'center'; g.fillText('Festa del', pw / 2, 80); g.fillText('Gelato', pw / 2, 140);
      for (let i = 0; i < 3; i++) { g.fillStyle = ['#ff8fb1', '#fff2a8', '#a8e6a1'][i]; g.beginPath(); g.arc(pw / 2, 300 - i * 45, 45, 0, 7); g.fill(); }
      g.fillStyle = '#c88a4a'; g.beginPath(); g.moveTo(pw / 2 - 45, 320); g.lineTo(pw / 2 + 45, 320); g.lineTo(pw / 2, 460); g.fill();
    },
    () => { // wanted (silly)
      g.fillStyle = '#e9dcbc'; g.fillRect(0, 0, pw, H);
      g.fillStyle = '#3b2a1a'; g.font = "700 50px 'Oswald', Arial"; g.textAlign = 'center'; g.fillText('CERCASI', pw / 2, 70);
      g.font = "22px 'Oswald', Arial"; g.fillText('CHI HA LASCIATO', pw / 2, 110); g.fillText('LA BOMBA IN PIAZZA?', pw / 2, 138);
      g.fillStyle = '#5a4430'; g.beginPath(); g.arc(pw / 2, 260, 60, 0, 7); g.fill(); g.fillRect(pw / 2 - 90, 320, 180, 120);
      g.fillStyle = '#3b2a1a'; g.font = "700 30px 'Oswald', Arial"; g.fillText('RICOMPENSA: 1 PIZZA', pw / 2, 480);
    },
  ];
  posters.forEach((fn, i) => { g.save(); g.translate(i * pw, 0); g.beginPath(); g.rect(0, 0, pw, H); g.clip(); fn(); g.globalAlpha = 0.15; g.fillStyle = '#5a4a30'; for (let k = 0; k < 60; k++) g.fillRect(Math.random() * pw, Math.random() * H, 2 + Math.random() * 20, 1 + Math.random() * 4); g.restore(); });
  return c;
}

function genClock() {
  const S = 512; const [c, g] = mk(S);
  g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.48, 0, 7); g.fill();
  g.strokeStyle = '#2a2418'; g.lineWidth = 12; g.stroke();
  g.fillStyle = '#2a2418'; g.font = "700 54px 'Cinzel', Georgia"; g.textAlign = 'center'; g.textBaseline = 'middle';
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => { const a = i / 12 * Math.PI * 2 - Math.PI / 2; g.save(); g.translate(S / 2 + Math.cos(a) * S * 0.37, S / 2 + Math.sin(a) * S * 0.37); g.font = "700 40px 'Cinzel', Georgia"; g.fillText(n, 0, 0); g.restore(); });
  g.lineCap = 'round';
  g.lineWidth = 14; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(-2.2) * S * 0.22, S / 2 + Math.sin(-2.2) * S * 0.22); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(-0.5) * S * 0.33, S / 2 + Math.sin(-0.5) * S * 0.33); g.stroke();
  return c;
}

function genRose() {
  const S = 512; const [c, g] = mk(S);
  g.fillStyle = '#1a1410'; g.fillRect(0, 0, S, S);
  const cx = S / 2;
  const cols = ['#2a5bd7', '#d72a3a', '#e8b82a', '#2aa75a', '#8a2ad7'];
  for (let ring = 5; ring >= 1; ring--) {
    const rr = ring / 5 * S * 0.47, n = ring * 6;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      g.fillStyle = cols[(i + ring) % cols.length];
      g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, rr, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = '#1a1410'; g.lineWidth = 6; g.stroke();
    }
  }
  g.fillStyle = '#e8d8a8'; g.beginPath(); g.arc(cx, cx, S * 0.06, 0, 7); g.fill();
  return c;
}

function genParticle(kind) {
  const S = 128; const [c, g] = mk(S);
  if (kind === 'smoke') {
    for (let i = 0; i < 14; i++) {
      const x = S / 2 + (Math.random() - 0.5) * S * 0.35, y = S / 2 + (Math.random() - 0.5) * S * 0.35, rad = S * (0.18 + Math.random() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  } else if (kind === 'flash') {
    g.translate(S / 2, S / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr;
    for (let i = 0; i < 7; i++) { g.rotate(Math.PI * 2 / 7); g.beginPath(); g.moveTo(0, -S * 0.08); g.lineTo(S * 0.5, 0); g.lineTo(0, S * 0.08); g.fill(); }
    g.beginPath(); g.arc(0, 0, S * 0.22, 0, 7); g.fill();
  } else if (kind === 'spark') {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.2, 'rgba(255,200,80,0.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === 'square') { // minecraft-ish poof particle
    g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(S * 0.2, S * 0.2, S * 0.6, S * 0.6);
    g.fillStyle = 'rgba(200,200,200,1)'; g.fillRect(S * 0.2, S * 0.5, S * 0.3, S * 0.3); g.fillRect(S * 0.5, S * 0.2, S * 0.3, S * 0.15);
  } else if (kind === 'hole') {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.18, 'rgba(20,16,12,0.95)'); gr.addColorStop(0.3, 'rgba(60,50,40,0.6)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(30,25,20,0.6)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = Math.random() * 7; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.35, S / 2 + Math.sin(a) * S * 0.35); g.stroke(); }
  }
  return c;
}

function genWaterNormal(S) {
  const [h, hg] = mk(S);
  const img = hg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 0.5 + 0.5 * fbm2(x / S * 6, y / S * 6, 4, 2, 0.5, 6);
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  hg.putImageData(img, 0, 0);
  return normalFromHeight(h, 3);
}

// ======================================================================

const WORLD_KEYS = ['cobble', 'pavers', 'plaster', 'brick', 'roof', 'stone', 'blocks', 'wood', 'shutter', 'grass', 'dirt', 'bark', 'rock', 'hay', 'foliage', 'leafBroad', 'leafOlive', 'leafNeedle', 'windows', 'shops', 'awning'];

export class TextureLib {
  constructor(renderer) {
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.t = {};
  }

  _tex(canvas, srgb, aniso, repeat = true) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(aniso, this.maxAniso);
    t.needsUpdate = true;
    // once the texture is on the GPU, release the big canvas backing store
    // (procedural canvases otherwise double the memory use - deadly on iPads)
    t.onUpdate = () => { t.onUpdate = null; const c = t.image; if (c && c.width > 1) { setTimeout(() => { c.width = 1; c.height = 1; }, 0); } };
    return t;
  }
  _surface(gen, size, aniso, strength) {
    const { color, height } = gen(size);
    return { map: this._tex(color, true, aniso), normalMap: this._tex(normalFromHeight(height, strength), false, aniso), _canvas: color };
  }

  build(texSize, aniso, worldOnly = false) {
    const S = texSize, s2 = Math.max(128, S / 2);
    const t = this.t;
    const old = WORLD_KEYS.map(k => t[k]).filter(Boolean);
    // ---- map surfaces (rebuilt when texture quality changes) ----
    t.cobble = this._surface(genCobble, S, aniso, 3.2);
    t.pavers = this._surface(genPavers, S, aniso, 2.2);
    t.plaster = this._surface(genPlaster, S, aniso, 1.6);
    t.brick = this._surface(genBrick, S, aniso, 2.4);
    t.roof = this._surface(genRoof, S, aniso, 3.0);
    t.stone = this._surface(genStoneSmooth, s2, aniso, 1.5);
    t.blocks = this._surface((n) => genStoneBlocks(n, 15), S, aniso, 2.8);
    t.wood = this._surface((n) => genWood(n, 17), s2, aniso, 1.6);
    t.shutter = this._surface(genShutter, s2, aniso, 2.5);
    t.grass = this._surface(genGrass, S, aniso, 1.4);
    t.dirt = this._surface(genDirt, S, aniso, 2.2);
    t.bark = this._surface(genBark, s2, aniso, 2.6);
    t.rock = this._surface(genRock, s2, aniso, 2.8);
    t.hay = this._surface(genHay, s2, aniso, 1.8);
    t.foliage = this._surface(genFoliage, s2, aniso, 2.2);
    t.foliage.map.repeat.set(4, 6); t.foliage.normalMap.repeat.set(4, 6);
    const leafS = Math.min(1024, Math.max(256, S));
    t.leafBroad = this._tex(genLeaves(leafS, 61, 'broad'), true, aniso, false);
    t.leafOlive = this._tex(genLeaves(leafS, 62, 'olive'), true, aniso, false);
    t.leafNeedle = this._tex(genLeaves(leafS, 63, 'needle'), true, aniso, false);
    const atlS = Math.min(1024, Math.max(256, S));
    t.windows = this._tex(genWindowAtlas(atlS), true, aniso, false);
    t.shops = this._tex(genShopAtlas(atlS), true, aniso, false);
    t.awning = this._tex(genAwningAtlas(Math.min(1024, Math.max(512, S))), true, aniso, false);
    for (const o of old) { if (o.isTexture) o.dispose(); else { o.map && o.map.dispose(); o.normalMap && o.normalMap.dispose(); } }
    if (worldOnly) return t;
    // ---- fixed set (characters, guns, signage, particles) ----
    const F = 512;
    t.woodH = this._surface((n) => genWood(n, 18, true), F, aniso, 1.6);
    t.camoDesert = this._surface((n) => genCamo(n, 51, ['#b59b72', '#8f7550', '#d2bf96', '#6b5a40']), F, aniso, 1.2);
    t.camoUrban = this._surface((n) => genCamo(n, 53, ['#5f6b7a', '#3d4654', '#8994a3', '#2a303a']), F, aniso, 1.2);
    t.metal = this._surface(genMetal, F, aniso, 0.8);
    t.polymer = this._surface(genPolymer, 256, aniso, 1.5);
    t.fabric = this._surface(genFabric, 256, aniso, 1.2);
    t.railing = this._tex(genRailing(512), true, aniso, true);
    t.signs = this._tex(genSignAtlas(t.woodH._canvas, t.blocks._canvas), true, aniso, false);
    t.ghost = this._tex(genGhostAtlas(), true, aniso, false);
    t.posters = this._tex(genPosterAtlas(), true, aniso, false);
    t.clock = this._tex(genClock(), true, aniso, false);
    t.rose = this._tex(genRose(), true, aniso, false);
    t.waterNormal = this._tex(genWaterNormal(256), false, aniso, true);
    t.smoke = this._tex(genParticle('smoke'), true, 1, false);
    t.flash = this._tex(genParticle('flash'), true, 1, false);
    t.spark = this._tex(genParticle('spark'), true, 1, false);
    t.square = this._tex(genParticle('square'), true, 1, false);
    t.hole = this._tex(genParticle('hole'), true, 1, false);
    return t;
  }

  dispose() {
    for (const k in this.t) {
      const v = this.t[k];
      if (v && v.isTexture) v.dispose();
      else if (v) { v.map && v.map.dispose(); v.normalMap && v.normalMap.dispose(); }
      delete this.t[k];
    }
  }
}
