// The foliage generator. No three.js in here: it writes plain arrays, so the same plants can be fed to any renderer.
//
// A plant is a growth hierarchy (a queue of branches, each section steered by inherited direction, wander and tropism)
// with foliage painted on it: clumps at the branch tips, each a shell of brush strokes over a dark underpainting. Clumps
// are grouped into larger masses so the shading reads as a few big painted volumes rather than one bubble per clump.
// A stroke is four vertices at one anchor point: the shader fans them out facing the camera (or the light, for shadows)
// and lights the whole stroke from that anchor, so light and shadow change stroke by stroke, the way a painter's do.

export function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296 } }

const add = (a, b, k = 1) => [a[0] + b[0]*k, a[1] + b[1]*k, a[2] + b[2]*k]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l] }
const lerp = (a, b, t) => a + (b - a)*t
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const randDir = r => { const z = r()*2 - 1, t = r()*Math.PI*2, s = Math.sqrt(1 - z*z); return [s*Math.cos(t), z, s*Math.sin(t)] }
const perpTo = d => norm(Math.abs(d[1]) < .9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]))
const rotateAbout = (v, axis, a) => { const c = Math.cos(a), s = Math.sin(a), k = dot(axis, v)*(1 - c), x = cross(axis, v)
  return [v[0]*c + x[0]*s + axis[0]*k, v[1]*c + x[1]*s + axis[1]*k, v[2]*c + x[2]*s + axis[2]*k] }

export function newBuffer(){ return { pos: [], nor: [], uv: [], wind: [], idx: [], center: [], leaf: [], corner: [], stroke: [], dab: [] } }

// how far a primary branch reaches, by where it leaves the trunk (0 low, 1 high)
const ENVELOPE = {
  dome: t => Math.sin(Math.PI*(.28 + .66*t))**.8,
  oval: t => Math.sin(Math.PI*(.08 + .84*t))**.7,
  column: t => .5 + .35*Math.sin(Math.PI*t),
  cone: t => 1 - .85*t,
  umbrella: t => .45 + .75*t**.6,
  vase: t => .35 + .85*t,
}

// Gesture: how wide a crown is (0-1 of its width) at each height t, bottom to top. This is the shape a painter would block in first,
// and it should read as a flat black silhouette before any paint goes on.
const GESTURES = {
  dome: t => (1 - t*t)**.55,
  windswept: t => 1 - t**2.5,
  flame: t => Math.sin(Math.PI*Math.min(1, .06 + .94*t**.72))**.85,
  cloud: t => (.8 + .2*Math.sin(t*7 + .8))*(1 - t**3),
  ovate: t => Math.sin(Math.PI*(.1 + .86*t))**.7,
  umbrella: t => 1 - .9*t**3,
  mound: t => Math.sqrt(1 - .96*t*t),
  tiers: t => (1 - t*.94)**.8*(.72 + .28*(1 - (t*6)%1)*Math.min(1, ((t*6)%1)*10)),
}
export const GESTURE_NAMES = Object.keys(GESTURES).concat('free')

