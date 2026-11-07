// The foliage generator. No three.js in here: it writes plain arrays, so the same plants can be fed to any renderer.
//
// A plant is a growth hierarchy (a queue of branches, each section steered by inherited direction, wander and tropism)
// with foliage painted on it: clumps at the branch tips, each a shell of brush strokes over a dark underpainting. Clumps
// are grouped into larger masses so the shading reads as a few big painted volumes rather than one bubble per clump.
// A stroke is four vertices at one anchor point: the shader fans them out facing the camera (or the light, for shadows)
// and lights the whole stroke from that anchor, so light and shadow change stroke by stroke, the way a painter's do.

import { skinWood, skinCell } from './wood-skin.js'

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

export function newBuffer(){ return { pos: [], nor: [], uv: [], wind: [], idx: [], center: [], leaf: [], corner: [], stroke: [], dab: [], patch: [] } }

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
  tiers: t => (1 - t*.94)**.8*(.9 + .1*(1 - (t*6)%1)*Math.min(1, ((t*6)%1)*10)),
}
export const GESTURE_NAMES = Object.keys(GESTURES).concat('free')

// a brush mark is the same real size on any tree, so a bigger tree is painted with more of them. Proportional marks are the cheaper fallback
const markSize = (sp, scale) => sp.cardSize*scale/(sp.realMarks ? sp.size : 1)

// the longest a branch of this order may be
const woodCap = (sp, scale, level) => Math.min(sp.height*scale*sp.maxLimb, 3.2*scale)*[1, 1, .68, .45][Math.min(level, 3)]

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
  const squeeze = Math.min(1, (root[1] + H*1.08 - y0)/span)          // a crown never outgrows the species' height, however many stems feed it
  const warp = (p, stiff) => {
    const t = clamp((p[1] - y0)/span), dx = p[0] - root[0], dz = p[2] - root[2], rho = Math.hypot(dx, dz)
    if (rho < 1e-4) return p.slice()
    const th = Math.atan2(dz, dx), side = 1 + sp.asym*(.5*Math.sin(th + a1) + .3*Math.sin(2*th + a2) + .2*Math.sin(3*th + a3)) + .2*sp.windLean*Math.cos(th - bendTo)   // wind-shaped crowns stream out a little on the side they lean to
    const f = clamp(W*shape(t)*side/Math.max(bandAt(p[1]), .3), .85, 1.5), w = clamp((rho - core*.4)/core)   // a floor of .85: tops are only drawn in gently, or leaders fold into hooks
    const k = lerp(1, stiff ? lerp(1, f, .25) : f, w*w*(3 - 2*w)), lean = t*t*W*sp.windLean   // trunks and stems are too stiff to be drawn out with the crown
    return [root[0] + dx*k + Math.cos(bendTo)*lean, p[1] > y0 ? y0 + (p[1] - y0)*squeeze : p[1], root[2] + dz*k + Math.sin(bendTo)*lean]
  }
  for (const b of branches){
    for (const e of b.trail) e.p = warp(e.p, !b.level || b.leader || b.fork)
    // ease out what's left of any kink; the ends stay put so limbs stay attached
    if (b.level) for (let pass = 0; pass < 2; pass++){ const old = b.trail.map(e => e.p)
      for (let i = 1; i < old.length - 1; i++) b.trail[i].p = old[i].map((v, a) => .25*old[i - 1][a] + .5*v + .25*old[i + 1][a]) }
    // wood bends, it doesn't kink: anything still turning hard in one section is eased until it's a curve
    if (b.level) for (let pass = 0; pass < 10; pass++){
      const T = b.trail; let sharp = 1
      for (let i = 1; i < T.length - 1; i++){ const u = norm(sub(T[i].p, T[i - 1].p)), v = norm(sub(T[i + 1].p, T[i].p)); sharp = Math.min(sharp, dot(u, v)) }
      if (sharp > .75) break
      const old = T.map(e => e.p)
      for (let i = 1; i < old.length - 1; i++) T[i].p = old[i].map((v, a) => .25*old[i - 1][a] + .5*v + .25*old[i + 1][a])
    }
  }
  // shaping stretches wood, so the limit is held again on the shape it ended up with; reseat() brings what each branch carries back with it
  for (const b of branches){
    if (!b.level) continue
    const T = b.trail, cap = woodCap(sp, scale, b.level)*(b.leader ? 1.4 : 1.15)
    let len = 0
    for (let i = 1; i < T.length; i++) len += Math.hypot(...sub(T[i].p, T[i - 1].p))
    if (len > cap){ const o = T[0].p; for (const e of T) e.p = add(o, sub(e.p, o), cap/len) }
    // a main limb climbs as it leaves the trunk: wood this thick doesn't run out flat and turn up at the end
    if (b.level === 1 && !b.continues){
      const o = T[0].p, e = T[T.length - 1].p, want = Math.hypot(e[0] - o[0], e[2] - o[2])*Math.tan(sp.limbRise*Math.PI/180) - (e[1] - o[1])
      if (want > 0) T.forEach((q, i) => { const u = i/(T.length - 1); q.p = [q.p[0], q.p[1] + want*u*(2 - u), q.p[2]] })
    }
  }
  // Fastigiate limbs: each main limb, and all it carries, swings in until it runs close along the trunk
  if (sp.fastigiate) for (const b of branches){
    if (b.level !== 1 || b.continues || !(b.parent.level === 0 || b.parent.leader)) continue
    const o = b.trail[0].p, chord = sub(b.trail[b.trail.length - 1].p, o), l = Math.hypot(...chord), now = Math.acos(clamp(chord[1]/Math.max(l, 1e-4), -1, 1)), turn = now - sp.fastigiate*Math.PI/180
    if (turn <= 0 || l < 1e-4) continue
    const axis = norm(cross(chord, [0, 1, 0])), held = new Set([b])
    for (const k of branches) if (held.has(k.parent)) held.add(k)
    for (const k of held) for (const e of k.trail) e.p = add(o, rotateAbout(sub(e.p, o), axis, turn))
  }
  // A tree stands over its roots: however it leans, the crown's middle stays within reach of the trunk. The rest of the lean is taken back
  // higher up the tree, so the trunk keeps its gesture.
  const reach = H*.12, mid = [0, 2].map(a => tips.reduce((t, q) => t + q.branch.trail[q.section].p[a] - root[a], 0)/tips.length), off = Math.hypot(...mid)
  if (off > reach){
    const back = (off - reach)/off, high = tips.reduce((t, q) => t + clamp((q.branch.trail[q.section].p[1] - root[1])/H), 0)/tips.length
    for (const b of branches) for (const e of b.trail){ const u = clamp((e.p[1] - root[1])/H)/high; e.p = [e.p[0] - mid[0]*back*u, e.p[1], e.p[2] - mid[1]*back*u] }
  }
}

// the tube follows its path: tangents from the points, frames kept square to them
function retangent(b){
  for (let i = 0; i < b.trail.length; i++){
    const e = b.trail[i], next = b.trail[i + 1], prev = b.trail[i - 1]
    e.d = norm(next ? sub(next.p, e.p) : sub(e.p, prev.p))
    e.n = norm(sub(e.n, [e.d[0]*dot(e.n, e.d), e.d[1]*dot(e.n, e.d), e.d[2]*dot(e.n, e.d)]))
  }
}

// Warping and smoothing move a parent's axis out from under its children. Put every branch back on its parent, top of the tree last,
// easing its first sections across so nothing kinks or detaches, and only then read tangents and attachment frames.
function reseat(branches, tips){
  for (const b of branches){
    const pa = b.parent
    if (pa){
      const u = clamp(b.atSection, 0, pa.sections), i = Math.min(pa.sections - 1, Math.floor(u)), a = pa.trail[i], e = pa.trail[i + 1]
      const q = add(add(a.p, sub(e.p, a.p), u - i), b.offset || [0, 0, 0]), off = sub(q, b.trail[0].p)
      b.trail.forEach(ring => { ring.p = add(ring.p, off, 1) })      // the whole branch moves with its parent: only moving its base bends it into a hook
      if (b.continues){                                                 // a continuing branch leaves exactly along its parent's last direction
        const end = pa.trail[pa.sections], from = norm(sub(end.p, pa.trail[pa.sections - 1].p))
        let run = 0
        for (let k = 1; k < Math.min(4, b.trail.length); k++){
          run += Math.hypot(...sub(b.trail[k].p, b.trail[k - 1].p))
          const straight = add(end.p, from, run), w = (1 - k/4)**1.5
          b.trail[k].p = b.trail[k].p.map((v, a) => lerp(v, straight[a], w))
        }
      }
      retangent(b); b.attach = { a: q, d: a.d }
    } else retangent(b)
  }
  for (const t of tips) t.p = t.branch.trail[t.section].p
}

// The pipe model. Sap wood is conserved: a limb's cross-section is the sum of what grows from it, worked from the twigs back to the trunk,
// then scaled so the trunk matches the species. Exponent 2 is the strict form, and gives the slender outer limbs painters draw.
function pipeModel(sp, branches, scale, clumps){
  const E = 2, twig = (.05*scale)**E
  for (const b of branches) b.kids = []
  for (const b of branches) if (b.kept && b.parent) b.parent.kids.push(b)
  // limbs cut back to almost nothing are stubs, not limbs
  for (let i = branches.length - 1; i >= 0; i--){
    const b = branches[i]
    if (b.kept && (b.level || b.stem) && !b.carries && !b.kids.length && (b.stem || (b.cut ?? b.sections) <= 4) && !(b.level <= sp.keepWood)){ b.kept = false; b.parent.kids.splice(b.parent.kids.indexOf(b), 1) }
  }
  const kept = branches.filter(b => b.kept)
  for (let i = kept.length - 1; i >= 0; i--){
    const b = kept[i], ends = !b.kids.some(k => k.continues)
    b.pipe = b.trail.map((_, sec) => {
      let a = ends ? twig*(1 + .5*(1 - sec/b.sections)) : 0
      for (const k of b.kids){
        // a limb's wood leaves gradually over several sections, not all at once at the joint; stems take the whole trunk with them at its top
        const span = b.sections > 10 ? 4 : 2, w = k.stem || k.continues ? 1 : clamp((k.atSection + span - sec)/(2*span))   // a continuation is all the wood at the joint
        a += k.area*w*w*(3 - 2*w)*(k.stem ? .55 : 1)
      }
      return a })
    b.area = b.pipe[0]
  }
  const trunk = kept[0], R = sp.trunkRadius*scale, k = R/trunk.pipe[0]**(1/E)
  for (const b of kept){
    const last = b.cut ?? b.sections
    let rads = b.trail.map((_, sec) => Math.max(b.pipe[Math.min(sec, last)]**(1/E)*k, .03*scale))
    // limbs take area off in steps; a real branch thins smoothly between them
    for (let pass = 0; pass < 3; pass++) rads = rads.map((v, i) => (rads[Math.max(i - 1, 0)] + 2*v + rads[Math.min(i + 1, rads.length - 1)])/4)
    // trunks and stems hold their girth to where they divide: thinning is for limbs, or the trunk grows a waist under its own fork
    // the bole and sub-trunks taper by rule, so the main axis of a tree can never step: whatever leaves it, it carries on
    if (b === trunk){ const n = b.kids.filter(c => c.stem).length; rads = rads.map((_, sec) => { const u = sec/b.sections; return R*lerp(1, BOLE_TOP, u)*(n > 1 && u > .8 ? lerp(1, .55, (u - .8)/.2) : 1) }) }
    else if (b.stem){ const n = trunk.kids.filter(c => c.stem).length, each = R*BOLE_TOP*subGirth(n); rads = rads.map((_, sec) => each*lerp(1, STEM_END, sec/b.sections)) }
    b.trail.forEach((e, sec) => { e.rad = rads[sec] })
    const t = sec => sec/b.sections
    if (b === trunk) b.trail.forEach((e, sec) => { e.rad *= 1 + sp.flare*.28*Math.exp(-t(sec)*b.len/(R*.9)) })   // root flare, by distance rather than along the branch
    else {
      const big = b.parent.level === 0, from = b.parent.trail[Math.round(b.atSection)].rad, limit = from*(b.continues ? 1 : .5)
      if (!b.stem && !b.continues && b.trail[0].rad > limit){ const c = limit/b.trail[0].rad; b.trail.forEach(e => { e.rad *= c }) }     // no limb is wider than the wood it leaves
      if (b.continues && !b.stem) b.trail.forEach((e, sec) => { const u = Math.min(sec/Math.max(b.trail.length - 1, 1), 1); e.rad = lerp(from, Math.min(e.rad, from), u**.8) })   // a continuation is the same wood: it starts at exactly the size it left off, and thins along its whole length
      else if (!b.stem){
        const r0 = b.trail[0].rad, base = Math.min(from*.45, r0*(big ? 2.2 : 1.6))
        if (base > r0) b.trail.forEach((e, sec) => { e.rad += (base - r0)*Math.exp(-t(sec)*8) })   // a shoulder where it leaves its parent
      }
    }
    // a branch that stops inside the foliage keeps going and thins away there, so from below it never reads as a sawn end
    if (!b.root && !b.kids.some(c => c.continues || c.stem)){
      const last = b.cut ?? b.sections, end = b.trail[last], reach = sp.clumpRadius*scale*.9, inside = q => clumps.some(c => { const d = sub(q, c.c); d[1] /= sp.squash; return dot(d, d) < (c.r*.78)**2 })
      b.trail.length = last + 1
      let extra = 0                                                     // it may only run on while it's inside foliage: nothing pokes out
      for (let i = 1; i <= 4; i++){ if (inside(add(end.p, end.d, reach*i/4))) extra = i; else break }
      for (let i = 1; i <= extra; i++){ const u = i/extra
        b.trail.push({ p: add(end.p, end.d, reach*i/4), d: end.d, n: end.n, rad: Math.max(end.rad*(1 - .82*u**.8), .012*scale) }) }
      b.len *= (last + extra)/b.sections; b.sections = last + extra; b.cut = undefined; b.thinned = extra > 0
    }
    b.v0 = b.parent ? lerp(b.parent.v0, b.parent.v1, clamp((b.atSection ?? 0)/b.parent.sections)) : 0                                // bark runs unbroken along a continuing branch
    let arc = 0                                                         // measured on the wood as it finally stands: warping stretched the grown length
    for (let i = 1; i < b.trail.length; i++) arc += Math.hypot(...sub(b.trail[i].p, b.trail[i - 1].p))
    b.v1 = b.v0 + arc                                                   // bark is measured in metres along the wood, so its pattern is the same real size on any tree
  }
}

