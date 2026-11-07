// The brush atlas: 4x4 tiles, each one loaded-brush dab drawn bristle by bristle on a canvas. Opaque on purpose, so no
// premultiplied black bleeds in through the mips. Channels: G = coverage (the alphaMap), R = paint streaks along the bristles.
// B = the blurred coverage: how far a pixel is from the stroke's edge, for the thin-paint edge in the shader.
// The last tile is a broad scrubbed blob: the underpainting that gives each clump its dark mass.
import * as THREE from 'three'
import { mulberry32 } from './generator.js'
import { MAPLE, MAPLE_CUT } from './leaf-shapes.js'

const STYLE = {
  willow:  { bristles: 20, body: .26, tail: .55, bow: .05 }, // a long thin pull
}

function dab(g, r, x0, y0, T, style, paint){
  const { bristles, body, tail, bow } = style, bend = (r() - .5)*2*bow, base = .3 + r()*.3, thick = T*body*2.6/bristles
  for (let i = 0; i < bristles; i++){
    const s = (i + .5)/bristles*2 - 1, edge = s*s
    const start = .05 + edge*.14 + r()*.05, end = .95 - edge*tail - r()*tail*.45
    const v = Math.min(1, base + (r() - .5)*.5 + (s + 1)*.12)
    g.strokeStyle = paint(v); g.lineWidth = thick*(.8 + r()*.7); g.lineCap = 'round'
    let drawing = false; g.beginPath()
    for (let k = 0; k <= 24; k++){
      const u = k/24, x = start + (end - start)*u
      const y = .5 + s*body*Math.pow(Math.sin(Math.PI*Math.min(1, u*.72 + .2)), .4) + bend*Math.sin(Math.PI*x)
      const dry = u > .6 && r() < (u - .6)*.55                   // the brush runs dry toward the tail
      if (dry){ drawing = false; continue }
      if (drawing) g.lineTo(x0 + x*T, y0 + y*T); else { g.moveTo(x0 + x*T, y0 + y*T); drawing = true }
    }
    g.stroke()
  }
}

// a gouache blot: one lumpy connected shape, never a leaf shape. spike roughens the outline.
function blot(g, r, x0, y0, T, spike, paint){
  const lump = (cx, cy, R, v) => {
    const p1 = r()*7, p2 = r()*7, N = 36; g.fillStyle = paint(v); g.beginPath()
    for (let i = 0; i < N; i++){
      const a = i/N*Math.PI*2, q = R*(.72 + .2*Math.sin(a*3 + p1) + .1*Math.sin(a*7 + p2) + spike*(r() - .5)*2)
      const x = cx + Math.cos(a)*q, y = cy + Math.sin(a)*q*.86
      if (i) g.lineTo(x, y); else g.moveTo(x, y)
    }
    g.closePath(); g.fill()
  }
  const cx = x0 + T/2, cy = y0 + T/2, base = .35 + r()*.3
  lump(cx, cy, T*.34, base)
  for (let i = 0; i < 9; i++){ const a = r()*7, d = T*(.1 + r()*.2); lump(cx + Math.cos(a)*d, cy + Math.sin(a)*d, T*(.08 + r()*.08), base + (r() - .5)*.4) }
}

// loose rounded leaves around a gap, with a couple flying off: the clover-leaf dab
function clover(g, r, x0, y0, T, paint){
  const n = 6 + Math.floor(r()*4), phase = r()*7, cx = x0 + T/2, cy = y0 + T/2
  for (let i = 0; i < n; i++){
    const a = phase + i/n*Math.PI*2 + (r() - .5)*.5, d = T*(.04 + r()*.14), len = T*(.2 + r()*.13), wid = len*(.34 + r()*.14)
    g.save(); g.translate(cx + Math.cos(a)*d, cy + Math.sin(a)*d); g.rotate(a)
    g.fillStyle = paint(.3 + r()*.5); g.beginPath(); g.moveTo(0, 0)
    g.bezierCurveTo(len*.3, wid*1.5, len*1.05, wid*1.1, len, 0); g.bezierCurveTo(len*1.05, -wid*1.1, len*.3, -wid*1.5, 0, 0); g.fill(); g.restore()
  }
}

