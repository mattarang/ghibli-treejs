// Species table. Each preset is a complete, tunable parameter set: seeds vary a tree, presets change what it is.
const MEADOW = ['#1f6a4a', '#2f8f4e', '#66b54a', '#b0d868']
const BARK = ['#1e1e10', '#38391f', '#7a7044', '#b4b078']

const DEFAULTS = { fused: 0, midSize: 2.4, lobePoint: 0, lobeTilt: 0, lobeWide: 1, lobeDrape: 0, lobeFollow: 0, lobeAlong: 1, split: 0, trunkBow: 0, lobeRough: 1, lobeStretch: null, barkScale: 1, barkStretch: 1, barkPlates: 0, barkBands: 0, barkFurrow: 1, form: 0, colorPick: 0, colors: null, envTop: 2, envHeart: 0, envCone: 0, envW: 0, envPeak: .4, envFill: 46, realMarks: true, size: 1, keepWood: 0, clotheRad: 0, shell: 0, ownBough: 0, lobes: 0, tighten: 0, cover: 0, crownLine: .25, forms: null, forkTop: 0, forkAngle: 30, sideShoots: 0, whorls: 0, opposite: 0, fastigiate: 0, arch: 0, limbRatio: .5, variety: 1, stemVar: 1.7, limbRise: 28, maxLimb: .3, massMarks: true, leader: 1, topClump: 1, hueVar: 1, boughGap: .66, shelves: 0, stems: 1, forkHeight: .1, stemSpread: 20, sinuous: .3, ivy: 0, roots: 1, moss: .5, gesture: 'free', crownWidth: .5, asym: .22, windLean: 0, notches: 1, massVar: .5, plateSize: 1, plates: 3.5, crownBlend: .55, strays: 0, edge: 'round', hang: 0, lift: 1, droop: 0, strandLength: .9, brushWidth: .85, strokeAngle: 0, strokeJitter: 70 }

