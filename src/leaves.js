// Falling leaves: while a deciduous tree drops its leaves (src/seasons.js leafKeep), leaves leave its crown, flutter down with the wind, lie on
// the ground for a while as litter, and fade. One instanced mesh; every leaf's whole flight is worked out when it is born (where it starts,
// where it lands, how long it falls), so the shader draws it from the time alone and the CPU only writes a new leaf now and then.
import * as THREE from 'three'
import { U, GLSL_NIGHT } from './ghibli-patch.js'

const N = 1400                       // leaves alive at once: falling, and lying as litter
const FALL = .85                     // m/s: a leaf drifts down slowly, tumbling
const LIE = 26, FADE = 7             // seconds on the ground, and how long the last of that it takes to fade

export function makeLeafFall(landY){
  // a leaf is a little over 10 cm (Ghibli draws them a touch large, so they read): a quad, its outline cut in the shader
  const quad = new THREE.PlaneGeometry(.19, .12)
  const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv)
  const aStart = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3), aLand = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3)
  const aT = new THREE.InstancedBufferAttribute(new Float32Array(N*4).fill(-1e6), 4), aColor = new THREE.InstancedBufferAttribute(new Float32Array(N*3), 3)
  for (const a of [aStart, aLand, aT, aColor]) a.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('aStart', aStart); g.setAttribute('aLand', aLand); g.setAttribute('aT', aT); g.setAttribute('aColor', aColor)
  g.instanceCount = N
  const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, uSunTint: U.uSunTint, uAmbTint: U.uAmbTint, uNightGrade: U.uNightGrade, uSunDir: U.uSunDir, uWater: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aStart, aLand, aColor; attribute vec4 aT;    // aT: born, fall time, seed, lands on water (1) or ground
      uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying float vAlpha, vFlat; varying vec3 vN;
      mat3 axisAngle(vec3 a, float t){ float c = cos(t), s = sin(t), k = 1. - c; return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s, a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s, a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k); }
      void main(){
        float t = uTime - aT.x, dur = aT.y, seed = aT.z, life = aT.w > .5 ? ${(LIE*.35).toFixed(1)} : ${LIE.toFixed(1)};
        vUv = uv; vCol = aColor;
        if (t < 0. || t > dur + life){ gl_Position = vec4(0., 0., 2., 1.); return; }   // not born, or long gone
        vec3 p; mat3 R;
        if (t < dur){
          // falling: down a slanting line to where it lands, swinging from side to side as a leaf does (a falling-leaf pendulum), and tumbling
          float f = t/dur; p = mix(aStart, aLand, f);
          vec3 side = normalize(vec3(cos(seed*6.28), 0., sin(seed*6.28)));
          p += side*sin(t*2.1 + seed*9.)*.45*(1. - f*f) + vec3(0., abs(sin(t*2.1 + seed*9.))*.08, 0.);
          R = axisAngle(normalize(vec3(sin(seed*13.), .6, cos(seed*7.))), t*(2. + seed*2.5)) * axisAngle(vec3(1., 0., 0.), sin(t*2.1 + seed*9.)*.9);
          vAlpha = 1.; vFlat = 0.;
        } else {
          // on the ground (or the water): flat, turned at random, fading at the end of its time
          p = aLand; R = axisAngle(vec3(0., 1., 0.), seed*6.28) * axisAngle(vec3(1., 0., 0.), -1.5708);
          float lie = t - dur; vAlpha = 1. - smoothstep(life - ${FADE.toFixed(1)}, life, lie); vFlat = 1.;
        }
        vN = R*vec3(0., 0., 1.);
        vec3 w = p + R*vec3(position.xy*mix(.8, 1.25, fract(seed*7.3)), 0.);
        gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunTint, uAmbTint, uSunDir; uniform float uNightGrade;
      varying vec2 vUv; varying vec3 vCol; varying float vAlpha, vFlat; varying vec3 vN;
      ${GLSL_NIGHT}
      void main(){
        // the outline: a leaf pointed at both ends, a little stalk at one
        vec2 q = vUv - .5; float r = length(vec2(q.x*1.6, q.y*2.)*vec2(1., 1. + abs(q.x)*1.4));
        if (r > .5 && !(q.x < -.38 && abs(q.y) < .05)) discard;
        // fading as a dissolve, not a blend: no sorting, and it reads as the leaf crumbling away
        if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453) > vAlpha) discard;
        // two tones, lit side and the other, and the midrib a step darker; flat leaves on the ground take the light as the ground does
        float lit = vFlat > .5 ? .85 : step(0., dot(normalize(vN)*(gl_FrontFacing ? 1. : -1.), normalize(uSunDir)));
        vec3 c = vCol*mix(.62, 1., lit)*(1. - .18*(1. - smoothstep(.0, .035, abs(q.y))));
        c *= mix(uAmbTint*.9, uSunTint, mix(.55, .9, lit));
        gl_FragColor = vec4(gNightGrade(c), 1.);
        #include <colorspace_fragment>
      }` })
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = -.15

  let next = 0, owed = 0
  const state = { rate: 0, sources: [], colors: [new THREE.Color('#c8642c')], wind: new THREE.Vector2(1, 0), windSpeed: .8 }
  // a new leaf: from a random clump of the crown, falling to the ground downwind
  function spawn(time){
    const s = state.sources[Math.floor(Math.random()*state.sources.length)]; if (!s) return
    const u = Math.random()*Math.PI*2, v = Math.acos(2*Math.random() - 1), rr = s[3]*Math.cbrt(Math.random())*.85
    const x0 = s[0] + Math.sin(v)*Math.cos(u)*rr, y0 = s[1] + Math.cos(v)*rr*.7, z0 = s[2] + Math.sin(v)*Math.sin(u)*rr
    // how long it falls: down to the ground under where the wind carries it (the ground found again at the landing point)
    let dur = Math.max(1.5, (y0 - landY(x0, z0).y)/FALL), drift = state.windSpeed*(.6 + Math.random()*.8)
    let xl = x0 + state.wind.x*drift*dur + (Math.random() - .5)*1.5, zl = z0 + state.wind.y*drift*dur + (Math.random() - .5)*1.5
    const land = landY(xl, zl); dur = Math.max(1.5, (y0 - land.y)/FALL)
    const i = next; next = (next + 1) % N
    aStart.setXYZ(i, x0, y0, z0); aLand.setXYZ(i, xl, land.y + (land.water ? .012 : .16 + Math.random()*.08), zl)   // on the water, or resting on the grass mat (not under it)
    aT.setXYZW(i, time, dur, Math.random(), land.water ? 1 : 0)
    const c = state.colors[Math.floor(Math.random()*state.colors.length)]; aColor.setXYZ(i, c.r, c.g, c.b)
    for (const a of [aStart, aLand, aT, aColor]){ a.addUpdateRange(i*a.itemSize, a.itemSize); a.needsUpdate = true }
  }
  return { mesh, state,
    update(dt, time){
      if (!state.rate || !state.sources.length){ owed = 0; return }
      owed += state.rate*Math.min(dt, .1)
      while (owed >= 1){ spawn(time); owed -= 1 } },
    clear(){ aT.array.fill(-1e6); aT.needsUpdate = true; aT.clearUpdateRanges() } }
}
