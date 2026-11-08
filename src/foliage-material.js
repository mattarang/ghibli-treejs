// Foliage's own shader. A stroke is one flat colour, so all of its lighting happens once, per vertex, and the fragment shader only reads
// the brush. Strokes overlap heavily, so this is where the frame rate lives. Cores share it, as strokes that happen to have no fan.
import * as THREE from 'three'
import { U, GLSL_NIGHT, GLSL_ACCENT, GLSL_CLOUDSHADE, GLSL_AIR } from './ghibli-patch.js'

const vertexShader = /* glsl */`
  attribute vec2 aCorner; attribute vec3 aPatch, aStroke, aLeaf, clusterCenter; attribute vec4 aWind; attribute float aDab;
  uniform sampler2D tSun, tLobe; uniform float uSelfShade, uHueVar, uMass; uniform vec3 fogColor;
  uniform vec2 uWindDir; uniform vec3 uLightRel; uniform float uShadeCool, uMoonPaint, uNightGrade, uMoonTop, uLobeShade, uRimTop, uDayRim, uMoonDark;
  ${GLSL_NIGHT} ${GLSL_ACCENT}
  uniform float uTime, uWind, uSway, uFlutter, uLightShape, uBands, uSoft, uToonMix, uPigment, uSss, uRim, uFleck, uShadowFillK, uDay, uLanternI;
  uniform sampler2D tField;
  ${GLSL_CLOUDSHADE}
  ${GLSL_AIR}
  uniform vec3 uPalV[12]; vec3 P0, P1, P2, P3;
  uniform vec3 uSunDir, uPal0, uPal1, uPal2, uPal3, uSssColor, uRimColor, uShadowFill, uAmbTint, uSunTint, uLanternPos, uLanternColor;
  varying vec2 vUv; varying vec3 vColA, vColB; varying float vCalm;
  #include <fog_pars_vertex>
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
    float t = uTime, gust = .55 + .45*sin(t*.35 + a.x*.05)*sin(t*.23 + a.y*.07);
    vec3 o = vec3(.55, 0., .35)*(sin(t*1.1 + a.x*.35 + a.y*.25) + .35*sin(t*2.3 + a.x*.9 - a.y*.6))*gust*a.z*uSway;
    o += vec3(.4, .22, .3)*sin(t*1.9 + clump.x*.7 + clump.y*.4 + clump.z*.6)*gust*a.w*.1*uSway;
    float fl = sin(t*6.3 + wp.x*7.1 + wp.y*4.3 + wp.z*5.7)*(.55 + .45*sin(t*2.9 + wp.z*3.1 + wp.x*1.7));
    float wv = gWave(clump.xz);                                      // each clump meets the front when it gets there: it tosses
    o += vec3(uWindDir.x, 0., uWindDir.y)*gWaveTree(a.xy)*a.z*uSway*4. + vec3(.3, .15, .5)*gWaveTree(clump.xz)*a.w*.25*uSway;   // the whole crown leans with its trunk (so leaves stay on their limbs); clumps toss as the front passes them
    return (o + vec3(.5, .8, .5)*fl*a.w*uFlutter*(.4 + .6*gust)*(1. + 2.5*wv))*uWind; }
  float toonRamp(float x){ float n = max(uBands, 1.), s = pow(x, .85)*n, f = floor(s), t = smoothstep(.5 - uSoft, .5 + uSoft, fract(s));
    return mix(x, clamp((f + t)/n, 0., 1.), uToonMix); }
  // Four bands per palette, the same for every species and colour form: P0 deep shade, P1 shade, P2 lit, P3 the light's rim on each lobe.
  // The leaf body ramps P0 -> P1 -> P2 over the same light as ever and holds at P2 in full light; P3 is kept for the crest strokes alone.
  vec3 palRamp(float x){ x = clamp(x, 0., 1.)*3.; return x < 1. ? mix(P0, P1, x) : x < 2. ? mix(P1, P2, x - 1.) : P2; }
  // turns a colour around its own grey, keeping its value
  vec3 turnHue(vec3 c, float a){ float y = dot(c, vec3(.299, .587, .114)), i = dot(c, vec3(.596, -.274, -.322)), q = dot(c, vec3(.211, -.523, .312)), s = sin(a), k = cos(a), u = i*k - q*s, v = i*s + q*k;
    return vec3(y + .956*u + .621*v, y - .272*u - .647*v, y - 1.106*u + 1.703*v); }
  void main(){
    vUv = uv; P0 = uPal0; P1 = uPal1; P2 = uPal2; P3 = uPal3;
    // a forest copy is placed by its instance: everything the stroke carries in its tree's own space is carried along (instances only move and scale, so the light baked for the tree still holds)
    mat4 M = modelMatrix; vec4 wnd = aWind; vec3 clump = clusterCenter;
    #ifdef USE_INSTANCING
      M = modelMatrix*instanceMatrix; clump = (M*vec4(clusterCenter, 1.)).xyz; wnd.xy += M[3].xz;
    #endif
    float iScale = length(M[0].xyz);
    vec4 wPos = M*vec4(position, 1.);
    wPos.xyz += windOffset(wPos.xyz, clump, wnd);
    vec4 mvPosition = viewMatrix*wPos;
    vec3 n = normalize(mat3(M)*normal), V = normalize(cameraPosition - wPos.xyz);
    float rimV = smoothstep(.5, .82, 1. - abs(dot(n, V)));
    // where the stroke sits on its own lobe, toward the light (raised a little by day, high for the moon): -1 underneath, 1 at the crest.
    // Every lobe is then modelled as a form of its own, lit top to shaded underside, as painted trees are.
    float nightE = (1. - smoothstep(.25, .5, uDay))*uMoonPaint, lobeH = 0., lobeRim = 0.;
    if (aPatch.z >= 0.){ int lid = int(aPatch.z); vec4 lb = texelFetch(tLobe, ivec2(lid%256, lid/256), 0);
      vec3 off = wPos.xyz - (M*vec4(lb.xyz, 1.)).xyz;
      lobeH = clamp(dot(off, normalize(uSunDir + vec3(0., mix(.7, 1.5, nightE), 0.)))/(lb.w*iScale), -1., 1.);
      lobeRim = 1. - abs(dot(normalize(off + vec3(0., 1e-4, 0.)), V)); }   // 1 where the lobe turns away from the eye: its silhouette
    bool small = aDab > 1.5, massed = uMass > .5 && aPatch.z >= 0., closed;
    float F, score = 0., hueOf = 0.;
    if (massed){
      // Light belongs to the mass. main.js gives every clump its place against its mass's terminator; a stroke adds only the turn of its own
      // form, so whole clumps fall on one side together, and the border between light and shadow is a chain of clump-sized shapes.
      int id = int(aPatch.z);
      vec3 place = texelFetch(tSun, ivec2(id%256, id/256), 0).rgb; hueOf = place.g - .5;
      int form = int(place.b*255. + .5); if (form > 0){ int o = (form - 1)*4; P0 = uPalV[o]; P1 = uPalV[o + 1]; P2 = uPalV[o + 2]; P3 = uPalV[o + 3]; }   // each tree's own colour form
      score = place.r*4. - 2. + dot(n, uSunDir)*.6 + aPatch.x*uLightShape*.9 - gCloudShade(wPos.xz)*4.;   // a cloud passing over shades the crown with the ground
      // the underside of every lobe turns from the light: a crescent of shade under each one is what sets the lobes apart
      score += min(lobeH + .3 + (aLeaf.z - .5)*.25, 0.)*uLobeShade*2.4;
      float along = score + (aLeaf.z - .5)*.16;                                 // across the terminator, dabs decide one by one
      F = mix(.05, .34 + .5*smoothstep(0., .85, score)*smoothstep(0., .85, score) + aPatch.y*.05, smoothstep(-.015, .015, along));   // the more it faces the sun, the brighter
      closed = (aDab > .5 && !small && score < -.16 && aLeaf.z > .4) || (small && abs(score) > .13 && rimV < .4);   // detail lives on the terminator and the rim
    } else {
      F = (max(dot(n, uSunDir), 0.)*(.72 + .28*aLeaf.x) + (aLeaf.x - .5)*.2 + (aLeaf.z - .5)*.02 + aPatch.x*uLightShape*1.8)*.95*(1. - gCloudShade(wPos.xz));
      bool band = F > .13 && F < .62;
      closed = (aDab > .5 && !small && F < .16 && aLeaf.z > .4) || (small && !band && rimV < .4 && (F < .62 || aLeaf.z > .22));
    }
    // closed strokes collapse here, before they cost a pixel
    // the crest: high on its lobe toward the light and on the lobe's own silhouette, so the brightest tone is an edge, not a cap.
    // At night the small strokes carry only that tone and open nowhere else; by day the crest opens them as well, in full light only.
    float topE = (lobeH*.5 + .5)*.6 + lobeRim*.4 + (aLeaf.z - .5)*.08;
    float rimTop = mix(uRimTop, uMoonTop, step(.5, nightE));
    bool crest = topE > rimTop + (small ? 0. : .06);
    if (nightE > .5 && small) closed = topE < uMoonTop + (F < .12 ? .1 : 0.);   // the side away from the moon keeps its crests too, fewer and a tone down
    else if (small && crest && F > .3 && uDayRim > 0.) closed = false;
    if (closed){ gl_Position = vec4(2., 2., 2., 1.); return; }
    vec2 sd = (viewMatrix*vec4(aStroke, 0.)).xy; sd = normalize(sd + vec2(0., 1e-3));
    mvPosition.xy += (sd*aCorner.x + vec2(-sd.y, sd.x)*aCorner.y)*iScale;
    if (aDab > .1 && aDab < .4) mvPosition.z += length(aCorner)*.4;              // a clump's body stands just behind its strokes, ahead of the wood inside it
    gl_Position = projectionMatrix*mvPosition;
    #include <fog_vertex>
    float calm = smoothstep(.11, .28, F);                 // 0 in shadow: paint only moves in the light
    float light = .02 + F + aPatch.y*uFleck*.15;
    if (massed && !small) light += (aLeaf.z - .5)*(aDab > .4 && aDab < .9 ? .26 : .1)*(1. - .5*uLobeShade) + (aLeaf.y - .5)*.14*(1. - .5*uLobeShade);
    // each lobe steps down from its lit top to its underside: the tones follow its form instead of falling at random
    light += lobeH*uLobeShade*.32;   // paint steps through several tones inside a light shape, never one flat value
    if (small) light += massed ? (aLeaf.z - .5)*.3 : F > .62 ? .14 : (aLeaf.z - .5)*.62;   // small dabs alone break the big shape
    float dark = massed ? (.02 + .3*aLeaf.x*aLeaf.x + (aLeaf.y - .5)*.05 + .15*smoothstep(-.55, -.02, score + (aLeaf.z - .5)*.3))
                        : .015 + .12*aLeaf.x + (aLeaf.y - .5)*.05 + (aLeaf.z - .5)*.1;
    dark += lobeH*uLobeShade*.07 - smoothstep(-.1, -.7, lobeH)*.22*uLobeShade;   // the shade side keeps its lobes too; their undersides inside the crown reach P0 (deep tier)
    float kk = mix(dark, mix(light, smoothstep(.16, .74, light), .45), calm), lit = clamp(kk, 0., 1.), x = mix(lit, toonRamp(lit), calm);
    float spread = .22*calm*uPigment;
    vec3 tint = mix(vec3(1.), mix(vec3(.88, 1., 1.06), massed ? vec3(1.04, 1.01, .94) : vec3(1.08, 1.02, .86), aLeaf.y), calm), base = palRamp(x);
    float mod0 = mix(1., 1. + (aLeaf.y - .5)*.2, calm), toSun = toonRamp(lit);
    vec3 scale = (1. + uShadowFill*uShadowFillK*(1. - lit)*1.6)*mod0*tint*mix(1., .8, (1. - calm)*uShadeCool),   // a crown's shade is a step darker than the grass shadow under it, as in every Ghibli frame measured
         wash = mix(uAmbTint, mix(vec3(dot(uSunTint, vec3(.333))), uSunTint, .5), toSun);   // leaves take half the sun's warmth: full warmth turns every lit green yellow
    #if defined(CLOUD) || defined(AMB_LUM)
      // a cloud's (or a distant range's) shade is the palette's own colour: the ambient tint (lavender, and purple toward evening) only sets how bright it is,
      // otherwise it pulls the blue shade grey-violet
      wash = mix(vec3(dot(uAmbTint, vec3(.333))), mix(vec3(dot(uSunTint, vec3(.333))), uSunTint, .5), toSun);
    #endif
    float back = pow(clamp(dot(-V, uSunDir), 0., 1.), 3.)*uSss*F;
    float rimF = pow(1. - clamp(dot(n, V), 0., 1.), 3.)*uRim*(.3 + .7*clamp(dot(n, uSunDir) + .3, 0., 1.));
    vec3 glow = (back*uSssColor*(.35 + base) + uRimColor*rimF*(.4 + base))*uSunTint*uDay*calm;
    vec3 lv = uLanternPos - wPos.xyz; float d2 = dot(lv, lv);
    glow += uLanternColor*(.3 + .7*clamp(dot(n, normalize(lv)), 0., 1.))*uLanternI/(1. + d2*.18)*(.4 + base);
    // hue is a second axis of paint that light doesn't touch: whole lobes lean teal or olive, and strokes only a little
    float turn = (massed ? hueOf*.3 + (fract(aPatch.z*.618) - .5)*.1 + (aLeaf.z - .5)*.1 : (aLeaf.z - .5)*.42 + (aLeaf.y - .5)*(1. - calm)*.45)*uHueVar;
    // air: distance lifts shadow toward the sky long before it touches the lights
    float air = gAir(length(mvPosition.xyz), calm);
    // the sky fills the shade: greens turn toward teal, warm colours toward mauve, by a hue turn that keeps their colour (multiplying in blue
    // greyed them). Ghibli's crown shade sits 10-40 deg bluer than the grass shade below it.
    vec3 cA = max(palRamp(x - spread)*scale, P0*.9), cB = max(palRamp(x + spread)*scale, P0*.9);
    float lean = (1. - calm)*uShadeCool*.22;
    cA = gHueRot(cA, lean*sign(cA.g - cA.r + 1e-4)); cB = gHueRot(cB, lean*sign(cB.g - cB.r + 1e-4));
    vColA = mix(turnHue(cA, turn)*wash, fogColor, air) + glow;
    vColB = mix(turnHue(cB, turn)*wash, fogColor, air) + glow;
    // accent tier: the deepest gaps in the crown (enclosed strokes on a shaded lobe's underside) take the cool, greyed accent of P0
    { float acc = (1. - calm)*smoothstep(.35, .12, aLeaf.x)*smoothstep(-.2, -.75, lobeH)*.85;
      vec3 ac = mix(turnHue(gAccent(P0), turn)*wash, fogColor, air);
      vColA = mix(vColA, ac, acc); vColB = mix(vColB, ac*1.04, acc); }
    // band 3, the light's rim on each lobe: the crest strokes in full light take P3, as painted at noon, in this hour's light
    { float rk = (1. - nightE)*uDayRim*(crest ? 1. : 0.)*smoothstep(.45, .7, calm);
      vec3 hl = mix(turnHue(P3, turn*.4)*uLightRel, fogColor, air) + glow*.5;   // P3 as painted at noon, in this hour's light
      vColA = mix(vColA, hl, rk); vColB = mix(vColB, hl*1.05, rk); }
    // moonlight, as Totoro's tree has it: the same four bands, each the palette colour turned to its moonlit tone (gNightBand), laid as flat
    // contours round each lobe from a blue-black underside to the bright crest that faces the moon
    #ifdef MOUNTAIN
    // distant mountains are painted in two flat tones, lit and shaded, decided by the land's own facet. The light is the sun's direction
    // round the sky held at a low painter's angle, so every ridge shows a lit and a shaded flank even at noon, as Ghibli paints them.
    // Farther slopes drift a step bluer and paler: the depth between ranges.
    // A side light, always: the sun's side is judged across the view (left or right along the range), never toward or away from the
    // viewer, so every ridge splits into a lit and a shaded flank at any hour, as the early-morning light gives it naturally. A sun
    // straight behind the viewer would light every face we see, and a sun ahead would shade them all.
    { vec2 az = normalize(uSunDir.xz + vec2(1e-4)), radial = normalize(wPos.xz + vec2(1e-4)), tang = vec2(-radial.y, radial.x);
      float side = dot(tang, az) >= 0. ? 1. : -1.;
      float lit = step(.02, dot(n.xz, tang*side) + n.y*.05);
      vec3 c = mix(P1, P2, lit)*(1. + (aLeaf.z - .5)*.07);
      float far = clamp((length(wPos.xz) - 650.)/550., 0., 1.);
      c = mix(c, c*vec3(.86, 1., 1.14) + vec3(.03, .06, .09), far*.7);
      c *= mix(uAmbTint, mix(vec3(dot(uSunTint, vec3(.333))), uSunTint, .5), lit);
      vColA = c; vColB = c*1.03; }
    #endif
    float night = (1. - smoothstep(.25, .5, uDay))*uMoonPaint;
    if (night > 0.){
      // each lobe is lit on its own top: the stroke's place on its own clump, not only the crown's form
      float lobe = lobeH*.5 + .5, up = max(n.y, 0.);
      float m = (lobe*.78 + up*.08 + x*.14 + (aLeaf.z - .5)*.07)*(.68 + .32*calm);   // the lobe leads, so the tones run as contours round each one
      // big strokes stop at the third tone; the top tone belongs to the small strokes on the lobe tops
      float b1 = step(mix(.42, uMoonDark, smoothstep(.05, .3, uSunDir.y)), m), b2 = step(.7, m), b3 = (small ? step(.5, calm) : step(.9, m))*step(uMoonTop + (small ? 0. : .06), topE);
      if (small){ b1 = 1.; b2 = 1.; }
      vec3 moonC = mix(mix(mix(gNightBand(P0), gNightBand(P1), b1), gNightBand(P2), b2), gNightBand(P3), b3);
      vColA = mix(vColA, moonC, night); vColB = mix(vColB, moonC*1.12, night);   // fully: even 5% of a species' day glow outweighs a dark night tone
    }
    // everything else sinks toward the same deep blue as night comes on
    float gk = 1. - night;
    vColA = mix(vColA, gNightGrade(vColA), gk); vColB = mix(vColB, gNightGrade(vColB), gk);
    vCalm = calm;
  }`

