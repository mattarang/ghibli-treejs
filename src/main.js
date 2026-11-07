import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import Stats from 'stats.js'
import { SPECIES, CROWNS, BRUSHES } from './presets.js'
import { generatePlant, generateGround, generateGrass, groundHeight, layoutScene, newBuffer, GESTURE_NAMES } from './generator.js'
import { makeBrushAtlas, makeFieldTexture, makeGrassAtlas } from './atlas.js'
import { U, patch, newPalette, setPalette, paletteUniforms } from './ghibli-patch.js'
import { makeSky } from './sky.js'
import { makeFoliageMaterial } from './foliage-material.js'
import { makeClouds } from './clouds.js'
import { makeCompare } from './compare.js'
import { applyLighting } from './lighting.js'

const qs = new URLSearchParams(location.search)
// An opaque context of our own: three turns alpha back on for any context it creates, and alpha-to-coverage would then leave partial alpha in the
// canvas, which reads back as a dark outline round every lit stroke
const canvas = document.createElement('canvas')
const renderer = new THREE.WebGLRenderer({ canvas, context: canvas.getContext('webgl2', { alpha: false, antialias: true, stencil: false, preserveDrawingBuffer: false }) })
const view = { resolution: Math.min(devicePixelRatio, 1.5), hold60: true }     // 1.5x with MSAA holds a stroke's edge; the extra pixels of 2x cost a third of the frame
renderer.setPixelRatio(view.resolution)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.shadowMap.autoUpdate = false                                   // redrawn every few frames, or at once when the light or plants change
renderer.toneMapping = THREE.LinearToneMapping       // palettes are painted in screen colour; Neutral subtracted the lowest channel, stripping red from every dark and saturating it
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xcdeaf6, 50, 400)
const camera = new THREE.PerspectiveCamera(36, innerWidth/innerHeight, .1, 1500)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true; controls.maxPolarAngle = Math.PI*.495; controls.minDistance = 2; controls.maxDistance = 320

const sun = new THREE.DirectionalLight(0xffffff, 3)
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0xd9e6ff, 0x7d6a36, .55)
scene.add(hemi)
const sky = makeSky()
const clouds = makeClouds()
scene.add(sky, clouds)
const L = { sun, hemi, sky, clouds, scene, reach: 80 }

// ---- parameters ----
const firstSpecies = qs.get('species') && SPECIES[qs.get('species')] ? qs.get('species') : 'Camphor tree'
const p = {
  species: firstSpecies, seed: +(qs.get('seed') || 7), ...structuredClone(SPECIES[firstSpecies]),
  showFoliage: qs.get('foliage') !== '0', grove: +(qs.get('grove') || 1), groveRadius: 18, bushes: 8, grass: 34000,
  time: +(qs.get('time') || 10.5), sunAzimuth: 35, sunHeight: 1.05, sunIntensity: 1, sunTint: '#ffffff', ambient: 1, shadowSoft: 5, clouds: 5, cloudSeed: 4, haze: .35, autoTime: false,
  lantern: 0, lanternColor: '#ffb35a', lanternX: 3, lanternY: 2.2, lanternZ: 4,
  windOn: true, wind: 1, autoRotate: false, exposure: 1,
}

// ---- materials ----
const pals = { foliage: newPalette(p.palette), bark: newPalette(p.bark), ground: newPalette(p.ground) }
const sssColor = { value: new THREE.Color(p.sss) }, rimColor = { value: new THREE.Color(p.rim) }
const brushKey = () => `${p.leaf}|${p.edge}`
const atlas = { tex: makeBrushAtlas(p.leaf, p.edge), key: brushKey() }

// a stroke: four vertices at one anchor, fanned out along its direction as seen by whoever is looking (the camera, or the
// light in the shadow pass)
const STROKE_PARS = 'attribute vec2 aCorner; attribute vec3 aStroke;'
const STROKE_FAN = `{ vec2 sd = (viewMatrix*vec4(aStroke, 0.)).xy; sd = normalize(sd + vec2(0., 1e-3));
  mvPosition.xy += sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y; }`
// only plates cast: the shadow of a tree is its big shapes, and they are fanned toward the light in the shadow pass
const FOLIAGE_DEPTH_FAN = `{ vec2 sd = (viewMatrix*vec4(aStroke, 0.)).xy; sd = normalize(sd + vec2(0., 1e-3)); mvPosition.xy += sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y; }`
// The field is painted in the ground: long drifts of colour running one way across the land, warped so they never look ruled,
// with their edges broken by a streak along the same direction.
const fieldTex = { value: makeFieldTexture() }                            // the field's noise, baked: a pixel of grass costs one lookup, not six fbms
const GROUND_SHADE = `{ vec2 w = vWPos.xz + 14.*vec2(fld(vWPos.xz*.012), fld(vWPos.xz*.012 + 7.));
  vec2 d = vec2(w.x*.82 + w.y*.57, w.y*.82 - w.x*.57);
  float drift = fld(d*vec2(.018, .055) + 2.), streak = fld(d*vec2(.12, .6));
  float field = smoothstep(.36, .64, drift + (streak - .5)*.16);
  kk = min(gLit/uSunUp, 1.)*(.54 + .24*field) + .1;
  gMod *= 1. + (drift - .5)*.12;
  gTint = mix(vec3(.92, 1., 1.03), vec3(1.05, 1.01, .9), field);
  float near = 1e3; for (int i = 0; i < 24; i++) near = min(near, length(vWPos.xz - uTrees[i].xy)/uTrees[i].z);
  near += (fld(vWPos.xz*1.3) - .5)*.8;
  gFoot = 1. - smoothstep(.5, 1.5, near);
  kk *= 1. - .34*gFoot; }`
