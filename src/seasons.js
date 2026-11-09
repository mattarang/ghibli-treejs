// Seasons: one value, 0..1 round the year (0 spring, .25 summer, .5 autumn, .75 winter, 1 spring again), moves every palette in the scene
// between four keys. Each species' keys come from what it already has: its own palette is the key it was painted for (summer for most, autumn
// for the maple and ginkgo, spring blossom for the cherry), a colour form named for a season is that season's key for the trees that wear it,
// and the rest come from a few shared palettes mixed into its summer green. Colours blend in display space, as they were picked.

const KEYS = ['spring', 'summer', 'autumn', 'winter']
const FRESH = ['#2a5a30', '#4c8a3c', '#8cc44e', '#cbe680']          // new leaves: light, warm, yellow-green
const GREEN = ['#1e4a2e', '#3a7542', '#61a648', '#9dd363']          // a broadleaf's summer green, for species painted in another season
const COLD = ['#0c2a2e', '#1a4038', '#30604a', '#5c8a66']           // evergreens in the cold: darker, bluer
const WITHERED = ['#3e2a1e', '#6a4a30', '#9a7248', '#c8a272']       // the last leaves on a bare tree
const AUTUMN_DEFAULT = ['#5a2a1c', '#9c4a26', '#d07c34', '#f0b45a']
const AUTUMN = {
  'Japanese zelkova': ['#642f20', '#a45426', '#d48436', '#eeb85e'],
  'English oak': ['#46381c', '#7a6028', '#b08e3a', '#d8bc64'],
  'Weeping willow': ['#4a5420', '#7d8432', '#b8b848', '#e2dc78'],
  'Lombardy poplar': ['#5a4a14', '#9a7e20', '#d4b03a', '#f2dc7a'],
  'Yoshino cherry': ['#6a2a22', '#a8452e', '#dc743c', '#f4ac68'],
}
const EVERGREEN = new Set(['Camphor tree', 'Stone pine', 'Japanese black pine', 'Japanese red pine', 'Japanese cedar', 'Hinoki cypress', 'Round bush'])
const BASE_KEY = { 'Japanese maple': 'autumn', 'Ginkgo': 'autumn', 'Yoshino cherry': 'spring' }
// the ground: the meadow through the year, and the hills' mixed forest
const G_SPRING = ['#22402a', '#386a3a', '#6cb83c', '#a8da5a'], G_AUTUMN = ['#343e23', '#565e37', '#bc9e4e', '#e8cf84'], G_WINTER = ['#33362a', '#53553c', '#8f8a5c', '#bdb58a']
const H_AUTUMN = ['#4a3220', '#7a4a26', '#a8703a', '#c89a52']

export const isEvergreen = name => EVERGREEN.has(name)
// (one of your own trees says for itself)
export const evergreenOf = (name, sp) => sp?.custom ? !!sp.evergreen : EVERGREEN.has(name)

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)/255)
const hex = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v))*255).toString(16).padStart(2, '0')).join('')
const mixHex = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v)*t)) }
export const mixPal = (a, b, t) => a.map((h, i) => mixHex(h, b[i], t))
export const SNOW_GROUND = ['#4e6488', '#8ca4ca', '#dce5f1', '#f6f8fc']   // the meadow under snow: blue shade, white light
const formKey = name => /autumn|scarlet|wine|rust|russet|gold/.test(name) ? 'autumn' : /spring|white|pink/.test(name) ? 'spring' : 'summer'

// the four keys of a species, from its palette and colour forms
export function speciesKeys(name, sp){
  // one of your own trees: its leaf colour is its summer, whatever kind of tree it grows like
  if (sp.custom){ const ever = !!sp.evergreen, summer = sp.palette
    return { spring: sp.spring ?? mixPal(summer, FRESH, ever ? .2 : .5), summer, autumn: ever ? mixPal(summer, COLD, .2) : sp.autumn ?? AUTUMN_DEFAULT, winter: ever ? mixPal(summer, COLD, .45) : WITHERED } }
  const base = BASE_KEY[name] ?? 'summer', green = sp.colors?.find(f => /summer/.test(f.name))?.palette
  const summer = base === 'summer' ? sp.palette : green ?? GREEN
  const ever = EVERGREEN.has(name)
  const k = {
    spring: base === 'spring' ? sp.palette : mixPal(summer, FRESH, ever ? .2 : .5),
    summer,
    autumn: base === 'autumn' ? sp.palette : ever ? mixPal(summer, COLD, .2) : AUTUMN[name] ?? AUTUMN_DEFAULT,
    winter: ever ? mixPal(summer, COLD, .45) : WITHERED,
  }
  return k
}
// a colour form's keys: the species' keys with the form's own palette in the season it is named for
export const formKeys = (keys, form) => ({ ...keys, [formKey(form.name)]: form.palette })