// a sprig: pointed leaves stepping along a stem toward the stroke's head, smaller at the tip
function spray(g, r, x0, y0, T, paint){
  const n = 7 + Math.floor(r()*4), bend = (r() - .5)*.16
  for (let i = 0; i < n; i++){
    const u = (i + .5)/n, x = x0 + T*(.08 + .78*u), y = y0 + T*(.5 + bend*Math.sin(u*3.1)), side = i%2 ? 1 : -1
    const len = T*(.3 - .17*u)*(.85 + r()*.3), wid = len*.3, a = side*(.75 - .3*u) + (r() - .5)*.3
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = paint(.3 + r()*.5); g.beginPath(); g.moveTo(0, 0)
    g.quadraticCurveTo(len*.45, wid*1.2, len, 0); g.quadraticCurveTo(len*.45, -wid*1.2, 0, 0); g.fill(); g.restore()
  }
}

// real leaf outlines: a few leaves at a time, overlapping, each its own shade and turn, stems toward the stroke's start
function leafPath(g, path, x, y, size, angle){
  const c = Math.cos(angle), s = Math.sin(angle), at = i => [x + (path[i]*c - path[i + 1]*s)*size, y + (path[i]*s + path[i + 1]*c)*size], n = path.length/6
  g.beginPath(); g.moveTo(...at(2))
  for (let k = 0; k < n; k++){ const a = k*6, b = ((k + 1)%n)*6; g.bezierCurveTo(...at(a + 4), ...at(b), ...at(b + 2)) }
  g.closePath()
}
// a spray of real-size leaves: ~20 to a mark, so a leaf is about a sixth of the stroke (8 cm or so on a 45 cm dab), stems toward the middle
function leaves(path){ return (g, r, x0, y0, T, paint) => {
  const n = 18 + Math.floor(r()*6), cx = x0 + T/2, cy = y0 + T/2
  for (let i = 0; i < n; i++){
    const a = r()*Math.PI*2, d = Math.sqrt((i + r())/n)*T*.34, size = T*(.13 + r()*.08)*(1 - .25*d/(T*.34))
    leafPath(g, path, cx + Math.cos(a)*d, cy + Math.sin(a)*d*.9, size, a + Math.PI/2 + (r() - .5)*.8)
    g.fillStyle = paint(.25 + r()*.6); g.fill()
  }
} }

// dry paint dragged across the tooth of the paper: a thinning cloud of specks
function scumble(g, r, x0, y0, T, paint){
  for (let i = 0; i < 240; i++){
    const a = r()*7, d = (r()**.7)*T*.42, R = T*(.006 + r()*r()*.03)
    g.fillStyle = paint(.25 + r()*.6); g.beginPath(); g.arc(x0 + T/2 + Math.cos(a)*d, y0 + T/2 + Math.sin(a)*d*.85, R, 0, 7); g.fill()
  }
}

function dots(g, r, x0, y0, T, paint){                       // stippled dabs: blossom
  for (let i = 0; i < 16; i++){
    const a = r()*7, d = Math.sqrt(r())*T*.36, R = T*(.06 + r()*.08)
    g.fillStyle = paint(.3 + r()*.6); g.beginPath()
    g.ellipse(x0 + T/2 + Math.cos(a)*d, y0 + T/2 + Math.sin(a)*d*.8, R*1.3, R, r()*3, 0, 7); g.fill()
  }
}

