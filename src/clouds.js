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
  // the same four bands as foliage (critique/round11/bands.md), sampled from a Wind Rises cloud: P0 the deep blue of the shade side
  // (#09628a, picked by the user), P1 a lighter blue, P2 the cream-white body, P3 the bright rim each puff takes on its crest toward the sun
  const palette = newPalette(['#09628a', '#5891b0', '#e6ebe6', '#fffcf2'])
  const unused = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
  const mat = makeFoliageMaterial(makeSmoothAtlas(11), unused, palette, { value: new THREE.Color('#fff4dc') }, { value: new THREE.Color('#fff4dc') })
  Object.assign(mat, { transparent: true, depthWrite: false, alphaToCoverage: false, fog: false })
  mat.defines = { ...(mat.defines || {}), CLOUD: 1 }
  // every puff is a lobe: its own table of centres and sizes (in the cloud's world place), so each one is modelled top to underside and
  // takes the rim on its crest, as a tree's lobes do
  const lobes = new THREE.DataTexture(new Float32Array(256*64*4), 256, 64, THREE.RGBAFormat, THREE.FloatType)
  lobes.magFilter = lobes.minFilter = THREE.NearestFilter
  mat.uniforms.tLobe = { value: lobes }
  Object.assign(mat.uniforms, { uLobeShade: { value: 1 }, uDayRim: { value: 1 }, uRimTop: { value: .66 } })
  Object.assign(mat.uniforms, { uAir: { value: 0 }, uHueVar: { value: .12 }, uSelfShade: { value: 0 }, uMass: { value: 0 }, uWind: { value: 0 }, uShadowFillK: { value: 0 }, uLanternI: { value: 0 }, uShadeCool: { value: 0 }, uMoonPaint: { value: 0 }, uPigment: { value: .35 }, uLightShape: { value: .1 }, uFleck: { value: 0 } })   // the palette carries the cloud's shade colour; the sky tint foliage takes would turn it lavender
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
  mesh.frustumCulled = false
  // Clouds are drawn as impostors, the way distant trees are. The camera always sits at the centre of the cloud dome, so each cloud is always
  // seen from the same angle: a picture of it, baked at screen resolution, is exact (no parallax to lose) and stays as crisp as the strokes.
  // Each cloud is one card; the thousands of overlapping see-through strokes are only drawn again when the light changes.
  const group = new THREE.Group(), bakeCam = new THREE.PerspectiveCamera(30, 1, 10, 3000), bakeScene = new THREE.Scene()
  bakeScene.add(mesh)
  let cardList = [], dirty = true
  // The bake holds linear, premultiplied paint. Converting premultiplied colour to display colour brightens every half-transparent edge into a
  // pale outline, so the card un-premultiplies, converts, and premultiplies again: the same blend the strokes made on screen.
  const fade = { value: 1 }
  const cardMat = tex => new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uFade: fade }, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D map; uniform float uFade; varying vec2 vUv;
      void main(){ vec4 t = texture2D(map, vUv); if (t.a < .002) discard;
        vec3 c = t.rgb/t.a;                                                 // the paint's own colour, out of the premultiplied bake
        c = mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c));   // to display colour, as the strokes were when they blended on screen
        gl_FragColor = vec4(c*t.a, t.a)*uFade; }` })
  function buildCards(cards){
    for (const c of cardList){ group.remove(c.quad); c.quad.geometry.dispose(); c.quad.material.dispose(); c.rt.dispose() }
    cardList = cards.map(cd => {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2*cd.tx*DIST, 2*cd.ty*DIST), cardMat(rt.texture))
      const basis = new THREE.Matrix4().makeBasis(cd.right, cd.up, cd.out.clone().negate())
      quad.quaternion.setFromRotationMatrix(basis); quad.position.copy(cd.out).multiplyScalar(DIST)
      quad.frustumCulled = false; quad.renderOrder = 11 + cd.order; group.add(quad)
      return { ...cd, rt, quad }
    })
    dirty = true
  }
  let bakedFor = 0
  group.bake = (renderer) => {
    if (renderer.domElement.height !== bakedFor) dirty = true             // a new canvas size wants new texels
    if (!dirty || !cardList.length) return
    bakedFor = renderer.domElement.height
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha()
    const ph = renderer.domElement.height                                      // texels to match the screen: a card is never softer than the strokes
    renderer.setClearColor(0x000000, 0)
    for (const c of cardList){
      const w = Math.min(2048, Math.max(32, Math.ceil(ph*c.tx/Math.tan(18*Math.PI/180)))), h = Math.min(2048, Math.max(32, Math.ceil(ph*c.ty/Math.tan(18*Math.PI/180))))
      if (c.rt.width !== w || c.rt.height !== h) c.rt.setSize(w, h)
      bakeCam.fov = 2*Math.atan(c.ty)*180/Math.PI; bakeCam.aspect = c.tx/c.ty; bakeCam.updateProjectionMatrix()
      bakeCam.position.set(0, 0, 0); bakeCam.up.copy(c.up); bakeCam.lookAt(c.out); bakeCam.updateMatrixWorld()
      mesh.geometry.setDrawRange(c.fromI, c.toI - c.fromI)
      renderer.setRenderTarget(c.rt); renderer.clear(); renderer.render(bakeScene, bakeCam)
    }
    mesh.geometry.setDrawRange(0, Infinity)
    renderer.setRenderTarget(prev); renderer.setClearColor(clear, ca)
    dirty = false
  }
  group.markDirty = () => { dirty = true }

  group.build = (count, seed) => {
    const r = mulberry32(seed*7919 + 3), b = newBuffer(), cards = []
    for (let c = 0; c < count; c++){
      // the first two sit where the opening camera looks; low, because cumulus stands on the horizon rather than overhead
      // a Ghibli sky holds many cumulus of mixed sizes scattered up the sky, not one wall on the horizon: a few sit low where the opening camera looks,
      // the rest anywhere, and the higher ones are the smaller, as farther clouds are
      // a ring of cloud around the viewer: a few huge cumulus standing on the horizon all round (two of them where the opening camera looks),
      // middle-sized ones between, and small ones higher up. Every third cloud is big, so wherever the camera turns there is a tower of cloud.
      const tier = c < 2 || c%3 === 0 ? 0 : c%3 === 1 ? 1 : 2, hero = tier === 0
      const az = c < 2 ? Math.PI*1.25 + (c ? .62 : -.62)*.5 + (r() - .5)*.2 : (c/Math.max(count, 1))*Math.PI*2 + 2.1 + (r() - .5)*.6
      const high = tier === 2 ? .4 + r()*.6 : r()*.3
      const el = (hero ? -.6 + r()*.5 : tier === 1 ? .2 + r()*2 : 1.2 + high*high*16)*Math.PI/180   // big bases sink just below the horizon: the cloud stands on the land
      const size = hero ? 26 + r()*14 : tier === 1 ? 12 + r()*8 : (3.5 + r()*6)*(1 - .45*high), world = 12
      // masses, as a crown has: each tower is one shelf with its own clumps, large low down and small along the top, on one flat base
      const shelves = Array.from({ length: 2 + Math.floor(r()*3) }, (_, i) => { const at = (i ? (r() - .5)*1.7 : (r() - .5)*.4)*size, rx = size*(i ? .3 + r()*.2 : .55), h = size*(i ? .32 + r()*.3 : .62)
        return { cx: at, cz: 0, rx, h, bottom: 0, phase: r()*7 } })
      const clumps = []
      for (const v of shelves){
        for (let i = 0, n = Math.round(v.rx*v.h*.55*12/size*(hero ? 4.5 : tier === 1 ? 2.2 : 1)); i < n; i++){   // a big cloud is many small puffs, not a few big ones
          const a = r()*Math.PI*2, u = Math.sqrt(r()), y = v.h*Math.pow(r(), 1.2), wide = v.rx*Math.sqrt(1 - (y/v.h)**2*.92), x = v.cx + Math.cos(a)*u*wide, z = Math.sin(a)*u*wide*.5
          const rad = size*lerp(.3, .17, y/v.h)*(.8 + r()*.45)*(hero ? lerp(.55, .38, y/v.h) : tier === 1 ? lerp(.75, .55, y/v.h) : 1), q = [x, Math.max(y, rad*.4), z]
          if (clumps.some(o => { const d = [o.c[0] - x, o.c[1] - q[1], o.c[2] - z]; return d[0]*d[0] + d[1]*d[1] + d[2]*d[2] < ((o.r + rad)*.5)**2 })) continue
          clumps.push({ c: q, r: rad, shelf: v, rim: 0, mass: [v.cx, v.h*.4, 0] })
        }
      }
      const fromV = b.pos.length/3, fromI = b.idx.length, fromH = b.held?.length ?? 0
      emitFoliage(SP, r, clumps, [0, 0, 0], 1, b)
      // into place: cloud space is x across, y up, z toward the viewer
      const out = new THREE.Vector3(Math.cos(az)*Math.cos(el), Math.sin(el), Math.sin(az)*Math.cos(el)), right = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az))
      const up = new THREE.Vector3().crossVectors(right, out).normalize(); if (up.y < 0) up.negate()
      const turn = (x, y, z) => [right.x*x + up.x*y - out.x*z, right.y*x + up.y*y - out.y*z, right.z*x + up.z*y - out.z*z]
      for (let v = fromV, n = b.pos.length/3; v < n; v++){
        // a cumulus sits on a flat, shaded base: below about a third of its height the form turns down, out of the sun
        const low = 1 - Math.min(Math.max(b.pos[v*3 + 1]/(size*.38), 0), 1), nd = [b.nor[v*3], b.nor[v*3 + 1] - 1.3*low*low, b.nor[v*3 + 2]], nl = Math.hypot(...nd) || 1
        b.nor[v*3] = nd[0]/nl; b.nor[v*3 + 1] = nd[1]/nl; b.nor[v*3 + 2] = nd[2]/nl
        const p = turn(b.pos[v*3], b.pos[v*3 + 1], b.pos[v*3 + 2]), m = turn(b.nor[v*3], b.nor[v*3 + 1], b.nor[v*3 + 2]), s = turn(b.stroke[v*3], b.stroke[v*3 + 1], b.stroke[v*3 + 2])
        for (let a = 0; a < 3; a++){ b.pos[v*3 + a] = out.getComponent(a)*DIST + p[a]*world; b.nor[v*3 + a] = m[a]; b.stroke[v*3 + a] = s[a]; b.center[v*3 + a] = 0 }
        b.corner[v*2] *= world; b.corner[v*2 + 1] *= world
        for (let a = 0; a < 4; a++) b.wind[v*4 + a] = 0
        // calmer paint than a tree: strokes in a cloud differ far less from their neighbours, so light reads as big shapes
        b.leaf[v*3] = lerp(.62, b.leaf[v*3], .3); b.leaf[v*3 + 2] = lerp(.5, b.leaf[v*3 + 2], .25); b.leaf[v*3 + 1] = lerp(.5, b.leaf[v*3 + 1], .4)
      }
      // each puff's centre and size, placed as its strokes were
      for (let k = fromH; k < b.held.length && k < 256*64; k++){ const h = b.held[k], q = turn(h.c[0], h.c[1], h.c[2])
        lobes.image.data.set([out.x*DIST + q[0]*world, out.y*DIST + q[1]*world, out.z*DIST + q[2]*world, h.r*world], k*4) }
      lobes.needsUpdate = true
      cards.push({ out: out.clone(), right: right.clone(), up: up.clone(), fromI, toI: b.idx.length, fromV, toV: b.pos.length/3, order: hero ? 0 : tier })
    }
    // far to near within each cloud, each cloud's strokes kept together so it can be baked on its own
    const idx = new Uint32Array(b.idx.length)
    for (const cd of cards){
      const n = (cd.toI - cd.fromI)/6, order = Array.from({ length: n }, (_, k) => k), key = new Float32Array(n)
      for (let k = 0; k < n; k++){ const v = b.idx[cd.fromI + k*6]*3; key[k] = b.pos[v]**2 + b.pos[v + 1]**2 + b.pos[v + 2]**2 }
      order.sort((x, y) => key[y] - key[x])
      order.forEach((sk, k) => { for (let q = 0; q < 6; q++) idx[cd.fromI + k*6 + q] = b.idx[cd.fromI + sk*6 + q] })
      // the cloud's extent as seen from the centre, in its own frame: the card has to cover every stroke, fanned out
      let mx = 0, my = 0
      for (let v = cd.fromV; v < cd.toV; v++){
        const px = b.pos[v*3], py = b.pos[v*3 + 1], pz = b.pos[v*3 + 2], fan = Math.hypot(b.corner[v*2], b.corner[v*2 + 1])
        const d = px*cd.out.x + py*cd.out.y + pz*cd.out.z
        mx = Math.max(mx, (Math.abs(px*cd.right.x + py*cd.right.y + pz*cd.right.z) + fan)/d)
        my = Math.max(my, (Math.abs(px*cd.up.x + py*cd.up.y + pz*cd.up.z) + fan)/d)
      }
      cd.tx = mx*1.04; cd.ty = my*1.04
    }
    buildCards(cards)
    mesh.geometry.dispose()
    const g = new THREE.BufferGeometry(), put = (name, data, size) => g.setAttribute(name, new THREE.Float32BufferAttribute(data, size))
    put('position', b.pos, 3); put('normal', b.nor, 3); put('uv', b.uv, 2); put('aCorner', b.corner, 2); put('aStroke', b.stroke, 3)
    put('aLeaf', b.leaf, 3); put('aDab', b.dab, 1); put('aPatch', b.patch, 3); put('aWind', b.wind, 4); put('clusterCenter', b.center, 3)
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    mesh.geometry = g
    dirty = true
  }
  // sun and wash arrive through the foliage shader; night only has to take the paint itself down
  const base = palette.map(c => c.value.clone())
  // at night the sky is clear, as in Totoro: the clouds thin to faint slate-blue veils
  group.light = s => { palette.forEach((c, i) => c.value.copy(base[i]).multiplyScalar(1 - .8*s.night)); fade.value = 1 - .6*s.night; dirty = true }
  group.material = mat
  return group
}
const lerp = (a, b, t) => a + (b - a)*t