// where s falls between keys: each key holds for the middle of its quarter and blends into the next across the rest
function at(s){ const t = (((s % 1) + 1) % 1)*4, i = Math.floor(t), f = t - i, u = Math.min(1, Math.max(0, (f - .3)/.4)); return [KEYS[i], KEYS[(i + 1)%4], u*u*(3 - 2*u)] }
export const seasonPal = (keys, s) => { const [a, b, t] = at(s); return mixPal(keys[a], keys[b], t) }
// for foliage, which turns stroke by stroke: the two keys either side and how far between them
export const seasonPair = (keys, s) => { const [a, b, t] = at(s); return [keys[a], keys[b], t] }
export const groundKeys = summer => ({ spring: mixPal(summer, G_SPRING, .5), summer, autumn: mixPal(summer, G_AUTUMN, .8), winter: G_WINTER })
export const hillKeys = summer => ({ spring: mixPal(summer, FRESH, .25), summer, autumn: mixPal(summer, H_AUTUMN, .2), winter: mixPal(summer, COLD, .5) })
// the hills' broadleaves among their conifers: in autumn a share of the forest's strokes turn rust and gold (stroke by stroke, as on a tree)
export const HILL_TURN = ['#5c2a1a', '#9a4622', '#cc7834', '#e8ae56']
export function autumnShare(s){ const t = ((s % 1) + 1) % 1; return Math.max(0, 1 - Math.abs(t - .56)/.14) }
// how much of the year's leaf a deciduous tree still holds: full from late spring to early autumn, falling through late autumn, bare in winter,
// budding again in early spring
export function leafKeep(s){ const t = ((s % 1) + 1) % 1
  if (t < .08) return .15 + .85*t/.08
  if (t < .5) return 1
  if (t < .7) return 1 - (t - .5)/.2
  if (t < .92) return 0
  return .15*(t - .92)/.08 }
// how much snow lies: none until late autumn, thickest at midwinter, gone by early spring
export function snowCover(s){ const t = ((s % 1) + 1) % 1, d = Math.min(Math.abs(t - .75), Math.abs(t - 1.75), Math.abs(t + .25)); return Math.min(1, Math.max(0, (.13 - d)/.06)) }   // first snow in late autumn, once the leaves are down
export const SEASON_NAMES = { 'Early spring': .02, Spring: 0.08, Summer: .25, 'Early autumn': .45, Autumn: .55, 'Late autumn': .64, Winter: .75 }

// the sky through the year. Summer's tall cumulus grow from ground the sun has heated; in the cold the air hardly rises, so clouds lie low,
// flat and wide (stratocumulus), and the sky is paler with a lower sun. Spring and autumn sit between, autumn's air the clearest.
//   sun: the sun's arc scaled (1 at midsummer); tall, spread: cloud height and width; count: how many; cool: clouds toward grey-blue;
//   pale: the sky's zenith toward a soft grey-blue; deep: the zenith a step deeper (autumn's clear air)
export function seasonSky(s){
  const t = ((s % 1) + 1) % 1, w = (1 - Math.cos((t - .25)*Math.PI*2))/2, a = Math.max(0, 1 - Math.abs(t - .55)/.16)
  return { sun: 1 - .32*w, tall: 1 - .62*w, spread: 1 + .6*w, count: 1 - .3*a, cool: w, pale: .35*w, deep: .12*a }
}
export const SUMMER_SKY = { sun: 1, tall: 1, spread: 1, count: 1, cool: 0, pale: 0, deep: 0 }

// how fast a deciduous tree is letting its leaves go: through autumn, most at its height (0..1)
export function leafFallRate(s){ const t = ((s % 1) + 1) % 1; return Math.max(0, 1 - Math.abs(t - .6)/.13) }

// how much of the pond is frozen (0 open water, 1 iced over), straight from the time of year: the ice closes in from the shore between early
// winter and midwinter, holds through the deep of winter, and melts back to the shore as winter ends
export function iceCover(s){ const t = ((s % 1) + 1) % 1
  if (t >= .66 && t < .75) return (t - .66)/.09
  if (t >= .75 && t < .81) return 1
  if (t >= .81 && t < .88) return 1 - (t - .81)/.07
  return 0 }
