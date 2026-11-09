// The demo page: the scene full screen, with its settings as small things at its edges rather than a menu over it:
//   a tree chip (which kind - a sheet of every kind - a new tree of the kind, undo, and its shape), a sun dial (drag the sun round its
//   24-hour track), a season wheel (drag round the year; the button in the middle plays it), and round buttons to walk, go full screen
//   or recentre on the tree. Walking has a touch pad: tank controls. Every control goes through the full panel's own controller, so a change
//   here does exactly what the same change does there.
window.__DEMO = true
await import('./main.js')
const { makeSculpt, designFromTree, blankDesign } = await import('./sculpt.js')
const G = window.__foliage, p = G.p, $ = id => document.getElementById(id)
const ctl = prop => G.gui.controllersRecursive().find(c => c.property === prop)
const set = (prop, v) => ctl(prop)?.setValue(v)
const NS = 'http://www.w3.org/2000/svg', svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e }
const TAU = Math.PI*2

// ---- the tree's settings: one schema for every species. Each slider means the same thing on every tree (offsets from the species' own
// recipe, so a species at its defaults is exactly as designed) and takes its range from the full panel's own control. Four parts of the
// tree, never more than four sliders in one ----
const pct = (lo, hi) => v => `${Math.round((v - lo)/(hi - lo)*100)}%`, deg = v => `${Math.round(v)}°`
const SHAPE = [
  ['Trunk'],
  ['height', 'Height', v => `${(+v).toFixed(1)} m`],
  ['trunkFrac', 'Trunk height', v => `${(+v).toFixed(1)} m`, 'metres'],   // the bare part below the crown, in metres (stored as a share of Height)
  ['trunkRadius', 'Thickness', v => `${Math.round(v*200)} cm`],
  ['stems', 'Stems', v => (+v).toFixed(1)],
  ['Branches'],
  ['children', 'Main limbs', v => `${Math.round(v)}`],
  ['childAngle', 'Angle', deg],
  ['lengthRatio', 'Length', v => `${Math.round(v*100)}%`],
  ['droop', 'Droop', pct(0, .3)],
  ['Crown'],
  ['crownWidth', 'Width', v => `${Math.round(v*100)}%`],
  ['clumpRadius', 'Leaf clumps', v => `${(+v).toFixed(1)} m`],
  ['Character'],
  ['sinuous', 'Trunk bends', pct(0, 1.5)],
  ['lean', 'Lean', v => v < .01 ? 'None' : pct(0, .4)(v)],
  ['gnarl', 'Crookedness', pct(0, .5)],
  ['windLean', 'Windswept', v => v < .02 ? 'None' : pct(0, .7)(v)],
]
const PROPS = SHAPE.filter(r => r[1]).map(r => r[0])