export const SPECIES = {
  'Camphor tree': {
    keepWood: 3,
    crownBlend: .15, ownBough: 1, clotheRad: .14, shell: .55, lobes: 12, tighten: .1,
    cover: 1, crownLine: 0.24,
    forkAngle: 34, sideShoots: 4, variety: 1.15,
    forkTop: 1,
    leader: .8, stemSpread: 30, limbRatio: .6, limbRise: 34,
    stemVar: .8,
    stems: 1.2, forkHeight: .16,
    boughGap: 0.45,
    shelves: 5,
    sinuous: .35, ivy: .4,
    moss: 0.45,
    gesture: 'dome', crownWidth: .78, asym: .2, notches: 1, massVar: 0.45,
    height: 12.5, trunkRadius: .72, trunkFrac: .26, lean: .06, flare: 0.7, levels: 3, children: 7, childAngle: 40, lengthRatio: 1,
    childStart: .6, gnarl: .1, upward: 0, crown: 'dome',
    clumpRadius: 1.25, clumpVar: .45, clumpsPerTip: 1.1, clumpSpacing: .72, squash: .78, massBlend: .72, lift: 1.8, cardSize: 0.96, coverage: 1.5, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#143f3a', '#2a7040', '#5a9e4a', '#8cc468'], bark: BARK, ground: MEADOW, sss: '#b0d470', rim: '#84c473', fleck: .45,
  },
  'English oak': {
    maxLimb: .5, keepWood: 3,
    crownBlend: .15, ownBough: 1, clotheRad: .16, shell: .5, lobes: 9, tighten: .2,
    cover: 1, crownLine: .22,
    forkAngle: 30, sideShoots: 4, variety: 1.15,
    forkTop: 1,
    leader: .8, limbRatio: .6, limbRise: 38,
    stemVar: .8,
    forkHeight: .17, stemSpread: 32,
    shelves: 5,
    stems: 1, sinuous: .25, ivy: .3,
    moss: 0.8,
    gesture: 'dome', crownWidth: .66, asym: .22, windLean: 0, notches: 0, massVar: .5,
    height: 10, trunkRadius: .62, trunkFrac: .28, lean: .06, flare: 0.7, levels: 3, children: 8, childAngle: 38, lengthRatio: .95,
    childStart: .55, gnarl: .14, upward: .04, crown: 'dome',
    clumpRadius: 1.35, clumpVar: .55, clumpsPerTip: 1.1, clumpSpacing: .72, squash: .68, massBlend: .72, lift: 1.5, cardSize: 0.90, coverage: 1.5, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#1c4226', '#33703a', '#649c44', '#94c462'], bark: BARK, ground: MEADOW, sss: '#bcd478', rim: '#9ac878', fleck: .55,
  },
  'Lombardy poplar': {
    ownBough: 1, shell: .7, lobes: 9, tighten: .12,
    cover: 1, crownLine: 0.1,
    crownBlend: .3, strokeAngle: 90, strokeJitter: 18,
    leader: .6,
    fastigiate: 10, sideShoots: 2,
    limbRise: 70, maxLimb: .14,
    limbRatio: .26,
    stemVar: 0,
    stems: 1, forkHeight: .06,
    boughGap: 0.2,
    shelves: 0,
    lift: 0.3,
    sinuous: .08,
    moss: 0.3,
    gesture: 'flame', crownWidth: .075, asym: 0.04, notches: 0, massVar: 0.1,
    height: 16, trunkRadius: .34, trunkFrac: .86, lean: .02, flare: 0.9, levels: 2, children: 36, childAngle: 18, lengthRatio: .5,
    childStart: .03, gnarl: .04, upward: .6, crown: 'column',
    clumpRadius: .7, clumpVar: .35, clumpsPerTip: 1.2, clumpSpacing: .5, squash: 1.6, massBlend: .6, cardSize: 0.70, coverage: 1.6, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#123d3e', '#287040', '#529a50', '#86c06a'], bark: BARK, ground: MEADOW, sss: '#a8d07a', rim: '#84c473', fleck: .4,
  },
  'Yoshino cherry': {
    keepWood: 2,
    crownBlend: .2, ownBough: 1, clotheRad: .1, shell: .45, lobes: 8, tighten: .15,
    cover: .8, crownLine: 0.28,
    forkAngle: 40, sideShoots: 3, variety: 1.15,
    forkTop: 1, arch: 0.05,
    limbRatio: .55, limbRise: 16, droop: .03,
    stemVar: 1.7,
    leader: .8,
    shelves: 4, boughGap: .6, hueVar: .3,
    stems: 2, forkHeight: .16, stemSpread: 30, sinuous: .35,
    moss: 0.25,
    gesture: 'umbrella', crownWidth: .62, asym: .24, notches: 1, massVar: 0.45,
    height: 8.5, trunkRadius: 0.5, trunkFrac: .34, lean: .14, flare: .7, levels: 2, children: 4, childAngle: 60, lengthRatio: .74,
    childStart: .6, gnarl: .12, upward: 0, crown: 'umbrella',
    clumpRadius: 1, clumpVar: .5, clumpsPerTip: 1.3, clumpSpacing: .75, squash: .6, massBlend: .75, lift: 1.8, cardSize: 0.72, coverage: 1, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#b4688e', '#e08eaa', '#f6b8ca', '#ffdedd'], bark: ['#2c2220', '#4a3428', '#7e5a42', '#caa282'], ground: MEADOW, sss: '#ffc4c8', rim: '#ffd9e0', fleck: 0,
  },
  'Japanese maple': {
    keepWood: 2,
    crownBlend: .15, ownBough: 1, clotheRad: .08, shell: .5, lobes: 12, tighten: .2,
    cover: .7, crownLine: 0.24,
    forms: null,
    boughGap: .75,
    forkAngle: 38, sideShoots: 4, variety: 1.25,
    forkTop: 1, opposite: 1,
    limbRise: 16, limbRatio: .55, maxLimb: .28,
    stemVar: 2,
    leader: .8,
    hueVar: .35,
    shelves: 4,
    stemSpread: 24,
    forkHeight: .12,
    stems: 1.9,
    sinuous: .55,
    moss: 0.35,
    gesture: 'dome', crownWidth: .5, asym: .3, notches: 1, massVar: .4,
    height: 9, trunkRadius: .38, trunkFrac: .34, lean: .06, flare: .7, levels: 2, children: 6, childAngle: 50, lengthRatio: .66,
    childStart: .4, gnarl: .1, upward: 0, crown: 'oval',
    clumpRadius: .75, clumpVar: .45, clumpsPerTip: 1.1, clumpSpacing: .6, squash: .42, massBlend: .65, lift: 1.3, cardSize: 0.81, coverage: 1.5, core: true,
    strays: .2, leaf: 'pointed', edge: 'spray', palette: ['#7c3c3e', '#b84f34', '#ea8a40', '#ffdc76'], bark: ['#2a3034', '#4a5052', '#7c807a', '#bcbcae'], ground: ['#6a6240', '#8e8244', '#bc9e4e', '#e8cf84'], sss: '#ffc25a', rim: '#ffcf80', fleck: .35,
  },
  'Stone pine': {
    crownBlend: .3, lobes: 7, tighten: .1,
    lift: 1.4,
    forkAngle: 34, variety: 1.1,
    sideShoots: 3,
    forkTop: 1,
    stemSpread: 26, leader: .7, limbRise: 20,
    limbRatio: .68,
    stemVar: 1.2,
    stems: 1.3, forkHeight: .58,
    shelves: 2,
    sinuous: 0.1,
    moss: 0.12,
    gesture: 'umbrella', crownWidth: .42, asym: .2, notches: 0, massVar: .4,
    height: 13, trunkRadius: .46, trunkFrac: .72, lean: 0.14, flare: .4, levels: 3, children: 6, childAngle: 42, lengthRatio: .75,
    childStart: .2, gnarl: .1, upward: 0, crown: 'umbrella',
    clumpRadius: 1.2, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .8, squash: 0.3, massBlend: 0.5, cardSize: 0.81, coverage: 1.6, core: true,
    strokeAngle: 80, brushWidth: .5, strokeJitter: 24, leaf: 'round', edge: 'round', palette: ['#123838', '#245e42', '#4a8a50', '#88ba66'], bark: ['#2c2420', '#553c2a', '#8a6038', '#d0a870'], ground: MEADOW, sss: '#a8d07a', rim: '#84c473', fleck: .3,
  },
  'Garden tree': {
    crownBlend: .2, ownBough: 1, clotheRad: .1, shell: .55, lobes: 8, tighten: .1,
    cover: .8, crownLine: 0.24,
    forms: ['dome', 'ovate', 'cloud'],
    boughGap: .55,
    sideShoots: 3, variety: 1.2,
    forkTop: 1,
    limbRatio: .55, limbRise: 34,
    stemVar: 1.3,
    leader: .8,
    shelves: 5,
    stems: 2.3, forkHeight: .07, stemSpread: 24, sinuous: .4, ivy: .3, moss: .55,
    gesture: 'dome', crownWidth: .5, asym: .24, notches: 1, massVar: .6,
    height: 7.5, trunkRadius: .32, trunkFrac: .32, lean: .05, flare: .8, levels: 2, children: 5, childAngle: 42, lengthRatio: .78,
    childStart: .45, gnarl: .12, upward: 0, crown: 'vase',
    clumpRadius: .85, clumpVar: .45, clumpsPerTip: 1.2, clumpSpacing: .85, squash: .72, massBlend: .6, cardSize: .65, coverage: 1.4, core: true, lift: 1.3,
    leaf: 'round', edge: 'pointed', palette: ['#1e4430', '#30743c', '#62a44a', '#90c666'], bark: BARK, ground: MEADOW, sss: '#b0d470', rim: '#84c473', fleck: .35,
  },
  'Japanese cedar': {
    ownBough: 1, shell: .6, lobes: 14, tighten: .15,
    cover: .8, crownLine: 0.24,
    maxLimb: .14, arch: .03,
    whorls: 4, sideShoots: 2,
    leader: .5,
    limbRatio: 0.28,
    stemVar: 0,
    stems: 1, forkHeight: 0.1,
    boughGap: .2, topClump: .5,
    limbRise: 0,
    shelves: 12,
    sinuous: .08, ivy: .15,
    moss: 0.5,
    gesture: 'tiers', crownWidth: .15, asym: .08, notches: 0, massVar: .2,
    height: 16, trunkRadius: .42, trunkFrac: .83, lean: .02, flare: .7, levels: 2, children: 48, childAngle: 74, lengthRatio: .46,
    childStart: .16, gnarl: .05, upward: .0, droop: .06, crown: 'cone',
    clumpRadius: .62, clumpVar: .3, clumpsPerTip: 1.4, clumpSpacing: .5, squash: .7, massBlend: .4, crownBlend: .25, cardSize: .8, coverage: 1.5, core: true, lift: 0.6,
    strokeAngle: 70, strokeJitter: 30, leaf: 'pointed', edge: 'pointed', palette: ['#10343a', '#1d5440', '#387a50', '#7ab068'], bark: ['#262220', '#443428', '#785a40', '#bc9a72'], ground: MEADOW, sss: '#a8d07a', rim: '#84c473', fleck: .2,
  },
  'Weeping willow': {
    keepWood: 2,
    forkAngle: 34, variety: 1.1,
    forkTop: 1, arch: .08,
    limbRise: 42, leader: .55,
    limbRatio: .5,
    stemVar: 1.8,
    forkHeight: .17, stemSpread: 26,
    gesture: 'dome', crownWidth: .48,
    stems: 1.9, sinuous: .4, ivy: .2,
    moss: 0.65,
    height: 11.5, trunkRadius: .62, trunkFrac: .36, lean: .1, flare: 0.6, levels: 3, children: 7, childAngle: 46, lengthRatio: .85,
    childStart: .6, gnarl: .13, upward: .03, droop: .03, crown: 'dome',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .45, clumpSpacing: 1.0, squash: .62, massBlend: .55, cardSize: 0.95, coverage: 0.7, core: false,
    hang: 2.6, strandLength: .6, lift: 2.4, brushWidth: 0.3, strokeJitter: 16,
    leaf: 'willow', edge: 'spray', palette: ['#24482c', '#3d783c', '#78aa48', '#a8cc68'], bark: BARK, ground: MEADOW, sss: '#c0d47a', rim: '#9ac878', fleck: .25,
  },
  'Round bush': {
    crownBlend: .2, ownBough: 1, lobes: 6, tighten: .2,
    cover: 1, crownLine: 0.03,
    lift: .4,
    limbRise: 36, limbRatio: .6,
    boughGap: .66, maxLimb: .6,
    stemVar: 1.2,
    shelves: 0,
    stemSpread: 35,
    forkHeight: .08,
    stems: 2.7,
    moss: 0.2,
    gesture: 'mound', crownWidth: .6, asym: .2, notches: 0, massVar: .5,
    height: 2.2, trunkRadius: .12, trunkFrac: .34, lean: .1, flare: .3, levels: 3, children: 7, childAngle: 34, lengthRatio: .8,
    childStart: .5, gnarl: .1, upward: .05, crown: 'dome',
    clumpRadius: .7, clumpVar: .4, clumpsPerTip: .8, clumpSpacing: .5, squash: .8, massBlend: .5, cardSize: .55, coverage: 1, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#18442e', '#2c6c3c', '#589a48', '#8ac064'], bark: BARK, ground: MEADOW, sss: '#b0d470', rim: '#84c473', fleck: .5,
  },
}