function fan(g, r, x0, y0, T, paint){                        // spiky flicks from one point: needles
  for (let i = 0; i < 16; i++){
    const a = -.65 + 1.3*(i + r())/16, len = T*(.62 + r()*.3), w = T*.022*(1 + r())
    const bx = x0 + T*.08, by = y0 + T/2, ca = Math.cos(a), sa = Math.sin(a)
    g.fillStyle = paint(.3 + r()*.6); g.beginPath(); g.moveTo(bx - sa*w, by + ca*w)
    g.lineTo(bx + ca*len, by + sa*len); g.lineTo(bx + sa*w, by - ca*w); g.fill()
  }
}

// The hand on the brush: blur the coverage, then cut it again against a grain, so edges come out rough and irregular
// instead of vector-clean, and mottle the pigment inside.
// One stroke, one shape: keep the tile's largest connected piece and fill any pinholes in it, so no flecks float off a blot.
function oneShape(d, S, x0, y0, T){
  const at = (x, y) => (y*S + x)*4 + 1, seen = new Int32Array(T*T), stack = []
  const inTile = i => { const y = Math.floor(i/T), x = i - y*T; return [x0 + x, y0 + y] }
  const solid = i => { const [x, y] = inTile(i); return d[at(x, y)] > 92 }
  const fill = (start, mark, want) => { let n = 0; stack.length = 0; stack.push(start); seen[start] = mark
    while (stack.length){ const i = stack.pop(), x = i%T, y = (i - x)/T; n++
      for (const [q, ok] of [[i - 1, x > 0], [i + 1, x < T - 1], [i - T, y > 0], [i + T, y < T - 1]])
        if (ok && !seen[q] && solid(q) === want){ seen[q] = mark; stack.push(q) } }
    return n }
  let best = 0, bestN = 0, mark = 0
  for (let i = 0; i < T*T; i++) if (!seen[i] && solid(i)){ const n = fill(i, ++mark, true); if (n > bestN){ bestN = n; best = mark } }
  const air = ++mark
  for (let k = 0; k < T; k++) for (const i of [k, T*T - 1 - k, k*T, k*T + T - 1]) if (!seen[i]) fill(i, air, false)
  for (let i = 0; i < T*T; i++){ const [x, y] = inTile(i), m = seen[i]
    if (m !== best && m !== air){ if (m && m < air) d[at(x, y)] = 0; else d[at(x, y)] = 255 } }
}

function settlePaint(g, S, r, R = 5, solidTile = () => false){
  const img = g.getImageData(0, 0, S, S), d = img.data, A = new Float32Array(S*S), B = new Float32Array(S*S)
  for (let i = 0; i < S*S; i++) A[i] = d[i*4 + 1]/255
  const blur = (src, dst, dx, dy) => { const k = 1/(2*R + 1)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){ let t = 0
      for (let o = -R; o <= R; o++){ const X = Math.min(S - 1, Math.max(0, x + o*dx)), Y = Math.min(S - 1, Math.max(0, y + o*dy)); t += src[Y*S + X] }
      dst[y*S + x] = t*k } }
  blur(A, B, 1, 0); blur(B, A, 0, 1)
  // Smooth noise, each octave turned to its own angle. A lattice read on-axis shows its grid, and stretched over a big stroke
  // that grid reads as a printed weave: no brush makes that.
  const G = 256, lat = new Float32Array(G*G).map(() => r())
  const noise = (x, y, f, a) => { const c = Math.cos(a), n = Math.sin(a), scale = f/S*G
    const u = (((x*c - y*n)*scale)%G + G)%G, v = (((x*n + y*c)*scale)%G + G)%G, i = Math.floor(u), j = Math.floor(v)
    const s0 = u - i, t0 = v - j, s = s0*s0*(3 - 2*s0), t = t0*t0*(3 - 2*t0), i1 = (i + 1)%G, j1 = (j + 1)%G
    return (lat[j*G + i]*(1 - s) + lat[j*G + i1]*s)*(1 - t) + (lat[j1*G + i]*(1 - s) + lat[j1*G + i1]*s)*t }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const i = (y*S + x)*4, soft = A[y*S + x], tooth = noise(x, y, .26, .7)*.65 + noise(x, y, .1, 2.1)*.35
    // the tooth only bites at the edge of a stroke: inside, paint is solid, or the noise punches a weave of pinholes through it
    const atEdge = 1 - Math.min(1, Math.max(0, (soft - .45)/.3))
    d[i + 1] = Math.max(0, Math.min(255, ((soft - .5)*3 + .5 + (tooth - .5)*.5*atEdge)*255))
    d[i + 2] = soft*255
    const mottle = noise(x, y, .05, 1.1)*.7 + noise(x, y, .13, 2.6)*.3    // pigment pools in broad, slow shapes
    d[i] = Math.max(0, Math.min(255, d[i]*.55 + mottle*115))
  }
  const T = S/4
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) if (solidTile(tx, ty)) oneShape(d, S, tx*T, ty*T, T)
  g.putImageData(img, 0, 0)
}

