// One skin over all the thick wood. Each axis of the tree (a trunk with whatever continues it, a limb, a root) contributes a soft field around its
// centreline, scaled to its own radius so a lone branch keeps its exact girth. Where axes meet their fields add up and the surface flows from one
// into the other in a fillet, so a tree has no joints to hide: bole, roots and limbs are one surface, like the real thing. Meshed with surface nets.
const SOFT = 7, REACH = 1 + Math.log(350)/SOFT, MAX_CELLS = 5e6
let S = new Float32Array(0), peak = new Float32Array(0), owner = new Uint16Array(0)

// the field of one length of wood at a point, and which way round the axis the point lies
function nearest(q, a, b){
  const ax = b.p[0] - a.p[0], ay = b.p[1] - a.p[1], az = b.p[2] - a.p[2], qx = q[0] - a.p[0], qy = q[1] - a.p[1], qz = q[2] - a.p[2], l = ax*ax + ay*ay + az*az
  const t = l > 1e-9 ? Math.min(Math.max((qx*ax + qy*ay + qz*az)/l, 0), 1) : 0
  const dx = qx - ax*t, dy = qy - ay*t, dz = qz - az*t, d = Math.sqrt(dx*dx + dy*dy + dz*dz), r = a.r + (b.r - a.r)*t
  return { t, d, r, dx, dy, dz, field: Math.exp(-SOFT*(d/r - 1)) }
}

// the size of the skin's cells for wood spanning this box: fine where the tree is small, coarser where it would run out of budget
export function skinCell(lo, hi, finest){ return Math.max(finest, Math.cbrt((hi[0] - lo[0] + 3)*(hi[1] - lo[1] + 3)*(hi[2] - lo[2] + 3)/MAX_CELLS)) }