const fragmentShader = /* glsl */`
  uniform sampler2D tBrush; varying vec2 vUv; varying vec3 vColA, vColB; varying float vCalm;
  #include <fog_pars_fragment>
  void main(){
    vec4 t = texture2D(tBrush, vUv);
    float w = fwidth(t.g) + 1e-4, alpha = smoothstep(.36 - w, .36 + w, t.g);
    #ifdef CLOUD
      // each dab is solid in its middle and turns see-through toward its edge, so where dabs overlap the one below shows through the rim of
      // the one above: the tones mix at every border instead of meeting in a hard line
      alpha = smoothstep(.1, .3, t.g + (t.r - .5)*.18)*mix(.55, 1., smoothstep(.3, .75, t.g));
    #endif
    if (alpha < .02) discard;
    float paint = t.r*1.3 - .15 + (1. - smoothstep(.5, .98, t.b))*.12;          // pigment and the thin paint at a stroke's edge
    gl_FragColor = vec4(mix(vColA, vColB, clamp(paint, 0., 1.)), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`

// each lobe's centre and size, by clump id (the same index as the light table): night paints every lobe from its own top down
export const lobeTable = new THREE.DataTexture(new Float32Array(256*64*4), 256, 64, THREE.RGBAFormat, THREE.FloatType)
lobeTable.magFilter = lobeTable.minFilter = THREE.NearestFilter
// the generator's own clump spheres, indexed as the light table is
export function fillLobes(clumps){
  const d = lobeTable.image.data, n = Math.min(clumps.length, 256*64)
  for (let i = 0; i < n; i++){ const c = clumps[i]; d[i*4] = c.c[0]; d[i*4 + 1] = c.c[1]; d[i*4 + 2] = c.c[2]; d[i*4 + 3] = Math.max(c.r, 1e-3) }
  lobeTable.needsUpdate = true
}
export function makeFoliageMaterial(brush, sun, palette, sss, rim){
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, side: THREE.DoubleSide, alphaToCoverage: true, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U, tBrush: { value: brush }, tSun: { value: sun }, tLobe: { value: lobeTable }, uPalV: { value: Array.from({ length: 12 }, () => new THREE.Color()) }, uPal0: palette[0], uPal1: palette[1], uPal2: palette[2], uPal3: palette[3], uSssColor: sss, uRimColor: rim },
  })
}
