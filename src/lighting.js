// One clock drives everything that a change of light should touch: sun, sky, fog, ambient and the tints the palette is
// multiplied by. Colours are keyed by hour and interpolated; the sun arcs from 05:00 to 19:00, the moon the rest of the night.
import * as THREE from 'three'
import { U } from './ghibli-patch.js'

const K = [
  //  hour  light       I     skyTop     horizon    ambient tint  ambient level
  [  0,  '#a9c2ff', .55, '#0a1034', '#1d2c5c', '#3a4c92', .34 ],
  [  4,  '#a9c2ff', .55, '#0d1540', '#27325f', '#3f4f96', .36 ],
  [  5,  '#ff9a78', .35, '#2b3a78', '#d98a78', '#6a6aae', .45 ],
  [  6.5,'#ffb078', 1.7, '#4a78c4', '#fbc79a', '#8488c4', .7 ],
  [  9,  '#ffe9c4', 2.8, '#1a8ab8', '#c2ecec', '#a8c0e4', .9 ],
  [ 12,  '#fff4e0', 3.2, '#127ca8', '#bcecec', '#b4cce8', 1 ],
  [ 15.5,'#ffe6b8', 3.0, '#1c86b0', '#d4eedc', '#b2c2dc', .95 ],
  [ 17.5,'#ffb46a', 2.3, '#5a86cc', '#ffcf94', '#9a94c4', .78 ],
  [ 18.5,'#ff7c4c', 1.1, '#46509c', '#ff9468', '#7a68ac', .58 ],
  [ 19,  '#d86a8c', .35, '#2c3478', '#b0627e', '#5c5a9e', .45 ],
  [ 20,  '#a9c2ff', .4,  '#141c4c', '#3c3a70', '#434f94', .38 ],
  [ 24,  '#a9c2ff', .55, '#0a1034', '#1d2c5c', '#3a4c92', .34 ],
]
const a = new THREE.Color(), b = new THREE.Color()
const mixKey = (i, t, f) => a.set(K[i][f]).lerp(b.set(K[i + 1][f]), t).clone()

export function applyLighting(p, L){
  const h = ((p.time%24) + 24)%24
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= h) i++
  const t = (h - K[i][0])/(K[i + 1][0] - K[i][0])
  const color = mixKey(i, t, 1), top = mixKey(i, t, 3), horizon = mixKey(i, t, 4), amb = mixKey(i, t, 5)
  const I = THREE.MathUtils.lerp(K[i][2], K[i + 1][2], t)*p.sunIntensity, ambK = THREE.MathUtils.lerp(K[i][6], K[i + 1][6], t)*p.ambient

  const day = h >= 5 && h < 19, arc = day ? (h - 5)/14 : ((h - 19 + 24)%24)/10
  const elev = Math.max(.06, Math.sin(arc*Math.PI))*(day ? p.sunHeight : p.sunHeight*.8)
  const az = p.sunAzimuth*Math.PI/180 + (arc - .5)*Math.PI*1.1
  const dir = new THREE.Vector3(Math.cos(az)*Math.cos(elev), Math.sin(elev), Math.sin(az)*Math.cos(elev)).normalize()
  if (p.sunTint !== '#ffffff') color.multiply(new THREE.Color(p.sunTint))

  L.sun.position.copy(dir).multiplyScalar(L.reach)
  L.sun.color.copy(color); L.sun.intensity = I
  L.sun.shadow.radius = p.shadowSoft
  L.hemi.color.copy(amb); L.hemi.groundColor.set('#7d6a36').multiplyScalar(.8); L.hemi.intensity = .9*ambK

  const lum = .2126*color.r + .7152*color.g + .0722*color.b
  U.uSunLum.value = lum*I
  U.uSunUp.value = Math.max(dir.y, .22)
  U.uSunDir.value.copy(dir)
  const dayness = THREE.MathUtils.clamp(I/2.2, .12, 1)
  U.uDay.value = dayness
  // the sun tint: colour pulled halfway to white (a max-normalised sun alone reads orange), then scaled by how bright it is
  const white = new THREE.Color(1, 1, 1), sunT = color.clone()
  sunT.multiplyScalar(1/Math.max(sunT.r, sunT.g, sunT.b)).lerp(white, .55*dayness)
  U.uSunTint.value.copy(sunT).multiplyScalar(THREE.MathUtils.lerp(.4, 1.06, Math.min(1, I/2.6)))
  U.uAmbTint.value.copy(amb).multiplyScalar(1/Math.max(amb.r, amb.g, amb.b)).lerp(white, .05 + .57*dayness).multiplyScalar(Math.min(1, .16 + .9*ambK))

  L.sky.update({ top, horizon, sunDir: dir, sunColor: color, cloud: p.clouds, night: 1 - THREE.MathUtils.smoothstep(I, .35, 1.2), ambK })
  L.scene.fog.color.copy(horizon).lerp(top, .15)
  L.scene.fog.near = 50; L.scene.fog.far = 60 + 520*(1 - p.haze)
}
