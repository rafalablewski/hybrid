import { describe, it, expect } from "vitest";
import { STORY_STYLES, DEFAULT_STORY_STYLE, storyStyle } from "./story-styles";

describe("story styles", () => {
  it("offers both wrapped looks", () => {
    const ids = STORY_STYLES.map((s) => s.id);
    expect(ids).toContain("aurora");
    expect(ids).toContain("liquid-glass");
  });

  it("defaults to Liquid Glass — the signature finished-workout 'wrapped' look on both clients", () => {
    expect(DEFAULT_STORY_STYLE).toBe("liquid-glass");
  });

  it("resolves a known style by id", () => {
    expect(storyStyle("aurora").id).toBe("aurora");
    expect(storyStyle("liquid-glass").id).toBe("liquid-glass");
  });

  it("falls back to the default style for missing/unknown ids (never null)", () => {
    expect(storyStyle(undefined).id).toBe(DEFAULT_STORY_STYLE);
    expect(storyStyle(null).id).toBe(DEFAULT_STORY_STYLE);
    expect(storyStyle("nope").id).toBe(DEFAULT_STORY_STYLE);
  });
});
