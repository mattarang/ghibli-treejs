// A painted sky: flat gradient, soft sun, stars. The clouds are strokes of their own, in clouds.js.
import * as THREE from 'three'

export function makeSky(){
  const u = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uTime: { value: 0 }, uNight: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: u,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform vec3 uTop, uHorizon, uSun, uSunColor; uniform float uTime, uNight;
      float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(7.3,3.1); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.);
        // Totoro's sky keeps its full blue to within a few degrees of the horizon, then pales fast. The blend runs in display space: mixed in linear
        // light, every in-between colour leans to the pale end and the whole lower sky reads washed out.
        vec3 g0 = pow(uHorizon, vec3(1./2.2)), g1 = pow(uTop, vec3(1./2.2));
        vec3 c = pow(mix(g0, g1, pow(smoothstep(0., .16, y), .6)), vec3(2.2));
        // ridge light: a soft white haze rising from behind the mountains, brightest just above their tops (2-5 degrees) and gone by ~12,
        // warmed by the sun's colour at dawn and dusk
        { float glow = smoothstep(.0, .05, y)*(1. - smoothstep(.04, .2, y));
          c = mix(c, mix(vec3(1.), uSunColor/max(max(uSunColor.r, uSunColor.g), uSunColor.b), .25), glow*.15*(1. - uNight)); }   // faint: the mist on the mountains carries the ridge light
        float sd = max(dot(d, uSun), 0.);
        c += uSunColor*(pow(sd, 24.)*.07 + pow(sd, 120.)*.25 + smoothstep(.9992, .9996, sd)*1.2);   // a tight glow: a broad one greys half the sky
        // the night sky, as Totoro paints it: a deep, nearly flat navy; stars in a few sizes, the bright ones with a small soft glow,
        // a few loose clusters, all thinning toward the horizon haze
        if (uNight > .01 && d.y > 0.){
          vec2 sp = d.xz/(d.y + .35);
          float st = 0.;
          for (int k = 0; k < 3; k++){
            float sc = k == 0 ? 26. : k == 1 ? 60. : 140.;                          // big and rare, middle, many small
            vec2 q = sp*sc + float(k)*17.3, i = floor(q), f = fract(q) - .5;
            float hh = h(i), on = step(k == 0 ? .93 : k == 1 ? .96 : .994, hh);
            vec2 o = (vec2(h(i + 3.1), h(i + 7.7)) - .5)*.6;
            float r = length(f - o), rad = k == 0 ? .07 : k == 1 ? .1 : .12, aa = fwidth(q.x)*.7 + 1e-4;   // in cell units: big cells, small stars
            float core = 1. - smoothstep(rad - aa, rad + aa, r);
            float halo = k == 0 ? (1. - smoothstep(0., rad*4., r))*.25 : 0.;
            st += on*(core + halo)*(k == 0 ? 1. : k == 1 ? .75 : .5)*(.75 + .25*sin(uTime*(1.5 + hh*3.) + hh*40.));
          }
          float cl = smoothstep(.62, .8, n(sp*3.2 + 11.));                            // loose clusters
          { vec2 q = sp*220., i = floor(q); st += step(.94, h(i + 41.))*cl*.5*(1. - smoothstep(.12, .3, length(fract(q) - .5))); }
          c += vec3(.9, .95, 1.)*st*uNight*smoothstep(0., .18, d.y);
        }
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat)
  mesh.scale.setScalar(1000)                                           // from the start, so a render before the first frame still has a sky
  mesh.frustumCulled = false; mesh.renderOrder = 10                 // last: six octaves per pixel, so only the pixels still empty pay for them
  mesh.update = s => { u.uTop.value.copy(s.top); u.uHorizon.value.copy(s.horizon); u.uSun.value.copy(s.sunDir); u.uSunColor.value.copy(s.sunColor)
    u.uNight.value = s.night }
  mesh.tick = t => { u.uTime.value = t }
  return mesh
}
