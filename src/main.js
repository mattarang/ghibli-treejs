import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { SPECIES, CROWNS, BRUSHES } from './presets.js'
import { generatePlant, generateGround, generateGrass, groundHeight, layoutScene, newBuffer } from './generator.js'
import { makeBrushAtlas, makeGrassAtlas } from './atlas.js'
import { U, patch, newPalette, setPalette, paletteUniforms } from './ghibli-patch.js'
import { makeSky } from './sky.js'
import { applyLighting } from './lighting.js'

const qs = new URLSearchParams(location.search)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.NeutralToneMapping
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xcdeaf6, 50, 400)
const camera = new THREE.PerspectiveCamera(36, innerWidth/innerHeight, .1, 1500)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true; controls.maxPolarAngle = Math.PI*.495; controls.minDistance = 2; controls.maxDistance = 140

const sun = new THREE.DirectionalLight(0xffffff, 3)
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0006; sun.shadow.normalBias = .05
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0xd9e6ff, 0x7d6a36, .55)
scene.add(hemi)
const sky = makeSky()
scene.add(sky)
const L = { sun, hemi, sky, scene, reach: 80 }

// ---- parameters ----
const firstSpecies = qs.get('species') && SPECIES[qs.get('species')] ? qs.get('species') : 'Great camphor'
const p = {
  species: firstSpecies, seed: +(qs.get('seed') || 7), ...structuredClone(SPECIES[firstSpecies]),
  grove: +(qs.get('grove') || 1), groveRadius: 18, bushes: 8, grass: 7000,
  time: +(qs.get('time') || 10.5), sunAzimuth: 35, sunHeight: 1.05, sunIntensity: 1, sunTint: '#ffffff', ambient: 1, shadowSoft: 5, clouds: .55, haze: .35, autoTime: false,
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
const foliageOpts = {
  toon: true, puff: true, sss: true, rim: true, flecks: true, wind: true, clumpExpr: 'clusterCenter', afterView: STROKE_FAN,
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; varying vec3 vLeafA;', vertexBegin: 'vLeafA = aLeaf;', fragmentPars: 'varying vec3 vLeafA; float gPaint = .5, gEdge = 0.;',
  pigment: '(gPaint - .5)*1.3 + gEdge*.16',
  color: `{ vec4 tx = texture2D(alphaMap, vAlphaMapUv); gPaint = tx.r; gEdge = 1. - smoothstep(.5, .98, tx.b); }
    gMod = 1. + (vLeafA.y - .5)*.2;
    diffuseColor.rgb = mix(uPal1, uPal2, .25 + .5*vLeafA.y)*(.55 + .45*vLeafA.x)*gMod;`,
  // a stroke facing the sun keeps a mid value even when shadowed by its neighbours: shadow on a canopy darkens, it doesn't black out
  // scatter gathers where light meets shadow: shadow masses stay calm and flat, the dabs live on the lit edge
  shade: `{ float base = (kk*.62 + gNdl*.36)*(.6 + .4*vLeafA.x) + (vLeafA.x - .5)*.24;
      kk = .12 + .86*(base + (gFleck + (vLeafA.z - .5)*uEdgeWobble*.34)*smoothstep(.12, .42, base)); }
    gTint = mix(vec3(.8, 1., 1.1), vec3(1.14, 1.03, .78), vLeafA.y);          // each lobe leans blue-green or yellow-green
    if (vLeafA.x < .08){ kk = .24; gGlow = vec3(0.); }`        ,
  uniforms: { ...paletteUniforms(pals.foliage), uSssColor: sssColor, uRimColor: rimColor },
}
// The field is painted in the ground: long drifts of colour running one way across the land, warped so they never look ruled,
// with their edges broken by a streak along the same direction.
const GROUND_SHADE = `{ vec2 w = vWPos.xz + 14.*vec2(fbm2(vWPos.xz*.012), fbm2(vWPos.xz*.012 + 7.));
  vec2 d = vec2(w.x*.82 + w.y*.57, w.y*.82 - w.x*.57);
  float drift = fbm2(d*vec2(.018, .055) + 2.), streak = fbm2(d*vec2(.12, .6));
  float field = smoothstep(.36, .64, drift + (streak - .5)*.16);
  kk = min(gLit/uSunUp, 1.)*(.54 + .24*field) + .1;
  gMod *= 1. + (drift - .5)*.12;
  gTint = mix(vec3(.92, 1., 1.03), vec3(1.05, 1.01, .9), field); }`
const GROUND_PIGMENT = '(fbm2(vWPos.xz*vec2(.2, .62)) - .5)*.9'
const foliageMat = patch(new THREE.MeshStandardMaterial({ alphaMap: atlas.tex, alphaTest: .36, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .85 }), foliageOpts)
const foliageDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide, alphaMap: atlas.tex, alphaTest: .36 }),
  { wind: true, clumpExpr: 'clusterCenter', vertexPars: STROKE_PARS + ' attribute vec3 clusterCenter;', afterView: STROKE_FAN })
