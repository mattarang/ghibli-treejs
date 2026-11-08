import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import GUI from 'lil-gui'
import Stats from 'stats.js'
import { SPECIES, CROWNS, BRUSHES } from './presets.js'
import { mulberry32, generatePlant, generateGround, generateGrassCell, generateGrassCollars, generateFlowerCell, rocksOfCell, groundHeight, layoutScene, newBuffer, GESTURE_NAMES } from './generator.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { makeBrushAtlas, makeFieldTexture, makeGrassAtlas, makeFlowerAtlas } from './atlas.js'
import { U, patch, newPalette, setPalette, paletteUniforms } from './ghibli-patch.js'
import { makeSky } from './sky.js'
import { makeMountains } from './mountains.js'
import { makeFoliageMaterial, fillLobes } from './foliage-material.js'
import { makeClouds } from './clouds.js'
import { bakeContact, GLSL_CONTACT } from './contact-bake.js'
import { makeCompare } from './compare.js'
import { applyLighting } from './lighting.js'
import { addRecipeGui, loadSavedRecipes } from './recipe-gui.js'
import { makeForest } from './forest.js'

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
const mountains = makeMountains(scene.fog.color); scene.add(mountains)   // painted hills and mountains round the horizon
const L = { sun, hemi, sky, clouds, mountains, scene, reach: 80 }

