// Distant mountains as real landforms dressed in the tree foliage. A ring of mountain volumes stands round the meadow, 790-1010 m out: each
// peak a dome with spur ridges running down from its summit and gullies between, foothills in front. Forest clumps are laid on that surface,
// emitted by the same emitFoliage and painted by the same stroke shader as the tree in the meadow, with the surface's own normal, so light
// and shade fall the way the land does: a lit flank and a shaded one on every spur, valleys in shade. Like the clouds, each stretch is baked
// once into a card seen from the centre and repainted only when the light changes; the cards follow the camera. No cast shadows reach them.
import * as THREE from 'three'
import { mulberry32, emitFoliage, newBuffer } from './generator.js'
import { makeSmoothAtlas } from './atlas.js'
import { makeFoliageMaterial } from './foliage-material.js'
import { newPalette, U, GLSL_NIGHT } from './ghibli-patch.js'

const UNIT = 6.5                      // metres per local unit: clumps of 1-1.4 units are 7-9 m stands of trees, a few pixels each at 900 m
const FOOT = -8                       // the plain in front of the mountains sits at the meadow's edge (-6 to +11 m): forested, it is the tree line
const R_IN = 640, R_OUT = 1260, R_MID = 1000   // from just behind the meadow's edge (620 m): no gap to see past
const STEP = 11                        // metres between clumps over the surface
const SPAN = 24                       // degrees of ring per card
const SP = { height: 3, strokeAngle: 90, strokeJitter: 50, cardSize: .8, brushWidth: 1, coverage: .3, plates: 1.4, plateSize: 1.2, strays: 0, core: true, crownBlend: 0, massBlend: .45, squash: .8 }
// P0 deep, P1 shade, P2 lit, P3 the crest rim: sampled from the Spirited Away meadow shot (near hills #397653, peaks #4a8472, far #548084)
const PALETTE = ['#1c4129', '#2d6136', '#468244', '#62a052']   // warmer than the hazed peaks: shade h~131, lit h~111   // the near hills' darker, warmer green (#397653 h145 s.52; #326049), not the hazed peaks' mint

// The land: peaks round the ring, each a dome whose edge is pushed out along k spurs (so ridges radiate from the summit with gullies
// between) and a lower ring of foothills in front. Heights are above FOOT; the meadow hides everything below about 40 m.
function makeLand(seed, scale){
  const r = mulberry32(seed*977 + 5), peaks = []
  const add = (az, rad, h, R) => peaks.push({ az, rad, h: h*scale, R, k: 4 + Math.floor(r()*3), ph: r()*7 })   // 4-6 facets
  for (let i = 0; i < 26; i++){
    const az = (i + r()*.8)/26*Math.PI*2
    // a little more mountain where 'Frame the plant' looks (from +x+z toward the tree: azimuth 225 deg), so the framed shot has a range behind
    const da = Math.abs(((az/(Math.PI*2) - .625)%1 + 1.5)%1 - .5), hero = 1 + .35*Math.exp(-((da/.09)**2))
    add(az, 1040 + r()*80, (42 + r()*40)*hero, 240 + r()*110)           // the range: broad rounded mounds, tops 1-3 degrees above the horizon
    add(az + (r() - .5)*.15, 930 + r()*40, 18 + r()*16, 150 + r()*60)   // low foothills in front
  }
  const height = (az, rad) => {
    let h = 0
    for (const p of peaks){
      const dx = ((((az - p.az)/(Math.PI*2)) % 1 + 1.5) % 1 - .5)*Math.PI*2*rad, dz = rad - p.rad
      if (Math.abs(dx) > p.R*1.2 || Math.abs(dz) > p.R*1.2) continue
      // a pyramid of k facets: the distance out is the largest projection on the facet directions, so neighbouring facets meet in a sharp
      // ridgeline running down from the summit, and the light flips cleanly from one flank to the other. The very top is rounded a little.
      let d = 0
      for (let i = 0; i < p.k; i++){ const a = p.ph + i*Math.PI*2/p.k; d = Math.max(d, dx*Math.cos(a) + dz*Math.sin(a)) }
      const q = Math.min(Math.max(d/p.R, 0), 1), f = p.h*Math.pow(1 - q, .85)*(1 - .1*Math.exp(-q*q/.004))   // full shoulders: a pyramid that reads as a mountain, not a spike
      h = Math.max(h, f)                                                    // peaks meet in hard valleys, as ridges do
    }
    const edge = Math.min(Math.max((rad - 790)/280, 0), 1)
    return h*edge*edge*(3 - 2*edge)                                      // the plain in front: the land only rises inside the band the forest covers
  }
  return height
}