// bark runs along the limb: vB wraps the noise around the branch, so ridges flow with the wood and never seam. Ridges push the
// light bands around, so sun lands on the bark in broken plates, and moss settles into what the sun misses.
const woodMat = patch(new THREE.MeshStandardMaterial({ color: p.bark[2], roughness: .9 }), {
  toon: true, wind: true, softRamp: true, pigment: 'gRidge*.5',
  vertexPars: 'attribute vec3 aLeaf; varying vec3 vLeafA; varying vec3 vB;', vertexBegin: 'vLeafA = aLeaf; vB = vec3(cos(uv.x*6.28318), sin(uv.x*6.28318), uv.y);',
  fragmentPars: 'varying vec3 vLeafA; varying vec3 vB; float gRidge = 0., gMoss = 0.;',
  color: `{ vec2 ring = normalize(vB.xy);     // vB cuts across the facets; on the unit circle the noise stays round on thin limbs
    float big = fbm3(vec3(ring*1.7, vB.z*.2) + 3.), fine = fbm3(vec3(ring*5.5, vB.z*.7));
    gRidge = ((big - .5)*1.1 + (fine - .5)*.4)*(.25 + .75*vLeafA.z);       // plain at joints, so limb and parent paint as one form
    gMoss = smoothstep(.48, .68, fbm3(vec3(ring*1.1, vB.z*.45) + 9.))*vLeafA.z;
    gMod = 1. + gRidge*.08; diffuseColor.rgb *= gMod; }`,
  // a simple dark column: form from the side light, a little ridge, and broken plates of sun on the big wood only
  shade: `{ float thick = vLeafA.x, dapple = smoothstep(.5, .7, fbm3(vec3(normalize(vB.xy)*2.2, vB.z*.5) + gRidge*.5 + 17.))*thick*vLeafA.z;
    kk = min(max(gLit*.56, dapple*gNdl*.56) + gNdl*.2 + gRidge*.14*(.4 + .6*thick) + .12, .68); }
    gTint = mix(vec3(1.05, 1., .92), vec3(.78, 1.08, .74), gMoss*(1. - smoothstep(.3, .7, kk)));`,
  uniforms: paletteUniforms(pals.bark) })
const woodDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { wind: true })
const groundMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1 }), { toon: true, shade: GROUND_SHADE, pigment: GROUND_PIGMENT, uniforms: paletteUniforms(pals.ground) })
// rooted: only the tips of a tuft move in the wind
const grassAtlas = makeGrassAtlas()
const grassMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1, alphaMap: grassAtlas, alphaTest: .42, side: THREE.DoubleSide }), {
  toon: true, wind: true, pigment: '(gPaint - .45)*.7',
  afterView: STROKE_FAN + `if (aCorner.x > 0.){ vec3 sway = windOffset(wPos.xyz, vec3(aWind.x, 0., aWind.y), vec4(aWind.xy, .22, .9)); mvPosition.xyz += (viewMatrix*vec4(sway, 0.)).xyz; }`,
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; varying vec3 vLeafA;', vertexBegin: 'vLeafA = aLeaf;', fragmentPars: 'varying vec3 vLeafA; float gPaint = .5;',
  color: 'gPaint = texture2D(alphaMap, vAlphaMapUv).r;',
  normal: 'normal = normalize((viewMatrix*vec4(0., 1., 0., 0.)).xyz);',
  shade: GROUND_SHADE + ' kk += (vLeafA.y - .55)*.34;',
  uniforms: paletteUniforms(pals.ground) })