// ---- parameters ----
loadSavedRecipes(SPECIES)                                                // species saved from the Recipe folder join the built-in ones
const firstSpecies = qs.get('species') && SPECIES[qs.get('species')] ? qs.get('species') : 'Camphor tree'
const p = {
  species: firstSpecies, seed: +(qs.get('seed') || 7), ...structuredClone(SPECIES[firstSpecies]),
  showFoliage: qs.get('foliage') !== '0', grove: +(qs.get('grove') || 1), groveRadius: 18, bushes: 8, farBushes: 30, farRocks: 1, grass: 21, flowers: 16, rocks: 2,
  mountains: true, mountainHeight: 1,
  time: +(qs.get('time') || 10.5), sunAzimuth: 35, sunHeight: 1.05, sunIntensity: 1, sunTint: '#ffffff', ambient: 1, shadowSoft: 5, clouds: 18, cloudSeed: 4, haze: .1, autoTime: false,
  lantern: 0, lanternColor: '#ffb35a', lanternX: 3, lanternY: 2.2, lanternZ: 4,
  windOn: true, wind: 1, autoRotate: false, exposure: 1, forest: +(qs.get('forest') || 0), forestKinds: 4, lodScale: 1,
  forestMix: qs.get('mix') ? qs.get('mix').split(',').filter(n => SPECIES[n]) : [],    // species planted in the forest besides the current one
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
// The field is painted in the ground at the scales a background painter uses, measured against a person:
//  patches: masses of 4-8 m, each its own value and temperature, with firm broken edges (Marnie's hillside is built of these)
//  clumps:  1-2 m pockets of dark and light inside a patch, where the sward is thicker or thinner
//  dabs:    short strokes about 0.5 m long, laid across the slope, that carry the grass where tufts get too small to read
//  a slow drift over ~40 m, kept gentle, so the whole field is not one tone
const fieldTex = { value: makeFieldTexture() }; U.tField = fieldTex   // shared: the foliage reads the same field for cloud shadows                            // the field's noise, baked: a pixel of grass costs one lookup, not six fbms
// The field, after three Ghibli references (critique/round11/grass-recipe.md): light and shade are two different colours with a firm step
// between them, chosen by the sun, the shadows and the turn of the land. Inside each, a broad gentle wash. Texture is short strokes laid
// down the slope's fall line, paler and warmer in light, cooler (some sky-blue) in shade, gathered along the edges of light and on crests.
// Wind you can see: broad bands of gust, ~70 m apart, sweeping across the land at about 12 m/s along the wind, their fronts bowed and broken
const WAVE_FN = `
  // the wind you can see: ripples ~24 m apart running along the wind at ~8 m/s, fronts bowed and broken, gathered into gusts. One function
  // for the ground, the grass and the trees, so a ripple crossing the field reaches the crown in step.
  // where a point sits after the last front passed it (0 at the front, rising to 1 by the next), and how much gust is there
  vec2 gPhase(vec2 p){ vec2 dir = uWindDir; float a = dot(p, dir), b = dot(p, vec2(-dir.y, dir.x));
    float ph = a*.14 - uTime*1.3 + sin(b*.045 + a*.02)*2.2 + sin(b*.013 + 1.)*3. + sin(b*.11 + sin(b*.037)*2.)*.35 + sin(b*.27 + 1.7)*.15;   // a gentle, irregular waver along the front              // fronts ~45 m apart at ~9 m/s, bowed and broken
    float gust = (.5 + .5*sin(a*.05 - uTime*.45 + sin(b*.03)*2.))*(.5 + .5*sin(b*.07 + a*.023 + 2. + uTime*.1));
    return vec2(fract(-ph/6.2831853), smoothstep(.15, .6, gust)); }                       // only where a gust is: patches that come and go
  // the bend: snaps over as the front arrives, then springs back with a fading wobble
  float gWave(vec2 p){ vec2 q = gPhase(p); return smoothstep(0., .03, q.x)*exp(-q.x*13.)*(.75 + .25*cos(q.x*55.))*q.y*uWind; }   // timed with the streak band
  // a tree answers more slowly than grass: it leans as the front reaches its trunk and eases back over a longer stretch behind it
  float gWaveTree(vec2 p){ vec2 q = gPhase(p); return smoothstep(0., .35, q.x)*(1. - smoothstep(.35, .97, q.x))*(.45 + .55*q.y)*uWind; }   // a gentle swell: ~1.7 s to lean in after the front, ~3 s to ease back
  // the pale flash a gust leaves on the field: a thin band right behind the front
  float gWaveBand(vec2 p){ vec2 q = gPhase(p); return smoothstep(0., .01, q.x)*exp(-q.x*16.)*q.y*uWind; }
`
const WAVE = WAVE_FN   // the clock, wind and field are declared once for every patched fragment (ghibli-patch PARS)                // the fragment side has to declare the clock; the vertex side already does
const GROUND_SHADE = `{ vec2 fp = gXZ.x > 1e5 ? vWPos.xz : gXZ;               // the field is read at the ground, or at a tuft's root: a blade is the colour of the soil it stands in
  vec2 w = fp + 3.*vec2(fld(fp*.09), fld(fp*.09 + 7.));
  vec2 d = vec2(w.x*.82 + w.y*.57, w.y*.82 - w.x*.57);
  float sunK = min(gLit/uSunUp, 1.), drift = fld(d*.025 + 2.), wash = fld(d*.06 + 13.);
  // light or shade: cast shadow decides, with a short firm step; slopes turned from the sun fall to a half-tone even out of any shadow
  float inSun = smoothstep(.3, .55, gSeen + (wash - .5)*.1), facing = gNdl/uSunY;                // 1 on flat ground whatever the sun's height; below 1 on slopes turned from it
  // cloud shadows: big soft patches, 60-150 m, sweeping across with the wind at about 6 m/s
  // a cloud's shadow is shade like any other (tier P1); only its edge is soft. The same field shades the foliage (gCloudShade, shared).
  { gCloud = gCloudShade(fp); }   // already in gSeen, via the shared light
  // a slope turned from the sun goes to shade with a hard toon edge, as a cast shadow does: one pixel of anti-aliasing at any distance
  float fc = facing + (wash - .5)*.12, fw = max(fwidth(fc)*.75, 1e-4);
  float lit = inSun*mix(.45, 1., smoothstep(.85 - fw, .85 + fw, fc));   // a slope turned from the sun is a lighter tier than a cast shadow   // (one shade) a slope turned from the sun goes most of the way to shade: the folds of the land carry the light
  gLitF = lit; gLitV = lit;   // shade is shade: a cast shadow and a slope turned from the sun take the same value and the same dark under the grass                                            // one light for the ground and every blade on it
  // the stroke frame: down the fall line where the land slopes, along the wind where it is flat
  vec3 dn = normalize(cross(dFdx(vWPos), dFdy(vWPos))), wn = mix(dn, gGroundN, step(.5, length(gGroundN))); if (wn.y < 0.) wn = -wn;   // the ground's own surface, or the terrain under a tuft's root
  vec2 fall = length(wn.xz) > .04 ? normalize(wn.xz) : vec2(.82, .57);
  fall = normalize(mix(vec2(.82, .57), fall, smoothstep(.04, .15, length(wn.xz))));
  vec2 sp = vec2(dot(w, fall), dot(w, vec2(-fall.y, fall.x))), sw = sp + .15*vec2(fld(sp*1.7), fld(sp*1.7 + 3.));
  vec2 q1 = sw*vec2(1./.35, 1./.09), q2 = sw*vec2(1./1.1, 1./.28);           // flicks: ~0.35 m near, ~1.1 m further out, long down the slope
  float lod1 = 1. - smoothstep(.6, 1.3, max(fwidth(q1).x, fwidth(q1).y*.4)), lod2 = 1. - smoothstep(.6, 1.3, max(fwidth(q2).x, fwidth(q2).y*.4));
  float onGrass = step(.5, length(gGroundN));                               // blades carry their own paint: the ground's strokes are for the ground
  float edge = 1. - abs(inSun*2. - 1.), crest = smoothstep(.6, .85, wash)*smoothstep(.8, 1., lit);   // along the edge of a cast shadow, and on lit crests
  float dens = (.08 + .6*max(edge, crest))*(1. - onGrass);
  vec2 F1 = vec2(0.), F2 = vec2(0.);
  if (dens > 0.){ F1 = gDab(q1); F2 = gDab(q2 + 17.); }                     // (perf) grass pixels never pay for the ground's strokes
  float f1 = F1.x*step(1. - dens, F1.y)*lod1, f2 = F2.x*step(1. - dens, F2.y)*lod2*(1. - lod1*.7);
  float stroke = max(f1, f2), sgn = lit > .85 ? 1. : -1.;   // a stroke is lighter only in full light; in half-tone and shade it is a darker mark
  // two bands, as every stylized grass setup lights it: light and shade with a soft step. Variety does not go through the light (banded, it
  // breaks into shards); it lives in the base colour below.
  kk = mix(.27, .6, lit) + (drift - .5)*.06 + (wash - .5)*.12*mix(.4, 1., lit) + stroke*sgn*mix(.05, .1, lit) + crest*.05;   // with no bands to cross, value can move again
  gPig = 0.; gStroke = stroke*sgn; gCrest = crest;
  // wind: bands of gust sweep across the field; under one the grass bends and shows its paler side
  // a gust is drawn the way anime draws it: clusters of short parallel strokes along the wind where the bent blades catch the light,
  // thickest right behind the front and thinning out after it, on the ground only (the tufts flash their own tips)
  { vec2 hp = vWPos.xz, wdir = uWindDir, hq = vec2(dot(hp, wdir)/1.3, dot(hp, vec2(-wdir.y, wdir.x))/.38);   // streaks: pointed at both ends, 0.7-3 m long, mixed lengths along the band   // drawn where the pixel is, ground or blade
    hq += vec2(fld(hp*.3)*3., 0.);
    float lodH = 1. - smoothstep(.7, 1.6, max(fwidth(hq).x*.4, fwidth(hq).y));
    vec2 q = gPhase(hp), H = vec2(0.);
    float gate = (1. - smoothstep(.05, .12, q.x))*q.y*uWind*smoothstep(22., 45., distance(hp, cameraPosition.xz))*smoothstep(.75, .9, gLitV);
    if (gate > 0.) H = gStreak(hq);                                                 // (perf) the 15-cell streak search only inside a lit, distant gust band
    float lead = q.x + (H.y - .5)*.07;                                               // each streak meets the front at its own place: a frayed, dithered leading edge
    float band = smoothstep(0., .045, lead)*(1. - smoothstep(.05, .12, q.x))*(.35 + .65*q.y)*uWind;   // a tight band of streaks right behind the front, gone a few metres after it   // most of the way to the next front, strongest just behind this one
    float clump = smoothstep(.2, .45, fld(hp*.12 + uTime*vec2(.05, .1)));
    gWaveF = H.x*step(H.y, band*clump*1.35)*lodH*smoothstep(22., 45., distance(hp, cameraPosition.xz))*smoothstep(.75, .9, gLitV); }   // the light catches the bent blades only where there is sun   // each stroke is on or off: it lights when the gust here is stronger than its own threshold
  // grass painted into the ground: thin marks laid along the line of sight, so seen across the ground they stand up as blades; a coarser
  // set takes over where the fine one would shimmer, and the whole layer fades in where real tufts thin out
  { vec2 vd = normalize(fp - cameraPosition.xz + vec2(1e-3)), bq = vec2(dot(fp, vec2(-vd.y, vd.x))/.06, dot(fp, vd)/.5), bq2 = bq/3.;
    float l1 = 1. - smoothstep(.5, 1.2, max(fwidth(bq).x, fwidth(bq).y*.3)), l2 = 1. - smoothstep(.5, 1.2, max(fwidth(bq2).x, fwidth(bq2).y*.3));
    gBladeOn = smoothstep(4., 12., distance(fp, cameraPosition.xz))*(1. - onGrass); vec2 B1 = vec2(0.), B2 = vec2(0.);
    if (gBladeOn > 0.){ B1 = gDab(bq); B2 = gDab(bq2 + 7.); }                  // (perf) ground only
    gBlade = B1.x*l1 + B2.x*l2*(1. - l1); }
  // colour: light warm, shade cool; a few shade strokes pick up the sky
  // colour lives in the field, at the scales Ref A paints it: broad areas of fresh green, chartreuse and blue-green over ~30 m, broken by
  // smaller swathes over ~8 m; light crests go pale yellow-green; shade is teal and also drifts
  float hueA = smoothstep(.3, .7, fld(d*.03 + 41.)), hueB = smoothstep(.35, .65, fld(d*vec2(.09, .14) + 23.));
  vec3 litC = mix(mix(vec3(.9, 1., 1.1), vec3(1.0, 1.01, .95), hueA), vec3(1.16, 1.06, .7), hueA*hueB);
  litC = mix(litC, vec3(1.18, 1.12, .78), crest*.6);
  vec3 shadeC = mix(vec3(.84, .98, 1.2), vec3(.78, 1., 1.3), hueB);
  gTint = mix(vec3(.96, 1., 1.04), vec3(1.), lit);                       // the sampled colours already carry their temperature: no extra tint on top
  vec3 clump = vec3(fld(fp*.29 + 61.), 0., fld(fp*.29 + 83.));   // (perf) one lookup, where a 9-cell Voronoi search cost ~0.6 ms on grass                                              // clumps of 2-5 m share a hue, ground and grass alike (as Ghost of Tsushima's)
  gHA = clamp(hueA + (clump.z - .5)*.1, 0., 1.); gHB = clamp(hueB + (clump.x - .5)*.08, 0., 1.); gLitP = lit;
  gMod *= 1. + (drift - .5)*.06;
  // distance: on a clear day the far hills only cool a little toward teal and keep their light and shade (no haze flattening them)
  { float far = smoothstep(120., 600., distance(fp, cameraPosition.xz));
    gTint = mix(gTint, mix(vec3(.85, 1., 1.12), vec3(.95, 1., 1.04), lit), far*.2); kk = mix(kk, .36 + lit*.2, far*.04); gFar = far; }
  float near = 1e3, aoT = 0., nT = fld(fp*2.1) - .5;
  for (int i = 0; i < uTreeN; i++){ if (uContactBox.w > .5 && max(abs(uTrees[i].x - uContactBox.x), abs(uTrees[i].y - uContactBox.y)) < uContactBox.z) continue;   /* baked: its own wood gives its contact */ float r = uTrees[i].z, d = length(fp - uTrees[i].xy); near = min(near, d/r); aoT = max(aoT, 1. - smoothstep(r*.9, r*2.6, d + nT*r*.5)); }   // one pass: the bare foot and the contact shade
  near += (fld(fp*1.3) - .5)*.8;
  gFoot = 1. - smoothstep(.5, 1.5, near);
  // where the wood itself has been baked, contact follows each root's and the trunk's own outline instead of a radial pool
  { float wide, cAO = gContactAO(fp, wide); if (gContactIn > .5){ aoT = cAO; gFoot = smoothstep(.2, .6, wide)*.8; } }
  kk *= 1. - .34*gFoot;
  // contact shade: a soft cool pool where a trunk or a stone meets the ground, the way a painter grounds it (no AO pass: positions are known)
  { float ao = 0.;
    ao = aoT;
    float nR = fld(fp*3.3) - .5;
    for (int i = 0; i < 32; i++){ if (i >= uRockN) break; float r = uRocks[i].z, d = length(fp - uRocks[i].xy); ao = max(ao, 1. - smoothstep(r*.85, r*1.7, d + nR*r*.3)); }   // only the stones near the camera
    // the colour moves to the deep tier in GROUND_PAL
    gAO = ao; gTint *= mix(vec3(1.), vec3(.94, .98, 1.04), ao); } }`
// bare earth at a tree's foot: in shade a darker, warmer turn of the ground's own shade colour (a fixed earth colour read as a grey stain), in sun a warm ochre (Ghibli paints lit dirt light and warm, never mud)
const GROUND_PAL = `pal *= mix(1., mix(.92, 1.13, gBlade), gBladeOn*(1. - gFar*.5));   // the painted blades: light tips, dark gaps
  pal = mix(pal, mix(pal, vec3(.95, .99, .86), .8), gWaveF);   // the hatch: near-white, a little warm                      // a passing ripple: the grass bows and shows its pale side                       // a passing gust
  // the bare foot of a tree: the ground palette's own darks, a little earthier, never a fixed brown (a straw field went brown under its maple)
  pal = mix(pal, mix(uPal0*vec3(.86, .84, .74), uPal1*vec3(.94, .9, .78), smoothstep(.25, .7, kk)), gFoot*.4);
  { // the base colour: three measured greens in light (blue-green, fresh green, chartreuse) and two in shade (green, teal), mixed by the
    // broad masks and each clump's own hue. Only hue and saturation move here; the value stays the band's.
    float v = dot(pal, vec3(.3, .59, .11));
    // The ground's bands come from the species' ground palette, the same rule as foliage: P1 shade, P2 lit, P3 highlight (P0 the deep foot).
    // The measured meadow variations are kept as offsets on the palette (taken against MEADOW): cool fresh and warm lit around P2, a
    // chartreuse lift toward P3, a teal lean in shade. On MEADOW this gives exactly the sampled greens; an autumn straw palette keeps its own hue.
    vec3 g1 = pow(uPal1, vec3(1./2.2)), g2 = pow(uPal2, vec3(1./2.2)), g3 = pow(uPal3, vec3(1./2.2));
    vec3 litC = mix(mix(g2*vec3(.947, .988, 1.175), g2*vec3(1.158, 1.06, .984), gHA), g3*vec3(1.058, 1.03, .963), gHA*gHB*.6);   /* MEADOW: #5aa64a, #6eb23e, #a5d14f */
    vec3 shC = gHueRot(gSatTo(g1, gSat(g2)*.95), mix(.07, .3, gHB));   // shade keeps the light's saturation; the teal lean is a hue turn, not added blue                                                                               /* MEADOW: #305437, toward teal #2e5450 */
    // contact: sun and sky both blocked, so it is the deep tier whatever the sun does: P0, and the accent at its core (a trunk's or stone's foot)
    // only the core of the contact pool is deep: the rest of a canopy's footprint is ordinary shade (P1), as under Laputa's great tree
    float litP = gLitP*(1. - smoothstep(.45, .85, gAO)*.9);
    shC = mix(shC, pow(uPal0, vec3(1./2.2)), smoothstep(.55, .9, gAO));
    vec3 tgt = pow(mix(shC, litC, litP), vec3(2.2))*(1. + (kk - mix(.27, .6, gLitP))*2.4);
    tgt = mix(tgt, gAccent(uPal0), smoothstep(.85, 1., gAO)*.6);   // sampled in screen colour; the shader works in linear light   // the sampled colour is the colour; the band's own variations (wash, strokes, a blade's lift) ride on it
    pal = mix(pal, tgt/mix(vec3(.84, .9, 1.), vec3(1.06, .99, .89), litP), .9*(1. - gFoot*(1. - gAO))*(1. - gFar*.6));   // divide out noon's light only: dawn, dusk and night still tint and darken the field   // the light's own tint is applied after this: divide it out so the sampled colour is what shows
    // marks down the fall line and pale crests, also in the base colour: warmer and lighter in light, cooler and a touch darker in shade
    pal = mix(pal, gStroke > 0. ? pal*vec3(1.08, 1.08, .86) + .02 : pal*vec3(.9, .97, 1.1), abs(gStroke)*.8);
    pal = mix(pal, pal*vec3(1.1, 1.08, .82) + .03, gCrest*.5); }`
const GROUND_FRAG = WAVE + ' float gCloud = 0.; vec2 gStreak(vec2 p){ vec2 i = floor(p); float on = 0., tone = 1.; for (int dy = -1; dy <= 1; dy++) for (int dx = -2; dx <= 2; dx++){ vec2 c = i + vec2(dx, dy); float h = h21(c), h2 = h21(c + 3.1), h3 = h21(c + 7.7); float len = mix(.6, 2.6, h*h), cx = c.x + h2, cy = c.y + .5 + (h3 - .5)*.5, t = (p.x - cx)/len + .5; if (t > 0. && t < 1.){ float w = mix(.12, .42, h21(c + 5.3))*pow(1. - abs(2.*t - 1.), 1.4); if (abs(p.y - cy) < w && on < .5){ on = 1.; tone = h3; } } } return vec2(on, tone); } float gWaveF = 0., gBlade = 0., gBladeOn = 0.; float gHA = 0., gHB = 0., gLitP = 1., gStroke = 0., gCrest = 0., gFar = 0.; vec2 gXZ = vec2(1e6); vec3 gGroundN = vec3(0.); float gPig = 0., gLitF = 1., gLitV = 1.; vec2 gDab(vec2 p){ vec2 i = floor(p), f = fract(p); float top = -1., tone = .5; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y), c = i + g, r = g + vec2(h21(c), h21(c + 31.7))*.8 + .1 - f; float h = h21(c + 5.1), e = length(r*vec2(1., 1.25 + h*.4)); if (e < .42 + .2*h21(c + 2.3) && h > top){ top = h; tone = h21(c + 11.7); } } return vec2(step(0., top), tone); } vec3 gVor(vec2 p){ vec2 i = floor(p), f = fract(p), id = i; float d1 = 8., d2 = 8.; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + 31.7))*.8 + .1, r = g + o - f; float e = dot(r, r); if (e < d1){ d2 = d1; d1 = e; id = i + g; } else if (e < d2) d2 = e; } return vec3(h21(id + 5.1), sqrt(d2) - sqrt(d1), h21(id + 11.7)); } uniform vec3 uGrassFar; uniform int uTreeN; uniform vec3 uTrees[24]; uniform vec3 uRocks[32]; uniform int uRockN; float gAO = 0.; float gFoot = 0.; float fld(vec2 p){ return texture2D(tField, p/16.).r; }' + ' uniform sampler2D tContact; uniform vec4 uContactBox; ' + GLSL_CONTACT
// (WAVE is defined above GROUND_SHADE)
// The sward: under the grass the ground is painted a step darker, so every gap between blades is a deep blue-green and the lit blades
// read against it, as a background painter lays the dark first. It fades out past the grass's reach.
const SWARD = 'mix(.8, 1., smoothstep(uGrassFar.z*.7, uGrassFar.z, distance(vWPos.xz, uGrassFar.xy)))'   // under the grass that follows the camera
const GROUND_PIGMENT = 'gPig'   // set by the dabs in GROUND_SHADE: the paint texture is the strokes themselves
// Light is given out per mass, the way a painter blocks it in: the mass the sun favours most gets most of its area lit, the one it favours least
// a sliver, and each mass gets one terminator, placed to give it that share. Rebaked only when the sun or the plants change, into a small table
// the foliage reads once per vertex: each clump's place relative to its terminator.
const sunTable = new THREE.DataTexture(new Uint8Array(256*64*4), 256, 64, THREE.RGBAFormat)     // R: place against the light. G: the lobe's hue. B: the tree's colour form
sunTable.magFilter = sunTable.minFilter = THREE.NearestFilter
const SAME_SHADE = .42, HERO_SHARE = .52, LAST_SHARE = .1, LINE_LOW = -.1, LINE_HIGH = .15, OWN_TURN = .6
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
  const s = U.uSunDir.value, data = sunTable.image.data, n = Math.min(heldClumps.length, data.length/4), plants = new Map()
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
        if (e.deep) continue                                            // the heart shades nothing: only the shell makes a crown's light
        const same = e.mass === a.mass                                  // within a mass the shade is gentle: enough to model its lobes, not enough to split it
        const x = e.c[0] - a.c[0], y = e.c[1] - a.c[1], z = e.c[2] - a.c[2], t = x*s.x + y*s.y + z*s.z
        if (t < a.r*.25) continue
        const yy = y/k, sy = s.y/k, tt = (x*s.x + yy*sy + z*s.z)/(s.x*s.x + sy*sy + s.z*s.z), px = x - tt*s.x, py = yy - tt*sy, pz = z - tt*s.z
        const q = Math.min(Math.max((.95 - Math.sqrt(px*px + py*py + pz*pz)/e.r)/.5, 0), 1)     // the shade of what really stands in the way: anything the sun can see past stays lit
        vis *= 1 - (same ? SAME_SHADE : .55)*q*q*(3 - 2*q)
      }
      face[i] = a.n[0]*s.x + a.n[1]*s.y + a.n[2]*s.z - (1 - vis)*1.1*U.uSelfShade.value - (a.deep ? 3*Math.min(Math.max((.92 - vis)/.3, 0), 1) : 0)   // the heart of a crown is dark where leaves cover it, and lit like any other where the sun reaches it
    }
    const shell = groups.map(g => { const o = g.filter(i => !heldClumps[i].deep); return o.length ? o : g })   // the light is shared out over what can be seen
    const mean = shell.map(g => g.reduce((t, i) => t + face[i], 0)/g.length), lo = Math.min(...mean), hi = Math.max(...mean)
    groups.forEach((g, k) => {
      const share = groups.length > 1 ? LAST_SHARE + (HERO_SHARE - LAST_SHARE)*((mean[k] - lo)/Math.max(hi - lo, 1e-3))**.8 : (HERO_SHARE + LAST_SHARE)/2
      const order = [...shell[k]].sort((p, q) => face[q] - face[p]), area = shell[k].reduce((t, i) => t + heldClumps[i].r**2, 0)
      let seen = 0, line = face[order[order.length - 1]] - .5                 // walk down from the sunniest clump until the share is spent
      if (up === 0) line = 9
      else for (const i of order){ seen += heldClumps[i].r**2; if (seen >= share*up*area){ line = face[i] - 1e-3; break } }
      // the shader adds OWN_TURN of each stroke's own turn to the sun, so the clump's centre lands exactly on its place against the line
      // The share only arranges the light where the sun leaves it open. Foliage that faces the sun with nothing in the way is always lit, and foliage
      // turned away from it never is, whatever its mass's rank.
      if (up > 0) line = Math.min(Math.max(line, LINE_LOW), LINE_HIGH)
      for (const i of g){ const a = heldClumps[i]; data[i*4 + 1] = a.hue*255; data[i*4 + 2] = a.form; data[i*4] = Math.min(Math.max((face[i] - line - OWN_TURN*(a.n[0]*s.x + a.n[1]*s.y + a.n[2]*s.z) + 2)/4, 0), 1)*255 }
    })
  }
  sunTable.needsUpdate = true
}
const foliageMat = makeFoliageMaterial(atlas.tex, sunTable, pals.foliage, sssColor, rimColor)
// Sun flecks: holes cut in the light's own view, so one hole lines up through every layer of leaves along the same ray, and on the
// ground it lands as the slanted ellipse a real fleck makes. Cells are in metres across the light; uFlecks is the share of cells open.
const FLECK = `uniform float uFlecks; varying vec2 vLS;
  float fh(vec2 i){ return fract(sin(dot(i, vec2(127.1, 311.7)))*43758.5453); }
  float fvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  bool spot(vec2 p, float cell, float k, float dens){ vec2 q = p/cell + k, i = floor(q), f = fract(q) - .5;
    float h = fh(i), h2 = fract(h*17.13 + .31), h3 = fract(h*31.7 + .77);
    return h < dens && length(f - (vec2(h2, h3) - .5)*.5) < mix(.1, .3, h3); }
  bool fleckHole(vec2 p){ if (uFlecks <= 0.) return false;
    float near = smoothstep(.3, .75, fvn(p/6.) + (uFlecks - .3)*.6);              // flecks gather where the canopy happens to be thin, and leave whole stretches solid
    return spot(p, 1.8, 0., uFlecks*near*1.5) || spot(p, .75, 7.3, uFlecks*near); }`
