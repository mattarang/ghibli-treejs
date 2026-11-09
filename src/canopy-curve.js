// The canopy's outline, edited flat: half a silhouette, a radius at each height, which spins round the trunk's axis into the canopy's volume.
// A profile is a list of points [t, r] by height: t the share of the way from the canopy's bottom to its top (the first point at 0, the last at 1), r its
// radius in metres. The spline through them is sampled into canopy.rings, which is all the growth reads.
const NS = 'http://www.w3.org/2000/svg', SAMPLES = 33, PAD = 14, MOST = 14, GAP = .04, COARSE = matchMedia('(pointer: coarse)').matches
const HIT = COARSE ? 30 : 16, LINE_HIT = COARSE ? 22 : 10, DOT = COARSE ? 9 : 6
const clamp = (v, a, b) => Math.min(Math.max(v, a), b), copy = P => P.map(q => q.slice())

export const profileOf = cv => cv.profile ?? cv.rings.map((r, k, a) => [k/(a.length - 1), r])
// the radius at height share t: a Catmull-Rom spline through unevenly spaced points, so moving one point up or down keeps the curve smooth
export function profileAt(P, t){ let i = 0; while (i < P.length - 2 && t > P[i + 1][0]) i++
  const n = P.length - 1, slope = k => k <= 0 ? (P[1][1] - P[0][1])/(P[1][0] - P[0][0]) : k >= n ? (P[n][1] - P[n - 1][1])/(P[n][0] - P[n - 1][0]) : (P[k + 1][1] - P[k - 1][1])/(P[k + 1][0] - P[k - 1][0])
  const h = P[i + 1][0] - P[i][0], u = clamp((t - P[i][0])/h, 0, 1), u2 = u*u, u3 = u2*u, m0 = slope(i)*h, m1 = slope(i + 1)*h
  return Math.max(0, (2*u3 - 3*u2 + 1)*P[i][1] + (u3 - 2*u2 + u)*m0 + (-2*u3 + 3*u2)*P[i + 1][1] + (u3 - u2)*m1) }
export const profileRings = P => Array.from({ length: SAMPLES }, (_, k) => profileAt(P, k/(SAMPLES - 1)))