// Grow the skeleton first and mesh it later: branches that end up carrying no foliage get pruned, so nothing pokes out of the crown.
const BOLE_TOP = .82, STEM_END = .4
const subTrunks = (sp, r) => Math.round(clamp(sp.stems + (r() - .5)*sp.stemVar, 1, 3))
const subGirth = n => n > 1 ? Math.sqrt(1/n)*1.1 : 1                    // wood is conserved through the fork, with a little swell at the crotch

function growSkeleton(sp, r, root, scale, tips){
  let trunks = 1
  const H = sp.height*scale, maxLevel = Math.round(sp.levels), env = ENVELOPE[sp.crown] || ENVELOPE.dome, angle = sp.childAngle*Math.PI/180
  // no single branch runs for metres: reach comes from forking, so each order of wood is shorter than the one that carries it
  const limbCap = level => woodCap(sp, scale, level)
  const dir0 = norm([(r() - .5)*sp.lean*2, 1, (r() - .5)*sp.lean*2]), branches = []
  const sink = .3*sp.flare*sp.trunkRadius*scale                     // the flare starts underground, so roots rise out of it rather than ending in points
  const queue = [{ p: add(root, [0, -sink, 0]), d: dir0, r: sp.trunkRadius*scale, len: H*sp.forkHeight + sink, level: 0, s: 0, parent: null }]
  while (queue.length && branches.length < 1600){
    const b = queue.shift(), sections = [18, 9, 6, 4][Math.min(b.level, 3)], radial = b.stem ? 18 : [36, 12, 7, 5][Math.min(b.level, 3)]
    const ds = b.len/sections, taper = b.level === 0 ? .62 : b.level === 1 ? .6 : .45
    let p = b.p, d = b.d, n = b.n0 ? norm(sub(b.n0, [d[0]*dot(b.n0, d), d[1]*dot(b.n0, d), d[2]*dot(b.n0, d)])) : perpTo(d)
    const sideA = r()*7, side = b.out ?? [Math.cos(sideA), 0, Math.sin(sideA)], trail = [], rec = { ...b, trail, sections, radial, roots: 5 + Math.floor(r()*3), kept: b.level === 0 }
    branches.push(rec)
    for (let i = 0; i <= sections; i++){
      const t = i/sections
      let rad = Math.max(b.r*(1 - (1 - taper)*t), .035*scale)
      if (b.level === 0 && !b.stem) rad *= 1 + sp.flare*.55*Math.exp(-t*7)      // root flare
      else if (b.base) rad += Math.max(0, b.base - b.r)*Math.exp(-t*9)  // a limb starts as wide as the wood it leaves and slims away: a shoulder, not a peg
      trail.push({ p, d, n, rad })
      if (i < sections){
        const wander = randDir(r), level = b.level === 0 ? .2 : b.leader ? .4 : 1
        // a limb sets off along its parent and bends out over its first sections, so forks flow instead of butting together
        const from = b.steerFrom || 0, w = b.target && i >= from && i < from + 4 ? clamp((i - from + 1)/4) : 0, steer = w ? norm([lerp(b.d[0], b.target[0], w*w*(3 - 2*w)), lerp(b.d[1], b.target[1], w*w*(3 - 2*w)), lerp(b.d[2], b.target[2], w*w*(3 - 2*w))]) : d
        const bow = b.level === 0 ? Math.sin(i/sections*5 + sideA)*sp.sinuous*(b.stem ? .08 : .17) : 0      // trunks wander in long slow bends
        const nd = norm(add(add(add(steer, side, bow), wander, sp.gnarl*level), [0, 1, 0], b.leader || b.stem ? Math.max(sp.upward, .06) : sp.upward*(1 + b.level*.6)*(sp.upward > 0 ? lerp(-.3, 1.7, i/sections) : 1) - (b.level >= 2 ? sp.droop : 0) - (b.level >= 1 && !b.leader ? sp.arch*t*t*3 : 0)))
        if (nd[1] < .05 && p[1] < root[1] + H*.24){ nd[1] = .05 }     // no limb dives into the ground
        if (b.level){ const aim = b.target ?? b.d, turned = dot(nd, aim)    // wood wanders, but it doesn't turn back on itself
          if (turned < .55){ const k = (.55 - turned)*1.4; nd[0] += aim[0]*k; nd[1] += aim[1]*k; nd[2] += aim[2]*k; const m = Math.hypot(...nd); nd[0] /= m; nd[1] /= m; nd[2] /= m } }
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
    // The rule every tree follows: one rooted bole, then one to three sub-trunks that between them take all of its wood, and only then branches.
    if (b.level === 0 && !b.stem){
      const n = trunks = subTrunks(sp, r), start = r()*7, spread = sp.stemSpread*Math.PI/180
      for (let i = 0; i < n; i++){
        const az = start + i/n*Math.PI*2 + (r() - .5)*.7, tilt = n > 1 ? spread*lerp(.75, 1.15, r()) : 0, out = rotateAbout(perpTo(tip.d), tip.d, az)
        const target = norm(add([tip.d[0]*Math.cos(tilt), tip.d[1]*Math.cos(tilt), tip.d[2]*Math.cos(tilt)], out, Math.sin(tilt)))
        const fromAt = n > 1 ? Math.round(sections*.8) : sections, from = trail[fromAt], top = b.r*BOLE_TOP, each = top*subGirth(n), ring = n > 1 ? top - each*.92 : 0
        const offset = [out[0]*ring, out[1]*ring, out[2]*ring]              // each sits flush with the bole's edge, so together they fill it
        queue.push({ p: add(from.p, offset), d: n > 1 ? target : tip.d, n0: from.n, target, out, atSection: fromAt, fromSection: fromAt, offset, continues: n === 1, attach: { a: from.p, d: from.d }, r: each,
          len: H*(sp.trunkFrac - sp.forkHeight)*lerp(.92, 1.1, r()), level: 0, stem: true, s: r()*9, parent: rec })
      }
      continue
    }
    const mainAxis = b.level === 0 || b.leader, count = Math.max(2, Math.round((mainAxis ? sp.children : sp.sideShoots || sp.children*.62)/(b.stem ? Math.sqrt(trunks) : 1))), phase = r()*Math.PI*2
    // Nodes: limbs that leave at one height. Maples set theirs in opposite pairs, each pair turned a quarter from the last; cedars carry loose tiers on the main axis.
    const inNode = sp.opposite && b.level <= 2 ? 2 : sp.whorls && mainAxis ? Math.round(sp.whorls) : 0, nodes = inNode ? Math.ceil(count/inNode) : 0, nodeAt = Array.from({ length: nodes }, () => r())
    const slots = Array.from({ length: count }, (_, i) => i)      // height and direction stratified independently: even all round, no spiral
    for (let i = count - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]] }
    for (let c = 0; c < count; c++){
      const node = inNode ? Math.floor(c/inNode) : 0, start = mainAxis ? sp.childStart : .25
      const along = inNode ? lerp(start, .98, (node + .2 + nodeAt[node]*.6)/nodes) + (sp.opposite ? 0 : (r() - .5)*.03) : lerp(b.level === 0 ? sp.childStart : .25, .98, (c + .2 + r()*.6)/count)
      const t = clamp(along), at = t*sections, i = Math.min(sections - 1, Math.floor(at)), f = at - i
      const a = trail[i], e = trail[i + 1], q0 = add(a.p, sub(e.p, a.p), f), pd = a.d
      const az = inNode ? phase + node*(sp.opposite ? Math.PI/2 : 1.1) + (c%inNode)/inNode*Math.PI*2 + (r() - .5)*(sp.opposite ? .15 : .6) : phase + slots[c]/count*Math.PI*2 + (r() - .5)*.8
      const side = rotateAbout(perpTo(pd), pd, az)
      const spread = angle*lerp(.8, 1.2, r())*(b.level === 0 ? lerp(1.15, .75, t) : 1)
      const cd = norm(add([pd[0]*Math.cos(spread), pd[1]*Math.cos(spread), pd[2]*Math.cos(spread)], side, Math.sin(spread)))
      if (b.level === 0) cd[1] = Math.max(cd[1], .16)                // primaries leave the trunk level at the lowest
      else if (!sp.arch && !sp.droop) cd[1] = Math.max(cd[1], .06)    // side wood reaches out or up towards light, never down towards the ground
      const q = q0                                                   // limbs start on the parent's axis, so their open end is never seen
      const base = a.rad*.76, from = pd
      const lenK = b.level === 0 ? env(t) : 1 - .45*t, lenBase = b.level === 0 ? H*.56 : b.len
      queue.push({ p: q, d: from, target: cd, base, fromSection: i + 1, atSection: at, attach: { a: q0, d: from }, r: Math.max(a.rad*(b.level === 0 ? .62 : .72), .045*scale), len: Math.min(lenBase*sp.lengthRatio*lenK*lerp(.82, 1.15, r()), limbCap(b.level + 1)*lerp(.85, 1, r())), level: b.level + 1, s: r()*9, parent: rec })
    }
    // A round-headed tree has no leader: a sub-trunk dissolves into a fork of near-equal limbs that share its wood, so nothing runs up through the crown as a spear.
    if (b.stem && sp.forkTop){
      rec.forks = true
      for (let i = 0, n = r() < .4 ? 3 : 2, start = r()*7; i < n; i++){
        const out = rotateAbout(perpTo(tip.d), tip.d, start + i/n*Math.PI*2 + (r() - .5)*.6), tilt = sp.forkAngle*Math.PI/180*lerp(.8, 1.2, r()), target = norm(add([tip.d[0]*Math.cos(tilt), tip.d[1]*Math.cos(tilt), tip.d[2]*Math.cos(tilt)], out, Math.sin(tilt)))
        queue.push({ p: tip.p, d: tip.d, n0: tip.n, target, fork: true, r: tip.rad*.7, fromSection: sections, atSection: sections, attach: { a: tip.p, d: tip.d }, len: Math.min(H*(1 - sp.trunkFrac)*.5, limbCap(1)*1.1)*lerp(.85, 1.1, r()), level: 1, s: r()*9, parent: rec })
      }
      continue
    }
    // the terminal continuation: without it a crown looks clipped
    queue.push({ p: tip.p, d: tip.d, n0: tip.n, target: norm(add(tip.d, randDir(r), .18)), r: tip.rad*.97, continues: true, fromSection: sections, atSection: sections, leader: b.level === 0, len: b.level === 0 ? Math.min(H*(1 - sp.trunkFrac)*.55*sp.leader, limbCap(1)*1.2) : Math.min(b.len*sp.lengthRatio*.8, limbCap(b.level + 1)), level: b.level + 1, s: b.s, parent: rec })
  }
  return branches
}