const GROUND_PAL = 'pal = mix(pal, mix(vec3(.11, .1, .05), vec3(.26, .24, .1), smoothstep(.1, .5, kk)), gFoot*.72);'
const GROUND_FRAG = 'uniform vec3 uTrees[24]; uniform sampler2D tField; float gFoot = 0.; float fld(vec2 p){ return texture2D(tField, p/16.).r; }'
const GROUND_PIGMENT = '(fld(vWPos.xz*vec2(.2, .62)) - .5)*.9'
// Light is given out per mass, the way a painter blocks it in: the mass the sun favours most gets most of its area lit, the one it favours least
// a sliver, and each mass gets one terminator, placed to give it that share. Rebaked only when the sun or the plants change, into a small table
// the foliage reads once per vertex: each clump's place relative to its terminator.
const sunTable = new THREE.DataTexture(new Uint8Array(256*64*2), 256, 64, THREE.RGFormat)     // R: place against the light. G: the lobe's hue
sunTable.magFilter = sunTable.minFilter = THREE.NearestFilter
const SAME_SHADE = .42, HERO_SHARE = .62, LAST_SHARE = .15, LINE_LOW = -.1, LINE_HIGH = .15, OWN_TURN = .6
let heldClumps = []
// only clumps close enough to matter need testing, whatever the sun does: worked out once per rebuild, so dragging the sun stays smooth
const shaders = new Map()
function shadersOf(i, all){
  let list = shaders.get(i)
  if (!list){
    const a = heldClumps[i]; list = []
    for (const j of all){ if (j === i) continue
      const e = heldClumps[j], d = Math.hypot(e.c[0] - a.c[0], e.c[1] - a.c[1], e.c[2] - a.c[2])
      if (e.mass !== a.mass ? d < (a.r + e.r)*5 : d < (a.r + e.r)*2.2) list.push(j) }
    shaders.set(i, list)
  }
  return list
}
function bakeSun(){
  const s = U.uSunDir.value, data = sunTable.image.data, n = Math.min(heldClumps.length, data.length/2), plants = new Map()
  for (let i = 0; i < n; i++){
    const c = heldClumps[i]; let masses = plants.get(c.plant)
    if (!masses) plants.set(c.plant, masses = new Map())
    if (!masses.has(c.mass)) masses.set(c.mass, [])
    masses.get(c.mass).push(i)
  }
  const face = new Float32Array(n), up = Math.min(Math.max((s.y + .05)/.2, 0), 1)
  for (const masses of plants.values()){
    const groups = [...masses.values()], all = groups.flat()
    // a clump behind another mass on the way to the sun loses it, so masses throw shade across each other
    for (const i of all){
      const a = heldClumps[i], k = a.squash
      let vis = 1
      for (const j of shadersOf(i, all)){
        const e = heldClumps[j]
        const same = e.mass === a.mass                                  // within a mass the shade is gentle: enough to model its lobes, not enough to split it
        const x = e.c[0] - a.c[0], y = e.c[1] - a.c[1], z = e.c[2] - a.c[2], t = x*s.x + y*s.y + z*s.z
        if (t < a.r*.25) continue
        const yy = y/k, sy = s.y/k, tt = (x*s.x + yy*sy + z*s.z)/(s.x*s.x + sy*sy + s.z*s.z), px = x - tt*s.x, py = yy - tt*sy, pz = z - tt*s.z
        const q = Math.min(Math.max((.95 - Math.sqrt(px*px + py*py + pz*pz)/e.r)/.5, 0), 1)     // the shade of what really stands in the way: anything the sun can see past stays lit
        vis *= 1 - (same ? SAME_SHADE : .55)*q*q*(3 - 2*q)
      }
      face[i] = a.n[0]*s.x + a.n[1]*s.y + a.n[2]*s.z - (1 - vis)*1.1*U.uSelfShade.value
    }
    const mean = groups.map(g => g.reduce((t, i) => t + face[i], 0)/g.length), lo = Math.min(...mean), hi = Math.max(...mean)
    groups.forEach((g, k) => {
      const share = groups.length > 1 ? LAST_SHARE + (HERO_SHARE - LAST_SHARE)*((mean[k] - lo)/Math.max(hi - lo, 1e-3))**.8 : (HERO_SHARE + LAST_SHARE)/2
      const order = [...g].sort((p, q) => face[q] - face[p]), area = g.reduce((t, i) => t + heldClumps[i].r**2, 0)
      let seen = 0, line = face[order[order.length - 1]] - .5                 // walk down from the sunniest clump until the share is spent
      if (up === 0) line = 9
      else for (const i of order){ seen += heldClumps[i].r**2; if (seen >= share*up*area){ line = face[i] - 1e-3; break } }
      // the shader adds OWN_TURN of each stroke's own turn to the sun, so the clump's centre lands exactly on its place against the line
      // The share only arranges the light where the sun leaves it open. Foliage that faces the sun with nothing in the way is always lit, and foliage
      // turned away from it never is, whatever its mass's rank.
      if (up > 0) line = Math.min(Math.max(line, LINE_LOW), LINE_HIGH)
      for (const i of g){ const a = heldClumps[i]; data[i*2 + 1] = a.hue*255; data[i*2] = Math.min(Math.max((face[i] - line - OWN_TURN*(a.n[0]*s.x + a.n[1]*s.y + a.n[2]*s.z) + 2)/4, 0), 1)*255 }
    })
  }
  sunTable.needsUpdate = true
}
const foliageMat = makeFoliageMaterial(atlas.tex, sunTable, pals.foliage, sssColor, rimColor)
const foliageDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide, alphaMap: atlas.tex, alphaTest: .36 }),
  { wind: true, clumpExpr: 'clusterCenter', vertexPars: STROKE_PARS + ' attribute vec3 clusterCenter;', afterView: FOLIAGE_DEPTH_FAN })
