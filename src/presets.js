// Species table. Each preset is a complete, tunable parameter set: seeds vary a tree, presets change what it is.
const MEADOW = ['#25664f', '#2f8a54', '#5cb35c', '#aedb74']
const BARK = ['#2e4240', '#465444', '#74705a', '#c8bc96']

const DEFAULTS = { gesture: 'free', crownWidth: .5, asym: .22, windLean: 0, notches: 1, massVar: .5, plateSize: 1, plates: 3.5, crownBlend: .55, strays: 0, edge: 'round', hang: 0, lift: 1, droop: 0, strandLength: .9, brushWidth: .85, strokeAngle: 0, strokeJitter: 70 }

export const SPECIES = {
  'Great camphor': {
    gesture: 'dome', crownWidth: .66, asym: .26, notches: 2, massVar: .6,
    height: 12, trunkRadius: .82, trunkFrac: .36, lean: .06, flare: 1.0, levels: 3, children: 5, childAngle: 46, lengthRatio: 1.15,
    childStart: .6, gnarl: .15, upward: .05, crown: 'dome',
    clumpRadius: 1.75, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .72, squash: .78, massBlend: .72, lift: 1.65, cardSize: 0.96, coverage: 1.5, core: true,
    leaf: 'round', edge: 'round', palette: ['#1c4348', '#3a6a62', '#6c9a66', '#a8c488'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .45,
  },
  'Hilltop oak': {
    gesture: 'windswept', crownWidth: .62, asym: .3, windLean: .32, notches: 3, massVar: .6,
    height: 8.5, trunkRadius: .7, trunkFrac: .36, lean: .12, flare: 1.1, levels: 3, children: 5, childAngle: 50, lengthRatio: .92,
    childStart: .55, gnarl: .22, upward: .04, crown: 'umbrella',
    clumpRadius: 1.5, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .72, squash: .68, massBlend: .72, lift: 1.5, cardSize: 0.90, coverage: 1.5, core: true,
    leaf: 'round', edge: 'round', palette: ['#204646', '#426e60', '#7a9e60', '#b4c882'], bark: BARK, ground: MEADOW, sss: '#e4f27a', rim: '#d6f08a', fleck: .55,
  },
  'Poplar': {
    gesture: 'flame', crownWidth: .15, asym: .12, notches: 0, massVar: .3,
    height: 16, trunkRadius: .34, trunkFrac: .72, lean: .02, flare: .5, levels: 3, children: 7, childAngle: 20, lengthRatio: .5,
    childStart: .15, gnarl: .1, upward: .09, crown: 'column',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .75, squash: 1.25, massBlend: .6, cardSize: 0.70, coverage: 1.6, core: true,
    leaf: 'round', edge: 'round', palette: ['#1a4048', '#346a68', '#62966c', '#a0c890'], bark: BARK, ground: MEADOW, sss: '#c8ff7a', rim: '#a8f0a0', fleck: .4,
  },
  'Sakura': {
    gesture: 'cloud', crownWidth: .66, asym: .34, notches: 3, massVar: .7,
    height: 7.5, trunkRadius: .36, trunkFrac: .36, lean: .14, flare: .7, levels: 3, children: 5, childAngle: 58, lengthRatio: .8,
    childStart: .5, gnarl: .28, upward: .02, crown: 'umbrella',
    clumpRadius: 1.15, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .75, squash: .72, massBlend: .65, lift: 1.3, cardSize: 0.72, coverage: 1.5, core: true,
    leaf: 'round', edge: 'round', palette: ['#b4688e', '#e08eaa', '#f6b8ca', '#fff0ea'], bark: ['#40343a', '#5c4644', '#86625a', '#b49078'], ground: MEADOW, sss: '#ffc4c8', rim: '#ffd9e0', fleck: 0,
  },
  'Autumn maple': {
    gesture: 'ovate', crownWidth: .38, asym: .16, notches: 1, massVar: .4,
    height: 9, trunkRadius: .38, trunkFrac: .4, lean: .06, flare: .7, levels: 3, children: 6, childAngle: 46, lengthRatio: .68,
    childStart: .5, gnarl: .18, upward: .04, crown: 'oval',
    clumpRadius: 1.25, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .75, squash: .85, massBlend: .65, lift: 1.3, cardSize: 0.81, coverage: 1.5, core: true,
    strays: .14, leaf: 'pointed', edge: 'spray', palette: ['#7c3c3e', '#b84f34', '#ea8a40', '#ffdc76'], bark: BARK, ground: ['#6a6240', '#8e8244', '#bc9e4e', '#e8cf84'], sss: '#ffc25a', rim: '#ffcf80', fleck: .35,
  },
  'Stone pine': {
    gesture: 'umbrella', crownWidth: .52, asym: .2, notches: 1, massVar: .4,
    height: 12, trunkRadius: .36, trunkFrac: .68, lean: .1, flare: .4, levels: 3, children: 6, childAngle: 62, lengthRatio: .62,
    childStart: .72, gnarl: .16, upward: .05, crown: 'umbrella',
    clumpRadius: 1.35, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .8, squash: .42, massBlend: .25, cardSize: 0.81, coverage: 1.6, core: true,
    strokeAngle: 80, brushWidth: .5, strokeJitter: 24, leaf: 'round', edge: 'round', palette: ['#183c44', '#2e5e60', '#568a64', '#98ba84'], bark: ['#4a3a3a', '#6e4a3e', '#a0643e', '#d69a60'], ground: MEADOW, sss: '#c4f070', rim: '#b0f0a0', fleck: .3,
  },
  'Mountain cedar': {
    gesture: 'tiers', crownWidth: .32, asym: .12, notches: 0, massVar: .2,
    height: 16, trunkRadius: .42, trunkFrac: .86, lean: .02, flare: .7, levels: 2, children: 20, childAngle: 76, lengthRatio: .6,
    childStart: .1, gnarl: .07, upward: .0, droop: .04, crown: 'cone',
    clumpRadius: .85, clumpVar: .3, clumpsPerTip: 1.4, clumpSpacing: .5, squash: .55, massBlend: .4, crownBlend: .35, cardSize: .8, coverage: 1.5, core: true, lift: .3,
    strokeAngle: 70, strokeJitter: 30, leaf: 'pointed', edge: 'pointed', palette: ['#143c44', '#1d5a5c', '#3c8464', '#8cbc84'], bark: ['#3a2f30', '#54403a', '#7c5c48', '#b08c68'], ground: MEADOW, sss: '#c4f070', rim: '#b0f0a0', fleck: .2,
  },
  'Weeping willow': {
    height: 10, trunkRadius: .56, trunkFrac: .3, lean: .1, flare: .9, levels: 3, children: 7, childAngle: 46, lengthRatio: 1.0,
    childStart: .6, gnarl: .13, upward: .03, droop: .1, crown: 'dome',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .6, clumpSpacing: 1.0, squash: .62, massBlend: .55, cardSize: 0.95, coverage: 1.0, core: false,
    hang: 3, strandLength: .9, lift: 1.4, brushWidth: .46, strokeJitter: 16,
    leaf: 'willow', edge: 'spray', palette: ['#224a46', '#3e7262', '#78a45e', '#bccf86'], bark: BARK, ground: MEADOW, sss: '#e8f47a', rim: '#d6f08a', fleck: .25,
  },
  'Round bush': {
    gesture: 'mound', crownWidth: .95, asym: .2, notches: 1, massVar: .5,
    height: 2.2, trunkRadius: .1, trunkFrac: .25, lean: .1, flare: .3, levels: 2, children: 7, childAngle: 50, lengthRatio: 1.1,
    childStart: .25, gnarl: .2, upward: .05, crown: 'dome',
    clumpRadius: .8, clumpVar: .4, clumpsPerTip: 1.3, clumpSpacing: .6, squash: .8, massBlend: .5, cardSize: 0.52, coverage: 1.5, core: true,
    leaf: 'round', edge: 'round', palette: ['#1c4348', '#3a6a62', '#6c9a66', '#a8c488'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .5,
  },
}

for (const k in SPECIES) SPECIES[k] = { ...DEFAULTS, ...SPECIES[k] }

export const CROWNS = ['dome', 'oval', 'column', 'cone', 'umbrella', 'vase']
export const BRUSHES = { 'Gouache blot': 'round', 'Jagged blot': 'pointed', 'Clover': 'clover', 'Leaf sprig': 'spray', 'Dry scumble': 'scumble', 'Sponge dots': 'blossom', 'Needle fan': 'needle', 'Long pull': 'willow' }
