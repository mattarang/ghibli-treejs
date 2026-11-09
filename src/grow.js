// Growing the scene's plants - the trees and the bushes round them - as plain buffers, with no page or GPU in sight, so it can run in a
// worker (src/grow-worker.js) while the page keeps drawing, or on the page itself where workers are missing. main.js turns the buffers into
// meshes. A preview grows the same trees with a fraction of the leaf strokes, for while a slider is being dragged.
import { generatePlant, layoutScene, newBuffer, groundHeight, setPond } from './generator.js'
import { SPECIES } from './presets.js'

// the plates alone, for the shadow pass: most strokes are small and never needed there
export function platesOf(b){
  const o = newBuffer(), each = [['pos', 3], ['nor', 3], ['uv', 2], ['wind', 4], ['center', 3], ['leaf', 3], ['corner', 2], ['stroke', 3]]
  for (let v = 0, n = b.dab.length; v < n; v += 4){
    if (b.dab[v] > .5) continue
    const base = o.pos.length/3
    for (const [k, size] of each) for (let i = v*size, e = (v + 4)*size; i < e; i++) o[k].push(b[k][i])
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return o
}

// Bushes barely change between rebuilds and took most of their time: each is grown once at the origin, then copied into place
const bushCache = new Map(); let bushUsed = null
function placeBush(bush, q, woodB, leafB, held){
  const key = q.seed + ':' + q.scale
  if (!bushCache.has(key)){ const wood = newBuffer(), leaf = newBuffer(), n = generatePlant(bush, q.seed, [0, 0, 0], q.scale, wood, leaf); bushCache.set(key, { wood, leaf, n }) }
  bushUsed?.add(key)
  const { wood, leaf, n } = bushCache.get(key), y = groundHeight(q.x, q.z) - .05, plant = held.length ? held[held.length - 1].plant + 1 : 0, ids = held.length
  const copy = (src, dst) => {
    const base = dst.pos.length/3
    for (let i = 0; i < src.pos.length; i += 3) dst.pos.push(src.pos[i] + q.x, src.pos[i + 1] + y, src.pos[i + 2] + q.z)
    for (const k of ['nor', 'uv', 'leaf', 'corner', 'stroke', 'dab']) for (const v of src[k]) dst[k].push(v)
    for (let i = 0; i < src.wind.length; i += 4) dst.wind.push(src.wind[i] + q.x, src.wind[i + 1] + q.z, src.wind[i + 2], src.wind[i + 3])
    for (const v of src.idx) dst.idx.push(v + base)
  }
  copy(wood, woodB); copy(leaf, leafB)
  for (let i = 0; i < wood.center.length; i += 3) woodB.center.push(wood.center[i], wood.center[i + 1] + y, wood.center[i + 2] + q.z)    // x carries the girth
  for (let i = 0; i < leaf.center.length; i += 3) leafB.center.push(leaf.center[i] + q.x, leaf.center[i + 1] + y, leaf.center[i + 2] + q.z)
  for (let i = 0; i < leaf.patch.length; i += 3) leafB.patch.push(leaf.patch[i], leaf.patch[i + 1], leaf.patch[i + 2] < 0 ? -1 : leaf.patch[i + 2] + ids)
  for (const c of leaf.held) held.push({ ...c, plant, c: [c.c[0] + q.x, c.c[1] + y, c.c[2] + q.z] })
  return n
}


// a preview: the same trees with a third of the leaf strokes and a coarser bark skin - the shape reads while the slider moves, and the full
// tree follows on release
const PREVIEW = { coverage: .3, strays: 0, skinCoarse: 2, skinBudget: 1e6 }

// the bushes of the last scene grown: their clumps (which come first in the clump table, so their numbers never shift) and the key of the
// layout they were grown for. A tree's sliders never move a bush, so while the key holds they are not grown, copied or sent again
let bushKey = '', bushHeld = []

export function growScene(p, { preview = false, debug = false } = {}){
  setPond(p.seed)                                                         // the ground under the plants: the pond moves with the seed
  const sp = preview ? { ...p, coverage: (p.coverage ?? 1)*PREVIEW.coverage, strays: PREVIEW.strays, skinCoarse: PREVIEW.skinCoarse, skinBudget: Math.min(p.skinBudget ?? 1e9, PREVIEW.skinBudget) } : p
  const woodB = newBuffer(), leafB = newBuffer(), ivyB = newBuffer()
  const { plants, bushes } = layoutScene({ ...p, height: p.height*p.size, groveRadius: p.groveRadius*Math.max(1, p.size) })
  let clumps = 0
  // the bushes first: only when where they stand (or the seed, which moves the ground under them) has changed
  const key = JSON.stringify([p.seed, bushes.map(q => [q.seed, q.scale, +q.x.toFixed(3), +q.z.toFixed(3)])])
  let bushOut = null
  if (key !== bushKey){
    const bush = { ...SPECIES['Round bush'] }, bushWoodB = newBuffer(), bushLeafB = newBuffer(), held = []
    bushUsed = new Set()
    for (const q of bushes) placeBush(bush, q, bushWoodB, bushLeafB, held)
    // (memory, and speed on a phone) keep exactly the bushes this scene uses; bushes from older scenes are let go
    for (const k of bushCache.keys()) if (!bushUsed.has(k)) bushCache.delete(k)
    bushUsed = null
    bushKey = key; bushHeld = held
    bushOut = { bushWood: bushWoodB, bushLeaf: bushLeafB, bushPlates: platesOf(bushLeafB) }
  }
  clumps += bushHeld.length
  // then the trees, their clumps after the bushes' (a clump's number is its place in the table)
  leafB.held = bushHeld.map(c => ({ ...c }))
  const treeStart = leafB.held.length, treePlant = treeStart ? leafB.held[treeStart - 1].plant + 1 : 0
  generatePlant.envelopes = []
  for (const q of plants) clumps += generatePlant(sp, q.seed, [q.x, groundHeight(q.x, q.z) - .08, q.z], q.scale, woodB, leafB, ivyB)
  const mainWood = debug ? generatePlant.debug?.branches ?? null : null
  const near = neighbours(leafB.held, bushOut ? -Infinity : treePlant)
  return { plants, bushes, clumps, treeStart, treePlant, near, held: leafB.held, mainWood, envelopes: debug ? generatePlant.envelopes : [],
    wood: woodB, leaf: leafB, ivy: ivyB, leafPlates: platesOf(leafB), ...(bushOut ?? { bushWood: null, bushLeaf: null, bushPlates: null }) }
}

// Which clumps can shade which, for the sun's light (main.js bakeSun): only those close enough to matter, the same test the page used, worked
// out here so the page doesn't spend a quarter of a second on it after every regrow. For the clumps of plants from fromPlant on (the bushes'
// lists stand while the bushes do). Packed: for clump ids[k], its neighbours are list[at[k]] .. list[at[k + 1]].
const TABLE = 256*64                                                       // clumps the light table holds
export function neighbours(held, fromPlant){
  const n = Math.min(held.length, TABLE), byPlant = new Map()
  for (let i = 0; i < n; i++){ const c = held[i]; if (c.plant < fromPlant) continue; if (!byPlant.has(c.plant)) byPlant.set(c.plant, []); byPlant.get(c.plant).push(i) }
  const ids = [], at = [0], list = []
  for (const all of byPlant.values()) for (const i of all){
    const a = held[i]
    for (const j of all){ if (j === i) continue
      const e = held[j], d = Math.hypot(e.c[0] - a.c[0], e.c[1] - a.c[1], e.c[2] - a.c[2])
      if (e.mass !== a.mass ? d < (a.r + e.r)*5 : d < (a.r + e.r)*2.2) list.push(j) }
    ids.push(i); at.push(list.length)
  }
  return { ids: Int32Array.from(ids), at: Int32Array.from(at), list: Int32Array.from(list) }
}

// the buffers as typed arrays, ready to hand from a worker without copying (and to upload)
const F32 = ['pos', 'nor', 'uv', 'wind', 'center', 'leaf', 'corner', 'stroke', 'dab', 'patch']
export function pack(b){ const o = {}; for (const k of F32) o[k] = Float32Array.from(b[k]); o.idx = Uint32Array.from(b.idx); return o }
export const BUFFERS = ['wood', 'leaf', 'ivy', 'leafPlates', 'bushWood', 'bushLeaf', 'bushPlates']
export function packScene(r){ for (const k of BUFFERS) if (r[k]) r[k] = pack(r[k]); return r }
export const transfers = r => BUFFERS.flatMap(k => r[k] ? Object.values(r[k]).map(a => a.buffer) : []).concat(r.near ? [r.near.ids.buffer, r.near.at.buffer, r.near.list.buffer] : [])
