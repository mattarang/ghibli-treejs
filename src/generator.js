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
      retangent(b)
    } else retangent(b)
  }
  for (const t of tips) t.p = t.branch.trail[t.section].p
}

// The pipe model. Sap wood is conserved: a limb's cross-section is the sum of what grows from it, worked from the twigs back to the trunk,
// then scaled so the trunk matches the species. Exponent 2 is the strict form, and gives the slender outer limbs painters draw.
// a branch tip stops where the foliage stops: nothing bare pokes out of a crown
function trimTips(sp, branches, clumps){
  const covered = q => clumps.some(c => { const d = sub(q, c.c); d[1] /= sp.squash; return dot(d, d) < c.r*c.r })
  if (!sp.hang) for (const b of [...branches].reverse()) if (b.kept && !b.root && b.level && !b.leader && !branches.some(k => k.kept && k.parent === b)){
    let last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    while (last > 1 && !covered(b.trail[last].p)) last--
    if (last > 1) b.cut = last
    else if (!b.fork) b.kept = false                                    // bare all the way: it isn't holding anything up
  }
}

function dropStubs(sp, branches){
  for (const b of branches) b.kids = []
  for (const b of branches) if (b.kept && b.parent) b.parent.kids.push(b)
  // limbs cut back to almost nothing are stubs, not limbs
  for (let i = branches.length - 1; i >= 0; i--){
    const b = branches[i]
    if (b.kept && (b.level || b.stem) && !b.carries && !b.kids.length && (b.stem || (b.cut ?? b.sections) <= 4) && !(b.level <= sp.keepWood)){ b.kept = false; b.parent.kids.splice(b.parent.kids.indexOf(b), 1) }
  }
}
// bark is measured in metres along the wood as it finally stands, and runs unbroken along a continuing branch, so its pattern is the same real size on any tree
function measureBark(branches){
  for (const b of branches) if (b.kept){
    b.v0 = b.parent ? lerp(b.parent.v0, b.parent.v1, clamp((b.atSection ?? 0)/b.parent.sections)) : 0
    let arc = 0
    for (let i = 1; i < b.trail.length; i++) arc += Math.hypot(...sub(b.trail[i].p, b.trail[i - 1].p))
    b.v1 = b.v0 + arc
  }
}

// Grow the skeleton first and mesh it later: branches that end up carrying no foliage get pruned, so nothing pokes out of the crown.
const IVY = false                                                     // off for now, for a clean look at the wood
const BOLE_TOP = .82, TWIG_REF = .15, SLENDER = 12
const leastWood = (sp, scale) => Math.min(.05, sp.trunkRadius*scale*.1)     // no branch is thinner than this radius, in metres: anything finer is a hair, and small trees get finer wood
const subTrunks = (sp, r) => Math.round(clamp(sp.stems + (r() - .5)*sp.stemVar, 1, 3))
const stemGirth = n => n > 1 ? .8 : 1                                // stems rise from a bole already tapered to meet them, so a tree divides without a shoulder
const subGirth = n => n > 1 ? Math.sqrt(1/n)*1.1 : 1                    // wood is conserved through the fork, with a little swell at the crotch

// Wood grows away from the trunk: takes the part of a direction that heads back at it out, or with k = 2 turns that part round
function outward(v, at, trunk, near, k){
  const x = at[0] - trunk[0], z = at[2] - trunk[2], m = Math.hypot(x, z)
  if (m < near) return
  const back = (v[0]*x + v[2]*z)/m
  if (back >= 0) return
  v[0] -= k*back*x/m; v[2] -= k*back*z/m
  const l = Math.hypot(...v); v[0] /= l; v[1] /= l; v[2] /= l
}