const makeFoliageDepth = tex => {
  const m = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide, alphaMap: tex, alphaTest: .36 }),
    { wind: true, clumpExpr: 'clusterCenter', vertexPars: STROKE_PARS + ' attribute vec3 clusterCenter; varying vec2 vLS;', afterView: STROKE_FAN + ' vLS = mvPosition.xy;' })
  const base = m.onBeforeCompile
  m.onBeforeCompile = sh => { base(sh)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FLECK).replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  if (fleckHole(vLS)) discard;') }
  return m
}
const foliageDepth = makeFoliageDepth(atlas.tex)
// three's shadow pass takes alphaMap, alphaTest and side from the mesh's own material, even over a customDepthMaterial: the invisible caster must carry the brush and both sides, or every plate is culled and the canopy casts nothing
const casterMat = tex => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide, alphaMap: tex, alphaTest: .36 })
// Bark runs along the wood: vB wraps the noise around each limb, so everything follows the grain and never seams.
//  furrows: long dark cracks, broken by the light bands
//  zones:   slow drifts between warm and cool bark, so a trunk is never one colour
//  lichen:  pale blotches on the warmer patches
//  moss:    greens that climb from the roots and sit on top of limbs, in painted shapes with firm edges
// Sun lands in broken plates on big wood; wood buried in the crown goes to the crown's shadow; the foot of the trunk takes the ground's colour.
const barkLook = { uBarkScale: { value: 1 }, uBarkStretch: { value: 1 }, uBarkPlates: { value: 0 }, uBarkBands: { value: 0 } }
const sink = { value: 1 }, crownDark = { value: 1 }, pxAngle = { value: .001 }    // both only mean anything with foliage there to hide the wood
const makeWoodMat = (barkPal, inkPal, color) => patch(new THREE.MeshStandardMaterial({ color, roughness: .9 }), {
  toon: true, wind: true, flatShadow: true, softRamp: true, pigment: 'gRidge*.3',
  // Wood inside a clump sinks behind the leaves in depth alone, the amount it is buried: it stays where it is on screen, so a limb runs up to the
  // foliage and goes in, and never shows as a loose piece floating in front of a clump's body. Its shadow doesn't move.
  afterClip: 'if (vLeafA.y > 0.){ vec4 sunk = projectionMatrix*vec4(mvPosition.xy, mvPosition.z - uSink*vLeafA.y, 1.); gl_Position.z = sunk.z/sunk.w*gl_Position.w; }',
  vertexPars: 'varying float vCrack; uniform float uSink, uCrownDark, uPxAngle; attribute vec3 aLeaf; attribute vec3 clusterCenter; varying vec3 vLeafA; varying vec3 vB; varying vec3 vWN; varying float vH;',
  vertexBegin: 'vCrack = smoothstep(.45, .85, abs(aLeaf.z)); vLeafA = vec3(aLeaf.xy, smoothstep(.1, .5, abs(aLeaf.z))); { float round = clusterCenter.x/.5; vB = vec3(cos(uv.x*6.28318)*round, sin(uv.x*6.28318)*round, uv.y); }   /* the way round the wood, in real distance: clusterCenter.x carries the girth */ vWN = normal; vH = position.y - clusterCenter.y;' +
    // wood is never drawn thinner than about a pixel and a half: far twigs stay visible lines instead of fading out and leaving the crown's leaves floating
    ' { vec3 wq = (modelMatrix*vec4(transformed, 1.)).xyz; float need = .8*uPxAngle*distance(wq, cameraPosition); if (clusterCenter.x > 0. && clusterCenter.x < need) transformed += normal*(need - clusterCenter.x); }',
  fragmentPars: `varying float vCrack; varying vec3 vLeafA; varying vec3 vB; varying vec3 vWN; varying float vH; uniform vec3 uInk, uFootColor, uSunDir; uniform float uMoss, uBarkVar, uFurrow, uCrownDark;
    uniform float uBarkScale, uBarkStretch, uBarkPlates, uBarkBands; vec3 gB = vec3(0.); float gSun = 1., gRidge = 0., gMoss = 0., gLichen = 0., gCrack = 0., gHue = 0.;`,
  color: `{ gB = vec3(vB.xy*uBarkScale, vB.z*1.45*uBarkScale/uBarkStretch); vec2 ring = gB.xy; float thick = vLeafA.x;
    float big = fbm3(vec3(ring*1.7, gB.z*.5) + 3.), fine = fbm3(vec3(ring*5.5, gB.z*1.6));
    gRidge = ((big - .5)*1.1 + (fine - .5)*.4)*(.25 + .75*vLeafA.z);
    float flow = fbm3(vec3(ring*3.4, gB.z*.55) + 11.);
    gCrack = (1. - smoothstep(.0, max(.05, fwidth(flow)*1.5), abs(flow - .5)))*thick*uFurrow*vCrack;   // cracks stay out of forks, where the pattern's coordinates bunch up
    float plates = 1. - smoothstep(.0, .05, abs(fbm3(vec3(ring*3.4, gB.z*1.1) + 51.) - .5));   // cross cracks, for bark that breaks into plates
    gCrack = max(gCrack, plates*uBarkPlates*thick*vCrack*smoothstep(.35, .65, fbm3(vec3(ring*1.2, gB.z*.3) + 7.)));
    gCrack = max(gCrack, smoothstep(.57, .72, fbm3(vec3(ring*1.4, gB.z*7.) + 61.))*uBarkBands*.6*thick*vCrack);   // lenticels: the short bands across cherry bark
    float zone = fbm3(vec3(ring*.9, gB.z*.3) + 21.);
    gHue = mix(.5, smoothstep(.38, .62, zone), vLeafA.z);     // joints stay neutral, so a limb and its parent paint as one form
    gLichen = smoothstep(.6, .63, fbm3(vec3(ring*3.2, gB.z*.8) + 31.))*smoothstep(.45, .6, zone)*thick*.75*uBarkVar*vCrack;
    float up = normalize(vWN).y*.5 + .5, low = 1. - smoothstep(.1, 3.2, vH);
    float m = fbm3(vec3(ring*2.3, gB.z*.3) + 9.) + .1*low + .55*(up - .55);    // moss lies on what faces the sky and gathers at the foot
    gMoss = smoothstep(.79 - .3*uMoss, .82 - .3*uMoss, m)*smoothstep(.1, .6, thick)*vLeafA.z;
    gMod = 1. + gRidge*.08; diffuseColor.rgb *= gMod; }`,
  // bark is painted in three values: a deep side away from the sun, a middle, and mottled dabs of light on the sun side. Noise along the
  // grain breaks the borders between them into brush marks. Under a canopy the lit dabs thin out to the patches the sun reaches.
  shade: `{ vec2 rg = gB.xy; float thick = vLeafA.x, f = dot(normalize(vWN), uSunDir)*.5 + .5;
    float broad = fbm3(vec3(rg*3., gB.z*1.2) + 41.) - .5, small = fbm3(vec3(rg*5., gB.z*2.2) + 5.) - .5;     // short dabs along the grain, not long rails
    float v = f + (broad*.3 + small*.08)*(.3 + .7*vLeafA.z);          // the form decides the value; noise only breaks its edge
    float seen = gSeen;   // the shadow map decides everywhere: letting the form decide near the terminator left a band down every trunk that no shadow could reach. The noise below hides the stair-steps a grazing shadow makes
    float sun = smoothstep(.25, .75, seen + (fbm3(vec3(rg*2.2, gB.z*1.) + gRidge*.5 + 17.) - .5)*.6);   // the real shadow decides where sun lands; noise only breaks its edge into dabs
    // out of the sun the wood is still a cylinder: a lighter face toward the light, a dark core where the form turns, a thin bounce on the far edge
    kk = .07 + .13*smoothstep(.5, .64, v) + .1*smoothstep(.74, .9, v) + .06*smoothstep(.34, .2, v);
    kk = mix(kk, .76, smoothstep(.58, .7, v)*sun*smoothstep(.15, .6, thick));
    kk *= mix(.55, 1., smoothstep(-.1, 1.4, vH));                            // the foot of the trunk sinks into its own contact shade
    gSun = sun*smoothstep(.5, .65, v);
    kk += gRidge*.05 - gCrack*.2;
    }
    gTint = mix(vec3(.92, 1., 1.06), vec3(1.08, .99, .88), mix(.5, gHue, uBarkVar))*mix(vec3(.82, .94, 1.1), vec3(1.), gSun);   // bark out of the sun takes the sky: cool and quiet, warmth only where light lands
    gTint *= mix(vec3(1.), vec3(.9, 1.08, .94), (1. - gSun)*(1. - smoothstep(0., 2.5, vH))*.8);   // grass bounces green onto the shaded foot
    { float deep = vLeafA.y*uCrownDark; kk = mix(kk, .1, deep); gMod = mix(gMod, 1., deep); gTint = mix(gTint, vec3(1.), deep); }`,
  palLine: `pal = mix(pal, vec3(.34, .4, .32)*(.55 + .8*clamp(kk, 0., 1.)), gLichen*.6*(.3 + .7*gSun)*(1. - gCrack));   // lichen is pale only where light finds it; in shade it would read as a highlight
    pal = mix(pal, mix(vec3(.035, .06, .025), vec3(.14, .2, .05), smoothstep(.12, .62, kk)), gMoss*(1. - .6*gCrack));
    pal *= 1. - .4*gCrack;
    pal = mix(pal, uFootColor, smoothstep(.6, -.1, vH)*.6);
    pal = mix(pal, mix(uPal0, uInk, .2), vLeafA.y*uCrownDark);`,  // wood deep in the crown goes to its own darkest bark, barely touched by the crown's colour: never painted as foliage
  uniforms: { ...paletteUniforms(barkPal), uInk: inkPal[0], uFootColor: pals.ground[0], uSink: sink, uCrownDark: crownDark, uPxAngle: pxAngle, ...barkLook } })