// What a branch finally looks like, ring by ring: position, frame, girth, and how deep in the crown it sits.
function woodRings(sp, scale, b, clumps){
  const { sections, trail } = b, last = Math.min(b.cut ?? sections, trail.length - 1)
  const rings = []
  for (let i = 0; i <= last; i++){
    const t = i/sections, { p, d, n } = trail[i]
    let rad = trail[i].rad, buried = 0
    if (b.level) for (const c of clumps){ const q = sub(p, c.c); q[1] /= sp.squash; buried = Math.max(buried, clamp((c.r*1.6 - Math.hypot(...q))/(c.r*.7))) }
    if (!b.continues && !b.stem) buried *= clamp((t - .3)/.3)            // the start of a limb belongs to the trunk, not the crown
    if (b.level) rad *= 1 - .2*buried                                  // and inside, wood slims down so it can't show as slabs between plates
    rings.push({ p, d, n, b: cross(d, n), r: rad, buried, thick: b.root ? .45 : clamp(rad/.12), v: (b.root ? t*b.len : b.v0 + t*(b.v1 - b.v0))*1.3 })
  }
  return rings
}

// Thick wood becomes one skin; only wood too fine to matter stays a simple tapered tube, growing out of that skin at the same size.
function emitWood(sp, r, root, scale, branches, wood, clumps){
  const H = sp.height*scale, axes = [], sway = q => .32*scale*(clamp((q[1] - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5)
  for (const b of branches) if (b.kept && b.continues) b.parent.continued = true
  const groupOf = b => { while (b.continues) b = b.parent; return b }, groups = new Map(), all = new Map(), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (const b of branches) if (b.kept){
    all.set(b, woodRings(sp, scale, b, clumps))
    for (const e of all.get(b)) if (e.r > .08*scale) for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], e.p[a]); hi[a] = Math.max(hi[a], e.p[a]) }
  }
  // Where a stem meets its fork limbs their fields add up and the skin would swell into a knuckle, so each slims near the joint by just what the sum puts back.
  const easeJoint = (rings, fromStart, parts) => {
    const k = 1/(1 + Math.log(parts)/7), at = rings[fromStart ? 0 : rings.length - 1], reach = at.r*3
    for (const e of rings){ const u = clamp(Math.hypot(...sub(e.p, at.p))/reach); e.r *= lerp(k, 1, u*u*(3 - 2*u)) }
  }
  for (const [b, rings] of all) if (b.kids?.some(k => k.fork && k.kept)){
    const forks = b.kids.filter(k => k.fork && k.kept)
    easeJoint(rings, false, forks.length + 1)
    for (const k of forks) easeJoint(all.get(k), true, forks.length + 1)
  }
  const fine = Math.max(.05*scale, skinCell(lo, hi, .062*scale)*1.7)         // wood finer than the skin can hold stays a tube, or it breaks into dashes
  for (const b of branches){
    if (!b.kept) continue
    const rings = all.get(b)
    let solid = 0
    while (solid < rings.length && rings[solid].r >= fine) solid++
    if (solid > 1){ const g = groupOf(b); if (!groups.has(g)) groups.set(g, groups.size); axes.push({ group: groups.get(g), rings: rings.slice(0, solid) }) }
    if (solid >= rings.length) continue
    const first = Math.max(solid - 4, 0), radial = 8, start = wood.pos.length/3                // the tube begins well inside the skin, a little narrower, and comes out through its end: no join to see
    const tube = rings.slice(first).map((e, i) => first + i < solid - 1 ? { ...e, r: e.r*.88 } : e)
    tube.forEach((e, i) => {
      for (let k = 0; k <= radial; k++){
        const a = k/radial*Math.PI*2, ca = Math.cos(a), sa = Math.sin(a), nr = add([e.n[0]*ca, e.n[1]*ca, e.n[2]*ca], e.b, sa), q = add(e.p, nr, e.r)
        wood.pos.push(...q); wood.nor.push(...nr); wood.uv.push(k/radial, e.v); wood.wind.push(root[0], root[2], sway(q), 0); wood.center.push(e.r, root[1], root[2]); wood.leaf.push(e.thick, e.buried, 1)
      }
      if (i < tube.length - 1) for (let k = 0; k < radial; k++){ const p = start + i*(radial + 1) + k, c = p + radial + 1; wood.idx.push(p, p + 1, c, p + 1, c + 1, c) }
    })
    const e = tube[tube.length - 1], tip = add(e.p, e.d, e.r*.9), centre = wood.pos.length/3, ring = start + (tube.length - 1)*(radial + 1)
    wood.pos.push(...tip); wood.nor.push(...e.d); wood.uv.push(0, e.v); wood.wind.push(root[0], root[2], sway(tip), 0); wood.center.push(e.r, root[1], root[2]); wood.leaf.push(0, e.buried, 1)
    for (let k = 0; k < radial; k++) wood.idx.push(ring + k, ring + k + 1, centre)
  }
  skinWood(axes, wood, sway, root, .062*scale)
}

// Surface roots: buttresses that run out from the trunk and sink into the ground, so a tree grows out of the land rather than sitting on it.
function growRoots(sp, r, root, scale, branches){
  if (sp.height < 4 || !sp.roots) return
  const trunk = branches[0], R = sp.trunkRadius*scale, n = trunk.roots, spin = r()*7
  for (let i = 0; i < n; i++){
    // A root is the trunk's foot: it leaves from inside the base and runs out along the ground, thick to thin, sinking as it goes. It never comes down from above.
    const a = spin + (i + (r() - .5)*.5)/n*Math.PI*2, len = R*sp.roots*lerp(2.4, 4.2, r()), sections = 12, trail = [], bend = (r() - .5)*.9, wide = lerp(.36, .52, r()), rise = lerp(.6, .85, r())
    for (let k = 0; k <= sections; k++){
      const t = k/sections, th = a + bend*t*t, rho = R*.3 + len*t, x = root[0] + Math.cos(th)*rho, z = root[2] + Math.sin(th)*rho, rad = R*lerp(wide, .06, t**.72)
      trail.push({ p: [x, groundHeight(x, z) + rad*rise*(1 - t*t) - R*.34*t*t*t, z], d: [0, 0, 1], n: [0, 1, 0], rad })
    }
    for (let k = 0; k <= sections; k++){ const e = trail[k], q = trail[k + 1] || trail[k - 1], d = norm(k < sections ? sub(q.p, e.p) : sub(e.p, q.p))
      e.d = d; e.n = norm(sub([0, 1, 0], [d[0]*d[1], d[1]*d[1], d[2]*d[1]])) }
    branches.push({ trail, sections, radial: 14, roots: 3, kept: true, continued: true, root: true, level: 1, s: r()*9, r: R*wide, len, p: trail[0].p, d: trail[0].d })
  }
}

// Ivy: vines climb the trunk and stems, leaves gathering in loose dark clusters. It wraps the wood rather than sitting on it.
function emitIvy(sp, r, root, scale, branches, out){
  // ivy is a plant of its own: its leaves are the same real size on any tree, so a bigger tree carries more of them, not bigger ones
  const leaf = scale/sp.size, more = Math.max(1, sp.size), vines = Math.round(sp.ivy*14*more), wood = branches.filter(b => !b.root && b.kept && (b.level === 0 || (b.level === 1 && b.trail[0].rad > .2*scale)))
  const H = sp.height*scale
  for (let v = 0; v < vines && wood.length; v++){
    const b = wood[Math.floor(r()*wood.length)], last = Math.min(Math.round(lerp(.25, 1, r()**.6)*(b.sections - 1)), (b.cut ?? b.sections) - 1), first = b.level === 0 && !b.stem ? 0 : Math.floor(r()*3)
    let a = r()*Math.PI*2, gap = 0
    for (let i = first; i <= last; i++){
      const e = b.trail[i]
      if (e.p[1] < root[1] + .05) continue
      if (gap-- > 0){ a += (r() - .5)*.5; continue }
      const bitang = cross(e.d, e.n), cluster = Math.round((2 + Math.floor(r()*4))*more*more), span = Math.hypot(...sub(b.trail[i + 1].p, e.p))
      for (let c = 0; c < cluster; c++){
        a += (r() - .5)*.9
        const nr = add([e.n[0]*Math.cos(a), e.n[1]*Math.cos(a), e.n[2]*Math.cos(a)], bitang, Math.sin(a)), q = add(add(e.p, nr, e.rad*1.08), e.d, (r() - .5)*span), size = lerp(.3, .62, r())*leaf
        addStroke(out, r, { q, n: nr, t: norm(add(randDir(r), e.d, -.6)), len: size, wid: size*.9, tile: [Math.floor(r()*4), Math.floor(r()*3.99)], pivot: e.p, ao: 1, tone: r(),
          wind: [root[0], root[2], .32*scale*(clamp((q[1] - root[1])/H)**1.6), .3] })
      }
      gap = Math.floor(r()*3)                                           // gaps along the vine, so it reads as clusters, not a sleeve
    }
  }
}