// Space colonisation: the crown is filled with points of open space, and wood grows towards whichever are nearest, claiming them as it reaches them. So branches
// go where there's room, and they can't help filling the shape. Girth comes last and bottom up, after da Vinci: every twig is the same, and where branches
// join the areas add, r^a = r1^a + r2^a. So radius can never jump, and thick wood is simply wood with a lot of tree beyond it.
function growColonise(sp, r, root, size){
  const g = sp.rings, c = g.colonise, base = g.base, was = k => base[k] ? sp[k]/base[k] : 1, tau = Math.PI*2, scale = size*(g.unit ?? 1)    // a slider or a seed moves a setting away from the species' own value: 'was' is by how much
  const H = sp.height*size, R = sp.trunkRadius*size, least = leastWood(sp, size)*(g.finest ?? 1), step = c.step*scale, nodes = [], v = sp.variety
  // No two trees fill the outline alike. Each works from its own copy of it: wider or narrower, its widest point higher or lower, lopsided, streaming with the wind, with bays bitten out
  const a1 = r()*7, a2 = r()*7, a3 = r()*7, bendTo = r()*tau, widen = was('crownWidth'), bottom = g.crownOnly ? clamp(sp.trunkFrac, 0, .8) : Math.min(c.bottom*was('trunkFrac'), .8), peak = (r() - .5)*.3*v
  // (crownOnly) the outline was traced round the crown alone: it sits whole on top of the bare trunk (Bare trunk sets where), keeping its traced proportions
  const CH = g.crownOnly ? H*(1 - bottom) : H, from = g.crownOnly ? 0 : c.bottom, W = CH*Math.max(...g.outline)*widen
  const lobes = th => 1 + sp.asym*(.5*Math.sin(th + a1) + .3*Math.sin(2*th + a2) + .2*Math.sin(3*th + a3)) + c.lobes*(.6*Math.sin(2*th + a2) + .4*Math.sin(3*th + a3))
  // the tree's centre line: dead upright unless lean tilts it or wind carries it off, more the higher it is. The trunk wanders about this line, and the crown stands on it
  const leanTo = r()*tau, tiltBy = sp.lean + (r() - .5)*.02*v
  let crownShift = [0, 0]                                               // set once the trunk is up: the crown centres on where the trunk actually ends
  const axis = y => { const t = clamp((y - root[1])/H), k = t*t*W*sp.windLean, m = tiltBy*(y - root[1]); return [root[0] + Math.cos(bendTo)*k + Math.cos(leanTo)*m + crownShift[0], root[2] + Math.sin(bendTo)*k + Math.sin(leanTo)*m + crownShift[1]] }
  const reachAt = y => { const t = clamp((y - root[1] - H*bottom)/(H*(1 - bottom))), w = clamp(t + peak*Math.sin(Math.PI*t)), u = (from + w*(1 - from))*(g.outline.length - 1), i = Math.min(Math.floor(u), g.outline.length - 2); return CH*widen*lerp(g.outline[i], g.outline[i + 1], u - i) }
  const bays = Array.from({ length: Math.round(sp.notches + r()*v*2) }, () => { const y = root[1] + H*lerp(bottom + .1, .92, r()), th = r()*tau, m = reachAt(y)*.95; return { p: [root[0] + Math.cos(th)*m, y, root[2] + Math.sin(th)*m], r: W*lerp(.25, .45, r()) } })
  const y0 = root[1] + H*bottom, wide = W*1.6 + H*sp.windLean
  // the bare trunk comes first and takes no part: nothing grows from it until it reaches the crown
  const add0 = (p, parent, stage) => { const n = { p, parent, stage, kids: [], pull: [0, 0, 0], pulled: 0, d: parent ? norm(sub(p, parent.p)) : [0, 1, 0] }; nodes.push(n); if (parent) parent.kids.push(n); return n }
  let tip = add0(add(root, [0, -.3*sp.flare*R, 0]), null, -1)
  // up the centre line in straight lengths, each aimed at a point a little to one side of it, so the trunk bends and never drifts
  const climbTo = (top, run, kink, stage, leader, lines = [], curve = null) => { for (let i = 0, d = [0, 1, 0]; tip.p[1] < top; i++){
    if (i%run === 0){ const y = tip.p[1] + run*step; let [x, z] = axis(y); if (curve){ const [cx, cz] = curve(y); x += cx; z += cz } for (const l of lines){ if (l.shift){ x += l.shift[0]; z += l.shift[1]; continue } const s = l.slope*Math.max(y - l.from, 0); x += Math.cos(l.out)*s; z += Math.sin(l.out)*s }; const a = r()*tau, off = kink*was('sinuous')*run*step*.55*r(); d = norm(sub([x + Math.cos(a)*off, y, z + Math.sin(a)*off], tip.p)) }
    tip = add0(add(tip.p, d, step), tip, stage); if (leader) tip.leader = true } }
  // a trunk may bow off its line on the way up (sp.trunkBow); its stems carry on from where it ended up, so wood never bends out and then back in
  const bare = g.crownOnly ? H*bottom : H*g.bare*was('trunkFrac'), bowTo = sp.trunkBow ? r()*tau : 0
  const bow = sp.trunkBow ? y => { const t = clamp((y - root[1])/bare), s = sp.trunkBow*bare*t**1.6; return [Math.cos(bowTo)*s, Math.sin(bowTo)*s] } : null
  climbTo(root[1] + bare, sp.trunkBow ? Math.min(c.trunkRun, 3) : c.trunkRun, c.trunkKink, -1, false, [], bow)
  // (a bowed trunk carries its top off the centre line: a crown grown round the old centre would hang to one side of it, so with self-organising growth the crown moves over onto the trunk)
  if (c.selfOrg && g.crownOnly){ const [ax, az] = axis(tip.p[1]); crownShift = [tip.p[0] - ax, tip.p[2] - az] }
  tip.stage = 0
  const rungs = nodes.length - 1
  // the trunk may divide here into stems, each leaning out a little and carrying on as a leader of its own; a lone stem is the trunk going on
  // and a stem may divide again higher up (c.splits: heights, counts and spreads), each new stem fanning about its parent's lean, so thick wood keeps dividing before it turns to limbs
  const stems = Math.round(clamp(sp.stems + (r() - .5)*sp.stemVar, 1, 5)), heads = [], top = Math.max(c.leader*was('trunkFrac'), bottom + .08)*H*lerp(1 - .12*v, 1 + .1*v, r()), splits = c.splits ?? []
  const divide = (fork, lines, level, onCentre = !level) => {
    const s = level ? splits[level - 1] : null, n = s ? s.n[0] + Math.floor(r()*(s.n[1] - s.n[0] + 1)) : stems, spread = s ? s.spread : sp.stemSpread, next = splits[level], spin = r()*tau
    for (let i = 0; i < n; i++){
      tip = fork
      const lean = lines.filter(l => l.out !== undefined).at(-1), out = lean ? lean.out + (i - (n - 1)/2)*2.2/n + (r() - .5)*.4 : spin + i/n*tau + (r() - .5)*.6
      const slope = Math.tan(spread*Math.PI/180*lerp(.75, 1.15, r())), central = c.centralStem && onCentre && !i && n > 1, mine = n > 1 && !central ? [...lines, { out, slope, from: fork.p[1] }] : lines   // (centralStem) one stem carries straight on up the middle, the rest lean out around it
      if (next){ climbTo(root[1] + H*next.at*lerp(.9, 1.1, r()), c.leaderRun, c.leaderKink, 0, true, mine); divide(tip, mine, level + 1, central) }
      else { climbTo(root[1] + top*(n > 1 || level ? lerp(.82, 1, r()) : 1), c.leaderRun, c.leaderKink, 0, true, mine); heads.push(tip) }
    }
  }
  if (!c.pureFractal && !c.selfOrg) { const [ax, az] = axis(tip.p[1]); divide(tip, sp.trunkBow ? [{ shift: [tip.p[0] - ax, tip.p[2] - az] }] : [], 0) }
  const ceiling = root[1] + H*c.crownTop                                // the stem stops short of the top, so the upper crown has room to rise and spread above it
  // Every branch is one straight shoot, set off at an angle to its parent that stays within fixed limits, so wood can't curl. Open space still decides: of the ways a shoot
  // could go, it takes the one that claims the most unclaimed crown, and it ends at the outline. Each generation is shorter and more numerous than the last.
  const leaderNodes = nodes.filter(n => n.leader).sort((p, q) => p.p[1] - q.p[1]), space = []      // limbs come off every stem, lowest first
  const inHeart = q => { const u = (q[0] - root[0])/(H*.34), v = (q[1] - root[1] - H*.6)/(H*.34), k = u*u + v*v - 1; return k*k*k - u*u*v*v*v < 0 && Math.abs(q[2] - root[2]) < H*g.slab }     // a test of the method, not a tree: any shape will do
  // (shape) a crown of any form, in place of the spun outline: a primitive - sphere, cube, torus, spiral - or an image pushed out into a flat slab.
  // All sit in a box as tall as the crown and as wide (shape.width x its height), centred on the trunk where the crown starts
  const shp = g.shape, shpH = ceiling - y0, shpW = shpH*(shp?.width ?? 1), shpC = [tip.p[0], y0 + shpH/2, tip.p[2]]
  const inShape = !shp ? null : q => { const u = (q[0] - shpC[0])/(shpW/2), v = (q[1] - shpC[1])/(shpH/2), w = (q[2] - shpC[2])/(shpW/2)
    if (shp.kind === 'sphere') return u*u + v*v + w*w < 1
    if (shp.kind === 'cube') return Math.max(Math.abs(u), Math.abs(v), Math.abs(w)) < .9
    // (ring) the torus's or spiral's radius, (tube) its thickness, both as a share of the box; (upright) the torus stands like a wheel, its hole facing you
    const R = shp.ring ?? .62, T = shp.tube ?? (shp.kind === 'torus' ? .32 : .2)
    if (shp.kind === 'torus'){ const [a1, b1] = shp.upright ? [Math.hypot(u, v) - R, w] : [Math.hypot(u, w) - R, v*.6]; return a1*a1 + b1*b1 < T*T }
    if (shp.kind === 'spiral'){ const turns = shp.turns ?? 2.5, pitch = 2/turns, th = Math.atan2(w, u)/(Math.PI*2), t = (v + 1)/pitch - th, k = Math.round(t), dv = (t - k)*pitch*.5*shpH/shpW, dr = Math.hypot(u, w) - R
      return k >= 0 && k < turns + .5 && dr*dr + dv*dv < T*T }
    if (shp.kind === 'slab' && shp.mask){ const rows = shp.mask, mh = rows.length, mw = rows[0].length, aspect = mw/mh
      if (Math.abs(q[2] - shpC[2]) > shpH*(shp.depth ?? .08)) return false
      const x = Math.floor((u*shpW/2/shpH/aspect + .5)*mw), y = Math.floor((.5 - v/2)*mh)
      return x >= 0 && y >= 0 && x < mw && y < mh && rows[y][x] === '1' }
    return false }
  const inside = g.heart ? inHeart : shp ? inShape : q => { if (q[1] >= ceiling) return false; const [x, z] = axis(q[1]), dx = q[0] - x, dz = q[2] - z
    const m = Math.hypot(dx, dz), reach = c.inset*reachAt(q[1])*lobes(Math.atan2(dz, dx))
    if (m >= reach) return false
    if (m > reach*.5) for (const b of bays){ const d = sub(q, b.p); if (dot(d, d) < b.r*b.r) return false }   // bays bite the edge, never the heart: where a crown is narrow they'd close the way up
    return true }
  // a layered species grows into flat tiers: the wood is drawn only to the tiers, so it climbs between them and fans out level within them
  const T = g.tiers, tph = T ? [r()*7, r()*7, r()*7] : null, tierOf = !T ? null : q => { const az = Math.atan2(q[2] - root[2], q[0] - root[0]), out = Math.hypot(q[0] - root[0], q[2] - root[2])/W
    const u = (q[1] - y0)/(ceiling - y0)*T.count + T.wobble*(Math.sin(az*2 + tph[0]) + .6*Math.sin(az*3 + tph[1]) + .5*Math.sin(out*4 + tph[2])), f = u - Math.floor(u)
    return { gap: f < T.gap, mid: (q[1] + (Math.floor(u) + (1 + T.gap)/2 - u)*(ceiling - y0)/T.count) } }
  // the fitted volume, as rings round the crown's axis, for the outline overlay: what the growth was asked to fill
  const envelope = { rings: [], hollow: [] }
  if (!g.heart && !shp) for (let k = 0; k <= 24; k++){ const y = lerp(y0, ceiling, k/24), [ax, az] = axis(y), ring = []
    for (let j = 0; j <= 48; j++){ const th = j/48*tau, rr = c.inset*reachAt(y)*lobes(th); ring.push([ax + Math.cos(th)*rr, y, az + Math.sin(th)*rr]) }
    envelope.rings.push(ring) }
  const span = shp ? Math.max(wide, shpW*.55, shpH*1.2) : wide          // a shape's box may be wider than the outline was
  const pts = c.points*(1 + 2*(shp?.fine ?? 0))
  for (let t = 0; space.length < pts && t < pts*60; t++){ const q = [root[0] + (r()*2 - 1)*span, lerp(y0, ceiling, r()), root[2] + (r()*2 - 1)*span]; if (inside(q) && !(T && tierOf(q).gap)) space.push(q) }
  const near = (q, o, d, len, rad) => { const v0 = q[0] - o[0], v1 = q[1] - o[1], v2 = q[2] - o[2], s = v0*d[0] + v1*d[1] + v2*d[2]; if (s < -rad || s > len + rad) return false   // plain numbers, no arrays: this runs millions of times
    const t = Math.min(Math.max(s/len, 0), 1)*len, x = v0 - d[0]*t, y = v1 - d[1]*t, z = v2 - d[2]*t; return x*x + y*y + z*z < rad*rad }
  // angles are measured from the heading of the bough, not from the parent shoot: a chain of children all leaning the same way would add up to an arc, this way it can only zig-zag about its line
  // sunlight: a top-down map of the wood so far. A shoot that would lie under other wood counts for less, so branches spread round the crown instead of stacking
  const tilt = (r() - .5)*14*v, climb = c.up + sp.upward - base.upward, sag = c.sag + sp.droop - base.droop
  const shade = new Map(), cellOf = q => Math.floor(q[0]/c.sunCell) + 4096*Math.floor(q[2]/c.sunCell), shadeOn = (o, d, len) => { let t = 0; for (let i = 1; i <= 4; i++) t += shade.get(cellOf(add(o, d, len*i/4))) ?? 0; return t/4 }
  // wood already grown, in a coarse grid: a shoot can't take a line that runs into it. Girth isn't known until the tree is finished, so each generation has an expected radius
  const woodGrid = new Map(), woodCell = 1.2*scale, woodKey = (x, y, z) => Math.floor(x/woodCell) + 2048*(Math.floor(y/woodCell) + 2048*Math.floor(z/woodCell))
  const girthOf = k => c.girths[Math.min(k, c.girths.length - 1)]*scale
  const noteWood = (q, rad) => { const key = woodKey(...q); (woodGrid.get(key) ?? woodGrid.set(key, []).get(key)).push({ q, rad }) }
  const hits = (q, rad, from, skip) => { const x0 = Math.floor(q[0]/woodCell), y0g = Math.floor(q[1]/woodCell), z0 = Math.floor(q[2]/woodCell)
    for (let x = x0 - 1; x <= x0 + 1; x++) for (let y = y0g - 1; y <= y0g + 1; y++) for (let z = z0 - 1; z <= z0 + 1; z++) for (const e of woodGrid.get(x + 2048*(y + 2048*z)) ?? []){
      const a = sub(e.q, from); if (dot(a, a) < skip*skip) continue       // wood it's leaving is a joint, not a collision
      const d = sub(e.q, q), gap = e.rad + rad + c.clear*scale; if (dot(d, d) < gap*gap) return true }
    return false }
  const shoot = (from, pd, k, turn, rise, wide, aim, to) => {
    const sh = c.gens[Math.min(k, c.gens.length - 1)], around = perpTo(pd), spreadBy = was('childAngle')
    let best = null, top = 0
    for (let t = 0, tries = k < 3 ? 14 : 7; t < tries; t++){
      const open = (wide ? lerp(c.sideMin, c.sideMax, r()) : rise === undefined ? lerp(sh.min, sh.max, r()) : lerp(c.limbLow + tilt, c.limbHigh + tilt, rise) + (r() - .5)*c.limbVar)*spreadBy*Math.PI/180, az = turn + (r() - .5)*(.8 + t/(tries - 1)*(tau - .8)*(1 - (c.order ?? 0))),    way = rotateAbout(around, pd, az), d = aim ? norm(add(aim, randDir(r), t ? .22 : 0)) : norm(add([pd[0]*Math.cos(open), pd[1]*Math.cos(open), pd[2]*Math.cos(open)], way, Math.sin(open)))
      const high = clamp((from.p[1] - root[1] - H*c.highFrom)/(H*.3))   // the lower crown hangs and the upper crown climbs
      if (d[1] < lerp(wide ? c.droopSide : lerp(c.droop, c.droopTip, k/(c.gens.length - 1)), c.highRise, high)) continue    // thick wood holds itself up, fine wood hangs, and side boughs may dip to reach the lower crown
      const x = from.p[0] - root[0], z = from.p[2] - root[2], m = Math.hypot(x, z)
      const above = k >= (c.topFrom ?? 2) && from.p[1] > root[1] + H*c.leader*.85 && m < W*(c.topMiddle ?? .3)      // above the stem's head, near the middle, there's no trunk to keep clear of and the crown's top has to fill; out on the flanks wood still only heads out
      if (!above && m > R*1.5 && (d[0]*x + d[2]*z)/m < (m < R*c.core ? c.headway : 0)) continue     // never back towards the stem, and near it, clearly away
      // a shoot takes a share of the room left to the outline, so lengths shrink geometrically on the way out and the wood ends in many short twigs at the edge
      let room = 0; while (room < H && inside(add(from.p, d, room + step))) room += step
      if (room < step) continue
      const len = Math.min(to ? (c.fractal ? Math.min(room*c.fractal.reach, Math.max(to, room*(1 - c.fractal.ratio))) : Math.min(room, to)) : Math.min(room, Math.max(step, Math.max(room*c.share*was('lengthRatio')*lerp(.8, 1.2, r()), c.tip*scale))), (c.longest ?? 1e3)*scale*was('lengthRatio')*(c.shrink ?? 1)**k*lerp(.8, 1.1, r())),   // no generation runs further than this, however much room lies ahead: it has to divide
        rad = clamp(len*c.claim, c.claimLeast*scale, c.claimMost*scale)
      const mine = girthOf(k), skip = (aim ? R*.8 : girthOf(Math.max(k - 1, 0))*2) + mine*2 + c.clear*scale
      // the shoot's own kinks are planned before it grows, side to side about its line, so the clearance check runs along the wood as it will really stand
      const crook = c.crook*was('gnarl')*Math.min(1, .3 + k*.25), parts = clamp(Math.round(len/(c.crookLen*scale)), 1, 5), side0 = rotateAbout(perpTo(d), d, r()*tau), path = []
      for (let i = 0, was = 0; i < parts; i++){ const lean = i%2 ? -1 : 1, off = lean*crook*lerp(.5, 1.5, r()), turnTo = parts > 1 ? off - was*.6 : 0; was = off
        path.push({ v: i ? norm(add(add(d, side0, turnTo), randDir(r), crook*.4)) : d, n: Math.max(Math.round(len/parts/step), 1) }) }
      { let blocked = false, q = from.p, u = 0, far = 0; for (const seg of path) for (let i = 0; i < seg.n && !blocked; i++){ q = add(q, seg.v, step); u += step; const out = Math.hypot(q[0] - root[0], q[2] - root[2]); far = Math.max(far, out); if (!above && out < R*c.core && out < far - .15*scale) blocked = true; else if (u >= skip) blocked = hits(q, mine, from.p, skip) } if (blocked) continue }
      let score = 0; for (const q of space) if (near(q, from.p, d, len, rad)) score++
      score *= (1 + (climb + high)*d[1])/(1 + c.sun*shadeOn(from.p, d, len))/len       // space claimed per metre: a long flat run earns nothing for its length
      if (score > top || (aim && c.fractal && !best)){ top = score; best = { d, len, rad, path } }
      if (aim && best && c.fractal) break                               // a fractal fork's child keeps to its own line: the first good one near it
    }
    if (!best) return null
    let n = from
    for (const seg of best.path) for (let i = 0; i < seg.n; i++){ n = add0(add(n.p, seg.v, step), n, k + 1); noteWood(n.p, girthOf(k)) }
    for (let i = space.length - 1; i >= 0; i--) if (near(space[i], from.p, best.d, best.len, best.rad)){ space[i] = space[space.length - 1]; space.pop() }
    for (let i = 1, parts = Math.ceil(best.len/c.sunCell); i <= parts; i++){ const q = cellOf(add(from.p, best.d, best.len*i/parts)); shade.set(q, (shade.get(q) ?? 0) + Math.min(best.rad, 1)) }
    return { tip: n, d: best.d, len: best.len }
  }
  // big wood goes first, so finer wood fills what's left
  for (const n of nodes) noteWood(n.p, n.stage < 0 ? R : R*.7)
  const shoots = []
  const limbOn = c.limbFrom ? leaderNodes.filter(n => n.p[1] >= root[1] + H*c.limbFrom) : leaderNodes      // a species may keep its stems clear of limbs low down
  const limbs = leaderNodes.length, spin = r()*tau, count = Math.max(Math.round(c.limbs*was('children')), 3)
  if (!c.pureFractal && !c.selfOrg) for (let i = 0; i < count; i++){ const at = limbOn[Math.floor(lerp(1, limbOn.length*c.limbTop, (i + r()*.5)/count))]; if (at) shoots.push({ from: at, pd: [0, 1, 0], k: 0, turn: spin + i*2.4, rise: i/(count - 1) }) }      // low limbs leave nearly level and high ones climb, so the crown fills to its corners and its top
  if (!c.pureFractal && !c.selfOrg) for (const head of heads) for (let i = 0, n = Math.ceil(c.crownLimbs/heads.length), spun = r()*tau; i < n; i++) shoots.unshift({ from: head, pd: [0, 1, 0], k: 0, turn: spun + i/n*tau, rise: 1.25 })      // the stem divides at its head into a few steep limbs, which fill the upper middle of the crown
  // Fractal forks (c.fractal): a shoot ends by dividing into n children set evenly about its heading at a fixed angle, each a fixed fraction of its length.
  // The fork's plane turns about the heading from its parent's, and of a few turns near that, the one whose children would claim the most open crown wins:
  // the pattern decides the shape of every fork, the outline decides only how each one is turned. Children never head in towards the stem.
  const forkFractal = (o, got, next) => {
    const F = c.fractal, h = got.d, len = got.len*F.ratio
    if (len < step*(F.least ?? 2)) return
    const x = got.tip.p[0] - root[0], z = got.tip.p[2] - root[2], m = Math.hypot(x, z), out = m > R*1.5 ? [x/m, 0, z/m] : null
    const rad = clamp(len*c.claim, c.claimLeast*scale, c.claimMost*scale), base = (o.plane ?? r()*tau) + F.twist*Math.PI/180
    let best = null, top = -1
    for (let t = 0; t < F.tries; t++){
      const plane = base + (t ? (r() - .5)*2*F.jitter : 0), p = rotateAbout(perpTo(h), h, plane), a = F.angle*Math.PI/180, dirs = []
      for (let i = 0; i < F.n; i++){ const side = F.n === 2 ? (i ? p : [-p[0], -p[1], -p[2]]) : rotateAbout(p, h, i*tau/F.n)
        let d = norm(add([h[0]*Math.cos(a), h[1]*Math.cos(a), h[2]*Math.cos(a)], side, Math.sin(a)))
        if (out && F.outward) d = norm(add(d, out, F.outward))
        if (out && d[0]*out[0] + d[2]*out[2] < 0) continue                // never back towards the stem
        dirs.push(d) }
      let score = 0; for (const d of dirs) for (let j = 0; j < space.length; j += 3) if (near(space[j], got.tip.p, d, len, rad)) score++
      if (score > top){ top = score; best = { plane, dirs } } }
    if (best) for (const d of best.dirs) shoots.push({ from: got.tip, pd: h, k: next, turn: 0, aim: d, to: len, plane: best.plane })
  }
  const spreadOut = most => { for (let made = 0; shoots.length && made < most; made++){
    const o = shoots.shift(), got = shoot(o.from, o.pd, o.k, o.turn, o.rise, o.wide, o.aim, o.to), next = o.k + 1
    if (!got || next >= (c.fractal?.depth ?? c.gens.length)) continue
    if (c.fractal){ forkFractal(o, got, next); continue }
    const sh = c.gens[next], chain = []; for (let n = got.tip; n !== o.from; n = n.parent) chain.push(n)
    // the first boughs climb, then wood spreads for the light: each generation leans further out from the middle of the crown, so the tips radiate from it like a burr
    const out = norm(sub(got.tip.p, [root[0], root[1] + H*c.middle, root[2]])), heading = norm(add(add(o.heading ? norm(add(o.heading, got.d, c.follow)) : got.d, out, c.spread[Math.min(next, c.spread.length - 1)]), [0, 1, 0], -sag*next*(1 - clamp((got.tip.p[1] - root[1])/(H*c.highFrom)))))     // and the outer wood sags under its weight, most of all low in the crown
    if (c.level){ const k = c.level*clamp((next - 1)/3); heading[1] *= 1 - k; const n = Math.hypot(...heading) || 1; heading[0] /= n; heading[1] /= n; heading[2] /= n }   // layered species: fine wood fans out level
    let turn = r()*tau
    for (let i = 0; i < sh.fork; i++){ shoots.push({ from: got.tip, pd: heading, heading, k: next, turn }); turn += tau/sh.fork }
    for (let i = 0; i < sh.sides; i++){ const at = chain[Math.floor(lerp(.2, .75, (i + r())/sh.sides)*chain.length)]; if (at) shoots.push({ from: at, pd: heading, heading, k: next, turn: (turn += 2.4), wide: next <= c.wideTo && at.p[1] < root[1] + H*c.wideBelow }) }     // side branches leave wider than forks: that's what carries the crown out from rising limbs
  } }
  // The pure fractal experiment (c.pureFractal): from the top of the trunk every branch grows straight, then forks in two at a fixed angle, its fork's plane
  // turned from its parent's, each child a fixed fraction of its parent's length. The outline only stops growth (and, with fit, picks each fork's turn
  // from a few near the pattern's own, by the open crown its children would claim). No other rule: wood may cross and touch.
  if (c.pureFractal){ const P = c.pureFractal, queue = []
    // the first split: n stems (P.firstN) set evenly round the trunk, leaning out at P.firstAngle; a lone first stem is the trunk going on
    { const fn = P.firstN ?? 1, spin = r()*tau
      for (let i = 0; i < fn; i++){ const a = fn > 1 ? (P.firstAngle ?? 35)*Math.PI/180 : 0, th = spin + i/fn*tau + (r() - .5)*.4
        queue.push({ from: tip, d: norm([Math.cos(th)*Math.sin(a), Math.cos(a), Math.sin(th)*Math.sin(a)]), len: P.first*H, gen: 0, plane: th + Math.PI/2 }) } }
    const roomTo = (o, d) => { let u = 0; while (u < H && inside(add(o, d, u + step))) u += step; return u }
    // the open crown in a grid, so a fork asks only the cells its children pass through
    const SC = Math.max(H/16, c.claimMost*scale), sg = new Map(), SK = (x, y, z) => (x + 512) + 1024*((y + 512) + 1024*(z + 512))
    for (const q of space){ const k = SK(Math.floor(q[0]/SC), Math.floor(q[1]/SC), Math.floor(q[2]/SC)); (sg.get(k) ?? sg.set(k, []).get(k)).push({ q, gone: false }) }
    const eachNear = (o, d, len, rad, f) => { const e = add(o, d, len)
      const x0 = Math.floor((Math.min(o[0], e[0]) - rad)/SC), x1 = Math.floor((Math.max(o[0], e[0]) + rad)/SC), y0 = Math.floor((Math.min(o[1], e[1]) - rad)/SC), y1 = Math.floor((Math.max(o[1], e[1]) + rad)/SC), z0 = Math.floor((Math.min(o[2], e[2]) - rad)/SC), z1 = Math.floor((Math.max(o[2], e[2]) + rad)/SC)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (const s of sg.get(SK(x, y, z)) ?? []) if (!s.gone && near(s.q, o, d, len, rad)) f(s) }
    while (queue.length && nodes.length < 60000){ const o = queue.shift()
      let n = o.from, run = 0
      while (run + step <= o.len){ const q = add(n.p, o.d, step); if (o.gen && !inside(q)) break; n = add0(q, n, o.gen + 1); run += step }
      if (n === o.from) continue
      const rad = clamp(run*c.claim, c.claimLeast*scale, c.claimMost*scale)
      eachNear(o.from.p, o.d, run, rad, s => { s.gone = true })
      const len0 = o.len*P.ratio
      if (o.gen + 1 > P.depth || len0 < step*(P.least ?? 1.5)) continue
      const h = o.d, base = o.plane + P.twist*Math.PI/180, low = clamp(1 - (n.p[1] - root[1])/(H*.6))
      const [aLo, aHi] = Array.isArray(P.angle) ? P.angle : [P.angle, P.angle]
      let best = null, top = -Infinity
      for (let t = 0; t < (P.fit ? P.tries : 1); t++){
        const plane = base + (t ? (r() - .5)*2*P.jitter : 0), a = (t ? lerp(aLo, aHi, r()) : (aLo + aHi)/2)*Math.PI/180, p = rotateAbout(perpTo(h), h, plane), kids = []
        for (const sgn of [1, -1]){ let d = norm(add([h[0]*Math.cos(a), h[1]*Math.cos(a), h[2]*Math.cos(a)], p, sgn*Math.sin(a)))
          if (P.sag) d = norm(add(d, [0, -1, 0], P.sag*low))                // low in the crown a fork's children are drawn down a little, into the skirt
          // a child is its parent's fraction, or, where the outline is still far off, may stretch to a share of the room ahead (P.stretch)
          const room = P.stretch ? roomTo(n.p, d) : 0, len = P.stretch ? Math.max(len0, Math.min(room*P.stretch, len0*(P.stretchMost ?? 2))) : len0
          kids.push({ d, len }) }
        // (P.outFor) for its first generations, while the wood is thick, a fork is turned so neither child heads back in towards the trunk
        const mx = n.p[0] - root[0], mz = n.p[2] - root[2], mm = Math.hypot(mx, mz), inward = o.gen < (P.outFor ?? 0) && mm > R*2 && kids.some(k => (k.d[0]*mx + k.d[2]*mz)/mm < -.05)
        let score = 0; if (P.fit) for (const k of kids) eachNear(n.p, k.d, k.len, rad, () => score++)
        if (inward) score = -1 + score*1e-6
        if (score > top){ top = score; best = { plane, kids } } }
      for (const k of best.kids) queue.push({ from: n, d: k.d, len: k.len, gen: o.gen + 1, plane: best.plane }) } }
  // Self-organising growth (c.selfOrg; Pałubicki et al. 2009): from the trunk's top, growth only from buds. Each year buds compete for the crown's marker
  // points (each sees only a cone ahead of it, and takes the points within its own space), the space found flows down to the trunk, and a resource flows
  // back up, split at every branch point by the apical control lambda between the axis carrying on and the lateral. A bud's share sets how many internodes
  // it grows and how long; their direction is the bud's own, bent toward the open space it saw and by tropism. Side buds turn round the stem by the golden
  // angle and stand off it at the branch angle. Leaders, stems and their spacing all emerge; there are no direction rules.
  else if (c.selfOrg){ const S = { ...c.selfOrg }
    if (g.shape){ const f = g.shape.fine ?? 0; S.maxOrder = 0; S.years = Math.max(S.years, 60) }   // a shaped crown: no depth limit, and growth runs until the shape is full
    // (split, the Split low slider) apical control lifted just above the bare trunk, and a V left open above it: 0 keeps one trunk, 1 divides it into strong stems
    if (sp.split > 0 && !S.whorl){ S.lowLambda = lerp(Array.isArray(S.lambda) ? S.lambda[0] : S.lambda, .3, sp.split); S.lowTo = (tip.p[1] - root[1])/H + (S.splitSpan ?? .15); S.vase = 12 + 25*sp.split } else { delete S.lowLambda; delete S.vase }   // (a tree that grows rings of limbs keeps one leader: the low split doesn't apply)
    const L0 = S.internode*(1 - .55*(g.shape?.fine ?? 0))*Math.min(H, 2*W),   // a metamer's length goes by the crown's smaller span: a narrow conifer needs fine shoots to fill its width
      rho = S.occupy*L0, rp = S.perceive*L0, cosHalf = Math.cos((shp ? Math.max(S.angle, 150) : S.angle)/2*Math.PI/180), br = S.branch*Math.PI/180, lam = S.lambda, gold = 2.39996
    // (hollow) the lower crown is a dome, not a solid: below mid-crown only the outer part of each layer draws wood, so nothing is pulled down round the trunk
    const yMid = (y0 + ceiling)/2
    if (S.hollow) for (let k = 0; k <= 12; k++){ const y = lerp(y0, yMid, k/12), [ax, az] = axis(y), rr = S.hollow*(yMid - y)/(yMid - y0)*reachAt(y), ring = []
      for (let j = 0; j <= 48; j++){ const th = j/48*tau; ring.push([ax + Math.cos(th)*rr, y, az + Math.sin(th)*rr]) } envelope.hollow.push(ring) }
    // guide points - the V above the trunk where stems may climb, and the stem sketched up to the crown - lie inside the hollow; only the trunk's and
    // stems' own tips may see them, so side shoots near the trunk aren't drawn round it chasing space meant for the stems
    const marks = [], guide = []
    for (const q of space){ if (!S.hollow || q[1] >= yMid){ marks.push(q); guide.push(0); continue }
      const [ax, az] = axis(q[1]), u = (yMid - q[1])/(yMid - y0), m = Math.hypot(q[0] - ax, q[2] - az)
      if (m > S.hollow*u*reachAt(q[1])){ marks.push(q); guide.push(0) } else if (S.vase && m < (q[1] - tip.p[1])*Math.tan(S.vase*Math.PI/180)){ marks.push(q); guide.push(2) } }   // (vase) a V above the trunk stays open, for stems to climb into
    // (leaderGuide) a strong-leadered tree's stem is sketched right up the crown's centre line, so the leader climbs with the crown instead of wandering off to one side of it
    for (let y = tip.p[1]; y < (S.leaderGuide ? ceiling - L0 : (S.hollow ? yMid : y0) + rp*.5); y += L0*.4){ const [gx, gz] = S.leaderGuide ? axis(y) : [root[0], root[2]]; marks.push([gx + (r() - .5)*.006*H, y, gz + (r() - .5)*.006*H]); guide.push(1) }   // the stem, sketched up to the crown
    // a shape the trunk doesn't run into (a torus's hole, a spiral's start, an image's separate parts): the trunk is sketched across to the nearest of it
    if (shp && space.length){ let best = space[0], bd = Infinity; for (const q of space){ const d = Math.hypot(q[0] - tip.p[0], q[1] - tip.p[1], q[2] - tip.p[2]); if (d < bd){ bd = d; best = q } }
      for (let t = L0*.4; t < bd; t += L0*.4){ const f = t/bd; marks.push([lerp(tip.p[0], best[0], f), lerp(tip.p[1], best[1], f), lerp(tip.p[2], best[2], f)]); guide.push(1) } }
    const splitY = root[1] + H*(S.lowTo ?? 0), live = new Uint8Array(marks.length).fill(1), BC = Math.max(rp, rho), BK = (x, y, z) => (x + 512) + 1024*((y + 512) + 1024*(z + 512))
    const start = { n: tip, dir: [0, 1, 0], main: null, lat: null, stub: true, phy: r()*tau, gen: 0, k: 0 }, mets = [start]
    // Growth habit, set per species and per branch order (gen: 0 the trunk and its leader, 1 its limbs, 2 theirs...): a number applies to every order, a list is read by order
    //   branch   - the angle a side bud leaves its shoot at
    //   tropism  - the pull up (+) or down (-) on every shoot: up for columns and conifers, down for weeping wood
    //   level    - how far shoots are held level (plagiotropism): a pine's or a cedar's limbs run out flat, an oak's low limbs spread wide
    //   wiggle   - a random turn at each step: a crooked oak limb, against a straight cedar's
    //   whorl    - { count, upTo }: the axes up to this order make their side shoots only at the end of each year's growth, several at once round the stem (a pine's tiers)
    const latOfAngle = (d, phy, deg) => { const b = deg*Math.PI/180, p = rotateAbout(perpTo(d), d, phy); return norm(add([d[0]*Math.cos(b), d[1]*Math.cos(b), d[2]*Math.cos(b)], p, Math.sin(b))) }
    // a side shoot's planes: its parent's, plus one where it leaves the parent, across the parent's direction there. Off the trunk (which points up) the plane is
    // across the shoot's own starting bearing instead, so a limb can't swing back across the trunk
    const lateralPlanes = (parent, d) => { const own = parent.gen === 0 ? d : parent.dir, h = Math.hypot(own[0], own[2])
      return h > .05 ? [...(parent.planes ?? []), { p: parent.n.p, u: [own[0]/h, own[2]/h] }] : (parent.planes ?? []) }
    const byGen = (v, g) => Array.isArray(v) ? v[Math.min(g, v.length - 1)] : v
    // (in a slab, side buds turn into its plane: facing out of a thin wall they'd see no room and never grow)
    const flat = v => shp?.kind === 'slab' ? norm([v[0], v[1], v[2]*.15]) : v
    const latOf = (d, phy, gen) => { const b = byGen(S.branch, gen)*Math.PI/180, p = rotateAbout(perpTo(d), d, phy); return flat(norm(add([d[0]*Math.cos(b), d[1]*Math.cos(b), d[2]*Math.cos(b)], p, Math.sin(b)))) }
    // (multiStem) the trunk ends in a crown of stems: side buds round its top, each set out at the species' stem spread, so the tree divides at once (with Split low, as equals)
    if (S.multiStem && stems > 1){ let prev = start; start.stub = false; start.latDir = latOfAngle([0, 1, 0], start.phy, sp.stemSpread)
      for (let w = 1; w < stems; w++){ const wn = add0(add(prev.n.p, [0, 1, 0], L0*.03), prev.n, 1), wp = start.phy + w*tau/stems*(1 + (r() - .5)*.3)
        const wm = { n: wn, dir: [0, 1, 0], main: null, lat: null, phy: wp, latDir: latOfAngle([0, 1, 0], wp, sp.stemSpread*lerp(.8, 1.2, r())), gen: 0, k: 0, stub: false }
        prev.main = wm; mets.push(wm); prev = wm }
      prev.noTip = true }                                                // and the trunk ends there: a vase has no leader running on up the middle
    // (light) shadow propagation (Pałubicki et al. 2009, after Pałubicki 2007), in place of space markers: the crown is a grid of voxels about one shoot long. Every bud
    // casts a pyramid of shadow below it - a*b^-q into the voxels (I±p, J-q, K±p), q = 0..qmax, p = 0..q. A bud's light is Q = max(C - s + a, 0), and it grows toward
    // the least shaded voxel it can see. Outside the traced outline counts as full shade, so the outline still shapes the crown
    const LG = S.light ? (() => { const L = S.light, cell = L0*(L.cell ?? 1), qmax = L.qmax ?? 6, ext = wide, nx = Math.ceil(2*ext/cell) + 1, ny = Math.ceil((ceiling - root[1])/cell) + qmax + 2, nz = nx
      const x0 = root[0] - ext, y0g = root[1], z0 = root[2] - ext, sh = new Float32Array(nx*ny*nz), out = new Uint8Array(nx*ny*nz), at = (i, j, k) => (j*nz + k)*nx + i
      for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++){ const q = [x0 + (i + .5)*cell, y0g + (j + .5)*cell, z0 + (k + .5)*cell]; out[at(i, j, k)] = q[1] < root[1] + .3 ? 1 : 0 }   // only the ground is out of bounds
      const fall = Array.from({ length: qmax + 1 }, (_, q) => (L.a ?? 1)*(L.b ?? 2)**-q)
      return { L, cell, qmax, nx, ny, nz, x0, y0g, z0, sh, out, at, fall } })() : null
    function senseLight(buds){ const { L, cell, qmax, nx, ny, nz, x0, y0g, z0, sh, out, at, fall } = LG, a = L.a ?? 1, C = L.C ?? 3, reach = L.reach ?? 3
      const cellOf = p => [Math.floor((p[0] - x0)/cell), Math.floor((p[1] - y0g)/cell), Math.floor((p[2] - z0)/cell)]
      sh.fill(0)
      for (const b of buds){ const [I, J, K] = cellOf(b.p)
        for (let q = 0; q <= qmax; q++){ const j = J - q; if (j < 0) break; for (let k = K - q; k <= K + q; k++){ if (k < 0 || k >= nz) continue; for (let i = I - q; i <= I + q; i++){ if (i < 0 || i >= nx) continue; sh[at(i, j, k)] += fall[q] } } } }
      for (const b of buds){ const [I, J, K] = cellOf(b.p); if (I < 0 || J < 0 || K < 0 || I >= nx || J >= ny || K >= nz) continue
        b.Q = Math.max(C - sh[at(I, J, K)] + a, 0)/C
        // toward the light: every voxel the bud can see pulls by how lit it is, so in even light the pull is straight ahead and in uneven light it leans to the brighter side
        // (the paper's 'least-shaded voxel', taken over all of them: a single least voxel is a tie in open space, and settling ties the same way every time turns every shoot the same way)
        let vx = 0, vy = 0, vz = 0, seen = 0
        for (let dj = -reach; dj <= reach; dj++) for (let dk = -reach; dk <= reach; dk++) for (let di = -reach; di <= reach; di++){ if (!di && !dj && !dk) continue
          const i = I + di, j = J + dj, k = K + dk; if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue
          const len = Math.hypot(di, dj, dk); if (len > reach + .01 || (di*b.d[0] + dj*b.d[1] + dk*b.d[2])/len < cosHalf) continue
          // outside the outline is lit like anywhere else: buds near the edge reach out toward it and are stopped by the outline, as a pruned hedge is - they don't turn to run along it
          const c = at(i, j, k); if (out[c] && !L.edgeDark) continue
          const w = Math.max(C - sh[c] + a, 0)/(C + a); if (w <= 0) continue
          vx += w*di/len; vy += w*dj/len; vz += w*dk/len; seen++ }
        if (seen) b.V = [vx/seen, vy/seen, vz/seen]; else b.Q = 0 } }
    let shpReached = false, bridges = 0
    const limbs = []
    for (let year = 0; year < S.years; year++){
      // (whorl.vary) a good year and a poor one: each year's shoots run longer or shorter, so a pine's rings of limbs are never evenly spaced
      const season = S.whorl?.vary ? lerp(1 - S.whorl.vary, 1 + S.whorl.vary, r()) : 1
      for (const lm of limbs) lm.got *= .6                                   // (shed) what a limb gathers counts most in recent years
      const buds = []
      for (const m of mets){ if (!m.main && !m.noTip) buds.push({ m, t: true, p: m.n.p, d: m.dir, Q: 0, V: [0, 0, 0] }); if (!m.stub && !m.lat) buds.push({ m, t: false, p: m.n.p, d: m.latDir, Q: 0, V: [0, 0, 0] }) }
      if (S.light){ senseLight(buds) } else {
      const bg = new Map(); for (const b of buds){ const k = BK(Math.floor(b.p[0]/BC), Math.floor(b.p[1]/BC), Math.floor(b.p[2]/BC)); (bg.get(k) ?? bg.set(k, []).get(k)).push(b) }
      for (let i = 0; i < marks.length; i++){ if (!live[i]) continue
        const q = marks[i], i0 = Math.floor(q[0]/BC), j0 = Math.floor(q[1]/BC), k0 = Math.floor(q[2]/BC); let best = null, bd = rp, gone = false
        for (let a = i0 - 1; a <= i0 + 1 && !gone; a++) for (let b2 = j0 - 1; b2 <= j0 + 1 && !gone; b2++) for (let c2 = k0 - 1; c2 <= k0 + 1 && !gone; c2++) for (const b of bg.get(BK(a, b2, c2)) ?? []){
          const dx = q[0] - b.p[0], dy = q[1] - b.p[1], dz = q[2] - b.p[2], dd = Math.hypot(dx, dy, dz)
          if (dd < rho){ gone = true; break }
          if (guide[i] === 1 && !(b.t && b.m.gen === 0)) continue                                   // the sketched stem: the trunk's own tip only
          if (guide[i] === 2){ const tipOk = b.t && b.m.gen <= 1
            // a trunk side bud where stems start sees only its own side of the V: a stem climbs into its own sector, never across or round the trunk
            let sideOk = false; if (S.sideV !== false && !b.t && b.m.gen === 0 && b.p[1] < splitY){ const [ax, az] = axis(q[1]), ox = q[0] - ax, oz = q[2] - az, om = Math.hypot(ox, oz), hm = Math.hypot(b.d[0], b.d[2]); sideOk = om > 1e-6 && hm > 1e-6 && (ox*b.d[0] + oz*b.d[2])/(om*hm) > .5 }
            if (!tipOk && !sideOk) continue }
          if (dd < bd && (guide[i] === 1 && shp || (dx*b.d[0] + dy*b.d[1] + dz*b.d[2])/(dd || 1) > cosHalf)){ bd = dd; best = b } }   // (a shape's bridge is seen whichever way it runs)
        if (gone){ live[i] = 0; continue }
        if (best){ const dx = q[0] - best.p[0], dy = q[1] - best.p[1], dz = q[2] - best.p[2], dd = Math.hypot(dx, dy, dz) || 1; best.V[0] += dx/dd; best.V[1] += dy/dd; best.V[2] += dz/dd; best.Q = 1 } } }
      // (reward) a bud pointing out from the trunk earns more of the tree's growth than one pointing round it or back: outward shoots win, sideways ones fall behind.
      // Nothing is blocked or bent - the competition between buds is just weighted toward the way a crown spreads
      if (S.reward) for (const b of buds){ if (b.m.gen === 0 && b.t) continue
        // (rewardFrom 'limb') outward from where the bud's limb leaves the trunk, not from the crown's centre line: a bent or leaning trunk still gets limbs all round
        const lb = S.rewardFrom === 'limb' ? b.m.limb?.base : null, [ax, az] = lb ? [lb.p[0], lb.p[2]] : axis(b.p[1]), ox = b.p[0] - ax, oz = b.p[2] - az, om = Math.hypot(ox, oz), hm = Math.hypot(b.d[0], b.d[2])
        if (!lb && om < L0 || hm < .05) continue
        if (lb && om < L0){ const out = 1; b.Q *= 1 + S.reward*out; continue }
        const out = (ox*b.d[0] + oz*b.d[2])/(om*hm); b.Q *= Math.max(0, 1 + S.reward*out) }
      // (whorl.sure) every bud of a ring breaks: whatever space it sees, a pine's ring buds all grow the next spring - competition decides how far, not whether
      if (S.whorl?.sure) for (const b of buds) if (!b.t && b.m.ring && b.m.gen === 0 && !b.m.lat && b.Q < S.whorl.sure){ b.Q = S.whorl.sure; if (!Math.hypot(...b.V)) b.V = [b.d[0], 0, b.d[2]] }
      for (const b of buds) if (b.t){ b.m.tQ = b.Q; b.m.tV = b.V } else { b.m.lQ = b.Q; b.m.lV = b.V }
      const Qof = m => { m.Qm = m.main ? Qof(m.main) : m.tQ ?? 0; m.Ql = m.lat ? Qof(m.lat) : (m.stub ? 0 : m.lQ ?? 0); return m.Qm + m.Ql }
      const Qbase = Qof(start); if (!Qbase) break
      const lowY = root[1] + H*(S.lowTo ?? 0)
      // (lambda by order) apical control can differ by branch order: a limb whose own tip dominates its side shoots keeps its line instead of being led off by whichever side shoot has room
      const give = (m, v) => { const lam = S.lowLambda !== undefined && m.n.p[1] < lowY ? S.lowLambda : byGen(S.lambda, m.gen), den = lam*m.Qm + (1 - lam)*m.Ql,   // (lowLambda) apical control lifted low on the tree: side shoots there grow as strong as the leader, and become stems
        vm = den ? v*lam*m.Qm/den : 0, vl = v - vm
        if (m.main) give(m.main, vm); else { m.tv = vm; if (m.limb) m.limb.got += vm }
        if (m.lat) give(m.lat, vl); else m.lv = vl }
      give(start, S.vigor*(S.light?.gain ?? 1)*Qbase)
      if (S.whorl?.sure) for (const m of mets) if (m.ring && m.gen === 0 && !m.stub && !m.lat && m.lQ) m.lv = Math.max(m.lv ?? 0, 1 + S.whorl.sure)   // and grows at least a shoot                     // (light.gain) light comes in fractions where free space came whole: the same vigour needs scaling to it
      const grown = mets.length
      const grow = (from, d0, V, v, asLateral) => { let n = Math.min(Math.floor(v), S.maxShoot); if (n < 1) return
        // (counted from the crown: a tree that divides into stems spends its first order on them, so it gets one more)
        const deepest = S.maxOrder ? S.maxOrder + (S.multiStem || sp.split > 0 ? 1 : 0) : Infinity
        if (asLateral && from.gen + 1 > deepest) return
        // (twigLen) the last order is twigs: they stay short, so the growth they can't spend on side shoots isn't spent running them out into long whips
        const twigCap = from.gen + (asLateral ? 1 : 0) >= deepest ? (S.twigLen ?? 6) : Infinity
        if (!asLateral && from.k >= twigCap) return     // (maxOrder) branching goes only so many orders deep: past it the crown fills by lengthening what's there, not by chaining ever-finer side shoots
        // (alternate) a branch's side shoots grow on alternate sides of it: a side shoot that would grow on the same side as the last one is mirrored across the branch,
        // so the shoots that win room can't keep stepping the same way round the tree
        if (S.alternate && asLateral){ const ax = from.axis ??= { last: 0 }, pd = from.dir, ph = Math.hypot(pd[0], pd[2]), dh = Math.hypot(d0[0], d0[2])
          if (ph > .05 && dh > .05){ const ux = pd[0]/ph, uz = pd[2]/ph, side = Math.sign(ux*d0[2] - uz*d0[0]) || 1
            if (side === ax.last){ const dot = d0[0]*ux + d0[2]*uz; d0 = norm([2*dot*ux - d0[0], d0[1], 2*dot*uz - d0[2]]); V = [2*(V[0]*ux + V[2]*uz)*ux - V[0], V[1], 2*(V[0]*ux + V[2]*uz)*uz - V[2]] }
            ax.last = side === ax.last ? -side : side } }
        const Wa = S.whorl && from.gen + (asLateral ? 1 : 0) <= S.whorl.upTo ? S.whorl : null
        if (Wa?.vary) n = Math.max(1, Math.min(Math.round(n*season*lerp(.85, 1.15, r())), S.maxShoot + 2))   // this axis's growth this year
        const l = Math.min(v/Math.floor(v), 2)*L0, vm = Math.hypot(...V), Vn = vm ? [V[0]/vm, V[1]/vm, V[2]/vm] : [0, 0, 0]
        let prev = from, d = d0, phy = from.phy
        for (let i = 0; i < n; i++){
          if ((i === 0 && asLateral ? 0 : prev.k) + 1 > twigCap) break
          const g = prev.gen + (i === 0 && asLateral ? 1 : 0)
          d = norm(add(add(d, Vn, S.env), [0, 1, 0], byGen(S.tropism, g)))
          const lv = byGen(S.level ?? 0, g); if (lv && Math.hypot(d[0], d[2]) > .05) d = norm([d[0], d[1]*(1 - lv), d[2]])
          const wg = byGen(S.wiggle ?? 0, g); if (wg) d = norm(add(d, randDir(r), wg))
          // (outward) a limb's heading stays within this many degrees of straight out from the trunk: wood held level can't sweep round the crown following the ring of open space
          // (topOutward) the freed upper twigs keep a looser outward limit
          const ow = S.topFree && g >= 2 && prev.n.p[1] > y0 + (ceiling - y0)*S.topFree ? (S.topOutward ?? 0) : byGen(S.outward ?? 0, g); if (ow && g >= 1){ const [ax, az] = axis(prev.n.p[1]), ox = prev.n.p[0] - ax, oz = prev.n.p[2] - az, om = Math.hypot(ox, oz), hm = Math.hypot(d[0], d[2])
            if (om > L0 && hm > .05){ const ux = ox/om, uz = oz/om, hx = d[0]/hm, hz = d[2]/hm, cosA = hx*ux + hz*uz, lim = ow*Math.PI/180
              if (cosA < Math.cos(lim)){ const side = Math.sign(ux*hz - uz*hx) || 1, c = Math.cos(lim), sn = Math.sin(lim)*side, nx = ux*c - uz*sn, nz = uz*c + ux*sn; d = norm([nx*hm, d[1], nz*hm]) } } }
          // (planes) a shoot never grows back behind any branch it came from: where it left each ancestor there's a plane across that ancestor's way,
          // and whatever grows beyond keeps to the forward side of all of them (sideways only, so weeping and drooping are untouched)
          if (S.planes){ const pl = i === 0 && asLateral ? lateralPlanes(prev, d) : prev.planes
            for (const P of pl ?? []){ const ahead = (prev.n.p[0] - P.p[0])*P.u[0] + (prev.n.p[2] - P.p[2])*P.u[1], dot = d[0]*P.u[0] + d[2]*P.u[1]
              if (dot < 0 && ahead + dot*l < (S.planeSlack ?? .1)*L0){ const hm = Math.hypot(d[0], d[2]); let tx = d[0] - dot*P.u[0], tz = d[2] - dot*P.u[1], tm = Math.hypot(tx, tz)
                if (tm < 1e-3){ tx = -P.u[1]; tz = P.u[0]; tm = 1 }                              // head-on: pick a side
                d = norm([tx/tm*hm, d[1], tz/tm*hm]) } } }   // slide along the plane, keeping the shoot's sideways reach - never turned into a vertical pole
          // (in a shape, a bud whose first step would leave it turns toward the open space it sees instead: a thin wall or a ring has room only along itself)
          if (shp && i === 0 && vm && (end0 => end0[1] > y0 && !inside(end0))(add(prev.n.p, d, l))){ const t = norm(add(Vn, [0, 1, 0], .1)); if (inside(add(prev.n.p, t, l))) d = t }
          const end = add(prev.n.p, d, l); const crossing = shp && !shpReached && prev.gen === 0 && !(i === 0 && asLateral); if (shp && prev.gen === 0 && inside(end)) shpReached = true
          if (end[1] < Math.max(root[1], y0 - (S.below ?? .5)*L0) || (end[1] > y0 && !inside(end) && !crossing)){ if (shp && i === 0 && !asLateral) from.noTip = true; break }   // (in a shape, a tip that can't take a single step is dead: it stops claiming the space its side buds need)   // (in a shape, the trunk may cross the gap to reach it - but once there it keeps inside like everything else)   // nothing grows down below the crown's base: no limb hangs to the grass under the outline
          // (noReturn) wood that has left the trunk never heads back in toward it: a shoot that would close on the tree's axis stops there
          // (topFree) twigs in the crown's upper part are free of the no-return and outward rules, so the crown's top closes over its middle
          const gg = prev.gen + (i === 0 && asLateral ? 1 : 0), free = S.topFree && gg >= 2 && prev.n.p[1] > y0 + (ceiling - y0)*S.topFree
          const nr = free ? 0 : byGen(S.noReturn ?? 0, gg); if (nr && gg >= 1){ const [ax, az] = axis(prev.n.p[1]), [bx, bz] = axis(end[1]); if (Math.hypot(end[0] - bx, end[2] - bz) < Math.hypot(prev.n.p[0] - ax, prev.n.p[2] - az) - nr*l) break }
          const gen = prev.gen + (i === 0 && asLateral ? 1 : 0); let node = prev.n
          let first = null; for (let k = 1, steps = Math.max(1, Math.round(l/step)); k <= steps; k++){ node = add0(add(prev.n.p, d, l*k/steps), node, gen + 1); node.yr = year; node.lat = i === 0 && asLateral; first ??= node }
          // (whorl.skip) some years make no ring at all - the leader grows on bare - so tiers come at uneven heights; the rings that do form are whole
          const W = S.whorl && gen <= S.whorl.upTo ? S.whorl : null, atWhorl = W && i === n - 1 && !(W.skip && gen === 0 && r() < W.skip)
          phy += W ? (atWhorl ? r()*tau : 0) : gold
          const startsLimb = i === 0 && asLateral && prev.gen === 0
          const nm = { n: node, dir: d, main: null, lat: null, phy, latDir: latOf(d, phy, gen + 1), gen, k: (i === 0 && asLateral ? 0 : prev.k) + 1, stub: !!W && !atWhorl, limb: startsLimb ? null : prev.limb }
          if (startsLimb){ nm.limb = nm; nm.base = first; nm.got = 0; nm.ring = prev.ring ?? prev; limbs.push(nm) }
          nm.axis = i === 0 && asLateral ? { last: 0 } : prev.axis
          if (S.planes) nm.planes = i === 0 && asLateral ? lateralPlanes(prev, d0) : prev.planes
          if (i === 0 && asLateral) prev.lat = nm; else prev.main = nm
          mets.push(nm); prev = nm
          // a whorl: more side buds at the same node, round the stem. (count, countVar) how many, varying; (jitter) how unevenly spaced, in degrees;
          // (fail) the share of buds that never break; (rival) the share that turn up steeply, a second leader in the making
          if (atWhorl){ const cnt = Math.max(2, Math.min(7, W.count + Math.round((r() - .5)*2*(W.countVar ?? 0)))), jit = (W.jitter ?? 0)*Math.PI/180
            if (W.fail && r() < W.fail) nm.stub = true
            nm.ring = nm
            for (let w = 1; w < cnt; w++){ const wn = add0(add(prev.n.p, d, L0*.03), prev.n, gen + 1), wp = phy + w*tau/cnt + (r() - .5)*2*jit
              const ang = byGen(S.branch, gen + 1)*(W.rival && r() < W.rival ? .35 : 1)
              const wm = { n: wn, dir: d, main: null, lat: null, phy: wp, latDir: latOfAngle(d, wp, ang), gen, k: prev.k, stub: !!(W.fail && r() < W.fail), limb: prev.limb, ring: nm }
              prev.main = wm; mets.push(wm); prev = wm } } } }
      for (let i = 0; i < grown; i++){ const m = mets[i]
        if (!m.main && m.tQ && m.tv >= 1) grow(m, m.dir, m.tV, m.tv, false)
        if (!m.stub && !m.lat && m.lQ && m.lv >= 1) grow(m, m.latDir, m.lV, m.lv, true) }
      if (mets.length === grown){
        // (shape) growth has stalled with parts of the shape still empty - an island, or a thin curve no tip could follow: the nearest fine wood sends one limb
        // across the gap toward it, a little crooked, and growth goes on from there. A few at most, so the bare connecting wood stays an accent
        if (!shp || bridges >= (shp.bridges ?? 10)) break
        const left = []; for (let i = 0; i < marks.length; i++) if (live[i] && guide[i] === 0) left.push(marks[i])
        if (left.length < 40) break
        let best = null, bd = Infinity
        for (let t = 0; t < 160; t++){ const q = left[Math.floor(r()*left.length)]
          for (const m of mets){ if (m.lat || m.gen === 0) continue; const d = Math.hypot(q[0] - m.n.p[0], q[1] - m.n.p[1], q[2] - m.n.p[2]); if (d < bd && d > L0){ bd = d; best = [m, q] } } }
        if (!best) break
        const [m0, q] = best; let prev = m0, first = true, steps = 0
        while (steps++ < 200){ const to = sub(q, prev.n.p), dist = Math.hypot(...to); if (dist < L0*.8) break
          const d = norm(add(norm(to), randDir(r), .15)), node = add0(add(prev.n.p, d, L0), prev.n, prev.gen + (first ? 2 : 1))
          const nm = { n: node, dir: d, main: null, lat: null, phy: r()*tau, latDir: latOf(d, r()*tau, prev.gen + 1), gen: prev.gen + (first ? 1 : 0), k: 0, stub: !inside(node.p), limb: prev.limb }
          if (first) prev.lat = nm; else prev.main = nm; mets.push(nm); prev = nm; first = false
          if (inside(node.p) && steps > 1) break }
        bridges++; continue }
    }
    // (shed) limbs that gathered little in recent years - shaded, overtopped - die and drop, as a mature tree's lower limbs do: the trunk clears and a few strong limbs carry the crown
    if (S.shed && limbs.length > 3){ const got = limbs.map(l => l.got).sort((a, b) => a - b), median = got[Math.floor(got.length/2)], drop = new Set()
      // a ring keeps its spread: a weak limb goes only while its ring still has two others, and only if another kept limb of the ring already covers its side (within 100°)
      const rings = new Map(); for (const l of limbs){ const k = l.ring ?? l; (rings.get(k) ?? rings.set(k, []).get(k)).push(l) }
      const az = l => Math.atan2(l.dir[2], l.dir[0]), gap = (a, b) => { let d = Math.abs(a - b)%(Math.PI*2); return d > Math.PI ? Math.PI*2 - d : d }
      for (const ring of rings.values()){ const keep = new Set(ring)
        for (const l of [...ring].sort((a, b) => a.got - b.got)){ if (!(l.got < S.shed*median) || !l.base) continue
          const others = [...keep].filter(o => o !== l); if (S.whorl && others.length < 2) continue
          if (S.whorl && !others.some(o => gap(az(o), az(l)) < 100*Math.PI/180)) continue
          keep.delete(l); const stack = [l.base]; while (stack.length){ const n = stack.pop(); drop.add(n); stack.push(...n.kids) } } }
      if (drop.size){ for (const n of nodes) if (n.kids.length) n.kids = n.kids.filter(k => !drop.has(k)); for (let i = nodes.length - 1; i >= 0; i--) if (drop.has(nodes[i])) nodes.splice(i, 1) } }
  }
  else spreadOut(c.most)
  // a pocket of open crown too big for a twig draws a real branch from the nearest wood of any size, which then divides by the same rules until the pocket is full
  for (let t = 0, made = 0; t < c.pocketTries && made < c.pockets && space.length; t++){
    // of a handful of spots, the emptiest: the biggest gaps fill first
    let q = null, open = 0
    for (let i = 0; i < c.pocketLook; i++){ const p = space[Math.floor(r()*space.length)]; let here = 0; for (const e of space){ const v = sub(e, p); if (dot(v, v) < (c.pocketSize*scale)**2) here++ } if (here > open){ open = here; q = p } }
    if (open < c.pocketLeast) break
    let from = null, best = (c.pocketReach*scale)**2
    for (const n of nodes){ if (n.kids.length > 2 || n.stage < 0) continue; const d = sub(q, n.p), dd = dot(d, d); if (dd > best || dd < (.8*scale)**2) continue; const line = dot(d, n.d)/Math.sqrt(dd); if (line > .2 && line < .92){ best = dd; from = n } }
    if (!from) continue
    shoots.push({ from, pd: from.d, k: c.pocketGen, turn: r()*tau, aim: norm(sub(q, from.p)), to: Math.sqrt(best) })
    spreadOut(40); made++
  }
  // whatever crown is still unclaimed draws one last twig from the nearest fine wood: gaps are filled where they are, by the same rules
  for (let t = 0, made = 0; t < c.fillTries && made < c.fillMost && space.length; t++){
    const q = space[Math.floor(r()*space.length)]
    let from = null, best = (c.fillReach*scale)**2
    for (const n of nodes){ if (n.stage < c.fillFrom || n.kids.length > 2) continue; const d = sub(q, n.p), dd = dot(d, d); if (dd < best && dd > (.5*scale)**2 && dot(d, n.d) > c.fillLine*Math.sqrt(dd)){ best = dd; from = n } }
    if (!from) continue
    const gap = Math.sqrt(best), d = norm(sub(q, from.p)), out = norm(sub(from.p, [root[0], root[1] + H*c.middle, root[2]]))
    if (dot(d, out) < c.fillOut || d[1] < (from.p[1] > root[1] + H*c.highFrom ? c.highRise : c.droopTip*.5)) continue    // the same rules as any other shoot: outward, on its parent's line, and no sinking
    const mine = girthOf(c.gens.length), skip = girthOf(from.stage)*2 + mine*2 + c.clear*scale
    let blocked = false; for (let u = skip; u <= gap && !blocked; u += step) blocked = hits(add(from.p, d, u), mine, from.p, skip)
    if (blocked) continue
    let n = from; for (let i = 0, steps = Math.max(Math.round(gap/step), 1); i < steps; i++){ n = add0(add(n.p, d, step), n, from.stage + 1); noteWood(n.p, mine) }
    for (let i = space.length - 1; i >= 0; i--){ const v = sub(space[i], n.p); if (dot(v, v) < (c.fillClaim*scale)**2){ space[i] = space[space.length - 1]; space.pop() } }
    made++
  }
  // wood runs only so far past its last fork (c.runMost steps): a shoot whose children found no room would otherwise stand as one long bare stick with leaves at its end
  if (c.runMost){ const dead = new Set()
    for (const n of nodes){ if (n.kids.length || n.leader || n.stage < 0) continue
      const run = [n]; for (let q = n; q.parent && q.parent.kids.length === 1 && !q.parent.leader && q.parent.stage >= 0; q = q.parent) run.push(q.parent)
      for (let i = 0; i < run.length - c.runMost; i++) dead.add(run[i]) }
    for (const n of nodes) if (n.kids.length) n.kids = n.kids.filter(k => !dead.has(k))
    for (let i = nodes.length - 1; i >= 0; i--) if (dead.has(nodes[i])) nodes.splice(i, 1) }
  // (runIn) a branch that runs a long way from its fork without dividing, and carries little at the end of it, is a meandering whip, not a limb: it goes, with what it carries
  if (c.runIn){ const sizeOf = new Map(); for (let i = nodes.length - 1; i >= 0; i--){ const n = nodes[i]; sizeOf.set(n, 1 + n.kids.reduce((t, k) => t + (sizeOf.get(k) ?? 0), 0)) }
    const dead = new Set()
    for (const n of nodes){ const p0 = n.parent; if (!p0 || n.leader || n.stage < 1 || p0.kids.length < 2) continue     // the start of a branch, at a fork
      // a twig too small to keep (runFork nodes) doesn't count as a fork: it will be trimmed away
      const big = q => q.kids.filter(k => sizeOf.get(k) >= (c.runFork ?? 1))
      let run = 1, q = n; for (let b = big(q); b.length === 1 && !q.leader; b = big(q)){ q = b[0]; run++ }
      if (run > c.runIn && sizeOf.get(q) < run*(c.runCarry ?? 2)) dead.add(n) }
    if (dead.size){ const drop = new Set(), stack = [...dead]; while (stack.length){ const n = stack.pop(); drop.add(n); stack.push(...n.kids) }
      for (const n of nodes) if (n.kids.length) n.kids = n.kids.filter(k => !drop.has(k))
      for (let i = nodes.length - 1; i >= 0; i--) if (drop.has(nodes[i])) nodes.splice(i, 1) } }
  // how much tree lies beyond each point, then da Vinci from the twigs back to the trunk
  const a = sp.alpha ?? 2
  const measure = () => { for (let i = nodes.length - 1; i >= 0; i--){ const n = nodes[i]; n.area = n.kids.length ? n.kids.reduce((t, k) => t + k.area, 0) : 1; n.size = 1 + n.kids.reduce((t, k) => t + k.size, 0) } }
  let twig, radiusOf
  // a twig too short for the wood it leaves is a thorn: it goes before girth is set, so nothing is left thickened for wood that isn't there
  for (let pass = 0; pass < 3; pass++){
    measure(); twig = R*BOLE_TOP/nodes[rungs].area**(1/a); radiusOf = n => Math.max(twig*n.area**(1/a), least)
    const dead = new Set()
    for (const n of nodes) if (n.kids.length > 1){ const leads = n.kids.filter(k => k.leader), main = (leads.length ? leads : n.kids).reduce((m, k) => k.area > m.area ? k : m); n.kids = n.kids.filter(k => { const stay = k === main || k.size*step >= Math.max(c.least*step, c.thorn*radiusOf(n)); if (!stay) for (const q = [k]; q.length;){ const x = q.pop(); dead.add(x); q.push(...x.kids) } return stay }) }
    if (!dead.size) break
    for (let i = nodes.length - 1; i >= 0; i--) if (dead.has(nodes[i])) nodes.splice(i, 1)
  }
  measure(); twig = R*BOLE_TOP/nodes[rungs].area**(1/a); radiusOf = n => Math.max(twig*n.area**(1/a), least)
  // lines of nodes become branches: at each fork the wood with the most tree beyond it carries on, the rest are side branches
  const branches = [], tips = [], queue = [{ start: nodes[0], parent: null, atSection: 0, level: 0 }]
  while (queue.length && branches.length < (c.pureFractal || c.selfOrg ? 12000 : 2400)){
    const o = queue.shift(), run = [o.start], sides = []
    if (o.parent) run.unshift(o.parent.line[o.atSection])
    for (let n = o.start; n.kids.length;){ const leads = n.kids.filter(k => k.leader), next = (leads.length ? leads : n.kids).reduce((m, k) => k.area > m.area ? k : m);   // the wood carrying most tree goes on, among stems the biggest stem
    for (const k of n.kids) if (k !== next) sides.push({ k, at: run.length - 1 }); run.push(next); n = next }
    const rec = { level: o.level, parent: o.parent, atSection: o.atSection, kept: true, s: r()*9, sections: run.length - 1, radial: o.level ? [36, 12, 7, 5][Math.min(o.level, 3)] : 36, roots: 5 + Math.floor(r()*3), line: run, len: step*(run.length - 1), carries: true, leader: !o.level }
    // the wood is exactly where it grew: straight shoots, joined at their corners, and each corner rounded by a hand's width and no more
    const pts = run.map(n => n.p.slice())
    if (o.parent) pts[0] = o.parent.trail[o.atSection].p.slice()
    for (let pass = 0, passes = o.level ? 1 + Math.min(Math.floor(radiusOf(run[0])/(.12*scale)), 3) : 8; pass < passes; pass++){ const old = pts.map(q => q.slice()); for (let i = 1; i < pts.length - 1; i++){ const a = sub(old[i], old[i - 1]), e = sub(old[i + 1], old[i]); if (!o.level || dot(norm(a), norm(e)) < .999) for (let k = 0; k < 3; k++) pts[i][k] = .25*old[i - 1][k] + .5*old[i][k] + .25*old[i + 1][k] } }
    const rads = run.map(radiusOf)
    for (let pass = 0; pass < 2; pass++){ const old = rads.slice(); for (let i = 1; i < rads.length - 1; i++) rads[i] = (old[i - 1] + 2*old[i] + old[i + 1])/4 }   // thins smoothly past a joint
    for (let i = Math.max(rads.length - 5, 1); i < rads.length; i++) rads[i] *= lerp(1, .25, (i - rads.length + 5)/4)      // a twig ends in a point, not a sawn stump
    // the bole tapers all the way up to where it divides, and arrives as wide as the stems it feeds side by side, so it has no waist below them and no shoulder at them
    if (!o.level && rungs > 1 && rungs < rads.length - 1){ const fork = run[rungs], top = Math.max(radiusOf(fork.kids.find(k => run.includes(k)) ?? fork), .8*fork.kids.reduce((t, k) => t + radiusOf(k), 0)), base = Math.max(rads[0], top*1.12)
      for (let i = 0; i <= rungs; i++) rads[i] = lerp(base, top, (i/rungs)**.85)
      for (let i = rungs + 1, j = 0; i < rads.length && j < 6; i++, j++) rads[i] = lerp(top, rads[i], (j + 1)/6) }   // and eases into the stem that carries on
    rec.trail = pts.map((p, i) => ({ p, yr: run[i].yr ?? 0, d: [0, 1, 0], n: [1, 0, 0], rad: rads[i]*(o.level ? 1 : 1 + sp.flare*.28*Math.exp(-i/run.length*rec.len/(R*.9)))*(g.slender ?? 1) }))   // a recipe may draw its wood more slender than the growth reckoned it
    if (o.parent) rec.trail[0].rad = Math.min(rec.trail[0].rad, o.parent.trail[o.atSection].rad)
    for (const e of rec.trail){ const d = [0, 1, 0]; e.n = perpTo(e.d = d) }
    retangent(rec); branches.push(rec)
    for (const q of sides) queue.push({ start: q.k, parent: rec, atSection: q.at, level: o.level + 1 })
    tips.push({ p: pts[pts.length - 1], d: rec.trail[rec.sections].d, r: least, branch: rec, section: rec.sections })
  }
  return { branches, tips, tierOf, envelope }
}

