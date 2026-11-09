// The demo page: the scene full screen, with its settings as small things at its edges rather than a menu over it:
//   a tree chip (which kind, the next or last kind, a new tree of the kind, its shape), a sun compass (drag the sun round its 24-hour ring),
//   a season wheel (drag round the four quarters; tap the middle for the species' own colours), and round buttons to walk, go full screen
//   or open every setting. Walking has a touch pad: tank controls. Every control goes through the full panel's own controller, so a change
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
  ['trunkRadius', 'Trunk thickness', v => `${Math.round(v*200)} cm`],
  ['trunkFrac', 'Trunk height', v => `${Math.round(v*100)}%`],   // the bare part below the crown: what people call the trunk
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
for (const [prop, label, fmt] of SHAPE){
  if (!label){ const h = document.createElement('h2'); h.textContent = prop; box.append(h); continue }
  const c = ctl(prop); if (!c) continue
  const id = 's-' + prop, row = document.createElement('label'), input = document.createElement('input'), out = document.createElement('output')
  row.htmlFor = id; row.append(label, out); Object.assign(input, { id, type: 'range', min: c._min, max: c._max, step: c._step ?? .01 })
  const wrap = document.createElement('div'); wrap.append(row, input); box.append(wrap); sliders.push([input, prop, out, fmt, wrap])
}
let busy = null
for (const [el, prop, out, fmt] of sliders){
  el.addEventListener('input', () => { busy = el; set(prop, +el.value); out.textContent = fmt(+el.value) }); el.addEventListener('change', () => { busy = null }) }
$('leaves').addEventListener('change', e => set('showFoliage', e.target.checked))
$('reset').addEventListener('click', () => ctl('species')._onChange?.(p.species))     // the species' own change: its shape back (setValue skips an unchanged value)

// ---- a dial: drag round it (pointer angle from its centre, clockwise from the top) ----
function dial(el, onAngle, onTap){
  let drag = null
  const angle = e => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2)
    return { a: ((Math.atan2(dx, -dy)/TAU) + 1)%1, d: Math.hypot(dx, dy)/(r.width/2) } }
  el.addEventListener('pointerdown', e => { const q = angle(e); drag = { id: e.pointerId, hub: q.d < .55, moved: false, x: e.clientX, y: e.clientY }
    try { el.setPointerCapture(e.pointerId) } catch {} if (!drag.hub) onAngle(q.a); e.preventDefault(); e.stopPropagation() })
  el.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
    if (!drag.hub || drag.moved) onAngle(angle(e).a) })
  const end = () => { if (drag?.hub && !drag.moved) onTap?.(); drag = null }
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { drag = null })
}
const onRing = (a, r) => [Math.sin(a*TAU)*r, -Math.cos(a*TAU)*r]

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
dial(sundial, a => { const u = mirror ? (1 - a) % 1 : a; set('time', Math.round(((u*24 + 12) % 24)*20)/20) })
sundial.addEventListener('keydown', e => { const d = { ArrowRight: .25, ArrowUp: .25, ArrowLeft: -.25, ArrowDown: -.25 }[e.key]; if (d){ set('time', ((p.time + d) % 24 + 24) % 24); e.preventDefault() } })
function drawSun(){
  facing(); const h = ((p.time % 24) + 24) % 24, [x, y] = onRing((mirror ? 12 - h : h - 12)/24, 40)
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
const seasonName = s => { const t = ((s % 1) + 1) % 1; return t < .04 || t > .96 ? 'Early spring' : t < .16 ? 'Spring' : t < .36 ? 'Summer' : t < .47 ? 'Early autumn' : t < .6 ? 'Autumn' : t < .68 ? 'Late autumn' : t < .88 ? 'Winter' : 'Late winter' }
dial(wheel, a => { if (!p.seasonOn) set('seasonOn', true); set('season', Math.round(fromAngle(a)*200)/200) }, () => set('seasonOn', !p.seasonOn))
wheel.addEventListener('keydown', e => { const d = { ArrowRight: .02, ArrowUp: .02, ArrowLeft: -.02, ArrowDown: -.02 }[e.key]
  if (d){ if (!p.seasonOn) set('seasonOn', true); set('season', ((p.season + d) % 1 + 1) % 1); e.preventDefault() } else if (e.key === 'Enter' || e.key === ' ') set('seasonOn', !p.seasonOn) })
function drawSeason(){
  const [x, y] = onRing(toAngle(p.season), 37)
  seasonMark.setAttribute('transform', `translate(${x} ${y})`); wheel.classList.toggle('off', !p.seasonOn)
  const label = p.seasonOn ? seasonName(p.season) : 'As painted'; $('seasonOut').textContent = label.length > 11 ? label.split(' ')[1] : label
  wheel.setAttribute('aria-valuenow', p.season.toFixed(3)); wheel.setAttribute('aria-valuetext', label)
  // the compass's little hill wears the season too
  const s = ((p.season % 1) + 1) % 1
  hill.style.fill = !p.seasonOn ? '#4f8f45' : s > .64 && s < .9 ? '#e9eef6' : s > .4 && s <= .64 ? '#c8a04a' : s < .12 || s > .9 ? '#7cbf55' : '#4f8f45'
}

// ---- keep everything in step with the scene (the full panel can change it too) ----
function sync(){
  species.value = p.species; nameBtn.textContent = p.species; placePicker()
  for (const [el, prop, out, fmt, wrap] of sliders){ wrap.hidden = !!ONLY[prop] && !ONLY[prop].includes(p.species); if (el !== busy && p[prop] !== undefined) el.value = p[prop]; out.textContent = fmt(+el.value) }
  $('leaves').checked = p.showFoliage !== false
  drawSun(); drawSeason()
}
sync(); setInterval(sync, 250)

// ---- corner buttons ----
const full = $('full'), adv = $('adv')
if (!document.fullscreenEnabled) full.hidden = true
full.addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {}))
document.addEventListener('fullscreenchange', () => full.setAttribute('aria-pressed', !!document.fullscreenElement))
adv.addEventListener('click', () => { const on = adv.getAttribute('aria-pressed') !== 'true'; on ? G.gui.show() : G.gui.hide(); adv.setAttribute('aria-pressed', on) })

// ---- walking: the pad (tank controls: push up to walk, down to back off, sideways to turn; push all the way to run) ----
const walkbar = $('walkbar'), pad = $('pad'), knob = pad.querySelector('.knob'), touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
function showWalk(on){
  document.body.classList.toggle('walking', on); walkbar.hidden = !on; pad.hidden = !on || !touch; $('walk').setAttribute('aria-pressed', on)
  if (on){ shape.hidden = true; if (adv.getAttribute('aria-pressed') === 'true') adv.click() }
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