// A smooth warp of the whole tree into its gesture: branches, tips and so clumps all move together, so nothing detaches.
function shapeCrown(sp, r, root, scale, branches, tips){
  const shape = GESTURES[sp.gesture]
  if (!shape || !tips.length) return
  const H = sp.height*scale, y0 = Math.min(...tips.map(t => t.p[1])), y1 = Math.max(...tips.map(t => t.p[1])), span = Math.max(y1 - y0, .1)
  const N = 16, band = new Float32Array(N), slot = y => Math.min(N - 1, Math.floor(clamp((y - y0)/span)*N))
  for (const t of tips){ const i = slot(t.p[1]); band[i] = Math.max(band[i], Math.hypot(t.p[0] - root[0], t.p[2] - root[2])) }
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) band[i] = Math.max(band[i], .7*Math.max(band[i - 1] ?? 0, band[i + 1] ?? 0))
  // read the measured width as a smooth curve: a stepped one puts a jump in every limb that crosses a step
  for (let pass = 0; pass < 3; pass++){ const c = band.slice(); for (let i = 0; i < N; i++) band[i] = (c[Math.max(i - 1, 0)] + 2*c[i] + c[Math.min(i + 1, N - 1)])/4 }
  const bandAt = y => { const u = clamp((y - y0)/span)*(N - 1), i = Math.min(N - 2, Math.floor(u)); return lerp(band[i], band[i + 1], u - i) }
  const a1 = r()*7, a2 = r()*7, a3 = r()*7, W = sp.crownWidth*H, bendTo = r()*Math.PI*2, core = sp.trunkRadius*scale*1.3
  const warp = p => {
    const t = clamp((p[1] - y0)/span), dx = p[0] - root[0], dz = p[2] - root[2], rho = Math.hypot(dx, dz)
    if (rho < 1e-4) return p.slice()
    const th = Math.atan2(dz, dx), side = 1 + sp.asym*(.5*Math.sin(th + a1) + .3*Math.sin(2*th + a2) + .2*Math.sin(3*th + a3))
    const f = clamp(W*shape(t)*side/Math.max(bandAt(p[1]), .3), .5, 2.8), w = clamp((rho - core*.4)/core)
    const k = lerp(1, f, w*w*(3 - 2*w)), lean = t*t*W*sp.windLean
    return [root[0] + dx*k + Math.cos(bendTo)*lean, p[1], root[2] + dz*k + Math.sin(bendTo)*lean]
  }
  for (const b of branches){
    for (const e of b.trail) e.p = warp(e.p)
    // ease out what's left of any kink; the ends stay put so limbs stay attached
    if (b.level) for (let pass = 0; pass < 2; pass++){ const old = b.trail.map(e => e.p)
      for (let i = 1; i < old.length - 1; i++) b.trail[i].p = old[i].map((v, a) => .25*old[i - 1][a] + .5*v + .25*old[i + 1][a]) }
    for (let i = 0; i < b.trail.length; i++){                         // the tube follows its new path
      const e = b.trail[i], next = b.trail[i + 1], prev = b.trail[i - 1]
      e.d = norm(next ? sub(next.p, e.p) : sub(e.p, prev.p))
      e.n = norm(sub(e.n, [e.d[0]*dot(e.n, e.d), e.d[1]*dot(e.n, e.d), e.d[2]*dot(e.n, e.d)]))
    }
  }
  for (const t of tips) t.p = warp(t.p)
}

