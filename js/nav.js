// Navigation grid built from the collision world: walkability, ground height,
// cover cells (walkable cells hugging tall obstacles), A* + string pulling.
export class NavGrid {
  constructor(col, bounds, cell = 1) {
    this.col = col; this.cell = cell;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.w = Math.ceil((bounds.x1 - bounds.x0) / cell); this.h = Math.ceil((bounds.z1 - bounds.z0) / cell);
    const N = this.w * this.h;
    this.walk = new Uint8Array(N); this.gy = new Float32Array(N); this.blockH = new Float32Array(N); this.cover = new Uint8Array(N);
    this._build();
    // A* buffers
    this.g = new Float32Array(N); this.f = new Float32Array(N); this.parent = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N); this.searchId = 1;
    this.heap = new Int32Array(N + 1);
  }
  idx(ix, iz) { return iz * this.w + ix; }
  toCell(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
  center(i) { const ix = i % this.w, iz = (i / this.w) | 0; return [this.x0 + (ix + 0.5) * this.cell, this.z0 + (iz + 0.5) * this.cell]; }

  _build() {
    const col = this.col, r = 0.38, q = [];
    for (let iz = 0; iz < this.h; iz++) for (let ix = 0; ix < this.w; ix++) {
      const x = this.x0 + (ix + 0.5) * this.cell, z = this.z0 + (iz + 0.5) * this.cell;
      const tg = col.terrainHeight(x, z);
      let ground = tg, blocked = false, bh = 0;
      col.query(x - r - 0.5, z - r - 0.5, x + r + 0.5, z + r + 0.5, q);
      for (const c of q) {
        if (!c.solid) continue;
        if (c.y1 < tg + 0.05 || c.y0 > tg + 1.75) continue;
        let overlap, near;
        if (c.kind === 0) {
          overlap = x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1;
          near = x + r + 0.5 > c.x0 && x - r - 0.5 < c.x1 && z + r + 0.5 > c.z0 && z - r - 0.5 < c.z1;
        } else {
          const d = Math.hypot(x - c.cx, z - c.cz);
          overlap = d < r + c.r; near = d < r + c.r + 0.5;
        }
        if (overlap) {
          if (c.y1 <= tg + 0.46 && c.y1 - tg < 0.46) ground = Math.max(ground, c.y1);
          else blocked = true;
        }
        if (near && c.y1 > tg + 0.46) bh = Math.max(bh, c.y1 - tg);
      }
      // steep terrain
      const s = Math.abs(col.terrainHeight(x + 0.7, z) - col.terrainHeight(x - 0.7, z)) + Math.abs(col.terrainHeight(x, z + 0.7) - col.terrainHeight(x, z - 0.7));
      if (s > 1.5) blocked = true;
      const i = this.idx(ix, iz);
      this.walk[i] = blocked ? 0 : 1; this.gy[i] = ground; this.blockH[i] = bh;
    }
    for (let iz = 1; iz < this.h - 1; iz++) for (let ix = 1; ix < this.w - 1; ix++) {
      const i = this.idx(ix, iz);
      if (this.walk[i] && this.blockH[i] >= 1.05) this.cover[i] = 1;
    }
  }

  walkableAt(x, z) { const [ix, iz] = this.toCell(x, z); if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return false; return !!this.walk[this.idx(ix, iz)]; }

  nearestWalkable(x, z, maxR = 8) {
    let [ix, iz] = this.toCell(x, z);
    ix = Math.max(0, Math.min(this.w - 1, ix)); iz = Math.max(0, Math.min(this.h - 1, iz));
    if (this.walk[this.idx(ix, iz)]) return this.idx(ix, iz);
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.w || jz >= this.h) continue;
        const j = this.idx(jx, jz); if (this.walk[j]) return j;
      }
    }
    return -1;
  }

  // grid line walk check (for path smoothing)
  clearLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!this.walkableAt(x, z)) return false;
      // also check slight offsets so we don't clip corners
      const ox = -(bz - az) / d * 0.3, oz = (bx - ax) / d * 0.3;
      if (!this.walkableAt(x + ox, z + oz) || !this.walkableAt(x - ox, z - oz)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz, maxIter = 24000) {
    const s = this.nearestWalkable(sx, sz, 4), t = this.nearestWalkable(tx, tz, 10);
    if (s < 0 || t < 0) return null;
    if (s === t) return [[tx, tz]];
    const id = ++this.searchId, W = this.w;
    const [txc, tzc] = [t % W, (t / W) | 0];
    const H = (i) => { const dx = Math.abs((i % W) - txc), dz = Math.abs(((i / W) | 0) - tzc); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    let hn = 0; const heap = this.heap, f = this.f, g = this.g;
    const push = (i) => { let k = ++hn; heap[k] = i; while (k > 1 && f[heap[k >> 1]] > f[heap[k]]) { const p = k >> 1; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; } };
    const pop = () => { const top = heap[1]; heap[1] = heap[hn--]; let k = 1; for (;;) { let l = k << 1, r = l + 1, m = k; if (l <= hn && f[heap[l]] < f[heap[m]]) m = l; if (r <= hn && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m; } return top; };
    g[s] = 0; f[s] = H(s); this.seen[s] = id; this.parent[s] = -1; push(s);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    let iter = 0, found = false, bestI = s, bestH = H(s);
    while (hn > 0 && iter++ < maxIter) {
      const cur = pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === t) { found = true; break; }
      const cx = cur % W, cz = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const ni = nz * W + nx;
        if (!this.walk[ni] || this.closed[ni] === id) continue;
        if (k >= 4 && (!this.walk[cz * W + nx] || !this.walk[nz * W + cx])) continue;
        const dy = Math.abs(this.gy[ni] - this.gy[cur]);
        if (dy > 0.6) continue;
        const ng = g[cur] + (k >= 4 ? Math.SQRT2 : 1) + dy * 2 + (this.cover[ni] ? -0.05 : 0);
        if (this.seen[ni] !== id || ng < g[ni]) {
          this.seen[ni] = id; g[ni] = ng; const h = H(ni); f[ni] = ng + h * 1.05; this.parent[ni] = cur; push(ni);
          if (h < bestH) { bestH = h; bestI = ni; }
        }
      }
    }
    let end = found ? t : bestI;
    const cells = [];
    for (let i = end; i !== -1; i = this.parent[i]) cells.push(i);
    cells.reverse();
    // string pulling
    const pts = cells.map(i => this.center(i));
    if (found) pts[pts.length - 1] = [tx, tz];
    const out = [];
    let anchor = [sx, sz], k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let j = Math.min(pts.length - 1, k + 40); j > k + 1; j--) { if (this.clearLine(anchor[0], anchor[1], pts[j][0], pts[j][1])) { far = j; break; } }
      out.push(pts[far]); anchor = pts[far]; k = far;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }
}
