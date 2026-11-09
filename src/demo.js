// The demo page: the scene full screen, with its settings as small things at its edges rather than a menu over it:
//   a tree chip (which kind, the next or last kind, a new tree of the kind, its shape), a sun compass (drag the sun round its 24-hour ring),
//   a season wheel (drag round the four quarters; tap the middle to play the year), and round buttons to walk, go full screen
//   or recentre on the tree. Walking has a touch pad: tank controls. Every control goes through the full panel's own controller, so a change
//   here does exactly what the same change does there.
window.__DEMO = true
await import('./main.js')
const G = window.__foliage, p = G.p, $ = id => document.getElementById(id)
const ctl = prop => G.gui.controllersRecursive().find(c => c.property === prop)
const set = (prop, v) => ctl(prop)?.setValue(v)
const NS = 'http://www.w3.org/2000/svg', svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e }
const TAU = Math.PI*2

// ---- the tree chip ----
const names = Object.keys(G.SPECIES).filter(n => !/test/i.test(n)).sort(), species = $('species'), nameBtn = $('name')
for (const n of names) species.add(new Option(n, n))
// the native picker sits invisibly over the name, so a tap opens the phone's own list
$('tree').append(species); Object.assign(species.style, { position: 'absolute', left: nameBtn.offsetLeft + 'px', top: '4px', width: nameBtn.offsetWidth + 'px', height: '34px', opacity: 0, cursor: 'pointer' })
const placePicker = () => Object.assign(species.style, { left: nameBtn.offsetLeft + 'px', width: nameBtn.offsetWidth + 'px' })
species.addEventListener('change', () => set('species', species.value))
const step = d => { const i = names.indexOf(p.species); set('species', names[(i + d + names.length)%names.length]) }
$('prev').addEventListener('click', () => step(-1)); $('next').addEventListener('click', () => step(1))
$('dice').addEventListener('click', () => set('seed', 1 + Math.floor(Math.random()*9998)))
const shape = $('shape'), shapeBtn = $('shapeBtn')
shapeBtn.addEventListener('click', () => { shape.hidden = !shape.hidden; shapeBtn.setAttribute('aria-expanded', !shape.hidden) })
addEventListener('pointerdown', e => { if (!shape.hidden && !shape.contains(e.target) && !shapeBtn.contains(e.target)){ shape.hidden = true; shapeBtn.setAttribute('aria-expanded', false) } })
// the tree's settings, one schema for every species: each slider means the same thing on every tree (offsets from the species' own recipe,
// so a species at its defaults is exactly as designed). Each takes its range from the full panel's own control.
const pct = (lo, hi) => v => `${Math.round((v - lo)/(hi - lo)*100)}%`, deg = v => `${Math.round(v)}°`
const ONLY = {}
const SHAPE = [
  ['Trunk'],
  ['height', 'Height', v => `${(+v).toFixed(1)} m`],
  ['trunkFrac', 'Trunk height', v => `${(+v).toFixed(1)} m`, 'metres'],   // the bare part below the crown, in metres (stored as a share of Height)
  ['trunkRadius', 'Trunk thickness', v => `${Math.round(v*200)} cm`],
  ['stems', 'Stems', v => (+v).toFixed(1)],
  ['sinuous', 'Trunk bends', pct(0, 1.5)],
  ['lean', 'Lean', v => v < .01 ? 'None' : pct(0, .4)(v)],
  ['Branches'],
  ['children', 'Main limbs', v => `${Math.round(v)}`],
  ['childAngle', 'Branch angle', deg],
  ['lengthRatio', 'Branch length', v => `${Math.round(v*100)}%`],
  ['droop', 'Droop', pct(0, .3)],
  ['gnarl', 'Crookedness', pct(0, .5)],
  ['Crown'],
  ['crownWidth', 'Crown width', v => `${Math.round(v*100)}%`],
  ['windLean', 'Windswept', v => v < .02 ? 'None' : pct(0, .7)(v)],
  ['clumpRadius', 'Leaf clumps', v => `${(+v).toFixed(1)} m`],
]
const sliders = [], box = $('shapeSliders')
for (const [prop, label, fmt, unit] of SHAPE){
  if (!label){ const h = document.createElement('h2'); h.textContent = prop; box.append(h); continue }
  const c = ctl(prop); if (!c) continue
  const id = 's-' + prop, row = document.createElement('label'), input = document.createElement('input'), out = document.createElement('output')
  row.htmlFor = id; row.append(label, out); Object.assign(input, { id, type: 'range', min: c._min, max: c._max, step: c._step ?? .01 })
  if (unit === 'metres') input.step = .1                                // shown in metres, its range following the tree's height
  const wrap = document.createElement('div'); wrap.append(row, input); box.append(wrap); sliders.push([input, prop, out, fmt, wrap, unit])
}
let busy = null
// a slider in metres stands for a share of the tree's height: its value converts both ways
const toShown = (unit, prop) => unit === 'metres' ? p[prop]*p.height : p[prop], fromShown = (unit, v) => unit === 'metres' ? v/p.height : v
for (const [el, prop, out, fmt, , unit] of sliders){
  el.addEventListener('input', () => { busy = el; set(prop, fromShown(unit, +el.value)); out.textContent = fmt(+el.value) }); el.addEventListener('change', () => { busy = null }) }