const woodMat = makeWoodMat(pals.bark, pals.foliage, p.bark[2])
// ivy: its own leafy brushes and dark greens, standing a step off the bark
const ivyPal = newPalette(['#15352a', '#27583c', '#4f8848', '#94bc68'])
const ivyMat = patch(new THREE.MeshStandardMaterial({ color: '#27604e', roughness: .9, alphaMap: makeBrushAtlas('clover', 'spray', 5), alphaTest: .36, alphaToCoverage: true, side: THREE.DoubleSide }), {
  toon: true, wind: true, flatShadow: true, afterView: STROKE_FAN, pigment: '(gPaint - .5)*.8',
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; varying vec3 vLeafA;', vertexBegin: 'vLeafA = aLeaf;', fragmentPars: 'varying vec3 vLeafA; float gPaint = .5;',
  color: 'gPaint = texture2D(alphaMap, vAlphaMapUv).r;', shade: 'kk = gLit*.6 + gNdl*.2 + (vLeafA.y - .5)*.2 + .08;', uniforms: paletteUniforms(ivyPal) })
const woodDepth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { wind: true })
// the dark under the grass shows only in shade: lit grass reads clean
const groundMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1 }), { toon: true, flatShadow: true, softRamp: true, shade: GROUND_SHADE + ' kk *= mix(' + SWARD + ', .88, gLitF);', pigment: GROUND_PIGMENT, palLine: GROUND_PAL, fragmentPars: GROUND_FRAG, uniforms: { ...paletteUniforms(pals.ground), tField: fieldTex } })
// rooted: only the tips of a tuft move in the wind
const grassAtlas = makeGrassAtlas()
const grassMat = patch(new THREE.MeshStandardMaterial({ color: p.ground[2], roughness: 1, alphaMap: grassAtlas, alphaTest: .42, side: THREE.DoubleSide }), {
  toon: true, wind: true, flatShadow: true, softRamp: true, pigment: 'mix(' + GROUND_PIGMENT + ', (gPaint - .35)*1.1*mix(.5, 1., gLitV)*uDay, smoothstep(.1, .6, vU))',   // the root wears the ground's own paint; the blade's two tones come in up its length   // the brush's two tones and its dark back blades show, at the root as well as the tip
  // the tuft is anchored at its root (so its one shadow lookup is where it meets the ground) and stood up from there along its stroke
  // the tuft stands up from its root along its stroke, then fans out; toward the edge of the field's reach it shrinks to nothing
  afterView: `{ float gd = length(wPos.xz - uGrassFar.xy), fade = (1. - smoothstep(uGrassFar.z*.78, uGrassFar.z*.98, gd))*mix(1., 1.6, smoothstep(40., 110., gd));
    // LOD: the share of tufts wanted here (1 dense, 1/3 normal, .05 sparse), ramped down just inside each level change so a cell's tufts have
    // already shrunk away before the next, sparser cell takes over; each tuft grows or fades by its rank against it
    { float d = length(aWind.xy - uGrassLod.xy), dt = length(aWind.xy - uGrassLodT.xy);
      float s1 = smoothstep(uGrassLod.z - 12., uGrassLod.z - 6., d), s2 = smoothstep(uGrassLod.w - 12., uGrassLod.w - 6., d);
      float near = max(1. - s1, uGrassLodT.z*(1. - smoothstep(14., 20., dt)));
      float want = mix(mix(.3333, .05, s2), 1., near);
      fade *= aPatch.y > .5 ? near : 1. - smoothstep(want - .04, want, aPatch.x); }
    vec2 sd = normalize((viewMatrix*vec4(aStroke, 0.)).xy + vec2(0., 1e-3));
    mvPosition.xy += (sd*abs(aCorner.x) + sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y)*fade; }
    if (aCorner.x > 0.){ vec3 sway = windOffset(wPos.xyz, vec3(aWind.x, 0., aWind.y), vec4(aWind.xy, .22, .9)) - vec3(uWindDir.x, 0., uWindDir.y)*gWaveTree(aWind.xy)*.22*uSway*4.*uWind + vec3(uWindDir.x, -.35, uWindDir.y)*gWave(aWind.xy)*abs(aCorner.x)*1.9; mvPosition.xyz += (viewMatrix*vec4(sway, 0.)).xyz; } vU = aCorner.x > 0. ? 1. : 0.;`,
  vertexPars: STROKE_PARS + ' attribute vec3 aLeaf; attribute vec3 aPatch; uniform vec4 uGrassLod; uniform vec3 uGrassLodT; varying vec3 vLeafA; varying float vU; varying vec3 vGN; varying vec2 vRootXZ; uniform vec3 uGrassFar;', vertexBegin: 'vLeafA = aLeaf; vGN = normal; vRootXZ = aWind.xy;', fragmentPars: GROUND_FRAG + ' varying vec3 vLeafA; varying float vU; varying vec3 vGN; varying vec2 vRootXZ; float gPaint = .5, gTemp = .5;',
  // every blade its own colour: warm yellow-green, neutral or cool teal by the brush, cooler and greyer in shade, none of it at the root
  palLine: GROUND_PAL.replace('gFoot*.4', 'gFoot*.4*(1. - smoothstep(0., .7, vU))') + `{ float sunB = gLitV, hl = smoothstep(.9, .97, gTemp), t = mix(.72, min(gTemp/.85, 1.), sunB), up = smoothstep(.15, .8, vU)*uDay*.8;
    vec3 tint = t < .5 ? mix(vec3(1.06, 1.06, .74), vec3(1.), t*2.) : mix(vec3(1.), vec3(.78, .97, 1.12), t*2. - 1.);   // warm blades lean yellow-green, never straw (Spirited Away's grass stays h95-100)
    pal *= mix(vec3(1.), tint, up); pal = mix(pal, vec3(dot(pal, vec3(.3, .59, .11))), smoothstep(.6, 1., t)*.3*up);
    pal = mix(pal, uPal3*vec3(.96, 1.02, .82), smoothstep(.45, 0., gTemp)*sunB*up*.25);
    pal = mix(pal, uPal3*vec3(1.02, 1.08, .86) + .02, hl*sunB*up*.75);
    pal = mix(pal, mix(pal, vec3(.9, .97, .78), .5), gWave(gXZ)*smoothstep(.45, 1., vU)*smoothstep(.8, .95, sunB)*smoothstep(22., 45., distance(gXZ, cameraPosition.xz))); }`,   // a bending tuft turns its tips to the light   // the sharp lit stroke, only in sun   // the warmest blades in sun go to the palette's yellow-green, the lit stroke a painter picks out   // bare earth at the root exactly as on the ground, gone by the tip
  color: '{ vec4 b = texture2D(alphaMap, vAlphaMapUv); gPaint = b.r; gTemp = b.b; gGroundN = normalize(vGN); gXZ = vRootXZ; }',   // r: the blade's value, b: its temperature
  normal: 'normal = normalize((viewMatrix*vec4(normalize(vGN), 0.)).xyz);',   // the tuft is lit as the ground at its root: a slope turned from the sun shades its grass too
  shade: GROUND_SHADE + ' kk *= mix(mix(' + SWARD + ', 1., smoothstep(0., .55, vU)), mix(.88, 1., smoothstep(0., .55, vU)), gLitF); kk += smoothstep(.15, 1., vU)*(.14 + (vLeafA.y - .4)*.16 + (vLeafA.x > 1.5 ? .12 : 0.))*mix(.35, 1., gLitV)*uDay;',   // matched at the root, a blade lightens up its length so it reads against the field
  uniforms: { ...paletteUniforms(pals.ground), tField: fieldTex } })
// Wildflowers keep their own painted colour: the light only steps it between a cool shade and full sun, as the grass around them
const flowerMat = patch(new THREE.MeshStandardMaterial({ map: makeFlowerAtlas(), alphaTest: .5, side: THREE.DoubleSide, roughness: 1 }), {
  toon: true, wind: true, flatShadow: true,
  afterView: `{ float fade = 1. - smoothstep(uGrassFar.z*.7, uGrassFar.z*.95, length(wPos.xz - uGrassFar.xy)); vec2 sd = normalize((viewMatrix*vec4(aStroke, 0.)).xy + vec2(0., 1e-3));
    mvPosition.xy += (sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y)*fade; }` + `if (aCorner.x > 0.){ vec3 sway = windOffset(wPos.xyz, vec3(aWind.x, 0., aWind.y), vec4(aWind.xy, .22, .9)) - vec3(uWindDir.x, 0., uWindDir.y)*gWaveTree(aWind.xy)*.22*uSway*4.*uWind; mvPosition.xyz += (viewMatrix*vec4(sway, 0.)).xyz; }`,
  vertexPars: STROKE_PARS + ' uniform vec3 uGrassFar;', fragmentPars: 'vec4 gFlower = vec4(1.);',
  color: 'gFlower = texture2D(map, vMapUv);',
  normal: 'normal = normalize((viewMatrix*vec4(0., 1., 0., 0.)).xyz);',
  shade: 'kk = min(gLit/uSunUp, 1.);',
  palLine: 'pal = gFlower.rgb*mix(vec3(.42, .5, .62)*mix(.25, 1., uDay), vec3(1.), smoothstep(.2, .6, kk));',   // petals in dusk fall with the light, never glowing above the field
  uniforms: paletteUniforms(newPalette(['#000000', '#000000', '#000000', '#000000'])) })