function growSkeleton(sp, r, root, scale, tips){
  let trunks = 1
  const H = sp.height*scale, maxLevel = Math.round(sp.levels), env = ENVELOPE[sp.crown] || ENVELOPE.dome, angle = sp.childAngle*Math.PI/180
  // no single branch runs for metres: reach comes from forking, so each order of wood is shorter than the one that carries it
  const limbCap = level => woodCap(sp, scale, level)
  const holdsUp = !sp.droop && !sp.arch && !(sp.hang > 0)
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
        const w = b.target && i < 4 ? clamp((i + 1)/4) : 0, steer = w ? norm([lerp(b.d[0], b.target[0], w*w*(3 - 2*w)), lerp(b.d[1], b.target[1], w*w*(3 - 2*w)), lerp(b.d[2], b.target[2], w*w*(3 - 2*w))]) : d
        const bow = b.level === 0 ? Math.sin(i/sections*5 + sideA)*sp.sinuous*(b.stem ? .08 : .17) : 0      // trunks wander in long slow bends
        // One growth force: wood is pulled up (or, on trees that weep, down) by an amount that grows as it thins, so thick limbs hold their line and twigs turn
        const main = b.leader || b.stem, thin = Math.min(TWIG_REF*sp.trunkRadius*scale/rad, 4), pull = main ? Math.max(sp.upward, .06) : (sp.upward - sp.droop)*thin - (b.level >= 1 ? sp.arch*t*t*3 : 0)
        const nd = norm(add(add(add(steer, side, bow), wander, sp.gnarl*level), [0, 1, 0], pull))
        if (holdsUp && b.level && p[1] + nd[1]*ds < b.p[1]){ nd[1] = Math.max(nd[1], 0); const m = Math.hypot(...nd); nd[0] /= m; nd[1] /= m; nd[2] /= m }   // no branch grows below the joint it left
        if (b.level && !b.leader) outward(nd, p, root, sp.trunkRadius*scale, 1)
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
        const fromAt = n > 1 ? Math.round(sections*.8) : sections, from = trail[fromAt], top = b.r*BOLE_TOP, each = top*stemGirth(n), ring = n > 1 ? each*.2 : 0
        const offset = [out[0]*ring, out[1]*ring, out[2]*ring]              // they start nearly together inside the bole and part as they rise
        queue.push({ p: add(from.p, offset), d: n > 1 ? target : tip.d, n0: from.n, target, out, atSection: fromAt, offset, continues: n === 1, r: each,
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
      else outward(cd, q0, root, sp.trunkRadius*scale, 2)             // a shoot on the trunk side of its limb sets off the other way
      const q = q0                                                   // limbs start on the parent's axis, so their open end is never seen
      const base = a.rad*.76, from = pd
      const lenK = b.level === 0 ? env(t) : 1 - .45*t, lenBase = b.level === 0 ? H*.56 : b.len
      queue.push({ p: q, d: from, target: cd, base, atSection: at, r: Math.max(a.rad*(b.level === 0 ? .62 : .72), .045*scale), len: Math.min(lenBase*sp.lengthRatio*lenK*lerp(.82, 1.15, r()), limbCap(b.level + 1)*lerp(.85, 1, r())), level: b.level + 1, s: r()*9, parent: rec })
    }
    // A round-headed tree has no leader: a sub-trunk dissolves into a fork of near-equal limbs that share its wood, so nothing runs up through the crown as a spear.
    if (b.stem && sp.forkTop){
      rec.forks = true
      for (let i = 0, n = r() < .4 ? 3 : 2, start = r()*7; i < n; i++){
        const out = rotateAbout(perpTo(tip.d), tip.d, start + i/n*Math.PI*2 + (r() - .5)*.6), tilt = sp.forkAngle*Math.PI/180*lerp(.8, 1.2, r()), target = norm(add([tip.d[0]*Math.cos(tilt), tip.d[1]*Math.cos(tilt), tip.d[2]*Math.cos(tilt)], out, Math.sin(tilt)))
        queue.push({ p: tip.p, d: tip.d, n0: tip.n, target, fork: true, r: tip.rad*.7, atSection: sections, len: Math.min(H*(1 - sp.trunkFrac)*.5, limbCap(1)*1.1)*lerp(.85, 1.1, r()), level: 1, s: r()*9, parent: rec })
      }
      continue
    }
    // the terminal continuation: without it a crown looks clipped
    queue.push({ p: tip.p, d: tip.d, n0: tip.n, target: norm(add(tip.d, randDir(r), .18)), r: tip.rad*.97, continues: true, atSection: sections, leader: b.level === 0, len: b.level === 0 ? Math.min(H*(1 - sp.trunkFrac)*.55*sp.leader, limbCap(1)*1.2) : Math.min(b.len*sp.lengthRatio*.8, limbCap(b.level + 1)), level: b.level + 1, s: b.s, parent: rec })
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
    rad = Math.min(rad, rings.length ? rings[rings.length - 1].r : rad)   // wood only ever thins along its length
    rings.push({ p, d, n, b: cross(d, n), r: rad, buried, thick: b.root ? .45 : clamp(rad/(sp.trunkRadius*scale*.5)),
      v: (b.root ? t*b.len : b.v0 + t*(b.v1 - b.v0))*1.3 })
  }
  return smoothRings(rings)
}