// Twigs: the finest wood. They carry on past the end of each outer branch, out through the paint, each finishing in a small spray of leaves.
// This is what stops a limb from simply ending at the crown, and what breaks the silhouette at leaf scale.
// Where a limb goes into the foliage it must not look sawn off by the plates. Each entry breaks the limb up into a few twigs fanning ahead of
// it, and paint comes back along the wood in a sleeve of dabs, so wood and leaf overlap instead of meeting at an edge.
function emitEntries(sp, r, root, scale, branches, wood, foliage, clumps, form){
  if (!sp.shelves || !clumps.length) return
  const H = sp.height*scale, R = sp.clumpRadius*scale, len0 = markSize(sp, scale), least = .05*scale
  const swayAt = y => .32*scale*(clamp((y - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5)
  const clumpAt = q => clumps.find(c => { const d = sub(q, c.c); d[1] /= sp.squash; return dot(d, d) < (c.r*.95)**2 })
  for (const b of branches){
    if (!b.kept || b.root) continue
    const last = b.cut ?? b.sections
    for (let i = 1, was = clumpAt(b.trail[0].p); i <= last; i++){
      const ring = b.trail[i], cl = clumpAt(ring.p), entering = cl && !was
      was = cl
      if (!entering || ring.rad < least) continue
      const out = b.trail[i - 1], side = perpTo(ring.d), other = cross(ring.d, side), wind = [root[0], root[2], swayAt(ring.p[1]), .5]
      // twigs leave a little before the foliage does, so the limb has already divided when it goes in
      for (let t = 0, n = clamp(2 + Math.round(ring.rad/(.1*scale)), 2, 5), spin = r()*7; t < n; t++){
        const a = spin + t/n*Math.PI*2 + (r() - .5)*.7, away = add([side[0]*Math.cos(a), side[1]*Math.cos(a), side[2]*Math.cos(a)], other, Math.sin(a))
        const from = add(out.p, away, out.rad*.6), inward = sub(add(cl.c, randDir(r), cl.r*.2), from), dir = norm(add(norm(inward), away, lerp(.15, .35, r()))), off = perpTo(dir), off2 = cross(dir, off), len = Math.hypot(...inward)*lerp(.62, .85, r()), start = wood.pos.length/3   // twigs carry on into the foliage: they end near the clump's core, never on its skin
        for (let k = 0; k <= 3; k++){
          const u = k/3, c = add(add(from, dir, len*u), [0, 1, 0], -.1*len*u*u), rad = lerp(Math.min(out.rad*.42, .09*scale), .03*scale, u)
          for (let e = 0; e <= 5; e++){
            const th = e/5*Math.PI*2, nr = add([off[0]*Math.cos(th), off[1]*Math.cos(th), off[2]*Math.cos(th)], off2, Math.sin(th)), q = add(c, nr, rad)
            wood.pos.push(...q); wood.nor.push(...nr); wood.uv.push(e/5, u); wood.wind.push(root[0], root[2], swayAt(q[1]), 0)
            wood.center.push(rad, root[1], root[2]); wood.leaf.push(-1, .5 + .5*u, 1)             // darkening toward the crown's shadow as it goes in; -1: wood that only exists inside foliage
          }
          if (k < 3) for (let e = 0; e < 5; e++){ const p = start + k*6 + e, c2 = p + 6; wood.idx.push(p, p + 1, c2, p + 1, c2 + 1, c2) }
        }
      }
      // the sleeve: one full ring of dabs at the entry and a thinner, smaller one back along the bare wood
      for (const [back, count, size] of [[0, 6 + Math.round(ring.rad/(.06*scale)), .62], [.6, 3 + Math.round(ring.rad/(.1*scale)), .4]])
        for (let k = 0; k < count; k++){
          const a = r()*Math.PI*2, away = add([side[0]*Math.cos(a), side[1]*Math.cos(a), side[2]*Math.cos(a)], other, Math.sin(a)), at = add(ring.p, sub(out.p, ring.p), back + (r() - .5)*.3)
          const q = add(at, away, ring.rad*lerp(1, 1.5, r())), f = form(q, cl.shelf), len = len0*size*lerp(.8, 1.2, r())
          addStroke(foliage, r, { q, n: norm(add(f.n, away, .25)), t: norm(add(ring.d, randDir(r), .5)), len, wid: len*sp.brushWidth, tile: randTile(r, true), pivot: cl.pivot, ao: clamp(.3 + .3*(f.onShelf[1]*.5 + .5), .1, 1), tone: clamp(cl.tone + (r() - .5)*.2), wind, clump: cl.id })
        }
    }
  }
}

function prune(sp, tips, clumps, branches, root, scale){
  for (const c of clumps) if (c.anchor){                                // shelves: the wood kept is exactly the wood carrying a clump
    const { b, sec } = c.anchor
    b.cut = Math.max(b.cut ?? 0, sec); b.carries = true
    for (let w = b; w && !w.kept; w = w.parent) w.kept = true
  }
  for (const t of clumps.shelves ? [] : tips){
    const held = sp.hang > 0 || clumps.some(c => { const q = sub(c.c, t.p); q[1] /= sp.squash; return dot(q, q) < (c.r*.6)**2 })
    if (!held) continue
    t.branch.cut = Math.max(t.branch.cut ?? 0, t.section)
    for (let b = t.branch; b && !b.kept; b = b.parent) b.kept = true
  }
  // a tree's framework is there whether or not leaves land on it: limbs down to this order stay, and foliage follows them afterwards
  if (sp.keepWood){
    const low = root[1] + sp.height*scale*sp.crownLine            // wood that ends below the crown has no light to reach for: only what climbs into the crown stays
    for (const b of branches) if (b.level <= sp.keepWood && !b.root && b.trail[b.trail.length - 1].p[1] > low + (b.level > 1 ? sp.height*scale*.12 : 0)) for (let w = b; w && !w.kept; w = w.parent) w.kept = true
  }
  // wood stops at the last thing it carries: past that it would only be a bare stub
  for (const b of branches) if (b.kept && b.parent && !b.stem && b.atSection != null) b.parent.cut = Math.max(b.parent.cut ?? 0, Math.ceil(b.atSection))
}

// Wood never shares space. Runs on the finished skeleton, with final radii: the thinner of two touching branches swings away about its own joint,
// taking everything it carries with it, foliage included. Whatever still touches after that is removed, so the rule holds without exception. Geometry only: girth and taper come after this.
function separateWood(sp, branches, clumps, final = false){
  const kept = branches.filter(b => b.kept && !b.root), scaleOf = 1
  for (const b of kept){
    b.kids = kept.filter(k => k.parent === b); b.owned = clumps.filter(c => c.anchor?.b === b)
    b.last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    // the joint: where a branch is still leaving its parent, and sharing wood with it is what a joint is
    const pa = b.parent, o = b.trail[0].p, clear = pa ? pa.trail[Math.min(Math.round(b.atSection ?? 0), pa.trail.length - 1)].rad*1.4 + b.trail[0].rad : 0
    b.free = 0
    if (pa) while (b.free < b.last && Math.hypot(...sub(b.trail[b.free].p, o)) < clear) b.free++
  }
  const joined = (a, b) => a.parent === b || b.parent === a
  const excused = (a, i, b, k) => {
    if (a.stem && !b.level && !b.stem || b.stem && !a.level && !a.stem) return true             // the trunk is a cone between its stems
    if (a.parent === b) return i <= a.free
    if (b.parent === a) return k <= b.free
    if (a.parent === b.parent) return i <= a.free && k <= b.free                                // siblings leaving together
    if (a.parent && a.parent.parent === b || a.parent && a.parent.continues && a.parent.parent === b) return i <= a.free + 1 && a.atSection < 2
    if (b.parent && b.parent.parent === a || b.parent && b.parent.continues && b.parent.parent === a) return k <= b.free + 1 && b.atSection < 2
    return false
  }
  // branch boxes first: most pairs of branches are nowhere near each other, so most of the tree costs one comparison
  const touching = () => {
    for (const b of kept){
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
      for (let i = 0; i <= b.last; i++){ const e = b.trail[i]; for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], e.p[a] - e.rad); hi[a] = Math.max(hi[a], e.p[a] + e.rad) } }
      b.lo = lo; b.hi = hi
    }
    const found = []
    for (let x = 1; x < kept.length; x++) for (let y = 0; y < x; y++){
      const a = kept[x], b = kept[y]
      if (a.lo[0] > b.hi[0] || b.lo[0] > a.hi[0] || a.lo[1] > b.hi[1] || b.lo[1] > a.hi[1] || a.lo[2] > b.hi[2] || b.lo[2] > a.hi[2]) continue
      let worst = null
      for (let i = 1; i <= a.last; i++) for (let k = 1; k <= b.last; k++){
        if (excused(a, i, b, k)) continue
        const p = a.trail[i], q = b.trail[k], dx = p.p[0] - q.p[0], dy = p.p[1] - q.p[1], dz = p.p[2] - q.p[2], near = a.trail[i - 1].rad + b.trail[k - 1].rad + 1.2*scaleOf
        if (dx*dx + dy*dy + dz*dz > near*near) continue
        const h = segmentGap(a.trail[i - 1], p, b.trail[k - 1], q)
        if (h.depth > 0 && (!worst || h.depth > worst.depth)) worst = h
      }
      if (worst) found.push({ ...worst, a, b })
    }
    return found
  }
  const carried = b => [b, ...b.kids.flatMap(carried)], lastStem = b => b.stem && kept.filter(k => k.stem).length < 2   // a tree always keeps a stem
  // thinner wood gives way to thicker; the trunk never moves
  const giveWay = b => !b.level || b.stem ? 0 : 1
  const yields = c => giveWay(c.a) !== giveWay(c.b) ? (giveWay(c.a) ? [c.a, c.b, 1] : [c.b, c.a, -1]) : (c.a.area ?? 0) < (c.b.area ?? 0) ? [c.a, c.b, 1] : [c.b, c.a, -1]
  // Last, on the finished girth: a limb that still brushes another slims along its length, easing in from where it leaves, and everything it
  // carries slims with it. No step anywhere, because each piece starts at the size the wood it leaves has become there.
  if (final){
    for (let round = 0; round < 8; round++){
      const hits = touching().sort((p, q) => q.depth - p.depth), done = new Set()
      if (!hits.length) break
      for (const c of hits){
        const [m, , sign] = yields(c), own = sign > 0 ? c.ra : c.rb, f = Math.max(1 - c.depth*1.2/Math.max(own, 1e-3), .55)
        if (!m.level || done.has(m)) continue
        m.trail.forEach((e, i) => { const u = clamp(i/4); e.rad = Math.max(e.rad*lerp(1, f, u*u*(3 - 2*u)), .012) })
        for (const k of carried(m)){ if (k !== m){ for (const e of k.trail) e.rad = Math.max(e.rad*f, .012) } done.add(k) }
      }
      if (!done.size) break
    }
    // anything still touching couldn't get clear. A side branch can go without leaving a stump, because the wood it left simply carries on, and its
    // leaves go with it: foliage never stays behind without wood.
    for (let round = 0; round < 10; round++){
      const hits = touching(), gone = new Set()
      if (!hits.length) break
      for (const c of hits){
        const side = b => b.level && !b.continues, m = side(c.a) && (!side(c.b) || (c.a.area ?? 0) < (c.b.area ?? 0)) ? c.a : side(c.b) ? c.b : null
        if (m && !gone.has(m.parent)) gone.add(m)
      }
      if (!gone.size) break
      for (const m of gone){
        const all = carried(m)
        m.parent.kids.splice(m.parent.kids.indexOf(m), 1)
        for (const b of all){
          b.kept = false; if (kept.includes(b)) kept.splice(kept.indexOf(b), 1)
          for (const q of b.owned) if (clumps.includes(q)) clumps.splice(clumps.indexOf(q), 1)
        }
      }
    }
    // wood ends at the last thing it carries: bare length past that is trimmed back and thinned to a tip, and wood carrying nothing goes
    if (clumps.shelves) for (let i = kept.length - 1; i >= 0; i--){
      const b = kept[i], kids = kept.filter(k => k.parent === b), reach = Math.max(-1, ...b.owned.filter(q => clumps.includes(q)).map(q => q.anchor.sec), ...kids.map(k => Math.ceil(k.atSection ?? 0)))
      if (b.level <= sp.keepWood) continue
      if (reach < 0){ if (b.level || (b.stem && !lastStem(b))){ b.kept = false; kept.splice(i, 1) } continue }
      if (kids.some(k => k.continues) || reach + 2 > b.last) continue
      const end = Math.min(reach + 2, b.trail.length - 1), start = Math.max(end - 5, 1)
      b.cut = end; b.last = end
      for (let k = start; k <= end; k++){ const u = (k - start)/Math.max(end - start, 1), e = b.trail[k]; e.rad = Math.max(e.rad*(1 - .85*u*u), .012) }
    }
    return 0
  }
  for (let pass = 0; pass < 14; pass++){
    const hits = touching().sort((p, q) => q.depth - p.depth)
    if (!hits.length) break
    const moved = new Set()
    for (const c of hits){
      const [first, , sign] = yields(c)
      let m = first
      while (m.continues && m.parent.level) m = m.parent                // a continuation is the same limb: the whole axis swings, from where it started, so nothing kinks
      if (!m.level && !m.stem || moved.has(m) || m.stem && (m.turned ?? 0) > .14) continue   // a stem is a trunk: limbs give way to it, and it barely moves
      const o = m.trail[0].p, arm = sub(c.at, o), push = [c.push[0]*sign, c.push[1]*sign, c.push[2]*sign], axis = cross(arm, push), l = Math.hypot(...axis)
      if (l < 1e-5) continue
      const turn = Math.min(Math.atan2(c.depth*1.25, Math.max(Math.hypot(...arm), .2)), m.stem ? .05 : .3), u = [axis[0]/l, axis[1]/l, axis[2]/l]
      for (const b of carried(m)){
        for (const e of b.trail){ e.p = add(o, rotateAbout(sub(e.p, o), u, turn)); e.d = rotateAbout(e.d, u, turn); e.n = rotateAbout(e.n, u, turn) }
        for (const q of b.owned) q.c = add(o, rotateAbout(sub(q.c, o), u, turn))
        moved.add(b)
      }
      m.turned = (m.turned ?? 0) + turn
    }
  }
  let removed = 0
  for (let hits = touching(), round = 0; hits.length && round < 12; hits = touching(), round++){
    const gone = new Set()
    for (const c of hits.sort((p, q) => q.depth - p.depth)){
      const [m, , sign] = yields(c)
      if (c.depth < (sign > 0 ? c.ra : c.rb)*.45) continue              // shallow: slimmed once the girth is final
      if ((!m.level && !m.stem) || lastStem(m) || gone.has(c.a) || gone.has(c.b)) continue
      for (const b of carried(m)) gone.add(b)
      m.parent.kids.splice(m.parent.kids.indexOf(m), 1)
    }
    if (!gone.size) break
    for (const b of gone){
      b.kept = false; removed++; kept.splice(kept.indexOf(b), 1)
      for (const q of b.owned) clumps.splice(clumps.indexOf(q), 1)
    }
  }
  // wood left carrying nothing goes too, from the outside in: a bare stick isn't a branch
  if (clumps.shelves) for (let i = kept.length - 1; i >= 0; i--){
    const b = kept[i]
    if (b.level > sp.keepWood && !b.owned.length && !kept.some(k => k.parent === b)){ b.kept = false; removed++; kept.splice(i, 1) }
  }
  return removed
}
// the closest approach of two tapering lengths of wood: how deep they overlap, where, and which way apart
function segmentGap(p1, q1, p2, q2){
  const d1 = sub(q1.p, p1.p), d2 = sub(q2.p, p2.p), w = sub(p1.p, p2.p), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, w), c = dot(d1, w), b = dot(d1, d2), D = a*e - b*b
  let s = D > 1e-9 ? clamp((b*f - c*e)/D) : 0, t = e > 1e-9 ? (b*s + f)/e : 0
  if (t < 0){ t = 0; s = a > 1e-9 ? clamp(-c/a) : 0 } else if (t > 1){ t = 1; s = a > 1e-9 ? clamp((b - c)/a) : 0 }
  const pa = add(p1.p, d1, s), pb = add(p2.p, d2, t), gap = sub(pa, pb), dist = Math.hypot(...gap), touch = lerp(p1.rad, q1.rad, s) + lerp(p2.rad, q2.rad, t)
  return { depth: touch - dist, ra: lerp(p1.rad, q1.rad, s), rb: lerp(p2.rad, q2.rad, t), at: pa, push: dist > 1e-5 ? [gap[0]/dist, gap[1]/dist, gap[2]/dist] : [0, 1, 0] }
}