// The trees of Japanese landscapes, each built from its nearest relative above and then given its own habit.
const GREY_BARK = ['#24282a', '#454a4a', '#7a7c72', '#b4b2a0']
Object.assign(SPECIES, {
  // Softer and broader than cedar, on a straight trunk, with spreading limbs ending in drooping sprays and glossy dark leaf
  'Hinoki cypress': { ...SPECIES['Japanese cedar'], height: 14, trunkRadius: .38, crownWidth: .22, whorls: 0, cover: 1, children: 40, sideShoots: 3, childAngle: 68, droop: .1, arch: .06, lobes: 9, gesture: 'ovate', crown: 'oval', clumpRadius: .85, squash: .7,
    edge: 'spray', palette: ['#0e3034', '#17503c', '#2f7a4e', '#68a862'], bark: ['#2a1c18', '#553226', '#8e5a40', '#c89a78'] },
  // Irregular and heavy: a curved, often divided trunk, a dense dome or flat crown, long sinuous limbs and dark fissured bark
  'Japanese black pine': { ...SPECIES['Stone pine'], keepWood: 2, clumpsPerTip: 1.3, height: 11, trunkRadius: .54, stems: 1.7, stemVar: 1.4, forkHeight: .3, trunkFrac: .5, sinuous: .9, lean: .24, windLean: .15, gnarl: .18, gesture: 'cloud', crown: 'dome', crownWidth: .5, asym: .36, shelves: 5, lobes: 9, squash: .38, clumpRadius: 1.15, lift: 1.2,
    palette: ['#0c2e30', '#184c3c', '#2e7048', '#5e9c58'], bark: ['#1e2022', '#3a3c3e', '#66665e', '#9c9a8c'] },
  // Taller and more open, straight to contorted, with an umbrella of lighter leaf and plated red-brown bark
  'Japanese red pine': { ...SPECIES['Stone pine'], height: 13, trunkRadius: .36, stems: 1.5, stemVar: 1.2, forkHeight: .42, trunkFrac: .62, sinuous: .6, lean: .2, gnarl: .13, crownWidth: .5, asym: .3, shelves: 4, lobes: 6,
    palette: ['#143a38', '#285e44', '#4e9050', '#90c068'], bark: ['#3a1e16', '#7c3c24', '#b86a3c', '#e4a874'] },
  // One leader with long, angular, rather erratic limbs: slender and sparse when young, broader with age. Painted in its autumn gold, the way Japan knows it
  'Ginkgo': { ...SPECIES['English oak'], keepWood: 2, cover: .7, height: 13, trunkRadius: .44, stems: 1, stemVar: 0, forkTop: 0, leader: 1.1, forkHeight: .1, trunkFrac: .22, sinuous: .12, gnarl: .1, windLean: 0, lean: .05, children: 9, sideShoots: 4, childAngle: 46, lengthRatio: .72, childStart: .3, limbRise: 32, maxLimb: .24, crownWidth: .3, clumpsPerTip: 1.1, gesture: 'ovate', crown: 'oval', clumpRadius: 1.15, lobes: 9, moss: .2, ivy: 0,
    palette: ['#9a6a1e', '#d09a2a', '#f0c63e', '#ffe680'], bark: GREY_BARK, hueVar: .3, sss: '#ffe07a', rim: '#ffe89a' },
  // A short trunk dividing low into many ascending limbs: a vase that broadens into a wide round head of fine leaf
  'Japanese zelkova': { ...SPECIES['English oak'], keepWood: 2, cover: .6, height: 11, trunkRadius: .5, stems: 2.2, stemVar: 1, forkHeight: .14, trunkFrac: .3, forkAngle: 24, stemSpread: 22, sinuous: .2, gnarl: .1, windLean: 0, lean: .05, children: 6, sideShoots: 3, childAngle: 34, lengthRatio: .85, childStart: .35, limbRise: 46, upward: .03, crownWidth: .55, gesture: 'dome', crown: 'vase', clumpRadius: 1.2, cardSize: .8, coverage: 1.2, lobes: 10, ivy: .1, moss: .3,
    palette: ['#174236', '#2a7044', '#5ca04c', '#98cc68'], bark: GREY_BARK },
})

