import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A COMMIT BUTTON MUST NOT RESIZE.
 *
 * Audit §17: "the button never resizes, or the layout shifts under the finger."
 * Every save in the app hand-rolled the same pattern —
 *
 *     label={saving ? t("…adding") : t("…add")}
 *
 * — and "Add meal" and "Adding…" are different widths, so the pill changed size
 * under a finger that was still resting on it. `APill`'s `state` prop fixes it
 * by always laying out the idle label to hold the width and cross-fading the
 * reporting states on top.
 *
 * A one-off migration fixes the six that existed. This keeps it fixed: the next
 * save button written the old way fails here rather than shipping.
 */

const MOBILE = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * A label whose TEXT is chosen by an in-flight flag — the resize.
 *
 * The ternary must be a real one: `?` not followed by `?` or `.`, or the
 * pattern also catches `pending?.confirmLabel ?? "Confirm"`, which is a default
 * for a dialog's own label and not a commit state at all. `pending` is left out
 * of the flag list for the same reason — in this codebase it names the pending
 * DIALOG far more often than an in-flight request.
 *
 * The boundary before `label` matters too: without it the pattern matches
 * inside `busyLabel={…}`, which is the FIX rather than the defect.
 *
 * THE WORD LIST IS THE GUARD, and that is its weak seam: a screen whose
 * in-flight flag is named something else is invisible here. `enrolling` was
 * added after the onboarding pass found the wizard's CTA swapping 'Start this
 * plan' for 'Setting up…' — the exact defect this file exists to stop, on the
 * first screen a new athlete sees, sitting in the tree the whole time the rule
 * was green. Anything new that names an in-flight state belongs in this list
 * the day it is written.
 */
const SWAPPED_LABEL = /(?<![A-Za-z])label=\{[^}]*\b(saving|submitting|busy|loading|posting|sending|deleting|creating|generating|uploading|working|enrolling)\b[^}]*\?(?![?.])/i;

describe("commit buttons report without resizing", () => {
  it("never picks a button's label text from an in-flight flag", () => {
    const bad: string[] = [];
    for (const f of walk(join(MOBILE, "components")).concat(walk(join(MOBILE, "app")))) {
      const s = readFileSync(f, "utf8");
      for (const [i, line] of s.split("\n").entries()) {
        if (SWAPPED_LABEL.test(line)) bad.push(`${f.replace(MOBILE, "")}:${i + 1}`);
      }
    }
    expect(
      bad,
      `these swap a button's label mid-commit, which resizes it.\n` +
        `Use APill's state/savingLabel instead:\n${bad.join("\n")}`,
    ).toEqual([]);
  });
});
