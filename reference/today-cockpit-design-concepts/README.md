# Today & Cockpit — 10 design concepts

Standalone HTML explorations for killing the "AI-slop" look on the **Today**
and **Cockpit** screens. Open `index.html` to browse all ten; each tile links
to a full standalone page showing both screens side-by-side.

## The diagnosis
The current UI runs **five accent colours at once** — lime `#c4f035`, blue
`#7fd4e8`, violet `#c9a9f0`, amber `#f0b45e`, red `#e0625e` — on near-black.
That competing rainbow *is* the slop. The fix every premium reference (Apple,
Lucid, Tesla, Japandi, Swiss, Nordic) shares is **restraint**: one accent, a
neutral ramp, real typographic hierarchy, and a strict grid.

## The ten
| # | Concept | Inspiration | Mode |
|---|---------|-------------|------|
| 01 | Cupertino | Apple iOS / visionOS | light |
| 02 | Lucid | Lucid Motors | light |
| 03 | Apex | Tesla industrial UI | light |
| 04 | Japandi | warm minimal | light/warm |
| 05 | Grid | Swiss / International Typographic | light |
| 06 | Fjord | Nordic functional calm | light/cool |
| 07 | Onyx | premium dark, brushed brass | dark |
| 08 | Editorial | print magazine, type-led | light/warm |
| 09 | Carbon | tasteful Bloomberg terminal | dark |
| 10 | Aurora — disciplined | **your brand, fixed** | dark |

**Concept 10** keeps your exact lime as the *only* accent — the smallest change
that ships a consistent look. Concepts 01–09 are bolder repositionings.

## Real data
Every concept renders the same live content from `apps/web` (readiness 78,
HPI 71, STR/END/REC, the Lower Power + Zone 2 session, week stats, injury risk)
so the comparison is fair — only the design system varies.

## Regenerating
`_generator.mjs` is the single source. Content lives once; each concept is a
theme (palette + fonts + radii + overrides). Edit a theme and run:

```
node reference/today-cockpit-design-concepts/_generator.mjs
```

Once a direction is chosen, its tokens fold into `packages/core` so web + mobile
inherit the same system (per the parity rule).