// Grow the skeleton first and mesh it later: branches that end up carrying no foliage get pruned, so nothing pokes out of the crown.
function growSkeleton(sp, r, root, scale, tips){
  const H = sp.height*scale, maxLevel = Math.round(sp.levels), env = ENVELOPE[sp.crown] || ENVELOPE.dome, angle = sp.childAngle*Math.PI/180
  const dir0 = norm([(r() - .5)*sp.lean*2, 1, (r() - .5)*sp.lean*2]), branches = []
  const sink = .3*sp.flare*sp.trunkRadius*scale                     // the flare starts underground, so roots rise out of it rather than ending in points
  const queue = [{ p: add(root, [0, -sink, 0]), d: dir0, r: sp.trunkRadius*scale, len: H*sp.trunkFrac + sink, level: 0, s: 0, parent: null }]
  while (queue.length && branches.length < 1600){
    const b = queue.shift(), sections = [18, 9, 6, 4][Math.min(b.level, 3)], radial = [36, 12, 7, 5][Math.min(b.level, 3)]
    const ds = b.len/sections, taper = b.level === 0 ? .62 : b.level === 1 ? .6 : .45
    let p = b.p, d = b.d, n = perpTo(d)
    const trail = [], rec = { ...b, trail, sections, radial, roots: 5 + Math.floor(r()*3), kept: b.level === 0 }
    branches.push(rec)
    for (let i = 0; i <= sections; i++){
      const t = i/sections
      let rad = Math.max(b.r*(1 - (1 - taper)*t), .012*scale)
      if (b.level === 0) rad *= 1 + sp.flare*.55*Math.exp(-t*7)      // root flare
      else if (!b.continues) rad *= 1 + .25*Math.exp(-t*11)          // limbs swell gently at the join, but their open base must stay inside the parent
      trail.push({ p, d, n, rad })
      if (i < sections){
        const wander = randDir(r), level = b.level === 0 ? .2 : b.leader ? .4 : 1
        const nd = norm(add(add(d, wander, sp.gnarl*level), [0, 1, 0], b.leader ? Math.max(sp.upward, .06) : sp.upward*(1 + b.level*.6) - (b.level >= 2 ? sp.droop : 0)))
        if (nd[1] < .05 && p[1] < root[1] + H*.24){ nd[1] = .05 }     // no limb dives into the ground
        const axis = cross(d, nd), l = Math.hypot(...axis)
        if (l > 1e-5) n = norm(rotateAbout(n, norm(axis), Math.asin(clamp(l))))     // parallel transport: no ring twist
        n = norm(sub(n, [nd[0]*dot(n, nd), nd[1]*dot(n, nd), nd[2]*dot(n, nd)]))
        d = nd; p = add(p, d, ds)
      }
    }
    const tip = trail[sections]
    if (b.level >= maxLevel){
      tips.push({ p: tip.p, d: tip.d, r: tip.rad, branch: rec, section: sections })
      if (r() < .75){ const section = Math.round(sections*.55), m = trail[section]; tips.push({ p: m.p, d: m.d, r: tip.rad, branch: rec, section }) }
      continue
    }
    const count = Math.max(2, Math.round(sp.children*(b.level === 0 ? 1 : .62))), phase = r()*Math.PI*2
    const slots = Array.from({ length: count }, (_, i) => i)      // height and direction stratified independently: even all round, no spiral
    for (let i = count - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]] }
    for (let c = 0; c < count; c++){
      const along = lerp(b.level === 0 ? sp.childStart : .25, .98, (c + .2 + r()*.6)/count)
      const t = clamp(along), at = t*sections, i = Math.min(sections - 1, Math.floor(at)), f = at - i
      const a = trail[i], e = trail[i + 1], q0 = add(a.p, sub(e.p, a.p), f), pd = a.d
      const az = phase + slots[c]/count*Math.PI*2 + (r() - .5)*.8
      const side = rotateAbout(perpTo(pd), pd, az)
      const spread = angle*lerp(.8, 1.2, r())*(b.level === 0 ? lerp(1.15, .75, t) : 1)
      const cd = norm(add([pd[0]*Math.cos(spread), pd[1]*Math.cos(spread), pd[2]*Math.cos(spread)], side, Math.sin(spread)))
      if (b.level === 0) cd[1] = Math.max(cd[1], .16)                // primaries leave the trunk level at the lowest
      const q = q0                                                   // limbs start on the parent's axis, so their open end is never seen
      const lenK = b.level === 0 ? env(t) : 1 - .45*t, lenBase = b.level === 0 ? H*.56 : b.len
      queue.push({ p: q, d: cd, r: Math.max(a.rad*(b.level === 0 ? .62 : .72), .02*scale), len: lenBase*sp.lengthRatio*lenK*lerp(.82, 1.15, r()), level: b.level + 1, s: r()*9, parent: rec })
    }
    // the terminal continuation: without it a crown looks clipped
    queue.push({ p: tip.p, d: norm(add(tip.d, randDir(r), .18)), r: tip.rad*.97, continues: true, leader: b.level === 0, len: b.level === 0 ? H*(1 - sp.trunkFrac)*.55 : b.len*sp.lengthRatio*.8, level: b.level + 1, s: r()*9, parent: rec })
  }
  return branches
}

