// The drawing editor: the tree's own frame - trunk and main limbs - and the canopy its growth fills, drawn and shaped by hand in the scene.
// A drawing (p.design, read by generator.js) holds strokes and a canopy in metres from the tree's root; the growth fills the canopy from buds
// all along the drawn wood. Here it is shown over the scene - the wood as tubes with a handle at every node, the canopy as a soft shell with
// handles for its size at each height and its bulge round about - and edited with a mouse or a finger:
//   wood:    drag out of any drawn wood to draw a new limb from there; drag a node to move it; tap a node to pick its limb (to delete it)
//   canopy:  drag a ring's handle to widen or narrow the canopy at that height, a bulge handle to push it out or pull it in that way,
//            the top and bottom handles to raise or lower them
// Anywhere else the camera turns as usual. Every edit regrows the tree: a light preview while dragging, the full tree on release.
import * as THREE from 'three'
import { canopyRadius, canopyLobe } from './generator.js'

const RINGS = 7, LOBES = 8
const clone = d => JSON.parse(JSON.stringify(d))

// A first drawing, from the tree as it stands: its canopy traced round its leaf clumps, a trunk up into it and a limb into each quarter
export function designFromTree(info, p){
  const [rx, ry, rz] = info.root, cs = info.clumps.length ? info.clumps : [{ c: [rx, ry + p.height*p.size*.6, rz], r: p.height*p.size*.3, squash: 1 }]
  const lo = Math.min(...cs.map(c => c.c[1] - c.r*(c.squash ?? 1))) - ry, hi = Math.max(...cs.map(c => c.c[1] + c.r*(c.squash ?? 1))) - ry
  const y0 = Math.max(lo, .6), y1 = Math.max(hi, y0 + 2)
  // the canopy's radius at each height: the farthest clump edge there, a little generous so the growth has room to reach it
  const rings = Array.from({ length: RINGS }, (_, k) => { const y = ry + y0 + (y1 - y0)*k/(RINGS - 1), band = (y1 - y0)/(RINGS - 1)*1.2
    let m = 0; for (const c of cs){ const dy = Math.abs(c.c[1] - y); if (dy < band + c.r) m = Math.max(m, Math.hypot(c.c[0] - rx, c.c[2] - rz) + c.r*Math.sqrt(Math.max(0, 1 - (dy/(band + c.r))**2))) }
    return m*1.08 })
  rings[0] = Math.min(rings[0], rings[1]*.35); rings[RINGS - 1] = Math.min(rings[RINGS - 1], rings[RINGS - 2]*.3)
  for (let k = 1; k < RINGS - 1; k++) rings[k] = Math.max(rings[k], (y1 - y0)*.08)
  // its bulge each way: how far the clumps reach in each eighth, against all round
  const reach = Array(LOBES).fill(0); for (const c of cs){ const a = Math.atan2(c.c[2] - rz, c.c[0] - rx), k = Math.round(((a/(Math.PI*2))%1 + 1)%1*LOBES)%LOBES; reach[k] = Math.max(reach[k], Math.hypot(c.c[0] - rx, c.c[2] - rz) + c.r) }
  const mean = reach.reduce((t, v) => t + v, 0)/LOBES || 1, lobes = reach.map(v => Math.min(1.25, Math.max(.8, v ? v/mean : 1)))
  // the trunk up to a third of the way into the canopy, and four main limbs out from it, rising into the crown
  const top = y0 + (y1 - y0)*.32, strokes = [{ pts: [[0, 0, 0], [0, top*.5, 0], [0, top, 0]] }]
  const spin = (p.seed % 97)/97*Math.PI*2
  for (let k = 0; k < 4; k++){ const a = spin + k*Math.PI/2 + (k % 2 ? .25 : -.15), base = lerp(y0*.92, top*.95, k/3), up = (y1 - y0)*lerp(.38, .22, k/3)
    const out = canopyRadius({ rings }, (base + up - y0)/(y1 - y0))*lobeAt(lobes, a)*.62
    strokes.push({ from: { s: 0, i: 1 }, pts: [[0, base, 0], [Math.cos(a)*out*.45, base + up*.55, Math.sin(a)*out*.45], [Math.cos(a)*out, base + up, Math.sin(a)*out]] }) }
  return { strokes, canopy: { y0, y1, cx: 0, cz: 0, rings, lobes } }
}
// A blank drawing: only a node at the base, and a canopy sized for the kind of tree to grow into. Nothing grows until the trunk is drawn
export function blankDesign(p){
  const H = p.height*p.size, y0 = H*.32, rings = [.06, .36, .44, .43, .36, .24, .05].map(k => k*H*Math.max(.6, Math.min(1.4, (p.crownWidth ?? .6)/.6)))
  return { strokes: [{ pts: [[0, 0, 0]] }], canopy: { y0, y1: H, cx: 0, cz: 0, rings, lobes: [1, 1, 1, 1, 1, 1, 1, 1] } }
}
const lerp = (a, b, t) => a + (b - a)*t
const lobeAt = (lobes, th) => canopyLobe({ lobes }, th)