// Bark runs along the wood: vB wraps the noise around each limb, so everything follows the grain and never seams.
//  furrows: long dark cracks, broken by the light bands
//  zones:   slow drifts between warm and cool bark, so a trunk is never one colour
//  lichen:  pale blotches on the warmer patches
//  moss:    greens that climb from the roots and sit on top of limbs, in painted shapes with firm edges
// Sun lands in broken plates on big wood; wood buried in the crown goes to the crown's shadow; the foot of the trunk takes the ground's colour.
const sink = { value: 1 }, crownDark = { value: 1 }    // both only mean anything with foliage there to hide the wood
const woodMat = patch(new THREE.MeshStandardMaterial({ color: p.bark[2], roughness: .9 }), {
  toon: true, wind: true, softRamp: true, pigment: 'gRidge*.3',
  // Wood inside a clump sinks behind the leaves in depth alone, the amount it is buried: it stays where it is on screen, so a limb runs up to the
  // foliage and goes in, and never shows as a loose piece floating in front of a clump's body. Its shadow doesn't move.
  afterClip: 'if (aLeaf.x < -.5 && uCrownDark < .5) gl_Position = vec4(2., 2., 2., 1.); else if (vLeafA.y > 0.){ vec4 sunk = projectionMatrix*vec4(mvPosition.xy, mvPosition.z - uSink*vLeafA.y, 1.); gl_Position.z = sunk.z/sunk.w*gl_Position.w; }',
  vertexPars: 'uniform float uSink, uCrownDark; attribute vec3 aLeaf; attribute vec3 clusterCenter; varying vec3 vLeafA; varying vec3 vB; varying vec3 vWN; varying float vH;',
  vertexBegin: 'vLeafA = vec3(aLeaf.xy, smoothstep(.1, .5, abs(aLeaf.z))); { float round = abs(aLeaf.z)*clusterCenter.x/.5; vB = vec3(cos(uv.x*6.28318)*round, sin(uv.x*6.28318)*round, uv.y); }   /* the way round the wood, in real distance: clusterCenter.x carries the girth */ vWN = normal; vH = position.y - clusterCenter.y;',
  fragmentPars: `varying vec3 vLeafA; varying vec3 vB; varying vec3 vWN; varying float vH; uniform vec3 uInk, uFootColor, uSunDir; uniform float uMoss, uBarkVar, uFurrow, uCrownDark;
    float gRidge = 0., gMoss = 0., gLichen = 0., gCrack = 0., gHue = 0.;`,
  color: `{ vec2 ring = vB.xy; float thick = vLeafA.x;
    float big = fbm3(vec3(ring*1.7, vB.z*.2) + 3.), fine = fbm3(vec3(ring*5.5, vB.z*.7));
    gRidge = ((big - .5)*1.1 + (fine - .5)*.4)*(.25 + .75*vLeafA.z);
    float flow = fbm3(vec3(ring*3.4, vB.z*.14) + 11.);
    gCrack = (1. - smoothstep(.0, .05, abs(flow - .5)))*thick*uFurrow*vLeafA.z;
    float zone = fbm3(vec3(ring*.9, vB.z*.08) + 21.);
    gHue = mix(.5, smoothstep(.38, .62, zone), vLeafA.z);     // joints stay neutral, so a limb and its parent paint as one form
    gLichen = smoothstep(.6, .63, fbm3(vec3(ring*3.2, vB.z*.8) + 31.))*smoothstep(.45, .6, zone)*thick*.75*uBarkVar*vLeafA.z;
    float up = normalize(vWN).y*.5 + .5, low = 1. - smoothstep(.1, 3.2, vH);
    float m = fbm3(vec3(ring*2.3, vB.z*.3) + 9.) + .1*low + .55*(up - .55);    // moss lies on what faces the sky and gathers at the foot
    gMoss = smoothstep(.79 - .3*uMoss, .82 - .3*uMoss, m)*smoothstep(.1, .6, thick)*vLeafA.z;
    gMod = 1. + gRidge*.08; diffuseColor.rgb *= gMod; }`,
  // bark is painted in three values: a deep side away from the sun, a middle, and mottled dabs of light on the sun side. Noise along the
  // grain breaks the borders between them into brush marks. Under a canopy the lit dabs thin out to the patches the sun reaches.
  shade: `{ vec2 rg = vB.xy; float thick = vLeafA.x, f = dot(normalize(vWN), uSunDir)*.5 + .5;
    float broad = fbm3(vec3(rg*3., vB.z*.6) + 41.) - .5, small = fbm3(vec3(rg*5., vB.z*1.1) + 5.) - .5;     // short dabs along the grain, not long rails
    float v = f + (broad*.3 + small*.08)*(.3 + .7*vLeafA.z);          // the form decides the value; noise only breaks its edge
    float seen = mix(1., gSeen, smoothstep(.12, .4, gNdl));   // near the terminator the form alone decides: a shadow map can only stair-step a surface it grazes
    float sun = max(seen, smoothstep(.5, .6, fbm3(vec3(rg*2.2, vB.z*.5) + gRidge*.5 + 17.)));
    kk = mix(.06, .3, smoothstep(.47, .62, v));
    kk = mix(kk, .76, smoothstep(.58, .7, v + (sun - 1.)*.3)*smoothstep(.15, .6, thick));
    kk += gRidge*.05 - gCrack*.2;
    }
    gTint = mix(vec3(.92, 1., 1.06), vec3(1.14, .99, .82), mix(.5, gHue, uBarkVar));
    { float deep = vLeafA.y*uCrownDark; kk = mix(kk, .1, deep); gMod = mix(gMod, 1., deep); gTint = mix(gTint, vec3(1.), deep); }`,
  palLine: `pal = mix(pal, vec3(.34, .4, .32)*(.55 + .8*clamp(kk, 0., 1.)), gLichen*.6*(1. - gCrack));
    pal = mix(pal, mix(vec3(.035, .06, .025), vec3(.14, .2, .05), smoothstep(.12, .62, kk)), gMoss*(1. - .6*gCrack));
    pal = mix(pal, uFootColor, smoothstep(.6, -.1, vH)*.6);
    pal = mix(pal, mix(uPal0, uInk, .2), vLeafA.y*uCrownDark);`,  // wood deep in the crown goes to its own darkest bark, barely touched by the crown's colour: never painted as foliage
  uniforms: { ...paletteUniforms(pals.bark), uInk: pals.foliage[0], uFootColor: pals.ground[0], uSink: sink, uCrownDark: crownDark } })