// Leaves follow the wood. A mass cut off from the crown would be a ball on a stick, so foliage grows back down its branch, smaller as it goes, until it joins
// the rest of the crown or runs out of reach. The wood is final by now, so this adds nothing for separation to undo.
function carryAlongLimbs(sp, clumps, scale){
  if (!sp.sleeve || !clumps.shelves || clumps.length < 3) return
  const near = (a, b, k) => { const d = sub(a.c, b.c); d[1] /= sp.squash; return dot(d, d) < ((a.r + b.r)*k)**2 }
  const groups = () => {
    const id = clumps.map((_, i) => i), find = i => { while (id[i] !== i) i = id[i] = id[id[i]]; return i }
    for (let i = 0; i < clumps.length; i++) for (let j = 0; j < i; j++) if (near(clumps[i], clumps[j], 1.05)) id[find(i)] = find(j)
    const sets = new Map()
    clumps.forEach((c, i) => { const g = find(i); if (!sets.has(g)) sets.set(g, []); sets.get(g).push(c) })
    return [...sets.values()].sort((a, b) => b.reduce((t, c) => t + c.r**3, 0) - a.reduce((t, c) => t + c.r**3, 0))
  }
  const reach = sp.sleeve*scale
  for (const island of groups().slice(1, 9)){
    const from = island.find(c => c.anchor?.b?.kept)
    if (!from) continue
    const own = new Set(island)
    let b = from.anchor.b, sec = Math.min(from.anchor.sec, b.trail.length - 1), walked = 0, last = from.anchor.b.trail[sec].p, done = false
    while (b && !done && walked < reach){
      for (let i = sec; i >= 0 && !done; i--){
        const e = b.trail[i], step = Math.hypot(...sub(e.p, last)), r = from.r*lerp(.8, .55, walked/reach)
        if (step < r*.9) continue
        walked += step; last = e.p
        const c = { c: add(e.p, [0, 1, 0], r*sp.squash*.2), r, shelf: from.shelf, rim: from.rim, mass: from.mass, anchor: { b, sec: i, p: e.p } }
        if (clumps.some(o => !own.has(o) && near(o, c, .95))) done = true
        clumps.push(c); own.add(c)
        if (walked >= reach) done = true
      }
      if (!b.level || b.stem) break
      sec = Math.min(Math.round(b.atSection ?? 0), b.parent.trail.length - 1); b = b.parent
    }
  }
}

// A Ghibli tree shows its trunk and very little else: leaves clothe every limb above the crown line, so a crown is a full body of foliage, not masses on sticks.
// Wherever wood above the line has no leaves over it, a clump grows on that wood, joining the mass of whatever foliage is nearest.
function clotheWood(sp, r, branches, clumps, root, scale){
  if (!sp.cover || !clumps.length) return
  const H = sp.height*scale, line = root[1] + H*sp.crownLine, R = sp.clumpRadius*scale, room = clumps.length*sp.cover*1.4 + 24
  const over = (o, p, k) => { const dx = o.c[0] - p[0], dy = (o.c[1] - p[1])/sp.squash, dz = o.c[2] - p[2]; return dx*dx + dy*dy + dz*dz < (o.r*k)**2 }
  let added = 0
  const limbOf = b => { while (b.parent && !(b.level === 1 || b.stem)) b = b.parent; return b }
  const cen = [0, 1, 2].map(a => clumps.reduce((t, q) => t + q.c[a], 0)/clumps.length), bx = [...cen, Math.max(...clumps.map(q => Math.hypot(q.c[0] - cen[0], q.c[2] - cen[2]) + q.r), .1), Math.max(...clumps.map(q => Math.abs(q.c[1] - cen[1]) + q.r*sp.squash), .1)]
  for (let n = branches.length - 1; n >= 0 && added < room; n--){
    const b = branches[n]
    if (!b.kept || b.root || (!b.level && !b.stem)) continue
    for (let i = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1); i >= 0 && added < room; i--){
      const p = b.trail[i].p
      if (p[1] < line || clumps.some(o => over(o, p, .8))) continue
      if (sp.clotheRad && b.trail[i].rad > sp.clotheRad*scale) continue                  // big limbs are for seeing: leaves live on the finer wood
      if (sp.shell){ const u = Math.hypot((p[0] - bx[0])/bx[3], (p[1] - bx[1])/bx[4], (p[2] - bx[2])/bx[3]); if (u < 1 - sp.shell) continue }   // the heart of the crown stays hollow
      const mine = limbOf(b)
      let near = null, best = 1e12
      for (const o of clumps){ if (sp.ownBough && o.anchor?.b && limbOf(o.anchor.b) !== mine) continue; const q = sub(o.c, p), d = dot(q, q); if (d < best){ best = d; near = o } }
      if (!near) for (const o of clumps){ const q = sub(o.c, p), d = dot(q, q); if (d < best){ best = d; near = o } }
      const rad = R*lerp(.6, .85, r())*Math.max(sp.cover, .6), c = add(p, [(r() - .5)*rad*.3, rad*sp.squash*.15, (r() - .5)*rad*.3])
      if (near.shelf) near.shelf.bottom = Math.min(near.shelf.bottom, c[1] - rad*sp.squash*.7)
      clumps.push({ c, r: rad, shelf: near.shelf, rim: Math.min(near.rim ?? .5, .7), mass: near.mass, anchor: { b, sec: i, p } }); added++
    }
  }
}

// A full crown reads as masses only if it is really made of them. Each big mass divides into lobes the size a painter blocks in: every lobe gets its own flat underside,
// its own terminator and its own round form, and draws in on itself a little, so a shaded valley opens between lobes without leaving the wood.
function splitLobes(sp, r, clumps, scale){
  if (!sp.lobes || clumps.length < sp.lobes*2) return
  // Painters don't block in equal balls: more lobes are found than wanted, then some merge with a neighbour, so a crown has a big, a middle and a small.
  const K = Math.round(sp.lobes), { centers, asg } = kmeans(clumps.map(c => [c.c[0], c.c[1]*1.5, c.c[2]]), Math.round(K*1.6), r), R = sp.clumpRadius*scale
  const sets = centers.map(() => [])
  clumps.forEach((c, i) => sets[asg[i]].push(c))
  const mid = g => [0, 1, 2].map(a => g.reduce((t, q) => t + q.c[a], 0)/g.length)
  for (let live = sets.filter(g => g.length); live.length > K; live = live.filter(g => g.length)){
    const a = live[Math.floor(r()*live.length)], m = mid(a)
    let b = null, best = 1e12
    for (const g of live) if (g !== a){ const q = sub(mid(g), m), d = dot(q, q); if (d < best){ best = d; b = g } }
    b.push(...a.splice(0))
  }
  for (const g of sets){
    if (!g.length) continue
    const hue = r(), pull = lerp(.5, 1.25, r())
    const m = [0, 1, 2].map(a => g.reduce((t, q) => t + q.c[a], 0)/g.length)
    if (sp.tighten) for (const c of g){ const to = sub(m, c.c), far = Math.hypot(...to), uneven = lerp(.15, 1.5, noise3(c.c[0]*.5, c.c[1]*.5, c.c[2]*.5)), k = Math.min(sp.tighten*pull*uneven*(sp.envW ? 1.5 : 1), c.r*(sp.envW ? .7 : .5)/Math.max(far, 1e-3));   // an uneven pull: some edges tuck in, some stay out, so a lobe isn't a ball
      c.c = [c.c[0] + to[0]*k, c.c[1] + to[1]*k*.6, c.c[2] + to[2]*k] }   // never far enough to leave its wood
    const low = Math.min(...g.map(c => c.c[1] - c.r*sp.squash*.7)), top = Math.max(...g.map(c => c.c[1] + c.r*sp.squash)), rx = Math.max(...g.map(c => Math.hypot(c.c[0] - m[0], c.c[2] - m[2]) + c.r*.6), R*.8)
    const sh = { tips: [], hue, cx: m[0], cz: m[2], bottom: low, rx, h: Math.max(top - low, R*.6), phase: r()*7 }
    for (const c of g){ c.shelf = sh; c.mass = [m[0], low + sh.h*.4, m[2]] }
  }
}