// ---- geometry ----
function toGeometry(b, smooth = false){
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  if (b.wind?.length) g.setAttribute('aWind', new THREE.Float32BufferAttribute(b.wind, 4))
  if (b.leaf?.length) g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(b.leaf, 3))
  if (b.center?.length) g.setAttribute('clusterCenter', new THREE.Float32BufferAttribute(b.center, 3))
  if (b.corner?.length){ g.setAttribute('aCorner', new THREE.Float32BufferAttribute(b.corner, 2)); g.setAttribute('aStroke', new THREE.Float32BufferAttribute(b.stroke, 3)) }
  g.setIndex(b.idx)
  if (smooth) g.computeVertexNormals()
  return g
}
const addMesh = (mat, depth, cast, name) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.name = name
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; if (depth) m.customDepthMaterial = depth; scene.add(m); return m }
const foliage = addMesh(foliageMat, foliageDepth, true, 'foliage'), wood = addMesh(woodMat, woodDepth, true, 'wood')
const ground = addMesh(groundMat, null, false, 'ground'), grass = addMesh(grassMat, null, false, 'grass')
ground.geometry.dispose(); ground.geometry = toGeometry(generateGround(620))

const lantern = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
scene.add(lantern)

const statsEl = document.getElementById('stats')
function setStats(ms, clumps){
  const strokes = (foliage.geometry.index?.count || 0)/6, tris = [foliage, wood, grass].reduce((n, m) => n + (m.geometry.index?.count || 0)/3, 0)
  statsEl.textContent = `${clumps} clumps · ${strokes.toLocaleString()} strokes · ${(tris/1000).toFixed(0)}k tris · generated in ${ms.toFixed(0)} ms`
}

function rebuild(){
  const t0 = performance.now(), woodB = newBuffer(), leafB = newBuffer()
  const { plants, bushes } = layoutScene(p)
  let clumps = 0
  for (const q of plants) clumps += generatePlant(p, q.seed, [q.x, groundHeight(q.x, q.z) - .08, q.z], q.scale, woodB, leafB)
  const bush = { ...SPECIES['Round bush'] }
  for (const q of bushes) clumps += generatePlant(bush, q.seed, [q.x, groundHeight(q.x, q.z) - .05, q.z], q.scale, woodB, leafB)
  foliage.geometry.dispose(); foliage.geometry = toGeometry(leafB)
  wood.geometry.dispose(); wood.geometry = toGeometry(woodB, true)
  if (atlas.key !== brushKey()){
    const old = atlas.tex; atlas.tex = makeBrushAtlas(p.leaf, p.edge); atlas.key = brushKey()
    foliageMat.alphaMap = foliageDepth.alphaMap = atlas.tex; old.dispose()
  }
  const reach = p.grove > 1 ? p.groveRadius + p.height + 8 : Math.max(26, p.height*2.6)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -reach; sc.right = sc.top = reach; sc.near = 1; sc.far = 220; sc.updateProjectionMatrix()
  L.reach = 100
  applyLighting(p, L)
  setStats(performance.now() - t0, clumps)
}
function rebuildGrass(){
  grass.geometry.dispose()
  grass.geometry = p.grass > 0 ? toGeometry(generateGrass(p.grass, 70, p.seed)) : new THREE.BufferGeometry()
  grass.visible = p.grass > 0
}
let queued = 0
const later = () => { clearTimeout(queued); queued = setTimeout(() => { rebuild(); rebuildGrass() }, 60) }
function applyLook(){
  setPalette(pals.foliage, p.palette); setPalette(pals.bark, p.bark); setPalette(pals.ground, p.ground)
  woodMat.color.set(p.bark[2]); groundMat.color.set(p.ground[2]); grassMat.color.set(p.ground[2])
  sssColor.value.set(p.sss); rimColor.value.set(p.rim); U.uFleck.value = p.fleck
}
function frame(){
  const h = p.height, d = p.grove > 1 ? h*3.2 + p.groveRadius : Math.max(h*3.1, h*p.lengthRatio*3.7)
  camera.position.set(d*.72, h*.2, d*.72); controls.target.set(0, h*.5, 0); controls.update()
}

// ---- panel ----
const gui = new GUI({ title: 'Foliage' })
const treeF = gui.addFolder('Plant')
treeF.add(p, 'species', Object.keys(SPECIES)).name('Species').onChange(name => {
  Object.assign(p, structuredClone(SPECIES[name])); applyLook(); gui.controllersRecursive().forEach(c => c.updateDisplay()); rebuild(); rebuildGrass(); frame() })