// ---- undo: every change to the tree (a new tree, another kind, a slider, a reset) can be taken back. A snapshot is the kind, the seed and
// every shape value; the species' own values are kept too, so the panel can say what has changed from them ----
let sculpt = null, showMode = () => {}, saveDesign = () => {}, mine = [], active = null, renderMine = () => {}, afterRestore = () => {}
const future = []                                                    // undone steps, for redo (cleared by any new change)
const snap = () => ({ species: p.species, seed: p.seed, v: Object.fromEntries(PROPS.map(k => [k, p[k]])), design: p.design ? JSON.stringify(p.design) : null, vary: JSON.stringify(p.designVary ?? null), grove: p.grove, active, mine: JSON.stringify(mine) })
let defaults = snap().v
const history = []
const undoBtn = $('undo')
function pushHistory(s){ history.push(s); if (history.length > 40) history.shift(); future.length = 0; undoBtn.hidden = false }
function remember(){ pushHistory(snap()) }
function setSpecies(name){ if (p.species !== name) set('species', name); defaults = snap().v }
function restore(s){
  if (s.species !== p.species) setSpecies(s.species)
  if (s.seed !== p.seed) set('seed', s.seed)
  for (const k of PROPS) if (p[k] !== s.v[k]) set(k, s.v[k])
  // the drawing as it was (and whether the tree was drawn at all)
  const d = s.design ? JSON.parse(s.design) : null, was = JSON.stringify(p.design ?? null)
  if ((s.design ?? 'null') !== was || JSON.stringify(p.designVary ?? null) !== s.vary){ p.design = d; p.designVary = JSON.parse(s.vary); G.later(); saveDesign() }
  if (s.grove !== p.grove) set('grove', s.grove)
  if (s.mine !== undefined && s.mine !== JSON.stringify(mine)){ mine = JSON.parse(s.mine); renderMine() }
  active = s.active ?? null
  sculpt?.set(p.design); afterRestore(); showMode()
}
function undo(){ const s = history.pop(); if (s){ future.push(snap()); restore(s) } undoBtn.hidden = !history.length; sync() }
function redo(){ const s = future.pop(); if (s){ history.push(snap()); restore(s); undoBtn.hidden = false } sync() }
undoBtn.addEventListener('click', undo)
const typing = () => { const a = document.activeElement; return /SELECT|TEXTAREA/.test(a?.tagName ?? '') || (a?.tagName === 'INPUT' && a.type === 'text') }
addEventListener('keydown', e => { if (!(e.metaKey || e.ctrlKey) || typing()) return
  if (e.key.toLowerCase() === 'z' && !e.shiftKey){ undo(); e.preventDefault() } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y'){ redo(); e.preventDefault() } })
// changed from the species' own: Trunk height is compared in metres, as it is shown (a new Height keeps the trunk's metres)
const changed = k => k === 'trunkFrac' ? Math.abs(p.trunkFrac*p.height - defaults.trunkFrac*defaults.height) > .05 : Math.abs((p[k] ?? 0) - (defaults[k] ?? 0)) > 1e-6

// ---- the tree chip ----
const names = Object.keys(G.SPECIES).filter(n => !/test/i.test(n)).sort(), nameBtn = $('name'), sheet = $('speciesSheet'), list = $('speciesList')
// every kind on one sheet: the one growing now is marked; choosing one grows it and closes the sheet
for (const n of names){ const b = document.createElement('button'); Object.assign(b, { type: 'button', className: 'species', textContent: n }); b.dataset.name = n
  b.addEventListener('click', () => { if (n !== p.species || active){ remember(); leaveTree(); setSpecies(n) } openSheet(false); nameBtn.focus() }); list.append(b) }
function openSheet(on){ sheet.hidden = !on; nameBtn.setAttribute('aria-expanded', on)
  if (on){ openShape(false); list.querySelector(`[data-name="${CSS.escape(p.species)}"]`)?.focus() } }
nameBtn.addEventListener('click', () => openSheet(sheet.hidden))
addEventListener('pointerdown', e => { if (!sheet.hidden && !sheet.contains(e.target) && !nameBtn.contains(e.target)) openSheet(false) })
const step = d => { const i = names.indexOf(p.species); remember(); leaveTree(); setSpecies(names[(i + d + names.length)%names.length]) }
$('prev').addEventListener('click', () => step(-1)); $('next').addEventListener('click', () => step(1))
$('dice').addEventListener('click', () => { remember(); set('seed', 1 + Math.floor(Math.random()*9998)) })
const shape = $('shape'), shapeBtn = $('shapeBtn'), editor = $('editor')
// the panel stays open while the scene is turned and zoomed (that is the point of it): Done, the Shape button again, or Escape close it
function openShape(on){ shape.hidden = !on; shapeBtn.setAttribute('aria-expanded', on); document.body.classList.toggle('shaping', on); if (on){ openSheet(false); openEditor(false) } }
shapeBtn.addEventListener('click', () => active ? openEditor(editor.hidden) : openShape(shape.hidden))
$('closeShape').addEventListener('click', () => openShape(false)); $('done').addEventListener('click', () => openShape(false))
addEventListener('keydown', e => { if (e.key !== 'Escape' || typing()) return; if (!sheet.hidden){ openSheet(false); nameBtn.focus() } else if (!editor.hidden){ if (sculpt.selected >= 0){ sculpt.select(-1); showSel() } else { openEditor(false); shapeBtn.focus() } } else if (!shape.hidden){ openShape(false); shapeBtn.focus() } })
// the view moves out from under the panel: the picture's centre slides into the uncovered part of the screen (a side panel: across; a
// bottom panel: up, and a little wider, so the whole tree fits the smaller space), eased so the tree glides over rather than jumps
const view = { x: 0, y: 0, z: 1 }
function frameAround(){
  const panelEl = editor.hidden ? shape : editor, W = innerWidth, H = innerHeight, open = !panelEl.hidden && !document.body.classList.contains('walking'), r = panelEl.getBoundingClientRect()
  let tx = 0, ty = 0, tz = 1
  if (open){ const bottom = r.width > W*.7
    if (bottom){ const free = r.top; ty = (H - free)/2; tz = Math.min(1, Math.max(.6, free/H*1.15)) } else tx = r.left > W/2 ? (W - r.left)/2 : -(r.right)/2 }
  const k = .16; view.x += (tx - view.x)*k; view.y += (ty - view.y)*k; view.z += (tz - view.z)*k
  const cam = G.camera, still = Math.abs(view.x) < .5 && Math.abs(view.y) < .5 && Math.abs(view.z - 1) < .002
  if (still && !cam.view?.enabled && cam.zoom === 1){ requestAnimationFrame(frameAround); return }
  if (still){ cam.clearViewOffset(); cam.zoom = 1 } else { cam.setViewOffset(W, H, view.x, view.y, W, H); cam.zoom = view.z }
  cam.updateProjectionMatrix(); requestAnimationFrame(frameAround)
}
requestAnimationFrame(frameAround)

// ---- the shape panel: a tab for each part of the tree. A value changed from the species' own is marked, and its value chip turns into a
// button that puts that one value back (double-clicking the slider does the same) ----
const sliders = [], panel = $('shapeSliders'), tabs = $('shapeTabs'), groups = []
let box = panel
function showTab(i){ groups.forEach((g, n) => { g.hidden = n !== i; g.tab.setAttribute('aria-selected', n === i); g.tab.tabIndex = n === i ? 0 : -1 }) }
for (const [prop, label, fmt, unit] of SHAPE){
  if (!label){ const i = groups.length, g = document.createElement('div'), t = document.createElement('button')
    g.className = 'group'; g.id = 'grp-' + i; g.setAttribute('role', 'tabpanel'); g.setAttribute('aria-labelledby', 'tab-' + i)
    Object.assign(t, { type: 'button', id: 'tab-' + i, className: 'tab' }); t.innerHTML = `<span>${prop}</span><i class="dot" aria-hidden="true"></i>`
    t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', g.id)
    t.addEventListener('click', () => showTab(i))
    t.addEventListener('keydown', e => { const n4 = SHAPE.filter(r => !r[1]).length, d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d){ const n = (i + d + n4) % n4; showTab(n); groups[n].tab.focus(); e.preventDefault() } })
    g.tab = t; g.props = []; groups.push(g); tabs.append(t); panel.append(g); box = g; continue }
  const c = ctl(prop); if (!c) continue
  const id = 's-' + prop, row = document.createElement('div'), lab = document.createElement('label'), input = document.createElement('input'), out = document.createElement('button')
  lab.htmlFor = id; lab.textContent = label; out.type = 'button'; out.className = 'val'
  row.className = 'row-head'; row.append(lab, out); Object.assign(input, { id, type: 'range', min: c._min, max: c._max, step: c._step ?? .01 })
  if (unit === 'metres') input.step = .1                                // shown in metres, its range following the tree's height
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.append(row, input); box.append(wrap); box.props.push(prop)
  sliders.push([input, prop, out, fmt, wrap, unit, label])
}
showTab(0)
let busy = null
// a slider in metres stands for a share of the tree's height: its value converts both ways
const toShown = (unit, prop) => unit === 'metres' ? p[prop]*p.height : p[prop], fromShown = (unit, v) => unit === 'metres' ? v/p.height : v
const fill = el => el.style.setProperty('--fill', `${((+el.value - +el.min)/(+el.max - +el.min || 1))*100}%`)   // the track's set part
const putBack = prop => { if (!changed(prop)) return; remember(); set(prop, defaults[prop]); sync() }
for (const [el, prop, out, fmt, , unit, label] of sliders){
  el.addEventListener('pointerdown', () => remember()); el.addEventListener('keydown', e => { if (!e.repeat && /Arrow|Page|Home|End/.test(e.key)) remember() })
  // while it is dragged the tree regrows as a light preview at once (the leaf strokes thinned); let go, and the full tree follows
  el.addEventListener('input', () => { busy = el; set(prop, fromShown(unit, +el.value)); G.preview(); out.textContent = fmt(+el.value); fill(el) })
  el.addEventListener('change', () => { busy = null; G.later(); sync() })
  el.addEventListener('dblclick', () => putBack(prop))
  out.addEventListener('click', () => putBack(prop))
}
$('leaves').addEventListener('change', e => set('showFoliage', e.target.checked))
$('reset').addEventListener('click', () => { remember(); ctl('species')._onChange?.(p.species); defaults = snap().v; sync() })   // the species' own change: its whole shape back

// ---- your own trees (src/sculpt.js): + adds one, drawn from the tree in view - its trunk and main limbs drawn by hand, the canopy they grow
// into shaped, its leaves and bark taken from a kind of tree, a reference picture behind it to draw over. They are listed in the tree sheet
// and kept in this browser; choosing a kind of tree leaves them ----
const TREES = 'ghibli-foliage-trees-v1', REF = id => 'ghibli-foliage-ref-' + id
try { mine = JSON.parse(localStorage.getItem(TREES) ?? '[]') } catch {}
// (the one drawing of the last version becomes your first tree)
try { const old = JSON.parse(localStorage.getItem('ghibli-foliage-design-v1') ?? 'null'); if (old?.design?.strokes && !mine.length) mine.push({ id: 't' + Date.now().toString(36), name: 'My tree 1', species: p.species, design: old.design, vary: old.vary }); localStorage.removeItem('ghibli-foliage-design-v1') } catch {}
const store = () => { try { localStorage.setItem(TREES, JSON.stringify(mine)) } catch {} }
const current = () => mine.find(t => t.id === active)
saveDesign = () => { const t = current(); if (t){ t.design = p.design; t.vary = p.designVary; t.species = p.species } store(); renderMine() }
const myList = $('myList')
renderMine = () => { myList.replaceChildren(...mine.map(t => { const b = document.createElement('button'); Object.assign(b, { type: 'button', className: 'species', textContent: t.name || 'My tree' })
  b.setAttribute('aria-current', t.id === active); b.addEventListener('click', () => { if (t.id !== active){ remember(); useTree(t.id) } openSheet(false); nameBtn.focus() }); return b }))
  myList.hidden = !mine.length; myList.previousElementSibling.hidden = !mine.length }
const HINTS = { wood: 'Tap a + to grow a branch from there; the + at a tip makes it longer. Drag any dot to shape it. Tap a branch to pick it and add to it, tap a dot to set its thickness.',
  canopy: 'Drag the side handles to widen or narrow the canopy at that height, the green ones to bulge it out or pull it in, the top and bottom ones to raise or lower it.',
  ref: 'Choose a picture (or drop one onto the page) to stand behind the tree and draw over. Turn the camera to the view you want, then press Face the camera.' }
const orderOf = (d, si) => { let n = 0; for (let s = si; s > 0 && d.strokes[s]?.from; s = d.strokes[s].from.s) n++; return n }
const lerpN = (a, b, t) => a + (b - a)*t
const guessRadius = (si, i, d) => { const R = p.trunkRadius*p.size, st = d.strokes[si], along = i/Math.max(st.pts.length - 1, 1)
  return R*[1, .45, .25, .15][Math.min(orderOf(d, si), 3)]*lerpN(si ? .9 : 1, .55, along) }
// a node's thickness on the slider: metres of radius on a log scale, 1.5 cm to 3 m
const R_LO = .015, R_HI = 3, toSlider = r => Math.log(r/R_LO)/Math.log(R_HI/R_LO), fromSlider = v => R_LO*(R_HI/R_LO)**v
// what is picked, said in words, with what can be done to it
function showSel(){ const si = sculpt.selected, i = sculpt.selNode, d = sculpt.design, on = !!p.design && si >= 0 && !!d?.strokes[si]; $('selBox').hidden = !on; if (!on) return
  const st = d.strokes[si], nodes = st.pts.length - 1, isNode = i >= 1
  $('selTitle').textContent = (si === 0 ? 'The trunk' : `Limb ${si}`) + (isNode ? `, node ${i} of ${nodes}` : '')
  $('nodeTools').hidden = !isNode
  if (isNode){ const r = sculpt.radius(si, i), el = $('nodeR'); el.value = toSlider(r ?? guessRadius(si, i, d)); fill(el)
    $('nodeAuto').textContent = r == null ? 'Auto' : `${Math.round(r*200)} cm`; $('nodeAuto').disabled = r == null
    $('nodeAuto').title = r == null ? 'The growth decides this thickness' : 'Back to the growth\'s own thickness' }
  // Delete takes the node - or, from a limb down to its last two nodes (or with no node picked), the whole limb
  const nodeGoes = isNode && st.pts.length > 2
  $('delSel').innerHTML = nodeGoes ? 'Delete node <kbd>Del</kbd>' : si > 0 ? 'Delete limb <kbd>Del</kbd>' : 'Delete node <kbd>Del</kbd>'
  $('delSel').disabled = !nodeGoes && si === 0; $('delLimb').hidden = !(si > 0 && nodeGoes); $('spinLimb').hidden = !(si > 0) }
const commitDesign = before => { pushHistory({ ...snap(), design: JSON.stringify(before) }); p.design = JSON.parse(JSON.stringify(sculpt.design)); saveDesign(); G.later(); showMode(); sync() }
sculpt = makeSculpt(G, { guessRadius,
  onEdit(d, before){ pushHistory({ ...snap(), design: JSON.stringify(before) }); p.design = JSON.parse(JSON.stringify(d)); saveDesign(); G.later(); sync(); showSel() },
  onPreview(d){ p.design = JSON.parse(JSON.stringify(d)); G.preview() },
  onSelect(){ showSel() },
})
function deleteSel(){ const si = sculpt.selected, i = sculpt.selNode, st = sculpt.design?.strokes[si]; if (!st) return
  const before = i >= 1 && st.pts.length > 2 ? sculpt.removeNode(si, i) : si > 0 ? sculpt.remove(si) : null
  if (before) commitDesign(before); showSel() }
// the Character sliders (trunk bends, lean, crookedness, windswept) shape the growth that fills a drawing: the editor borrows them
const charGroup = () => groups[groups.length - 1]
function openEditor(on){ if (on && !active) return
  editor.hidden = !on; shapeBtn.setAttribute('aria-expanded', on); document.body.classList.toggle('shaping', on)
  if (on){ openShape(false); openSheet(false); $('editChar').append(charGroup()); charGroup().hidden = false } else if (charGroup().parentElement !== panel){ panel.append(charGroup()); showTab(0) }
  sculpt.show(on && !!p.design, G.treeInfo().root); showMode() }
$('closeEditor').addEventListener('click', () => openEditor(false)); $('doneEditor').addEventListener('click', () => openEditor(false))
function useTree(id, { open = false } = {}){ const t = mine.find(x => x.id === id); if (!t) return
  active = id; setSpecies(t.species); p.design = JSON.parse(JSON.stringify(t.design)); p.designVary = t.vary ?? { amount: .35, seed: 0 }
  // (a tree saved as a lone base dot, from before new trees began with a trunk: it gets the trunk)
  if (p.design.strokes[0].pts.length < 2){ p.design.strokes[0] = blankDesign(p).strokes[0]; t.design = JSON.parse(JSON.stringify(p.design)) }
  sculpt.set(p.design); loadRef(); G.later(); renderMine(); showMode(); sync(); if (open) openEditor(true) }
function leaveTree(){ if (!active) return; active = null; p.design = null; sculpt.set(null); openEditor(false); loadRef(); G.later(); renderMine(); showMode(); sync() }
afterRestore = () => { if (!active){ openEditor(false); p.design = null } loadRef(); renderMine() }
function addTree(){ remember(); let n = mine.length + 1; while (mine.some(t => t.name === `My tree ${n}`)) n++
  const t = { id: 't' + Date.now().toString(36), name: `My tree ${n}`, species: p.species, design: blankDesign(p), vary: { amount: .35, seed: 0 } }   // a fresh start: a short trunk to add to
  mine.push(t); store(); useTree(t.id, { open: true }) }
$('addTree').addEventListener('click', addTree); $('sheetAdd').addEventListener('click', () => { openSheet(false); addTree() })
$('treeName').addEventListener('input', e => { const t = current(); if (t){ t.name = e.target.value; store(); renderMine(); $('nameText').textContent = t.name || 'My tree' } })
$('treeName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur() })
for (const n of names) $('treeBase').add(new Option(n, n))
$('treeBase').addEventListener('change', e => { remember(); const d = p.design, v = p.designVary; setSpecies(e.target.value); p.design = d; p.designVary = v; saveDesign(); G.later(); sync() })
$('deleteTree').addEventListener('click', () => { const t = current(); if (!t) return; remember(); mine = mine.filter(x => x !== t); store(); try { localStorage.removeItem(REF(t.id)) } catch {} leaveTree() })
showMode = () => { const t = current()
  $('shapeLabel').textContent = active ? 'Edit' : 'Shape'; shapeBtn.setAttribute('aria-controls', active ? 'editor' : 'shape')
  if (!t) return
  if (document.activeElement !== $('treeName')) $('treeName').value = t.name
  $('treeBase').value = p.species; $('drawHint').textContent = HINTS[tool]
  $('grove').setAttribute('aria-pressed', p.grove > 1)
  const v = p.designVary?.amount ?? .35; $('varyAmt').value = v; $('varyOut').textContent = `${Math.round(v*100)}%`; fill($('varyAmt'))
  $('refBox').hidden = tool !== 'ref'; $('refFace').disabled = $('refRemove').disabled = !sculpt.reference.on
  showSel() }
let tool = 'wood'
function setTool(t){ tool = t; sculpt.setTool(t === 'ref' ? 'none' : t); for (const [id, k] of [['toolWood', 'wood'], ['toolCanopy', 'canopy'], ['toolRef', 'ref']]) $(id).setAttribute('aria-checked', k === t); showMode() }
$('toolWood').addEventListener('click', () => setTool('wood')); $('toolCanopy').addEventListener('click', () => setTool('canopy')); $('toolRef').addEventListener('click', () => setTool('ref'))
$('delSel').addEventListener('click', deleteSel)
$('spinLimb').addEventListener('click', () => { const before = sculpt.spin(sculpt.selected); if (before) commitDesign(before); showSel() })
$('delLimb').addEventListener('click', () => { const before = sculpt.remove(sculpt.selected); if (before) commitDesign(before); showSel() })
// Clear: back to a base node (the canopy kept); Trace: a drawing of the tree in view - grown from the kind of tree, not from this drawing
const replaceDesign = d => { remember(); p.design = d; sculpt.set(d); sculpt.select(-1); saveDesign(); G.later(); showMode(); sync() }
$('clearDraw').addEventListener('click', () => { const b = blankDesign(p); if (p.design) b.canopy = JSON.parse(JSON.stringify(p.design.canopy)); replaceDesign(b) })
$('traceTree').addEventListener('click', async () => { const d = p.design; p.design = null; await G.rebuild(); const traced = designFromTree(G.treeInfo(), p); p.design = d; replaceDesign(traced) })
// the picked node's thickness: a light preview while dragging, the full tree on release; Auto gives it back to the growth
let nodeBefore = null
$('nodeR').addEventListener('pointerdown', () => { nodeBefore = JSON.parse(JSON.stringify(sculpt.design)) })
$('nodeR').addEventListener('input', e => { nodeBefore ??= JSON.parse(JSON.stringify(sculpt.design)); const r = fromSlider(+e.target.value)
  sculpt.setRadius(sculpt.selected, sculpt.selNode, r); fill(e.target); $('nodeAuto').textContent = `${Math.round(r*200)} cm`; $('nodeAuto').disabled = false
  p.design = JSON.parse(JSON.stringify(sculpt.design)); G.preview() })
$('nodeR').addEventListener('change', () => { if (nodeBefore) commitDesign(nodeBefore); nodeBefore = null })
$('nodeAuto').addEventListener('click', () => { const before = JSON.parse(JSON.stringify(sculpt.design)); sculpt.setRadius(sculpt.selected, sculpt.selNode, null); commitDesign(before) })
// thicker or thinner from the keyboard ([ and ]), as the wheel does: let go of the keys and the full tree grows
let keyBefore = null, keyT = 0
function nudgeRadius(k){ const si = sculpt.selected, i = sculpt.selNode; if (si < 0 || i < 1) return
  keyBefore ??= JSON.parse(JSON.stringify(sculpt.design)); const r = (sculpt.radius(si, i) ?? guessRadius(si, i, sculpt.design))*k
  sculpt.setRadius(si, i, Math.min(Math.max(r, R_LO), R_HI)); p.design = JSON.parse(JSON.stringify(sculpt.design)); G.preview(); showSel()
  clearTimeout(keyT); keyT = setTimeout(() => { commitDesign(keyBefore); keyBefore = null }, 450) }
// neighbours: the same drawing, a little different each time; the drawing itself is always one tap away
$('varyAmt').addEventListener('input', e => { p.designVary = { ...(p.designVary ?? { seed: 0 }), amount: +e.target.value }; $('varyOut').textContent = `${Math.round(e.target.value*100)}%`; fill(e.target); if (p.designVary.seed || p.grove > 1) G.preview() })
$('varyAmt').addEventListener('change', () => { saveDesign(); G.later() })
const neighbour = () => { remember(); p.designVary = { amount: Math.max(+$('varyAmt').value, .1), seed: 1 + Math.floor(Math.random()*99999) }; saveDesign(); G.later(); sync() }
$('neighbour').addEventListener('click', neighbour)
$('original').addEventListener('click', () => { if (!p.designVary?.seed) return; remember(); p.designVary = { ...p.designVary, seed: 0 }; saveDesign(); G.later(); sync() })
$('grove').addEventListener('click', () => { remember(); set('grove', p.grove > 1 ? 1 : 5); showMode() })
// ---- the reference picture: shrunk to at most 1024 pixels (so it can be kept with the tree), stood behind the tree ----
async function readImage(file){ const url = URL.createObjectURL(file); try { const img = new Image(); img.src = url; await img.decode()
  const k = Math.min(1, 1024/Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c } finally { URL.revokeObjectURL(url) } }
function saveRef(c, o){ const t = current(); if (!t) return; t.ref = o; store(); if (c) try { localStorage.setItem(REF(t.id), c.toDataURL('image/jpeg', .85)) } catch { /* too big to keep: shown this visit only */ } }
async function useImage(file){ if (!file?.type.startsWith('image/') || !active) return; const c = await readImage(file); const o = sculpt.reference.set(c); saveRef(c, o); setTool('ref') }
function loadRef(){ const t = current(); sculpt.reference.set(null); if (!t) return; let data = null; try { data = localStorage.getItem(REF(t.id)) } catch {}; if (!data) return
  const img = new Image(); img.onload = () => { if (current() === t){ sculpt.reference.set(img, t.ref ?? {}); showMode() } }; img.src = data }
$('refFile').addEventListener('change', e => { useImage(e.target.files[0]); e.target.value = '' })
$('refFace').addEventListener('click', () => { const t = current(); if (t){ t.ref = sculpt.reference.face(); store() } })
$('refRemove').addEventListener('click', () => { const t = current(); sculpt.reference.set(null); if (t){ delete t.ref; store(); try { localStorage.removeItem(REF(t.id)) } catch {} } showMode() })
for (const [id, k] of [['refOpacity', 'opacity'], ['refSize', 'size'], ['refRaise', 'raise']]) $(id).addEventListener('input', e => { fill(e.target); const o = sculpt.reference.update({ [k]: +e.target.value }); const t = current(); if (t && o){ t.ref = o; store() } })
addEventListener('dragover', e => { if (!editor.hidden) e.preventDefault() })
addEventListener('drop', e => { if (editor.hidden) return; e.preventDefault(); useImage([...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'))) })
// ---- the editor's keys: Delete removes what is picked, 1 2 3 the tools, [ and ] thickness, N a new neighbour (Escape and undo above) ----
addEventListener('keydown', e => { if (editor.hidden || typing() || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Delete' || e.key === 'Backspace'){ deleteSel(); e.preventDefault() }
  else if (e.key === '1') setTool('wood'); else if (e.key === '2') setTool('canopy'); else if (e.key === '3') setTool('ref')
  else if (e.key === '[') nudgeRadius(1/1.15); else if (e.key === ']') nudgeRadius(1.15)
  else if (e.key.toLowerCase() === 'n') neighbour() })
// the tree shown last time, if it was one of yours
try { const last = localStorage.getItem('ghibli-foliage-active'); if (last && mine.some(t => t.id === last)) useTree(last) } catch {}
addEventListener('pagehide', () => { try { if (active) localStorage.setItem('ghibli-foliage-active', active); else localStorage.removeItem('ghibli-foliage-active') } catch {} })
renderMine(); showMode()

// ---- a dial: drag round it (pointer angle from its centre, clockwise from the top) ----
function dial(el, onAngle, onTap, onEnd, hubR = .55){
  let drag = null
  const angle = e => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2)
    return { a: ((Math.atan2(dx, -dy)/TAU) + 1)%1, d: Math.hypot(dx, dy)/(r.width/2) } }
  el.addEventListener('pointerdown', e => { const q = angle(e); drag = { id: e.pointerId, hub: q.d < hubR, moved: false, x: e.clientX, y: e.clientY }
    try { el.setPointerCapture(e.pointerId) } catch {} if (!drag.hub) onAngle(q.a); el.classList.add('held'); e.preventDefault(); e.stopPropagation() })
  el.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
    if (!drag.hub || drag.moved) onAngle(angle(e).a) })
  const end = () => { if (drag?.hub && !drag.moved) onTap?.(); drag = null; el.classList.remove('held'); requestAnimationFrame(() => onEnd?.()) }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end)
}
const onRing = (a, r) => [Math.sin(a*TAU)*r, -Math.cos(a*TAU)*r]
// a dial drags smoothly: its mark follows the pointer at once (live), and the scene takes the newest value once per frame, however many
// pointer events arrive in between
const live = {}, pending = new Map(); let commitRaf = 0
const commit = (prop, v) => { live[prop] = v; pending.set(prop, v)
  commitRaf ||= requestAnimationFrame(() => { commitRaf = 0; for (const [k, x] of pending) set(k, x); pending.clear() }) }
const shown = prop => live[prop] ?? p[prop]
const wrap24 = h => ((h % 24) + 24) % 24, wrap1 = s => ((s % 1) + 1) % 1

// ---- the sun dial: a clock face of the whole day, always the same way round - noon at the top, morning on the left, evening on the
// right, midnight at the bottom - with a mark for every hour (longer at 6, 12, 18 and 24). The sky inside is the sky at that hour ----
const sunMark = $('sunMark'), sunDot = sunMark.firstElementChild, sky = $('sky'), hill = document.querySelector('#sundial .hill'), sundial = $('sundial'), ticks = $('sunTicks')
for (let hr = 0; hr < 24; hr++){ const major = hr % 6 === 0, a = (hr - 12)/24, [x0, y0] = onRing(a, major ? 33.5 : 35.5), [x1, y1] = onRing(a, 36.6)
  ticks.append(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: major ? 'tick major' : 'tick' })) }
const fmtTime = h => { const m = Math.round(wrap24(h)*60); return `${String(Math.floor(m/60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
// the sky's colour through the day: night, dawn, day, golden hour, dusk
const SKY = [[0, '#1a2448'], [5, '#26325e'], [6, '#f0a98a'], [7.5, '#9fd0e8'], [16.5, '#8cc8e6'], [18, '#f2b277'], [19.2, '#c8708a'], [20.2, '#2c3766'], [24, '#1a2448']]
const lerpHex = (a, b, t) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), c = s => Math.round(((x >> s) & 255)*(1 - t) + ((y >> s) & 255)*t); return `rgb(${c(16)},${c(8)},${c(0)})` }
const skyAt = h => { for (let i = 0; i < SKY.length - 1; i++) if (h <= SKY[i + 1][0]) return lerpHex(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0])/(SKY[i + 1][0] - SKY[i][0])); return SKY[0][1] }
const isNight = h => h < 5.7 || h > 19.6
dial(sundial, a => commit('time', wrap24(a*24 + 12)), null, () => { delete live.time }, 0)
// keys: arrows a quarter hour, Page Up and Down an hour, Home sunrise, End sunset
sundial.addEventListener('keydown', e => {
  const d = { ArrowRight: .25, ArrowUp: .25, ArrowLeft: -.25, ArrowDown: -.25, PageUp: 1, PageDown: -1 }[e.key], to = { Home: 6, End: 18 }[e.key]
  if (d !== undefined || to !== undefined){ set('time', to ?? wrap24(p.time + d)); e.preventDefault() } })
function drawSun(){
  const h = wrap24(shown('time')), [x, y] = onRing((h - 12)/24, 40)
  sunMark.setAttribute('transform', `translate(${x} ${y})`); sunDot.classList.toggle('moon', isNight(h))
  sky.setAttribute('fill', skyAt(h)); $('timeOut').textContent = fmtTime(h)
  sundial.setAttribute('aria-valuenow', h.toFixed(2)); sundial.setAttribute('aria-valuetext', fmtTime(h))
  // the controls are part of the evening too: after dusk the paper turns to a lantern's
  document.body.classList.toggle('night', isNight(h))
}

// ---- the season wheel: the year as one continuous ring of its colours - spring at the left, summer at the top, autumn at the right,
// winter at the bottom - with a mark for every month. The button in the middle plays the year ----
const QUARTER_COLS = ['#a8dc84', '#3f9a4c', '#e0893c', '#b9cbe3']       // spring, summer, autumn, winter (the middle of each)
const wheel = $('seasonWheel'), quarters = $('quarters'), seasonMark = $('seasonMark')
const toAngle = s => s - .25, fromAngle = a => wrap1(a + .25)            // season 0 (spring) sits at the left (angle .75)
const yearCol = s => { const k = wrap1(s)*4, i = Math.floor(k) % 4, t = k - Math.floor(k), e = t*t*(3 - 2*t); return lerpHex(QUARTER_COLS[i], QUARTER_COLS[(i + 1) % 4], e) }
for (let n = 0, N = 48; n < N; n++){ const s0 = n/N, s1 = (n + 1.06)/N, [x0, y0] = onRing(toAngle(s0), 46), [x1, y1] = onRing(toAngle(s1), 46), [x2, y2] = onRing(toAngle(s1), 30), [x3, y3] = onRing(toAngle(s0), 30)
  quarters.append(svgEl('path', { d: `M${x0} ${y0} A46 46 0 0 1 ${x1} ${y1} L${x2} ${y2} A30 30 0 0 0 ${x3} ${y3}Z`, fill: yearCol((n + .5)/N), class: 'quarter' })) }
// the months: season 0 is mid-April, so a month starts every twelfth of the year, half a month after it
for (let m = 0; m < 12; m++){ const a = toAngle((m + .5)/12), [x0, y0] = onRing(a, 30), [x1, y1] = onRing(a, 34)
  quarters.append(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'month-tick' })) }
// the time of year, continuously: the season (nearest quarter) and the part of the month (northern-hemisphere months)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const seasonOf = s => ['Spring', 'Summer', 'Autumn', 'Winter'][Math.round(wrap1(s)*4) % 4]
const monthParts = s => { const m = (wrap1(s)*12 + 3.5) % 12, i = Math.floor(m), f = m - i; return [f < .34 ? 'Early' : f < .67 ? 'Mid' : 'Late', MONTHS[i]] }
const monthOf = s => monthParts(s).join(' '), monthShort = s => { const [part, mo] = monthParts(s); return `${part} ${mo.slice(0, 3)}` }
if (!p.seasonOn) set('seasonOn', true)                                     // the demo always follows the year
// playing the year: the button in the middle runs the season on by itself (a year in YEAR seconds) until pressed again or the ring is grabbed
const YEAR = 48
let playing = false, playLast = 0
function play(on){
  playing = on; G.view.seasonPlay = on; wheel.classList.toggle('playing', on)
  $('playIcon').setAttribute('d', on ? 'M-3.4 -15 h2.4 v8 h-2.4Z M1 -15 h2.4 v8 h-2.4Z' : 'M-2.6 -15.2 L3.9 -11 L-2.6 -6.8Z')
  wheel.setAttribute('aria-label', on ? 'Season, playing the year. Press Space to pause' : 'Season. Press Space to play the year')
  if (on){ playLast = performance.now(); requestAnimationFrame(advance) } else ctl('season')._onChange?.(p.season)   // pausing brings the sky and hills up to date
}
function advance(now){ if (!playing) return
  const dt = Math.min(.1, (now - playLast)/1000); playLast = now
  set('season', (p.season + dt/YEAR) % 1); requestAnimationFrame(advance) }
// while the wheel is dragged the far hills keep their colour (re-baking their cards is the costly part); they catch up when it is let go
dial(wheel, a => { if (playing) play(false); G.view.seasonDrag = true; commit('season', fromAngle(a)) }, () => play(!playing), () => { delete live.season; if (G.view.seasonDrag){ G.view.seasonDrag = false; ctl('season')._onChange?.(p.season) } }, .62)
// keys: arrows about a week, Page Up and Down a month, Home and End the start of spring and of winter, Space or Enter play
wheel.addEventListener('keydown', e => {
  const d = { ArrowRight: 1/48, ArrowUp: 1/48, ArrowLeft: -1/48, ArrowDown: -1/48, PageUp: 1/12, PageDown: -1/12 }[e.key], to = { Home: 0, End: .75 }[e.key]
  if (d !== undefined || to !== undefined){ if (playing) play(false); set('season', to ?? wrap1(p.season + d)); e.preventDefault() }
  else if (e.key === ' ' || e.key === 'Enter'){ play(!playing); e.preventDefault() } })
function drawSeason(){
  const s = wrap1(shown('season')), [x, y] = onRing(toAngle(s), 38)
  seasonMark.setAttribute('transform', `translate(${x} ${y})`); seasonMark.firstElementChild.setAttribute('fill', yearCol(s))
  $('seasonOut').textContent = seasonOf(s); $('monthOut').textContent = monthShort(s)
  wheel.setAttribute('aria-valuenow', s.toFixed(3)); wheel.setAttribute('aria-valuetext', `${seasonOf(s)}, ${monthOf(s)}`)
  // the sun dial's little hill wears the season too
  hill.style.fill = s > .64 && s < .9 ? '#e9eef6' : s > .4 && s <= .64 ? '#c8a04a' : s < .12 || s > .9 ? '#7cbf55' : '#4f8f45'
}

// ---- keep everything in step with the scene (the full panel can change it too) ----
function sync(){
  $('nameText').textContent = active ? (current()?.name || 'My tree') : p.species
  list.querySelectorAll('.species').forEach(b => b.setAttribute('aria-current', !active && b.dataset.name === p.species))
  let n = 0
  for (const [el, prop, out, fmt, wrap, unit, label] of sliders){
    if (unit === 'metres'){ const c = ctl(prop); el.min = (c._min*p.height).toFixed(2); el.max = (c._max*p.height).toFixed(2) }
    if (el !== busy && p[prop] !== undefined) el.value = toShown(unit, prop)
    out.textContent = fmt(+el.value); fill(el)
    const ch = changed(prop); n += ch; wrap.classList.toggle('changed', ch); out.disabled = !ch
    out.title = ch ? `Back to this tree's own ${label.toLowerCase()}` : ''; out.setAttribute('aria-label', ch ? `${fmt(+el.value)}, changed. Reset ${label}` : fmt(+el.value))
  }
  for (const g of groups) g.tab.classList.toggle('changed', g.props.some(changed))
  $('shapeStatus').textContent = p.design ? `Drawn, ${p.design.strokes.length - 1} limb${p.design.strokes.length === 2 ? '' : 's'}` + (p.designVary?.seed ? ', a neighbour' : '') + (p.grove > 1 ? `, grove of ${p.grove}` : '') : `Seed ${p.seed}` + (n ? `, ${n} changed` : '')
  $('leaves').checked = p.showFoliage !== false
}
sync(); setInterval(sync, 250)
const dials = () => { drawSun(); drawSeason(); requestAnimationFrame(dials) }; dials()

