// Species table. Each preset is a complete, tunable parameter set: seeds vary a tree, presets change what it is.
const MEADOW = ['#1f6a4a', '#2f8f4e', '#66b54a', '#b0d868']
const BARK = ['#1e1e10', '#38391f', '#7a7044', '#b4b078']

const DEFAULTS = { hueVar: 1, boughGap: .66, shelves: 0, stems: 1, forkHeight: .12, stemSpread: 20, sinuous: .3, ivy: 0, roots: 1, moss: .5, gesture: 'free', crownWidth: .5, asym: .22, windLean: 0, notches: 1, massVar: .5, plateSize: 1, plates: 3.5, crownBlend: .55, strays: 0, edge: 'round', hang: 0, lift: 1, droop: 0, strandLength: .9, brushWidth: .85, strokeAngle: 0, strokeJitter: 70 }

export const SPECIES = {
  'Great camphor': {
    shelves: 5,
    sinuous: .5, ivy: .4,
    moss: 0.45,
    gesture: 'dome', crownWidth: 0.85, asym: .26, notches: 2, massVar: .6,
    height: 12, trunkRadius: 1.1, trunkFrac: 0.25, lean: .06, flare: 1.4, levels: 3, children: 5, childAngle: 46, lengthRatio: 1.15,
    childStart: .6, gnarl: .15, upward: .05, crown: 'dome',
    clumpRadius: 1.75, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .72, squash: .78, massBlend: .72, lift: 1.65, cardSize: 0.96, coverage: 1.5, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#143f3a', '#2a7040', '#5a9e4a', '#9ccf60'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .45,
  },
  'Hilltop oak': {
    shelves: 4,
    stems: 2, forkHeight: .16, stemSpread: 28, sinuous: .7, ivy: .3,
    moss: 0.8,
    gesture: 'windswept', crownWidth: .62, asym: .3, windLean: 0.45, notches: 3, massVar: 0.35,
    height: 8.5, trunkRadius: .7, trunkFrac: .36, lean: .12, flare: 1.1, levels: 3, children: 5, childAngle: 60, lengthRatio: .92,
    childStart: .55, gnarl: .22, upward: .04, crown: 'umbrella',
    clumpRadius: 1.5, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .72, squash: .68, massBlend: .72, lift: 1.5, cardSize: 0.90, coverage: 1.5, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#1c4226', '#33703a', '#649c44', '#a8d05c'], bark: BARK, ground: MEADOW, sss: '#e4f27a', rim: '#d6f08a', fleck: .55,
  },
  'Poplar': {
    shelves: 5,
    lift: 0.3,
    sinuous: .12,
    moss: 0.3,
    gesture: 'flame', crownWidth: .15, asym: 0.04, notches: 0, massVar: .3,
    height: 16, trunkRadius: .34, trunkFrac: .72, lean: .02, flare: 0.9, levels: 3, children: 14, childAngle: 12, lengthRatio: .5,
    childStart: 0.06, gnarl: .1, upward: 0.18, crown: 'column',
    clumpRadius: 0.75, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .75, squash: 1.25, massBlend: .6, cardSize: 0.70, coverage: 1.6, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#123d3e', '#287040', '#529a50', '#90c868'], bark: BARK, ground: MEADOW, sss: '#c8ff7a', rim: '#a8f0a0', fleck: .4,
  },
  'Sakura': {
    shelves: 4, boughGap: .82, hueVar: .3,
    stems: 1, forkHeight: .14, stemSpread: 26, sinuous: .7,
    moss: 0.25,
    gesture: 'umbrella', crownWidth: 0.8, asym: .34, notches: 1, massVar: 0.45,
    height: 7.5, trunkRadius: 0.5, trunkFrac: .36, lean: .14, flare: .7, levels: 3, children: 5, childAngle: 58, lengthRatio: .8,
    childStart: .5, gnarl: .28, upward: .02, crown: 'umbrella',
    clumpRadius: 1.15, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .75, squash: .72, massBlend: .65, lift: 1.8, cardSize: 0.72, coverage: 1, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#b4688e', '#e08eaa', '#f6b8ca', '#fff0ea'], bark: ['#2c2220', '#4a3428', '#7e5a42', '#caa282'], ground: MEADOW, sss: '#ffc4c8', rim: '#ffd9e0', fleck: 0,
  },
  'Autumn maple': {
    hueVar: .35,
    shelves: 4,
    stemSpread: 30,
    forkHeight: 0.12,
    stems: 3,
    sinuous: .4,
    moss: 0.35,
    gesture: 'umbrella', crownWidth: 0.62, asym: .16, notches: 1, massVar: .4,
    height: 9, trunkRadius: .38, trunkFrac: .4, lean: .06, flare: .7, levels: 3, children: 6, childAngle: 46, lengthRatio: .68,
    childStart: .5, gnarl: .18, upward: .04, crown: 'vase',
    clumpRadius: 0.9, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .75, squash: 0.6, massBlend: .65, lift: 1.3, cardSize: 0.81, coverage: 1.5, core: true,
    strays: .14, leaf: 'pointed', edge: 'spray', palette: ['#7c3c3e', '#b84f34', '#ea8a40', '#ffdc76'], bark: ['#2a3034', '#4a5052', '#7c807a', '#bcbcae'], ground: ['#6a6240', '#8e8244', '#bc9e4e', '#e8cf84'], sss: '#ffc25a', rim: '#ffcf80', fleck: .35,
  },
  'Stone pine': {
    shelves: 2,
    sinuous: 0.25,
    moss: 0.12,
    gesture: 'umbrella', crownWidth: .52, asym: .2, notches: 0, massVar: .4,
    height: 12, trunkRadius: .36, trunkFrac: .68, lean: .1, flare: .4, levels: 3, children: 9, childAngle: 45, lengthRatio: .62,
    childStart: 0.92, gnarl: .16, upward: .05, crown: 'umbrella',
    clumpRadius: 1.35, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .8, squash: 0.3, massBlend: 0.5, cardSize: 0.81, coverage: 1.6, core: true,
    strokeAngle: 80, brushWidth: .5, strokeJitter: 24, leaf: 'round', edge: 'round', palette: ['#123838', '#245e42', '#4a8a50', '#88ba66'], bark: ['#2c2420', '#553c2a', '#8a6038', '#d0a870'], ground: MEADOW, sss: '#c4f070', rim: '#b0f0a0', fleck: .3,
  },
  'Garden tree': {
    shelves: 4,
    stems: 4, forkHeight: 0.05, stemSpread: 28, sinuous: .9, ivy: 0.5, moss: .55,
    gesture: 'dome', crownWidth: .5, asym: .34, notches: 3, massVar: .6,
    height: 10, trunkRadius: .5, trunkFrac: 0.4, lean: .05, flare: .8, levels: 3, children: 7, childAngle: 40, lengthRatio: .72,
    childStart: .55, gnarl: .16, upward: .05, crown: 'vase',
    clumpRadius: 1.25, clumpVar: .45, clumpsPerTip: .8, clumpSpacing: .85, squash: .72, massBlend: .6, cardSize: .75, coverage: 1.4, core: true, lift: 1.3,
    leaf: 'round', edge: 'pointed', palette: ['#1e4430', '#30743c', '#62a44a', '#a4d662'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .35,
  },
  'Mountain cedar': {
    shelves: 7,
    sinuous: .08, ivy: .15,
    moss: 0.5,
    gesture: 'tiers', crownWidth: 0.24, asym: .12, notches: 0, massVar: .2,
    height: 16, trunkRadius: .42, trunkFrac: .86, lean: .02, flare: .7, levels: 2, children: 20, childAngle: 76, lengthRatio: .6,
    childStart: 0.22, gnarl: .07, upward: .0, droop: 0.1, crown: 'cone',
    clumpRadius: 0.6, clumpVar: .3, clumpsPerTip: 1.4, clumpSpacing: .5, squash: .55, massBlend: .4, crownBlend: .35, cardSize: .8, coverage: 1.5, core: true, lift: 0.6,
    strokeAngle: 70, strokeJitter: 30, leaf: 'pointed', edge: 'pointed', palette: ['#10343a', '#1d5440', '#387a50', '#7ab068'], bark: ['#262220', '#443428', '#785a40', '#bc9a72'], ground: MEADOW, sss: '#c4f070', rim: '#b0f0a0', fleck: .2,
  },
  'Weeping willow': {
    stems: 3, forkHeight: .12, stemSpread: 28, sinuous: .5, ivy: .2,
    moss: 0.65,
    height: 10, trunkRadius: .56, trunkFrac: .3, lean: .1, flare: .9, levels: 3, children: 7, childAngle: 46, lengthRatio: 1.0,
    childStart: .6, gnarl: .13, upward: .03, droop: .1, crown: 'dome',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .6, clumpSpacing: 1.0, squash: .62, massBlend: .55, cardSize: 0.95, coverage: 0.7, core: false,
    hang: 2, strandLength: 0.65, lift: 1.4, brushWidth: 0.3, strokeJitter: 16,
    leaf: 'willow', edge: 'spray', palette: ['#24482c', '#3d783c', '#78aa48', '#bcd86a'], bark: BARK, ground: MEADOW, sss: '#e8f47a', rim: '#d6f08a', fleck: .25,
  },
  'Round bush': {
    shelves: 3,
    stemSpread: 35,
    forkHeight: 0.02,
    stems: 5,
    moss: 0.2,
    gesture: 'mound', crownWidth: .95, asym: .2, notches: 1, massVar: .5,
    height: 2.2, trunkRadius: .1, trunkFrac: .25, lean: .1, flare: .3, levels: 2, children: 7, childAngle: 50, lengthRatio: 1.1,
    childStart: .25, gnarl: .2, upward: .05, crown: 'dome',
    clumpRadius: .8, clumpVar: .4, clumpsPerTip: 1.3, clumpSpacing: .6, squash: .8, massBlend: .5, cardSize: 0.52, coverage: 1.5, core: true,
    leaf: 'round', edge: 'pointed', palette: ['#18442e', '#2c6c3c', '#589a48', '#98ca60'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .5,
  },
}

for (const k in SPECIES) SPECIES[k] = { ...DEFAULTS, ...SPECIES[k] }

export const CROWNS = ['dome', 'oval', 'column', 'cone', 'umbrella', 'vase']
export const BRUSHES = { 'Gouache blot': 'round', 'Jagged blot': 'pointed', 'Clover': 'clover', 'Leaf sprig': 'spray', 'Dry scumble': 'scumble', 'Sponge dots': 'blossom', 'Needle fan': 'needle', 'Long pull': 'willow' }