treeF.add(p, 'seed', 1, 9999, 1).name('Seed').onChange(later).listen()
treeF.add({ dice(){ p.seed = 1 + Math.floor(Math.random()*9998); rebuild(); rebuildGrass() } }, 'dice').name('New seed')
treeF.add(p, 'height', 1.5, 26, .1).name('Height').onChange(later)
treeF.add(p, 'trunkRadius', .06, 1.4, .01).name('Trunk radius').onChange(later)
treeF.add(p, 'trunkFrac', .15, .85, .01).name('Bare trunk').onChange(later)
treeF.add(p, 'crown', CROWNS).name('Crown').onChange(later)
const branchF = treeF.addFolder('Branching').close()
branchF.add(p, 'levels', 1, 4, 1).name('Levels').onChange(later)
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
leafF.add(p, 'clumpRadius', .3, 3.5, .01).name('Clump size').onChange(later)
leafF.add(p, 'clumpVar', 0, .8, .01).name('Size variation').onChange(later)
leafF.add(p, 'clumpsPerTip', .3, 3, .05).name('Clumps per tip').onChange(later)
leafF.add(p, 'clumpSpacing', .2, 1.3, .01).name('Spacing').onChange(later)
leafF.add(p, 'squash', .3, 2, .01).name('Height of clumps').onChange(later)
leafF.add(p, 'massBlend', 0, .9, .01).name('Merge into masses').onChange(later)
leafF.add(p, 'cardSize', .3, 3.5, .01).name('Brush size').onChange(later)
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
sceneF.add(p, 'grass', 0, 30000, 100).name('Grass tufts').onChange(later)
const lightF = gui.addFolder('Light')
const relight = () => applyLighting(p, L)
lightF.add(p, 'time', 0, 24, .05).name('Time of day').onChange(relight).listen()
lightF.add({ preset: 'Morning' }, 'preset', { Dawn: 6, Morning: 10.5, Noon: 12.5, 'Golden hour': 17, Sunset: 18.4, Dusk: 19.4, Night: 23 }).name('Jump to').onChange(v => { p.time = v; relight() })
lightF.add(p, 'autoTime').name('Run the clock')
lightF.add(p, 'sunAzimuth', -180, 180, 1).name('Sun direction').onChange(relight).listen()
lightF.add(p, 'sunHeight', .15, 1.5, .01).name('Sun height').onChange(relight)
lightF.add(p, 'sunIntensity', 0, 2.5, .01).name('Sun strength').onChange(relight)
lightF.addColor(p, 'sunTint').name('Sun tint').onChange(relight)
lightF.add(p, 'ambient', 0, 2, .01).name('Ambient').onChange(relight)
lightF.add(p, 'shadowSoft', 0, 16, .1).name('Shadow softness').onChange(relight)
lightF.add(p, 'clouds', 0, 1, .01).name('Clouds').onChange(relight)
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
uni(U, 'uPuff', 'Puff normals', 0, 1, .01)
uni(U, 'uEdgeWobble', 'Stroke value scatter', 0, 2, .01)
uni(U, 'uSss', 'Backlight glow', 0, 1.5, .01)
uni(U, 'uRim', 'Rim light', 0, 1.5, .01)
shadeF.add(p, 'fleck', 0, 1, .01).name('Leaf flecks').onChange(applyLook)
uni(U, 'uFleckScale', 'Fleck scale', .5, 8, .1)
uni(U, 'uPigment', 'Pigment variation', 0, 2.5, .01)
uni(U, 'uShadowFillK', 'Warm shadow fill', 0, .6, .01)
shadeF.add(p, 'exposure', .3, 2, .01).name('Exposure').onChange(v => { renderer.toneMappingExposure = v })
const windF = gui.addFolder('Wind').close()
windF.add(p, 'windOn').name('Wind').onChange(v => { U.uWind.value = v ? 1 : 0 })
uni2(U.uSway, 'Sway', 0, 3); uni2(U.uFlutter, 'Flutter', 0, .15)
function uni2(u, n, a, b){ windF.add(u, 'value', a, b, .001).name(n) }
const outF = gui.addFolder('Output').close()
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
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight) })

// ---- go ----
applyLook(); rebuild(); rebuildGrass(); lamp(); frame()
if (qs.has('close')) gui.close()
window.__foliage = { p, U, renderer, scene, camera, controls, rebuild, relight, frame, foliage, wood, sun }
let last = performance.now()
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last)/1000, .1); last = now
  U.uTime.value += dt; sky.tick(U.uTime.value)
  if (p.autoTime){ p.time = (p.time + dt*.4)%24; relight() }
  controls.update(); sky.position.copy(camera.position); sky.scale.setScalar(1000)
  renderer.render(scene, camera)
})