function emitWood(sp, r, root, scale, branches, wood, clumps){
  const H = sp.height*scale
  for (const b of branches) if (b.kept && b.continues) b.parent.continued = true
  for (const b of branches){
    if (!b.kept) continue
    const start = wood.pos.length/3, { sections, radial, trail, roots } = b, last = b.cut ?? sections
    for (let i = 0; i <= last; i++){
      const t = i/sections, { p, d, n } = trail[i], bitang = cross(d, n)
      // wood with nothing growing on from its end comes to a point instead of a cut stub
      const point = b.continued ? 1 : Math.max(.04, clamp((last - i)/Math.max(2, last*.45))**.6), rad = trail[i].rad*point
      // joints stay plain: sun patches keep clear of where limbs meet
      const joint = b.level === 0 ? 1 - clamp((t - .5)/.3) : clamp((t - .12)/.25)
      // how deep inside the foliage this ring sits: buried wood paints as the crown's shadow, so limbs vanish into it
      let buried = 0
      if (b.level) for (const c of clumps){ const q = sub(p, c.c); q[1] /= sp.squash; buried = Math.max(buried, clamp((c.r*1.25 - Math.hypot(...q))/(c.r*.5))) }
      for (let k = 0; k <= radial; k++){
        const a = k/radial*Math.PI*2, ca = Math.cos(a), sa = Math.sin(a)
        const nr = add([n[0]*ca, n[1]*ca, n[2]*ca], bitang, sa)
        // roots: buttresses that fade up the trunk into twisting flutes; limbs keep a gentler fluting of their own
        const twist = a + t*1.1 + b.s, spur = (.5 + .5*Math.cos(twist*roots + b.s))**1.6
        const lobes = b.level === 0 ? 1 + sp.flare*(.5*spur*Math.exp(-t*10) + .12*spur*Math.exp(-t*2.2)) + .03*Math.sin(twist*7)
          : b.level === 1 ? 1 + .05*Math.sin(twist*4) : 1
        const q = add(p, nr, rad*lobes)
        wood.pos.push(...q); wood.nor.push(...nr); wood.uv.push(k/radial, t*b.len/Math.max(b.r*2, .15))
        wood.wind.push(root[0], root[2], .32*scale*(clamp((q[1] - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5), 0)
        wood.center.push(root[0], root[1], root[2]); wood.leaf.push(clamp(rad/(.16*scale)), buried, joint)
      }
      if (i < last) for (let k = 0; k < radial; k++){
        const a = start + i*(radial + 1) + k, c = a + radial + 1
        wood.idx.push(a, a + 1, c, a + 1, c + 1, c)
      }
    }
  }
}

// Keep a tip only if it ends inside a clump, then keep the wood that leads to it. A terminal branch stops at its last kept tip,
// so wood never pokes out through the paint.
function prune(sp, tips, clumps){
  for (const t of tips){
    const held = sp.hang > 0 || clumps.some(c => { const q = sub(c.c, t.p); q[1] /= sp.squash; return dot(q, q) < (c.r*.92)**2 })
    if (!held) continue
    t.branch.cut = Math.max(t.branch.cut ?? 0, t.section)
    for (let b = t.branch; b && !b.kept; b = b.parent) b.kept = true
  }
}

function kmeans(points, K, r){
  const centers = Array.from({ length: K }, () => points[Math.floor(r()*points.length)].slice()), asg = new Int32Array(points.length)
  for (let it = 0; it < 8; it++){
    const sum = centers.map(() => [0, 0, 0, 0])
    points.forEach((p, i) => { let best = 0, bd = 1e12
      centers.forEach((c, k) => { const q = sub(p, c), dd = dot(q, q); if (dd < bd){ bd = dd; best = k } })
      asg[i] = best; const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++ })
    sum.forEach((s, k) => { if (s[3]) centers[k] = [s[0]/s[3], s[1]/s[3], s[2]/s[3]] })
  }
  return { centers, asg }
}

function makeClumps(sp, r, tips, scale, root){
  const clumps = [], R = sp.clumpRadius*scale, floor = root[1] + sp.height*scale*sp.trunkFrac*sp.childStart*sp.lift
  for (let i = tips.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [tips[i], tips[j]] = [tips[j], tips[i]] }
  for (const tip of tips){
    const n = Math.floor(sp.clumpsPerTip) + (r() < sp.clumpsPerTip%1 ? 1 : 0)
    for (let i = 0; i < n; i++){
      const rad = R*lerp(1 - sp.clumpVar, 1 + sp.clumpVar*.6, r()), c = add(add(tip.p, tip.d, rad*.3), randDir(r), rad*.25*i)
      if (c[1] - rad*sp.squash < floor) continue                     // keep the trunk and the space under the crown open
      if (clumps.some(o => { const q = sub(o.c, c); return dot(q, q) < (sp.clumpSpacing*(o.r + rad)*.5)**2 })) continue
      clumps.push({ c, r: rad })
    }
  }
  // notches: bites out of the outline, so the shape has an interesting edge and some sky through it
  for (let i = 0; i < sp.notches && clumps.length > 8; i++){
    let far = clumps[0], reach = -1
    for (let t = 0; t < 8; t++){ const c = clumps[Math.floor(r()*clumps.length)], q = Math.hypot(c.c[0] - root[0], c.c[2] - root[2]); if (q > reach){ reach = q; far = c } }
    const R = far.r*1.7, hit = far.c
    for (let k = clumps.length - 1; k >= 0; k--){ const q = sub(clumps[k].c, hit); if (dot(q, q) < R*R) clumps.splice(k, 1) }
  }
  // a clump with nothing near it reads as a ball on a stick: painters group masses, so strays go
  if (!sp.hang) for (let i = clumps.length - 1; i >= 0; i--){
    const o = clumps[i]
    if (clumps.filter(c => { const q = sub(c.c, o.c); return c !== o && dot(q, q) < ((c.r + o.r)*1.15)**2 }).length < 2) clumps.splice(i, 1)
  }
  if (!clumps.length) return clumps
  const K = clamp(Math.round(clumps.length/5), 1, 16), { centers, asg } = kmeans(clumps.map(c => c.c), K, r)
  // big, middle, small at the level of masses too: one dominant mass, the rest in support
  const scaleOf = centers.map(() => lerp(1 - sp.massVar*.45, 1 + sp.massVar*.15, r())), lead = Math.floor(r()*K)
  scaleOf[lead] = 1 + sp.massVar*.55
  clumps.forEach((c, i) => { c.mass = centers[asg[i]]; c.r *= scaleOf[asg[i]] })
  return clumps
}

// a low icosphere: each clump's solid core, one flat shadow colour that hides the limbs behind it and gives the crown its dark mass
function icosphere(){
  const t = (1 + Math.sqrt(5))/2
  const v = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm)
  const f = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]
  const mid = new Map(), m = (a, b) => { const k = a < b ? a*1e4 + b : b*1e4 + a; if (!mid.has(k)){ mid.set(k, v.length); v.push(norm(add(v[a], v[b]))) } return mid.get(k) }
  return { v, f: f.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]] }) }
}
const ICO = icosphere()

