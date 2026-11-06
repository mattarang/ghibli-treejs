# Ghibli Foliage

A small app for generating painted, Ghibli-style plants and playing with their light. Pick a species, roll seeds, reshape the crown, then run the clock from dawn to night.

```bash
npm install
npm run dev
```

Then open http://localhost:5177. Drag to orbit, Shift+drag to move the sun, scroll to zoom. URL parameters set the start state: `?species=Sakura&seed=12&time=16.2&grove=5&close`.

Stats along the top left show frame rate, frame time, draw calls and triangles per frame, including the shadow pass. Output > Profiling stats hides them.

## How it works

- `src/generator.js`: the plants, with no three.js in it. Branches grow from a queue, clumps form at the tips, and clumps are grouped into larger masses. Each clump is a shell of brush strokes over a dark underpainting.
- `src/atlas.js`: the brush atlas, with each dab drawn bristle by bristle to a canvas at startup.
- `src/ghibli-patch.js`: the look, as an `onBeforeCompile` patch on stock three.js materials, so shadows and fog keep working.
- `src/lighting.js`: one clock drives the sun, sky, fog, ambient and palette tints.
- `src/presets.js`: the species table.

The WebGL shading won't run under the WebGPU renderer, so moving these plants into a WebGPU project means porting `ghibli-patch.js` to TSL. The generator carries over as it is.

## Why strokes

A stroke is four vertices at one anchor point. The shader fans them out to face the camera, and it takes the normal and shadow from the anchor, so each stroke is one flat colour. Light and shadow change from one stroke to the next, as they would in a painting, and the same fan-out towards the light makes the shadows brush-shaped too. This is the particle approach from Meier's 1996 painterly rendering paper.

## Credits

- Toon patch based on [threejs-ghibli-toon-shading](https://github.com/nicksonthc/ghibli-threejs) by nicksonthc (MIT).
- Palette ramp after [ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) by craftzdog (MIT).
