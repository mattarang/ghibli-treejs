// A forest of instanced trees with levels of detail, of one species or several. A few prototype trees of each are grown once at the origin; hundreds of copies are placed by
// moving and scaling them (never turning them, so the light baked for each prototype still holds), and each copy is drawn at the level
// its distance asks for:
//   0  full       every stroke, all the wood
//   1  medium     plates, clump bodies and mid marks (about a fifth of the strokes); wood thicker than a twig
//   2  low        plates and clump bodies; the trunk and main limbs
//   3  impostor   one camera-facing card, painted from the full tree at 8 angles round it
import * as THREE from 'three'
import { U } from './ghibli-patch.js'

const SIZES = { pos: 3, nor: 3, uv: 2, wind: 4, center: 3, leaf: 3, corner: 2, stroke: 3, dab: 1, patch: 3 }
const VIEWS = 8, TILE = 256

// one prototype's part of a shared buffer, renumbered from zero
function slice(b, v0, v1, i0, i1){
  const o = { idx: b.idx.slice(i0, i1).map(i => i - v0) }
  for (const [k, n] of Object.entries(SIZES)) o[k] = (b[k] ?? []).slice(v0*n, v1*n)
  return o
}
// the strokes whose layer passes, as a new buffer (a stroke is 4 vertices and 2 triangles)
function strokesWhere(b, keep){
  const o = { idx: [] }; for (const k in SIZES) o[k] = []
  for (let v = 0, n = b.dab.length; v < n; v += 4){ if (!keep(b.dab[v])) continue
    const base = o.pos.length/3
    for (const [k, size] of Object.entries(SIZES)) for (let i = v*size, e = (v + 4)*size; i < e; i++) o[k].push(b[k][i])
    o.idx.push(base, base + 1, base + 2, base, base + 2, base + 3) }
  return o
}
// wood triangles thicker than a girth, sharing the full vertex buffer
function woodWhere(b, least){
  const o = { ...b, idx: [] }, g = i => b.center[i*3]
  for (let t = 0; t < b.idx.length; t += 3){ const a = b.idx[t], c = b.idx[t + 1], d = b.idx[t + 2]; if (Math.max(g(a), g(c), g(d)) >= least) o.idx.push(a, c, d) }
  return o
}

const impostorShader = {
  vertexShader: /* glsl */`
    uniform float uViews; varying vec2 vUv; varying float vFrame, vDist;
    #include <fog_pars_vertex>
    void main(){
      vec3 c = (modelMatrix*instanceMatrix*vec4(0., 0., 0., 1.)).xyz; float s = length(instanceMatrix[0].xyz);
      vec3 toCam = cameraPosition - c; toCam.y = 0.; toCam = normalize(toCam + vec3(1e-4, 0., 0.));
      vec3 right = vec3(toCam.z, 0., -toCam.x);
      // the painted view nearest the way we're looking from
      float a = atan(toCam.x, toCam.z); vFrame = mod(floor(a/6.2831853*uViews + .5), uViews);
      vec3 wp = c + right*position.x*s + vec3(0., position.y*s, 0.);
      vUv = uv;
      vec4 mvPosition = viewMatrix*vec4(wp, 1.); vDist = length(mvPosition.xyz);
      gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tViews; uniform float uViews, uAir; varying vec2 vUv; varying float vFrame, vDist;
    #include <fog_pars_fragment>
    void main(){
      vec4 t = texture2D(tViews, vec2((vFrame + vUv.x)/uViews, vUv.y));
      if (t.a < .5) discard;
      gl_FragColor = vec4(t.rgb, 1.);
      // the distance lifts it toward the sky, as it does every stroke
      float air = (1. - exp(-max(vDist - 220., 0.)*.0045))*.6*uAir; gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, air);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`
}

