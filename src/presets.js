// Species table. Each preset is a complete, tunable parameter set: seeds vary a tree, presets change what it is.
const MEADOW = ['#25664f', '#2f8a54', '#5cb35c', '#aedb74']
const BARK = ['#2e4240', '#465444', '#74705a', '#c8bc96']

const DEFAULTS = { strays: .14, edge: 'clover', hang: 0, lift: 1, droop: 0, strandLength: .9, brushWidth: .85, strokeAngle: 0, strokeJitter: 70 }

export const SPECIES = {
  'Great camphor': {
    height: 12, trunkRadius: .82, trunkFrac: .36, lean: .06, flare: 1.0, levels: 3, children: 5, childAngle: 46, lengthRatio: 1.15,
    childStart: .6, gnarl: .15, upward: .05, crown: 'dome',
    clumpRadius: 1.75, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .72, squash: .78, massBlend: .72, lift: 1.65, cardSize: 0.66, coverage: 1.5, core: true,
    leaf: 'round', edge: 'clover', palette: ['#174a4c', '#1f7664', '#4cae62', '#a8e08c'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .45,
  },
  'Hilltop oak': {
    height: 8.5, trunkRadius: .7, trunkFrac: .36, lean: .12, flare: 1.1, levels: 3, children: 5, childAngle: 50, lengthRatio: .92,
    childStart: .55, gnarl: .22, upward: .04, crown: 'umbrella',
    clumpRadius: 1.5, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .72, squash: .68, massBlend: .72, lift: 1.5, cardSize: 0.62, coverage: 1.5, core: true,
    leaf: 'clover', edge: 'spray', palette: ['#1b4c48', '#277a5c', '#5cae58', '#b6e284'], bark: BARK, ground: MEADOW, sss: '#e4f27a', rim: '#d6f08a', fleck: .55,
  },
  'Poplar': {
    height: 16, trunkRadius: .34, trunkFrac: .72, lean: .02, flare: .5, levels: 3, children: 7, childAngle: 20, lengthRatio: .5,
    childStart: .15, gnarl: .1, upward: .09, crown: 'column',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .75, squash: 1.25, massBlend: .6, cardSize: 0.48, coverage: 1.6, core: true,
    leaf: 'spray', edge: 'spray', palette: ['#154650', '#1a6c64', '#3a9c62', '#96da8c'], bark: BARK, ground: MEADOW, sss: '#c8ff7a', rim: '#a8f0a0', fleck: .4,
  },
  'Sakura': {
    height: 7.5, trunkRadius: .36, trunkFrac: .36, lean: .14, flare: .7, levels: 3, children: 5, childAngle: 58, lengthRatio: .8,
    childStart: .5, gnarl: .28, upward: .02, crown: 'umbrella',
    clumpRadius: 1.15, clumpVar: .5, clumpsPerTip: .9, clumpSpacing: .75, squash: .72, massBlend: .65, lift: 1.3, cardSize: 0.5, coverage: 1.5, core: true,
    leaf: 'blossom', edge: 'blossom', palette: ['#b4688e', '#e08eaa', '#f6b8ca', '#fff0ea'], bark: ['#40343a', '#5c4644', '#86625a', '#b49078'], ground: MEADOW, sss: '#ffc4c8', rim: '#ffd9e0', fleck: 0,
  },
  'Autumn maple': {
    height: 9, trunkRadius: .38, trunkFrac: .4, lean: .06, flare: .7, levels: 3, children: 6, childAngle: 46, lengthRatio: .68,
    childStart: .5, gnarl: .18, upward: .04, crown: 'oval',
    clumpRadius: 1.25, clumpVar: .45, clumpsPerTip: .9, clumpSpacing: .75, squash: .85, massBlend: .65, lift: 1.3, cardSize: 0.56, coverage: 1.5, core: true,
    leaf: 'pointed', edge: 'spray', palette: ['#7c3c3e', '#b84f34', '#ea8a40', '#ffdc76'], bark: BARK, ground: ['#6a6240', '#8e8244', '#bc9e4e', '#e8cf84'], sss: '#ffc25a', rim: '#ffcf80', fleck: .35,
  },
  'Stone pine': {
    height: 12, trunkRadius: .36, trunkFrac: .68, lean: .1, flare: .4, levels: 3, children: 6, childAngle: 62, lengthRatio: .62,
    childStart: .72, gnarl: .16, upward: .05, crown: 'umbrella',
    clumpRadius: 1.35, clumpVar: .35, clumpsPerTip: .9, clumpSpacing: .8, squash: .42, massBlend: .25, cardSize: 0.56, coverage: 1.6, core: true,
    strokeAngle: 80, brushWidth: .5, strokeJitter: 24, leaf: 'needle', edge: 'needle', palette: ['#14424a', '#1a605c', '#328c60', '#8cc880'], bark: ['#4a3a3a', '#6e4a3e', '#a0643e', '#d69a60'], ground: MEADOW, sss: '#c4f070', rim: '#b0f0a0', fleck: .3,
  },
  'Weeping willow': {
    height: 10, trunkRadius: .56, trunkFrac: .3, lean: .1, flare: .9, levels: 3, children: 7, childAngle: 46, lengthRatio: 1.0,
    childStart: .6, gnarl: .13, upward: .03, droop: .1, crown: 'dome',
    clumpRadius: 1.15, clumpVar: .35, clumpsPerTip: .6, clumpSpacing: 1.0, squash: .62, massBlend: .55, cardSize: 0.95, coverage: 1.0, core: false,
    hang: 3, strandLength: .9, lift: 1.4, brushWidth: .46, strokeJitter: 16,
    leaf: 'willow', edge: 'spray', palette: ['#1f5048', '#2f8058', '#6ab458', '#c6e688'], bark: BARK, ground: MEADOW, sss: '#e8f47a', rim: '#d6f08a', fleck: .25,
  },
  'Round bush': {
    height: 2.2, trunkRadius: .1, trunkFrac: .25, lean: .1, flare: .3, levels: 2, children: 7, childAngle: 50, lengthRatio: 1.1,
    childStart: .25, gnarl: .2, upward: .05, crown: 'dome',
    clumpRadius: .8, clumpVar: .4, clumpsPerTip: 1.3, clumpSpacing: .6, squash: .8, massBlend: .5, cardSize: 0.36, coverage: 1.5, core: true,
    leaf: 'clover', edge: 'clover', palette: ['#174a4c', '#1f7664', '#4cae62', '#a8e08c'], bark: BARK, ground: MEADOW, sss: '#d6ff6a', rim: '#bfff8a', fleck: .5,
  },
}

for (const k in SPECIES) SPECIES[k] = { ...DEFAULTS, ...SPECIES[k] }

export const CROWNS = ['dome', 'oval', 'column', 'cone', 'umbrella', 'vase']
export const BRUSHES = { 'Gouache blot': 'round', 'Jagged blot': 'pointed', 'Clover': 'clover', 'Leaf sprig': 'spray', 'Dry scumble': 'scumble', 'Sponge dots': 'blossom', 'Needle fan': 'needle', 'Long pull': 'willow' }