// Sets how big each shape really stands, calibrated so the finished tree measures its open-grown mature height in metres.
const MATURE = { 'Camphor tree': 21.5, 'English oak': 22, 'Lombardy poplar': 27, 'Yoshino cherry': 10, 'Japanese maple': 6.5, 'Stone pine': 19, 'Japanese cedar': 30, 'Weeping willow': 17, 'Hinoki cypress': 27, 'Japanese black pine': 25, 'Japanese red pine': 25, 'Ginkgo': 26, 'Japanese zelkova': 24 }
// Crown envelopes, read off the reference photos: spread over height, and how far up the crown it is widest.
const ENVELOPE = { 'English oak': [1.35, .38, 0, 1.7], 'Camphor tree': [1.4, .34, 0, 1.9], 'Japanese zelkova': [1.2, .7, 0, 1.2], 'Ginkgo': [.74, .3, 0, 1.15], 'Yoshino cherry': [1.4, .42, 0, 1.9], 'Japanese maple': [1, .4, 0, 1.25], 'Garden tree': [.95, .4, 0, 1.5], 'Japanese cedar': [.42, .12, .9], 'Hinoki cypress': [.52, .14, .7], 'Lombardy poplar': [.26, .28, .7], 'Stone pine': [.72, .42, 0, 2.6], 'Japanese black pine': [1.05, .42, 0, 2], 'Japanese red pine': [1, .45, 0, 1.7] }
for (const k in ENVELOPE){ SPECIES[k].envW = ENVELOPE[k][0]; SPECIES[k].envPeak = ENVELOPE[k][1]; SPECIES[k].envCone = ENVELOPE[k][2] ?? 0; SPECIES[k].envTop = ENVELOPE[k][3] ?? 2; SPECIES[k].envHeart = .7 }
SPECIES['Japanese black pine'].envHeart = SPECIES['Japanese red pine'].envHeart = 0     // open-layered: pines keep their gaps
Object.assign(SPECIES['Stone pine'], { crownLine: .6 }); Object.assign(SPECIES['Japanese red pine'], { crownLine: .45 }); Object.assign(SPECIES['Japanese black pine'], { crownLine: .3 })
// Colour forms: share of seeds, and palette from deepest shadow to brightest light. Everything else takes the species' usual colour.
const COLORS = {
  'Yoshino cherry': [{ name: 'white', share: .45, palette: ['#b08ca2', '#e2c8d2', '#f8eeee', '#fffdf6'] }, { name: 'deep pink', share: .2, palette: ['#9c4a78', '#d4749e', '#f2a2bc', '#ffd0dc'] }],
  'Japanese maple': [{ name: 'wine', share: .34, palette: ['#34122a', '#641c36', '#963044', '#c8625a'] }, { name: 'scarlet', share: .26, palette: ['#681a24', '#ac2a2a', '#e04c2e', '#ff9656'] }, { name: 'summer green', share: .14, palette: ['#1e4a2e', '#3a7a3c', '#74ae48', '#b4d868'] }],
  'Ginkgo': [{ name: 'summer green', share: .25, palette: ['#1f5034', '#3a8044', '#74b050', '#b8d870'] }],
  'Japanese zelkova': [{ name: 'autumn rust', share: .28, palette: ['#642f20', '#a45426', '#d48436', '#eeb85e'] }],
  'Camphor tree': [{ name: 'spring flush', share: .25, palette: ['#1c4a30', '#3a7c3c', '#80b048', '#c4dc70'] }],
  'English oak': [{ name: 'autumn russet', share: .2, palette: ['#46381c', '#7a6028', '#b08e3a', '#d8bc64'] }],
  'Weeping willow': [{ name: 'autumn gold', share: .2, palette: ['#3e5a24', '#6e8c34', '#a8b848', '#dcd870'] }],
  'Garden tree': [{ name: 'plum', share: .25, palette: ['#2c1c30', '#54283e', '#84404e', '#b8786a'] }],
}
for (const k in SPECIES) SPECIES[k].colors = COLORS[k] ?? null
// Bark: palette, then pattern size, how far it runs along the wood, fissures, plates, and bands across the trunk
const BARKS = {
  'English oak': [['#1c1a16', '#3a342a', '#6a6050', '#a09682'], 1.3, 1, 1.4, .6, 0],
  'Camphor tree': [['#221c16', '#42382c', '#6e6048', '#a89878'], 1.4, 1.4, 1.2, .3, 0],
  'Japanese zelkova': [['#2c2a26', '#55524a', '#8a8676', '#c4bca4'], .9, .9, .3, .5, 0],
  'Ginkgo': [['#262420', '#4a453a', '#7a7262', '#aea48e'], 1.2, 1.8, 1.3, .2, 0],
  'Yoshino cherry': [['#1e1418', '#40262a', '#6e4440', '#a87c6c'], 1, .8, .2, 0, 1],
  'Japanese maple': [['#2a3030', '#4c5450', '#7c847a', '#b4baa8'], .8, 1.2, .15, 0, 0],
  'Stone pine': [['#1e1612', '#3c2a20', '#62483a', '#927258'], .8, 1, .9, 1, 0],
  'Japanese black pine': [['#18181a', '#323234', '#5a5a58', '#8e8c84'], 1, 1.1, 1.3, .9, 0],
  'Japanese red pine': [['#3a1c14', '#7e3a22', '#bc6a3a', '#eeb080'], .8, 1, .7, 1, 0],
  'Japanese cedar': [['#241814', '#4e2e20', '#86563a', '#bc8a66'], 1.6, 3, 1.2, 0, 0],
  'Hinoki cypress': [['#2a1a16', '#583226', '#925e44', '#c8987a'], 1.6, 3, 1, 0, 0],
  'Lombardy poplar': [['#20201c', '#3e3e36', '#6e6e5e', '#a4a490'], 1.2, 1.6, 1.6, .4, 0],
  'Garden tree': [BARK, 2.6, 1.4, 1, .2, 0],
  'Round bush': [BARK, 3.6, 1.4, 1, .2, 0],
  'Weeping willow': [['#1e1a14', '#3c3428', '#665a46', '#9a8c70'], 1.4, 1.2, 1.5, .8, 0],
}
for (const k in BARKS){ const [bark, barkScale, barkStretch, barkFurrow, barkPlates, barkBands] = BARKS[k]; Object.assign(SPECIES[k], { bark, barkScale, barkStretch, barkFurrow, barkPlates, barkBands }) }
// Lobe shapes: how each species masses its leaves. rough = knobbliness, point = tufts narrow upward (negative hangs), tilt = sprays lean from the trunk, stretch = lobe width and height
const LOBES = {
  'English oak': { lobeRough: 1.5, lobeStretch: [1, .9] },
  'Camphor tree': { lobeRough: .8, lobePoint: .1, lobeStretch: [1.12, .8] },
  'Japanese zelkova': { lobeRough: 1.1, lobePoint: .2, lobeStretch: [.95, 1.15] },
  'Ginkgo': { lobePoint: -.25, lobeTilt: -.25, lobeStretch: [.9, 1.12] },
  'Yoshino cherry': { lobeRough: .7, lobeTilt: -.15, lobeStretch: [1.2, .7] },
  'Japanese maple': { lobeRough: .6, lobeTilt: -.3, lobeStretch: [1.2, .6] },
  'Japanese cedar': { lobeRough: 1.2, lobePoint: .45, lobeStretch: [.9, 1.1], midSize: 1.8 },
  'Hinoki cypress': { lobePoint: .25, lobeTilt: -.35, lobeStretch: [1.15, .8], midSize: 1.8 },
  'Lombardy poplar': { lobePoint: .5, lobeStretch: [.7, 1.6], midSize: 1.8 },
  'Stone pine': { lobeRough: .5, lobeStretch: [1.2, .7] },
  'Japanese black pine': { lobeRough: .6, lobeTilt: -.1, lobeStretch: [1.2, .75] },
  'Japanese red pine': { lobeRough: .6, lobeStretch: [1.2, .75] },
  'Weeping willow': { midSize: 0 },
  'Round bush': { lobeRough: 1.2, midSize: 2 },
}
for (const k in LOBES) Object.assign(SPECIES[k], LOBES[k])
// a crown's edge is leaves, not a line: loose leaf-sized marks break the outline
for (const [k, v] of Object.entries({ 'English oak': .22, 'Camphor tree': .18, 'Japanese zelkova': .22, 'Ginkgo': .2, 'Yoshino cherry': .16, 'Japanese maple': .24, 'Garden tree': .22, 'Round bush': .18, 'Hinoki cypress': .14, 'Japanese cedar': .14, 'Lombardy poplar': .16 })) SPECIES[k].strays = v
Object.assign(SPECIES['Ginkgo'], { squash: .85, clumpRadius: 1, lobes: 14, tighten: .08, clumpVar: .6 })
Object.assign(SPECIES['Japanese maple'], { squash: .6, lobes: 16, tighten: .1, clumpVar: .55 })
Object.assign(SPECIES['English oak'], { stems: 1.3, stemVar: 1.1, maxLimb: .6, coverage: .9 })
Object.assign(SPECIES['Yoshino cherry'], { limbRise: 24, maxLimb: .5 })
Object.assign(SPECIES['Japanese zelkova'], { maxLimb: .55, coverage: .85 })
Object.assign(SPECIES['Ginkgo'], { maxLimb: .3, children: 11, coverage: 1 })
Object.assign(SPECIES['Japanese maple'], { maxLimb: .5, coverage: .9 })
Object.assign(SPECIES['Stone pine'], { keepWood: 1, children: 9, sideShoots: 4, stemVar: 1.2, clumpsPerTip: 1.8, shelves: 4, lobes: 7 })
Object.assign(SPECIES['Hinoki cypress'], { children: 56, lobes: 12, clumpRadius: .8 })
Object.assign(SPECIES['Japanese cedar'], { children: 60 })
Object.assign(SPECIES['Weeping willow'], { forkHeight: .26, trunkFrac: .44, clumpRadius: .9, clumpsPerTip: .6, forkAngle: 30, arch: .1 })
Object.assign(SPECIES['Lombardy poplar'], { fused: 1, fastigiate: 12, upward: .1 })
Object.assign(SPECIES['Round bush'], { forkHeight: .2 })
for (const k in MATURE) SPECIES[k].size = MATURE[k]/SPECIES[k].height
for (const k in SPECIES) SPECIES[k] = { ...DEFAULTS, ...SPECIES[k] }