const BRUSH = {
  round: (g, r, x, y, T, p) => blot(g, r, x, y, T, .08, p),
  pointed: (g, r, x, y, T, p) => blot(g, r, x, y, T, .22, p),
  clover, spray, scumble,
  blossom: dots, needle: fan,
  willow: (g, r, x, y, T, p) => dab(g, r, x, y, T, STYLE.willow, p),
  maple: leaves(MAPLE), mapleCut: leaves(MAPLE_CUT),
}

export function makeBrushAtlas(body, edge = body, seed = 3){
  const S = 1024, T = S/4, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d'), r = mulberry32(seed), paint = v => `rgb(${Math.round(v*255)},255,0)`
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S)
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++){
    const x0 = tx*T, y0 = ty*T
    g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 3, T - 6, T - 6); g.clip()
    if (tx === 3 && ty === 3){
      for (let i = 0; i < 70; i++){ const a = r()*7, d = Math.sqrt(r())*T*.34
        g.fillStyle = paint(.3 + r()*.3); g.beginPath(); g.arc(x0 + T/2 + Math.cos(a)*d, y0 + T/2 + Math.sin(a)*d, T*(.06 + r()*.09), 0, 7); g.fill() }
    }
    else (BRUSH[ty < 2 ? body : edge] || BRUSH.round)(g, r, x0, y0, T, paint)
    g.restore()
  }
  const isBlot = b => b === 'round' || b === 'pointed'
  settlePaint(g, S, r, 3, (tx, ty) => (tx === 3 && ty === 3) || isBlot(ty < 2 ? body : edge))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