// read() the canopy; begin() before a change, change(profile) as it goes, end(changed) when it is over; onPick(radius or null) as a point is picked or moved
export function makeCurve(svg, { read, begin, change, end, onPick }){
  const el = (tag, cls) => { const e = document.createElementNS(NS, tag); e.setAttribute('class', cls); svg.append(e); return e }
  const body = el('path', 'curve-body'), axis = el('line', 'curve-axis'), mirror = el('path', 'curve-mirror'), line = el('path', 'curve-line'), dots = document.createElementNS(NS, 'g'); svg.append(dots)
  let P = [], picked = -1, drag = null, f = null
  // the same scale both ways, so the outline is the canopy's true shape; held still while a point is dragged, so the point stays under the finger
  function fit(){ const cv = read(), W = svg.clientWidth || 280, H = svg.clientHeight || 200, h = Math.max(cv.y1 - cv.y0, .5), reach = Math.max(...P.map(q => q[1]), h*.2)*1.3, s = Math.min((W - 2*PAD)/(2*reach), (H - 2*PAD)/h)
    f = { W, H, s, h, ax: W/2, foot: H/2 + h*s/2 } }
  const X = r => f.ax + r*f.s, Y = t => f.foot - t*f.h*f.s
  function draw(){ const N = 64, right = [], left = []
    for (let k = 0; k <= N; k++){ const t = k/N, r = profileAt(P, t); right.push(`${X(r).toFixed(1)} ${Y(t).toFixed(1)}`); left.push(`${X(-r).toFixed(1)} ${Y(t).toFixed(1)}`) }
    body.setAttribute('d', `M${right.join('L')}L${left.reverse().join('L')}Z`); line.setAttribute('d', `M${right.join('L')}`); mirror.setAttribute('d', `M${left.join('L')}`)
    axis.setAttribute('x1', f.ax); axis.setAttribute('x2', f.ax); axis.setAttribute('y1', 4); axis.setAttribute('y2', f.H - 4)
    dots.replaceChildren(...P.map((q, i) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', i === picked ? 'curve-dot picked' : 'curve-dot'); c.setAttribute('cx', X(q[1])); c.setAttribute('cy', Y(q[0])); c.setAttribute('r', DOT); return c })) }
  const say = () => onPick?.(picked >= 0 ? P[picked][1] : null, picked > 0 && picked < P.length - 1)
  const out = () => copy(P)
  // the pointer in the frame, folded onto the right-hand side: either half of the outline can be taken hold of
  const at = e => { const b = svg.getBoundingClientRect(), x = e.clientX - b.left; return { x: f.ax + Math.abs(x - f.ax), y: e.clientY - b.top } }
  function place(i, { x, y }){ const r = clamp((x - f.ax)/f.s, 0, (f.W/2 - 6)/f.s), t = i > 0 && i < P.length - 1 ? clamp((f.foot - y)/(f.h*f.s), P[i - 1][0] + GAP, P[i + 1][0] - GAP) : P[i][0]; P[i] = [t, r] }
  svg.addEventListener('pointerdown', e => { if (e.button > 0 || !e.isPrimary || !P.length) return; const q = at(e); let best = -1, d = HIT
    P.forEach((p, i) => { const n = Math.hypot(X(p[1]) - q.x, Y(p[0]) - q.y); if (n < d){ d = n; best = i } })
    let added = false
    if (best < 0 && P.length < MOST){ let bt = -1, bd = LINE_HIT; for (let k = 1; k < 96; k++){ const t = k/96, n = Math.hypot(X(profileAt(P, t)) - q.x, Y(t) - q.y); if (n < bd){ bd = n; bt = t } }
      const room = bt > 0 && P.every(p => Math.abs(p[0] - bt) >= GAP)
      if (room){ begin(); best = P.findIndex(p => p[0] > bt); P.splice(best, 0, [bt, profileAt(P, bt)]); added = true } }
    picked = best; say(); draw(); if (best < 0) return
    if (!added) begin()
    drag = { i: best, id: e.pointerId, x: e.clientX, y: e.clientY, moved: added }; try { svg.setPointerCapture(e.pointerId) } catch {} e.preventDefault() })
  svg.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
    drag.moved = true; place(drag.i, at(e)); draw(); say(); change(out()) })
  const finish = e => { if (!drag || e.pointerId !== drag.id) return; const moved = drag.moved; drag = null; if (moved) change(out()); end(moved); fit(); draw() }
  svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish)
  const nudge = fn => { begin(); fn(); change(out()); end(true); fit(); draw(); say() }
  function removePicked(){ if (picked <= 0 || picked >= P.length - 1) return false; nudge(() => { P.splice(picked, 1); picked = -1 }); return true }
  // from the keyboard: Page Up and Down pick a point, the arrows move it
  svg.addEventListener('keydown', e => { const pick = { PageUp: 1, PageDown: -1 }[e.key]; if (pick){ picked = clamp(picked + pick, 0, P.length - 1); say(); draw(); e.preventDefault(); return }
    const d = { ArrowRight: [0, .1], ArrowLeft: [0, -.1], ArrowUp: [.02, 0], ArrowDown: [-.02, 0] }[e.key]; if (!d) return; e.preventDefault(); if (picked < 0){ picked = 0; say(); draw(); return }
    const i = picked; nudge(() => { const t = i > 0 && i < P.length - 1 ? clamp(P[i][0] + d[0], P[i - 1][0] + GAP, P[i + 1][0] - GAP) : P[i][0]; P[i] = [t, Math.max(0, P[i][1] + d[1])] }) })
  return { removePicked, refresh(){ if (drag || !read()) return; P = copy(profileOf(read())); if (picked >= P.length) picked = -1; fit(); draw(); say() } }
}