// Rocks are painted in planes: the toon ramp bands a smooth form into a few, cool grey-blue in shade, warm in sun, with moss settling on their tops
const rockPal = newPalette(['#1f2a31', '#414d55', '#7a7f78', '#c4b896'])
const rockLook = {
  toon: true, flatShadow: true, vertexPars: 'varying vec3 vRN; attribute float aAO; varying float vAO;', vertexBegin: 'vRN = normal; vAO = aAO;', fragmentPars: 'varying vec3 vRN; varying float vAO; float gTone = .5, gUp = 0.;',
  // value: lit top, dark sides, then dabs laid one way across the stone and slow patches of tone, so it reads as brushwork, not a smooth lump
  shade: `{ gUp = normalize(vRN).y; gTone = fbm2(vWPos.xz*.9 + vWPos.y*.7 + 3.);
    float dabs = fbm2(vec2(dot(vWPos.xz, vec2(.8, .6))*7. + vWPos.y*2., vWPos.y*6. + dot(vWPos.xz, vec2(-.6, .8))*2.));
    kk = min(gLit/uSunUp, 1.)*.6 + .06 + .12*gUp + (smoothstep(.44, .56, dabs) - .5)*.16 + (gTone - .5)*.18;   kk *= mix(.45, 1., smoothstep(0., .55, vAO));   /* the base of a stone darkens into the ground */ }`,
  palLine: `{ pal *= mix(vec3(.93, .98, 1.07), vec3(1.07, 1., .88), smoothstep(.4, .62, gTone));       // warm ochre and cool grey drift across the stone
    float cr = 1. - smoothstep(0., .035, abs(fbm2(vWPos.xz*1.4 + vec2(vWPos.y*1.8, vWPos.y*.6)) - .5));   // a few cracks, on the sides only
    pal *= 1. - .5*cr*(1. - smoothstep(.35, .75, gUp));
    float m = smoothstep(.66, .74, gUp*.45 + fbm2(vWPos.xz*2.6 + 9.)*.75)*(.75 + .25*smoothstep(.4, .6, fbm2(vWPos.xz*9. + 4.)));                // moss in patches on what faces the sky
    pal = mix(pal, mix(vec3(.07, .17, .1), vec3(.26, .44, .18), smoothstep(.25, .65, kk)), m*.9); }`,
}
const rockMat = patch(new THREE.MeshStandardMaterial({ color: '#7a7f78', roughness: 1 }), { ...rockLook, uniforms: paletteUniforms(rockPal) })
function rockGeometry(stones){
  const parts = stones.map(q => {
    // carved stones need the detail to hold a face
    const g = mergeVerts(new THREE.IcosahedronGeometry(1, q.stand ? 7 : 3)), pos = g.attributes.position, v = new THREE.Vector3(), k = q.seed%1000, carve = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i)
      // the same displacement at the same point, so shared corners stay shut; broad lumps, then a flatter top and a few cut planes
      const n = .22*Math.sin(v.x*2.1 + k)*Math.sin(v.y*1.7 + k*.3)*Math.sin(v.z*2.3 + k*.7) + .1*Math.sin(v.x*5.3 - v.z*4.1 + k)
      if (q.stand){
        // a standing stone: an egg, narrower toward its rounded top, gently lumpy; some carry a worn face on one side (two deep eye hollows
        // under a brow, a flat nose ridge, a low mouth groove), the kind of old roadside carving moss has half reclaimed
        const sv = v.clone(), taper = 1 - .1*Math.max(sv.y, 0) + .06*Math.max(-sv.y, 0)   // a squat, round-topped lump, a little fuller low down
        let d = .1*Math.sin(v.x*2.3 + k)*Math.sin(v.y*1.9 + k*.3)*Math.sin(v.z*2.1 + k*.7)
        if (q.face && sv.z > .2){
          // carved deep enough to cast shade in their own hollows: two big round eye sockets, a heavy brow, a broad nose, a wide low mouth
          const f = Math.min((sv.z - .2)/.4, 1), eye = (ex, ey) => Math.exp(-(((sv.x - ex)**2) + ((sv.y - ey)**2)*1.3)/.032)
          const eyes = eye(-.3, .26) + eye(.3, .26), mouth = Math.exp(-((sv.y + .2)**2)/.006)*Math.exp(-sv.x*sv.x/.09)
          d -= f*(.62*eyes + .2*mouth)
          d += f*(.14*Math.exp(-((sv.y - .45)**2)/.008)*Math.exp(-sv.x*sv.x/.22) + .1*Math.exp(-sv.x*sv.x/.008)*Math.exp(-((sv.y - .04)**2)/.035))
          carve[i] = f*Math.min(1, 1.6*eyes + 1.4*mouth)                   // where to paint the hollows dark
        }
        v.set(sv.x*taper, sv.y, sv.z*taper).multiplyScalar(1 + d)
      } else { v.multiplyScalar(1 + n); if (v.y > .6) v.y = .6 + (v.y - .6)*.4 }
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    if (q.stand){ g.scale(q.s, q.h*.5, q.s*.85); g.rotateX(q.lean || 0); g.rotateY(q.turn); g.translate(q.x, q.y + q.h*.38, q.z) }   // sunk to about a quarter of its height, leaning a little
    else { g.scale(q.s, q.s*q.flat, q.s*lerpN(.75, 1, (k%97)/97)); g.rotateY(q.turn); g.translate(q.x, q.y + q.s*q.flat*.12, q.z) }   // most of the stone stands above the grass; only its lower lip is sunk
    g.computeVertexNormals()
    const ao = new Float32Array(pos.count); for (let i = 0; i < pos.count; i++) ao[i] = Math.min(Math.max((pos.getY(i) - q.y + .05)/((q.stand ? q.h*.8 : q.s*q.flat*.9)), 0), 1)   // 0 where the stone meets the ground, 1 at its top
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1)); g.setAttribute('aCarve', new THREE.BufferAttribute(carve, 1)); return g
  })
  const g = mergeGeometries(parts); parts.forEach(x => x.dispose()); return g
}
const lerpN = (a, b, t) => a + (b - a)*t
const mergeVerts = g => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g) }   // shared corners, so the smooth normals run across the whole stone

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
  if (b.patch?.length){ g.setAttribute('aPatch', new THREE.Float32BufferAttribute(b.patch, 3)) }
  if (b.corner?.length){ g.setAttribute('aCorner', new THREE.Float32BufferAttribute(b.corner, 2)); g.setAttribute('aStroke', new THREE.Float32BufferAttribute(b.stroke, 3)) }
  g.setIndex(b.idx)
  return g
}
const addMesh = (mat, depth, cast, name) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.name = name
  m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true; if (depth) m.customDepthMaterial = depth; scene.add(m); return m }
const foliage = addMesh(foliageMat, null, false, 'foliage'), caster = addMesh(casterMat(atlas.tex), foliageDepth, true, 'caster'), wood = addMesh(woodMat, woodDepth, true, 'wood'), ivy = addMesh(ivyMat, null, false, 'ivy')
foliage.receiveShadow = caster.receiveShadow = false
caster.onBeforeRender = (r, sc, cam, geometry) => geometry.setDrawRange(0, 0)     // the caster exists for the shadow pass: the main pass skips it
caster.onAfterRender = (r, sc, cam, geometry) => geometry.setDrawRange(0, Infinity)
// nearest and most solid first: everything drawn after is rejected wherever something already stands in front of it, and the pricey wide
// surfaces (the field, then the sky) only pay for the pixels left over
const ground = addMesh(groundMat, null, false, 'ground'), grass = addMesh(grassMat, null, false, 'grass'), flowers = addMesh(flowerMat, null, false, 'flowers'), rocks = addMesh(rockMat, null, true, 'rocks')
foliage.renderOrder = -.2; wood.renderOrder = -.1; ground.renderOrder = .1
ground.geometry.dispose(); ground.geometry = toGeometry(generateGround(620))

const lantern = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
scene.add(lantern)

const statsEl = document.getElementById('stats')
let size = '', placePerson = null, drawEnvelope = null, drawBranches = null, mainWood = null
function setStats(ms, clumps){
  const strokes = (foliage.geometry.index?.count || 0)/6, tris = [foliage, wood, ivy].reduce((n, m) => n + (m.geometry.index?.count || 0)/3, 0)
  statsEl.textContent = `${size} · ${clumps} clumps · ${strokes.toLocaleString()} strokes · ${(tris/1000).toFixed(0)}k tris · generated in ${ms.toFixed(0)} ms`
}

const trees = []
// Bushes barely change between rebuilds and took most of their time: each is grown once at the origin, then copied into place
const bushCache = new Map()
function placeBush(bush, q, woodB, leafB){
  const key = q.seed + ':' + q.scale
  if (!bushCache.has(key)){ const wood = newBuffer(), leaf = newBuffer(), n = generatePlant(bush, q.seed, [0, 0, 0], q.scale, wood, leaf); bushCache.set(key, { wood, leaf, n }) }
  const { wood, leaf, n } = bushCache.get(key), y = groundHeight(q.x, q.z) - .05, plant = leafB.held?.length ? leafB.held[leafB.held.length - 1].plant + 1 : 0, ids = (leafB.held ??= []).length
  const copy = (src, dst) => {
    const base = dst.pos.length/3
    for (let i = 0; i < src.pos.length; i += 3) dst.pos.push(src.pos[i] + q.x, src.pos[i + 1] + y, src.pos[i + 2] + q.z)
    for (const k of ['nor', 'uv', 'leaf', 'corner', 'stroke', 'dab']) for (const v of src[k]) dst[k].push(v)
    for (let i = 0; i < src.wind.length; i += 4) dst.wind.push(src.wind[i] + q.x, src.wind[i + 1] + q.z, src.wind[i + 2], src.wind[i + 3])
    for (const v of src.idx) dst.idx.push(v + base)
  }
  copy(wood, woodB); copy(leaf, leafB)
  for (let i = 0; i < wood.center.length; i += 3) woodB.center.push(wood.center[i], wood.center[i + 1] + y, wood.center[i + 2] + q.z)    // x carries the girth
  for (let i = 0; i < leaf.center.length; i += 3) leafB.center.push(leaf.center[i] + q.x, leaf.center[i + 1] + y, leaf.center[i + 2] + q.z)
  for (let i = 0; i < leaf.patch.length; i += 3) leafB.patch.push(leaf.patch[i], leaf.patch[i + 1], leaf.patch[i + 2] < 0 ? -1 : leaf.patch[i + 2] + ids)
  for (const c of leaf.held) leafB.held.push({ ...c, plant, c: [c.c[0] + q.x, c.c[1] + y, c.c[2] + q.z] })
  return n
}

