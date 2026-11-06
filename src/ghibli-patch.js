// Ghibli toon patch for built-in three materials (onBeforeCompile), tested on r186.
// Based on threejs-ghibli-toon-shading by nicksonthc (MIT): banded toon diffuse through an RE_Direct wrapper so shadows and
// specular stay stock, puff normals, backlit SSS, rim, warm fill, flecks, bark, and wind matched in the depth material.
// Added here:
//  - a four-stop palette ramp after craftzdog/ghibli-style-shader (MIT): the band picks a painted colour instead of only
//    a brightness, so shadow turns teal and light turns yellow-green. uPaletteMix slides between the two looks.
//  - afterClip: runs once gl_Position is set, for changes to depth alone.
//  - afterView: fans a stroke out in view space after the world position is fixed. worldPosition stays at the stroke's
//    anchor, so the shadow lookup (like the normal) is the same over the whole stroke: one stroke, one colour.
//  - wind phase from the tree root and the clump centre, so branches and clumps move as bodies, and an analytic lantern.
import * as THREE from 'three'

export const U = {
  uTime: { value: 0 }, uWind: { value: 1 }, uSunLum: { value: 1 }, uSunUp: { value: 1 }, uDay: { value: 1 },
  uPuff: { value: .72 }, uBands: { value: 4 }, uSoft: { value: .1 }, uToonMix: { value: .85 }, uPaletteMix: { value: 1 }, 
  uSss: { value: .55 }, uRim: { value: .3 }, uFleck: { value: .45 }, uFleckScale: { value: 3.2 },
  uSway: { value: 1 }, uFlutter: { value: .035 },
  uBarkWarm: { value: new THREE.Color(0x8a5a36) }, uBarkWarmMix: { value: .35 }, uBarkGrain: { value: .45 }, uBarkRootAO: { value: .45 }, uBarkCanopyAO: { value: .3 },
  uShadowFill: { value: new THREE.Color(0xffb27a) }, uShadowFillK: { value: .05 },
  uPigment: { value: 1 }, uLightShape: { value: .34 }, uSelfShade: { value: 1 }, uMass: { value: 1 }, uHueVar: { value: 1 }, uAir: { value: 1 }, uMoss: { value: .6 }, uBarkVar: { value: 1 }, uFurrow: { value: 1 }, uTrees: { value: Array.from({ length: 24 }, () => new THREE.Vector3(1e5, 1e5, 1)) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uAmbTint: { value: new THREE.Color(1, 1, 1) }, uSunTint: { value: new THREE.Color(1, 1, 1) },
  uLanternPos: { value: new THREE.Vector3(3, 2, 3) }, uLanternColor: { value: new THREE.Color(0xffb35a) }, uLanternI: { value: 0 },
}

export const newPalette = hexes => hexes.map(h => ({ value: new THREE.Color(h) }))
export const setPalette = (pal, hexes) => pal.forEach((u, i) => u.value.set(hexes[i]))
export const paletteUniforms = pal => ({ uPal0: pal[0], uPal1: pal[1], uPal2: pal[2], uPal3: pal[3] })

const PARS = /* glsl */`
  uniform float uPuff, uBands, uSoft, uToonMix, uPaletteMix, uSss, uRim, uFleck, uFleckScale, uBarkWarmMix, uBarkGrain, uBarkRootAO, uBarkCanopyAO,
    uShadowFillK, uSunLum, uSunUp, uDay, uLanternI, uPigment;
  uniform vec3 uRimColor, uSssColor, uBarkWarm, uShadowFill, uAmbTint, uSunTint, uLanternPos, uLanternColor, uPal0, uPal1, uPal2, uPal3;
  float gFleck = 0., gMod = 1.; vec3 gGlow = vec3(0.), gTint = vec3(1.);`

const GLSL_NOISE = /* glsl */`
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
  float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.7); a*=.5; } return s/.97; }
  float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
  float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),u.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x), u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x), u.y), u.z); }
  float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn3(p); p=p*2.07+vec3(11.3,7.1,5.9); a*=.5; } return s/.9375; }`

// aWind: xy = root xz (phase of the whole plant), z = sway weight, w = flutter weight (0 on wood, so wood never bobs)
const GLSL_WIND = /* glsl */`
  vec3 windOffset(vec3 wp, vec3 clump, vec4 a){
    float t = uTime;
    float gust = .55 + .45*sin(t*.35 + a.x*.05)*sin(t*.23 + a.y*.07);
    float sway = sin(t*1.1 + a.x*.35 + a.y*.25) + .35*sin(t*2.3 + a.x*.9 - a.y*.6);
    vec3 o = vec3(.55, .0, .35)*sway*gust*a.z*uSway;
    o += vec3(.4, .22, .3)*sin(t*1.9 + clump.x*.7 + clump.y*.4 + clump.z*.6)*gust*a.w*.1*uSway;
    float fl = sin(t*6.3 + wp.x*7.1 + wp.y*4.3 + wp.z*5.7)*(.55 + .45*sin(t*2.9 + wp.z*3.1 + wp.x*1.7));
    o += vec3(.5, .8, .5)*fl*a.w*uFlutter*(.4 + .6*gust);
    return o*uWind; }`

const GLSL_LIT = /* glsl */`
  float toonRamp(float x){ float n = max(uBands, 1.); float s = pow(x, .85)*n; float f = floor(s);
    float t = smoothstep(.5-uSoft, .5+uSoft, fract(s)); return mix(x, clamp((f+t)/n, 0., 1.), uToonMix); }
  vec3 palRamp(float x){ x = clamp(x, 0., 1.)*3.;
    return x < 1. ? mix(uPal0, uPal1, x) : x < 2. ? mix(uPal1, uPal2, x-1.) : mix(uPal2, uPal3, x-2.); }
  float gLit = 0., gNdl = 0., gSeen = 0.;
  void RE_Direct_Toon(const in IncidentLight dl, const in vec3 gp, const in vec3 gn, const in vec3 gv, const in vec3 gcn, const in PhysicalMaterial m, inout ReflectedLight rl){
    float ndl = saturate(dot(gn, dl.direction));
    float seen = saturate(dot(dl.color, vec3(.2126,.7152,.0722))/max(uSunLum, 1e-3));   // the shadow term, already in dl.color
    gLit = max(gLit, ndl*seen); gNdl = max(gNdl, ndl); gSeen = max(gSeen, seen);
    IncidentLight tl = dl;
    #ifdef G_TOON
      tl.color *= clamp(toonRamp(ndl)/max(ndl, 1e-3), 0., 4.);
    #endif
    RE_Direct_Physical(tl, gp, gn, gv, gcn, m, rl);
    #ifdef G_SSS
      float back = pow(saturate(dot(-gv, dl.direction)), 3.)*uSss*seen;
      gGlow += back*uSssColor*uSunTint*(.35 + m.diffuseColor)*uDay;
    #endif
  }`

export function patch(mat, o){
  const key = JSON.stringify(o, (k, v) => k === 'uniforms' ? undefined : v)
  mat.customProgramCacheKey = () => key
  const clump = o.clumpExpr || 'vec3(aWind.x, 0., aWind.y)'
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, o.uniforms || {})
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uSway, uFlutter; varying vec3 vWPos; varying vec3 vLocal; ${GLSL_NOISE} ${o.wind ? 'attribute vec4 aWind;' + GLSL_WIND : ''}
        ${o.puff ? 'attribute vec3 clusterCenter; varying vec3 vSphN;' : ''} ${o.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position; ${o.vertexBegin || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${o.puff ? `{ vec3 d = position - clusterCenter; vec3 sN = dot(d,d) > 1e-8 ? normalize(d) : objectNormal; vSphN = normalize(normalMatrix*sN); }` : ''}`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        vec4 wPos = modelMatrix*mvPosition;
        ${o.wind ? `wPos.xyz += windOffset(wPos.xyz, ${clump}, aWind);` : ''}
        vWPos = wPos.xyz;
        mvPosition = viewMatrix*wPos;
        ${o.afterView || ''}
        gl_Position = projectionMatrix*mvPosition;
        ${o.afterClip || ''}`)
      .replace('#include <worldpos_vertex>', `
        #if defined( USE_SHADOWMAP ) || defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = wPos;
        #endif`)
    if (!sh.fragmentShader.includes('#include <common>')) return
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      ${o.toon ? '#define G_TOON' : ''} ${o.sss ? '#define G_SSS' : ''}
      varying vec3 vWPos; varying vec3 vLocal; ${PARS} ${GLSL_NOISE} ${o.puff ? 'varying vec3 vSphN;' : ''} ${o.fragmentPars || ''}`)
    if (!sh.fragmentShader.includes('lights_physical_pars_fragment')) return   // depth materials stop here
    // three dithers its soft shadow samples per screen pixel. A stroke takes one shadow lookup for its whole area, so that dither
    // has nothing to average against and prints as a weave across any stroke sitting on a shadow edge. Hold the rotation still.
    if (o.flatShadow) sh.fragmentShader = sh.fragmentShader.replace('#include <shadowmap_pars_fragment>',
      THREE.ShaderChunk.shadowmap_pars_fragment.replaceAll('interleavedGradientNoise( gl_FragCoord.xy )', '0.37'))
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        ${GLSL_LIT}`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight,', 'RE_Direct_Toon( directLight,'))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb)*uShadowFill*uShadowFillK*(1. - gLit)*PI;
          ${o.rim ? `#if NUM_DIR_LIGHTS > 0
            float rimF = pow(1. - saturate(dot(normal, geometryViewDir)), 3.)*uRim*(.3 + .7*saturate(dot(normal, directionalLights[0].direction) + .3));
            gGlow += uRimColor*uSunTint*rimF*(.4 + diffuseColor.rgb)*uDay;
          #endif` : ''}
        }`)
      .replace('#include <opaque_fragment>', `
        { float kk = gLit; ${o.shade || ''}
          // pigment shifts the colour after the band is chosen, so a stroke stays one stroke with paint moving inside it
          vec3 pal = palRamp(${o.softRamp ? 'clamp(kk, 0., 1.)' : o.ramp || 'toonRamp(clamp(kk, 0., 1.))'} + (${o.pigment || '0.'})*uPigment*.34);
          ${o.palLine || ''}
          float lit = clamp(kk, 0., 1.);
          pal = max(pal*(1. + uShadowFill*uShadowFillK*(1. - lit)*1.6)*gMod*gTint, uPal0*.9)*mix(uAmbTint, uSunTint, toonRamp(lit));   // the deepest paint is the palette's shadow colour, never black
          outgoingLight = mix(outgoingLight, pal, uPaletteMix);
          vec3 lv = (viewMatrix*vec4(uLanternPos, 1.)).xyz + vViewPosition; float d2 = dot(lv, lv);
          outgoingLight += uLanternColor*(.3 + .7*saturate(dot(normal, normalize(lv))))*uLanternI/(1. + d2*.18)*(.4 + diffuseColor.rgb);
          outgoingLight += gGlow; }
        #include <opaque_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${o.flecks ? `{ vec3 fp = vLocal*uFleckScale; float f1 = vn3(fp*2.3), f2 = fbm3(fp*.55 + 7.3);
        diffuseColor.rgb *= 1. - .35*uFleck*smoothstep(.35, .65, f2);
        float pop = uFleck*smoothstep(.66, .84, f1);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.55,1.45,.65) + vec3(.06,.08,0.), pop);
        gFleck = pop*.3 - .16*uFleck*smoothstep(.35, .65, f2); }` : ''}
      ${o.bark ? `{ float hh = ${o.bark};
        float g1 = vn(vec2((vLocal.x + vLocal.z)*7., vLocal.y*.9)), g2 = fbm2(vec2((vLocal.x - vLocal.z)*3.5, vLocal.y*.45));
        float m = 1. + (g2 - .5)*uBarkGrain*1.6 + (g1 - .5)*uBarkGrain*.7;
        m *= mix(1. - uBarkRootAO, 1., smoothstep(0., 1.8, hh));
        m *= mix(1., 1. - uBarkCanopyAO, smoothstep(3.2, 6.5, hh));
        diffuseColor.rgb = mix(diffuseColor.rgb, uBarkWarm, uBarkWarmMix)*m; gMod = m; }` : ''}
      ${o.color || ''}`)
    if (o.puff || o.normal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${o.puff ? 'normal = normalize(mix(normal, normalize(vSphN), uPuff));' : ''}
      ${o.normal || ''}`)
    o.onShader?.(sh)
  }
  return mat
}