$('leaves').addEventListener('change', e => set('showFoliage', e.target.checked))
$('reset').addEventListener('click', () => ctl('species')._onChange?.(p.species))     // the species' own change: its shape back (setValue skips an unchanged value)

// ---- a dial: drag round it (pointer angle from its centre, clockwise from the top) ----
function dial(el, onAngle, onTap, onEnd){
  let drag = null
  const angle = e => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2)
    return { a: ((Math.atan2(dx, -dy)/TAU) + 1)%1, d: Math.hypot(dx, dy)/(r.width/2) } }
  el.addEventListener('pointerdown', e => { const q = angle(e); drag = { id: e.pointerId, hub: q.d < .55, moved: false, x: e.clientX, y: e.clientY }
    try { el.setPointerCapture(e.pointerId) } catch {} if (!drag.hub) onAngle(q.a); e.preventDefault(); e.stopPropagation() })
  el.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
    if (!drag.hub || drag.moved) onAngle(angle(e).a) })
  const end = () => { if (drag?.hub && !drag.moved) onTap?.(); drag = null; requestAnimationFrame(() => onEnd?.()) }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end)
}
const onRing = (a, r) => [Math.sin(a*TAU)*r, -Math.cos(a*TAU)*r]
// a dial drags smoothly: its mark follows the pointer at once (live), and the scene takes the newest value once per frame, however many
// pointer events arrive in between
const live = {}, pending = new Map(); let commitRaf = 0
const commit = (prop, v) => { live[prop] = v; pending.set(prop, v)
  commitRaf ||= requestAnimationFrame(() => { commitRaf = 0; for (const [k, x] of pending) set(k, x); pending.clear() }) }
const shown = prop => live[prop] ?? p[prop]