// ---- corner buttons ----
const full = $('full')
if (!document.fullscreenEnabled) full.hidden = true
full.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}))
document.addEventListener('fullscreenchange', () => full.setAttribute('aria-pressed', !!document.fullscreenElement))
// recentre: back to the framing view of the tree (and out of walking, if walking)
$('recenter').addEventListener('click', () => { if (G.walk.on){ G.walk.stop(); showWalk(false) } G.frame() })

// ---- walking: the pad (tank controls: push up to walk, down to back off, sideways to turn; push all the way to run) ----
const walkbar = $('walkbar'), pad = $('pad'), knob = pad.querySelector('.knob'), touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
function showWalk(on){
  document.body.classList.toggle('walking', on); walkbar.hidden = !on; pad.hidden = !on || !touch; $('walk').setAttribute('aria-pressed', on)
  if (on){ openShape(false); openSheet(false); openEditor(false) }
}
$('walk').addEventListener('click', () => { G.walk.toggle(); showWalk(G.walk.on) })
$('stopWalk').addEventListener('click', () => { G.walk.stop(); showWalk(false) })
addEventListener('keydown', e => { if (e.code === 'KeyG') setTimeout(() => showWalk(G.walk.on)) })
let padId = null
const R = 52
function padMove(e){
  const r = pad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2), d = Math.hypot(dx, dy), k = d > R ? R/d : 1
  knob.style.transform = `translate(${dx*k}px, ${dy*k}px)`
  const x = dx*k/R, y = -dy*k/R, dead = v => Math.abs(v) < .14 ? 0 : (v - Math.sign(v)*.14)/.86
  G.walk.pad.f = dead(y); G.walk.pad.turn = dead(x)*.9; G.walk.pad.run = y > .93
}
function padEnd(){ padId = null; knob.style.transform = ''; Object.assign(G.walk.pad, { f: 0, turn: 0, run: false }) }
pad.addEventListener('pointerdown', e => { padId = e.pointerId; try { pad.setPointerCapture(e.pointerId) } catch {} padMove(e); e.preventDefault() })
pad.addEventListener('pointermove', e => { if (e.pointerId === padId) padMove(e) })
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd)

// ---- a first-time tip, gone after a few seconds or the first touch ----
const tip = $('tip'), hideTip = () => tip.classList.add('gone')
if (touch) tip.textContent = 'Drag to look around, pinch to zoom'
setTimeout(hideTip, 5000); addEventListener('pointerdown', hideTip, { once: true })
