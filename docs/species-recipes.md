# How the species recipes are built

Every tree runs the same generator code. `src/generator.js` contains **no species names and no species branches**: everything that makes a cedar a cedar is data in `src/presets.js`. So the honest answer to "are recipes just slider combinations?" is: **partly**. Each species is a set of values, but many of those values are not on any slider.

## The layers a species is made from

| Layer | What it holds | On a slider? | Species using it |
|---|---|---|---|
| Base preset (`SPECIES[...]`) | ~60 numbers: height, trunk radius, crown width, asymmetry, clump size, brushes, palette | Yes, the GUI | all 14 |
| `MATURE` | mature height in metres | via Mature size | all 14 |
| Crown outline | width at 33 heights, spun round the trunk | No | traced by hand: 5 (cherry, maple, oak, stone pine, poplar). Hand-shaped: 1 (zelkova fan). Generated from 4 `ENVELOPE` numbers: the other 8 |
| `SELF_ORG` | shared self-organising growth (Pałubicki 2009) and its clean-ups | No | the 13 converted species (the cherry carries its own copy) |
| `OWN_GROWTH` | **growth habit** per branch order: branch angle, up/down pull (tropism), level limbs, crookedness (wiggle), whorls, multi-stem start, outward cap, apical control (lambda) | No | 12: every tree except the cherry (own recipe) and the garden tree (shared default) |
| `OWN_LOOK` | foliage look overrides: pad size, gaps, sprays, bays, low split, stems | partly (some are sliders) | 8: both pines, zelkova, maple, ginkgo, camphor, oak, garden tree |
| `GIRTH` | trunk diameter calibration | via Trunk radius | 13 (all but maple) |
| `SPREAD` | crown spread in metres | via Crown width | 6: oak, camphor, zelkova, ginkgo, stone pine, hinoki |
| `CLEAR` | clear trunk below the crown | via Bare trunk | 3: camphor, zelkova, willow |
| Full hand-written recipe | many bespoke flags | No | 1: Yoshino cherry (blossom riding on branches, cut long runs, whips, bare limbs). The maple has its own older recipe (tiers, splits) underneath its conversion |

## Per species

| Species | Outline | Growth habit (`OWN_GROWTH`) | Other bespoke data |
|---|---|---|---|
| Yoshino cherry | traced | own full recipe | blossom rides on top of branches, long-run/whip cutting, bare limbs |
| Japanese maple | traced | multi-stem start, level outer shoots | tiers, stems/split, maple-leaf brushes |
| English oak | traced | wide crooked limbs (level, wiggle, low apical control) | spread, lumpy irregular crown |
| Camphor tree | generated | broad spreading limbs | spread, clear trunk, lumpy crown |
| Japanese zelkova | hand-shaped fan | multi-stem start, steep stems | spread, clear trunk, vase look |
| Ginkgo | generated | few long limbs at odd angles | spread, open lopsided crown |
| Garden tree | generated | shared default | gaps and bays |
| Weeping willow | generated | arching limbs, downward pull past the limbs | clear trunk |
| Lombardy poplar | traced | strong upward pull, tight angles | none |
| Japanese cedar | generated | strong leader, level limbs | none |
| Hinoki cypress | generated | strong leader, level limbs drooping at the tips | spread |
| Japanese black pine | generated | whorls, level limbs, crooked | curved trunk, pads |
| Japanese red pine | generated | whorls, level limbs | curved trunk, pads |
| Stone pine | traced | lost leader, steep forking limbs | spread |

## Tuning a species in the sim (no code)

Three folders in the GUI cover the whole loop:

- **Outline**: *Load traced image…* takes the tracer's black-and-white PNG (or any image of a dark crown on white) and turns it into the outline. *Paste outline numbers…* takes the tracer's *Copy outline*. Either one regrows the tree into the new crown and turns on the fitted-outline overlay. *Open the tracer* opens `tools/trace.html`.
- **Growth habit**: every value the self-organising growth reads.
  - *Trunk & leader*, *Limbs* and *Twigs & finer* each have branch angle, pull up/down, hold level, crookedness and outward limit.
  - *Whole tree* has leader dominance, steering to open space, shoot length, sight, steps per year, years, no-growing-back, rings of limbs (count, and up to which order) and a several-stems start.
  - *Start from* loads a habit preset: spreading broadleaf, conifer, pine, weeping, column, vase, multi-stem shrub tree.
- **Recipe**:
  - *Save as species…* stores the current tree in this browser and adds it to the Species list.
  - *Download recipe* and *Copy recipe* give the whole tree as JSON, the same fields as a species in `presets.js`.
  - *Load recipe file…* brings one back.
  - *Forget saved species* removes a saved one.

  A saved species with a built-in name replaces the built-in in this browser until it's forgotten.

Bare trunk (Plant folder) sets where the crown starts. It now goes down to 0.02, so low-crowned trees can use it.

## What this means

- **No bespoke code.** Adding a species never needs a code change, only data.
- **Bespoke data, mostly not on sliders.** 12 of 14 species need their own growth habit, which the GUI can't set today. The habit is what an arborist recognises a tree by: branch angles, whether limbs hold level or weep, whorls, multi-stem bases.
- **The cherry is the outlier.** It carries a fully hand-tuned recipe; the others are the shared model plus a handful of numbers.
- **Recipes can now be made without code.** The Growth habit and Outline folders cover what used to need `OWN_GROWTH` and a traced outline in `presets.js`, and the Recipe folder saves the result. The built-in species still live in `presets.js`. Moving them to recipe files would be the last step.