export const CROWNS = ['dome', 'oval', 'column', 'cone', 'umbrella', 'vase']
export const BRUSHES = { 'Gouache blot': 'round', 'Jagged blot': 'pointed', 'Clover': 'clover', 'Leaf sprig': 'spray', 'Dry scumble': 'scumble', 'Sponge dots': 'blossom', 'Needle fan': 'needle', 'Long pull': 'willow', 'Maple leaf': 'maple', 'Cut-leaf maple': 'mapleCut' }

// Ring growth (prototype): each list is per level, trunk first. nodes = rings on an axis, ring = branches in a ring, angle = how far they leave it, len = length against the parent.
SPECIES['Lombardy poplar'].rings = { bare: .06, stems: [1, 1], spread: 0, tip: 'lead', nodes: [18, 2, 2], ring: [3, 1, 1], angle: [0, 18, 24, 26], len: [0, 0, .45, .45], start: [.04, .3, .3], skip: .12, width: .13, reach: .24, up: .1, levels: 2, gap: .06 }
SPECIES['English oak'].rings = { colonise: { pockets: 120, pocketTries: 400, pocketLook: 12, pocketSize: 2, pocketLeast: 35, pocketReach: 7, pocketGen: 6, holeWood: .25, holeReach: 2.5, fillTries: 900, fillMost: 200, fillReach: 2, fillFrom: 4, fillClaim: .9, fillLine: .78, fillOut: .6, highFrom: .5, highRise: .25, wideBelow: .55, crownLimbs: 4, droopSide: -.55, sag: .45, droopTip: -.75, core: 7, headway: .3, crook: .16, crookLen: .9, trunkRun: 8, trunkKink: .2, crownTop: .96, wideTo: 3, middle: .45, spread: [0, 0, .5, 1, 1.6, 2.4, 3, 3], clear: .08, girths: [.42, .24, .17, .12, .09, .07, .06, .05], share: .4, tip: .45, claim: .4, claimLeast: .25, claimMost: 1.2, follow: .3, most: 1400, leaderRun: 9, leaderKink: .34, points: 9000, step: .3, bottom: .15, leader: .6, droop: -.12, up: .1, lobes: .1, zig: .1, least: 1, thorn: 1, limbs: 19, limbTop: .9, limbLow: 58, limbHigh: 20, limbVar: 16, inset: .94, sideMin: 50, sideMax: 100, sun: 1.5, sunCell: 1.5, gens: [{ min: 48, max: 80 }, { min: 14, max: 34, fork: 2, sides: 2 }, { min: 14, max: 34, fork: 2, sides: 2 }, { min: 12, max: 30, fork: 2, sides: 2 }, { min: 10, max: 28, fork: 2, sides: 2 }, { min: 10, max: 26, fork: 2, sides: 1 }, { min: 8, max: 24, fork: 2, sides: 1 }, { min: 8, max: 24, fork: 2, sides: 0 }, { min: 8, max: 24, fork: 2, sides: 0 }] }, seek: 4, outline: [0.27,0.27,0.27,0.27,0.27,0.289,0.331,0.398,0.484,0.52,0.504,0.495,0.508,0.525,0.529,0.516,0.507,0.518,0.542,0.564,0.567,0.551,0.534,0.517,0.488,0.432,0.352,0.294,0.274,0.255,0.197,0.101,0], shell: .42, centre: .8, girth: .72, side: .5, bare: .14, stems: [1, 1], spread: 0, stemLen: .04, tip: 'fork', forkTo: 0, fill: .95, forks: [5, 6], forkAngle: 68, limbLen: .6, nodes: [0, 8, 5, 3], ring: [1, 1, 1, 1], angle: [0, 44, 46, 44], len: [0, 0, .7, .6], start: [.3, .1, .15, .2], skip: .12, width: .6, reach: .34, up: .007, kink: .34, levels: 3, gap: .05 }
// traced from an umbrella pine: a shallow dome over a concave underside, on a trunk that forks at half height
SPECIES['Stone pine'].rings = { ...SPECIES['English oak'].rings, outline: [0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.052,0.184,0.287,0.371,0.431,0.483,0.524,0.555,0.568,0.566,0.537,0.504,0.459,0.405,0.324,0.182,0.0], varK: .4, as: { lean: .03, squash: .6, crownLine: .46 }, girth: 1, bare: .4, colonise: { ...SPECIES['English oak'].rings.colonise, trunkKink: .13, leaderKink: .2, inset: .94, bottom: .46, leader: .5, crownTop: .99, middle: .4, limbs: 9, limbTop: .95, limbLow: 62, limbHigh: 34, crownLimbs: 5, sag: 0, wideBelow: 0, highFrom: .86, highRise: -.05, droopSide: -.25, droopTip: -.3 } }
// a test of the outline method: a heart, grown like an oak
SPECIES['Heart (test)'] = { ...SPECIES['English oak'], rings: { ...SPECIES['English oak'].rings, heart: true, slab: .1, as: { clumpRadius: .75 }, colonise: { ...SPECIES['English oak'].rings.colonise, bottom: .2, crownTop: 1, leader: .55, inset: 1, sag: 0, wideBelow: 0, highFrom: .7, middle: .45, droop: -.9, droopTip: -.9, droopSide: -.9, highRise: -.9, limbLow: 95, limbHigh: 15 } } }
// traced from a Lombardy poplar: a narrow column, branched from near the ground, its limbs running up almost parallel with the trunk
SPECIES['Lombardy poplar'].rings = { ...SPECIES['English oak'].rings, outline: [0.0,0.0,0.012,0.038,0.06,0.081,0.101,0.121,0.138,0.14,0.142,0.144,0.146,0.146,0.147,0.147,0.147,0.145,0.143,0.141,0.139,0.137,0.135,0.127,0.119,0.111,0.102,0.093,0.083,0.071,0.057,0.028,0.0], varK: .4, as: { lean: .012, crownLine: .05, squash: 1.1, lobeStretch: [.95, 1.15], lobePoint: .15, clumpRadius: .55 }, girth: 1, bare: .05, colonise: { ...SPECIES['English oak'].rings.colonise, trunkKink: .05, leaderKink: .08, leaderRun: 12, inset: .9, bottom: .08, claim: .25, claimMost: .45, pocketReach: 4, pocketSize: 1.3, pocketLeast: 20, leader: .94, crownTop: 1, middle: .3, spread: [0, 0, .1, .15, .2, .3, .4, .4], limbs: 40, limbTop: .92, limbLow: 26, limbHigh: 12, crownLimbs: 0, sag: 0, wideTo: 0, wideBelow: 0, highFrom: 2, droop: 0, droopSide: 0, droopTip: -.2, highRise: 0, core: 1.5, headway: 0, share: .25, longest: 2.6, shrink: .85, girths: [.18, .12, .09, .07, .06, .05, .05, .05], clear: .03, sun: .6, gens: [{ min: 14, max: 30 }, { min: 10, max: 24, fork: 2, sides: 2 }, { min: 10, max: 26, fork: 2, sides: 2 }, { min: 12, max: 28, fork: 2, sides: 2 }, { min: 12, max: 28, fork: 2, sides: 2 }, { min: 12, max: 30, fork: 2, sides: 1 }, { min: 12, max: 30, fork: 2, sides: 1 }, { min: 12, max: 30, fork: 2, sides: 0 }] } }