// Curves are drawn through the rings, not between them: each span gains a ring on a smooth curve, so limbs bend instead of kinking.
function smoothRings(rings){
  if (rings.length < 3) return rings
  const out = []
  for (let i = 0; i < rings.length - 1; i++){
    const p0 = rings[Math.max(i - 1, 0)].p, a = rings[i], b = rings[i + 1], p3 = rings[Math.min(i + 2, rings.length - 1)].p, t = .5
    out.push(a)
    const q = [0, 1, 2].map(k => .5*(2*a.p[k] + (b.p[k] - p0[k])*t + (2*p0[k] - 5*a.p[k] + 4*b.p[k] - p3[k])*t*t + (3*a.p[k] - p0[k] - 3*b.p[k] + p3[k])*t*t*t))
    const d = norm(add(a.d, b.d)), n = norm(add(a.n, b.n))
    out.push({ p: q, d, n, b: cross(d, n), r: (a.r + b.r)/2, buried: (a.buried + b.buried)/2, thick: (a.thick + b.thick)/2, v: (a.v + b.v)/2 })
  }
  out.push(rings[rings.length - 1])
  return out
}

// Thick wood becomes one skin; only wood too fine to matter stays a simple tapered tube, growing out of that skin at the same size.
function emitWood(sp, r, root, scale, branches, wood, clumps){
  const H = sp.height*scale, axes = [], sway = q => .32*scale*(clamp((q[1] - root[1])/H)**1.6)*(sp.height > 4 ? 1 : .5)
  // bole and sub-trunks count as one piece of wood: overlapping, they mustn't swell
  const groupOf = b => { while (b.continues) b = b.parent; return b }, groups = new Map(), all = new Map(), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (const b of branches) if (b.kept){
    all.set(b, woodRings(sp, scale, b, clumps))
    for (const e of all.get(b)) if (e.r > .08*scale) for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], e.p[a]); hi[a] = Math.max(hi[a], e.p[a]) }
  }
  // Where a stem meets its fork limbs their fields add up and the skin would swell into a knuckle, so each slims near the joint by just what the sum puts back.
  const easeJoint = (rings, fromStart, parts) => {
    const k = 1/(1 + Math.log(parts)/7), at = rings[fromStart ? 0 : rings.length - 1], reach = Math.min(at.r*1.5, rings.length > 1 ? Math.hypot(...sub(rings[0].p, rings[rings.length - 1].p))*.5 : 1e9)     // near the joint only: further down it would thin the stem into a waist
    for (const e of rings){ const u = clamp(Math.hypot(...sub(e.p, at.p))/reach); e.r *= lerp(k, 1, u*u*(3 - 2*u)) }
  }
  for (const [b, rings] of all) if (b.kids?.some(k => k.fork && k.kept)){
    const forks = b.kids.filter(k => k.fork && k.kept)
    easeJoint(rings, false, forks.length + 1)
    for (const k of forks) easeJoint(all.get(k), true, forks.length + 1)
  }
  const cell = Math.min(.085, sp.trunkRadius*scale*.16)          // the mesh is fine enough for the trunk it wraps, or thin stems facet
  const fine = Math.max(.05, skinCell(lo, hi, cell)*1.7)         // wood finer than the skin can hold stays a tube, or it breaks into dashes
  for (const b of branches){
    if (!b.kept) continue
    const rings = all.get(b)
    let solid = 0
    while (solid < rings.length && rings[solid].r >= fine) solid++
    if (solid > 1){ const g = groupOf(b); if (!groups.has(g)) groups.set(g, groups.size); axes.push({ group: groups.get(g), rings: rings.slice(0, solid) }) }
    if (solid >= rings.length) continue
    const first = Math.max(solid - 4, 0), radial = rings[first].r > .1 ? 14 : 8, start = wood.pos.length/3                // the tube begins well inside the skin, a little narrower, and comes out through its end: no join to see
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
  skinWood(axes, wood, sway, root, cell)
}

