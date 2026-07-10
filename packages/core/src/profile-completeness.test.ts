import { describe, it, expect } from "vitest";
import { profileCompleteness } from "./profile-completeness";

describe("profileCompleteness", () => {
  it("is 0% for an empty profile and lists everything missing", () => {
    const r = profileCompleteness({});
    expect(r.percent).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(["name", "handle", "displayName", "bio", "photo"]);
  });

  it("is 100% + complete when every field is set", () => {
    const r = profileCompleteness({ name: "Rafal", handle: "rafal", displayName: "Rafal A", bio: "lifter", avatarUrl: "data:image/png;base64,x" });
    expect(r.percent).toBe(100);
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("rounds partial completion and reports the gaps in order", () => {
    const r = profileCompleteness({ name: "Rafal", handle: "rafal", bio: "lifter" });
    expect(r.done).toBe(3);
    expect(r.percent).toBe(60);
    expect(r.missing).toEqual(["displayName", "photo"]);
  });

  it("treats whitespace-only values as missing", () => {
    expect(profileCompleteness({ name: "   ", handle: "" }).percent).toBe(0);
  });
});
