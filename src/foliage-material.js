// Foliage's own shader. A stroke is one flat colour, so all of its lighting happens once, per vertex, and the fragment shader only reads
// the brush. Strokes overlap heavily, so this is where the frame rate lives. Cores share it, as strokes that happen to have no fan.
import * as THREE from 'three'
import { U } from './ghibli-patch.js'

const vertexShader = /* glsl */`
  attribute vec2 aCorner; attribute vec3 aPatch, aStroke, aLeaf, clusterCenter; attribute vec4 aWind; attribute float aDab;
  uniform sampler2D tSun; uniform float uSelfShade, uHueVar, uAir; uniform vec3 fogColor;
  uniform float uTime, uWind, uSway, uFlutter, uLightShape, uBands, uSoft, uToonMix, uPigment, uSss, uRim, uFleck, uShadowFillK, uDay, uLanternI;
  uniform vec3 uSunDir, uPal0, uPal1, uPal2, uPal3, uSssColor, uRimColor, uShadowFill, uAmbTint, uSunTint, uLanternPos, uLanternColor;
  varying vec2 vUv; varying vec3 vColA, vColB; varying float vCalm;
  #include <fog_pars_vertex>
  vec3 windOffset(vec3 wp, vec3 clump, vec4 a){
    float t = uTime, gust = .55 + .45*sin(t*.35 + a.x*.05)*sin(t*.23 + a.y*.07);
    vec3 o = vec3(.55, 0., .35)*(sin(t*1.1 + a.x*.35 + a.y*.25) + .35*sin(t*2.3 + a.x*.9 - a.y*.6))*gust*a.z*uSway;
    o += vec3(.4, .22, .3)*sin(t*1.9 + clump.x*.7 + clump.y*.4 + clump.z*.6)*gust*a.w*.1*uSway;
    float fl = sin(t*6.3 + wp.x*7.1 + wp.y*4.3 + wp.z*5.7)*(.55 + .45*sin(t*2.9 + wp.z*3.1 + wp.x*1.7));
    return (o + vec3(.5, .8, .5)*fl*a.w*uFlutter*(.4 + .6*gust))*uWind; }
  float toonRamp(float x){ float n = max(uBands, 1.), s = pow(x, .85)*n, f = floor(s), t = smoothstep(.5 - uSoft, .5 + uSoft, fract(s));
    return mix(x, clamp((f + t)/n, 0., 1.), uToonMix); }
  vec3 palRamp(float x){ x = clamp(x, 0., 1.)*3.; return x < 1. ? mix(uPal0, uPal1, x) : x < 2. ? mix(uPal1, uPal2, x - 1.) : mix(uPal2, uPal3, x - 2.); }
  // turns a colour around its own grey, keeping its value
  vec3 turnHue(vec3 c, float a){ float y = dot(c, vec3(.299, .587, .114)), i = dot(c, vec3(.596, -.274, -.322)), q = dot(c, vec3(.211, -.523, .312)), s = sin(a), k = cos(a), u = i*k - q*s, v = i*s + q*k;
    return vec3(y + .956*u + .621*v, y - .272*u - .647*v, y - 1.106*u + 1.703*v); }
  void main(){
    vUv = uv;
    vec4 wPos = modelMatrix*vec4(position, 1.);
    wPos.xyz += windOffset(wPos.xyz, clusterCenter, aWind);
    vec4 mvPosition = viewMatrix*wPos;
    vec3 n = normalize(normal), V = normalize(cameraPosition - wPos.xyz);
    // the one light value for this stroke
    float F = (max(dot(n, uSunDir), 0.)*(.72 + .28*aLeaf.x) + (aLeaf.x - .5)*.2 + (aLeaf.z - .5)*.02 + aPatch.x*uLightShape*1.8)*.95;
    // clumps behind others on the way to the sun lose it, so masses throw shade across each other (baked per clump in main.js)
    if (aPatch.z >= 0. && uSelfShade > 0.){ int id = int(aPatch.z); F *= mix(1., mix(.3, 1., texelFetch(tSun, ivec2(id%256, id/256), 0).r), uSelfShade); }
    float rimV = smoothstep(.5, .82, 1. - abs(dot(n, V)));
    bool small = aDab > 1.5, band = F > .13 && F < .62, core = aDab < -.5;
    // closed strokes collapse here, before they cost a pixel
    if ((aDab > .5 && !small && F < .16 && aLeaf.z > .4) || (small && !band && rimV < .4 && (F < .62 || aLeaf.z > .22))){ gl_Position = vec4(2., 2., 2., 1.); return; }
    vec2 sd = (viewMatrix*vec4(aStroke, 0.)).xy; sd = normalize(sd + vec2(0., 1e-3));
    mvPosition.xy += sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y;
    gl_Position = projectionMatrix*mvPosition;
    #include <fog_vertex>
    float calm = smoothstep(.11, .28, F);                                       // 0 in shadow: paint only moves in the light
    float light = .02 + F + aPatch.y*uFleck*.15;
    if (small) light += F > .62 ? .14 : (aLeaf.z - .5)*.62;                     // small dabs alone break the big shape
    float dark = core ? .03 : .015 + .12*aLeaf.x + (aLeaf.y - .5)*.05 + (aLeaf.z - .5)*.1;
    float kk = mix(dark, mix(light, smoothstep(.16, .74, light), .45), calm), lit = clamp(kk, 0., 1.), x = mix(lit, toonRamp(lit), calm);
    float spread = .22*calm*uPigment;
    vec3 tint = mix(vec3(1.), mix(vec3(.88, 1., 1.06), vec3(1.08, 1.02, .86), aLeaf.y), calm), base = palRamp(x);
    float mod0 = mix(1., 1. + (aLeaf.y - .5)*.2, calm), toSun = toonRamp(lit);
    vec3 scale = (1. + uShadowFill*uShadowFillK*(1. - lit)*1.6)*mod0*tint, wash = mix(uAmbTint, uSunTint, toSun);
    float back = pow(clamp(dot(-V, uSunDir), 0., 1.), 3.)*uSss*F;
    float rimF = pow(1. - clamp(dot(n, V), 0., 1.), 3.)*uRim*(.3 + .7*clamp(dot(n, uSunDir) + .3, 0., 1.));
    vec3 glow = (back*uSssColor*(.35 + base) + uRimColor*rimF*(.4 + base))*uSunTint*uDay*calm;
    vec3 lv = uLanternPos - wPos.xyz; float d2 = dot(lv, lv);
    glow += uLanternColor*(.3 + .7*clamp(dot(n, normalize(lv)), 0., 1.))*uLanternI/(1. + d2*.18)*(.4 + base);
    // hue is a second axis of paint that light doesn't touch: every stroke its own mix, and whole lobes of shadow leaning teal or olive
    float turn = ((aLeaf.z - .5)*.42 + (aLeaf.y - .5)*(1. - calm)*.45)*uHueVar;
    // air: distance lifts shadow toward the sky long before it touches the lights
    float air = (1. - exp(-max(length(mvPosition.xyz) - 45., 0.)*.0045))*(1. - .55*calm)*uAir;
    vColA = mix(turnHue(max(palRamp(x - spread)*scale, uPal0*.9), turn)*wash, fogColor, air) + glow;
    vColB = mix(turnHue(max(palRamp(x + spread)*scale, uPal0*.9), turn)*wash, fogColor, air) + glow;
    vCalm = calm;
  }`

const fragmentShader = /* glsl */`
  uniform sampler2D tBrush; varying vec2 vUv; varying vec3 vColA, vColB; varying float vCalm;
  #include <fog_pars_fragment>
  void main(){
    vec4 t = texture2D(tBrush, vUv);
    float w = fwidth(t.g) + 1e-4, alpha = smoothstep(.36 - w, .36 + w, t.g);
    if (alpha < .02) discard;
    float paint = t.r*1.3 - .15 + (1. - smoothstep(.5, .98, t.b))*.12;          // pigment and the thin paint at a stroke's edge
    gl_FragColor = vec4(mix(vColA, vColB, clamp(paint, 0., 1.)), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`

export function makeFoliageMaterial(brush, sun, palette, sss, rim){
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, side: THREE.DoubleSide, alphaToCoverage: true, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U, tBrush: { value: brush }, tSun: { value: sun }, uPal0: palette[0], uPal1: palette[1], uPal2: palette[2], uPal3: palette[3], uSssColor: sss, uRimColor: rim },
  })
}