// (its unit is the scale its growth was tuned at, held fixed: the tree's size already scales it, so a change of size keeps every proportion)
// traced from a Japanese maple: a low wide dome, leaves almost to the ground, on a trunk that splits into stems at a fifth of its height
SPECIES['Japanese maple'].rings = { ...SPECIES['English oak'].rings, outline: [0,0,0.3,0.485,0.529,0.53,0.532,0.521,0.495,0.454,0.445,0.499,0.543,0.549,0.564,0.59,0.592,0.571,0.534,0.492,0.474,0.496,0.54,0.557,0.541,0.516,0.477,0.42,0.366,0.327,0.254,0.093,0], unit: .386, varK: .5, girth: 1, slender: .65, finest: .35, bare: .19, leafFloor: .05, tiers: { count: 5, gap: .4, wobble: .2, flat: .5, clear: true }, as: { leaf: 'pointed', edge: 'maple', split: .6, trunkBow: .12, alpha: 2.3, clumpRadius: .7, cover: .65, crownLine: .25, stems: 2.4, stemVar: 1, stemSpread: 32, shelves: 0, squash: .45, lobeStretch: [1.4, .5], lobeWide: 1.4, lobeDrape: .45, lobeTilt: -.4, cardSize: .45, plateSize: .6, midSize: 2, lobeFollow: .6 }, colonise: { ...SPECIES['English oak'].rings.colonise, inset: .88, bottom: .06, leader: .6, crownTop: .99, middle: .4, trunkKink: .3, leaderKink: .55, leaderRun: 6, limbLow: 85, limbHigh: 45, droop: -.35, droopTip: -.45, droopSide: -.8, sag: .9, wideBelow: .6, highRise: -.05, up: -.1, sun: .5, crook: .07, level: .8, splits: [{ at: .4, n: [2, 3], spread: 26 }], centralStem: true, limbs: 12, crownLimbs: 3, order: .8, longest: 7, shrink: .75, pockets: 40, fillMost: 50, thorn: 5, limbFrom: .25, runMost: 6, spread: [0, 0, .3, .6, 1, 1.4, 1.6, 1.6] } }
// traced from a Yoshino cherry: a broad flat-topped canopy half again as wide as tall, its skirt low on one side, on a trunk that divides almost at the ground into
// three or four stems leaning out wide, which divide again a little higher. (Its unit is held fixed, as the maple's is, so a change of size keeps every proportion.)
SPECIES['Yoshino cherry'].rings = { ...SPECIES['English oak'].rings, outline: [0.004,0.1,0.394,0.721,0.862,0.864,0.864,0.868,0.876,0.882,0.885,0.886,0.887,0.889,0.89,0.892,0.894,0.888,0.864,0.822,0.765,0.697,0.643,0.618,0.606,0.591,0.571,0.547,0.517,0.481,0.44,0.389,0], unit: .4, varK: .5, girth: 1, slender: .75, finest: .4, bare: .07, leafFloor: .05, crownOnly: true,
  as: { trunkFrac: .12, split: .7, clotheFrom: 0, clotheCarriers: true, clotheRoom: 30, ride: .9, squash: .42, clotheGap: 1.6, keepGaps: true, bareLimbs: .15, whip: 2, longRun: 2.5, stems: 3.2, stemVar: 1, stemSpread: 26, trunkBow: .1, alpha: 2.3, crownLine: .18, lobeAlong: 2.6, clumpRadius: .55, clumpsPerTip: 1.2, lobePoint: .45, strays: .45, cover: .6 },
  colonise: { ...SPECIES['English oak'].rings.colonise, inset: .9, bottom: .06, leader: .55, crownTop: .99, middle: .4, trunkKink: .3, leaderKink: .45, leaderRun: 6,
    splits: [{ at: .26, n: [2, 3], spread: 18 }], centralStem: true, limbs: 14, crownLimbs: 3, limbFrom: .18, limbLow: 82, limbHigh: 45, order: .6, longest: 8, shrink: .78, runMost: 8, thorn: 4,
    sag: .7, wideBelow: .5, droop: -.25, droopTip: -.6, droopSide: -.7, sun: 1, pockets: 0, fillMost: 0, runMost: 7, runIn: 14, runFork: 6, thorn: 0,
    // self-organising growth (Pałubicki et al. 2009): buds compete for the crown's space, resource split by apical control; stems, limbs and spacing emerge
    selfOrg: { internode: .04, occupy: 2, perceive: 5, angle: 90, branch: 45, lambda: .52, vigor: 2, maxShoot: 4, env: .3, tropism: .1, years: 30, noReturn: .2 } } }
