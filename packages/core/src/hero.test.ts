import { describe, it, expect } from "vitest";
import {
  HERO,
  HERO_CHOREOGRAPHY,
  HERO_INLINE_TITLE,
  heroBackdrop,
  heroCollapse,
  heroEyebrowTone,
  heroGeometry,
  heroLayers,
  heroLight,
  heroMetaLine,
  heroNavAction,
  heroNavMaterial,
  heroSnapTarget,
  heroStatusBar,
  heroTitleType,
  heroTransition,
} from "./hero";
import { fs } from "./scale";

const SAFE = 59; // a notched iPhone's top inset

describe("hero geometry", () => {
  it("puts the rail at the identical y in every rank — the system's whole point", () => {
    const y = (r: Parameters<typeof heroGeometry>[0]) => heroGeometry(r, SAFE).railTop;
    expect(y("bar")).toBe(y("title"));
    expect(y("title")).toBe(y("cover"));
    expect(y("cover")).toBe(SAFE + HERO.rail.top);
  });

  it("collapses to the SAME bar height from every rank", () => {
    for (const rank of ["bar", "title", "cover"] as const) {
      expect(heroGeometry(rank, SAFE).barHeight).toBe(SAFE + HERO.height.bar);
    }
  });

  it("gives `bar` no collapse track — a bar is a hero already collapsed", () => {
    expect(heroGeometry("bar", SAFE).delta).toBe(0);
    expect(heroGeometry("title", SAFE).delta).toBe(HERO.height.title - HERO.height.bar);
    expect(heroGeometry("cover", SAFE).delta).toBe(HERO.height.cover - HERO.height.bar);
  });

  it("gives a takeover no collapse track, whatever its rank", () => {
    expect(heroGeometry("cover", SAFE, "takeover").delta).toBe(0);
  });
});

describe("the collapse track", () => {
  const geom = heroGeometry("cover", SAFE);

  it("runs 0→1 across the track and clamps outside it", () => {
    expect(heroCollapse(-40, geom)).toBe(0);
    expect(heroCollapse(0, geom)).toBe(0);
    expect(heroCollapse(geom.delta / 2, geom)).toBeCloseTo(0.5);
    expect(heroCollapse(geom.delta * 3, geom)).toBe(1);
  });

  it("is a no-op on a rank with no track", () => {
    expect(heroCollapse(400, heroGeometry("bar", SAFE))).toBe(0);
  });

  it("settles to the nearer pole, and leaves a settled hero alone", () => {
    expect(heroSnapTarget(0, geom)).toBeNull();
    expect(heroSnapTarget(geom.delta, geom)).toBeNull();
    expect(heroSnapTarget(geom.delta * 0.2, geom)).toBe(0);
    expect(heroSnapTarget(geom.delta * 0.8, geom)).toBe(geom.delta);
  });
});

describe("hero layers", () => {
  const geom = heroGeometry("cover", SAFE);

  it("keeps the rail pinned on screen — it counter-translates the frame exactly", () => {
    for (const p of [0, 0.3, 0.7, 1]) {
      const l = heroLayers(p, geom);
      expect(l.frame.translateY + l.rail.translateY).toBeCloseTo(0);
    }
  });

  it("never shows the display title and the inline title at once", () => {
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const l = heroLayers(p, geom);
      expect(Math.min(l.display.opacity, l.inline.opacity)).toBe(0);
    }
  });

  it("retires full-colour art before the bar arrives; a ghost survives as texture", () => {
    expect(heroLayers(1, geom, { colourArt: true }).art.opacity).toBe(0);
    expect(heroLayers(HERO.colourArtOut, geom, { colourArt: true }).art.opacity).toBeCloseTo(0);
    expect(heroLayers(1, geom).art.opacity).toBeCloseTo(HERO.artFloor.ghost);
  });

  it("drifts an emblem further than a poster glyph, so both read at one speed", () => {
    const poster = heroLayers(1, geom).art.translateY;
    const emblem = heroLayers(1, geom, { emblem: true }).art.translateY;
    expect(emblem).toBeGreaterThan(poster);
    expect(emblem).toBeCloseTo(geom.delta * HERO.parallax.emblem);
  });

  it("reaches the poles cleanly", () => {
    const open = heroLayers(0, geom);
    expect(open.display.opacity).toBe(1);
    expect(open.inline.opacity).toBe(0);
    expect(open.hairline.opacity).toBe(0);
    expect(open.barred).toBe(false);
    const shut = heroLayers(1, geom);
    expect(shut.display.opacity).toBe(0);
    expect(shut.inline.opacity).toBe(1);
    expect(shut.hairline.opacity).toBe(1);
    expect(shut.barred).toBe(true);
  });
});

