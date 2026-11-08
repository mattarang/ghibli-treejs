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
  uTreeN: { value: 24 }, uTime: { value: 0 }, uWind: { value: 0 }, uSunLum: { value: 1 }, uSunUp: { value: 1 }, uDay: { value: 1 },
  uBands: { value: 4 }, uSoft: { value: .1 }, uToonMix: { value: .85 }, uPaletteMix: { value: 1 }, 
  uSss: { value: .55 }, uRim: { value: .3 }, uFleck: { value: .45 }, 
  uSway: { value: 1 }, uFlutter: { value: .035 },
  uShadowFill: { value: new THREE.Color(0xffb27a) }, uShadowFillK: { value: .05 }, uFlecks: { value: .4 }, uShadeCool: { value: 1 }, uWindDir: { value: new THREE.Vector2(.45, .89).normalize() }, uRockN: { value: 0 }, uSunY: { value: .5 }, uMoonPaint: { value: 1 }, uNightGrade: { value: 0 }, uMoonTop: { value: .68 }, uLobeShade: { value: .8 }, uRimTop: { value: .7 }, uDayRim: { value: 1 }, uLightRel: { value: new THREE.Vector3(1, 1, 1) }, uMoonDark: { value: .62 }, uGrassFar: { value: new THREE.Vector3(0, 0, 1e5) }, uRocks: { value: Array.from({ length: 32 }, () => new THREE.Vector3(1e5, 1e5, 1)) },
  uPigment: { value: 1 }, uLightShape: { value: .34 }, uSelfShade: { value: 1 }, uMass: { value: 1 }, uHueVar: { value: 1 }, uAir: { value: 1 }, uMoss: { value: .6 }, uBarkVar: { value: 1 }, uFurrow: { value: 1 }, uTrees: { value: Array.from({ length: 24 }, () => new THREE.Vector3(1e5, 1e5, 1)) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uAmbTint: { value: new THREE.Color(1, 1, 1) }, uSunTint: { value: new THREE.Color(1, 1, 1) },
  uLanternPos: { value: new THREE.Vector3(3, 2, 3) }, uLanternColor: { value: new THREE.Color(0xffb35a) }, uLanternI: { value: 0 },
}

export const newPalette = hexes => hexes.map(h => ({ value: new THREE.Color(h) }))
export const setPalette = (pal, hexes) => pal.forEach((u, i) => u.value.set(hexes[i]))
export const paletteUniforms = pal => ({ uPal0: pal[0], uPal1: pal[1], uPal2: pal[2], uPal3: pal[3] })

