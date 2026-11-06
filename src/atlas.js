// The brush atlas: 4x4 tiles, each one loaded-brush dab drawn bristle by bristle on a canvas. Opaque on purpose, so no
// premultiplied black bleeds in through the mips. Channels: G = coverage (the alphaMap), R = paint streaks along the bristles.
// B = the blurred coverage: how far a pixel is from the stroke's edge, for the thin-paint edge in the shader.
// The last tile is a broad scrubbed blob: the underpainting that gives each clump its dark mass.
import * as THREE from 'three'
import { mulberry32 } from './generator.js'

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

// a gouache blot: a lumpy body with satellites scattered off its edge, never a leaf shape. spike roughens the outline.
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
  for (let i = 0; i < 12; i++){ const a = r()*7, d = T*(.33 + r()*.13); lump(cx + Math.cos(a)*d, cy + Math.sin(a)*d, T*(.012 + r()*.03), base + (r() - .5)*.3) }
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
function settlePaint(g, S, r, R = 5){
  const img = g.getImageData(0, 0, S, S), d = img.data, A = new Float32Array(S*S), B = new Float32Array(S*S)
  for (let i = 0; i < S*S; i++) A[i] = d[i*4 + 1]/255
  const blur = (src, dst, dx, dy) => { const k = 1/(2*R + 1)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){ let t = 0
      for (let o = -R; o <= R; o++){ const X = Math.min(S - 1, Math.max(0, x + o*dx)), Y = Math.min(S - 1, Math.max(0, y + o*dy)); t += src[Y*S + X] }
      dst[y*S + x] = t*k } }
  blur(A, B, 1, 0); blur(B, A, 0, 1)
  // a coarse random lattice stands in for the tooth of the paper
  const G = 192, lat = new Float32Array(G*G).map(() => r())
  const noise = (x, y, f) => { const u = x*f/S*G%G, v = y*f/S*G%G, a = Math.floor(u), b = Math.floor(v), s = u - a, t = v - b, a1 = (a + 1)%G, b1 = (b + 1)%G
    return (lat[b*G + a]*(1 - s) + lat[b*G + a1]*s)*(1 - t) + (lat[b1*G + a]*(1 - s) + lat[b1*G + a1]*s)*t }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
    const i = (y*S + x)*4, soft = A[y*S + x], tooth = noise(x, y, 1)*.6 + noise(x, y, .3)*.4
    d[i + 1] = Math.max(0, Math.min(255, ((soft - .5)*2.4 + .5 + (tooth - .5)*.9)*255))
    d[i + 2] = soft*255
    const mottle = noise(x, y, .22)*.65 + noise(x, y, .7)*.35
    d[i] = Math.max(0, Math.min(255, d[i]*.55 + mottle*115))
  }
  g.putImageData(img, 0, 0)
}

const BRUSH = {
  round: (g, r, x, y, T, p) => blot(g, r, x, y, T, .08, p),
  pointed: (g, r, x, y, T, p) => blot(g, r, x, y, T, .22, p),
  clover, spray, scumble,
  blossom: dots, needle: fan,
  willow: (g, r, x, y, T, p) => dab(g, r, x, y, T, STYLE.willow, p),
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
  settlePaint(g, S, r, 3)
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
    const n = 7 + Math.floor(r()*6)
    for (let i = 0; i < n; i++){
      const s = (i + .5)/n*2 - 1, by = y0 + T*(.5 + s*.3), bx = x0 + T*.02, len = T*(.5 + r()*.44)*(1 - .25*s*s)
      const ey = by + s*T*(.08 + r()*.16) + (r() - .5)*T*.1, ex = bx + len, w = T*(.06 + r()*.04), mx = bx + len*.55, my = by + (ey - by)*.25 + (r() - .5)*T*.06
      const grad = g.createLinearGradient(bx, 0, ex, 0), v = .2 + r()*.2
      grad.addColorStop(0, `rgb(${Math.round(v*255)},255,0)`); grad.addColorStop(1, `rgb(${Math.round(Math.min(1, v + .6)*255)},255,0)`)
      g.fillStyle = grad; g.beginPath(); g.moveTo(bx, by - w); g.quadraticCurveTo(mx, my - w*.8, ex, ey); g.quadraticCurveTo(mx, my + w*.8, bx, by + w); g.fill()
    }
    g.restore()
  }
  settlePaint(g, S, r, 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}