// a forest: a few prototypes of the current species, instanced hundreds of times with levels of detail (src/forest.js)
const forest = makeForest({ scene, renderer, sun, hemi, generatePlant, newBuffer, toGeometry, groundHeight, woodDepth })
// every other species in the forest is painted with its own brushes, leaf colours and bark; the current species uses the panel's materials, so its sliders still act
const mixMats = new Map()
function speciesMats(sp){
  const key = `${sp.leaf}|${sp.edge}|${sp.palette}|${sp.bark}|${sp.sss}|${sp.rim}|${JSON.stringify(sp.colors ?? [])}`
  if (mixMats.has(key)) return mixMats.get(key)
  const tex = makeBrushAtlas(sp.leaf, sp.edge), leafPal = newPalette(sp.palette)
  const leaf = makeFoliageMaterial(tex, sunTable, leafPal, { value: new THREE.Color(sp.sss) }, { value: new THREE.Color(sp.rim) })
  ;(sp.colors ?? []).forEach((f, k) => f.palette.forEach((hex, n) => leaf.uniforms.uPalV.value[k*4 + n].set(hex)))
  const m = { leaf, leafDepth: makeFoliageDepth(tex), wood: makeWoodMat(newPalette(sp.bark), leafPal, sp.bark[2]) }
  mixMats.set(key, m); return m
}
function buildForest(){
  const t0 = performance.now()
  if (atlas.key !== brushKey()){ const old = atlas.tex; atlas.tex = makeBrushAtlas(p.leaf, p.edge); atlas.key = brushKey(); foliageMat.uniforms.tBrush.value = foliageDepth.alphaMap = caster.material.alphaMap = atlas.tex; old.dispose() }
  for (const m of [foliage, caster, wood, ivy]) m.visible = false
  const mix = [{ p, mats: { leaf: foliageMat, leafDepth: foliageDepth, wood: woodMat } },
    ...p.forestMix.filter(n => n !== p.species).map(n => { const sp = { ...structuredClone(SPECIES[n]), name: n }; return { p: sp, mats: speciesMats(sp) } })]
  forest.build(mix, { count: p.forest, kinds: p.forestKinds, seed: p.seed })
  trees.length = 0; U.uTreeN.value = 0
  heldClumps = forest.state.held; shaders.clear(); fillLobes(heldClumps); U.uContactBox.value.w = 0
  const sc = sun.shadow.camera, reach = Math.min(forest.state.radius + 10, 160)
  sc.left = sc.bottom = -reach; sc.right = sc.top = reach; sc.near = 1; sc.far = 600; sc.updateProjectionMatrix()
  applyLighting(p, L); bakeSun()
  forest.finish(); renderer.shadowMap.needsUpdate = true
  size = `forest of ${forest.state.instances.length} · ${mix.length} species · ${forest.state.protos.length} prototypes` + (heldClumps.length > 256*64 ? ` · too many clumps for the light table (${heldClumps.length}), use fewer prototypes` : '')
  statsEl.textContent = `${size} · built in ${(performance.now() - t0).toFixed(0)} ms`
}
function rebuild(){
  if (p.forest > 0) return buildForest()
  if (forest.state.protos.length){ forest.clear(); for (const m of [foliage, caster, wood, ivy]) m.visible = true; applyFoliage?.() }
  U.uHueVar.value = p.hueVar; sink.value = p.showFoliage ? p.clumpRadius*p.size*1.5 : 0
  const t0 = performance.now(), woodB = newBuffer(), leafB = newBuffer(), ivyB = newBuffer()
  const { plants, bushes } = layoutScene({ ...p, height: p.height*p.size, groveRadius: p.groveRadius*Math.max(1, p.size) })
  trees.length = 0
  for (const q of plants) trees.push({ x: q.x, z: q.z, r: p.trunkRadius*p.size*q.scale*(1 + p.flare*.5)*1.7 })
  for (const q of bushes) trees.push({ x: q.x, z: q.z, r: .5*q.scale })
  U.uTreeN.value = Math.min(trees.length, 24)
  U.uTrees.value.forEach((v, i) => { const t = trees[i]; if (t) v.set(t.x, t.z, t.r); else v.set(1e5, 1e5, 1) })
  let clumps = 0
  generatePlant.envelopes = []
  for (const q of plants) clumps += generatePlant(p, q.seed, [q.x, groundHeight(q.x, q.z) - .08, q.z], q.scale, woodB, leafB, ivyB)
  mainWood = generatePlant.debug?.branches ?? null                       // the branch records of the tree just grown, for the branch debug view
  const bush = { ...SPECIES['Round bush'] }
  for (const q of bushes) clumps += placeBush(bush, q, woodB, leafB)
  ivy.geometry.dispose(); ivy.geometry = ivyB.pos.length ? toGeometry(ivyB) : new THREE.BufferGeometry()
  foliage.geometry.dispose(); foliage.geometry = toGeometry(leafB)
  heldClumps = leafB.held || []; shaders.clear(); fillLobes(heldClumps)
  caster.geometry.dispose(); caster.geometry = toGeometry(platesOf(leafB))
  renderer.shadowMap.needsUpdate = true
  wood.geometry.dispose(); wood.geometry = toGeometry(woodB)
  if (plants.length) bakeContact(renderer, wood.geometry, [plants[0].x, plants[0].z], groundHeight); else U.uContactBox.value.w = 0
  if (atlas.key !== brushKey()){
    const old = atlas.tex; atlas.tex = makeBrushAtlas(p.leaf, p.edge); atlas.key = brushKey()
    foliageMat.uniforms.tBrush.value = foliageDepth.alphaMap = caster.material.alphaMap = atlas.tex; old.dispose()
  }
  const reach = p.grove > 1 ? p.groveRadius*Math.max(1, p.size) + p.height*p.size + 8 : Math.max(26, p.height*p.size*2.6)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -reach; sc.right = sc.top = reach; sc.near = 1; sc.far = 420; sc.updateProjectionMatrix()
  L.reach = 100
  applyLighting(p, L); bakeSun()
  const first = heldClumps.filter(c => c.plant === 0), top = Math.max(0, ...first.map(c => c.c[1] + c.r*c.squash)), far = Math.max(0, ...first.map(c => Math.hypot(c.c[0], c.c[2]) + c.r))
  size = `${top.toFixed(1)} m tall · ${(far*2).toFixed(1)} m across`; placePerson?.(); drawEnvelope?.(); drawBranches?.()
  setStats(performance.now() - t0, clumps)
}
// The field follows the camera: the land is cut into squares, and those within reach are grown (nearest first, a few milliseconds' worth a
// frame) and kept, the rest dropped. A square always grows the same grass, flowers and stones, so nothing pops as squares come and go.
// The reach follows the framing: it runs well past whatever the camera is looking at, so a framed tree stands in a full field. Squares
// beyond the near ring grow a quarter of the tufts (the first quarter of the same ones), and the shader stands those far tufts a little
// larger so the field reads as dense; at the edge of the reach tufts shrink to nothing and the ground's own dabs carry on.
const GRASS_CELL = 8, GRASS_NEAR = 48, GRASS_CLOSE = 16
const field = (() => {
  const group = new THREE.Group(); group.name = 'field'; scene.add(group)
  const cells = new Map(); let around = [], key = ''
  const keyNow = () => `${p.seed}:${p.grass}:${p.flowers}:${p.rocks}`
  const dropCell = c => { for (const m of [c.grass, c.flowers, c.rocks]) if (m){ group.remove(m); m.geometry.dispose() } }
  const mesh = (geo, mat, cast) => { geo.computeBoundingSphere(); if (geo.boundingSphere) geo.boundingSphere.radius += 1.5
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; group.add(m); return m }
  return {
    reset(list){ around = list; for (const c of cells.values()) dropCell(c); cells.clear(); key = keyNow() },
    update(cam){
      if (p.forest > 0){ group.visible = false; return } group.visible = true
      if (key !== keyNow()) this.reset(around)
      const cx = cam.position.x, cz = cam.position.z, lift = Math.max(0, cam.position.y - groundHeight(cx, cz))
      const look = walk.on ? 30 : cam.position.distanceTo(controls.target)
      const reach = Math.min(Math.max(look + 45, 55), 135) + Math.min(lift, 20)
      U.uGrassFar.value.set(cx, cz, reach)
      // the distances where the cell levels change, for the shader's smooth density: dense inside r2, a third of that inside r0, then sparse
      U.uGrassLod.value.set(cx, cz, Math.max(GRASS_CLOSE, look*.55), Math.max(GRASS_NEAR, look + 20))
      U.uGrassLodT.value.set(controls.target.x, controls.target.z, walk.on ? 0 : 1)
      const want = [], span = reach + GRASS_CELL, i0 = Math.floor((cx - span)/GRASS_CELL), i1 = Math.floor((cx + span)/GRASS_CELL), j0 = Math.floor((cz - span)/GRASS_CELL), j1 = Math.floor((cz + span)/GRASS_CELL)
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++){
        const d = Math.hypot((i + .5)*GRASS_CELL - cx, (j + .5)*GRASS_CELL - cz)
        if (d > reach + GRASS_CELL*.71) continue
        // dense where the shot is: near the camera, out to half the framing distance, and around what the camera looks at
        const dt = walk.on ? 1e9 : Math.hypot((i + .5)*GRASS_CELL - controls.target.x, (j + .5)*GRASS_CELL - controls.target.z)
        const level = d < Math.max(GRASS_CLOSE, look*.55) || dt < 26 ? 2 : d < Math.max(GRASS_NEAR, look + 20) ? 0 : 1, c = cells.get(i + ',' + j)
        if (!c || c.level !== level) want.push([d, i, j, level])
      }
      want.sort((a, b) => a[0] - b[0])
      const t0 = performance.now()
      for (const [d, i, j, level] of want){
        if (performance.now() - t0 > 5) break                            // a few milliseconds a frame: the field fills in over a few frames, never in one hitch
        const k = i + ',' + j, old = cells.get(k)
        const c = old || { level, flowers: null, rocks: null }
        if (old?.grass){ group.remove(old.grass); old.grass.geometry.dispose() }
        c.level = level
        c.grass = p.grass > 0 ? mesh(toGeometry(generateGrassCell(i, j, GRASS_CELL, p.grass*(level === 2 ? 3 : level ? .15 : 1), p.seed, around, p.rocks, level === 2, p.grass*3)), grassMat, false) : null
        if (!old){
          if (p.flowers > 0){ const b = generateFlowerCell(i, j, GRASS_CELL, p.flowers, p.seed, around); if (b.pos.length) c.flowers = mesh(toGeometry(b), flowerMat, false) }
          const stones = p.rocks > 0 ? rocksOfCell(i, j, GRASS_CELL, p.rocks, p.seed, around) : []
          c.stones = stones
          if (stones.length){ c.rocks = mesh(rockGeometry(stones), rockMat, true); renderer.shadowMap.needsUpdate = true }
        }
        cells.set(k, c)
      }
      { // the stones nearest the camera ground themselves in the field's paint
        const near = []; for (const c of cells.values()) if (c.stones) for (const q of c.stones) near.push([Math.hypot(q.x - cx, q.z - cz), q])
        near.sort((a, b) => a[0] - b[0])
        const close = near.filter(e => e[0] < 60)
        U.uRockN.value = Math.min(close.length, 32)
        U.uRocks.value.forEach((v, n) => { const q = close[n]?.[1]; if (q) v.set(q.x, q.z, q.s); else v.set(1e5, 1e5, 1) }) }
      for (const [k, c] of cells){ const [i, j] = k.split(',').map(Number)
        if (Math.hypot((i + .5)*GRASS_CELL - cx, (j + .5)*GRASS_CELL - cz) > reach + GRASS_CELL*2.5){ dropCell(c); cells.delete(k) } }
    },
    count: () => cells.size,
  }
})()
// rocks out over the far meadow, beyond the field that follows the camera: a fixed scatter in large squares to the edge of the land
// standing stones: the same paint with a soft ramp and a lighter, mossier palette, so their rounded forms and carved faces shade smoothly
const standMat = patch(new THREE.MeshStandardMaterial({ color: '#7a7f78', roughness: 1 }), { ...rockLook, softRamp: true,
  vertexPars: rockLook.vertexPars + ' attribute float aCarve; varying float vCarve;', vertexBegin: rockLook.vertexBegin + ' vCarve = aCarve;',
  fragmentPars: rockLook.fragmentPars + ' varying float vCarve;',
  // the carved hollows hold shadow and old moss: painted a deep cool green-grey, so the face reads at any light
  palLine: rockLook.palLine + ' pal = mix(pal, vec3(.05, .09, .08), smoothstep(.15, .7, vCarve)*.85);', uniforms: paletteUniforms(newPalette(['#4a4632', '#7d7650', '#b0a678', '#ddd4a8'])) })