// Surface roots: buttresses that run out from the trunk and sink into the ground, so a tree grows out of the land rather than sitting on it.
function growRoots(sp, r, root, scale, branches){
  if (sp.height < 4 || !sp.roots) return
  const trunk = branches[0], R = sp.trunkRadius*scale, n = trunk.roots, spin = r()*7
  for (let i = 0; i < n; i++){
    // A root is the trunk's foot: it leaves from inside the base and runs out along the ground, thick to thin, sinking as it goes. It never comes down from above.
    const a = spin + (i + (r() - .5)*.5)/n*Math.PI*2, len = R*sp.roots*lerp(2.4, 4.2, r()), sections = 12, trail = [], bend = (r() - .5)*.9, wide = lerp(.36, .52, r()), rise = lerp(.15, .35, r())
    for (let k = 0; k <= sections; k++){
      const t = k/sections, th = a + bend*t*t, rho = R*.3 + len*t, x = root[0] + Math.cos(th)*rho, z = root[2] + Math.sin(th)*rho, rad = R*lerp(wide, .06, t**.72)
      trail.push({ p: [x, groundHeight(x, z) + rad*rise*(1 - t*t) - R*.34*t*t*t, z], d: [0, 0, 1], n: [0, 1, 0], rad })
    }
    for (let k = 0; k <= sections; k++){ const e = trail[k], q = trail[k + 1] || trail[k - 1], d = norm(k < sections ? sub(q.p, e.p) : sub(e.p, q.p))
      e.d = d; e.n = norm(sub([0, 1, 0], [d[0]*d[1], d[1]*d[1], d[2]*d[1]])) }
    branches.push({ trail, sections, radial: 14, roots: 3, kept: true, root: true, level: 1, s: r()*9, r: R*wide, len, p: trail[0].p, d: trail[0].d })
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
  const H = sp.height*scale, len0 = markSize(sp, scale), least = .05*scale
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
const MOST_TURN = 1.3
function separateWood(sp, branches, clumps){
  const kept = branches.filter(b => b.kept && !b.root), scaleOf = 1
  for (const b of kept){
    b.kids = kept.filter(k => k.parent === b); b.owned = clumps.filter(c => c.anchor?.b === b)
    b.last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    // the joint: where a branch is still leaving its parent, and sharing wood with it is what a joint is
    const pa = b.parent, o = b.trail[0].p, clear = pa ? pa.trail[Math.min(Math.round(b.atSection ?? 0), pa.trail.length - 1)].rad*1.4 + b.trail[0].rad : 0
    b.free = 0
    if (pa) while (b.free < b.last && Math.hypot(...sub(b.trail[b.free].p, o)) < clear) b.free++
  }
  for (const b of kept){ b.memo = new Map(); b.ver = 0 }
  const main = b => !b.level || b.stem || b.leader
  const excused = (a, i, b, k) => {
    if (sp.fused && (main(a) && b.level === 1 && !b.continues || main(b) && a.level === 1 && !a.continues)) return true   // fastigiate limbs lie along the trunk and grow into it
    if (a.stem && !b.level && !b.stem || b.stem && !a.level && !a.stem) return true             // the trunk is a cone between its stems
    if (a.fork && a.parent.stem && a.parent.parent === b) return i <= a.free + 2      // a fork limb leaves a short stem right at the head of the trunk: that's still the joint
    if (b.fork && b.parent.stem && b.parent.parent === a) return k <= b.free + 2
    if (a.parent === b) return i <= a.free
    if (b.parent === a) return k <= b.free
    if (a.parent === b.parent) return (a.fork && b.fork ? i <= a.free + 2 && k <= b.free + 2 : i <= a.free && k <= b.free)                                // siblings leaving together
    if (a.parent && a.parent.parent === b || a.parent && a.parent.continues && a.parent.parent === b) return i <= a.free + 1 && a.atSection < 2
    if (b.parent && b.parent.parent === a || b.parent && b.parent.continues && b.parent.parent === a) return k <= b.free + 1 && b.atSection < 2
    return false
  }
  // branch boxes first: most pairs of branches are nowhere near each other, so most of the tree costs one comparison
  const touching = () => {
    for (const b of kept){
      const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let seg = 0
      for (let i = 0; i <= b.last; i++){ const e = b.trail[i]; if (i){ const f = b.trail[i - 1].p; seg = Math.max(seg, (e.p[0]-f[0])**2 + (e.p[1]-f[1])**2 + (e.p[2]-f[2])**2) } for (let a = 0; a < 3; a++){ lo[a] = Math.min(lo[a], e.p[a] - e.rad); hi[a] = Math.max(hi[a], e.p[a] + e.rad) } }
      b.lo = lo; b.hi = hi; b.seg = Math.sqrt(seg)
    }
    const found = []
    for (let x = 1; x < kept.length; x++) for (let y = 0; y < x; y++){
      const a = kept[x], b = kept[y]
      if (a.lo[0] > b.hi[0] || b.lo[0] > a.hi[0] || a.lo[1] > b.hi[1] || b.lo[1] > a.hi[1] || a.lo[2] > b.hi[2] || b.lo[2] > a.hi[2]) continue
      const mk = a.ver + ':' + b.ver, old = a.memo.get(b)
      if (old && old.key === mk){ if (old.hit) found.push(old.hit); continue }
      let worst = null; const slack = Math.min(1.2, a.seg + b.seg)
      for (let i = 1; i <= a.last; i++) for (let k = 1; k <= b.last; k++){
        const p = a.trail[i], q = b.trail[k], dx = p.p[0] - q.p[0], dy = p.p[1] - q.p[1], dz = p.p[2] - q.p[2], near = a.trail[i - 1].rad + b.trail[k - 1].rad + slack
        if (dx*dx + dy*dy + dz*dz > near*near) continue
        if (excused(a, i, b, k)) continue
        const h = segmentGap(a.trail[i - 1], p, b.trail[k - 1], q)
        if (h.depth > 0 && (!worst || h.depth > worst.depth)) worst = h
      }
      const hit = worst ? { ...worst, a, b } : null
      a.memo.set(b, { key: mk, hit })
      if (hit) found.push(hit)
    }
    return found
  }
  const carried = b => [b, ...b.kids.flatMap(carried)], lastStem = b => b.stem && kept.filter(k => k.stem).length < 2   // a tree always keeps a stem
  // thinner wood gives way to thicker; the trunk never moves
  const giveWay = b => !b.level || b.stem || b.fork ? 0 : 1
  const yields = c => giveWay(c.a) !== giveWay(c.b) ? (giveWay(c.a) ? [c.a, c.b, 1] : [c.b, c.a, -1]) : (c.a.area ?? 0) < (c.b.area ?? 0) ? [c.a, c.b, 1] : [c.b, c.a, -1]
  // wood that touches swings clear about its own joint, carrying all it holds, foliage included
  const droops = sp.droop || sp.arch || sp.hang > 0
  const swing = () => {
    for (let pass = 0; pass < 14; pass++){
      const hits = touching().sort((p, q) => q.depth - p.depth)
      if (!hits.length) break
      const moved = new Set()
      for (const c of hits){
        const [first, , sign] = yields(c)
        let m = first
        while (m.continues && m.parent.level) m = m.parent                // a continuation is the same limb: the whole axis swings, from where it started, so nothing kinks
        if (!m.level && !m.stem || moved.has(m) || (m.turned ?? 0) > (m.stem || m.fork ? .14 : MOST_TURN)) continue   // a stem is a trunk: limbs give way to it, and it barely moves. A limb only moves so far: past that it goes
        const o = m.trail[0].p, arm = sub(c.at, o), up = c.push[1]*sign, push = [c.push[0]*sign, droops || !m.level ? up : Math.abs(up), c.push[2]*sign]   // wood clears other wood by going sideways or up, never down or back at the trunk
        if (m.level && !droops) outward(push, c.at, kept[0].trail[0].p, sp.trunkRadius*.5, 1)
        const axis = cross(arm, push), l = Math.hypot(...axis)
        if (l < 1e-5) continue
        const turn = Math.min(Math.atan2(c.depth*1.25, Math.max(Math.hypot(...arm), .2)), m.stem || m.fork ? .05 : .3)
        const u = [axis[0]/l, axis[1]/l, axis[2]/l]
        for (const b of carried(m)){
          for (const e of b.trail){ e.p = add(o, rotateAbout(sub(e.p, o), u, turn)); e.d = rotateAbout(e.d, u, turn); e.n = rotateAbout(e.n, u, turn) }
          for (const q of b.owned) q.c = add(o, rotateAbout(sub(q.c, o), u, turn))
          moved.add(b); b.ver++
        }
        m.turned = (m.turned ?? 0) + turn
      }
    }
  }
  swing()
  // anything still touching couldn't get clear. A side branch can go without leaving a stump, because the wood it left simply carries on.
  // Its leaves stay if other wood holds them: the last check in generatePlant takes any that nothing reaches.
  for (let round = 0; round < 10; round++){
    const hits = touching(), gone = new Set()
    if (!hits.length) break
    for (const c of hits){
      const side = b => b.level && !b.continues && !b.fork, m = side(c.a) && (!side(c.b) || (c.a.area ?? 0) < (c.b.area ?? 0)) ? c.a : side(c.b) ? c.b : null
      if (m && !gone.has(m.parent)) gone.add(m)
    }
    if (!gone.size) break
    for (const m of gone){
      const all = carried(m)
      m.parent.kids.splice(m.parent.kids.indexOf(m), 1)
      for (const b of all){
        b.kept = false; if (kept.includes(b)) kept.splice(kept.indexOf(b), 1)
      }
    }
  }
  // wood ends at the last thing it carries: bare length past that is trimmed back, and wood carrying nothing goes
  if (clumps.shelves) for (let i = kept.length - 1; i >= 0; i--){
    const b = kept[i], kids = kept.filter(k => k.parent === b), reach = Math.max(-1, ...b.owned.filter(q => clumps.includes(q)).map(q => q.anchor.sec), ...kids.map(k => Math.ceil(k.atSection ?? 0)))
    if (b.level <= sp.keepWood) continue
    if (reach < 0){ if (b.level || (b.stem && !lastStem(b))){ b.kept = false; kept.splice(i, 1) } continue }
    if (kids.some(k => k.continues) || reach + 2 > b.last) continue
    b.cut = b.last = Math.min(reach + 2, b.trail.length - 1)
  }
}
// the closest approach of two tapering lengths of wood: how deep they overlap, where, and which way apart
function segmentGap(p1, q1, p2, q2){
  const d1 = sub(q1.p, p1.p), d2 = sub(q2.p, p2.p), w = sub(p1.p, p2.p), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, w), c = dot(d1, w), b = dot(d1, d2), D = a*e - b*b
  let s = D > 1e-9 ? clamp((b*f - c*e)/D) : 0, t = e > 1e-9 ? (b*s + f)/e : 0
  if (t < 0){ t = 0; s = a > 1e-9 ? clamp(-c/a) : 0 } else if (t > 1){ t = 1; s = a > 1e-9 ? clamp((b - c)/a) : 0 }
  const pa = add(p1.p, d1, s), pb = add(p2.p, d2, t), gap = sub(pa, pb), dist = Math.hypot(...gap), ra = lerp(p1.rad, q1.rad, s), rb = lerp(p2.rad, q2.rad, t), touch = ra + rb + .25*Math.min(ra, rb)   // a little clearance: wood that nearly touches would web together in the skin
  return { depth: touch - dist, ra, rb, at: pa, push: dist > 1e-5 ? [gap[0]/dist, gap[1]/dist, gap[2]/dist] : [0, 1, 0] }
}

// A Ghibli tree shows its trunk and very little else: leaves clothe every limb above the crown line, so a crown is a full body of foliage, not masses on sticks.
// Wherever wood above the line has no leaves over it, a clump grows on that wood, joining the mass of whatever foliage is nearest.
function clotheWood(sp, r, branches, clumps, root, scale){
  if (!sp.cover || !clumps.length) return
  const H = sp.height*scale, line = root[1] + H*sp.crownLine, R = sp.clumpRadius*scale, room = clumps.length*sp.cover*(sp.clotheRoom ?? 1.4) + 24
  const over = (o, p, k) => { const dx = o.c[0] - p[0], dy = (o.c[1] - p[1])/sp.squash, dz = o.c[2] - p[2]; return dx*dx + dy*dy + dz*dz < (o.r*k)**2 }
  let added = 0
  const limbOf = b => { while (b.parent && !(b.level === 1 || b.stem)) b = b.parent; return b }
  const cen = [0, 1, 2].map(a => clumps.reduce((t, q) => t + q.c[a], 0)/clumps.length), bx = [...cen, Math.max(...clumps.map(q => Math.hypot(q.c[0] - cen[0], q.c[2] - cen[2]) + q.r), .1), Math.max(...clumps.map(q => Math.abs(q.c[1] - cen[1]) + q.r*sp.squash), .1)]
  for (let n = branches.length - 1; n >= 0 && added < room; n--){
    const b = branches[n]
    if (!b.kept || b.root || (!b.level && !b.stem)) continue
    if (sp.tipsOnly && !sp.clotheCarriers && branches.some(k => k.kept && k.parent === b)) continue         // leaves live at the ends of the wood, not along what carries them (clotheCarriers: fine wood that carries twigs leafs too, as a cherry's spurs do)
    for (let i = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1), last = i; i >= (sp.tipsOnly ? last*(sp.clotheFrom ?? .5) : 0) && added < room; i--){
      const p = b.trail[i].p
      if (p[1] < line || clumps.some(o => over(o, p, sp.clotheGap ?? .8))) continue   // (clotheGap) how far apart sprays sit along the wood
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
  const K = Math.round(sp.lobes), { centers, asg } = kmeans(clumps.map(c => [c.c[0], c.c[1]*(sp.envW && sp.envW < .9 ? .7 : 1.5), c.c[2]]), Math.round(K*1.6), r), R = sp.clumpRadius*scale
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
    if (sp.lobeStretch) for (const c of g){ const [h, v] = sp.lobeStretch, to = [(c.c[0] - m[0])*(h - 1), (c.c[1] - m[1])*(v - 1), (c.c[2] - m[2])*(h - 1)], far = Math.hypot(...to), k = Math.min(1, c.r*.7/Math.max(far, 1e-3)); c.c = add(c.c, to, k) }   // lobes take the species' own shape, never moving a clump off its wood
    const low = Math.min(...g.map(c => c.c[1] - c.r*sp.squash*.7)), top = Math.max(...g.map(c => c.c[1] + c.r*sp.squash)), rx = Math.max(...g.map(c => Math.hypot(c.c[0] - m[0], c.c[2] - m[2]) + c.r*.6), R*.8)
    const sh = { tips: [], hue, cx: m[0], cz: m[2], bottom: low, rx, h: Math.max(top - low, R*.6), phase: r()*7 }
    for (const c of g){ c.shelf = sh; c.mass = [m[0], low + sh.h*.4, m[2]] }
  }
}

// A real crown is one body with one outline. Each species has an envelope: its spread, and how high it is widest. Wood straying past it is cut back,
// and wherever the shell has no leaves a twig grows out from the nearest wood to carry some, so the outline fills in without anything floating.
function fitCrown(sp, r, branches, clumps, root, scale){
  if (!sp.envW) return
  const H = sp.height*scale, top = root[1] + H, base = root[1] + H*sp.crownLine, peak = sp.envPeak, W = (H*sp.envW/2 - sp.clumpRadius*scale*.6)*lerp(.92, 1.08, r()), a1 = r()*7, a2 = r()*7, salt = r()*50   // the envelope is the outside of the leaves, so wood stops short of it
  const widthAt = u => { const x = (u - peak)/(u < peak ? peak : 1 - peak); return sp.envCone && u > peak ? W*(1 - x)**sp.envCone : u > peak ? W*Math.max(1 - x**sp.envTop, 0)**.8 : W*Math.sqrt(Math.max(1 - x*x*.72, 0)) }   // conifers taper straight up to a point
  const edge = th => 1 + sp.asym*.4*(Math.sin(th + a1)*.6 + Math.sin(2*th + a2)*.4)
  const inside = (q, k) => { const u = (q[1] - base)/(top - base); if (u > 1.04) return false; const x = q[0] - root[0], z = q[2] - root[2]; return Math.hypot(x, z) <= (u < 0 ? W*.4 : widthAt(clamp(u))*edge(Math.atan2(z, x)))*k }
  // the outline wanders in and out in big soft bays, so a crown is never a clean ball
  const bay = q => noise3(q[0]/(H*.2) + salt, q[1]/(H*.2), q[2]/(H*.2))
  // whatever comes later still answers to this outline
  sp.outline = c => { const u = (c.c[1] - base)/(top - base), far = Math.hypot(c.c[0] - root[0], c.c[2] - root[2]) + c.r*.55; if (sp.envCone && u > .7 && u < 1.03 && far < c.r*1.5) return false; return u > .99 || (u > 0 && far > widthAt(clamp(u))*edge(Math.atan2(c.c[2] - root[2], c.c[0] - root[0]))*1.04) }
  // cut back what strays
  for (const b of branches){
    if (!b.kept || b.root || !b.level) continue
    const last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    if (!sp.fastigiate && b.level === 1 && !inside(b.trail[last].p, 1.1)){
      const o = b.trail[0].p, old = b.trail.map(e => e.p); let lo = .3, hi = 1
      for (let t = 0; t < 7; t++){ const m = (lo + hi)/2, q = add(o, sub(old[last], o), m); if (inside(q, 1.05)) lo = m; else hi = m }
      const k = lo; for (let i = 1; i < b.trail.length; i++) b.trail[i].p = add(o, sub(old[i], o), k)
      for (const c of branches) if (c.parent === b && c.kept){ const s = Math.min(Math.round(c.atSection ?? 0), old.length - 1), off = sub(b.trail[s].p, old[s]), g = new Set([c]); for (const d of branches) if (g.has(d.parent)) g.add(d); for (const d of g) for (const e of d.trail) e.p = add(e.p, off, 1) }
      for (const q of clumps){ const a = q.anchor; if (a?.b === b){ const s = Math.min(a.sec, old.length - 1); q.c = add(q.c, sub(b.trail[s].p, old[s]), 1) } }
      continue }
    for (let i = 3; i <= last; i++) if (!inside(b.trail[i].p, 1.1)){ b.cut = i; if (i < 5 && b.trail[i].p[1] < base) b.kept = false; break }
  }
  for (const b of branches){
    if (!b.kept || b.root || !b.parent) continue
    const pa = b.parent, cut = pa.cut ?? pa.trail.length - 1
    if (!pa.kept || (b.atSection ?? 0) > cut) b.kept = false
  }
  for (let i = clumps.length - 1; i >= 0; i--){ const c = clumps[i], at = c.anchor; if (at?.b && (!at.b.kept || at.sec > (at.b.cut ?? at.b.trail.length - 1))) clumps.splice(i, 1) }
  if (!clumps.length){ const b = branches.filter(k => k.kept && !k.root && k.level).sort((p, q) => q.trail[q.trail.length - 1].p[1] - p.trail[p.trail.length - 1].p[1])[0]    // a crown that lost all its leaves in separation starts again from its highest limb
    if (!b) return
    const sec = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1), rr = sp.clumpRadius*scale
    clumps.push({ c: add(b.trail[sec].p, [0, rr*sp.squash*.2, 0]), r: rr, rim: .5, mass: b.trail[sec].p, anchor: { b, sec, p: b.trail[sec].p } }) }
  const c0 = sp.clumpRadius*scale*.9, wood = branches.filter(b => b.kept && !b.root && (b.level || b.stem) && b.trail.length > 1)
  const sprout = (q, rad, deep) => {
    let best = 1e12, from = null, sec = 0
    for (const b of wood){ const n = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1); for (let i = 1; i <= n; i++){ const t = b.trail[i]; if (t.p[1] > q[1] + c0) continue; const d = sub(t.p, q), dd = dot(d, d); if (dd < best){ best = dd; from = b; sec = i } } }
    if (!from || best > (H*.16)**2) return false
    const near = clumps.reduce((m, o) => { const d = sub(o.c, q), dd = dot(d, d); return dd < m.dd ? { dd, o } : m }, { dd: 1e12, o: clumps[0] }).o
    // leaves grow only where wood reaches them
    const st = from.trail[sec]
    if (Math.hypot(...sub(q, st.p)) > rad*1.3) return false
    clumps.push({ c: add(q, [0, c0*.15, 0]), r: rad, deep, shelf: near.shelf, rim: .5, mass: near.mass, anchor: { b: from, sec, p: st.p } })
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
      const th = spin + k/Na*Math.PI*2, e0 = w*edge(th), q0 = [root[0] + Math.cos(th)*e0, y, root[2] + Math.sin(th)*e0], b0 = bay(q0), e = e0*lerp(.72, 1.08, b0), q = [root[0] + Math.cos(th)*e, y + (Math.sin(th*2 + spin) + (r() - .5)*1.6)*c0*.8, root[2] + Math.sin(th)*e]   // never in level rows, or a crown reads as a stack
      if (b0 < .36 && !sp.envCone) continue                                            // a bay: sky comes in here
      if (clumps.some(o => { const d = sub(o.c, q); d[1] /= sp.squash; return dot(d, d) < (o.r*.95 + c0*.35)**2 })) continue
      if (sprout(q, c0*lerp(.85, 1.15, r()))) made++
    }
  }
}