// ---- the sun compass: noon at the top, midnight at the bottom; the little sky inside follows the hour and the hill the season ----
const sunMark = $('sunMark'), sunDot = sunMark.firstElementChild, sky = $('sky'), hill = document.querySelector('#sundial .hill'), sundial = $('sundial')
const fmtTime = h => { const m = Math.round((((h % 24) + 24) % 24)*60); return `${String(Math.floor(m/60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
// the sky's colour through the day: night, dawn, day, golden hour, dusk
const SKY = [[0, '#1a2448'], [5, '#26325e'], [6, '#f0a98a'], [7.5, '#9fd0e8'], [16.5, '#8cc8e6'], [18, '#f2b277'], [19.2, '#c8708a'], [20.2, '#2c3766'], [24, '#1a2448']]
const lerpHex = (a, b, t) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), c = s => Math.round(((x >> s) & 255)*(1 - t) + ((y >> s) & 255)*t); return `rgb(${c(16)},${c(8)},${c(0)})` }
const skyAt = h => { for (let i = 0; i < SKY.length - 1; i++) if (h <= SKY[i + 1][0]) return lerpHex(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0])/(SKY[i + 1][0] - SKY[i][0])); return SKY[0][1] }
// the compass is held the way the camera faces: the sun crosses the sky left to right or right to left depending on where you stand, and the
// dial's sun rides the same side as the real one (its daily path, at noon, against the camera's right)
let mirror = false
function facing(){ const az = p.sunAzimuth*Math.PI/180, c = G.camera.matrixWorld.elements
  mirror = -Math.sin(az)*c[0] + Math.cos(az)*c[2] < 0 }                  // the sun's travel (increasing azimuth) against the camera's right
dial(sundial, a => { const u = mirror ? (1 - a) % 1 : a; commit('time', (u*24 + 12) % 24) }, null, () => { delete live.time })
sundial.addEventListener('keydown', e => { const d = { ArrowRight: .25, ArrowUp: .25, ArrowLeft: -.25, ArrowDown: -.25 }[e.key]; if (d){ set('time', ((p.time + d) % 24 + 24) % 24); e.preventDefault() } })
function drawSun(){
  facing(); const h = ((shown('time') % 24) + 24) % 24, [x, y] = onRing((mirror ? 12 - h : h - 12)/24, 40)
  sunMark.setAttribute('transform', `translate(${x} ${y})`); sunDot.classList.toggle('moon', h < 5.6 || h > 19.4)
  sky.setAttribute('fill', skyAt(h)); $('timeOut').textContent = fmtTime(h); sundial.setAttribute('aria-valuenow', h.toFixed(2)); sundial.setAttribute('aria-valuetext', fmtTime(h))
}

// ---- the season wheel: spring at the left, summer at the top, autumn at the right, winter at the bottom ----
const QUARTERS = [['Spring', '#a8dc84', '✿'], ['Summer', '#3f9a4c', '☀'], ['Autumn', '#e0893c', '❦'], ['Winter', '#e3ecf7', '❄']]
const wheel = $('seasonWheel'), quarters = $('quarters'), seasonMark = $('seasonMark')
const toAngle = s => s - .25, fromAngle = a => ((a + .25) % 1 + 1) % 1         // season 0 (spring) sits at the left (angle .75)
QUARTERS.forEach(([name, col, glyph], i) => {
  const a0 = toAngle(i*.25 - .125), a1 = a0 + .25, [x0, y0] = onRing(a0, 46), [x1, y1] = onRing(a1, 46), [x2, y2] = onRing(a1, 28), [x3, y3] = onRing(a0, 28)
  quarters.append(svgEl('path', { d: `M${x0} ${y0} A46 46 0 0 1 ${x1} ${y1} L${x2} ${y2} A28 28 0 0 0 ${x3} ${y3}Z`, fill: col, class: 'quarter' }))
  const [gx, gy] = onRing(toAngle(i*.25), 37), t = svgEl('text', { x: gx, y: gy + 3.2, 'text-anchor': 'middle', 'font-size': 9, fill: i === 3 ? '#5a6f8f' : '#fff', 'pointer-events': 'none' }); t.textContent = glyph
  quarters.append(t)
})
// the time of year, continuously: the season (nearest quarter) and the part of the month, spring at mid-April (northern-hemisphere months)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const seasonOf = s => ['Spring', 'Summer', 'Autumn', 'Winter'][Math.round((((s % 1) + 1) % 1)*4) % 4]
const monthOf = s => { const m = ((((s % 1) + 1) % 1)*12 + 3.5) % 12, i = Math.floor(m), f = m - i; return `${f < .34 ? 'Early' : f < .67 ? 'Mid' : 'Late'} ${MONTHS[i]}` }
if (!p.seasonOn) set('seasonOn', true)                                     // the demo always follows the year
// playing the year: tap the middle and the season runs on by itself (a year in YEAR seconds) until tapped again or the ring is grabbed
const YEAR = 48
let playing = false, playLast = 0
function play(on){
  playing = on; G.view.seasonPlay = on; wheel.classList.toggle('playing', on)
  $('playGlyph').textContent = on ? '❚❚' : '▶'; wheel.setAttribute('aria-label', on ? 'Season (playing; press Space to pause)' : 'Season (press Space to play)')
  if (on){ playLast = performance.now(); requestAnimationFrame(advance) } else ctl('season')._onChange?.(p.season)   // pausing brings the sky and hills up to date
}
function advance(now){ if (!playing) return
  const dt = Math.min(.1, (now - playLast)/1000); playLast = now
  set('season', (p.season + dt/YEAR) % 1); requestAnimationFrame(advance) }
// while the wheel is dragged the far hills keep their colour (re-baking their cards is the costly part); they catch up when it is let go
dial(wheel, a => { if (playing) play(false); G.view.seasonDrag = true; commit('season', fromAngle(a)) }, () => play(!playing), () => { delete live.season; if (G.view.seasonDrag){ G.view.seasonDrag = false; ctl('season')._onChange?.(p.season) } })
wheel.addEventListener('keydown', e => { const d = { ArrowRight: .01, ArrowUp: .01, ArrowLeft: -.01, ArrowDown: -.01 }[e.key]
  if (d){ if (playing) play(false); set('season', ((p.season + d) % 1 + 1) % 1); e.preventDefault() }
  else if (e.key === ' ' || e.key === 'Enter'){ play(!playing); e.preventDefault() } })
function drawSeason(){
  const s = ((shown('season') % 1) + 1) % 1, [x, y] = onRing(toAngle(s), 37)
  seasonMark.setAttribute('transform', `translate(${x} ${y})`)
  $('seasonOut').textContent = seasonOf(s); $('monthOut').textContent = monthOf(s)
  wheel.setAttribute('aria-valuenow', s.toFixed(3)); wheel.setAttribute('aria-valuetext', `${seasonOf(s)}, ${monthOf(s)}`)
  // the compass's little hill wears the season too
  hill.style.fill = s > .64 && s < .9 ? '#e9eef6' : s > .4 && s <= .64 ? '#c8a04a' : s < .12 || s > .9 ? '#7cbf55' : '#4f8f45'
}

// ---- keep everything in step with the scene (the full panel can change it too) ----
function sync(){
  species.value = p.species; nameBtn.textContent = p.species; placePicker()
  for (const [el, prop, out, fmt, wrap, unit] of sliders){ wrap.hidden = !!ONLY[prop] && !ONLY[prop].includes(p.species)
    if (unit === 'metres'){ const c = ctl(prop); el.min = (c._min*p.height).toFixed(2); el.max = (c._max*p.height).toFixed(2) }
    if (el !== busy && p[prop] !== undefined) el.value = toShown(unit, prop); out.textContent = fmt(+el.value) }
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
  if (on) shape.hidden = true
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
if (touch) tip.textContent = 'Drag to look around · pinch to zoom'
setTimeout(hideTip, 5000); addEventListener('pointerdown', hideTip, { once: true })