export function makeMountains(fogColor){
  const group = new THREE.Group(), bakeCam = new THREE.PerspectiveCamera(30, 1, 10, 3000)
  const palette = newPalette(PALETTE)
  const unused = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
  const mat = makeFoliageMaterial(makeSmoothAtlas(5), unused, palette, { value: new THREE.Color('#b8d27a') }, { value: new THREE.Color('#a9cf7a') })
  Object.assign(mat, { transparent: true, depthWrite: false, alphaToCoverage: false, fog: false })
  mat.defines = { ...(mat.defines || {}), AMB_LUM: 1, MOUNTAIN: 1 }                   // the dusk sky's purple only sets how bright the shade is, as for clouds
  const lobes = new THREE.DataTexture(new Float32Array(256*192*4), 256, 192, THREE.RGBAFormat, THREE.FloatType)
  lobes.magFilter = lobes.minFilter = THREE.NearestFilter
  mat.uniforms.tLobe = { value: lobes }
  mat.uniforms.fogColor = { value: fogColor }
  // lobe shading off: the land's own normal models the forest; each clump only rounds it a little
  Object.assign(mat.uniforms, { uLobeShade: { value: .25 }, uDayRim: { value: 1 }, uRimTop: { value: .72 }, uAir: { value: 0 }, uHueVar: { value: .5 }, uSelfShade: { value: 0 },
    uMass: { value: 0 }, uWind: { value: 0 }, uShadowFillK: { value: 0 }, uLanternI: { value: 0 }, uMoonPaint: { value: 1 }, uFleck: { value: 0 }, uLightShape: { value: .15 } })
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false
  // underpaint: the silhouette filled flat in the shade colour, painted first, so no sky shows through between strokes; it stops a little
  // under the skyline, which stays the strokes' broken edge
  const under = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    uniforms: { uP0: palette[0], uP1: palette[1], uP2: palette[2], uAmbTint: U.uAmbTint, uNightGrade: U.uNightGrade },
    vertexShader: 'void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform vec3 uP0, uP1, uP2, uAmbTint; uniform float uNightGrade;
      ${GLSL_NIGHT}
      void main(){ gl_FragColor = vec4(gNightGrade(mix(uP1, uP2, .45)*dot(uAmbTint, vec3(.333))*1.05), 1.); }` }))
  under.frustumCulled = false
  // mist rising off the tops, as in the Spirited Away meadow shot: a soft veil standing on the skyline, thickest at the crest and thinning up
  // into the sky, in long banks. One continuous ring in the scene (not in the cards, whose joins would show), drawn after the clouds and
  // before the mountain cards: behind the range, in front of the clouds.
  const mist = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    uniforms: { uSunTint: U.uSunTint, uAmbTint: U.uAmbTint, uNightGrade: U.uNightGrade, uDay: U.uDay },
    transparent: true, depthTest: true, depthWrite: false,   // near things (the tree) cover it; clouds write no depth, so it stays in front of them
    vertexShader: 'attribute vec2 aM; varying vec2 vM; void main(){ vM = aM; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform vec3 uSunTint, uAmbTint; uniform float uNightGrade, uDay; varying vec2 vM;
      ${GLSL_NIGHT}
      float h(float x){ return fract(sin(x*127.1)*43758.5453); }
      // periodic value noise: p cells round the ring, so the mist closes on itself
      float n(float x, float p){ float i = floor(x), f = fract(x); f = f*f*(3. - 2.*f); return mix(h(mod(i, p)), h(mod(i + 1., p)), f); }
      void main(){
        float v = vM.y, a = vM.x;                                          // v: 0 at 10 m under the crest, .15 at it, 1 at 65 m above; a: turns
        float wisp = .5 + .5*smoothstep(.3, .7, n(a*40., 40.)*.75 + n(a*120., 120.)*.25);   // banks of ~100-300 m
        float lift = .55 + .45*n(a*25. + 3., 25.);
        float up = max(v - .15, 0.)/(.85*lift);
        float k = (1. - smoothstep(0., 1., up))*wisp*.42*smoothstep(.2, .5, uDay);          // soft: a gentle veil, never a hard white band
        vec3 c = gNightGrade(mix(vec3(dot(uAmbTint, vec3(.333))), mix(vec3(1.), uSunTint, .3), .55));
        gl_FragColor = vec4(c, k);
        #include <colorspace_fragment>
      }` }))
  mist.frustumCulled = false; mist.renderOrder = 20
  group.add(mist)
  const bakeScene = new THREE.Scene(); bakeScene.add(under, mesh)
  let cardList = [], dirty = true, bakedFor = 0
  // the bake holds linear, premultiplied paint: un-premultiply, convert, premultiply again (as the clouds do), or edges go pale
  const cardMat = tex => new THREE.ShaderMaterial({ uniforms: { map: { value: tex } }, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      void main(){ vec4 t = texture2D(map, vUv); if (t.a < .002) discard;
        vec3 c = t.rgb/t.a;
        c = mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c));
        gl_FragColor = vec4(c*t.a, t.a); }` })

  group.build = (scale = 1, seed = 1) => {
    for (const c of cardList){ group.remove(c.quad); c.quad.geometry.dispose(); c.quad.material.dispose(); c.rt.dispose() }
    cardList = []
    const r = mulberry32(seed*7919 + 11), b = newBuffer(), cards = [], H = makeLand(seed, scale), uPos = [], uIdx = [], mPos = [], mAt = [], mIdx = []
    const world = (az, rad) => [Math.cos(az)*rad, FOOT + H(az, rad), Math.sin(az)*rad]
    // the land's normal, from its height: x round the ring, z outward
    const normalAt = (az, rad) => { const e = 1.5, hx = (H(az + e/rad, rad) - H(az - e/rad, rad))/(2*e), hz = (H(az, rad + e) - H(az, rad - e))/(2*e)
      // slopes exaggerated 4.5x for the light only (the silhouette keeps its true height): at 1000 m a 15-degree flank barely differs from the next, and Ghibli paints them as distinct planes
      const t = [-Math.sin(az), 0, Math.cos(az)], o = [Math.cos(az), 0, Math.sin(az)], X = 4.5, n = [-X*hx*t[0] - X*hz*o[0], 1, -X*hx*t[2] - X*hz*o[2]], l = Math.hypot(...n); return n.map(v => v/l) }
    for (let c = 0; c < 360/SPAN; c++){
      const az0 = (c + .5)*SPAN*Math.PI/180, half = SPAN/2*Math.PI/180
      const clumps = []
      for (let rad = R_IN; rad <= R_OUT; rad += STEP*(.85 + r()*.3)){
        // each card also paints a margin of its neighbours' forest: the next card is drawn over this one where they overlap, and if it held
        // only its own clumps, its flat underpaint would cut this card's overhanging strokes off in a hard vertical seam
        const M = 45
        for (let s = -half*rad - M; s <= half*rad + M; s += STEP*(.85 + r()*.3)){
          const az = az0 + s/rad + (r() - .5)*STEP*.4/rad, rr = rad + (r() - .5)*STEP*.4, p = world(az, rr)
          if (p[1] < -20) continue                                       // only what is below the land's own foot
          if (rr < 800 && r() < .35) continue                            // the flat plain: a little sparser, it is seen edge-on
          const n = normalAt(az, rr), toward = -(n[0]*Math.cos(az) + n[2]*Math.sin(az))
          if (toward < -.7 && p[1] > 0) continue                         // the far side of a peak: never seen from the meadow
          // local clump coordinates for emitFoliage: x round the ring (units at R_MID), y up, z toward the viewer
          clumps.push({ c: [s/UNIT, p[1]/UNIT, (R_MID - rr)/UNIT], r: (1.05 + r()*.35), shelf: null, rim: 0, mass: [s/UNIT, p[1]/UNIT - 2, (R_MID - rr)/UNIT], az, rr, n })
        }
      }
      const fromV = b.pos.length/3, fromI = b.idx.length, fromH = b.held?.length ?? 0
      emitFoliage(SP, r, clumps, [0, 0, 0], 1, b)
      // into place: each stroke keeps its offset from its clump, set on the land at the clump's own place; its normal is the land's, rounded a
      // little by the clump's sphere
      for (let v = fromV, n = b.pos.length/3; v < n; v++){
        const id = b.patch[v*3 + 2], h = b.held[id], cl = clumps[id - fromH]
        const ox = b.pos[v*3] - h.c[0], oy = b.pos[v*3 + 1] - h.c[1], oz = b.pos[v*3 + 2] - h.c[2]
        const t = [-Math.sin(cl.az), 0, Math.cos(cl.az)], o = [Math.cos(cl.az), 0, Math.sin(cl.az)], base = world(cl.az, cl.rr)
        for (let k = 0; k < 3; k++) b.pos[v*3 + k] = base[k] + (t[k]*ox - o[k]*oz)*UNIT + (k === 1 ? oy*UNIT : 0)
        const sx = ox/h.r, sy = oy/h.r, sz = oz/h.r, nn = [cl.n[0], cl.n[1], cl.n[2]], nl = Math.hypot(...nn) || 1
        const st = [b.stroke[v*3], b.stroke[v*3 + 1], b.stroke[v*3 + 2]]
        for (let k = 0; k < 3; k++){ b.nor[v*3 + k] = nn[k]/nl; b.stroke[v*3 + k] = t[k]*st[0] - o[k]*st[2] + (k === 1 ? st[1] : 0); b.center[v*3 + k] = 0 }
        b.corner[v*2] *= UNIT; b.corner[v*2 + 1] *= UNIT
        for (let k = 0; k < 4; k++) b.wind[v*4 + k] = 0
        // calmer paint than a tree: the land's planes carry the light, so neighbouring strokes differ less (as the clouds)
        b.leaf[v*3] = lerp(.6, b.leaf[v*3], .35); b.leaf[v*3 + 2] = lerp(.5, b.leaf[v*3 + 2], .45)
      }
      for (let k = fromH; k < b.held.length && k < 256*192; k++){ const cl = clumps[k - fromH], q = world(cl.az, cl.rr); lobes.image.data.set([q[0], q[1], q[2], b.held[k].r*UNIT], k*4) }
      // the underpaint: the skyline of this stretch (the highest angle from the centre over every depth), as a strip at the mid radius
      const fromU = uIdx.length, steps = 120
      for (let k = 0; k <= steps; k++){
        const az = az0 - half + 2*half*k/steps
        let top = -1; for (let rad = R_IN; rad <= R_OUT; rad += 12) top = Math.max(top, (FOOT + H(az, rad))/rad)
        const v0 = uPos.length/3; uPos.push(Math.cos(az)*R_MID, -260, Math.sin(az)*R_MID, Math.cos(az)*R_MID, top*R_MID - 7, Math.sin(az)*R_MID)
        if (k) uIdx.push(v0 - 2, v0, v0 - 1, v0 - 1, v0, v0 + 1)
      }
      const out = new THREE.Vector3(Math.cos(az0), 0, Math.sin(az0)), right = new THREE.Vector3(-Math.sin(az0), 0, Math.cos(az0)), up = new THREE.Vector3(0, 1, 0)
      cards.push({ out, right, up, fromI, toI: b.idx.length, fromV, toV: b.pos.length/3, fromU, toU: uIdx.length })
    }
    lobes.needsUpdate = true
    // far to near within each card, so nearer slopes paint over the land behind them; each card's extent from the centre
    const idx = new Uint32Array(b.idx.length)
    for (const cd of cards){
      const n = (cd.toI - cd.fromI)/6, order = Array.from({ length: n }, (_, k) => k), key = new Float32Array(n)
      for (let k = 0; k < n; k++){ const v = b.idx[cd.fromI + k*6]*3; key[k] = b.pos[v]**2 + b.pos[v + 1]**2 + b.pos[v + 2]**2 }
      order.sort((x, y) => key[y] - key[x])
      order.forEach((sk, k) => { for (let q = 0; q < 6; q++) idx[cd.fromI + k*6 + q] = b.idx[cd.fromI + sk*6 + q] })
      let mx = .05, my = .02
      for (let v = cd.fromV; v < cd.toV; v++){
        const px = b.pos[v*3], py = b.pos[v*3 + 1], pz = b.pos[v*3 + 2], fan = Math.hypot(b.corner[v*2], b.corner[v*2 + 1])
        const d = px*cd.out.x + pz*cd.out.z
        mx = Math.max(mx, (Math.abs(px*cd.right.x + pz*cd.right.z) + fan)/d)
        my = Math.max(my, (Math.abs(py) + fan)/d)
      }
      cd.tx = mx*1.03; cd.ty = my*1.03
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2*cd.tx*R_MID, 2*cd.ty*R_MID), cardMat(rt.texture))
      quad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(cd.right, cd.up, cd.out.clone().negate())); quad.position.copy(cd.out).multiplyScalar(R_MID)
      quad.frustumCulled = false; quad.renderOrder = 30                    // after the clouds (11-13): the mountains stand in front of them
      group.add(quad); cardList.push({ ...cd, rt, quad })
    }
    mesh.geometry.dispose(); under.geometry.dispose(); mist.geometry.dispose()
    const g = new THREE.BufferGeometry(), put = (name, data, size) => g.setAttribute(name, new THREE.Float32BufferAttribute(data, size))
    put('position', b.pos, 3); put('normal', b.nor, 3); put('uv', b.uv, 2); put('aCorner', b.corner, 2); put('aStroke', b.stroke, 3)
    put('aLeaf', b.leaf, 3); put('aDab', b.dab, 1); put('aPatch', b.patch, 3); put('aWind', b.wind, 4); put('clusterCenter', b.center, 3)
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    mesh.geometry = g
    const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute(uPos, 3)); ug.setIndex(uIdx); under.geometry = ug
    // the mist ring: one strip round the whole skyline, from 10 m under the crest to 65 m above it
    for (let k = 0, steps = 1440; k <= steps; k++){
      const az = k/steps*Math.PI*2
      let top = -1; for (let rad = R_IN; rad <= R_OUT; rad += 12) top = Math.max(top, (FOOT + H(az, rad))/rad)
      const m0 = mPos.length/3, R = R_MID - 40, yt = top*R
      mPos.push(Math.cos(az)*R, yt - 10, Math.sin(az)*R, Math.cos(az)*R, yt + 65, Math.sin(az)*R); mAt.push(k/steps, 0, k/steps, 1)
      if (k) mIdx.push(m0 - 2, m0, m0 - 1, m0 - 1, m0, m0 + 1)
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3)); mg.setAttribute('aM', new THREE.Float32BufferAttribute(mAt, 2)); mg.setIndex(mIdx); mist.geometry = mg
    group.strokes = b.idx.length/6; group.clumps = b.held.length
    dirty = true
  }
  group.bake = renderer => {
    if (!group.visible) return
    if (renderer.domElement.height !== bakedFor) dirty = true
    if (!dirty || !cardList.length) return
    bakedFor = renderer.domElement.height
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha()
    const ph = renderer.domElement.height
    renderer.setClearColor(0x000000, 0)
    for (const c of cardList){
      const w = Math.min(2048, Math.max(32, Math.ceil(ph*c.tx/Math.tan(18*Math.PI/180)))), h = Math.min(1024, Math.max(32, Math.ceil(ph*c.ty/Math.tan(18*Math.PI/180))))
      if (c.rt.width !== w || c.rt.height !== h) c.rt.setSize(w, h)
      bakeCam.fov = 2*Math.atan(c.ty)*180/Math.PI; bakeCam.aspect = c.tx/c.ty; bakeCam.updateProjectionMatrix()
      bakeCam.position.set(0, 0, 0); bakeCam.up.copy(c.up); bakeCam.lookAt(c.out); bakeCam.updateMatrixWorld()
      mesh.geometry.setDrawRange(c.fromI, c.toI - c.fromI); under.geometry.setDrawRange(c.fromU, c.toU - c.fromU)
      renderer.setRenderTarget(c.rt); renderer.clear(); renderer.render(bakeScene, bakeCam)
    }
    mesh.geometry.setDrawRange(0, Infinity); under.geometry.setDrawRange(0, Infinity)
    renderer.setRenderTarget(prev); renderer.setClearColor(clear, ca)
    dirty = false
  }
  group.light = () => { dirty = true }
  group.update = camera => group.position.set(camera.position.x, 0, camera.position.z)
  let builtScale = 0
  group.set = (on, scale) => { group.visible = on; if (on && scale !== builtScale){ builtScale = scale; group.build(scale) } }
  group.set(true, 1)
  return group
}
const lerp = (a, b, t) => a + (b - a)*t