// ivy: its own leafy brushes and dark greens, standing a step off the bark
const ivyPal = newPalette(['#15352a', '#27583c', '#4f8848', '#94bc68'])
const ivyMat = patch(new THREE.MeshStandardMaterial({ color: '#27604e', roughness: .9, alphaMap: makeBrushAtlas('clover', 'spray', 5), alphaTest: .36, alphaToCoverage: true, side: THREE.DoubleSide }), {
  toon: true, wind: true, flatShadow: true, afterView: STROKE_FAN, pigment: '(gPaint - .5)*.8',
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; varying vec3 vLeafA;', vertexBegin: 'vLeafA = aLeaf;', fragmentPars: 'varying vec3 vLeafA; float gPaint = .5;',
  color: 'gPaint = texture2D(alphaMap, vAlphaMapUv).r;', shade: 'kk = gLit*.6 + gNdl*.2 + (vLeafA.y - .5)*.2 + .08;', uniforms: paletteUniforms(ivyPal) })
// solid cores share the calm shadow value exactly, so they melt into the plates
const coreDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { wind: true, clumpExpr: 'clusterCenter', vertexPars: 'attribute vec3 clusterCenter;' })
const woodDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { wind: true })
const groundMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1 }), { toon: true, shade: GROUND_SHADE, pigment: GROUND_PIGMENT, palLine: GROUND_PAL, fragmentPars: GROUND_FRAG, uniforms: { ...paletteUniforms(pals.ground), tField: fieldTex } })
// rooted: only the tips of a tuft move in the wind
const grassAtlas = makeGrassAtlas()
const grassMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1, alphaMap: grassAtlas, alphaTest: .42, side: THREE.DoubleSide }), {
  toon: true, wind: true, flatShadow: true, pigment: '(gPaint - .3)*.35*vU',
  afterView: STROKE_FAN + `if (aCorner.x > 0.){ vec3 sway = windOffset(wPos.xyz, vec3(aWind.x, 0., aWind.y), vec4(aWind.xy, .22, .9)); mvPosition.xyz += (viewMatrix*vec4(sway, 0.)).xyz; } vU = aCorner.x > 0. ? 1. : 0.;`,
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; varying vec3 vLeafA; varying float vU;', vertexBegin: 'vLeafA = aLeaf;', fragmentPars: GROUND_FRAG + ' varying vec3 vLeafA; varying float vU; float gPaint = .5;',
  palLine: GROUND_PAL.replace('gFoot*.72', 'gFoot*.45'),
  color: 'gPaint = texture2D(alphaMap, vAlphaMapUv).r;',
  normal: 'normal = normalize((viewMatrix*vec4(0., 1., 0., 0.)).xyz);',
  shade: GROUND_SHADE + ' kk += vU*(.1 + (vLeafA.y - .4)*.3 + (vLeafA.x > 1.5 ? .22 : 0.));',          // the root matches the field; only the tip leaves it
  uniforms: { ...paletteUniforms(pals.ground), tField: fieldTex } })

// ---- geometry ----
// the plates alone, for the shadow pass: most strokes are small and never needed there
function platesOf(b){
  const o = newBuffer(), each = [['pos', 3], ['nor', 3], ['uv', 2], ['wind', 4], ['center', 3], ['leaf', 3], ['corner', 2], ['stroke', 3]]
  for (let v = 0, n = b.dab.length; v < n; v += 4){
    if (b.dab[v] > .5) continue
    const base = o.pos.length/3
    for (const [k, size] of each) for (let i = v*size, e = (v + 4)*size; i < e; i++) o[k].push(b[k][i])
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return o
}

function toGeometry(b){
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  if (b.wind?.length) g.setAttribute('aWind', new THREE.Float32BufferAttribute(b.wind, 4))
  if (b.leaf?.length) g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(b.leaf, 3))
  if (b.center?.length) g.setAttribute('clusterCenter', new THREE.Float32BufferAttribute(b.center, 3))
  if (b.dab?.length) g.setAttribute('aDab', new THREE.Float32BufferAttribute(b.dab, 1))
  if (b.patch?.length) g.setAttribute('aPatch', new THREE.Float32BufferAttribute(b.patch, 3))
  if (b.corner?.length){ g.setAttribute('aCorner', new THREE.Float32BufferAttribute(b.corner, 2)); g.setAttribute('aStroke', new THREE.Float32BufferAttribute(b.stroke, 3)) }
  g.setIndex(b.idx)
  return g
}
const addMesh = (mat, depth, cast, name) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.name = name
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; if (depth) m.customDepthMaterial = depth; scene.add(m); return m }
const foliage = addMesh(foliageMat, null, false, 'foliage'), caster = addMesh(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), foliageDepth, true, 'caster'), wood = addMesh(woodMat, woodDepth, true, 'wood'), core = addMesh(foliageMat, coreDepth, true, 'core'), ivy = addMesh(ivyMat, null, false, 'ivy')
foliage.receiveShadow = core.receiveShadow = caster.receiveShadow = false
// nearest and most solid first: everything drawn after is rejected wherever something already stands in front of it, and the pricey wide
// surfaces (the field, then the sky) only pay for the pixels left over
const ground = addMesh(groundMat, null, false, 'ground'), grass = addMesh(grassMat, null, false, 'grass')
core.renderOrder = -.3; foliage.renderOrder = -.2; wood.renderOrder = -.1; ground.renderOrder = .1
ground.geometry.dispose(); ground.geometry = toGeometry(generateGround(620))

