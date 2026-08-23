import { describe, it, expect } from "vitest";
import { sportBoard, sportChoices } from "./sport-board";
import { resolveActivityRange } from "./activity-window";
import { normalizeSportFavourites, toggleSportFavourite, MAX_SPORT_FAVOURITES } from "./sport-favourites";
import type { LoggedSession } from "./engines/session";

const DAY = 86_400_000;
const now = new Date(2026, 5, 17, 12).getTime();

let id = 0;
const effort = (
  daysAgo: number,
  name: string,
  discipline: "running" | "cycling" | "sport",
  distance: number,
  minutes: number,
): LoggedSession => ({
  id: `e${id++}`,
  title: name,
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "cardio", name, discipline, distance, minutes }],
});

/* A runner with two 8-week windows on record, plus Tuesday tennis. */
const SESSIONS: LoggedSession[] = [
  // previous window (56–112 days ago): 20 km at 5:30/km
  effort(90, "Easy Run", "running", 12, 66),
  effort(70, "Easy Run", "running", 8, 44),
  // current window: 30 km at 5:00/km — more volume, faster
  effort(30, "Long Run", "running", 18, 90),
  effort(6, "Easy Run", "running", 12, 60),
  // tennis in the current window only
  effort(9, "Tennis", "sport", 0, 75),
  effort(2, "Tennis", "sport", 0, 90),
];

describe("sportBoard", () => {
  it("cards render pins only, in pin order, each a SportPage plus its previous window", () => {
    const cards = sportBoard(SESSIONS, ["s:Tennis", "d:running"], { now });
    expect(cards.map((c) => c.key)).toEqual(["s:Tennis", "d:running"]);
    const run = cards[1]!;
    expect(run.page!.distanceKm).toBe(30);
    expect(run.prev!.distanceKm).toBe(20);
  });

  it("volume ticker compares distance when both windows measured one — more is improving", () => {
    const [run] = sportBoard(SESSIONS, ["d:running"], { now });
    expect(run!.volumeBy).toBe("distance");
    expect(run!.volumeDeltaPct).toBe(50);
    expect(run!.volumeImproving).toBe(true);
  });

  it("pace ticker: faster average is improving (negative delta)", () => {
    const [run] = sportBoard(SESSIONS, ["d:running"], { now });
    // 300 s/km vs 330 s/km → −9.1%
    expect(run!.paceDeltaPct).toBe(-9.1);
    expect(run!.paceImproving).toBe(true);
  });

  it("a timed sport with no previous window carries no ticker, not a fabricated one", () => {
    const [tennis] = sportBoard(SESSIONS, ["s:Tennis"], { now });
    expect(tennis!.page!.minutes).toBe(165);
    expect(tennis!.prev).toBeNull();
    expect(tennis!.volumeDeltaPct).toBeNull();
    expect(tennis!.paceDeltaPct).toBeNull();
  });

  it("a pinned sport quiet this window keeps its row, with its identity resolved", () => {
    const old = [effort(100, "Zone 2", "cycling", 40, 80)];
    const [ride] = sportBoard(old, ["d:cycling"], { now });
    expect(ride!.page).toBeNull();
    expect(ride!.prev!.distanceKm).toBe(40);
    expect(ride!.labelKey).toBe("endurance.cycling");
    expect(ride!.volumeDeltaPct).toBeNull();
  });

  it("pins match case-insensitively and the card keeps the pager's canonical key", () => {
    const [tennis] = sportBoard(SESSIONS, ["s:tennis"], { now });
    expect(tennis!.key).toBe("s:Tennis");
    expect(tennis!.sport).toBe("Tennis");
  });
});

/* THE SCREEN'S PERIOD, NOT THE BOARD'S — the board must answer for whatever
   window the Progress cluster's one control is showing, against the window
   before it, so no figure on that screen answers for a period of its own. */
describe("sportBoard with a range", () => {
  it("reports the CONTROL's window, and it is not the one the board used to invent", () => {
    const range = resolveActivityRange("d30", now);
    const [run] = sportBoard(SESSIONS, ["d:running"], { now, range });
    // "Last 30 days" is today plus the 29 before, so it holds the 6-day run
    // alone — 12 km. The hard-coded 8-week window this replaced said 30 km,
    // under a control reading 30D. That gap IS the bug: two figures, one
    // screen, neither answering the period the reader chose.
    expect(run!.page!.distanceKm).toBe(12);
    expect(sportBoard(SESSIONS, ["d:running"], { now })[0]!.page!.distanceKm).toBe(30);
  });

  it("measures against the window BEFORE the chosen one, the verdict card's own axis", () => {
    const range = resolveActivityRange("d30", now);
    const [run] = sportBoard(SESSIONS, ["d:running"], { now, range });
    // The preceding 30 days hold the 18 km long run: 12 against 18 is −33.3%.
    expect(run!.prev!.distanceKm).toBe(18);
    expect(run!.volumeDeltaPct).toBe(-33.3);
    expect(run!.volumeImproving).toBe(false);
  });

  it("widens with the control: year-to-date holds every effort", () => {
    const range = resolveActivityRange("ytd", now);
    const [run] = sportBoard(SESSIONS, ["d:running"], { now, range });
    expect(run!.page!.distanceKm).toBe(50);
  });

  it("without a range it keeps the trailing eight weeks (the model off a filtered screen)", () => {
    const [run] = sportBoard(SESSIONS, ["d:running"], { now });
    expect(run!.page!.distanceKm).toBe(30);
    expect(run!.prev!.distanceKm).toBe(20);
  });
});

describe("sportChoices", () => {
  it("offers every sport in the fetched history, beyond the 8-week window", () => {
    const old = [effort(200, "Zone 2", "cycling", 40, 80), ...SESSIONS];
    const keys = sportChoices(old, now).map((p) => p.key);
    expect(keys).toContain("d:cycling");
    expect(keys).toContain("d:running");
    expect(keys).toContain("s:Tennis");
  });
});

describe("sport favourites", () => {
  it("normalize drops malformed ids, de-dupes case-insensitively and caps", () => {
    expect(normalizeSportFavourites(["d:running", "s:Tennis", "s:tennis", "junk", 7, "  "])).toEqual([
      "d:running",
      "s:Tennis",
    ]);
    const many = Array.from({ length: 10 }, (_, i) => `s:Sport${i}`);
    expect(normalizeSportFavourites(many)).toHaveLength(MAX_SPORT_FAVOURITES);
  });

  it("toggle appends, unpins, and refuses past the cap without dropping a choice", () => {
    let list = toggleSportFavourite([], "d:running");
    expect(list).toEqual(["d:running"]);
    list = toggleSportFavourite(list, "d:running");
    expect(list).toEqual([]);
    const full = Array.from({ length: MAX_SPORT_FAVOURITES }, (_, i) => `s:Sport${i}`);
    expect(toggleSportFavourite(full, "d:running")).toEqual(full);
  });
});