export function skinWood(axes, wood, sway, root, finest){
  if (!axes.length) return
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (const x of axes){
    x.lo = [1e9, 1e9, 1e9]; x.hi = [-1e9, -1e9, -1e9]
    for (const e of x.rings) for (let a = 0; a < 3; a++){ x.lo[a] = Math.min(x.lo[a], e.p[a] - e.r*REACH); x.hi[a] = Math.max(x.hi[a], e.p[a] + e.r*REACH) }
    for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], x.lo[a]); hi[a] = Math.max(hi[a], x.hi[a]) }
  }
  const room = (hi[0] - lo[0])*(hi[1] - lo[1])*(hi[2] - lo[2]), h = Math.max(finest, Math.cbrt(room/MAX_CELLS))
  const nx = Math.ceil((hi[0] - lo[0])/h) + 3, ny = Math.ceil((hi[1] - lo[1])/h) + 3, nz = Math.ceil((hi[2] - lo[2])/h) + 3, cells = nx*ny*nz, row = nx*ny
  const x0 = lo[0] - h, y0 = lo[1] - h, z0 = lo[2] - h
  if (S.length < cells){ S = new Float32Array(cells); peak = new Float32Array(cells); owner = new Uint16Array(cells) } else { S.fill(0, 0, cells); owner.fill(0, 0, cells) }
  // axes of one group are one piece of wood: within it the strongest field wins, so a continuing limb doesn't swell where its pieces meet
  const q = [0, 0, 0]
  for (const x of axes){
    const id = x.group + 1
    for (let i = 1; i < x.rings.length; i++){
      const a = x.rings[i - 1], b = x.rings[i], pad = Math.max(a.r, b.r)*REACH + h
      const ax = b.p[0] - a.p[0], ay = b.p[1] - a.p[1], az = b.p[2] - a.p[2], l = ax*ax + ay*ay + az*az, dr = b.r - a.r
      const ix0 = Math.max(Math.floor((Math.min(a.p[0], b.p[0]) - pad - x0)/h), 0), ix1 = Math.min(Math.ceil((Math.max(a.p[0], b.p[0]) + pad - x0)/h), nx - 1)
      const iy0 = Math.max(Math.floor((Math.min(a.p[1], b.p[1]) - pad - y0)/h), 0), iy1 = Math.min(Math.ceil((Math.max(a.p[1], b.p[1]) + pad - y0)/h), ny - 1)
      const iz0 = Math.max(Math.floor((Math.min(a.p[2], b.p[2]) - pad - z0)/h), 0), iz1 = Math.min(Math.ceil((Math.max(a.p[2], b.p[2]) + pad - z0)/h), nz - 1)
      for (let z = iz0; z <= iz1; z++){ q[2] = z0 + z*h
        for (let y = iy0; y <= iy1; y++){ q[1] = y0 + y*h
          for (let k = ix0, c = k + y*nx + z*row; k <= ix1; k++, c++){
            const qx = x0 + k*h - a.p[0], qy = q[1] - a.p[1], qz = q[2] - a.p[2], t = l > 1e-9 ? Math.min(Math.max((qx*ax + qy*ay + qz*az)/l, 0), 1) : 0
            const dx = qx - ax*t, dy = qy - ay*t, dz = qz - az*t, r = a.r + dr*t, dd = dx*dx + dy*dy + dz*dz
            if (dd > r*r*REACH*REACH) continue
            const f = Math.exp(-SOFT*(Math.sqrt(dd)/r - 1))
            if (owner[c] !== id){ owner[c] = id; peak[c] = 0 }
            if (f > peak[c]){ S[c] += f - peak[c]; peak[c] = f }
          }
        }
      }
    }
  }
  // surface nets: one vertex in every cell the surface passes through, joined across the edges it crosses
  const pos = [], nor = [], tris = [], here = new Int32Array(row).fill(-1); let before = new Int32Array(row).fill(-1), now = here
  const CORNER = [0, 1, nx, nx + 1, row, row + 1, row + nx, row + nx + 1], EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const place = (a, b) => a < 0 ? 0 : (1 - a)/(b - a)
  for (let z = 0; z < nz - 1; z++){
    now.fill(-1)
    for (let y = 0; y < ny - 1; y++) for (let x = 0, c = y*nx + z*row; x < nx - 1; x++, c++){
      let mask = 0
      for (let k = 0; k < 8; k++) if (S[c + CORNER[k]] > 1) mask |= 1 << k
      if (mask === 0 || mask === 255) continue
      let px = 0, py = 0, pz = 0, n = 0
      for (const [a, b] of EDGES){
        const ia = mask >> a & 1, ib = mask >> b & 1
        if (ia === ib) continue
        const va = S[c + CORNER[a]], vb = S[c + CORNER[b]], t = Math.min(Math.max((1 - va)/(vb - va), 0), 1)
        px += (a & 1) + ((b & 1) - (a & 1))*t; py += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1))*t; pz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1))*t; n++
      }
      px = (x + px/n); py = (y + py/n); pz = (z + pz/n)
      const v = pos.length/3
      pos.push(x0 + px*h, y0 + py*h, z0 + pz*h)
      const ix = Math.min(Math.max(Math.round(px), 1), nx - 2), iy = Math.min(Math.max(Math.round(py), 1), ny - 2), iz = Math.min(Math.max(Math.round(pz), 1), nz - 2), g = ix + iy*nx + iz*row
      const log = i => Math.log(Math.max(S[i], 1e-4))                   // the field falls away exponentially: its log gives normals that hold up across a fillet
      let gx = log(g - 1) - log(g + 1), gy = log(g - nx) - log(g + nx), gz = log(g - row) - log(g + row), l = Math.hypot(gx, gy, gz) || 1
      nor.push(gx/l, gy/l, gz/l)
      now[x + y*nx] = v
    }
    for (let y = 0; y < ny - 1; y++) for (let x = 0, c = y*nx + z*row; x < nx - 1; x++, c++){
      const v = now[x + y*nx]
      if (v < 0) continue
      const s = S[c] > 1, quad = (a, b, d) => {
        if (a < 0 || b < 0 || d < 0) return
        const A = v*3, B = a*3, C = d*3, ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], wx = pos[C] - pos[A], wy = pos[C + 1] - pos[A + 1], wz = pos[C + 2] - pos[A + 2]
        const outward = (uy*wz - uz*wy)*nor[A] + (uz*wx - ux*wz)*nor[A + 1] + (ux*wy - uy*wx)*nor[A + 2]
        if (outward >= 0) tris.push(v, a, d, v, d, b); else tris.push(v, d, a, v, b, d)
      }
      if (y > 0 && z > 0 && s !== (S[c + 1] > 1)) quad(now[x + (y - 1)*nx], before[x + y*nx], before[x + (y - 1)*nx])
      if (x > 0 && z > 0 && s !== (S[c + nx] > 1)) quad(now[x - 1 + y*nx], before[x + y*nx], before[x - 1 + y*nx])
      if (x > 0 && y > 0 && s !== (S[c + row] > 1)) quad(now[x - 1 + y*nx], now[x + (y - 1)*nx], now[x - 1 + (y - 1)*nx])
    }
    const swap = before; before = now; now = swap
  }
  // The grid only finds the surface; it can't describe it. Every vertex now slides onto the true surface and takes its exact normal from the field, so
  // an edge is as smooth as the wood's own curve however coarse the grid. Bark, weathering and wind are read from every axis nearby, in proportion to its
  // field, so they cross a fillet as smoothly as the surface does.
  const base = wood.pos.length/3, groups = axes.reduce((m, x) => Math.max(m, x.group), 0) + 1, best = new Float32Array(groups), gx = new Float32Array(groups), gy = new Float32Array(groups), gz = new Float32Array(groups), rec = new Array(groups)
  const near = [], rings = axes, crease = new Float32Array(pos.length/3)
  for (const x of axes) x.reach = x.rings.map((b, i) => { if (!i) return null
    const a = x.rings[i - 1], half = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2])/2, far = half + Math.max(a.r, b.r)*REACH
    return [(a.p[0] + b.p[0])/2, (a.p[1] + b.p[1])/2, (a.p[2] + b.p[2])/2, far*far] })
  const read = () => {
    best.fill(0)
    for (const x of near) for (let i = 1; i < x.rings.length; i++){
      const e = x.reach[i], ex = q[0] - e[0], ey = q[1] - e[1], ez = q[2] - e[2]
      if (ex*ex + ey*ey + ez*ez > e[3]) continue                        // most lengths of wood are nowhere near this point
      const m = nearest(q, x.rings[i - 1], x.rings[i])
      if (m.field > best[x.group]){ const k = SOFT/(m.r*(m.d || 1)); best[x.group] = m.field; gx[x.group] = -m.dx*k*m.field; gy[x.group] = -m.dy*k*m.field; gz[x.group] = -m.dz*k*m.field; rec[x.group] = [m, x.rings[i - 1], x.rings[i]] }
    }
  }
  for (let v = 0; v < pos.length/3; v++){
    q[0] = pos[v*3]; q[1] = pos[v*3 + 1]; q[2] = pos[v*3 + 2]
    near.length = 0
    for (const x of rings) if (q[0] > x.lo[0] - h && q[0] < x.hi[0] + h && q[1] > x.lo[1] - h && q[1] < x.hi[1] + h && q[2] > x.lo[2] - h && q[2] < x.hi[2] + h) near.push(x)
    let nx = nor[v*3], ny = nor[v*3 + 1], nz = nor[v*3 + 2]
    for (let step = 0; step < 3; step++){
      read()
      let sum = 0, ax = 0, ay = 0, az = 0
      for (let g = 0; g < groups; g++) if (best[g] > 0){ sum += best[g]; ax += gx[g]; ay += gy[g]; az += gz[g] }
      const l = ax*ax + ay*ay + az*az
      if (l < 1e-9 || sum <= 0) break
      const root1 = Math.sqrt(l); nx = -ax/root1; ny = -ay/root1; nz = -az/root1
      if (step === 2) break
      const move = Math.max(Math.min((sum - 1)/root1, h), -h)            // Newton: a step along the slope to where the field reads 1
      q[0] += nx*move; q[1] += ny*move; q[2] += nz*move
    }
    let w = 0, rx = 0, ry = 0, grain = 0, thick = 0, buried = 0
    for (let g = 0; g < groups; g++){
      const f = best[g]
      if (f <= 0) continue
      const [m, A, B] = rec[g], d = m.d || 1, cx = m.dx/d, cy = m.dy/d, cz = m.dz/d
      w += f; const u = m.t                       // the frame turns smoothly from ring to ring, or the bark steps at each one
      rx += f*(cx*(A.n[0] + (B.n[0] - A.n[0])*u) + cy*(A.n[1] + (B.n[1] - A.n[1])*u) + cz*(A.n[2] + (B.n[2] - A.n[2])*u))
      ry += f*(cx*(A.b[0] + (B.b[0] - A.b[0])*u) + cy*(A.b[1] + (B.b[1] - A.b[1])*u) + cz*(A.b[2] + (B.b[2] - A.b[2])*u))
      grain += f*(A.v + (B.v - A.v)*m.t); thick += f*(A.thick + (B.thick - A.thick)*m.t); buried += f*(A.buried + (B.buried - A.buried)*m.t)
    }
    if (w < 1e-6) w = 1
    const round = Math.hypot(rx, ry)/w                                  // kept as a length, not a direction: where branches share a point it fades, so the bark's coordinates pass through a fork instead of jumping across it
    pos[v*3] = q[0]; pos[v*3 + 1] = q[1]; pos[v*3 + 2] = q[2]; nor[v*3] = nx; nor[v*3 + 1] = ny; nor[v*3 + 2] = nz; crease[v] = 1 - Math.min(Math.max((round - .3)/.45, 0), 1)
    wood.uv.push(Math.atan2(ry, rx)/(Math.PI*2), grain/w)
    wood.wind.push(root[0], root[2], sway(q), 0); wood.center.push(root[0], root[1], root[2]); wood.leaf.push(thick/w, buried/w, round)
  }
  // Two axes meet in a crease, where the true surface has a sharp valley the mesh can't follow. It's relaxed there, then any triangle left facing inward
  // is turned round, so the skin never shows a pinhole.
  const count = pos.length/3, sum = new Float32Array(count*3), links = new Uint16Array(count)
  for (let pass = 0; pass < 3; pass++){
    sum.fill(0); links.fill(0)
    for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++){
      const a = tris[t + k], b = tris[t + (k + 1)%3]
      sum[a*3] += pos[b*3]; sum[a*3 + 1] += pos[b*3 + 1]; sum[a*3 + 2] += pos[b*3 + 2]; links[a]++
    }
    for (let v = 0; v < count; v++){ const w = crease[v]*.7; if (w > 0 && links[v]) for (let a = 0; a < 3; a++) pos[v*3 + a] += (sum[v*3 + a]/links[v] - pos[v*3 + a])*w }
  }
  for (let t = 0; t < tris.length; t += 3){
    const a = tris[t]*3, b = tris[t + 1]*3, c = tris[t + 2]*3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2]
    if ((uy*wz - uz*wy)*(nor[a] + nor[b] + nor[c]) + (uz*wx - ux*wz)*(nor[a + 1] + nor[b + 1] + nor[c + 1]) + (ux*wy - uy*wx)*(nor[a + 2] + nor[b + 2] + nor[c + 2]) < 0){ const q = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = q }
  }
  for (let i = 0; i < pos.length; i++){ wood.pos.push(pos[i]); wood.nor.push(nor[i]) }
  wood.skin = [wood.idx.length, wood.idx.length + tris.length]
  for (let i = 0; i < tris.length; i++) wood.idx.push(base + tris[i])
}