// A real crown is one body with one outline. Each species has an envelope: its spread, and how high it is widest. Wood straying past it is cut back,
// and wherever the shell has no leaves a twig grows out from the nearest wood to carry some, so the outline fills in without anything floating.
function fitCrown(sp, r, branches, clumps, root, scale){
  if (!sp.envW || !clumps.length) return
  const H = sp.height*scale, top = root[1] + H, base = root[1] + H*sp.crownLine, peak = sp.envPeak, W = (H*sp.envW/2 - sp.clumpRadius*scale*.6)*lerp(.92, 1.08, r()), a1 = r()*7, a2 = r()*7, salt = r()*50   // the envelope is the outside of the leaves, so wood stops short of it
  const widthAt = u => { const x = (u - peak)/(u < peak ? peak : 1 - peak); return sp.envCone && u > peak ? W*(1 - x)**sp.envCone : u > peak ? W*Math.max(1 - x**sp.envTop, 0)**.8 : W*Math.sqrt(Math.max(1 - x*x*.72, 0)) }   // conifers taper straight up to a point
  const edge = th => 1 + sp.asym*.4*(Math.sin(th + a1)*.6 + Math.sin(2*th + a2)*.4)
  const inside = (q, k) => { const u = (q[1] - base)/(top - base); if (u > 1.04) return false; const x = q[0] - root[0], z = q[2] - root[2]; return Math.hypot(x, z) <= (u < 0 ? W*.4 : widthAt(clamp(u))*edge(Math.atan2(z, x)))*k }
  // the outline wanders in and out in big soft bays, so a crown is never a clean ball
  const bay = q => noise3(q[0]/(H*.2) + salt, q[1]/(H*.2), q[2]/(H*.2))
  // whatever comes later still answers to this outline
  sp.outline = c => { const u = (c.c[1] - base)/(top - base), far = Math.hypot(c.c[0] - root[0], c.c[2] - root[2]) + c.r*.55; return u > .99 || (u > 0 && far > widthAt(clamp(u))*edge(Math.atan2(c.c[2] - root[2], c.c[0] - root[0]))*1.04) }
  // cut back what strays
  for (const b of branches){
    if (!b.kept || b.root || !b.level) continue
    const last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    for (let i = 3; i <= last; i++) if (!inside(b.trail[i].p, 1.1)){ b.cut = i; if (i < 5 && b.trail[i].p[1] < base) b.kept = false; break }
  }
  for (const b of branches){
    if (!b.kept || b.root || !b.parent) continue
    const pa = b.parent, cut = pa.cut ?? pa.trail.length - 1
    if (!pa.kept || (b.atSection ?? 0) > cut) b.kept = false
  }
  for (let i = clumps.length - 1; i >= 0; i--){ const c = clumps[i], at = c.anchor; if (at?.b && (!at.b.kept || at.sec > (at.b.cut ?? at.b.trail.length - 1))) clumps.splice(i, 1) }
  if (!clumps.length) return
  const c0 = sp.clumpRadius*scale*.9, wood = branches.filter(b => b.kept && !b.root && (b.level || b.stem) && b.trail.length > 1)
  // leaves on a short twig from the nearest wood, so nothing floats
  const sprout = (q, rad, deep) => {
    let best = 1e12, from = null, sec = 0
    for (const b of wood){ const n = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1); for (let i = 1; i <= n; i++){ const t = b.trail[i]; if (t.p[1] > q[1] + c0) continue; const d = sub(t.p, q), dd = dot(d, d)*(t.rad > .3*scale ? 2.5 : 1); if (dd < best){ best = dd; from = b; sec = i } } }
    if (!from || best > (H*.2)**2) return false
    const near = clumps.reduce((m, o) => { const d = sub(o.c, q), dd = dot(d, d); return dd < m.dd ? { dd, o } : m }, { dd: 1e12, o: clumps[0] }).o
    const st = from.trail[sec], rad0 = Math.min(st.rad*.7, .1*scale), trail = [], dir = norm(sub(q, st.p)), len = Math.hypot(...sub(q, st.p)), n0 = perpTo(dir)
    for (let i = 0; i <= 4; i++){ const t = i/4; trail.push({ p: add(add(st.p, dir, len*t), [0, 1, 0], -.06*len*t*(t - 1)), d: dir, n: n0, rad: lerp(rad0, .03*scale, t) }) }
    const tw = { trail, sections: 4, radial: 6, roots: 3, kept: true, carries: true, level: Math.min(from.level + 1, 3), parent: from, atSection: sec, r: rad0, len, s: r()*9, kids: [], v0: from.v0 ?? 0, v1: (from.v0 ?? 0) + len }
    branches.push(tw); wood.push(tw); from.kids?.push(tw)
    clumps.push({ c: add(q, [0, c0*.15, 0]), r: rad, deep, shelf: near.shelf, rim: .5, mass: near.mass, anchor: { b: tw, sec: 4, p: q } })
    return true
  }
  // A crown's middle is a body of shaded leaves: sky never shows through a tree, and every seam and bay ends in dark foliage
  if (sp.envHeart){
    const step = c0*1.7, rows = Math.ceil((top - base)/step)
    for (let v = 1; v < rows; v++) for (let x = -W; x <= W; x += step) for (let z = -W; z <= W; z += step){
      const u = v/rows, q = [root[0] + x + (r() - .5)*step*.4, base + (top - base)*u, root[2] + z + (r() - .5)*step*.4], w = widthAt(u)*sp.envHeart
      if (u < .14 || Math.hypot(x, z) > w) continue
      if (clumps.some(o => { const d = sub(o.c, q); d[1] /= sp.squash; return dot(d, d) < (o.r*.85 + c0*.4)**2 })) continue
      sprout(q, c0*1.3, true)
    }
  }
  // fill the shell
  let made = 0
  for (let v = 0, Nv = Math.ceil((top - base)/(c0*1.05)); v <= Nv && made < sp.envFill; v++){
    const u = (v + .3)/(Nv + .6), w = widthAt(u)*.84, y = base + (top - base)*u*.96, Na = Math.max(1, Math.round(Math.PI*2*w/(c0*1.15)))
    for (let k = 0, spin = r()*7; k < Na && made < sp.envFill; k++){
      const th = spin + k/Na*Math.PI*2, e0 = w*edge(th), q0 = [root[0] + Math.cos(th)*e0, y, root[2] + Math.sin(th)*e0], b0 = bay(q0), e = e0*lerp(.72, 1.08, b0), q = [root[0] + Math.cos(th)*e, y + (r() - .5)*c0*.4, root[2] + Math.sin(th)*e]
      if (b0 < .36) continue                                            // a bay: sky comes in here
      if (clumps.some(o => { const d = sub(o.c, q); d[1] /= sp.squash; return dot(d, d) < (o.r*.95 + c0*.35)**2 })) continue
      if (sprout(q, c0*lerp(.85, 1.15, r()))) made++
    }
  }
}

// Twigs exist to carry leaves: from the tips back, wood with none around it goes, so nothing pokes out past the outline of the crown.
function tidyWood(sp, branches, clumps){
  const covered = q => clumps.some(c => { const d = sub(q, c.c); d[1] /= sp.squash; return dot(d, d) < (c.r*.92)**2 })
  for (let n = branches.length - 1; n >= 0; n--){
    const b = branches[n]
    if (!b.kept || b.root || !b.level || b.continues && b.leader) continue
    if (branches.some(k => k.kept && k.parent === b)) continue
    let last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    while (last > 1 && !covered(b.trail[last].p)) last--
    if (last <= 1) b.kept = false; else b.cut = last
  }
}

// Removing wood can leave what carried it ending at full girth: anything with nothing growing on from its end draws to a point, so no limb looks sawn off.
function closeEnds(branches, scale){
  for (const b of branches){
    if (!b.kept || b.root || (!b.level && !b.stem)) continue
    const kids = branches.filter(k => k.kept && k.parent === b)
    if (kids.some(k => k.continues || k.fork)) continue
    const T = b.trail, last = Math.min(b.cut ?? T.length - 1, T.length - 1), from = Math.max(last - 5, Math.ceil(Math.max(0, ...kids.map(k => k.atSection ?? 0))), 1), tip = Math.max(T[from].rad*.14, .012*scale)
    for (let i = from; i <= last; i++){ const u = (i - from + 1)/(last - from + 1); T[i].rad = Math.min(T[i].rad, lerp(T[from].rad, tip, u**.8)) }
  }
}

// Nothing wood-like goes under the lawn: reseating and separation can both carry a low limb down, so the last word goes to the ground.
function holdAboveGround(sp, branches, clumps, scale){
  for (const b of branches) if (b.kept && !b.root && (b.level || b.stem)) for (const e of b.trail) e.p = [e.p[0], Math.max(e.p[1], groundHeight(e.p[0], e.p[2]) + e.rad + .04*scale), e.p[2]]
  for (const c of clumps) c.c = [c.c[0], Math.max(c.c[1], groundHeight(c.c[0], c.c[2]) + c.r*sp.squash*.55), c.c[2]]
}

