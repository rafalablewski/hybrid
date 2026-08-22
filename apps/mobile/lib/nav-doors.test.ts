import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@hybrid/core";
import { NAV_HREF } from "./nav-href";

/**
 * EVERY PROMOTED SCREEN NEEDS A DOOR.
 *
 * `NavItem.promotedTo` is a good idea with a failure mode. It takes a screen
 * OUT of the menus while leaving its route, icon, label and persona gate live,
 * on the argument — written out beside the field, and correct — that "a menu
 * that names ten destinations has told the athlete there are ten places to go".
 * The screen is meant to be reached instead from one named door on the surface
 * it was promoted onto, carrying a live figure that says what is behind it.
 *
 * The failure mode is that nothing checked the second half ever happened.
 * Promoting a screen is one line in nav.ts; adding its door is a change in
 * another file, on another screen, that no test and no type asked for. Get the
 * first without the second and the screen does not become quieter — it becomes
 * UNREACHABLE, while continuing to build, typecheck, ship, and appear in the
 * command menu's route map as though it were a place.
 *
 * That is exactly what happened to Statistics. It was folded into History's
 * trend view in Jul 2026 and promoted the same day; its old implementation sat
 * on /statistics for a year afterwards drawing the same charts off the same
 * engines, with no door on any screen pointing at it. Two surfaces answering
 * one question — the drift the fold was carried out to end — surviving inside
 * the fix for it.
 *
 * So: a promoted screen either has a door, or it is a redirect that says where
 * it went. Nothing in between.
 */

const SRC = join(__dirname, "..");
const SKIP = new Set(["node_modules", ".expo", "dist", "ios", "android", "__snapshots__"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((path) => ({ path, body: readFileSync(path, "utf8") }));

/** The screens `promotedTo` something else — the ones with no menu entry. */
const PROMOTED = NAV_ITEMS.filter((i) => i.promotedTo);

/** A screen id's route, as a plain path. NAV_HREF also carries expo-router
 *  `HrefObject`s for the routes that take params; those are not what this test
 *  greps for, so they read as unmapped and would be caught by the first test if
 *  a promoted screen ever needed one. */
const routeOf = (id: string): string | undefined => {
  const href = NAV_HREF[id as keyof typeof NAV_HREF] as unknown;
  return typeof href === "string" ? href : undefined;
};

/** The route file that renders a screen id, if the app has one. */
const routeFileFor = (route: string) =>
  FILES.find((f) => f.path.endsWith(join("app", `${route.replace(/^\//, "")}.tsx`)));

/** Everything that references `route` other than the route file itself and the
 *  nav-href map, which is a lookup rather than a way in. */
function doorsTo(route: string): string[] {
  const needle = `"${route}"`;
  return FILES.filter(
    (f) =>
      f.body.includes(needle) &&
      !f.path.endsWith("nav-href.ts") &&
      f.path !== routeFileFor(route)?.path,
  ).map((f) => f.path.replace(`${SRC}/`, ""));
}

describe("promoted screens are reachable", () => {
  it("has promoted screens to check at all", () => {
    // Non-vacuity: every assertion below passes trivially on an empty list.
    expect(PROMOTED.length).toBeGreaterThan(0);
  });

  it("maps every promoted screen to a route", () => {
    const unmapped = PROMOTED.filter((i) => !routeOf(i.id)).map((i) => i.id);
    expect(unmapped, "a promoted screen with no route is not a destination").toEqual([]);
  });

  it.each(PROMOTED.map((i) => [i.id, i.promotedTo] as const))(
    "%s (promoted onto %s) has a door, or redirects",
    (id) => {
      const route = routeOf(id)!;
      const doors = doorsTo(route);
      if (doors.length > 0) return;

      // No door is only acceptable when the screen no longer HAS content —
      // a route kept alive so an old deep link lands somewhere true.
      const file = routeFileFor(route);
      expect(file, `no door points at ${route} and there is no route file either`).toBeTruthy();
      expect(
        file!.body.includes("<Redirect"),
        `${route} has no door on any screen and does not redirect — it is unreachable`,
      ).toBe(true);
    },
  );
});