const lantern = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
scene.add(lantern)

const statsEl = document.getElementById('stats')
let size = '', placePerson = null
function setStats(ms, clumps){
  const strokes = (foliage.geometry.index?.count || 0)/6, tris = [foliage, wood, grass, core, ivy].reduce((n, m) => n + (m.geometry.index?.count || 0)/3, 0)
  statsEl.textContent = `${size} · ${clumps} clumps · ${strokes.toLocaleString()} strokes · ${(tris/1000).toFixed(0)}k tris · generated in ${ms.toFixed(0)} ms`
}

const trees = []
function rebuild(){
  U.uHueVar.value = p.hueVar; sink.value = p.showFoliage ? p.clumpRadius*p.size*1.5 : 0
  const t0 = performance.now(), woodB = newBuffer(), leafB = newBuffer(), coreB = newBuffer(), ivyB = newBuffer()
  const { plants, bushes } = layoutScene({ ...p, height: p.height*p.size, groveRadius: p.groveRadius*Math.max(1, p.size) })
  trees.length = 0
  for (const q of plants) trees.push({ x: q.x, z: q.z, r: p.trunkRadius*p.size*q.scale*(1 + p.flare*.5)*1.7 })
  for (const q of bushes) trees.push({ x: q.x, z: q.z, r: .5*q.scale })
  U.uTrees.value.forEach((v, i) => { const t = trees[i]; if (t) v.set(t.x, t.z, t.r); else v.set(1e5, 1e5, 1) })
  let clumps = 0
  for (const q of plants) clumps += generatePlant(p, q.seed, [q.x, groundHeight(q.x, q.z) - .08, q.z], q.scale, woodB, leafB, coreB, ivyB)
  const bush = { ...SPECIES['Round bush'] }
  for (const q of bushes) clumps += generatePlant(bush, q.seed, [q.x, groundHeight(q.x, q.z) - .05, q.z], q.scale, woodB, leafB, coreB)
  ivy.geometry.dispose(); ivy.geometry = ivyB.pos.length ? toGeometry(ivyB) : new THREE.BufferGeometry()
  core.geometry.dispose(); core.geometry = coreB.pos.length ? toGeometry(coreB) : new THREE.BufferGeometry()
  foliage.geometry.dispose(); foliage.geometry = toGeometry(leafB)
  heldClumps = leafB.held || []; shaders.clear()
  caster.geometry.dispose(); caster.geometry = toGeometry(platesOf(leafB))
  renderer.shadowMap.needsUpdate = true
  wood.geometry.dispose(); wood.geometry = toGeometry(woodB)
  if (atlas.key !== brushKey()){
    const old = atlas.tex; atlas.tex = makeBrushAtlas(p.leaf, p.edge); atlas.key = brushKey()
    foliageMat.uniforms.tBrush.value = foliageDepth.alphaMap = atlas.tex; old.dispose()
  }
  const reach = p.grove > 1 ? p.groveRadius*Math.max(1, p.size) + p.height*p.size + 8 : Math.max(26, p.height*p.size*2.6)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -reach; sc.right = sc.top = reach; sc.near = 1; sc.far = 420; sc.updateProjectionMatrix()
  L.reach = 100
  applyLighting(p, L); bakeSun()
  const first = heldClumps.filter(c => c.plant === 0), top = Math.max(0, ...first.map(c => c.c[1] + c.r*c.squash)), far = Math.max(0, ...first.map(c => Math.hypot(c.c[0], c.c[2]) + c.r))
  size = `${top.toFixed(1)} m tall · ${(far*2).toFixed(1)} m across`; placePerson?.()
  setStats(performance.now() - t0, clumps)
}
function rebuildGrass(){
  grass.geometry.dispose()
  grass.geometry = p.grass > 0 ? toGeometry(generateGrass(p.grass, 70, p.seed, trees)) : new THREE.BufferGeometry()
  grass.visible = p.grass > 0
}
let queued = 0
const later = () => { clearTimeout(queued); queued = setTimeout(() => { rebuild(); rebuildGrass() }, 60) }
function applyLook(){
  setPalette(pals.foliage, p.palette); setPalette(pals.bark, p.bark); setPalette(pals.ground, p.ground)
  woodMat.color.set(p.bark[2]); groundMat.color.set(p.ground[2]); grassMat.color.set(p.ground[2])
  sssColor.value.set(p.sss); rimColor.value.set(p.rim); U.uFleck.value = p.fleck; U.uMoss.value = p.moss
}
function frame(){
  const h = p.height*p.size, d = (p.grove > 1 ? h*3.2 + p.groveRadius*Math.max(1, p.size) : Math.max(h*3.1, h*(p.crownWidth || .5)*4.6))*Math.min(Math.max(1, .9/camera.aspect), 1.5)   // a narrow view stands further back
  camera.position.set(d*.72, h*.2, d*.72); controls.target.set(0, h*.5, 0); controls.update()
}

// ---- panel ----
const gui = new GUI({ title: 'Foliage' })
const compare = makeCompare(() => layout())
compare.species(p.species)
// a person for scale: 1.7 m tall, standing a little way out from the trunk
const person = new THREE.Group(), personMat = new THREE.MeshBasicMaterial({ color: '#c8402a' })
const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .95, 4, 12), personMat), head = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), personMat)
body.position.y = .7; head.position.y = 1.57; person.add(body, head); person.visible = false; scene.add(person)
placePerson = () => { const out = p.trunkRadius*p.size*3 + 1.2; person.position.set(out, groundHeight(out, 1.2), 1.2) }
const compareF = gui.addFolder('Compare').close()
compareF.add({ person: false }, 'person').name('Person for scale (1.7 m)').onChange(v => { person.visible = v; placePerson() })
compareF.add({ on: false }, 'on').name('Show reference').onChange(v => { compare.set(v); frame() })
compareF.add({ next(){ compare.next() } }, 'next').name('Next reference')
const treeF = gui.addFolder('Plant')
// wood alone, for reviewing structure: leaves, ivy and their shadows go, and buried wood comes back to its true depth
function applyFoliage(){
  foliage.visible = core.visible = caster.visible = ivy.visible = p.showFoliage
  sink.value = p.showFoliage ? p.clumpRadius*p.size*1.5 : 0; crownDark.value = p.showFoliage ? 1 : 0
  renderer.shadowMap.needsUpdate = true
}
applyFoliage()
treeF.add(p, 'showFoliage').name('Show foliage').onChange(applyFoliage)
treeF.add(p, 'species', Object.keys(SPECIES).sort()).name('Species').onChange(name => {
  compare.species(name)
  Object.assign(p, structuredClone(SPECIES[name])); applyLook(); gui.controllersRecursive().forEach(c => c.updateDisplay()); rebuild(); rebuildGrass(); frame() })
