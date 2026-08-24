import { describe, it, expect } from "vitest";
import {
  SYNCED_PREF_KEYS,
  isSyncedPrefKey,
  reconcileSyncedPrefs,
  sanitizeSyncedPrefs,
  SYNCED_PREF_MAX_VALUE_BYTES,
} from "./synced-prefs";

describe("the allowlist", () => {
  it("holds only device-independent settings — the device-bound ones stay out", () => {
    // Each of these breaks something if it follows the account: the session and
    // the device id ARE the device's identity, the language renders the login
    // screen before there is an account, the draft must survive with no signal,
    // push and HealthKit describe this handset's relationship to the OS.
    for (const key of [
      "hybrid.lang",
      "hybrid.deviceId",
      "hybrid.workoutDraft",
      "hybrid.pushAsked",
      "hybrid.healthkit.connected",
      "hybrid.deviceImport.lastRun",
      "hybrid.pendingTour",
    ]) {
      expect(isSyncedPrefKey(key)).toBe(false);
    }
  });

  it("leaves out what already syncs through a table of its own", () => {
    // Saved posts own SavedPost + /api/social/saved/sync; the nutrition
    // onboarding flag mirrors onboardedAt. Either here would be a SECOND
    // server-side answer to one question.
    expect(isSyncedPrefKey("hybrid.feedSaved")).toBe(false);
    expect(isSyncedPrefKey("hybrid.nutrition.onboarded")).toBe(false);
  });

  it("carries the settings an athlete would expect to find on a new phone", () => {
    for (const key of [
      "hybrid.exerciseFavourites",
      "hybrid.sportFavourites",
      "hybrid.loggerPrefs",
      "hybrid.restDays.v1",
      "hybrid.today.range",
      "hybrid.tourSeen",
    ]) {
      expect(isSyncedPrefKey(key)).toBe(true);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(SYNCED_PREF_KEYS).size).toBe(SYNCED_PREF_KEYS.length);
  });
});

describe("sanitizeSyncedPrefs", () => {
  it("drops unknown keys, so a stray write can never bloat the row", () => {
    const out = sanitizeSyncedPrefs({ "hybrid.tourSeen": true, "hybrid.deviceId": "abc", junk: 1 });
    expect(out).toEqual({ "hybrid.tourSeen": true });
  });

  it("keeps null — it is how a client says FORGET THIS, not an absent value", () => {
    expect(sanitizeSyncedPrefs({ "hybrid.tourSeen": null })).toEqual({ "hybrid.tourSeen": null });
  });

  it("refuses a value past the size ceiling", () => {
    const huge = "x".repeat(SYNCED_PREF_MAX_VALUE_BYTES + 10);
    expect(sanitizeSyncedPrefs({ "hybrid.searchMisses": huge })).toEqual({});
  });

  it("survives a corrupt blob rather than throwing", () => {
    expect(sanitizeSyncedPrefs(null)).toEqual({});
    expect(sanitizeSyncedPrefs("nope")).toEqual({});
    expect(sanitizeSyncedPrefs([1, 2])).toEqual({});
  });
});

describe("reconcileSyncedPrefs", () => {
  it("the server wins where it has spoken", () => {
    const { merged } = reconcileSyncedPrefs(
      { "hybrid.today.range": "d7" },
      { "hybrid.today.range": "d30" },
    );
    expect(merged["hybrid.today.range"]).toBe("d30");
  });

  it("LOCAL SURVIVES where the server has not — an upgrade must not erase months of settings", () => {
    const { merged, pending } = reconcileSyncedPrefs(
      { "hybrid.exerciseFavourites": ["Back Squat"], "hybrid.loggerPrefs": { units: "lb" } },
      {},
    );
    expect(merged["hybrid.exerciseFavourites"]).toEqual(["Back Squat"]);
    // …and those keys are handed back so the first sync pushes them UP.
    expect(pending).toEqual({
      "hybrid.exerciseFavourites": ["Back Squat"],
      "hybrid.loggerPrefs": { units: "lb" },
    });
  });

  it("a key the server holds is not queued for upload again", () => {
    const { pending } = reconcileSyncedPrefs(
      { "hybrid.today.range": "d7" },
      { "hybrid.today.range": "d30" },
    );
    expect(pending).toEqual({});
  });

  it("a server null is a tombstone — it neither overwrites nor resurrects", () => {
    const { merged } = reconcileSyncedPrefs(
      { "hybrid.tourSeen": true },
      { "hybrid.tourSeen": null },
    );
    expect(merged["hybrid.tourSeen"]).toBe(true);
  });

  it("junk on either side cannot reach the merged map", () => {
    const { merged } = reconcileSyncedPrefs({ junk: 1 } as never, { alsoJunk: 2 } as never);
    expect(merged).toEqual({});
  });
});