const standStones = new THREE.Mesh(new THREE.BufferGeometry(), standMat); standStones.castShadow = standStones.receiveShadow = true; standStones.frustumCulled = false; scene.add(standStones)
const farRocks = new THREE.Mesh(new THREE.BufferGeometry(), rockMat); farRocks.castShadow = farRocks.receiveShadow = true; farRocks.frustumCulled = false; scene.add(farRocks)
function rebuildFarRocks(){
  farRocks.geometry.dispose()
  const stones = [], C = 24
  if (p.farRocks > 0) for (let i = -25; i <= 25; i++) for (let j = -25; j <= 25; j++){
    const d = Math.hypot((i + .5)*C, (j + .5)*C); if (d < 120 || d > 590) continue
    for (const q of rocksOfCell(i, j, C, 1.5*p.farRocks, p.seed + 31, trees)) stones.push({ ...q, s: q.s*2.4 })   // larger out here, or they read as specks
  }
  // big boulders and standing stones, near and far: a few large stones that stick well out of the grass, and upright carved stones in
  // ones and twos, some with a worn face, scattered over the meadow
  const r = mulberry32(p.seed*977 + 41), clearOf = (x, z) => trees.every(q => Math.hypot(q.x - x, q.z - z) > q.r*2.2 + 3)
  for (let n = 0, N = Math.round(8*p.farRocks); n < N; n++){
    const R = lerpN(30, 560, Math.sqrt(r())), a = r()*Math.PI*2, x = R*Math.cos(a), z = R*Math.sin(a); if (!clearOf(x, z)) continue
    stones.push({ x, z, y: groundHeight(x, z) - .1, s: lerpN(1.2, 2.6, r()), flat: lerpN(.6, .85, r()), turn: r()*7, seed: Math.floor(r()*1e6) })
  }
  // a smattering of boulders near the tree: a few groups of one big stone with smaller ones about it, 14-40 m out on the sides the framed
  // view looks toward, half sunk in the grass (standing stones were tried and removed; rock geometry still supports q.stand)
  for (const [deg, R0] of [[205, 22], [250, 34], [120, 18], [300, 40], [165, 30]]){
    const a0 = deg*Math.PI/180 + (r() - .5)*.2, R = R0*lerpN(.9, 1.1, r()), x0 = R*Math.cos(a0), z0 = R*Math.sin(a0)
    for (let m = 0, M = 1 + Math.floor(r()*3); m < M; m++){
      const b = r()*7, d = m ? lerpN(1.5, 3.5, r()) : 0, x = x0 + Math.cos(b)*d, z = z0 + Math.sin(b)*d
      if (!clearOf(x, z)) continue
      stones.push({ x, z, y: groundHeight(x, z) + (m ? .05 : .2), s: m ? lerpN(.6, .9, r()) : lerpN(1.3, 1.8, r()), flat: m ? lerpN(.8, 1, r()) : lerpN(1, 1.3, r()),   // the big one stands 1.1-2 m out of the ground (top = .88*s*flat)
       turn: r()*7, seed: Math.floor(r()*1e6) })   // well above the knee-high grass
    }
  }
  const plain = stones.filter(q => !q.stand), stand = stones.filter(q => q.stand)
  farRocks.geometry = plain.length ? rockGeometry(plain) : new THREE.BufferGeometry()
  standStones.geometry.dispose(); standStones.geometry = stand.length ? rockGeometry(stand) : new THREE.BufferGeometry()
  farRocks.userData.stones = stones   // for framing and inspection
}
function rebuildGrass(){
  rebuildFarRocks()
  // the field (grass, flowers, rocks) follows the camera; only the collars where trunks meet the ground stay put
  grass.geometry.dispose()
  grass.geometry = p.grass > 0 ? toGeometry(generateGrassCollars(p.seed, trees)) : new THREE.BufferGeometry()
  grass.visible = p.grass > 0
  field.reset(trees)
  renderer.shadowMap.needsUpdate = true
}
let queued = 0
const later = () => { clearTimeout(queued); queued = setTimeout(() => { rebuild(); rebuildGrass() }, 60) }
function applyLook(){
  barkLook.uBarkScale.value = p.barkScale; barkLook.uBarkStretch.value = p.barkStretch; barkLook.uBarkPlates.value = p.barkPlates; barkLook.uBarkBands.value = p.barkBands; U.uFurrow.value = p.barkFurrow
  ;(p.colors ?? []).forEach((f, k) => f.palette.forEach((hex, n) => foliageMat.uniforms.uPalV.value[k*4 + n].set(hex)))
  setPalette(pals.foliage, p.palette); setPalette(pals.bark, p.bark); setPalette(pals.ground, p.ground)
  woodMat.color.set(p.bark[2]); groundMat.color.set(p.ground[2]); grassMat.color.set(p.ground[2])
  sssColor.value.set(p.sss); rimColor.value.set(p.rim); U.uFleck.value = p.fleck; U.uMoss.value = p.moss
}
function frame(){
  if (p.forest > 0){ const R = forest.state.radius || 50; camera.position.set(R*.9, R*.35 + 15, R*.9); controls.target.set(0, 8, 0); controls.update(); return }
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
// the fitted outline: the volume the main tree's growth was asked to fill, spun round its axis (blue), and for self-organising trees the hollow
// kept clear in the lower crown (orange). Drawn through everything, so wood can be read against it
const envelopeView = new THREE.Group(); envelopeView.visible = false; envelopeView.renderOrder = 10; scene.add(envelopeView)
const envMat = new THREE.LineBasicMaterial({ color: '#1f6fe0', transparent: true, opacity: .85, depthTest: false }), hollowMat = new THREE.LineBasicMaterial({ color: '#ff7a00', transparent: true, opacity: .95, depthTest: false })
drawEnvelope = () => {
  for (const c of [...envelopeView.children]){ c.geometry.dispose(); envelopeView.remove(c) }
  const env = generatePlant.envelopes?.[0]; if (!env) return
  const lines = (rings, mat, every) => { const v = []
    for (const ring of rings) for (let j = 1; j < ring.length; j++) v.push(...ring[j - 1], ...ring[j])
    for (let j = 0; j < (rings[0]?.length ?? 0) - 1; j += every) for (let k = 1; k < rings.length; k++) v.push(...rings[k - 1][j], ...rings[k][j])
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); const l = new THREE.LineSegments(g, mat); l.renderOrder = 10; envelopeView.add(l) }
  if (env.rings.length) lines(env.rings, envMat, 6)
  if (env.hollow.length) lines(env.hollow, hollowMat, 8)
}
const compareF = gui.addFolder('Compare').close()
// branch debug view: the wood drawn as lines through everything, coloured by branch order, by each branch, or by the year it grew
const branchView = new THREE.Group(); branchView.visible = false; branchView.renderOrder = 11; scene.add(branchView)
const branchMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })
const ORDER_COLORS = ['#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2', '#ff2d92'].map(c => new THREE.Color(c))
const debugView = { mode: 'off' }
drawBranches = () => {
  for (const c of [...branchView.children]){ c.geometry.dispose(); branchView.remove(c) }
  branchView.visible = debugView.mode !== 'off'; if (!branchView.visible || !mainWood) return
  const pos = [], col = [], c = new THREE.Color(), years = mainWood.flatMap(b => b.line ?? []).map(n => n.yr ?? 0), ymax = Math.max(1, ...years)
  for (const [bi, b] of mainWood.entries()){ if (!b.kept || b.root) continue
    const pts = b.line ?? b.trail, last = Math.min(b.cut ?? 1e9, pts.length - 1)
    if (debugView.mode === 'each branch') c.setHSL((bi*.618034)%1, .85, .55)
    for (let i = 1; i <= last; i++){ const a = pts[i - 1], n = pts[i]
      if (debugView.mode === 'branch order') c.copy(ORDER_COLORS[Math.min(Math.max((n.stage ?? b.level + 1) - 1, 0), ORDER_COLORS.length - 1)])
      else if (debugView.mode === 'year grown') c.setHSL(.7*(1 - (n.yr ?? 0)/ymax), .9, .55)
      else if (debugView.mode === 'branch level') c.copy(ORDER_COLORS[Math.min(b.level, ORDER_COLORS.length - 1)])
      pos.push(...a.p, ...n.p); col.push(c.r, c.g, c.b, c.r, c.g, c.b) } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  const l = new THREE.LineSegments(g, branchMat); l.renderOrder = 11; branchView.add(l) }
const outlineCtl = compareF.add({ outline: false }, 'outline').name('Show fitted outline').onChange(v => { envelopeView.visible = v; drawEnvelope() })
compareF.add(debugView, 'mode', ['off', 'branch order', 'each branch', 'year grown', 'branch level']).name('Colour branches by').onChange(drawBranches)
compareF.add({ walk(){ walk.toggle() } }, 'walk').name('Walk around at eye height (G)')
compareF.add({ person: false }, 'person').name('Person for scale (1.7 m)').onChange(v => { person.visible = v; placePerson() })
compareF.add({ on: false }, 'on').name('Show reference').onChange(v => { compare.set(v); frame() })
compareF.add({ next(){ compare.next() } }, 'next').name('Next reference')
compareF.add({ forget(){ compare.forget() } }, 'forget').name('Forget my picture')
const treeF = gui.addFolder('Plant')
// wood alone, for reviewing structure: leaves, ivy and their shadows go, and buried wood comes back to its true depth
function applyFoliage(){
  foliage.visible = caster.visible = ivy.visible = p.showFoliage
  sink.value = p.showFoliage ? p.clumpRadius*p.size*1.5 : 0; crownDark.value = p.showFoliage ? 1 : 0
  renderer.shadowMap.needsUpdate = true
}
applyFoliage()
treeF.add(p, 'showFoliage').name('Show foliage').onChange(applyFoliage)
let recipeUi = null
// a species is all of its own settings and nothing else: a setting the last species had and this one doesn't is dropped, or one tree's look would leak into the next
const setSpecies = (name, settings = SPECIES[name]) => { for (const k of new Set(Object.values(SPECIES).flatMap(Object.keys))) if (!(k in settings)) delete p[k]; Object.assign(p, structuredClone(settings)); p.species = name }
const speciesCtl = treeF.add(p, 'species', Object.keys(SPECIES).sort()).name('Species').onChange(name => {
  compare.species(name)
  setSpecies(name); applyLook(); gui.controllersRecursive().forEach(c => c.updateDisplay()); recipeUi?.refresh(); rebuild(); rebuildGrass(); frame() })
treeF.add(p, 'seed', 1, 9999, 1).name('Seed').onChange(later).listen()
treeF.add({ dice(){ p.seed = 1 + Math.floor(Math.random()*9998); rebuild(); rebuildGrass() } }, 'dice').name('New seed')
treeF.add(p, 'height', 1.5, 26, .1).name('Height').onChange(later)
treeF.add(p, 'size', .3, 4, .01).name('Mature size').onChange(() => { later(); frame() })
treeF.add(p, 'trunkRadius', .06, 1.4, .01).name('Trunk radius').onChange(later)
treeF.add(p, 'trunkFrac', .02, .85, .01).name('Bare trunk').onChange(later)
treeF.add(p, 'stems', 1, 5, .1).name('Stems (average)').onChange(later)
treeF.add(p, 'stemVar', 0, 3, .1).name('Stem count variation').onChange(later)
treeF.add(p, 'stemSpread', 0, 50, 1).name('Stem spread').onChange(later)
treeF.add(p, 'trunkBow', 0, .6, .01).name('Trunk curve').onChange(later)
treeF.add(p, 'split', 0, 1, .01).name('Split low (self-organising)').onChange(later)
treeF.add(p, 'variety', 0, 1.5, .01).name('Seed variety').onChange(later)
treeF.add(p, 'sinuous', 0, 1.5, .01).name('Trunk bends').onChange(later)
treeF.add(p, 'crownWidth', .08, 1.1, .01).name('Crown width').onChange(later)
treeF.add(p, 'asym', 0, .6, .01).name('Asymmetry').onChange(later)
treeF.add(p, 'windLean', 0, .7, .01).name('Wind lean').onChange(later)
treeF.add(p, 'notches', 0, 8, 1).name('Bays in the crown').onChange(later)
const branchF = treeF.addFolder('Branching').close()
branchF.add(p, 'children', 2, 10, 1).name('Main limbs').onChange(later)
branchF.add(p, 'childAngle', 8, 95, 1).name('Branch angle').onChange(later)
branchF.add(p, 'lengthRatio', .25, 1.3, .01).name('Branch length').onChange(later)
branchF.add(p, 'gnarl', 0, .5, .01).name('Crookedness').onChange(later)
branchF.add(p, 'upward', -.2, .2, .005).name('Tropism').onChange(later)
branchF.add(p, 'droop', 0, .3, .005).name('Droop').onChange(later)
branchF.add(p, 'lean', 0, .4, .01).name('Lean').onChange(later)
branchF.add(p, 'flare', 0, 2, .01).name('Root flare').onChange(later)
// tuning a species without code: its outline, its growth habit, and the whole recipe as a file
recipeUi = addRecipeGui({ gui, p, SPECIES, speciesCtl, later, setSpecies, rebuild: () => { rebuild(); rebuildGrass() },
  refreshAll: () => { compare.species(p.species); applyLook(); gui.controllersRecursive().forEach(c => c.updateDisplay()); recipeUi?.refresh(); rebuild(); rebuildGrass(); frame() },
  showOutline: () => { outlineCtl.setValue(true) }, applyLook })
const leafF = gui.addFolder('Canopy')
leafF.add(p, 'colorPick', 0, 4, 1).name('Colour form (0 = by seed)').onChange(later)
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
leafF.add(p, 'midSize', 0, 5, .05).name('Middle marks').onChange(later)
leafF.add(p, 'lobeRough', 0, 2, .01).name('Lobe knobbliness').onChange(later)
leafF.add(p, 'lobePoint', -.8, .8, .01).name('Lobe point').onChange(later)
leafF.add(p, 'lobeTilt', -.6, .6, .01).name('Lobe tilt').onChange(later)
leafF.add(p, 'lobeWide', .6, 2, .01).name('Lobe width').onChange(later)
leafF.add(p, 'lobeDrape', 0, 1, .01).name('Lobe drape').onChange(later)
leafF.add(p, 'lobeFollow', 0, 1, .01).name('Lobes follow the crown').onChange(later)
leafF.add(p, 'lobeAlong', 1, 3, .01).name('Sprays along twigs').onChange(later)
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
const colF = gui.addFolder('Colour').close()
for (const [key, label] of [['palette', 'Foliage'], ['bark', 'Bark'], ['ground', 'Ground']])
  [`${label} shadow`, `${label} dark`, `${label} mid`, `${label} light`].forEach((n, i) =>
    colF.addColor(p[key], String(i)).name(n).onChange(applyLook))
colF.addColor(p, 'sss').name('Backlight').onChange(applyLook)
colF.addColor(p, 'rim').name('Rim').onChange(applyLook)
const sceneF = gui.addFolder('Scene').close()
sceneF.add(p, 'grove', 1, 12, 1).name('Trees').onChange(later)
const forestF = gui.addFolder('Forest (instanced, LOD)').close()
forestF.add(p, 'forest', 0, 1000, 10).name('Trees in forest (0 = off)').onChange(() => { rebuild(); frame() })
forestF.add(p, 'forestKinds', 1, 8, 1).name('Prototypes').onChange(() => { if (p.forest > 0) rebuild() })
forestF.add(p, 'lodScale', .25, 4, .05).name('Detail distance ×')
const mixF = forestF.addFolder('Mixed in (besides the current species)').close(), mixSel = {}
for (const n of Object.keys(SPECIES).filter(n => n !== 'Round bush').sort()){ mixSel[n] = p.forestMix.includes(n)
  mixF.add(mixSel, n).onChange(() => { p.forestMix = Object.keys(mixSel).filter(k => mixSel[k]); if (p.forest > 0){ rebuild(); frame() } }) }
// benchmark: the same view at 100, 300 and 1000 trees, frame time averaged over 3 seconds each
forestF.add({ async bench(){ const out = []
  for (const n of [100, 300, 1000]){ p.forest = n; rebuild(); frame(); await new Promise(r => setTimeout(r, 800))
    const t0 = performance.now(); let f = 0, tris = 0; await new Promise(res => { const tick = () => { f++; tris = Math.max(tris, renderer.info.render.triangles); if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res() }; requestAnimationFrame(tick) })
    out.push(`${n} trees: ${((performance.now() - t0)/f).toFixed(1)} ms/frame, ${(tris/1e6).toFixed(2)}M tris, levels ${forest.state.counts.join('/')}`) }
  window.__forestBench = out; console.log(out.join('\n')); alert(out.join('\n')) } }, 'bench').name('Run benchmark (100/300/1000)')
sceneF.add(p, 'groveRadius', 8, 40, .5).name('Grove radius').onChange(later)
sceneF.add(p, 'bushes', 0, 40, 1).name('Bushes').onChange(later)
sceneF.add(p, 'farBushes', 0, 150, 1).name('Bushes far out').onChange(later)
sceneF.add(p, 'farRocks', 0, 3, .05).name('Rocks far out').onChange(() => rebuildFarRocks())
sceneF.add(p, 'grass', 0, 60, 1).name('Grass tufts per m²').onChange(later)
sceneF.add(p, 'flowers', 0, 300, 5).name('Wildflowers per 100 m²').onChange(later)
sceneF.add(p, 'rocks', 0, 80, 1).name('Rocks per hectare').onChange(later)
const lightF = gui.addFolder('Light')
const relight = () => { applyLighting(p, L); bakeSun(); if (p.forest > 0) forest.rebake(); renderer.shadowMap.needsUpdate = true }
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
lightF.add(p, 'clouds', 0, 30, 1).name('Clouds').onChange(reCloud)
lightF.add(p, 'cloudSeed', 1, 99, 1).name('Cloud seed').onChange(reCloud)
lightF.add(p, 'haze', 0, .95, .01).name('Haze').onChange(relight)
lightF.add(p, 'mountains').name('Distant mountains').onChange(() => mountains.set(p.mountains, p.mountainHeight))
lightF.add(p, 'mountainHeight', .3, 2, .01).name('Mountain height').onChange(() => mountains.set(p.mountains, p.mountainHeight))
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
uni(U, 'uLightShape', 'Light shapes', 0, 1, .01)
uni(U, 'uSelfShade', 'Mass shadows', 0, 1, .01)
shadeF.add(p, 'hueVar', 0, 2, .01).name('Hue variation').onChange(v => { U.uHueVar.value = v })
uni(U, 'uAir', 'Air in the shadows', 0, 1, .01)
uni(U, 'uPigment', 'Pigment variation', 0, 2.5, .01)
uni(U, 'uShadowFillK', 'Warm shadow fill', 0, .6, .01)
shadeF.add(U.uFlecks, 'value', 0, .6, .01).name('Sun flecks in shade').onChange(() => { renderer.shadowMap.needsUpdate = true })
shadeF.add(p, 'exposure', .3, 2, .01).name('Exposure').onChange(v => { renderer.toneMappingExposure = v })
const barkF = gui.addFolder('Bark')
barkF.add(p, 'moss', 0, 1, .01).name('Moss').onChange(applyLook)
barkF.add(p, 'ivy', 0, 1, .01).name('Ivy').onChange(later)
barkF.add(U.uBarkVar, 'value', 0, 1.5, .01).name('Colour variation')
barkF.add(U.uFurrow, 'value', 0, 1.5, .01).name('Furrows')
barkF.add(p, 'roots', 0, 2, .01).name('Surface roots').onChange(later)
const windF = gui.addFolder('Wind').close()
windF.add(p, 'windOn').name('Wind').onChange(v => { U.uWind.value = v ? 1 : 0 })
p.windDir = 63                                                           // degrees: one direction for gusts, grass, trees, cloud shadows and cloud drift
const setWindDir = () => { const r = p.windDir*Math.PI/180; U.uWindDir.value.set(Math.cos(r), Math.sin(r)) }
windF.add(p, 'windDir', 0, 360, 1).name('Wind direction').onChange(setWindDir); setWindDir()
U.uWind.value = p.windOn ? 1 : 0                                    // the shader starts with the checkbox: it used to start still until toggled
uni2(U.uSway, 'Sway', 0, 3); uni2(U.uFlutter, 'Flutter', 0, .15)
function uni2(u, n, a, b){ windF.add(u, 'value', a, b, .001).name(n) }
const outF = gui.addFolder('Output').close()
const resCtl = outF.add(view, 'resolution', .75, 2, .125).name('Resolution').onChange(v => renderer.setPixelRatio(v))
outF.add(view, 'hold60').name('Hold 60 fps')
outF.add({ show: true }, 'show').name('Profiling stats').onChange(v => { statsBar.style.display = v ? 'flex' : 'none' })
outF.add(p, 'autoRotate').name('Turntable').onChange(v => { controls.autoRotate = v })
outF.add({ frame }, 'frame').name('Frame the plant')
outF.add({ png(){ clouds.bake(renderer); mountains.bake(renderer); renderer.render(scene, camera); renderer.domElement.toBlob(b => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${p.species.replace(/ /g, '-').toLowerCase()}-${p.seed}.png`; a.click(); URL.revokeObjectURL(a.href) }) } }, 'png').name('Save image')
outF.add({ copy(){ navigator.clipboard?.writeText(JSON.stringify(p, null, 1)) } }, 'copy').name('Copy settings')

// ---- walking: first person at a person's eye height (1.6 m), to stand under the trees and look up ----
// click to look with the mouse (Esc frees it), WASD or arrows to walk, Shift to run, G or the button to go back to orbiting
const walk = { on: false, yaw: 0, pitch: 0, keys: new Set(), fov: camera.fov, eye: 1.6,
  hint: Object.assign(document.createElement('div'), { textContent: 'Walking - click to look around · WASD / arrows to move · Shift to run · Esc frees the mouse · G to stop walking' }),
  toggle(){ this.on ? this.stop() : this.start() },
  start(){ this.on = true; controls.enabled = false; this.keys.clear()
    // start a few paces outside the crown, facing the trunk
    const reach = Math.max(4, (p.height*p.size)*(p.crownWidth || .5)*2.2), a = Math.atan2(camera.position.x, camera.position.z)
    camera.position.set(Math.sin(a)*reach, 0, Math.cos(a)*reach); camera.position.y = groundHeight(camera.position.x, camera.position.z) + this.eye
    this.yaw = Math.atan2(camera.position.x, camera.position.z); this.pitch = .12
    camera.fov = 62; camera.updateProjectionMatrix(); this.hint.style.display = 'block' },
  stop(){ this.on = false; document.pointerLockElement && document.exitPointerLock(); camera.fov = this.fov; camera.updateProjectionMatrix()
    const ahead = new THREE.Vector3(0, 0, -6).applyEuler(camera.rotation); controls.target.copy(camera.position).add(ahead); controls.enabled = true; controls.update(); this.hint.style.display = 'none' },
  step(dt){ const k = this.keys, f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0), r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 4.5 : 1.5)*dt, len = Math.hypot(f, r) || 1, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw)
    camera.position.x += (-sy*f + cy*r)/len*speed; camera.position.z += (-cy*f - sy*r)/len*speed
    camera.position.y = groundHeight(camera.position.x, camera.position.z) + this.eye
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ') } }
walk.hint.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:20;display:none;padding:6px 12px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font:12px system-ui;pointer-events:none'
document.body.append(walk.hint)
const typing = e => e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable
addEventListener('keydown', e => { if (typing(e)) return
  if (e.code === 'KeyG'){ walk.toggle(); return }
  if (walk.on){ walk.keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault() } })
addEventListener('keyup', e => walk.keys.delete(e.code))
addEventListener('blur', () => walk.keys.clear())
renderer.domElement.addEventListener('click', () => { if (walk.on && !document.pointerLockElement) renderer.domElement.requestPointerLock?.()?.catch?.(() => {}) })
// look: with the mouse captured, or by dragging if the browser won't capture it
let lookDrag = null
renderer.domElement.addEventListener('pointerdown', e => { if (walk.on && !document.pointerLockElement) lookDrag = { x: e.clientX, y: e.clientY } })
addEventListener('pointermove', e => { if (!walk.on) return
  let dx = 0, dy = 0
  if (document.pointerLockElement === renderer.domElement){ dx = e.movementX; dy = e.movementY } else if (lookDrag){ dx = e.clientX - lookDrag.x; dy = e.clientY - lookDrag.y; lookDrag = { x: e.clientX, y: e.clientY } }
  walk.yaw -= dx*.0025; walk.pitch = Math.max(-1.45, Math.min(1.45, walk.pitch - dy*.0025)) })
addEventListener('pointerup', () => { lookDrag = null })

// ---- input ----
let dragging = null
renderer.domElement.addEventListener('pointerdown', e => { if (e.shiftKey && !walk.on){ dragging = { x: e.clientX, y: e.clientY }; controls.enabled = false } })
addEventListener('pointermove', e => { if (!dragging) return
  p.sunAzimuth = ((p.sunAzimuth + (e.clientX - dragging.x)*.4 + 540)%360) - 180
  p.time = Math.min(18.9, Math.max(5.1, p.time - (e.clientY - dragging.y)*.015))
  dragging = { x: e.clientX, y: e.clientY }; relight() })
addEventListener('pointerup', () => { dragging = null; controls.enabled = !walk.on })
function layout(){ const w = innerWidth - compare.width - (compare.width && !gui._closed ? gui.domElement.offsetWidth : 0); camera.aspect = w/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(w, innerHeight); renderer.domElement.style.marginLeft = compare.width + 'px' }
addEventListener('resize', layout)

// ---- go ----
applyLook(); clouds.build(p.clouds, p.cloudSeed); rebuild(); rebuildGrass(); lamp(); frame()
if (qs.has('close')) gui.close()
window.__foliage = { clouds, forest, walk, branchView, debugView, drawBranches, envelopeView, envelopes: () => generatePlant.envelopes, gui, p, U, view, renderer, scene, camera, controls, rebuild, relight, frame, foliage, wood, sun }
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
  if (walk.on) walk.step(dt); else controls.update()
  pxAngle.value = 2*Math.tan(camera.fov*Math.PI/360)/Math.max(renderer.domElement.clientHeight, 1)   // the angle one pixel spans
  sky.position.copy(camera.position); sky.scale.setScalar(1000); clouds.position.copy(camera.position); mountains.update(camera)
  { // the sky drifts with the wind: the cloud dome turns so that clouds ahead of the camera slide the way the wind blows across the view
    const f = camera.getWorldDirection(new THREE.Vector3()), side = U.uWindDir.value.x*-f.z + U.uWindDir.value.y*f.x
    clouds.rotation.y += -side*dt*.006*U.uWind.value }
  field.update(camera)
  if (++frameNo%3 === 0 && U.uWind.value > 0) renderer.shadowMap.needsUpdate = true     // shadows only need redrawing while things move
  holdFrameRate()
  if (p.forest > 0){ forest.update(camera, p.lodScale); if (frameNo%15 === 0){ const c = forest.state.counts; statsEl.textContent = `${size} · full ${c[0]} · medium ${c[1]} · low ${c[2]} · impostor ${c[3]} · ${(renderer.info.render.triangles/1e6).toFixed(2)}M tris drawn` } }
  clouds.bake(renderer); mountains.bake(renderer)                      // only redraw when the light has changed
  renderer.render(scene, camera)
  fps.st.end(); ms.st.end()
  const info = renderer.info.render, t = info.triangles/1000
  peakCalls = Math.max(peakCalls, info.calls); peakTris = Math.max(peakTris, t)
  calls.added.update(info.calls, peakCalls); tris.added.update(t, peakTris)
})
