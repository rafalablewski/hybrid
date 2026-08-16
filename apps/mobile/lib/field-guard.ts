import { allowsTyping, type Bounds } from "@hybrid/core";
import { toast } from "../components/aurora/toast";

/**
 * THE REFUSAL HALF of the plausibility model, at the keystroke.
 *
 * A field cannot hold an impossible number: the digit that would take it past
 * its ceiling simply does not appear, the way a `maxLength` refuses one. The
 * server refuses these too — that is the guard that counts, since a client is
 * only ever advice — but being told after the workout is saved is far too late
 * to fix a set nobody can remember.
 *
 * AND IT SAYS WHY. A field that silently stops accepting input reads as broken,
 * so the refusal names its own bound. One helper rather than one per screen,
 * because the three loggers were about to hold three copies of the same toast
 * string and the drift would have been invisible: a bound tightened in core
 * would keep announcing the old number from whichever screen was forgotten.
 *
 * Announce that a value is not storable, naming the bound.
 *
 * UNITS ARE THE CALLER'S JOB, and the signature makes that explicit: pass the
 * value and the bound IN THE SAME UNIT, plus what to call it. A load field
 * showing pounds must be told "max 3 306 lb", not the kilogram figure the
 * bound is written in, and a pool's distance field is in metres where the
 * bound is in kilometres. Getting this wrong produces a message that is
 * technically true and useless.
 */
export function refuseFieldValue(
  t: (key: string) => string,
  bounds: Bounds,
  opts?: { max?: number; unit?: string },
): void {
  toast(
    t("w.train.blocks.maxValue")
      .replace("{n}", String(opts?.max ?? bounds.max))
      .replace("{unit}", opts?.unit ?? bounds.unit),
    "error",
  );
}

/**
 * `refuseFieldValue`, decided for you: true when the keystroke may land, false
 * when it may not — and the message has already been shown in that case.
 */
export function allowFieldValue(
  t: (key: string) => string,
  next: string,
  bounds: Bounds | null,
  /** Override the ceiling and its name when the field is shown in another unit. */
  opts?: { max?: number; unit?: string },
): boolean {
  if (!bounds) return true;
  const max = opts?.max ?? bounds.max;
  if (allowsTyping(next, { ...bounds, max })) return true;
  refuseFieldValue(t, bounds, opts);
  return false;
}