// Nothing wood-like goes under the lawn: reseating and separation can both carry a low limb down, so the last word goes to the ground.
function holdAboveGround(sp, branches, clumps, scale){
  for (const b of branches) if (b.kept && !b.root && (b.level || b.stem)) for (const e of b.trail) e.p = [e.p[0], Math.max(e.p[1], groundHeight(e.p[0], e.p[2]) + e.rad + .04*scale), e.p[2]]
  for (const c of clumps) c.c = [c.c[0], Math.max(c.c[1], groundHeight(c.c[0], c.c[2]) + c.r*sp.squash*.55), c.c[2]]
}

// Girth is one rule, worked out from the tree as it stands: run it again and it gives the same answer, and nothing else ever changes a radius.
// So a change to the wood can't leave a limb thin or a trunk with a waist: the bole tapers, stems carry its wood to where they divide, fork limbs
// share out what the stem carried, and every other limb starts at the species' share of what it leaves. Along an axis wood only ever thins.
const STEM_END = .85
function girth(sp, branches, scale){
  const least = leastWood(sp, scale)
  const kept = branches.filter(b => b.kept && !b.root), trunk = kept[0], R = sp.trunkRadius*scale, H = sp.height*scale
  const lastOf = b => Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1), radAt = (b, sec) => b.trail[Math.min(Math.round(sec ?? 0), b.trail.length - 1)].rad
  const stems = kept.filter(b => b.stem && b.parent === trunk), n = stems.length, each = R*BOLE_TOP*stemGirth(n), joined = kept.filter(b => b.parent && (b.continues || b.fork))
  const nextOf = new Map(), forksOf = new Map()
  for (const b of joined){ if (b.continues && !b.stem) nextOf.set(b.parent, b); if (b.fork) forksOf.set(b.parent, (forksOf.get(b.parent) ?? 0) + 1) }
  trunk.trail.forEach((e, sec) => { const u = sec/(trunk.trail.length - 1)
    // a bole that divides tapers all the way into its stems, so no lip shows where they leave, and its end vanishes inside them
    const bole = n < 2 ? R*lerp(1, BOLE_TOP, u) : u < .8 ? lerp(R, each*1.03, u/.8) : each*1.03*lerp(1, .15, ((u - .8)/.2)**.7)
    e.rad = bole*(1 + sp.flare*.28*Math.exp(-u*trunk.len/(R*.9))) })                                    // root flare, by distance rather than along the branch
  for (const head of kept){
    if (head === trunk || !head.level && !head.stem || head.continues && !head.stem) continue
    const chain = [head]
    while (nextOf.has(chain[chain.length - 1])) chain.push(nextOf.get(chain[chain.length - 1]))
    const rings = chain.flatMap((b, i) => b.trail.slice(i ? 1 : 0, lastOf(b) + 1))
    let L = 0
    for (let i = 1; i < rings.length; i++) L += Math.hypot(...sub(rings[i].p, rings[i - 1].p))
    const pa = head.parent, from = radAt(pa, head.atSection), end = chain[chain.length - 1], forks = forksOf.get(end) ?? 0
    let r0
    if (head.stem) r0 = n < 2 ? from : each
    else if (head.fork) r0 = from*(head.leader ? .78 : subGirth(forksOf.get(pa) ?? 1))    // a leader is the trunk carrying on
    else r0 = from*sp.limbRatio                                         // a side branch starts at the species' share of its parent, right where it leaves
    r0 = Math.max(r0, least)
    const tip = forks ? r0*STEM_END : Math.min(r0, Math.max(r0*.1, least)), pow = head.stem && !forks ? 2 : 1.2                 // sub-trunks hold their girth to where the limbs leave
    let s = 0
    rings.forEach((e, i) => { if (i) s += Math.hypot(...sub(e.p, rings[i - 1].p)); e.rad = lerp(r0, tip, (s/Math.max(L, 1e-3))**pow)
      if (head.fork) e.rad = Math.max(e.rad, lerp(e.rad, from*.92, Math.exp(-((s/(from*1.5))**2)))) })                               // a limb swells where it leaves, so together they fill the stem and the wood widens into the fork
    chain.forEach((b, i) => { if (i) b.trail[0].rad = chain[i - 1].trail[lastOf(chain[i - 1])].rad
      for (let k = lastOf(b) + 1; k < b.trail.length; k++) b.trail[k].rad = tip
      b.area = r0*r0*L })
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
  const H = sp.height*scale, R = sp.clumpRadius*scale, floor = root[1] + sp.height*scale*(sp.rings?.leafFloor ?? sp.trunkFrac*sp.childStart*sp.lift), K = Math.max(1, Math.min(Math.round(sp.shelves), Math.floor(tips.length/3)))
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

// Leaves from light and age (sp.leafLight), in place of per-species foliage rules. Two botanical quantities decide where a tree carries leaves:
//   lifespan   - how many years of shoots hold leaves: a broadleaf keeps them only on its newest growth, a pine keeps three or four years of needles,
//                so only the ends of its branches are green
//   tolerance  - shade tolerance, 0-1: the light a leaf needs to pay its way. Leaves are placed from the top down; each casts a shadow into a widening
//                pyramid below it (Palubicki et al. 2009's shadow propagation) and a leaf in more shade than the species tolerates is shed. A light-demanding
//                tree (oak, pine) ends up hollow, with a lifted base and its limbs in view; a shade-tolerant one keeps a deep full crown
function lightLeaves(sp, r, branches, root, scale){
  const L = sp.leafLight, R = sp.clumpRadius*scale, life = L.lifespan ?? 2, need = lerp(.75, .05, L.tolerance ?? .5)
  // sites: young shoot, spaced about a clump apart
  const sites = []
  for (const b of branches){ if (!b.kept || b.root) continue
    const end = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    const tip = b.trail[end].yr ?? 0                                   // a live shoot flushes every year: its leaves are on the last years of its own growth
    for (let i = 1; i <= end; i++){ const e = b.trail[i]; if (tip - (e.yr ?? 0) >= life) continue; sites.push({ b, sec: i, p: e.p }) } }
  for (let i = sites.length - 1; i > 0; i--){ const j = Math.floor(r()*(i + 1)); [sites[i], sites[j]] = [sites[j], sites[i]] }
  const space = R*(L.spacing ?? .9), grid = pointGrid(space), picked = []
  for (const s of sites){ if (grid.some(s.p, o => Math.hypot(o.p[0] - s.p[0], o.p[1] - s.p[1], o.p[2] - s.p[2]) < space)) continue; grid.add(s.p, s); picked.push(s) }
  // light: from the top down, each kept leaf shades a pyramid below it, falling off with depth (a*b^-q)
  const cell = R*(L.cell ?? .5), qmax = L.depth ?? 6, a = L.a ?? 1, bq = L.b ?? 2, C = L.C ?? 3, sh = new Map(), key = (i, j, k) => i + ',' + j + ',' + k
  picked.sort((p, q) => q.p[1] - p.p[1])
  const clumps = []
  for (const s of picked){
    const I = Math.floor((s.p[0] - root[0])/cell), J = Math.floor((s.p[1] - root[1])/cell), K = Math.floor((s.p[2] - root[2])/cell)
    const light = Math.max(0, 1 - (sh.get(key(I, J, K)) ?? 0)/C)
    if (light < need) continue
    const rad = R*lerp(1 - sp.clumpVar, 1 + sp.clumpVar*.6, r())
    clumps.push({ c: [s.p[0], s.p[1] + rad*sp.squash*.2, s.p[2]], r: rad, rim: .5, light, anchor: { b: s.b, sec: s.sec, p: s.p } })
    for (let q = 1; q <= qmax; q++){ const w = a*bq**-q; for (let k = K - q; k <= K + q; k++) for (let i = I - q; i <= I + q; i++){ const kk = key(i, J - q, k); sh.set(kk, (sh.get(kk) ?? 0) + w) } }
  }
  // the leaves are painted as masses: neighbours grouped, as the other foliage paths do
  if (clumps.length){ const K = clamp(Math.round(clumps.length/5), 1, 16), { centers, asg } = kmeans(clumps.map(c => c.c), K, r); clumps.forEach((c, i) => { c.mass = centers[asg[i]] }) }
  return clumps
}

function makeClumps(sp, r, tips, scale, root){
  if (sp.shelves > 0 && tips.length > 5) return makeShelves(sp, r, tips, scale, root)
  const clumps = [], R = sp.clumpRadius*scale, floor = root[1] + sp.height*scale*(sp.rings?.leafFloor ?? sp.trunkFrac*sp.childStart*sp.lift)
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

// slow value noise, baked per stroke: the shared shapes of light, and small flecks of colour
const LAT = (() => { const q = mulberry32(991), t = new Float32Array(4096); for (let i = 0; i < 4096; i++) t[i] = q(); return t })()
const lat = (x, y, z) => LAT[(x*73 + y*179 + z*283) & 4095]
function noise3(x, y, z){
  const a = Math.floor(x), b = Math.floor(y), c = Math.floor(z), u = x - a, v = y - b, w = z - c, s = u*u*(3 - 2*u), t = v*v*(3 - 2*v), o = w*w*(3 - 2*w)
  return lerp(lerp(lerp(lat(a, b, c), lat(a + 1, b, c), s), lerp(lat(a, b + 1, c), lat(a + 1, b + 1, c), s), t), lerp(lerp(lat(a, b, c + 1), lat(a + 1, b, c + 1), s), lerp(lat(a, b + 1, c + 1), lat(a + 1, b + 1, c + 1), s), t), o)
}
const lightShape = q => (noise3(q[0]*.22, q[1]*.22, q[2]*.22)*.56 + noise3(q[0]*.47 + 9, q[1]*.47, q[2]*.47)*.3 + noise3(q[0]*.97, q[1]*.97 + 5, q[2]*.97)*.14) - .56

function addStroke(out, r, { q, n, t, len, wid, tile, pivot, ao, tone, wind, dab = 0, clump = -1 }){
  const base = out.pos.length/3, seed = r(), shape = lightShape(q), fleck = noise3(q[0]*7.4, q[1]*7.4, q[2]*7.4) - .5
  for (const [cx, cy, u, v] of [[-1, -1, 0, .5], [1, -1, 1, .5], [1, 1, 1, 0], [-1, 1, 0, 0]]){
    out.pos.push(q[0], q[1], q[2]); out.nor.push(n[0], n[1], n[2]); out.stroke.push(t[0], t[1], t[2]); out.center.push(pivot[0], pivot[1], pivot[2]); out.wind.push(wind[0], wind[1], wind[2], wind[3])
    out.corner.push(cx*len/2, cy*wid/2); out.leaf.push(ao, tone, seed); out.dab.push(dab); out.patch.push(shape, fleck, clump)
    const tx = (tile[0] + u)/4, ty = (tile[1] + (cy < 0 ? 1 : 0))/4
    out.uv.push(tx, ty); void v
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

// rows 0-1 of the atlas hold the body brush, rows 2-3 the edge brush; the last tile is the underpainting
const randTile = (r, edge = false) => { const x = Math.floor(r()*4), y = Math.floor(r()*2) + (edge ? 2 : 0); return x === 3 && y === 3 ? [0, 2] : [x, y] }

export function emitFoliage(sp, r, clumps, root, scale, out){
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
    // lobes: the lumps a painter blocks in first. Strokes take their tone and much of their normal from their lobe, so light
    // falls on groups of dabs, and the valleys between lobes stay dark.
    const L = Math.round(clamp(rad/len0*4.5, 4, 12)), lobes = Array.from({ length: L }, () => { const dir = randDir(r); return { dir, tone: clamp(tone + (r() - .5)*.7), gone: shelf && r() < .14 } })   // missing lobes bite the clump's outline
    const n = Math.max(5, Math.round(sp.coverage*4*Math.PI*rad*rad/(len0*wid0)))
    // Big, middle, small. Plates are a few large shapes per lobe that state the mass; they are always drawn. Middle dabs and small
    // accents exist everywhere, but the shader only opens them where the light asks for them (foliage-material.js), so shadow
    // stays plates and detail gathers along the lit edge at any time of day. Strays break the silhouette.
    // A fifth layer sits between plates and dabs: broad middle marks, so paint steps down in sizes the way a painter's brushes do.
    const mids = sp.midSize ? sp.coverage*4*Math.PI*rad*rad/(len0*sp.midSize)**2*1.3 : 0, fewer = sp.midSize ? .75 : 1
    // a clump's own up: straight up, or (lobeFollow) turned to lie along the crown's dome, so sprays on its flanks tilt down with it
    // sprays (lobeAlong): a clump drawn out along the twig it sits on, turned a little outward, so foliage jabs out from the crown in spars instead of sitting in puffs
    const spar = (sp.lobeAlong ?? 1) !== 1 && cl.anchor?.b?.trail ? (() => { const tr = cl.anchor.b.trail, i = Math.min(Math.round(cl.anchor.sec ?? tr.length - 1), tr.length - 1), j = Math.max(i - 1, 0)
      return norm(add(norm(sub(tr[i].p, tr[j].p)), norm(sub(c, [crown[0], crown[1] - half[1]*.3, crown[2]])), .6)) })() : null
    const dome = norm([(c[0] - crown[0])/half[0], (c[1] - (crown[1] - half[1]*.7))/half[1], (c[2] - crown[2])/half[2]]), up = norm(add([0, 1, 0], sub(dome, [0, 1, 0]), sp.lobeFollow ?? 0))
    const out0 = norm([c[0] - root[0] + 1e-3, 0, c[2] - root[2]]), pointed = sp.lobePoint ?? 0, tilt = sp.lobeTilt ?? 0, rough = sp.lobeRough ?? 1
    for (let layer = 0; layer < 5; layer++) for (let i = 0, count = [L*sp.plates*1.1, n*1.1*fewer, n*1.5*fewer, n*sp.strays, mids][layer]; i < count; i++){
      const d = randDir(r)
      let lobe = lobes[0], b = -2
      for (const l of lobes){ const q = dot(d, l.dir); if (q > b){ b = q; lobe = l } }
      if (lobe.gone && layer > (sp.massMarks ? 1 : 0)) continue          // what stays hides the core: facing the viewer a bite is a hole, so on trees it only thins the edge
      const rise = clamp((b - .45)/.5), bump = .8 + .26*rough*rise*rise + (r() - .5)*.06
      // each species shapes its clumps: pointed tufts, hanging wedges, sprays that tilt from the trunk
      const k = rad*(layer === 3 ? bump + lerp(.1, .3, r()) : bump + [-.04, 0, .05, 0, .07][layer]), du = dot(d, up), wide = (1 - pointed*du)*(sp.lobeWide ?? 1), lean = tilt*(d[0]*out0[0] + d[2]*out0[2]) - (sp.lobeDrape ?? 0)*(1 - du*du), flat = add(d, up, -du), q0 = add(add(c, flat, k*wide), up, (du + lean)*k*sp.squash), q = spar ? add(q0, spar, dot(sub(q0, c), spar)*(sp.lobeAlong - 1) + k*(sp.lobeAlong - 1)*.35) : q0   // wide flat sprays whose rims drape over the wood, flattened across their own up
      if (shelf) q[1] = Math.max(q[1], shelf.bottom + shelf.h*(.07*Math.sin(q[0]*.9 + shelf.phase) + .07*Math.sin(q[2]*1.3 + shelf.phase*2)))   // shelves are flat underneath, but drawn by hand
      const onCrown = norm(q.map((v, a) => (v - crown[a])/half[a]))
      const onShelf = shelf ? norm([(q[0] - shelf.cx)/shelf.rx, (q[1] - shelf.bottom - shelf.h*.15)/shelf.h, (q[2] - shelf.cz)/shelf.rx]) : onCrown
      const nS = norm(add(add(add(onShelf, lobe.dir, sp.massMarks ? .4 : .3), d, sp.massMarks ? .45 : .12), onCrown, sp.crownBlend*.8))   // mostly the big form: neighbouring strokes agree, so light lands in shapes, not spots   // a stroke takes its light from its lobe and crown, so lit strokes join up
      if (sp.ride && cl.anchor?.p && du < -.15) continue                  // (ride) a spray sitting on its branch is a cap: nothing hangs below the wood
      // strokes run over the form: down the sides of the clump, turned by the species' stroke angle
      const flow = sub([0, -1, 0], [d[0]*-d[1], d[1]*-d[1], d[2]*-d[1]])
      const t = rotateAbout(norm(dot(flow, flow) > .02 ? flow : randDir(r)), d, turn + (r() - .5)*2*jitter)
      const ao = clamp(.26 + .4*(onShelf[1]*.5 + .5) + .2*Math.hypot(onCrown[0], onCrown[2]) + .16*rise, .1, 1)
      // marks at three clear scales: plates sized by the mass, dabs by the brush, so the big shapes aren't just more of the small ones
      const plate = Math.max(rad*lerp(.58, .95, r()), sp.massMarks && shelf ? Math.min(shelf.rx, rad*2.2)*lerp(.32, .44, r()) : 0)*sp.plateSize, size = [0, sp.massMarks ? lerp(.72, 1.15, r()) : lerp(.8, 1.3, r()), lerp(.38, .66, r()), layer === 4 ? 0 : lerp(.3, .5, r())][layer]
      const sized = layer === 4 ? sp.midSize*lerp(.75, 1.3, r()) : size
      addStroke(out, r, { q, n: nS, t, len: layer ? len0*sized : plate, wid: layer ? wid0*sized : plate*.85, tile: randTile(r, layer === 2 || layer === 3), pivot, ao,
        tone: clamp(lobe.tone + (r() - .5)*.2), wind, dab: [0, 1, 2, .7, .6][layer], clump })
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
function emitStrands(sp, r, tips, clumps, root, scale, out, branches){
  const H = sp.height*scale, len0 = markSize(sp, scale), step = len0*.62, floor = root[1] + H*.1
  const reach = tips.reduce((m, t) => Math.max(m, Math.hypot(t.p[0] - root[0], t.p[2] - root[2])), 1)
  // curtains hang from wood that is really there: each tip moves to the nearest fine wood within reach, or goes
  const fine = branches.filter(b => b.kept && !b.root && b.level >= 2)
  const live = tips.flatMap(t => {
    let best = (1*scale)**2, at = null
    for (const b of fine){ const n = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1); for (let i = 0; i <= n; i++){ const e = b.trail[i], d = sub(e.p, t.p), dd = dot(d, d); if (dd < best){ best = dd; at = e } } }
    return at ? [{ ...t, p: at.p, d: at.d }] : []
  })
  for (const tip of live){
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

// A coarse grid of points, so 'is anything near here' asks only the neighbouring cells rather than everything
function pointGrid(cell){ const m = new Map(), K = (x, y, z) => (x + 512) + 1024*((y + 512) + 1024*(z + 512))
  return { add(p, v){ const k = K(Math.floor(p[0]/cell), Math.floor(p[1]/cell), Math.floor(p[2]/cell)); (m.get(k) ?? m.set(k, []).get(k)).push(v) },
    some(p, f){ const x0 = Math.floor(p[0]/cell), y0 = Math.floor(p[1]/cell), z0 = Math.floor(p[2]/cell)
      for (let x = x0 - 1; x <= x0 + 1; x++) for (let y = y0 - 1; y <= y0 + 1; y++) for (let z = z0 - 1; z <= z0 + 1; z++) for (const v of m.get(K(x, y, z)) ?? []) if (f(v)) return true
      return false } } }

export function generatePlant(species, seed, root, scale, wood, foliage, ivy = newBuffer()){
  const sp = individual(species, seed)
  scale *= species.size                                                // a species' true mature size: everything grows together, so proportions hold
  const r = mulberry32(seed*2654435761 >>> 0)
  let tips = [], branches, clumps
  if (sp.rings?.colonise){
    sp.trunkRadius *= sp.rings.girth ?? 1
    // (shape.fine, 0-1) shape fidelity: the crown is packed to show its form - finer shoots, more of the space claimed, foliage in small tight tufts, nothing thinned out
    const fine = sp.rings.shape?.fine ?? 0
    if (fine > 0){ const k = 1 - .65*fine; sp.clumpRadius *= k; sp.squash = lerp(sp.squash, .9, fine); sp.keepGaps = false; sp.notches = 0; sp.pads = false
      sp.whip = sp.longRun = 0; sp.bareLimbs = 0; sp.lobeAlong = lerp(sp.lobeAlong ?? 1, 1, fine); sp.clumpsPerTip = (sp.clumpsPerTip ?? 1)*(1 + fine) }
    let tierOf
    let envelope
    ;({ branches, tips, tierOf, envelope } = growColonise(sp, r, root, scale)); (generatePlant.envelopes ??= []).push(envelope)
    for (const b of branches) b.kids = branches.filter(k => k.parent === b)
    if (sp.leafLight){ clumps = lightLeaves(sp, r, branches, root, scale); sp.bareLimbs = 0; sp.pads = false } else {
    clumps = makeClumps(sp, r, tips, scale, root)
    sp.tipsOnly = true
    clotheWood(sp, r, branches, clumps, root, scale)
    // every branch ends in leaves: a tip no foliage reached gets its own small spray
    { const cell = Math.max(...clumps.map(c => c.r), sp.clumpRadius*scale, .1)*1.2, grid = pointGrid(cell); for (const c of clumps) grid.add(c.c, c)
      for (const t of tips){ const over = grid.some(t.p, c => { const dx = t.p[0] - c.c[0], dy = (t.p[1] - c.c[1])/sp.squash, dz = t.p[2] - c.c[2]; return dx*dx + dy*dy + dz*dz < (c.r*.8)**2 })
        if (!over){ let near = null, nd = 1e12; grid.some(t.p, o => { const dd = (o.c[0] - t.p[0])**2 + (o.c[1] - t.p[1])**2 + (o.c[2] - t.p[2])**2; if (dd < nd){ nd = dd; near = o } return false })
          near ??= clumps[0] ?? {}; const c = add(t.p, t.d, sp.clumpRadius*scale*.25), cl = { c, r: sp.clumpRadius*scale*.62, shelf: near.shelf, rim: .5, mass: near.mass ?? t.p, anchor: { b: t.branch, sec: t.section, p: t.p } }
          clumps.push(cl); grid.add(c, cl) } } }
    // seen from above the crown has no holes: an open patch takes a spray on the highest fine wood beneath it, so the leaves are always on real wood
    // (keepGaps) an open crown keeps its sky round the edge - but its top is closed from above wherever it's seen through to the middle
    { const reach = Math.max(...clumps.map(c => Math.hypot(c.c[0] - root[0], c.c[2] - root[2]) + c.r)), cell = 1.5*scale, rad = sp.clumpRadius*scale*.8, g = sp.rings.colonise
      for (let x = -reach; x <= reach; x += cell) for (let z = -reach; z <= reach; z += cell){
        const px = root[0] + x, pz = root[2] + z
        if (Math.hypot(x, z) > reach*(sp.keepGaps ? .5 : .8) || clumps.some(c => Math.hypot(px - c.c[0], pz - c.c[2]) < c.r*.75)) continue
        let best = null, top = -1e9
        for (const b of branches) if (b.level) for (let i = 1; i < b.trail.length; i++){ const e = b.trail[i]; if (e.rad < g.holeWood*scale && e.p[1] > top && Math.hypot(e.p[0] - px, e.p[2] - pz) < g.holeReach*scale){ top = e.p[1]; best = { b, sec: i, p: e.p } } }
        if (!best) continue
        const near = clumps.reduce((m, o) => { const d = sub(o.c, best.p), dd = dot(d, d); return dd < m.dd ? { dd, o } : m }, { dd: 1e12, o: clumps[0] }).o
        clumps.push({ c: add(best.p, [0, rad*sp.squash*.2, 0]), r: rad, shelf: near.shelf, rim: .5, mass: near.mass, anchor: best })
      } }
    // layered species (a Japanese maple) carry their leaves in flat tiers, with dark gaps between where the wood shows: tier heights wander round the crown, so the layers aren't rings
    // an open edge (rings.rim): in the crown's outer band only well-spaced sprays stay, so they stand apart against the sky instead of closing into one cloud
    const rim = sp.rings.rim
    if (rim){ const lo = [0, 1, 2].map(a => Math.min(...clumps.map(c => c.c[a] - c.r))), hi = [0, 1, 2].map(a => Math.max(...clumps.map(c => c.c[a] + c.r)))
      const mid = lo.map((v, a) => (v + hi[a])/2), half = lo.map((v, a) => Math.max((hi[a] - v)/2, .1)); mid[1] -= half[1]*.25
      const out = c => Math.hypot((c.c[0] - mid[0])/half[0], (c.c[1] - mid[1])/(half[1]*1.25), (c.c[2] - mid[2])/half[2])
      const edge = clumps.filter(c => out(c) > rim.from).sort((p, q) => out(q) - out(p)), kept = []
      for (const c of edge){ if (kept.some(k => Math.hypot(k.c[0] - c.c[0], (k.c[1] - c.c[1])/Math.max(sp.squash, .5), k.c[2] - c.c[2]) < (k.r + c.r)*rim.spacing*.5)) c.gone = true; else kept.push(c) }
      for (let i = clumps.length - 1; i >= 0; i--) if (clumps[i].gone) clumps.splice(i, 1) }
    if (tierOf) for (let i = clumps.length - 1; i >= 0 && clumps.length > 6; i--){ const c = clumps[i], t = tierOf(c.c)
      if (t.gap && sp.rings.tiers.clear) clumps.splice(i, 1); else c.c = [c.c[0], lerp(c.c[1], t.mid, sp.rings.tiers.flat), c.c[2]] }   // leaves settle into their tier: flat plates
    // (ride) blossom sits on the top of its branch, as a cherry's does: each spray is lifted so its underside rests on the wood it grows from, and the branch reads as a dark line beneath it
    if (sp.ride) for (const c of clumps) if (c.anchor?.p) c.c = [c.c[0], Math.max(c.c[1], c.anchor.p[1] + c.r*sp.squash*sp.ride), c.c[2]]
    }
  } else {
  branches = growSkeleton(sp, r, root, scale, tips)
  shapeCrown(sp, r, root, scale, branches, tips)
  reseat(branches, tips)
  clumps = makeClumps(sp, r, tips, scale, root)
  prune(sp, tips, clumps, branches, root, scale)
  // girth follows the wood wherever it goes: worked out again whenever the wood has changed, always by the same rule
  dropStubs(sp, branches)
  girth(sp, branches, scale)
  separateWood(sp, branches, clumps)
  fitCrown(sp, r, branches, clumps, root, scale)
  holdAboveGround(sp, branches, clumps, scale)
  clotheWood(sp, r, branches, clumps, root, scale)
  if (sp.outline){
    for (let i = clumps.length - 1; i >= 0 && clumps.length > 6; i--) if (sp.outline(clumps[i])) clumps.splice(i, 1)
    //                            // pines are meant to be separate pads
    if (sp.envCone) for (const b of branches) if (b.kept && (b.leader || (b.stem && !branches.some(k => k.kept && k.leader)))){   // a conifer's leader carries leaves to its tip, in smaller and smaller sprays
      const n = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1), tip = b.trail[n].p[1], R0 = sp.clumpRadius*scale, span = sp.height*scale*.16
      for (let i = n; i > 0; i--){ const e = b.trail[i], u = (tip - e.p[1])/span; if (u > 1) break
        const rad = R0*lerp(.28, .85, clamp(u)), hit = clumps.some(o => { const d = sub(e.p, o.c); d[1] /= sp.squash; return dot(d, d) < (o.r*.8)**2 })
        if (hit) continue
        const near = clumps.reduce((m, o) => { const d = sub(o.c, e.p), dd = dot(d, d); return dd < m.dd ? { dd, o } : m }, { dd: 1e12, o: clumps[0] }).o
        clumps.push({ c: e.p, r: rad, rim: .5, shelf: near.shelf, mass: near.mass, anchor: { b, sec: i, p: e.p } }) } }
  }
  if (sp.cover) for (let i = clumps.length - 1, floor = root[1] + sp.height*scale*sp.crownLine*.8; i >= 0 && clumps.length > 6; i--) if (clumps[i].c[1] < floor) clumps.splice(i, 1)   // the trunk stays in view: leaves never hang down over it
  // and wood that only reached down there goes with its leaves, from the tips back
  if (sp.cover) for (let n = branches.length - 1, floor = root[1] + sp.height*scale*sp.crownLine*1.1; n >= 0; n--){
    const b = branches[n]
    if (!b.kept || b.root || !b.level || b.continues) continue
    const last = Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)
    if (b.trail[last].p[1] < floor && !branches.some(k => k.kept && k.parent === b) && !clumps.some(c => c.anchor?.b === b)) b.kept = false
  }
  girth(sp, branches, scale)
  separateWood(sp, branches, clumps)
  trimTips(sp, branches, clumps)
  girth(sp, branches, scale)                                           // the wood has changed for the last time: the rule has the last word on size
  }
  // no bare wood at grass height out past the bole: on a shrub that reads as sticks in the lawn
  if (sp.height < 4) for (let n = branches.length - 1; n >= 0; n--){ const b = branches[n]; if (!b.kept || b.root || !b.level || branches.some(k => k.kept && k.parent === b)) continue
    const e = b.trail[Math.min(b.cut ?? b.trail.length - 1, b.trail.length - 1)]; if (e.p[1] - root[1] < .4*scale && !clumps.some(c => c.anchor?.b === b)) b.kept = false }
  // (whip) on the finished wood: a thin branch that runs this far (metres) from where it leaves its parent before its first fork is a meandering whip, not a limb - it goes, with all it carries and its leaves
  if (sp.whip){ const R0 = Math.max(...branches.filter(b => !b.root && !b.level).map(b => b.trail[1]?.rad ?? 0), 1e-3), drop = new Set()
    for (const b of branches){ if (!b.kept || b.root || !b.level || b.leader || b.stem || b.trail[1]?.rad > R0*(sp.whipRad ?? .15)) continue
      const last = Math.min(b.cut ?? 1e9, b.trail.length - 1), first = Math.min(last, ...branches.filter(k => k.kept && k.parent === b).map(k => Math.ceil(k.atSection)))
      let L = 0; for (let i = 1; i <= first; i++) L += Math.hypot(...sub(b.trail[i].p, b.trail[i - 1].p))
      if (L > sp.whip) drop.add(b) }
    if (drop.size){ let grew = true; while (grew){ grew = false; for (const b of branches) if (b.kept && !drop.has(b) && drop.has(b.parent)){ drop.add(b); grew = true } }
      for (const b of drop) b.kept = false
      for (let i = clumps.length - 1; i >= 0; i--) if (drop.has(clumps[i].anchor?.b)) clumps.splice(i, 1) } }
  // (longRun) a stretch of wood longer than this (metres) between real forks - side branches carrying more than a metre of wood - is cut off where it begins, with all it carries and its leaves
  if (sp.longRun){ const lenOf = (b, from, to) => { let L = 0; for (let i = from + 1; i <= to; i++) L += Math.hypot(...sub(b.trail[i].p, b.trail[i - 1].p)); return L }
    const lastOf = b => Math.min(b.cut ?? 1e9, b.trail.length - 1), kidsOf = new Map(); for (const b of branches) if (b.kept && b.parent) (kidsOf.get(b.parent) ?? kidsOf.set(b.parent, []).get(b.parent)).push(b)
    const reach = new Map(), subLen = b => { if (reach.has(b)) return reach.get(b); const v = lenOf(b, 0, lastOf(b)) + (kidsOf.get(b) ?? []).reduce((t, k) => t + (k.kept ? subLen(k) : 0), 0); reach.set(b, v); return v }
    const drop = new Set(), cutAt = new Map()
    for (const b of branches){ if (!b.kept || b.root || !b.level || b.leader || b.stem) continue
      const last = lastOf(b), forks = (kidsOf.get(b) ?? []).filter(k => subLen(k) > 1).map(k => Math.ceil(k.atSection)).filter(s => s <= last), marks = [0, ...forks, last].sort((x, y) => x - y)
      for (let j = 1; j < marks.length; j++) if (lenOf(b, marks[j - 1], marks[j]) > sp.longRun){ if (marks[j - 1] < 2) drop.add(b); else cutAt.set(b, marks[j - 1]); break } }
    for (const [b, at] of cutAt){ b.cut = at; for (const k of kidsOf.get(b) ?? []) if (k.atSection > at) drop.add(k) }
    let grew = true; while (grew){ grew = false; for (const b of branches) if (b.kept && !drop.has(b) && drop.has(b.parent)){ drop.add(b); grew = true } }
    for (const b of drop) b.kept = false
    for (let i = clumps.length - 1; i >= 0; i--){ const a = clumps[i].anchor; if (a?.b && (drop.has(a.b) || (cutAt.has(a.b) && (a.sec ?? 0) > cutAt.get(a.b)))) clumps.splice(i, 1) } }
  // (bareLimbs) big wood stays bare: no spray sits on or against a limb thicker than this share of the trunk; the twigs it was on are trimmed back after. Measured on the finished wood
  if (sp.bareLimbs){ const R0 = Math.max(...branches.filter(b => !b.root && !b.level).map(b => b.trail[1]?.rad ?? 0), 1e-3), big = pointGrid(sp.clumpRadius*scale*3)
    for (const b of branches) if (!b.root) b.trail.forEach(e => { if (e.rad > R0*sp.bareLimbs) big.add(e.p, e) })
    const ys = clumps.map(c => c.c[1]), upper = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys))*.45   // high in the crown big wood is under leaves anyway: stripping them there opens the crown's top
    for (let i = clumps.length - 1; i >= 0; i--){ const c = clumps[i], k = c.r*(sp.lobeAlong ?? 1)*.6
      if (c.c[1] < upper && big.some(c.c, e => Math.hypot(e.p[0] - c.c[0], (e.p[1] - c.c[1])/sp.squash, e.p[2] - c.c[2]) < k + e.rad)) clumps.splice(i, 1) } }
  // the crown's top is closed: seen from above, a hole in its middle takes a spray on the highest fine wood beneath it. Last, so no clean-up takes it away again
  if (sp.rings?.colonise && !sp.leafLight && clumps.length > 6){ const R0 = Math.max(...branches.filter(b => !b.root && !b.level).map(b => b.trail[1]?.rad ?? 0), 1e-3), fineMost = R0*Math.max(sp.bareLimbs || .15, .08)
    const cx = clumps.reduce((t, c) => t + c.c[0], 0)/clumps.length, cz = clumps.reduce((t, c) => t + c.c[2], 0)/clumps.length
    const reach = Math.max(...clumps.map(c => Math.hypot(c.c[0] - cx, c.c[2] - cz))), rad = sp.clumpRadius*scale*.85, cell = rad*1.2, within = reach*(sp.closeTop ?? .55)
    // fine wood anywhere; in the crown's upper half any wood at all, as a stem's top there is under leaves in any real tree
    const ys = clumps.map(c => c.c[1]), high = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys))*.5
    const wood = []; for (const b of branches) if (b.kept && !b.root && b.level) b.trail.forEach((e, i) => { if (i <= (b.cut ?? 1e9) && (e.rad < fineMost || e.p[1] > high)) wood.push({ b, sec: i, p: e.p }) })
    const tops = pointGrid(cell*2); for (const c of clumps) tops.add(c.c, c)
    for (let x = -within; x <= within; x += cell) for (let z = -within; z <= within; z += cell){ if (Math.hypot(x, z) > within) continue
      const px = cx + x, pz = cz + z
      if (clumps.some(c => Math.hypot(px - c.c[0], pz - c.c[2]) < c.r*.8)) continue
      let best = null; for (const w of wood) if (Math.hypot(w.p[0] - px, w.p[2] - pz) < cell && (!best || w.p[1] > best.p[1])) best = w
      if (!best) continue
      const near = clumps.reduce((m, o) => { const d = sub(o.c, best.p), dd = dot(d, d); return dd < m.dd ? { dd, o } : m }, { dd: 1e12, o: clumps[0] }).o
      clumps.push({ c: add(best.p, [0, rad*sp.squash*.3, 0]), r: rad, shelf: near.shelf, rim: .5, mass: near.mass, anchor: best }) } }
  // (pads) cloud-pruned foliage: each branch at padLevel gathers its leaves into one flat-bottomed dome at its outer end, as a niwaki pine's needles sit in pads with sky between
  if (sp.pads && clumps.length){ const lvl = sp.padLevel ?? 2, groups = new Map()
    const keyOf = b => { while (b && b.level > lvl && b.parent) b = b.parent; return b }
    for (const c of clumps){ const k = keyOf(c.anchor?.b) ?? c; (groups.get(k) ?? groups.set(k, []).get(k)).push(c) }
    const R0 = sp.clumpRadius*scale, out = []
    for (const g of groups.values()){
      // the pad sits over the group's outer part: the clumps furthest from the trunk weigh most
      const w = g.map(c => 1 + Math.hypot(c.c[0] - root[0], c.c[2] - root[2])), W = w.reduce((t, v) => t + v, 0)
      const cx = g.reduce((t, c, i) => t + c.c[0]*w[i], 0)/W, cz = g.reduce((t, c, i) => t + c.c[2]*w[i], 0)/W, cy = g.reduce((t, c, i) => t + c.c[1]*w[i], 0)/W
      const spread = Math.max(...g.map(c => Math.hypot(c.c[0] - cx, c.c[2] - cz) + c.r)), R = clamp(spread*.75, R0*1.1, R0*(sp.padMost ?? 3.5)), sq = sp.squash
      const base = { shelf: g[0].shelf, rim: .5, anchor: g[0].anchor, mass: [cx, cy, cz] }
      // a cloud, not a slab: a flat-bottomed ring of separate puffs round the edge, a few smaller ones heaped higher toward the middle, with gaps between
      const n = Math.max(5, Math.round(R/R0*3.2)), puff = sp.padPuff ?? .3
      for (let i = 0; i < n; i++){ const a = i/n*Math.PI*2 + (r() - .5)*.6, d = R*lerp(.55, .8, r())
        out.push({ ...base, c: [cx + Math.cos(a)*d, cy + R*sq*lerp(0, .12, r()), cz + Math.sin(a)*d], r: R*puff*lerp(.85, 1.15, r()) }) }
      const m = Math.max(2, Math.round(n*.45))
      for (let i = 0; i < m; i++){ const a = r()*Math.PI*2, d = R*lerp(0, .35, r())
        out.push({ ...base, c: [cx + Math.cos(a)*d, cy + R*sq*lerp(.25, .5, r()), cz + Math.sin(a)*d], r: R*puff*lerp(.8, 1.05, r()) }) } }
    clumps.length = 0; clumps.push(...out) }
  splitLobes(sp, r, clumps, scale)
  growRoots(sp, r, root, scale, branches)
  // the last word: leaves with no wood under them go
  { const cell = Math.max(...clumps.map(c => c.r*1.15), .1), wood = pointGrid(cell)
    for (const b of branches) if (b.kept && !b.root) b.trail.forEach((e, k) => { if (k <= (b.cut ?? 1e9)) wood.add(e.p, e.p) })
    for (let i = clumps.length - 1; i >= 0 && clumps.length > 6; i--){
      const c = clumps[i], reach = (c.r*1.15)**2
      if (!sp.hang && !wood.some(c.c, p => { const dx = p[0] - c.c[0], dy = p[1] - c.c[1], dz = p[2] - c.c[2]; return dx*dx + dy*dy + dz*dz < reach })) clumps.splice(i, 1)
    } }
  // wood the leaves don't reach goes, from the tips back: a bare branch, or the bare end of one, poking out of the crown or left in a gap reads as a stick. Wood that carries leafy branches stays
  if (sp.rings?.colonise){ const near = (p, c) => { const dx = p[0] - c.c[0], dy = (p[1] - c.c[1])/sp.squash, dz = p[2] - c.c[2]; return dx*dx + dy*dy + dz*dz < (c.r*1.1)**2 }
    const leafGrid = pointGrid(Math.max(...clumps.map(c => c.r*1.1), .1)); for (const c of clumps) leafGrid.add(c.c, c)
    for (let n = branches.length - 1; n >= 0; n--){ const b = branches[n]
      if (!b.kept || b.root) continue
      let leafy = -1; for (let i = b.trail.length - 1; i >= 1 && leafy < 0; i--) if (leafGrid.some(b.trail[i].p, c => near(b.trail[i].p, c))) leafy = i   // its first point is the joint it shares with its parent: the parent's leaves there aren't its own
      // the trunk, a stem or a leader is never removed, but its bare top is cut back to its last leaves too: no bare spike stands above the crown
      if (!b.level || b.stem || b.leader){ const held = Math.max(-1, ...b.kids.filter(k => k.kept).map(k => Math.ceil(k.atSection)))
        // a leader must end well inside its leaves, not at their rim: its tip is the crown's top, where a stub shows most
        const deep = (p, c) => { const dx = p[0] - c.c[0], dy = (p[1] - c.c[1])/sp.squash, dz = p[2] - c.c[2]; return dx*dx + dy*dy + dz*dz < (c.r*.55)**2 }
        let inner = -1; for (let i = b.trail.length - 1; i >= 1 && inner < 0; i--) if (leafGrid.some(b.trail[i].p, c => deep(b.trail[i].p, c))) inner = i
        const end = Math.max(inner, held); if (end > 0 && end < Math.min(b.cut ?? 1e9, b.trail.length - 1)) b.cut = end
        else if (end < 0 && b.level) b.kept = false                                   // a piece of leader above the last leaves, carrying nothing: the bare top goes
        continue }
      const held = Math.max(-1, ...b.kids.filter(k => k.kept).map(k => Math.ceil(k.atSection)))
      const end = Math.max(leafy, held)                             // and a bare end past the last leaves is cut back to them, so the tip ends inside the leaves
      if (held < 0 && (leafy < 0 || end < 4 && end < b.trail.length - 1)){ b.kept = false; continue }   // bare, or cut back it would be a stub: it goes
      if (end < Math.min(b.cut ?? 1e9, b.trail.length - 1)) b.cut = end
      // what it carries all told, after trimming, against the wood it grows from: a little sprig on a thick stem is a thorn, and it goes with all it holds
      const last = Math.min(b.cut ?? 1e9, b.trail.length - 1); let run = 0; for (let i = 1; i <= last; i++) run += Math.hypot(...sub(b.trail[i].p, b.trail[i - 1].p))
      b.wood = run + b.kids.reduce((t, k) => t + (k.kept ? k.wood ?? 0 : 0), 0)
      const host = b.parent?.trail[Math.min(Math.round(b.atSection ?? 0), b.parent.trail.length - 1)]?.rad ?? 0
      if (b.wood < (sp.rings.colonise.thorn ?? 1)*host){ const drop = x => { x.kept = false; for (const k of x.kids) drop(k) }; drop(b) } }
    // and leaves the trimming left without wood go too. A trunk or stem doesn't hold leaves: they sit on branch wood
    const thick = sp.trunkRadius*scale*.5
    const twigs = pointGrid(Math.max(...clumps.map(c => c.r*1.15), .1))
    for (const b of branches) if (b.kept && !b.root && b.level) b.trail.forEach((e, k) => { if (k >= 1 && k <= (b.cut ?? 1e9) && e.rad < thick) twigs.add(e.p, e.p) })
    for (let i = clumps.length - 1; i >= 0 && clumps.length > 6; i--){ const c = clumps[i], reach = (c.r*1.15)**2, sq = Math.max(sp.squash, .5)
      if (!sp.hang && !twigs.some(c.c, p => { const dx = p[0] - c.c[0], dy = (p[1] - c.c[1])/sq, dz = p[2] - c.c[2]; return dx*dx + dy*dy + dz*dz < reach })) clumps.splice(i, 1) } }   // measured on the clump as drawn: a flattened spray needs its wood inside it, not a body's height above
  measureBark(branches)
  emitWood(sp, r, root, scale, branches, wood, clumps)
  const form = emitFoliage(sp, r, clumps, root, scale, foliage)
  emitEntries(sp, r, root, scale, branches, wood, foliage, clumps, form)
  if (IVY) emitIvy(sp, r, root, scale, branches, ivy)
  if (sp.hang > 0) emitStrands(sp, r, tips, clumps, root, scale, foliage, branches)
  generatePlant.debug = { branches, clumps }
  return clumps.length
}

// The land: a gentle roll near the plant, rising into hills with real crests and gullies further out, so the light has form to fall on
// (a Ghibli hillside is lit by its folds: sun-facing slopes and crests pale, hollows deep). Ridged noise makes the crests sharp and the
// valleys round, the way weathered hills are.
const ridge = (x, z) => { const n = noise3(x, 4.7, z)*2 - 1; return 1 - Math.sqrt(n*n + .015) }   // a rounded crest: abs() made a knife edge no mesh could shade smoothly
export const groundNormal = (x, z, e = .5) => norm([groundHeight(x - e, z) - groundHeight(x + e, z), 2*e, groundHeight(x, z - e) - groundHeight(x, z + e)])
export const groundHeight = (x, z) => {
  const r = Math.hypot(x, z), fade = clamp((r - 8)/30), hill = clamp((r - 38)/90)
  const roll = 2.2*Math.sin(x*.045 + 1)*Math.cos(z*.04) + .9*Math.sin(x*.11 - z*.08 + 2)
  const hills = 16*ridge(x*.009 + 3.1, z*.009)**2 + 6*ridge(x*.024 + 7.3, z*.024 + 1.9)**1.5 + 2*noise3(x*.06, 9.1, z*.06) - 9
  return fade*fade*roll + hill*hill*(3 - 2*hill)*hills
}

// polar grid: dense under the plants, sparse out to the horizon
export function generateGround(radius){
  // rings scale with the radius so the spacing near the centre stays what it was at 620 m (rings are spaced as (i/n)^1.9)
  const rings = Math.round(260*(radius/620)**(1/1.9)), sectors = 480, o = { pos: [], nor: [], idx: [], uv: [] }
  for (let i = 0; i <= rings; i++) for (let k = 0; k <= sectors; k++){
    const rr = radius*(i/rings)**1.9, a = k/sectors*Math.PI*2, x = rr*Math.cos(a), z = rr*Math.sin(a), e = .5
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
// Each tuft is one stroke anchored at its root, so it takes its light and shadow where it meets the ground, as the field around it does.
// The wind's direction across the land, and where the grass grows thick: every tuft answers to these two fields, wherever it is grown
const grassFlow = (x, z) => 1.1 + Math.sin(x*.03 + z*.02)*.7 + Math.sin(z*.07 - 1)*.3
// clumps of 2-6 m inside slower patches, so the sward has pockets and gaps a painter can mass, not an even pile
const grassLong = (x, z) => clamp((noise3(x*.18, 3.1, z*.18)*.6 + noise3(x*.5 + 7, 1.7, z*.5)*.4 - .32)*2.2)

// one tuft at (x, z): a length hierarchy (short turf, a few tall tufts, the odd wisp, and other plants), a loose direction, and a mirror
function grassTuft(o, r, x, z, near = false){
  const g = grassLong(x, z)
  if (r() > (near ? .75 : .45) + (near ? .25 : .55)*g) return                                       // clumped, but lit grass reads continuous: no bare patches
  const plant = r() < .05, free = r() < .08, a = free ? r()*Math.PI*2 : grassFlow(x, z) + (r() - .5)*.7   // combed: nearly all sweep with the field's flow
  const wisp = !plant && r() < .07, tall = r() < .08, y = groundHeight(x, z)
  const lean = plant ? lerp(.05, .3, r()) : lerp(.3, 1.1, r()**1.1), turf = lerp(.28, .62, r()**1.2)*(tall ? lerp(1.3, 1.6, r()) : 1)*(plant ? lerp(1.3, 1.6, r()) : 1)   // against a 1.7 m person: turf knee-low
  const len = (wisp ? lerp(.45, .8, r()) : turf)*lerp(.85, 1.15, g), wid = wisp ? len*.28 : len*lerp(1, 1.4, r())   // short turf is a wide, low tuft
  const t = norm([Math.cos(a)*lean, 1, Math.sin(a)*lean])
  addStroke(o, r, { q: [x, y - .06, z], n: groundNormal(x, z), t, len, wid: wid*(plant ? 1.15 : 1)*(r() < .5 ? -1 : 1), tile: [Math.floor(r()*4), plant ? 3 : Math.floor(r()*3)], pivot: [x, y, z], ao: wisp ? 2 : 1, tone: clamp(g + (r() - .5)*.5), wind: [x, z, 0, 0] })
}

// Each square of land has its own random stream for each thing that grows on it, so a square always grows the same grass, flowers and stones.
const cellRandom = (i, j, seed, salt) => mulberry32((Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(seed + salt, 83492791)) >>> 0)

// Rocks of one square: now and then a low boulder, most of them with one or two smaller stones in company, clear of the trunks.
// perHa is boulders and stones per hectare on average.
export function rocksOfCell(i, j, size, perHa, seed, trees = []){
  const r = cellRandom(i, j, seed, 919), out = []
  if (r() > perHa*size*size/10000/2) return out                         // a group holds two stones on average
  const lead = { x: (i + r())*size, z: (j + r())*size, s: lerp(.25, .9, r()**1.5) }
  for (let k = 0, n = 1 + Math.floor(r()*3); k < n; k++){
    const a = r()*Math.PI*2, d = k ? lead.s*lerp(1.4, 3, r()) : 0, s = k ? lead.s*lerp(.35, .8, r()) : lead.s, x = lead.x + Math.cos(a)*d, z = lead.z + Math.sin(a)*d
    const turn = r()*Math.PI*2, flat = lerp(.6, .95, r()), sd = Math.floor(r()*1e6)
    if (trees.some(q => !q.clear && Math.hypot(q.x - x, q.z - z) < q.r*2 + s) || out.some(q => Math.hypot(q.x - x, q.z - z) < (q.s + s)*.9)) continue
    out.push({ x, z, y: groundHeight(x, z), s, turn, flat, seed: sd })
  }
  return out
}

// The grass of one square of land, size x size metres from (i*size, j*size). The same square always grows the same tufts, so squares can be
// grown and dropped as the camera moves without anything popping. A thinner square (density lower) grows the first of the same tufts.
// Grass keeps off the rocks of this square and its neighbours, and rings the foot of this square's own rocks.
export function generateGrassCell(i, j, size, density, seed, trees = [], rocksPerHa = 0, sward = false){
  const r = cellRandom(i, j, seed, 77), o = newBuffer(), x0 = i*size, z0 = j*size
  const stones = []
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of rocksOfCell(i + a, j + b, size, rocksPerHa, seed, trees)) stones.push({ ...q, own: !a && !b })
  const clear = [...trees.filter(q => q.clear), ...stones.map(q => ({ x: q.x, z: q.z, r: q.s*1.05 }))]
    .filter(q => q.x > x0 - q.r && q.x < x0 + size + q.r && q.z > z0 - q.r && q.z < z0 + size + q.r)
  for (let k = 0, n = Math.round(density*size*size); k < n; k++){
    const x = x0 + r()*size, z = z0 + r()*size
    if (clear.some(q => Math.hypot(q.x - x, q.z - z) < q.r)) { r(); continue }     // nothing grows through a rock
    grassTuft(o, r, x, z, sward)
  }
  // near the walker, a sward under the tufts: low, wide, overlapping cards in the root colour, so the gaps between tufts fill with grass and
  // the field reads as one thick mat instead of separate clumps
  if (sward) for (let k = 0, n = Math.round(14*size*size); k < n; k++){
    const x = x0 + r()*size, z = z0 + r()*size
    if (clear.some(q => Math.hypot(q.x - x, q.z - z) < q.r)) continue
    // laid over toward the flow, so seen from above as well as from the side they cover the soil: the strokes face the camera, and a blade
    // standing straight up shrinks to nothing when you look down at it
    const y = groundHeight(x, z), len = lerp(.3, .5, r()), a = grassFlow(x, z) + (r() - .5)*1.2, lean = lerp(1.8, 3.2, r()), t = norm([Math.cos(a)*lean, 1, Math.sin(a)*lean])
    addStroke(o, r, { q: [x, y - .03, z], n: groundNormal(x, z), t, len, wid: lerp(.35, .55, r())*(r() < .5 ? -1 : 1), tile: [Math.floor(r()*4), Math.floor(r()*3)], pivot: [x, y, z], ao: 1, tone: clamp(grassLong(x, z)*.8 + r()*.2), wind: [x, z, 0, 0] })
  }
  if (density > 4) for (const q of stones.filter(q => q.own)) for (let k = 0, n = Math.round(10 + q.s*14); k < n; k++){
    const a = r()*7, d = q.s*lerp(1.05, 1.35, r()), x = q.x + Math.cos(a)*d, z = q.z + Math.sin(a)*d, y = groundHeight(x, z), len = lerp(.12, .25, r()), t = norm([(r() - .5)*.5, 1, (r() - .5)*.5])
    addStroke(o, r, { q: [x, y - .05, z], n: [0, 1, 0], t, len, wid: len*lerp(.9, 1.3, r()), tile: [Math.floor(r()*4), Math.floor(r()*3)], pivot: [x, y, z], ao: 1, tone: r(), wind: [x, z, 0, 0] })
  }
  return o
}

// Wildflowers of one square: now and then a patch of one kind, thick at its heart and thinning out, kept out of the shade under a crown.
// per100 is flowers per 100 m² on average; a patch holds about 40.
export function generateFlowerCell(i, j, size, per100, seed, trees = []){
  const r = cellRandom(i, j, seed, 313), o = newBuffer()
  if (r() > per100*size*size/100/40) return o
  const k = r(), P = { x: (i + r())*size, z: (j + r())*size, s: lerp(3, 9, r()), kind: k < .4 ? 0 : k < .65 ? 1 : k < .85 ? 3 : 2 }   // daisies most, then buttercups, clover, violets
  for (let n = 0, m = 25 + Math.floor(r()*30); n < m; n++){
    const a = r()*Math.PI*2, d = P.s*Math.sqrt(-Math.log(1 - r()*.95))*.6, x = P.x + Math.cos(a)*d, z = P.z + Math.sin(a)*d
    const len = lerp(.25, .45, r()), lean = lerp(0, .25, r()), b = r()*Math.PI*2, t = norm([Math.cos(b)*lean, 1, Math.sin(b)*lean]), tile = Math.floor(r()*4), tone = r()
    if (trees.some(q => !q.clear && Math.hypot(q.x - x, q.z - z) < q.r*1.4)) continue
    const y = groundHeight(x, z), s = len*.5
    addStroke(o, r, { q: [x + t[0]*s, y + t[1]*s - .03, z + t[2]*s], n: [0, 1, 0], t, len, wid: len*.9, tile: [tile, P.kind], pivot: [x, y, z], ao: 1, tone, wind: [x, z, 0, 0] })
  }
  return o
}

// A collar of tufts where each trunk and rock meets the ground: it breaks the line between the two. These stay put; the field follows the camera.
export function generateGrassCollars(seed, trees = []){
  const r = mulberry32(seed + 77), o = newBuffer()
  for (const q of trees) for (let i = 0, n = Math.round(10 + q.r*12); i < n; i++){
    const a = r()*7, d = q.r*lerp(q.clear ? 1 : .75, q.clear ? 1.3 : 1.7, r()), x = q.x + Math.cos(a)*d, z = q.z + Math.sin(a)*d, y = groundHeight(x, z), len = lerp(.2, .4, r())*(q.clear ? .6 : 1), t = norm([(r() - .5)*.5, 1, (r() - .5)*.5])
    addStroke(o, r, { q: [x, y - .05, z], n: [0, 1, 0], t, len, wid: len*lerp(.8, 1.2, r()), tile: [Math.floor(r()*4), Math.floor(r()*3)], pivot: [x, y, z], ao: 1, tone: r(), wind: [x, z, 0, 0] })
  }
  return o
}

// Wildflowers grow in patches: one kind per patch, thick at its heart and thinning out, and none in the deep shade under a crown.
export function generateFlowers(count, radius, seed, trees = []){
  const r = mulberry32(seed + 313), o = newBuffer()
  const patches = Array.from({ length: Math.max(1, Math.round(count/40)) }, () => {
    const d = radius*(.12 + .88*Math.sqrt(r())), a = r()*Math.PI*2, k = r()
    return { x: d*Math.cos(a), z: d*Math.sin(a), s: lerp(3, 9, r()), kind: k < .4 ? 0 : k < .65 ? 1 : k < .85 ? 3 : 2 }   // daisies most, then buttercups, clover, violets
  })
  for (let i = 0; i < count; i++){
    const P = patches[Math.floor(r()*patches.length)], a = r()*Math.PI*2, d = P.s*Math.sqrt(-Math.log(1 - r()*.95))*.6
    const x = P.x + Math.cos(a)*d, z = P.z + Math.sin(a)*d
    if (trees.some(q => Math.hypot(q.x - x, q.z - z) < q.r*1.4)) continue
    const y = groundHeight(x, z), len = lerp(.25, .45, r()), lean = lerp(0, .25, r()), b = r()*Math.PI*2, t = norm([Math.cos(b)*lean, 1, Math.sin(b)*lean]), s = len*.5
    addStroke(o, r, { q: [x + t[0]*s, y + t[1]*s - .03, z + t[2]*s], n: [0, 1, 0], t, len, wid: len*.9, tile: [Math.floor(r()*4), P.kind], pivot: [x, y, z], ao: 1, tone: r(), wind: [x, z, 0, 0] })
  }
  return o
}

// Rocks: a few low boulders sunk in the grass, alone or in small groups, clear of the trunks.
export function layoutRocks(count, radius, seed, trees = []){
  const r = mulberry32(seed + 919), rocks = []
  let guard = 0
  while (rocks.length < count && guard++ < 600){
    const lead = rocks.length && r() < .55 ? rocks[Math.floor(r()*rocks.length)] : null       // most rocks keep company
    const d = lead ? lead.s*lerp(1.4, 3, r()) : radius*(.15 + .85*Math.sqrt(r())), a = r()*Math.PI*2
    const x = (lead ? lead.x : 0) + Math.cos(a)*d, z = (lead ? lead.z : 0) + Math.sin(a)*d, s = lead ? lead.s*lerp(.35, .8, r()) : lerp(.25, .9, r()**1.5)
    if (trees.some(q => Math.hypot(q.x - x, q.z - z) < q.r*2 + s) || rocks.some(q => Math.hypot(q.x - x, q.z - z) < (q.s + s)*.9)) continue
    rocks.push({ x, z, y: groundHeight(x, z), s, turn: r()*Math.PI*2, flat: lerp(.6, .95, r()), seed: Math.floor(r()*1e6) })
  }
  return rocks
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