treeF.add(p, 'seed', 1, 9999, 1).name('Seed').onChange(later).listen()
treeF.add({ dice(){ p.seed = 1 + Math.floor(Math.random()*9998); rebuild(); rebuildGrass() } }, 'dice').name('New seed')
treeF.add(p, 'height', 1.5, 26, .1).name('Height').onChange(later)
treeF.add(p, 'size', .3, 4, .01).name('Mature size').onChange(() => { later(); frame() })
treeF.add(p, 'trunkRadius', .06, 1.4, .01).name('Trunk radius').onChange(later)
treeF.add(p, 'trunkFrac', .15, .85, .01).name('Bare trunk').onChange(later)
treeF.add(p, 'stems', 1, 3, .1).name('Sub-trunks (average)').onChange(later)
treeF.add(p, 'variety', 0, 1.5, .01).name('Seed variety').onChange(later)
treeF.add(p, 'forkHeight', .04, .4, .01).name('Bole height').onChange(later)
treeF.add(p, 'stemSpread', 4, 50, 1).name('Stem spread').onChange(later)
treeF.add(p, 'sinuous', 0, 1.5, .01).name('Sinuous').onChange(later)
treeF.add(p, 'gesture', GESTURE_NAMES).name('Gesture').onChange(later)
treeF.add(p, 'crownWidth', .08, 1.1, .01).name('Crown width').onChange(later)
treeF.add(p, 'asym', 0, .6, .01).name('Asymmetry').onChange(later)
treeF.add(p, 'windLean', 0, .7, .01).name('Wind lean').onChange(later)
treeF.add(p, 'notches', 0, 8, 1).name('Notches').onChange(later)
treeF.add(p, 'massVar', 0, 1, .01).name('Mass variety').onChange(later)
treeF.add(p, 'crown', CROWNS).name('Branch reach').onChange(later)
const branchF = treeF.addFolder('Branching').close()
branchF.add(p, 'levels', 1, 4, 1).name('Levels').onChange(later)
branchF.add(p, 'forkTop', 0, 1, 1).name('Sub-trunks end in forks').onChange(later)
branchF.add(p, 'sideShoots', 0, 10, 1).name('Side shoots').onChange(later)
branchF.add(p, 'whorls', 0, 8, 1).name('Limbs per tier').onChange(later)
branchF.add(p, 'opposite', 0, 1, 1).name('Opposite pairs').onChange(later)
branchF.add(p, 'fastigiate', 0, 40, 1).name('Upright limbs').onChange(later)
branchF.add(p, 'arch', 0, .4, .01).name('Arching limbs').onChange(later)
branchF.add(p, 'children', 2, 10, 1).name('Children').onChange(later)
branchF.add(p, 'childAngle', 8, 95, 1).name('Angle').onChange(later)
branchF.add(p, 'lengthRatio', .25, 1.3, .01).name('Length').onChange(later)
branchF.add(p, 'childStart', .05, .8, .01).name('First branch').onChange(later)
branchF.add(p, 'gnarl', 0, .5, .01).name('Gnarl').onChange(later)
branchF.add(p, 'upward', -.2, .2, .005).name('Tropism').onChange(later)
branchF.add(p, 'droop', 0, .3, .005).name('Droop').onChange(later)
branchF.add(p, 'lean', 0, .4, .01).name('Lean').onChange(later)
branchF.add(p, 'flare', 0, 2, .01).name('Root flare').onChange(later)
const leafF = gui.addFolder('Canopy')
leafF.add(p, 'shelves', 0, 10, 1).name('Crown shelves').onChange(later)
leafF.add(p, 'cover', 0, 1.5, .01).name('Clothe limbs').onChange(later)
leafF.add(p, 'lobes', 0, 20, 1).name('Lobes').onChange(later)
leafF.add(p, 'tighten', 0, .5, .01).name('Lobe separation').onChange(later)
leafF.add(p, 'shell', 0, 1, .01).name('Foliage shell').onChange(later)
leafF.add(p, 'crownLine', 0, .8, .01).name('Crown line').onChange(later)
leafF.add(p, 'clumpRadius', .3, 3.5, .01).name('Clump size').onChange(later)
leafF.add(p, 'clumpVar', 0, .8, .01).name('Size variation').onChange(later)
leafF.add(p, 'clumpsPerTip', .3, 3, .05).name('Clumps per tip').onChange(later)
leafF.add(p, 'clumpSpacing', .2, 1.3, .01).name('Spacing').onChange(later)
leafF.add(p, 'boughGap', .3, 1.2, .01).name('Gap between boughs').onChange(later)
leafF.add(p, 'squash', .3, 2, .01).name('Height of clumps').onChange(later)
leafF.add(p, 'massBlend', 0, .9, .01).name('Merge into masses').onChange(later)
leafF.add(p, 'crownBlend', 0, 1, .01).name('Light as one crown').onChange(later)
leafF.add(p, 'cardSize', .3, 3.5, .01).name('Dab size').onChange(later)
leafF.add(p, 'realMarks').name('Real-size brush marks').onChange(later)
leafF.add(p, 'plateSize', .3, 1.8, .01).name('Plate size').onChange(later)
leafF.add(p, 'plates', 0, 8, .1).name('Plates per lobe').onChange(later)
leafF.add(p, 'brushWidth', .12, 1, .01).name('Brush width').onChange(later)
leafF.add(p, 'coverage', .3, 4, .01).name('Paint density').onChange(later)
leafF.add(p, 'strokeAngle', -90, 90, 1).name('Stroke direction').onChange(later)
leafF.add(p, 'strokeJitter', 0, 90, 1).name('Stroke looseness').onChange(later)
leafF.add(p, 'lift', 0, 2, .01).name('Crown lift').onChange(later)
leafF.add(p, 'hang', 0, 4, .1).name('Hanging strands').onChange(later)
leafF.add(p, 'strandLength', .15, 1, .01).name('Strand length').onChange(later)
leafF.add(p, 'leaf', BRUSHES).name('Body brush').onChange(later)
leafF.add(p, 'edge', BRUSHES).name('Edge brush').onChange(later)
leafF.add(p, 'strays', 0, 1, .01).name('Stray strokes').onChange(later)
leafF.add(p, 'core').name('Underpainting').onChange(later)
const colF = gui.addFolder('Colour').close()
for (const [key, label] of [['palette', 'Foliage'], ['bark', 'Bark'], ['ground', 'Ground']])
  [`${label} shadow`, `${label} dark`, `${label} mid`, `${label} light`].forEach((n, i) =>
    colF.addColor(p[key], String(i)).name(n).onChange(applyLook))
