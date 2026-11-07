// A painted sky: flat gradient, soft sun, stars. The clouds are strokes of their own, in clouds.js.
import * as THREE from 'three'

export function makeSky(){
  const u = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uCloud: { value: .5 }, uTime: { value: 0 }, uNight: { value: 0 }, uAmb: { value: 1 } }
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: u,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform vec3 uTop, uHorizon, uSun, uSunColor; uniform float uCloud, uTime, uNight, uAmb;
      float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(7.3,3.1); a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float y = max(d.y, 0.);
        vec3 c = mix(uHorizon, uTop, pow(smoothstep(0., .36, y), .6));
        float sd = max(dot(d, uSun), 0.);
        c += uSunColor*(pow(sd, 6.)*.16 + pow(sd, 90.)*.3 + smoothstep(.9992, .9996, sd)*1.2);
        if (uNight > .01 && d.y > 0.){ vec2 g = floor(d.xz/(d.y + .6)*180.); c += step(.9975, h(g))*uNight*.8*(.5 + .5*sin(uTime*2. + g.x)); }
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat)
  mesh.scale.setScalar(1000)                                           // from the start, so a render before the first frame still has a sky
  mesh.frustumCulled = false; mesh.renderOrder = 10                 // last: six octaves per pixel, so only the pixels still empty pay for them
  mesh.update = s => { u.uTop.value.copy(s.top); u.uHorizon.value.copy(s.horizon); u.uSun.value.copy(s.sunDir); u.uSunColor.value.copy(s.sunColor)
    u.uCloud.value = s.cloud; u.uNight.value = s.night; u.uAmb.value = Math.min(1, s.ambK) }
  mesh.tick = t => { u.uTime.value = t }
  return mesh
}