function addStroke(out, r, { q, n, t, len, wid, tile, pivot, ao, tone, wind, dab = 0 }){
  const base = out.pos.length/3, seed = r()
  for (const [cx, cy, u, v] of [[-1, -1, 0, .5], [1, -1, 1, .5], [1, 1, 1, 0], [-1, 1, 0, 0]]){
    out.pos.push(...q); out.nor.push(...n); out.stroke.push(...t); out.center.push(...pivot); out.wind.push(...wind)
    out.corner.push(cx*len/2, cy*wid/2); out.leaf.push(ao, tone, seed); out.dab.push(dab)
    const tx = (tile[0] + u)/4, ty = (tile[1] + (cy < 0 ? 1 : 0))/4
    out.uv.push(tx, ty); void v
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

// rows 0-1 of the atlas hold the body brush, rows 2-3 the edge brush; the last tile is the underpainting
const randTile = (r, edge = false) => { const x = Math.floor(r()*4), y = Math.floor(r()*2) + (edge ? 2 : 0); return x === 3 && y === 3 ? [0, 2] : [x, y] }

function emitFoliage(sp, r, clumps, root, scale, out, cores){
  const H = sp.height*scale, turn = sp.strokeAngle*Math.PI/180, jitter = sp.strokeJitter*Math.PI/180
  const swayAt = y => .32*scale*(clamp((y - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5)
  const len0 = sp.cardSize*scale, wid0 = len0*sp.brushWidth
  // the crown as one form: its bounds give every stroke a place on the whole tree, so one light runs across it
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (const { c, r: q } of clumps) for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], c[a] - q); hi[a] = Math.max(hi[a], c[a] + q) }
  const crown = lo.map((v, a) => (v + hi[a])/2), half = lo.map((v, a) => Math.max((hi[a] - v)/2, .1))
  for (const cl of clumps){
    const { c, r: rad, mass } = cl, tone = r(), sw = swayAt(c[1])
    const pivot = add(add(c, sub(mass, c), sp.massBlend), sub(crown, add(c, sub(mass, c), sp.massBlend)), sp.crownBlend), wind = [root[0], root[2], sw, .6]
    if (sp.core){
      const base = cores.pos.length/3, wob = r()*9
      for (const d of ICO.v){
        const k = rad*(.62 + .07*Math.sin(d[0]*4 + wob)*Math.cos(d[2]*3 + wob))
        cores.pos.push(c[0] + d[0]*k, c[1] + d[1]*k*sp.squash, c[2] + d[2]*k); cores.nor.push(...d); cores.uv.push(0, 0)
        cores.center.push(...pivot); cores.wind.push(...wind)
      }
      for (const [a, b, e] of ICO.f) cores.idx.push(base + a, base + b, base + e)
    }
    // lobes: the lumps a painter blocks in first. Strokes take their tone and much of their normal from their lobe, so light
    // falls on groups of dabs, and the valleys between lobes stay dark.
    const L = Math.round(clamp(rad/len0*4.5, 4, 12)), lobes = Array.from({ length: L }, () => { const dir = randDir(r); return { dir, tone: clamp(tone + (r() - .5)*.7) } })
    const n = Math.max(5, Math.round(sp.coverage*4*Math.PI*rad*rad/(len0*wid0)))
    // Big, middle, small. Plates are a few large shapes per lobe that state the mass; they are always drawn. Middle dabs and small
    // accents exist everywhere, but the shader only opens them where the light asks for them (FOLIAGE_FAN in main.js), so shadow
    // stays plates and detail gathers along the lit edge at any time of day. Strays break the silhouette.
    for (let layer = 0; layer < 4; layer++) for (let i = 0, count = [L*sp.plates, n*1.1, n*.9, n*sp.strays][layer]; i < count; i++){
      const d = randDir(r)
      let lobe = lobes[0], b = -2
      for (const l of lobes){ const q = dot(d, l.dir); if (q > b){ b = q; lobe = l } }
      if (layer === 2 && b < .45) continue
      const rise = clamp((b - .45)/.5), bump = .8 + .26*rise*rise + (r() - .5)*.06
      const k = rad*(layer === 3 ? bump + lerp(.14, .36, r()) : bump + [-.04, 0, .05][layer]), q = [c[0] + d[0]*k, c[1] + d[1]*k*sp.squash, c[2] + d[2]*k]
      const onCrown = norm(q.map((v, a) => (v - crown[a])/half[a])), nS = norm(add(add(lobe.dir, d, .3), onCrown, sp.crownBlend*1.6))   // a stroke takes its light from its lobe and crown, so lit strokes join up
      // strokes run over the form: down the sides of the clump, turned by the species' stroke angle
      const flow = sub([0, -1, 0], [d[0]*-d[1], d[1]*-d[1], d[2]*-d[1]])
      const t = rotateAbout(norm(dot(flow, flow) > .02 ? flow : randDir(r)), d, turn + (r() - .5)*2*jitter)
      const ao = clamp(.26 + .4*(onCrown[1]*.5 + .5) + .2*Math.hypot(onCrown[0], onCrown[2]) + .16*rise, .1, 1)
      const plate = rad*lerp(.7, 1.1, r())*sp.plateSize, size = [0, lerp(.8, 1.3, r()), lerp(.38, .66, r()), lerp(.3, .5, r())][layer]
      addStroke(out, r, { q, n: nS, t, len: layer ? len0*size : plate, wid: layer ? wid0*size : plate*.85, tile: randTile(r, layer > 1), pivot, ao,
        tone: clamp(lobe.tone + (r() - .5)*.2), wind, dab: [0, 1, 2, 2][layer] })
    }
  }
}

// Weeping curtains: from each branch tip a whip arcs outward and falls under its own weight, painted as long pulled strokes.
// Strands of one mass share a pivot, so the curtain shades as one lobed surface and the gaps between lobes stay dark.
function emitStrands(sp, r, tips, clumps, root, scale, out){
  const H = sp.height*scale, len0 = sp.cardSize*scale, step = len0*.62, floor = root[1] + H*.05
  const reach = tips.reduce((m, t) => Math.max(m, Math.hypot(t.p[0] - root[0], t.p[2] - root[2])), 1)
  for (const tip of tips){
    const n = Math.floor(sp.hang) + (r() < sp.hang%1 ? 1 : 0)
    let mass = tip.p, best = 1e12
    for (const c of clumps){ const q = sub(c.c, tip.p), dd = dot(q, q); if (dd < best){ best = dd; mass = c.mass } }
    for (let k = 0; k < n; k++){
      const out0 = norm([tip.p[0] - root[0] + (r() - .5)*2, 0, tip.p[2] - root[2] + (r() - .5)*2])
      let d = norm([out0[0] + tip.d[0]*.6, .35 + r()*.35, out0[2] + tip.d[2]*.6])
      let p = add(tip.p, randDir(r), .35*scale)
      const fall = Math.max(p[1] - floor, step)*sp.strandLength*lerp(.72, 1.05, r())
      const endY = p[1] - fall, sag = lerp(.3, .5, r()), curl = r()*9, tone = r()
      const swTop = .32*scale*(clamp((p[1] - root[1])/H)**1.6), jitter = randDir(r)
      const pivotBase = [lerp(root[0], mass[0], .65) + jitter[0]*.5*scale, 0, lerp(root[2], mass[2], .65) + jitter[2]*.5*scale]
      for (let i = 0, s = 0; i < 50 && p[1] > endY; i++, s += step){
        const along = 1 - clamp((p[1] - endY)/fall), frac = Math.hypot(p[0] - root[0], p[2] - root[2])/reach
        const size = lerp(1.1, .7, along), q = add(p, randDir(r), .08*scale)
        const pivot = [pivotBase[0], q[1] + (q[1] - root[1] - H*.75)*.25, pivotBase[2]]
        const n1 = norm(sub(q, pivot)), ao = clamp(.42 + .56*frac**1.4 + .16*Math.sin(s*.9 + curl) + (tone - .5)*.2, .1, 1)
        addStroke(out, r, { q, n: n1, t: norm(add(d, randDir(r), .1)), len: len0*size, wid: len0*sp.brushWidth*size, tile: randTile(r), pivot, ao, tone,
          wind: [root[0], root[2], swTop + .05*scale*along, lerp(.5, 1.5, along)] })
        d = norm(add(add(d, [0, -1, 0], sag), [Math.sin(curl + s*.7), 0, Math.cos(curl + s*.6)], .05))
        p = add(p, d, step)
      }
    }
  }
}

export function generatePlant(sp, seed, root, scale, wood, foliage, cores = newBuffer()){
  const r = mulberry32(seed*2654435761 >>> 0), tips = []
  const branches = growSkeleton(sp, r, root, scale, tips)
  shapeCrown(sp, r, root, scale, branches, tips)
  const clumps = makeClumps(sp, r, tips, scale, root)
  prune(sp, tips, clumps)
  emitWood(sp, r, root, scale, branches, wood, clumps)
  emitFoliage(sp, r, clumps, root, scale, foliage, cores)
  if (sp.hang > 0) emitStrands(sp, r, tips, clumps, root, scale, foliage)
  return clumps.length
}

export const groundHeight = (x, z) => {
  const fade = clamp((Math.hypot(x, z) - 8)/30)
  return fade*fade*(2.2*Math.sin(x*.045 + 1)*Math.cos(z*.04) + .9*Math.sin(x*.11 - z*.08 + 2)) 
}

// polar grid: dense under the plants, sparse out to the horizon
export function generateGround(radius){
  const rings = 70, sectors = 120, o = { pos: [], nor: [], idx: [], uv: [] }
  for (let i = 0; i <= rings; i++) for (let k = 0; k <= sectors; k++){
    const rr = radius*(i/rings)**2.2, a = k/sectors*Math.PI*2, x = rr*Math.cos(a), z = rr*Math.sin(a), e = .5
    o.pos.push(x, groundHeight(x, z), z); o.uv.push(x, z)
    o.nor.push(...norm([groundHeight(x - e, z) - groundHeight(x + e, z), 2*e, groundHeight(x, z - e) - groundHeight(x, z + e)]))
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < sectors; k++){
    const a = i*(sectors + 1) + k, b = a + sectors + 1
    o.idx.push(a, a + 1, b, a + 1, b + 1, b)
  }
  return o
}

// Grass is accents, not coverage: the colour of the field lives in the ground, and tufts gather in loose drifts on top of it.
// Each tuft is one stroke rooted at the ground, sharing the field's colour at its anchor.
export function generateGrass(count, radius, seed){
  const r = mulberry32(seed + 77), o = newBuffer(), clumps = Math.max(1, Math.round(count/14))
  for (let c = 0; c < clumps; c++){
    const dist = radius*Math.sqrt(r()), th = r()*Math.PI*2, cx = dist*Math.cos(th), cz = dist*Math.sin(th)
    const n = 6 + Math.floor(r()*16), spread = lerp(.8, 3.2, r()), stretch = r()*Math.PI, tone = r()
    const ca = Math.cos(stretch), sa = Math.sin(stretch)
    for (let i = 0; i < n; i++){
      const u = (r() + r() + r() - 1.5)*spread*1.6, v = (r() + r() + r() - 1.5)*spread*.7           // long, thin drifts
      const x = cx + u*ca - v*sa, z = cz + u*sa + v*ca, y = groundHeight(x, z)
      const edge = 1 - clamp((Math.hypot(x, z) - radius*.8)/(radius*.2)), len = lerp(.4, .85, r())*lerp(.4, 1, edge), wid = len*lerp(.75, 1.1, r())
      const lean = (r() - .5)*.5, t = norm([lean, 1, lean*.5]), s = len*.5
      addStroke(o, r, { q: [x + t[0]*s, y + t[1]*s - .05, z + t[2]*s], n: [0, 1, 0], t, len, wid, tile: [Math.floor(r()*4), Math.floor(r()*4)],
        pivot: [x, y, z], ao: 1, tone: clamp(tone + (r() - .5)*.3), wind: [x, z, 0, 0] })
    }
  }
  return o
}

// the hero at the centre, then a loose ring of neighbours and a scatter of bushes
export function layoutScene(p){
  const r = mulberry32(p.seed*31 + 5), plants = [{ x: 0, z: 0, scale: 1, seed: p.seed }]
  let guard = 0
  while (plants.length < p.grove && guard++ < 400){
    const R = p.groveRadius*(.45 + .55*Math.sqrt(r())), a = r()*Math.PI*2, x = R*Math.cos(a), z = R*Math.sin(a)
    if (plants.some(q => Math.hypot(q.x - x, q.z - z) < p.groveRadius*.42)) continue
    plants.push({ x, z, scale: lerp(.62, 1.05, r()), seed: p.seed + plants.length*101 })
  }
  const bushes = []
  guard = 0
  while (bushes.length < p.bushes && guard++ < 400){
    const R = lerp(p.height*.5 + 2, p.groveRadius + 10, Math.sqrt(r())), a = r()*Math.PI*2
    if (Math.cos(a - Math.PI/4) > .4) continue                       // keep the opening camera's foreground clear
    bushes.push({ x: R*Math.cos(a), z: R*Math.sin(a), scale: lerp(.7, 1.4, r()), seed: p.seed + 5000 + bushes.length*13 })
  }
  return { plants, bushes }
}