describe("hero titles", () => {
  it("uses the shared ladder's rungs, never an invented size", () => {
    expect(heroTitleType("Swimming", "cover").size).toBe(fs.hero);
    expect(heroTitleType("History", "title").size).toBe(fs.display);
    expect(heroTitleType("Anything", "bar")).toEqual(HERO_INLINE_TITLE);
  });

  it("keeps a long title at full size until it would need a third line", () => {
    expect(heroTitleType("Olympic Weightlifting", "cover").size).toBe(fs.hero); // 21 chars
    expect(heroTitleType("Olympic Weightlifting Technique Primer", "cover").size).toBeLessThan(fs.hero);
  });

  it("never runs to three lines", () => {
    for (const rank of ["title", "cover"] as const) {
      expect(heroTitleType("A very long screen title that keeps going and going", rank).maxLines).toBe(2);
    }
  });

  it("honours Dynamic Type without changing the layout decision", () => {
    const big = heroTitleType("Swimming", "cover", 1.5);
    expect(big.size).toBe(Math.round(fs.hero * 1.5));
    // the step-down decision is made on the string, not on the scaled size
    expect(heroTitleType("Olympic Weightlifting", "cover", 2).size).toBe(fs.hero * 2);
  });
});

describe("hero metadata", () => {
  it("joins with a spaced en dash, never a middot", () => {
    const line = heroMetaLine(["8 WEEKS", null, "4 DAYS", "", false]);
    expect(line).toBe("8 WEEKS – 4 DAYS");
    expect(line).not.toContain("·");
  });

  it("gives the eyebrow a substrate only where it needs one", () => {
    expect(heroEyebrowTone("cover", "art")).toBe("solid");
    expect(heroEyebrowTone("cover", "wash")).toBe("tint");
    expect(heroEyebrowTone("title", "field")).toBe("tint");
  });
});

describe("hero backdrops", () => {
  it("allows exactly one ground per rank", () => {
    expect(heroBackdrop("title", "page", true)).toBe("field"); // art is unreachable here
    expect(heroBackdrop("bar", "page", true)).toBe("field");
    expect(heroBackdrop("cover", "page", false)).toBe("wash");
    expect(heroBackdrop("cover", "page", true)).toBe("art");
    expect(heroBackdrop("title", "takeover", false)).toBe("story");
  });

  it("lights a container from the left and its contents from the right", () => {
    expect(heroLight("container")).toBe("left");
    expect(heroLight("item")).toBe("right");
  });

  it("keeps a fixed-dark hero's status bar light in both themes", () => {
    expect(heroStatusBar("cover", "page", "light")).toBe("light");
    expect(heroStatusBar("title", "page", "light")).toBe("dark");
    expect(heroStatusBar("title", "takeover", "light")).toBe("light");
  });
});

describe("the navigation button", () => {
  it("keeps a 44pt hit target around a 40pt circle", () => {
    expect(HERO.nav.hit).toBeGreaterThanOrEqual(44);
    expect(HERO.nav.size).toBeLessThan(HERO.nav.hit);
    expect(HERO.radius.nav).toBe(999);
  });

  it("changes material with what is behind it, not with which screen it is on", () => {
    expect(heroNavMaterial("field", false)).toBe("clear");
    expect(heroNavMaterial("field", true)).toBe("glass");
    expect(heroNavMaterial("art", false)).toBe("glass");
    expect(heroNavMaterial("story", false)).toBe("glass");
  });

  it("pops on a page and dismisses on a takeover", () => {
    expect(heroNavAction("page")).toEqual({ role: "pop", glyph: "back" });
    expect(heroNavAction("takeover")).toEqual({ role: "dismiss", glyph: "chevron-down" });
  });
});

describe("hero transitions", () => {
  it("has exactly three, and every move resolves to one", () => {
    expect(Object.keys(HERO_CHOREOGRAPHY).sort()).toEqual(["deepen", "lift", "raise"]);
    expect(heroTransition({ rank: "title" }, { rank: "cover" })).toBe("lift"); // History → Workout
    expect(heroTransition({ rank: "cover" }, { rank: "cover" })).toBe("deepen"); // Workout → Exercise
    expect(heroTransition({ rank: "cover" }, { rank: "title" })).toBe("deepen"); // Exercise → Analytics
    expect(heroTransition({ rank: "cover" }, { rank: "cover", mode: "takeover" })).toBe("raise");
    expect(heroTransition({ rank: "cover", mode: "takeover" }, { rank: "cover" })).toBe("raise");
  });

  it("holds the rail fixed in every one of them", () => {
    for (const t of Object.values(HERO_CHOREOGRAPHY)) expect(t.fixed).toContain("rail");
  });

  it("never both fixes and morphs the same layer", () => {
    for (const t of Object.values(HERO_CHOREOGRAPHY)) {
      for (const f of t.fixed) expect(t.morph).not.toContain(f);
    }
  });
});
