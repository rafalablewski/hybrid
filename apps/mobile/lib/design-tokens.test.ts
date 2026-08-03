import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE DESIGN-TOKEN RATCHET.
 *
 * The design audit's root finding was not that the token system is wrong — it is
 * unusually well authored — but that NOTHING FAILED when a call site ignored it.
 * The one healthy axis was motion, and motion is healthy precisely because
 * motion.test.ts holds it to its own rules. This file is that guard for the
 * visual axes.
 *
 * Two kinds of rule:
 *
 *   HARD — the violation count is zero and must stay zero. Adding one fails.
 *
 *   RATCHET — the violation count is a known, non-zero number that we are
 *     paying down. The test asserts the count NEVER RISES. Fixing sites and
 *     lowering the ceiling is the intended workflow; the number only ever goes
 *     down, and when it reaches zero the rule graduates to HARD.
 *
 * A ratchet is deliberately unglamorous: it does not fix anything, it just makes
 * the debt visible and stops it growing while the sweeps land.
 */

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push({ path: full.slice(ROOT.length + 1), text: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of DIRS) walk(join(ROOT, d));
  return out;
}

const FILES = sources();

/** Every `pattern` match across the tree, as "path:line" strings. */
function hits(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    text.split("\n").forEach((line, i) => {
      for (const _ of line.matchAll(pattern)) found.push(`${path}:${i + 1}`);
    });
  }
  return found;
}

/** A ratchet: report the overage with the offending sites, so a failure tells
 *  you WHERE, not just that a number moved. */
function expectAtMost(found: string[], ceiling: number, rule: string) {
  const detail = found.length > ceiling ? `\n${rule}\nceiling ${ceiling}, found ${found.length}:\n  ${found.slice(0, 25).join("\n  ")}` : "";
  expect(found.length, detail).toBeLessThanOrEqual(ceiling);
}

describe("type scale", () => {
  it("HARD — no text below the 10dp legibility floor", () => {
    // Was 98 sites (86 at 9dp, 12 at 8dp), overwhelmingly the mono + uppercase +
    // letter-spaced kicker — the least legible combination available — including
    // 14 in the live logging screen, read one-handed mid-set. All raised to
    // fs.nano. This rule is HARD from the start: there is no size below `nano`.
    expect(hits(/fontSize:\s*[0-9](?![0-9.])/g)).toEqual([]);
  });

  it("RATCHET — raw fontSize integers give way to fs.* rungs", () => {
    // The ladder has 13 named rungs. Every raw integer here is a call site that
    // decided for itself; ~37% of them land off the ladder entirely.
    expectAtMost(hits(/fontSize:\s*\d+/g), 489, "raw fontSize → use an fs.* rung");
  });
});

describe("leading and tracking", () => {
  it("RATCHET — absolute lineHeight gives way to leading()", () => {
    // 287 → 77. The 210 that sat on a line with an fs.* size were DERIVED: each
    // snapped to the nearest of the four roles, and the evidence was the finding
    // itself — body/19, caption/17, bodyLg/20, caption/18 and micro/16 were all
    // "normal" body leading, written five different ways.
    //
    // Absolute leading is also why Dynamic Type could not work: the OS scales the
    // glyphs and leaves the line box where it was, so text collides with itself
    // before it clips. leading(fs.body) derives the box from the size.
    //
    // What remains has no fs.* token on the same line — a raw size, or a
    // lineHeight set apart from its fontSize — so each needs reading, not a
    // regex. Four more were left deliberately: their ratio is >0.09 from any
    // role, which means they are making a point (a 1.04 display, a 2.71 spacer)
    // rather than picking a leading.
    expectAtMost(hits(/lineHeight:\s*\d/g), 77, "absolute lineHeight → leading(size, role)");
  });

  it("RATCHET — raw letterSpacing gives way to tracking.*", () => {
    // 18 distinct values, of which 0.9 and 1.2 are the same eyebrow drawn twice.
    expectAtMost(hits(/letterSpacing:\s*-?\d/g), 480, "raw letterSpacing → tracking.*");
  });
});

