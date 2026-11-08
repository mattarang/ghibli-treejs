// Contact shade that hugs the wood: a top-down render of every bit of trunk and root within half a metre of the ground, blurred by its
// mipmaps, read by the ground as ambient occlusion. A painter darkens the grass right along a root's edge and lets it go a short way out;
// a radial pool round the trunk reads as a stain. Baked once per rebuild, so it costs a texture read per ground pixel and nothing else.
import * as THREE from 'three'
import { U } from './ghibli-patch.js'

const SIZE = 512, NEAR_GROUND = .55, MAX_REACH = 10   // metres: one tree's roots, at ~4 cm a texel
const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
U.tContact = { value: rt.texture }
U.uContactBox = { value: new THREE.Vector4(1e5, 1e5, 1, 0) }            // centre x, z; half size; on

const mat = new THREE.ShaderMaterial({
  uniforms: { uH: { value: NEAR_GROUND } }, side: THREE.DoubleSide,
  vertexShader: 'attribute float aH; varying float vH; void main(){ vH = aH; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
  // wood at the ground counts fully, fading out by half a metre up: a root's top edge, not the trunk's whole height. Wood buried more than
  // a few cm (the flare's bulb, sunk so the roots rise out of it) is out of sight and touches nothing: it must not print a round stain.
  fragmentShader: 'uniform float uH; varying float vH; void main(){ float a = smoothstep(-.12, -.02, vH)*(1. - smoothstep(0., uH, vH)); if (a < .01) discard; gl_FragColor = vec4(vec3(a), 1.); }',
})
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 200), scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
mesh.frustumCulled = false; scene.add(mesh)

// geo: the wood geometry (world positions); centre: [x, z] of the tree; groundHeight: the terrain function
export function bakeContact(renderer, geo, centre, groundHeight){
  const pos = geo.attributes.position, n = pos.count, h = new Float32Array(n)
  let reach = 0
  for (let i = 0; i < n; i++){
    const x = pos.getX(i), z = pos.getZ(i), d = pos.getY(i) - groundHeight(x, z); h[i] = d
    const r = Math.hypot(x - centre[0], z - centre[1])
    if (d > -.12 && d < NEAR_GROUND && r < MAX_REACH) reach = Math.max(reach, r)
  }
  if (!reach){ U.uContactBox.value.w = 0; return }
  const S = reach + 1.5
  const g = new THREE.BufferGeometry(); g.setAttribute('position', pos.clone()); g.setAttribute('aH', new THREE.BufferAttribute(h, 1)); if (geo.index) g.setIndex(geo.index.clone())   // copies: disposing the bake's geometry must not free the wood's buffers
  mesh.geometry.dispose(); mesh.geometry = g
  // looking straight down, screen-up along -z: the texture's v runs with -z (the ground shader flips it back)
  cam.left = cam.bottom = -S; cam.right = cam.top = S; cam.position.set(centre[0], 150, centre[1]); cam.up.set(0, 0, -1); cam.lookAt(centre[0], 0, centre[1]); cam.updateProjectionMatrix(); cam.updateMatrixWorld()
  const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha()
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam)
  renderer.setRenderTarget(prev); renderer.setClearColor(clear, ca)
  U.uContactBox.value.set(centre[0], centre[1], S, 1)
}

// for the ground's fragment shader (after tContact and uContactBox are declared): how enclosed this spot is by wood at the ground.
// Blur set in metres whatever the bake's size: a dark edge ~30 cm out from the wood, a soft fall-off to ~90 cm, the bare foot ~1.2 m.
export const GLSL_CONTACT = /* glsl */`
  float gContactIn = 0.;
  float gContactAO(vec2 fp, out float wide){
    vec2 uv = (fp - uContactBox.xy)/(2.*uContactBox.z) + .5; uv.y = 1. - uv.y;
    gContactIn = uContactBox.w*step(0., uv.x)*step(uv.x, 1.)*step(0., uv.y)*step(uv.y, 1.);
    if (gContactIn < .5){ wide = 0.; return 0.; }
    float tx = 2.*uContactBox.z/${SIZE}.;
    float a1 = textureLod(tContact, uv, log2(.3/tx)).r, a2 = textureLod(tContact, uv, log2(.9/tx)).r;
    wide = textureLod(tContact, uv, log2(1.2/tx)).r;
    return clamp(max(a1*1.8, a2*1.3), 0., 1.); }
`