// Every tree grows into an outline. Species with no traced outline yet take one from their crown numbers, and the oak's growth at their own scale.
for (const [name, sp] of Object.entries(SPECIES)){
  if (sp.rings?.colonise || name === 'Round bush') continue
  const low = Math.min(sp.crownLine ?? .25, .75), peak = sp.envPeak ?? .4, half = (sp.envW || .95)*.42, cone = sp.envCone ?? 0, topK = sp.envTop ?? 1.6
  const outline = Array.from({ length: 33 }, (_, i) => { const t = i/32, u = (t - low)/(1 - low); if (u <= 0) return 0
    const w = cone ? Math.max(1 - u, 0)**Math.min(cone, 1.4) : u < peak ? Math.sqrt(1 - ((peak - u)/peak)**2) : Math.max(1 - ((u - peak)/(1 - peak))**2, 0)**(1/topK)
    return +(half*w).toFixed(3) })
  const o = SPECIES['English oak'].rings, tall = cone > 0
  sp.rings = { ...o, outline, unit: Math.min(Math.max(sp.height*sp.size/22, .3), 1), bare: low*.8, girth: 1, colonise: { ...o.colonise, bottom: low, leader: tall ? .95 : Math.max(.6, low + .25), crownTop: .98, crownLimbs: tall ? 0 : 4, limbs: tall ? 34 : 25, limbLow: tall ? 75 : 58, limbHigh: tall ? 35 : 20 } }
}
// Self-organising growth for every outline-grown tree (the cherry's model): buds compete for the crown's space (Pałubicki et al. 2009), the outline is the crown alone,
// sitting on a bare trunk that runs up to where it begins, and the same clean-ups keep the wood honest. Only what makes a species itself is set per tree below
export const SELF_ORG = { internode: .04, occupy: 2, perceive: 5, angle: 90, branch: 45, lambda: .52, vigor: 2, maxShoot: 4, env: .3, tropism: .1, years: 30, noReturn: .2, outward: 50 }
const OWN_GROWTH = {
  // conifers and columns: a strong leader keeps its lead (apical control), shoots turn up
  // sugi: short limbs held out level from a dead-straight leader; hinoki the same, but its sprays droop at the tips
  'Japanese cedar': { lambda: .66, branch: [60, 72, 55], level: [0, .6, .4], tropism: [.4, -.04, .04] }, 'Hinoki cypress': { lambda: .64, branch: [60, 75, 60], level: [0, .5, .45], tropism: [.35, -.15, -.12] },
  'Lombardy poplar': { lambda: .6, tropism: .6, branch: 25 }, // ginkgo: long, few limbs held out at odd angles, so the crown is lopsided and open
  'Ginkgo': { lambda: .58, branch: [40, 55, 50], level: [0, .25, .2], tropism: [.2, .05, .05], wiggle: [.02, .08, .1] },
  // Japanese maple: the trunk ends at once in a crown of stems that lean out into a vase; their outer shoots spread level, so the leaves lie in layers
  'Japanese maple': { multiStem: true, level: [0, 0, .25, .35] },
  // zelkova: the trunk divides low into many steep stems that fan into a vase
  'Japanese zelkova': { lambda: .48, branch: [25, 28, 40], tropism: [.3, .25, .1], multiStem: true },
  // willow: limbs climb and arch over, and every shoot beyond them hangs - the weeping is in the wood
  'Weeping willow': { lambda: .5, branch: [40, 38, 45], tropism: [.2, .02, -.5, -.9] },
  // oak: a short trunk under a few massive limbs that spread wide and low, crooked at every step
  'English oak': { lambda: .46, branch: [55, 52, 45], level: [0, .45, .2], tropism: [.1, -.04, .05], wiggle: [.05, .25, .2] },
  // camphor: a short trunk splitting into broad spreading limbs under a wide dome
  'Camphor tree': { lambda: .48, branch: [40, 45, 45], level: [0, .3, .15], tropism: [.1, .05, .05], wiggle: [.03, .1, .1] },
  // pines: a strong leader that puts out a ring of limbs at the end of each year's growth; the limbs run out level, crooked on the black pine, and their own shoots spread flat into pads
  'Japanese black pine': { outward: [0, 50, 75], lambda: .62, whorl: { count: 4, upTo: 1 }, branch: [45, 80, 55], level: [0, .75, .65, .55], tropism: [.15, 0, 0], wiggle: [.03, .15, .2] },
  'Japanese red pine': { outward: [0, 50, 75], lambda: .62, whorl: { count: 4, upTo: 1 }, branch: [45, 75, 55], level: [0, .7, .6, .5], tropism: [.2, .02, 0], wiggle: [.01, .04, .06], env: .18 },
  // the stone pine loses its leader: a few stout limbs climb steeply out of the trunk's top and keep forking, so the crown opens into an umbrella
  'Stone pine': { lambda: .45, branch: [30, 38, 50], tropism: [.2, .12, 0], level: [0, .15, .5] } }
