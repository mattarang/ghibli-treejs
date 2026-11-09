# Round 2 context: locked direction (superseded)

**Superseded, 2026-11-08.** Built into the demo, the J direction read as unstyled ("like baby's first UI ... like this is missing CSS"), and the user reopened it. Only its paper colour and the loading screen survived. The demo's controls were rebuilt as warm paper tool panels (Nunito Sans, tabs, sliders, icon buttons) with guidance from the ui-ux-pro-max skill, then revised after an impeccable critique. This file is kept as the record of the exploration in round-1/ and round-1b/; it no longer governs the UI.


**Locked by the user, 2026-11-08:** Round 1 second set, direction J (the herbarium sheet), with the sap green second ink ("let's do it with the green for now"). The other directions are closed. Reopen only for new evidence, an accessibility or implementation failure, a changed need, or an explicit override.

## Capsule (J, as locked)

**Premise.** The herbarium sheet: the tree is the specimen and the sheet is left to it; everything written about it is one small label in the corner, one weight, as a botanist's label is, the measured values in the hand's ink.

**Fonts and licence.** Absans (Collletttivo, Italy), Regular only, SIL OFL 1.1. Source: github.com/collletttivo/absans. In the demo it is self-hosted from public/fonts with its licence.

**Colour.** Paper #e6e9e1; ink #2b2b28 (11.6:1); second ink, sap green #3f5e36 (6.0:1) for values, the season and time, and actions. (Replaces the red-brown #7d2f2f of the first J.)

**Rules.** One small label in a corner, the rest of the view left to the tree. One weight throughout; hierarchy by position, size (13 px text, 20 px name) and the second ink only. Values right-aligned in a label table; section names as plain headings with space above, no rules or boxes.

## Round 2 decisions (the demo)

- The Shape panel is the label: paper, 290 px, bottom right; the view's centre slides left so the tree stays clear of it (phones: along the bottom).
- Controls are words, not icons: New tree, Shape, Walk, Full screen, Recentre, Show leaves, Reset, Done.
- Lines and marks only where a control needs them: a slider is a 1 px ink hairline with a small ink tick, its set part in the second ink; the leaves switch is a small outlined box filled in the second ink when on.
- The dials keep their working shapes, drawn in paper and ink.
- Loading: the empty paper sheet and a small label holding the name, the step, a percentage and the user's spring-loaded season selector.
- Touch: every control answers at least 44 px.
