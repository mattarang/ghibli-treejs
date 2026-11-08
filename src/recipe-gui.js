// Tuning a species without code: load a traced crown outline, set its growth habit, and save the result as a recipe.
// A recipe is plain data (the same fields a species in presets.js has), so a saved recipe is a species like any built-in one.

const STORE = 'ghibli-foliage.recipes'
const ORDERS = [['trunk', 'Trunk & leader'], ['limbs', 'Limbs'], ['twigs', 'Twigs & finer']]
const PER_ORDER = [
  // key, label, min, max, step, default
  ['branch', 'Branch angle (°)', 0, 90, 1, 45],
  ['tropism', 'Pull up (+) / down (−)', -1, 1, .01, .1],
  ['level', 'Hold level', 0, 1, .01, 0],
  ['wiggle', 'Crookedness', 0, .5, .01, 0],
  ['outward', 'Outward limit (°, 0 = off)', 0, 90, 1, 0]]
const GLOBAL = [
  ['lambda', 'Leader dominance', .3, .8, .01, .52],
  ['env', 'Steer to open space', 0, 1, .01, .3],
  ['internode', 'Shoot length', .015, .08, .001, .04],
  ['perceive', 'Sight (shoot lengths)', 2, 10, .1, 5],
  ['maxShoot', 'Steps per year', 1, 8, 1, 4],
  ['years', 'Years of growth', 5, 60, 1, 30],
  ['noReturn', 'No growing back in', 0, 1, .01, .2],
  ['topFree', 'Free twigs above (share of crown, 0 = off)', 0, 1, .01, 0],
  ['maxOrder', 'Branching orders above the stems (0 = no limit)', 0, 10, 1, 0]]

// ---- saved recipes live in the browser and join the species list ----
export function loadSavedRecipes(SPECIES){
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') } catch {}
  for (const [name, r] of Object.entries(saved)) if (r?.settings) SPECIES[name] = r.settings
  return Object.keys(saved)
}
const saveRecipe = (name, settings) => { let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') } catch {}; saved[name] = { version: 1, settings }; localStorage.setItem(STORE, JSON.stringify(saved)) }
const forgetRecipe = name => { let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') } catch {}; delete saved[name]; localStorage.setItem(STORE, JSON.stringify(saved)) }

// ---- a crown outline from a traced black-and-white image: half-width at 33 heights from its lowest point to its highest (the tracer's own rule) ----
// an image as a slab mask: dark pixels, cropped to their bounds and shrunk to about 96 rows of '0'/'1' (small enough to keep in a recipe)
export function maskFromImage(img, rowsWanted = 96){
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => { const i = (y*W + x)*4; return px[i + 3] > 128 && (px[i] + px[i + 1] + px[i + 2])/3 < 128 }
  let x0 = W, x1 = -1, y0 = H, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)){ if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  const h = y1 - y0 + 1, w = x1 - x0 + 1, step = Math.max(1, h/rowsWanted), rows = []
  for (let ry = 0; ry < Math.round(h/step); ry++){ let row = ''; for (let rx = 0; rx < Math.round(w/step); rx++) row += dark(Math.min(x0 + Math.floor((rx + .5)*step), x1), Math.min(y0 + Math.floor((ry + .5)*step), y1)) ? '1' : '0'; rows.push(row) }
  return rows
}
export function outlineFromImage(img){
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data
  const dark = (x, y) => { const i = (y*W + x)*4; return px[i + 3] > 128 && (px[i] + px[i + 1] + px[i + 2])/3 < 128 }
  let top = -1, bot = -1
  for (let y = 0; y < H && top < 0; y++) for (let x = 0; x < W; x++) if (dark(x, y)){ top = y; break }
  for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W; x++) if (dark(x, y)){ bot = y; break }
  if (top < 0 || bot <= top) return null
  const h = bot - top, raw = []
  for (let i = 0; i <= 32; i++){ const y = Math.round(bot - i/32*h); let l = -1, r = -1; for (let x = 0; x < W; x++) if (dark(x, y)){ if (l < 0) l = x; r = x }; raw.push(l < 0 ? 0 : (r - l)/2/h) }
  const sm = raw.map((v, i) => i < 2 || i > 30 ? v : (raw[i - 1] + 2*v + raw[i + 1])/4); sm[32] = 0
  return sm.map(v => Math.round(v*1000)/1000)
}