// how a species carries its leaves, where it differs from the shared clean-up (pines: pads at the ends of flat shoots, not one cloud)
const OWN_LOOK = { 'Japanese black pine': { shelves: 0, clumpRadius: .6, clumpsPerTip: 1.1, squash: .4, trunkBow: .3 }, 'Japanese red pine': { shelves: 0, clumpRadius: .8, clumpsPerTip: 1.8, squash: .4, trunkBow: .2 },
  'Japanese zelkova': { split: .85, stems: 4.5, stemSpread: 22, keepGaps: true, lobeAlong: 1.6, notches: 2, asym: .3 }, 'Garden tree': { keepGaps: true, lobeAlong: 1.4, notches: 2, asym: .3 },
  'Ginkgo': { shelves: 0, clumpRadius: .75, clumpsPerTip: .9, squash: .6, keepGaps: true, clotheGap: 1.8, notches: 3, asym: .4, lobeAlong: 2 }, 'Japanese maple': { split: .7, stems: 3.4, stemSpread: 30 }, 'Camphor tree': { split: .5, massVar: .8, notches: 2, asym: .35, keepGaps: true, lobeAlong: 1.5 }, 'English oak': { split: .3, massVar: .8, notches: 3, asym: .4, keepGaps: true } }
for (const [name, sp] of Object.entries(SPECIES)){
  const g = sp.rings, c = g?.colonise
  if (!c || c.selfOrg || g.heart) continue
  // the outline from where the crown begins (its old bottom) to the top, re-spread over the whole list: the crown alone, at the same width
  // (and never below the outline's first width: rows of nothing would leave the leader no room to climb)
  const O = g.outline, n = O.length - 1, low = Math.min(Math.max(c.bottom, (Math.max(O.findIndex(v => v > .02), 1) - 1)/n), .8), at = t => { const u = t*n, i = Math.min(Math.floor(u), n - 1); return O[i] + (O[i + 1] - O[i])*(u - i) }
  const outline = Array.from({ length: 33 }, (_, i) => i === 32 ? 0 : +(at(low + i/32*(1 - low))/(1 - low)).toFixed(3))
  const H = sp.height*(sp.size ?? 1)
  sp.rings = { ...g, outline, crownOnly: true, leafFloor: Math.min(.05, low),
    as: { ...g.as, ...OWN_LOOK[name], trunkFrac: low, clotheFrom: 0, clotheCarriers: true, clotheRoom: 30, bareLimbs: .15, whip: +(H*.2).toFixed(1), longRun: +(H*.25).toFixed(1) },
    colonise: { ...c, pockets: 0, fillMost: 0, runMost: 7, runIn: 14, runFork: 6, thorn: 0, selfOrg: { ...SELF_ORG, ...OWN_GROWTH[name] } } }
}
// Mature proportions, from field guides for open-grown trees: crown spread in metres, and the clear trunk below the crown as a share of height.
// The outline keeps its shape and is scaled to the spread; the crown sits on that much bare trunk
const SPREAD = { 'English oak': 28, 'Camphor tree': 28, 'Japanese zelkova': 24, 'Ginkgo': 15, 'Stone pine': 20, 'Hinoki cypress': 11 }
const CLEAR = { 'Camphor tree': .15, 'Japanese zelkova': .14, 'Weeping willow': .15 }
// the zelkova's crown is a fan: from a point on the trunk its stems spread in a straight-sided V and round over at the top
const FAN = Array.from({ length: 33 }, (_, i) => { const u = i/32; return i === 32 ? 0 : +(u < .7 ? .06 + .94*u/.7 : Math.sqrt(Math.max(1 - ((u - .7)/.3)**2, 0))).toFixed(3) })
for (const [name, sp] of Object.entries(SPECIES)){ const g = sp.rings; if (!g?.crownOnly) continue
  let outline = name === 'Japanese zelkova' ? FAN : g.outline
  const low = CLEAR[name] ?? g.as.trunkFrac, H = sp.height*(sp.size ?? 1), CH = H*(1 - low)
  // (.73: the crown's lobes, lean and leaf clumps carry it about a third past its outline's own width, measured over the species)
  if (SPREAD[name]) { const k = .73*SPREAD[name]/(2*Math.max(...outline)*CH); outline = outline.map(v => +(v*k).toFixed(3)) }
  sp.rings = { ...g, outline, as: { ...g.as, trunkFrac: low } } }
// trunks calibrated to the girth at breast height of a mature tree of each kind (the black pine was near three times too stout); the multiplier scales the whole tree's wood with it
const GIRTH = { 'Camphor tree': .72, 'English oak': 1.05, 'Lombardy poplar': .72, 'Yoshino cherry': .71, 'Stone pine': .76, 'Garden tree': .7, 'Japanese cedar': .82,
  'Weeping willow': .65, 'Hinoki cypress': .65, 'Japanese black pine': .39, 'Japanese red pine': .56, 'Ginkgo': .68, 'Japanese zelkova': .66 }
for (const [name, k] of Object.entries(GIRTH)) if (SPECIES[name].rings) SPECIES[name].rings = { ...SPECIES[name].rings, girth: (SPECIES[name].rings.girth ?? 1)*k }
// what each recipe leaves its species set to, and its own settings as that species' starting point: sliders and seeds are measured against these
for (const sp of Object.values(SPECIES)) if (sp.rings){
  Object.assign(sp, sp.rings.as); if (sp.rings.varK) sp.variety *= sp.rings.varK
  sp.lean = 0                                                           // trees stand upright on their centre line unless the Lean slider says otherwise
  sp.rings.base = { crownWidth: sp.crownWidth, trunkFrac: sp.trunkFrac, sinuous: sp.sinuous, gnarl: sp.gnarl, childAngle: sp.childAngle, lengthRatio: sp.lengthRatio, children: sp.children, upward: sp.upward, droop: sp.droop }
}
