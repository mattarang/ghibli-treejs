// Clouds are trees without the wood. Each is a set of shelves and clumps handed to the same emitFoliage, lit by the same stroke shader, in its
// own palette: plates state the masses, dabs gather along the lit edge. The only difference is drawing: strokes are blended far to near in a
// fixed order with no depth between them, so at this distance nothing can swap or fight.
import * as THREE from 'three'
import { mulberry32, emitFoliage, newBuffer } from './generator.js'
import { makeSmoothAtlas } from './atlas.js'
import { makeFoliageMaterial } from './foliage-material.js'
import { newPalette } from './ghibli-patch.js'

const DIST = 1000
const SP = { height: 3, strokeAngle: 90, strokeJitter: 40, cardSize: 2.7, brushWidth: 1, coverage: .85, plates: 3.6, plateSize: 1.25, strays: 0, core: false, crownBlend: .55, massBlend: .5, squash: .82 }

export function makeClouds(){
  const palette = newPalette(['#9fc0d6', '#c6d8e0', '#f6efe2', '#fffaf0'])
  const unused = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
  const mat = makeFoliageMaterial(makeSmoothAtlas(11), unused, palette, { value: new THREE.Color('#fff4dc') }, { value: new THREE.Color('#fff4dc') })
  Object.assign(mat, { transparent: true, depthWrite: false, alphaToCoverage: false, fog: false })
  Object.assign(mat.uniforms, { uAir: { value: 0 }, uHueVar: { value: .12 }, uSelfShade: { value: 0 }, uMass: { value: 0 }, uWind: { value: 0 }, uShadowFillK: { value: 0 }, uLanternI: { value: 0 } })
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
  mesh.frustumCulled = false; mesh.renderOrder = 11                     // over the sky, which is drawn last of the solid things

  mesh.build = (count, seed) => {
    const r = mulberry32(seed*7919 + 3), b = newBuffer()
    for (let c = 0; c < count; c++){
      // the first two sit where the opening camera looks; low, because cumulus stands on the horizon rather than overhead
      const az = c < 2 ? Math.PI*1.25 + (c ? .42 : -.3) + (r() - .5)*.25 : r()*Math.PI*2, el = (.8 + r()*3.2)*Math.PI/180
      const size = (c ? 11 : 15) + r()*7, world = 12                    // laid out at the size of a large tree, so strokes and light shapes keep their scale, then placed far away
      // masses, as a crown has: each tower is one shelf with its own clumps, large low down and small along the top, on one flat base
      const shelves = Array.from({ length: 3 + Math.floor(r()*3) }, (_, i) => { const at = (i ? (r() - .5)*1.5 : (r() - .5)*.5)*size, rx = size*(i ? .28 + r()*.22 : .5), h = size*(i ? .5 + r()*.5 : 1.05)
        return { cx: at, cz: 0, rx, h, bottom: 0, phase: r()*7 } })
      const clumps = []
      for (const v of shelves){
        for (let i = 0, n = Math.round(v.rx*v.h*.7); i < n; i++){
          const a = r()*Math.PI*2, u = Math.sqrt(r()), y = v.h*Math.pow(r(), 1.2), wide = v.rx*Math.sqrt(1 - (y/v.h)**2*.92), x = v.cx + Math.cos(a)*u*wide, z = Math.sin(a)*u*wide*.5
          const rad = size*lerp(.2, .1, y/v.h)*(.8 + r()*.5), q = [x, Math.max(y, rad*.4), z]
          if (clumps.some(o => { const d = [o.c[0] - x, o.c[1] - q[1], o.c[2] - z]; return d[0]*d[0] + d[1]*d[1] + d[2]*d[2] < ((o.r + rad)*.42)**2 })) continue
          clumps.push({ c: q, r: rad, shelf: v, rim: 0, mass: [v.cx, v.h*.4, 0] })
        }
      }
      const fromV = b.pos.length/3
      emitFoliage(SP, r, clumps, [0, 0, 0], 1, b, newBuffer())
      // into place: cloud space is x across, y up, z toward the viewer
      const out = new THREE.Vector3(Math.cos(az)*Math.cos(el), Math.sin(el), Math.sin(az)*Math.cos(el)), right = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az))
      const up = new THREE.Vector3().crossVectors(right, out).normalize(); if (up.y < 0) up.negate()
      const turn = (x, y, z) => [right.x*x + up.x*y - out.x*z, right.y*x + up.y*y - out.y*z, right.z*x + up.z*y - out.z*z]
      for (let v = fromV, n = b.pos.length/3; v < n; v++){
        const p = turn(b.pos[v*3], b.pos[v*3 + 1], b.pos[v*3 + 2]), m = turn(b.nor[v*3], b.nor[v*3 + 1], b.nor[v*3 + 2]), s = turn(b.stroke[v*3], b.stroke[v*3 + 1], b.stroke[v*3 + 2])
        for (let a = 0; a < 3; a++){ b.pos[v*3 + a] = out.getComponent(a)*DIST + p[a]*world; b.nor[v*3 + a] = m[a]; b.stroke[v*3 + a] = s[a]; b.center[v*3 + a] = 0 }
        b.corner[v*2] *= world; b.corner[v*2 + 1] *= world
        for (let a = 0; a < 4; a++) b.wind[v*4 + a] = 0
        // calmer paint than a tree: strokes in a cloud differ far less from their neighbours, so light reads as big shapes
        b.leaf[v*3] = lerp(.62, b.leaf[v*3], .5); b.leaf[v*3 + 2] = lerp(.5, b.leaf[v*3 + 2], .45)
      }
    }
    // far to near, one order for good: the clouds move with the camera
    const strokes = b.idx.length/6, order = Array.from({ length: strokes }, (_, i) => i), key = new Float32Array(strokes)
    for (let i = 0; i < strokes; i++){ const v = b.idx[i*6]*3; key[i] = b.pos[v]**2 + b.pos[v + 1]**2 + b.pos[v + 2]**2 }
    order.sort((x, y) => key[y] - key[x])
    const idx = new Uint32Array(strokes*6)
    order.forEach((s, i) => { for (let k = 0; k < 6; k++) idx[i*6 + k] = b.idx[s*6 + k] })
    mesh.geometry.dispose()
    const g = new THREE.BufferGeometry(), put = (name, data, size) => g.setAttribute(name, new THREE.Float32BufferAttribute(data, size))
    put('position', b.pos, 3); put('normal', b.nor, 3); put('uv', b.uv, 2); put('aCorner', b.corner, 2); put('aStroke', b.stroke, 3)
    put('aLeaf', b.leaf, 3); put('aDab', b.dab, 1); put('aPatch', b.patch, 3); put('aWind', b.wind, 4); put('clusterCenter', b.center, 3)
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    mesh.geometry = g
  }
  // sun and wash arrive through the foliage shader; night only has to take the paint itself down
  const base = palette.map(c => c.value.clone())
  mesh.light = s => palette.forEach((c, i) => c.value.copy(base[i]).multiplyScalar(1 - .68*s.night))
  return mesh
}
const lerp = (a, b, t) => a + (b - a)*t