export function makeForest({ scene, renderer, sun, hemi, generatePlant, newBuffer, toGeometry, groundHeight, woodDepth }){
  const root = new THREE.Group(); root.name = 'forest'; scene.add(root)
  const state = { protos: [], instances: [], meshes: [], held: [], counts: [0, 0, 0, 0], H: 10 }

  function clear(){
    for (const m of state.meshes){ m.geometry.dispose(); if (m.material.isImpostor){ m.material.uniforms.tViews.value.dispose(); m.material.dispose() } root.remove(m) }
    state.meshes = []; state.protos = []; state.instances = []
  }
  const inst = (geo, mat, n, depth, cast) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = !!cast; m.receiveShadow = true
    if (depth) m.customDepthMaterial = depth; root.add(m); state.meshes.push(m); return m }

  // paint a prototype from VIEWS angles round it into one strip, lit as the scene is now
  function bake(proto){
    const bs = new THREE.Scene(), s = sun.clone(); s.castShadow = false; s.target = new THREE.Object3D(); s.target.position.copy(sun.target.position).sub(sun.position).add(s.position)
    bs.add(s, s.target, hemi.clone())
    const w = new THREE.Mesh(proto.woodGeo[0], proto.mats.wood), f = new THREE.Mesh(proto.leafGeo[0], proto.mats.leaf); w.frustumCulled = f.frustumCulled = false; bs.add(w, f)
    const { h, r } = proto, cam = new THREE.OrthographicCamera(-r, r, h, 0, .1, r*8 + 10)
    const rt = new THREE.WebGLRenderTarget(TILE*VIEWS, Math.max(32, Math.round(TILE*h/(2*r))), { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
    const keep = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear, shadow: renderer.shadowMap.enabled }
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.autoClear = false; renderer.shadowMap.enabled = false
    for (let v = 0; v < VIEWS; v++){ const a = v/VIEWS*Math.PI*2
      cam.position.set(Math.sin(a)*r*3, h*.5, Math.cos(a)*r*3); cam.lookAt(0, h*.5, 0); cam.top = h*.5; cam.bottom = -h*.5; cam.updateProjectionMatrix()
      rt.viewport.set(v*TILE, 0, TILE, rt.height); rt.scissor.set(v*TILE, 0, TILE, rt.height); rt.scissorTest = true
      renderer.setRenderTarget(rt); renderer.render(bs, cam) }
    rt.scissorTest = false
    renderer.setRenderTarget(keep.target); renderer.setClearColor(keep.color, keep.alpha); renderer.autoClear = keep.auto; renderer.shadowMap.enabled = keep.shadow
    const mat = new THREE.ShaderMaterial({ ...impostorShader, fog: true, uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), tViews: { value: rt.texture }, uViews: { value: VIEWS }, uAir: U.uAir } })
    mat.isImpostor = true
    const geo = new THREE.PlaneGeometry(2*r, h); geo.translate(0, h/2, 0)
    return { geo, mat, rt }
  }

  // grow `kinds` prototypes of each species, then scatter `count` copies over a disc.
  // mix: [{ p, mats: { leaf, leafDepth, wood }, share }], one entry per species, each with its own materials (palette, bark, brushes)
  function build(mix, { count, kinds, seed }){
    clear()
    const leafAll = newBuffer()
    mix.forEach((m, s) => { for (let k = 0; k < kinds; k++){
      const wood = newBuffer(), v0 = leafAll.pos.length/3, i0 = leafAll.idx.length
      generatePlant(m.p, seed + k*7919 + s*104729, [0, 0, 0], 1, wood, leafAll)
      const leaf = slice(leafAll, v0, leafAll.pos.length/3, i0, leafAll.idx.length)
      let girth = 0, h = 0; for (let i = 0; i < wood.center.length; i += 3) girth = Math.max(girth, wood.center[i])
      for (const b of [leaf, wood]) for (let i = 1; i < b.pos.length; i += 3) h = Math.max(h, b.pos[i])
      let r = 1; for (let i = 0; i < leaf.pos.length; i += 3) r = Math.max(r, Math.hypot(leaf.pos[i], leaf.pos[i + 2]))
      const levels = [leaf, strokesWhere(leaf, d => d < 1.1), strokesWhere(leaf, d => d < .3)]   // medium keeps the mid dabs, which carry the lit edge, and drops only the small accents and strays
      const woods = [wood, woodWhere(wood, girth*.07), woodWhere(wood, girth*.25)]
      const plates = strokesWhere(leaf, d => d < .1)
      state.protos.push({ species: s, name: m.p.name ?? '', h: h + .5, r: r*1.05, mats: m.mats, leafGeo: levels.map(toGeometry), woodGeo: woods.map(toGeometry), plateGeo: toGeometry(plates),
        tris: [levels.map(b => b.idx.length/3), woods.map(b => b.idx.length/3)] })
    } })
    state.held = leafAll.held ?? []
    state.H = state.protos.reduce((t, q) => Math.max(t, q.h), 0)
    // places: dart throwing (a Poisson-disc scatter), each tree keeping its own crown's room. Crowns may meet and overlap a little, as they do
    // in a wood, but no trunk stands inside another tree's crown
    const rnd = mulberry(seed*31 + 7), total = mix.reduce((t, m) => t + (m.share ?? 1), 0)
    const pick = () => { let x = rnd()*total, s = 0; for (; s < mix.length - 1; s++){ x -= mix[s].share ?? 1; if (x < 0) break } const ks = state.protos.filter(q => q.species === s); return state.protos.indexOf(ks[Math.floor(rnd()*ks.length)]) }
    const room = q => q.r*.8, meanArea = state.protos.reduce((t, q) => t + Math.PI*room(q)**2, 0)/state.protos.length
    const R = Math.sqrt(count*meanArea/.6/Math.PI) + 2, big = state.protos.reduce((t, q) => Math.max(t, room(q)), 0)*1.15, cell = big*2, grid = new Map()
    const near = (x, z) => { const out = [], ci = Math.floor(x/cell), cj = Math.floor(z/cell); for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) out.push(...(grid.get(i + ',' + j) ?? [])); return out }
    // each tree keeps its species until it finds room, so big trees get their share and aren't crowded out by small ones; the disc widens if it fills
    let reach = R
    for (let n = 0; n < count; n++){
      const kind = pick(), q = state.protos[kind], sc = .85 + rnd()*.3, me = room(q)*sc
      for (let tries = 0; ; tries++){
        if (tries && tries % 40 === 0) reach *= 1.03
        const a = rnd()*Math.PI*2, d = Math.sqrt(rnd())*reach, x = Math.cos(a)*d, z = Math.sin(a)*d
        if (near(x, z).some(t => Math.hypot(t.x - x, t.z - z) < me + t.room)) continue
        const t = { x, z, y: groundHeight(x, z) - .08, s: sc, kind, level: -1, room: me }
        state.instances.push(t); const key = Math.floor(x/cell) + ',' + Math.floor(z/cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(t); break
      }
    }
    state.radius = state.instances.reduce((t, i) => Math.max(t, Math.hypot(i.x, i.z)), 0) + big
    return state
  }
  // the meshes need the light baked first (the impostors are painted with it), so they're made after the caller bakes the sun
  function finish(){
    const n = state.instances.length
    for (const q of state.protos){
      q.leaf = q.leafGeo.map(g => inst(g, q.mats.leaf, n))
      q.wood = q.woodGeo.map((g, l) => inst(g, q.mats.wood, n, woodDepth, l < 2))
      q.caster = inst(q.plateGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide, alphaMap: q.mats.leafDepth.alphaMap, alphaTest: .36 }), n, q.mats.leafDepth, true)   // the shadow pass reads alphaMap and side from this material, not the depth one
      q.caster.onBeforeRender = (r, s, c, geo) => geo.setDrawRange(0, 0); q.caster.onAfterRender = (r, s, c, geo) => geo.setDrawRange(0, Infinity)
      q.leaf.forEach(m => { m.renderOrder = -.2; m.receiveShadow = false }); q.wood.forEach(m => m.renderOrder = -.1)
      const imp = bake(q); q.imp = inst(imp.geo, imp.mat, n); q.imp.renderOrder = -.15
    }
  }

  const m4 = new THREE.Matrix4(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere(), v3 = new THREE.Vector3()
  // each frame: every copy to the level its distance asks for, within the view
  function update(camera, scale = 1){
    if (!state.instances.length || !state.protos[0]?.leaf) return
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv)
    const fill = state.protos.map(() => [0, 0, 0, 0]), cast = state.protos.map(() => 0), counts = [0, 0, 0, 0]
    for (const t of state.instances){ const q = state.protos[t.kind], H = q.h*t.s, edges = [H*2.5*scale, H*7*scale, H*16*scale]    // each tree's levels by its own height: a small tree gives up detail sooner
      sphere.center.set(t.x, t.y + q.h*t.s/2, t.z); sphere.radius = Math.max(q.h, q.r*2)*t.s*.6
      if (!frustum.intersectsSphere(sphere)) continue
      const d = camera.position.distanceTo(v3.set(t.x, t.y + q.h*.4, t.z))
      // a little give either side of each edge, so a tree on the line doesn't flick between levels
      let l = edges.findIndex(e => d < e); if (l < 0) l = 3
      if (t.level >= 0 && Math.abs(l - t.level) === 1){ const e = edges[Math.min(l, t.level)]; if (Math.abs(d - e) < e*.06) l = t.level }
      if (t.force != null) l = t.force                                  // (for comparing levels side by side)
      t.level = l
      m4.makeScale(t.s, t.s, t.s).setPosition(t.x, t.y, t.z)
      const k = fill[t.kind][l]++
      if (l < 3){ q.leaf[l].setMatrixAt(k, m4); q.wood[l].setMatrixAt(k, m4); if (l < 2) q.caster.setMatrixAt(cast[t.kind]++, m4) } else q.imp.setMatrixAt(k, m4)
      counts[l]++ }
    state.protos.forEach((q, k) => { const f = fill[k]
      for (let l = 0; l < 3; l++){ q.leaf[l].count = q.wood[l].count = f[l]; q.leaf[l].instanceMatrix.needsUpdate = q.wood[l].instanceMatrix.needsUpdate = true }
      q.caster.count = cast[k]; q.caster.instanceMatrix.needsUpdate = true
      q.imp.count = f[3]; q.imp.instanceMatrix.needsUpdate = true })
    state.counts = counts
  }
  function rebake(){ for (const q of state.protos){ if (!q.imp) continue; const old = q.imp.material; const imp = bake(q); q.imp.material = imp.mat; old.uniforms.tViews.value.dispose(); old.dispose() } }
  return { root, state, build, finish, update, clear, rebake }
}

function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296 } }