export function addRecipeGui({ gui, p, SPECIES, speciesCtl, later, setSpecies, rebuild, refreshAll, showOutline, applyLook }){
  const so = () => p.rings?.colonise?.selfOrg
  const at = (v, i, d) => Array.isArray(v) ? v[Math.min(i, v.length - 1)] : (v ?? d)

  // ---- Outline ----
  const outF = gui.addFolder('Outline').close()
  const setOutline = outline => {
    if (!p.rings?.colonise){ alert('This species does not grow into an outline.'); return }
    p.rings = { ...p.rings, outline, crownOnly: true }; rebuild(); showOutline() }
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' })
  file.onchange = () => { const f = file.files[0]; if (!f) return; const img = new Image(); img.onload = () => { const o = outlineFromImage(img); if (o) setOutline(o); else alert('No dark shape found in that image.') }; img.src = URL.createObjectURL(f); file.value = '' }
  outF.add({ load(){ file.click() } }, 'load').name('Load traced image…')
  outF.add({ paste(){ const t = prompt('Paste outline numbers (from the tracer\'s Copy outline):'); if (!t) return
    try { const o = JSON.parse(t); if (!Array.isArray(o) || o.length < 3 || o.some(v => typeof v !== 'number')) throw 0; setOutline(o) } catch { alert('That isn\'t a list of numbers like [0.1, 0.4, …, 0].') } } }, 'paste').name('Paste outline numbers…')
  outF.add({ copy(){ navigator.clipboard?.writeText(JSON.stringify(p.rings?.outline ?? [])) } }, 'copy').name('Copy current outline')
  outF.add({ tracer(){ open('/tools/trace.html', '_blank') } }, 'tracer').name('Open the tracer')
  // other crown shapes: a primitive, or an image as a flat slab (keeps holes, lopsidedness and separate parts the spun outline can't)
  const shape = { kind: p.rings?.shape?.kind ?? 'traced outline', fine: p.rings?.shape?.fine ?? 0, depth: p.rings?.shape?.depth ?? .08, width: p.rings?.shape?.width ?? 1, turns: p.rings?.shape?.turns ?? 2.5, ring: p.rings?.shape?.ring ?? .62, tube: p.rings?.shape?.tube ?? .3, upright: !!p.rings?.shape?.upright }
  const applyShape = () => { if (!p.rings?.colonise) return; const keep = p.rings.shape?.mask
    p.rings = { ...p.rings, crownOnly: true, shape: shape.kind === 'traced outline' ? undefined : { kind: shape.kind === 'image slab' ? 'slab' : shape.kind, fine: shape.fine, depth: shape.depth, width: shape.width, turns: shape.turns, ring: shape.ring, tube: shape.tube, upright: shape.upright, mask: keep } }
    if (shape.kind === 'image slab' && !keep){ alert('Load an image for the slab first.'); return } rebuild() }
  const kindCtl = outF.add(shape, 'kind', ['traced outline', 'sphere', 'cube', 'torus', 'spiral', 'image slab']).name('Crown shape').onChange(applyShape)
  outF.add(shape, 'fine', 0, 1, .01).name('Shape fidelity (fill, small tufts)').onChange(applyShape)
  outF.add(shape, 'width', .3, 3, .01).name('Shape width (× height)').onChange(applyShape)
  outF.add(shape, 'depth', .01, .5, .01).name('Slab depth (× height)').onChange(applyShape)
  outF.add(shape, 'turns', 1, 6, .1).name('Spiral turns').onChange(applyShape)
  outF.add(shape, 'ring', .2, 1, .01).name('Torus / spiral radius').onChange(applyShape)
  outF.add(shape, 'tube', .05, .5, .01).name('Torus / spiral thickness').onChange(applyShape)
  outF.add(shape, 'upright').name('Torus stands upright').onChange(applyShape)
  const sfile = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' })
  sfile.onchange = () => { const f = sfile.files[0]; if (!f) return; const img = new Image(); img.onload = () => { const mask = maskFromImage(img); if (!mask) return alert('No dark shape found in that image.')
    p.rings = { ...p.rings, crownOnly: true, shape: { kind: 'slab', fine: shape.fine, depth: shape.depth, width: shape.width, mask } }; shape.kind = 'image slab'; kindCtl.updateDisplay(); rebuild() }; img.src = URL.createObjectURL(f); sfile.value = '' }
  outF.add({ slab(){ sfile.click() } }, 'slab').name('Load image as 2D slab…')
  const pullShape = () => { const sh = p.rings?.shape; shape.kind = !sh ? 'traced outline' : sh.kind === 'slab' ? 'image slab' : sh.kind; outF.controllersRecursive().forEach(c => c.updateDisplay()) }

  // ---- Growth habit: every value the self-organising growth reads, per branch order where it varies by order ----
  const habitF = gui.addFolder('Growth habit').close()
  const h = {}, ctls = []
  const push = () => { const S = so(); if (!S) return
    for (const [key] of PER_ORDER) S[key] = ORDERS.map((_, i) => h[key + i])
    for (const [key] of GLOBAL) S[key] = h[key]
    S.whorl = h.whorlCount > 1 ? { count: h.whorlCount, upTo: h.whorlUpTo } : undefined
    S.multiStem = h.multiStem
    later() }
  const pull = () => { const S = so()
    for (const [key, , , , , d] of PER_ORDER) ORDERS.forEach((_, i) => { h[key + i] = S ? at(S[key], i, d) : d })
    for (const [key, , , , , d] of GLOBAL) h[key] = S?.[key] ?? d
    h.whorlCount = S?.whorl?.count ?? 0; h.whorlUpTo = S?.whorl?.upTo ?? 1; h.multiStem = !!S?.multiStem
    ctls.forEach(c => { c.updateDisplay(); c.enable(!!S) }) }
  pull()
  for (const [i, [, label]] of ORDERS.entries()){ const f = habitF.addFolder(label); if (i) f.close()
    for (const [key, name, min, max, step] of PER_ORDER) ctls.push(f.add(h, key + i, min, max, step).name(name).onChange(push)) }
  const gF = habitF.addFolder('Whole tree')
  for (const [key, name, min, max, step] of GLOBAL) ctls.push(gF.add(h, key, min, max, step).name(name).onChange(push))
  ctls.push(gF.add(h, 'whorlCount', 0, 7, 1).name('Rings of limbs (0 = off)').onChange(push))
  ctls.push(gF.add(h, 'whorlUpTo', 0, 2, 1).name('Rings up to order').onChange(push))
  ctls.push(gF.add(h, 'multiStem').name('Trunk ends in several stems').onChange(push))
  const presets = {
    'Spreading broadleaf': { branch: [45, 50, 45], tropism: [.1, .05, .05], level: [0, .3, .15], wiggle: [.03, .1, .1], outward: [0, 50, 50], lambda: .48, multiStem: false, whorl: undefined },
    'Conifer (cone)': { branch: [60, 72, 55], tropism: [.4, -.04, .04], level: [0, .6, .4], wiggle: 0, outward: 50, lambda: .66, multiStem: false, whorl: undefined },
    'Pine (tiers)': { branch: [45, 80, 55], tropism: [.15, 0, 0], level: [0, .75, .6], wiggle: [.03, .15, .2], outward: [0, 50, 75], lambda: .62, multiStem: false, whorl: { count: 4, upTo: 1 } },
    'Weeping': { branch: [40, 38, 45], tropism: [.2, .02, -.7], level: 0, wiggle: 0, outward: 50, lambda: .5, multiStem: false, whorl: undefined },
    'Column (fastigiate)': { branch: [25, 25, 25], tropism: .6, level: 0, wiggle: 0, outward: 50, lambda: .6, multiStem: false, whorl: undefined },
    'Vase (several stems)': { branch: [25, 28, 40], tropism: [.3, .25, .1], level: 0, wiggle: 0, outward: 50, lambda: .48, multiStem: true, whorl: undefined },
    'Multi-stem shrub tree': { branch: [45, 45, 45], tropism: .1, level: [0, 0, .25], wiggle: 0, outward: 50, lambda: .52, multiStem: true, whorl: undefined } }
  const start = { habit: Object.keys(presets)[0] }
  habitF.add(start, 'habit', Object.keys(presets)).name('Start from').onChange(name => { const S = so(); if (!S) return; Object.assign(S, structuredClone(presets[name])); pull(); later() })

  // ---- Leaf & bark detail: the per-species look values that had no slider ----
  const lookF = gui.addFolder('Leaf & bark detail').close()
  const LOOK = [
    // folder, key, label, min, max, step (or 'bool'), default, how it applies
    ['Leaves on the wood', 'clotheFrom', 'Leaves from (0 base … 1 tip only)', 0, 1, .01, .5, 'grow'],
    ['Leaves on the wood', 'clotheCarriers', 'Leaves on wood that carries twigs', 'bool', 0, 0, false, 'grow'],
    ['Leaves on the wood', 'clotheRoom', 'Leaf budget along the wood', 1, 40, .5, 1.4, 'grow'],
    ['Leaves on the wood', 'clotheGap', 'Spacing of sprays along the wood', .5, 3, .05, .8, 'grow'],
    ['Leaves on the wood', 'ride', 'Sprays sit on top of the wood', 0, 1.5, .05, 0, 'grow'],
    ['Leaves on the wood', 'keepGaps', 'Keep sky gaps (no fill from above)', 'bool', 0, 0, false, 'grow'],
    ['Wood clean-up', 'bareLimbs', 'Bare limbs thicker than (× trunk)', 0, .6, .01, 0, 'grow'],
    ['Wood clean-up', 'whip', 'Cut whips longer than (m, 0 = off)', 0, 12, .1, 0, 'grow'],
    ['Wood clean-up', 'longRun', 'Cut unforked runs longer than (m, 0 = off)', 0, 15, .1, 0, 'grow'],
    ['Leaf masses', 'massVar', 'Size difference between masses', 0, 1, .01, .45, 'grow'],
    ['Leaf masses', 'lobeW', 'Lobe width', .5, 2, .01, 1, 'grow'],
    ['Leaf masses', 'lobeH', 'Lobe height', .5, 2, .01, 1, 'grow'],
    ['Leaf masses', 'core', 'Solid body inside each clump', 'bool', 0, 0, true, 'grow'],
    ['Bark pattern', 'barkScale', 'Pattern size', .3, 4, .01, 1, 'look'],
    ['Bark pattern', 'barkStretch', 'Stretch along the wood', .3, 4, .01, 1, 'look'],
    ['Bark pattern', 'barkFurrow', 'Fissures', 0, 2, .01, 1, 'look'],
    ['Bark pattern', 'barkPlates', 'Plates', 0, 1.5, .01, 0, 'look'],
    ['Bark pattern', 'barkBands', 'Bands across the trunk', 0, 1, .01, 0, 'look']]
  const lk = {}, lookCtls = [], lookFolders = {}
  const lookPull = () => { for (const [, key, , , , , d] of LOOK){ if (key === 'lobeW') lk[key] = p.lobeStretch?.[0] ?? d; else if (key === 'lobeH') lk[key] = p.lobeStretch?.[1] ?? d; else lk[key] = p[key] ?? d }; lookCtls.forEach(c => c.updateDisplay()) }
  lookPull()
  for (const [folder, key, label, min, max, step, , how] of LOOK){
    const f = lookFolders[folder] ??= lookF.addFolder(folder).close()
    const c = min === 'bool' ? f.add(lk, key) : f.add(lk, key, min, max, step)
    c.name(label).onChange(v => { if (key === 'lobeW' || key === 'lobeH') p.lobeStretch = [lk.lobeW, lk.lobeH]; else p[key] = v; if (how === 'look') applyLook(); else later() })
    lookCtls.push(c) }
  // colour forms: a share of seeds wears a different palette (a white cherry, an autumn maple). Up to three, each four colours from shadow to light
  const formsF = lookF.addFolder('Colour forms (by seed)').close()
  const buildForms = () => {
    for (const c of [...formsF.controllers]) c.destroy(); for (const f of [...formsF.folders]) f.destroy()
    const forms = p.colors ?? []
    forms.forEach((form, k) => { const f = formsF.addFolder(form.name || 'Form ' + (k + 1))
      f.add(form, 'share', 0, 1, .01).name('Share of seeds').onChange(later)
      ;['Shadow', 'Dark', 'Mid', 'Light'].forEach((n, i) => f.addColor(form.palette, i).name(n).onChange(() => { applyLook(); later() })) })
    if (forms.length < 3) formsF.add({ add(){ p.colors = [...(p.colors ?? []), { name: 'Form ' + ((p.colors?.length ?? 0) + 1), share: .25, palette: [...p.palette] }]; buildForms(); later() } }, 'add').name('Add a colour form')
    if (forms.length) formsF.add({ remove(){ p.colors = p.colors.slice(0, -1); if (!p.colors.length) p.colors = null; buildForms(); later() } }, 'remove').name('Remove the last form') }
  buildForms()

  // ---- Recipe: the whole species as one file ----
  const recipeF = gui.addFolder('Recipe').close()
  const keys = new Set(Object.values(SPECIES).flatMap(Object.keys))
  const current = () => { const s = {}; for (const k of keys) if (k in p) s[k] = structuredClone(p[k]); return s }
  const apply = (name, settings) => { SPECIES[name] = settings; speciesCtl.options(Object.keys(SPECIES).sort()); setSpecies(name, settings); speciesCtl.updateDisplay(); refreshAll() }
  const download = (name, data) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = name.replace(/\s+/g, '-').toLowerCase() + '.tree.json'; a.click(); URL.revokeObjectURL(a.href) }
  recipeF.add({ save(){ const name = prompt('Save this tree as a species named:', p.species); if (!name) return; const s = current(); saveRecipe(name, s); apply(name, s) } }, 'save').name('Save as species…')
  recipeF.add({ exp(){ download(p.species, { name: p.species, version: 1, settings: current() }) } }, 'exp').name('Download recipe')
  recipeF.add({ copy(){ navigator.clipboard?.writeText(JSON.stringify({ name: p.species, version: 1, settings: current() })) } }, 'copy').name('Copy recipe')
  const rfile = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' })
  rfile.onchange = async () => { const f = rfile.files[0]; if (!f) return; try { const r = JSON.parse(await f.text()); if (!r.settings) throw 0; const name = r.name || f.name.replace(/\.tree\.json$|\.json$/, ''); saveRecipe(name, r.settings); apply(name, r.settings) } catch { alert('That file isn\'t a tree recipe.') } rfile.value = '' }
  recipeF.add({ imp(){ rfile.click() } }, 'imp').name('Load recipe file…')
  recipeF.add({ forget(){ if (!confirm(`Remove the saved species "${p.species}" from this browser? Built-in species are not affected.`)) return; forgetRecipe(p.species); alert('Removed. It will be gone from the list next time the page loads.') } }, 'forget').name('Forget saved species')

  return { refresh(){ pull(); lookPull(); buildForms(); pullShape() } }
}