export function makeSculpt(G, { onEdit, onPreview, onSelect, guessRadius }){
  const { scene, camera, renderer, controls } = G, canvas = renderer.domElement
  const group = new THREE.Group(); group.name = 'sculpt'; group.visible = false; group.renderOrder = 50; scene.add(group)
  let design = null, tool = 'wood', root = [0, 0, 0], selected = -1, selNode = -1, on = false
  const W = p => new THREE.Vector3(root[0] + p[0], root[1] + p[1], root[2] + p[2])
  // what the overlay is drawn with: always on top of the tree (it is the frame inside the leaves), and in the editor's own colours
  const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
  const M = { wood: mat(0x3d6b38, .9), woodDim: mat(0x3d6b38, .35), woodSel: mat(0xe0893c, .95), halo: mat(0xe0893c, .28), haloRim: mat(0xe0893c, .95), pick: new THREE.MeshBasicMaterial({ visible: false }), node: mat(0xffffff), nodeRim: mat(0x23271f),
    ghost: mat(0xffffff, .5),
    shell: new THREE.MeshBasicMaterial({ color: 0xf1f2ec, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }),
    ringLine: new THREE.LineBasicMaterial({ color: 0xf1f2ec, transparent: true, opacity: .55, depthTest: false }), handle: mat(0xf1f2ec), handleRim: mat(0x3d6b38) }
  const wood = new THREE.Group(), shell = new THREE.Group(), handles = new THREE.Group(); group.add(shell, wood, handles)
  // (the bud is added below, once made)
  const size = () => Math.max(design?.canopy.y1 ?? 10, 4)                // the tree's height: handles and tubes are sized to it, so they read at any scale
  const sphere = new THREE.SphereGeometry(1, 16, 12)
  const COARSE = matchMedia('(pointer: coarse)').matches
  // the bud: a + that rides along the wood under the pointer - drag it out to grow a branch from exactly there. Drawn a fixed size on screen
  const bud = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')
    x.fillStyle = '#f1f2ec'; x.strokeStyle = '#3d6b38'; x.lineWidth = 9; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI*2); x.fill(); x.stroke()
    x.lineCap = 'round'; x.lineWidth = 13; x.beginPath(); x.moveTo(64, 36); x.lineTo(64, 92); x.moveTo(36, 64); x.lineTo(92, 64); x.stroke()
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }))
    sp.renderOrder = 63; sp.visible = false; return sp })()
  const showBud = at => { if (!at){ bud.visible = false; return } const px = COARSE ? 34 : 24, h = canvas.clientHeight || innerHeight
    bud.scale.setScalar(px/h*2*Math.tan(camera.fov*Math.PI/360)); bud.position.copy(at); bud.visible = true }
  function handle(at, kind, data, color = M.node, k = 1){
    const s = size()*.016*k, h = new THREE.Mesh(sphere, color), rim = new THREE.Mesh(sphere, M.nodeRim)
    h.scale.setScalar(s); rim.scale.setScalar(s*1.35); h.position.copy(at); rim.position.copy(at); h.renderOrder = 61; rim.renderOrder = 60
    // a generous invisible target round it: a fingertip needs more than the visible dot
    const hit = new THREE.Mesh(sphere, M.pick); hit.scale.setScalar(s*(COARSE ? 3.2 : 1.9)/Math.max(k, .8)); hit.position.copy(at); hit.userData = { kind, ...data }
    handles.add(rim, h, hit); return hit }
  function clearGroup(g){ for (const o of [...g.children]){ g.remove(o); if (o.geometry && o.geometry !== sphere) o.geometry.dispose() } }

  // a tube along a stroke whose width follows the thickness at each of its points (the set one, or a thin line where the growth decides)
  function taperTube(curve, radii, material, order){
    const segs = Math.max(8, radii.length*10), g = new THREE.TubeGeometry(curve, segs, 1, 10), pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3()
    for (let i = 0; i <= segs; i++){ const t = i/segs, u = t*(radii.length - 1), k = Math.min(Math.floor(u), radii.length - 2), rad = lerp(radii[k], radii[k + 1], u - k)
      curve.getPointAt(t, c); for (let j = 0; j <= 10; j++){ const n = i*11 + j; v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(rad).add(c); pos.setXYZ(n, v.x, v.y, v.z) } }
    pos.needsUpdate = true; const m = new THREE.Mesh(g, material); m.renderOrder = order; return m }
  const shownRadius = (st, si, i) => Math.max(st.r?.[i] ?? size()*(si ? .007 : .011), size()*.004)
  // ---- the overlay, rebuilt from the drawing whenever it changes ----
  function draw(){
    clearGroup(wood); clearGroup(shell); clearGroup(handles)
    if (!design) return
    const s = size()
    design.strokes.forEach((st, si) => {
      if (st.pts.length < 2){ if (tool === 'wood') handle(W(st.pts[0]), 'node', { s: si, i: 0 }, si === selected && selNode === 0 ? M.node : M.node, si === selected && selNode === 0 ? 1.5 : 1.25); return }
      const pts = st.pts.map(W), curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts) : new THREE.LineCurve3(pts[0], pts[pts.length - 1])
      wood.add(taperTube(curve, st.pts.map((_, i) => shownRadius(st, si, i)), si === selected ? M.woodSel : selected >= 0 ? M.woodDim : M.wood, 55))
      const pick = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length*8), s*.03, 6), M.pick); pick.userData = { kind: 'wood', s: si, curve }; wood.add(pick)
      // a handle at every node but the first: the root stays put, and a limb's base is where it was drawn from (so the wood there stays free to draw from)
      if (tool === 'wood') st.pts.forEach((q, i) => { if (i === 0 && si > 0) return; const picked = si === selected && i === selNode
        handle(W(q), 'node', { s: si, i }, picked ? M.node : si === selected ? M.woodSel : M.node, picked ? 1.5 : si === selected || selected < 0 ? 1 : .8)
        if (picked){ const at = W(q), k = size()*.016; for (const [m, sc, o] of [[M.haloRim, 2.3, 59], [M.halo, 3.6, 58]]){ const h = new THREE.Mesh(sphere, m); h.scale.setScalar(k*sc); h.position.copy(at); h.renderOrder = o; handles.add(h) } } })
      // the picked limb grows handles to add to it: one halfway along each of its lengths (a new node there) and one past its tip (a new node
      // beyond it)
      if (tool === 'wood' && si === selected){
        for (let k = 1; k < st.pts.length; k++){ const a = W(st.pts[k - 1]), b = W(st.pts[k]); handle(a.clone().lerp(b, .5), 'insert', { s: si, k }, M.ghost, .7) }
        const n = st.pts.length, a = W(st.pts[n - 2]), b = W(st.pts[n - 1]); handle(b.clone().add(b.clone().sub(a).multiplyScalar(.45)), 'extend', { s: si }, M.ghost, .85) }
    })
    // the canopy: a soft shell, a few of its rings drawn round, and (with the canopy tool) its handles
    const cv = design.canopy, cx = root[0] + (cv.cx ?? 0), cz = root[2] + (cv.cz ?? 0), y0 = root[1] + cv.y0, y1 = root[1] + cv.y1
    const rows = 24, cols = 48, pos = [], idx = []
    for (let k = 0; k <= rows; k++){ const t = Math.min(Math.max(k/rows, .002), .998), y = lerp(y0, y1, k/rows), rad = canopyRadius(cv, t)
      for (let j = 0; j <= cols; j++){ const th = j/cols*Math.PI*2, rr = rad*canopyLobe(cv, th); pos.push(cx + Math.cos(th)*rr, y, cz + Math.sin(th)*rr) } }
    for (let k = 0; k < rows; k++) for (let j = 0; j < cols; j++){ const a = k*(cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)
    const m = new THREE.Mesh(g, M.shell); m.renderOrder = 50; shell.add(m)
    for (let k = 1; k < RINGS - 1; k++){ const t = k/(RINGS - 1), y = lerp(y0, y1, t), rad = canopyRadius(cv, t), ring = []
      for (let j = 0; j <= cols; j++){ const th = j/cols*Math.PI*2, rr = rad*canopyLobe(cv, th); ring.push(new THREE.Vector3(cx + Math.cos(th)*rr, y, cz + Math.sin(th)*rr)) }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), M.ringLine); line.renderOrder = 52; shell.add(line) }
    if (tool === 'canopy'){
      // a ring's handle stands on the side of the canopy facing the camera's right, so dragging it sideways widens or narrows that ring
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize(); const th = Math.atan2(right.z, right.x)
      for (let k = 1; k < RINGS - 1; k++){ const t = k/(RINGS - 1), rr = canopyRadius(cv, t)*canopyLobe(cv, th)
        handle(new THREE.Vector3(cx + Math.cos(th)*rr, lerp(y0, y1, t), cz + Math.sin(th)*rr), 'ring', { k, th }, M.handle) }
      // the bulges, round the canopy's widest height
      let best = .5, bw = 0; for (let k = 1; k < 20; k++){ const t = k/20, w = canopyRadius(cv, t); if (w > bw){ bw = w; best = t } }
      for (let l = 0; l < LOBES; l++){ const a = l/LOBES*Math.PI*2, rr = bw*canopyLobe(cv, a)
        handle(new THREE.Vector3(cx + Math.cos(a)*rr, lerp(y0, y1, best), cz + Math.sin(a)*rr), 'lobe', { l, a, t: best }, M.handleRim) }
      handle(new THREE.Vector3(cx, y1, cz), 'top', {}, M.handle); handle(new THREE.Vector3(cx, y0, cz), 'bottom', {}, M.handle)
    }
    void s
  }

  // ---- the pointer: handles first, then (with the wood tool) wood to draw from; anywhere else the camera has it ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hit3 = new THREE.Vector3()
  // where on a stroke the pointer's hit lands: the nearest point of its curve, and the length of it that point falls in (between nodes k-1 and k)
  function onWood(s, hitPoint){ const st = design.strokes[s], pts = st.pts.map(W), curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts) : new THREE.LineCurve3(pts[0], pts[1])
    let bt = 0, bd = Infinity; const v = new THREE.Vector3(), N = 24*(pts.length - 1)
    for (let j = 0; j <= N; j++){ curve.getPoint(j/N, v); const d = v.distanceTo(hitPoint); if (d < bd){ bd = d; bt = j/N } }
    const at = curve.getPoint(bt), u = bt*(pts.length - 1), k = Math.min(Math.floor(u) + 1, pts.length - 1)
    // close to a node: it is that node
    let node = -1, nd = Infinity; pts.forEach((q, n) => { const d = q.distanceTo(at); if (d < nd){ nd = d; node = n } })
    return nd < size()*.035 ? { at: pts[node].clone(), node, k } : { at, node: -1, k } }
  const pointAt = e => { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1); ray.setFromCamera(ndc, camera) }
  const onPlane = (through, e) => { pointAt(e); const n = new THREE.Vector3(); camera.getWorldDirection(n); plane.setFromNormalAndCoplanarPoint(n, through); return ray.ray.intersectPlane(plane, hit3) ? hit3.clone() : null }
  let drag = null, blank = null
  function down(e){
    if (!on || e.button > 0 || !e.isPrimary) return
    if (e.target !== canvas) return
    pointAt(e); blank = { x: e.clientX, y: e.clientY }
    const h = ray.intersectObjects(handles.children.filter(o => o.userData.kind), false)[0]
    if (h){ const u = h.object.userData, design0 = clone(design), at = h.object.position.clone()
      if (u.kind === 'insert'){ insertNode(u.s, u.k, rel(at)); start(e, { kind: 'node', s: u.s, i: u.k, at, added: true, moved: false, design0, x: e.clientX, y: e.clientY }); return }
      if (u.kind === 'extend'){ const st = design.strokes[u.s]; st.pts.push(rel(at)); if (st.r) st.r.push(null); selNode = st.pts.length - 1
        start(e, { kind: 'node', s: u.s, i: st.pts.length - 1, at, added: true, moved: false, design0, x: e.clientX, y: e.clientY }); return }
      // a dot moves when dragged and picks when tapped - but the trunk's foot stays on the ground, so drawing from it grows (a trunk, or a stem beside it)
      if (u.kind === 'node' && u.s === 0 && u.i === 0){ showBud(at); start(e, { kind: 'grow', from: { s: 0, i: 0 }, at, path: [at.clone()], design0, x: e.clientX, y: e.clientY, onNode: u }); return }
      start(e, { ...u, at, moved: false, design0, x: e.clientX, y: e.clientY }); return }
    if (tool === 'wood'){ const w = ray.intersectObjects(wood.children.filter(o => o.userData.kind === 'wood'), false)[0]
      if (w){ const { s } = w.object.userData, o = onWood(s, w.point), pts = design.strokes[s].pts.map(W); let i = 0, bd = Infinity; pts.forEach((q, n) => { const d = q.distanceTo(o.at); if (d < bd){ bd = d; i = n } })
        showBud(o.at); start(e, { kind: 'grow', from: { s, i }, bud: o, at: o.at.clone(), path: [o.at.clone()], design0: clone(design), x: e.clientX, y: e.clientY }) } }
  }
  function start(e, d){ blank = null; drag = d; controls.enabled = false; e.preventDefault(); e.stopImmediatePropagation(); try { canvas.setPointerCapture(e.pointerId) } catch {} }
  const rel = v => [v.x - root[0], v.y - root[1], v.z - root[2]]
  function hover(e){ if (!on || e.target !== canvas || e.pointerType === 'touch'){ return } pointAt(e)
    const h = ray.intersectObjects(handles.children.filter(o => o.userData.kind), false)[0], u = h?.object.userData
    let c = '', b = null; if (u) c = u.kind === 'node' && u.s === 0 && u.i === 0 ? 'crosshair' : 'grab'
    else if (tool === 'wood'){ const w = ray.intersectObjects(wood.children.filter(o => o.userData.kind === 'wood'), false)[0]; if (w){ c = 'crosshair'; b = onWood(w.object.userData.s, w.point).at } }
    showBud(b); canvas.style.cursor = c }
  function move(e){
    if (!drag){ hover(e); return }
    e.preventDefault(); e.stopImmediatePropagation()
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true
    const q = onPlane(drag.at, e); if (!q) return
    const cv = design.canopy, cx = root[0] + (cv.cx ?? 0), cz = root[2] + (cv.cz ?? 0)
    if (drag.kind === 'node' && !drag.moved && !drag.added) return
    if (drag.kind === 'node'){ const st = design.strokes[drag.s], was = st.pts[drag.i], now = rel(q)
      st.pts[drag.i] = now
      // limbs drawn from this node come with it
      design.strokes.forEach(o => { if (o.from && o.from.s === drag.s && o.from.i === drag.i) o.pts[0] = [o.pts[0][0] + now[0] - was[0], o.pts[0][1] + now[1] - was[1], o.pts[0][2] + now[2] - was[2]] }) }
    else if (drag.kind === 'ring'){ const t = drag.k/(RINGS - 1), lobe = canopyLobe(cv, drag.th), want = Math.hypot(q.x - cx, q.z - cz)/lobe
      // the ring's radius set so the canopy reaches the pointer there: through the curve the rings make, by how much this ring shapes that height
      cv.rings[drag.k] = Math.max(.2, cv.rings[drag.k] + (want - canopyRadius(cv, t))) }
    else if (drag.kind === 'lobe'){ const rad = canopyRadius(cv, drag.t), d = (q.x - cx)*Math.cos(drag.a) + (q.z - cz)*Math.sin(drag.a); cv.lobes[drag.l] = Math.min(1.8, Math.max(.35, d/Math.max(rad, .1))) }
    else if (drag.kind === 'top') cv.y1 = Math.max(cv.y0 + 1, q.y - root[1])
    else if (drag.kind === 'bottom') cv.y0 = Math.min(Math.max(.3, q.y - root[1]), cv.y1 - 1)
    else if (drag.kind === 'grow'){ const last = drag.path[drag.path.length - 1]; if (q.distanceTo(last) > size()*.02) drag.path.push(q)
      drawPath(drag.path); return }
    draw(); onPreview?.(design)
  }
  function insertNode(si, k, at){ const st = design.strokes[si]
    st.pts.splice(k, 0, at); if (st.r) st.r.splice(k, 0, st.r[k - 1] != null && st.r[k] != null ? (st.r[k - 1] + st.r[k])/2 : null)
    design.strokes.forEach(o => { if (o.from && o.from.s === si && o.from.i >= k) o.from.i++ }); selNode = k }
  // the mouse wheel over a node: thicker or thinner there, from whatever it is now (the growth's own thickness is guessed at, to start from)
  let wheelFrom = null, wheelT = 0
  function wheel(e){
    if (!on || tool !== 'wood' || e.target !== canvas) return
    pointAt(e); const h = ray.intersectObjects(handles.children.filter(o => o.userData.kind === 'node'), false)[0]; if (!h) return
    e.preventDefault(); e.stopImmediatePropagation()
    const { s: si, i } = h.object.userData, st = design.strokes[si]; wheelFrom ??= clone(design)
    st.r ??= st.pts.map(() => null); const now = st.r[i] ?? guessRadius?.(si, i, design) ?? size()*.01
    st.r[i] = Math.min(Math.max(now*Math.exp(-e.deltaY*.0015), .015), size()*.12)
    selected = si; selNode = i; onSelect?.(selected, selNode); draw(); onPreview?.(design)
    clearTimeout(wheelT); wheelT = setTimeout(() => { onEdit?.(design, wheelFrom); wheelFrom = null }, 400) }
  addEventListener('wheel', wheel, { capture: true, passive: false })
  // the limb being drawn, as a line under the pointer
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe0893c, depthTest: false })); pathLine.renderOrder = 62; group.add(pathLine, bud)
  function drawPath(pts){ pathLine.geometry.dispose(); pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts); pathLine.visible = true }
  function up(e){
    if (!drag){ if (on && blank && e.target === canvas && Math.hypot(e.clientX - blank.x, e.clientY - blank.y) < 5 && selected >= 0){ selected = -1; selNode = -1; onSelect?.(-1, -1); draw() } blank = null; return }
    const d = drag; drag = null; controls.enabled = true; pathLine.visible = false; bud.visible = false
    try { canvas.releasePointerCapture(e.pointerId) } catch {}
    if (d.kind === 'grow'){
      selNode = -1
      // a stroke long enough to be a limb: smoothed to a handful of nodes along its length, from the wood it was drawn out of
      const len = d.path.reduce((t, q, i) => i ? t + q.distanceTo(d.path[i - 1]) : 0, 0)
      // too short to be a branch: a tap - it picks the dot it began on, or the nearest node of the wood it began on
      if (len < size()*.06){ if (d.onNode){ selected = d.onNode.s; selNode = d.onNode.i } else { selected = d.from.s; selNode = Math.max(d.from.i, d.from.s ? 1 : 0) } onSelect?.(selected, selNode); draw(); return }
      const trunk0 = design.strokes[0]
      // drawn up from a lone base node: that is the trunk
      if (d.from.s === 0 && trunk0.pts.length === 1){ const curve = new THREE.CatmullRomCurve3(d.path), n = Math.min(6, Math.max(3, Math.round(len/(size()*.12))))
        trunk0.pts = curve.getSpacedPoints(n - 1).map(rel); trunk0.pts[0] = [0, 0, 0]; selected = 0; selNode = trunk0.pts.length - 1; onSelect?.(selected, selNode); draw(); onEdit?.(design, d.design0); return }
      const curve = new THREE.CatmullRomCurve3(d.path), n = Math.min(6, Math.max(3, Math.round(len/(size()*.12))))
      const pts = curve.getSpacedPoints(n - 1).map(rel); if (d.onNode) pts[0] = design.strokes[d.from.s].pts[d.from.i].slice()   // from a dot: it starts exactly there
      // from the wood between two dots: a new dot there, for it to grow from (on a dot already: that one)
      else if (d.bud){ if (d.bud.node >= 0) d.from = { s: d.from.s, i: d.bud.node }; else { insertNode(d.from.s, d.bud.k, rel(d.bud.at)); d.from = { s: d.from.s, i: d.bud.k } }
        pts[0] = design.strokes[d.from.s].pts[d.from.i].slice() }
      design.strokes.push({ from: d.from, pts })
      selected = design.strokes.length - 1; selNode = pts.length - 1; onSelect?.(selected); draw(); onEdit?.(design, d.design0); return }
    if (d.kind === 'node'){ selected = d.s; selNode = d.i; onSelect?.(selected, selNode); draw()   // a tap picks that node (and its limb)
      if (d.moved || d.added) onEdit?.(design, d.design0); return }
    if (d.moved) onEdit?.(design, d.design0)
  }
  addEventListener('pointerdown', down, { capture: true })
  addEventListener('pointermove', move, { capture: true })
  addEventListener('pointerup', up, { capture: true }); addEventListener('pointercancel', up, { capture: true })
  // the ring handles follow the camera round, so they always face the way a sideways drag goes
  let lastAz = null
  controls.addEventListener('change', () => { if (!on || tool !== 'canopy' || drag) return; const az = Math.round(Math.atan2(camera.position.x - root[0], camera.position.z - root[2])*20); if (az !== lastAz){ lastAz = az; draw() } })

  // ---- a reference picture, standing behind the tree: as tall as the canopy (times size), raised or lowered, turned to the camera when asked
  const refGroup = new THREE.Group(); refGroup.name = 'reference'; scene.add(refGroup)
  let ref = null
  function placeRef(){ if (!ref) return
    const cv = design?.canopy ?? { y1: 10, rings: [5] }, h = cv.y1*1.05*ref.o.size, w = h*ref.aspect, back = Math.max(...cv.rings)*1.15 + 1
    ref.mesh.scale.set(w, h, 1); ref.mesh.rotation.set(0, ref.o.yaw, 0)
    ref.mesh.position.set(root[0] - Math.sin(ref.o.yaw)*back, root[1] + h/2 + ref.o.raise*h, root[2] - Math.cos(ref.o.yaw)*back)
    ref.mesh.material.opacity = ref.o.opacity; refGroup.visible = on }
  const facing = () => { const d = new THREE.Vector3(); camera.getWorldDirection(d); return Math.atan2(-d.x, -d.z) }   // turned to face the camera, about the vertical
  const reference = {
    // (image: a canvas or image; o: { yaw, opacity, size, raise } - a missing yaw faces the camera as it stands)
    set(image, o = {}){ if (ref){ refGroup.remove(ref.mesh); ref.mesh.geometry.dispose(); ref.mesh.material.map.dispose(); ref.mesh.material.dispose(); ref = null }
      if (!image) return null
      const tex = new THREE.CanvasTexture(image); tex.colorSpace = THREE.SRGBColorSpace
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false, fog: false }))
      mesh.renderOrder = 5; mesh.frustumCulled = false   // (writes depth: the far clouds and hills stay behind it, the tree in front of it)
      ref = { mesh, aspect: image.width/image.height, o: { yaw: facing(), opacity: .7, size: 1, raise: 0, ...o } }; refGroup.add(mesh); placeRef(); return ref.o },
    update(o){ if (!ref) return null; Object.assign(ref.o, o); placeRef(); return ref.o },
    face(){ return reference.update({ yaw: facing() }) },
    get on(){ return !!ref },
  }

  return {
    reference,
    get design(){ return design }, get selected(){ return selected }, get selNode(){ return selNode }, get tool(){ return tool },
    // a node's set thickness (null: the growth's own), and setting it - the caller remembers and regrows
    radius(si, i){ return design?.strokes[si]?.r?.[i] ?? null },
    setRadius(si, i, r){ const st = design.strokes[si]; st.r ??= st.pts.map(() => null); st.r[i] = r; draw() },
    // a node out of a limb: its neighbours join up, and limbs drawn from it move to the node before it (a limb keeps two nodes at least)
    removeNode(si, i){ const st = design?.strokes[si]; if (!st || i < 1 || st.pts.length <= 2) return null; const before = clone(design)
      st.pts.splice(i, 1); st.r?.splice(i, 1)
      design.strokes.forEach(o => { if (o.from && o.from.s === si && o.from.i >= i) o.from.i = Math.max(o.from.i - 1, 0) })
      selNode = Math.min(i, st.pts.length - 1); draw(); return before },
    set(d){ design = d ? clone(d) : null; if (selected >= (design?.strokes.length ?? 0)){ selected = -1; selNode = -1 } draw(); placeRef() },
    show(v, r){ on = v; group.visible = v; bud.visible = false; if (!v) canvas.style.cursor = ''; if (r) root = r; refGroup.visible = v; placeRef(); if (!v){ selected = -1; selNode = -1; drag = null; controls.enabled = true } draw() },
    setTool(t){ tool = t; bud.visible = false; draw() },
    select(s, i = -1){ selected = s; selNode = i; draw() },
    // a limb and everything drawn from it
    remove(s){ if (s < 1 || !design) return null; const before = clone(design), gone = new Set([s])
      let grew = true; while (grew){ grew = false; design.strokes.forEach((o, n) => { if (!gone.has(n) && o.from && gone.has(o.from.s)){ gone.add(n); grew = true } }) }
      const keep = design.strokes.map((_, n) => n).filter(n => !gone.has(n)), map = new Map(keep.map((n, k) => [n, k]))
      design.strokes = keep.map(n => { const o = design.strokes[n]; return o.from ? { ...o, from: { s: map.get(o.from.s), i: o.from.i } } : o })
      selected = -1; selNode = -1; draw(); return before },
  }
}
