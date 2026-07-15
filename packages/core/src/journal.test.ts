import { describe, it, expect } from "vitest";
import {
  sanitizeMood,
  sanitizeTags,
  moodDef,
  tagLabelKey,
  journalDayGroups,
  relativeDayKey,
  MAX_TAGS,
  type JournalEntry,
} from "./journal";

describe("sanitizeMood", () => {
  it("accepts 1..4 and rejects everything else", () => {
    expect(sanitizeMood(1)).toBe(1);
    expect(sanitizeMood(4)).toBe(4);
    expect(sanitizeMood(0)).toBeNull();
    expect(sanitizeMood(5)).toBeNull();
    expect(sanitizeMood(2.5)).toBeNull();
    expect(sanitizeMood("3")).toBeNull();
    expect(sanitizeMood(null)).toBeNull();
  });
});

describe("sanitizeTags", () => {
  it("lower-cases, strips '#', keeps slug chars, de-dupes", () => {
    expect(sanitizeTags(["#Sleep", "sleep", "Ni gg le!", "recovery"])).toEqual(["sleep", "niggle", "recovery"]);
  });
  it("caps the count and ignores non-arrays / non-strings", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(sanitizeTags(many)).toHaveLength(MAX_TAGS);
    expect(sanitizeTags("sleep")).toEqual([]);
    expect(sanitizeTags([1, 2, {}])).toEqual([]);
  });
});

describe("moodDef / tagLabelKey", () => {
  it("resolves a mood value to its emoji + tone, null otherwise", () => {
    expect(moodDef(1)?.tone).toBe("red");
    expect(moodDef(4)?.emoji).toBe("💪");
    expect(moodDef(null)).toBeNull();
    expect(moodDef(9)).toBeNull();
  });
  it("maps a known tag to an i18n key and a custom one to null", () => {
    expect(tagLabelKey("sleep")).toBe("w.account.profile.priv-j-tag-sleep");
    expect(tagLabelKey("whatever")).toBeNull();
  });
});

describe("journalDayGroups", () => {
  const e = (id: string, iso: string): JournalEntry => ({ id, body: id, createdAt: iso });
  it("buckets a newest-first list by local day, order preserved", () => {
    const groups = journalDayGroups([
      e("a", "2026-07-14T20:00:00"),
      e("b", "2026-07-14T06:00:00"),
      e("c", "2026-07-11T09:00:00"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.entries.map((x) => x.id)).toEqual(["a", "b"]);
    expect(groups[1]!.entries.map((x) => x.id)).toEqual(["c"]);
  });
});

describe("relativeDayKey", () => {
  const now = new Date("2026-07-14T12:00:00").getTime();
  it("labels today, yesterday, and older as null", () => {
    expect(relativeDayKey(new Date("2026-07-14T01:00:00").getTime(), now)).toBe("today");
    expect(relativeDayKey(new Date("2026-07-13T23:00:00").getTime(), now)).toBe("yesterday");
    expect(relativeDayKey(new Date("2026-07-11T10:00:00").getTime(), now)).toBeNull();
  });
});
