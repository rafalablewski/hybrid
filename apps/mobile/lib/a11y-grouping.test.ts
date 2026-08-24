import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// `accessible` COLLAPSES A SUBTREE — the one a11y trap this app keeps setting
//
// React Native's `accessible` prop does not merely LABEL a view. It makes that
// view a single accessibility element and takes every descendant out of the
// tree with it: a button nested inside an `accessible` view cannot be focused,
// cannot be activated, and does not exist as far as VoiceOver is concerned. A
// grouped view is a leaf.
//
// That is exactly right for a row of figures that should be read as one thing,
// and exactly wrong for anything containing a control. The day band shipped it
// wrong twice in the same file (Aug 2026): once on the whole field and once on
// each deck page, which left the ⓘ, the deck's dots, RATE and "Not today?"
// unreachable — on the screen an athlete opens every morning. Nothing caught
// it. It renders identically, it typechecks, and the render gate cannot see it
// either: `react-native-web` maps `accessible` onto DOM attributes that do not
// hide a subtree, so the tree that gate asserts on is not the tree the phone
// builds.
//
// So this does what drawer-measure.test.ts does with measured collapses: it
// finds every `accessible` in the app and makes each FILE state, in writing,
// what that view groups and why nothing inside it is a control. A new one fails
// until someone has had to answer the question. The count is part of the entry
// because the trap arrives as a SECOND `accessible` in a file that already had
// a legitimate one — which is precisely how the band's page-level copy landed.
// ---------------------------------------------------------------------------

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `accessible` as a JSX prop — bare, or with any expression value. Not
 *  `accessibilityLabel` and friends (a longer prop name starting with the same
 *  letters). */
const ACCESSIBLE = /(?:^|[\s{])accessible(?:\s*=\s*\{[^}]*\})?(?=\s*(?:[\r\n]|\/?>))/g;

/** COMMENTS OUT FIRST. This file's own subject is discussed in prose all over
 *  the app ("no accessible name", "the segment's accessible name"), and a bare
 *  `accessible` at the end of a wrapped comment line is indistinguishable from
 *  a bare JSX prop. Counting the code alone is the only way to keep the
 *  registry about views rather than about sentences. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\r\n]*/g, "$1");

interface Grouped {
  /** How many `accessible` props the file carries. */
  sites: number;
  /** What each one groups, and why nothing inside it is a control. */
  why: string;
}

const GROUPED: Record<string, Grouped> = {
  "components/aurora/day-band.tsx": {
    sites: 1,
    why:
      "The deck PAGE's words — the instruction and the sentence under it, read as one thought, prefixed with 'Option 2 of 3' where a deck exists. It is an inner view holding exactly those two Text nodes: the page's commit control is a SIBLING of it, not a child, and so are the ⓘ, the dots, RATE and 'Not today?', which all sit outside the pager entirely. This file is the reason this test exists — it had `accessible` on the whole field AND on each whole page.",
  },
  "app/workout.tsx": {
    sites: 1,
    why:
      "A reorder row in the exercise sheet, and grouping is what makes the drag REACHABLE rather than what hides it: the row carries its position and name as one label plus `accessibilityActions` for move-up/move-down, which is how a hold-and-drag list is operated without a hold and a drag. Its children are a number, an avatar and two Texts.",
  },
  "components/aurora/kit.tsx": {
    sites: 1,
    why:
      "AStat's figure + label, which are a value and its name and are meaningless read apart. A stat is a leaf by construction: it renders two Text nodes and nothing else, and a tappable stat is a different component (APressCard).",
  },
  "components/aurora/nutrition-kit.tsx": {
    sites: 1,
    why:
      "A macro's figure + its unit + its name — same shape as AStat, same reason. Text only; the tappable macro rows wrap this, they are not wrapped BY it.",
  },
  "components/aurora/rolling-number.tsx": {
    sites: 1,
    why:
      "The whole rolling figure as ONE string. Grouping is the entire point here: the digits are separate views so they can slide independently, and without this the reader announces a number one glyph at a time as they animate. Its children are Text nodes in a clipped column — there is nothing to activate.",
  },
  "components/aurora/sheet.tsx": {
    sites: 1,
    why:
      "The sheet's TITLE + SUBTITLE, so the sheet announces itself as one heading when it opens. The close control, the scroller and everything the caller renders inside are siblings of it.",
  },
  "components/aurora/week-summary.tsx": {
    sites: 2,
    why:
      "TWO ROWS, both leaves, both for the same reason — a label and its figures sit on one line and are one fact, and read apart they are several unrelated utterances. (1) The RECORD row: the trophy, the lift's name, where it came from and what it now stands at, which apart is four. (2) The DISCIPLINE row in the endurance half: the sport's mark, its name, the ground it covered, the time and the pace — five nodes describing one activity. Neither can contain a control: they render Marks, Glyphs and Texts, and the screen's only controls — the share circle and the nav button — live in the hero rail. (The ledger row that used to be the third is `WidgetRow` now, registered with the widget it belongs to.)",
  },
  "components/aurora/widget.tsx": {
    sites: 1,
    why:
      "WidgetRow — a label and its value on one line, which is one fact: 'Sets, 22' rather than 'Sets' … '22'. It is a leaf by construction (two Texts and an optional third), and a widget's controls are never inside its rows: a summary widget carries a reading, and anything tappable on those screens lives in the hero rail.",
  },
  "components/aurora/protocol.tsx": {
    sites: 1,
    why:
      "The body figure's muscle-group <G>, and here the grouped view IS the control: it carries the radio role, the label, the selected state and the press handler, and its children are Polygons. Gated on `live` — the read-only figure is not a radio and takes no group.",
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "test") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("`accessible` groups words, never controls", () => {
  const counted = new Map<string, number>();
  for (const f of walk(MOBILE)) {
    const n = (code(readFileSync(f, "utf8")).match(ACCESSIBLE) ?? []).length;
    if (n) counted.set(relative(MOBILE, f).split(/[\\/]/).join("/"), n);
  }

  it("every file that groups has said what it groups", () => {
    expect([...counted.keys()].filter((f) => !(f in GROUPED)).sort()).toEqual([]);
    // …and the registry may not rot: an entry whose file stopped grouping is a
    // paragraph of reasoning about nothing.
    expect(Object.keys(GROUPED).filter((f) => !counted.has(f)).sort()).toEqual([]);
  });

  it("counts the groups, because the trap is the SECOND one", () => {
    for (const [file, entry] of Object.entries(GROUPED)) {
      expect(counted.get(file), `${file} grouping count`).toBe(entry.sites);
    }
  });

  it("asks for a reason, not a checkbox", () => {
    for (const [file, entry] of Object.entries(GROUPED)) {
      expect(entry.why.length, `${file} needs an actual answer`).toBeGreaterThan(80);
    }
  });
});