colF.addColor(p, 'sss').name('Backlight').onChange(applyLook)
colF.addColor(p, 'rim').name('Rim').onChange(applyLook)
const sceneF = gui.addFolder('Scene').close()
sceneF.add(p, 'grove', 1, 12, 1).name('Trees').onChange(later)
sceneF.add(p, 'groveRadius', 8, 40, .5).name('Grove radius').onChange(later)
sceneF.add(p, 'bushes', 0, 40, 1).name('Bushes').onChange(later)
sceneF.add(p, 'grass', 0, 90000, 500).name('Grass tufts').onChange(later)
const lightF = gui.addFolder('Light')
const relight = () => { applyLighting(p, L); bakeSun(); renderer.shadowMap.needsUpdate = true }
lightF.add(p, 'time', 0, 24, .05).name('Time of day').onChange(relight).listen()
lightF.add({ preset: 'Morning' }, 'preset', { Dawn: 6, Morning: 10.5, Noon: 12.5, 'Golden hour': 17, Sunset: 18.4, Dusk: 19.4, Night: 23 }).name('Jump to').onChange(v => { p.time = v; relight() })
lightF.add(p, 'autoTime').name('Run the clock')
lightF.add(p, 'sunAzimuth', -180, 180, 1).name('Sun direction').onChange(relight).listen()
lightF.add(p, 'sunHeight', .15, 1.5, .01).name('Sun height').onChange(relight)
lightF.add(p, 'sunIntensity', 0, 2.5, .01).name('Sun strength').onChange(relight)
lightF.addColor(p, 'sunTint').name('Sun tint').onChange(relight)
lightF.add(p, 'ambient', 0, 2, .01).name('Ambient').onChange(relight)
lightF.add(p, 'shadowSoft', 0, 16, .1).name('Shadow softness').onChange(relight)
const reCloud = () => clouds.build(p.clouds, p.cloudSeed)
lightF.add(p, 'clouds', 0, 14, 1).name('Clouds').onChange(reCloud)
lightF.add(p, 'cloudSeed', 1, 99, 1).name('Cloud seed').onChange(reCloud)
lightF.add(p, 'haze', 0, .95, .01).name('Haze').onChange(relight)
const lampF = lightF.addFolder('Lantern').close()
const lamp = () => { U.uLanternI.value = p.lantern*2; U.uLanternColor.value.set(p.lanternColor); U.uLanternPos.value.set(p.lanternX, p.lanternY, p.lanternZ)
  lantern.position.copy(U.uLanternPos.value); lantern.material.color.set(p.lanternColor); lantern.visible = p.lantern > 0 }
