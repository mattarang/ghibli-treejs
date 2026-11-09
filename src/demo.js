// The demo page: the scene full screen, with its settings as small things at its edges rather than a menu over it:
//   a tree chip (which kind - a sheet of every kind - a new tree of the kind, undo, and its shape), a sun dial (drag the sun round its
//   24-hour track), a season wheel (drag round the year; the button in the middle plays it), and round buttons to walk, go full screen
//   or recentre on the tree. Walking has a touch pad: tank controls. Every control goes through the full panel's own controller, so a change
//   here does exactly what the same change does there.
window.__DEMO = true
await import('./main.js')
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
const snap = () => ({ species: p.species, seed: p.seed, v: Object.fromEntries(PROPS.map(k => [k, p[k]])) })
let defaults = snap().v
const history = []
const undoBtn = $('undo')
function remember(){ history.push(snap()); if (history.length > 40) history.shift(); undoBtn.hidden = false }
function setSpecies(name){ if (p.species !== name) set('species', name); defaults = snap().v }
function restore(s){
  if (s.species !== p.species) setSpecies(s.species)
  if (s.seed !== p.seed) set('seed', s.seed)
  for (const k of PROPS) if (p[k] !== s.v[k]) set(k, s.v[k])
}
function undo(){ const s = history.pop(); if (s) restore(s); undoBtn.hidden = !history.length; sync() }
undoBtn.addEventListener('click', undo)
addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')){ undo(); e.preventDefault() } })
// changed from the species' own: Trunk height is compared in metres, as it is shown (a new Height keeps the trunk's metres)
const changed = k => k === 'trunkFrac' ? Math.abs(p.trunkFrac*p.height - defaults.trunkFrac*defaults.height) > .05 : Math.abs((p[k] ?? 0) - (defaults[k] ?? 0)) > 1e-6

// ---- the tree chip ----
const names = Object.keys(G.SPECIES).filter(n => !/test/i.test(n)).sort(), nameBtn = $('name'), sheet = $('speciesSheet'), list = $('speciesList')
// every kind on one sheet: the one growing now is marked; choosing one grows it and closes the sheet
for (const n of names){ const b = document.createElement('button'); Object.assign(b, { type: 'button', className: 'species', textContent: n }); b.dataset.name = n
  b.addEventListener('click', () => { if (n !== p.species){ remember(); setSpecies(n) } openSheet(false); nameBtn.focus() }); list.append(b) }
function openSheet(on){ sheet.hidden = !on; nameBtn.setAttribute('aria-expanded', on)
  if (on){ openShape(false); list.querySelector(`[data-name="${CSS.escape(p.species)}"]`)?.focus() } }
nameBtn.addEventListener('click', () => openSheet(sheet.hidden))
addEventListener('pointerdown', e => { if (!sheet.hidden && !sheet.contains(e.target) && !nameBtn.contains(e.target)) openSheet(false) })
const step = d => { const i = names.indexOf(p.species); remember(); setSpecies(names[(i + d + names.length)%names.length]) }
$('prev').addEventListener('click', () => step(-1)); $('next').addEventListener('click', () => step(1))
$('dice').addEventListener('click', () => { remember(); set('seed', 1 + Math.floor(Math.random()*9998)) })
const shape = $('shape'), shapeBtn = $('shapeBtn')
// the panel stays open while the scene is turned and zoomed (that is the point of it): Done, the Shape button again, or Escape close it
function openShape(on){ shape.hidden = !on; shapeBtn.setAttribute('aria-expanded', on); document.body.classList.toggle('shaping', on); if (on) openSheet(false) }
shapeBtn.addEventListener('click', () => openShape(shape.hidden))
$('closeShape').addEventListener('click', () => openShape(false)); $('done').addEventListener('click', () => openShape(false))
addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!sheet.hidden){ openSheet(false); nameBtn.focus() } else if (!shape.hidden){ openShape(false); shapeBtn.focus() } })
// the view moves out from under the panel: the picture's centre slides into the uncovered part of the screen (a side panel: across; a
// bottom panel: up, and a little wider, so the whole tree fits the smaller space), eased so the tree glides over rather than jumps
const view = { x: 0, y: 0, z: 1 }
function frameAround(){
  const W = innerWidth, H = innerHeight, open = !shape.hidden && !document.body.classList.contains('walking'), r = shape.getBoundingClientRect()
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
  $('nameText').textContent = p.species
  list.querySelectorAll('.species').forEach(b => b.setAttribute('aria-current', b.dataset.name === p.species))
  let n = 0
  for (const [el, prop, out, fmt, wrap, unit, label] of sliders){
    if (unit === 'metres'){ const c = ctl(prop); el.min = (c._min*p.height).toFixed(2); el.max = (c._max*p.height).toFixed(2) }
    if (el !== busy && p[prop] !== undefined) el.value = toShown(unit, prop)
    out.textContent = fmt(+el.value); fill(el)
    const ch = changed(prop); n += ch; wrap.classList.toggle('changed', ch); out.disabled = !ch
    out.title = ch ? `Back to this tree's own ${label.toLowerCase()}` : ''; out.setAttribute('aria-label', ch ? `${fmt(+el.value)}, changed. Reset ${label}` : fmt(+el.value))
  }
  for (const g of groups) g.tab.classList.toggle('changed', g.props.some(changed))
  $('shapeStatus').textContent = `Seed ${p.seed}` + (n ? `, ${n} changed` : '')
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
  if (on){ openShape(false); openSheet(false) }
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