// Grass tufts: a fan of tapered flicks from a shared root, drawn with the root at the left of the tile so the stroke's
// direction is the way the blades grow. Paint gets lighter toward the tips.
export function makeGrassAtlas(seed = 9){
  const S = 1024, T = S/4, c = document.createElement('canvas'); c.width = c.height = S
  const g = c.getContext('2d'), r = mulberry32(seed)
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S)
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++){
    const x0 = tx*T, y0 = ty*T
    g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 3, T - 6, T - 6); g.clip()
    const n = 7 + Math.floor(r()*6), rootY = y0 + T*.5
    for (let i = 0; i < n; i++){
      // every blade leaves one root as a point and swells before it tapers: no flat base for the eye to catch
      const s = (i + .5)/n*2 - 1, bx = x0 + T*.03, len = T*(.55 + r()*.4)*(1 - .25*s*s), ey = rootY + s*T*(.16 + r()*.2), ex = bx + len
      const w = T*(.05 + r()*.04), mx = bx + len*.5, my = rootY + (ey - rootY)*.35 + (r() - .5)*T*.05, v = .15 + r()*.15
      const grad = g.createLinearGradient(bx, 0, ex, 0); grad.addColorStop(0, `rgb(${Math.round(v*255)},255,0)`); grad.addColorStop(1, `rgb(${Math.round(Math.min(1, v + .65)*255)},255,0)`)
      g.fillStyle = grad; g.beginPath(); g.moveTo(bx, rootY); g.quadraticCurveTo(mx, my - w, ex, ey); g.quadraticCurveTo(mx, my + w, bx, rootY); g.fill()
    }
    g.restore()
  }
  settlePaint(g, S, r, 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

// five octaves of tiling value noise, for the shaders to read in one lookup. Tiles every 16 units of noise.
export function makeFieldTexture(size = 512){
  const r = mulberry32(4242), base = 16, lattice = new Float32Array(4096)
  for (let i = 0; i < 4096; i++) lattice[i] = r()
  const at = (x, y, m, o) => lattice[(((x%m + m)%m)*131 + ((y%m + m)%m)*251 + o*37) & 4095]
  const value = (x, y, m, o) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = u*u*(3 - 2*u), t = v*v*(3 - 2*v)
    const a = at(i, j, m, o), b = at(i + 1, j, m, o), c = at(i, j + 1, m, o), d = at(i + 1, j + 1, m, o)
    return (a + (b - a)*s)*(1 - t) + (c + (d - c)*s)*t }
  const data = new Uint8Array(size*size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    let sum = 0, amp = .5, m = base
    for (let o = 0; o < 5; o++){ sum += amp*value(x/size*m, y/size*m, m, o); amp *= .5; m *= 2 }
    data[x + y*size] = Math.min(255, sum/.97*255)
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true; tex.needsUpdate = true
  return tex
}

// Round dabs for the clouds, between a smooth oval and the torn blot: the shape stays a rounded touch of the brush, but its rim wanders in small
// soft bumps and thins here and there, and the paint in it isn't quite even. Coverage is a clean ramp across the rim, so edges stay crisp at any size.
export function makeSmoothAtlas(seed = 7){
  const S = 1024, T = S/4, r = mulberry32(seed), data = new Uint8Array(S*S*4)
  const lattice = new Float32Array(1024); for (let i = 0; i < 1024; i++) lattice[i] = r()
  const hat = (i, j) => lattice[(i*67 + j*193) & 1023]
  const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u*u*(3 - 2*u), b = v*v*(3 - 2*v)
    return (hat(i, j)*(1 - a) + hat(i + 1, j)*a)*(1 - b) + (hat(i, j + 1)*(1 - a) + hat(i + 1, j + 1)*a)*b }
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++){
    const a2 = .05 + r()*.07, a3 = .03 + r()*.05, a5 = .018 + r()*.02, a8 = .012 + r()*.014, p = [r()*7, r()*7, r()*7, r()*7], tone = r(), ox = r()*90, oy = r()*90
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++){
      const u = (x + .5)/T*2 - 1, v = (y + .5)/T*2 - 1, th = Math.atan2(v, u)
      const rim = .78*(1 + a2*Math.sin(th*2 + p[0]) + a3*Math.sin(th*3 + p[1]) + a5*Math.sin(th*5 + p[2]) + a8*Math.sin(th*8 + p[3]))
      const bumps = (noise(u*4.5 + ox, v*4.5 + oy) - .5)*.2 + (noise(u*11 + oy, v*11 + ox) - .5)*.1, d = Math.hypot(u, v)/rim + bumps*Math.min(Math.hypot(u, v)/rim, 1)
      const i = ((ty*T + y)*S + tx*T + x)*4
      data[i] = Math.min(Math.max(.44 + tone*.08 + (noise(u*2.4 + ox, v*5 + oy) - .5)*.2, 0), 1)*255
      data[i + 1] = Math.min(Math.max(.36 + (1 - d)*2, 0), 1)*255
      data[i + 2] = Math.min(Math.max(.75 + (1 - d)*1.6, 0), 1)*255
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, S, S)
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true
  return t
}