lampF.add(p, 'lantern', 0, 3, .01).name('Strength').onChange(lamp)
lampF.addColor(p, 'lanternColor').name('Colour').onChange(lamp)
lampF.add(p, 'lanternX', -20, 20, .1).name('X').onChange(lamp)
lampF.add(p, 'lanternY', .2, 16, .1).name('Height').onChange(lamp)
lampF.add(p, 'lanternZ', -20, 20, .1).name('Z').onChange(lamp)
const shadeF = gui.addFolder('Shading').close()
const uni = (obj, key, name, a, b, s) => shadeF.add(obj[key], 'value', a, b, s).name(name)
uni(U, 'uPaletteMix', 'Painted palette', 0, 1, .01)
uni(U, 'uBands', 'Bands', 1, 6, 1)
uni(U, 'uSoft', 'Band softness', .01, .5, .01)
uni(U, 'uToonMix', 'Toon strength', 0, 1, .01)
uni(U, 'uSss', 'Backlight glow', 0, 1.5, .01)
uni(U, 'uRim', 'Rim light', 0, 1.5, .01)
shadeF.add(p, 'fleck', 0, 1, .01).name('Leaf flecks').onChange(applyLook)
uni(U, 'uFleckScale', 'Fleck scale', .5, 8, .1)
uni(U, 'uLightShape', 'Light shapes', 0, 1, .01)
uni(U, 'uSelfShade', 'Mass shadows', 0, 1, .01)
shadeF.add(p, 'hueVar', 0, 2, .01).name('Hue variation').onChange(v => { U.uHueVar.value = v })
uni(U, 'uAir', 'Air in the shadows', 0, 1, .01)
uni(U, 'uPigment', 'Pigment variation', 0, 2.5, .01)
uni(U, 'uShadowFillK', 'Warm shadow fill', 0, .6, .01)
shadeF.add(p, 'exposure', .3, 2, .01).name('Exposure').onChange(v => { renderer.toneMappingExposure = v })
const barkF = gui.addFolder('Bark')
barkF.add(p, 'moss', 0, 1, .01).name('Moss').onChange(applyLook)
barkF.add(p, 'ivy', 0, 1, .01).name('Ivy').onChange(later)
barkF.add(U.uBarkVar, 'value', 0, 1.5, .01).name('Colour variation')
barkF.add(U.uFurrow, 'value', 0, 1.5, .01).name('Furrows')
barkF.add(p, 'roots', 0, 2, .01).name('Surface roots').onChange(later)
const windF = gui.addFolder('Wind').close()
windF.add(p, 'windOn').name('Wind').onChange(v => { U.uWind.value = v ? 1 : 0 })
uni2(U.uSway, 'Sway', 0, 3); uni2(U.uFlutter, 'Flutter', 0, .15)
function uni2(u, n, a, b){ windF.add(u, 'value', a, b, .001).name(n) }
const outF = gui.addFolder('Output').close()
const resCtl = outF.add(view, 'resolution', .75, 2, .125).name('Resolution').onChange(v => renderer.setPixelRatio(v))
outF.add(view, 'hold60').name('Hold 60 fps')
outF.add({ show: true }, 'show').name('Profiling stats').onChange(v => { statsBar.style.display = v ? 'flex' : 'none' })
outF.add(p, 'autoRotate').name('Turntable').onChange(v => { controls.autoRotate = v })
outF.add({ frame }, 'frame').name('Frame the plant')
outF.add({ png(){ renderer.render(scene, camera); renderer.domElement.toBlob(b => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${p.species.replace(/ /g, '-').toLowerCase()}-${p.seed}.png`; a.click(); URL.revokeObjectURL(a.href) }) } }, 'png').name('Save image')
outF.add({ copy(){ navigator.clipboard?.writeText(JSON.stringify(p, null, 1)) } }, 'copy').name('Copy settings')

// ---- input ----
let dragging = null
renderer.domElement.addEventListener('pointerdown', e => { if (e.shiftKey){ dragging = { x: e.clientX, y: e.clientY }; controls.enabled = false } })
addEventListener('pointermove', e => { if (!dragging) return
  p.sunAzimuth = ((p.sunAzimuth + (e.clientX - dragging.x)*.4 + 540)%360) - 180
  p.time = Math.min(18.9, Math.max(5.1, p.time - (e.clientY - dragging.y)*.015))
  dragging = { x: e.clientX, y: e.clientY }; relight() })
addEventListener('pointerup', () => { dragging = null; controls.enabled = true })
function layout(){ const w = innerWidth - compare.width - (compare.width && !gui._closed ? gui.domElement.offsetWidth : 0); camera.aspect = w/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(w, innerHeight); renderer.domElement.style.marginLeft = compare.width + 'px' }
addEventListener('resize', layout)

// ---- go ----
applyLook(); clouds.build(p.clouds, p.cloudSeed); rebuild(); rebuildGrass(); lamp(); frame()
if (qs.has('close')) gui.close()
window.__foliage = { gui, p, U, view, renderer, scene, camera, controls, rebuild, relight, frame, foliage, wood, sun }
// profiling: frame rate and frame time, then draw calls and triangles per frame (these include the shadow pass)
const statsBar = document.createElement('div')
statsBar.style.cssText = 'position:fixed;left:8px;top:8px;display:flex;gap:4px;z-index:20;pointer-events:none'
document.body.append(statsBar)
const statsPanel = (panel, custom) => { const st = new Stats(); st.dom.style.position = 'static'
  const added = custom ? st.addPanel(custom) : null; st.showPanel(custom ? 3 : panel); statsBar.append(st.dom); return { st, added } }
const fps = statsPanel(0), ms = statsPanel(1)
const calls = statsPanel(0, new Stats.Panel('calls', '#ff8', '#221')), tris = statsPanel(0, new Stats.Panel('k tris', '#8ef', '#012'))
let peakCalls = 1, peakTris = 1, frameNo = 0
// a big window can outrun the card: step resolution down rather than miss frames. Only ever down, so it never hunts; the slider sets it back.
let heldFrom = 0, heldFrames = -120, heldSlow = 0                         // ignore the first two seconds: shaders are still compiling
function holdFrameRate(){
  if (!view.hold60) return
  if (++heldFrames === 0) heldFrom = performance.now()
  if (heldFrames < 60) return
  const now = performance.now(), ms = (now - heldFrom)/heldFrames
  heldFrom = now; heldFrames = 0
  heldSlow = ms > 17.4 && ms < 80 ? heldSlow + 1 : 0
  if (heldSlow > 1 && view.resolution > 1){ view.resolution -= .125; heldSlow = 0; renderer.setPixelRatio(view.resolution); resCtl.updateDisplay() }
}
let last = performance.now()
renderer.setAnimationLoop(now => {
  fps.st.begin(); ms.st.begin()
  const dt = Math.min((now - last)/1000, .1); last = now
  U.uTime.value += dt; sky.tick(U.uTime.value)
  if (p.autoTime){ p.time = (p.time + dt*.4)%24; relight() }
  controls.update(); sky.position.copy(camera.position); sky.scale.setScalar(1000); clouds.position.copy(camera.position)
  if (++frameNo%3 === 0) renderer.shadowMap.needsUpdate = true
  holdFrameRate()
  renderer.render(scene, camera)
  fps.st.end(); ms.st.end()
  const info = renderer.info.render, t = info.triangles/1000
  peakCalls = Math.max(peakCalls, info.calls); peakTris = Math.max(peakTris, t)
  calls.added.update(info.calls, peakCalls); tris.added.update(t, peakTris)
})