// Night, one rule for the whole scene. A colour keeps its brightness (or a given one) and is laid on a single saturated blue axis (hue ~210,
// between Totoro's moonlit foliage at 203 and its sky at 217), with a share of its own chroma on top so greens lean teal and reds lean violet, never grey.
//  gNightAxis(c, l, k): c's hue moved onto the axis at brightness l, keeping k of its chroma.
//  gNightGrade(c):      lit colours at night (ground, grass, rocks, bark, sky-lit foliage): brightness x.43, chroma .12.
//  gNightBand(P):       a palette colour as a moonlit paint tone: brightness .5*l^1.34, no chroma: one hue,
//                       as Totoro (kept chroma on yellows and oranges cancels the blue and greys them). On a palette ladder it lands on Totoro's
//                       four foliage tones (camphor: .006/.025/.074/.157 against .007/.025/.073/.176).
export const GLSL_NIGHT = /* glsl */`
  vec3 gNightAxis(vec3 c, float l2, float k){ float l = dot(c, vec3(.3, .59, .11)); return max(l2*vec3(.38, 1.05, 2.42) + (c - l)*k, l2*.15); }
  vec3 gNightGrade(vec3 c){ float l = dot(c, vec3(.3, .59, .11)); return mix(c, gNightAxis(c, l*.43, .12), uNightGrade); }
  vec3 gNightBand(vec3 p){ float l = dot(p, vec3(.3, .59, .11)); return gNightAxis(p, .5*pow(max(l, 1e-4), 1.34), 0.); }
`
// Shadow tiers, one rule for every surface (critique/round11/bands.md): lit P2; shade (sun blocked: cast shadow, a slope turned away, a cloud) P1;
// deep (sun and sky blocked: contact, a lobe's underside inside the crown) P0; accent (the densest of those) gAccent(P0). Ghibli's daylight
// frames bottom out at value ~.12-.25, never black, and their darkest accents lose colour toward a cool grey: gAccent is P0 at ~0.55 of its
// light, 40% toward grey, leaning blue.
export const GLSL_ACCENT = /* glsl */`
  // shade keeps its colour: saturation set directly (HSV, value kept) and hue turned about the grey axis (chroma kept). Multiplying a green
  // by extra blue to cool it cancels its chroma and greys it; night never did that, and day shade shouldn't either.
  float gSat(vec3 c){ float v = max(max(c.r, c.g), c.b); return v > 0. ? (v - min(min(c.r, c.g), c.b))/v : 0.; }
  vec3 gSatTo(vec3 c, float s){ float v = max(max(c.r, c.g), c.b), s0 = gSat(c); return s0 > 0. ? v - (v - c)*(s/s0) : c; }
  vec3 gHueRot(vec3 c, float a){ vec3 k = vec3(.57735); float co = cos(a), si = sin(a); return c*co + cross(k, c)*si + k*dot(k, c)*(1. - co); }   // + turns green toward teal
  vec3 gAccent(vec3 p0){ float l = dot(p0, vec3(.2126, .7152, .0722)); return mix(p0, vec3(l), .4)*vec3(.5, .55, .68); }
`
// Aerial perspective, one rule for every surface (foliage, ground, grass, flowers, rocks, bark, forest impostors): past 220 m the colour
// drifts toward the fog colour, shade faster than light (lit = 0 shade, 1 full light). Before this, only foliage took it and a far
// tree washed out pale against a ground that stayed full green.
export const GLSL_AIR = /* glsl */`
  uniform float uAir;
  float gAir(float d, float lit){ return (1. - exp(-max(d - 500., 0.)*.0012))*(1. - .55*clamp(lit, 0., 1.))*uAir; }   // Ghibli's clear-day frames keep near-full colour out to the far hills: only the far distance cools
`
// cloud shadows, shared by every surface so a passing cloud shades them all: patches of 60-150 m, moving with the wind at ~6 m/s.
// The edge is a hard toon edge, like a tree's cast shadow. gCloudShade is vertex-safe (a fixed narrow step, for foliage strokes);
// gCloudShadeAA, fragment-only, is one pixel wide at any distance. Needs tField, uTime, uWindDir and uWind declared before it.
export const GLSL_CLOUDSHADE = /* glsl */`
  float gCloudField(vec2 fp){ vec2 cp = fp - uTime*uWindDir*6.;
    return texture2D(tField, (cp*.0055 + 51.)/16.).r*.7 + texture2D(tField, (cp*.017 + 77.)/16.).r*.3; }
  float gCloudShade(vec2 fp){ return smoothstep(.62, .625, gCloudField(fp))*uWind; }
`
const GLSL_CLOUDSHADE_AA = /* glsl */`
  float gCloudShadeAA(vec2 fp){ float v = gCloudField(fp), w = max(fwidth(v)*.75, 1e-5); return smoothstep(.6225 - w, .6225 + w, v)*uWind; }
`
const PARS = /* glsl */`
  // the sun's light is shaded by passing clouds for every patched surface (flowers, rocks, bark, ground, grass), as for the foliage
  uniform sampler2D tField; uniform float uTime, uWind; uniform vec2 uWindDir;
  ${GLSL_CLOUDSHADE} ${GLSL_CLOUDSHADE_AA} ${GLSL_AIR}
  uniform float uBands, uSoft, uToonMix, uPaletteMix, uShadowFillK, uSunLum, uSunUp, uSunY, uDay, uLanternI, uPigment;
  uniform float uNightGrade;
  ${GLSL_NIGHT} ${GLSL_ACCENT}
  uniform vec3 uShadowFill, uAmbTint, uSunTint, uLanternPos, uLanternColor, uPal0, uPal1, uPal2, uPal3;
  float gMod = 1.; vec3 gTint = vec3(1.);`

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
  vec3 windOffset(vec3 wp, vec3 clump, vec4 a){
    float t = uTime;
    float gust = .55 + .45*sin(t*.35 + a.x*.05)*sin(t*.23 + a.y*.07);
    float sway = sin(t*1.1 + a.x*.35 + a.y*.25) + .35*sin(t*2.3 + a.x*.9 - a.y*.6);
    vec3 o = vec3(.55, .0, .35)*sway*gust*a.z*uSway;
    o += vec3(.4, .22, .3)*sin(t*1.9 + clump.x*.7 + clump.y*.4 + clump.z*.6)*gust*a.w*.1*uSway;
    float fl = sin(t*6.3 + wp.x*7.1 + wp.y*4.3 + wp.z*5.7)*(.55 + .45*sin(t*2.9 + wp.z*3.1 + wp.x*1.7));
    float wv = gWave(mix(a.xy, wp.xz, step(.01, a.w)));                // leaves meet the front where they are; stems and grass at their root
    o += vec3(uWindDir.x, 0., uWindDir.y)*gWaveTree(a.xy)*a.z*uSway*4.;           // the plant leans with the gust at its root, as its foliage does
    o += vec3(.5, .8, .5)*fl*a.w*uFlutter*(.4 + .6*gust)*(1. + 2.5*wv);
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
    seen *= 1. - gCloudShadeAA(vWPos.xz);   // a cloud is a cast shadow like any other, with the same hard edge
    gLit = max(gLit, ndl*seen); gNdl = max(gNdl, ndl); gSeen = max(gSeen, seen);
    IncidentLight tl = dl;
    #ifdef G_TOON
      tl.color *= clamp(toonRamp(ndl)/max(ndl, 1e-3), 0., 4.);
    #endif
    RE_Direct_Physical(tl, gp, gn, gv, gcn, m, rl);
  }`

export function patch(mat, o){
  const key = JSON.stringify(o, (k, v) => k === 'uniforms' ? undefined : v)
  mat.customProgramCacheKey = () => key
  const clump = o.clumpExpr || 'vec3(aWind.x, 0., aWind.y)'
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, o.uniforms || {})
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uSway, uFlutter; uniform vec2 uWindDir; varying vec3 vWPos; ${GLSL_NOISE} ${o.wind ? 'attribute vec4 aWind;' + GLSL_WIND : ''}
        ${o.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${o.vertexBegin || ''}`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix*mvPosition;                        // a forest copy: placed by its instance
        #endif
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
      ${o.toon ? '#define G_TOON' : ''}
      varying vec3 vWPos; ${PARS} ${GLSL_NOISE} ${o.fragmentPars || ''}`)
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
        { reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb)*uShadowFill*uShadowFillK*(1. - gLit)*PI; }`)
      .replace('#include <opaque_fragment>', `
        { float kk = gLit; ${o.shade || ''}
          // pigment shifts the colour after the band is chosen, so a stroke stays one stroke with paint moving inside it
          vec3 pal = palRamp(${o.softRamp ? 'clamp(kk, 0., 1.)' : 'toonRamp(clamp(kk, 0., 1.))'} + (${o.pigment || '0.'})*uPigment*.34);
          ${o.palLine || ''}
          float lit = clamp(kk, 0., 1.);
          pal = max(pal*(1. + uShadowFill*uShadowFillK*(1. - lit)*1.6)*gMod*gTint, gAccent(uPal0))*mix(uAmbTint, uSunTint, toonRamp(lit));   // the deepest paint is the palette's shadow colour, never black
          outgoingLight = mix(outgoingLight, pal, uPaletteMix);
          #ifdef USE_FOG
            outgoingLight = mix(outgoingLight, fogColor, gAir(length(vViewPosition), smoothstep(.27, .6, lit)));   // the ground's two bands sit at .27 and .6: shade 0, full light 1
          #endif
          outgoingLight = gNightGrade(outgoingLight);
          vec3 lv = (viewMatrix*vec4(uLanternPos, 1.)).xyz + vViewPosition; float d2 = dot(lv, lv);
          outgoingLight += uLanternColor*(.3 + .7*saturate(dot(normal, normalize(lv))))*uLanternI/(1. + d2*.18)*(.4 + diffuseColor.rgb); }
        #include <opaque_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${o.color || ''}`)
    if (o.normal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${o.normal}`)
    o.onShader?.(sh)
  }
  return mat
}