// Girth runs along a whole limb, from where it leaves to its tip, continuations included, so wood only ever thins as it goes. A limb starts in proportion
// to what it leaves and is never too slight for its own length: long wood is thick wood, so nothing splits straight into whips.
const SLENDER = 30
function flowGirth(sp, branches, scale){
  const kept = branches.filter(b => b.kept && !b.root)
  for (const head of kept){
    if ((!head.level && !head.stem) || (head.continues && !head.stem)) continue
    const chain = [head]
    for (let next = head; (next = kept.find(k => k.continues && !k.stem && k.parent === next)); ) chain.push(next)
    const rings = chain.flatMap((b, n) => b.trail.slice(n ? 1 : 0, Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1) + 1))
    let L = 0
    for (let i = 1; i < rings.length; i++) L += Math.hypot(...sub(rings[i].p, rings[i - 1].p))
    let r0 = head.trail[0].rad
    if (head.fork) r0 = head.parent.trail[Math.min(Math.round(head.atSection), head.parent.trail.length - 1)].rad*.97     // a fork limb carries straight on from the stem's own girth, so the stem's end can't stand proud of it as a knuckle
    else if (!head.stem){ const pa = head.parent, from = pa.trail[Math.min(Math.round(head.atSection ?? 0), pa.trail.length - 1)].rad; r0 = Math.min(Math.max(from*sp.limbRatio*[1, 1, .8, .62][Math.min(head.level, 3)], head.level < 2 ? L/SLENDER : 0), from*.72) }
    const forks = chain[chain.length - 1].forks && kept.some(k => k.fork && k.parent === chain[chain.length - 1])
    const tip = forks ? r0*.6 : Math.max(r0*.1, .012*scale)
    let s = 0
    const pow = head.stem && !forks ? 2 : 1.2                                     // sub-trunks hold their girth to where the limbs leave
    rings.forEach((e, i) => { if (i) s += Math.hypot(...sub(e.p, rings[i - 1].p)); e.rad = lerp(r0, tip, (s/Math.max(L, 1e-3))**pow) })
    for (let n = 1; n < chain.length; n++){ const pa = chain[n - 1]; chain[n].trail[0].rad = pa.trail[Math.min(pa.cut ?? pa.trail.length - 1, pa.trail.length - 1)].rad }   // each piece starts exactly where the last one ended
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

// The crown is built outward from its limbs. Each bough, a limb and all it carries, becomes one mass out at the end of that limb: flat-bottomed
// where its own tips begin, so masses sit at different heights and the limbs between them stay in view. Boughs that crowd each other merge
// until the species' number of masses is left.
function makeShelves(sp, r, tips, scale, root){
  const H = sp.height*scale, R = sp.clumpRadius*scale, floor = root[1] + sp.height*scale*sp.trunkFrac*sp.childStart*sp.lift, K = Math.max(1, Math.min(Math.round(sp.shelves), Math.floor(tips.length/3)))
  const limbOf = b => { while (b.parent && !(b.level === 1 || b.stem)) b = b.parent; return b }
  const byLimb = new Map()
  for (const t of tips){ const l = limbOf(t.branch); byLimb.has(l) ? byLimb.get(l).push(t) : byLimb.set(l, [t]) }
  const boughs = [...byLimb.values()], middle = g => [0, 1, 2].map(a => g.reduce((t, q) => t + q.p[a], 0)/g.length)
  // too few limbs for the masses asked for: the fullest bough divides between its side branches
  for (let more = true; more && boughs.length < K;){
    more = false
    const big = boughs.reduce((m, g) => g.length > m.length ? g : m), parts = new Map()
    for (const t of big){ let b = t.branch; while (b.parent && b.parent.level > 1) b = b.parent; parts.has(b) ? parts.get(b).push(t) : parts.set(b, [t]) }
    if (parts.size > 1){ boughs.splice(boughs.indexOf(big), 1, ...parts.values()); more = true }
  }
  while (boughs.length > K){
    let best = [0, 1], bd = 1e12
    for (let i = 0; i < boughs.length; i++) for (let j = 0; j < i; j++){ const a = middle(boughs[i]), e = middle(boughs[j]), q = [a[0] - e[0], (a[1] - e[1])*2.4, a[2] - e[2]], dd = dot(q, q); if (dd < bd){ bd = dd; best = [j, i] } }   // height counts extra, so masses stay layered
    boughs[best[0]].push(...boughs[best[1]]); boughs.splice(best[1], 1)
  }
  const shelves = []
  for (const group of boughs){
    if (group.length < 2) continue
    const cx = group.reduce((t, g) => t + g.p[0], 0)/group.length, cz = group.reduce((t, g) => t + g.p[2], 0)/group.length
    const ys = group.map(g => g.p[1]).sort((a, b) => a - b), rs = group.map(g => Math.hypot(g.p[0] - cx, g.p[2] - cz)).sort((a, b) => a - b)
    const bottom = Math.max(ys[Math.floor(ys.length*.15)] - R*.2, floor), top = ys[ys.length - 1]
    shelves.push({ tips: group, cx, cz, bottom, rx: Math.max(rs[Math.floor(rs.length*.9)]*1.15, R*.9), h: Math.max(top - bottom, R*.8)*1.1 + R*.5*sp.squash, phase: r()*7 })
  }
  // big, middle, small between shelves: the biggest leads, the smallest supports
  shelves.sort((a, b) => b.rx - a.rx)
  shelves.forEach((v, i) => { const k = lerp(1 + sp.massVar*.3, 1 - sp.massVar*.35, shelves.length > 1 ? i/(shelves.length - 1) : 0); v.rx *= k; v.h *= k })
  // Clumps grow from wood. Every tip owns one first, and only then does the outer part of each twig get its chance, so the heart of the
  // crown stays open and foliage can't float. The shelf only decides how large a clump may be there and where it has to stop.
  const clumps = []
  for (const v of shelves){
    const points = [], seen = new Set(), own = v.tips.map(t => ({ b: t.branch, sec: t.section, p: t.p }))
    for (const t of v.tips) for (let b = t.branch; b && b.level >= 2 && !seen.has(b); b = b.parent){
      seen.add(b)
      for (let sec = Math.ceil(b.sections*.45); sec <= b.sections; sec++) points.push({ b, sec, p: b.trail[sec].p })
    }
    for (let i = points.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [points[i], points[j]] = [points[j], points[i]] }
    const want = Math.round(clamp(Math.PI*v.rx*v.rx/(R*R*.55)*sp.clumpsPerTip, 5, 70))
    for (let i = own.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [own[i], own[j]] = [own[j], own[i]] }
    let made = 0
    for (const at of [...own, ...points]){
      if (made >= want) break
      const dx = at.p[0] - v.cx, dz = at.p[2] - v.cz, a = Math.atan2(dz, dx), edge = 1 + .16*Math.sin(a*3 + v.phase) + .08*Math.sin(a*7 + v.phase*2), u = Math.hypot(dx, dz)/(v.rx*edge)
      if (u > 1) continue
      const rad = R*lerp(1.3, .55, u**1.6)*lerp(1 - sp.clumpVar*.6, 1 + sp.clumpVar*.4, r())*lerp(1, sp.topClump, clamp((at.p[1] - root[1] - H*.4)/(H*.6))), reach = rad*.3
      const c = [at.p[0] + (r() - .5)*reach, Math.max(at.p[1] + rad*sp.squash*.25, v.bottom + rad*sp.squash*.6), at.p[2] + (r() - .5)*reach]
      if (c[1] > v.bottom + v.h*1.05 || c[1] - at.p[1] > rad*sp.squash*.6 || c[1] + rad*sp.squash*.8 > root[1] + H*1.08) continue   // never lifted further from its branch than it can reach
      // clumps of one bough overlap into a mass; different boughs keep clear of each other, and that is where the sky comes through
      if (clumps.some(o => { const q = sub(o.c, c); return dot(q, q) < ((o.shelf === v ? sp.clumpSpacing*.62 : sp.boughGap)*(o.r + rad))**2 })) continue
      clumps.push({ c, r: rad, shelf: v, rim: u, mass: [v.cx, v.bottom + v.h*.4, v.cz], anchor: at }); made++
    }
  }
  for (let i = 0; i < sp.notches && clumps.length > 8; i++){            // bites out of the outline, so it has an edge worth looking at
    const far = clumps.reduce((m, c) => { const q = r() + Math.hypot(c.c[0] - root[0], c.c[2] - root[2])/8; return q > m.q ? { q, c } : m }, { q: -1 }).c
    const rr = far.r*1.5
    for (let k = clumps.length - 1; k >= 0; k--){ const q = sub(clumps[k].c, far.c); if (dot(q, q) < rr*rr) clumps.splice(k, 1) }
  }
  // anything that isn't part of a real mass is a ball on a stick: small islands of clumps go
  const group = clumps.map((_, i) => i), find = i => { while (group[i] !== i) i = group[i] = group[group[i]]; return i }
  for (let i = 0; i < clumps.length; i++) for (let j = 0; j < i; j++){ const q = sub(clumps[i].c, clumps[j].c); if (dot(q, q) < ((clumps[i].r + clumps[j].r)*1.05)**2) group[find(i)] = find(j) }
  const size = {}; clumps.forEach((_, i) => { const g = find(i); size[g] = (size[g] || 0) + 1 })
  const held = clumps.filter((_, i) => size[find(i)] > 2)
  held.shelves = shelves
  return held
}

function makeClumps(sp, r, tips, scale, root){
  if (sp.shelves > 0 && tips.length > 5) return makeShelves(sp, r, tips, scale, root)
  const clumps = [], R = sp.clumpRadius*scale, floor = root[1] + sp.height*scale*sp.trunkFrac*sp.childStart*sp.lift
  for (let i = tips.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [tips[i], tips[j]] = [tips[j], tips[i]] }
  for (const tip of tips){
    const n = Math.floor(sp.clumpsPerTip) + (r() < sp.clumpsPerTip%1 ? 1 : 0)
    for (let i = 0; i < n; i++){
      const rad = R*lerp(1 - sp.clumpVar, 1 + sp.clumpVar*.6, r()), c = add(add(tip.p, tip.d, rad*.3), randDir(r), rad*.25*i)
      if (c[1] - rad*sp.squash < floor) continue                     // keep the trunk and the space under the crown open
      if (clumps.some(o => { const q = sub(o.c, c); return dot(q, q) < (sp.clumpSpacing*(o.r + rad)*.5)**2 })) continue
      clumps.push({ c, r: rad, anchor: { b: tip.branch, sec: tip.section, p: tip.p } })   // foliage belongs to its wood, and moves or goes with it
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
  const mid = [0, 1, 2].map(a => centers.reduce((t, c) => t + c[a], 0)/K)
  const scaleOf = centers.map(() => lerp(1 - sp.massVar*.45, 1 + sp.massVar*.15, r())), lead = centers.reduce((best, c, i) => { const q = sub(c, mid), b = sub(centers[best], mid); return dot(q, q) < dot(b, b) ? i : best }, 0)   // the dominant mass is the one the tree is centred on: nothing large hangs off the edge
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

// slow value noise, baked per stroke: the shared shapes of light, and small flecks of colour
const LAT = (() => { const q = mulberry32(991), t = new Float32Array(4096); for (let i = 0; i < 4096; i++) t[i] = q(); return t })()
const lat = (x, y, z) => LAT[(x*73 + y*179 + z*283) & 4095]
function noise3(x, y, z){
  const a = Math.floor(x), b = Math.floor(y), c = Math.floor(z), u = x - a, v = y - b, w = z - c, s = u*u*(3 - 2*u), t = v*v*(3 - 2*v), o = w*w*(3 - 2*w)
  const m = (p, q, f) => p + (q - p)*f
  return m(m(m(lat(a, b, c), lat(a + 1, b, c), s), m(lat(a, b + 1, c), lat(a + 1, b + 1, c), s), t), m(m(lat(a, b, c + 1), lat(a + 1, b, c + 1), s), m(lat(a, b + 1, c + 1), lat(a + 1, b + 1, c + 1), s), t), o)
}
const lightShape = q => (noise3(q[0]*.22, q[1]*.22, q[2]*.22)*.56 + noise3(q[0]*.47 + 9, q[1]*.47, q[2]*.47)*.3 + noise3(q[0]*.97, q[1]*.97 + 5, q[2]*.97)*.14) - .56

function addStroke(out, r, { q, n, t, len, wid, tile, pivot, ao, tone, wind, dab = 0, clump = -1 }){
  const base = out.pos.length/3, seed = r(), shape = lightShape(q), fleck = noise3(q[0]*7.4, q[1]*7.4, q[2]*7.4) - .5
  for (const [cx, cy, u, v] of [[-1, -1, 0, .5], [1, -1, 1, .5], [1, 1, 1, 0], [-1, 1, 0, 0]]){
    out.pos.push(...q); out.nor.push(...n); out.stroke.push(...t); out.center.push(...pivot); out.wind.push(...wind)
    out.corner.push(cx*len/2, cy*wid/2); out.leaf.push(ao, tone, seed); out.dab.push(dab); out.patch.push(shape, fleck, clump)
    const tx = (tile[0] + u)/4, ty = (tile[1] + (cy < 0 ? 1 : 0))/4
    out.uv.push(tx, ty); void v
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

// rows 0-1 of the atlas hold the body brush, rows 2-3 the edge brush; the last tile is the underpainting
const randTile = (r, edge = false) => { const x = Math.floor(r()*4), y = Math.floor(r()*2) + (edge ? 2 : 0); return x === 3 && y === 3 ? [0, 2] : [x, y] }

export function emitFoliage(sp, r, clumps, root, scale, out, cores){
  const H = sp.height*scale, turn = sp.strokeAngle*Math.PI/180, jitter = sp.strokeJitter*Math.PI/180
  const swayAt = y => .32*scale*(clamp((y - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5)
  const len0 = markSize(sp, scale), wid0 = len0*sp.brushWidth
  // the crown as one form: its bounds give every stroke a place on the whole tree, so one light runs across it
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (const { c, r: q } of clumps) for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], c[a] - q); hi[a] = Math.max(hi[a], c[a] + q) }
  const crown = lo.map((v, a) => (v + hi[a])/2), half = lo.map((v, a) => Math.max((hi[a] - v)/2, .1))
  // The light direction a point takes from the big forms. Everything in a crown uses this, including what sits underneath the top strokes,
  // so a gap between lit strokes shows lit paint behind it, and only the true underside goes dark.
  const formAt = (q, shelf) => {
    const onCrown = norm(q.map((v, a) => (v - crown[a])/half[a]))
    const onShelf = shelf ? norm([(q[0] - shelf.cx)/shelf.rx, (q[1] - shelf.bottom - shelf.h*.15)/shelf.h, (q[2] - shelf.cz)/shelf.rx]) : onCrown
    return { onCrown, onShelf, n: norm(add(onShelf, onCrown, sp.crownBlend*.8)) }
  }
  const held = out.held ??= [], plant = held.length ? held[held.length - 1].plant + 1 : 0      // clumps by plant: main.js lights them against each other
  for (const cl of clumps){
    const { c, r: rad, mass, shelf } = cl, tone = r(), sw = swayAt(c[1]), clump = held.length
    held.push({ c, r: rad, deep: cl.deep, squash: sp.squash, plant, mass: shelf ?? mass, n: formAt(c, shelf).n, hue: shelf?.hue ?? .5, form: sp.form })
    cl.id = clump; cl.tone = tone
    const pivot = add(add(c, sub(mass, c), sp.massBlend), sub(crown, add(c, sub(mass, c), sp.massBlend)), sp.crownBlend), wind = [root[0], root[2], sw, .6]
    cl.pivot = pivot; cl.wind = wind
    // Strokes on a shell are thinnest exactly where a clump faces the viewer, so it needs a body. One large stroke at its heart always turns to
    // the viewer, in the clump's own light and colour: whatever shows between strokes is more of the same paint, and never a hole.
    if (sp.massMarks && sp.core){ const k = cl.rim > .72 ? .88 : 1
      addStroke(out, r, { q: c, n: formAt(c, shelf).n, t: [0, 1, 0], len: rad*2.3*Math.max(sp.squash, .6)*k, wid: rad*2.4*k, tile: randTile(r), pivot, ao: .5, tone, wind, dab: .25, clump }) }
    else if (sp.core && !(cl.rim > .72)){                               // rim clumps stay thin: sky shows through the edge of the crown
      const base = cores.pos.length/3, wob = r()*9
      for (const d of ICO.v){
        const k = rad*((shelf ? .34 : .62) + .07*Math.sin(d[0]*4 + wob)*Math.cos(d[2]*3 + wob)), q = [c[0] + d[0]*k, c[1] + d[1]*k*sp.squash, c[2] + d[2]*k]
        cores.pos.push(...q); cores.nor.push(...formAt(q, shelf).n); cores.uv.push(.875, .875)
        cores.corner.push(0, 0); cores.stroke.push(0, 1, 0); cores.leaf.push(.7, .5, .5); cores.dab.push(-1); cores.patch.push(lightShape(q), 0, clump)
        cores.center.push(...pivot); cores.wind.push(...wind)
      }
      for (const [a, b, e] of ICO.f) cores.idx.push(base + a, base + b, base + e)
    }
    // lobes: the lumps a painter blocks in first. Strokes take their tone and much of their normal from their lobe, so light
    // falls on groups of dabs, and the valleys between lobes stay dark.
    const L = Math.round(clamp(rad/len0*4.5, 4, 12)), lobes = Array.from({ length: L }, () => { const dir = randDir(r); return { dir, tone: clamp(tone + (r() - .5)*.7), gone: shelf && r() < .14 } })   // missing lobes bite the clump's outline
    const n = Math.max(5, Math.round(sp.coverage*4*Math.PI*rad*rad/(len0*wid0)))
    // Big, middle, small. Plates are a few large shapes per lobe that state the mass; they are always drawn. Middle dabs and small
    // accents exist everywhere, but the shader only opens them where the light asks for them (foliage-material.js), so shadow
    // stays plates and detail gathers along the lit edge at any time of day. Strays break the silhouette.
    for (let layer = 0; layer < 4; layer++) for (let i = 0, count = [L*sp.plates*1.1, n*1.1, n*1.5, n*sp.strays][layer]; i < count; i++){
      const d = randDir(r)
      let lobe = lobes[0], b = -2
      for (const l of lobes){ const q = dot(d, l.dir); if (q > b){ b = q; lobe = l } }
      if (lobe.gone && layer > (sp.massMarks ? 1 : 0)) continue          // what stays hides the core: facing the viewer a bite is a hole, so on trees it only thins the edge
      const rise = clamp((b - .45)/.5), bump = .8 + .26*rise*rise + (r() - .5)*.06
      const k = rad*(layer === 3 ? bump + lerp(.14, .36, r()) : bump + [-.04, 0, .05][layer]), q = [c[0] + d[0]*k, c[1] + d[1]*k*sp.squash, c[2] + d[2]*k]
      if (shelf) q[1] = Math.max(q[1], shelf.bottom + shelf.h*(.07*Math.sin(q[0]*.9 + shelf.phase) + .07*Math.sin(q[2]*1.3 + shelf.phase*2)))   // shelves are flat underneath, but drawn by hand
      const onCrown = norm(q.map((v, a) => (v - crown[a])/half[a]))
      const onShelf = shelf ? norm([(q[0] - shelf.cx)/shelf.rx, (q[1] - shelf.bottom - shelf.h*.15)/shelf.h, (q[2] - shelf.cz)/shelf.rx]) : onCrown
      const nS = norm(add(add(add(onShelf, lobe.dir, sp.massMarks ? .4 : .3), d, sp.massMarks ? .45 : .12), onCrown, sp.crownBlend*.8))   // mostly the big form: neighbouring strokes agree, so light lands in shapes, not spots   // a stroke takes its light from its lobe and crown, so lit strokes join up
      // strokes run over the form: down the sides of the clump, turned by the species' stroke angle
      const flow = sub([0, -1, 0], [d[0]*-d[1], d[1]*-d[1], d[2]*-d[1]])
      const t = rotateAbout(norm(dot(flow, flow) > .02 ? flow : randDir(r)), d, turn + (r() - .5)*2*jitter)
      const ao = clamp(.26 + .4*(onShelf[1]*.5 + .5) + .2*Math.hypot(onCrown[0], onCrown[2]) + .16*rise, .1, 1)
      // marks at three clear scales: plates sized by the mass, dabs by the brush, so the big shapes aren't just more of the small ones
      const plate = Math.max(rad*lerp(.58, .95, r()), sp.massMarks && shelf ? Math.min(shelf.rx, rad*2.2)*lerp(.32, .44, r()) : 0)*sp.plateSize, size = [0, sp.massMarks ? lerp(.72, 1.15, r()) : lerp(.8, 1.3, r()), lerp(.38, .66, r()), lerp(.3, .5, r())][layer]
      addStroke(out, r, { q, n: nS, t, len: layer ? len0*size : plate, wid: layer ? wid0*size : plate*.85, tile: randTile(r, layer > 1), pivot, ao,
        tone: clamp(lobe.tone + (r() - .5)*.2), wind, dab: [0, 1, 2, 2][layer], clump })
    }
  }
  // Neighbouring clumps of one mass are one body of leaves, so the space between them is painted too, in the colour of the clump it joins.
  // Sky stays in the gaps between boughs and in notches too wide to bridge, where it reads as the tree's own shape.
  if (sp.massMarks && sp.core) for (let i = 0; i < clumps.length; i++) for (let j = 0; j < i; j++){
    const a = clumps[i], b = clumps[j]
    if (!a.shelf || a.shelf !== b.shelf) continue
    const gap = sub(b.c, a.c), d = Math.hypot(gap[0], gap[1]/sp.squash, gap[2])
    if (d > (a.r + b.r)*1.2 || d < (a.r + b.r)*.45) continue             // too far to be one body, or already overlapping enough to close
    const q = add(a.c, gap, .5), w = Math.max(d*.62, Math.min(a.r, b.r)*.8)
    addStroke(out, r, { q, n: formAt(q, a.shelf).n, t: [0, 1, 0], len: w*2*Math.max(sp.squash, .6), wid: w*2, tile: randTile(r), pivot: a.pivot, ao: .5, tone: a.tone, wind: a.wind, dab: .25, clump: a.id })
  }
  return formAt
}

// Weeping curtains: from each branch tip a whip arcs outward and falls under its own weight, painted as long pulled strokes.
// Strands of one mass share a pivot, so the curtain shades as one lobed surface and the gaps between lobes stay dark.
function emitStrands(sp, r, tips, clumps, root, scale, out){
  const H = sp.height*scale, len0 = markSize(sp, scale), step = len0*.62, floor = root[1] + H*.1
  const reach = tips.reduce((m, t) => Math.max(m, Math.hypot(t.p[0] - root[0], t.p[2] - root[2])), 1)
  for (const tip of tips){
    const keep = clamp((Math.hypot(tip.p[0] - root[0], tip.p[2] - root[2])/reach - .15)/.3)   // curtains hang from the outer crown; the inside stays open round the trunk
    if (r() > keep) continue
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

// A species is a range, not a recipe: each seed draws its own tree from it, so no two share proportions. The bole keeps clear of where branching starts.
function individual(sp, seed){
  const r = mulberry32(seed*40503 + 11), v = sp.variety, by = (k, a) => k*(1 + (r()*2 - 1)*a*v)
  const o = { ...sp, height: by(sp.height, .14), trunkRadius: by(sp.trunkRadius, .12), trunkFrac: by(sp.trunkFrac, .14), forkHeight: by(sp.forkHeight, .3), stemSpread: by(sp.stemSpread, .3),
    crownWidth: by(sp.crownWidth, .18), childAngle: by(sp.childAngle, .14), lengthRatio: by(sp.lengthRatio, .14), childStart: Math.min(by(sp.childStart, .18), .95), children: by(sp.children, .22), asym: by(sp.asym, .35), lean: by(sp.lean, .5) }
  o.forkHeight = Math.min(o.forkHeight, o.trunkFrac*.7); o.trunkFrac = Math.min(o.trunkFrac, .95)
  if (sp.forms) o.gesture = sp.forms[Math.floor(r()*sp.forms.length)]
  // A species comes in several colours: most trees take its usual one, the rest a form of their own. 0 is the usual colour; the slider can force one.
  const forms = sp.colors ?? []
  o.form = 0
  if (sp.colorPick) o.form = Math.min(sp.colorPick - 1, forms.length)
  else { let roll = r(); forms.forEach((f, i) => { if (roll >= 0 && (roll -= f.share) < 0) o.form = i + 1 }) }
  return o
}

export function generatePlant(species, seed, root, scale, wood, foliage, cores = newBuffer(), ivy = newBuffer()){
  const sp = individual(species, seed)
  scale *= species.size                                                // a species' true mature size: everything grows together, so proportions hold
  const r = mulberry32(seed*2654435761 >>> 0), tips = []
  const branches = growSkeleton(sp, r, root, scale, tips)
  shapeCrown(sp, r, root, scale, branches, tips)
  reseat(branches, tips)
  const clumps = makeClumps(sp, r, tips, scale, root)
  prune(sp, tips, clumps, branches, root, scale)
  // Separation needs to know how thick wood is, and thickness depends on which wood survives. So girth is worked out once to separate by, thrown
  // away, and worked out again on the final tree: taper and joints are always computed last, on wood that no longer moves.
  const held = branches.map(b => ({ b, trail: b.trail.map(e => ({ ...e })), sections: b.sections, cut: b.cut, len: b.len }))
  pipeModel(sp, branches, scale, clumps)
  flowGirth(sp, branches, scale)
  for (const h of held){ const { b } = h, wide = b.trail
    h.trail.forEach((e, i) => { e.rad = wide[i]?.rad ?? e.rad })
    b.trail = h.trail; b.sections = h.sections; b.cut = h.cut; b.len = h.len; b.thinned = false }
  const removed = separateWood(sp, branches, clumps)
  pipeModel(sp, branches, scale, clumps)
  flowGirth(sp, branches, scale)
  separateWood(sp, branches, clumps, true)
  fitCrown(sp, r, branches, clumps, root, scale)
  closeEnds(branches, scale)
  holdAboveGround(sp, branches, clumps, scale)
  carryAlongLimbs(sp, clumps, scale)
  clotheWood(sp, r, branches, clumps, root, scale)
  if (sp.outline){
    for (let i = clumps.length - 1; i >= 0 && clumps.length > 6; i--) if (sp.outline(clumps[i])) clumps.splice(i, 1)
    tidyWood(sp, branches, clumps)
    closeEnds(branches, scale)
  }
  if (sp.cover) for (let i = clumps.length - 1, floor = root[1] + sp.height*scale*sp.crownLine*.8; i >= 0 && clumps.length > 6; i--) if (clumps[i].c[1] < floor) clumps.splice(i, 1)   // the trunk stays in view: leaves never hang down over it
  // and wood that only reached down there goes with its leaves, from the tips back
  if (sp.cover) for (let n = branches.length - 1, floor = root[1] + sp.height*scale*sp.crownLine*1.1; n >= 0; n--){
    const b = branches[n]
    if (!b.kept || b.root || !b.level || b.continues) continue
    const last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    if (b.trail[last].p[1] < floor && !branches.some(k => k.kept && k.parent === b) && !clumps.some(c => c.anchor?.b === b)) b.kept = false
  }
  splitLobes(sp, r, clumps, scale)
  growRoots(sp, r, root, scale, branches)
  emitWood(sp, r, root, scale, branches, wood, clumps)
  const form = emitFoliage(sp, r, clumps, root, scale, foliage, cores)
  emitEntries(sp, r, root, scale, branches, wood, foliage, clumps, form)
  emitIvy(sp, r, root, scale, branches, ivy)
  if (sp.hang > 0) emitStrands(sp, r, tips, clumps, root, scale, foliage)
  generatePlant.debug = { branches, clumps, removed }
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
export function generateGrass(count, radius, seed, trees = []){
  const r = mulberry32(seed + 77), o = newBuffer()
  // a collar of tufts where each trunk meets the ground: it breaks the line between the two
  for (const q of trees) for (let i = 0, n = Math.round(10 + q.r*12); i < n; i++){
    const a = r()*7, d = q.r*lerp(.75, 1.7, r()), x = q.x + Math.cos(a)*d, z = q.z + Math.sin(a)*d, y = groundHeight(x, z), len = lerp(.35, .7, r()), t = norm([(r() - .5)*.5, 1, (r() - .5)*.5])
    addStroke(o, r, { q: [x + t[0]*len*.5, y + t[1]*len*.5 - .05, z + t[2]*len*.5], n: [0, 1, 0], t, len, wid: len*lerp(.8, 1.2, r()), tile: [Math.floor(r()*4), Math.floor(r()*4)], pivot: [x, y, z], ao: 1, tone: r(), wind: [x, z, 0, 0] })
  }
  // the wind's direction across the land, and where the grass grows long: every stroke answers to these two fields
  const flow = (x, z) => 1.1 + Math.sin(x*.03 + z*.02)*.7 + Math.sin(z*.07 - 1)*.3
  const long = (x, z) => .5 + .5*Math.sin(x*.05 + 1.3*Math.sin(z*.04))*Math.sin(z*.06 + x*.02)
  for (let i = 0; i < count; i++){
    const dist = radius*r()**.62, th = r()*Math.PI*2, x = dist*Math.cos(th), z = dist*Math.sin(th), g = long(x, z)
    if (r() > .3 + .7*g) continue
    const a = flow(x, z) + (r() - .5)*.7, wisp = r() < .07, y = groundHeight(x, z), edge = 1 - clamp((dist - radius*.8)/(radius*.2)), far = 1 + dist/50
    const lean = lerp(.35, 1.05, r()), len = (wisp ? lerp(1, 1.7, r()) : lerp(.5, 1, r())*far)*lerp(.75, 1.25, g)*lerp(.4, 1, edge), wid = wisp ? len*.34 : len*lerp(.7, 1, r())
    const t = norm([Math.cos(a)*lean, 1, Math.sin(a)*lean]), s = len*.5
    addStroke(o, r, { q: [x + t[0]*s, y + t[1]*s - .06, z + t[2]*s], n: [0, 1, 0], t, len, wid, tile: [Math.floor(r()*4), Math.floor(r()*4)], pivot: [x, y, z], ao: wisp ? 2 : 1, tone: clamp(g + (r() - .5)*.5), wind: [x, z, 0, 0] })
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
    const R = lerp(p.height*Math.max(.5, p.crownWidth*1.2) + 2, p.groveRadius + 10, Math.sqrt(r())), a = r()*Math.PI*2   // bushes keep clear of the crown
    if (Math.cos(a - Math.PI/4) > .4) continue                       // keep the opening camera's foreground clear
    bushes.push({ x: R*Math.cos(a), z: R*Math.sin(a), scale: lerp(.7, 1.4, r()), seed: p.seed + 5000 + bushes.length*13 })
  }
  return { plants, bushes }
}