describe("geometry", () => {
  it("RATCHET — raw borderRadius gives way to RADIUS.*", () => {
    // 36 distinct radii against a 5-rung vocabulary (mark/inner/field/card/pill).
    expectAtMost(hits(/borderRadius:\s*\d/g), 507, "raw borderRadius → RADIUS.*");
  });
});

describe("touch targets", () => {
  it("HARD — every interactive PRIMITIVE declares the 44dp floor", () => {
    // The audit measured five selectable pills across five screens at ~25–31dp,
    // built from three horizontal paddings, four vertical ones and three type
    // sizes — and found exactly ONE minHeight: 44 in the whole app. Padding
    // cannot fix it: a chip's height is set by its label, so the floor has to be
    // declared. These are the components every screen reaches through; a screen
    // that hand-rolls a touchable is still on its own, which is the argument for
    // reaching through them.
    const PRIMITIVES = [
      "components/aurora/kit.tsx",       // APill, AChip, ASegment
      "components/admin/_kit.tsx",       // PillBtn — the compact admin action
    ];
    for (const path of PRIMITIVES) {
      const file = FILES.find((f) => f.path === path);
      expect(file, `${path} not found`).toBeDefined();
      expect(file!.text, `${path} must declare HIT_TARGET`).toContain("HIT_TARGET");
    }
  });

  it("RATCHET — chip implementations converge on Chip + AChip", () => {
    // Eighteen at audit time, disagreeing on fill alpha, radius, padding, size,
    // face and border — two of them painting their label with the RAW accent
    // instead of txt(), which failed contrast on the Kyoto Hour washi. What
    // survives is the pair (static tag, selectable filter) plus the genuinely
    // different objects, renamed to say so: MetaPill (a status readout),
    // RailAction (an animated rail item), DayChip ×2 (date tiles), PillBtn (the
    // compact admin action) and PlanDockPill (a stateful docked CTA).
    // Component declarations only — a capitalised name. `toggleTag`,
    // `saveTags` and the like are handlers, not components.
    const decls = hits(/^\s*(?:export )?(?:function|const) [A-Z][A-Za-z]*(?:Chip|Pill|Tag)[A-Za-z]*\s*[=(]/gm);
    expectAtMost(decls, 8, "chip-shaped component → Chip or AChip");
  });
});

describe("section headers", () => {
  it("RATCHET — one section head, to the documented standard", () => {
    // CLAUDE.md already NAMES the standard: a bold display-face title in chalk,
    // any meta or action as small mono uppercase on the RIGHT of the same row,
    // never a decorative marker on the left. It was then reimplemented eight
    // times — SHead, SecHead, SubHead, RailHead, SectionHead, SectionHeader,
    // SectionLabel ×2 — each agreeing on the shape and disagreeing on everything
    // measurable: title 18 / fs.bodyLg / fs.title / fs.note, serif-swapped or
    // not, meta at nano vs micro, tracking 0.9 vs 1.2, top margin 6/16/24/28.
    //
    // A standard that lives in prose gets re-derived. ASection is that standard
    // as a component. What still matches this pattern are genuinely different
    // objects: ColHead (a table column), WeekHeader, PickerSection, FieldLabel,
    // AppleHealthSection and LeavePlanSection (whole sections, not their heads).
    const decls = hits(/^\s*(?:export )?function [A-Z][A-Za-z]*(?:Section|Head|SubHead)[A-Za-z]*\s*\(/gm);
    expectAtMost(decls, 8, "section-header component → ASection");
  });
});

describe("meters", () => {
  it("RATCHET — labelled proportions converge on AMeter", () => {
    // The audit counted 13 "bar/meter implementations", and reading them split
    // the number three ways. FIVE were the same labelled horizontal proportion
    // (MeterRow, MeterRows, BarRow ×2, MuscleBar) disagreeing on track height
    // (3 / 7 / 8dp), radius (2 vs 4), where the value sits and whether the label
    // is mono or sans. THREE were vertical COLUMN charts — a different object,
    // with real differences (pace inversion, a muted state, highlight-last).
    // And FIVE were not bars at all: a rail container, a face stroke, a sized
    // rectangle, an animated share-card fill. Those are renamed for what they
    // are (RailSurface, FaceStroke, Rule), because the same misnaming is what
    // hid `Pill` from the chip merge — a wrong name invites a wrong merge as
    // readily as it hides a right one.
    const decls = hits(/^\s*(?:export )?function [A-Z][A-Za-z]*(?:Bar|Bars|Meter)[A-Za-z]*\s*\(/gm);
    expectAtMost(decls, 9, "labelled proportion → AMeter");
  });
});

describe("loading", () => {
  it("RATCHET — spinners are for ACTIONS; arriving content gets a skeleton", () => {
    // The app had no skeleton at all. All 33 `<Loading />` sites were the shape
    // `if (data === null) return <Loading />` — arriving CONTENT — and rendered a
    // centred spinner, so a section collapsed to nothing and then popped in fully
    // formed. On a phone, where a list IS most of the screen, that reads as a
    // jump rather than an arrival.
    //
    // Loading() is now a skeleton, which fixed all 33 without touching them. What
    // this ratchet bounds is the RAW ActivityIndicator: legitimate inside a
    // button while it saves, wrong as a stand-in for a list. Seven content-shaped
    // ones have moved; the rest are in-flight actions.
    expectAtMost(hits(/<ActivityIndicator/g), 19, "content ActivityIndicator → <Loading />");
  });
});

describe("colour", () => {
  it("RATCHET — no new hex literals outside the palette", () => {
    // 36 distinct literals at audit time. The ones that matter are #0e0f0d and
    // #0e100d: ad-hoc surfaces between ink and ink2 that are NOT tokens and so do
    // not flip in Kyoto Hour — in feel-prompt.tsx one sits on the same line as
    // C.ink2, putting two states of one control at opposite ends of the value
    // scale in the light theme.
    // Paid down from 148 → 136 by resolving the #0e0f0d / #0e100d family: the
    // themed-screen uses became palette tokens (they were a real Kyoto Hour
    // break) and the Wrapped takeover's became the named, deliberately
    // fixed-dark HERO_TAKEOVER_INK / HERO_TAKEOVER_RAISED.
    expectAtMost(hits(/["'`]#[0-9a-fA-F]{3,8}["'`]/g), 136, "hex literal → a palette token");
  });
});

describe("presentation", () => {
  it("HARD — no system alerts; the app draws its own decisions", () => {
    // Was 34 Alert.alert calls plus an iOS-only Alert.prompt. They were not
    // incidental sites: delete a session, erase an account, block a person, deny
    // a coach application. All now run through components/aurora/confirm.tsx on
    // the app's own Sheet. HARD, not a ratchet — reintroducing one puts the most
    // consequential moment in the product back in the hands of the OS.
    const src = FILES.filter((f) => !f.path.endsWith("aurora/confirm.tsx"));
    const alerts: string[] = [];
    for (const { path, text } of src) {
      text.split("\n").forEach((line, i) => {
        if (/\bAlert\.(alert|prompt)\(/.test(line)) alerts.push(`${path}:${i + 1}`);
      });
    }
    expect(alerts).toEqual([]);
  });

  it("HARD — every bottom sheet is THE Sheet", () => {
    // Eleven surfaces hand-rolled `<Modal animationType="slide">` with their own
    // scrim, panel, radius, drag-handle glyph and safe-area padding — the
    // exercise picker, session editor, device match and import, quick sport, the
    // share sheet, the social and coach profiles, the RPE guide, the anatomy
    // viewer. Each was a re-draw of Sheet MINUS its drag, detents, velocity
    // release and parent recede, so the gesture a user learns on Today died on
    // the controls they touch most. All eleven now present through Sheet.
    //
    // tour.tsx is the ONE exemption and it is not a bottom sheet: it is a
    // full-screen `animationType="fade"` coach-mark overlay, a different
    // presentation with no panel to drag.
    const raw = hits(/<Modal\b/g).filter(
      (h) => !h.startsWith("components/aurora/sheet.tsx") && !h.startsWith("components/tour.tsx"),
    );
    expect(raw).toEqual([]);
  });
});
